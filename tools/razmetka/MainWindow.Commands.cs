using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Razmetka.Editor;
using Razmetka.Model;
using Razmetka.Ui;

namespace Razmetka;

// Реестр команд окна (Ui/Commands.cs): каждое действие — один раз, с
// названием, группой и клавишами. Отсюда же — палитра (Ctrl+K), меню правой
// кнопки, подсказки кнопок и шпаргалка (F1). Раскладка клавиш — практика
// interfeys-razmetki-dokumentov-klavishi-palitra-komand-inspektor-po-vyb
// (Figma, Excalidraw, CVAT, Label Studio, Rossum; клавиши Windows).
public partial class MainWindow
{
    readonly CommandSet _cmds = new();
    public CommandSet Commands => _cmds;

    bool HasSheet => _sheet != null;
    // Править на полотне — только в режиме «Один»: в «Подряд» полотно скрыто.
    bool CanDraw => _sheet != null && !_flow;
    bool HasProject => _store != null;
    bool LinkSel => View.SelectedLink != null;
    bool LayersSel => View.Selection.Count > 0;
    Layer? OneLayer => View.Selection.Count == 1 ? View.SelectedLayers().FirstOrDefault() : null;
    bool ImageSel => OneLayer is { Kind: LayerKind.Image, Locked: false };

    void BuildCommands()
    {
        Chord K(Key k, ModifierKeys m = ModifierKeys.None) => new(k, m);
        const ModifierKeys C = ModifierKeys.Control, S = ModifierKeys.Shift, CS = ModifierKeys.Control | ModifierKeys.Shift;
        void Add(string id, string title, string group, Scope scope, Action run, Func<bool>? when = null, string hint = "",
                 bool palette = true, string? keysText = null, params Chord[] keys) =>
            _cmds.Add(new Cmd
            {
                Id = id, Title = title, Group = group, Scope = scope, Run = run, When = when ?? (() => true), Hint = hint,
                InPalette = palette, KeysText = keysText, Keys = keys,
            });

        // Проект
        Add("project.new", "Новый проект…", "Проект", Scope.App, NewProject, keys: K(Key.N, C));
        Add("project.open", "Открыть проект…", "Проект", Scope.Global, OpenProject, keys: K(Key.O, C));
        Add("project.save", "Сохранить", "Проект", Scope.Global, Save, () => HasProject, keys: K(Key.S, C));
        Add("project.export.html", "Экспорт: HTML-страница всего проекта…", "Проект", Scope.App, ExportHtml, () => HasProject, keys: K(Key.E, C));
        Add("project.export.xlsx", "Экспорт: таблица связей Excel…", "Проект", Scope.App, ExportXlsx, () => HasProject);
        Add("project.export.png", "Экспорт: разворот картинкой…", "Проект", Scope.App, ExportPng, () => HasSheet);
        Add("project.checks", "Проверка разметки: все замечания…", "Проект", Scope.App, ShowChecks, () => HasProject);
        Add("check.next", "Следующее замечание проверки", "Проект", Scope.App, () => StepIssue(1), () => HasProject, keys: K(Key.F8));
        Add("check.prev", "Предыдущее замечание проверки", "Проект", Scope.App, () => StepIssue(-1), () => HasProject, keys: K(Key.F8, S));
        Add("project.close", "Закрыть проект", "Проект", Scope.App, CloseProject, () => HasProject);

        // Переход
        Add("go.palette", "Все команды", "Переход", Scope.Global, () => OpenPalette(""), keys: K(Key.K, C));
        Add("go.sheet", "Перейти к развороту…", "Переход", Scope.Global, () => OpenPalette("", sheetsOnly: true), () => HasProject, keys: K(Key.P, C));
        Add("go.search", "Поиск по связям", "Переход", Scope.Global, FocusSearch, () => HasProject, keys: K(Key.F, C));
        // Развороты — PageDown / PageUp и, как листы в Excel, Ctrl+PageDown /
        // Ctrl+PageUp; главы — с Shift.
        Add("go.next", "Следующий разворот", "Переход", Scope.App, () => StepSheet(1), () => HasProject, keysText: "PageDown", keys: new[] { K(Key.Next), K(Key.Next, C) });
        Add("go.prev", "Предыдущий разворот", "Переход", Scope.App, () => StepSheet(-1), () => HasProject, keysText: "PageUp", keys: new[] { K(Key.Prior), K(Key.Prior, C) });
        Add("go.nextChapter", "Следующая глава", "Переход", Scope.App, () => StepChapter(1), () => HasProject, keys: K(Key.Next, CS));
        Add("go.prevChapter", "Предыдущая глава", "Переход", Scope.App, () => StepChapter(-1), () => HasProject, keys: K(Key.Prior, CS));
        Add("view.flow", "Развороты подряд — все столбцом", "Вид", Scope.App, () => SetFlow(!_flow), () => HasProject,
            "Переключить: один разворот или все по порядку", keys: K(Key.V, CS));
        Add("go.focus", "Фокус: развороты → полотно → свойства", "Переход", Scope.Global, CycleFocus, keys: K(Key.F6));
        Add("help.keys", "Клавиши", "Переход", Scope.Global, OpenCheatsheet, keys: K(Key.F1));

        Add("flow.open", "Править разворот", "Переход", Scope.Canvas, () => SetFlow(false), () => _flow, "В режиме «Подряд» — открыть текущий разворот", false, "Enter", K(Key.Enter));
        Add("flow.leave", "Один разворот", "Переход", Scope.Canvas, () => SetFlow(false), () => _flow, "Из режима «Подряд»", false, "Esc", K(Key.Escape));
        // Инструменты
        Add("tool.select", "Выбор", "Инструменты", Scope.Canvas, () => SetTool("select"), () => CanDraw, "Щелчок — выбрать, перетаскивание — перенести", keys: K(Key.V));
        Add("tool.hand", "Рука — двигать полотно", "Инструменты", Scope.Canvas, () => SetTool("hand"), () => CanDraw, "Пробел — рука на время, пока нажат", keys: K(Key.H));
        Add("tool.link", "Новая связь", "Инструменты", Scope.Canvas, () => SetTool(View.LinkTool ? "select" : "link"), () => CanDraw,
            "Обвести графу на документе, затем поле на снимке системы", keys: K(Key.L));
        Add("tool.note", "Заметка", "Инструменты", Scope.Canvas, () => SetTool(View.NoteTool ? "select" : "note"), () => CanDraw,
            "Щелчок по полотну ставит булавку с вопросом или пояснением", keys: K(Key.N));
        Add("tool.lens", "Лупа", "Инструменты", Scope.Canvas, ToggleLens, () => CanDraw, "Участок под курсором втрое крупнее", keys: K(Key.M));

        // Вид
        Add("view.fit", "Весь разворот в окне", "Вид", Scope.App, View.FitAll, () => HasSheet, keysText: "Shift+1", keys: new[] { K(Key.D1, S), K(Key.D0, C) });
        Add("view.selection", "Показать выбранное", "Вид", Scope.App, ZoomToSelection, () => LinkSel || LayersSel, keys: K(Key.D2, S));
        Add("view.100", "Масштаб 100 %", "Вид", Scope.App, () => View.SetZoom(1), () => HasSheet, keys: K(Key.D0, S));
        Add("view.in", "Крупнее", "Вид", Scope.App, () => View.SetZoom(View.Zoom * 1.25), () => HasSheet, keysText: "Ctrl++",
            keys: new[] { K(Key.OemPlus, C), K(Key.Add, C) });
        Add("view.out", "Мельче", "Вид", Scope.App, () => View.SetZoom(View.Zoom / 1.25), () => HasSheet, keysText: "Ctrl+−",
            keys: new[] { K(Key.OemMinus, C), K(Key.Subtract, C) });
        Add("view.panels", "Только полотно — скрыть панели", "Вид", Scope.App, TogglePanels, keys: K(Key.Oem5, C));

        // Правка
        Add("edit.undo", "Отменить", "Правка", Scope.App, Undo, () => HasProject, keys: K(Key.Z, C));
        Add("edit.redo", "Повторить", "Правка", Scope.App, Redo, () => HasProject, keysText: "Ctrl+Y", keys: new[] { K(Key.Y, C), K(Key.Z, CS) });
        Add("edit.paste", "Вставить картинку из буфера", "Правка", Scope.App, PasteImage, () => HasSheet, "Снимок экрана Win+Shift+S — и сюда", keys: K(Key.V, C));
        Add("edit.all", "Выбрать все слои", "Правка", Scope.Canvas, () => View.Select(_sheet!.Layers.Where(l => !l.Hidden && !l.Locked).Select(l => l.Id)), () => HasSheet, keys: K(Key.A, C));
        Add("edit.dup", "Копия", "Правка", Scope.Canvas, () => { if (LinkSel) DuplicateLink(); else Duplicate(); }, () => LinkSel || LayersSel,
            "Связь — копия ниже на высоту рамки; слой — копия со сдвигом", keys: K(Key.D, C));
        Add("edit.delete", "Удалить выбранное", "Правка", Scope.Canvas, DeleteAny, () => LinkSel || LayersSel || View.SelectedNote != null,
            keysText: "Delete", keys: new[] { K(Key.Delete), K(Key.Back) });
        Add("edit.escape", "Выйти из режима, снять выбор", "Правка", Scope.Canvas, Escape, keys: K(Key.Escape));
        Add("edit.rename", "Переименовать", "Правка", Scope.App, Rename, () => HasSheet, "Слой, связь или разворот — поле в панели свойств", keys: K(Key.F2));
        foreach (var (key, dx, dy) in new[] { (Key.Left, -1, 0), (Key.Right, 1, 0), (Key.Up, 0, -1), (Key.Down, 0, 1) })
        {
            Add($"edit.nudge.{key}", "Сдвиг", "Правка", Scope.Canvas, () => Nudge(dx, dy, false), () => CanDraw,
                "Сдвиг выбранного; без выбора — полотна", false, "←↑→↓", K(key));
            Add($"edit.nudge10.{key}", "Сдвиг на 10", "Правка", Scope.Canvas, () => Nudge(dx, dy, true), () => CanDraw,
                "Сдвиг на 10", false, "Shift+←↑→↓", K(key, S));
        }

        // Связь
        Add("link.next", "Следующая связь", "Связь", Scope.Canvas, () => StepLink(1), () => CanDraw, keys: K(Key.Tab));
        Add("link.prev", "Предыдущая связь", "Связь", Scope.Canvas, () => StepLink(-1), () => CanDraw, keys: K(Key.Tab, S));
        Add("link.edit", "Описать связь", "Связь", Scope.Canvas, () => EditLinkCard(View.SelectedLink!), () => LinkSel,
            "Графа документа, поле системы, комментарий — у стрелки", keys: K(Key.Enter));
        // Enter — «войти в правку выбранного» (Figma): обрезка — готово,
        // картинка — обрезать, заметка — к тексту. Связь — строкой выше.
        Add("edit.enter", "Править выбранное", "Правка", Scope.Canvas, EnterSelected,
            () => View.CropLayerId != null || ImageSel || View.SelectedNote != null,
            "Обрезка — готово; картинка — обрезать; заметка — к тексту", false, "Enter", K(Key.Enter));
        Add("link.reroute", "Переложить стрелку", "Связь", Scope.Canvas, () => Edit("Переложить стрелку", () => SheetGeo.Reroute(_sheet!, new[] { View.SelectedLink!.Id })),
            () => LinkSel, "Проложить заново в обход остальных", keys: K(Key.R));
        Add("link.pin", "Закрепить подсказку у номера", "Связь", Scope.Canvas, () => TogglePin(View.SelectedLink!), () => LinkSel, keys: K(Key.P));
        Add("link.toRow", "К строке таблицы", "Связь", Scope.Canvas, () => ToTableRow(View.SelectedLink!), () => LinkSel);
        Add("link.straighten", "Выпрямить стрелку", "Связь", Scope.Canvas,
            () => Edit("Выпрямить стрелку", () => { var k = View.SelectedLink!; k.Points.Clear(); SheetGeo.Reroute(_sheet!, new[] { k.Id }); }), () => LinkSel);

        // Слой
        Add("layer.crop", "Обрезать", "Слой", Scope.Canvas, StartCropSelected, () => ImageSel, "Без потери пикселей: вернуть можно всегда", keys: K(Key.C));
        Add("layer.cropReset", "Сбросить обрезку", "Слой", Scope.Canvas, () => Edit("Сброс обрезки", () => { foreach (var l in View.SelectedLayers()) LayerOps.ResetCrop(l, _store!); }), () => ImageSel);
        Add("layer.replace", "Заменить картинку…", "Слой", Scope.Canvas, ReplaceImage, () => ImageSel, "Рамки подгоняются по двум точкам");
        Add("layer.lock", "Закрепить или открепить", "Слой", Scope.Canvas, ToggleLock, () => LayersSel, keys: K(Key.L, CS));
        Add("layer.hide", "Скрыть или показать", "Слой", Scope.Canvas, ToggleHide, () => LayersSel, keys: K(Key.H, CS));
        Add("layer.top", "Наверх", "Слой", Scope.Canvas, () => Reorder(int.MaxValue), () => LayersSel, keys: K(Key.OemCloseBrackets, CS));
        Add("layer.up", "Выше", "Слой", Scope.Canvas, () => Reorder(1), () => LayersSel, keys: K(Key.OemCloseBrackets, C));
        Add("layer.down", "Ниже", "Слой", Scope.Canvas, () => Reorder(-1), () => LayersSel, keys: K(Key.OemOpenBrackets, C));
        Add("layer.bottom", "Вниз", "Слой", Scope.Canvas, () => Reorder(int.MinValue), () => LayersSel, keys: K(Key.OemOpenBrackets, CS));
        Add("layer.split", "Разделить таблицу", "Слой", Scope.Canvas, SplitTable, () => OneLayer is { Kind: LayerKind.Table }, "По строке выбранной связи или пополам");
        Add("layer.merge", "Слить таблицу со следующей частью", "Слой", Scope.Canvas,
            () => Edit("Слить таблицу", () => { if (!LayerOps.MergeTable(_sheet!, OneLayer!)) Status("Следующей части таблицы нет"); }), () => OneLayer is { Kind: LayerKind.Table });

        // Разворот
        Add("sheet.new", "Новый разворот", "Разворот", Scope.App, AddSheet, () => HasProject, "Сразу после текущего", keys: K(Key.N, CS));
        Add("sheet.left", "Сдвинуть разворот влево", "Разворот", Scope.App, () => MoveSheet(_chapter!, _sheet!, -1), () => HasSheet && _chapter!.Sheets.IndexOf(_sheet!) > 0, keys: K(Key.Left, ModifierKeys.Alt));
        Add("sheet.right", "Сдвинуть разворот вправо", "Разворот", Scope.App, () => MoveSheet(_chapter!, _sheet!, 1), () => HasSheet && _chapter!.Sheets.IndexOf(_sheet!) < _chapter.Sheets.Count - 1, keys: K(Key.Right, ModifierKeys.Alt));
        Add("sheet.chapter", "Новая глава", "Разворот", Scope.App, AddChapter, () => HasProject);
        Add("sheet.pdf", "Документ из PDF…", "Разворот", Scope.App, () => _ = AddPdfFromDialog(), () => HasProject, "Страницы — развороты новой или текущей главы");
        Add("sheet.image", "Добавить фото из файла…", "Разворот", Scope.App, AddImagesFromDialog, () => HasSheet, "Можно и перетащить файлы на окно");
        Add("sheet.below", "Таблица связей — под картинками", "Разворот", Scope.App, () => TableLayout("below"), () => HasSheet);
        Add("sheet.right", "Таблица связей — колонкой справа", "Разворот", Scope.App, () => TableLayout("right"), () => HasSheet);
        Add("sheet.delete", "Удалить разворот", "Разворот", Scope.App, () => DeleteSheet(_chapter!, _sheet!), () => HasSheet);
    }

    // --- клавиши -----------------------------------------------------------

    void OnKey(object sender, KeyEventArgs e)
    {
        if (Pal.IsOpen || Cheat.IsOpen) return;
        var key = e.Key == Key.System ? e.SystemKey : e.Key;
        var inText = Keyboard.FocusedElement is TextBox or ComboBox { IsEditable: true } or PasswordBox;
        var f = Keyboard.FocusedElement;
        var onCanvas = f == null || f == this || f is SheetView || (_flow && f is DependencyObject d && (d == Flow || IsDescendant(Flow, d)));
        e.Handled = Dispatch(key, Keyboard.Modifiers, inText, onCanvas);
    }

    // Клавиши вынесены сюда: их вызывают и сценарии проверки (фокус — на полотне).
    public bool HandleKey(Key key, ModifierKeys mods, bool inText = false) => Dispatch(key, mods, inText, !inText);

    bool Dispatch(Key key, ModifierKeys mods, bool inText, bool onCanvas)
    {
        // Карточка описания связи сама разбирает Enter, Esc и Alt+цифры;
        // окну из неё — только сохранение проекта.
        if (_editor != null && !(mods == ModifierKeys.Control && key == Key.S)) return false;
        return _cmds.Handle(key, mods, inText, onCanvas);
    }

    // Esc — на уровень вверх: сначала режим, потом выбор.
    void Escape()
    {
        if (View.CropLayerId != null) { View.EndCrop(); return; }
        if (View.AlignStep >= 0) { View.CancelAlign(); return; }
        if (View.LinkTool || View.NoteTool || View.HandTool) { SetTool("select"); return; }
        if (View.Lens) { ToggleLens(); return; }
        if (_pop != null) { Pops.Children.Remove(_pop); _pop = null; }
        if (View.LinkId != null) { View.SelectLink(null); return; }
        if (View.NoteId != null) { View.SelectNote(null); return; }
        View.ClearSelection();
    }

    void EnterSelected()
    {
        if (View.CropLayerId != null) { View.EndCrop(); SyncTool(); }
        else if (View.SelectedNote != null) FocusInspectorField("note");
        else StartCropSelected();
    }

    void DeleteAny()
    {
        if (View.SelectedNote != null) DeleteNote();
        else if (LinkSel) DeleteLink();
        else DeleteSelected();
    }

    void Nudge(int dx, int dy, bool big)
    {
        if (_sheet == null) return;
        if (View.Selection.Count > 0 && View.LinkId == null)
        {
            var st = big ? 10 : 1;
            Edit("Сдвиг", () => LayerOps.Nudge(_sheet, View.Selection, dx * st, dy * st));
            return;
        }
        // Без выбора стрелки двигают полотно (Figma: работа без мыши).
        View.PanBy(new Vector(-dx * (big ? 240 : 60), -dy * (big ? 240 : 60)));
    }

    void ZoomToSelection()
    {
        var r = View.SelectedLink is { } k ? View.LinkBounds(k) : null;
        if (r == null && View.Selection.Count > 0)
        {
            var u = Rect.Empty;
            foreach (var l in View.SelectedLayers()) u.Union(new Rect(l.X, l.Y, l.W, l.H));
            r = u.IsEmpty ? null : u;
        }
        if (r != null) View.ZoomToRect(r.Value);
    }

    // Tab / Shift+Tab — по связям разворота в порядке номеров; выбранная
    // показывается, если она за краем окна.
    void StepLink(int step)
    {
        if (_sheet == null) return;
        var ordered = SheetGeo.Ordered(_sheet);
        if (ordered.Count == 0) { Status("На развороте нет связей — L, чтобы провести первую"); return; }
        var i = View.SelectedLink is { } cur ? ordered.FindIndex(x => x.Id == cur.Id) : (step > 0 ? -1 : ordered.Count);
        var j = (i + step + ordered.Count) % ordered.Count;
        var k = ordered[j];
        if (_pop != null) { Pops.Children.Remove(_pop); _pop = null; }
        View.SelectLink(k.Id);
        if (View.LinkBounds(k) is { } r) View.EnsureVisible(r);
        Status($"Связь {k.N} · {j + 1} из {ordered.Count}: {(k.DocField.Length > 0 ? k.DocField : "графа не описана")} → {(k.SystemField.Length > 0 ? k.SystemField : "поле не описано")}. Enter — описать");
    }


    void StartCropSelected()
    {
        if (OneLayer is { } l) View.StartCrop(l.Id);
        SyncTool();
    }

    void TableLayout(string where)
    {
        if (_sheet == null) return;
        Edit(where == "below" ? "Таблица снизу" : "Таблица справа", () => LayerOps.Layout(_sheet, where));
        View.FitAll();
    }

    // F2 — к полю названия того, что выбрано.
    void Rename()
    {
        if (View.SelectedNote != null) FocusInspectorField("note");
        else if (LinkSel) FocusInspectorField("doc");
        else if (OneLayer != null) FocusInspectorField("name");
        else FocusInspectorField("title");
    }

    // --- палитра и шпаргалка ------------------------------------------------

    IInputElement? _focusBefore;

    void OpenPalette(string query, bool sheetsOnly = false)
    {
        if (Cheat.IsOpen) Cheat.Close();
        _focusBefore = Keyboard.FocusedElement;
        Pal.Open(q => PaletteItems(q, sheetsOnly), RestoreFocus, query);
    }

    void OpenCheatsheet()
    {
        if (Pal.IsOpen) Pal.Close();
        _focusBefore = Keyboard.FocusedElement;
        Cheat.Open(_cmds, RestoreFocus);
    }

    void RestoreFocus()
    {
        var f = _focusBefore;
        Dispatcher.BeginInvoke(() => { if (f is UIElement { IsVisible: true } u) u.Focus(); else View.Focus(); }, System.Windows.Threading.DispatcherPriority.Input);
    }

    // Состав палитры. Пустой запрос: недавние, команды для выбранного,
    // развороты. С запросом: команды, развороты, связи — по счёту совпадения.
    List<PaletteItem> PaletteItems(string q, bool sheetsOnly)
    {
        var o = new List<PaletteItem>();
        PaletteItem FromCmd(Cmd c, string group) => new(group, c.Title, c.Hint, c.KeyLabel,
            () => _cmds.Execute(c.Id), GlyphOf(c));
        var cmds = _cmds.All.Where(c => c.InPalette && c.When()).ToList();
        if (!sheetsOnly)
        {
            if (q.Length == 0)
            {
                foreach (var id in _cmds.Recent) if (cmds.FirstOrDefault(c => c.Id == id) is { } c) o.Add(FromCmd(c, "Недавние"));
                var ctx = LinkSel ? "Связь" : LayersSel ? "Слой" : null;
                if (ctx != null) foreach (var c in cmds.Where(c => c.Group == ctx && !_cmds.Recent.Contains(c.Id))) o.Add(FromCmd(c, $"Для выбранного: {ctx.ToLowerInvariant()}"));
                foreach (var c in cmds.Where(c => c.Group != ctx && !_cmds.Recent.Contains(c.Id))) o.Add(FromCmd(c, c.Group));
            }
            else
            {
                foreach (var (c, s) in cmds.Select(c => (c, s: Palette.Score(c.Title + " " + c.Group + " " + c.Hint, q))).Where(x => x.s >= 0).OrderBy(x => x.s).Take(12))
                    o.Add(FromCmd(c, "Команды"));
            }
        }
        if (_store != null)
        {
            var sheets = AllSheets().Select((x, i) => (x.Ch, x.Sh, i)).ToList();
            var hits = sheets.Select(x => (x, s: Palette.Score($"{x.Sh.Title} {x.Sh.Page} {x.Ch.Title} {x.Ch.DocName}", q))).Where(y => y.s >= 0)
                .OrderBy(y => q.Length == 0 ? y.x.i : y.s).Take(q.Length == 0 && !sheetsOnly ? 0 : 40);
            foreach (var ((ch, sh, i), _) in hits)
                o.Add(new PaletteItem("Развороты", sh.Title, $"{ch.Title}{(sh.Page.Length > 0 ? " · " + sh.Page : "")} · связей {sh.Links.Count}",
                    sh == _sheet ? "сейчас" : "", () => { OpenSheet(ch, sh); if (!_flow) FocusCanvas(); }, ""));
            if (!sheetsOnly && q.Length > 1)
            {
                var blocks = AllLinks().Select(x => string.Join(" · ", x.K.SystemField.Split(" · ").Take(2))).Where(b => b.Length > 0)
                    .GroupBy(b => b).Select(g => (g.Key, N: g.Count(), s: Palette.Score("блок фильтр " + g.Key, q))).Where(x => x.s >= 0).OrderBy(x => x.s).Take(8);
                foreach (var (b, n, _) in blocks)
                    o.Add(new PaletteItem("Фильтр по блоку системы", b, $"ярко — только его связи ({n})", "", () => SetFilter(b), "\uE71C"));
                if (View.Filter != null && Palette.Score("блок фильтр все снять", q) >= 0)
                    o.Add(new PaletteItem("Фильтр по блоку системы", "Все блоки — снять фильтр", "", "", () => SetFilter(null), "\uE71C"));
                var links = AllLinks().Select(x => (x, s: Palette.Score($"{x.K.DocField} {x.K.SystemField}", q))).Where(y => y.s >= 0).OrderBy(y => y.s).Take(20);
                foreach (var ((ch, sh, k), _) in links)
                    o.Add(new PaletteItem("Связи", $"{k.N}. {k.DocField} → {k.SystemField}", $"{ch.Title} · {sh.Title}", "",
                        () => { JumpTo(ch, sh, k); FocusCanvas(); }, ""));
            }
        }
        return o;
    }

    static string? GlyphOf(Cmd c) => c.Id switch
    {
        "project.save" => "", "project.open" => "", "project.new" => "",
        "tool.select" => "", "tool.hand" => "", "tool.link" => "", "tool.note" => "", "tool.lens" => "",
        "edit.undo" => "", "edit.redo" => "", "edit.dup" => "", "edit.delete" => "", "edit.paste" => "",
        "layer.crop" => "", "view.fit" => "", "view.in" => "", "view.out" => "", "go.search" => "",
        "sheet.pdf" => "", "sheet.image" => "", "help.keys" => "", "check.next" or "project.checks" => "",
        _ when c.Id.StartsWith("project.export") => "",
        _ => null,
    };

    // --- меню ---------------------------------------------------------------

    // Пункт меню из команды: название и клавиша — из реестра; недоступная
    // команда в меню не показывается, если скрыть — понятнее, чем серая.
    MenuItem? Mc(string id, string? header = null, Action? before = null)
    {
        var c = _cmds[id];
        if (!c.When()) return null;
        var i = new MenuItem { Header = header ?? c.Title, InputGestureText = c.KeyLabel };
        if (GlyphOf(c) is { } g) i.Icon = Kit.Icon(g, 14, "Muted");
        i.Click += (_, _) => { before?.Invoke(); _cmds.Execute(id); };
        return i;
    }

    static MenuItem Mi(string header, Action act, string? keys = null, bool enabled = true)
    {
        var i = new MenuItem { Header = header, InputGestureText = keys ?? "", IsEnabled = enabled };
        i.Click += (_, _) => act();
        return i;
    }

    static MenuItem Sub(string header, IEnumerable<object?> items)
    {
        var m = new MenuItem { Header = header };
        foreach (var it in items) if (it != null) m.Items.Add(it);
        return m;
    }

    static MenuItem Check(string header, bool on, Action act, string? keys = null)
    {
        var i = new MenuItem { Header = header, IsCheckable = true, IsChecked = on, InputGestureText = keys ?? "" };
        i.Click += (_, _) => act();
        return i;
    }

    static void AddAll(ItemsControl m, params object?[] items)
    {
        foreach (var it in items)
        {
            if (it == null) continue;
            // Разделитель не ставится первым и два подряд.
            if (it is Separator && (m.Items.Count == 0 || m.Items[^1] is Separator)) continue;
            m.Items.Add(it);
        }
        while (m.Items.Count > 0 && m.Items[^1] is Separator) m.Items.RemoveAt(m.Items.Count - 1);
    }

    // Последнее открытое меню — для сценариев проверки (снимок меню).
    public ContextMenu? LastMenu { get; private set; }

    void OpenMenu(ContextMenu m, UIElement? target = null)
    {
        if (target != null) { m.PlacementTarget = target; m.Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom; }
        else m.Placement = System.Windows.Controls.Primitives.PlacementMode.MousePoint;
        m.IsOpen = true;
        LastMenu = m;
    }

    void ShowContext(SheetView.Target t)
    {
        if (_sheet == null && t.Kind != "empty") return;
        var m = new ContextMenu();
        switch (t.Kind)
        {
            case "link":
            case "row":
            {
                var k = t.Link!;
                var sel = () => View.SelectLink(k.Id);
                AddAll(m,
                    new MenuItem { Header = $"Связь {k.N}", IsEnabled = false, FontWeight = FontWeights.SemiBold },
                    Mc("link.edit", "Описать…", sel),
                    t.Kind == "link" ? new Separator() : null,
                    t.Kind == "link" ? Mi("Излом здесь", () => View.AddBendAt(t.Screen)) : null,
                    t.Kind == "link" ? Mc("link.straighten") : null,
                    t.Kind == "link" ? Mc("link.reroute") : null,
                    t.Kind == "link" ? Sub("Выход стрелки", Sides.Select(x => (object)Check(x.Label, k.SrcSide == x.Key, () => SetSides(k, x.Key, k.TgtSide)))) : null,
                    t.Kind == "link" ? Sub("Вход стрелки", Sides.Select(x => (object)Check(x.Label, k.TgtSide == x.Key, () => SetSides(k, k.SrcSide, x.Key)))) : null,
                    new Separator(),
                    Mc("link.pin", _pinned.ContainsKey(k.Id) ? "Открепить подсказку" : null, sel),
                    t.Kind == "link" ? Mc("link.toRow") : null,
                    Mc("edit.dup", "Копия связи ниже", sel),
                    Mc("edit.delete", "Удалить связь", sel));
                if (t.Kind == "row" && t.Layer != null)
                {
                    var l = t.Layer;
                    var idx = SheetGeo.Ordered(_sheet!).FindIndex(x => x.Id == k.Id);
                    AddAll(m, new Separator(),
                        Mi("Разделить таблицу с этой строки", () =>
                        {
                            Layer? part = null;
                            Edit("Разделить таблицу", () => part = LayerOps.SplitTable(_sheet!, l, idx));
                            if (part == null) Status("С этой строки делить нечего — она первая в таблице");
                        }),
                        Mi("Слить со следующей частью", () => Edit("Слить таблицу", () => LayerOps.MergeTable(_sheet!, l))));
                }
                break;
            }
            case "note":
                AddAll(m,
                    Mi("Изменить текст", () => { View.SelectNote(t.Note!.Id); FocusInspectorField("note"); }, "F2"),
                    Mi("Удалить заметку", () => { View.SelectNote(t.Note!.Id); DeleteNote(); }, "Delete"));
                break;
            case "layer":
            case "table":
            {
                var l = t.Layer!;
                var sel = () => { if (!View.Selection.Contains(l.Id)) View.Select(new[] { l.Id }); };
                AddAll(m, new MenuItem { Header = l.Name.Length > 0 ? l.Name : "Слой", IsEnabled = false, FontWeight = FontWeights.SemiBold });
                if (l.Locked)
                    AddAll(m, Mi("Открепить", () => Edit("Открепить слой", () => l.Locked = false), "Ctrl+Shift+L"),
                        Mi("Скрыть", () => Edit("Скрыть слой", () => l.Hidden = true), "Ctrl+Shift+H"));
                else
                    AddAll(m,
                        t.Kind == "layer" ? Mc("tool.link", "Новая связь от этой картинки") : null,
                        t.Kind == "layer" ? Mc("layer.crop", null, sel) : null,
                        t.Kind == "layer" ? Mc("layer.cropReset", null, sel) : null,
                        t.Kind == "layer" ? Mc("layer.replace", null, sel) : null,
                        t.Kind == "table" ? Mc("sheet.below") : null,
                        t.Kind == "table" ? Mc("sheet.right") : null,
                        t.Kind == "table" ? Mc("layer.split", null, sel) : null,
                        t.Kind == "table" ? Mc("layer.merge", null, sel) : null,
                        Mi("Название и подпись", () => { sel(); FocusInspectorField("name"); }, "F2"),
                        new Separator(),
                        Sub("Порядок", new object?[] { Mc("layer.top"), Mc("layer.up"), Mc("layer.down"), Mc("layer.bottom") }),
                        Mc("layer.lock", "Закрепить", sel),
                        Mc("layer.hide", "Скрыть", sel),
                        new Separator(),
                        Mc("edit.dup", null, sel),
                        Mc("edit.delete", "Удалить", sel));
                break;
            }
            default:
                if (_store == null) { AddAll(m, Mc("project.open"), Mc("project.new")); break; }
                AddAll(m,
                    Mc("edit.paste"), Mc("sheet.image"), Mc("sheet.pdf"),
                    new Separator(),
                    Mc("tool.link"), Mi("Заметка здесь", () => AddNoteAt(t.World), "N"),
                    new Separator(),
                    Mc("view.fit"), Mc("tool.lens", View.Lens ? "Выключить лупу" : null));
                break;
        }
        if (m.Items.Count > 0) OpenMenu(m);
    }

    // --- поиск по связям и фильтр по блоку --------------------------------

    static readonly (string Key, string Label)[] Sides =
        { ("", "любая"), ("left", "слева"), ("right", "справа"), ("top", "сверху"), ("bottom", "снизу") };

    public void SetSides(Link k, string src, string tgt)
    {
        if (_sheet == null || (src == k.SrcSide && tgt == k.TgtSide)) return;
        Edit("Сторона стрелки", () =>
        {
            k.SrcSide = src;
            k.TgtSide = tgt;
            SheetGeo.Reroute(_sheet, new[] { k.Id });
        });
    }

    // Все связи проекта с местом: глава, разворот.
    IEnumerable<(Chapter Ch, Sheet Sh, Link K)> AllLinks() =>
        _store == null ? Enumerable.Empty<(Chapter, Sheet, Link)>()
            : _store.Project.Chapters.SelectMany(c => c.Sheets.SelectMany(s => s.Links.OrderBy(k => k.N).Select(k => (c, s, k))));

    public void JumpTo(Chapter ch, Sheet sh, Link k)
    {
        if (sh != _sheet) PickSheet(ch, sh);
        View.SelectLink(k.Id);
        if (View.LinkBounds(k) is { } r) View.EnsureVisible(r);
        if (View.LinkBadgeScreen(k) is { } p) ShowPop(k, p);
    }

    int _searchAt = -1;

    void FocusSearch()
    {
        SearchBox.Focus();
        SearchBox.SelectAll();
    }

    // Поиск по графе и полю системы через весь проект; Enter — следующая,
    // Shift+Enter — предыдущая (Rossum).
    public void SearchNext(int step = 1)
    {
        var q = SearchBox.Text.Trim();
        if (q.Length == 0) { SearchCount.Text = ""; return; }
        var hits = SearchHits(q);
        if (hits.Count == 0) { SearchCount.Text = "0"; Status($"«{q}» — не найдено"); return; }
        _searchAt = ((_searchAt < 0 && step < 0 ? 0 : _searchAt) + step + hits.Count) % hits.Count;
        var (ch, sh, k) = hits[_searchAt];
        JumpTo(ch, sh, k);
        SearchCount.Text = $"{_searchAt + 1} из {hits.Count}";
        Status($"«{q}»: {ch.Title} · {sh.Title}, связь {k.N}. Enter — следующая, Shift+Enter — предыдущая, Esc — к полотну");
    }

    List<(Chapter, Sheet, Link)> SearchHits(string q) =>
        AllLinks().Where(x => x.K.DocField.Contains(q, StringComparison.OrdinalIgnoreCase)
                              || x.K.SystemField.Contains(q, StringComparison.OrdinalIgnoreCase)).ToList();

    // Блоки системы — первые две части поля «Литера · Площади и этажность ·
    // …»: по ним фильтр.
    void BuildFilter()
    {
        var cur = (FilterBox.SelectedItem as ComboBoxItem)?.Tag as string;
        FilterBox.Items.Clear();
        FilterBox.Items.Add(new ComboBoxItem { Content = "Все блоки системы", Tag = null });
        var blocks = AllLinks().Select(x => string.Join(" · ", x.K.SystemField.Split(" · ").Take(2)))
            .Where(b => b.Length > 0).GroupBy(b => b).OrderBy(g => g.Key).ToList();
        foreach (var b in blocks) FilterBox.Items.Add(new ComboBoxItem { Content = $"{b.Key} · {b.Count()}", Tag = b.Key });
        FilterBox.SelectedItem = FilterBox.Items.Cast<ComboBoxItem>().FirstOrDefault(i => (string?)i.Tag == cur) ?? FilterBox.Items[0];
        FilterBox.IsEnabled = _store != null;
    }

    void SetFilter(string? f)
    {
        FilterBox.SelectedItem = FilterBox.Items.Cast<ComboBoxItem>().FirstOrDefault(i => (string?)i.Tag == f) ?? FilterBox.Items[0];
        View.SetFilter(f);
        Status(f == null ? "Фильтр снят — видны все связи" : $"Ярко — только связи блока «{f}»");
    }

    // --- проверка ---------------------------------------------------------

    int _issueAt = -1;

    void ShowChecks()
    {
        if (_store == null) return;
        new ChecksWindow(this, _issues).Show();
    }

    // F8 / Shift+F8 — к следующему замечанию проверки, не открывая окна
    // (VS Code: следующая ошибка).
    void StepIssue(int step)
    {
        if (_issues.Count == 0) { Status("Замечаний нет — разметка чистая"); _issueAt = -1; return; }
        var ordered = _issues.OrderByDescending(i => i.Error).ToList();
        _issueAt = ((_issueAt < 0 && step < 0 ? 0 : _issueAt) + step + ordered.Count) % ordered.Count;
        var i = ordered[_issueAt];
        GoToIssue(i);
        Status($"{(i.Error ? "Ошибка" : "Проверить")} {_issueAt + 1} из {ordered.Count}: {i.Text}. F8 — следующее");
    }

    public void GoToIssue(Issue i)
    {
        Activate();
        if (i.Link != null) { JumpTo(i.Chapter, i.Sheet, i.Link); return; }
        PickSheet(i.Chapter, i.Sheet);
        if (i.Layer != null) { View.Select(new[] { i.Layer.Id }); View.EnsureVisible(new Rect(i.Layer.X, i.Layer.Y, i.Layer.W, i.Layer.H)); }
    }
}
