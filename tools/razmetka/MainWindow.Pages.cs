using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Razmetka.Editor;
using Razmetka.Model;
using Razmetka.Ui;

namespace Razmetka;

// Вкладки разворотов внизу и развороты подряд (практика razmetka-dokumentov-
// vkladki-razvorotov-vnizu-i-razvoroty-podryad; пользователь 29.09.2026: «снизу
// сделать переключение между страницами… как в excel или corel draw… надо —
// переключил режим и у тебя уже вертикально страницы по порядку»).
//
// Вкладки — развороты текущей главы (CorelDRAW: навигатор документа):
// ‹ › — предыдущий / следующий, «+» — новый после текущего, правая кнопка —
// меню, перетаскивание — порядок, двойной щелчок — переименовать; слева —
// выбор главы, справа — «Один / Подряд».
//
// «Подряд» (CorelDRAW Multipage view): все развороты проекта столбцом по
// главам. Картинка разворота рисуется, когда карточка на экране, и
// перерисовывается после правки; прокрутка ведёт за собой текущий разворот;
// двойной щелчок или Enter — открыть для правки.
public partial class MainWindow
{
    bool _flow;
    int _version;
    readonly Dictionary<string, (int Ver, double Width, BitmapSource Img)> _flowCache = new();
    readonly Dictionary<string, (Border Card, Image Img, Chapter Ch, Sheet Sh)> _flowCards = new();
    readonly DispatcherTimer _flowTimer = new() { Interval = TimeSpan.FromMilliseconds(120) };
    double _flowZoom = 1;
    Point? _tabDragFrom;

    void InitPages()
    {
        TabPrev.Click += (_, _) => StepSheet(-1);
        TabNext.Click += (_, _) => StepSheet(1);
        TabAdd.Click += (_, _) => AddSheet();
        TabList.Click += (_, _) => _cmds.Execute("go.sheet");
        TabChapter.Click += (_, _) => OpenMenu(ChapterMenu(), TabChapter);
        TabPrev.ToolTip = "Предыдущий разворот — PageUp или Ctrl+PageUp";
        TabNext.ToolTip = "Следующий разворот — PageDown или Ctrl+PageDown";
        TabAdd.ToolTip = "Новый разворот после текущего — Ctrl+Shift+N";
        TabList.ToolTip = "Все развороты проекта — Ctrl+P";
        TabScroll.PreviewMouseWheel += (_, e) => { TabScroll.ScrollToHorizontalOffset(TabScroll.HorizontalOffset - e.Delta); e.Handled = true; };
        Flow.ScrollChanged += (_, _) => { _flowTimer.Stop(); _flowTimer.Start(); };
        Flow.PreviewMouseWheel += (_, e) =>
        {
            if (Keyboard.Modifiers != ModifierKeys.Control) return;
            _flowZoom = Math.Clamp(_flowZoom * (e.Delta > 0 ? 1.15 : 1 / 1.15), 0.3, 1.6);
            BuildFlow(keepCurrent: true);
            e.Handled = true;
        };
        Flow.SizeChanged += (_, e) => { if (_flow && Math.Abs(e.NewSize.Width - e.PreviousSize.Width) > 40) BuildFlow(keepCurrent: true); };
        _flowTimer.Tick += (_, _) => { _flowTimer.Stop(); FlowScrolled(); };
        // Узкая полоса: у главы — значок (название — в подсказке), переключатель
        // уже; вкладкам остаётся место.
        TabBar.SizeChanged += (_, _) =>
        {
            var tight = TabBar.ActualWidth < 700;
            TabChapterText.Visibility = tight ? Visibility.Collapsed : Visibility.Visible;
            FlowSeg.Width = tight ? 120 : 150;
        };
    }

    // --- вкладки -------------------------------------------------------------

    void BuildTabs()
    {
        TabStrip.Children.Clear();
        TabBar.Visibility = _store != null && _chapter != null ? Visibility.Visible : Visibility.Collapsed;
        if (_store == null || _chapter == null) return;
        TabChapterText.Text = _chapter.Title.Length > 0 ? _chapter.Title : "Без названия";
        TabChapter.ToolTip = $"Глава: {_chapter.Title}. Щелчок — другая глава";
        var issues = _issues.GroupBy(i => i.Sheet).ToDictionary(g => g.Key, g => g.Any(x => x.Error));
        var ch = _chapter;
        FrameworkElement? current = null;
        for (var i = 0; i < ch.Sheets.Count; i++)
        {
            var sh = ch.Sheets[i];
            var on = sh == _sheet;
            var p = new StackPanel { Orientation = Orientation.Horizontal };
            p.Children.Add(Kit.Text($"{i + 1}", 12, on ? "Accent" : "Faint", FontWeights.SemiBold).Also(t => t.Margin = new Thickness(0, 0, 6, 0)));
            p.Children.Add(Kit.Text(sh.Title.Length > 0 ? sh.Title : "Без названия", 12, on ? "Ink" : "Muted", on ? FontWeights.SemiBold : FontWeights.Normal)
                .Also(t => t.MaxWidth = 160));
            if (issues.TryGetValue(sh, out var err))
                p.Children.Add(new Border { Width = 6, Height = 6, CornerRadius = new CornerRadius(3), Margin = new Thickness(6, 1, 0, 0), Background = Kit.B(err ? "Danger" : "Warn") });
            // Вкладка текущего — белая, «приподнятая», с чертой акцента сверху
            // (Excel, CorelDRAW); остальные — плоские.
            var tab = new Border
            {
                Child = p, Padding = new Thickness(10, 5, 10, 6), Margin = new Thickness(0, 0, 2, 0), Cursor = Cursors.Hand,
                CornerRadius = new CornerRadius(0, 0, 4, 4), Background = on ? Kit.B("Card") : Brushes.Transparent,
                BorderBrush = on ? Kit.B("Accent") : Brushes.Transparent, BorderThickness = new Thickness(0, 2, 0, 0),
                ToolTip = $"{sh.Title}{(sh.Page.Length > 0 ? " · " + sh.Page : "")} · связей {sh.Links.Count}\nДвойной щелчок — переименовать; перетаскивание — порядок; правая кнопка — меню",
                AllowDrop = true, Tag = sh,
            };
            var s0 = sh;
            tab.MouseEnter += (_, _) => { if (s0 != _sheet) tab.Background = Kit.B("Hover"); };
            tab.MouseLeave += (_, _) => { if (s0 != _sheet) tab.Background = Brushes.Transparent; };
            tab.MouseLeftButtonDown += (_, e) =>
            {
                if (e.ClickCount == 2) { FocusInspectorField("title"); e.Handled = true; return; }
                _tabDragFrom = e.GetPosition(TabStrip);
                if (s0 != _sheet) OpenSheet(ch, s0);
            };
            tab.MouseMove += (_, e) =>
            {
                if (_tabDragFrom is not { } from || e.LeftButton != MouseButtonState.Pressed) return;
                if (Math.Abs(e.GetPosition(TabStrip).X - from.X) < 8) return;
                _tabDragFrom = null;
                DragDrop.DoDragDrop(tab, new DataObject(typeof(Sheet), s0), DragDropEffects.Move);
            };
            tab.MouseLeftButtonUp += (_, _) => _tabDragFrom = null;
            tab.DragOver += (_, e) => { e.Effects = e.Data.GetDataPresent(typeof(Sheet)) ? DragDropEffects.Move : DragDropEffects.None; e.Handled = true; };
            tab.Drop += (_, e) =>
            {
                if (e.Data.GetData(typeof(Sheet)) is not Sheet moved || moved == s0 || !ch.Sheets.Contains(moved)) return;
                var to = ch.Sheets.IndexOf(s0);
                MoveSheet(ch, moved, to - ch.Sheets.IndexOf(moved));
                e.Handled = true;
            };
            var m = new ContextMenu();
            var idx = i;
            AddAll(m,
                Mi("Открыть", () => OpenSheet(ch, s0)),
                Mi("Переименовать", () => { OpenSheet(ch, s0); FocusInspectorField("title"); }, "F2"),
                new Separator(),
                Mi("Новый разворот перед", () => InsertSheet(ch, idx)),
                Mi("Новый разворот после", () => InsertSheet(ch, idx + 1), "Ctrl+Shift+N"),
                new Separator(),
                idx > 0 ? Mi("Сдвинуть влево", () => MoveSheet(ch, s0, -1), "Alt+←") : null,
                idx < ch.Sheets.Count - 1 ? Mi("Сдвинуть вправо", () => MoveSheet(ch, s0, 1), "Alt+→") : null,
                new Separator(),
                Mi("Удалить разворот…", () => DeleteSheet(ch, s0)));
            tab.ContextMenu = m;
            TabStrip.Children.Add(tab);
            if (on) current = tab;
        }
        TabPrev.IsEnabled = AllSheets().FirstOrDefault().Sh != _sheet;
        TabNext.IsEnabled = AllSheets().LastOrDefault().Sh != _sheet;
        FlowSeg.Child = Kit.Segmented(new List<(string, string, string?)>
        {
            ("one", "Один", "Один разворот на полотне — править"),
            ("flow", "Подряд", "Все развороты столбцом по порядку — Ctrl+Shift+V"),
        }, _flow ? "flow" : "one", v => SetFlow(v == "flow"));
        if (current != null) Dispatcher.BeginInvoke(() => current.BringIntoView(), DispatcherPriority.Loaded);
    }

    ContextMenu ChapterMenu()
    {
        var m = new ContextMenu();
        foreach (var c in _store!.Project.Chapters)
        {
            var cc = c;
            m.Items.Add(Check($"{c.Title} · разворотов {c.Sheets.Count}", c == _chapter, () => OpenSheet(cc, cc.Sheets.FirstOrDefault())));
        }
        AddAll(m, new Separator(), Mc("sheet.chapter"), Mc("sheet.pdf"));
        return m;
    }

    void InsertSheet(Chapter ch, int at)
    {
        Sheet? sh = null;
        Edit("Новый разворот", () => { sh = new Sheet { Title = $"Разворот {ch.Sheets.Count + 1}" }; ch.Sheets.Insert(Math.Clamp(at, 0, ch.Sheets.Count), sh); });
        OpenSheet(ch, sh);
        FocusInspectorField("title");
    }

    // Открыть разворот: в режиме «Подряд» — прокрутить к нему.
    void OpenSheet(Chapter? ch, Sheet? sh)
    {
        PickSheet(ch, sh);
        if (_flow && sh != null) ScrollFlowTo(sh);
    }

    // --- подряд ------------------------------------------------------------------

    void LeaveFlow()
    {
        if (!_flow) return;
        _flow = false;
        Flow.Visibility = Visibility.Collapsed;
        View.Visibility = Pops.Visibility = Visibility.Visible;
        FlowHost.Children.Clear();
        _flowCards.Clear();
        _flowCache.Clear();
    }

    void SetFlow(bool on)
    {
        if (_store == null || on == _flow) { BuildTabs(); return; }
        _flow = on;
        if (on)
        {
            CloseEditor();
            ResetTools();
            View.EndCrop();
            View.ClearSelection();
            View.SelectLink(null);
            ClearPops();
            BuildFlow(keepCurrent: false);
            if (_sheet != null) ScrollFlowTo(_sheet);
            Status("Развороты подряд: прокрутка — по порядку, двойной щелчок или Enter — править разворот, Ctrl+колесо — крупнее");
            Dispatcher.BeginInvoke(() => Flow.Focus(), DispatcherPriority.Input);
        }
        else
        {
            FlowHost.Children.Clear();
            _flowCards.Clear();
            _store.KeepOnly(_sheet?.Layers.Select(l => l.Asset) ?? Enumerable.Empty<string?>());
            View.FitAll();
            FocusCanvas();
        }
        Flow.Visibility = on ? Visibility.Visible : Visibility.Collapsed;
        // Hidden, а не Collapsed: размер полотна нужен, чтобы вписать разворот.
        View.Visibility = Pops.Visibility = on ? Visibility.Hidden : Visibility.Visible;
        UpdateAll();
    }

    double FlowCardWidth => Math.Max(320, Math.Min(Flow.ActualWidth - 64, 1100) * _flowZoom);

    void BuildFlow(bool keepCurrent)
    {
        if (!_flow || _store == null) return;
        var keep = keepCurrent ? _sheet : null;
        FlowHost.Children.Clear();
        _flowCards.Clear();
        var w = FlowCardWidth;
        var issues = _issues.GroupBy(i => i.Sheet).ToDictionary(g => g.Key, g => g.Any(x => x.Error));
        foreach (var ch in _store.Project.Chapters)
        {
            var head = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, FlowHost.Children.Count == 0 ? 8 : 28, 0, 10), Width = w };
            head.Children.Add(Kit.Text(ch.Title.Length > 0 ? ch.Title : "Без названия", 16, "Ink", FontWeights.SemiBold));
            if (ch.DocName.Length > 0) head.Children.Add(Kit.Chip(ch.DocName, "Hover", "Muted").Also(c => c.Margin = new Thickness(10, 2, 0, 0)));
            FlowHost.Children.Add(head);
            for (var i = 0; i < ch.Sheets.Count; i++)
            {
                var sh = ch.Sheets[i];
                var (bw, bh) = SheetSize(sh);
                var img = new Image { Width = w - 2, Height = Math.Max(60, (w - 2) * bh / bw), Stretch = Stretch.Uniform };
                RenderOptions.SetBitmapScalingMode(img, BitmapScalingMode.HighQuality);
                var ph = new Border { Background = Kit.B("Hover"), Child = img };
                var top = new DockPanel { Margin = new Thickness(14, 10, 14, 10) };
                var meta = new StackPanel { Orientation = Orientation.Horizontal };
                if (issues.TryGetValue(sh, out var err))
                    meta.Children.Add(new Border { Width = 8, Height = 8, CornerRadius = new CornerRadius(4), Margin = new Thickness(0, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center, Background = Kit.B(err ? "Danger" : "Warn") });
                meta.Children.Add(Kit.Text((sh.Page.Length > 0 ? sh.Page + " · " : "") + (sh.Links.Count == 0 ? "нет связей" : $"связей {sh.Links.Count}"), 12, "Muted"));
                DockPanel.SetDock(meta, Dock.Right);
                top.Children.Add(meta);
                top.Children.Add(Kit.Text($"{i + 1}. {(sh.Title.Length > 0 ? sh.Title : "Без названия")}", 13, "Ink", FontWeights.SemiBold));
                var body = new DockPanel();
                DockPanel.SetDock(top, Dock.Top);
                body.Children.Add(top);
                body.Children.Add(ph);
                var card = new Border
                {
                    Width = w, Margin = new Thickness(0, 0, 0, 16), Background = Kit.B("Card"), CornerRadius = new CornerRadius(8),
                    BorderThickness = new Thickness(sh == _sheet ? 2 : 1), BorderBrush = Kit.B(sh == _sheet ? "Accent" : "Line"),
                    Child = body, ClipToBounds = true, Cursor = Cursors.Hand, Tag = sh,
                    ToolTip = "Щелчок — выбрать, двойной щелчок — править",
                };
                var (c0, s0) = (ch, sh);
                card.MouseLeftButtonDown += (_, e) =>
                {
                    if (e.ClickCount == 2) { SetFlow(false); e.Handled = true; return; }
                    if (s0 != _sheet) { _flowPicking = true; PickSheet(c0, s0); _flowPicking = false; }
                };
                var m = new ContextMenu();
                AddAll(m, Mi("Править разворот", () => { PickSheet(c0, s0); SetFlow(false); }, "Enter"),
                    Mi("Переименовать", () => { PickSheet(c0, s0); FocusInspectorField("title"); }, "F2"),
                    new Separator(), Mi("Удалить разворот…", () => DeleteSheet(c0, s0)));
                card.ContextMenu = m;
                FlowHost.Children.Add(card);
                _flowCards[sh.Id] = (card, img, ch, sh);
            }
        }
        if (keep != null) ScrollFlowTo(keep);
        Dispatcher.BeginInvoke(RenderVisibleFlow, DispatcherPriority.Background);
    }

    bool _flowPicking;

    // Размер разворота в единицах полотна — для места под картинку до того,
    // как она нарисована (прокрутка не прыгает).
    (double W, double H) SheetSize(Sheet sh)
    {
        var r = Rect.Empty;
        foreach (var l in sh.Layers.Where(l => !l.Hidden))
            r.Union(new Rect(l.X, l.Y, l.W, Math.Max(l.Kind == LayerKind.Table ? SheetView.TableHeight(sh, l) : l.H, 1)));
        if (r.IsEmpty) return (400, 300);
        return (r.Width + 80, r.Height + 110);
    }

    // Рисуются только карточки на экране и рядом; перерисовка — если разворот
    // правили (номер версии) или карточка стала шире.
    // По одной карточке за раз, в паузах (Background): прокрутка не ждёт
    // картинки (замер 29.09.2026: карточка посреди прокрутки — рывок 119 мс).
    bool _flowQueued;

    void RenderVisibleFlow()
    {
        if (!_flow || _store == null || _flowQueued) return;
        _flowQueued = true;
        Dispatcher.BeginInvoke(RenderNextFlowCard, DispatcherPriority.Background);
    }

    void RenderNextFlowCard()
    {
        _flowQueued = false;
        if (!_flow || _store == null) return;
        var ppd = VisualTreeHelper.GetDpi(this).PixelsPerDip;
        var top = -Flow.ActualHeight;
        var bottom = Flow.ActualHeight * 2;
        foreach (var (id, (card, img, ch, sh)) in _flowCards)
        {
            if (!card.IsVisible) continue;
            var y = card.TranslatePoint(new Point(0, 0), Flow).Y;
            if (y + card.ActualHeight < top || y > bottom) continue;
            var want = img.Width * ppd;
            if (_flowCache.TryGetValue(id, out var c) && c.Ver == _version && c.Width >= want * 0.95) { img.Source = c.Img; continue; }
            var v = new SheetView { Store = _store, Doc = new DocInfo(ch.Title, ch.DocName) };
            v.SetSheet(sh);
            var b = v.Bounds();
            if (b.IsEmpty) { img.Source = null; continue; }
            var bmp = v.RenderBitmap(want / (b.Width + 80), out _, native: false);
            _flowCache[id] = (_version, want, bmp);
            img.Source = bmp;
            // Следующая — в следующую паузу.
            RenderVisibleFlow();
            return;
        }
        // Полные картинки для рисования больше не нужны — память под текущий.
        _store.KeepOnly(_sheet?.Layers.Select(l => l.Asset) ?? Enumerable.Empty<string?>());
    }

    void ScrollFlowTo(Sheet sh)
    {
        if (!_flowCards.TryGetValue(sh.Id, out var c)) return;
        Dispatcher.BeginInvoke(() =>
        {
            var y = c.Card.TranslatePoint(new Point(0, 0), FlowHost).Y;
            Flow.ScrollToVerticalOffset(Math.Max(0, y - 24));
        }, DispatcherPriority.Loaded);
    }

    // Прокрутка: текущим становится разворот, чья карточка — у верхней трети
    // окна; вкладки, список и свойства — за ним.
    void FlowScrolled()
    {
        RenderVisibleFlow();
        if (!_flow || _flowPicking) return;
        var line = Flow.ActualHeight / 3;
        foreach (var (_, (card, _, ch, sh)) in _flowCards)
        {
            var y = card.TranslatePoint(new Point(0, 0), Flow).Y;
            if (y <= line && y + card.ActualHeight > line)
            {
                if (sh != _sheet) { _flowPicking = true; PickSheet(ch, sh); _flowPicking = false; }
                break;
            }
        }
    }

    // После правки или смены разворота — рамка текущего и новые картинки.
    void SyncFlow()
    {
        if (!_flow) return;
        foreach (var (_, (card, _, _, sh)) in _flowCards)
        {
            card.BorderThickness = new Thickness(sh == _sheet ? 2 : 1);
            card.BorderBrush = Kit.B(sh == _sheet ? "Accent" : "Line");
        }
        var ids = _store?.Project.Chapters.SelectMany(c => c.Sheets).Select(s => s.Id).ToList() ?? new();
        if (ids.Count != _flowCards.Count || !ids.SequenceEqual(_flowCards.Keys)) BuildFlow(keepCurrent: true);
        else Dispatcher.BeginInvoke(RenderVisibleFlow, DispatcherPriority.Background);
    }
}
