using Razmetka.Model;

namespace Razmetka.Editor;

// Действия над слоями разворота — без интерфейса: их вызывают кнопки,
// горячие клавиши и сценарии проверки.
public static class LayerOps
{
    // Новый слой-картинка: во всю картинку, шириной не больше 1100 единиц
    // полотна, справа от занятого места.
    public static Layer AddImage(Sheet s, ProjectStore store, string asset, string name)
    {
        var info = store.Project.Assets[asset];
        var w = Math.Min(info.W, 1100);
        var right = s.Layers.Where(l => !l.Hidden).Select(l => l.X + l.W).DefaultIfEmpty(0).Max();
        var l = new Layer
        {
            Name = UniqueName(s, string.IsNullOrWhiteSpace(name) ? "Фото" : StripImageExt(name)),
            Asset = asset,
            Crop = new Box(0, 0, info.W, info.H),
            X = s.Layers.Count == 0 ? 0 : right + 120,
            Y = 0,
            W = w,
        };
        s.Layers.Add(l);
        return l;
    }

    // Замена картинки слоя: обрезка и место сохраняются в долях исходника,
    // чтобы новая картинка того же документа встала туда же. Точная подгонка
    // по точкам — отдельным шагом (Align).
    public static void Replace(Layer l, ProjectStore store, string asset)
    {
        var old = l.Asset != null && store.Project.Assets.TryGetValue(l.Asset, out var o) ? o : null;
        var info = store.Project.Assets[asset];
        if (old != null && old.W > 0 && old.H > 0)
        {
            double kx = (double)info.W / old.W, ky = (double)info.H / old.H;
            l.Crop = new Box(l.Crop.X * kx, l.Crop.Y * ky, l.Crop.W * kx, l.Crop.H * ky);
        }
        else l.Crop = new Box(0, 0, info.W, info.H);
        l.Asset = asset;
    }

    // Копия слоя со сдвигом — для однотипных кусков одной картинки.
    public static Layer Duplicate(Sheet s, Layer l)
    {
        var c = new Layer
        {
            Kind = l.Kind, Name = UniqueName(s, l.Name), Caption = l.Caption, Asset = l.Asset, Crop = l.Crop,
            X = l.X + 30, Y = l.Y + 30, W = l.W, TableFrom = l.TableFrom, TableTo = l.TableTo,
        };
        s.Layers.Insert(s.Layers.IndexOf(l) + 1, c);
        return c;
    }

    // Удаление слоя уносит и его рамки, и связи с этими рамками.
    public static void Delete(Sheet s, IEnumerable<string> ids)
    {
        var set = ids.ToHashSet();
        var frames = s.Frames.Where(f => set.Contains(f.LayerId)).Select(f => f.Id).ToHashSet();
        s.Links.RemoveAll(k => frames.Contains(k.Src) || frames.Contains(k.Tgt));
        s.Frames.RemoveAll(f => frames.Contains(f.Id));
        s.Layers.RemoveAll(l => set.Contains(l.Id));
    }

    // Порядок наложения: +1 — выше на один, -1 — ниже, int.MaxValue — наверх,
    // int.MinValue — вниз.
    public static void Reorder(Sheet s, IEnumerable<string> ids, int step)
    {
        var sel = s.Layers.Where(l => ids.Contains(l.Id)).ToList();
        if (sel.Count == 0) return;
        if (step == int.MaxValue) { foreach (var l in sel) { s.Layers.Remove(l); s.Layers.Add(l); } return; }
        if (step == int.MinValue) { for (var i = sel.Count - 1; i >= 0; i--) { s.Layers.Remove(sel[i]); s.Layers.Insert(0, sel[i]); } return; }
        var order = step > 0 ? sel.AsEnumerable().Reverse() : sel;
        foreach (var l in order)
        {
            var i = s.Layers.IndexOf(l);
            var j = Math.Clamp(i + step, 0, s.Layers.Count - 1);
            if (i == j) continue;
            s.Layers.RemoveAt(i);
            s.Layers.Insert(j, l);
        }
    }

    public static void Nudge(Sheet s, IEnumerable<string> ids, double dx, double dy)
    {
        foreach (var l in s.Layers.Where(l => ids.Contains(l.Id) && !l.Locked)) { l.X += dx; l.Y += dy; }
    }

    public static void ResetCrop(Layer l, ProjectStore store)
    {
        if (l.Asset == null || !store.Project.Assets.TryGetValue(l.Asset, out var info)) return;
        var s = l.Scale;
        l.X -= l.Crop.X * s;
        l.Y -= l.Crop.Y * s;
        l.Crop = new Box(0, 0, info.W, info.H);
        l.W = info.W * s;
    }

    // Таблица связей делится на две по строке at (номер строки в порядке
    // связей разворота): вторая часть встаёт справа от первой — дальше её
    // переносят к своим рамкам. Номера строк не меняются.
    public static Layer? SplitTable(Sheet s, Layer t, int at)
    {
        var count = s.Links.Count;
        var to = t.TableTo <= 0 ? count : t.TableTo;
        if (at <= t.TableFrom || at >= to) return null;
        var part = new Layer
        {
            Kind = LayerKind.Table, Name = UniqueName(s, "Таблица связей"), X = t.X + t.W + 60, Y = t.Y,
            W = Math.Max(600, t.W / 2), Crop = new Box(0, 0, Math.Max(600, t.W / 2), 100), TableFrom = at, TableTo = to,
        };
        t.TableTo = at;
        s.Layers.Insert(s.Layers.IndexOf(t) + 1, part);
        return part;
    }

    // Слить таблицу со следующей по строкам частью: диапазоны стыкуются.
    public static bool MergeTable(Sheet s, Layer t)
    {
        var to = t.TableTo <= 0 ? s.Links.Count : t.TableTo;
        var next = s.Layers.FirstOrDefault(l => l.Kind == LayerKind.Table && l != t && l.TableFrom == to);
        if (next == null) return false;
        t.TableTo = next.TableTo;
        s.Layers.Remove(next);
        return true;
    }

    // Готовые раскладки разворота: таблица (все её части подряд) под
    // картинками во всю их ширину или колонкой справа.
    public static void Layout(Sheet s, string where)
    {
        var imgs = s.Layers.Where(l => !l.Hidden && l.Kind == LayerKind.Image).ToList();
        var tables = s.Layers.Where(l => l.Kind == LayerKind.Table).OrderBy(l => l.TableFrom).ToList();
        if (imgs.Count == 0 || tables.Count == 0) return;
        var left = imgs.Min(l => l.X);
        var top = imgs.Min(l => l.Y);
        var right = imgs.Max(l => l.X + l.W);
        var bottom = imgs.Max(l => l.Y + l.H);
        if (where == "below")
        {
            var y = bottom + 80;
            foreach (var t in tables)
            {
                t.X = left; t.Y = y; t.W = Math.Max(600, right - left);
                t.Crop = new Box(0, 0, t.W, SheetView.TableHeight(s, t));
                y += t.Crop.H + 30;
            }
        }
        else
        {
            var y = top;
            foreach (var t in tables)
            {
                t.X = right + 120; t.Y = y; t.W = 1000;
                t.Crop = new Box(0, 0, t.W, SheetView.TableHeight(s, t));
                y += t.Crop.H + 30;
            }
        }
    }

    // Расширение убирается только у имени файла картинки: «Госакт, стр. 2»
    // — не файл, «. 2» не расширение.
    static string StripImageExt(string name)
    {
        var ext = System.IO.Path.GetExtension(name).ToLowerInvariant();
        return ext is ".png" or ".jpg" or ".jpeg" or ".bmp" or ".tif" or ".tiff" or ".gif" or ".webp"
            ? System.IO.Path.GetFileNameWithoutExtension(name) : name;
    }

    static string UniqueName(Sheet s, string name)
    {
        if (s.Layers.All(l => l.Name != name)) return name;
        for (var i = 2; ; i++)
            if (s.Layers.All(l => l.Name != $"{name} ({i})")) return $"{name} ({i})";
    }
}
