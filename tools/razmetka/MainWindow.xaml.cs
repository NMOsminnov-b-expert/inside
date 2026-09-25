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
        View.ViewChanged += () => ZoomText.Text = $"{Math.Round(View.Zoom * 100)} %";

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
        if (_undo.Commit(_store.Project, what)) _dirty = true;
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
        Edit("Замена фото", () => LayerOps.Replace(l, _store, _store.ImportFile(dlg.FileName)));
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
        if (_syncing) return;
        var l = View.SelectedLayers().FirstOrDefault();
        if (l == null || View.Selection.Count != 1) return;
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
        if (ctrl && key == Key.O) { OpenProject(); return true; }
        if (inText) return false;
        if (ctrl && key == Key.Z && !shift) { Undo(); return true; }
        if (ctrl && (key == Key.Y || (key == Key.Z && shift))) { Redo(); return true; }
        if (ctrl && key == Key.V) { PasteImage(); return true; }
        if (ctrl && key == Key.D) { Duplicate(); return true; }
        if (ctrl && key == Key.D0) { View.FitAll(); return true; }
        if (ctrl && (key == Key.OemPlus || key == Key.Add)) { View.SetZoom(View.Zoom * 1.25); return true; }
        if (ctrl && (key == Key.OemMinus || key == Key.Subtract)) { View.SetZoom(View.Zoom / 1.25); return true; }
        if (ctrl && key == Key.OemCloseBrackets) { Reorder(shift ? int.MaxValue : 1); return true; }
        if (ctrl && key == Key.OemOpenBrackets) { Reorder(shift ? int.MinValue : -1); return true; }
        if (ctrl && key == Key.A && _sheet != null) { View.Select(_sheet.Layers.Where(l => !l.Hidden && !l.Locked).Select(l => l.Id)); return true; }
        if (key is Key.Enter or Key.Escape && View.CropLayerId != null) { View.EndCrop(); SyncSelection(); return true; }
        if (key == Key.Escape) { View.ClearSelection(); return true; }
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
        _chapter = ch;
        _sheet = sh;
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
        var was = _syncing;
        _syncing = true;
        PropName.Text = one?.Name ?? "";
        PropCaption.Text = one?.Caption ?? "";
        _syncing = was;
        PropName.IsEnabled = PropCaption.IsEnabled = one != null;
        var img = one != null && one.Kind == LayerKind.Image;
        BtnCrop.IsEnabled = BtnReplace.IsEnabled = img && !one!.Locked;
        foreach (var b in new[] { BtnDup, BtnDelete, BtnTop, BtnUp, BtnDown, BtnBottom }) b.IsEnabled = sel.Count > 0;
        CropBar.Visibility = View.CropLayerId != null ? Visibility.Visible : Visibility.Collapsed;
        Status(sel.Count switch
        {
            0 => _sheet == null ? "" : "Щелчок — выбрать слой, перетаскивание по пустому — выбрать несколько, колесо — масштаб",
            1 => $"{one!.Name}: {one.W:0} × {one.H:0}, место {one.X:0}; {one.Y:0}. Стрелки — сдвиг, Shift — на 10",
            _ => $"Выбрано слоёв: {sel.Count}",
        });
    }

    void Status(string s) => StatusText.Text = s;
}
