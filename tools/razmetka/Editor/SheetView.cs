using System.Globalization;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
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
// Глава, к которой относится разворот: название документа в шапке таблицы.
public sealed record DocInfo(string ChapterTitle, string DocName);

public sealed class SheetView : FrameworkElement
{
    public ProjectStore? Store { get; set; }
    public Sheet? Sheet { get; private set; }
    public double Zoom { get; private set; } = 0.5;
    public Vector Offset { get; private set; } = new(40, 40);
    public List<string> Selection { get; } = new();
    public string? CropLayerId { get; private set; }
    // Выбранная связь: остальные бледнеют, её строка в таблице выделена.
    public string? LinkId { get; private set; }
    public DocInfo Doc { get; set; } = new("", "");
    // Фильтр по блоку системы: связи, у которых поле системы начинается не с
    // этого, бледнеют. null — все видны.
    public string? Filter { get; private set; }
    // Лупа: круг с увеличением ×3 под курсором (M).
    public bool Lens { get; private set; }
    Point? _lensAt;
    public event Action<Link>? StraightenRequested;

    // Что под курсором — для меню по правой кнопке, двойного щелчка и
    // подсказки при наведении.
    public sealed record Target(string Kind, Link? Link, Note? Note, Layer? Layer, Point World, Point Screen);
    public event Action<Target>? ContextRequested;
    public event Action<Link, Point>? EditLinkRequested;
    public event Action<string>? HoverHint;
    // Идёт перетаскивание — плавающая панель прячется, чтобы не мешать.
    public event Action<bool>? Dragging;

    public Target TargetAt(Point screen)
    {
        var w = ToWorld(screen);
        if (Sheet == null) return new("empty", null, null, null, w, screen);
        if (HitNote(screen) is { } n) return new("note", null, n, null, w, screen);
        if (HitLink(screen) is { } k) return new("link", k, null, null, w, screen);
        var l = HitLayerAny(w);
        if (l is { Kind: LayerKind.Table } && HitTableRow(l, w) is { } row) return new("row", row, null, l, w, screen);
        if (l != null) return new(l.Kind == LayerKind.Table ? "table" : "layer", null, null, l, w, screen);
        return new("empty", null, null, null, w, screen);
    }

    // Как HitLayer, но и по закреплённым: меню нужно и у них (открепить).
    Layer? HitLayerAny(Point world)
    {
        for (var i = Sheet!.Layers.Count - 1; i >= 0; i--)
        {
            var l = Sheet.Layers[i];
            if (!l.Hidden && InLayer(l, world)) return l;
        }
        return null;
    }

    // Область выбранного на экране — к ней прижимается плавающая панель.
    public Rect? SelectionScreenRect()
    {
        if (Sheet == null || _op != Op.None) return null;
        var r = Rect.Empty;
        if (SelectedLink is { } k && LinkBounds(k) is { } lb) r = lb;
        else foreach (var l in SelectedLayers()) r.Union(SheetGeo.LayerBounds(l, l.H));
        if (r.IsEmpty) return null;
        return new Rect(ToScreen(r.X, r.Y), ToScreen(r.Right, r.Bottom));
    }

    // Излом у точки щелчка (из меню): на ближайшем отрезке выбранной связи.
    public bool AddBendAt(Point screen) => AddBend(screen);

    void Hover(Point p)
    {
        if (Sheet == null || _op != Op.None) return;
        if (LinkTool || NoteTool || HandTool || _ghost != null || CropLayerId != null) return;
        if (Selection.Count == 1 && Find(Selection[0]) is { Locked: false, Hidden: false } sel
            && HitHandle(ScreenQuad(sel), p) is var h && h >= 0)
        {
            Cursor = h is 0 or 2 ? Cursors.SizeNWSE : Cursors.SizeNESW;
            HoverHint?.Invoke("Тянуть — размер");
            return;
        }
        var t = TargetAt(p);
        switch (t.Kind)
        {
            case "link":
                Cursor = Cursors.Hand;
                HoverHint?.Invoke($"Связь {t.Link!.N}: щелчок — выбрать и подсказка, двойной щелчок или Enter — описать, правая кнопка — меню");
                break;
            case "row":
                Cursor = Cursors.Hand;
                HoverHint?.Invoke($"Строка связи {t.Link!.N}: щелчок — выбрать, двойной щелчок — описать, правая кнопка — меню таблицы");
                break;
            case "note":
                Cursor = Cursors.Hand;
                HoverHint?.Invoke("Заметка: щелчок — открыть, перетаскивание — перенести");
                break;
            case "layer" or "table":
                Cursor = t.Layer!.Locked ? null : Cursors.SizeAll;
                HoverHint?.Invoke(t.Layer.Locked
                    ? $"«{t.Layer.Name}» закреплён — не выбирается и не двигается; правая кнопка — открепить"
                    : $"«{t.Layer.Name}»: перетаскивание — перенос{(t.Kind == "layer" ? ", двойной щелчок или C — обрезка, L — новая связь" : "")}, правая кнопка — меню");
                break;
            default:
                Cursor = null;
                HoverHint?.Invoke("Обвести — выбрать несколько; пробел или H — двигать полотно; Ctrl+K — все команды, F1 — клавиши");
                break;
        }
    }

    // Заметки-булавки: инструмент N — щелчок ставит булавку; выбранная
    // заметка правится в панели справа.
    public bool NoteTool { get; private set; }
    public string? NoteId { get; private set; }
    public event Action<Point>? NotePlaced;
    public Note? SelectedNote => NoteId == null ? null : Sheet?.Notes.FirstOrDefault(n => n.Id == NoteId);

    public void SetNoteTool(bool on)
    {
        NoteTool = on;
        Cursor = on ? Cursors.Pen : null;
        ToolChanged?.Invoke();
    }

    public void SelectNote(string? id)
    {
        NoteId = id;
        ViewOnly();
        SelectionChanged?.Invoke();
    }

    Note? HitNote(Point screen)
    {
        if (Sheet == null) return null;
        foreach (var n in Sheet.Notes.AsEnumerable().Reverse())
            if ((ToScreen(n.X, n.Y) - screen).Length <= 14) return n;
        return null;
    }

    static readonly Brush NoteFill = new SolidColorBrush(Color.FromRgb(0xF4, 0xB9, 0x2F));

    void DrawNotes(DrawingContext dc)
    {
        if (Sheet == null) return;
        foreach (var n in Sheet.Notes)
        {
            var p = ToScreen(n.X, n.Y);
            var on = n.Id == NoteId;
            dc.DrawEllipse(NoteFill, new Pen(on ? SelPen.Brush : Brushes.White, on ? 3 : 2), p, 12, 12);
            var ft = Text("!", 15, Colors.White);
            dc.DrawText(ft, new Point(p.X - ft.Width / 2, p.Y - ft.Height / 2));
            if (string.IsNullOrWhiteSpace(n.Text)) continue;
            // Текст заметки — короткой карточкой справа от булавки.
            var t = Text(n.Text, 12, Color.FromRgb(0x1C, 0x2A, 0x35));
            t.MaxTextWidth = 220;
            t.MaxLineCount = on ? 8 : 2;
            t.Trimming = TextTrimming.CharacterEllipsis;
            var r = new Rect(p.X + 16, p.Y - 10, Math.Min(236, t.Width + 16), t.Height + 8);
            dc.DrawRoundedRectangle(new SolidColorBrush(Color.FromRgb(0xFF, 0xF6, 0xDC)), new Pen(NoteFill, 1), r, 5, 5);
            dc.DrawText(t, new Point(r.X + 8, r.Y + 4));
        }
    }

    public void SetFilter(string? f) { Filter = string.IsNullOrWhiteSpace(f) ? null : f; InvalidateVisual(); }
    public void SetLens(bool on) { Lens = on; if (!on) _lensAt = null; ViewOnly(); }
    public void MoveLens(Point p) { _lensAt = p; ViewOnly(); }

    public event Action? EditStarting;
    public event Action<string>? EditCommitted;
    public event Action? SelectionChanged;
    public event Action? ViewChanged;
    // Щелчок по стрелке, номеру или строке таблицы: связь и точка экрана.
    public event Action<Link, Point>? LinkClicked;

    const double HandleR = 5;
    const double SnapPx = 6;

    enum Op { None, Move, Resize, Band, Pan, CropHandle, CropPan, FrameMove, FrameResize, SegDrag, NoteMove, Rotate, FrameRotate, Straighten }
    double _rotOrig, _rotStart;
    Point _rotCenter;
    Point _noteOrig;
    Op _op;
    Point _downScreen, _lastScreen;
    Point _downWorld;
    int _handle;
    bool _moved;
    Dictionary<string, (double X, double Y, double W, Box Crop)> _orig = new();
    Rect _band;
    readonly List<(bool Vertical, double At)> _guides = new();
    bool _spaceDown;

    // Фон вокруг разворота — по теме (Ui/Theme); сам разворот всегда белый.
    static Brush Paper = Frozen(Color.FromRgb(0xE8, 0xEA, 0xEE));

    static Brush Frozen(Color c) { var b = new SolidColorBrush(c); b.Freeze(); return b; }

    public static void SetDark(bool dark) => Paper = Frozen(dark ? Color.FromRgb(0x16, 0x17, 0x1A) : Color.FromRgb(0xE8, 0xEA, 0xEE));
    static readonly Brush SheetBg = Brushes.White;
    static readonly Pen SelPen = new(new SolidColorBrush(Color.FromRgb(0x00, 0x67, 0xC0)), 1.5);
    static readonly Pen GuidePen = new(new SolidColorBrush(Color.FromRgb(0xE0, 0x3A, 0x8C)), 1);
    static readonly Pen HandlePen = new(new SolidColorBrush(Color.FromRgb(0x00, 0x67, 0xC0)), 1.5);
    static readonly Brush BandFill = new SolidColorBrush(Color.FromArgb(0x1F, 0x00, 0x67, 0xC0));
    static readonly Brush CropShade = new SolidColorBrush(Color.FromArgb(0x99, 0xFF, 0xFF, 0xFF));
    static readonly Typeface Face = new("Segoe UI Semibold");

    static SheetView()
    {
        foreach (var f in new Freezable[] { SelPen, GuidePen, HandlePen, BandFill, CropShade }) f.Freeze();
    }

    public SheetView()
    {
        Focusable = true;
        ClipToBounds = true;
        SnapsToDevicePixels = true;
        RenderOptions.SetBitmapScalingMode(this, BitmapScalingMode.HighQuality);
    }

    public void SetSheet(Sheet? s)
    {
        Sheet = s;
        _worldDirty = true;
        LinkId = null;
        Selection.Clear();
        CropLayerId = null;
        SelectionChanged?.Invoke();
        FitAll();
    }

    public void Refresh() => InvalidateVisual();

    // --- отрисовка в картинку (экспорт) ------------------------------------

    // Разворот целиком в картинку: те же слои, рамки, стрелки и таблицы, что на
    // полотне, без выделения и фильтра. bounds — какая часть полотна попала в
    // картинку (единицы разворота), по ней экспорт ставит слой подсказок.
    // native — картинки в исходном разрешении (экспорт); иначе — уровень по
    // масштабу (карточки «Подряд»: там нужна малая копия).
    bool _native;

    public RenderTargetBitmap RenderBitmap(double scale, out Rect bounds, bool native = true)
    {
        _native = native;
        var b = Bounds();
        if (b.IsEmpty) b = new Rect(0, 0, 400, 300);
        // Подписи над картинками стоят выше слоя — запас сверху.
        b = new Rect(b.X - 40, b.Y - 70, b.Width + 80, b.Height + 110);
        bounds = b;
        var (zoom, off, link, filter, lens) = (Zoom, Offset, LinkId, Filter, Lens);
        Zoom = scale;
        Offset = new Vector(-b.X * scale, -b.Y * scale);
        LinkId = null;
        Filter = null;
        Lens = false;
        var dv = new DrawingVisual();
        // Картинки в выгрузке — сглаживание высокого качества, как на полотне.
        RenderOptions.SetBitmapScalingMode(dv, BitmapScalingMode.HighQuality);
        using (var dc = dv.RenderOpen())
        {
            dc.DrawRectangle(Brushes.White, null, new Rect(0, 0, b.Width * scale, b.Height * scale));
            dc.PushTransform(new MatrixTransform(scale, 0, 0, scale, Offset.X, Offset.Y));
            foreach (var l in Sheet!.Layers) if (!l.Hidden) DrawLayer(dc, l);
            DrawLinks(dc);
            dc.Pop();
        }
        (Zoom, Offset, LinkId, Filter, Lens) = (zoom, off, link, filter, lens);
        _native = false;
        var rtb = new RenderTargetBitmap((int)Math.Ceiling(b.Width * scale), (int)Math.Ceiling(b.Height * scale), 96, 96, PixelFormats.Pbgra32);
        rtb.Render(dv);
        rtb.Freeze();
        return rtb;
    }

    // Строки таблиц связей на полотне — для слоя подсказок экспорта.
    public List<(Link Link, Rect Row)> TableRowRects()
    {
        var o = new List<(Link, Rect)>();
        if (Sheet == null) return o;
        foreach (var l in Sheet.Layers.Where(x => x.Kind == LayerKind.Table && !x.Hidden))
            foreach (var (k, y, h) in TableRows(l, out _)) o.Add((k, new Rect(l.X, y, l.W, h)));
        return o;
    }

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
        ViewOnly();
        ViewChanged?.Invoke();
    }

    public void SetView(double zoom, Vector offset)
    {
        Zoom = zoom;
        Offset = offset;
        ViewOnly();
        ViewChanged?.Invoke();
    }

    public void FitAll()
    {
        var b = Bounds();
        if (b.IsEmpty || ActualWidth < 10) { Zoom = 0.5; Offset = new Vector(40, 40); ViewOnly(); ViewChanged?.Invoke(); return; }
        // Поля: сверху — под плашку режима, снизу — под панель инструментов,
        // чтобы они не закрывали край разворота.
        const double side = 32, top = 56, bottom = 88;
        var z = Math.Min((ActualWidth - 2 * side) / b.Width, (ActualHeight - top - bottom) / b.Height);
        Zoom = Math.Clamp(z, 0.05, 4);
        Offset = new Vector((ActualWidth - b.Width * Zoom) / 2 - b.X * Zoom, top + (ActualHeight - top - bottom - b.Height * Zoom) / 2 - b.Y * Zoom);
        ViewOnly();
        ViewChanged?.Invoke();
    }

    // Рука (H): левая кнопка двигает полотно, как пробел или средняя кнопка.
    public bool HandTool { get; private set; }

    public void SetHandTool(bool on)
    {
        if (HandTool == on) return;
        HandTool = on;
        Cursor = on ? Cursors.Hand : null;
        ToolChanged?.Invoke();
    }

    public void PanBy(Vector v)
    {
        Offset += v;
        ViewOnly();
        ViewChanged?.Invoke();
    }

    // Показать область целиком (Shift+2): с полями, не крупнее 200 %.
    public void ZoomToRect(Rect r)
    {
        if (ActualWidth < 10 || r.IsEmpty) return;
        r.Inflate(Math.Max(20, r.Width * 0.08), Math.Max(20, r.Height * 0.08));
        Zoom = Math.Clamp(Math.Min(ActualWidth / r.Width, ActualHeight / r.Height), 0.05, 2);
        Offset = new Vector(ActualWidth / 2 - (r.X + r.Width / 2) * Zoom, ActualHeight / 2 - (r.Y + r.Height / 2) * Zoom);
        ViewOnly();
        ViewChanged?.Invoke();
    }

    // Сдвинуть полотно, только если область за краем окна (Tab по связям не
    // должен дёргать картинку, когда связь и так видна); не влезает — мельче.
    public void EnsureVisible(Rect r)
    {
        if (ActualWidth < 10 || r.IsEmpty) return;
        const double pad = 48;
        var s = new Rect(ToScreen(r.X, r.Y), ToScreen(r.Right, r.Bottom));
        var view = new Rect(pad, pad, Math.Max(1, ActualWidth - 2 * pad), Math.Max(1, ActualHeight - 2 * pad));
        if (view.Contains(s)) return;
        if (s.Width > view.Width || s.Height > view.Height) { ZoomToRect(r); return; }
        ScrollToWorld(r);
    }

    public void ScrollToWorld(Rect r)
    {
        Offset = new Vector(ActualWidth / 2 - (r.X + r.Width / 2) * Zoom, ActualHeight / 2 - (r.Y + r.Height / 2) * Zoom);
        ViewOnly();
        ViewChanged?.Invoke();
    }

    public Rect Bounds()
    {
        if (Sheet == null) return Rect.Empty;
        var r = Rect.Empty;
        // Таблица рисуется по числу строк, а не по Crop — её высота считается.
        foreach (var l in Sheet.Layers.Where(l => !l.Hidden))
            r.Union(SheetGeo.LayerBounds(l, Math.Max(l.Kind == LayerKind.Table ? TableHeight(Sheet, l) : l.H, 1)));
        return r;
    }

    protected override void OnRenderSizeChanged(SizeChangedInfo info)
    {
        base.OnRenderSizeChanged(info);
        if (info.PreviousSize.Width < 10) { FitAll(); return; }
        Offset += new Vector((info.NewSize.Width - info.PreviousSize.Width) / 2, (info.NewSize.Height - info.PreviousSize.Height) / 2);
        ViewOnly();
        ViewChanged?.Invoke();
    }

    // --- отрисовка ---------------------------------------------------------

    // Кэш содержимого разворота (слои, стрелки, таблицы — в единицах
    // разворота): собирается заново, только когда содержимое изменилось
    // (InvalidateVisual внутри полотна), масштаб ушёл больше чем на четверть
    // (толщина рамок в точках экрана, уровень картинки) или готов уровень
    // картинки. Сдвиг и масштаб — ViewOnly: рисуется тот же рисунок с другим
    // преобразованием, без пересчёта надписей и путей (замер 29.09.2026:
    // отрисовка 5 мс в среднем, до 29 мс на кадр — почти всё надписи таблицы).
    DrawingGroup? _world;
    bool _worldDirty = true;
    double _worldZoom = -1, _worldPpd;

    new void InvalidateVisual() { _worldDirty = true; base.InvalidateVisual(); }
    void ViewOnly() => base.InvalidateVisual();

    void EnsureWorld()
    {
        var zr = _worldZoom > 0 ? Zoom / _worldZoom : 0;
        if (!_worldDirty && _world != null && zr is > 0.8 and < 1.25 && _worldPpd == PixelsPerDip) return;
        var g = new DrawingGroup();
        using (var c = g.Open())
        {
            foreach (var l in Sheet!.Layers) if (!l.Hidden) DrawLayer(c, l);
            DrawLinks(c);
        }
        g.Freeze();
        _world = g;
        _worldDirty = false;
        _worldZoom = Zoom;
        _worldPpd = PixelsPerDip;
    }

    // Готов уровень картинки — пересобрать рисунок.
    public void LevelReady() => InvalidateVisual();

    // Замер отрисовки (сценарии проверки, шаг perf): время каждого OnRender.
    public static readonly List<double> RenderTimes = new();
    static readonly System.Diagnostics.Stopwatch _rsw = new();

    protected override void OnRender(DrawingContext dc)
    {
        _rsw.Restart();
        RenderCore(dc);
        RenderTimes.Add(_rsw.Elapsed.TotalMilliseconds);
        if (RenderTimes.Count > 5000) RenderTimes.RemoveRange(0, 1000);
    }

    // Наведение без мыши — для замера (шаг perf hover).
    public void HoverAt(Point p) => Hover(p);

    void RenderCore(DrawingContext dc)
    {
        PixelsPerDip = VisualTreeHelper.GetDpi(this).PixelsPerDip;
        dc.DrawRectangle(Paper, null, new Rect(0, 0, ActualWidth, ActualHeight));
        if (Sheet == null || Store == null) return;

        var b = Bounds();
        if (!b.IsEmpty)
        {
            b.Inflate(40, 40);
            var sb = new Rect(ToScreen(b.X, b.Y), ToScreen(b.Right, b.Bottom));
            dc.DrawRectangle(SheetBg, null, sb);
        }

        EnsureWorld();
        dc.PushTransform(new MatrixTransform(Zoom, 0, 0, Zoom, Offset.X, Offset.Y));
        dc.DrawDrawing(_world);
        dc.Pop();

        // Обрезка: вся картинка бледно, видимая часть — ярко, ручки по ней.
        var crop = CropLayer();
        if (crop != null) DrawCrop(dc, crop);

        foreach (var id in Selection)
        {
            var l = Find(id);
            if (l == null || l.Hidden || l.Id == CropLayerId) continue;
            var q = ScreenQuad(l);
            DrawQuad(dc, SelPen, q);
            if (Selection.Count == 1 && !l.Locked)
            {
                foreach (var h in q) DrawHandle(dc, h);
                if (l.Kind == LayerKind.Image) DrawRotHandle(dc, q);
            }
        }

        foreach (var (v, at) in _guides)
        {
            if (v) { var x = ToScreen(at, 0).X; dc.DrawLine(GuidePen, new Point(x, 0), new Point(x, ActualHeight)); }
            else { var y = ToScreen(0, at).Y; dc.DrawLine(GuidePen, new Point(0, y), new Point(ActualWidth, y)); }
        }

        DrawLinkEdit(dc);
        DrawPendingFrame(dc);
        DrawNotes(dc);
        DrawAlign(dc);
        if (_op == Op.Band) dc.DrawRectangle(BandFill, SelPen, _band);
        DrawStraighten(dc);
        DrawLens(dc);
    }

    // Лупа: тот же разворот в круге, в 3 раза крупнее, центр — под курсором.
    void DrawLens(DrawingContext dc)
    {
        if (!Lens || _lensAt is not { } c || Sheet == null) return;
        const double R = 140, K = 3;
        dc.PushClip(new EllipseGeometry(c, R, R));
        dc.DrawEllipse(Brushes.White, null, c, R, R);
        var z = Zoom * K;
        var wx = (c.X - Offset.X) / Zoom;
        var wy = (c.Y - Offset.Y) / Zoom;
        dc.PushTransform(new MatrixTransform(z, 0, 0, z, c.X - wx * z, c.Y - wy * z));
        if (_world != null) dc.DrawDrawing(_world);
        dc.Pop();
        dc.Pop();
        dc.DrawEllipse(null, new Pen(SelPen.Brush, 2.5), c, R, R);
    }

    void DrawLayer(DrawingContext dc, Layer l)
    {
        if (l.Kind == LayerKind.Table) { DrawTable(dc, l); return; }
        if (l.Kind == LayerKind.Image)
        {
            var bmp = _native ? Store!.Bitmap(l.Asset) : Store!.BitmapFor(l.Asset, Zoom * PixelsPerDip * l.Scale);
            var r = new Rect(l.X, l.Y, l.W, Math.Max(l.H, 1));
            var turned = l.Rotation != 0;
            if (turned) dc.PushTransform(new RotateTransform(l.Rotation, l.X + l.W / 2, l.Y + l.H / 2));
            if (bmp == null)
            {
                dc.DrawRectangle(Brushes.MistyRose, new Pen(Brushes.IndianRed, 1 / Zoom), r);
                if (turned) dc.Pop();
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
            if (turned) dc.Pop();
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
        var turned = l.Rotation != 0;
        if (turned) { var c = ToScreen(l.X + l.W / 2, l.Y + l.H / 2); dc.PushTransform(new RotateTransform(l.Rotation, c.X, c.Y)); }
        dc.DrawImage(bmp, full);
        var shade = new CombinedGeometry(GeometryCombineMode.Exclude, new RectangleGeometry(full), new RectangleGeometry(vis));
        dc.DrawGeometry(CropShade, new Pen(Brushes.Gray, 1), shade);
        dc.DrawRectangle(null, new Pen(SelPen.Brush, 2), vis);
        foreach (var h in AllHandles(vis)) DrawHandle(dc, h);
        if (turned) dc.Pop();
    }

    // --- поворот: вид и попадание ----------------------------------------------

    Point[] ScreenQuad(Layer l) => SheetGeo.LayerQuad(l, l.H).Select(p => ToScreen(p.X, p.Y)).ToArray();
    Point[] ToScreen(Point[] world) => world.Select(p => ToScreen(p.X, p.Y)).ToArray();

    bool InLayer(Layer l, Point world) =>
        l.Rotation == 0 ? new Rect(l.X, l.Y, l.W, l.H).Contains(world) : SheetGeo.InQuad(SheetGeo.LayerQuad(l, l.H), world);

    static void DrawQuad(DrawingContext dc, Pen pen, Point[] q, Brush? fill = null)
    {
        var g = new StreamGeometry();
        using (var c = g.Open())
        {
            c.BeginFigure(q[0], fill != null, true);
            c.PolyLineTo(q.Skip(1).ToList(), true, true);
        }
        dc.DrawGeometry(fill, pen, g);
    }

    // Ручка поворота — над серединой верхней стороны, по её нормали.
    static Point RotHandle(Point[] q)
    {
        var top = new Point((q[0].X + q[1].X) / 2, (q[0].Y + q[1].Y) / 2);
        var side = q[1] - q[0];
        var n = side.Length < 1e-6 ? new Vector(0, -1) : new Vector(side.Y, -side.X) / side.Length;
        return top + n * 26;
    }

    void DrawRotHandle(DrawingContext dc, Point[] q)
    {
        var h = RotHandle(q);
        var top = new Point((q[0].X + q[1].X) / 2, (q[0].Y + q[1].Y) / 2);
        dc.DrawLine(HandlePen, top, h);
        dc.DrawEllipse(Brushes.White, HandlePen, h, HandleR + 1, HandleR + 1);
    }

    static bool NearPoint(Point a, Point p) => (a - p).Length <= HandleR + 4;

    // Точка экрана — в оси слоя (до поворота): для ручек обрезки.
    Point Unturn(Layer l, Point screen) =>
        l.Rotation == 0 ? screen : SheetGeo.Rotate(screen, ToScreen(l.X + l.W / 2, l.Y + l.H / 2), -l.Rotation);

    // После размера или обрезки повёрнутого слоя середина сдвигается, и
    // поворот вокруг новой середины увёл бы картинку. Сдвиг компенсирует: те
    // же точки исходника остаются на тех же местах полотна.
    static void KeepPlaced(Layer l, Point c0)
    {
        if (l.Rotation == 0) return;
        var d = SheetGeo.Center(l) - c0;
        var t = SheetGeo.Rotate(d, l.Rotation) - d;
        l.X += t.X;
        l.Y += t.Y;
    }

    static Point OrigCenter((double X, double Y, double W, Box Crop) o) =>
        new(o.X + o.W / 2, o.Y + (o.Crop.W > 0 ? o.Crop.H * o.W / o.Crop.W : 0) / 2);

    static double Norm(double deg)
    {
        deg %= 360;
        if (deg > 180) deg -= 360;
        if (deg <= -180) deg += 360;
        return Math.Round(deg, 2);
    }

    static void DrawHandle(DrawingContext dc, Point p) =>
        dc.DrawRectangle(Brushes.White, HandlePen, new Rect(p.X - HandleR, p.Y - HandleR, HandleR * 2, HandleR * 2));

    // Плотность экрана: при 125–150 % текст, построенный под 96 dpi,
    // растягивается и мылится. Обновляется при отрисовке полотна.
    public static double PixelsPerDip { get; private set; } = 1.0;

    public static FormattedText Text(string s, double size, Color c) =>
        new(s, CultureInfo.GetCultureInfo("ru-RU"), FlowDirection.LeftToRight, Face, size, new SolidColorBrush(c), PixelsPerDip);

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
            if (InLayer(l, world)) return l;
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
        ViewOnly();
        SelectionChanged?.Invoke();
    }

    public void ClearSelection()
    {
        if (Selection.Count == 0) return;
        Selection.Clear();
        ViewOnly();
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
        ViewOnly();
        SelectionChanged?.Invoke();
    }

    // --- мышь --------------------------------------------------------------

    protected override void OnMouseWheel(MouseWheelEventArgs e)
    {
        var p = e.GetPosition(this);
        if (Keyboard.Modifiers.HasFlag(ModifierKeys.Shift)) Offset += new Vector(e.Delta, 0);
        else { SetZoom(Zoom * (e.Delta > 0 ? 1.15 : 1 / 1.15), p); return; }
        ViewOnly();
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
        if (e.Key == Key.Space) { _spaceDown = false; Cursor = HandTool ? Cursors.Hand : null; }
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
        if (Lens) MoveLens(e.GetPosition(this));
        if (_op != Op.None) PointerMove(e.GetPosition(this), Keyboard.Modifiers);
        else Hover(e.GetPosition(this));
    }

    protected override void OnMouseLeave(MouseEventArgs e)
    {
        if (Lens) { _lensAt = null; ViewOnly(); }
        base.OnMouseLeave(e);
    }

    protected override void OnMouseUp(MouseButtonEventArgs e)
    {
        if (_op == Op.None) return;
        PointerUp(e.GetPosition(this));
        ReleaseMouseCapture();
    }

    public void DoubleClick(Point screen)
    {
        // Двойной щелчок по стрелке, номеру или строке таблицы — описать связь
        // прямо у стрелки. Излом и выпрямление — в меню правой кнопки.
        var t0 = TargetAt(screen);
        if (t0.Link != null) { SelectLink(t0.Link.Id); EditLinkRequested?.Invoke(t0.Link, screen); return; }
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

        if (button == MouseButton.Middle || _spaceDown || (HandTool && button == MouseButton.Left)) { _op = Op.Pan; return; }
        if (button == MouseButton.Right)
        {
            _op = Op.None;
            var t = TargetAt(p);
            // Правая кнопка выбирает то, над чем меню, — как в проводнике.
            if (t.Link != null && t.Kind == "link") SelectLink(t.Link.Id);
            else if (t.Layer != null && !t.Layer.Locked && !Selection.Contains(t.Layer.Id)) { if (LinkId != null) SelectLink(null); Select(new[] { t.Layer.Id }); }
            else if (t.Note != null) SelectNote(t.Note.Id);
            ContextRequested?.Invoke(t);
            return;
        }
        if (_ghost != null) { _op = Op.None; AlignClick(p); return; }
        if (StraightenTool) { _op = Op.Straighten; _lineTo = _downWorld; return; }
        if (LinkTool) { _op = Op.Band; _band = new Rect(p, p); return; }
        if (NoteTool) { _op = Op.None; SetNoteTool(false); NotePlaced?.Invoke(ToWorld(p)); return; }
        if (HitNote(p) is { } note)
        {
            SelectNote(note.Id);
            _op = Op.NoteMove;
            _noteOrig = new Point(note.X, note.Y);
            EditStarting?.Invoke();
            return;
        }
        if (NoteId != null) SelectNote(null);

        var crop = CropLayer();
        if (crop != null)
        {
            var pu = Unturn(crop, p);
            var h = HitHandle(AllHandles(ScreenRect(crop)), pu);
            if (h >= 0) { _op = Op.CropHandle; _handle = h; Remember(new[] { crop }); EditStarting?.Invoke(); return; }
            if (ScreenRect(crop).Contains(pu)) { _op = Op.CropPan; Remember(new[] { crop }); EditStarting?.Invoke(); return; }
            EndCrop();
        }

        if (LinkEditDown(p)) return;

        if (Selection.Count == 1)
        {
            var sel = Find(Selection[0]);
            if (sel != null && !sel.Locked && !sel.Hidden)
            {
                var q = ScreenQuad(sel);
                if (sel.Kind == LayerKind.Image && NearPoint(RotHandle(q), p))
                {
                    _op = Op.Rotate; _rotOrig = sel.Rotation; _rotCenter = SheetGeo.Center(sel);
                    _rotStart = Math.Atan2(_downWorld.Y - _rotCenter.Y, _downWorld.X - _rotCenter.X);
                    Remember(new[] { sel }); EditStarting?.Invoke(); return;
                }
                var h = HitHandle(q, p);
                if (h >= 0) { _op = Op.Resize; _handle = h; Remember(new[] { sel }); EditStarting?.Invoke(); return; }
            }
        }

        var link = HitLink(p);
        if (link != null)
        {
            SelectLink(link.Id);
            LinkClicked?.Invoke(link, p);
            _op = Op.None;
            return;
        }

        var hit = HitLayer(_downWorld);
        if (hit != null)
        {
            if (LinkId != null) SelectLink(null);
            var shift = mods.HasFlag(ModifierKeys.Shift);
            if (shift && Selection.Contains(hit.Id)) { Selection.Remove(hit.Id); SelectionChanged?.Invoke(); InvalidateVisual(); _op = Op.None; return; }
            if (!Selection.Contains(hit.Id)) Select(new[] { hit.Id }, shift);
            _op = Op.Move;
            Remember(SelectedLayers().Where(l => !l.Locked));
            EditStarting?.Invoke();
            return;
        }

        if (!mods.HasFlag(ModifierKeys.Shift)) { ClearSelection(); if (LinkId != null) SelectLink(null); }
        _op = Op.Band;
        _band = new Rect(p, p);
    }

    public void PointerMove(Point p, ModifierKeys mods)
    {
        var d = p - _lastScreen;
        _lastScreen = p;
        if ((p - _downScreen).Length > 2 && !_moved) { _moved = true; if (_op is not (Op.Band or Op.Pan)) Dragging?.Invoke(true); }
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
            case Op.FrameMove:
            case Op.FrameResize:
                FrameDrag(w);
                break;
            case Op.SegDrag:
                SegDrag(w);
                break;
            case Op.NoteMove:
                if (SelectedNote is { } nm) { nm.X = _noteOrig.X + dw.X; nm.Y = _noteOrig.Y + dw.Y; }
                break;
            case Op.Rotate:
                if (Find(_orig.Keys.First()) is { } rl)
                {
                    var a = Math.Atan2(w.Y - _rotCenter.Y, w.X - _rotCenter.X);
                    var deg = _rotOrig + (a - _rotStart) * 180 / Math.PI;
                    // Shift — шаг 15°, иначе — 0,1°.
                    deg = mods.HasFlag(ModifierKeys.Shift) ? Math.Round(deg / 15) * 15 : Math.Round(deg, 1);
                    rl.Rotation = Norm(deg);
                }
                break;
            case Op.FrameRotate:
                FrameRotate(w, mods.HasFlag(ModifierKeys.Shift));
                break;
            case Op.Straighten:
                _lineTo = w;
                break;
        }
        if (_op is Op.Pan or Op.Band or Op.NoteMove or Op.Straighten) ViewOnly(); else InvalidateVisual();
    }

    public void PointerUp(Point p)
    {
        var op = _op;
        _op = Op.None;
        if (_moved) Dragging?.Invoke(false);
        _guides.Clear();
        if (op == Op.Move && !_moved && Selection.Count == 1 && Find(Selection[0]) is { Kind: LayerKind.Table } tl)
        {
            var row = HitTableRow(tl, ToWorld(p));
            if (row != null) { SelectLink(row.Id); LinkClicked?.Invoke(row, p); }
        }
        if (op == Op.Straighten)
        {
            StraightenUp();
        }
        else if (op == Op.Band && LinkTool)
        {
            LinkToolUp();
        }
        else if (op == Op.Band && _moved)
        {
            var a = ToWorld(_band.TopLeft);
            var b = ToWorld(_band.BottomRight);
            var r = new Rect(a, b);
            var ids = Sheet!.Layers.Where(l => !l.Hidden && !l.Locked && r.IntersectsWith(SheetGeo.LayerBounds(l, l.H))).Select(l => l.Id);
            Select(ids, Keyboard.Modifiers.HasFlag(ModifierKeys.Shift));
        }
        else if (_moved)
        {
            EditCommitted?.Invoke(op switch
            {
                Op.Move => "Перенос",
                Op.Resize => "Размер",
                Op.CropHandle or Op.CropPan => "Обрезка",
                Op.FrameMove or Op.FrameResize => "Рамка связи",
                Op.Rotate => "Поворот слоя",
                Op.FrameRotate => "Наклон рамки",
                Op.SegDrag => "Путь стрелки",
                Op.NoteMove => "Перенос заметки",
                _ => "Правка",
            });
        }
        InvalidateVisual();
    }

    void Remember(IEnumerable<Layer> ls) =>
        _orig = ls.ToDictionary(l => l.Id, l => (l.X, l.Y, l.W, l.Crop));

    // --- связи --------------------------------------------------------------

    public void SelectLink(string? id)
    {
        LinkId = id;
        InvalidateVisual();
        SelectionChanged?.Invoke();
    }

    public Link? SelectedLink => LinkId == null ? null : Sheet?.Links.FirstOrDefault(k => k.Id == LinkId);

    // Щелчок попадает в стрелку в пределах 7 экранных пикселей или в номер.
    public Link? HitLink(Point screen)
    {
        if (Sheet == null) return null;
        var w = ToWorld(screen);
        Link? best = null;
        var bestD = 7 / Zoom;
        foreach (var k in Sheet.Links)
        {
            var pts = SheetGeo.DrawPath(Sheet, k);
            if (pts == null) continue;
            var d = SheetGeo.DistToPath(pts, w);
            var tgt = SheetGeo.FrameRect(Sheet, k.Tgt)!.Value;
            var (bs, bt) = SheetGeo.Badges(pts, tgt);
            d = Math.Min(d, Math.Max(0, Math.Min((w - bs).Length, (w - bt).Length) - 17));
            if (d < bestD) { bestD = d; best = k; }
        }
        return best;
    }

    public Rect? LinkBounds(Link k)
    {
        if (Sheet == null) return null;
        var r = Rect.Empty;
        foreach (var id in new[] { k.Src, k.Tgt }) if (SheetGeo.FrameRect(Sheet, id) is { } f) r.Union(f);
        if (SheetGeo.DrawPath(Sheet, k) is { } pts) foreach (var p in pts) r.Union(p);
        return r.IsEmpty ? null : r;
    }

    public Point? LinkBadgeScreen(Link k)
    {
        if (Sheet == null || SheetGeo.DrawPath(Sheet, k) is not { } pts || SheetGeo.FrameRect(Sheet, k.Tgt) is not { } t) return null;
        var (bs, _) = SheetGeo.Badges(pts, t);
        return ToScreen(bs.X, bs.Y);
    }

    void DrawLinks(DrawingContext dc)
    {
        var s = Sheet!;
        var ordered = SheetGeo.Ordered(s);
        var dim = LinkId != null;
        foreach (var k in ordered)
        {
            var pts = SheetGeo.DrawPath(s, k);
            if (pts == null) continue;
            var src = SheetGeo.FrameRect(s, k.Src)!.Value;
            var tgt = SheetGeo.FrameRect(s, k.Tgt)!.Value;
            var on = k.Id == LinkId;
            var col = SheetGeo.Palette[ordered.IndexOf(k) % SheetGeo.Palette.Length];
            var filtered = Filter != null && !k.SystemField.StartsWith(Filter, StringComparison.OrdinalIgnoreCase);
            if ((dim && !on) || filtered) col = Color.FromArgb(filtered ? (byte)0x1C : (byte)0x33, col.R, col.G, col.B);
            var br = new SolidColorBrush(col);
            var width = on ? 7.0 : 4.0;
            var pen = new Pen(br, width) { LineJoin = PenLineJoin.Round };
            // Тип связи — видом линии: переносится — сплошная, по ЕНИ —
            // короткий штрих, только в имя — точки, не переносится — штрих.
            if (k.Kind == LinkKind.None) pen.DashStyle = DashStyles.Dash;
            else if (k.Kind == LinkKind.Auto) pen.DashStyle = new DashStyle(new double[] { 3, 1.5 }, 0);
            else if (k.Kind == LinkKind.NameOnly) pen.DashStyle = DashStyles.Dot;
            // Рамка без наклона — скруглённый прямоугольник, с наклоном — по углам.
            foreach (var (id, box) in new[] { (k.Src, src), (k.Tgt, tgt) })
            {
                var fr = s.Frames.First(x => x.Id == id);
                if (SheetGeo.FrameTilt(s, fr) == 0) dc.DrawRoundedRectangle(null, new Pen(br, width), box, 3, 3);
                else DrawQuad(dc, new Pen(br, width) { LineJoin = PenLineJoin.Round }, SheetGeo.FrameQuad(s, id)!);
            }
            var g = new StreamGeometry();
            using (var c = g.Open())
            {
                c.BeginFigure(pts[0], false, false);
                c.PolyLineTo(pts.Skip(1).ToList(), true, true);
            }
            dc.DrawGeometry(null, pen, g);
            var a = pts[^2];
            var b = pts[^1];
            var ang = Math.Atan2(b.Y - a.Y, b.X - a.X);
            const double L = 22, W = 11;
            var head = new StreamGeometry();
            using (var c = head.Open())
            {
                c.BeginFigure(b, true, true);
                c.LineTo(new Point(b.X - L * Math.Cos(ang) + W * Math.Sin(ang), b.Y - L * Math.Sin(ang) - W * Math.Cos(ang)), true, false);
                c.LineTo(new Point(b.X - L * Math.Cos(ang) - W * Math.Sin(ang), b.Y - L * Math.Sin(ang) + W * Math.Cos(ang)), true, false);
            }
            dc.DrawGeometry(br, null, head);
            var (bs, bt) = SheetGeo.Badges(pts, tgt);
            foreach (var bp in new[] { bs, bt })
            {
                dc.DrawEllipse(br, new Pen(Brushes.White, 3), bp, 17, 17);
                var ft = Text(k.N.ToString(), 20, Colors.White);
                dc.DrawText(ft, new Point(bp.X - ft.Width / 2, bp.Y - ft.Height / 2));
            }
        }
    }

    // --- правка связей: рамки, отрезки, новая связь ------------------------
    //
    // У выбранной связи обе рамки с ручками: внутри — перенос, углы — размер.
    // Отрезок стрелки тянется поперёк себя (стрелка остаётся из прямых
    // углов), крайние отрезки скользят концом вдоль стороны рамки. Двойной
    // щелчок по отрезку — излом-ступенька, которую затем двигают.
    //
    // Новая связь (LinkTool): первая обводка на картинке — рамка на документе,
    // вторая — рамка на снимке системы; связь создаётся с номером следом за
    // последним и сразу прокладывается.

    // «Выпрямить» (Photoshop: линейка → «Выпрямить слой»): провести по линии
    // скана, которая должна быть горизонтальной или вертикальной; поворот
    // слоя — до ближайшего ровного положения.
    public bool StraightenTool { get; private set; }
    public event Action<Layer, double>? StraightenDone;
    Point _lineTo;

    public void SetStraightenTool(bool on)
    {
        StraightenTool = on;
        Cursor = on ? Cursors.Cross : null;
        ViewOnly();
        ToolChanged?.Invoke();
    }

    void StraightenUp()
    {
        var a = _downWorld;
        var b = _lineTo;
        if ((b - a).Length * Zoom < 12 || Sheet == null) return;
        var layer = Selection.Count == 1 && Find(Selection[0]) is { Kind: LayerKind.Image } sel && InLayer(sel, a) ? sel : HitImageLayer(a);
        if (layer == null) return;
        var deg = Math.Atan2(b.Y - a.Y, b.X - a.X) * 180 / Math.PI;
        var target = Math.Round(deg / 90) * 90;
        SetStraightenTool(false);
        StraightenDone?.Invoke(layer, target - deg);
    }

    void DrawStraighten(DrawingContext dc)
    {
        if (_op != Op.Straighten) return;
        var a = ToScreen(_downWorld.X, _downWorld.Y);
        var b = ToScreen(_lineTo.X, _lineTo.Y);
        dc.DrawLine(new Pen(Brushes.White, 4), a, b);
        dc.DrawLine(new Pen(SelPen.Brush, 2) { DashStyle = DashStyles.Dash }, a, b);
        var deg = Math.Atan2(b.Y - a.Y, b.X - a.X) * 180 / Math.PI;
        var off = deg - Math.Round(deg / 90) * 90;
        var ft = Text($"{off:+0.0;−0.0;0}°", 13, Colors.White);
        var r = new Rect(b.X + 12, b.Y - 12, ft.Width + 12, ft.Height + 4);
        dc.DrawRoundedRectangle(SelPen.Brush, null, r, 4, 4);
        dc.DrawText(ft, new Point(r.X + 6, r.Y + 2));
    }

    public bool LinkTool { get; private set; }
    Frame? _pendingFrame;
    public event Action<Frame, Frame>? LinkDrawn;
    public event Action? ToolChanged;
    string? _frameId;
    int _seg;
    List<Point>? _origPts;
    Box _origBox;

    public void SetLinkTool(bool on)
    {
        LinkTool = on;
        _pendingFrame = null;
        Cursor = on ? Cursors.Cross : null;
        ViewOnly();
        ToolChanged?.Invoke();
    }

    public bool HasPendingFrame => _pendingFrame != null;

    IEnumerable<Frame> SelectedLinkFrames()
    {
        if (Sheet == null || SelectedLink is not { } k) yield break;
        foreach (var f in Sheet.Frames.Where(f => f.Id == k.Src || f.Id == k.Tgt)) yield return f;
    }

    // Возвращает true, если жест взят правкой связи.
    bool LinkEditDown(Point p)
    {
        if (Sheet == null || SelectedLink is not { } k) return false;
        foreach (var f in SelectedLinkFrames())
        {
            if (SheetGeo.FrameQuad(Sheet, f.Id) is not { } fq) continue;
            var sq = ToScreen(fq);
            if (NearPoint(RotHandle(sq), p))
            {
                _op = Op.FrameRotate; _frameId = f.Id; _origBox = f.Box; _rotOrig = f.Angle;
                _rotCenter = SheetGeo.Bounds(fq) is var bb ? new Point(bb.X + bb.Width / 2, bb.Y + bb.Height / 2) : default;
                _rotStart = Math.Atan2(_downWorld.Y - _rotCenter.Y, _downWorld.X - _rotCenter.X);
                EditStarting?.Invoke(); return true;
            }
            var h = HitHandle(sq, p);
            if (h >= 0) { _op = Op.FrameResize; _handle = h; _frameId = f.Id; _origBox = f.Box; _rotOrig = f.Angle; EditStarting?.Invoke(); return true; }
        }
        var pts = SheetGeo.Path(Sheet, k);
        if (pts != null)
        {
            var w = ToWorld(p);
            for (var i = 0; i + 1 < pts.Count; i++)
            {
                if (SheetGeo.DistToPath(new List<Point> { pts[i], pts[i + 1] }, w) * Zoom > 6) continue;
                k.Points = pts.Select(q => new Pt(q.X, q.Y)).ToList();
                _op = Op.SegDrag;
                _seg = i;
                _origPts = pts;
                EditStarting?.Invoke();
                return true;
            }
        }
        foreach (var f in SelectedLinkFrames())
        {
            if (SheetGeo.FrameQuad(Sheet, f.Id) is not { } fq) continue;
            // Точка — в осях рамки (с её наклоном), рамка — прямоугольник.
            var sq = ToScreen(fq);
            var c = new Point(sq.Average(q => q.X), sq.Average(q => q.Y));
            var tilt = SheetGeo.FrameTilt(Sheet, f);
            var pl = SheetGeo.Rotate(p, c, -tilt);
            double fw = (sq[1] - sq[0]).Length, fh = (sq[3] - sq[0]).Length;
            var sr = new Rect(c.X - fw / 2, c.Y - fh / 2, fw, fh);
            // Внутрь рамки — только у края (рамка часто накрывает значение,
            // по которому щёлкают, чтобы выбрать слой): полоса 8 px.
            var inner = sr;
            inner.Inflate(-8, -8);
            if (sr.Contains(pl) && (inner.IsEmpty || !inner.Contains(pl)))
            {
                _op = Op.FrameMove; _frameId = f.Id; _origBox = f.Box; EditStarting?.Invoke(); return true;
            }
        }
        return false;
    }

    // Рамка: перенос — сдвиг в осях картинки; размер — в осях самой рамки
    // (с наклоном), противоположный угол стоит на месте.
    void FrameDrag(Point w)
    {
        var f = Sheet!.Frames.First(x => x.Id == _frameId);
        var l = SheetGeo.LayerOf(Sheet, f)!;
        var k = l.Scale;
        if (_op == Op.FrameMove)
        {
            var d = SheetGeo.Rotate(w - _downWorld, -l.Rotation) / k;
            f.Box = new Box(_origBox.X + d.X, _origBox.Y + d.Y, _origBox.W, _origBox.H);
            return;
        }
        var c0 = new Point(_origBox.X + _origBox.W / 2, _origBox.Y + _origBox.H / 2);
        var pl = SheetGeo.Rotate(SheetGeo.WorldToImg(l, w), c0, -f.Angle);
        double x0 = _origBox.X, y0 = _origBox.Y, x1 = _origBox.Right, y1 = _origBox.Bottom;
        if (_handle is 0 or 3) x0 = Math.Min(pl.X, x1 - 4); else x1 = Math.Max(pl.X, x0 + 4);
        if (_handle is 0 or 1) y0 = Math.Min(pl.Y, y1 - 4); else y1 = Math.Max(pl.Y, y0 + 4);
        var b = new Box(x0, y0, x1 - x0, y1 - y0);
        if (f.Angle != 0)
        {
            // Середина сдвинулась — наклон вокруг новой увёл бы рамку.
            var dc = new Point(b.X + b.W / 2, b.Y + b.H / 2) - c0;
            var t = SheetGeo.Rotate(dc, f.Angle) - dc;
            b = new Box(b.X + t.X, b.Y + t.Y, b.W, b.H);
        }
        f.Box = b;
    }

    void FrameRotate(Point w, bool snap)
    {
        var f = Sheet!.Frames.First(x => x.Id == _frameId);
        var a = Math.Atan2(w.Y - _rotCenter.Y, w.X - _rotCenter.X);
        var deg = _rotOrig + (a - _rotStart) * 180 / Math.PI;
        if (snap)
        {
            // Shift — наклон на экране кратен 15°.
            var lr = SheetGeo.LayerOf(Sheet, f)?.Rotation ?? 0;
            deg = Math.Round((deg + lr) / 15) * 15 - lr;
        }
        f.Angle = Norm(Math.Round(deg, 1));
    }

    void SegDrag(Point w)
    {
        var k = SelectedLink!;
        var pts = _origPts!.ToList();
        var a = pts[_seg];
        var b = pts[_seg + 1];
        var horiz = Math.Abs(a.Y - b.Y) < 0.01;
        var d = w - _downWorld;
        var src = SheetGeo.FrameRect(Sheet!, k.Src)!.Value;
        var tgt = SheetGeo.FrameRect(Sheet!, k.Tgt)!.Value;
        if (horiz)
        {
            var y = a.Y + d.Y;
            // Крайний отрезок скользит концом вдоль стороны рамки.
            if (_seg == 0) y = Math.Clamp(y, src.Top + 2, src.Bottom - 2);
            if (_seg + 1 == pts.Count - 1) y = Math.Clamp(y, tgt.Top + 2, tgt.Bottom - 2);
            pts[_seg] = new Point(a.X, y);
            pts[_seg + 1] = new Point(b.X, y);
        }
        else
        {
            var x = a.X + d.X;
            if (_seg == 0) x = Math.Clamp(x, src.Left + 2, src.Right - 2);
            if (_seg + 1 == pts.Count - 1) x = Math.Clamp(x, tgt.Left + 2, tgt.Right - 2);
            pts[_seg] = new Point(x, a.Y);
            pts[_seg + 1] = new Point(x, b.Y);
        }
        k.Points = pts.Select(q => new Pt(q.X, q.Y)).ToList();
    }

    // Излом: отрезок заменяется ступенькой, её средний отрезок затем тянут.
    public bool AddBend(Point screen)
    {
        if (Sheet == null || SelectedLink is not { } k || SheetGeo.Path(Sheet, k) is not { } pts) return false;
        var w = ToWorld(screen);
        for (var i = 0; i + 1 < pts.Count; i++)
        {
            if (SheetGeo.DistToPath(new List<Point> { pts[i], pts[i + 1] }, w) * Zoom > 6) continue;
            var a = pts[i];
            var b = pts[i + 1];
            var horiz = Math.Abs(a.Y - b.Y) < 0.01;
            var off = 40.0;
            var step = new List<Point>();
            if (horiz)
            {
                double x1 = a.X + (b.X - a.X) / 3, x2 = a.X + (b.X - a.X) * 2 / 3;
                step.AddRange(new[] { new Point(x1, a.Y), new Point(x1, a.Y + off), new Point(x2, a.Y + off), new Point(x2, a.Y) });
            }
            else
            {
                double y1 = a.Y + (b.Y - a.Y) / 3, y2 = a.Y + (b.Y - a.Y) * 2 / 3;
                step.AddRange(new[] { new Point(a.X, y1), new Point(a.X + off, y1), new Point(a.X + off, y2), new Point(a.X, y2) });
            }
            EditStarting?.Invoke();
            pts.InsertRange(i + 1, step);
            k.Points = pts.Select(q => new Pt(q.X, q.Y)).ToList();
            EditCommitted?.Invoke("Излом стрелки");
            InvalidateVisual();
            return true;
        }
        return false;
    }

    void DrawLinkEdit(DrawingContext dc)
    {
        if (Sheet == null || SelectedLink is not { } k) return;
        foreach (var f in SelectedLinkFrames())
        {
            if (SheetGeo.FrameQuad(Sheet, f.Id) is not { } fq) continue;
            var sq = ToScreen(fq);
            foreach (var h in sq) DrawHandle(dc, h);
            DrawRotHandle(dc, sq);
        }
        if (SheetGeo.Path(Sheet, k) is { } pts)
            for (var i = 0; i + 1 < pts.Count; i++)
            {
                var m = new Point((pts[i].X + pts[i + 1].X) / 2, (pts[i].Y + pts[i + 1].Y) / 2);
                var sm = ToScreen(m.X, m.Y);
                dc.DrawEllipse(Brushes.White, HandlePen, sm, 4.5, 4.5);
            }
    }

    // Новая связь: обводка рисует рамку на верхнем слое-картинке под началом
    // обводки.
    void LinkToolUp()
    {
        if (Sheet == null || !_moved) return;
        var a = ToWorld(_band.TopLeft);
        var b = ToWorld(_band.BottomRight);
        var r = new Rect(a, b);
        var layer = HitImageLayer(new Point(r.X + 1, r.Y + 1));
        if (layer == null || r.Width < 4 || r.Height < 4) return;
        r.Intersect(SheetGeo.LayerBounds(layer, layer.H));
        if (r.IsEmpty) return;
        var (box, angle) = SheetGeo.FromWorld(layer, r);
        var f = new Frame { LayerId = layer.Id, Box = box, Angle = angle };
        if (_pendingFrame == null) { _pendingFrame = f; ToolChanged?.Invoke(); return; }
        var first = _pendingFrame;
        _pendingFrame = null;
        LinkDrawn?.Invoke(first, f);
    }

    Layer? HitImageLayer(Point world)
    {
        for (var i = Sheet!.Layers.Count - 1; i >= 0; i--)
        {
            var l = Sheet.Layers[i];
            if (l.Hidden || l.Kind != LayerKind.Image) continue;
            if (InLayer(l, world)) return l;
        }
        return null;
    }

    void DrawPendingFrame(DrawingContext dc)
    {
        if (_pendingFrame == null || Sheet == null) return;
        var l = SheetGeo.LayerOf(Sheet, _pendingFrame);
        if (l == null) return;
        var q = SheetGeo.BoxQuad(_pendingFrame.Box, _pendingFrame.Angle).Select(p => SheetGeo.ImgToWorld(l, p)).ToArray();
        var pen = new Pen(SelPen.Brush, 3) { DashStyle = DashStyles.Dash };
        DrawQuad(dc, pen, ToScreen(q));
    }

    // --- подгонка по двум точкам после замены картинки -------------------
    //
    // Новый скан того же документа почти всегда сдвинут, в другом масштабе и
    // чуть повёрнут. Прежняя картинка показывается бледно поверх новой в
    // прежнем положении; пользователь отмечает точку 1 на прежней, ту же
    // точку на новой, затем точку 2 так же. По двум парам точек считается
    // преобразование подобия (перенос, масштаб, поворот — NASA NTRS,
    // «Geometric registration … using two reference points»), им
    // пересчитываются рамки слоя и обрезка.

    public sealed record AlignGhost(string LayerId, string Asset, Box Crop, double X, double Y, double W);
    AlignGhost? _ghost;
    readonly List<Point> _alignSrc = new();
    public event Action<AlignGhost, Point[], Point[]>? AlignDone;
    public int AlignStep => _ghost == null ? -1 : _alignSrc.Count;

    public void StartAlign(AlignGhost g)
    {
        _ghost = g;
        _alignSrc.Clear();
        Cursor = Cursors.Cross;
        ViewOnly();
        ToolChanged?.Invoke();
    }

    public void CancelAlign()
    {
        _ghost = null;
        _alignSrc.Clear();
        Cursor = null;
        ViewOnly();
        ToolChanged?.Invoke();
    }

    // Точка в пикселях исходника: нечётные щелчки — прежней картинки (по её
    // прежнему месту), чётные — новой (по слою как он есть сейчас).
    void AlignClick(Point screen)
    {
        var g = _ghost!;
        var w = ToWorld(screen);
        if (_alignSrc.Count % 2 == 0)
        {
            var k = g.W / g.Crop.W;
            _alignSrc.Add(new Point(g.Crop.X + (w.X - g.X) / k, g.Crop.Y + (w.Y - g.Y) / k));
        }
        else
        {
            var l = Find(g.LayerId)!;
            var k = l.Scale;
            _alignSrc.Add(new Point(l.Crop.X + (w.X - l.X) / k, l.Crop.Y + (w.Y - l.Y) / k));
        }
        ToolChanged?.Invoke();
        ViewOnly();
        if (_alignSrc.Count < 4) return;
        var olds = new[] { _alignSrc[0], _alignSrc[2] };
        var news = new[] { _alignSrc[1], _alignSrc[3] };
        var done = g;
        CancelAlign();
        AlignDone?.Invoke(done, olds, news);
    }

    // Для сценариев проверки: точка исходника прежней (old) или новой
    // картинки — в экранную.
    public Point AlignSourceToScreen(bool old, Point src)
    {
        var g = _ghost!;
        if (old) { var k = g.W / g.Crop.W; return ToScreen(g.X + (src.X - g.Crop.X) * k, g.Y + (src.Y - g.Crop.Y) * k); }
        var l = Find(g.LayerId)!;
        var kk = l.Scale;
        return ToScreen(l.X + (src.X - l.Crop.X) * kk, l.Y + (src.Y - l.Crop.Y) * kk);
    }

    void DrawAlign(DrawingContext dc)
    {
        if (_ghost is not { } g || Store == null) return;
        var bmp = Store.Bitmap(g.Asset);
        if (bmp != null && Store.Project.Assets.TryGetValue(g.Asset, out var info))
        {
            var k = g.W / g.Crop.W;
            var vis = new Rect(ToScreen(g.X, g.Y), ToScreen(g.X + g.W, g.Y + g.Crop.H * k));
            var full = new Rect(ToScreen(g.X - g.Crop.X * k, g.Y - g.Crop.Y * k),
                                ToScreen(g.X - g.Crop.X * k + info.W * k, g.Y - g.Crop.Y * k + info.H * k));
            dc.PushClip(new RectangleGeometry(vis));
            dc.PushOpacity(0.45);
            dc.DrawImage(bmp, full);
            dc.Pop();
            dc.Pop();
            dc.DrawRectangle(null, new Pen(Brushes.OrangeRed, 1.5) { DashStyle = DashStyles.Dash }, vis);
        }
        // Отмеченные точки: на прежней — оранжевые, на новой — зелёные.
        var l = Find(g.LayerId);
        for (var i = 0; i < _alignSrc.Count; i++)
        {
            var src = _alignSrc[i];
            Point wpt;
            if (i % 2 == 0) { var kk = g.W / g.Crop.W; wpt = new Point(g.X + (src.X - g.Crop.X) * kk, g.Y + (src.Y - g.Crop.Y) * kk); }
            else if (l != null) { var kk = l.Scale; wpt = new Point(l.X + (src.X - l.Crop.X) * kk, l.Y + (src.Y - l.Crop.Y) * kk); }
            else continue;
            var p = ToScreen(wpt.X, wpt.Y);
            var col = i % 2 == 0 ? Brushes.OrangeRed : Brushes.SeaGreen;
            dc.DrawEllipse(null, new Pen(col, 2.5), p, 9, 9);
            dc.DrawLine(new Pen(col, 1.5), new Point(p.X - 14, p.Y), new Point(p.X + 14, p.Y));
            dc.DrawLine(new Pen(col, 1.5), new Point(p.X, p.Y - 14), new Point(p.X, p.Y + 14));
            var ft = Text((i / 2 + 1).ToString(), 13, i % 2 == 0 ? Colors.OrangeRed : Colors.SeaGreen);
            dc.DrawText(ft, new Point(p.X + 10, p.Y - 22));
        }
    }

    // Преобразование подобия по двум парам точек: z' = a·z + b в комплексных
    // числах (a — масштаб и поворот, b — перенос).
    public static Func<Point, Point> Similarity(Point[] from, Point[] to)
    {
        var o1 = new System.Numerics.Complex(from[0].X, from[0].Y);
        var o2 = new System.Numerics.Complex(from[1].X, from[1].Y);
        var n1 = new System.Numerics.Complex(to[0].X, to[0].Y);
        var n2 = new System.Numerics.Complex(to[1].X, to[1].Y);
        if ((o2 - o1).Magnitude < 1e-6) return p => p;
        var a = (n2 - n1) / (o2 - o1);
        var b = n1 - a * o1;
        return p => { var z = a * new System.Numerics.Complex(p.X, p.Y) + b; return new Point(z.Real, z.Imaginary); };
    }

    // Рамка при подгонке: середина — по преобразованию, размер — по его
    // масштабу, наклон — плюс его поворот (а не описанный прямоугольник:
    // при повороте он раздувал бы рамку).
    public static (Box Box, double Angle) MapFrame(Box b, double angle, Func<Point, Point> f)
    {
        var p0 = f(new Point(0, 0));
        var p1 = f(new Point(1, 0));
        var v = p1 - p0;
        var k = v.Length;
        var rot = Math.Atan2(v.Y, v.X) * 180 / Math.PI;
        var c = f(new Point(b.X + b.W / 2, b.Y + b.H / 2));
        double w = b.W * k, h = b.H * k;
        return (new Box(c.X - w / 2, c.Y - h / 2, w, h), Norm(angle + rot));
    }

    public static Box MapBox(Box b, Func<Point, Point> f)
    {
        var pts = new[] { f(new Point(b.X, b.Y)), f(new Point(b.Right, b.Y)), f(new Point(b.Right, b.Bottom)), f(new Point(b.X, b.Bottom)) };
        double x0 = pts.Min(p => p.X), y0 = pts.Min(p => p.Y), x1 = pts.Max(p => p.X), y1 = pts.Max(p => p.Y);
        return new Box(x0, y0, x1 - x0, y1 - y0);
    }

    // --- таблица связей --------------------------------------------------

    const double TPad = 12, TNum = 74, THead = 52;

    // Размер шрифта таблицы — в единицах полотна: разворот шириной ~2500
    // единиц смотрят целиком при 35–50 %, и текст должен читаться.
    const double TFont = 26;

    List<(Link Link, double Y, double H)> TableRows(Layer l, out double total) => TableRows(Sheet!, l, out total);

    // Высота таблицы по строкам при её ширине — её же берут раскладки
    // разворота (LayerOps.Layout), чтобы части таблицы не наезжали.
    public static double TableHeight(Sheet s, Layer l)
    {
        TableRows(s, l, out var total);
        return total;
    }

    static List<(Link Link, double Y, double H)> TableRows(Sheet sheet, Layer l, out double total)
    {
        var rows = new List<(Link, double, double)>();
        var links = SheetGeo.Ordered(sheet);
        var from = Math.Clamp(l.TableFrom, 0, links.Count);
        var to = Math.Clamp(l.TableTo <= 0 ? links.Count : l.TableTo, from, links.Count);
        var col = (l.W - TNum) / 2;
        var y = l.Y + THead;
        for (var i = from; i < to; i++)
        {
            var k = links[i];
            var sys = Measure(k.SystemField, col - TPad * 2);
            if (k.Comment.Length > 0) sys += CommentGap + Measure(k.Comment, col - TPad * 2, TNote);
            var h = Math.Max(Measure(k.DocField, col - TPad * 2), sys) + TPad * 2;
            h = Math.Max(h, 58);
            rows.Add((k, y, h));
            y += h;
        }
        total = y - l.Y;
        return rows;
    }

    const double TNote = 21, CommentGap = 6;

    static double Measure(string text, double width, double size = TFont)
    {
        var ft = Text(string.IsNullOrEmpty(text) ? " " : text, size, Colors.Black);
        ft.MaxTextWidth = Math.Max(40, width);
        return ft.Height;
    }

    public Link? HitTableRow(Layer l, Point world)
    {
        foreach (var (k, y, h) in TableRows(l, out _))
            if (world.Y >= y && world.Y < y + h && world.X >= l.X && world.X <= l.X + l.W) return k;
        return null;
    }

    public Rect? TableRowRect(Link k)
    {
        if (Sheet == null) return null;
        foreach (var l in Sheet.Layers.Where(x => x.Kind == LayerKind.Table && !x.Hidden))
            foreach (var (kk, y, h) in TableRows(l, out _))
                if (kk.Id == k.Id) return new Rect(l.X, y, l.W, h);
        return null;
    }

    void DrawTable(DrawingContext dc, Layer l)
    {
        var rows = TableRows(l, out var total);
        // Высота слоя — по строкам: пишется в обрезку, чтобы слой знал свой
        // размер для выбора, прилипания и прокладки стрелок.
        if (Math.Abs(l.Crop.H - total) > 0.5 || Math.Abs(l.Crop.W - l.W) > 0.5) l.Crop = new Box(0, 0, l.W, total);
        var line = new Pen(new SolidColorBrush(Color.FromRgb(0xD5, 0xDD, 0xE3)), 1.2);
        var col = (l.W - TNum) / 2;
        dc.DrawRectangle(Brushes.White, line, new Rect(l.X, l.Y, l.W, total));
        var muted = Color.FromRgb(0x5F, 0x71, 0x80);
        var docName = Doc.DocName.Length > 0 ? Doc.DocName : "Документ";
        var head = new[] { ("№", l.X + TPad), (docName, l.X + TNum + TPad), ("Система", l.X + TNum + col + TPad) };
        foreach (var (t, x) in head)
        {
            var ft = Text(t.ToUpperInvariant(), 18, muted);
            dc.DrawText(ft, new Point(x, l.Y + (THead - ft.Height) / 2));
        }
        dc.DrawLine(line, new Point(l.X, l.Y + THead), new Point(l.X + l.W, l.Y + THead));
        var ordered = SheetGeo.Ordered(Sheet!);
        var ink = Color.FromRgb(0x1C, 0x2A, 0x35);
        foreach (var (k, y, h) in rows)
        {
            if (k.Id == LinkId) dc.DrawRectangle(new SolidColorBrush(Color.FromRgb(0xE3, 0xEE, 0xF6)), null, new Rect(l.X, y, l.W, h));
            var c = SheetGeo.Palette[ordered.IndexOf(k) % SheetGeo.Palette.Length];
            dc.DrawRoundedRectangle(new SolidColorBrush(c), null, new Rect(l.X + TPad, y + TPad, 44, 34), 17, 17);
            var nft = Text(k.N.ToString(), 20, Colors.White);
            dc.DrawText(nft, new Point(l.X + TPad + 22 - nft.Width / 2, y + TPad + 17 - nft.Height / 2));
            var d1 = Text(k.DocField, TFont, ink);
            d1.MaxTextWidth = Math.Max(40, col - TPad * 2);
            dc.DrawText(d1, new Point(l.X + TNum + TPad, y + TPad));
            var d2 = Text(k.SystemField, TFont, ink);
            d2.MaxTextWidth = Math.Max(40, col - TPad * 2);
            dc.DrawText(d2, new Point(l.X + TNum + col + TPad, y + TPad));
            if (k.Comment.Length > 0)
            {
                var d3 = Text(k.Comment, TNote, muted);
                d3.MaxTextWidth = Math.Max(40, col - TPad * 2);
                dc.DrawText(d3, new Point(l.X + TNum + col + TPad, y + TPad + Measure(k.SystemField, col - TPad * 2) + CommentGap));
            }
            dc.DrawLine(line, new Point(l.X, y + h), new Point(l.X + l.W, y + h));
        }
    }


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
        if (l.Kind == LayerKind.Table)
        {
            // Таблица тянется только по ширине, высота — по строкам.
            var left = _handle is 0 or 3;
            var ax0 = left ? o.X + o.W : o.X;
            var tw = Math.Max(300, Math.Abs(w.X - ax0));
            l.W = tw;
            l.Crop = new Box(0, 0, tw, l.Crop.H);
            l.X = left ? ax0 - tw : ax0;
            return;
        }
        var c0 = OrigCenter(o);
        // Указатель — в оси слоя (до поворота).
        if (l.Rotation != 0) w = SheetGeo.Rotate(w, c0, -l.Rotation);
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
        KeepPlaced(l, c0);
    }

    // Обрезка: ручка двигает сторону видимой части; картинка на полотне стоит
    // на месте — меняются Crop и рамка слоя в тех же пропорциях.
    void CropResize(Point w)
    {
        var (id, o) = _orig.First();
        var l = Find(id)!;
        var info = Store!.Project.Assets[l.Asset!];
        var c0 = OrigCenter(o);
        if (l.Rotation != 0) w = SheetGeo.Rotate(w, c0, -l.Rotation);
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
        KeepPlaced(l, c0);
    }

    // Перетаскивание внутри рамки обрезки сдвигает картинку под ней.
    void CropPan(Vector dw)
    {
        var (id, o) = _orig.First();
        var l = Find(id)!;
        var info = Store!.Project.Assets[l.Asset!];
        var s = o.W / o.Crop.W;
        dw = SheetGeo.Rotate(dw, -l.Rotation);
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
