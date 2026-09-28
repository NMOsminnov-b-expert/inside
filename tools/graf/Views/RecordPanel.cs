using Graf.Model;
using Microsoft.UI;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Graf.Views;

// Карточка записи: всё правится на месте. Правка идёт в копию записи;
// «Сохранить» (Ctrl+S) пишет файл, «Отменить правки» возвращает сохранённое.
// Если запись поменяли снаружи (graph.py, редактор, git), а здесь правок
// нет — карточка обновляется сама; если правки есть — вверху предупреждение
// с выбором: загрузить новую или оставить свою.
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

    Record? _orig, _edit;
    Record? _pendingExternal;
    readonly StackPanel _body = new() { Spacing = 10, Padding = new Thickness(16, 12, 16, 24) };
    readonly ScrollViewer _scroll = new();
    readonly InfoBar _external = new() { Severity = InfoBarSeverity.Warning, IsClosable = false, Title = "Запись изменена снаружи" };
    readonly Button _save = new() { Content = "Сохранить", Style = (Style)Application.Current.Resources["AccentButtonStyle"] };
    readonly Button _revert = new() { Content = "Отменить правки" };
    readonly TextBlock _dirtyMark = new() { Text = "есть несохранённые правки", Foreground = new SolidColorBrush(Colors.DarkOrange), VerticalAlignment = VerticalAlignment.Center, FontSize = 12 };
    string _tab = "Запись";
    readonly SelectorBar _tabs = new();

    public RecordPanel()
    {
        RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

        var bar = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, Padding = new Thickness(16, 10, 16, 6) };
        ToolTipService.SetToolTip(_save, "Сохранить в файл (Ctrl+S)");
        ToolTipService.SetToolTip(_revert, "Вернуть сохранённое");
        _save.Click += (_, _) => SaveNow();
        _revert.Click += (_, _) => { if (_orig != null) Show(_orig, keepTab: true); };
        bar.Children.Add(_save);
        bar.Children.Add(_revert);
        bar.Children.Add(_dirtyMark);
        Children.Add(bar);

        var load = new Button { Content = "Загрузить новую" };
        var mine = new Button { Content = "Оставить мою" };
        load.Click += (_, _) => { if (_pendingExternal != null) Show(_pendingExternal, keepTab: true); _external.IsOpen = false; };
        mine.Click += (_, _) => { if (_pendingExternal != null) _orig = _pendingExternal; _external.IsOpen = false; UpdateDirty(); };
        _external.ActionButton = load;
        _external.Content = mine;
        _external.Message = "Здесь есть несохранённые правки. Загрузить новую версию из файла или оставить свои (при сохранении они заменят файл)?";
        SetRow(_external, 1);
        Children.Add(_external);

        foreach (var t in new[] { "Запись", "Связи", "История" }) _tabs.Items.Add(new SelectorBarItem { Text = t });
        _tabs.SelectedItem = _tabs.Items[0];
        _tabs.SelectionChanged += (_, _) => { _tab = (_tabs.SelectedItem as SelectorBarItem)?.Text ?? "Запись"; Build(); };
        _tabs.Margin = new Thickness(8, 0, 8, 0);
        SetRow(_tabs, 2);
        Children.Add(_tabs);

        _scroll.Content = _body;
        SetRow(_scroll, 3);
        Children.Add(_scroll);
        Show(null);
    }

    public void Show(Record? r, bool keepTab = false)
    {
        _orig = r;
        _edit = r?.Clone();
        _pendingExternal = null;
        _external.IsOpen = false;
        if (!keepTab) { _tab = "Запись"; _tabs.SelectedItem = _tabs.Items[0]; }
        Build();
        UpdateDirty();
    }

    // Запись поменялась снаружи.
    public void External(Record newer)
    {
        if (_orig == null || newer.Id != _orig.Id) return;
        if (!IsDirty) { Show(newer, keepTab: true); return; }
        _pendingExternal = newer;
        _external.IsOpen = true;
    }

    public void ExternalRemoved(string id)
    {
        if (_orig?.Id != id) return;
        if (IsDirty)
        {
            _external.Title = "Файл записи удалён снаружи";
            _external.Message = "Сохранить — записать заново с вашими правками; иначе закройте запись.";
            _external.IsOpen = true;
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
        var d = IsDirty;
        _save.IsEnabled = d;
        _revert.IsEnabled = d;
        _dirtyMark.Visibility = d ? Visibility.Visible : Visibility.Collapsed;
        DirtyChanged?.Invoke();
    }

    void Changed() => UpdateDirty();

    // --- построение карточки ------------------------------------------------

    // Для сценариев проверки: открыть вкладку карточки по названию.
    public void OpenTab(string name)
    {
        var item = _tabs.Items.FirstOrDefault(i => i.Text == name);
        if (item != null) _tabs.SelectedItem = item;
    }

    void Build()
    {
        _body.Children.Clear();
        _tabs.Visibility = _edit == null ? Visibility.Collapsed : Visibility.Visible;
        _save.Visibility = _revert.Visibility = _edit == null ? Visibility.Collapsed : Visibility.Visible;
        if (_edit == null)
        {
            _body.Children.Add(new TextBlock
            {
                Text = "Выберите запись на графе, в списке или поиском.\n\nЩелчок по узлу — открыть запись; колесо — масштаб; перетаскивание — сдвиг; узел можно тянуть.\n\nCtrl+F — поиск, Ctrl+N — новая запись, Ctrl+S — сохранить.",
                TextWrapping = TextWrapping.Wrap, Opacity = 0.75,
            });
            return;
        }
        Header();
        switch (_tab)
        {
            case "Связи": LinksPage(); break;
            case "История": HistoryPage(); break;
            default: MainPage(); break;
        }
    }

    void Header()
    {
        var r = _edit!;
        var head = new StackPanel { Spacing = 4 };
        var kind = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        kind.Children.Add(new Border { Width = 12, Height = 12, CornerRadius = new CornerRadius(6), Background = new SolidColorBrush(GraphView.Parse(Schema.ColorOf(r.Folder))), VerticalAlignment = VerticalAlignment.Center });
        kind.Children.Add(new TextBlock { Text = Schema.NameOf(r.Folder), Opacity = 0.8 });
        var more = new DropDownButton { Content = "Ещё", Margin = new Thickness(8, 0, 0, 0) };
        var menu = new MenuFlyout();
        var move = new MenuFlyoutSubItem { Text = "Перенести в папку" };
        foreach (var f in Schema.Folders.Where(f => f.Folder != r.Folder))
        {
            var it = new MenuFlyoutItem { Text = f.Name };
            it.Click += (_, _) => { if (_orig != null) MoveRequested?.Invoke(_orig, f.Folder); };
            move.Items.Add(it);
        }
        menu.Items.Add(move);
        var copy = new MenuFlyoutItem { Text = "Копировать ID" };
        copy.Click += (_, _) =>
        {
            var dp = new Windows.ApplicationModel.DataTransfer.DataPackage();
            dp.SetText(r.Id);
            Windows.ApplicationModel.DataTransfer.Clipboard.SetContent(dp);
        };
        menu.Items.Add(copy);
        var folder = new MenuFlyoutItem { Text = "Показать файл в проводнике" };
        folder.Click += (_, _) => { if (File.Exists(r.Path)) System.Diagnostics.Process.Start("explorer.exe", $"/select,\"{r.Path}\""); };
        menu.Items.Add(folder);
        menu.Items.Add(new MenuFlyoutSeparator());
        var del = new MenuFlyoutItem { Text = "Удалить запись…" };
        del.Click += (_, _) => { if (_orig != null) DeleteRequested?.Invoke(_orig); };
        menu.Items.Add(del);
        more.Flyout = menu;
        kind.Children.Add(more);
        head.Children.Add(kind);
        head.Children.Add(new TextBlock { Text = r.Title, FontSize = 18, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap });
        var meta = new TextBlock { FontSize = 12, Opacity = 0.65, TextWrapping = TextWrapping.Wrap, IsTextSelectionEnabled = true };
        meta.Text = $"ID {r.Id} · {System.IO.Path.GetRelativePath(Store!.Root, r.Path.Length > 0 ? r.Path : Store.Know)}"
                    + (r.OldName.Length > 0 ? $" · прежнее имя «{r.OldName}»" : "");
        head.Children.Add(meta);
        _body.Children.Add(head);
    }

    static TextBlock Label(string t) => new() { Text = t, FontSize = 12, Opacity = 0.7, Margin = new Thickness(0, 6, 0, 0) };

    TextBox Text(string key, bool multi = false)
    {
        var tb = new TextBox { Text = _edit!.Fields[key]?.ToString() ?? "", TextWrapping = TextWrapping.Wrap, AcceptsReturn = multi };
        tb.TextChanged += (_, _) => { _edit!.Fields[key] = tb.Text; Changed(); };
        return tb;
    }

    // Выпадающий список со своим вводом. Текущее значение выбирается как
    // пункт списка (если его нет среди пунктов — добавляется): Text у
    // редактируемого списка до показа не отображается, поле выглядело пустым.
    static ComboBox Combo(IEnumerable<string> items, string value, Action<string> set)
    {
        var cb = new ComboBox { IsEditable = true, HorizontalAlignment = HorizontalAlignment.Stretch };
        foreach (var i in items) cb.Items.Add(i);
        if (value.Length > 0 && !cb.Items.Contains(value)) cb.Items.Insert(0, value);
        if (value.Length > 0) cb.SelectedItem = value;
        var cur = value;
        void Put(string v) { if (v == cur) return; cur = v; set(v); }
        cb.SelectionChanged += (_, _) => { if (cb.SelectedItem is string s) Put(s); };
        cb.TextSubmitted += (_, e) => Put(e.Text.Trim());
        return cb;
    }

    static readonly HashSet<string> Known = new() { "id", "вид", "заголовок", "термин", "метки", "статус", "дата", "источник", "пункты", "связи", "прежнее_имя" };

    void MainPage()
    {
        var r = _edit!;
        var titleKey = r.Fields.Has("заголовок") || !r.Fields.Has("термин") ? "заголовок" : "термин";
        _body.Children.Add(Label(titleKey == "термин" ? "Термин" : "Заголовок"));
        _body.Children.Add(Text(titleKey, true));

        var row = new Grid { ColumnSpacing = 10 };
        row.ColumnDefinitions.Add(new ColumnDefinition());
        row.ColumnDefinitions.Add(new ColumnDefinition());
        var st = Combo(Schema.Statuses, r.Status, v => { r.Fields["статус"] = v; Changed(); });
        st.Header = "Статус";
        var date = new TextBox { Header = "Дата (ГГГГ-ММ-ДД)", Text = r.Date, PlaceholderText = DateTime.Today.ToString("yyyy-MM-dd") };
        date.TextChanged += (_, _) => { r.Fields["дата"] = date.Text; Changed(); };
        row.Children.Add(st);
        Grid.SetColumn(date, 1);
        row.Children.Add(date);
        _body.Children.Add(row);

        _body.Children.Add(Label("Источник — кто решил, где: сообщение, документ, совещание"));
        _body.Children.Add(Text("источник", true));

        _body.Children.Add(Label("Метки"));
        _body.Children.Add(TagsEditor());

        _body.Children.Add(Label("Пункты"));
        _body.Children.Add(PointsEditor());

        // Прочие поля (у реестра — определение, синонимы, где встречается…).
        foreach (var (k, v) in r.Fields.ToList())
        {
            if (Known.Contains(k)) continue;
            _body.Children.Add(Label(k.Replace('_', ' ')));
            if (v is string or null)
            {
                _body.Children.Add(Text(k, true));
            }
            else if (v is List<object?> l && l.All(x => x is string))
            {
                var tb = new TextBox { Text = string.Join("\r", l), AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, PlaceholderText = "по значению на строку" };
                tb.TextChanged += (_, _) => { r.Fields[k] = tb.Text.Split('\r', '\n').Where(x => x.Length > 0).Cast<object?>().ToList(); Changed(); };
                _body.Children.Add(tb);
            }
            else
            {
                _body.Children.Add(new TextBox
                {
                    Text = Literal.Format(v), IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap,
                    FontFamily = new FontFamily("Cascadia Mono, Consolas"), FontSize = 12,
                });
                _body.Children.Add(new TextBlock { Text = "Составное поле — правится в файле записи.", FontSize = 11, Opacity = 0.6 });
            }
        }
    }

    UIElement TagsEditor()
    {
        var r = _edit!;
        var box = new StackPanel { Spacing = 6 };
        var wrap = new WrapPanel();
        void Fill()
        {
            wrap.Children.Clear();
            foreach (var t in r.Tags)
            {
                var chip = new Button { Padding = new Thickness(10, 2, 6, 2), CornerRadius = new CornerRadius(12) };
                var sp = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
                sp.Children.Add(new TextBlock { Text = t });
                sp.Children.Add(new TextBlock { Text = "✕", FontSize = 10, VerticalAlignment = VerticalAlignment.Center, Opacity = 0.6 });
                chip.Content = sp;
                ToolTipService.SetToolTip(chip, "Убрать метку");
                chip.Click += (_, _) => { var l = r.Tags; l.Remove(t); r.Fields["метки"] = l.Cast<object?>().ToList(); Fill(); Changed(); };
                wrap.Children.Add(chip);
            }
        }
        Fill();
        var add = new AutoSuggestBox { PlaceholderText = "Добавить метку — Enter", QueryIcon = new SymbolIcon(Symbol.Add) };
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

    UIElement PointsEditor()
    {
        var r = _edit!;
        var list = new StackPanel { Spacing = 8 };
        void Fill()
        {
            list.Children.Clear();
            var pts = r.Points;
            for (var i = 0; i < pts.Count; i++)
            {
                var idx = i;
                var g = new Grid { ColumnSpacing = 4 };
                g.ColumnDefinitions.Add(new ColumnDefinition());
                g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                var tb = new TextBox { Text = pts[i], AcceptsReturn = true, TextWrapping = TextWrapping.Wrap };
                tb.TextChanged += (_, _) => { var l = r.Points; l[idx] = tb.Text.Replace("\r", "\n"); r.Fields["пункты"] = l.Cast<object?>().ToList(); Changed(); };
                var btns = new StackPanel { Spacing = 2 };
                Button B(string glyph, string tip, Action act)
                {
                    var b = new Button { Content = new FontIcon { Glyph = glyph, FontSize = 12 }, Padding = new Thickness(6, 4, 6, 4) };
                    ToolTipService.SetToolTip(b, tip);
                    b.Click += (_, _) => { act(); r.Fields["пункты"] = r.Points.Cast<object?>().ToList(); Fill(); Changed(); };
                    btns.Children.Add(b);
                    return b;
                }
                B("", "Выше", () => { var l = r.Points; if (idx > 0) { (l[idx - 1], l[idx]) = (l[idx], l[idx - 1]); r.Fields["пункты"] = l.Cast<object?>().ToList(); } }).IsEnabled = idx > 0;
                B("", "Ниже", () => { var l = r.Points; if (idx < l.Count - 1) { (l[idx + 1], l[idx]) = (l[idx], l[idx + 1]); r.Fields["пункты"] = l.Cast<object?>().ToList(); } }).IsEnabled = idx < pts.Count - 1;
                B("", "Удалить пункт", () => { var l = r.Points; l.RemoveAt(idx); r.Fields["пункты"] = l.Cast<object?>().ToList(); });
                g.Children.Add(tb);
                Grid.SetColumn(btns, 1);
                g.Children.Add(btns);
                list.Children.Add(g);
            }
            var add = new Button { Content = "+ Пункт" };
            add.Click += (_, _) =>
            {
                var l = r.Points;
                l.Add($"{DateTime.Today:dd.MM.yyyy}: ");
                r.Fields["пункты"] = l.Cast<object?>().ToList();
                Fill();
                Changed();
                if (list.Children[^2] is Grid gg && gg.Children[0] is TextBox t) { t.Focus(FocusState.Programmatic); t.SelectionStart = t.Text.Length; }
            };
            list.Children.Add(add);
        }
        Fill();
        return list;
    }

    // --- связи ---------------------------------------------------------------

    void LinksPage()
    {
        var r = _edit!;
        var types = Store!.All.SelectMany(x => x.Links).Select(l => l["тип"] as string ?? "").Where(t => t.Length > 0)
            .GroupBy(t => t).OrderByDescending(g => g.Count()).Select(g => g.Key).ToList();
        _body.Children.Add(Label("Связи отсюда"));
        var list = new StackPanel { Spacing = 8 };
        void Fill()
        {
            list.Children.Clear();
            var links = r.Fields["связи"] as List<object?> ?? new List<object?>();
            for (var i = 0; i < links.Count; i++)
            {
                if (links[i] is not Map l) continue;
                var idx = i;
                var g = new Grid { ColumnSpacing = 6 };
                g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(140) });
                g.ColumnDefinitions.Add(new ColumnDefinition());
                g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                var type = Combo(types.Take(40), l["тип"] as string ?? "", v => { l["тип"] = v; Changed(); });
                var target = Store.ById(l["куда"] as string ?? "");
                var pick = TargetBox(target?.Title ?? (l["куда"] as string ?? ""), rec => { l["куда"] = rec.Id; l["папка"] = rec.Folder; Changed(); });
                var go = new Button { Content = new FontIcon { Glyph = "", FontSize = 12 } };
                ToolTipService.SetToolTip(go, "Открыть запись");
                go.Click += (_, _) => { if (l["куда"] is string id) Navigate?.Invoke(id); };
                var del = new Button { Content = new FontIcon { Glyph = "", FontSize = 12 } };
                ToolTipService.SetToolTip(del, "Удалить связь");
                del.Click += (_, _) => { links.RemoveAt(idx); r.Fields["связи"] = links; Fill(); Changed(); };
                g.Children.Add(type);
                Grid.SetColumn(pick, 1); g.Children.Add(pick);
                Grid.SetColumn(go, 2); g.Children.Add(go);
                Grid.SetColumn(del, 3); g.Children.Add(del);
                list.Children.Add(g);
            }
            var add = new Button { Content = "+ Связь" };
            add.Click += (_, _) =>
            {
                var ls = r.Fields["связи"] as List<object?> ?? new List<object?>();
                ls.Add(new Map { new("тип", types.FirstOrDefault() ?? "связано с"), new("куда", ""), new("папка", "") });
                r.Fields["связи"] = ls;
                Fill();
                Changed();
            };
            list.Children.Add(add);
        }
        Fill();
        _body.Children.Add(list);

        // Связи сюда — обратным именем вида («основа для», «реализовано в»):
        // связь пишется один раз, с другой стороны она читается так (SKOS,
        // GraphView.Inverse). Сгруппированы по виду.
        var inc = Store.Incoming(r.Id).ToList();
        _body.Children.Add(Label($"Связи сюда · {inc.Count}"));
        foreach (var grp in inc.GroupBy(x => GraphView.InverseOf(x.Link["тип"] as string ?? "")).OrderBy(g => g.Key))
        {
            var col = GraphView.EdgeTypeColor(grp.First().Link["тип"] as string ?? "");
            _body.Children.Add(new TextBlock
            {
                Text = grp.Key, FontSize = 12, Margin = new Thickness(0, 6, 0, 0),
                Foreground = new SolidColorBrush(col),
            });
            foreach (var (from, _) in grp.OrderBy(x => x.From.Title))
                _body.Children.Add(RecordLink(from, null));
        }

        // Возможно связано: кандидаты по общим соседям и по сходству текста
        // (практика kak-uluchshat-graf-znaniy-…, Model/Quality). «+» ставит
        // связь «относится к» — вид потом уточняется в списке выше.
        var cands = Quality.Suggest(Store, r.Id);
        if (cands.Count == 0) return;
        _body.Children.Add(Label("Возможно связано"));
        foreach (var c in cands)
        {
            var why = string.Join(" · ", new[]
            {
                c.ByNeighbours > 0 ? "общие соседи" : null,
                c.ByText > 0 ? $"похожий текст {c.ByText:0.00}" : null,
            }.Where(x => x != null));
            var g = new Grid { ColumnSpacing = 6 };
            g.ColumnDefinitions.Add(new ColumnDefinition());
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            g.Children.Add(RecordLink(c.Rec, why));
            var add = new Button { Content = new FontIcon { Glyph = "", FontSize = 12 }, VerticalAlignment = VerticalAlignment.Center };
            ToolTipService.SetToolTip(add, "Связать: «относится к»");
            var target = c.Rec;
            add.Click += (_, _) =>
            {
                var ls = r.Fields["связи"] as List<object?> ?? new List<object?>();
                ls.Add(new Map { new("тип", "относится к"), new("куда", target.Id), new("папка", target.Folder) });
                r.Fields["связи"] = ls;
                Changed();
                Fill();
                add.IsEnabled = false;
            };
            Grid.SetColumn(add, 1);
            g.Children.Add(add);
            _body.Children.Add(g);
        }
    }

    HyperlinkButton RecordLink(Record rec, string? note)
    {
        var b = new HyperlinkButton { Padding = new Thickness(0, 2, 0, 2), HorizontalContentAlignment = HorizontalAlignment.Left };
        var sp = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
        sp.Children.Add(new Border { Width = 9, Height = 9, CornerRadius = new CornerRadius(5), Background = new SolidColorBrush(GraphView.Parse(Schema.ColorOf(rec.Folder))), VerticalAlignment = VerticalAlignment.Center });
        sp.Children.Add(new TextBlock { Text = rec.Title, TextTrimming = TextTrimming.CharacterEllipsis, MaxWidth = 300 });
        if (note != null) sp.Children.Add(new TextBlock { Text = note, Opacity = 0.55, FontSize = 12, VerticalAlignment = VerticalAlignment.Center });
        b.Content = sp;
        ToolTipService.SetToolTip(b, $"{Schema.NameOf(rec.Folder)} · {rec.Title}");
        b.Click += (_, _) => Navigate?.Invoke(rec.Id);
        return b;
    }

    // Выбор записи для связи: поиск по заголовку, ID и прежнему имени.
    AutoSuggestBox TargetBox(string text, Action<Record> chosen)
    {
        var box = new AutoSuggestBox { Text = text, PlaceholderText = "Куда — поиск записи", HorizontalAlignment = HorizontalAlignment.Stretch };
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

    // --- история -------------------------------------------------------------

    void HistoryPage()
    {
        var r = _edit!;
        var hist = Store!.History(r);
        _body.Children.Add(Label(hist.Count == 0 ? "В истории git записи нет (ещё не закоммичена)" : $"Коммиты с этой записью · {hist.Count}"));
        foreach (var c in hist)
        {
            var sp = new StackPanel { Spacing = 2, Padding = new Thickness(0, 4, 0, 6) };
            sp.Children.Add(new TextBlock { Text = c.Subject, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap, IsTextSelectionEnabled = true });
            sp.Children.Add(new TextBlock { Text = $"{c.Date} · {c.Author} · {c.Hash}", FontSize = 12, Opacity = 0.65, IsTextSelectionEnabled = true });
            if (c.Body.Length > 0)
                sp.Children.Add(new TextBlock { Text = c.Body, FontSize = 12, TextWrapping = TextWrapping.Wrap, Opacity = 0.85, IsTextSelectionEnabled = true });
            _body.Children.Add(sp);
        }
    }
}
