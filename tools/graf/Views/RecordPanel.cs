using Graf.Model;
using Microsoft.UI;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Graf.Views;

// Карточка записи — инспектор по Human Interface Guidelines Apple (практика
// графа dizayn-programmy-graf-proekta-po-hig-apple; задача пользователя
// 28.09.2026 «в стиле iOS… пересмотри дизайн целиком»).
//
// Всё правится на месте: правка идёт в копию записи. Сверху — как правка на
// iPhone: при правках слева «Отменить», справа «Готово» (Ctrl+S) — главное
// действие полужирным; меню «⋯» — редкие действия. Шапка: вид и статус,
// крупный заголовок, дата. Вкладки — сегменты «Запись · Связи · История».
// Содержимое — карточками (inset grouped) с подписью раздела заглавными и
// пояснением под карточкой; поля в карточке — без рамок, как в формах iOS.
// Связи — строками с шевроном (переход к записи), правка связи — меню «⋯»
// строки. Запись поменяли снаружи (graph.py, редактор, git): без правок —
// карточка обновляется сама, с правками — сверху плашка с выбором.
public sealed class RecordPanel : Grid
{
    public Store? Store { get; set; }
    public Record? Current => _orig;
    public bool IsDirty => _edit != null && _orig != null && Store.Render(_edit) != Store.Render(_orig);

    public event Action<Record>? Saved;
    public event Action<string>? Navigate;
    public event Action<Record, string>? MoveRequested;
    public event Action<Record>? DeleteRequested;
    public event Action? DirtyChanged;

    // Граф кода и связи по смыслу (MainWindow.Code, 29.09.2026): соседи
    // записи по смыслу, файл графа кода для записи о модуле кода, переходы.
    public Func<string, List<(Record Rec, float Sim)>>? Similar { get; set; }
    public string SimilarNote { get; set; } = "";
    public Func<Record, string?>? CodeFileFor { get; set; }
    public event Action<string>? OpenCode;
    public event Action<string>? OpenKnowledge;
    public event Action<string, int>? OpenInEditor;
    CodeFile? _cf;
    CodeData? _cd;
    List<Record> _ck = new();

    Record? _orig, _edit;
    Record? _pendingExternal;
    readonly Grid _nav = new() { Padding = new Thickness(8, 8, 8, 0), MinHeight = 44 };
    readonly StackPanel _head = new() { Spacing = 4, Padding = new Thickness(18, 2, 18, 10) };
    readonly StackPanel _body = new() { Spacing = 6, Padding = new Thickness(14, 4, 14, 28) };
    readonly ScrollViewer _scroll = new();
    readonly Border _external = new() { Visibility = Visibility.Collapsed, Margin = new Thickness(14, 10, 14, 0), CornerRadius = new CornerRadius(12), Padding = new Thickness(14, 10, 10, 10) };
    readonly TextBlock _extTitle = Hig.Text("Запись изменена снаружи", Hig.T.Headline);
    readonly TextBlock _extText = Hig.Text("", Hig.T.Footnote, "HigSecondary", wrap: true);
    Segmented _tabs = null!;
    readonly Border _tabsHost = new() { Padding = new Thickness(14, 0, 14, 10) };
    static readonly string[] Tabs = { "Запись", "Связи", "История" };
    string _tab = "Запись";

    public RecordPanel()
    {
        Background = Hig.B("HigBackground");
        for (var i = 0; i < 5; i++) RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        RowDefinitions[4].Height = new GridLength(1, GridUnitType.Star);

        // Плашка «изменено снаружи»: оранжевая полоса слева, текст, два действия.
        _external.Background = Hig.B("HigCard");
        _external.BorderBrush = Hig.B("HigOrange");
        _external.BorderThickness = new Thickness(3, 0, 0, 0);
        var ext = new StackPanel { Spacing = 4 };
        ext.Children.Add(_extTitle);
        ext.Children.Add(_extText);
        var extBtns = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 4, Margin = new Thickness(-8, 2, 0, 0) };
        extBtns.Children.Add(Hig.TextButton("Загрузить новую", () => { if (_pendingExternal != null) Show(_pendingExternal, keepTab: true); _external.Visibility = Visibility.Collapsed; }, strong: true));
        extBtns.Children.Add(Hig.TextButton("Оставить мою", () => { if (_pendingExternal != null) _orig = _pendingExternal; _external.Visibility = Visibility.Collapsed; UpdateDirty(); }));
        ext.Children.Add(extBtns);
        _external.Child = ext;
        Children.Add(_external);

        SetRow(_nav, 1);
        Children.Add(_nav);
        SetRow(_head, 2);
        Children.Add(_head);

        _tabs = new Segmented(Tabs);
        _tabs.Changed += i => { _tab = Tabs[i]; Build(); };
        _tabsHost.Child = _tabs;
        SetRow(_tabsHost, 3);
        Children.Add(_tabsHost);

        _scroll.Content = _body;
        SetRow(_scroll, 4);
        Children.Add(_scroll);
        Show(null);
    }

    public void Show(Record? r, bool keepTab = false)
    {
        _cf = null;
        _orig = r;
        _edit = r?.Clone();
        _pendingExternal = null;
        _external.Visibility = Visibility.Collapsed;
        if (!keepTab) { _tab = Tabs[0]; _tabs.SelectedIndex = 0; }
        Build();
        UpdateDirty();
    }

    // Запись поменялась снаружи.
    public void External(Record newer)
    {
        if (_orig == null || newer.Id != _orig.Id) return;
        if (!IsDirty) { Show(newer, keepTab: true); return; }
        _pendingExternal = newer;
        _extTitle.Text = "Запись изменена снаружи";
        _extText.Text = "Здесь есть несохранённые правки. Загрузить новую версию из файла или оставить свои — при сохранении они заменят файл.";
        _external.Visibility = Visibility.Visible;
    }

    public void ExternalRemoved(string id)
    {
        if (_orig?.Id != id) return;
        if (IsDirty)
        {
            _extTitle.Text = "Файл записи удалён снаружи";
            _extText.Text = "«Готово» — записать заново с вашими правками; иначе закройте запись.";
            _external.Visibility = Visibility.Visible;
        }
        else Show(null);
    }

    // Для сценариев проверки: правка поля, как из карточки.
    public void TestSet(string key, string value)
    {
        if (_edit == null) return;
        _edit.Fields[key] = value;
        Build();
        UpdateDirty();
    }

    // Для сценариев проверки: открыть вкладку по названию.
    public void OpenTab(string name)
    {
        var i = Array.IndexOf(Tabs, name);
        if (i < 0) return;
        _tab = name;
        _tabs.SelectedIndex = i;
        Build();
    }

    public void SaveNow()
    {
        if (Store == null || _edit == null || !IsDirty) return;
        Store.Save(_edit);
        var saved = Store.ById(_edit.Id)!;
        Show(saved, keepTab: true);
        Saved?.Invoke(saved);
    }

    void UpdateDirty()
    {
        Nav();
        DirtyChanged?.Invoke();
    }

    void Changed() => UpdateDirty();

    // --- навигационная строка и шапка ----------------------------------------------

    // Слева — «Отменить» (при правках), справа — «⋯» и «Готово» (при правках).
    void Nav()
    {
        _nav.Children.Clear();
        _nav.ColumnDefinitions.Clear();
        if (_edit == null) return;
        _nav.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        _nav.ColumnDefinitions.Add(new ColumnDefinition());
        _nav.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var dirty = IsDirty;
        if (dirty)
        {
            var cancel = Hig.TextButton("Отменить", () => { if (_orig != null) Show(_orig, keepTab: true); });
            ToolTipService.SetToolTip(cancel, "Вернуть сохранённое");
            _nav.Children.Add(cancel);
            var mark = Hig.Text("Не сохранено", Hig.T.Footnote, "HigSecondary");
            mark.HorizontalAlignment = HorizontalAlignment.Center;
            Grid.SetColumn(mark, 1);
            _nav.Children.Add(mark);
        }
        var right = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 2 };
        var more = Hig.Icon("", "Ещё: перенести, копировать ID, показать файл, удалить", () => { }, "HigAccent");
        more.Flyout = MoreMenu();
        right.Children.Add(more);
        if (dirty)
        {
            var done = Hig.TextButton("Готово", SaveNow, strong: true);
            ToolTipService.SetToolTip(done, "Сохранить в файл (Ctrl+S)");
            right.Children.Add(done);
        }
        Grid.SetColumn(right, 2);
        _nav.Children.Add(right);
    }

    MenuFlyout MoreMenu()
    {
        var r = _edit!;
        var menu = new MenuFlyout();
        var move = new MenuFlyoutSubItem { Text = "Перенести в папку", Icon = new FontIcon { Glyph = "" } };
        foreach (var f in Schema.Folders.Where(f => f.Folder != r.Folder))
        {
            var it = new MenuFlyoutItem { Text = f.Name };
            it.Click += (_, _) => { if (_orig != null) MoveRequested?.Invoke(_orig, f.Folder); };
            move.Items.Add(it);
        }
        menu.Items.Add(move);
        var copy = new MenuFlyoutItem { Text = "Копировать ID", Icon = new FontIcon { Glyph = "" } };
        copy.Click += (_, _) =>
        {
            var dp = new Windows.ApplicationModel.DataTransfer.DataPackage();
            dp.SetText(r.Id);
            Windows.ApplicationModel.DataTransfer.Clipboard.SetContent(dp);
        };
        menu.Items.Add(copy);
        var folder = new MenuFlyoutItem { Text = "Показать файл в проводнике", Icon = new FontIcon { Glyph = "" } };
        folder.Click += (_, _) => { if (File.Exists(r.Path)) System.Diagnostics.Process.Start("explorer.exe", $"/select,\"{r.Path}\""); };
        menu.Items.Add(folder);
        menu.Items.Add(new MenuFlyoutSeparator());
        var del = new MenuFlyoutItem { Text = "Удалить запись…", Icon = new FontIcon { Glyph = "" }, Foreground = Hig.B("HigRed") };
        del.Click += (_, _) => { if (_orig != null) DeleteRequested?.Invoke(_orig); };
        menu.Items.Add(del);
        return menu;
    }

    // Шапка: вид записи (цвет) и статус строкой, крупный заголовок, дата.
    void Header()
    {
        var r = _edit!;
        _head.Children.Clear();
        var kind = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
        kind.Children.Add(new Border { Width = 9, Height = 9, CornerRadius = new CornerRadius(5), Background = new SolidColorBrush(GraphView.Parse(Schema.ColorOf(r.Folder))), VerticalAlignment = VerticalAlignment.Center });
        kind.Children.Add(Hig.Text(Schema.NameOf(r.Folder) + (r.Status.Length > 0 ? " · " + r.Status : ""), Hig.T.Subhead, "HigSecondary"));
        _head.Children.Add(kind);
        var title = Hig.Text(r.Title, Hig.T.LargeTitle, wrap: true);
        title.FontSize = 22;
        title.MaxLines = 4;
        title.IsTextSelectionEnabled = true;
        ToolTipService.SetToolTip(title, r.Title);
        _head.Children.Add(title);
        var dates = Store!.DatesOf(r);
        var meta = (r.Date.Length > 0 ? r.Date : "без даты") + (dates.Modified is { } m ? $" · изменено {m:dd.MM.yyyy HH:mm}" : "");
        _head.Children.Add(Hig.Text(meta, Hig.T.Footnote, "HigSecondary"));
    }

    // Пустое состояние (как ContentUnavailableView): значок, заголовок, что
    // сделать; клавиши — карточкой.
    void EmptyState()
    {
        var box = new StackPanel { Spacing = 10, Margin = new Thickness(8, 56, 8, 0) };
        var icon = new FontIcon { Glyph = "", FontSize = 44, Foreground = Hig.B("HigTertiary"), HorizontalAlignment = HorizontalAlignment.Center };
        box.Children.Add(icon);
        var t = Hig.Text("Запись не выбрана", Hig.T.Title3);
        t.HorizontalAlignment = HorizontalAlignment.Center;
        box.Children.Add(t);
        var s = Hig.Text("Щёлкните узел на графе, строку в списке или найдите запись поиском.", Hig.T.Subhead, "HigSecondary", wrap: true);
        s.TextAlignment = TextAlignment.Center;
        s.HorizontalAlignment = HorizontalAlignment.Center;
        s.MaxWidth = 300;
        box.Children.Add(s);
        var keys = Hig.Section("Клавиши", new[]
        {
            Hig.Row("Поиск", value: "Ctrl+F"), Hig.Row("Новая запись", value: "Ctrl+N"), Hig.Row("Сохранить", value: "Ctrl+S"),
            Hig.Row("Весь граф", value: "Home"), Hig.Row("Управление мышью и клавишами", value: "F1"),
        });
        keys.Margin = new Thickness(0, 24, 0, 0);
        box.Children.Add(keys);
        _body.Children.Add(box);
    }

    // --- построение ------------------------------------------------------------------

    void Build()
    {
        _body.Children.Clear();
        if (_cf != null) { CodePage(); return; }
        var has = _edit != null;
        _tabsHost.Visibility = _head.Visibility = has ? Visibility.Visible : Visibility.Collapsed;
        Nav();
        if (!has) { EmptyState(); return; }
        Header();
        switch (_tab)
        {
            case "Связи": LinksPage(); break;
            case "История": HistoryPage(); break;
            default: MainPage(); break;
        }
    }

    // Раздел: подпись заглавными, карточка, пояснение; отступ между разделами.
    void Section(string? header, IEnumerable<UIElement> rows, string? footer = null, double indent = 14)
    {
        var s = Hig.Section(header, rows, footer, indent);
        s.Margin = new Thickness(0, 14, 0, 0);
        _body.Children.Add(s);
    }

    // Поле без рамки внутри карточки (формы iOS): прозрачный фон и в покое,
    // и под мышью, и в фокусе — видно только каретку.
    static TextBox Field(string text, Action<string> set, bool multi = true, string? hint = null, TextAlignment align = TextAlignment.Left)
    {
        var tb = new TextBox
        {
            Text = text, TextWrapping = multi ? TextWrapping.Wrap : TextWrapping.NoWrap, AcceptsReturn = multi, PlaceholderText = hint,
            BorderThickness = new Thickness(0), Background = new SolidColorBrush(Colors.Transparent), Padding = new Thickness(0, 2, 0, 2),
            MinHeight = 0, FontSize = 14, TextAlignment = align, Foreground = Hig.B("HigLabel"),
        };
        foreach (var k in new[] { "TextControlBackgroundPointerOver", "TextControlBackgroundFocused", "TextControlBackground" })
            tb.Resources[k] = new SolidColorBrush(Colors.Transparent);
        foreach (var k in new[] { "TextControlBorderBrushFocused", "TextControlBorderBrushPointerOver", "TextControlBorderBrush" })
            tb.Resources[k] = new SolidColorBrush(Colors.Transparent);
        tb.Resources["TextControlForegroundFocused"] = Hig.B("HigLabel");
        tb.TextChanged += (_, _) => set(tb.Text);
        return tb;
    }

    static Border Cell(UIElement content) => new() { Child = content, Padding = new Thickness(14, 9, 12, 9) };

    static readonly HashSet<string> Known = new() { "id", "вид", "заголовок", "термин", "метки", "статус", "дата", "источник", "пункты", "связи", "прежнее_имя" };

    void MainPage()
    {
        var r = _edit!;
        var titleKey = r.Fields.Has("заголовок") || !r.Fields.Has("термин") ? "заголовок" : "термин";
        Section(titleKey == "термин" ? "Термин" : "Заголовок", new[]
        {
            Cell(Field(r.Fields[titleKey]?.ToString() ?? "", v => { r.Fields[titleKey] = v; Changed(); })),
        });

        // Статус — выбором справа; дата — полем справа (как строки настроек).
        var st = new ComboBox { IsEditable = true, BorderThickness = new Thickness(0), Background = new SolidColorBrush(Colors.Transparent), MinWidth = 150, HorizontalAlignment = HorizontalAlignment.Right };
        foreach (var s in Schema.Statuses) st.Items.Add(s);
        if (r.Status.Length > 0 && !st.Items.Contains(r.Status)) st.Items.Insert(0, r.Status);
        if (r.Status.Length > 0) st.SelectedItem = r.Status;
        st.SelectionChanged += (_, _) => { if (st.SelectedItem is string s && s != r.Status) { r.Fields["статус"] = s; Changed(); } };
        st.TextSubmitted += (_, e) => { var s = e.Text.Trim(); if (s.Length > 0 && s != r.Status) { r.Fields["статус"] = s; Changed(); } };
        var date = Field(r.Date, v => { r.Fields["дата"] = v; Changed(); }, multi: false, hint: DateTime.Today.ToString("yyyy-MM-dd"), align: TextAlignment.Right);
        date.Width = 120;
        date.Foreground = Hig.B("HigSecondary");
        Section("Сведения", new[]
        {
            Hig.Row("Статус", trailing: st),
            Hig.Row("Дата", trailing: date),
        }, "Дата — в виде ГГГГ-ММ-ДД.");

        Section("Источник", new[]
        {
            Cell(Field(r.Source, v => { r.Fields["источник"] = v; Changed(); }, hint: "Кто решил, где: сообщение, документ, совещание")),
        });

        Section(r.Tags.Count > 0 ? $"Метки · {r.Tags.Count}" : "Метки", new[] { TagsEditor() });

        Section(r.Points.Count > 0 ? $"Пункты · {r.Points.Count}" : "Пункты", PointsEditor(), indent: 40);

        // Прочие поля (у реестра — определение, синонимы, где встречается…).
        var other = r.Fields.ToList().Where(p => !Known.Contains(p.Key)).ToList();
        if (other.Count > 0)
        {
            var cells = new List<UIElement>();
            foreach (var (k, v) in other)
            {
                var name = char.ToUpper(k[0]) + k[1..].Replace('_', ' ');
                var sp = new StackPanel { Spacing = 2 };
                sp.Children.Add(Hig.Text(name, Hig.T.Footnote, "HigSecondary"));
                if (v is string or null)
                    sp.Children.Add(Field(v?.ToString() ?? "", t => { r.Fields[k] = t; Changed(); }));
                else if (v is List<object?> l && l.All(x => x is string))
                    sp.Children.Add(Field(string.Join("\r", l), t => { r.Fields[k] = t.Split('\r', '\n').Where(x => x.Length > 0).Cast<object?>().ToList(); Changed(); }, hint: "по значению на строку"));
                else
                {
                    var code = Hig.Text(Literal.Format(v), Hig.T.Footnote, "HigLabel", wrap: true);
                    code.FontFamily = new FontFamily("Cascadia Mono, Consolas");
                    code.IsTextSelectionEnabled = true;
                    code.MaxLines = 0;
                    sp.Children.Add(code);
                    sp.Children.Add(Hig.Text("Составное поле — правится в файле записи.", Hig.T.Caption, "HigSecondary"));
                }
                cells.Add(Cell(sp));
            }
            Section("Прочие поля", cells);
        }

        // Запись о файле кода — переход к нему в графе кода.
        if (CodeFileFor?.Invoke(r) is { } fileId)
            Section("Граф кода", new[] { Hig.Row("Открыть в графе кода", fileId[5..], glyph: "\uE943", acc: Hig.Acc.Chevron, click: () => OpenCode?.Invoke(fileId)) });

        var file = System.IO.Path.GetRelativePath(Store!.Root, r.Path.Length > 0 ? r.Path : Store.Know);
        var foot = Hig.Footer($"ID {r.Id}\nФайл {file}" + (r.OldName.Length > 0 ? $"\nПрежнее имя «{r.OldName}»" : ""));
        foot.IsTextSelectionEnabled = true;
        foot.Margin = new Thickness(14, 18, 14, 0);
        _body.Children.Add(foot);
    }

    UIElement TagsEditor()
    {
        var r = _edit!;
        var box = new StackPanel { Spacing = 4, Padding = new Thickness(12, 10, 12, 6) };
        var wrap = new WrapPanel();
        void Fill()
        {
            wrap.Children.Clear();
            foreach (var t in r.Tags)
                wrap.Children.Add(Hig.Token(t, () => { var l = r.Tags; l.Remove(t); r.Fields["метки"] = l.Cast<object?>().ToList(); Fill(); Changed(); }));
        }
        Fill();
        var add = new AutoSuggestBox { PlaceholderText = "Добавить метку", QueryIcon = new SymbolIcon(Symbol.Add), BorderThickness = new Thickness(0), CornerRadius = new CornerRadius(10), Background = Hig.B("HigFill") };
        var all = Store!.All.SelectMany(x => x.Tags).GroupBy(x => x).OrderByDescending(g => g.Count()).Select(g => g.Key).ToList();
        add.TextChanged += (s, e) =>
        {
            if (e.Reason != AutoSuggestionBoxTextChangeReason.UserInput) return;
            var q = add.Text.Trim().ToLowerInvariant();
            add.ItemsSource = q.Length == 0 ? null : all.Where(x => x.ToLowerInvariant().Contains(q) && !r.Tags.Contains(x)).Take(12).ToList();
        };
        add.QuerySubmitted += (s, e) =>
        {
            var t = (e.ChosenSuggestion as string ?? add.Text).Trim();
            if (t.Length == 0 || r.Tags.Contains(t)) return;
            var l = r.Tags;
            l.Add(t);
            r.Fields["метки"] = l.Cast<object?>().ToList();
            add.Text = "";
            Fill();
            Changed();
        };
        box.Children.Add(wrap);
        box.Children.Add(add);
        return box;
    }

    // Пункты: ячейка — номер, поле без рамки, «⋯» (выше, ниже, удалить);
    // последняя строка — «Добавить пункт» акцентом.
    List<UIElement> PointsEditor()
    {
        var r = _edit!;
        var cells = new List<UIElement>();
        var pts = r.Points;
        void Put(List<string> l) { r.Fields["пункты"] = l.Cast<object?>().ToList(); Changed(); Build(); }
        for (var i = 0; i < pts.Count; i++)
        {
            var idx = i;
            var g = new Grid { ColumnSpacing = 8, Padding = new Thickness(12, 8, 4, 8) };
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(20) });
            g.ColumnDefinitions.Add(new ColumnDefinition());
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var n = Hig.Text((i + 1).ToString(), Hig.T.Footnote, "HigSecondary");
            n.VerticalAlignment = VerticalAlignment.Top;
            n.HorizontalAlignment = HorizontalAlignment.Right;
            n.Margin = new Thickness(0, 3, 0, 0);
            g.Children.Add(n);
            var tb = Field(pts[i], v => { var l = r.Points; l[idx] = v.Replace("\r", "\n"); r.Fields["пункты"] = l.Cast<object?>().ToList(); Changed(); });
            Grid.SetColumn(tb, 1);
            g.Children.Add(tb);
            var more = Hig.Icon("", "Пункт: выше, ниже, удалить", () => { }, "HigSecondary", 14);
            more.VerticalAlignment = VerticalAlignment.Top;
            var menu = new MenuFlyout();
            var up = new MenuFlyoutItem { Text = "Выше", Icon = new FontIcon { Glyph = "" }, IsEnabled = idx > 0 };
            up.Click += (_, _) => { var l = r.Points; (l[idx - 1], l[idx]) = (l[idx], l[idx - 1]); Put(l); };
            var down = new MenuFlyoutItem { Text = "Ниже", Icon = new FontIcon { Glyph = "" }, IsEnabled = idx < pts.Count - 1 };
            down.Click += (_, _) => { var l = r.Points; (l[idx + 1], l[idx]) = (l[idx], l[idx + 1]); Put(l); };
            var del = new MenuFlyoutItem { Text = "Удалить пункт", Icon = new FontIcon { Glyph = "" }, Foreground = Hig.B("HigRed") };
            del.Click += (_, _) => { var l = r.Points; l.RemoveAt(idx); Put(l); };
            menu.Items.Add(up);
            menu.Items.Add(down);
            menu.Items.Add(new MenuFlyoutSeparator());
            menu.Items.Add(del);
            more.Flyout = menu;
            Grid.SetColumn(more, 2);
            g.Children.Add(more);
            cells.Add(g);
        }
        cells.Add(Hig.Row("Добавить пункт", glyph: "", titleColor: "HigAccent", click: () =>
        {
            var l = r.Points;
            l.Add($"{DateTime.Today:dd.MM.yyyy}: ");
            Put(l);
        }));
        return cells;
    }

    // --- связи -----------------------------------------------------------------------

    void LinksPage()
    {
        var r = _edit!;
        var links = r.Fields["связи"] as List<object?> ?? new List<object?>();
        var legacy = Store!.All.SelectMany(x => x.Links).Select(l => l["тип"] as string ?? "").Where(t => t.Length > 0 && GraphView.EdgeTypes.All(e => e.Type != t))
            .GroupBy(t => t).OrderByDescending(g => g.Count()).Select(g => g.Key).Take(25).ToList();

        // Отсюда: строка — запись, куда ведёт связь (вид связи — подписью),
        // шеврон — перейти; «⋯» — вид связи, другая запись, удалить.
        var rows = new List<UIElement>();
        for (var i = 0; i < links.Count; i++)
        {
            if (links[i] is not Map l) continue;
            var idx = i;
            var type = l["тип"] as string ?? "";
            var to = l["куда"] as string ?? "";
            var target = Store.ById(to);
            var more = Hig.Icon("", "Связь: вид, запись, удалить", () => { }, "HigSecondary", 14);
            more.Flyout = LinkMenu(l, legacy, () => { links.RemoveAt(idx); r.Fields["связи"] = links; Changed(); Build(); });
            rows.Add(Hig.Row(target?.Title ?? (to.Length > 0 ? to + " — нет такой записи" : "Выберите запись"), type.Length > 0 ? type : "вид не задан",
                dot: target == null ? null : GraphView.Parse(Schema.ColorOf(target.Folder)), trailing: more, acc: target == null ? Hig.Acc.None : Hig.Acc.Chevron,
                click: target == null ? null : () => Navigate?.Invoke(to), titleColor: target == null ? "HigSecondary" : "HigLabel"));
        }
        var addBtn = Hig.Row("Добавить связь", glyph: "", titleColor: "HigAccent", click: () => { });
        if (addBtn is Button ab) ab.Flyout = NewLinkFlyout(links);
        rows.Add(addBtn);
        Section(links.Count > 0 ? $"Отсюда · {links.Count}" : "Отсюда", rows, indent: 38);

        // Сюда — обратным именем вида («основа для», «реализовано в»): связь
        // пишется один раз, с другой стороны она читается так (SKOS).
        var inc = Store.Incoming(r.Id).ToList();
        if (inc.Count > 0)
            Section($"Сюда · {inc.Count}", inc.OrderBy(x => GraphView.InverseOf(x.Link["тип"] as string ?? "")).ThenBy(x => x.From.Title)
                .Select(x => Hig.Row(x.From.Title, GraphView.InverseOf(x.Link["тип"] as string ?? ""), dot: GraphView.Parse(Schema.ColorOf(x.From.Folder)),
                    acc: Hig.Acc.Chevron, click: () => Navigate?.Invoke(x.From.Id))), indent: 38);
        else
            Section("Сюда", new[] { Hig.Row("Ни одна запись сюда не ссылается", titleColor: "HigSecondary") });

        // Похоже по смыслу — соседи из индекса semsearch (выгрузка
        // .graf/semantic.json); кроме уже связанных. Нет выгрузки — подсказки
        // по общим соседям и по сходству слов (Model/Quality).
        var linkedIds = links.OfType<Map>().Select(l => l["куда"] as string).Concat(inc.Select(x => x.From.Id)).ToHashSet();
        var sim = Similar?.Invoke(r.Id).Where(x => !linkedIds.Contains(x.Rec.Id)).Take(8).ToList();
        if (sim is { Count: > 0 })
        {
            Section("Похоже по смыслу", sim.Select(x =>
            {
                var target = x.Rec;
                var add = Hig.Icon("\uE710", "Связать: «относится к»", () =>
                {
                    var ls = r.Fields["связи"] as List<object?> ?? new List<object?>();
                    ls.Add(new Map { new("тип", "относится к"), new("куда", target.Id), new("папка", target.Folder) });
                    r.Fields["связи"] = ls;
                    Changed();
                    Build();
                }, "HigAccent", 14);
                return Hig.Row(target.Title, $"похожесть {x.Sim:0.00}", dot: GraphView.Parse(Schema.ColorOf(target.Folder)), trailing: add, click: () => Navigate?.Invoke(target.Id));
            }), $"По смыслу текста (semsearch, {SimilarNote}). «+» ставит связь «относится к».", indent: 38);
            return;
        }
        var cands = Quality.Suggest(Store, r.Id);
        if (cands.Count == 0) return;
        Section("Возможно связано", cands.Select(c =>
        {
            var why = string.Join(" · ", new[] { c.ByNeighbours > 0 ? "общие соседи" : null, c.ByText > 0 ? $"похожий текст {c.ByText:0.00}" : null }.Where(x => x != null));
            var target = c.Rec;
            var add = Hig.Icon("", "Связать: «относится к»", () =>
            {
                var ls = r.Fields["связи"] as List<object?> ?? new List<object?>();
                ls.Add(new Map { new("тип", "относится к"), new("куда", target.Id), new("папка", target.Folder) });
                r.Fields["связи"] = ls;
                Changed();
                Build();
            }, "HigAccent", 14);
            return Hig.Row(target.Title, why, dot: GraphView.Parse(Schema.ColorOf(target.Folder)), trailing: add, click: () => Navigate?.Invoke(target.Id));
        }), "«+» ставит связь «относится к»; вид уточняется в «Отсюда».", indent: 38);
    }

    // Меню связи: вид — из словаря (с отметкой текущего), прежние виды —
    // подменю; «Другая запись…» — поиск; «Удалить» — красным.
    MenuFlyout LinkMenu(Map l, List<string> legacy, Action remove)
    {
        var menu = new MenuFlyout();
        var cur = l["тип"] as string ?? "";
        var kinds = new MenuFlyoutSubItem { Text = "Вид связи", Icon = new FontIcon { Glyph = "" } };
        foreach (var (t, _) in GraphView.EdgeTypes)
        {
            var it = new ToggleMenuFlyoutItem { Text = t, IsChecked = t == cur };
            var tt = t;
            it.Click += (_, _) => { l["тип"] = tt; Changed(); Build(); };
            kinds.Items.Add(it);
        }
        if (legacy.Count > 0)
        {
            var old = new MenuFlyoutSubItem { Text = "Прежние виды" };
            foreach (var t in legacy)
            {
                var it = new ToggleMenuFlyoutItem { Text = t, IsChecked = t == cur };
                var tt = t;
                it.Click += (_, _) => { l["тип"] = tt; Changed(); Build(); };
                old.Items.Add(it);
            }
            kinds.Items.Add(new MenuFlyoutSeparator());
            kinds.Items.Add(old);
        }
        menu.Items.Add(kinds);
        var other = new MenuFlyoutItem { Text = "Другая запись…", Icon = new FontIcon { Glyph = "" } };
        other.Click += (_, _) =>
        {
            var f = new Flyout();
            f.Content = TargetBox("", rec => { l["куда"] = rec.Id; l["папка"] = rec.Folder; f.Hide(); Changed(); Build(); });
            f.ShowAt(_tabsHost);
        };
        menu.Items.Add(other);
        menu.Items.Add(new MenuFlyoutSeparator());
        var del = new MenuFlyoutItem { Text = "Удалить связь", Icon = new FontIcon { Glyph = "" }, Foreground = Hig.B("HigRed") };
        del.Click += (_, _) => remove();
        menu.Items.Add(del);
        return menu;
    }

    // Новая связь: вид (словарь) и запись — поиском; «Добавить» — акцентом.
    Flyout NewLinkFlyout(List<object?> links)
    {
        var f = new Flyout();
        var sp = new StackPanel { Spacing = 10, Width = 360 };
        sp.Children.Add(Hig.Text("Новая связь", Hig.T.Headline));
        var kind = new ComboBox { Header = "Вид", HorizontalAlignment = HorizontalAlignment.Stretch };
        foreach (var (t, _) in GraphView.EdgeTypes.Where(e => e.Type is not ("раздел" or "якорь"))) kind.Items.Add(t);
        kind.SelectedItem = "относится к";
        sp.Children.Add(kind);
        Record? chosen = null;
        var box = TargetBox("", rec => chosen = rec);
        sp.Children.Add(box);
        var add = Hig.Prominent(Hig.Text("Добавить", Hig.T.Headline, "HigCard"), "Добавить связь", () =>
        {
            if (chosen == null || _edit == null) return;
            links.Add(new Map { new("тип", kind.SelectedItem as string ?? "относится к"), new("куда", chosen.Id), new("папка", chosen.Folder) });
            _edit.Fields["связи"] = links;
            f.Hide();
            Changed();
            Build();
        });
        ((TextBlock)add.Content).Foreground = new SolidColorBrush(Colors.White);
        add.HorizontalAlignment = HorizontalAlignment.Right;
        sp.Children.Add(add);
        f.Content = sp;
        return f;
    }

    // Выбор записи для связи: поиск по заголовку, ID и прежнему имени.
    AutoSuggestBox TargetBox(string text, Action<Record> chosen)
    {
        var box = new AutoSuggestBox { Text = text, PlaceholderText = "Запись — поиск по заголовку или ID", HorizontalAlignment = HorizontalAlignment.Stretch, MinWidth = 320, QueryIcon = new SymbolIcon(Symbol.Find) };
        box.DisplayMemberPath = "Label";
        box.TextChanged += (s, e) =>
        {
            if (e.Reason != AutoSuggestionBoxTextChangeReason.UserInput) return;
            var q = box.Text.Trim().ToLowerInvariant();
            box.ItemsSource = q.Length < 2 ? null : Store!.All
                .Where(x => x.Title.ToLowerInvariant().Contains(q) || x.Id.Contains(q) || x.OldName.ToLowerInvariant().Contains(q))
                .Take(15).Select(x => new Pick(x)).ToList();
        };
        box.SuggestionChosen += (_, e) => { if (e.SelectedItem is Pick p) { box.Text = p.R.Title; chosen(p.R); } };
        return box;
    }

    sealed class Pick
    {
        public Pick(Record r) { R = r; }
        public Record R { get; }
        public string Label => $"{R.Title}  · {Schema.NameOf(R.Folder)}";
        public override string ToString() => Label;
    }

    // --- история ---------------------------------------------------------------------

    void HistoryPage()
    {
        var r = _edit!;
        var hist = Store!.History(r);
        if (hist.Count == 0)
        {
            Section("История", new[] { Hig.Row("В истории git записи нет — ещё не закоммичена", titleColor: "HigSecondary") });
            return;
        }
        Section($"Коммиты · {hist.Count}", hist.Select(c =>
        {
            var sp = new StackPanel { Spacing = 2 };
            var subj = Hig.Text(c.Subject, T.Headline, wrap: true);
            subj.IsTextSelectionEnabled = true;
            sp.Children.Add(subj);
            sp.Children.Add(Hig.Text($"{c.Date} · {c.Author} · {c.Hash}", Hig.T.Footnote, "HigSecondary"));
            if (c.Body.Length > 0)
            {
                var b = Hig.Text(c.Body, Hig.T.Footnote, "HigLabel", wrap: true);
                b.IsTextSelectionEnabled = true;
                b.MaxLines = 0;
                b.Margin = new Thickness(0, 4, 0, 0);
                sp.Children.Add(b);
            }
            return (UIElement)Cell(sp);
        }), "Журнал изменений графа — история коммитов.");
    }

    static class T { public const Hig.T Headline = Hig.T.Headline; }

    // --- файл графа кода ----------------------------------------------------------------

    public void ShowCode(CodeFile f, CodeData c, List<Record> knowledge)
    {
        _orig = _edit = null;
        _cf = f;
        _cd = c;
        _ck = knowledge;
        _external.Visibility = Visibility.Collapsed;
        Build();
        DirtyChanged?.Invoke();
    }

    // Карточка файла: модуль и язык, путь; функции и классы (щелчок —
    // открыть в VS Code на строке); от кого файл зависит и кто от него (с
    // видами и числом случаев); записи графа знаний о нём.
    void CodePage()
    {
        var f = _cf!;
        var c = _cd!;
        _tabsHost.Visibility = Visibility.Collapsed;
        _head.Visibility = Visibility.Visible;
        _nav.Children.Clear();
        _nav.ColumnDefinitions.Clear();
        _nav.ColumnDefinitions.Add(new ColumnDefinition());
        _nav.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var open = Hig.TextButton("Открыть в VS Code", () => OpenInEditor?.Invoke(f.Path, 1), strong: true);
        Grid.SetColumn(open, 1);
        _nav.Children.Add(open);

        _head.Children.Clear();
        var kind = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
        kind.Children.Add(new Border { Width = 9, Height = 9, CornerRadius = new CornerRadius(5), Background = new SolidColorBrush(GraphView.Parse(Schema.ColorOf(f.Module))), VerticalAlignment = VerticalAlignment.Center });
        kind.Children.Add(Hig.Text($"{f.Module} · {f.Lang}", Hig.T.Subhead, "HigSecondary"));
        _head.Children.Add(kind);
        var title = Hig.Text(System.IO.Path.GetFileName(f.Path), Hig.T.LargeTitle, wrap: true);
        title.FontSize = 22;
        _head.Children.Add(title);
        var p = Hig.Text(f.Path, Hig.T.Footnote, "HigSecondary", wrap: true);
        p.IsTextSelectionEnabled = true;
        _head.Children.Add(p);

        var syms = f.Symbols;
        if (syms.Count > 0)
            Section($"Функции и классы · {syms.Count}", syms.Select(s =>
            {
                var (glyph, name) = s.Kind switch { "class" => ("\uE8F1", "класс"), "method" => ("\uE943", "метод"), _ => ("\uE943", "функция") };
                var line = s.Line;
                return Hig.Row(s.Name, name, value: $"стр. {line}", glyph: glyph, click: () => OpenInEditor?.Invoke(f.Path, line), tooltip: "Открыть в VS Code на строке " + line);
            }), "Щелчок — открыть файл в VS Code на этой строке.", indent: 44);
        else Section("Функции и классы", new[] { Hig.Row("В файле нет функций и классов", titleColor: "HigSecondary") });

        UIElement Dep((string Path, List<(string Kind, int N)> Kinds) d)
        {
            var target = "file:" + d.Path;
            var sub = string.Join(" · ", d.Kinds.OrderByDescending(k => k.N).Select(k => $"{k.Kind} {k.N}"));
            var mod = c.ById.TryGetValue(target, out var tf) ? tf.Module : "";
            return Hig.Row(d.Path, sub, dot: GraphView.Parse(Schema.ColorOf(mod)), acc: Hig.Acc.Chevron, click: () => OpenCode?.Invoke(target));
        }
        var outs = c.Edges.Where(e => e.From == f.Path).GroupBy(e => e.To)
            .Select(g => (g.Key, g.Select(x => (x.Kind, x.N)).ToList())).OrderByDescending(x => x.Item2.Sum(k => k.N)).ToList();
        var ins = c.Edges.Where(e => e.To == f.Path).GroupBy(e => e.From)
            .Select(g => (g.Key, g.Select(x => (x.Kind, x.N)).ToList())).OrderByDescending(x => x.Item2.Sum(k => k.N)).ToList();
        Section(outs.Count > 0 ? $"Зависит от · {outs.Count}" : "Зависит от", outs.Count > 0 ? outs.Select(Dep) : new[] { Hig.Row("Ни от какого файла проекта", titleColor: "HigSecondary") }, indent: 38);
        Section(ins.Count > 0 ? $"От него зависят · {ins.Count}" : "От него зависят", ins.Count > 0 ? ins.Select(Dep) : new[] { Hig.Row("Никакой файл проекта", titleColor: "HigSecondary") }, indent: 38);

        if (_ck.Count > 0)
            Section($"Записи графа знаний · {_ck.Count}", _ck.Select(r => Hig.Row(r.Title, Schema.NameOf(r.Folder),
                dot: GraphView.Parse(Schema.ColorOf(r.Folder)), acc: Hig.Acc.Chevron, click: () => OpenKnowledge?.Invoke(r.Id))), indent: 38);

        var foot = Hig.Footer($"Данные — CodeGraph ({c.Note}); зависимости — вызовы, импорты, ссылки и создание объектов между файлами.");
        foot.Margin = new Thickness(14, 18, 14, 0);
        _body.Children.Add(foot);
    }
}
