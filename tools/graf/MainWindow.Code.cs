using Graf.Model;
using Graf.Views;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Graf;

// Граф кода и связи по смыслу (решение пользователя 29.09.2026 «В приложении
// увижу графы? Оба.» — «Делаем оба.»; практика
// graf-koda-i-svyazi-po-smyslu-v-programme-graf-proekta).
//
// Данные — выгрузки в .graf/ (Model/Derived): граф кода из CodeGraph и
// соседи по смыслу из semsearch. Переключатель «Знания · Код» — над графом.
// В режиме «Код» узлы — файлы кода, острова — модули, боковая панель —
// список модулей (галочка — модуль в отборе), карточка — файл: функции,
// зависимости в обе стороны, записи графа знаний о нём.
public sealed partial class MainWindow
{
    Derived _derived = new();
    bool _code;
    Segmented _dataSeg = null!;
    readonly HashSet<string> _modulesOff = new();

    void InitCode()
    {
        _dataSeg = new Segmented(new[] { "Знания", "Код" }, 0, dark: true, fontSize: 12);
        _dataSeg.Changed += i => SetDataSource(i == 1);
        ToolTipService.SetToolTip(_dataSeg, "Знания — граф записей knowledge/; Код — файлы кода и зависимости между ними (CodeGraph)");
        DataHost.Child = _dataSeg;
        MiDerived.Click += (_, _) => StartReindex("");
        MiReindexCode.Click += (_, _) => StartReindex("--code");
        MiReindexSem.Click += (_, _) => StartReindex("--sem");
        MiReindexStop.Click += (_, _) => StartReindex("--stop");
        Panel.OpenCode += id => { SetDataSource(true); Select(id, center: true); };
        Panel.OpenKnowledge += id => { SetDataSource(false); Select(id, center: true); };
        Panel.OpenInEditor += OpenInEditor;
    }

    void LoadDerived()
    {
        if (Store == null) return;
        _derived = Derived.Load(Store.Root);
        _sem = SemanticIndex.Load(Store.Root);
        _semPathToId = Store.All.ToDictionary(r => System.IO.Path.GetRelativePath(Store.Root, r.Path).Replace('\\', '/'), r => r.Id);
        // Соседи по смыслу — в карточку записи вместо подсказок по словам.
        Panel.Similar = id => _derived.Neighbors.TryGetValue(id, out var l)
            ? l.Select(x => (Store.ById(x.Id), x.Sim)).Where(x => x.Item1 != null).Select(x => (x.Item1!, x.Sim)).ToList()
            : new List<(Record, float)>();
        Panel.SimilarNote = _derived.SemanticNote;
        Panel.CodeFileFor = r => _derived.Code?.ById.ContainsKey("file:" + r.Title.Trim()) == true ? "file:" + r.Title.Trim() : null;
    }

    public void SetDataSource(bool code)
    {
        if (code == _code) return;
        if (code && _derived.Code == null)
        {
            Status("Нет выгрузки графа кода — «Ещё» → «Обновить граф кода и связи по смыслу»");
            _dataSeg.SelectedIndex = 0;
            return;
        }
        _code = code;
        _dataSeg.SelectedIndex = code ? 1 : 0;
        Panel.Show(null);
        Graph.Select(null);
        Search.Text = "";
        _matches = new();
        // «Смысл» — только у записей графа знаний.
        if (code && _settings.Grouping == 3) SetLayout(1);
        LeftSegHost.Visibility = code ? Visibility.Collapsed : Visibility.Visible;
        CodePane.Visibility = code ? Visibility.Visible : Visibility.Collapsed;
        if (code) { TocPane.Visibility = FilterPane.Visibility = Visibility.Collapsed; BuildCodePane(); }
        else SetLeftTab(_settings.LeftTab);
        Refresh();
        Graph.FitAll();
    }

    // Модули: строка — цвет, модуль, число файлов, галочка — в отборе.
    void BuildCodePane()
    {
        var c = _derived.Code;
        CodeHost.Children.Clear();
        if (c == null) return;
        var head = new StackPanel { Padding = new Thickness(6, 4, 6, 10), Spacing = 2 };
        head.Children.Add(Hig.Text("Граф кода", Hig.T.Title3));
        head.Children.Add(Hig.Text($"{c.Files.Count} файлов · {c.Files.Select(f => f.Module).Distinct().Count()} модулей · {c.Links().Count()} связей", Hig.T.Footnote, "HigSecondary"));
        CodeHost.Children.Add(head);
        var rows = c.Files.GroupBy(f => f.Module).OrderBy(g => g.Key).Select(g =>
        {
            var m = g.Key;
            return FilterRow(m, g.Count(), Schema.ColorOf(m), !_modulesOff.Contains(m), on =>
            {
                if (on) _modulesOff.Remove(m); else _modulesOff.Add(m);
                BuildCodePane();
                Refresh();
            });
        }).ToList();
        CodeHost.Children.Add(Hig.SidebarHeader("Модули", true, _modulesOff.Count > 0 ? $"скрыто {_modulesOff.Count}" : null, () => { }));
        var card = Hig.Card(rows, 38);
        card.Margin = new Thickness(0, 2, 0, 4);
        CodeHost.Children.Add(card);
        var f2 = Hig.Footer($"Снято модулей не скрывает — приглушает. Данные — CodeGraph, {c.Note}; обновить — «Ещё» → «Обновить граф кода и связи по смыслу».");
        f2.Margin = new Thickness(14, 0, 14, 12);
        CodeHost.Children.Add(f2);
    }

    void RefreshCode()
    {
        var c = _derived.Code!;
        var passing = _modulesOff.Count > 0 ? c.Records.Where(r => !_modulesOff.Contains(r.Folder)).Select(r => r.Id).ToHashSet() : null;
        Graph.SetData(c.Records, c.Links());
        Graph.Passing = passing;
        BuildEdgeKinds();
        ApplyHiddenEdges();
        Graph.Highlight = _matches.Select(m => m.Id).ToHashSet();
        Graph.Redraw();
        List.ItemsSource = SortRows((Search.Text.Trim().Length > 0 ? _matches : c.Records).Where(r => passing == null || passing.Contains(r.Id)).ToList());
        CountText.Text = $"Файлов кода {c.Records.Count} · связей {Graph.EdgeCount}" + (passing != null ? $", в отборе {passing.Count}" : "")
            + (Search.Text.Trim().Length > 0 ? $" · найдено {_matches.Count}" : "");
    }

    void SelectCode(string id, bool center)
    {
        var c = _derived.Code;
        if (c == null || !c.ById.TryGetValue(id, out var f)) return;
        var knowledge = Store == null ? new List<Record>() : Store.All
            .Where(r => r.Folder == "code" && (r.Title.Trim() == f.Path || f.Path.StartsWith(r.Title.Trim().TrimEnd('/') + "/")))
            .OrderByDescending(r => r.Title.Length).ToList();
        Panel.ShowCode(f, c, knowledge);
        Graph.Select(id, center);
        if (_mode == 2 && List.ItemsSource is List<Row> rows) List.SelectedItem = rows.FirstOrDefault(x => x.R.Id == id);
    }

    string CodeTip(string id)
    {
        var c = _derived.Code!;
        if (!c.ById.TryGetValue(id, out var f)) return id;
        var outN = c.Edges.Where(e => e.From == f.Path).Select(e => e.To).Distinct().Count();
        var inN = c.Edges.Where(e => e.To == f.Path).Select(e => e.From).Distinct().Count();
        return $"{f.Module} · {f.Lang}\n{f.Path}\nфункций и классов {f.Symbols.Count} · зависит от {outN} · от него зависят {inN}";
    }

    // Открыть файл в VS Code на строке (code -g); нет VS Code — как в проводнике.
    void OpenInEditor(string path, int line)
    {
        if (Store == null) return;
        var full = System.IO.Path.Combine(Store.Root, path.Replace('/', System.IO.Path.DirectorySeparatorChar));
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("code", $"-g \"{full}:{Math.Max(1, line)}\"") { UseShellExecute = true, WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden });
        }
        catch (Exception)
        {
            System.Diagnostics.Process.Start("explorer.exe", $"/select,\"{full}\"");
        }
    }
}
