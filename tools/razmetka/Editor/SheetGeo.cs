using System.Windows;
using System.Windows.Media;
using Razmetka.Model;

namespace Razmetka.Editor;

// Геометрия связей на полотне: где стоит рамка, живой ли путь стрелки,
// переложить устаревшие пути.
public static class SheetGeo
{
    // Цвета связей — те же, что в «Перенос документов в систему.html».
    public static readonly Color[] Palette =
    {
        Color.FromRgb(0xD1, 0x49, 0x5B), Color.FromRgb(0x2E, 0x86, 0xAB), Color.FromRgb(0xED, 0xAE, 0x49),
        Color.FromRgb(0x3B, 0x8B, 0x5A), Color.FromRgb(0x8E, 0x5B, 0xB5), Color.FromRgb(0xD9, 0x77, 0x2B),
        Color.FromRgb(0x1B, 0x99, 0x8B),
    };

    public static Color ColorOf(Sheet s, Link k)
    {
        var i = Ordered(s).IndexOf(k);
        return Palette[(i < 0 ? 0 : i) % Palette.Length];
    }

    public static List<Link> Ordered(Sheet s) => s.Links.OrderBy(k => k.N).ToList();

    public static Layer? LayerOf(Sheet s, Frame f) => s.Layers.FirstOrDefault(l => l.Id == f.LayerId);

    // Рамка на полотне: пиксели исходника → полотно по обрезке и масштабу слоя.
    public static Rect? FrameRect(Sheet s, string frameId)
    {
        var f = s.Frames.FirstOrDefault(x => x.Id == frameId);
        if (f == null) return null;
        var l = LayerOf(s, f);
        if (l == null || l.Hidden) return null;
        var k = l.Scale;
        return new Rect(l.X + (f.Box.X - l.Crop.X) * k, l.Y + (f.Box.Y - l.Crop.Y) * k, f.Box.W * k, f.Box.H * k);
    }

    public static Box ToSource(Layer l, Rect world)
    {
        var k = l.Scale;
        return new Box(l.Crop.X + (world.X - l.X) / k, l.Crop.Y + (world.Y - l.Y) / k, world.Width / k, world.Height / k);
    }

    // Путь живой, если начинается на стороне рамки-источника и кончается на
    // стороне рамки-цели: после переноса слоя концы отрываются — путь надо
    // переложить.
    public static bool PathFits(Sheet s, Link k)
    {
        if (k.Points.Count < 2) return false;
        var a = FrameRect(s, k.Src);
        var b = FrameRect(s, k.Tgt);
        if (a == null || b == null) return false;
        return OnEdge(a.Value, k.Points[0]) && OnEdge(b.Value, k.Points[^1]);
    }

    static bool OnEdge(Rect r, Pt p)
    {
        // До стороны — 1,5 единицы; вдоль стороны — до 6: прокладка ставит
        // конец на шаг сетки (10), и у тонкой рамки он может выйти чуть за
        // её край.
        const double e = 1.5, along = 6;
        var inX = p.X >= r.Left - along && p.X <= r.Right + along;
        var inY = p.Y >= r.Top - along && p.Y <= r.Bottom + along;
        return (inX && (Math.Abs(p.Y - r.Top) <= e || Math.Abs(p.Y - r.Bottom) <= e))
            || (inY && (Math.Abs(p.X - r.Left) <= e || Math.Abs(p.X - r.Right) <= e));
    }

    // Путь для показа: живой — как есть, устаревший — простой излом (на время
    // перетаскивания; после отпускания он перекладывается).
    public static List<Point>? Path(Sheet s, Link k)
    {
        var a = FrameRect(s, k.Src);
        var b = FrameRect(s, k.Tgt);
        if (a == null || b == null) return null;
        if (PathFits(s, k)) return k.Points.Select(p => new Point(p.X, p.Y)).ToList();
        var ra = a.Value;
        var rb = b.Value;
        var right = rb.Left >= ra.Right;
        var sx = right ? ra.Right : ra.Left;
        var tx = right ? rb.Left : rb.Right;
        double sy = (ra.Top + ra.Bottom) / 2, ty = (rb.Top + rb.Bottom) / 2, mx = (sx + tx) / 2;
        return new() { new(sx, sy), new(mx, sy), new(mx, ty), new(tx, ty) };
    }

    // Переложить пути: only — какие связи (null — все устаревшие). Остальные
    // пути остаются и обходятся.
    public static void Reroute(Sheet s, ICollection<string>? only = null)
    {
        var links = Ordered(s).Where(k => FrameRect(s, k.Src) != null && FrameRect(s, k.Tgt) != null).ToList();
        if (links.Count == 0) return;
        var redo = links.Where(k => only != null ? only.Contains(k.Id) : !PathFits(s, k)).ToHashSet();
        if (redo.Count == 0) return;
        var srcs = links.Select(k => FrameRect(s, k.Src)!.Value).ToList();
        var tgts = links.Select(k => FrameRect(s, k.Tgt)!.Value).ToList();
        var images = s.Layers.Where(l => !l.Hidden).Select(l => new Rect(l.X, l.Y, l.W, l.H)).ToList();
        var area = Rect.Empty;
        foreach (var r in images.Concat(srcs).Concat(tgts)) area.Union(r);
        area.Inflate(200, 200);
        var fixedPaths = links.Select(k => redo.Contains(k) ? null : k.Points.Select(p => new Point(p.X, p.Y)).ToList()).ToList();
        var sides = links.Select(k => (k.SrcSide, k.TgtSide)).ToList();
        var geo = Router.Route(area, srcs, tgts, images, fixedPaths!, sides);
        for (var i = 0; i < links.Count; i++)
            if (redo.Contains(links[i])) links[i].Points = geo[i].Select(p => new Pt(p.X, p.Y)).ToList();
    }

    // Где стоят номера связи: у рамки на странице — на стрелке сразу за
    // рамкой (значение под рамкой не закрыто); у поля — в правом верхнем углу.
    public static (Point Src, Point Tgt) Badges(List<Point> pts, Rect tgt)
    {
        var a = pts[0];
        var b = pts[1];
        var seg = (b - a).Length;
        if (seg < 1) seg = 1;
        var d = Math.Min(26, seg);
        return (a + (b - a) * (d / seg), new Point(tgt.Right - 18, tgt.Top));
    }

    public static double DistToPath(List<Point> pts, Point p)
    {
        var best = double.MaxValue;
        for (var i = 0; i + 1 < pts.Count; i++) best = Math.Min(best, DistToSeg(pts[i], pts[i + 1], p));
        return best;
    }

    static double DistToSeg(Point a, Point b, Point p)
    {
        var ab = b - a;
        var len = ab.LengthSquared;
        var t = len < 1e-9 ? 0 : Math.Clamp(Vector.Multiply(p - a, ab) / len, 0, 1);
        return (p - (a + ab * t)).Length;
    }
}
