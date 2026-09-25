using System.Windows;

namespace Razmetka.Editor;

// Прокладка стрелок по сетке — перенос route_links из
// tools/docs/build_tp_v_sistemu.py (там подобраны цены и проверены на всех
// разворотах техпаспортов и госакта).
//
// У каждой стрелки кратчайший путь с ценой: поворот, проход по картинке (там
// текст), пересечение чужой стрелки дороже простого шага; чужие рамки и
// наложение на чужую стрелку запрещены. Стрелка выходит из любой стороны
// рамки на странице и входит в поле с любой стороны. Сначала прокладываются
// короткие связи, затем каждая перекладывается ещё раз при уже проложенных.
public static class Router
{
    const int Step = 10;
    const int CostBend = 10, CostImage = 6, CostCross = 14, CostNear = 3;
    static readonly (int dx, int dy)[] Dirs = { (1, 0), (-1, 0), (0, 1), (0, -1) };

    // fixedPaths[i] != null — путь задан руками: не перекладывается, но
    // занимает сетку, чтобы другие его обходили.
    public static List<Point>[] Route(Rect area, IList<Rect> sources, IList<Rect> targets, IList<Rect> images,
        IList<List<Point>?>? fixedPaths = null)
    {
        var ox = Math.Floor(area.X / Step) * Step - Step * 4;
        var oy = Math.Floor(area.Y / Step) * Step - Step * 4;
        var W = area.Right - ox + Step * 4;
        var H = area.Bottom - oy + Step * 4;
        int nx = (int)(W / Step) + 1, ny = (int)(H / Step) + 1;
        var n = sources.Count;
        Rect Sh(Rect r) => new(r.X - ox, r.Y - oy, r.Width, r.Height);
        var src = sources.Select(Sh).ToArray();
        var tgt = targets.Select(Sh).ToArray();

        var baseCost = new byte[nx * ny];
        Array.Fill(baseCost, (byte)1);
        foreach (var r0 in images)
        {
            var r = Sh(r0);
            for (var iy = Math.Max(0, (int)(r.Top / Step)); iy < Math.Min(ny, (int)(r.Bottom / Step) + 1); iy++)
                for (var ix = Math.Max(0, (int)(r.Left / Step)); ix < Math.Min(nx, (int)(r.Right / Step) + 1); ix++)
                    baseCost[iy * nx + ix] = CostImage;
        }

        HashSet<int> Cells(Rect r, double m)
        {
            double x0 = r.Left - m, y0 = r.Top - m, x1 = r.Right + m, y1 = r.Bottom + m;
            var o = new HashSet<int>();
            for (var iy = Math.Max(0, (int)(y0 / Step)); iy < Math.Min(ny, (int)(y1 / Step) + 2); iy++)
            {
                var cy = iy * Step;
                if (cy < y0 || cy > y1) continue;
                for (var ix = Math.Max(0, (int)(x0 / Step)); ix < Math.Min(nx, (int)(x1 / Step) + 2); ix++)
                    if (ix * Step >= x0 && ix * Step <= x1) o.Add(iy * nx + ix);
            }
            return o;
        }

        var all = src.Concat(tgt).ToArray();
        var near = all.Select(r => Cells(r, 12)).ToArray();
        var own = all.Select(r => Cells(r, 5)).ToArray();
        var edge = new HashSet<int>();
        for (var ix = 0; ix < nx; ix++) { edge.Add(ix); edge.Add((ny - 1) * nx + ix); }
        for (var iy = 0; iy < ny; iy++) { edge.Add(iy * nx); edge.Add(iy * nx + nx - 1); }

        List<(int idx, int d)>? Search(int i, Dictionary<int, HashSet<char>> occ)
        {
            var s = src[i];
            var t = tgt[i];
            var blocked = new HashSet<int>(edge);
            for (var j = 0; j < near.Length; j++)
                if (j != i && j != n + i) blocked.UnionWith(near[j]);
            var sOwn = own[i];
            var tOwn = own[n + i];
            blocked.UnionWith(sOwn);
            blocked.UnionWith(tOwn);
            double tx0 = t.Left / Step, ty0 = t.Top / Step, tx1 = t.Right / Step, ty1 = t.Bottom / Step;
            double Hh(int idx) { int x = idx % nx, y = idx / nx; return Math.Max(Math.Max(tx0 - x, 0), x - tx1) + Math.Max(Math.Max(ty0 - y, 0), y - ty1); }

            var heap = new PriorityQueue<(double g, int key), double>();
            var best = new Dictionary<int, double>();
            var parent = new Dictionary<int, int?>();
            double scx = (s.Left + s.Right) / 2, scy = (s.Top + s.Bottom) / 2;
            foreach (var c in sOwn)
            {
                int x = c % nx, y = c / nx;
                for (var d = 0; d < 4; d++)
                {
                    int x2 = x + Dirs[d].dx, y2 = y + Dirs[d].dy;
                    if (x2 < 0 || x2 >= nx || y2 < 0 || y2 >= ny) continue;
                    var nn = y2 * nx + x2;
                    if (blocked.Contains(nn) || occ.ContainsKey(nn)) continue;
                    var off = Dirs[d].dy != 0 ? Math.Abs(nn % nx * Step - scx) : Math.Abs(nn / nx * Step - scy);
                    var g = 0.15 * off;
                    var key = nn * 4 + d;
                    if (g < best.GetValueOrDefault(key, 1e18)) { best[key] = g; parent[key] = null; heap.Enqueue((g, key), g + Hh(nn)); }
                }
            }
            var found = false;
            while (heap.TryDequeue(out var it, out _))
            {
                var (g, key) = it;
                if (key == -1) { found = true; break; }
                if (g > best.GetValueOrDefault(key, 1e18)) continue;
                int idx = key / 4, d = key % 4;
                int x = idx % nx, y = idx / nx;
                for (var d2 = 0; d2 < 4; d2++)
                {
                    if ((d2 ^ 1) == d && d2 / 2 == d / 2) continue;
                    int x2 = x + Dirs[d2].dx, y2 = y + Dirs[d2].dy;
                    if (x2 < 0 || x2 >= nx || y2 < 0 || y2 >= ny) continue;
                    var nn = y2 * nx + x2;
                    var turn = d2 != d;
                    if (turn && occ.ContainsKey(idx)) continue;
                    if (tOwn.Contains(nn))
                    {
                        if (turn) continue;
                        var gg = g + 1;
                        if (gg < best.GetValueOrDefault(-1, 1e18)) { best[-1] = gg; parent[-1] = key; heap.Enqueue((gg, -1), gg); }
                        continue;
                    }
                    if (blocked.Contains(nn)) continue;
                    var o = d2 < 2 ? 'h' : 'v';
                    double c = baseCost[nn];
                    if (occ.TryGetValue(nn, out var oc))
                    {
                        if (oc.Contains(o) || oc.Contains('c')) continue;
                        c += CostCross;
                    }
                    if (o == 'h') { if (Has(occ, nn - nx, 'h') || Has(occ, nn + nx, 'h')) c += CostNear; }
                    else if (Has(occ, nn - 1, 'v') || Has(occ, nn + 1, 'v')) c += CostNear;
                    var g2 = g + c + (turn ? CostBend : 0);
                    var k2 = nn * 4 + d2;
                    if (g2 < best.GetValueOrDefault(k2, 1e18)) { best[k2] = g2; parent[k2] = key; heap.Enqueue((g2, k2), g2 + Hh(nn)); }
                }
            }
            if (!found) return null;
            var path = new List<(int idx, int d)>();
            var k = parent[-1];
            while (k != null) { path.Add((k.Value / 4, k.Value % 4)); k = parent[k.Value]; }
            path.Reverse();
            return path;
        }

        static bool Has(Dictionary<int, HashSet<char>> occ, int idx, char c) => occ.TryGetValue(idx, out var s) && s.Contains(c);

        void Mark(List<(int idx, int d)> path, Dictionary<int, HashSet<char>> occ)
        {
            for (var k = 0; k < path.Count; k++)
            {
                var (idx, d) = path[k];
                if (!occ.TryGetValue(idx, out var s)) occ[idx] = s = new HashSet<char>();
                s.Add(d < 2 ? 'h' : 'v');
                if (k + 1 < path.Count && path[k + 1].d != d) s.Add('c');
            }
            if (path.Count > 0)
            {
                Add(occ, path[0].idx, 'c');
                Add(occ, path[^1].idx, 'c');
            }
        }

        static void Add(Dictionary<int, HashSet<char>> occ, int idx, char c)
        {
            if (!occ.TryGetValue(idx, out var s)) occ[idx] = s = new HashSet<char>();
            s.Add(c);
        }

        // Путь, заданный руками, — в клетки сетки, чтобы остальные его обходили.
        var fixedCells = new List<(int idx, int d)>?[n];
        if (fixedPaths != null)
            for (var i = 0; i < n; i++)
            {
                var fp = fixedPaths[i];
                if (fp == null || fp.Count < 2) continue;
                var cells = new List<(int idx, int d)>();
                for (var k = 0; k + 1 < fp.Count; k++)
                {
                    var a = new Point(fp[k].X - ox, fp[k].Y - oy);
                    var b = new Point(fp[k + 1].X - ox, fp[k + 1].Y - oy);
                    var steps = (int)Math.Max(1, (a - b).Length / Step);
                    var d = Math.Abs(a.X - b.X) > Math.Abs(a.Y - b.Y) ? 0 : 2;
                    for (var q = 0; q <= steps; q++)
                    {
                        var p = a + (b - a) * q / steps;
                        int ix = (int)Math.Round(p.X / Step), iy = (int)Math.Round(p.Y / Step);
                        if (ix >= 0 && ix < nx && iy >= 0 && iy < ny) cells.Add((iy * nx + ix, d));
                    }
                }
                fixedCells[i] = cells;
            }

        Dictionary<int, HashSet<char>> Occ(List<(int idx, int d)>?[] paths, int skip)
        {
            var occ = new Dictionary<int, HashSet<char>>();
            for (var j = 0; j < paths.Length; j++)
                if (j != skip && paths[j] is { } p) Mark(p, occ);
            return occ;
        }

        Point Mid(Rect r) => new((r.Left + r.Right) / 2, (r.Top + r.Bottom) / 2);
        var order = Enumerable.Range(0, n).Where(i => fixedCells[i] == null)
            .OrderBy(i => Math.Abs(Mid(src[i]).X - Mid(tgt[i]).X) + Math.Abs(Mid(src[i]).Y - Mid(tgt[i]).Y)).ToList();
        var paths = new List<(int idx, int d)>?[n];
        for (var i = 0; i < n; i++) paths[i] = fixedCells[i];
        foreach (var i in order) paths[i] = Search(i, Occ(paths, i));
        for (var pass = 0; pass < 2; pass++)
            foreach (var i in order)
                if (Search(i, Occ(paths, i)) is { } p) paths[i] = p;

        var geo = new List<Point>[n];
        for (var i = 0; i < n; i++)
        {
            if (fixedPaths?[i] is { Count: >= 2 } fp) { geo[i] = fp; continue; }
            var s = src[i];
            var t = tgt[i];
            var path = paths[i];
            List<Point> pts;
            if (path == null || path.Count == 0)
            {
                // Пути нет — простой излом.
                double sy = (s.Top + s.Bottom) / 2, ty = (t.Top + t.Bottom) / 2, mx = (s.Right + t.Left) / 2;
                pts = new() { new(s.Right, sy), new(mx, sy), new(mx, ty), new(t.Left, ty) };
            }
            else
            {
                var raw = path.Select(p => new Point(p.idx % nx * Step, p.idx / nx * Step)).ToList();
                var (x0, y0) = (raw[0].X, raw[0].Y);
                var start = path[0].d switch { 0 => new Point(s.Right, y0), 1 => new Point(s.Left, y0), 2 => new Point(x0, s.Bottom), _ => new Point(x0, s.Top) };
                var (x1, y1) = (raw[^1].X, raw[^1].Y);
                var end = path[^1].d switch { 0 => new Point(t.Left, y1), 1 => new Point(t.Right, y1), 2 => new Point(x1, t.Top), _ => new Point(x1, t.Bottom) };
                raw.Insert(0, start);
                raw.Add(end);
                pts = Simplify(raw);
            }
            geo[i] = pts.Select(p => new Point(p.X + ox, p.Y + oy)).ToList();
        }
        return geo;
    }

    public static List<Point> Simplify(List<Point> pts)
    {
        var o = new List<Point> { pts[0] };
        for (var k = 1; k < pts.Count - 1; k++)
        {
            var a = o[^1];
            var b = pts[k];
            var c = pts[k + 1];
            if ((Near(a.X, b.X) && Near(b.X, c.X)) || (Near(a.Y, b.Y) && Near(b.Y, c.Y))) continue;
            o.Add(b);
        }
        o.Add(pts[^1]);
        return o;
    }

    static bool Near(double a, double b) => Math.Abs(a - b) < 0.01;
}
