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
        LeftCol.Width = new GridLength(_settings.LeftWidth);
        RightCol.Width = new GridLength(_settings.RightWidth);

        Graph.NodeClicked += id => Select(id, center: false);
        Graph.NodeHovered += id =>
        {
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

        ModeGraph.Click += (_, _) => SetMode(0);
        Mode3D.Click += (_, _) => SetMode(1);
        ModeList.Click += (_, _) => SetMode(2);
        BtnNew.Click += async (_, _) => await NewRecord();
        BtnCheck.Click += async (_, _) => await ShowCheck();
        BtnFit.Click += (_, _) => Graph.FitAll();
        BtnRelayout.Click += (_, _) => Graph.Relayout();
        BtnReset.Click += (_, _) => { ResetFilters(); BuildFilters(); Refresh(); };
        Lonely.Click += (_, _) => Refresh();
        TagFilter.TextChanged += (_, _) => BuildTags();
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
        DateModeMod.Click += (_, _) => { _dateAdded = false; BuildDateFilter(); Refresh(); };
        DateModeAdd.Click += (_, _) => { _dateAdded = true; BuildDateFilter(); Refresh(); };
        DateFrom.DateChanged += (_, _) => OnPickers();
        DateTo.DateChanged += (_, _) => OnPickers();
        ColorByDate.Click += (_, _) => { UpdateRecency(); Graph.NodeColor = ColorByDate.IsChecked == true ? RecencyColor : null; Graph.Redraw(); };
        LeftTabs.SelectionChanged += (_, _) =>
        {
            if (LeftTabs.SelectedItem is SelectorBarItem it && it.Tag is string tab && tab != _settings.LeftTab) SetLeftTab(tab);
        };
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
        Panel.Show(null);
        Graph.Select(null);
        Graph.UseLayout(Settings.LayoutPath(root));
        ResetFilters();
        BuildFilters();
        Refresh();
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
        if (list.Count == 0)
            RecentList.Children.Add(new TextBlock { Text = "Пока пусто — откройте папку проекта.", Opacity = 0.6 });
        foreach (var p in list) RecentList.Children.Add(RecentRow(p));
        Start.Visibility = Visibility.Visible;
    }

    UIElement RecentRow(Settings.Project p)
    {
        var exists = Directory.Exists(p.Path);
        var g = new Grid { ColumnSpacing = 4 };
        g.ColumnDefinitions.Add(new ColumnDefinition());
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var text = new StackPanel { Spacing = 2 };
        var head = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        head.Children.Add(new FontIcon { Glyph = "", FontSize = 16 });
        head.Children.Add(new TextBlock { Text = p.Name, FontSize = 16, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        if (Store != null && string.Equals(p.Path, Store.Root, StringComparison.OrdinalIgnoreCase))
            head.Children.Add(new TextBlock { Text = "открыт", FontSize = 12, Opacity = 0.6, VerticalAlignment = VerticalAlignment.Center });
        text.Children.Add(head);
        text.Children.Add(new TextBlock { Text = p.Path, FontSize = 12, Opacity = 0.65, TextTrimming = TextTrimming.CharacterEllipsis });
        text.Children.Add(new TextBlock
        {
            Text = exists ? "открывался " + p.Opened.ToString("dd.MM.yyyy HH:mm") : "папка не найдена",
            FontSize = 12, Opacity = exists ? 0.5 : 0.8,
            Foreground = exists ? null : new SolidColorBrush(Colors.IndianRed),
        });
        var open = new Button
        {
            Content = text, HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Left,
            Padding = new Thickness(14, 10, 14, 10), IsEnabled = exists,
        };
        var path = p.Path;
        open.Click += async (_, _) => await TryOpen(path);
        g.Children.Add(open);
        var pin = new ToggleButton
        {
            IsChecked = p.Pinned, Content = new FontIcon { Glyph = p.Pinned ? "" : "", FontSize = 14 },
            VerticalAlignment = VerticalAlignment.Stretch,
        };
        ToolTipService.SetToolTip(pin, p.Pinned ? "Открепить" : "Закрепить наверху");
        pin.Click += (_, _) => { p.Pinned = pin.IsChecked == true; _settings.Save(); BuildProjectMenu(); ShowStart(); };
        Grid.SetColumn(pin, 1);
        g.Children.Add(pin);
        var del = new Button { Content = new FontIcon { Glyph = "", FontSize = 14 }, VerticalAlignment = VerticalAlignment.Stretch };
        ToolTipService.SetToolTip(del, "Убрать из списка — папка останется на диске");
        del.Click += (_, _) => { _settings.Forget(path); BuildProjectMenu(); ShowStart(); };
        Grid.SetColumn(del, 2);
        g.Children.Add(del);
        return g;
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
        Lonely.IsChecked = false;
        _dateFrom = _dateTo = null; _datePreset = "all"; _histPick = null;
        _pickerSync = true; DateFrom.Date = null; DateTo.Date = null; _pickerSync = false;
        BuildDateFilter();
        Search.Text = "";
        _matches = new();
        _matchAt = -1;
        Graph.Highlight = new();
    }

    void BuildFilters()
    {
        if (Store == null) return;
        Folders.Children.Clear();
        foreach (var (folder, _, name, color) in Schema.Folders)
        {
            var n = Store.All.Count(r => r.Folder == folder);
            if (n == 0) continue;
            Folders.Children.Add(FilterRow(name, n, color, !_foldersOff.Contains(folder), on =>
            {
                if (on) _foldersOff.Remove(folder); else _foldersOff.Add(folder);
                Refresh();
            }));
        }
        Statuses.Children.Clear();
        foreach (var g in Store.All.GroupBy(r => r.Status).OrderBy(g => g.Key))
        {
            var s = g.Key;
            Statuses.Children.Add(FilterRow(s.Length > 0 ? s : "без статуса", g.Count(), null, !_statusOff.Contains(s), on =>
            {
                if (on) _statusOff.Remove(s); else _statusOff.Add(s);
                Refresh();
            }));
        }
        BuildTags();
    }

    void BuildTags()
    {
        if (Store == null) return;
        Tags.Children.Clear();
        var q = TagFilter.Text.Trim().ToLowerInvariant();
        foreach (var g in Store.All.SelectMany(r => r.Tags).GroupBy(t => t).OrderByDescending(g => g.Count()).ThenBy(g => g.Key))
        {
            var t = g.Key;
            if (q.Length > 0 && !t.ToLowerInvariant().Contains(q) && !_tagsOn.Contains(t)) continue;
            Tags.Children.Add(FilterRow(t, g.Count(), null, _tagsOn.Contains(t), on =>
            {
                if (on) _tagsOn.Add(t); else _tagsOn.Remove(t);
                Refresh();
            }));
        }
    }

    static UIElement FilterRow(string text, int count, string? color, bool on, Action<bool> changed)
    {
        var g = new Grid { ColumnSpacing = 6 };
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        g.ColumnDefinitions.Add(new ColumnDefinition());
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var cb = new CheckBox { IsChecked = on, MinWidth = 0, Padding = new Thickness(6, 0, 0, 0) };
        var label = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
        if (color != null)
            label.Children.Add(new Border { Width = 10, Height = 10, CornerRadius = new CornerRadius(5), Background = new SolidColorBrush(GraphView.Parse(color)), VerticalAlignment = VerticalAlignment.Center });
        label.Children.Add(new TextBlock { Text = text, TextTrimming = TextTrimming.CharacterEllipsis });
        cb.Content = label;
        cb.Click += (_, _) => changed(cb.IsChecked == true);
        g.Children.Add(cb);
        var n = new TextBlock { Text = count.ToString(), Opacity = 0.55, VerticalAlignment = VerticalAlignment.Center, FontSize = 12 };
        Grid.SetColumn(n, 2);
        g.Children.Add(n);
        return g;
    }

    // --- оглавление графа --------------------------------------------------------
    //
    // Запись knowledge/project/oglavlenie_grafa.py (требование пользователя
    // 28.09.2026: «это же оглавление надо отображать и в программе»). Раздел —
    // связи с типом «якорь раздела «…»»; метки раздела — пункт «Раздел «…» —
    // метки: …; якоря: …». Якорь открывает запись, метка ставит фильтр по ней
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
    public void ColorByDatePublic(bool on) { ColorByDate.IsChecked = on; UpdateRecency(); Graph.NodeColor = on ? RecencyColor : null; Graph.Redraw(); }
    public void OpenTocSection(string name) { _tocOpen.Add(name); BuildToc(); }
    public List<string> ListedIds() => (List.ItemsSource as List<Row> ?? new()).Select(r => r.R.Id).ToList();

    void SetLeftTab(string tab)
    {
        _settings.LeftTab = tab;
        _settings.Save();
        TocPane.Visibility = tab == "toc" ? Visibility.Visible : Visibility.Collapsed;
        FilterPane.Visibility = tab == "toc" ? Visibility.Collapsed : Visibility.Visible;
        LeftTabs.SelectedItem = tab == "toc" ? TabToc : TabFilters;
    }

    void BuildToc()
    {
        if (Store == null) return;
        Toc.Children.Clear();
        var toc = Store.ById("oglavlenie-grafa");
        if (toc == null)
        {
            Toc.Children.Add(new TextBlock
            {
                Text = "В графе нет оглавления — записи knowledge/project/oglavlenie_grafa.py.",
                TextWrapping = TextWrapping.Wrap, Opacity = 0.6, FontSize = 12,
            });
            return;
        }
        var sections = new List<(string Name, List<string> Anchors)>();
        foreach (var l in toc.Links)
        {
            var m = System.Text.RegularExpressions.Regex.Match(l["тип"] as string ?? "", "^якорь раздела «(.*)»$");
            if (!m.Success) continue;
            var name = m.Groups[1].Value;
            var sec = sections.FirstOrDefault(x => x.Name == name);
            if (sec.Name == null) { sec = (name, new List<string>()); sections.Add(sec); }
            sec.Anchors.Add(l["куда"] as string ?? "");
        }
        var tagsOf = new Dictionary<string, List<string>>();
        foreach (var p in toc.Points)
        {
            var m = System.Text.RegularExpressions.Regex.Match(p, "^Раздел «(.*?)»(?: — метки: (.*?))?; якоря:");
            if (m.Success) tagsOf[m.Groups[1].Value] = m.Groups[2].Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        }
        var tagCount = Store.All.SelectMany(r => r.Tags).GroupBy(t => t).ToDictionary(g => g.Key, g => g.Count());

        foreach (var (name, anchors) in sections)
        {
            var open = _tocOpen.Contains(name);
            var body = new StackPanel { Spacing = 2, Padding = new Thickness(22, 2, 0, 8), Visibility = open ? Visibility.Visible : Visibility.Collapsed };
            var chev = new FontIcon { Glyph = open ? "" : "", FontSize = 10, Opacity = 0.7 };
            var headRow = new Grid { ColumnSpacing = 8 };
            headRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            headRow.ColumnDefinitions.Add(new ColumnDefinition());
            headRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            headRow.Children.Add(chev);
            var title = new TextBlock { Text = name, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap };
            Grid.SetColumn(title, 1);
            headRow.Children.Add(title);
            var n = new TextBlock { Text = anchors.Count.ToString(), Opacity = 0.5, FontSize = 12, VerticalAlignment = VerticalAlignment.Center };
            Grid.SetColumn(n, 2);
            headRow.Children.Add(n);
            var head = new Button
            {
                Content = headRow, HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch,
                Background = new SolidColorBrush(Colors.Transparent), BorderThickness = new Thickness(0), Padding = new Thickness(6, 6, 6, 6),
            };
            AutomationProperties.SetName(head, name);
            head.Click += (_, _) =>
            {
                var now = body.Visibility != Visibility.Visible;
                body.Visibility = now ? Visibility.Visible : Visibility.Collapsed;
                chev.Glyph = now ? "" : "";
                if (now) _tocOpen.Add(name); else _tocOpen.Remove(name);
            };

            foreach (var id in anchors)
            {
                var r = Store.ById(id);
                var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
                row.Children.Add(new Ellipse
                {
                    Width = 8, Height = 8, VerticalAlignment = VerticalAlignment.Center,
                    Fill = new SolidColorBrush(GraphView.Parse(Schema.ColorOf(r?.Folder ?? "project"))),
                });
                row.Children.Add(new TextBlock
                {
                    Text = r?.Title ?? id + " — нет такой записи", TextTrimming = TextTrimming.CharacterEllipsis, MaxWidth = 520,
                    Opacity = r == null ? 0.5 : 1, FontSize = 13,
                });
                var link = new Button
                {
                    Content = row, HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Left,
                    Background = new SolidColorBrush(Colors.Transparent), BorderThickness = new Thickness(0), Padding = new Thickness(4, 3, 4, 3),
                    IsEnabled = r != null,
                };
                ToolTipService.SetToolTip(link, r == null ? id : $"{Schema.NameOf(r.Folder)} · {r.Title}\n{id}");
                var target = id;
                link.Click += (_, _) => Select(target, center: true);
                body.Children.Add(link);
            }

            if (tagsOf.TryGetValue(name, out var tags) && tags.Count > 0)
            {
                var chips = new WrapPanel { Gap = 6, Margin = new Thickness(4, 6, 0, 0) };
                foreach (var tag in tags)
                {
                    var on = _tagsOn.Contains(tag);
                    var chip = new ToggleButton
                    {
                        IsChecked = on, Padding = new Thickness(8, 2, 8, 2), FontSize = 12,
                        Content = $"{tag} · {(tagCount.TryGetValue(tag, out var c) ? c : 0)}",
                    };
                    ToolTipService.SetToolTip(chip, on ? "Снять фильтр по метке" : "Фильтр по метке: остальное на графе потемнеет");
                    var t = tag;
                    chip.Click += (_, _) =>
                    {
                        if (chip.IsChecked == true) _tagsOn.Add(t); else _tagsOn.Remove(t);
                        BuildTags();
                        BuildToc();
                        Refresh();
                    };
                    chips.Children.Add(chip);
                }
                body.Children.Add(chips);
            }

            Toc.Children.Add(head);
            Toc.Children.Add(body);
        }
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
        ("all", "Всё время"), ("hour", "Час"), ("today", "Сегодня"), ("d3", "3 дня"), ("d7", "7 дней"), ("d30", "30 дней"),
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

    void BuildDateFilter()
    {
        if (Store == null) return;
        DateModeMod.IsChecked = !_dateAdded;
        DateModeAdd.IsChecked = _dateAdded;
        DatePresets.Children.Clear();
        foreach (var (key, label) in DatePresetList)
        {
            var b = new ToggleButton { Content = label, IsChecked = _datePreset == key, Padding = new Thickness(8, 2, 8, 2), FontSize = 12 };
            var k = key;
            b.Click += (_, _) => SetDatePreset(k);
            DatePresets.Children.Add(b);
        }
        BuildHistogram();
    }

    // Гистограмма: шаг — по размаху истории (час, если она укладывается в
    // двое суток; день — до двух месяцев; дальше — неделя), не больше 40
    // столбиков — последние.
    void BuildHistogram()
    {
        DateHist.Children.Clear();
        DateHist.ColumnDefinitions.Clear();
        var perRecord = Store!.All.Select(r => (r, WhenOf(r).ToList())).Where(x => x.Item2.Count > 0).ToList();
        var stamps = perRecord.SelectMany(x => x.Item2).ToList();
        if (stamps.Count == 0) { DateHistNote.Text = "История правок ещё читается…"; return; }
        var max = DateTime.Now;
        var min = stamps.Min();
        var span = max - min;
        TimeSpan step = span.TotalDays <= 2 ? TimeSpan.FromHours(1) : span.TotalDays <= 60 ? TimeSpan.FromDays(1) : TimeSpan.FromDays(7);
        DateTime Floor(DateTime d) => step.TotalHours == 1 ? new DateTime(d.Year, d.Month, d.Day, d.Hour, 0, 0)
            : step.TotalDays == 1 ? d.Date : d.Date.AddDays(-(((int)d.DayOfWeek + 6) % 7));
        var end = Floor(max).Add(step);
        var start = Floor(min);
        var buckets = new List<(DateTime From, DateTime To, int N)>();
        for (var t = start; t < end; t = t.Add(step))
        {
            var from = t; var to = t.Add(step);
            buckets.Add((from, to, perRecord.Count(x => x.Item2.Any(d => d >= from && d < to))));
        }
        if (buckets.Count > 40) buckets = buckets.Skip(buckets.Count - 40).ToList();
        var top = Math.Max(1, buckets.Max(b => b.N));
        for (var i = 0; i < buckets.Count; i++)
        {
            var (from, to, n) = buckets[i];
            DateHist.ColumnDefinitions.Add(new ColumnDefinition());
            var on = _dateFrom != null && from >= _dateFrom && (_dateTo == null || to <= _dateTo);
            var bar = new Border
            {
                Height = n == 0 ? 2 : Math.Max(4, 54.0 * n / top), VerticalAlignment = VerticalAlignment.Bottom, Margin = new Thickness(1, 0, 1, 0),
                CornerRadius = new CornerRadius(2, 2, 0, 0),
                Background = new SolidColorBrush(on ? Windows.UI.Color.FromArgb(255, 0xFF, 0x8A, 0x3D) : Windows.UI.Color.FromArgb(n == 0 ? (byte)60 : (byte)170, 0x4C, 0x7F, 0xB8)),
            };
            var hit = new Grid { Background = new SolidColorBrush(Colors.Transparent) };
            hit.Children.Add(bar);
            var fmt = step.TotalHours == 1 ? $"{from:dd.MM HH}:00–{to:HH}:00" : step.TotalDays == 1 ? $"{from:dd.MM.yyyy}" : $"неделя с {from:dd.MM.yyyy}";
            ToolTipService.SetToolTip(hit, $"{fmt}: {(_dateAdded ? "добавлено" : "менялось")} записей — {n}");
            hit.Tapped += (_, _) =>
            {
                var shift = Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(Windows.System.VirtualKey.Shift)
                    .HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down);
                if (shift && _histPick is { } p) _histPick = (from < p.From ? from : p.From, to > p.To ? to : p.To);
                else _histPick = (from, to);
                _datePreset = "custom";
                (_dateFrom, _dateTo) = (_histPick.Value.From, _histPick.Value.To);
                _pickerSync = true; DateFrom.Date = null; DateTo.Date = null; _pickerSync = false;
                BuildDateFilter();
                Refresh();
            };
            Grid.SetColumn(hit, i);
            DateHist.Children.Add(hit);
        }
        var unit = step.TotalHours == 1 ? "по часам" : step.TotalDays == 1 ? "по дням" : "по неделям";
        DateHistNote.Text = (_dateFrom != null || _dateTo != null
            ? $"Выбрано: {(_dateFrom == null ? "…" : _dateFrom.Value.ToString("dd.MM.yyyy HH:mm"))} — {(_dateTo == null ? "сейчас" : _dateTo.Value.ToString("dd.MM.yyyy HH:mm"))} · "
            : "") + $"{(_dateAdded ? "добавления" : "правки")} записей {unit}; щелчок — выбрать столбик, Shift — продлить";
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
        ColorLegend.Text = _recency is { } rc && ColorByDate.IsChecked == true
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
        // На графе — все записи: фильтры не прячут узлы, а приглушают
        // отсеянные (GraphView.Passing; задача пользователя 28.09.2026).
        // Раскладка от фильтра не меняется, связи отсеянных видны. Список —
        // как и был: в нём отсеянным не место.
        var all = Store.All.ToList();
        var ids = all.Select(r => r.Id).ToHashSet();
        var links = all.SelectMany(r => r.Links.Select(l => (From: r.Id, To: l["куда"] as string ?? "", Type: l["тип"] as string ?? "")))
            .Where(l => ids.Contains(l.To)).ToList();
        var vis = all;
        if (Lonely.IsChecked != true)
        {
            var linked = links.SelectMany(l => new[] { l.From, l.To }).ToHashSet();
            vis = all.Where(r => linked.Contains(r.Id) || r.Id == Panel.Current?.Id).ToList();
        }
        var filtered = FiltersOn;
        var passing = filtered ? all.Where(Passes).Select(r => r.Id).ToHashSet() : null;
        Graph.SetData(vis, links);
        Graph.Passing = passing;
        if (ColorByDate.IsChecked == true) UpdateRecency();
        Graph.Highlight = _matches.Select(m => m.Id).ToHashSet();
        Graph.Redraw();
        List.ItemsSource = SortRows((Search.Text.Trim().Length > 0 ? _matches.Where(Passes) : all.Where(Passes)).ToList());
        var shown = passing == null ? Graph.NodeCount : vis.Count(r => passing.Contains(r.Id));
        CountText.Text = $"Записей {all.Count} · на графе {Graph.NodeCount}" + (passing != null ? $", отобрано {shown}" : "")
            + $", связей {Graph.EdgeCount}" + (Search.Text.Trim().Length > 0 ? $" · найдено {_matches.Count}" : "");
        var problems = Store.Check().Count;
        CheckText.Text = problems == 0 ? "Проверка" : $"Проверка · {problems}";
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
        ModeGraph.IsChecked = mode == 0;
        Mode3D.IsChecked = mode == 1;
        ModeList.IsChecked = mode == 2;
        Graph.Visibility = mode == 2 ? Visibility.Collapsed : Visibility.Visible;
        ListPane.Visibility = mode == 2 ? Visibility.Visible : Visibility.Collapsed;
        NavHint.Visibility = HintBtn.Visibility = mode == 2 ? Visibility.Collapsed : Visibility.Visible;
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
        if (id == Panel.Current?.Id) { if (center && id != null) Graph.Select(id, true); return; }
        if (Panel.IsDirty && !await ConfirmLeave()) return;
        var r = id == null ? null : Store.ById(id);
        Panel.Show(r);
        if (r != null && !Graph.Has(r.Id)) Refresh();
        Graph.Select(r?.Id, center);
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
        public SearchItem(Record r) { R = r; }
        public Record R { get; }
        public override string ToString() => $"{R.Title}  · {Schema.NameOf(R.Folder)}";
    }

    public void SearchChanged()
    {
        if (Store == null) return;
        var words = Search.Text.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        _matches = words.Length == 0 ? new() : Store.All.Where(r => words.All(w => r.Haystack.Contains(w)))
            .OrderByDescending(r => words.Count(w => r.Title.ToLowerInvariant().Contains(w)))
            .ThenBy(r => r.Title).ToList();
        _matchAt = -1;
        Search.ItemsSource = _matches.Take(12).Select(r => new SearchItem(r)).ToList();
        Refresh();
    }

    public void NextMatch()
    {
        if (_matches.Count == 0) return;
        _matchAt = (_matchAt + 1) % _matches.Count;
        Select(_matches[_matchAt].Id, center: true);
        Status($"найдено {_matches.Count}, это {_matchAt + 1}-я; Enter — следующая");
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

    async Task ShowCheck()
    {
        if (Store == null) return;
        var problems = Store.Check();
        var list = new ListView { SelectionMode = ListViewSelectionMode.None, IsItemClickEnabled = true, MaxHeight = 480 };
        foreach (var (rec, text) in problems)
            list.Items.Add(new ListViewItem { Content = new TextBlock { Text = (rec != null ? rec.Title + " — " : "") + text, TextWrapping = TextWrapping.Wrap }, Tag = rec?.Id });
        foreach (var err in Store.LoadErrors)
            list.Items.Add(new ListViewItem { Content = new TextBlock { Text = "Не читается: " + err, TextWrapping = TextWrapping.Wrap } });
        var total = problems.Count + Store.LoadErrors.Count;
        var d = new ContentDialog
        {
            XamlRoot = Root.XamlRoot, Title = total == 0 ? "Замечаний нет" : $"Замечаний: {total}",
            Content = total == 0 ? new TextBlock { Text = "Все записи читаются, поля и связи в порядке." } : list,
            CloseButtonText = "Закрыть",
        };
        list.ItemClick += (_, e) => { if (e.ClickedItem is ListViewItem { Tag: string id }) { d.Hide(); Select(id, center: true); } };
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
  <Grid Padding="0,6" ColumnSpacing="10">
    <Grid.ColumnDefinitions>
      <ColumnDefinition Width="Auto"/><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/>
    </Grid.ColumnDefinitions>
    <Ellipse Width="10" Height="10" Fill="{Binding Color}" VerticalAlignment="Top" Margin="0,6,0,0"/>
    <StackPanel Grid.Column="1" Spacing="2">
      <TextBlock Text="{Binding Title}" TextWrapping="Wrap" FontWeight="SemiBold"/>
      <TextBlock Text="{Binding TagsText}" FontSize="12" Opacity="0.6" TextTrimming="CharacterEllipsis"/>
      <TextBlock Text="{Binding DatesText}" FontSize="11" Opacity="0.55"/>
    </StackPanel>
    <StackPanel Grid.Column="2" HorizontalAlignment="Right">
      <TextBlock Text="{Binding Kind}" FontSize="12" Opacity="0.7" HorizontalAlignment="Right"/>
      <TextBlock Text="{Binding Status}" FontSize="12" Opacity="0.7" HorizontalAlignment="Right"/>
      <TextBlock Text="{Binding DegText}" FontSize="12" Opacity="0.55" HorizontalAlignment="Right"/>
    </StackPanel>
  </Grid>
</DataTemplate>
""";
}
