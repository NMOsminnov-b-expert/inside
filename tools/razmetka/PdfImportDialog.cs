using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Razmetka.Ui;

namespace Razmetka;

// Документ из PDF: какие страницы взять и куда — новой главой или в
// выбранную. Каждая страница становится разворотом со страницей-слоем.
//
// Страницы выбираются по миниатюрам, как в панели страниц программ для PDF
// (PDF-XChange, PaperPort, Acrobat): щелчок отмечает или снимает страницу,
// Shift+щелчок — всё от предыдущей, Ctrl+A — все. Поле «1-3, 5» — тот же
// выбор текстом, они сходятся в обе стороны. Жалоба пользователя 27.10.2026
// («совсем не интуитивно понятный»): прежде страницы задавались только
// строкой, вслепую, без вида страниц.
public sealed class PdfImportDialog : Window
{
    readonly string _path;
    readonly int _count;
    readonly HashSet<int> _sel;
    readonly List<Border> _tiles = new();
    readonly TextBox _pages = Kit.Box();
    readonly AutoBox _doc;
    readonly TextBox _chapter = Kit.Box();
    readonly ComboBox _dest = new() { MinHeight = 30, VerticalContentAlignment = VerticalAlignment.Center };
    readonly ComboBoxItem _new = new() { Content = "Новой главой", Tag = "new" };
    readonly ComboBoxItem _cur = new() { Tag = "chapter" };
    readonly ComboBoxItem _here = new() { Tag = "sheet" };
    readonly Border _layoutHost = new();
    string _layout = "sheets";
    readonly bool _hasSheet;
    readonly Button _ok;
    readonly TextBlock _summary = Kit.Text("", 12, "Muted");
    readonly CancellationTokenSource _thumbsCts = new();
    int _anchor = -1;
    bool _syncing;

    // Сколько миниатюр уже показано — для сценариев проверки.
    public int ThumbsShown { get; private set; }

    public string DocName => _doc.Text.Trim();
    public string ChapterTitle => _chapter.Text.Trim();
    public IReadOnlyList<int> SelectedPages => _sel.OrderBy(x => x).ToList();
    public bool NewChapter => Dest == "new";
    // Раскладка (пользователь 27.10.2026: «выбираем, разбивать по страницам
    // или поместить все на 1 страницу в вертикальном/горизонтальном виде»):
    // "sheets" — каждая страница своим разворотом, "column" — все на один
    // разворот столбиком, "row" — в ряд.
    public string Layout => _layout;
    // Куда: "new" — новая глава, "chapter" — в выбранную главу, "sheet" — на
    // открытый разворот (только для раскладки на один разворот).
    public string Dest => (_dest.SelectedItem as ComboBoxItem)?.Tag as string ?? "new";

    public PdfImportDialog(string path, int count, string? currentChapter, IEnumerable<string> knownDocs,
        string? currentSheet = null, bool here = false)
    {
        _path = path;
        _count = count;
        _sel = Enumerable.Range(1, count).ToHashSet();
        Title = "Документ из PDF";
        Width = 800;
        Height = 700;
        MinWidth = 560;
        MinHeight = 540;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        FontFamily = (FontFamily)Application.Current.Resources["UiFont"];
        FontSize = 13;
        Background = Kit.B("Panel");
        Foreground = Kit.B("Ink");

        var name = Path.GetFileNameWithoutExtension(path);
        var docs = knownDocs.Where(d => !string.IsNullOrWhiteSpace(d)).Concat(new[] { "Госакт", "Техпаспорт" }).Distinct().ToList();
        _doc = new AutoBox(q => docs.Where(d => d.Contains(q, StringComparison.OrdinalIgnoreCase)));
        _doc.Text = name.Contains("госакт", StringComparison.OrdinalIgnoreCase) ? "Госакт"
            : name.Contains("техпаспорт", StringComparison.OrdinalIgnoreCase) ? "Техпаспорт" : "Документ";
        _chapter.Text = $"Перенос: {name}";
        _cur.Content = currentChapter != null ? $"В главу «{currentChapter}»" : "В выбранную главу";
        _cur.IsEnabled = currentChapter != null;
        _hasSheet = currentSheet != null;
        _here.Content = currentSheet != null ? $"На разворот «{currentSheet}»" : "На открытый разворот";
        _dest.Items.Add(_new);
        _dest.Items.Add(_cur);
        _dest.Items.Add(_here);
        _dest.SelectedItem = _new;
        _dest.SelectionChanged += (_, _) => _chapter.IsEnabled = Dest == "new";
        // Вставка PDF на открытый разворот (Ctrl+V файла, перетаскивание на
        // разворот) — сразу «все на один, столбиком, сюда».
        if (here && _hasSheet) { _layout = "column"; _here.IsEnabled = true; _dest.SelectedItem = _here; }

        // --- шапка: файл и быстрый выбор ------------------------------------
        var head = new DockPanel { Margin = new Thickness(16, 14, 16, 8) };
        var quick = new StackPanel { Orientation = Orientation.Horizontal };
        quick.Children.Add(Kit.TextBtn("Все", "Ctrl+A", () => SetAll(true)));
        var none = Kit.TextBtn("Снять все", null, () => SetAll(false));
        none.Margin = new Thickness(4, 0, 0, 0);
        quick.Children.Add(none);
        DockPanel.SetDock(quick, Dock.Right);
        head.Children.Add(quick);
        var file = new StackPanel();
        var fn = Kit.Text(Path.GetFileName(path), 14, "Ink", FontWeights.SemiBold);
        fn.TextTrimming = TextTrimming.CharacterEllipsis;
        fn.ToolTip = path;
        file.Children.Add(fn);
        file.Children.Add(_summary);
        head.Children.Add(file);

        // --- миниатюры ------------------------------------------------------
        var grid = new WrapPanel { Margin = new Thickness(12, 4, 12, 12) };
        for (var i = 1; i <= count; i++) grid.Children.Add(Tile(i));
        var scroll = new ScrollViewer
        {
            Content = grid, VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled, Background = Kit.B("Ground"),
        };

        // --- куда и как назвать --------------------------------------------
        var form = new StackPanel { Margin = new Thickness(0, 12, 0, 0) };
        var row = new Grid();
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var fPages = Kit.Field("Страницы", _pages, tip: "1-3, 5 — или щелчками по миниатюрам; Shift — диапазон");
        _pages.ToolTip = "1-3, 5 — или щелчками по миниатюрам; Shift — диапазон";
        var fDoc = Kit.Field("Документ в таблице связей", _doc);
        Grid.SetColumn(fDoc, 1);
        row.Children.Add(fPages);
        row.Children.Add(fDoc);
        form.Children.Add(row);
        // «Куда» и название главы — одной строкой: на низком окне миниатюрам
        // остаётся больше места.
        BuildLayout();
        form.Children.Add(Kit.Field("Раскладка", _layoutHost));
        var row2 = new Grid();
        row2.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row2.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var fWhere = Kit.Field("Куда", _dest);
        var fChapter = Kit.Field("Название новой главы", _chapter);
        Grid.SetColumn(fChapter, 1);
        row2.Children.Add(fWhere);
        row2.Children.Add(fChapter);
        form.Children.Add(row2);

        _ok = new Button { Style = Kit.S("PrimaryBtn"), IsDefault = true, Padding = new Thickness(16, 5, 16, 5), Margin = new Thickness(0, 0, 8, 0) };
        _ok.Click += (_, _) => { if (_sel.Count > 0) DialogResult = true; };
        var cancel = new Button { Style = Kit.S("ToolBtn"), Content = "Отмена", IsCancel = true, Padding = new Thickness(14, 5, 14, 5) };
        var bar = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(16, 0, 16, 14) };
        bar.Children.Add(_ok);
        bar.Children.Add(cancel);
        form.Children.Add(bar);

        var root = new DockPanel { Background = Kit.B("Panel") };
        DockPanel.SetDock(head, Dock.Top);
        DockPanel.SetDock(form, Dock.Bottom);
        root.Children.Add(head);
        root.Children.Add(form);
        root.Children.Add(scroll);
        Content = root;

        _pages.TextChanged += (_, _) =>
        {
            if (_syncing) return;
            _sel.Clear();
            if (!string.IsNullOrWhiteSpace(_pages.Text)) _sel.UnionWith(Model.PdfPages.ParseRange(_pages.Text, _count));
            Refresh(fromText: true);
        };
        PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.A && Keyboard.Modifiers == ModifierKeys.Control && !(Keyboard.FocusedElement is TextBox)) { SetAll(true); e.Handled = true; }
        };
        Loaded += (_, _) => { Refresh(); _ok.Focus(); _ = LoadThumbs(); };
        Closed += (_, _) => _thumbsCts.Cancel();
    }

    void BuildLayout()
    {
        _layoutHost.Child = Kit.Segmented(new (string, string, string?)[]
        {
            ("sheets", "По разворотам", "Каждая страница — свой разворот"),
            ("column", "Столбиком на один", "Все страницы на один разворот, сверху вниз"),
            ("row", "В ряд на один", "Все страницы на один разворот, слева направо"),
        }, _layout, k => { _layout = k; BuildLayout(); SyncDest(); });
        SyncDest();
    }

    // «На разворот» — только когда все страницы ложатся на один разворот.
    void SyncDest()
    {
        _here.IsEnabled = _hasSheet && _layout != "sheets";
        if (_dest.SelectedItem == _here && !_here.IsEnabled) _dest.SelectedItem = _cur.IsEnabled ? _cur : _new;
        if (_ok != null) Refresh();
    }

    Border Tile(int page)
    {
        var img = new Image { Stretch = Stretch.Uniform, Height = 132, Width = 100 };
        RenderOptions.SetBitmapScalingMode(img, BitmapScalingMode.HighQuality);
        var sheet = new Border { Background = Brushes.White, BorderBrush = Kit.B("Line"), BorderThickness = new Thickness(1), Child = img, Height = 134, Width = 102 };
        var tick = new Border
        {
            Width = 20, Height = 20, CornerRadius = new CornerRadius(10), Background = Kit.B("Accent"),
            HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, -6, -6, 0),
            Child = new TextBlock { Text = "", FontFamily = Kit.Icons, FontSize = 11, Foreground = Brushes.White, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center },
        };
        var g = new Grid();
        g.Children.Add(sheet);
        g.Children.Add(tick);
        var label = Kit.Text($"стр. {page}", 12, "Muted");
        label.HorizontalAlignment = HorizontalAlignment.Center;
        label.Margin = new Thickness(0, 6, 0, 0);
        var stack = new StackPanel();
        stack.Children.Add(g);
        stack.Children.Add(label);
        var b = new Border
        {
            Child = stack, Padding = new Thickness(8), Margin = new Thickness(4), CornerRadius = new CornerRadius(6),
            BorderThickness = new Thickness(2), Cursor = Cursors.Hand, Tag = (page, img, tick, label),
            ToolTip = $"Страница {page}: щелчок — отметить или снять; Shift — диапазон",
        };
        b.MouseLeftButtonUp += (_, e) => { Click(page); e.Handled = true; };
        b.MouseEnter += (_, _) => { if (!_sel.Contains(page)) b.Background = Kit.B("Hover"); };
        b.MouseLeave += (_, _) => Paint(b);
        _tiles.Add(b);
        return b;
    }

    void Click(int page) => Toggle(page, Keyboard.Modifiers.HasFlag(ModifierKeys.Shift));

    // Щелчок по миниатюре; shift — диапазон от предыдущей. Открыт и для
    // сценариев проверки (ScriptRunner, шаг pdfDialog).
    public void Toggle(int page, bool shift)
    {
        if (shift && _anchor > 0)
        {
            var on = _sel.Contains(_anchor);
            for (var i = Math.Min(_anchor, page); i <= Math.Max(_anchor, page); i++) { if (on) _sel.Add(i); else _sel.Remove(i); }
        }
        else if (!_sel.Remove(page)) _sel.Add(page);
        _anchor = page;
        Refresh();
    }

    void SetAll(bool on)
    {
        _sel.Clear();
        if (on) _sel.UnionWith(Enumerable.Range(1, _count));
        Refresh();
    }

    void Refresh(bool fromText = false)
    {
        foreach (var t in _tiles) Paint(t);
        if (!fromText)
        {
            _syncing = true;
            _pages.Text = Model.PdfPages.FormatRange(_sel);
            _syncing = false;
        }
        var n = _sel.Count;
        _ok.Content = n == 0 ? "Отметьте страницы" : $"Добавить: {n} стр.";
        _ok.IsEnabled = n > 0;
        _summary.Text = $"Страниц в файле: {_count} · отмечено: {n}";
    }

    void Paint(Border b)
    {
        var (page, _, tick, label) = ((int, Image, Border, TextBlock))b.Tag;
        var on = _sel.Contains(page);
        b.BorderBrush = on ? Kit.B("Accent") : Brushes.Transparent;
        b.Background = on ? Kit.B("AccentSoft") : Brushes.Transparent;
        tick.Visibility = on ? Visibility.Visible : Visibility.Hidden;
        label.Foreground = on ? Kit.B("AccentText") : Kit.B("Muted");
        b.Opacity = on ? 1 : 0.75;
    }

    // Миниатюры рисуются в фоне и появляются по мере готовности: окно
    // открывается сразу, выбирать можно, не дожидаясь их.
    async Task LoadThumbs()
    {
        var dir = Path.Combine(Path.GetTempPath(), $"razmetka-thumbs-{Guid.NewGuid():N}");
        try
        {
            await Model.PdfPages.RenderMany(_path, Enumerable.Range(1, _count).ToList(), Model.PdfPages.ThumbDpi, dir,
                p => Dispatcher.BeginInvoke(() => ShowThumb(dir, p)), _thumbsCts.Token);
        }
        catch (Exception) { /* без миниатюр окно работает: номер страницы виден */ }
        finally
        {
            // Картинки читаются в память целиком (OnLoad) — папку можно убирать.
            await Dispatcher.InvokeAsync(() => { });
            try { Directory.Delete(dir, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
    }

    void ShowThumb(string dir, int page)
    {
        if (page < 1 || page > _tiles.Count) return;
        try
        {
            var bmp = new BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = BitmapCacheOption.OnLoad;
            bmp.UriSource = new Uri(Model.PdfPages.PagePng(dir, page));
            bmp.EndInit();
            bmp.Freeze();
            var (_, img, _, _) = ((int, Image, Border, TextBlock))_tiles[page - 1].Tag;
            img.Source = bmp;
            ThumbsShown++;
        }
        catch (Exception) { }
    }
}
