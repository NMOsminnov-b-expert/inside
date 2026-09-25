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
            Name = UniqueName(s, string.IsNullOrWhiteSpace(name) ? "Фото" : System.IO.Path.GetFileNameWithoutExtension(name)),
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

    static string UniqueName(Sheet s, string name)
    {
        if (s.Layers.All(l => l.Name != name)) return name;
        for (var i = 2; ; i++)
            if (s.Layers.All(l => l.Name != $"{name} ({i})")) return $"{name} ({i})";
    }
}
