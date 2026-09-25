using System.Globalization;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using Razmetka.Model;

namespace Razmetka.Editor;

// Полотно разворота. Координаты: «полотно» — единицы разворота (в них лежат
// слои), «экран» — пиксели элемента; экран = полотно × Zoom + Offset.
//
// Всё рисуется в OnRender одним проходом: слои снизу вверх, поверх — рамки
// выделения, ручки, направляющие прилипания. Ручки и направляющие рисуются в
// экранных координатах, чтобы не мельчать и не толстеть при масштабе.
//
// Жесты (практики редакторов-полотен, граф: decision:razmetka):
//   * щелчок — выбрать верхний видимый незакреплённый слой; Shift — добавить;
//   * перетаскивание слоя — перенос, углы — размер с сохранением пропорций;
//   * перетаскивание по пустому — обводка для выбора нескольких;
//   * колесо — масштаб у курсора, Shift+колесо — вбок; средняя кнопка или
//     пробел + перетаскивание — сдвиг полотна;
//   * двойной щелчок по фото — обрезка: видна вся картинка бледно, видимая
//     часть — ярко; ручки меняют видимую часть, перетаскивание внутри —
//     сдвигает картинку под рамкой. Enter или Esc — выход.
// Одно движение мыши — одна запись отмены (EditStarting / EditCommitted).
public sealed class SheetView : FrameworkElement
{
    public ProjectStore? Store { get; set; }
    public Sheet? Sheet { get; private set; }
    public double Zoom { get; private set; } = 0.5;
    public Vector Offset { get; private set; } = new(40, 40);
    public List<string> Selection { get; } = new();
    public string? CropLayerId { get; private set; }

    public event Action? EditStarting;
    public event Action<string>? EditCommitted;
    public event Action? SelectionChanged;
    public event Action? ViewChanged;

    const double HandleR = 5;
    const double SnapPx = 6;

    enum Op { None, Move, Resize, Band, Pan, CropHandle, CropPan }
    Op _op;
    Point _downScreen, _lastScreen;
    Point _downWorld;
    int _handle;
    bool _moved;
    Dictionary<string, (double X, double Y, double W, Box Crop)> _orig = new();
    Rect _band;
    readonly List<(bool Vertical, double At)> _guides = new();
    bool _spaceDown;

    static readonly Brush Paper = new SolidColorBrush(Color.FromRgb(0xE9, 0xED, 0xF1));
    static readonly Brush SheetBg = Brushes.White;
    static readonly Pen SelPen = new(new SolidColorBrush(Color.FromRgb(0x1F, 0x6F, 0xD1)), 1.5);
    static readonly Pen GuidePen = new(new SolidColorBrush(Color.FromRgb(0xE0, 0x3A, 0x8C)), 1);
    static readonly Pen HandlePen = new(new SolidColorBrush(Color.FromRgb(0x1F, 0x6F, 0xD1)), 1.5);
    static readonly Brush BandFill = new SolidColorBrush(Color.FromArgb(0x22, 0x1F, 0x6F, 0xD1));
    static readonly Brush CropShade = new SolidColorBrush(Color.FromArgb(0x99, 0xFF, 0xFF, 0xFF));
    static readonly Typeface Face = new("Segoe UI Semibold");

    static SheetView()
    {
        foreach (var f in new Freezable[] { Paper, SelPen, GuidePen, HandlePen, BandFill, CropShade }) f.Freeze();
    }

    public SheetView()
    {
        Focusable = true;
        ClipToBounds = true;
        RenderOptions.SetBitmapScalingMode(this, BitmapScalingMode.HighQuality);
    }

    public void SetSheet(Sheet? s)
    {
        Sheet = s;
        Selection.Clear();
        CropLayerId = null;
        SelectionChanged?.Invoke();
        FitAll();
    }

    public void Refresh() => InvalidateVisual();

    // --- координаты --------------------------------------------------------

    public Point ToWorld(Point p) => new((p.X - Offset.X) / Zoom, (p.Y - Offset.Y) / Zoom);
    public Point ToScreen(double x, double y) => new(x * Zoom + Offset.X, y * Zoom + Offset.Y);
    Rect ScreenRect(Layer l) => new(ToScreen(l.X, l.Y), ToScreen(l.X + l.W, l.Y + l.H));

    public void SetZoom(double z, Point? at = null)
    {
        z = Math.Clamp(z, 0.05, 8);
        var c = at ?? new Point(ActualWidth / 2, ActualHeight / 2);
        var w = ToWorld(c);
        Zoom = z;
        Offset = new Vector(c.X - w.X * z, c.Y - w.Y * z);
        InvalidateVisual();
        ViewChanged?.Invoke();
    }

    public void SetView(double zoom, Vector offset)
    {
        Zoom = zoom;
        Offset = offset;
        InvalidateVisual();
        ViewChanged?.Invoke();
    }

    public void FitAll()
    {
        var b = Bounds();
        if (b.IsEmpty || ActualWidth < 10) { Zoom = 0.5; Offset = new Vector(40, 40); InvalidateVisual(); ViewChanged?.Invoke(); return; }
        var z = Math.Min((ActualWidth - 60) / b.Width, (ActualHeight - 60) / b.Height);
        Zoom = Math.Clamp(z, 0.05, 4);
        Offset = new Vector((ActualWidth - b.Width * Zoom) / 2 - b.X * Zoom, (ActualHeight - b.Height * Zoom) / 2 - b.Y * Zoom);
        InvalidateVisual();
        ViewChanged?.Invoke();
    }

    public void ScrollToWorld(Rect r)
    {
        Offset = new Vector(ActualWidth / 2 - (r.X + r.Width / 2) * Zoom, ActualHeight / 2 - (r.Y + r.Height / 2) * Zoom);
        InvalidateVisual();
        ViewChanged?.Invoke();
    }

    public Rect Bounds()
    {
        if (Sheet == null) return Rect.Empty;
        var r = Rect.Empty;
        foreach (var l in Sheet.Layers.Where(l => !l.Hidden)) r.Union(new Rect(l.X, l.Y, l.W, Math.Max(l.H, 1)));
        return r;
    }

    protected override void OnRenderSizeChanged(SizeChangedInfo info)
    {
        base.OnRenderSizeChanged(info);
        if (info.PreviousSize.Width < 10) FitAll();
    }

    // --- отрисовка ---------------------------------------------------------

    protected override void OnRender(DrawingContext dc)
    {
        dc.DrawRectangle(Paper, null, new Rect(0, 0, ActualWidth, ActualHeight));
        if (Sheet == null || Store == null) return;

        var b = Bounds();
        if (!b.IsEmpty)
        {
            b.Inflate(40, 40);
            var sb = new Rect(ToScreen(b.X, b.Y), ToScreen(b.Right, b.Bottom));
            dc.DrawRectangle(SheetBg, null, sb);
        }

        dc.PushTransform(new MatrixTransform(Zoom, 0, 0, Zoom, Offset.X, Offset.Y));
        foreach (var l in Sheet.Layers)
        {
            if (l.Hidden) continue;
            DrawLayer(dc, l);
        }
        dc.Pop();

        // Обрезка: вся картинка бледно, видимая часть — ярко, ручки по ней.
        var crop = CropLayer();
        if (crop != null) DrawCrop(dc, crop);

        foreach (var id in Selection)
        {
            var l = Find(id);
            if (l == null || l.Hidden || l.Id == CropLayerId) continue;
            var r = ScreenRect(l);
            dc.DrawRectangle(null, SelPen, r);
            if (Selection.Count == 1 && !l.Locked)
                foreach (var h in Corners(r)) DrawHandle(dc, h);
        }

        foreach (var (v, at) in _guides)
        {
            if (v) { var x = ToScreen(at, 0).X; dc.DrawLine(GuidePen, new Point(x, 0), new Point(x, ActualHeight)); }
            else { var y = ToScreen(0, at).Y; dc.DrawLine(GuidePen, new Point(0, y), new Point(ActualWidth, y)); }
        }

        if (_op == Op.Band) dc.DrawRectangle(BandFill, SelPen, _band);
    }

    void DrawLayer(DrawingContext dc, Layer l)
    {
        if (l.Kind == LayerKind.Image)
        {
            var bmp = Store!.Bitmap(l.Asset);
            var r = new Rect(l.X, l.Y, l.W, Math.Max(l.H, 1));
            if (bmp == null)
            {
                dc.DrawRectangle(Brushes.MistyRose, new Pen(Brushes.IndianRed, 1 / Zoom), r);
                return;
            }
            var info = Store.Project.Assets[l.Asset!];
            var s = l.Scale;
            dc.PushClip(new RectangleGeometry(r));
            dc.DrawImage(bmp, new Rect(l.X - l.Crop.X * s, l.Y - l.Crop.Y * s, info.W * s, info.H * s));
            dc.Pop();
            dc.DrawRectangle(null, new Pen(new SolidColorBrush(Color.FromRgb(0xB8, 0xC4, 0xCE)), 1 / Zoom), r);
            if (!string.IsNullOrWhiteSpace(l.Caption))
            {
                var ft = Text(l.Caption, 22, Color.FromRgb(0x1F, 0x3A, 0x4D));
                ft.MaxTextWidth = Math.Max(l.W, 50);
                ft.MaxLineCount = 1;
                ft.Trimming = TextTrimming.CharacterEllipsis;
                dc.DrawText(ft, new Point(l.X, l.Y - 32));
            }
        }
    }

    void DrawCrop(DrawingContext dc, Layer l)
    {
        var bmp = Store!.Bitmap(l.Asset);
        if (bmp == null) return;
        var info = Store.Project.Assets[l.Asset!];
        var s = l.Scale;
        var full = new Rect(ToScreen(l.X - l.Crop.X * s, l.Y - l.Crop.Y * s),
                            ToScreen(l.X - l.Crop.X * s + info.W * s, l.Y - l.Crop.Y * s + info.H * s));
        var vis = ScreenRect(l);
        dc.DrawImage(bmp, full);
        var shade = new CombinedGeometry(GeometryCombineMode.Exclude, new RectangleGeometry(full), new RectangleGeometry(vis));
        dc.DrawGeometry(CropShade, new Pen(Brushes.Gray, 1), shade);
        dc.DrawRectangle(null, new Pen(SelPen.Brush, 2), vis);
        foreach (var h in AllHandles(vis)) DrawHandle(dc, h);
    }

    static void DrawHandle(DrawingContext dc, Point p) =>
        dc.DrawRectangle(Brushes.White, HandlePen, new Rect(p.X - HandleR, p.Y - HandleR, HandleR * 2, HandleR * 2));

    public static FormattedText Text(string s, double size, Color c) =>
        new(s, CultureInfo.GetCultureInfo("ru-RU"), FlowDirection.LeftToRight, Face, size, new SolidColorBrush(c), 1.0);

    // Ручки: 0..3 — углы (лв, пв, пн, лн), 4..7 — середины сторон (в, п, н, л).
    static Point[] Corners(Rect r) => new[] { r.TopLeft, r.TopRight, r.BottomRight, r.BottomLeft };
    static Point[] AllHandles(Rect r) => Corners(r).Concat(new[]
    {
        new Point(r.X + r.Width / 2, r.Top), new Point(r.Right, r.Y + r.Height / 2),
        new Point(r.X + r.Width / 2, r.Bottom), new Point(r.Left, r.Y + r.Height / 2),
    }).ToArray();

    // --- поиск -------------------------------------------------------------

    public Layer? Find(string id) => Sheet?.Layers.FirstOrDefault(l => l.Id == id);
    Layer? CropLayer() => CropLayerId == null ? null : Find(CropLayerId);

    public Layer? HitLayer(Point world)
    {
        if (Sheet == null) return null;
        for (var i = Sheet.Layers.Count - 1; i >= 0; i--)
        {
            var l = Sheet.Layers[i];
            if (l.Hidden || l.Locked) continue;
            if (new Rect(l.X, l.Y, l.W, l.H).Contains(world)) return l;
        }
        return null;
    }

    static int HitHandle(Point[] hs, Point screen)
    {
        for (var i = 0; i < hs.Length; i++)
            if (Math.Abs(hs[i].X - screen.X) <= HandleR + 3 && Math.Abs(hs[i].Y - screen.Y) <= HandleR + 3) return i;
        return -1;
    }

    // --- выбор -------------------------------------------------------------

    public void Select(IEnumerable<string> ids, bool add = false)
    {
        if (!add) Selection.Clear();
        foreach (var id in ids) if (!Selection.Contains(id)) Selection.Add(id);
        InvalidateVisual();
        SelectionChanged?.Invoke();
    }

    public void ClearSelection()
    {
        if (Selection.Count == 0) return;
        Selection.Clear();
        InvalidateVisual();
        SelectionChanged?.Invoke();
    }

    public IEnumerable<Layer> SelectedLayers() => Selection.Select(Find).Where(l => l != null)!;

    // --- обрезка -----------------------------------------------------------

    public void StartCrop(string layerId)
    {
        var l = Find(layerId);
        if (l == null || l.Kind != LayerKind.Image || l.Locked) return;
        CropLayerId = layerId;
        Select(new[] { layerId });
    }

    public void EndCrop()
    {
        if (CropLayerId == null) return;
        CropLayerId = null;
        InvalidateVisual();
        SelectionChanged?.Invoke();
    }

    // --- мышь --------------------------------------------------------------

    protected override void OnMouseWheel(MouseWheelEventArgs e)
    {
        var p = e.GetPosition(this);
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Shift)) Offset += new Vector(e.Delta, 0);
        else { SetZoom(Zoom * (e.Delta > 0 ? 1.15 : 1 / 1.15), p); return; }
        InvalidateVisual();
        ViewChanged?.Invoke();
        e.Handled = true;
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (e.Key == Key.Space && !e.IsRepeat) { _spaceDown = true; Cursor = Cursors.Hand; e.Handled = true; }
        base.OnKeyDown(e);
    }

    protected override void OnKeyUp(KeyEventArgs e)
    {
        if (e.Key == Key.Space) { _spaceDown = false; Cursor = null; }
        base.OnKeyUp(e);
    }

    protected override void OnMouseDown(MouseButtonEventArgs e)
    {
        Focus();
        var p = e.GetPosition(this);
        if (e.ChangedButton == MouseButton.Left && e.ClickCount == 2) { DoubleClick(p); e.Handled = true; return; }
        PointerDown(p, e.ChangedButton, Keyboard.Modifiers);
        CaptureMouse();
        e.Handled = true;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (_op != Op.None) PointerMove(e.GetPosition(this), Keyboard.Modifiers);
    }

    protected override void OnMouseUp(MouseButtonEventArgs e)
    {
        if (_op == Op.None) return;
        PointerUp(e.GetPosition(this));
        ReleaseMouseCapture();
    }

    public void DoubleClick(Point screen)
    {
        var l = HitLayer(ToWorld(screen));
        if (l != null && l.Kind == LayerKind.Image && CropLayerId == null) StartCrop(l.Id);
        else if (CropLayerId != null && (l == null || l.Id != CropLayerId)) EndCrop();
    }

    // Жесты вынесены в Pointer*: их же вызывают сценарии проверки (--script),
    // чтобы проверять тот же путь, что проходит мышь.
    public void PointerDown(Point p, MouseButton button, ModifierKeys mods)
    {
        _downScreen = _lastScreen = p;
        _downWorld = ToWorld(p);
        _moved = false;
        _guides.Clear();
        if (Sheet == null) return;

        if (button == MouseButton.Middle || button == MouseButton.Right || _spaceDown) { _op = Op.Pan; return; }

        var crop = CropLayer();
        if (crop != null)
        {
            var h = HitHandle(AllHandles(ScreenRect(crop)), p);
            if (h >= 0) { _op = Op.CropHandle; _handle = h; Remember(new[] { crop }); EditStarting?.Invoke(); return; }
            if (ScreenRect(crop).Contains(p)) { _op = Op.CropPan; Remember(new[] { crop }); EditStarting?.Invoke(); return; }
            EndCrop();
        }

        if (Selection.Count == 1)
        {
            var sel = Find(Selection[0]);
            if (sel != null && !sel.Locked && !sel.Hidden)
            {
                var h = HitHandle(Corners(ScreenRect(sel)), p);
                if (h >= 0) { _op = Op.Resize; _handle = h; Remember(new[] { sel }); EditStarting?.Invoke(); return; }
            }
        }

        var hit = HitLayer(_downWorld);
        if (hit != null)
        {
            var shift = mods.HasFlag(ModifierKeys.Shift);
            if (shift && Selection.Contains(hit.Id)) { Selection.Remove(hit.Id); SelectionChanged?.Invoke(); InvalidateVisual(); _op = Op.None; return; }
            if (!Selection.Contains(hit.Id)) Select(new[] { hit.Id }, shift);
            _op = Op.Move;
            Remember(SelectedLayers().Where(l => !l.Locked));
            EditStarting?.Invoke();
            return;
        }

        if (!mods.HasFlag(ModifierKeys.Shift)) ClearSelection();
        _op = Op.Band;
        _band = new Rect(p, p);
    }

    public void PointerMove(Point p, ModifierKeys mods)
    {
        var d = p - _lastScreen;
        _lastScreen = p;
        if ((p - _downScreen).Length > 2) _moved = true;
        var w = ToWorld(p);
        var dw = w - _downWorld;
        _guides.Clear();

        switch (_op)
        {
            case Op.Pan:
                Offset += d;
                ViewChanged?.Invoke();
                break;
            case Op.Band:
                _band = new Rect(_downScreen, p);
                break;
            case Op.Move:
                MoveSelection(dw, !mods.HasFlag(ModifierKeys.Alt));
                break;
            case Op.Resize:
                ResizeSelected(w, !mods.HasFlag(ModifierKeys.Alt));
                break;
            case Op.CropHandle:
                CropResize(w);
                break;
            case Op.CropPan:
                CropPan(dw);
                break;
        }
        InvalidateVisual();
    }

    public void PointerUp(Point p)
    {
        var op = _op;
        _op = Op.None;
        _guides.Clear();
        if (op == Op.Band && _moved)
        {
            var a = ToWorld(_band.TopLeft);
            var b = ToWorld(_band.BottomRight);
            var r = new Rect(a, b);
            var ids = Sheet!.Layers.Where(l => !l.Hidden && !l.Locked && r.IntersectsWith(new Rect(l.X, l.Y, l.W, l.H))).Select(l => l.Id);
            Select(ids, Keyboard.Modifiers.HasFlag(ModifierKeys.Shift));
        }
        else if (_moved)
        {
            EditCommitted?.Invoke(op switch
            {
                Op.Move => "Перенос",
                Op.Resize => "Размер",
                Op.CropHandle or Op.CropPan => "Обрезка",
                _ => "Правка",
            });
        }
        InvalidateVisual();
    }

    void Remember(IEnumerable<Layer> ls) =>
        _orig = ls.ToDictionary(l => l.Id, l => (l.X, l.Y, l.W, l.Crop));

    // --- перенос и размер с прилипанием ----------------------------------

    void MoveSelection(Vector dw, bool snap)
    {
        if (_orig.Count == 0) return;
        var moving = _orig.Keys.Select(Find).Where(l => l != null).ToList();
        var box = Rect.Empty;
        foreach (var l in moving) box.Union(new Rect(_orig[l!.Id].X + dw.X, _orig[l.Id].Y + dw.Y, l.W, l.H));
        var adj = snap ? Snap(box, _orig.Keys.ToHashSet(), true, true, true) : new Vector();
        foreach (var l in moving)
        {
            l!.X = _orig[l.Id].X + dw.X + adj.X;
            l.Y = _orig[l.Id].Y + dw.Y + adj.Y;
        }
    }

    void ResizeSelected(Point w, bool snap)
    {
        var (id, o) = _orig.First();
        var l = Find(id)!;
        var aspect = l.Crop.H > 0 ? l.Crop.H / l.Crop.W : 1;
        var oh = o.W * aspect;
        // Противоположный угол стоит на месте.
        var ax = _handle is 0 or 3 ? o.X + o.W : o.X;
        var ay = _handle is 0 or 1 ? o.Y + oh : o.Y;
        var nw = Math.Max(20, Math.Abs(w.X - ax));
        if (snap)
        {
            var edgeX = _handle is 0 or 3 ? ax - nw : ax + nw;
            var probe = new Rect(new Point(edgeX, ay), new Size(0, 0));
            var adj = Snap(probe, new HashSet<string> { id }, true, false, false);
            if (adj.X != 0) nw = Math.Max(20, Math.Abs(edgeX + adj.X - ax));
        }
        var nh = nw * aspect;
        l.W = nw;
        l.X = _handle is 0 or 3 ? ax - nw : ax;
        l.Y = _handle is 0 or 1 ? ay - nh : ay;
    }

    // Обрезка: ручка двигает сторону видимой части; картинка на полотне стоит
    // на месте — меняются Crop и рамка слоя в тех же пропорциях.
    void CropResize(Point w)
    {
        var (id, o) = _orig.First();
        var l = Find(id)!;
        var info = Store!.Project.Assets[l.Asset!];
        var s = o.W / o.Crop.W;
        var imgX = o.X - o.Crop.X * s;
        var imgY = o.Y - o.Crop.Y * s;
        // Края видимой части в пикселях исходника.
        double x0 = o.Crop.X, y0 = o.Crop.Y, x1 = o.Crop.X + o.Crop.W, y1 = o.Crop.Y + o.Crop.H;
        var sx = Math.Clamp((w.X - imgX) / s, 0, info.W);
        var sy = Math.Clamp((w.Y - imgY) / s, 0, info.H);
        const double min = 8;
        if (_handle is 0 or 3 or 7) x0 = Math.Min(sx, x1 - min);
        if (_handle is 1 or 2 or 5) x1 = Math.Max(sx, x0 + min);
        if (_handle is 0 or 1 or 4) y0 = Math.Min(sy, y1 - min);
        if (_handle is 2 or 3 or 6) y1 = Math.Max(sy, y0 + min);
        l.Crop = new Box(x0, y0, x1 - x0, y1 - y0);
        l.X = imgX + x0 * s;
        l.Y = imgY + y0 * s;
        l.W = (x1 - x0) * s;
    }

    // Перетаскивание внутри рамки обрезки сдвигает картинку под ней.
    void CropPan(Vector dw)
    {
        var (id, o) = _orig.First();
        var l = Find(id)!;
        var info = Store!.Project.Assets[l.Asset!];
        var s = o.W / o.Crop.W;
        var cx = Math.Clamp(o.Crop.X - dw.X / s, 0, info.W - o.Crop.W);
        var cy = Math.Clamp(o.Crop.Y - dw.Y / s, 0, info.H - o.Crop.H);
        l.Crop = new Box(cx, cy, o.Crop.W, o.Crop.H);
    }

    // Прилипание: ближайшие края и середины других видимых слоёв в пределах
    // SnapPx экранных пикселей; найденные линии рисуются направляющими.
    Vector Snap(Rect box, HashSet<string> skip, bool x, bool y, bool centers)
    {
        var lim = SnapPx / Zoom;
        double bestX = lim + 1, bestY = lim + 1, ax = 0, ay = 0, gx = 0, gy = 0;
        var mine = new List<double> { box.Left, box.Right };
        var mineY = new List<double> { box.Top, box.Bottom };
        if (centers) { mine.Add(box.X + box.Width / 2); mineY.Add(box.Y + box.Height / 2); }
        foreach (var l in Sheet!.Layers)
        {
            if (l.Hidden || skip.Contains(l.Id)) continue;
            var xs = new[] { l.X, l.X + l.W, l.X + l.W / 2 };
            var ys = new[] { l.Y, l.Y + l.H, l.Y + l.H / 2 };
            if (x)
                foreach (var m in mine) foreach (var t in xs)
                    if (Math.Abs(t - m) < Math.Abs(bestX)) { bestX = t - m; gx = t; }
            if (y)
                foreach (var m in mineY) foreach (var t in ys)
                    if (Math.Abs(t - m) < Math.Abs(bestY)) { bestY = t - m; gy = t; }
        }
        if (Math.Abs(bestX) <= lim) { ax = bestX; _guides.Add((true, gx)); }
        if (Math.Abs(bestY) <= lim) { ay = bestY; _guides.Add((false, gy)); }
        return new Vector(ax, ay);
    }
}
