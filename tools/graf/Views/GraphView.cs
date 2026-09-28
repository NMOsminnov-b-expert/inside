using System.Numerics;
using System.Text.Json;
using Graf.Model;
using Microsoft.Graphics.Canvas.Geometry;
using Microsoft.Graphics.Canvas.Text;
using Microsoft.Graphics.Canvas.UI.Xaml;
using Microsoft.UI;
using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Windows.System;
using Windows.UI;

namespace Graf.Views;

// Полотно графа: узлы — записи, рёбра — связи. Два вида — плоский (2D) и
// объёмный (3D), у каждого своя раскладка; места узлов запоминаются для
// каждого проекта отдельно.
//
// Поведение раскладки. В покое граф стоит: правка текста записи, новая
// связь, живое обновление с диска не двигают узлы, которые уже стоят, —
// человек помнит, где что лежит, и сотни узлов в движении сбивают. Новые
// узлы рассчитываются при неподвижных старых и въезжают на место от
// соседей. Живая раскладка включается, когда узел тянут: соседи в двух
// шагах следуют за ним на пружинах (приём d3: «подогреть» раскладку на
// время перетаскивания), после отпускания всё быстро успокаивается. Так
// граф распутывают руками. Отпущенный узел закрепляется (точка на узле);
// открепить — правой кнопкой.
//
// Мышь в 2D: колесо — масштаб у курсора; перетаскивание по пустому — сдвиг.
// Мышь в 3D: левая по пустому — вращение вокруг точки; правая, средняя
// или Shift+левая — сдвиг; колесо — ближе/дальше к курсору.
// Везде: узел — тянуть; щелчок — выбрать; двойной щелчок и F — к узлу;
// правая по узлу — меню; WASD/стрелки — лететь (Q/E — вниз/вверх в 3D,
// Shift — быстрее); Home — весь граф.
public sealed class GraphView : UserControl
{
    sealed class Node
    {
        public Record R = null!;
        // Места узла: 0 — плоская свободная, 1 — объёмная, 2 — острова на
        // плоскости, 3 — острова в объёме (у каждой раскладки свои места:
        // переключение не портит другую).
        public readonly Vector3[] P = new Vector3[4];
        public readonly bool[] Placed = new bool[4];
        public Vector3 V;
        public bool Pinned;
        public int Deg;
        public float Radius => 5 + MathF.Sqrt(Deg) * 2.2f;
        // Положение на экране по последнему кадру — для попадания мышью.
        public Vector2 S;
        public float Depth, Rpx;
        public bool On;
    }

    sealed class Spot
    {
        public float[]? F { get; set; }
        public float[]? D { get; set; }
        public float[]? I { get; set; }
        public float[]? J { get; set; }
    }

    readonly CanvasControl _c = new();
    readonly Dictionary<string, Node> _nodes = new();
    Node[] _arr = Array.Empty<Node>();
    List<(Node A, Node B, string Type)> _edges = new();
    Dictionary<Node, List<Node>> _adj = new();
    bool _3d, _islands;
    int M => Index(_3d, _islands);
    static int Index(bool d3, bool islands) => d3 ? (islands ? 3 : 1) : (islands ? 2 : 0);

    // --- острова по разделам ---------------------------------------------------
    //
    // Задача пользователя 28.09.2026 («граф сильно запутан»): узлы одного вида
    // записи собираются в свою область с подписью (практика «группа в своей
    // области»); связи внутри области — обычные пружины, между областями —
    // слабые, чтобы острова не слипались в клубок. Центры островов — по кругу,
    // размер острова — по числу записей.
    // В объёме центры островов — на сфере (точки Фибоначчи: ровно по
    // поверхности), радиус сферы — по суммарной площади островов.
    readonly Dictionary<string, Vector3> _island = new(), _island3 = new();

    void UpdateIslands()
    {
        _island.Clear();
        _island3.Clear();
        var groups = _arr.GroupBy(n => n.R.Folder).OrderByDescending(g => g.Count()).ToList();
        if (groups.Count == 0) return;
        float Rad(int n) => IslK * MathF.Sqrt(n) + 50;
        var sum2 = groups.Sum(g => MathF.Pow(Rad(g.Count()) * IslGap3, 2));
        var sphere = groups.Count == 1 ? 0 : MathF.Sqrt(sum2 * 1.3f / 4);
        for (var i = 0; i < groups.Count; i++)
        {
            var y = groups.Count == 1 ? 0 : 1 - 2f * (i + 0.5f) / groups.Count;
            var rr = MathF.Sqrt(Math.Max(0, 1 - y * y));
            var th = i * MathF.PI * (3 - MathF.Sqrt(5));
            _island3[groups[i].Key] = new Vector3(MathF.Cos(th) * rr, y, MathF.Sin(th) * rr) * sphere;
        }
        var circ = groups.Sum(g => 2 * Rad(g.Count())) * IslGap;
        var big = groups.Count == 1 ? 0 : circ / (2 * MathF.PI);
        var at = 0f;
        foreach (var g in groups)
        {
            var r = Rad(g.Count());
            var ang = (at + r) / circ * 2 * MathF.PI;
            _island[g.Key] = new Vector3(MathF.Cos(ang) * big, MathF.Sin(ang) * big, 0);
            at += 2 * r * IslGap;
        }
    }

    // Меняются силы островов — растёт версия: места, посчитанные прежними
    // силами, не восстанавливаются, острова раскладываются заново.
    const float IslandsVersion = 3;
    // Силы островов подобраны замером перекрытия (IslandStats): при
    // притяжении 0,35 к центру острова и расстоянии между островами ×1,3 их
    // области не наезжают друг на друга (при 0,09 и ×1,6 наезжали 9 пар).
    const float IslPull = 0.35f;
    const float IslK = 40;
    const float IslGap = 1.3f;
    const float IslGap3 = 1.6f;

    // Перекрытие островов: сумма наездов областей друг на друга (в долях
    // среднего радиуса) — для проверки раскладки.
    public string IslandStats()
    {
        var m = M;
        if (m < 2) return "острова выключены";
        var gs = _arr.Where(n => n.Placed[m]).GroupBy(n => n.R.Folder).Select(g =>
        {
            var pts = g.Select(n => n.P[m]).ToList();
            var c = pts.Aggregate(Vector3.Zero, (a, b) => a + b) / pts.Count;
            var ds = pts.Select(p => Vector3.Distance(p, c)).OrderBy(x => x).ToList();
            return (g.Key, c, r: ds[(int)(ds.Count * 0.95f)] + 26);
        }).ToList();
        int pairs = 0; float over = 0;
        for (var i = 0; i < gs.Count; i++)
            for (var j = i + 1; j < gs.Count; j++)
            {
                var d = Vector3.Distance(gs[i].c, gs[j].c);
                var o = gs[i].r + gs[j].r - d;
                if (o > 0) { pairs++; over += o / ((gs[i].r + gs[j].r) / 2); }
            }
        return $"островов {gs.Count}, наезжают пар {pairs}, сумма наездов {over:0.00}";
    }

    Vector3 IslandOf(Node n, int m) => (m == 3 ? _island3 : _island).TryGetValue(n.R.Folder, out var c) ? c : Vector3.Zero;

    public bool Islands => _islands;

    public void SetIslands(bool on)
    {
        if (on == _islands) return;
        FinishMoves();
        _live = 0;
        var firstTime = !_arr.Any(n => n.Placed[Index(_3d, on)]);
        _islands = on;
        if (on) UpdateIslands();
        Place();
        FitAll(animate: !firstTime);
        _c.Invalidate();
    }

    // --- связи по видам ------------------------------------------------------------
    //
    // Вид связи — свой цвет (словарь из 12 видов, tools/knowledge/structure_review.py);
    // неизвестный вид — серый. Скрытые виды не рисуются. У рёбер выбранного
    // узла — подпись вида посередине.
    public HashSet<string> HiddenEdgeTypes { get; set; } = new();

    public static readonly (string Type, Color Color)[] EdgeTypes =
    {
        ("опирается на", Color.FromArgb(255, 0x6E, 0xA8, 0xE6)),
        ("реализует", Color.FromArgb(255, 0x5D, 0xC2, 0x7A)),
        ("реализовано в", Color.FromArgb(255, 0x3F, 0x9E, 0x8E)),
        ("влияет на", Color.FromArgb(255, 0xF2, 0x8E, 0x4A)),
        ("использует", Color.FromArgb(255, 0xA7, 0x8B, 0xE0)),
        ("уточняет", Color.FromArgb(255, 0xE6, 0xC4, 0x5A)),
        ("заменяет", Color.FromArgb(255, 0xE0, 0x62, 0x5A)),
        ("часть", Color.FromArgb(255, 0x8F, 0xB8, 0xC9)),
        ("содержит", Color.FromArgb(255, 0x7E, 0xC8, 0xE3)),
        ("проверяет", Color.FromArgb(255, 0xD9, 0x7B, 0xC4)),
        ("проверяется", Color.FromArgb(255, 0xB0, 0x6F, 0xA3)),
        ("относится к", Color.FromArgb(255, 0x9A, 0xA8, 0xB8)),
    };

    public static Color EdgeTypeColor(string type)
    {
        if (type.StartsWith("якорь раздела")) return Color.FromArgb(255, 0xFF, 0xD1, 0x66);
        foreach (var (t, c) in EdgeTypes) if (t == type) return c;
        return Color.FromArgb(255, 170, 185, 200);
    }

    // --- окрестность узла --------------------------------------------------------------
    //
    // Режим «Окрестность»: только выбранная запись и соседи на 1–3 шага,
    // кольцами вокруг неё (эго-сеть, радиальная раскладка); остальной граф
    // убран. Места колец считаются заново, свои места узлов не трогаются.
    public int EgoHops { get; private set; }
    Dictionary<Node, (Vector3 Pos, int Level)>? _ego;

    public void SetEgo(int hops)
    {
        EgoHops = hops;
        BuildEgo();
        if (_ego != null) FitEgo();
        _c.Invalidate();
    }

    bool EgoOn => _ego != null;

    void BuildEgo()
    {
        _ego = null;
        if (EgoHops <= 0 || Selected == null || !_nodes.TryGetValue(Selected, out var c)) return;
        var level = new Dictionary<Node, int> { [c] = 0 };
        var wave = new List<Node> { c };
        for (var i = 1; i <= EgoHops; i++)
        {
            wave = wave.SelectMany(x => _adj[x]).Where(x => !level.ContainsKey(x)).Distinct().ToList();
            foreach (var x in wave) level[x] = i;
            if (level.Count > 400) break;
        }
        var ego = new Dictionary<Node, (Vector3, int)> { [c] = (Vector3.Zero, 0) };
        foreach (var g in level.Where(kv => kv.Value > 0).GroupBy(kv => kv.Value))
        {
            var ring = g.Select(kv => kv.Key).OrderBy(n => n.R.Folder).ThenBy(n => n.R.Title).ToList();
            if (_3d)
            {
                // В объёме шаг — сфера: узлы ровно по её поверхности (точки
                // Фибоначчи), сфера тем больше, чем больше на ней узлов.
                var rs = Math.Max(170f * g.Key, MathF.Sqrt(ring.Count) * 30f);
                for (var i = 0; i < ring.Count; i++)
                {
                    var y = ring.Count == 1 ? 0 : 1 - 2f * (i + 0.5f) / ring.Count;
                    var rr = MathF.Sqrt(Math.Max(0, 1 - y * y));
                    var th = i * MathF.PI * (3 - MathF.Sqrt(5));
                    ego[ring[i]] = (new Vector3(MathF.Cos(th) * rr, y, MathF.Sin(th) * rr) * rs, g.Key);
                }
                continue;
            }
            // Кольцо тем шире, чем больше на нём узлов: подписи не должны слипаться.
            var r = Math.Max(170f * g.Key, ring.Count * 26f / (2 * MathF.PI));
            for (var i = 0; i < ring.Count; i++)
            {
                var ang = (float)(2 * Math.PI * i / ring.Count - Math.PI / 2);
                ego[ring[i]] = (new Vector3(MathF.Cos(ang) * r, MathF.Sin(ang) * r, 0), g.Key);
            }
        }
        _ego = ego;
    }

    void FitEgo()
    {
        if (_ego == null) return;
        var r = _ego.Values.Max(v => v.Pos.Length()) + 120;
        if (_3d)
        {
            AnimateCamera(Now with { T = Vector3.Zero, Dist = Math.Clamp(r / MathF.Sin(Fov / 2), 200, 100000) });
            return;
        }
        var z = Math.Clamp(Math.Min(W, H) / (2 * r), 0.1f, 2.5f);
        if (float.IsNaN(z) || W < 1) z = 0.6f;
        AnimateCamera(Now with { Zoom = z, Off = Vector2.Zero });
    }

    // Камера 2D: сдвиг и масштаб. Камера 3D: точка, вокруг которой
    // вращаемся, расстояние до неё и углы.
    Vector2 _offset;
    float _zoom = 1;
    Vector3 _target;
    float _dist = 900, _yaw = 0.6f, _pitch = 0.35f;
    const float Fov = 0.9f;
    Matrix4x4 _vp;
    Vector3 _right, _up, _fwd;

    Node? _press, _drag, _hover;
    Vector2 _last, _pressAt;
    bool _panning, _orbiting, _moved;
    bool _rightBtn;
    HashSet<string> _near = new(), _hoverNear = new();

    public string? Selected { get; private set; }
    public HashSet<string> Highlight { get; set; } = new();

    // Кто прошёл фильтры (null — фильтры не заданы). Отсеянные не прячутся, а
    // становятся тёмными и прозрачными, как не-соседи после выбора (задача
    // пользователя 28.09.2026; практика «приглушать, а не скрывать»): граф не
    // перекладывается и связи отсеянных видны.
    public HashSet<string>? Passing { get; set; }
    bool Out(Node n) => Passing != null && !Passing.Contains(n.R.Id);

    // Своя раскраска узлов (null — по виду записи): например, по дате
    // изменения — свежие ярче (MainWindow, «Цвет узла — по дате изменения»).
    public Func<Record, Color?>? NodeColor { get; set; }
    public event Action<string?>? NodeClicked;
    public event Action<string?>? NodeHovered;

    string? _layoutPath;
    Dictionary<string, Spot> _saved = new();

    public GraphView()
    {
        var host = new Grid();
        host.Children.Add(_c);
        Content = host;
        IsTabStop = true;
        UseSystemFocusVisuals = false;
        _c.Draw += Draw;
        _c.PointerPressed += Pressed;
        _c.PointerMoved += Moved;
        _c.PointerReleased += Released;
        _c.PointerCanceled += (_, _) => EndPress();
        _c.PointerWheelChanged += Wheel;
        _c.DoubleTapped += (_, e) =>
        {
            if (Hit(e.GetPosition(_c).ToVector2()) is { } n) FocusNode(n, closer: true);
        };
        KeyDown += OnKeyDown;
        KeyUp += (_, e) => { _keys.Remove(e.Key); };
        LostFocus += (_, _) => _keys.Clear();
        Unloaded += (_, _) => { SaveLayout(); StopLoop(); };
    }

    // --- данные -------------------------------------------------------------

    // Файл мест узлов — свой у каждого проекта. Вызывается до SetData.
    public void UseLayout(string path)
    {
        _layoutPath = path;
        _nodes.Clear();
        _moves.Clear();
        try { _saved = JsonSerializer.Deserialize<Dictionary<string, Spot>>(File.ReadAllText(path)) ?? new(); }
        catch (Exception) { _saved = new(); }
    }

    public void SaveLayout()
    {
        if (_layoutPath == null) return;
        foreach (var n in _nodes.Values) Remember(n);
        try
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(_layoutPath)!);
            File.WriteAllText(_layoutPath, JsonSerializer.Serialize(_saved));
        }
        catch (Exception) { }
    }

    void Remember(Node n)
    {
        var s = new Spot();
        if (n.Placed[0]) { var p = Final(n, 0); s.F = new[] { p.X, p.Y }; }
        if (n.Placed[1]) { var p = Final(n, 1); s.D = new[] { p.X, p.Y, p.Z }; }
        if (n.Placed[2]) { var p = Final(n, 2); s.I = new[] { p.X, p.Y, IslandsVersion }; }
        if (n.Placed[3]) { var p = Final(n, 3); s.J = new[] { p.X, p.Y, p.Z, IslandsVersion }; }
        _saved[n.R.Id] = s;
    }

    public void SetData(IEnumerable<Record> records, IEnumerable<(string From, string To, string Type)> links)
    {
        var keep = records.ToDictionary(r => r.Id);
        foreach (var id in _nodes.Keys.Where(k => !keep.ContainsKey(k)).ToList())
        {
            Remember(_nodes[id]);
            _moves.Remove(_nodes[id]);
            _nodes.Remove(id);
        }
        foreach (var r in keep.Values)
        {
            if (_nodes.TryGetValue(r.Id, out var n)) { n.R = r; continue; }
            n = new Node { R = r };
            if (_saved.TryGetValue(r.Id, out var s))
            {
                if (s.F is { Length: 2 }) { n.P[0] = new Vector3(s.F[0], s.F[1], 0); n.Placed[0] = true; }
                if (s.D is { Length: 3 }) { n.P[1] = new Vector3(s.D[0], s.D[1], s.D[2]); n.Placed[1] = true; }
                if (s.I is { Length: 3 } && s.I[2] == IslandsVersion) { n.P[2] = new Vector3(s.I[0], s.I[1], 0); n.Placed[2] = true; }
                if (s.J is { Length: 4 } && s.J[3] == IslandsVersion) { n.P[3] = new Vector3(s.J[0], s.J[1], s.J[2]); n.Placed[3] = true; }
                n.Pinned = false;
            }
            _nodes[r.Id] = n;
        }
        _arr = _nodes.Values.ToArray();
        _edges = links.Where(l => _nodes.ContainsKey(l.From) && _nodes.ContainsKey(l.To) && l.From != l.To)
            .Select(l => (_nodes[l.From], _nodes[l.To], l.Type)).ToList();
        _adj = _arr.ToDictionary(n => n, _ => new List<Node>());
        foreach (var n in _arr) n.Deg = 0;
        foreach (var (a, b, _) in _edges) { a.Deg++; b.Deg++; _adj[a].Add(b); _adj[b].Add(a); }
        if (_hover != null && !_nodes.ContainsKey(_hover.R.Id)) _hover = null;
        UpdateNear();
        if (_islands) UpdateIslands();
        Place();
        if (EgoHops > 0) BuildEgo();
        _c.Invalidate();
    }

    // Ставит узлы, у которых в текущем виде ещё нет места.
    void Place()
    {
        var m = M;
        var fresh = _arr.Where(n => !n.Placed[m]).ToList();
        if (fresh.Count == 0) return;
        var rnd = new Random(7);
        var first = fresh.Count == _arr.Length;
        foreach (var n in fresh)
        {
            var nb = _adj[n].Where(x => x.Placed[m]).ToList();
            n.P[m] = nb.Count > 0
                ? nb.Aggregate(Vector3.Zero, (s, x) => s + x.P[m]) / nb.Count + Jitter(rnd, 20)
                : m >= 2 ? IslandOf(n, m) + Jitter(rnd, 60) : Jitter(rnd, 400);
        }
        foreach (var n in fresh) n.Placed[m] = true;
        if (first)
        {
            Solve(null);
            FitAll(animate: false);
        }
        else
        {
            var from = fresh.ToDictionary(n => n, n => n.P[m]);
            Solve(fresh.ToHashSet());
            foreach (var n in fresh) { _moves[n] = (from[n], n.P[m]); n.P[m] = from[n]; }
            StartMoves(420, EaseOut);
        }
        SaveLayout();
    }

    Vector3 Jitter(Random r, float s) =>
        new(r.NextSingle() * 2 * s - s, r.NextSingle() * 2 * s - s, _3d ? r.NextSingle() * 2 * s - s : 0);

    HashSet<Node> Hops(Node n, int hops)
    {
        var set = new HashSet<Node> { n };
        var wave = new List<Node> { n };
        for (var i = 0; i < hops; i++)
        {
            wave = wave.SelectMany(x => _adj[x]).Where(set.Add).ToList();
            if (set.Count > 160) break;
        }
        return set;
    }

    // --- раскладка ----------------------------------------------------------
    //
    // Силовая: отталкивание всех со всеми (узлов сотни — это дёшево),
    // пружины по связям, слабое притяжение к центру. Solve считает до
    // показа; movable — кого двигать (null — всех), прочие неподвижны, но
    // соседей держат.

    void Solve(HashSet<Node>? movable)
    {
        foreach (var n in _arr) n.V = Vector3.Zero;
        var alpha = 1f;
        for (var it = 0; it < 700 && alpha > 0.003f; it++)
        {
            if (Iterate(alpha, movable) < 0.02f && it > 30) break;
            alpha *= 0.985f;
        }
        foreach (var n in _arr) n.V = Vector3.Zero;
    }

    float Iterate(float alpha, HashSet<Node>? movable)
    {
        var m = M;
        var ns = _arr;
        for (var i = 0; i < ns.Length; i++)
        {
            var a = ns[i];
            for (var j = i + 1; j < ns.Length; j++)
            {
                var b = ns[j];
                var d = a.P[m] - b.P[m];
                var l2 = d.LengthSquared() + 0.01f;
                if (l2 > 250000) continue;
                var f = d * (900f / l2) * alpha;
                a.V += f;
                b.V -= f;
            }
        }
        foreach (var (a, b, _) in _edges)
        {
            var d = b.P[m] - a.P[m];
            var len = d.Length() + 0.01f;
            // На островах связь между разными видами тянет слабо — иначе
            // острова слипаются в тот же клубок.
            var k = m >= 2 && a.R.Folder != b.R.Folder ? 0.004f : 0.06f;
            var f = d / len * (len - 60) * k * alpha;
            a.V += f;
            b.V -= f;
        }
        var max = 0f;
        foreach (var n in ns)
        {
            // Свободная раскладка тянет к общему центру, острова — к центру
            // своего острова.
            if (m >= 2) n.V += (IslandOf(n, m) - n.P[m]) * IslPull * alpha;
            else n.V -= n.P[m] * 0.004f * alpha;
            if (n.Pinned || n == _drag || (movable != null && !movable.Contains(n))) { n.V = Vector3.Zero; continue; }
            n.V *= 0.55f;
            if (m == 0 || m == 2) n.V.Z = 0;
            var sp = n.V.Length();
            if (sp > 30) { n.V *= 30 / sp; sp = 30; }
            n.P[m] += n.V;
            max = Math.Max(max, sp);
        }
        return max;
    }

    // Разложить заново: все узлы вида, открепляя закреплённые.
    public void Relayout()
    {
        FinishMoves();
        var m = M;
        var rnd = new Random();
        var from = _arr.ToDictionary(n => n, n => n.P[m]);
        foreach (var n in _arr) { n.Pinned = false; n.P[m] = m >= 2 ? IslandOf(n, m) + Jitter(rnd, 80) : Jitter(rnd, 400); }
        Solve(null);
        foreach (var n in _arr) { _moves[n] = (from[n], n.P[m]); n.P[m] = from[n]; }
        StartMoves(700, EaseInOut);
        FitAll();
    }

    // Распутать вокруг узла: соседей в двух шагах разложить заново при
    // неподвижном остальном графе.
    void Untangle(Node c)
    {
        FinishMoves();
        var m = M;
        var set = Hops(c, 2);
        set.Remove(c);
        foreach (var n in set) n.Pinned = false;
        var from = set.ToDictionary(n => n, n => n.P[m]);
        var rnd = new Random();
        foreach (var n in set) n.P[m] = c.P[m] + Jitter(rnd, 60);
        Solve(set);
        foreach (var n in set) { _moves[n] = (from[n], n.P[m]); n.P[m] = from[n]; }
        StartMoves(520, EaseInOut);
    }

    // --- переходы -----------------------------------------------------------
    //
    // Длительности и кривые — по Material Motion: камера — «стандартная»
    // кривая (разгон и торможение), 250–650 мс по расстоянию; появляющиеся
    // узлы — торможение (ease-out), около 400 мс. Прямое действие мышью и
    // клавишами — без задержки и сразу прерывает переход камеры. Если в
    // Windows выключены анимации — переходов нет, всё сразу на месте.

    static readonly bool Motion = new Windows.UI.ViewManagement.UISettings().AnimationsEnabled;
    readonly Dictionary<Node, (Vector3 From, Vector3 To)> _moves = new();
    readonly System.Diagnostics.Stopwatch _moveClock = new(), _camClock = new(), _frameClock = new();
    double _moveMs;
    Func<float, float> _moveEase = EaseOut;
    bool _looping;
    float _live;
    HashSet<Node>? _liveSet;
    readonly HashSet<VirtualKey> _keys = new();

    record struct Cam(Vector2 Off, float Zoom, Vector3 T, float Dist, float Yaw, float Pitch);
    (Cam From, Cam To, double Ms)? _cam;

    static float EaseOut(float t) => 1 - MathF.Pow(1 - t, 3);
    static float EaseInOut(float t) => t < 0.5f ? 4 * t * t * t : 1 - MathF.Pow(-2 * t + 2, 3) / 2;

    Vector3 Final(Node n, int m) => m == M && _moves.TryGetValue(n, out var mv) ? mv.To : n.P[m];

    void StartMoves(double ms, Func<float, float> ease)
    {
        if (!Motion) { FinishMoves(); return; }
        _moveMs = ms;
        _moveEase = ease;
        _moveClock.Restart();
        StartLoop();
    }

    void FinishMoves()
    {
        if (_moves.Count == 0) return;
        foreach (var (n, mv) in _moves) n.P[M] = mv.To;
        _moves.Clear();
        SaveLayout();
        _c.Invalidate();
    }

    Cam Now => new(_offset, _zoom, _target, _dist, _yaw, _pitch);

    void Apply(Cam c) { _offset = c.Off; _zoom = c.Zoom; _target = c.T; _dist = c.Dist; _yaw = c.Yaw; _pitch = c.Pitch; }

    void AnimateCamera(Cam to)
    {
        var from = Now;
        float size;
        if (_3d) size = Vector3.Distance(from.T, to.T) * PxPerUnit(_dist) + MathF.Abs(MathF.Log(to.Dist / from.Dist)) * 400 + MathF.Abs(to.Yaw - from.Yaw) * 200;
        else size = Vector2.Distance(from.Off, to.Off) + MathF.Abs(MathF.Log(to.Zoom / from.Zoom)) * 400;
        if (!Motion || size < 2) { Apply(to); _cam = null; _c.Invalidate(); return; }
        _cam = (from, to, Math.Clamp(250 + size * 0.25, 250, 650));
        _camClock.Restart();
        StartLoop();
    }

    void StartLoop()
    {
        if (_looping) return;
        _looping = true;
        _frameClock.Restart();
        Microsoft.UI.Xaml.Media.CompositionTarget.Rendering += OnFrame;
    }

    void StopLoop()
    {
        if (!_looping) return;
        _looping = false;
        Microsoft.UI.Xaml.Media.CompositionTarget.Rendering -= OnFrame;
    }

    void OnFrame(object? s, object e)
    {
        var dt = (float)Math.Min(0.05, _frameClock.Elapsed.TotalSeconds);
        _frameClock.Restart();
        if (_moves.Count > 0)
        {
            var t = (float)Math.Min(1, _moveClock.Elapsed.TotalMilliseconds / _moveMs);
            var k = _moveEase(t);
            foreach (var (n, mv) in _moves) n.P[M] = Vector3.Lerp(mv.From, mv.To, k);
            if (t >= 1) { _moves.Clear(); SaveLayout(); }
        }
        if (_cam is { } c)
        {
            var t = (float)Math.Min(1, _camClock.Elapsed.TotalMilliseconds / c.Ms);
            var k = EaseInOut(t);
            // Масштаб и расстояние — по логарифму: так приближение ровное.
            Apply(new Cam(
                Vector2.Lerp(c.From.Off, c.To.Off, k),
                MathF.Exp(float.Lerp(MathF.Log(c.From.Zoom), MathF.Log(c.To.Zoom), k)),
                Vector3.Lerp(c.From.T, c.To.T, k),
                MathF.Exp(float.Lerp(MathF.Log(c.From.Dist), MathF.Log(c.To.Dist), k)),
                float.Lerp(c.From.Yaw, c.To.Yaw, k),
                float.Lerp(c.From.Pitch, c.To.Pitch, k)));
            if (t >= 1) _cam = null;
        }
        if (_live > 0)
        {
            var mv = Iterate(_live, _liveSet);
            if (_drag == null)
            {
                _live *= 0.92f;
                if (_live < 0.01f || mv < 0.03f) { _live = 0; _liveSet = null; SaveLayout(); }
            }
        }
        if (_keys.Count > 0) Fly(dt);
        _c.Invalidate();
        if (_moves.Count == 0 && _cam == null && _live == 0 && _keys.Count == 0 && _drag == null) StopLoop();
    }

    // --- камера -------------------------------------------------------------

    float W => (float)_c.ActualWidth;
    float H => (float)_c.ActualHeight;
    Vector2 Center => new(W / 2, H / 2);

    // Пикселей экрана на единицу мира на данной глубине (3D).
    float PxPerUnit(float depth) => H / (2 * MathF.Tan(Fov / 2) * Math.Max(depth, 1));

    void Camera3()
    {
        var dir = new Vector3(MathF.Cos(_pitch) * MathF.Sin(_yaw), MathF.Sin(_pitch), MathF.Cos(_pitch) * MathF.Cos(_yaw));
        var eye = _target + dir * _dist;
        _fwd = Vector3.Normalize(_target - eye);
        _right = Vector3.Normalize(Vector3.Cross(_fwd, Vector3.UnitY));
        _up = Vector3.Cross(_right, _fwd);
        var view = Matrix4x4.CreateLookAt(eye, _target, Vector3.UnitY);
        var proj = Matrix4x4.CreatePerspectiveFieldOfView(Fov, Math.Max(W, 1) / Math.Max(H, 1), 1f, 200000f);
        _vp = view * proj;
    }

    bool Project(Vector3 p, out Vector2 s, out float depth)
    {
        var c = Vector4.Transform(new Vector4(p, 1), _vp);
        depth = c.W;
        s = default;
        if (c.W < 5) return false;
        s = new Vector2((c.X / c.W * 0.5f + 0.5f) * W, (0.5f - c.Y / c.W * 0.5f) * H);
        return true;
    }

    Vector2 ToScreen2(Vector3 w) => new Vector2(w.X, w.Y) * _zoom + _offset + Center;
    Vector2 ToWorld2(Vector2 s) => (s - _offset - Center) / _zoom;

    // Сдвиг экрана на d пикселей — сдвиг в мире на глубине depth (3D).
    Vector3 ScreenDelta3(Vector2 d, float depth) => (_right * d.X - _up * d.Y) / PxPerUnit(depth);

    public void FitAll(bool animate = true)
    {
        if (EgoOn) { FitEgo(); return; }
        if (_arr.Length == 0) return;
        var m = M;
        var min = new Vector3(float.MaxValue);
        var max = new Vector3(float.MinValue);
        foreach (var n in _arr) { var p = Final(n, m); min = Vector3.Min(min, p); max = Vector3.Max(max, p); }
        var to = Now;
        if (_3d)
        {
            var c = (min + max) / 2;
            // По 92-й доли расстояний: одиночные дальние узлы не мельчат весь граф.
            var ds = _arr.Select(n => Vector3.Distance(Final(n, m), c)).OrderBy(x => x).ToList();
            var r = ds[(int)(ds.Count * 0.92f)] + 40;
            to = to with { T = c, Dist = Math.Clamp(r / MathF.Sin(Fov / 2) * 1.05f, 50, 100000) };
        }
        else
        {
            var size = new Vector2(max.X - min.X, max.Y - min.Y) + new Vector2(80);
            var z = Math.Clamp(Math.Min(W / size.X, H / size.Y), 0.05f, 3f);
            if (float.IsNaN(z) || W < 1) z = 0.5f;
            to = to with { Zoom = z, Off = -new Vector2(min.X + max.X, min.Y + max.Y) / 2 * z };
        }
        if (animate) AnimateCamera(to); else { Apply(to); _c.Invalidate(); }
    }

    void FocusNode(Node n, bool closer)
    {
        var p = Final(n, M);
        if (_3d) AnimateCamera(Now with { T = p, Dist = closer ? Math.Min(_dist, 260) : _dist });
        else
        {
            var z = closer ? Math.Max(_zoom, 2.2f) : Math.Max(_zoom, 1.4f);
            AnimateCamera(Now with { Zoom = z, Off = -new Vector2(p.X, p.Y) * z });
        }
    }

    public void Focus(string id, float zoom)
    {
        if (_nodes.TryGetValue(id, out var n)) FocusNode(n, zoom > 2);
    }

    public void Select(string? id, bool center = false)
    {
        Selected = id;
        UpdateNear();
        if (EgoHops > 0)
        {
            BuildEgo();
            if (_ego != null) { FitEgo(); _c.Invalidate(); return; }
        }
        if (center && id != null && _nodes.TryGetValue(id, out var n)) FocusNode(n, closer: false);
        _c.Invalidate();
    }

    // Переключение 2D/3D. Узлы, у которых в новом виде нет места,
    // рассчитываются; камера — на весь граф, если вид открыт впервые.
    public void Set3D(bool on)
    {
        if (on == _3d) return;
        FinishMoves();
        _live = 0;
        var firstTime = !_arr.Any(n => n.Placed[Index(on, _islands)]);
        _3d = on;
        Place();
        if (EgoHops > 0) { BuildEgo(); if (_ego != null) FitEgo(); }
        if (firstTime && _arr.Length > 0 && _arr.All(n => n.Placed[M])) FitAll(animate: false);
        _c.Invalidate();
    }

    public bool Is3D => _3d;

    void Fly(float dt)
    {
        _cam = null;
        var fast = _keys.Contains(VirtualKey.Shift) ? 3f : 1f;
        bool K(VirtualKey a, VirtualKey b) => _keys.Contains(a) || _keys.Contains(b);
        if (_3d)
        {
            var sp = Math.Max(_dist, 150) * 0.9f * fast * dt;
            var mv = Vector3.Zero;
            if (K(VirtualKey.W, VirtualKey.Up)) mv += _fwd;
            if (K(VirtualKey.S, VirtualKey.Down)) mv -= _fwd;
            if (K(VirtualKey.D, VirtualKey.Right)) mv += _right;
            if (K(VirtualKey.A, VirtualKey.Left)) mv -= _right;
            if (_keys.Contains(VirtualKey.E)) mv += Vector3.UnitY;
            if (_keys.Contains(VirtualKey.Q)) mv -= Vector3.UnitY;
            _target += mv * sp;
        }
        else
        {
            var sp = 700 * fast * dt;
            var mv = Vector2.Zero;
            if (K(VirtualKey.W, VirtualKey.Up)) mv.Y += 1;
            if (K(VirtualKey.S, VirtualKey.Down)) mv.Y -= 1;
            if (K(VirtualKey.D, VirtualKey.Right)) mv.X -= 1;
            if (K(VirtualKey.A, VirtualKey.Left)) mv.X += 1;
            _offset += mv * sp;
            if (_keys.Contains(VirtualKey.E)) _zoom = Math.Min(6, _zoom * (1 + dt * 1.5f));
            if (_keys.Contains(VirtualKey.Q)) _zoom = Math.Max(0.05f, _zoom / (1 + dt * 1.5f));
        }
    }

    static readonly HashSet<VirtualKey> FlyKeys = new()
    {
        VirtualKey.W, VirtualKey.A, VirtualKey.S, VirtualKey.D, VirtualKey.Q, VirtualKey.E,
        VirtualKey.Up, VirtualKey.Down, VirtualKey.Left, VirtualKey.Right,
    };

    void OnKeyDown(object s, KeyRoutedEventArgs e)
    {
        var ctrl = InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Control).HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down);
        if (ctrl) return;
        if (e.Key == VirtualKey.Shift) { _keys.Add(e.Key); return; }
        if (FlyKeys.Contains(e.Key)) { _keys.Add(e.Key); StartLoop(); e.Handled = true; return; }
        if (e.Key == VirtualKey.Home) { FitAll(); e.Handled = true; }
        if (e.Key == VirtualKey.F && Selected != null && _nodes.TryGetValue(Selected, out var n)) { FocusNode(n, closer: true); e.Handled = true; }
    }

    // --- попадание мышью ----------------------------------------------------

    Node? Hit(Vector2 s)
    {
        Node? best = null;
        var bd = float.MaxValue;
        foreach (var n in _arr)
        {
            if (!n.On) continue;
            var d = Vector2.Distance(n.S, s);
            if (d > n.Rpx + 4) continue;
            // В 3D при перекрытии — ближний к глазу.
            var score = _3d ? n.Depth : d;
            if (score < bd) { bd = score; best = n; }
        }
        return best;
    }

    public bool Has(string id) => _nodes.ContainsKey(id);
    public int NodeCount => _nodes.Count;
    public IEnumerable<string> EdgeTypesPresent => _edges.Select(e => e.Type);
    public int EgoCount => _ego?.Count ?? 0;
    public int EdgeCount => _edges.Count;
    public void Redraw() => _c.Invalidate();

    // Для проверки движения: места узлов, идёт ли анимация, число кадров.
    // Снимок экрана движения не покажет — нужны цифры.
    public Dictionary<string, Vector3> Positions() => _nodes.ToDictionary(k => k.Key, v => v.Value.P[M]);
    public bool Animating => _looping;
    public int Frames { get; private set; }

    void UpdateNear()
    {
        _near = new HashSet<string>();
        if (Selected == null || !_nodes.TryGetValue(Selected, out var n)) return;
        _near.Add(Selected);
        foreach (var x in _adj[n]) _near.Add(x.R.Id);
    }

    // --- мышь -------------------------------------------------------------

    void Pressed(object s, PointerRoutedEventArgs e)
    {
        Focus(FocusState.Pointer);
        var pt = e.GetCurrentPoint(_c);
        _last = _pressAt = pt.Position.ToVector2();
        _moved = false;
        _cam = null;
        _c.CapturePointer(e.Pointer);
        var shift = e.KeyModifiers.HasFlag(VirtualKeyModifiers.Shift);
        var left = pt.Properties.IsLeftButtonPressed;
        _rightBtn = pt.Properties.IsRightButtonPressed;
        _press = Hit(_last);
        // В окрестности места узлов считаются кольцами — тянуть их незачем.
        if (EgoOn && left) _press = null;
        if (left && _press != null) { _panning = _orbiting = false; return; }
        _press = _rightBtn ? _press : null;
        _orbiting = _3d && left && !shift;
        _panning = !_orbiting;
    }

    void Moved(object s, PointerRoutedEventArgs e)
    {
        var p = e.GetCurrentPoint(_c).Position.ToVector2();
        var pressed = _press != null || _panning || _orbiting;
        if (pressed)
        {
            var d = p - _last;
            _last = p;
            if (!_moved && Vector2.Distance(p, _pressAt) < 3) return;
            _moved = true;
            if (_press != null && !_rightBtn)
            {
                if (_drag == null) BeginPull(_press);
                var m = M;
                _drag!.P[m] += _3d ? ScreenDelta3(d, _drag.Depth) : new Vector3(d / _zoom, 0);
            }
            else if (_orbiting)
            {
                _yaw -= d.X * 0.006f;
                _pitch = Math.Clamp(_pitch + d.Y * 0.006f, -1.45f, 1.45f);
            }
            else if (_panning || _rightBtn)
            {
                if (_3d) _target -= ScreenDelta3(d, _dist);
                else _offset += d;
            }
            _c.Invalidate();
            return;
        }
        var h = Hit(p);
        if (h != _hover)
        {
            _hover = h;
            _hoverNear = h == null ? new() : _adj[h].Select(x => x.R.Id).Append(h.R.Id).ToHashSet();
            ProtectedCursor = InputSystemCursor.Create(h != null ? InputSystemCursorShape.Hand : InputSystemCursorShape.Arrow);
            NodeHovered?.Invoke(h?.R.Id);
            _c.Invalidate();
        }
    }

    void BeginPull(Node n)
    {
        FinishMoves();
        _drag = n;
        _liveSet = Hops(n, 2);
        _liveSet.Remove(n);
        _live = 0.3f;
        foreach (var x in _arr) x.V = Vector3.Zero;
        StartLoop();
    }

    void Released(object s, PointerRoutedEventArgs e)
    {
        var p = e.GetCurrentPoint(_c).Position.ToVector2();
        if (!_moved)
        {
            var n = Hit(p);
            if (_rightBtn) { if (n != null) ShowMenu(n, p); }
            else NodeClicked?.Invoke(n?.R.Id);
        }
        _c.ReleasePointerCapture(e.Pointer);
        EndPress();
    }

    void EndPress()
    {
        if (_drag != null) { _drag.Pinned = true; _drag = null; }
        _press = null;
        _panning = _orbiting = _rightBtn = false;
    }

    void Wheel(object s, PointerRoutedEventArgs e)
    {
        _cam = null;
        var pt = e.GetCurrentPoint(_c);
        var at = pt.Position.ToVector2();
        var inward = pt.Properties.MouseWheelDelta > 0;
        if (_3d)
        {
            // Ближе к точке под курсором, а не к центру экрана.
            var f = inward ? 1 / 1.15f : 1.15f;
            var under = _target + ScreenDelta3(at - Center, _dist);
            _target = under + (_target - under) * f;
            _dist = Math.Clamp(_dist * f, 20, 100000);
        }
        else
        {
            var w = ToWorld2(at);
            _zoom = Math.Clamp(_zoom * (inward ? 1.15f : 1 / 1.15f), 0.05f, 6f);
            _offset = at - Center - w * _zoom;
        }
        _c.Invalidate();
        e.Handled = true;
    }

    void ShowMenu(Node n, Vector2 at)
    {
        var menu = new MenuFlyout();
        MenuFlyoutItem Item(string text, string glyph, Action act)
        {
            var i = new MenuFlyoutItem { Text = text, Icon = new FontIcon { Glyph = glyph } };
            i.Click += (_, _) => act();
            menu.Items.Add(i);
            return i;
        }
        Item("Открыть запись", "", () => NodeClicked?.Invoke(n.R.Id));
        Item("Показать ближе (F)", "", () => FocusNode(n, closer: true));
        menu.Items.Add(new MenuFlyoutSeparator());
        Item("Распутать вокруг", "", () => Untangle(n));
        if (n.Pinned) Item("Открепить", "", () => { n.Pinned = false; _c.Invalidate(); SaveLayout(); });
        else Item("Закрепить на месте", "", () => { n.Pinned = true; _c.Invalidate(); });
        if (_arr.Any(x => x.Pinned))
            Item("Открепить все", "", () => { foreach (var x in _arr) x.Pinned = false; _c.Invalidate(); });
        menu.ShowAt(_c, new FlyoutShowOptions { Position = new Windows.Foundation.Point(at.X, at.Y) });
    }

    // Для сценариев проверки: потянуть узел на d пикселей за steps кадров.
    public async Task PullTest(string id, Vector2 d, int steps)
    {
        if (!_nodes.TryGetValue(id, out var n)) return;
        BeginPull(n);
        for (var i = 0; i < steps; i++)
        {
            n.P[M] += _3d ? ScreenDelta3(d / steps, n.Depth) : new Vector3(d / steps / _zoom, 0);
            await Task.Delay(16);
        }
        EndPress();
    }

    public void Orbit(float dx, float dy)
    {
        _yaw -= dx * 0.006f;
        _pitch = Math.Clamp(_pitch + dy * 0.006f, -1.45f, 1.45f);
        _c.Invalidate();
    }

    // --- отрисовка ---------------------------------------------------------

    public static Color Parse(string hex) => Color.FromArgb(255,
        Convert.ToByte(hex.Substring(1, 2), 16), Convert.ToByte(hex.Substring(3, 2), 16), Convert.ToByte(hex.Substring(5, 2), 16));

    static readonly Color Bg = Color.FromArgb(255, 0x13, 0x1B, 0x24);
    static readonly Color EdgeCol = Color.FromArgb(70, 170, 185, 200);
    static readonly Color EdgeDim = Color.FromArgb(16, 170, 185, 200);
    static readonly Color EdgeOn = Color.FromArgb(230, 0xFF, 0xD1, 0x66);
    static readonly Color HoverEdge = Color.FromArgb(200, 0xB8, 0xD8, 0xF0);
    static readonly Color Label = Color.FromArgb(240, 0xE6, 0xEC, 0xF2);
    static readonly Color LabelBg = Color.FromArgb(175, 0x13, 0x1B, 0x24);
    static readonly Color Found = Color.FromArgb(255, 0x7F, 0xD1, 0xFF);

    readonly Dictionary<string, float> _textW = new();
    CanvasTextFormat? _fmt, _bold;

    float TextWidth(Microsoft.Graphics.Canvas.CanvasDrawingSession ds, string t, bool bold)
    {
        var key = (bold ? "b" : "n") + t;
        if (_textW.TryGetValue(key, out var w)) return w;
        using var layout = new CanvasTextLayout(ds, t, bold ? _bold : _fmt, 2000, 40);
        w = (float)layout.LayoutBounds.Width;
        if (_textW.Count > 5000) _textW.Clear();
        _textW[key] = w;
        return w;
    }

    // Глубина в 3D: чем дальше узел, тем прозрачнее (дымка) и меньше.
    float Fog(float depth)
    {
        if (!_3d) return 1;
        var t = Math.Clamp((depth - _dist * 0.6f) / (_dist * 2.2f), 0, 1);
        return 1 - t * 0.7f;
    }

    static Color A(Color c, float k) => Color.FromArgb((byte)Math.Clamp(c.A * k, 0, 255), c.R, c.G, c.B);

    void Draw(CanvasControl s, CanvasDrawEventArgs a)
    {
        Frames++;
        var ds = a.DrawingSession;
        ds.Clear(Bg);
        _fmt ??= new CanvasTextFormat { FontFamily = "Segoe UI", FontSize = 12, WordWrapping = CanvasWordWrapping.NoWrap };
        _bold ??= new CanvasTextFormat { FontFamily = "Segoe UI", FontSize = 13, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold, WordWrapping = CanvasWordWrapping.NoWrap };
        var m = M;
        if (_3d) Camera3();
        foreach (var n in _arr)
        {
            if (_3d)
            {
                var pos = n.P[m];
                var lvl = -1;
                if (EgoOn)
                {
                    if (!_ego!.TryGetValue(n, out var eg3)) { n.On = false; continue; }
                    pos = eg3.Pos;
                    lvl = eg3.Level;
                }
                n.On = Project(pos, out n.S, out n.Depth);
                n.Rpx = Math.Clamp((lvl == 0 ? 12 : n.Radius) * 1.8f * PxPerUnit(n.Depth), 2.2f, 80f);
            }
            else if (EgoOn)
            {
                n.On = _ego!.TryGetValue(n, out var eg);
                n.S = ToScreen2(eg.Pos);
                n.Depth = 0;
                n.Rpx = Math.Max(2.5f, (eg.Level == 0 ? 12 : n.Radius) * _zoom);
                if (!n.On) continue;
            }
            else
            {
                n.S = ToScreen2(n.P[m]);
                n.Depth = 0;
                n.Rpx = Math.Max(2.5f, n.Radius * _zoom);
                n.On = true;
            }
            if (n.S.X < -80 || n.S.Y < -80 || n.S.X > W + 80 || n.S.Y > H + 80) n.On = false;
        }

        // Что выделено: наведённый узел с соседями сильнее выбранного —
        // так видно окружение, не теряя выбор.
        var sel = Selected != null;
        var hoverFocus = _hover != null && _drag == null;
        // В окрестности вся картинка — уже контекст выбранного: второй и
        // третий шаг не приглушаются, приглушает только наведение.
        HashSet<string>? focus = hoverFocus ? _hoverNear : sel && !EgoOn ? _near : null;
        var hl = Highlight.Count > 0;

        // Острова: подложка области и подпись вида записи над ней.
        if (m >= 2 && !EgoOn)
        {
            foreach (var g in _arr.Where(n => n.On).GroupBy(n => n.R.Folder))
            {
                var pts = g.Select(n => n.S).ToList();
                var c = pts.Aggregate(Vector2.Zero, (s2, p) => s2 + p) / pts.Count;
                var ds2 = pts.Select(p => Vector2.Distance(p, c)).OrderBy(x => x).ToList();
                var r = ds2[(int)(ds2.Count * 0.95f)] + 26 * Math.Clamp(_zoom, 0.4f, 1.5f);
                var col = Parse(Schema.ColorOf(g.Key));
                ds.FillCircle(c, r, A(col, 0.07f));
                ds.DrawCircle(c, r, A(col, 0.28f), 1.2f);
                var title = $"{Schema.NameOf(g.Key)} · {g.Count()}";
                var tw = TextWidth(ds, title, true);
                var tp = c + new Vector2(-tw / 2, -r - 22);
                ds.FillRoundedRectangle(new Windows.Foundation.Rect(tp.X - 6, tp.Y - 1, tw + 12, 21), 4, 4, LabelBg);
                ds.DrawText(title, tp, A(col, 1f), _bold);
            }
        }

        // Окрестность: кольца шагов с подписью (в объёме шаги — сферы, их
        // видно по самим узлам).
        if (EgoOn && !_3d)
        {
            var levels = _ego!.Values.Where(v => v.Level > 0).GroupBy(v => v.Level);
            foreach (var g in levels)
            {
                var r = g.First().Pos.Length() * _zoom;
                ds.DrawCircle(ToScreen2(Vector3.Zero), r, Color.FromArgb(40, 170, 185, 200), 1f);
                ds.DrawText($"шаг {g.Key}", ToScreen2(Vector3.Zero) + new Vector2(6, -r - 16), Color.FromArgb(150, 170, 185, 200), _fmt);
            }
        }

        var edgeLabels = new List<Windows.Foundation.Rect>();
        foreach (var (na, nb, type) in _edges)
        {
            if (HiddenEdgeTypes.Contains(type)) continue;
            if (EgoOn && (!na.On || !nb.On)) continue;
            if (_3d && (na.Depth < 5 || nb.Depth < 5)) continue;
            var p1 = na.S;
            var p2 = nb.S;
            if (!na.On && !nb.On && !Crosses(p1, p2)) continue;
            var onSel = sel && (na.R.Id == Selected || nb.R.Id == Selected);
            var onHover = hoverFocus && (na == _hover || nb == _hover);
            // Цвет — по виду связи: у выбранного и наведённого — яркий, в
            // покое — приглушённый, у отсеянных и за фокусом — едва виден.
            var tc = EdgeTypeColor(type);
            var col = onSel ? A(tc, 0.95f) : onHover ? A(tc, 0.85f)
                : focus != null || hl || Out(na) || Out(nb) ? A(tc, 0.07f) : A(tc, 0.32f);
            col = A(col, Fog((na.Depth + nb.Depth) / 2));
            var strong = onSel || onHover;
            ds.DrawLine(p1, p2, col, strong ? 2.2f : 1f);
            // Подпись вида — у рёбер выбранного узла, посередине; подпись,
            // которая легла бы на уже поставленную, пропускается.
            if (onSel && Vector2.Distance(p1, p2) > 90)
            {
                var mid = (p1 + p2) / 2;
                var tw = TextWidth(ds, type, false);
                var rr = new Windows.Foundation.Rect(mid.X - tw / 2 - 4, mid.Y - 9, tw + 8, 17);
                if (edgeLabels.Any(x => Intersects(x, rr))) goto arrow;
                edgeLabels.Add(rr);
                ds.FillRoundedRectangle(rr, 3, 3, LabelBg);
                ds.DrawText(type, new Vector2(mid.X - tw / 2, mid.Y - 9), A(tc, 1f), _fmt);
            }
            arrow:
            var dir = p2 - p1;
            var len = dir.Length();
            if (len > 20 && (strong || (!_3d && _zoom > 0.6f) || (_3d && nb.Rpx > 5)))
            {
                dir /= len;
                var tip = p2 - dir * nb.Rpx;
                var side = new Vector2(-dir.Y, dir.X);
                var sz = strong ? 7f : 5f;
                using var g = CanvasGeometry.CreatePolygon(ds, new[] { tip, tip - dir * sz + side * sz * 0.5f, tip - dir * sz - side * sz * 0.5f });
                ds.FillGeometry(g, col);
            }
        }

        var order = _3d ? _arr.Where(n => n.On).OrderByDescending(n => n.Depth) : _arr.Where(n => n.On);
        var labels = new List<(Node N, int Prio)>();
        foreach (var n in order)
        {
            var col = (NodeColor?.Invoke(n.R)) ?? Parse(Schema.ColorOf(n.R.Folder));
            var dim = (focus != null && !focus.Contains(n.R.Id)) || (hl && !Highlight.Contains(n.R.Id)) || Out(n);
            var fog = Fog(n.Depth);
            col = A(col, (dim ? (_3d ? 0.3f : 0.22f) : 1f) * fog);
            var p = n.S;
            var r = n.Rpx;
            ds.FillCircle(p, r, col);
            // Блик — узел читается шаром, а не кружком.
            if (_3d && r > 3 && !dim) ds.FillCircle(p + new Vector2(-0.32f, -0.36f) * r, r * 0.42f, Color.FromArgb((byte)(70 * fog), 255, 255, 255));
            if (hl && Highlight.Contains(n.R.Id)) ds.DrawCircle(p, r + 3, A(Found, fog), 2);
            if (n.R.Id == Selected) ds.DrawCircle(p, r + 4, EdgeOn, 2.5f);
            if (n == _hover) ds.DrawCircle(p, r + 2, Colors.White, 1.5f);
            if (n.Pinned && r > 3) ds.FillCircle(p + new Vector2(r * 0.72f, -r * 0.72f), 2.4f, Color.FromArgb((byte)(220 * fog), 255, 255, 255));

            int prio;
            if (n.R.Id == Selected) prio = 1000;
            else if (n == _hover) prio = 900;
            else if (focus != null && focus.Contains(n.R.Id)) prio = 500 + n.Deg;
            else if (hl && Highlight.Contains(n.R.Id)) prio = 400 + n.Deg;
            else if (EgoOn) prio = 300 - (_ego![n].Level * 50) + n.Deg;
            else if (!dim && focus == null && (_3d ? r > 6.5f : _zoom > 1.1f)) prio = (int)(n.Deg + r);
            else continue;
            labels.Add((n, prio));
        }

        // Подписи без наложения: по важности; та, что легла бы на уже
        // поставленную, пропускается (выбранная и наведённая — всегда).
        var placed = new List<Windows.Foundation.Rect>();
        foreach (var (n, prio) in labels.OrderByDescending(x => x.Prio).Take(220))
        {
            var must = prio >= 900;
            var t = n.R.Title;
            if (t.Length > 60 && !must) t = t[..60] + "…";
            var bold = n.R.Id == Selected;
            var w = TextWidth(ds, t, bold);
            var pos = n.S + new Vector2(n.Rpx + 5, -10);
            // У правого края подпись — слева от узла, чтобы не обрезалась.
            if (pos.X + w > W - 6) pos.X = n.S.X - n.Rpx - 5 - w;
            var rect = new Windows.Foundation.Rect(pos.X - 3, pos.Y, w + 6, bold ? 20 : 18);
            if (!must && placed.Any(x => Intersects(x, rect))) continue;
            placed.Add(rect);
            ds.FillRoundedRectangle(rect, 3, 3, LabelBg);
            ds.DrawText(t, pos, A(Label, Fog(n.Depth)), bold ? _bold : _fmt);
        }
    }

    static bool Intersects(Windows.Foundation.Rect a, Windows.Foundation.Rect b) =>
        a.X < b.X + b.Width && b.X < a.X + a.Width && a.Y < b.Y + b.Height && b.Y < a.Y + a.Height;

    bool Crosses(Vector2 a, Vector2 b) =>
        Math.Max(a.X, b.X) >= 0 && Math.Min(a.X, b.X) <= W && Math.Max(a.Y, b.Y) >= 0 && Math.Min(a.Y, b.Y) <= H;
}
