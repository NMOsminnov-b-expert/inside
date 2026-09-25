using Razmetka.Model;

namespace Razmetka.Editor;

// Действия со связями — без интерфейса, как LayerOps.
public static class LinkOps
{
    // Новая связь из двух нарисованных рамок: номер — следом за последним,
    // таблица разворота растёт на строку; у разворота без таблицы она
    // появляется под картинками.
    public static Link Create(Sheet s, Frame src, Frame tgt)
    {
        s.Frames.Add(src);
        s.Frames.Add(tgt);
        var k = new Link { N = s.Links.Select(x => x.N).DefaultIfEmpty(0).Max() + 1, Src = src.Id, Tgt = tgt.Id };
        s.Links.Add(k);
        var table = s.Layers.FirstOrDefault(l => l.Kind == LayerKind.Table);
        if (table == null)
        {
            var imgs = s.Layers.Where(l => !l.Hidden && l.Kind == LayerKind.Image).ToList();
            var left = imgs.Select(l => l.X).DefaultIfEmpty(0).Min();
            var right = imgs.Select(l => l.X + l.W).DefaultIfEmpty(1600).Max();
            var bottom = imgs.Select(l => l.Y + l.H).DefaultIfEmpty(0).Max();
            s.Layers.Add(new Layer
            {
                Kind = LayerKind.Table, Name = "Таблица связей", X = left, Y = bottom + 60, W = Math.Max(900, right - left),
                Crop = new Box(0, 0, Math.Max(900, right - left), 100), TableFrom = 0, TableTo = 0,
            });
        }
        else if (table.TableTo > 0 && table.TableTo == s.Links.Count - 1) table.TableTo = s.Links.Count;
        return k;
    }

    // Удаление связи уносит обе её рамки; номера после неё сдвигаются вверх.
    public static void Delete(Sheet s, Link k)
    {
        s.Frames.RemoveAll(f => f.Id == k.Src || f.Id == k.Tgt);
        s.Links.Remove(k);
        foreach (var x in s.Links.Where(x => x.N > k.N)) x.N--;
        foreach (var t in s.Layers.Where(l => l.Kind == LayerKind.Table && l.TableTo > s.Links.Count)) t.TableTo = s.Links.Count;
    }

    // Копия связи: рамки сдвинуты вниз на свою высоту — для соседней строки
    // той же таблицы документа; поля копируются, номер — следующий.
    public static Link Duplicate(Sheet s, Link k)
    {
        Frame Copy(string id)
        {
            var f = s.Frames.First(x => x.Id == id);
            return new Frame { LayerId = f.LayerId, Box = new Box(f.Box.X, f.Box.Y + f.Box.H, f.Box.W, f.Box.H) };
        }
        var c = Create(s, Copy(k.Src), Copy(k.Tgt));
        c.DocField = k.DocField;
        c.SystemField = k.SystemField;
        c.Kind = k.Kind;
        return c;
    }

    // Новый номер связи в пределах своего разворота: остальные сдвигаются.
    // Номера сквозные по главе (как в «Перенос документов в систему»):
    // после правки глава перенумеровывается целиком — RenumberChapter.
    public static void Renumber(Sheet s, Link k, int n)
    {
        var list = s.Links.OrderBy(x => x.N).ToList();
        var first = list.Count > 0 ? list[0].N : 1;
        list.Remove(k);
        var pos = Math.Clamp(n - first, 0, list.Count);
        list.Insert(pos, k);
        for (var i = 0; i < list.Count; i++) list[i].N = first + i;
    }

    // Номера подряд через всю главу: развороты по порядку, внутри — по
    // текущему номеру. Возвращает true, если что-то поменялось.
    public static bool RenumberChapter(Chapter c)
    {
        var n = 1;
        var changed = false;
        foreach (var s in c.Sheets)
            foreach (var k in s.Links.OrderBy(x => x.N).ToList())
            {
                if (k.N != n) { k.N = n; changed = true; }
                n++;
            }
        return changed;
    }
}
