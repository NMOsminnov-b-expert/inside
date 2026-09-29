using System.Windows;
using Razmetka.Model;

namespace Razmetka.Editor;

// Проверка разметки: что поправить до экспорта. Ошибка — связь в экспорте
// выйдет неверной; предупреждение — стоит посмотреть глазами.
public sealed record Issue(bool Error, string Text, Chapter Chapter, Sheet Sheet, Link? Link, Layer? Layer);

public static class Checks
{
    public static List<Issue> Run(Project p)
    {
        var o = new List<Issue>();
        foreach (var ch in p.Chapters)
            foreach (var s in ch.Sheets)
                Sheet(o, ch, s);
        return o;
    }

    static void Sheet(List<Issue> o, Chapter ch, Sheet s)
    {
        var links = SheetGeo.Ordered(s);
        foreach (var k in links)
        {
            var src = SheetGeo.FrameRect(s, k.Src);
            var tgt = SheetGeo.FrameRect(s, k.Tgt);
            if (src == null || tgt == null)
            {
                o.Add(new(true, $"Связь {k.N}: рамка на скрытом или удалённом слое — стрелки не видно", ch, s, k, null));
                continue;
            }
            foreach (var (id, r, what) in new[] { (k.Src, src.Value, "на документе"), (k.Tgt, tgt.Value, "на снимке") })
            {
                var f = s.Frames.First(x => x.Id == id);
                var l = SheetGeo.LayerOf(s, f)!;
                // В пикселях исходника — с наклонами рамки и слоя.
                var crop = new Rect(l.Crop.X - 1, l.Crop.Y - 1, l.Crop.W + 2, l.Crop.H + 2);
                if (!SheetGeo.BoxQuad(f.Box, f.Angle).All(crop.Contains))
                    o.Add(new(true, $"Связь {k.N}: рамка {what} выходит за видимую часть «{l.Name}» — часть рамки обрезана", ch, s, k, l));
            }
            if (string.IsNullOrWhiteSpace(k.DocField) || string.IsNullOrWhiteSpace(k.SystemField))
                o.Add(new(true, $"Связь {k.N}: не заполнена {(string.IsNullOrWhiteSpace(k.DocField) ? "графа документа" : "поле системы")}", ch, s, k, null));
            if (!SheetGeo.PathFits(s, k))
                o.Add(new(false, $"Связь {k.N}: стрелка оторвалась от рамки — переложится при следующей правке или кнопкой «Переложить»", ch, s, k, null));
        }

        // Одно поле системы — две связи на одном развороте: дубль или разные
        // графы в одно поле.
        foreach (var g in links.Where(k => k.SystemField.Length > 0).GroupBy(k => k.SystemField.Trim().ToLowerInvariant()).Where(g => g.Count() > 1))
            o.Add(new(false, $"Связи {string.Join(", ", g.Select(k => k.N))} ведут в одно поле системы — проверьте, не дубль ли", ch, s, g.First(), null));

        // Стрелки: наложение (общий отрезок) — ошибка, пересечение — к сведению.
        var paths = links.Select(k => (k, SheetGeo.Path(s, k))).Where(x => x.Item2 != null).ToList();
        for (var i = 0; i < paths.Count; i++)
            for (var j = i + 1; j < paths.Count; j++)
            {
                var (overlap, cross) = Compare(paths[i].Item2!, paths[j].Item2!);
                if (overlap)
                    o.Add(new(true, $"Стрелки {paths[i].k.N} и {paths[j].k.N} идут по одной линии — не различить", ch, s, paths[i].k, null));
                else if (cross > 1)
                    o.Add(new(false, $"Стрелки {paths[i].k.N} и {paths[j].k.N} пересекаются {cross} раза", ch, s, paths[i].k, null));
            }

        // Картинки накладываются друг на друга.
        var imgs = s.Layers.Where(l => !l.Hidden && l.Kind == LayerKind.Image).ToList();
        for (var i = 0; i < imgs.Count; i++)
            for (var j = i + 1; j < imgs.Count; j++)
            {
                var a = new Rect(imgs[i].X, imgs[i].Y, imgs[i].W, imgs[i].H);
                var b = new Rect(imgs[j].X, imgs[j].Y, imgs[j].W, imgs[j].H);
                a.Intersect(b);
                if (!a.IsEmpty && a.Width > 4 && a.Height > 4)
                    o.Add(new(false, $"«{imgs[i].Name}» и «{imgs[j].Name}» накладываются друг на друга", ch, s, null, imgs[j]));
            }

        // Каждая связь — строкой хотя бы в одной таблице.
        var tables = s.Layers.Where(l => l.Kind == LayerKind.Table && !l.Hidden).ToList();
        if (links.Count > 0 && tables.Count == 0)
            o.Add(new(true, "У разворота нет таблицы связей", ch, s, null, null));
        else
            for (var i = 0; i < links.Count; i++)
                if (!tables.Any(t => i >= t.TableFrom && i < (t.TableTo <= 0 ? links.Count : t.TableTo)))
                    o.Add(new(true, $"Связи {links[i].N} нет ни в одной таблице разворота", ch, s, links[i], null));
    }

    // Сравнение двух ломаных из прямых углов: есть ли общий отрезок и
    // сколько раз пересекаются.
    static (bool Overlap, int Cross) Compare(List<Point> a, List<Point> b)
    {
        var cross = 0;
        for (var i = 0; i + 1 < a.Count; i++)
            for (var j = 0; j + 1 < b.Count; j++)
            {
                Point a1 = a[i], a2 = a[i + 1], b1 = b[j], b2 = b[j + 1];
                var ah = Math.Abs(a1.Y - a2.Y) < 0.5;
                var bh = Math.Abs(b1.Y - b2.Y) < 0.5;
                if (ah == bh)
                {
                    // Параллельные: наложение, если на одной линии и общая часть длиннее 12.
                    if (ah && Math.Abs(a1.Y - b1.Y) < 3 && Overlap(a1.X, a2.X, b1.X, b2.X) > 12) return (true, cross);
                    if (!ah && Math.Abs(a1.X - b1.X) < 3 && Overlap(a1.Y, a2.Y, b1.Y, b2.Y) > 12) return (true, cross);
                    continue;
                }
                var (h1, h2, v1, v2) = ah ? (a1, a2, b1, b2) : (b1, b2, a1, a2);
                if (Between(v1.X, h1.X, h2.X) && Between(h1.Y, v1.Y, v2.Y)) cross++;
            }
        return (false, cross);
    }

    static double Overlap(double a1, double a2, double b1, double b2) =>
        Math.Min(Math.Max(a1, a2), Math.Max(b1, b2)) - Math.Max(Math.Min(a1, a2), Math.Min(b1, b2));

    static bool Between(double v, double a, double b) => v > Math.Min(a, b) + 0.5 && v < Math.Max(a, b) - 0.5;
}
