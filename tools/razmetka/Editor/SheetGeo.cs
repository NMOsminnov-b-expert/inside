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

    // --- поворот: картинка и рамки -------------------------------------------
    //
    // Точка исходника → полотно: по обрезке и масштабу слоя (оси слоя), затем
    // поворот слоя вокруг его середины. Рамка — прямоугольник в пикселях
    // исходника, повёрнутый на свой Angle вокруг своей середины.

    public static Point Center(Layer l) => new(l.X + l.W / 2, l.Y + l.H / 2);

    public static Point Rotate(Point p, Point c, double deg)
    {
        if (deg == 0) return p;
        var a = deg * Math.PI / 180;
        double cos = Math.Cos(a), sin = Math.Sin(a), dx = p.X - c.X, dy = p.Y - c.Y;
        return new Point(c.X + dx * cos - dy * sin, c.Y + dx * sin + dy * cos);
    }

    public static Vector Rotate(Vector v, double deg)
    {
        if (deg == 0) return v;
        var a = deg * Math.PI / 180;
        return new Vector(v.X * Math.Cos(a) - v.Y * Math.Sin(a), v.X * Math.Sin(a) + v.Y * Math.Cos(a));
    }

    public static Point ImgToWorld(Layer l, Point px)
    {
        var k = l.Scale;
        return Rotate(new Point(l.X + (px.X - l.Crop.X) * k, l.Y + (px.Y - l.Crop.Y) * k), Center(l), l.Rotation);
    }

    public static Point WorldToImg(Layer l, Point w)
    {
        var k = l.Scale;
        var u = Rotate(w, Center(l), -l.Rotation);
        return new Point(l.Crop.X + (u.X - l.X) / k, l.Crop.Y + (u.Y - l.Y) / k);
    }

    // Углы слоя на полотне (лв, пв, пн, лн) и описанный прямоугольник.
    public static Point[] LayerQuad(Layer l, double h)
    {
        var c = new Point(l.X + l.W / 2, l.Y + h / 2);
        return new[] { new Point(l.X, l.Y), new Point(l.X + l.W, l.Y), new Point(l.X + l.W, l.Y + h), new Point(l.X, l.Y + h) }
            .Select(p => Rotate(p, c, l.Rotation)).ToArray();
    }

    public static Rect LayerBounds(Layer l, double h) => Bounds(LayerQuad(l, h));

    public static Rect Bounds(IEnumerable<Point> pts)
    {
        var r = Rect.Empty;
        foreach (var p in pts) r.Union(p);
        return r;
    }

    // Углы рамки в пикселях исходника (с её наклоном).
    public static Point[] BoxQuad(Box b, double angle)
    {
        var c = new Point(b.X + b.W / 2, b.Y + b.H / 2);
        return new[] { new Point(b.X, b.Y), new Point(b.Right, b.Y), new Point(b.Right, b.Bottom), new Point(b.X, b.Bottom) }
            .Select(p => Rotate(p, c, angle)).ToArray();
    }

    // Углы рамки на полотне (лв, пв, пн, лн — в осях рамки).
    public static Point[]? FrameQuad(Sheet s, string frameId)
    {
        var f = s.Frames.FirstOrDefault(x => x.Id == frameId);
        if (f == null) return null;
        var l = LayerOf(s, f);
        if (l == null || l.Hidden) return null;
        return BoxQuad(f.Box, f.Angle).Select(p => ImgToWorld(l, p)).ToArray();
    }

    // Полный наклон рамки на полотне: слой + рамка.
    public static double FrameTilt(Sheet s, Frame f) => (LayerOf(s, f)?.Rotation ?? 0) + f.Angle;

    // Рамка на полотне — описанный прямоугольник (по нему прокладываются
    // стрелки и стоят номера); сама рамка рисуется по FrameQuad.
    public static Rect? FrameRect(Sheet s, string frameId) => FrameQuad(s, frameId) is { } q ? Bounds(q) : null;

    // Новая рамка по обводке на полотне: ровно по экрану, то есть с наклоном,
    // обратным повороту слоя.
    public static (Box Box, double Angle) FromWorld(Layer l, Rect world)
    {
        var k = l.Scale;
        var c = WorldToImg(l, new Point(world.X + world.Width / 2, world.Y + world.Height / 2));
        double w = world.Width / k, h = world.Height / k;
        return (new Box(c.X - w / 2, c.Y - h / 2, w, h), -l.Rotation);
    }

    public static Box ToSource(Layer l, Rect world) => FromWorld(l, world).Box;

    // Путь для показа: концы доведены до самой рамки — при наклоне она
    // уже своего описанного прямоугольника, к которому проложен путь.
    public static List<Point>? DrawPath(Sheet s, Link k)
    {
        var pts = Path(s, k);
        if (pts == null || pts.Count < 2) return pts;
        var fs = s.Frames.FirstOrDefault(x => x.Id == k.Src);
        var ft = s.Frames.FirstOrDefault(x => x.Id == k.Tgt);
        if (fs != null && FrameTilt(s, fs) != 0 && FrameQuad(s, k.Src) is { } qs) pts[0] = Snap(pts[1], pts[0], qs);
        if (ft != null && FrameTilt(s, ft) != 0 && FrameQuad(s, k.Tgt) is { } qt) pts[^1] = Snap(pts[^2], pts[^1], qt);
        return pts;
    }

    // Луч от inner через end, продлённый, — первая точка на контуре рамки.
    static Point Snap(Point inner, Point end, Point[] quad)
    {
        var d = end - inner;
        if (d.Length < 1e-6) return end;
        var far = end + d / d.Length * 2000;
        Point? best = null;
        var bestT = double.MaxValue;
        for (var i = 0; i < 4; i++)
        {
            var a = quad[i];
            var b = quad[(i + 1) % 4];
            if (Intersect(inner, far, a, b) is { } t && t < bestT) { bestT = t; best = inner + (far - inner) * t; }
        }
        return best ?? end;
    }

    static double? Intersect(Point p, Point p2, Point q, Point q2)
    {
        var r = p2 - p;
        var s = q2 - q;
        var den = Vector.CrossProduct(r, s);
        if (Math.Abs(den) < 1e-9) return null;
        var t = Vector.CrossProduct(q - p, s) / den;
        var u = Vector.CrossProduct(q - p, r) / den;
        return t is >= 0 and <= 1 && u is >= 0 and <= 1 ? t : null;
    }

    // Точка внутри выпуклого многоугольника (углы по порядку).
    public static bool InQuad(Point[] q, Point p)
    {
        var sign = 0;
        for (var i = 0; i < q.Length; i++)
        {
            var c = Vector.CrossProduct(q[(i + 1) % q.Length] - q[i], p - q[i]);
            var sg = Math.Sign(c);
            if (sg == 0) continue;
            if (sign == 0) sign = sg; else if (sg != sign) return false;
        }
        return true;
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
        var images = s.Layers.Where(l => !l.Hidden).Select(l => LayerBounds(l, l.H)).ToList();
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
