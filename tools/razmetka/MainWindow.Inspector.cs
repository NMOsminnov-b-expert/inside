using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using Razmetka.Editor;
using Razmetka.Model;
using Razmetka.Ui;

namespace Razmetka;

// Инспектор — свойства выбранного (практика interfeys-razmetki-dokumentov-
// klavishi-palitra-komand-inspektor-po-vyb): только то, что относится к
// выбранному; без выбора — разворот, глава и перечень связей разворота.
// Ненужное сейчас скрыто, а не серое. Описание связи — полностью здесь;
// карточка у стрелки — три главных поля для быстрой правки.
//
// Поля сохраняются, когда уходит фокус или нажат Enter; Esc — вернуть как
// было и к полотну. Инспектор перестраивается, только когда меняется то, что
// он показывает, или фокус не в нём — иначе правка стирала бы набираемое.
public partial class MainWindow
{
    string _inspKey = "";
    readonly Dictionary<string, Control> _inspFields = new();

    string InspectorKey() =>
        _sheet == null ? "none"
        : View.SelectedNote is { } n ? "note:" + n.Id
        : View.SelectedLink is { } k ? "link:" + k.Id
        : View.Selection.Count > 0 ? "layers:" + string.Join(",", View.Selection) + (View.CropLayerId != null ? ":crop" : "")
        : "sheet:" + _sheet.Id;

    void BuildInspector(bool force = false)
    {
        var key = InspectorKey();
        if (!force && key == _inspKey && Insp.IsKeyboardFocusWithin) return;
        var scroll = key == _inspKey ? InspScroll.VerticalOffset : 0;
        _inspKey = key;
        Insp.Children.Clear();
        _inspFields.Clear();
        if (_sheet == null) { InspEmpty(); return; }
        if (View.SelectedNote is { } note) InspNote(note);
        else if (View.SelectedLink is { } link) InspLink(link);
        else if (View.Selection.Count > 1) InspLayers(View.SelectedLayers().ToList());
        else if (OneLayer is { } l) InspLayer(l);
        else InspSheet();
        InspScroll.ScrollToVerticalOffset(scroll);
    }

    void FocusInspectorField(string name)
    {
        if (_panelsHidden) TogglePanels();
        BuildInspector(force: true);
        if (_inspFields.TryGetValue(name, out var c))
            Dispatcher.BeginInvoke(() => { c.Focus(); if (c is TextBox t) t.SelectAll(); c.BringIntoView(); }, System.Windows.Threading.DispatcherPriority.Input);
    }

    // Поле с сохранением: Enter или уход фокуса — записать, Esc — вернуть.
    TextBox Bound(string name, string value, Action<string> commit, bool multi = false, bool acceptsReturn = false)
    {
        var t = Kit.Box(value, multi);
        t.AcceptsReturn = acceptsReturn;
        Wire(t, name, () => value, commit, acceptsReturn);
        return t;
    }

    void Wire(TextBox t, string name, Func<string> original, Action<string> commit, bool acceptsReturn = false)
    {
        _inspFields[name] = t;
        var done = false;
        void Commit() { if (!done && t.Text != original()) { done = true; commit(t.Text); } }
        t.LostKeyboardFocus += (_, _) => Commit();
        t.PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Enter && (!acceptsReturn || Keyboard.Modifiers == ModifierKeys.Control)) { Commit(); FocusCanvas(); e.Handled = true; }
            else if (e.Key == Key.Escape) { t.Text = original(); FocusCanvas(); e.Handled = true; }
        };
    }

    UIElement Head(string caption, string title, UIElement? lead = null, UIElement? trailing = null)
    {
        var g = new Grid { Margin = new Thickness(16, 16, 12, 4) };
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        g.ColumnDefinitions.Add(new ColumnDefinition());
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        if (lead is FrameworkElement fe) { fe.Margin = new Thickness(0, 0, 10, 0); fe.VerticalAlignment = VerticalAlignment.Center; g.Children.Add(fe); }
        var t = new StackPanel();
        t.Children.Add(Kit.Text(caption, 11, "Muted"));
        t.Children.Add(Kit.Text(title, 15, "Ink", FontWeights.SemiBold, wrap: true));
        Grid.SetColumn(t, 1);
        g.Children.Add(t);
        if (trailing != null) { Grid.SetColumn(trailing, 2); g.Children.Add(trailing); }
        return g;
    }

    Button CmdBtn(string id, string? text = null, string style = "OutlineBtn", string? glyph = null)
    {
        var c = _cmds[id];
        var b = Kit.TextBtn(text ?? c.Title, c.Tip, () => _cmds.Execute(id), style, glyph ?? GlyphOf(c));
        b.Padding = new Thickness(10, 4, 10, 4);
        b.FontSize = 12;
        return b;
    }

    void InspEmpty()
    {
        var t = Kit.Text("Откройте или создайте проект — здесь появятся свойства выбранного.", 12, "Muted", wrap: true);
        t.Margin = new Thickness(16, 20, 16, 0);
        Insp.Children.Add(t);
    }

    // --- разворот (ничего не выбрано) ----------------------------------------

    void InspSheet()
    {
        var sh = _sheet!;
        var ch = _chapter!;
        var idx = AllSheets().ToList().FindIndex(x => x.Sh == sh);
        var total = AllSheets().Count();
        var nav = new StackPanel { Orientation = Orientation.Horizontal };
        nav.Children.Add(Kit.IconBtn("", "Предыдущий разворот — PageUp", () => StepSheet(-1), 11, "Muted"));
        nav.Children.Add(Kit.IconBtn("", "Следующий разворот — PageDown", () => StepSheet(1), 11, "Muted"));
        Insp.Children.Add(Head($"Разворот {idx + 1} из {total}", sh.Title.Length > 0 ? sh.Title : "Без названия", trailing: nav));

        Insp.Children.Add(Kit.Section("Разворот"));
        Insp.Children.Add(Kit.Field("Название", Bound("title", sh.Title, v => Edit("Название разворота", () => sh.Title = v.Trim()))));
        Insp.Children.Add(Kit.Field("Страница документа", Bound("page", sh.Page, v => Edit("Страница документа", () => sh.Page = v.Trim())),
            "Как в шапке таблицы: «стр. 9»"));

        // Связи разворота — перечень, как таблица на полотне, но всегда под
        // рукой: щелчок — к связи, «без описания» видно сразу.
        var ordered = SheetGeo.Ordered(sh);
        var undescribed = ordered.Count(k => k.DocField.Length == 0 || k.SystemField.Length == 0);
        var add = Kit.TextBtn("Новая", _cmds["tool.link"].Tip, () => _cmds.Execute("tool.link"), "ToolBtn", "");
        add.Padding = new Thickness(6, 2, 6, 2);
        add.FontSize = 12;
        Insp.Children.Add(Kit.Section(ordered.Count == 0 ? "Связи" : $"Связи · {ordered.Count}" + (undescribed > 0 ? $" · без описания {undescribed}" : ""), add));
        if (ordered.Count == 0)
        {
            var e = Kit.Text("Связей пока нет. L — обвести графу на документе, затем поле на снимке системы.", 12, "Muted", wrap: true);
            e.Margin = new Thickness(16, 0, 16, 8);
            Insp.Children.Add(e);
        }
        var list = new StackPanel { Margin = new Thickness(8, 0, 8, 4) };
        foreach (var k in ordered) list.Children.Add(LinkRow(ch, sh, k));
        Insp.Children.Add(list);
        if (ordered.Count > 0)
        {
            var hint = Kit.Text("Tab — перебирать связи, Enter — описать выбранную, 1–4 — вид.", 11, "Faint", wrap: true);
            hint.Margin = new Thickness(16, 2, 16, 4);
            Insp.Children.Add(hint);
        }

        Insp.Children.Add(Kit.Section("Таблица связей"));
        Insp.Children.Add(Kit.Actions(CmdBtn("sheet.below", "Под картинками"), CmdBtn("sheet.right", "Справа колонкой")));

        Insp.Children.Add(Kit.Section("Глава"));
        Insp.Children.Add(Kit.Field("Название главы", Bound("chapter", ch.Title, v => Edit("Название главы", () => ch.Title = v.Trim()))));
        Insp.Children.Add(Kit.Field("Документ", Bound("docname", ch.DocName, v => Edit("Название документа", () => ch.DocName = v.Trim())),
            "Так документ назван в шапке таблицы связей и в подсказках: «Техпаспорт», «Госакт»"));

        var issues = _issues.Where(i => i.Sheet == sh).ToList();
        if (issues.Count > 0)
        {
            Insp.Children.Add(Kit.Section($"Проверка · {issues.Count}"));
            var box = new StackPanel { Margin = new Thickness(8, 0, 8, 0) };
            foreach (var i in issues.OrderByDescending(x => x.Error))
            {
                var b = new Button
                {
                    Style = Kit.S("ToolBtn"), HorizontalContentAlignment = HorizontalAlignment.Stretch, Padding = new Thickness(8, 5, 8, 5),
                    Content = IssueLine(i), ToolTip = "Показать место",
                };
                var ii = i;
                b.Click += (_, _) => GoToIssue(ii);
                box.Children.Add(b);
            }
            Insp.Children.Add(box);
        }
    }

    static UIElement IssueLine(Issue i)
    {
        var d = new DockPanel();
        var dot = new Border { Width = 8, Height = 8, CornerRadius = new CornerRadius(4), Margin = new Thickness(0, 5, 8, 0), VerticalAlignment = VerticalAlignment.Top, Background = Kit.B(i.Error ? "Danger" : "Warn") };
        DockPanel.SetDock(dot, Dock.Left);
        d.Children.Add(dot);
        d.Children.Add(Kit.Text(i.Text, 12, "Ink", wrap: true));
        return d;
    }

    UIElement LinkRow(Chapter ch, Sheet sh, Link k)
    {
        var g = new Grid();
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        g.ColumnDefinitions.Add(new ColumnDefinition());
        var badge = Kit.Badge(k.N, SheetGeo.ColorOf(sh, k));
        badge.Margin = new Thickness(0, 0, 10, 0);
        badge.VerticalAlignment = VerticalAlignment.Top;
        g.Children.Add(badge);
        var t = new StackPanel();
        t.Children.Add(k.DocField.Length > 0 ? Kit.Text(k.DocField, 12) : Kit.Text("графа не описана", 12, "Warn"));
        t.Children.Add(k.SystemField.Length > 0 ? Kit.Text(k.SystemField, 11, "Muted") : Kit.Text("поле системы не описано", 11, "Warn"));
        Grid.SetColumn(t, 1);
        g.Children.Add(t);
        var b = new Button
        {
            Style = Kit.S("ToolBtn"), HorizontalContentAlignment = HorizontalAlignment.Stretch, Padding = new Thickness(8, 5, 8, 5), Content = g,
            ToolTip = $"{k.DocField} → {k.SystemField}\nЩелчок — к связи, двойной — описать",
        };
        b.Click += (_, _) => JumpTo(ch, sh, k);
        b.MouseDoubleClick += (_, _) => EditLinkCard(k);
        return b;
    }

    // --- связь ------------------------------------------------------------------

    void InspLink(Link k)
    {
        var sh = _sheet!;
        var col = SheetGeo.ColorOf(sh, k);
        var nav = new StackPanel { Orientation = Orientation.Horizontal };
        nav.Children.Add(Kit.IconBtn("", "Предыдущая связь — Shift+Tab", () => StepLink(-1), 11, "Muted"));
        nav.Children.Add(Kit.IconBtn("", "Следующая связь — Tab", () => StepLink(1), 11, "Muted"));
        var kindLabel = LinkKind.All.FirstOrDefault(x => x.Key == k.Kind).Label ?? "";
        var pos = SheetGeo.Ordered(sh).FindIndex(x => x.Id == k.Id) + 1;
        Insp.Children.Add(Head($"Связь {k.N} · {pos} из {sh.Links.Count} на развороте", kindLabel, Kit.Badge(k.N, col), nav));

        var doc = new AutoBox(q => AutoBox.Rank(_chapter!.Sheets.SelectMany(s => s.Links).Select(x => x.DocField), q));
        doc.Text = k.DocField;
        Wire(doc.Box, "doc", () => k.DocField, v => Edit("Графа документа", () => k.DocField = v.Trim()));
        Insp.Children.Add(Kit.Field(_chapter?.DocName is { Length: > 0 } d ? $"Графа документа · {d}" : "Графа документа", doc,
            tip: "Как графа названа в самом документе"));
        var sys = new AutoBox(q => AutoBox.Rank(AllLinks().Select(x => x.K.SystemField), q), multi: true);
        sys.Text = k.SystemField;
        Wire(sys.Box, "sys", () => k.SystemField, v => Edit("Поле системы", () => k.SystemField = v.Trim()));
        Insp.Children.Add(Kit.Field("Поле системы", sys, "Блок · Подблок · Поле — как в интерфейсе системы; подсказки — из уже описанных связей"));

        // Вид связи — строками с цифрой клавиши (Label Studio: клавиша рядом
        // с меткой): видно и значение, и как его поставить без мыши.
        var kinds = new StackPanel { Margin = new Thickness(-4, 0, -4, 0) };
        for (var i = 0; i < LinkKind.All.Length; i++)
        {
            var (key, label) = LinkKind.All[i];
            var on = k.Kind == key;
            var row = new DockPanel();
            var kb = Kit.Kbd((i + 1).ToString());
            DockPanel.SetDock(kb, Dock.Right);
            row.Children.Add(kb);
            var mark = Kit.Icon(on ? "" : "", 12, "Accent");
            mark.Width = 20;
            DockPanel.SetDock(mark, Dock.Left);
            row.Children.Add(mark);
            row.Children.Add(Kit.Text(label, 13, on ? "AccentText" : "Ink", on ? FontWeights.SemiBold : FontWeights.Normal));
            var b = new Button
            {
                Style = Kit.S("ToolBtn"), Content = row, HorizontalContentAlignment = HorizontalAlignment.Stretch, Padding = new Thickness(4, 4, 6, 4),
                Background = on ? Kit.B("AccentSoft") : Brushes.Transparent, ToolTip = $"{label} — клавиша {i + 1}; на полотне: {KindLine(key)}",
            };
            var kk = key;
            b.Click += (_, _) => SetKind(k, kk);
            kinds.Children.Add(b);
        }
        Insp.Children.Add(Kit.Field("Вид связи", kinds));

        Insp.Children.Add(Kit.Section("Стрелка"));
        var sides = Sides.Select(x => (x.Key, x.Key == "" ? "авто" : x.Key switch { "left" => "←", "right" => "→", "top" => "↑", _ => "↓" }, (string?)x.Label)).ToList();
        Insp.Children.Add(Kit.Field("Выход из рамки на документе", Kit.Segmented(sides, k.SrcSide, v => SetSides(k, v, k.TgtSide))));
        Insp.Children.Add(Kit.Field("Вход в рамку на снимке", Kit.Segmented(sides, k.TgtSide, v => SetSides(k, k.SrcSide, v))));
        Insp.Children.Add(Kit.Actions(CmdBtn("link.reroute", "Переложить"), CmdBtn("link.straighten", "Выпрямить")));

        Insp.Children.Add(Kit.Section("Ещё"));
        var n = Bound("n", k.N.ToString(), v =>
        {
            if (int.TryParse(v, out var nn) && nn != k.N) Edit("Номер связи", () => LinkOps.Renumber(sh, k, nn));
        });
        n.Width = 72;
        n.HorizontalAlignment = HorizontalAlignment.Left;
        n.TextAlignment = TextAlignment.Right;
        Insp.Children.Add(Kit.Field("Номер", n, "Остальные сдвинутся; номера сквозные по главе"));
        Insp.Children.Add(Kit.Field("Ссылка", Bound("url", k.Url, v => Edit("Ссылка связи", () => k.Url = v.Trim())), "Страница макета или документа — откроется из экспорта"));
        Insp.Children.Add(Kit.Actions(
            CmdBtn("link.pin", _pinned.ContainsKey(k.Id) ? "Открепить подсказку" : "Закрепить подсказку"),
            CmdBtn("link.toRow", "К строке таблицы"),
            CmdBtn("edit.dup", "Копия ниже"),
            DangerBtn("Удалить связь", "Удалить связь и её рамки — Delete", DeleteLink)));

        var same = AllLinks().Where(x => x.K.Id != k.Id && x.K.SystemField.Length > 0
                                         && string.Equals(x.K.SystemField, k.SystemField, StringComparison.OrdinalIgnoreCase)).ToList();
        if (same.Count > 0)
        {
            Insp.Children.Add(Kit.Section($"То же поле в других разворотах · {same.Count}"));
            var box = new StackPanel { Margin = new Thickness(8, 0, 8, 0) };
            foreach (var (ch2, sh2, other) in same) box.Children.Add(LinkRow(ch2, sh2, other) is Button b ? Relabel(b, ch2, sh2) : null);
            Insp.Children.Add(box);
        }

        var hist = _store!.Project.History.Where(h => h.Target == k.Id).TakeLast(6).Reverse().ToList();
        if (hist.Count > 0)
        {
            Insp.Children.Add(Kit.Section("Изменения"));
            foreach (var h in hist)
            {
                var t = Kit.Text($"{h.At:dd.MM HH:mm} · {h.Author} · {h.What}", 11, "Muted");
                t.Margin = new Thickness(16, 0, 16, 3);
                Insp.Children.Add(t);
            }
        }
    }

    static string KindLine(string kind) => kind switch
    {
        LinkKind.Auto => "короткий штрих", LinkKind.NameOnly => "точки", LinkKind.None => "штрих", _ => "сплошная линия",
    };

    // Строка связи другого разворота — с подписью, откуда она.
    static Button Relabel(Button b, Chapter ch, Sheet sh)
    {
        if (b.Content is Grid g && g.Children[1] is StackPanel t)
            t.Children.Add(Kit.Text($"{ch.DocName} · {sh.Title}", 11, "Faint"));
        return b;
    }

    static Button DangerBtn(string text, string tip, Action act)
    {
        var b = Kit.TextBtn(text, tip, act, "OutlineBtn", "");
        b.Foreground = Kit.B("Danger");
        b.Padding = new Thickness(10, 4, 10, 4);
        b.FontSize = 12;
        if (b.Content is StackPanel p && p.Children[0] is TextBlock i) i.Foreground = Kit.B("Danger");
        return b;
    }

    // --- слой -------------------------------------------------------------------

    void InspLayer(Layer l)
    {
        var table = l.Kind == LayerKind.Table;
        var state = l.Locked ? " · закреплён" : l.Hidden ? " · скрыт" : "";
        Insp.Children.Add(Head((table ? "Таблица связей" : "Картинка") + state, l.Name.Length > 0 ? l.Name : "Без названия"));
        if (View.CropLayerId == l.Id)
        {
            var c = Kit.Text("Обрезка: ручки — край, внутри — сдвиг картинки. Enter или Esc — готово. Пиксели не удаляются.", 12, "AccentText", wrap: true);
            c.Margin = new Thickness(16, 4, 16, 8);
            Insp.Children.Add(c);
        }
        Insp.Children.Add(Kit.Field("Название слоя", Bound("name", l.Name, v => Edit("Название слоя", () => l.Name = v.Trim()))));
        if (!table)
            Insp.Children.Add(Kit.Field("Подпись над картинкой", Bound("caption", l.Caption, v => Edit("Подпись слоя", () => l.Caption = v.Trim())),
                "Видна на полотне и в экспорте: «Литера · 02 Площади и этажность»"));

        if (table)
            Insp.Children.Add(Kit.Actions(CmdBtn("layer.split", "Разделить"), CmdBtn("layer.merge", "Слить со следующей")));
        else if (!l.Locked)
        {
            var cropped = _store!.Project.Assets.TryGetValue(l.Asset ?? "", out var a) && (l.Crop.X > 0 || l.Crop.Y > 0 || l.Crop.W < a.W || l.Crop.H < a.H);
            Insp.Children.Add(Kit.Actions(CmdBtn("tool.link", "Новая связь"), CmdBtn("layer.crop"),
                cropped ? CmdBtn("layer.cropReset", "Сбросить обрезку") : new Border(), CmdBtn("layer.replace", "Заменить…")));
        }

        Insp.Children.Add(Kit.Section("Слой"));
        var flags = new StackPanel { Margin = new Thickness(12, 0, 12, 8) };
        flags.Children.Add(Toggle("Закреплён — мышью не выбирается и не двигается", l.Locked, v => Edit(v ? "Закрепить слой" : "Открепить слой", () => l.Locked = v), "Ctrl+Shift+L"));
        flags.Children.Add(Toggle("Скрыт", l.Hidden, v => Edit(v ? "Скрыть слой" : "Показать слой", () => l.Hidden = v), "Ctrl+Shift+H"));
        Insp.Children.Add(flags);
        var order = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(12, 0, 12, 8) };
        order.Children.Add(Kit.Text("Порядок", 12, "Muted"));
        ((TextBlock)order.Children[0]).Width = 70;
        ((TextBlock)order.Children[0]).VerticalAlignment = VerticalAlignment.Center;
        foreach (var (id, g) in new[] { ("layer.top", ""), ("layer.up", ""), ("layer.down", ""), ("layer.bottom", "") })
            order.Children.Add(Kit.IconBtn(g, _cmds[id].Tip, () => _cmds.Execute(id), 12));
        Insp.Children.Add(order);
        var info = Kit.Text($"Размер {l.W:0} × {l.H:0}, место {l.X:0}; {l.Y:0}" +
                            (_store!.Project.Assets.TryGetValue(l.Asset ?? "", out var ai) && ai.Name.Length > 0 ? $"\nИсточник: {ai.Name}" : ""), 11, "Faint", wrap: true);
        info.Margin = new Thickness(16, 0, 16, 8);
        Insp.Children.Add(info);
        Insp.Children.Add(Kit.Actions(CmdBtn("edit.dup", "Копия"), DangerBtn("Удалить слой", "Удалить — Delete", DeleteSelected)));
    }

    void InspLayers(List<Layer> ls)
    {
        Insp.Children.Add(Head("Несколько слоёв", $"Выбрано: {ls.Count}"));
        var names = Kit.Text(string.Join("\n", ls.Select(l => "· " + (l.Name.Length > 0 ? l.Name : "Без названия"))), 12, "Muted", wrap: true);
        names.Margin = new Thickness(16, 4, 16, 10);
        Insp.Children.Add(names);
        Insp.Children.Add(Kit.Actions(CmdBtn("layer.lock", ls.All(l => l.Locked) ? "Открепить" : "Закрепить"),
            CmdBtn("layer.hide", "Скрыть"), CmdBtn("edit.dup", "Копия")));
        Insp.Children.Add(Kit.Actions(CmdBtn("layer.up", "Выше"), CmdBtn("layer.down", "Ниже"), DangerBtn("Удалить", "Удалить — Delete", DeleteSelected)));
        var hint = Kit.Text("Стрелки — сдвиг всех выбранных, Shift — на 10.", 11, "Faint", wrap: true);
        hint.Margin = new Thickness(16, 4, 16, 0);
        Insp.Children.Add(hint);
    }

    static CheckBox Toggle(string text, bool on, Action<bool> set, string keys) =>
        new CheckBox { Content = new TextBlock { Text = text, TextWrapping = TextWrapping.Wrap }, IsChecked = on, Margin = new Thickness(4, 2, 0, 4), Focusable = false, ToolTip = keys }
            .Also(c => c.Click += (_, _) => set(c.IsChecked == true));

    // --- заметка ----------------------------------------------------------------

    void InspNote(Note n)
    {
        Insp.Children.Add(Head($"Заметка · {n.Author}, {n.At:dd.MM.yyyy HH:mm}", "Вопрос или пояснение"));
        var t = Bound("note", n.Text, v => Edit("Текст заметки", () => n.Text = v), multi: true, acceptsReturn: true);
        t.MinHeight = 110;
        Insp.Children.Add(Kit.Field("Текст", t, "Ctrl+Enter — готово; булавку можно перетащить"));
        Insp.Children.Add(Kit.Actions(DangerBtn("Удалить заметку", "Удалить — Delete", DeleteNote)));
    }
}

static class FluentExt
{
    public static T Also<T>(this T x, Action<T> a) { a(x); return x; }
}
