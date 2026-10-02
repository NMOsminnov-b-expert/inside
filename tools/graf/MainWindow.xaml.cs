using Graf.Model;
using Graf.Views;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Markup;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using Microsoft.UI.Xaml.Automation;

namespace Graf;

public sealed partial class MainWindow : Window
{
    public Store? Store { get; private set; }
    public GraphView GraphCtl => Graph;
    public RecordPanel PanelCtl => Panel;

    readonly Settings _settings = Settings.Load();
    readonly bool _remember;
    readonly HashSet<string> _foldersOff = new();
    readonly HashSet<string> _statusOff = new();
    readonly HashSet<string> _tagsOn = new();
    List<Record> _matches = new();
    int _matchAt = -1;
    // Поиск по смыслу (решение пользователя 02.10.2026): индекс — выгрузка
    // semantic_export.py, вектор запроса — Ollama; после паузы в наборе, чтобы
    // не считать модель на каждую букву (практика «подсказки по мере набора»).
    SemanticIndex? _sem;
    Dictionary<string, string> _semPathToId = new();
    List<Record> _semMatches = new();
    CancellationTokenSource? _semCts;
    public bool SemBusy { get; private set; }
    public IReadOnlyList<Record> SemMatches => _semMatches;
    public IReadOnlyList<Record> TextMatches => _matches;
    int _mode; // 0 — граф, 1 — 3D, 2 — список
    bool _closingConfirmed;

    public MainWindow(string? root, string? script, bool remember = true)
    {
        InitializeComponent();
        _remember = remember;
        Title = "Граф проекта";
        // Иконка окна и панели задач — та же, что у файла программы.
        var ico = System.IO.Path.Combine(AppContext.BaseDirectory, "Assets", "graf.ico");
        if (File.Exists(ico)) AppWindow.SetIcon(ico);
        AppWindow.Resize(new Windows.Graphics.SizeInt32(1600, 980));
        // Полоса заголовка — в цвет панели инструментов: окно читается одним
        // целым, как объединённая панель у приложений Apple.
        var tb = AppWindow.TitleBar;
        var bar = Hig.C("HigSidebar");
        tb.BackgroundColor = tb.InactiveBackgroundColor = tb.ButtonBackgroundColor = tb.ButtonInactiveBackgroundColor = bar;
        tb.ForegroundColor = tb.ButtonForegroundColor = Hig.C("HigLabel");
        LeftCol.Width = new GridLength(_settings.LeftWidth);
        RightCol.Width = new GridLength(_settings.RightWidth);

        Graph.NodeClicked += id => Select(id, center: false);
        Graph.NodeHovered += id =>
        {
            if (id != null && id.StartsWith("file:") && _derived.Code != null)
            {
                Tip.Visibility = Visibility.Visible;
                TipText.Text = CodeTip(id);
                return;
            }
            var r = id == null ? null : Store?.ById(id);
            Tip.Visibility = r == null ? Visibility.Collapsed : Visibility.Visible;
            if (r != null)
            {
                var d = Store!.DatesOf(r);
                var n = Store.ChangesOf(r).Count;
                TipText.Text = $"{Schema.NameOf(r.Folder)} · {r.Status}\n{r.Title}"
                    + (d.Modified != null ? $"\nизменено {d.Modified:dd.MM.yyyy HH:mm}" + (n > 1 ? $" · правок {n}" : "") : "");
            }
        };
        Panel.Navigate += id => Select(id, center: true);
        Panel.Saved += r => { Refresh(); Status("Сохранено: " + r.Title); };
        Panel.MoveRequested += async (r, f) => await MoveRecord(r, f);
        Panel.DeleteRequested += async r => await DeleteRecord(r);

        Search.TextChanged += (_, e) => { if (e.Reason == AutoSuggestionBoxTextChangeReason.UserInput) SearchChanged(); };
        Search.QuerySubmitted += (_, e) =>
        {
            if (e.ChosenSuggestion is SearchItem si) { Select(si.R.Id, center: true); return; }
            NextMatch();
        };
        Search.SuggestionChosen += (_, e) => { if (e.SelectedItem is SearchItem si) Search.Text = si.R.Title; };

        BtnCheck.Click += async (_, _) => await ShowCheck();
        BtnFit.Click += (_, _) => Graph.FitAll();
        BtnRelayout.Click += (_, _) => Graph.Relayout();
        List.ItemTemplate = (DataTemplate)XamlReader.Load(RowTemplate);
        SortBy.SelectedIndex = Math.Max(0, Array.IndexOf(SortKeys, _settings.SortBy));
        ShowSortDir();
        SortBy.SelectionChanged += (_, _) =>
        {
            _settings.SortBy = SortKeys[Math.Max(0, SortBy.SelectedIndex)];
            // Даты — сначала новые, названия и виды — по алфавиту: чаще всего
            // нужно именно так (практика «newest first» у дат).
            _settings.SortDesc = _settings.SortBy is "added" or "modified";
            _settings.Save();
            ShowSortDir();
            Refresh();
        };
        SortDir.Click += (_, _) => { _settings.SortDesc = !_settings.SortDesc; _settings.Save(); ShowSortDir(); Refresh(); };
        List.ItemClick += (_, e) => { if (e.ClickedItem is Row row) Select(row.R.Id, center: false); };
        HintBtn.Click += (_, _) => ToggleHint();
        InitPanels();
        InitCode();
        InitIndex();
        SetLeftTab(_settings.LeftTab);
        MiExport.Click += async (_, _) => await ExportDialog();
        MiImport.Click += async (_, _) => await ImportDialog();

        // Границы панелей тянутся; ширина запоминается.
        LeftSplit.Dragged += d => LeftCol.Width = new GridLength(Math.Clamp(LeftCol.ActualWidth + d, 180, 520));
        RightSplit.Dragged += d => RightCol.Width = new GridLength(Math.Clamp(RightCol.ActualWidth - d, 320, 900));
        LeftSplit.Done += SaveWidths;
        RightSplit.Done += SaveWidths;

        StartOpen.Click += async (_, _) => await PickFolder();
        StartBack.Click += (_, _) => Start.Visibility = Visibility.Collapsed;
        Root.DragOver += (_, e) =>
        {
            if (e.DataView.Contains(Windows.ApplicationModel.DataTransfer.StandardDataFormats.StorageItems))
            {
                e.AcceptedOperation = Windows.ApplicationModel.DataTransfer.DataPackageOperation.Link;
                e.DragUIOverride.Caption = "Открыть проект";
            }
        };
        Root.Drop += async (_, e) =>
        {
            if (!e.DataView.Contains(Windows.ApplicationModel.DataTransfer.StandardDataFormats.StorageItems)) return;
            var items = await e.DataView.GetStorageItemsAsync();
            var dir = items.FirstOrDefault(i => i.IsOfType(Windows.Storage.StorageItemTypes.Folder));
            if (dir != null) await TryOpen(dir.Path);
        };

        AppWindow.Closing += async (s, e) =>
        {
            if (_closingConfirmed || !Panel.IsDirty) { Graph.SaveLayout(); Store?.Dispose(); return; }
            e.Cancel = true;
            if (!await ConfirmLeave()) return;
            _closingConfirmed = true;
            Close();
        };

        SetMode(0);
        if (root != null && Store.IsProject(root)) OpenProject(root);
        else ShowStart();
        Root.Loaded += (_, _) =>
        {
            Graph.FitAll(animate: false);
            if (script != null) _ = ScriptRunner.Run(this, script);
        };
    }

    void SaveWidths()
    {
        _settings.LeftWidth = LeftCol.ActualWidth;
        _settings.RightWidth = RightCol.ActualWidth;
        _settings.Save();
    }

    // --- проект --------------------------------------------------------------

    public void OpenProject(string root)
    {
        if (Store != null) { Store.Changed -= OnStoreChanged; Graph.SaveLayout(); Store.Dispose(); }
        Store = new Store(root);
        Store.Load();
        Panel.Store = Store;
        if (_code) { _code = false; _dataSeg.SelectedIndex = 0; CodePane.Visibility = Visibility.Collapsed; LeftSegHost.Visibility = Visibility.Visible; }
        LoadDerived();
        Panel.Show(null);
        Graph.Select(null);
        Graph.UseLayout(Settings.LayoutPath(root));
        ResetFilters();
        BuildFilters();
        Refresh();
        if (_settings.Grouping > 0) Graph.SetGrouping(_settings.Grouping);
        if (Root.IsLoaded) Graph.FitAll(animate: false);
        Store.Changed += OnStoreChanged;
        Store.Watch();
        // Даты записей — из истории git, в фоне: окно открывается сразу, список
        // досортируется, когда история прочитана.
        var s = Store;
        Task.Run(() =>
        {
            s.LoadDates();
            DispatcherQueue.TryEnqueue(() => { if (Store == s) { BuildDateFilter(); Refresh(); } });
        });
        BuildToc();
        var name = new DirectoryInfo(root).Name;
        ProjectName.Text = name;
        Title = $"{name} — Граф проекта";
        if (_remember) _settings.Touch(root);
        BuildProjectMenu();
        Start.Visibility = Visibility.Collapsed;
        if (Store.LoadErrors.Count > 0) Status($"Не прочитано файлов: {Store.LoadErrors.Count} — «Проверка» покажет какие");
    }

    // Живое обновление: файл поменялся снаружи — граф, список, фильтры и
    // карточка обновляются сами.
    void OnStoreChanged(IReadOnlyList<Record> updated, IReadOnlyList<string> removed)
    {
        foreach (var r in updated) Panel.External(r);
        foreach (var id in removed) Panel.ExternalRemoved(id);
        BuildFilters();
        BuildToc();
        Refresh();
        Live($"обновлено {DateTime.Now:HH:mm:ss} · файлов снаружи: {updated.Count + removed.Count}");
    }

    async Task TryOpen(string path)
    {
        var root = Store.FindRoot(path);
        if (root == null)
        {
            var d = new ContentDialog
            {
                XamlRoot = Root.XamlRoot, Title = "В папке нет графа",
                Content = $"В «{path}» и выше по дереву нет папки knowledge/ с записями.\n\nМожно создать здесь пустой граф и, например, загрузить в него выгрузку.",
                PrimaryButtonText = "Создать пустой граф", CloseButtonText = "Отмена",
            };
            if (await d.ShowAsync() != ContentDialogResult.Primary) return;
            Store.CreateEmpty(path);
            root = path;
        }
        if (Panel.IsDirty && !await ConfirmLeave()) return;
        OpenProject(root);
    }

    async Task PickFolder()
    {
        var picker = new Windows.Storage.Pickers.FolderPicker { SuggestedStartLocation = Windows.Storage.Pickers.PickerLocationId.DocumentsLibrary };
        picker.FileTypeFilter.Add("*");
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(this));
        var f = await picker.PickSingleFolderAsync();
        if (f != null) await TryOpen(f.Path);
    }

    void BuildProjectMenu()
    {
        ProjectMenu.Items.Clear();
        foreach (var p in _settings.Ordered.Take(10))
        {
            var cur = Store != null && string.Equals(p.Path, Store.Root, StringComparison.OrdinalIgnoreCase);
            var item = new MenuFlyoutItem
            {
                Text = p.Name + (p.Pinned ? "  📌" : ""),
                Icon = new FontIcon { Glyph = cur ? "" : "" },
                IsEnabled = !cur && Directory.Exists(p.Path),
            };
            ToolTipService.SetToolTip(item, p.Path);
            var path = p.Path;
            item.Click += async (_, _) => await TryOpen(path);
            ProjectMenu.Items.Add(item);
        }
        ProjectMenu.Items.Add(new MenuFlyoutSeparator());
        var open = new MenuFlyoutItem { Text = "Открыть папку проекта…", Icon = new FontIcon { Glyph = "" } };
        open.KeyboardAcceleratorTextOverride = "Ctrl+O";
        open.Click += async (_, _) => await PickFolder();
        ProjectMenu.Items.Add(open);
        var all = new MenuFlyoutItem { Text = "Все проекты…", Icon = new FontIcon { Glyph = "" } };
        all.KeyboardAcceleratorTextOverride = "Ctrl+R";
        all.Click += (_, _) => ShowStart();
        ProjectMenu.Items.Add(all);
    }

    public void ShowStart()
    {
        StartBack.Visibility = Store != null ? Visibility.Visible : Visibility.Collapsed;
        RecentList.Children.Clear();
        var list = _settings.Ordered.ToList();
        RecentList.Children.Add(Hig.Section("Недавние", list.Count == 0
            ? new[] { Hig.Row("Пока пусто — откройте папку проекта.", titleColor: "HigSecondary") }
            : list.Select(RecentRow).ToArray(), indent: 44));
        Start.Visibility = Visibility.Visible;
    }

    // Строка недавнего проекта: значок папки, имя и путь, справа — закрепить
    // и убрать из списка (значки без рамок), щелчок — открыть.
    UIElement RecentRow(Settings.Project p)
    {
        var exists = Directory.Exists(p.Path);
        var cur = Store != null && string.Equals(p.Path, Store.Root, StringComparison.OrdinalIgnoreCase);
        var path = p.Path;
        var acts = new StackPanel { Orientation = Orientation.Horizontal };
        acts.Children.Add(Hig.Icon(p.Pinned ? "" : "", p.Pinned ? "Открепить" : "Закрепить наверху",
            () => { p.Pinned = !p.Pinned; _settings.Save(); BuildProjectMenu(); ShowStart(); }, p.Pinned ? "HigAccent" : "HigSecondary", 14));
        acts.Children.Add(Hig.Icon("", "Убрать из списка — папка останется на диске",
            () => { _settings.Forget(path); BuildProjectMenu(); ShowStart(); }, "HigSecondary", 12));
        return Hig.Row(p.Name + (cur ? " · открыт" : ""),
            exists ? $"{p.Path} · открывался {p.Opened:dd.MM.yyyy HH:mm}" : $"{p.Path} · папка не найдена",
            glyph: "", click: exists ? (Action)(async () => await TryOpen(path)) : null, trailing: acts);
    }

    void OnRecent(KeyboardAccelerator s, KeyboardAcceleratorInvokedEventArgs e) { e.Handled = true; ShowStart(); }
    async void OnOpenFolder(KeyboardAccelerator s, KeyboardAcceleratorInvokedEventArgs e) { e.Handled = true; await PickFolder(); }

    // --- выгрузка и загрузка ------------------------------------------------------

    async Task ExportDialog()
    {
        if (Store == null) return;
        var picker = new Windows.Storage.Pickers.FileSavePicker
        {
            SuggestedStartLocation = Windows.Storage.Pickers.PickerLocationId.DocumentsLibrary,
            SuggestedFileName = $"граф-{new DirectoryInfo(Store.Root).Name}-{DateTime.Now:yyyy-MM-dd}",
        };
        picker.FileTypeChoices.Add("Выгрузка графа (JSON)", new List<string> { ".json" });
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(this));
        var f = await picker.PickSaveFileAsync();
        if (f == null) return;
        ExportTo(f.Path);
    }

    public void ExportTo(string path)
    {
        Exchange.Export(Store!, path);
        Status($"Выгружено записей: {Store!.All.Count()} → {path}");
    }

    async Task ImportDialog()
    {
        if (Store == null) return;
        var picker = new Windows.Storage.Pickers.FileOpenPicker { SuggestedStartLocation = Windows.Storage.Pickers.PickerLocationId.DocumentsLibrary };
        picker.FileTypeFilter.Add(".json");
        WinRT.Interop.InitializeWithWindow.Initialize(picker, WinRT.Interop.WindowNative.GetWindowHandle(this));
        var f = await picker.PickSingleFileAsync();
        if (f == null) return;
        await ImportFrom(f.Path, ask: true, removeMissing: false);
    }

    // Загрузка: сначала сравнение, потом — по подтверждению — запись.
    public async Task<Exchange.Plan?> ImportFrom(string path, bool ask, bool removeMissing)
    {
        Exchange.Plan plan;
        try { plan = Exchange.Compare(Store!, path); }
        catch (Exception ex)
        {
            await new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Файл не загружен", Content = ex.Message, CloseButtonText = "Закрыть" }.ShowAsync();
            return null;
        }
        if (ask)
        {
            var sp = new StackPanel { Spacing = 8, MinWidth = 520 };
            sp.Children.Add(new TextBlock
            {
                Text = $"Выгрузка проекта «{plan.Project}» от {plan.Exported.Replace('T', ' ')}.", TextWrapping = TextWrapping.Wrap, Opacity = 0.75,
            });
            void Line(string label, int n, IEnumerable<Record> items)
            {
                sp.Children.Add(new TextBlock { Text = $"{label}: {n}", FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
                var shown = items.Take(6).Select(r => "  · " + r.Title).ToList();
                if (n > 6) shown.Add($"  … и ещё {n - 6}");
                if (shown.Count > 0) sp.Children.Add(new TextBlock { Text = string.Join("\n", shown), FontSize = 12, Opacity = 0.75, TextWrapping = TextWrapping.Wrap });
            }
            Line("Новые записи", plan.Added.Count, plan.Added);
            Line("Изменятся", plan.Changed.Count, plan.Changed);
            sp.Children.Add(new TextBlock { Text = $"Совпадают: {plan.Same.Count}", Opacity = 0.75 });
            var cb = new CheckBox
            {
                Content = $"Удалить записи, которых нет в файле ({plan.OnlyInGraph.Count})",
                IsEnabled = plan.OnlyInGraph.Count > 0,
            };
            sp.Children.Add(cb);
            if (plan.Errors.Count > 0)
                sp.Children.Add(new TextBlock
                {
                    Text = $"Пропущено из-за ошибок: {plan.Errors.Count}\n" + string.Join("\n", plan.Errors.Take(5)),
                    Foreground = new SolidColorBrush(Colors.IndianRed), TextWrapping = TextWrapping.Wrap, FontSize = 12,
                });
            sp.Children.Add(new TextBlock
            {
                Text = "Изменения ложатся в файлы графа; откатить их можно через git.", FontSize = 12, Opacity = 0.55, TextWrapping = TextWrapping.Wrap,
            });
            var d = new ContentDialog
            {
                XamlRoot = Root.XamlRoot, Title = "Загрузка графа", Content = new ScrollViewer { Content = sp, MaxHeight = 520 },
                PrimaryButtonText = "Загрузить", CloseButtonText = "Отмена", DefaultButton = ContentDialogButton.Primary,
            };
            d.IsPrimaryButtonEnabled = plan.Added.Count + plan.Changed.Count > 0 || plan.OnlyInGraph.Count > 0;
            if (await d.ShowAsync() != ContentDialogResult.Primary) return plan;
            removeMissing = cb.IsChecked == true;
            if (removeMissing && plan.Added.Count + plan.Changed.Count == 0 && plan.OnlyInGraph.Count == 0) return plan;
        }
        var current = Panel.Current?.Id;
        if (Panel.IsDirty && plan.Changed.Any(r => r.Id == current)) Panel.SaveNow();
        Exchange.Apply(Store!, plan, removeMissing);
        BuildFilters();
        Refresh();
        if (current != null) Panel.Show(Store!.ById(current));
        Status($"Загружено: новых {plan.Added.Count}, изменено {plan.Changed.Count}" + (removeMissing ? $", удалено {plan.OnlyInGraph.Count}" : ""));
        return plan;
    }

    // --- фильтры ------------------------------------------------------------

    void ResetFilters()
    {
        _foldersOff.Clear(); _statusOff.Clear(); _tagsOn.Clear();
        Lonely.IsOn = false;
        _dateFrom = _dateTo = null; _datePreset = "all"; _histPick = null;
        _pickerSync = true; DateFrom.Date = null; DateTo.Date = null; _pickerSync = false;
        BuildDateFilter();
        Search.Text = "";
        _matches = new();
        _matchAt = -1;
        Graph.Highlight = new();
        ClearSemantic();
    }

    void ClearSemantic()
    {
        _semCts?.Cancel();
        _semMatches = new();
        Graph.SemHighlight = new();
        SemBusy = false;
    }

    // --- оглавление графа --------------------------------------------------------
    //
    // Запись knowledge/project/oglavlenie_grafa.py (требование пользователя
    // 28.09.2026: «это же оглавление надо отображать и в программе»). Раздел —
    // связь «раздел» на карту раздела (knowledge/project/karta_razdela_*.py,
    // практика Maps of Content, 28.09.2026); у карты — связи «якорь» на
    // ключевые записи и пункт «Метки раздела: …». Якорь открывает запись, метка ставит фильтр по ней
    // (отсеянное на графе темнеет). Раскрытые разделы помнятся на время работы.

    readonly HashSet<string> _tocOpen = new();

    // Для сценариев проверки (ScriptRunner).
    public void ToggleTag(string tag) { if (!_tagsOn.Remove(tag)) _tagsOn.Add(tag); BuildTags(); BuildToc(); Refresh(); }
    public void SetSort(string key, bool desc)
    {
        SortBy.SelectedIndex = Math.Max(0, Array.IndexOf(SortKeys, key));
        _settings.SortDesc = desc;
        ShowSortDir();
        Refresh();
    }
    public void SetLeftTabPublic(string tab) => SetLeftTab(tab);
    public void SetDatePresetPublic(string key) => SetDatePreset(key);
    // Для сценариев: раскрыть раздел панели фильтров только в памяти — без
    // записи в настройки, чтобы проверка не меняла вид программы у человека.
    public void OpenGroupPublic(string key) { if (!Open(key)) _settings.OpenGroups.Add(key); BuildFilters(); }
    public void ColorByDatePublic(bool on) { ColorByDate.IsOn = on; UpdateRecency(); Graph.NodeColor = on ? RecencyColor : null; Graph.Redraw(); }
    public void OpenTocSection(string name) { _tocOpen.Add(name); BuildToc(); }
    public List<string> ListedIds() => (List.ItemsSource as List<Row> ?? new()).Select(r => r.R.Id).ToList();

    readonly HashSet<string> _hiddenEdges = new();

    void ApplyHiddenEdges()
    {
        Graph.HiddenEdgeTypes = new HashSet<string>(_hiddenEdges);
        Graph.Redraw();
    }

    // Задан ли хоть один фильтр: без них на графе ничего не приглушается.
    bool FiltersOn => _foldersOff.Count > 0 || _statusOff.Count > 0 || _tagsOn.Count > 0 || _dateFrom != null || _dateTo != null;

    // --- фильтр по дате -----------------------------------------------------------
    //
    // Задача пользователя 28.09.2026: «где фильтрование по дате? Мне нужно
    // видеть, какие узлы когда меняли». «Менялись» — хоть одна правка записи в
    // период (все коммиты с её файлом и незакоммиченная правка), «добавлены» —
    // появление файла. Готовые периоды и свой (практика «presets + custom
    // range»); гистограмма правок: столбик — сколько записей правили в этот
    // промежуток, щелчок выбирает его, Shift+щелчок продлевает выбор.

    bool _dateAdded;
    DateTime? _dateFrom, _dateTo;   // [с, по) — по включительно до конца дня
    string _datePreset = "all";
    (DateTime From, DateTime To)? _histPick;

    static readonly (string Key, string Label)[] DatePresetList =
    {
        ("all", "Всё время"), ("hour", "Последний час"), ("today", "Сегодня"), ("d3", "3 дня"), ("d7", "7 дней"), ("d30", "30 дней"),
    };

    IEnumerable<DateTime> WhenOf(Record r)
    {
        if (_dateAdded) { var a = Store!.DatesOf(r).Added; return a == null ? Array.Empty<DateTime>() : new[] { a.Value }; }
        return Store!.ChangesOf(r);
    }

    bool DateOk(Record r)
    {
        if (_dateFrom == null && _dateTo == null) return true;
        return WhenOf(r).Any(d => (_dateFrom == null || d >= _dateFrom) && (_dateTo == null || d < _dateTo));
    }

    void SetDatePreset(string key)
    {
        _datePreset = key;
        _histPick = null;
        var now = DateTime.Now;
        (_dateFrom, _dateTo) = key switch
        {
            "hour" => (now.AddHours(-1), (DateTime?)null),
            "today" => (now.Date, null),
            "d3" => (now.Date.AddDays(-2), null),
            "d7" => (now.Date.AddDays(-6), null),
            "d30" => (now.Date.AddDays(-29), null),
            _ => ((DateTime?)null, (DateTime?)null),
        };
        _pickerSync = true;
        DateFrom.Date = _dateFrom == null || key == "hour" ? null : new DateTimeOffset(_dateFrom.Value);
        DateTo.Date = null;
        _pickerSync = false;
        BuildDateFilter();
        Refresh();
    }

    bool _pickerSync;

    void OnPickers()
    {
        if (_pickerSync) return;
        _datePreset = "custom";
        _histPick = null;
        _dateFrom = DateFrom.Date?.Date;
        _dateTo = DateTo.Date?.Date.AddDays(1);
        BuildDateFilter();
        Refresh();
    }

    // Цвет узла по дате последней правки: самая свежая — оранжевый, самая
    // давняя — серый. Шкала — по фактическому размаху правок (история может
    // уложиться в один день, и шкала «на месяц» красила бы всё одним цветом),
    // по логарифму: разница между «только что» и «час назад» видна лучше, чем
    // между двумя давними правками.
    (DateTime Newest, DateTime Oldest)? _recency;

    void UpdateRecency()
    {
        var mods = Store!.All.Select(r => Store.DatesOf(r).Modified).Where(d => d != null).Select(d => d!.Value).ToList();
        _recency = mods.Count == 0 ? null : (mods.Max(), mods.Min());
        ColorLegend.Text = _recency is { } rc && ColorByDate.IsOn
            ? $"оранжевый — {rc.Newest:dd.MM HH:mm}, серый — {rc.Oldest:dd.MM HH:mm}; между ними — по времени правки"
            : "";
        ColorLegend.Visibility = ColorLegend.Text.Length > 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    Windows.UI.Color? RecencyColor(Record r)
    {
        var m = Store!.DatesOf(r).Modified;
        if (m == null || _recency is not { } rc) return null;
        var span = Math.Max(1.0 / 60, (rc.Newest - rc.Oldest).TotalHours);
        var hours = Math.Clamp((rc.Newest - m.Value).TotalHours, 0, span);
        var t = (float)(Math.Log(1 + hours * 60) / Math.Log(1 + span * 60));
        byte L(byte a, byte b) => (byte)(a + (b - a) * t);
        return Windows.UI.Color.FromArgb(255, L(0xFF, 0x5A), L(0x8A, 0x69), L(0x3D, 0x7D));
    }

    // --- сортировка списка ------------------------------------------------------

    static readonly string[] SortKeys = { "kind", "title", "added", "modified" };

    void ShowSortDir()
    {
        var desc = _settings.SortDesc;
        var dates = _settings.SortBy is "added" or "modified";
        SortDirIcon.Glyph = desc ? "\uE74B" : "\uE74A";
        SortDirText.Text = dates ? (desc ? "сначала новые" : "сначала старые") : (desc ? "Я → А" : "А → Я");
        ToolTipService.SetToolTip(SortDir, "Сменить направление сортировки");
    }

    List<Row> SortRows(List<Record> list)
    {
        var incoming = Store!.All.SelectMany(r => r.Links.Select(l => l["куда"] as string ?? "")).GroupBy(x => x).ToDictionary(g => g.Key, g => g.Count());
        var rows = list.Select(r => new Row(r, r.Links.Count + (incoming.TryGetValue(r.Id, out var d) ? d : 0), Store.DatesOf(r))).ToList();
        var folderAt = Schema.Folders.Select((f, i) => (f.Folder, i)).ToDictionary(x => x.Folder, x => x.i);
        IOrderedEnumerable<Row> sorted = _settings.SortBy switch
        {
            "title" => rows.OrderBy(r => r.Title, StringComparer.CurrentCultureIgnoreCase),
            "added" => rows.OrderBy(r => r.Dates.Added ?? DateTime.MinValue),
            "modified" => rows.OrderBy(r => r.Dates.Modified ?? DateTime.MinValue),
            _ => rows.OrderBy(r => folderAt.TryGetValue(r.R.Folder, out var i) ? i : 99),
        };
        sorted = sorted.ThenBy(r => r.Title, StringComparer.CurrentCultureIgnoreCase);
        var result = sorted.ToList();
        if (_settings.SortDesc) result.Reverse();
        return result;
    }

    bool Passes(Record r) =>
        !_foldersOff.Contains(r.Folder) && !_statusOff.Contains(r.Status) && _tagsOn.All(t => r.Tags.Contains(t)) && DateOk(r);

    // --- показ ---------------------------------------------------------------

    public void Refresh()
    {
        if (Store == null) return;
        if (_code) { RefreshCode(); return; }
        // На графе — все записи: фильтры не прячут узлы, а приглушают
        // отсеянные (GraphView.Passing; задача пользователя 28.09.2026).
        // Раскладка от фильтра не меняется, связи отсеянных видны. Список —
        // как и был: в нём отсеянным не место.
        var all = Store.All.ToList();
        var ids = all.Select(r => r.Id).ToHashSet();
        var links = all.SelectMany(r => r.Links.Select(l => (From: r.Id, To: l["куда"] as string ?? "", Type: l["тип"] as string ?? "")))
            .Where(l => ids.Contains(l.To)).ToList();
        var vis = all;
        if (!Lonely.IsOn)
        {
            var linked = links.SelectMany(l => new[] { l.From, l.To }).ToHashSet();
            vis = all.Where(r => linked.Contains(r.Id) || r.Id == Panel.Current?.Id).ToList();
        }
        var filtered = FiltersOn;
        var passing = filtered ? all.Where(Passes).Select(r => r.Id).ToHashSet() : null;
        // Связи по смыслу — между показанными записями (выгрузка semsearch).
        var visIds = vis.Select(r => r.Id).ToHashSet();
        Graph.SetData(vis, links, _derived.Pairs.Where(p => visIds.Contains(p.A) && visIds.Contains(p.B)));
        Graph.Passing = passing;
        BuildEdgeKinds();
        ApplyHiddenEdges();
        UpdateFilterSummary(all.Count, passing?.Count ?? all.Count);
        if (ColorByDate.IsOn) UpdateRecency();
        Graph.Highlight = _matches.Select(m => m.Id).ToHashSet();
        Graph.Redraw();
        var found = _matches.Concat(_semMatches.Where(r => !_matches.Contains(r)));
        List.ItemsSource = SortRows((Search.Text.Trim().Length > 0 ? found.Where(Passes) : all.Where(Passes)).ToList());
        var shown = passing == null ? Graph.NodeCount : vis.Count(r => passing.Contains(r.Id));
        CountText.Text = $"Записей {all.Count} · на графе {Graph.NodeCount}" + (passing != null ? $", отобрано {shown}" : "")
            + $", связей {Graph.EdgeCount}" + (Search.Text.Trim().Length > 0
                ? $" · найдено по словам {_matches.Count}" + (_semMatches.Count > 0 ? $", по смыслу ещё {_semMatches.Count(r => !_matches.Contains(r))}" : "")
                : "");
        var problems = Store.Check().Count;
        CheckText.Text = problems.ToString();
        CheckBadge.Visibility = problems == 0 ? Visibility.Collapsed : Visibility.Visible;
        UpdateGit();
    }

    void UpdateGit()
    {
        var s = Store!;
        var q = DispatcherQueue;
        Task.Run(() =>
        {
            int n;
            try { n = s.Uncommitted(); } catch (Exception) { n = -1; }
            q.TryEnqueue(() => GitText.Text = n < 0 ? "git недоступен" : n == 0 ? "Правки графа закоммичены" : $"Не закоммичено файлов графа: {n} — коммит и есть журнал изменений");
        });
    }

    void Status(string s) => Live(s);

    void Live(string s)
    {
        LiveText.Text = s;
        LiveDot.Fill = new SolidColorBrush(Colors.Gold);
        var t = DispatcherQueue.CreateTimer();
        t.Interval = TimeSpan.FromSeconds(1.5);
        t.Tick += (_, _) => { LiveDot.Fill = new SolidColorBrush(Colors.SeaGreen); t.Stop(); };
        t.Start();
    }

    public void SetSearch(string text) { Search.Text = text; SearchChanged(); }
    public void SetModePublic(int mode) => SetMode(mode);

    const string Hint2D = "Колесо — масштаб · тянуть пустое — сдвиг · тянуть узел — распутать, соседи идут следом · "
        + "правая по узлу — меню · WASD — сдвиг · F — к выбранному · Home — весь граф";
    const string Hint3D = "Левая — вращать · правая или Shift+левая — сдвиг · колесо — ближе к курсору · "
        + "WASD — лететь, Q/E — вниз/вверх, Shift — быстрее · тянуть узел — распутать · F — к выбранному · Home — весь граф";

    void SetMode(int mode)
    {
        _mode = mode;
        _modeSeg.SelectedIndex = mode;
        Graph.Visibility = mode == 2 ? Visibility.Collapsed : Visibility.Visible;
        ListPane.Visibility = mode == 2 ? Visibility.Visible : Visibility.Collapsed;
        NavHint.Visibility = HintBtn.Visibility = mode == 2 ? Visibility.Collapsed : Visibility.Visible;
        GraphTools.Visibility = mode != 2 ? Visibility.Visible : Visibility.Collapsed;
        NavHintText.Text = mode == 1 ? Hint3D : Hint2D;
        if (mode != 2) ShowHint();
        BtnFit.IsEnabled = BtnRelayout.IsEnabled = mode != 2;
        if (mode != 2)
        {
            Graph.Set3D(mode == 1);
            Graph.Focus(FocusState.Programmatic);
        }
    }

    Microsoft.UI.Dispatching.DispatcherQueueTimer? _hintTimer;

    void ShowHint()
    {
        NavHint.Opacity = 1;
        if (_hintTimer == null)
        {
            _hintTimer = DispatcherQueue.CreateTimer();
            _hintTimer.Interval = TimeSpan.FromSeconds(8);
            _hintTimer.IsRepeating = false;
            _hintTimer.Tick += (_, _) => NavHint.Opacity = 0;
        }
        _hintTimer.Stop();
        _hintTimer.Start();
    }

    void ToggleHint() { if (NavHint.Opacity > 0) { _hintTimer?.Stop(); NavHint.Opacity = 0; } else ShowHint(); }
    void OnHint(KeyboardAccelerator s, KeyboardAcceleratorInvokedEventArgs e) { e.Handled = true; ToggleHint(); }

    void OnMode1(KeyboardAccelerator s, KeyboardAcceleratorInvokedEventArgs e) { e.Handled = true; SetMode(0); }
    void OnMode2(KeyboardAccelerator s, KeyboardAcceleratorInvokedEventArgs e) { e.Handled = true; SetMode(1); }
    void OnMode3(KeyboardAccelerator s, KeyboardAcceleratorInvokedEventArgs e) { e.Handled = true; SetMode(2); }

    public async void Select(string? id, bool center)
    {
        if (Store == null) return;
        if (id != null && id.StartsWith("file:"))
        {
            if (Panel.IsDirty && !await ConfirmLeave()) return;
            if (!_code) SetDataSource(true);
            SelectCode(id, center);
            return;
        }
        if (id != null && _code) SetDataSource(false);
        if (id == Panel.Current?.Id) { if (center && id != null) Graph.Select(id, true); return; }
        if (Panel.IsDirty && !await ConfirmLeave()) return;
        var r = id == null ? null : Store.ById(id);
        Panel.Show(r);
        if (r != null && !Graph.Has(r.Id)) Refresh();
        Graph.Select(r?.Id, center);
        BuildToc();
        if (_mode == 2 && List.ItemsSource is List<Row> rows) List.SelectedItem = rows.FirstOrDefault(x => x.R.Id == id);
    }

    async Task<bool> ConfirmLeave()
    {
        var d = new ContentDialog
        {
            XamlRoot = Root.XamlRoot, Title = "Сохранить правки?", Content = $"В записи «{Panel.Current?.Title}» есть несохранённые правки.",
            PrimaryButtonText = "Сохранить", SecondaryButtonText = "Не сохранять", CloseButtonText = "Отмена", DefaultButton = ContentDialogButton.Primary,
        };
        var res = await d.ShowAsync();
        if (res == ContentDialogResult.None) return false;
        if (res == ContentDialogResult.Primary) Panel.SaveNow();
        return true;
    }

    // --- поиск --------------------------------------------------------------

    sealed class SearchItem
    {
        public SearchItem(Record r, bool sem = false) { R = r; Sem = sem; }
        public Record R { get; }
        public bool Sem { get; }
        // Цвет кольца на графе продублирован словом: смысл не передаётся одним
        // цветом (практика доступности).
        public override string ToString() => $"{R.Title}  · {Schema.NameOf(R.Folder)}" + (Sem ? "  · по смыслу" : "");
    }

    public void SearchChanged()
    {
        if (Store == null) return;
        var words = Search.Text.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var source = _code && _derived.Code != null ? _derived.Code.Records : Store.All;
        _matches = words.Length == 0 ? new() : source.Where(r => words.All(w => r.Haystack.Contains(w)))
            .OrderByDescending(r => words.Count(w => r.Title.ToLowerInvariant().Contains(w)))
            .ThenBy(r => r.Title).ToList();
        _matchAt = -1;
        ClearSemantic();
        FillSuggestions();
        Refresh();
        if (!_code && _sem != null && Search.Text.Trim().Length >= 3) _ = SearchSemantic(Search.Text.Trim());
    }

    // Выдача: сначала найденное по словам (точное совпадение надёжнее), под
    // ним — по смыслу, без повторов: запись, найденная и так и так, стоит
    // среди найденных по словам.
    void FillSuggestions()
    {
        var text = _matches.Take(8).Select(r => new SearchItem(r));
        var sem = _semMatches.Where(r => !_matches.Contains(r)).Take(6).Select(r => new SearchItem(r, true));
        Search.ItemsSource = text.Concat(sem).ToList();
    }

    async Task SearchSemantic(string q)
    {
        var cts = _semCts = new CancellationTokenSource();
        SemBusy = true;
        try
        {
            await Task.Delay(450, cts.Token);
            var v = await QueryEmbedder.Embed(_sem!, q, Status, cts.Token);
            if (cts.IsCancellationRequested || v == null) return;
            var ids = _sem!.Top(v, 8, 0.05f)
                .Select(x => _semPathToId.TryGetValue(x.Path, out var id) ? Store!.ById(id) : null)
                .Where(r => r != null).Select(r => r!).ToList();
            _semMatches = ids;
            Graph.SemHighlight = ids.Select(r => r.Id).ToHashSet();
            FillSuggestions();
            Refresh();
            var extra = ids.Count(r => !_matches.Contains(r));
            Status($"по словам {_matches.Count} · по смыслу ещё {extra} — синие кольца: по словам, оранжевые: по смыслу, белое: выбранная запись");
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { Status("по смыслу: " + ex.Message); }
        finally { if (_semCts == cts) SemBusy = false; }
    }

    public void NextMatch()
    {
        // По словам, затем по смыслу — тот же порядок, что в выдаче.
        var all = _matches.Concat(_semMatches.Where(r => !_matches.Contains(r))).ToList();
        if (all.Count == 0) return;
        _matchAt = (_matchAt + 1) % all.Count;
        Select(all[_matchAt].Id, center: true);
        Status($"найдено {all.Count}, это {_matchAt + 1}-я" + (_matchAt >= _matches.Count ? " (по смыслу)" : "") + "; Enter — следующая");
    }

    void OnFind(KeyboardAccelerator s, KeyboardAcceleratorInvokedEventArgs e) { Search.Focus(FocusState.Keyboard); e.Handled = true; }
    async void OnNew(KeyboardAccelerator s, KeyboardAcceleratorInvokedEventArgs e) { e.Handled = true; await NewRecord(); }
    void OnSave(KeyboardAccelerator s, KeyboardAcceleratorInvokedEventArgs e) { Panel.SaveNow(); e.Handled = true; }

    // --- действия ---------------------------------------------------------------

    public async Task NewRecord(string? folder = null, string? title = null)
    {
        if (Store == null) return;
        if (folder == null || title == null)
        {
            var fbox = new ComboBox { Header = "Вид записи", HorizontalAlignment = HorizontalAlignment.Stretch };
            foreach (var f in Schema.Folders.Where(f => f.Folder is not ("concepts" or "fields"))) fbox.Items.Add(new ComboBoxItem { Content = f.Name, Tag = f.Folder });
            fbox.SelectedIndex = 0;
            var tbox = new TextBox { Header = "Заголовок — из него получится ID", PlaceholderText = "Например: «Подгруппы помещений вместо зон»" };
            var sp = new StackPanel { Spacing = 12, MinWidth = 420 };
            sp.Children.Add(fbox);
            sp.Children.Add(tbox);
            var d = new ContentDialog
            {
                XamlRoot = Root.XamlRoot, Title = "Новая запись", Content = sp,
                PrimaryButtonText = "Создать", CloseButtonText = "Отмена", DefaultButton = ContentDialogButton.Primary,
            };
            if (await d.ShowAsync() != ContentDialogResult.Primary || tbox.Text.Trim().Length == 0) return;
            folder = (string)((ComboBoxItem)fbox.SelectedItem).Tag;
            title = tbox.Text.Trim();
        }
        var r = Store.Create(folder, title);
        BuildFilters();
        Refresh();
        Select(r.Id, center: true);
        Status("Создана запись: " + r.Id);
    }

    async Task MoveRecord(Record r, string folder)
    {
        if (Panel.IsDirty) Panel.SaveNow();
        var touched = Store!.Move(Store.ById(r.Id)!, folder);
        BuildFilters();
        Refresh();
        Panel.Show(Store.ById(r.Id));
        Status($"Перенесено в «{Schema.NameOf(folder)}»" + (touched.Count > 0 ? $", обновлены ссылки в {touched.Count} записях" : ""));
        await Task.CompletedTask;
    }

    async Task DeleteRecord(Record r)
    {
        var inc = Store!.Incoming(r.Id).ToList();
        var d = new ContentDialog
        {
            XamlRoot = Root.XamlRoot, Title = "Удалить запись?",
            Content = (inc.Count > 0 ? $"На запись ссылаются {inc.Count} записей — их связи станут вести в пустоту.\n\n" : "")
                      + "Отменённое решение обычно не удаляют, а ставят статус «отменено» — так остаётся след, почему от него отказались.",
            PrimaryButtonText = "Удалить", SecondaryButtonText = "Поставить «отменено»", CloseButtonText = "Отмена",
        };
        var res = await d.ShowAsync();
        if (res == ContentDialogResult.Primary)
        {
            Store.Delete(r);
            Panel.Show(null);
            BuildFilters();
            Refresh();
            Status("Запись удалена: " + r.Id);
        }
        else if (res == ContentDialogResult.Secondary)
        {
            var c = Store.ById(r.Id)!.Clone();
            c.Fields["статус"] = "отменено";
            Store.Save(c);
            Panel.Show(Store.ById(r.Id));
            BuildFilters();
            Refresh();
        }
    }

    // Проверка: числа качества, ошибки (запись не читается, связь в
    // пустоту) и замечания к наполнению группами — то же, что graph.py check
    // и stats (Model/Quality, ответ пользователя 28.09.2026 «Берем все»).
    // Для сценариев проверки: окно проверки без ожидания закрытия.
    public void OpenCheck() => _ = ShowCheck();
    public void CloseDialogs()
    {
        foreach (var p in Microsoft.UI.Xaml.Media.VisualTreeHelper.GetOpenPopupsForXamlRoot(Root.XamlRoot))
            if (p.Child is ContentDialog d) d.Hide();
    }

    // Проверка — лист в духе iOS: числа графа строками «название — значение»,
    // ошибки и замечания — разделами-карточками; в разделе первые пять строк
    // и «Показать все»; щелчок по строке — к записи (Model/Quality, ответ
    // пользователя 28.09.2026 «Берем все»; оформление — практика
    // dizayn-programmy-graf-proekta-po-hig-apple).
    async Task ShowCheck()
    {
        if (Store == null) return;
        var problems = Store.Check();
        var notes = Quality.Warnings(Store);
        var num = Quality.Count(Store);
        ContentDialog? d = null;
        var body = new StackPanel { Spacing = 16, Padding = new Thickness(0, 0, 12, 0) };
        var expanded = new HashSet<string>();

        body.Children.Add(Hig.Section("Граф", new[]
        {
            Hig.Row("Записей", value: num.Records.ToString()), Hig.Row("Связей", value: num.Links.ToString()),
            Hig.Row("Видов связей", value: num.Kinds.ToString()),
            Hig.Row("Частей связности", value: $"{num.Components}, самая большая {num.Largest}"),
            Hig.Row("Записей без связей", subtitle: string.Join(", ", num.LonelyByFolder.Select(x => $"{Schema.NameOf(x.Folder)} {x.N}")), value: num.Lonely.ToString()),
            Hig.Row("Записей с 10+ пунктами", value: num.Big.ToString()),
        }));
        body.Children.Add(Hig.Section("Центры — самые связанные записи",
            num.Hubs.Select(h => Hig.Row(h.Rec.Title, value: h.N.ToString(), dot: GraphView.Parse(Schema.ColorOf(h.Rec.Folder)), acc: Hig.Acc.Chevron,
                click: () => { d?.Hide(); Select(h.Rec.Id, center: true); })), indent: 38));

        UIElement Group(string title, List<(Record? Rec, string Text)> items)
        {
            var host = new StackPanel();
            void Fill()
            {
                host.Children.Clear();
                var all = expanded.Contains(title) || items.Count <= 7;
                var rows = (all ? items : items.Take(5)).Select(x => Hig.Row(x.Rec?.Title ?? "—", x.Text, dot: x.Rec == null ? null : GraphView.Parse(Schema.ColorOf(x.Rec.Folder)),
                    acc: x.Rec == null ? Hig.Acc.None : Hig.Acc.Chevron, wrap: true,
                    click: x.Rec == null ? null : () => { d?.Hide(); Select(x.Rec.Id, center: true); })).ToList();
                if (!all) rows.Add(Hig.Row("Показать все", value: items.Count.ToString(), titleColor: "HigAccent", click: () => { expanded.Add(title); Fill(); }));
                host.Children.Add(Hig.Section($"{title} · {items.Count}", rows, indent: 38));
            }
            Fill();
            return host;
        }

        var errors = problems.Select(p => (p.Rec, p.Text)).Concat(Store.LoadErrors.Select(e => ((Record?)null, "не читается: " + e))).ToList();
        if (errors.Count == 0)
            body.Children.Add(Hig.Section("Ошибки", new[] { Hig.Row("Ошибок нет", "Все записи читаются, связи ведут в существующие записи.", glyph: "") }));
        else body.Children.Add(Group("Ошибки", errors));
        foreach (var g in notes.GroupBy(n => n.Kind))
            body.Children.Add(Group(char.ToUpper(g.Key[0]) + g.Key[1..], g.Select(n => ((Record?)n.Rec, n.Text)).ToList()));

        d = new ContentDialog
        {
            XamlRoot = Root.XamlRoot,
            Title = errors.Count == 0 ? $"Проверка · замечаний {notes.Count}" : $"Проверка · ошибок {errors.Count}, замечаний {notes.Count}",
            Content = new ScrollViewer { Content = body, MaxHeight = 640 },
            CloseButtonText = "Готово", CloseButtonStyle = (Style)Application.Current.Resources["AccentButtonStyle"],
        };
        d.Resources["ContentDialogMaxWidth"] = 760.0;
        d.Resources["ContentDialogBackground"] = Hig.B("HigBackground");
        d.Resources["ContentDialogTopOverlay"] = Hig.B("HigBackground");
        await d.ShowAsync();
    }

    // --- список ---------------------------------------------------------------

    public sealed class Row
    {
        public Row(Record r, int deg, Store.Dates dates) { R = r; Deg = deg; Dates = dates; }
        public Record R { get; }
        public int Deg { get; }
        public Store.Dates Dates { get; }
        // Обе даты в строке: сортировка по невидимому признаку сбивает с толку.
        public string DatesText => $"добавлено {Day(Dates.Added)} · изменено {Day(Dates.Modified)}";
        static string Day(DateTime? d) => d == null ? "—" : d.Value.Date == DateTime.Today ? $"сегодня {d:HH:mm}" : $"{d:dd.MM.yyyy}";
        public string Title => R.Title;
        public string Kind => Schema.NameOf(R.Folder);
        public string Status => R.Status;
        public string Date => R.Date;
        public string TagsText => string.Join(" · ", R.Tags);
        public string DegText => Deg > 0 ? $"связей {Deg}" : "";
        public SolidColorBrush Color => new(GraphView.Parse(Schema.ColorOf(R.Folder)));
    }

    const string RowTemplate = """
<DataTemplate xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation">
  <Grid Padding="2,8" ColumnSpacing="12" BorderBrush="{ThemeResource HigSeparator}" BorderThickness="0,0,0,1">
    <Grid.ColumnDefinitions>
      <ColumnDefinition Width="Auto"/><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/>
    </Grid.ColumnDefinitions>
    <Ellipse Width="10" Height="10" Fill="{Binding Color}" VerticalAlignment="Top" Margin="0,5,0,0"/>
    <StackPanel Grid.Column="1" Spacing="2">
      <TextBlock Text="{Binding Title}" TextWrapping="Wrap" MaxLines="2" TextTrimming="CharacterEllipsis" FontSize="14" Foreground="{ThemeResource HigLabel}"/>
      <TextBlock Text="{Binding TagsText}" FontSize="12" Foreground="{ThemeResource HigSecondary}" TextTrimming="CharacterEllipsis"/>
      <TextBlock Text="{Binding DatesText}" FontSize="12" Foreground="{ThemeResource HigSecondary}"/>
    </StackPanel>
    <StackPanel Grid.Column="2" HorizontalAlignment="Right" Spacing="1">
      <TextBlock Text="{Binding Kind}" FontSize="13" Foreground="{ThemeResource HigSecondary}" HorizontalAlignment="Right"/>
      <TextBlock Text="{Binding Status}" FontSize="12" Foreground="{ThemeResource HigSecondary}" HorizontalAlignment="Right"/>
      <TextBlock Text="{Binding DegText}" FontSize="12" Foreground="{ThemeResource HigSecondary}" HorizontalAlignment="Right"/>
    </StackPanel>
  </Grid>
</DataTemplate>
""";
}
