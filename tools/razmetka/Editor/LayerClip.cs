using System.IO;
using System.Text.Json;
using Razmetka.Model;

namespace Razmetka.Editor;

// Буфер обмена слоёв (пользователь 27.10.2026: «полную поддержку ctrl c v a x
// z… Копировать — в буфер… после чего куда надо, туда и вставляем»).
//
// Ctrl+C кладёт выбранные картинки в буфер вместе с их рамками и связями,
// у которых оба конца среди копируемого; Ctrl+V вставляет на открытый
// разворот — любой главы и даже другого проекта: картинка, которой там нет,
// докопируется из папки исходного проекта (имя файла — хэш, дубля не будет).
// Таблица связей не копируется: она строится по связям своего разворота.
public sealed class LayerClip
{
    public const string Format = "Razmetka.Layers.v1";

    public string ProjectDir { get; set; } = "";
    public string SheetId { get; set; } = "";
    public bool Cut { get; set; }
    public List<Layer> Layers { get; set; } = new();
    public List<Frame> Frames { get; set; } = new();
    public List<Link> Links { get; set; } = new();
    public Dictionary<string, AssetInfo> Assets { get; set; } = new();

    public string ToJson() => JsonSerializer.Serialize(this, ProjectStore.Json);
    public static LayerClip? FromJson(string s)
    {
        try { return JsonSerializer.Deserialize<LayerClip>(s, ProjectStore.Json); }
        catch (JsonException) { return null; }
    }

    // Связи, у которых в копируемом только один конец, — они при вырезании
    // снимаются вместе с картинкой (второй конец остаётся на месте).
    public static int HalfLinks(Sheet s, IEnumerable<string> ids)
    {
        var set = ids.ToHashSet();
        var fr = s.Frames.Where(f => set.Contains(f.LayerId)).Select(f => f.Id).ToHashSet();
        return s.Links.Count(k => fr.Contains(k.Src) != fr.Contains(k.Tgt));
    }

    public static LayerClip Build(Sheet s, ProjectStore store, IEnumerable<string> ids)
    {
        var set = ids.ToHashSet();
        var layers = s.Layers.Where(l => set.Contains(l.Id) && l.Kind == LayerKind.Image).ToList();
        var lids = layers.Select(l => l.Id).ToHashSet();
        var frames = s.Frames.Where(f => lids.Contains(f.LayerId)).ToList();
        var fids = frames.Select(f => f.Id).ToHashSet();
        var clip = new LayerClip
        {
            ProjectDir = store.Dir, SheetId = s.Id,
            Layers = Clone(layers), Frames = Clone(frames),
            Links = Clone(s.Links.Where(k => fids.Contains(k.Src) && fids.Contains(k.Tgt)).OrderBy(k => k.N).ToList()),
        };
        foreach (var l in layers)
            if (l.Asset != null && store.Project.Assets.TryGetValue(l.Asset, out var a)) clip.Assets[l.Asset] = a;
        return clip;
    }

    static List<T> Clone<T>(List<T> v) =>
        JsonSerializer.Deserialize<List<T>>(JsonSerializer.Serialize(v, ProjectStore.Json), ProjectStore.Json)!;

    // Вставка на разворот s. Где встаёт: на том же развороте, откуда
    // скопировано, — со сдвигом (иначе копия ляжет ровно поверх); на другом —
    // на тех же местах, а если там занято — справа от занятого, сохраняя
    // взаимное расположение вставляемых. Возвращает id новых слоёв; missing —
    // картинки, файла которых не нашлось.
    public List<string> PasteInto(Sheet s, ProjectStore store, out List<string> missing)
    {
        missing = new();
        foreach (var (hash, info) in Assets)
        {
            if (store.Project.Assets.ContainsKey(hash)) continue;
            var src = Path.Combine(ProjectDir, ProjectStore.ImagesDir, info.File);
            var dst = Path.Combine(store.Dir, ProjectStore.ImagesDir, info.File);
            if (!File.Exists(dst))
            {
                if (!File.Exists(src)) { missing.Add(info.Name.Length > 0 ? info.Name : info.File); continue; }
                File.Copy(src, dst);
            }
            store.Project.Assets[hash] = new AssetInfo { File = info.File, W = info.W, H = info.H, Name = info.Name };
        }
        var layers = Clone(Layers).Where(l => l.Asset == null || store.Project.Assets.ContainsKey(l.Asset)).ToList();
        if (layers.Count == 0) return new();

        double dx = 0, dy = 0;
        var same = s.Id == SheetId && Path.GetFullPath(store.Dir) == Path.GetFullPath(ProjectDir);
        var others = s.Layers.Where(l => !l.Hidden && l.Kind == LayerKind.Image).ToList();
        if (same && !Cut) { dx = 30; dy = 30; }
        else if (others.Count > 0)
        {
            static double L(Layer l) => l.X;
            static double R(Layer l) => l.X + l.W;
            static double T(Layer l) => l.Y;
            static double B(Layer l) => l.Y + l.H;
            var (gx0, gy0, gx1, gy1) = (layers.Min(L), layers.Min(T), layers.Max(R), layers.Max(B));
            var overlaps = others.Any(o => R(o) > gx0 && L(o) < gx1 && B(o) > gy0 && T(o) < gy1);
            if (overlaps) { dx = others.Max(R) + 120 - gx0; dy = others.Min(T) - gy0; }
        }

        var lmap = new Dictionary<string, string>();
        foreach (var l in layers)
        {
            var id = Ids.New("ly");
            lmap[l.Id] = id;
            l.Id = id;
            l.X += dx;
            l.Y += dy;
            l.Name = LayerOps.UniqueName(s, l.Name);
            s.Layers.Add(l);
        }
        var fmap = new Dictionary<string, string>();
        foreach (var f in Clone(Frames).Where(f => lmap.ContainsKey(f.LayerId)))
        {
            var id = Ids.New("fr");
            fmap[f.Id] = id;
            f.Id = id;
            f.LayerId = lmap[f.LayerId];
            s.Frames.Add(f);
        }
        var n = s.Links.Select(k => k.N).DefaultIfEmpty(0).Max();
        foreach (var k in Clone(Links).Where(k => fmap.ContainsKey(k.Src) && fmap.ContainsKey(k.Tgt)))
        {
            k.Id = Ids.New("lk");
            k.Src = fmap[k.Src];
            k.Tgt = fmap[k.Tgt];
            k.N = ++n;
            // Путь стрелки — в координатах полотна: при сдвиге прокладывается заново.
            if (dx != 0 || dy != 0) k.Points.Clear();
            k.SeeAlso.Clear();
            s.Links.Add(k);
        }
        return layers.Select(l => l.Id).ToList();
    }
}
