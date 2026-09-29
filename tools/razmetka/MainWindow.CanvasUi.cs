using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using Razmetka.Editor;
using Razmetka.Model;
using Razmetka.Ui;

namespace Razmetka;

// Поверх полотна: нижняя панель инструментов, плашка режима, панель у
// выбранного, подсказки связей и карточка описания связи у стрелки.
//
// Быстрая разметка подряд (Label Studio, Rossum): L — обвести графу, обвести
// поле, карточка открывается сама; в ней подсказки из уже введённого;
// Enter — готово, Shift+Enter — готово и сразу следующая связь.
public partial class MainWindow
{
    bool _dragging;
    Border? _selBar;
    Border? _editor;
    public Border? Editor => _editor;
    public bool EditorOpen => _editor != null;
    // После Shift+Enter в карточке — сразу следующая связь.
    bool _chainLinks;

    void InitCanvasUi()
    {
        void Tool(System.Windows.Controls.Primitives.ToggleButton b, string id)
        {
            b.ToolTip = _cmds[id].Tip + (_cmds[id].Hint.Length > 0 ? "\n" + _cmds[id].Hint : "");
            b.Click += (_, _) => { _cmds.Execute(id); SyncTool(); };
        }
        Tool(TSelect, "tool.select");
        Tool(THand, "tool.hand");
        Tool(TLink, "tool.link");
        Tool(TNote, "tool.note");
        Tool(TLens, "tool.lens");
        TAdd.ToolTip = "Добавить: картинку из буфера, фото из файла, страницы PDF";
        TAdd.Click += (_, _) =>
        {
            var m = new ContextMenu();
            AddAll(m, Mc("edit.paste"), Mc("sheet.image"), Mc("sheet.pdf"));
            OpenMenu(m, TAdd);
        };
        TUndo.Click += (_, _) => Undo();
        TRedo.Click += (_, _) => Redo();
        TZoomIn.Click += (_, _) => _cmds.Execute("view.in");
        TZoomOut.Click += (_, _) => _cmds.Execute("view.out");
        TZoomIn.ToolTip = _cmds["view.in"].Tip;
        TZoomOut.ToolTip = _cmds["view.out"].Tip;
        TZoom.ToolTip = "Масштаб: весь разворот, выбранное, 100 %";
        TZoom.Click += (_, _) =>
        {
            var m = new ContextMenu();
            AddAll(m, Mc("view.fit"), Mc("view.selection"), Mc("view.100"));
            OpenMenu(m, TZoom);
        };
        SheetHintActions.Children.Add(Kit.TextBtn("Вставить из буфера", "Ctrl+V", PasteImage, "PrimaryBtn", "").Also(b => b.Margin = new Thickness(0, 0, 8, 8)));
        SheetHintActions.Children.Add(Kit.TextBtn("Фото из файла…", null, AddImagesFromDialog, "OutlineBtn", "").Also(b => b.Margin = new Thickness(0, 0, 8, 8)));
        SheetHintActions.Children.Add(Kit.TextBtn("Страницы PDF…", null, () => _ = AddPdfFromDialog(), "OutlineBtn", "").Also(b => b.Margin = new Thickness(0, 0, 8, 8)));
    }

    void SetTool(string tool)
    {
        if (_sheet == null) return;
        View.EndCrop();
        if (View.AlignStep >= 0 && tool != "select") return;
        // Рука — последней: выключение связи и заметки сбрасывает курсор.
        View.SetLinkTool(tool == "link");
        View.SetNoteTool(tool == "note");
        View.SetHandTool(tool == "hand");
        if (tool != "link") _chainLinks = false;
        if (tool == "link") { CloseEditor(); View.SelectLink(null); }
        SyncTool();
        FocusCanvas();
    }

    void ResetTools()
    {
        _chainLinks = false;
        if (View.LinkTool) View.SetLinkTool(false);
        if (View.NoteTool) View.SetNoteTool(false);
        if (View.HandTool) View.SetHandTool(false);
        if (View.AlignStep >= 0) View.CancelAlign();
    }

    public void ToggleLens()
    {
        View.SetLens(!View.Lens);
        SyncTool();
        Status(View.Lens ? "Лупа: водите курсором; M или Esc — выключить" : "Лупа выключена");
    }

    // Состояние инструментов и плашка режима: шаг, что сделать сейчас, как
    // выйти.
    void SyncTool()
    {
        TSelect.IsChecked = !View.HandTool && !View.LinkTool && !View.NoteTool;
        THand.IsChecked = View.HandTool;
        TLink.IsChecked = View.LinkTool;
        TNote.IsChecked = View.NoteTool;
        TLens.IsChecked = View.Lens;
        ModeActions.Children.Clear();
        void Act(string text, string? keys, Action a, bool primary = false)
        {
            var b = new Button
            {
                Style = Kit.S(primary ? "PrimaryBtn" : "ToolBtn"), Foreground = Brushes.White, Padding = new Thickness(10, 3, 10, 3), MinHeight = 26,
                Margin = new Thickness(2, 0, 0, 0),
            };
            var p = new StackPanel { Orientation = Orientation.Horizontal };
            p.Children.Add(new TextBlock { Text = text, VerticalAlignment = VerticalAlignment.Center });
            if (keys != null) { var k = Kit.Kbd(keys, dark: true); k.Margin = new Thickness(8, 0, 0, 0); p.Children.Add(k); }
            b.Content = p;
            b.Click += (_, _) => a();
            ModeActions.Children.Add(b);
        }
        string? step = null, text = null;
        if (View.AlignStep >= 0)
        {
            step = $"Подгонка · {View.AlignStep + 1} из 4";
            text = View.AlignStep switch
            {
                0 => "Точка 1 на прежней (бледной) картинке — например, угол таблицы",
                1 => "Та же точка 1 на новой картинке",
                2 => "Точка 2 на прежней картинке — подальше от первой",
                _ => "Та же точка 2 на новой картинке",
            };
            Act("Пропустить", "Esc", () => { View.CancelAlign(); SyncTool(); });
        }
        else if (View.CropLayerId != null)
        {
            step = "Обрезка";
            text = "Ручки — край, внутри — сдвиг картинки";
            Act("Сбросить", null, () => _cmds.Execute("layer.cropReset"));
            Act("Готово", "Enter", () => { View.EndCrop(); SyncTool(); }, primary: true);
        }
        else if (View.LinkTool)
        {
            step = View.HasPendingFrame ? "Связь · 2 из 2" : "Связь · 1 из 2";
            text = View.HasPendingFrame ? "Обведите поле на снимке системы" : "Обведите графу на странице документа";
            Act("Отмена", "Esc", () => SetTool("select"));
        }
        else if (View.NoteTool)
        {
            step = "Заметка";
            text = "Щёлкните, где поставить булавку";
            Act("Отмена", "Esc", () => SetTool("select"));
        }
        ModeBar.Visibility = step != null ? Visibility.Visible : Visibility.Collapsed;
        ModeStepText.Text = step ?? "";
        ModeText.Text = text ?? "";
        PlaceSelBar();
    }

    void SyncEmptySheet() =>
        SheetHint.Visibility = _sheet != null && _sheet.Layers.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

    // --- панель у выбранного ----------------------------------------------------
    //
    // Главные действия прямо над выбранным (Adobe Contextual Task Bar, решение
    // razmetka-dotnet): значки с подсказкой «название — клавиша»; на время
    // перетаскивания и в режимах прячется.

    void PlaceSelBar()
    {
        if (_selBar != null) { Pops.Children.Remove(_selBar); _selBar = null; }
        if (_dragging || _sheet == null || View.CropLayerId != null || View.LinkTool || View.NoteTool || View.AlignStep >= 0 || _editor != null) return;
        var r = View.SelectionScreenRect();
        if (r == null) return;
        var bar = new StackPanel { Orientation = Orientation.Horizontal };
        void B(string id, string? glyph = null)
        {
            var c = _cmds[id];
            if (!c.When()) return;
            bar.Children.Add(Kit.IconBtn(glyph ?? GlyphOf(c) ?? "", c.Tip, () => _cmds.Execute(id), 14));
        }
        void Sep() => bar.Children.Add(new Border { Width = 1, Margin = new Thickness(4, 6, 4, 6), Background = Kit.B("Line") });
        if (View.SelectedLink is { } k)
        {
            var badge = Kit.Badge(k.N, SheetGeo.ColorOf(_sheet, k));
            badge.Margin = new Thickness(4, 0, 6, 0);
            bar.Children.Add(badge);
            B("link.edit", "");
            B("link.reroute", "");
            B("link.pin", "");
            Sep();
            B("edit.dup");
            B("edit.delete");
            bar.Children.Add(Kit.IconBtn("", "Ещё: вид, излом, стороны стрелки", () => ShowContext(new SheetView.Target("link", k, null, null, default, Mouse.GetPosition(View))), 14));
        }
        else if (View.SelectedNote == null)
        {
            var one = OneLayer;
            if (one is { Kind: LayerKind.Image, Locked: false })
            {
                B("tool.link");
                B("layer.crop");
                B("layer.replace", "");
                Sep();
            }
            if (one is { Kind: LayerKind.Table })
            {
                bar.Children.Add(Kit.TextBtn("Разделить", _cmds["layer.split"].Tip, SplitTable).Also(b => b.Padding = new Thickness(8, 4, 8, 4)));
                bar.Children.Add(Kit.TextBtn("Слить", _cmds["layer.merge"].Tip, () => _cmds.Execute("layer.merge")).Also(b => b.Padding = new Thickness(8, 4, 8, 4)));
                Sep();
            }
            B("edit.dup");
            B("edit.delete");
            if (one != null)
                bar.Children.Add(Kit.IconBtn("", "Ещё: порядок, закрепить, подпись", () => ShowContext(new SheetView.Target(one.Kind == LayerKind.Table ? "table" : "layer", null, null, one, default, Mouse.GetPosition(View))), 14));
        }
        else return;
        _selBar = Kit.Card(bar, new Thickness(3));
        Pops.Children.Add(_selBar);
        _selBar.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        var w = _selBar.DesiredSize.Width;
        var h = _selBar.DesiredSize.Height;
        var sr = r.Value;
        // Над выбранным; у верхнего края — под ним; в пределах полотна.
        var y = sr.Top - h - 10 < 4 ? sr.Bottom + 10 : sr.Top - h - 10;
        var x = Math.Clamp(sr.X + sr.Width / 2 - w / 2, 4, Math.Max(4, Pops.ActualWidth - w - 4));
        System.Windows.Controls.Canvas.SetLeft(_selBar, x);
        System.Windows.Controls.Canvas.SetTop(_selBar, Math.Clamp(y, 4, Math.Max(4, Pops.ActualHeight - h - 4)));
    }

    // --- подсказки связей --------------------------------------------------------
    // Щелчок по стрелке показывает её описание прямо у стрелки — не надо
    // листать к таблице (просьба пользователя 25.09.2026). «Закрепить» (P) —
    // подсказка остаётся у номера связи; закреплённых может быть несколько.

    Border? _pop;
    readonly Dictionary<string, Border> _pinned = new();

    void ClearPops()
    {
        Pops.Children.Clear();
        _pinned.Clear();
        _pop = null;
        _selBar = null;
    }

    public void ShowPop(Link k, Point at)
    {
        if (_sheet == null) return;
        if (_pop != null) Pops.Children.Remove(_pop);
        _pop = null;
        if (_pinned.ContainsKey(k.Id)) return;
        _pop = PopCard(k, pinned: false);
        Pops.Children.Add(_pop);
        _pop.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        Place(_pop, at);
        Status($"Связь {k.N}: Enter — описать, P — закрепить подсказку, Tab — следующая");
    }

    void Place(Border card, Point at)
    {
        var w = card.DesiredSize.Width;
        var h = card.DesiredSize.Height;
        var x = Math.Clamp(at.X + 16, 4, Math.Max(4, Pops.ActualWidth - w - 4));
        var y = Math.Clamp(at.Y + 16, 4, Math.Max(4, Pops.ActualHeight - h - 4));
        System.Windows.Controls.Canvas.SetLeft(card, x);
        System.Windows.Controls.Canvas.SetTop(card, y);
    }

    void PlacePops()
    {
        if (_sheet == null) return;
        foreach (var (id, card) in _pinned)
        {
            var k = _sheet.Links.FirstOrDefault(x => x.Id == id);
            var p = k == null ? null : View.LinkBadgeScreen(k);
            card.Visibility = p == null ? Visibility.Collapsed : Visibility.Visible;
            if (p != null) Place(card, p.Value);
        }
        if (_pop != null) Pops.Children.Remove(_pop);
        _pop = null;
    }

    void TogglePin(Link k)
    {
        if (_pinned.Remove(k.Id, out var old)) { Pops.Children.Remove(old); Status($"Подсказка связи {k.N} откреплена"); BuildInspector(force: true); return; }
        if (_pop != null) { Pops.Children.Remove(_pop); _pop = null; }
        var pc = PopCard(k, pinned: true);
        _pinned[k.Id] = pc;
        Pops.Children.Add(pc);
        pc.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        PlacePops();
        Status($"Подсказка связи {k.N} закреплена у номера — P снимет");
        BuildInspector(force: true);
    }

    void ToTableRow(Link k)
    {
        if (View.TableRowRect(k) is { } r) { View.EnsureVisible(r); View.SelectLink(k.Id); }
        else Status("Связи нет ни в одной таблице разворота");
    }

    Border PopCard(Link k, bool pinned)
    {
        var col = SheetGeo.ColorOf(_sheet!, k);
        var panel = new StackPanel { MaxWidth = 360 };
        var head = new DockPanel { Margin = new Thickness(0, 0, 0, 6) };
        var badge = Kit.Badge(k.N, col);
        DockPanel.SetDock(badge, Dock.Left);
        head.Children.Add(badge);
        var tools = new StackPanel { Orientation = Orientation.Horizontal };
        tools.Children.Add(Kit.IconBtn("", "Описать — Enter", () => { if (_pop != null) { Pops.Children.Remove(_pop); _pop = null; } EditLinkCard(k); }, 12, "Muted"));
        tools.Children.Add(Kit.IconBtn("", pinned ? "Открепить — P" : "Закрепить у номера — P", () => TogglePin(k), 12, "Muted"));
        if (!pinned) tools.Children.Add(Kit.IconBtn("", "Закрыть — Esc", () => { if (_pop != null) Pops.Children.Remove(_pop); _pop = null; }, 11, "Muted"));
        DockPanel.SetDock(tools, Dock.Right);
        head.Children.Add(tools);
        var kind = Kit.Text(LinkKind.All.FirstOrDefault(x => x.Key == k.Kind).Label ?? "", 12, "Muted");
        kind.Margin = new Thickness(8, 0, 8, 0);
        kind.VerticalAlignment = VerticalAlignment.Center;
        head.Children.Add(kind);
        panel.Children.Add(head);
        panel.Children.Add(Kit.Text(_chapter?.DocName is { Length: > 0 } d ? d : "Документ", 11, "Faint", FontWeights.SemiBold));
        panel.Children.Add(k.DocField.Length > 0 ? Kit.Text(k.DocField, 13, wrap: true) : Kit.Text("графа не описана — Enter", 13, "Warn"));
        panel.Children.Add(new Border { Height = 6 });
        panel.Children.Add(Kit.Text("Система", 11, "Faint", FontWeights.SemiBold));
        panel.Children.Add(k.SystemField.Length > 0 ? Kit.Text(k.SystemField, 13, wrap: true) : Kit.Text("поле не описано — Enter", 13, "Warn"));
        return Kit.Card(panel, new Thickness(12, 10, 10, 10), new SolidColorBrush(col), pinned ? 1.5 : 2);
    }

    // --- описание связи на месте -----------------------------------------------

    public void EditLinkCard(Link k)
    {
        if (_sheet == null) return;
        CloseEditor();
        if (_pop != null) { Pops.Children.Remove(_pop); _pop = null; }
        View.SelectLink(k.Id);
        var col = SheetGeo.ColorOf(_sheet, k);
        var panel = new StackPanel { Width = 400 };
        var head = new DockPanel { Margin = new Thickness(0, 0, 0, 10) };
        var badge = Kit.Badge(k.N, col);
        DockPanel.SetDock(badge, Dock.Left);
        head.Children.Add(badge);
        var close = Kit.IconBtn("", "Отмена — Esc", CloseEditor, 11, "Muted");
        DockPanel.SetDock(close, Dock.Right);
        head.Children.Add(close);
        var ht = Kit.Text($"Связь {k.N}", 14, "Ink", FontWeights.SemiBold);
        ht.Margin = new Thickness(10, 0, 0, 0);
        ht.VerticalAlignment = VerticalAlignment.Center;
        head.Children.Add(ht);
        panel.Children.Add(head);

        TextBlock L(string t) => Kit.Text(t, 12, "Muted").Also(x => x.Margin = new Thickness(0, 0, 0, 4));
        var doc = new AutoBox(q => AutoBox.Rank(_chapter!.Sheets.SelectMany(s => s.Links).Where(x => x.Id != k.Id).Select(x => x.DocField), q)) { Text = k.DocField };
        var sys = new AutoBox(q => AutoBox.Rank(AllLinks().Where(x => x.K.Id != k.Id).Select(x => x.K.SystemField), q), multi: true) { Text = k.SystemField };
        panel.Children.Add(L(_chapter?.DocName is { Length: > 0 } d ? $"Графа документа · {d}" : "Графа документа"));
        panel.Children.Add(doc);
        panel.Children.Add(L("Поле системы · Блок · Подблок · Поле").Also(x => x.Margin = new Thickness(0, 10, 0, 4)));
        panel.Children.Add(sys);
        var kind = k.Kind;
        var kindHost = new Border { Margin = new Thickness(0, 4, 0, 0) };
        void Kinds()
        {
            kindHost.Child = Kit.Segmented(LinkKind.All.Select((x, i) => (x.Key, ShortKind(x.Key), (string?)$"{x.Label} — Alt+{i + 1}")).ToList(), kind, v => { kind = v; Kinds(); });
        }
        Kinds();
        panel.Children.Add(L("Вид связи").Also(x => x.Margin = new Thickness(0, 10, 0, 0)));
        panel.Children.Add(kindHost);

        var foot = new DockPanel { Margin = new Thickness(0, 14, 0, 0) };
        var ok = new Button { Content = "Готово", Style = Kit.S("PrimaryBtn"), ToolTip = "Enter" };
        var cancel = new Button { Content = "Отмена", Style = Kit.S("ToolBtn"), Margin = new Thickness(0, 0, 6, 0), ToolTip = "Esc" };
        var btns = new StackPanel { Orientation = Orientation.Horizontal };
        btns.Children.Add(cancel);
        btns.Children.Add(ok);
        DockPanel.SetDock(btns, Dock.Right);
        foot.Children.Add(btns);
        var keys = Kit.Text("Shift+Enter — готово и следующая связь\nAlt+1…4 — вид связи", 11, "Faint", wrap: true);
        keys.VerticalAlignment = VerticalAlignment.Center;
        foot.Children.Add(keys);
        panel.Children.Add(foot);

        var card = Kit.Card(panel, new Thickness(16, 14, 16, 14), new SolidColorBrush(col), 2);
        void Save(bool next)
        {
            if (k.DocField != doc.Text.Trim() || k.SystemField != sys.Text.Trim() || k.Kind != kind)
                Edit("Описание связи", () => { k.DocField = doc.Text.Trim(); k.SystemField = sys.Text.Trim(); k.Kind = kind; });
            CloseEditor();
            if (next) { _chainLinks = true; SetTool("link"); Status($"Связь {k.N} описана. Следующая: обведите графу на документе"); }
            else Status($"Связь {k.N} описана");
        }
        ok.Click += (_, _) => Save(false);
        cancel.Click += (_, _) => CloseEditor();
        card.PreviewKeyDown += (_, e) =>
        {
            var key = e.Key == Key.System ? e.SystemKey : e.Key;
            // Открытые подсказки поля сами разбирают стрелки, Enter и Esc.
            var box = doc.Box.IsKeyboardFocused ? doc : sys.Box.IsKeyboardFocused ? sys : null;
            if (box is { SuggestionsOpen: true } && key is Key.Escape or Key.Enter or Key.Tab or Key.Up or Key.Down) return;
            if (key == Key.Enter && Keyboard.Modifiers == ModifierKeys.Shift) { Save(true); e.Handled = true; }
            else if (key == Key.Enter && Keyboard.Modifiers == ModifierKeys.None) { Save(false); e.Handled = true; }
            else if (key == Key.Escape) { CloseEditor(); e.Handled = true; }
            else if (Keyboard.Modifiers == ModifierKeys.Alt && key is >= Key.D1 and <= Key.D4)
            {
                kind = LinkKind.All[key - Key.D1].Key;
                Kinds();
                e.Handled = true;
            }
            else if (Keyboard.Modifiers == ModifierKeys.Control && key == Key.S) { Save(false); Save0(); e.Handled = true; }
        };
        _editor = card;
        PlaceSelBar();
        Pops.Children.Add(card);
        card.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        var at = View.LinkBadgeScreen(k) ?? new Point(Pops.ActualWidth / 2, Pops.ActualHeight / 3);
        Place(card, at);
        var first = k.DocField.Length == 0 || k.SystemField.Length > 0 ? doc.Box : sys.Box;
        Dispatcher.BeginInvoke(() => { first.Focus(); first.SelectAll(); }, System.Windows.Threading.DispatcherPriority.Input);
    }

    void Save0() => Save();

    static string ShortKind(string k) => k switch
    {
        LinkKind.Auto => "По ЕНИ", LinkKind.NameOnly => "В имя", LinkKind.None => "Нет", _ => "Переносится",
    };

    void CloseEditor()
    {
        if (_editor == null) return;
        Pops.Children.Remove(_editor);
        _editor = null;
        PlaceSelBar();
        View.Focus();
    }

    // --- связи, заметки, таблица ---------------------------------------------------

    string? _lastLinkId;

    void CreateLink(Model.Frame a, Model.Frame b)
    {
        if (_sheet == null) return;
        Link? k = null;
        Edit("Новая связь", () =>
        {
            k = LinkOps.Create(_sheet, a, b);
            SheetGeo.Reroute(_sheet, new[] { k.Id });
        });
        View.SetLinkTool(false);
        SyncTool();
        if (k == null) return;
        View.SelectLink(k.Id);
        Dispatcher.BeginInvoke(() => EditLinkCard(k), System.Windows.Threading.DispatcherPriority.Loaded);
        Status($"Связь {k.N} проведена — опишите её");
    }

    void DuplicateLink()
    {
        if (_sheet == null || View.SelectedLink is not { } k) return;
        Link? c = null;
        Edit("Копия связи", () => { c = LinkOps.Duplicate(_sheet, k); SheetGeo.Reroute(_sheet, new[] { c.Id }); });
        if (c != null) { View.SelectLink(c.Id); Status($"Копия связи {k.N} — связь {c.N}, рамки ниже"); }
    }

    void DeleteLink()
    {
        if (_sheet == null || View.SelectedLink is not { } k) return;
        var n = k.N;
        Edit("Удаление связи", () => LinkOps.Delete(_sheet, k));
        View.SelectLink(null);
        if (_pinned.Remove(k.Id, out var pc)) Pops.Children.Remove(pc);
        if (_pop != null) { Pops.Children.Remove(_pop); _pop = null; }
        Status($"Связь {n} удалена — Ctrl+Z вернёт");
    }

    // Разделить таблицу: по строке выбранной связи, если она в этой части,
    // иначе пополам.
    void SplitTable()
    {
        if (_sheet == null || View.SelectedLayers().FirstOrDefault(l => l.Kind == LayerKind.Table) is not { } t) return;
        var ordered = SheetGeo.Ordered(_sheet);
        var to = t.TableTo <= 0 ? ordered.Count : t.TableTo;
        var at = (t.TableFrom + to) / 2;
        if (_lastLinkId != null && ordered.FindIndex(k => k.Id == _lastLinkId) is var i && i > t.TableFrom && i < to) at = i;
        Layer? part = null;
        Edit("Разделить таблицу", () => part = LayerOps.SplitTable(_sheet, t, at));
        if (part == null) Status("В этой части таблицы одна строка — делить нечего");
        else View.Select(new[] { part.Id });
    }

    void AddNoteAt(Point w)
    {
        if (_sheet == null) return;
        Note? n = null;
        Edit("Новая заметка", () => { n = new Note { X = w.X, Y = w.Y, Author = Environment.UserName }; _sheet.Notes.Add(n); });
        SyncTool();
        if (n != null) { View.SelectNote(n.Id); FocusInspectorField("note"); }
    }

    void DeleteNote()
    {
        if (_sheet == null || View.SelectedNote is not { } n) return;
        Edit("Удаление заметки", () => _sheet.Notes.Remove(n));
        View.SelectNote(null);
        Status("Заметка удалена — Ctrl+Z вернёт");
    }
}
