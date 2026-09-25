using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Microsoft.Win32;
using Razmetka.Editor;
using Razmetka.Model;

namespace Razmetka;

public partial class MainWindow : Window
{
    ProjectStore? _store;
    Chapter? _chapter;
    Sheet? _sheet;
    readonly UndoStack _undo = new();
    bool _dirty;
    bool _syncing;
    readonly DispatcherTimer _draftTimer = new() { Interval = TimeSpan.FromSeconds(5) };

    public ProjectStore? Store => _store;
    public SheetView Canvas => View;

    public MainWindow()
    {
        InitializeComponent();
        View.EditStarting += () => { if (_store != null) _undo.Begin(_store.Project); };
        View.EditCommitted += Committed;
        View.SelectionChanged += SyncSelection;
        View.ViewChanged += () => { ZoomText.Text = $"{Math.Round(View.Zoom * 100)} %"; PlacePops(); };
        View.LinkClicked += (k, p) => ShowPop(k, p);

        BtnNew.Click += (_, _) => NewProject();
        BtnOpen.Click += (_, _) => OpenProject();
        BtnSave.Click += (_, _) => Save();
        BtnAddImage.Click += (_, _) => AddImagesFromDialog();
        BtnUndo.Click += (_, _) => Undo();
        BtnRedo.Click += (_, _) => Redo();
        BtnZoomIn.Click += (_, _) => View.SetZoom(View.Zoom * 1.25);
        BtnZoomOut.Click += (_, _) => View.SetZoom(View.Zoom / 1.25);
        BtnFit.Click += (_, _) => View.FitAll();
        BtnAddChapter.Click += (_, _) => AddChapter();
        BtnAddSheet.Click += (_, _) => AddSheet();
        BtnDelSheet.Click += (_, _) => DeleteTreeItem();
        BtnCrop.Click += (_, _) => { var l = View.SelectedLayers().FirstOrDefault(); if (l != null) View.StartCrop(l.Id); SyncSelection(); };
        BtnCropDone.Click += (_, _) => { View.EndCrop(); SyncSelection(); };
        BtnCropReset.Click += (_, _) => Edit("Сброс обрезки", () => { foreach (var l in View.SelectedLayers()) LayerOps.ResetCrop(l, _store!); });
        BtnReplace.Click += (_, _) => ReplaceImage();
        BtnNewLink.Click += (_, _) => View.SetLinkTool(!View.LinkTool);
        BtnLinkCancel.Click += (_, _) => { if (View.AlignStep >= 0) View.CancelAlign(); else View.SetLinkTool(false); };
        View.ToolChanged += SyncTool;
        View.AlignDone += (g, olds, news) =>
        {
            var l = View.Find(g.LayerId);
            if (l == null || _sheet == null) return;
            var f = SheetView.Similarity(olds, news);
            Edit("Подгонка по точкам", () =>
            {
                foreach (var fr in _sheet.Frames.Where(x => x.LayerId == l.Id)) fr.Box = SheetView.MapBox(fr.Box, f);
                // Видимая часть — та же область документа, но в пределах новой
                // картинки: за её краем пусто, место на полотне сдвигается.
                var raw = SheetView.MapBox(g.Crop, f);
                var info = _store!.Project.Assets[l.Asset!];
                double x0 = Math.Max(0, raw.X), y0 = Math.Max(0, raw.Y);
                double x1 = Math.Min(info.W, raw.Right), y1 = Math.Min(info.H, raw.Bottom);
                var k = g.W / raw.W;
                l.Crop = new Box(x0, y0, x1 - x0, y1 - y0);
                l.X = g.X + (x0 - raw.X) * k;
                l.Y = g.Y + (y0 - raw.Y) * k;
                l.W = (x1 - x0) * k;
            });
            Status("Рамки и обрезка подогнаны к новой картинке");
        };
        View.LinkDrawn += (a, b) => CreateLink(a, b);
        foreach (var (key, label) in LinkKind.All) LinkKindBox.Items.Add(new ComboBoxItem { Content = label, Tag = key });
        LinkKindBox.SelectionChanged += (_, _) => LinkPropsCommit();
        foreach (var tb in new[] { LinkN, LinkDoc, LinkSys, LinkUrl })
        {
            tb.LostFocus += (_, _) => LinkPropsCommit();
            tb.KeyDown += (_, e) => { if (e.Key == Key.Enter) LinkPropsCommit(); };
        }
        BtnReroute.Click += (_, _) => { if (View.SelectedLink is { } k) Edit("Переложить стрелку", () => SheetGeo.Reroute(_sheet!, new[] { k.Id })); };
        BtnLinkDup.Click += (_, _) => DuplicateLink();
        BtnLens.Click += (_, _) => ToggleLens();
        BtnNote.Click += (_, _) => View.SetNoteTool(!View.NoteTool);
        View.NotePlaced += p =>
        {
            Note? n = null;
            Edit("Новая заметка", () => { n = new Note { X = p.X, Y = p.Y, Author = Environment.UserName }; _sheet!.Notes.Add(n); });
            if (n != null) { View.SelectNote(n.Id); NoteText.Focus(); }
        };
        NoteText.LostFocus += (_, _) => NoteCommit();
        BtnNoteDel.Click += (_, _) => DeleteNote();
        BtnTableSplit.Click += (_, _) => SplitTable();
        BtnTableMerge.Click += (_, _) =>
        {
            if (View.SelectedLayers().FirstOrDefault(l => l.Kind == LayerKind.Table) is { } t)
                Edit("Слить таблицу", () => { if (!LayerOps.MergeTable(_sheet!, t)) Status("Следующей части таблицы нет"); });
        };
        BtnLayoutBelow.Click += (_, _) => { if (_sheet != null) { Edit("Таблица снизу", () => LayerOps.Layout(_sheet, "below")); View.FitAll(); } };
        BtnLayoutRight.Click += (_, _) => { if (_sheet != null) { Edit("Таблица справа", () => LayerOps.Layout(_sheet, "right")); View.FitAll(); } };
        View.StraightenRequested += k => Edit("Выпрямить стрелку", () => { k.Points.Clear(); SheetGeo.Reroute(_sheet!, new[] { k.Id }); });
        foreach (var box in new[] { LinkSrcSide, LinkTgtSide })
        {
            foreach (var (key, label) in Sides) box.Items.Add(new ComboBoxItem { Content = label, Tag = key });
            box.SelectionChanged += (_, _) => SidesCommit();
        }
        SearchBox.KeyDown += (_, e) => { if (e.Key == Key.Enter) { SearchNext(); e.Handled = true; } };
        SearchBox.TextChanged += (_, _) => _searchAt = -1;
        FilterBox.SelectionChanged += (_, _) => { if (!_syncing) View.SetFilter((FilterBox.SelectedItem as ComboBoxItem)?.Tag as string); };
        BtnLinkDel.Click += (_, _) => DeleteLink();
        BtnDup.Click += (_, _) => Duplicate();
        BtnDelete.Click += (_, _) => DeleteSelected();
        BtnTop.Click += (_, _) => Reorder(int.MaxValue);
        BtnUp.Click += (_, _) => Reorder(1);
        BtnDown.Click += (_, _) => Reorder(-1);
        BtnBottom.Click += (_, _) => Reorder(int.MinValue);

        Tree.SelectedItemChanged += (_, _) => TreePicked();
        TreeTitle.LostFocus += (_, _) => TreeFieldsCommit();
        TreeSub.LostFocus += (_, _) => TreeFieldsCommit();
        TreeTitle.KeyDown += (_, e) => { if (e.Key == Key.Enter) TreeFieldsCommit(); };
        TreeSub.KeyDown += (_, e) => { if (e.Key == Key.Enter) TreeFieldsCommit(); };
        Layers.SelectionChanged += (_, _) => LayersPicked();
        PropName.LostFocus += (_, _) => PropsCommit();
        PropCaption.LostFocus += (_, _) => PropsCommit();
        PropName.KeyDown += (_, e) => { if (e.Key == Key.Enter) PropsCommit(); };
        PropCaption.KeyDown += (_, e) => { if (e.Key == Key.Enter) PropsCommit(); };

        Drop += OnDrop;
        PreviewKeyDown += OnKey;
        Closing += OnClosing;
        _draftTimer.Tick += (_, _) => { if (_dirty && _store != null) _store.SaveDraft(); };
        _draftTimer.Start();
        UpdateAll();
    }

    // --- проект ------------------------------------------------------------

    void NewProject()
    {
        if (!ConfirmDiscard()) return;
        var dlg = new OpenFolderDialog { Title = "Пустая папка для нового проекта" };
        if (dlg.ShowDialog(this) != true) return;
        if (File.Exists(Path.Combine(dlg.FolderName, ProjectStore.FileName)))
        {
            MessageBox.Show(this, "В этой папке уже есть проект — откройте его кнопкой «Открыть».", "Разметка");
            return;
        }
        LoadStore(ProjectStore.Create(dlg.FolderName, Path.GetFileName(dlg.FolderName)));
    }

    void OpenProject()
    {
        if (!ConfirmDiscard()) return;
        var dlg = new OpenFolderDialog { Title = "Папка проекта (где лежит razmetka.json)" };
        if (dlg.ShowDialog(this) != true) return;
        OpenDir(dlg.FolderName);
    }

    public void OpenDir(string dir, bool askDraft = true)
    {
        if (!File.Exists(Path.Combine(dir, ProjectStore.FileName)))
        {
            MessageBox.Show(this, "В папке нет файла razmetka.json.", "Разметка");
            return;
        }
        var store = ProjectStore.Open(dir);
        LoadStore(store);
        var draft = askDraft ? store.PendingDraft() : null;
        if (draft != null && MessageBox.Show(this, "Есть несохранённые правки с прошлого раза. Восстановить их?",
                "Разметка", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes)
        {
            store.Replace(draft);
            _dirty = true;
            LoadStore(store, keepDirty: true);
        }
    }

    void LoadStore(ProjectStore store, bool keepDirty = false)
    {
        _store = store;
        View.Store = store;
        _undo.Clear();
        _dirty = keepDirty;
        _chapter = store.Project.Chapters.FirstOrDefault();
        _sheet = _chapter?.Sheets.FirstOrDefault();
        ClearPops();
        View.Doc = new DocInfo(_chapter?.Title ?? "", _chapter?.DocName ?? "");
        View.SetSheet(_sheet);
        UpdateAll();
    }

    public void Save()
    {
        if (_store == null) return;
        View.EndCrop();
        _store.Project.History.Add(new HistoryEntry { Author = Environment.UserName, What = "Сохранение" });
        if (_store.Project.History.Count > 500) _store.Project.History.RemoveRange(0, _store.Project.History.Count - 500);
        _store.PruneAssets();
        _store.Save();
        _dirty = false;
        UpdateAll();
        Status("Сохранено");
    }

    bool ConfirmDiscard()
    {
        if (!_dirty || _store == null) return true;
        var r = MessageBox.Show(this, "Сохранить изменения в проекте?", "Разметка", MessageBoxButton.YesNoCancel, MessageBoxImage.Question);
        if (r == MessageBoxResult.Cancel) return false;
        if (r == MessageBoxResult.Yes) Save();
        else _store.DeleteDraft();
        return true;
    }

    void OnClosing(object? s, System.ComponentModel.CancelEventArgs e)
    {
        if (App.Scripted) return;
        if (!ConfirmDiscard()) e.Cancel = true;
    }

    // --- правки и отмена --------------------------------------------------

    // Любая правка вне жеста мыши идёт через Edit: снимок до, действие,
    // запись отмены, перерисовка.
    public void Edit(string what, Action act)
    {
        if (_store == null) return;
        _undo.Begin(_store.Project);
        act();
        Committed(what);
    }

    void Committed(string what)
    {
        if (_store == null) return;
        // Стрелки, у которых концы оторвались от рамок (слой перенесли,
        // обрезали, растянули), перекладываются в том же шаге отмены.
        if (_sheet != null) SheetGeo.Reroute(_sheet);
        if (_chapter != null) LinkOps.RenumberChapter(_chapter);
        if (_undo.Commit(_store.Project, what))
        {
            _dirty = true;
            _store.Project.History.Add(new HistoryEntry
            {
                Author = Environment.UserName, What = what, Sheet = _sheet?.Id ?? "",
                Target = View.LinkId ?? View.NoteId ?? string.Join(",", View.Selection),
            });
            if (_store.Project.History.Count > 5000) _store.Project.History.RemoveRange(0, _store.Project.History.Count - 5000);
        }
        View.Refresh();
        UpdateAll();
    }

    public void Undo()
    {
        if (_store == null) return;
        var p = _undo.Undo(_store.Project);
        if (p != null) ApplySnapshot(p);
    }

    public void Redo()
    {
        if (_store == null) return;
        var p = _undo.Redo(_store.Project);
        if (p != null) ApplySnapshot(p);
    }

    void ApplySnapshot(Project p)
    {
        var chId = _chapter?.Id;
        var shId = _sheet?.Id;
        var sel = View.Selection.ToList();
        _store!.Replace(p);
        _chapter = p.Chapters.FirstOrDefault(c => c.Id == chId) ?? p.Chapters.FirstOrDefault();
        _sheet = _chapter?.Sheets.FirstOrDefault(s => s.Id == shId) ?? _chapter?.Sheets.FirstOrDefault();
        var zoom = View.Zoom;
        var off = View.Offset;
        View.SetSheet(_sheet);
        View.SetView(zoom, off);
        View.Select(sel.Where(id => View.Find(id) != null));
        _dirty = true;
        UpdateAll();
    }

    // --- картинки ----------------------------------------------------------

    void AddImagesFromDialog()
    {
        if (_sheet == null) return;
        var dlg = new OpenFileDialog
        {
            Title = "Фото или скан",
            Filter = "Картинки|*.png;*.jpg;*.jpeg;*.bmp;*.tif;*.tiff;*.gif|Все файлы|*.*",
            Multiselect = true,
        };
        if (dlg.ShowDialog(this) != true) return;
        AddImageFiles(dlg.FileNames);
    }

    public void AddImageFiles(IEnumerable<string> files)
    {
        if (_sheet == null || _store == null) return;
        var added = new List<string>();
        Edit("Новое фото", () =>
        {
            foreach (var f in files)
            {
                try { added.Add(LayerOps.AddImage(_sheet, _store, _store.ImportFile(f), Path.GetFileName(f)).Id); }
                catch (Exception ex) { MessageBox.Show(this, $"Не удалось открыть «{Path.GetFileName(f)}»: {ex.Message}", "Разметка"); }
            }
        });
        View.Select(added);
        if (added.Count > 0) View.FitAll();
    }

    void PasteImage()
    {
        if (_sheet == null || _store == null) return;
        if (Clipboard.ContainsFileDropList())
        {
            AddImageFiles(Clipboard.GetFileDropList().Cast<string>());
            return;
        }
        if (!Clipboard.ContainsImage()) { Status("В буфере обмена нет картинки"); return; }
        var img = Clipboard.GetImage();
        if (img == null) return;
        string? id = null;
        Edit("Вставка фото", () => id = LayerOps.AddImage(_sheet, _store, _store.Import(img, "Вставка", true), "Вставка").Id);
        if (id != null) View.Select(new[] { id });
    }

    void ReplaceImage()
    {
        var l = View.SelectedLayers().FirstOrDefault(x => x.Kind == LayerKind.Image);
        if (l == null || _store == null) return;
        var dlg = new OpenFileDialog { Title = "Новая картинка для слоя", Filter = "Картинки|*.png;*.jpg;*.jpeg;*.bmp;*.tif;*.tiff;*.gif" };
        if (dlg.ShowDialog(this) != true) return;
        ReplaceWith(l, dlg.FileName);
    }

    // Замена и сразу подгонка по двум точкам: у слоя есть рамки — без
    // подгонки они встанут на новую картинку только примерно.
    public void ReplaceWith(Layer l, string file)
    {
        if (_store == null || l.Asset == null) return;
        var ghost = new SheetView.AlignGhost(l.Id, l.Asset, l.Crop, l.X, l.Y, l.W);
        Edit("Замена фото", () => LayerOps.Replace(l, _store, _store.ImportFile(file)));
        if (_sheet != null && _sheet.Frames.Any(f => f.LayerId == l.Id)) View.StartAlign(ghost);
    }

    void OnDrop(object sender, DragEventArgs e)
    {
        if (e.Data.GetData(DataFormats.FileDrop) is string[] files) AddImageFiles(files);
    }

    // --- слои --------------------------------------------------------------

    void Duplicate()
    {
        if (_sheet == null) return;
        var ids = new List<string>();
        Edit("Копия", () => { foreach (var l in View.SelectedLayers().ToList()) ids.Add(LayerOps.Duplicate(_sheet, l).Id); });
        View.Select(ids);
    }

    void DeleteSelected()
    {
        if (_sheet == null || View.Selection.Count == 0) return;
        var ids = View.Selection.ToList();
        View.EndCrop();
        Edit("Удаление", () => LayerOps.Delete(_sheet, ids));
        View.ClearSelection();
    }

    void Reorder(int step)
    {
        if (_sheet == null || View.Selection.Count == 0) return;
        Edit("Порядок слоёв", () => LayerOps.Reorder(_sheet, View.Selection, step));
    }

    void PropsCommit()
    {
        if (_syncing || _propsLayerId == null) return;
        var l = View.Find(_propsLayerId);
        if (l == null) return;
        if (l.Name == PropName.Text && l.Caption == PropCaption.Text) return;
        Edit("Название слоя", () => { l.Name = PropName.Text; l.Caption = PropCaption.Text; });
    }

    // --- клавиши -----------------------------------------------------------

    void OnKey(object sender, KeyEventArgs e) => e.Handled = HandleKey(e.Key, Keyboard.Modifiers, Keyboard.FocusedElement is TextBox);

    // Клавиши вынесены в HandleKey: их вызывают и сценарии проверки.
    public bool HandleKey(Key key, ModifierKeys mods, bool inText = false)
    {
        var ctrl = mods.HasFlag(ModifierKeys.Control);
        var shift = mods.HasFlag(ModifierKeys.Shift);
        if (ctrl && key == Key.S) { Save(); return true; }
        if (ctrl && key == Key.F) { SearchBox.Focus(); SearchBox.SelectAll(); return true; }
        if (ctrl && key == Key.O) { OpenProject(); return true; }
        if (inText) return false;
        if (ctrl && key == Key.Z && !shift) { Undo(); return true; }
        if (ctrl && (key == Key.Y || (key == Key.Z && shift))) { Redo(); return true; }
        if (ctrl && key == Key.V) { PasteImage(); return true; }
        if (ctrl && key == Key.D && View.LinkId == null) { Duplicate(); return true; }
        if (ctrl && key == Key.D0) { View.FitAll(); return true; }
        if (ctrl && (key == Key.OemPlus || key == Key.Add)) { View.SetZoom(View.Zoom * 1.25); return true; }
        if (ctrl && (key == Key.OemMinus || key == Key.Subtract)) { View.SetZoom(View.Zoom / 1.25); return true; }
        if (ctrl && key == Key.OemCloseBrackets) { Reorder(shift ? int.MaxValue : 1); return true; }
        if (ctrl && key == Key.OemOpenBrackets) { Reorder(shift ? int.MinValue : -1); return true; }
        if (ctrl && key == Key.A && _sheet != null) { View.Select(_sheet.Layers.Where(l => !l.Hidden && !l.Locked).Select(l => l.Id)); return true; }
        if (key is Key.Enter or Key.Escape && View.CropLayerId != null) { View.EndCrop(); SyncSelection(); return true; }
        if (key == Key.Escape && View.AlignStep >= 0) { View.CancelAlign(); return true; }
        if (key == Key.Escape && View.LinkTool) { View.SetLinkTool(false); return true; }
        if (key == Key.L && mods == ModifierKeys.None) { View.SetLinkTool(!View.LinkTool); return true; }
        if (key == Key.M && mods == ModifierKeys.None) { ToggleLens(); return true; }
        if (key == Key.N && mods == ModifierKeys.None) { View.SetNoteTool(!View.NoteTool); return true; }
        if (key is Key.Delete or Key.Back && View.NoteId != null) { DeleteNote(); return true; }
        if (key == Key.Escape && View.LinkId != null) { View.SelectLink(null); ClearPops(); return true; }
        if (key == Key.Escape) { View.ClearSelection(); return true; }
        if (key is Key.Delete or Key.Back && View.LinkId != null) { DeleteLink(); return true; }
        if (ctrl && key == Key.D && View.LinkId != null) { DuplicateLink(); return true; }
        if (key is Key.Delete or Key.Back) { DeleteSelected(); return true; }
        if (key is Key.Left or Key.Right or Key.Up or Key.Down && View.Selection.Count > 0 && _sheet != null)
        {
            // Сдвиг клавишами: на 1 единицу полотна, с Shift — на 10.
            var st = shift ? 10 : 1;
            var (dx, dy) = key switch { Key.Left => (-st, 0), Key.Right => (st, 0), Key.Up => (0, -st), _ => (0, st) };
            Edit("Сдвиг", () => LayerOps.Nudge(_sheet, View.Selection, dx, dy));
            return true;
        }
        return false;
    }

    // --- главы и развороты ---------------------------------------------

    void AddChapter()
    {
        if (_store == null) return;
        Chapter? ch = null;
        Edit("Новая глава", () =>
        {
            ch = new Chapter { Title = $"Глава {_store.Project.Chapters.Count + 1}", Sheets = { new Sheet { Title = "Разворот 1" } } };
            _store.Project.Chapters.Add(ch);
        });
        PickSheet(ch, ch?.Sheets[0]);
    }

    void AddSheet()
    {
        if (_store == null) return;
        var ch = _chapter ?? _store.Project.Chapters.FirstOrDefault();
        if (ch == null) { AddChapter(); return; }
        Sheet? sh = null;
        Edit("Новый разворот", () => { sh = new Sheet { Title = $"Разворот {ch.Sheets.Count + 1}" }; ch.Sheets.Add(sh); });
        PickSheet(ch, sh);
    }

    void DeleteTreeItem()
    {
        if (_store == null) return;
        if (Tree.SelectedItem is TreeViewItem { Tag: Chapter ch })
        {
            if (MessageBox.Show(this, $"Удалить главу «{ch.Title}» со всеми разворотами?", "Разметка",
                    MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
            Edit("Удаление главы", () => _store.Project.Chapters.Remove(ch));
            PickSheet(_store.Project.Chapters.FirstOrDefault(), _store.Project.Chapters.FirstOrDefault()?.Sheets.FirstOrDefault());
        }
        else if (_sheet != null && _chapter != null)
        {
            if (_sheet.Layers.Count > 0 && MessageBox.Show(this, $"Удалить разворот «{_sheet.Title}»?", "Разметка",
                    MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
            var ch2 = _chapter;
            Edit("Удаление разворота", () => ch2.Sheets.Remove(_sheet));
            PickSheet(ch2, ch2.Sheets.FirstOrDefault());
        }
    }

    public void PickSheet(Chapter? ch, Sheet? sh)
    {
        View.EndCrop();
        ClearPops();
        _chapter = ch;
        _sheet = sh;
        View.Doc = new DocInfo(ch?.Title ?? "", ch?.DocName ?? "");
        View.SetSheet(sh);
        UpdateAll();
    }

    void TreePicked()
    {
        if (_syncing || Tree.SelectedItem is not TreeViewItem item) return;
        if (item.Tag is Sheet sh)
        {
            var ch = _store!.Project.Chapters.First(c => c.Sheets.Contains(sh));
            if (sh != _sheet) PickSheet(ch, sh);
        }
        else if (item.Tag is Chapter ch)
        {
            _chapter = ch;
            SyncTreeFields();
        }
    }

    void TreeFieldsCommit()
    {
        if (_syncing || _store == null) return;
        if (Tree.SelectedItem is TreeViewItem { Tag: Chapter ch })
        {
            if (ch.Title == TreeTitle.Text && ch.DocName == TreeSub.Text) return;
            Edit("Название главы", () => { ch.Title = TreeTitle.Text; ch.DocName = TreeSub.Text; });
        }
        else if (_sheet != null)
        {
            if (_sheet.Title == TreeTitle.Text && _sheet.Page == TreeSub.Text) return;
            Edit("Название разворота", () => { _sheet.Title = TreeTitle.Text; _sheet.Page = TreeSub.Text; });
        }
    }

    // --- синхронизация панелей с моделью --------------------------------

    void UpdateAll()
    {
        _syncing = true;
        try
        {
            var open = _store != null;
            EmptyHint.Visibility = open ? Visibility.Collapsed : Visibility.Visible;
            foreach (var b in new Button[] { BtnSave, BtnAddImage, BtnAddChapter, BtnAddSheet, BtnDelSheet }) b.IsEnabled = open;
            BtnAddImage.IsEnabled = _sheet != null;
            BtnUndo.IsEnabled = _undo.CanUndo;
            BtnRedo.IsEnabled = _undo.CanRedo;
            BtnUndo.ToolTip = _undo.CanUndo ? $"Отменить: {_undo.UndoWhat} (Ctrl+Z)" : "Отменить (Ctrl+Z)";
            BtnRedo.ToolTip = _undo.CanRedo ? $"Повторить: {_undo.RedoWhat} (Ctrl+Y)" : "Повторить (Ctrl+Y)";
            Title = open ? $"{(_dirty ? "● " : "")}{_store!.Project.Title} — Разметка документов" : "Разметка документов";
            BuildTree();
            BuildFilter();
            SyncTreeFields();
            BuildLayers();
            SyncProps();
            SizeText.Text = open ? $"Картинки проекта: {_store!.ImagesBytes() / 1024.0 / 1024.0:0.0} МБ" : "";
            ZoomText.Text = $"{Math.Round(View.Zoom * 100)} %";
        }
        finally { _syncing = false; }
    }

    void BuildTree()
    {
        Tree.Items.Clear();
        if (_store == null) return;
        foreach (var ch in _store.Project.Chapters)
        {
            var ci = new TreeViewItem { Header = ch.Title, Tag = ch, IsExpanded = true, FontWeight = FontWeights.SemiBold };
            foreach (var sh in ch.Sheets)
            {
                var si = new TreeViewItem
                {
                    Header = string.IsNullOrWhiteSpace(sh.Page) ? sh.Title : $"{sh.Title} · {sh.Page}",
                    Tag = sh, FontWeight = FontWeights.Normal,
                };
                ci.Items.Add(si);
                if (sh == _sheet) si.IsSelected = true;
            }
            Tree.Items.Add(ci);
        }
    }

    void SyncTreeFields()
    {
        var wasSyncing = _syncing;
        _syncing = true;
        if (Tree.SelectedItem is TreeViewItem { Tag: Chapter ch })
        {
            TreeTitle.Text = ch.Title;
            TreeSubLabel.Text = "Документ в таблице связей";
            TreeSub.Text = ch.DocName;
        }
        else
        {
            TreeTitle.Text = _sheet?.Title ?? "";
            TreeSubLabel.Text = "Страница документа";
            TreeSub.Text = _sheet?.Page ?? "";
        }
        TreeTitle.IsEnabled = TreeSub.IsEnabled = _store != null;
        _syncing = wasSyncing;
    }

    void BuildLayers()
    {
        Layers.Items.Clear();
        if (_sheet == null) return;
        // Сверху вниз, как на полотне: первым в списке — верхний слой.
        for (var i = _sheet.Layers.Count - 1; i >= 0; i--)
        {
            var l = _sheet.Layers[i];
            // Значки Segoe Fluent Icons: E890 — глаз, E72E — замок.
            var eye = new System.Windows.Controls.Primitives.ToggleButton { Content = "", IsChecked = !l.Hidden,
                Style = (Style)FindResource("IconToggle"), ToolTip = l.Hidden ? "Скрыт — показать" : "Виден — скрыть" };
            var lck = new System.Windows.Controls.Primitives.ToggleButton { Content = "", IsChecked = l.Locked,
                Style = (Style)FindResource("IconToggle"), Margin = new Thickness(0, 0, 6, 0),
                ToolTip = l.Locked ? "Закреплён: мышью не выбирается и не двигается — открепить" : "Закрепить" };
            eye.Click += (_, _) => Edit(eye.IsChecked == true ? "Показать слой" : "Скрыть слой", () => l.Hidden = eye.IsChecked != true);
            lck.Click += (_, _) => Edit(lck.IsChecked == true ? "Закрепить слой" : "Открепить слой", () => l.Locked = lck.IsChecked == true);
            var thumb = new Image { Width = 36, Height = 26, Stretch = Stretch.Uniform, Margin = new Thickness(0, 0, 8, 0), Source = Thumb(l) };
            var name = new TextBlock
            {
                Text = l.Name + (l.Locked ? " · закреплён" : "") + (l.Hidden ? " · скрыт" : ""),
                VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis,
                Foreground = l.Hidden ? (Brush)FindResource("Muted") : (Brush)FindResource("Ink"),
            };
            var row = new DockPanel { Margin = new Thickness(2, 3, 2, 3) };
            DockPanel.SetDock(eye, Dock.Left);
            DockPanel.SetDock(lck, Dock.Left);
            DockPanel.SetDock(thumb, Dock.Left);
            row.Children.Add(eye);
            row.Children.Add(lck);
            row.Children.Add(thumb);
            row.Children.Add(name);
            var item = new ListBoxItem { Content = row, Tag = l.Id };
            Layers.Items.Add(item);
            if (View.Selection.Contains(l.Id)) item.IsSelected = true;
        }
    }

    ImageSource? Thumb(Layer l)
    {
        var bmp = _store?.Bitmap(l.Asset);
        if (bmp == null) return null;
        var c = l.Crop;
        var r = new Int32Rect((int)Math.Max(0, c.X), (int)Math.Max(0, c.Y),
            (int)Math.Max(1, Math.Min(c.W, bmp.PixelWidth - c.X)), (int)Math.Max(1, Math.Min(c.H, bmp.PixelHeight - c.Y)));
        try { return new CroppedBitmap(bmp, r); } catch (ArgumentException) { return bmp; }
    }

    void LayersPicked()
    {
        if (_syncing) return;
        var ids = Layers.SelectedItems.Cast<ListBoxItem>().Select(i => (string)i.Tag).ToList();
        _syncing = true;
        View.Select(ids);
        _syncing = false;
        SyncProps();
    }

    void SyncSelection()
    {
        if (_syncing) return;
        _syncing = true;
        try
        {
            foreach (ListBoxItem i in Layers.Items) i.IsSelected = View.Selection.Contains((string)i.Tag);
            SyncProps();
        }
        finally { _syncing = false; }
    }

    void SyncProps()
    {
        var sel = View.SelectedLayers().ToList();
        var one = sel.Count == 1 ? sel[0] : null;
        if (_propsLayerId != null && _propsLayerId != one?.Id) PropsCommit();
        _propsLayerId = one?.Id;
        var was = _syncing;
        _syncing = true;
        PropName.Text = one?.Name ?? "";
        PropCaption.Text = one?.Caption ?? "";
        _syncing = was;
        PropName.IsEnabled = PropCaption.IsEnabled = one != null;
        var img = one != null && one.Kind == LayerKind.Image;
        BtnCrop.IsEnabled = BtnReplace.IsEnabled = img && !one!.Locked;
        TableTools.Visibility = one?.Kind == LayerKind.Table ? Visibility.Visible : Visibility.Collapsed;
        foreach (var b in new[] { BtnDup, BtnDelete, BtnTop, BtnUp, BtnDown, BtnBottom }) b.IsEnabled = sel.Count > 0;
        CropBar.Visibility = View.CropLayerId != null ? Visibility.Visible : Visibility.Collapsed;
        SyncLinkProps();
        SyncNoteProps();
        Status(sel.Count switch
        {
            0 => _sheet == null ? "" : "Щелчок — выбрать слой, перетаскивание по пустому — выбрать несколько, колесо — масштаб",
            1 => $"{one!.Name}: {one.W:0} × {one.H:0}, место {one.X:0}; {one.Y:0}. Стрелки — сдвиг, Shift — на 10",
            _ => $"Выбрано слоёв: {sel.Count}",
        });
    }

    void Status(string s) => StatusText.Text = s;

    // --- навигация: лупа, поиск, фильтр, «то же поле» ------------------------

    static readonly (string Key, string Label)[] Sides =
        { ("", "любая"), ("left", "слева"), ("right", "справа"), ("top", "сверху"), ("bottom", "снизу") };

    public void ToggleLens()
    {
        View.SetLens(!View.Lens);
        BtnLens.Background = View.Lens ? (Brush)FindResource("AccentSoft") : Brushes.Transparent;
        Status(View.Lens ? "Лупа включена — водите курсором; M — выключить" : "");
    }

    void SidesCommit()
    {
        if (_syncing || _sheet == null) return;
        var k = _sheet.Links.FirstOrDefault(x => x.Id == _propsLinkId);
        if (k == null) return;
        var src = (LinkSrcSide.SelectedItem as ComboBoxItem)?.Tag as string ?? "";
        var tgt = (LinkTgtSide.SelectedItem as ComboBoxItem)?.Tag as string ?? "";
        if (src == k.SrcSide && tgt == k.TgtSide) return;
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
        if (View.LinkBounds(k) is { } r) View.ScrollToWorld(r);
        if (View.LinkBadgeScreen(k) is { } p) ShowPop(k, p);
    }

    int _searchAt = -1;

    // Поиск по графе и полю системы через весь проект; Enter — следующая.
    public void SearchNext()
    {
        var q = SearchBox.Text.Trim();
        if (q.Length == 0) return;
        var hits = AllLinks().Where(x => x.K.DocField.Contains(q, StringComparison.OrdinalIgnoreCase)
                                         || x.K.SystemField.Contains(q, StringComparison.OrdinalIgnoreCase)).ToList();
        if (hits.Count == 0) { Status($"«{q}» — не найдено"); return; }
        _searchAt = (_searchAt + 1) % hits.Count;
        var (ch, sh, k) = hits[_searchAt];
        JumpTo(ch, sh, k);
        Status($"«{q}»: {_searchAt + 1} из {hits.Count} — {ch.Title} · {sh.Title}, связь {k.N}. Enter — следующая");
    }

    // Блоки системы — первые две части поля «Литера · Площади и этажность ·
    // …»: по ним фильтр.
    void BuildFilter()
    {
        var cur = (FilterBox.SelectedItem as ComboBoxItem)?.Tag as string;
        FilterBox.Items.Clear();
        FilterBox.Items.Add(new ComboBoxItem { Content = "все блоки", Tag = null });
        var blocks = AllLinks().Select(x => string.Join(" · ", x.K.SystemField.Split(" · ").Take(2)))
            .Where(b => b.Length > 0).Distinct().OrderBy(b => b).ToList();
        foreach (var b in blocks) FilterBox.Items.Add(new ComboBoxItem { Content = b, Tag = b });
        FilterBox.SelectedItem = FilterBox.Items.Cast<ComboBoxItem>().FirstOrDefault(i => (string?)i.Tag == cur) ?? FilterBox.Items[0];
    }

    // «То же поле в других разворотах»: связи с тем же полем системы —
    // переход по щелчку. Так видно, из каких документов поле заполняется.
    void BuildSeeAlso(Link k)
    {
        SeeAlso.Children.Clear();
        var same = AllLinks().Where(x => x.K.Id != k.Id && x.K.SystemField.Length > 0
                                         && string.Equals(x.K.SystemField, k.SystemField, StringComparison.OrdinalIgnoreCase)).ToList();
        SeeAlsoTitle.Visibility = same.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        foreach (var (ch, sh, other) in same)
        {
            var b = new Button
            {
                Style = (Style)FindResource("ToolBtn"), Padding = new Thickness(6, 2, 6, 2),
                Content = $"{ch.DocName} · {sh.Title} · {other.N}", ToolTip = $"{ch.Title} — {sh.Title}: {other.DocField}",
            };
            b.Click += (_, _) => JumpTo(ch, sh, other);
            SeeAlso.Children.Add(b);
        }
    }

    // --- связи ---------------------------------------------------------------

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

    string? _propsNoteId;

    void SyncNoteProps()
    {
        var n = View.SelectedNote;
        if (_propsNoteId != null && _propsNoteId != n?.Id) NoteCommit();
        _propsNoteId = n?.Id;
        NoteProps.Visibility = n != null ? Visibility.Visible : Visibility.Collapsed;
        if (n != null) { Props.Visibility = Visibility.Collapsed; LinkProps.Visibility = Visibility.Collapsed; }
        if (n == null) return;
        var was = _syncing;
        _syncing = true;
        NoteText.Text = n.Text;
        NoteMeta.Text = $"{n.Author}, {n.At:dd.MM.yyyy HH:mm}";
        _syncing = was;
    }

    void NoteCommit()
    {
        if (_syncing || _sheet == null) return;
        var n = _sheet.Notes.FirstOrDefault(x => x.Id == _propsNoteId);
        if (n == null || n.Text == NoteText.Text) return;
        Edit("Текст заметки", () => n.Text = NoteText.Text);
    }

    void DeleteNote()
    {
        if (_sheet == null || View.SelectedNote is not { } n) return;
        Edit("Удаление заметки", () => _sheet.Notes.Remove(n));
        View.SelectNote(null);
    }

    void SyncTool()
    {
        if (View.AlignStep >= 0)
        {
            LinkBar.Visibility = Visibility.Visible;
            BtnLinkCancel.Content = "Пропустить";
            LinkBarText.Text = View.AlignStep switch
            {
                0 => "Подгонка: точка 1 на прежней (бледной) картинке — например, угол таблицы",
                1 => "Та же точка 1 на новой картинке",
                2 => "Точка 2 на прежней картинке — подальше от первой",
                _ => "Та же точка 2 на новой картинке",
            };
            return;
        }
        BtnLinkCancel.Content = "Отмена";
        BtnNote.Background = View.NoteTool ? (Brush)FindResource("AccentSoft") : Brushes.Transparent;
        BtnNewLink.Background = View.LinkTool ? (Brush)FindResource("AccentSoft") : Brushes.Transparent;
        LinkBar.Visibility = View.LinkTool ? Visibility.Visible : Visibility.Collapsed;
        LinkBarText.Text = View.HasPendingFrame
            ? "Теперь обведите поле на снимке системы"
            : "Обведите графу на странице документа. Esc — отмена";
    }

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
        if (k == null) return;
        View.SelectLink(k.Id);
        LinkDoc.Focus();
        Status($"Связь {k.N} создана — впишите графу документа и поле системы");
    }

    void DuplicateLink()
    {
        if (_sheet == null || View.SelectedLink is not { } k) return;
        Link? c = null;
        Edit("Копия связи", () => { c = LinkOps.Duplicate(_sheet, k); SheetGeo.Reroute(_sheet, new[] { c.Id }); });
        if (c != null) View.SelectLink(c.Id);
    }

    void DeleteLink()
    {
        if (_sheet == null || View.SelectedLink is not { } k) return;
        Edit("Удаление связи", () => LinkOps.Delete(_sheet, k));
        View.SelectLink(null);
        ClearPops();
    }

    // Поля панели сохраняются при уходе фокуса — к этому моменту выбранной
    // может быть уже другая связь. Поэтому панель помнит, чью связь она
    // показывает, и пишет только в неё.
    string? _propsLinkId;
    string? _propsLayerId;
    // Последняя выбранная связь — по её строке делится таблица.
    string? _lastLinkId;

    void LinkPropsCommit()
    {
        if (_syncing || _sheet == null) return;
        var k = _sheet.Links.FirstOrDefault(x => x.Id == _propsLinkId);
        if (k == null) return;
        var kind = (LinkKindBox.SelectedItem as ComboBoxItem)?.Tag as string ?? k.Kind;
        var n = int.TryParse(LinkN.Text, out var v) ? v : k.N;
        if (k.DocField == LinkDoc.Text && k.SystemField == LinkSys.Text && k.Url == LinkUrl.Text && k.Kind == kind && k.N == n) return;
        Edit("Поля связи", () =>
        {
            k.DocField = LinkDoc.Text;
            k.SystemField = LinkSys.Text;
            k.Url = LinkUrl.Text;
            k.Kind = kind;
            if (n != k.N) LinkOps.Renumber(_sheet, k, n);
        });
    }

    void SyncLinkProps()
    {
        var k = View.SelectedLink;
        if (k != null) _lastLinkId = k.Id;
        if (_propsLinkId != null && _propsLinkId != k?.Id) LinkPropsCommit();
        _propsLinkId = k?.Id;
        LinkProps.Visibility = k != null ? Visibility.Visible : Visibility.Collapsed;
        Props.Visibility = k != null ? Visibility.Collapsed : Visibility.Visible;
        if (k == null) return;
        var was = _syncing;
        _syncing = true;
        LinkN.Text = k.N.ToString();
        LinkDoc.Text = k.DocField;
        LinkSys.Text = k.SystemField;
        LinkUrl.Text = k.Url;
        LinkDocLabel.Text = _chapter?.DocName is { Length: > 0 } d ? $"Графа документа ({d})" : "Графа документа";
        foreach (ComboBoxItem it in LinkKindBox.Items) if ((string)it.Tag == k.Kind) LinkKindBox.SelectedItem = it;
        foreach (ComboBoxItem it in LinkSrcSide.Items) if ((string)it.Tag == k.SrcSide) LinkSrcSide.SelectedItem = it;
        foreach (ComboBoxItem it in LinkTgtSide.Items) if ((string)it.Tag == k.TgtSide) LinkTgtSide.SelectedItem = it;
        BuildSeeAlso(k);
        var hist = _store!.Project.History.Where(h => h.Target == k.Id).TakeLast(6).Reverse().ToList();
        LinkHistTitle.Visibility = hist.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        LinkHist.Text = string.Join("\n", hist.Select(h => $"{h.At:dd.MM HH:mm} · {h.Author} · {h.What}"));
        _syncing = was;
    }

    // --- подсказки связей ------------------------------------------------
    // Щелчок по стрелке показывает строку таблицы прямо у стрелки — не надо
    // листать к таблице (просьба пользователя 25.09.2026). «Закрепить» —
    // подсказка остаётся у номера связи; закреплённых может быть несколько.

    Border? _pop;
    readonly Dictionary<string, Border> _pinned = new();

    void ClearPops()
    {
        Pops.Children.Clear();
        _pinned.Clear();
        _pop = null;
    }

    public void ShowPop(Link k, Point at)
    {
        if (_sheet == null) return;
        if (_pop != null) Pops.Children.Remove(_pop);
        if (_pinned.ContainsKey(k.Id)) { _pop = null; return; }
        _pop = PopCard(k, pinned: false);
        Pops.Children.Add(_pop);
        _pop.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        Place(_pop, at);
        Status($"Связь {k.N}: {k.DocField} → {k.SystemField}");
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

    Border PopCard(Link k, bool pinned)
    {
        var col = SheetGeo.ColorOf(_sheet!, k);
        var panel = new StackPanel { MaxWidth = 380 };
        var head = new DockPanel { Margin = new Thickness(0, 0, 0, 6) };
        var chip = new Border
        {
            Background = new SolidColorBrush(col), CornerRadius = new CornerRadius(11), Padding = new Thickness(8, 1, 8, 1),
            Child = new TextBlock { Text = k.N.ToString(), Foreground = Brushes.White, FontWeight = FontWeights.Bold },
        };
        var close = new Button { Content = "✕", Style = (Style)FindResource("ToolBtn"), Padding = new Thickness(6, 1, 6, 1), ToolTip = "Закрыть" };
        var pin = new Button
        {
            Content = pinned ? "Открепить" : "Закрепить", Style = (Style)FindResource("ToolBtn"), Padding = new Thickness(6, 1, 6, 1),
            ToolTip = pinned ? "Убрать подсказку" : "Оставить подсказку у номера связи",
        };
        var toRow = new Button { Content = "К строке таблицы", Style = (Style)FindResource("ToolBtn"), Padding = new Thickness(6, 1, 6, 1) };
        DockPanel.SetDock(chip, Dock.Left);
        DockPanel.SetDock(close, Dock.Right);
        head.Children.Add(chip);
        head.Children.Add(close);
        head.Children.Add(new TextBlock
        {
            Text = LinkKind.All.FirstOrDefault(x => x.Key == k.Kind).Label ?? "",
            Foreground = (Brush)FindResource("Muted"), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(8, 0, 8, 0),
        });
        panel.Children.Add(head);
        panel.Children.Add(new TextBlock { Text = _chapter?.DocName is { Length: > 0 } d ? d.ToUpperInvariant() : "ДОКУМЕНТ", FontSize = 10, FontWeight = FontWeights.Bold, Foreground = (Brush)FindResource("Muted") });
        panel.Children.Add(new TextBlock { Text = k.DocField, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 1, 0, 6) });
        panel.Children.Add(new TextBlock { Text = "СИСТЕМА", FontSize = 10, FontWeight = FontWeights.Bold, Foreground = (Brush)FindResource("Muted") });
        panel.Children.Add(new TextBlock { Text = k.SystemField, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 1, 0, 6) });
        var bar = new WrapPanel();
        bar.Children.Add(pin);
        bar.Children.Add(toRow);
        panel.Children.Add(bar);
        var card = new Border
        {
            Background = Brushes.White, BorderBrush = new SolidColorBrush(col), BorderThickness = new Thickness(2, 2, 2, 2),
            CornerRadius = new CornerRadius(8), Padding = new Thickness(10, 8, 10, 8), Child = panel,
            Effect = new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 14, ShadowDepth = 2, Opacity = 0.25 },
        };
        close.Click += (_, _) =>
        {
            Pops.Children.Remove(card);
            if (_pinned.GetValueOrDefault(k.Id) == card) _pinned.Remove(k.Id);
            if (_pop == card) _pop = null;
            View.SelectLink(null);
        };
        pin.Click += (_, _) =>
        {
            Pops.Children.Remove(card);
            if (pinned) { _pinned.Remove(k.Id); return; }
            if (_pop == card) _pop = null;
            var pc = PopCard(k, pinned: true);
            _pinned[k.Id] = pc;
            Pops.Children.Add(pc);
            pc.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
            PlacePops();
        };
        toRow.Click += (_, _) =>
        {
            if (View.TableRowRect(k) is { } r) { View.ScrollToWorld(r); View.SelectLink(k.Id); }
            else Status("Связи нет ни в одной таблице разворота");
        };
        return card;
    }
}
