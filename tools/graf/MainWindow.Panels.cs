using Graf.Model;
using Graf.Views;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Graf;

// Боковая панель, переключатели вида и капсулы над графом — по Human
// Interface Guidelines Apple (практика графа dizayn-programmy-graf-proekta-po-hig-apple;
// задача пользователя 28.09.2026 «в стиле iOS… пересмотри дизайн целиком»).
//
// Боковая панель — два уровня (HIG Sidebars): группа — заголовок с
// треугольником, внутри — строки. Фильтры — строки с галочкой справа (выбор
// варианта в списке iOS), не флажки слева; число записей — значением справа;
// «Показать все» — строкой акцентом. Сверху — сводка: сколько отобрано,
// применённое метками-капсулами с крестиком, «Сбросить». Оглавление —
// разделы с треугольником, выбранная запись подсвечена постоянно (HIG Split
// views). Элементы — Views/Hig.cs.
public sealed partial class MainWindow
{
    // Сколько значений группы видно до «Показать все».
    const int GroupPreview = 8;
    readonly HashSet<string> _showAll = new();

    Segmented _modeSeg = null!, _leftSeg = null!, _layoutSeg = null!, _egoSeg = null!;
    Button BtnNew = null!;
    readonly CalendarDatePicker DateFrom = new() { PlaceholderText = "дата", HorizontalAlignment = HorizontalAlignment.Right };
    readonly CalendarDatePicker DateTo = new() { PlaceholderText = "дата", HorizontalAlignment = HorizontalAlignment.Right };
    readonly Grid DateHist = new() { Height = 56 };
    readonly TextBlock DateHistNote = Hig.Footer("");
    readonly TextBlock ColorLegend = Hig.Footer("");
    ToggleSwitch ColorByDate = null!, Lonely = null!;
    readonly TextBox TagFilter = new()
    {
        PlaceholderText = "Найти метку", CornerRadius = new CornerRadius(10), BorderThickness = new Thickness(0),
        Margin = new Thickness(0, 0, 0, 8),
    };
    readonly StackPanel _secFolders = new(), _secStatus = new(), _secDate = new(), _secEdges = new(), _secTags = new(), _secShow = new();
    double _leftWidth;

    void InitPanels()
    {
        _modeSeg = new Segmented(new[] { "Граф", "3D", "Список" });
        _modeSeg.Changed += i => SetMode(i);
        ModeHost.Child = _modeSeg;
        ToolTipService.SetToolTip(_modeSeg, "Граф — Ctrl+1, 3D — Ctrl+2, список — Ctrl+3");

        var plus = new FontIcon { Glyph = "", FontSize = 14, Foreground = new SolidColorBrush(Colors.White) };
        BtnNew = Hig.Prominent(plus, "Новая запись (Ctrl+N)", async () => await NewRecord());
        BtnNew.Padding = new Thickness(9);
        NewHost.Child = BtnNew;

        BtnSidebar.Click += (_, _) => ToggleSidebar();

        _leftSeg = new Segmented(new[] { "Оглавление", "Фильтры" });
        _leftSeg.Changed += i => SetLeftTab(i == 0 ? "toc" : "filters");
        LeftSegHost.Child = _leftSeg;

        _layoutSeg = new Segmented(new[] { "Свободно", "Острова", "Темы", "Смысл" }, _settings.Grouping, dark: true, fontSize: 12);
        _layoutSeg.Changed += i =>
        {
            if (i == 3 && _code) { Status("«Смысл» — раскладка графа знаний: у файлов кода связей по смыслу нет"); _layoutSeg.SelectedIndex = _settings.Grouping; return; }
            SetLayout(i);
        };
        ToolTipService.SetToolTip(_layoutSeg, "Свободно — силовая раскладка; Острова — записи одного вида (в коде — модуль) в своей области; Темы — острова по сообществам связей; Смысл — рядом то, что похоже по смыслу");
        LayoutHost.Child = _layoutSeg;

        _egoSeg = new Segmented(new[] { "Выкл", "1", "2", "3" }, Graph.EgoHops, dark: true, fontSize: 12);
        _egoSeg.Changed += h =>
        {
            Graph.SetEgo(h);
            if (h > 0 && Graph.Selected == null) Status("Окрестность: выберите запись на графе");
            else if (h > 0) Status($"Окрестность: записей {Graph.EgoCount}");
        };
        EgoHost.Child = _egoSeg;

        DateFrom.DateChanged += (_, _) => OnPickers();
        DateTo.DateChanged += (_, _) => OnPickers();
        ColorByDate = Hig.Switch(false, on => { UpdateRecency(); Graph.NodeColor = on ? RecencyColor : null; Graph.Redraw(); });
        Lonely = Hig.Switch(false, _ => Refresh());
        TagFilter.Background = Hig.B("HigFill");
        TagFilter.TextChanged += (_, _) => BuildTags();

        foreach (var sec in new[] { _secFolders, _secStatus, _secDate, _secEdges, _secTags, _secShow })
            FilterHost.Children.Add(sec);
    }

    // Боковая панель скрывается кнопкой на панели инструментов (HIG Sidebars:
    // «let people hide the sidebar»), ширина возвращается прежняя.
    void ToggleSidebar()
    {
        if (Sidebar.Visibility == Visibility.Visible)
        {
            _leftWidth = LeftCol.ActualWidth;
            Sidebar.Visibility = LeftSplit.Visibility = Visibility.Collapsed;
            LeftCol.Width = new GridLength(0);
        }
        else
        {
            Sidebar.Visibility = LeftSplit.Visibility = Visibility.Visible;
            LeftCol.Width = new GridLength(_leftWidth > 0 ? _leftWidth : _settings.LeftWidth);
        }
    }

    void SetLeftTab(string tab)
    {
        _settings.LeftTab = tab;
        _settings.Save();
        TocPane.Visibility = tab == "toc" ? Visibility.Visible : Visibility.Collapsed;
        FilterPane.Visibility = tab == "toc" ? Visibility.Collapsed : Visibility.Visible;
        _leftSeg.SelectedIndex = tab == "toc" ? 0 : 1;
    }

    // --- раскладка и окрестность -------------------------------------------------
    //
    // 0 — свободно, 1 — острова по виду записи, 2 — по темам (сообществам
    // связей; ответ пользователя 28.09.2026 «Берем все»).
    public void SetLayout(int grouping)
    {
        _layoutSeg.SelectedIndex = grouping;
        Graph.SetGrouping(grouping);
        _settings.Grouping = grouping;
        _settings.Save();
    }

    void SyncEgo() => _egoSeg.SelectedIndex = Graph.EgoHops;

    // --- группы фильтров ---------------------------------------------------------

    bool Open(string key) => _settings.OpenGroups.Contains(key);

    void Toggle(string key)
    {
        if (!_settings.OpenGroups.Remove(key)) _settings.OpenGroups.Add(key);
        _settings.Save();
    }

    // Группа: заголовок с треугольником и тем, что в ней задано; раскрыта —
    // карточка со строками (первые GroupPreview, дальше «Показать все»).
    void Group(StackPanel host, string key, string title, string note, Func<List<UIElement>> rows, Action rebuild, string? footer = null, double indent = 38)
    {
        host.Children.Clear();
        var open = Open(key);
        host.Children.Add(Hig.SidebarHeader(title, open, note, () => { Toggle(key); rebuild(); }));
        if (!open) return;
        var all = rows();
        var shown = _showAll.Contains(key) || all.Count <= GroupPreview + 2 ? all : all.Take(GroupPreview).ToList();
        if (all.Count > GroupPreview + 2)
        {
            var expanded = _showAll.Contains(key);
            shown = shown.ToList();
            shown.Add(Hig.Row(expanded ? "Свернуть" : "Показать все", value: expanded ? null : all.Count.ToString(), titleColor: "HigAccent",
                click: () => { if (!_showAll.Remove(key)) _showAll.Add(key); rebuild(); }));
        }
        var card = Hig.Card(shown, indent);
        card.Margin = new Thickness(0, 2, 0, footer == null ? 12 : 4);
        host.Children.Add(card);
        if (footer != null) { var f = Hig.Footer(footer); f.Margin = new Thickness(14, 0, 14, 12); host.Children.Add(f); }
    }

    // Строка значения фильтра: цвет, название, число; галочка — значение в отборе.
    static UIElement FilterRow(string text, int count, string? color, bool on, Action<bool> changed)
        => Hig.Row(text, value: count.ToString(), dot: color == null ? null : GraphView.Parse(color), acc: on ? Hig.Acc.Check : Hig.Acc.None,
            click: () => changed(!on), tooltip: text);

    void BuildFilters()
    {
        if (Store == null) return;
        Group(_secFolders, "folders", "Вид записи", _foldersOff.Count > 0 ? $"скрыто {_foldersOff.Count}" : "", () =>
            Schema.Folders.Select(f => (f, n: Store.All.Count(r => r.Folder == f.Folder))).Where(x => x.n > 0)
                .Select(x => FilterRow(x.f.Name, x.n, x.f.Color, !_foldersOff.Contains(x.f.Folder), on =>
                {
                    if (on) _foldersOff.Remove(x.f.Folder); else _foldersOff.Add(x.f.Folder);
                    BuildFilters();
                    Refresh();
                })).ToList(), BuildFilters);
        Group(_secStatus, "status", "Статус", _statusOff.Count > 0 ? $"скрыто {_statusOff.Count}" : "", () =>
            Store.All.GroupBy(r => r.Status).OrderBy(g => g.Key)
                .Select(g => FilterRow(g.Key.Length > 0 ? g.Key : "без статуса", g.Count(), null, !_statusOff.Contains(g.Key), on =>
                {
                    if (on) _statusOff.Remove(g.Key); else _statusOff.Add(g.Key);
                    BuildFilters();
                    Refresh();
                })).ToList(), BuildFilters, indent: 14);
        BuildDateFilter();
        BuildTags();
        _secShow.Children.Clear();
        _secShow.Children.Add(Hig.SidebarHeader("Показ", true, null, () => { }));
        var card = Hig.Card(new[] { Hig.SwitchRow("Записи без связей", Lonely.IsOn, on => { Lonely.IsOn = on; }) });
        // Переключатель строки и Lonely — одно и то же: строка перестраивается,
        // а состояние хранит Lonely.
        card.Margin = new Thickness(0, 2, 0, 4);
        _secShow.Children.Add(card);
        var f = Hig.Footer("На графе — и узлы без единой связи (в основном поля реестра).");
        f.Margin = new Thickness(14, 0, 14, 12);
        _secShow.Children.Add(f);
    }

    void BuildTags()
    {
        if (Store == null) return;
        var q = TagFilter.Text.Trim().ToLowerInvariant();
        _secTags.Children.Clear();
        var open = Open("tags");
        _secTags.Children.Add(Hig.SidebarHeader("Метки", open, _tagsOn.Count > 0 ? $"выбрано {_tagsOn.Count}" : "", () => { Toggle("tags"); BuildTags(); }));
        if (!open) return;
        if (TagFilter.Parent is Microsoft.UI.Xaml.Controls.Panel old) old.Children.Remove(TagFilter);
        _secTags.Children.Add(TagFilter);
        var rows = new List<UIElement>();
        // Отмеченные — сверху: их видно и без «Показать все».
        foreach (var g in Store.All.SelectMany(r => r.Tags).GroupBy(t => t)
                     .OrderByDescending(g => _tagsOn.Contains(g.Key)).ThenByDescending(g => g.Count()).ThenBy(g => g.Key))
        {
            var t = g.Key;
            if (q.Length > 0 && !t.ToLowerInvariant().Contains(q) && !_tagsOn.Contains(t)) continue;
            rows.Add(FilterRow(t, g.Count(), null, _tagsOn.Contains(t), on =>
            {
                if (on) _tagsOn.Add(t); else _tagsOn.Remove(t);
                BuildTags();
                BuildToc();
                Refresh();
            }));
        }
        var all = q.Length > 0 || _showAll.Contains("tags") || rows.Count <= GroupPreview + 2;
        var shown = all ? rows : rows.Take(GroupPreview).ToList();
        if (q.Length == 0 && rows.Count > GroupPreview + 2)
            shown.Add(Hig.Row(_showAll.Contains("tags") ? "Свернуть" : "Показать все", value: _showAll.Contains("tags") ? null : rows.Count.ToString(),
                titleColor: "HigAccent", click: () => { if (!_showAll.Remove("tags")) _showAll.Add("tags"); BuildTags(); }));
        if (shown.Count == 0) shown.Add(Hig.Row("Нет таких меток", titleColor: "HigSecondary"));
        var card = Hig.Card(shown);
        card.Margin = new Thickness(0, 0, 0, 4);
        _secTags.Children.Add(card);
        var f = Hig.Footer("Отмеченные метки должны быть у записи все сразу.");
        f.Margin = new Thickness(14, 0, 14, 12);
        _secTags.Children.Add(f);
    }

    // Виды связей — легенда графа: цвет, число, показывать ли.
    void BuildEdgeKinds()
    {
        var counts = Graph.EdgeTypesPresent.GroupBy(t => t).ToDictionary(g => g.Key, g => g.Count());
        var order = GraphView.EdgeTypes.Select(e => e.Type).Where(counts.ContainsKey)
            .Concat(counts.Keys.Where(k => GraphView.EdgeTypes.All(e => e.Type != k)).OrderByDescending(k => counts[k])).ToList();
        Group(_secEdges, "edges", "Виды связей", _hiddenEdges.Count > 0 ? $"скрыто {_hiddenEdges.Count}" : "", () => order.Select(t =>
        {
            var col = GraphView.EdgeTypeColor(t);
            return FilterRow(t, counts[t], $"#{col.R:X2}{col.G:X2}{col.B:X2}", !_hiddenEdges.Contains(t), v =>
            {
                if (v) _hiddenEdges.Remove(t); else _hiddenEdges.Add(t);
                ApplyHiddenEdges();
                BuildEdgeKinds();
            });
        }).ToList(), BuildEdgeKinds);
    }

    // --- дата ----------------------------------------------------------------------
    //
    // Что считать — сегментами («Менялись» — любая правка в период,
    // «Добавлены» — появление записи); период — строками с галочкой; свой
    // период — две строки с выбором даты; гистограмма правок — столбик
    // щелчком (Shift — продлить); цвет узла по дате — переключателем.
    void BuildDateFilter()
    {
        if (Store == null) return;
        _secDate.Children.Clear();
        var active = _dateFrom != null || _dateTo != null;
        var open = Open("date");
        _secDate.Children.Add(Hig.SidebarHeader("Дата правок", open, active ? PeriodText() : "", () => { Toggle("date"); BuildDateFilter(); }));
        if (!open) return;

        var seg = new Segmented(new[] { "Менялись", "Добавлены" }, _dateAdded ? 1 : 0) { Margin = new Thickness(10, 8, 10, 8) };
        seg.Changed += i => { _dateAdded = i == 1; BuildDateFilter(); Refresh(); };
        var rows = new List<UIElement> { seg };
        foreach (var (key, label) in DatePresetList)
        {
            var k = key;
            rows.Add(Hig.Row(label, acc: _datePreset == key ? Hig.Acc.Check : Hig.Acc.None, click: () => SetDatePreset(k)));
        }
        rows.Add(Hig.Row("Свой период", acc: _datePreset == "custom" ? Hig.Acc.Check : Hig.Acc.None,
            click: () => { _datePreset = "custom"; BuildDateFilter(); }));
        if (_datePreset == "custom")
        {
            if (DateFrom.Parent is Microsoft.UI.Xaml.Controls.Panel p1) p1.Children.Remove(DateFrom);
            if (DateTo.Parent is Microsoft.UI.Xaml.Controls.Panel p2) p2.Children.Remove(DateTo);
            rows.Add(Hig.Row("С", trailing: DateFrom));
            rows.Add(Hig.Row("По", trailing: DateTo));
        }
        var card = Hig.Card(rows);
        card.Margin = new Thickness(0, 2, 0, 10);
        _secDate.Children.Add(card);

        if (DateHist.Parent is Microsoft.UI.Xaml.Controls.Panel ph) ph.Children.Remove(DateHist);
        var hist = new StackPanel { Padding = new Thickness(14, 12, 14, 10), Spacing = 6 };
        hist.Children.Add(Hig.Text(_dateAdded ? "Добавления записей" : "Правки записей", Hig.T.Subhead, "HigSecondary"));
        hist.Children.Add(DateHist);
        var histCard = Hig.Card(new UIElement[] { hist });
        histCard.Margin = new Thickness(0, 0, 0, 4);
        _secDate.Children.Add(histCard);
        if (DateHistNote.Parent is Microsoft.UI.Xaml.Controls.Panel pn) pn.Children.Remove(DateHistNote);
        DateHistNote.Margin = new Thickness(14, 0, 14, 10);
        _secDate.Children.Add(DateHistNote);

        var colorCard = Hig.Card(new[] { Hig.SwitchRow("Цвет узла по дате изменения", ColorByDate.IsOn, on => { ColorByDate.IsOn = on; }) });
        colorCard.Margin = new Thickness(0, 0, 0, 4);
        _secDate.Children.Add(colorCard);
        if (ColorLegend.Parent is Microsoft.UI.Xaml.Controls.Panel pl) pl.Children.Remove(ColorLegend);
        ColorLegend.Margin = new Thickness(14, 0, 14, 12);
        _secDate.Children.Add(ColorLegend);
        BuildHistogram();
    }

    // Гистограмма: шаг — по размаху истории (час, если она укладывается в
    // двое суток; день — до двух месяцев; дальше — неделя), не больше 40
    // столбиков — последние. Столбики акцентом, выбранные — оранжевым.
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
                CornerRadius = new CornerRadius(3, 3, 1, 1), Background = on ? Hig.B("HigOrange") : n == 0 ? Hig.B("HigSeparator") : Hig.B("HigAccent"),
                Opacity = on || n == 0 ? 1 : 0.75,
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
                _datePreset = "custom-hist";
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
            ? $"Выбрано: {(_dateFrom == null ? "…" : _dateFrom.Value.ToString("dd.MM.yyyy HH:mm"))} — {(_dateTo == null ? "сейчас" : _dateTo.Value.ToString("dd.MM.yyyy HH:mm"))}. "
            : "") + $"Столбик — {unit}; щелчок выбирает, Shift — продлевает.";
    }

    string PeriodText()
    {
        var preset = DatePresetList.FirstOrDefault(p => p.Key == _datePreset);
        if (preset.Label != null && _datePreset != "all") return preset.Label.ToLowerInvariant();
        return $"{(_dateFrom == null ? "…" : _dateFrom.Value.ToString("dd.MM"))}–{(_dateTo == null ? "сейчас" : _dateTo.Value.AddMinutes(-1).ToString("dd.MM"))}";
    }

    // --- сводка ----------------------------------------------------------------------

    // Сверху: сколько отобрано, применённое — капсулами с крестиком (снять
    // одно), «Сбросить» — когда есть что сбрасывать.
    void UpdateFilterSummary(int total, int shown)
    {
        var on = FiltersOn;
        FilterTop.Children.Clear();
        var head = new Grid();
        head.ColumnDefinitions.Add(new ColumnDefinition());
        head.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        // Число — крупно, что оно значит — подписью под ним.
        var title = new StackPanel();
        title.Children.Add(Hig.Text(on ? $"{shown} из {total}" : total.ToString(), Hig.T.Title3));
        title.Children.Add(Hig.Text(on ? "записей отобрано" : "записей в графе", Hig.T.Footnote, "HigSecondary"));
        head.Children.Add(title);
        if (on)
        {
            var reset = Hig.TextButton("Сбросить", () => { ResetFilters(); BuildFilters(); Refresh(); });
            Grid.SetColumn(reset, 1);
            head.Children.Add(reset);
        }
        FilterTop.Children.Add(head);
        var chips = new WrapPanel();
        void Chip(string text, Action remove) => chips.Children.Add(Hig.Token(text, () => { remove(); BuildFilters(); Refresh(); }));
        foreach (var f in _foldersOff.ToList()) Chip("без: " + Schema.NameOf(f), () => _foldersOff.Remove(f));
        foreach (var s in _statusOff.ToList()) Chip("без статуса «" + (s.Length > 0 ? s : "—") + "»", () => _statusOff.Remove(s));
        foreach (var t in _tagsOn.ToList()) Chip(t, () => _tagsOn.Remove(t));
        if (_dateFrom != null || _dateTo != null)
            Chip((_dateAdded ? "добавлены: " : "менялись: ") + PeriodText(), () => { _datePreset = "all"; _dateFrom = _dateTo = null; _histPick = null; });
        if (chips.Children.Count > 0) FilterTop.Children.Add(chips);
        FilterTop.Children.Add(Hig.Text("Отсеянное на графе не скрыто, а приглушено.", Hig.T.Footnote, "HigSecondary", wrap: true));
    }

    // --- оглавление ------------------------------------------------------------------
    //
    // Запись knowledge/project/oglavlenie_grafa.py (требование пользователя
    // 28.09.2026): раздел — связь «раздел» на карту раздела, у карты — связи
    // «якорь» и пункт «Метки раздела: …». Раздел — заголовок с треугольником,
    // якоря — строками (цвет вида, заголовок в две строки), выбранная запись
    // подсвечена; метки раздела — капсулами, щелчок — фильтр по метке.
    void BuildToc()
    {
        if (Store == null) return;
        Toc.Children.Clear();
        var toc = Store.ById("oglavlenie-grafa");
        if (toc == null)
        {
            Toc.Children.Add(Hig.Footer("В графе нет оглавления — записи knowledge/project/oglavlenie_grafa.py."));
            return;
        }
        var tagCount = Store.All.SelectMany(r => r.Tags).GroupBy(t => t).ToDictionary(g => g.Key, g => g.Count());
        var current = Panel.Current?.Id;
        foreach (var l in toc.Links)
        {
            if (l["тип"] as string != "раздел" || Store.ById(l["куда"] as string ?? "") is not { } map) continue;
            var name = System.Text.RegularExpressions.Regex.Replace(map.Title, "^Раздел «(.*)»$", "$1");
            var anchors = map.Links.Where(x => x["тип"] as string == "якорь").Select(x => x["куда"] as string ?? "").ToList();
            var tp = map.Points.FirstOrDefault(p => p.StartsWith("Метки раздела:"));
            var tags = tp == null ? new List<string>() : tp["Метки раздела:".Length..]
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Where(t => t != "—").ToList();
            // Раздел с выбранной записью раскрыт — выбор видно в оглавлении.
            var open = _tocOpen.Contains(name) || (current != null && anchors.Contains(current));
            var secName = name;
            Toc.Children.Add(Hig.SidebarHeader(name, open, open ? null : anchors.Count.ToString(), () =>
            {
                if (!_tocOpen.Remove(secName)) _tocOpen.Add(secName);
                BuildToc();
            }));
            if (!open) continue;
            var body = new StackPanel { Spacing = 1, Margin = new Thickness(0, 0, 0, 10) };
            foreach (var id in anchors)
            {
                var r = Store.ById(id);
                var target = id;
                var row = Hig.Row(r?.Title ?? id + " — нет такой записи", dot: GraphView.Parse(Schema.ColorOf(r?.Folder ?? "project")),
                    wrap: true, selected: id == current, click: r == null ? null : () => Select(target, center: true),
                    tooltip: r == null ? id : $"{Schema.NameOf(r.Folder)} · {r.Title}", titleColor: r == null ? "HigSecondary" : "HigLabel");
                if (row is Button b) b.CornerRadius = new CornerRadius(8);
                body.Children.Add(row);
            }
            if (tags.Count > 0)
            {
                var chips = new WrapPanel { Margin = new Thickness(14, 6, 8, 0) };
                foreach (var tag in tags)
                {
                    var t = tag;
                    var on = _tagsOn.Contains(tag);
                    var chip = Hig.Token($"{tag} · {(tagCount.TryGetValue(tag, out var c) ? c : 0)}",
                        onClick: () => { if (!_tagsOn.Remove(t)) _tagsOn.Add(t); BuildTags(); BuildToc(); Refresh(); }, accent: on);
                    ToolTipService.SetToolTip(chip, on ? "Снять фильтр по метке" : "Фильтр по метке: остальное на графе приглушится");
                    chips.Children.Add(chip);
                }
                body.Children.Add(chips);
            }
            Toc.Children.Add(body);
        }
    }
}
