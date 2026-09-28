using Graf.Model;
using Graf.Views;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Markup;
using Microsoft.UI.Xaml.Media;

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
        AppWindow.Resize(new Windows.Graphics.SizeInt32(1600, 980));
        LeftCol.Width = new GridLength(_settings.LeftWidth);
        RightCol.Width = new GridLength(_settings.RightWidth);

        Graph.NodeClicked += id => Select(id, center: false);
        Graph.NodeHovered += id =>
        {
            var r = id == null ? null : Store?.ById(id);
            Tip.Visibility = r == null ? Visibility.Collapsed : Visibility.Visible;
            if (r != null) TipText.Text = $"{Schema.NameOf(r.Folder)} · {r.Status}\n{r.Title}";
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
        List.ItemClick += (_, e) => { if (e.ClickedItem is Row row) Select(row.R.Id, center: false); };
        HintBtn.Click += (_, _) => ToggleHint();
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

    bool Passes(Record r) =>
        !_foldersOff.Contains(r.Folder) && !_statusOff.Contains(r.Status) && _tagsOn.All(t => r.Tags.Contains(t));

    // --- показ ---------------------------------------------------------------

    public void Refresh()
    {
        if (Store == null) return;
        var vis = Store.All.Where(Passes).ToList();
        var ids = vis.Select(r => r.Id).ToHashSet();
        var links = vis.SelectMany(r => r.Links.Select(l => (From: r.Id, To: l["куда"] as string ?? "", Type: l["тип"] as string ?? "")))
            .Where(l => ids.Contains(l.To)).ToList();
        if (Lonely.IsChecked != true)
        {
            var linked = links.SelectMany(l => new[] { l.From, l.To }).ToHashSet();
            vis = vis.Where(r => linked.Contains(r.Id) || r.Id == Panel.Current?.Id).ToList();
        }
        Graph.SetData(vis, links);
        Graph.Highlight = _matches.Select(m => m.Id).ToHashSet();
        Graph.Redraw();
        var listed = (Search.Text.Trim().Length > 0 ? _matches.Where(Passes) : Store.All.Where(Passes))
            .OrderBy(r => Schema.Folders.ToList().FindIndex(f => f.Folder == r.Folder)).ThenBy(r => r.Title).ToList();
        var incoming = Store.All.SelectMany(r => r.Links.Select(l => l["куда"] as string ?? "")).GroupBy(x => x).ToDictionary(g => g.Key, g => g.Count());
        List.ItemsSource = listed.Select(r => new Row(r, r.Links.Count + (incoming.TryGetValue(r.Id, out var d) ? d : 0))).ToList();
        CountText.Text = $"Записей {Store.All.Count()} · на графе {Graph.NodeCount}, связей {Graph.EdgeCount}" + (Search.Text.Trim().Length > 0 ? $" · найдено {_matches.Count}" : "");
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
        List.Visibility = mode == 2 ? Visibility.Visible : Visibility.Collapsed;
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
        public Row(Record r, int deg) { R = r; Deg = deg; }
        public Record R { get; }
        public int Deg { get; }
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
