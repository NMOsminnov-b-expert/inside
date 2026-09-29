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
using Razmetka.Ui;

namespace Razmetka;

// Главное окно. Части (partial):
//   MainWindow.xaml.cs        — проект, правки и отмена, картинки, PDF, экспорт;
//   MainWindow.Commands.cs    — реестр команд, клавиши, палитра, меню;
//   MainWindow.Navigator.cs   — развороты и слои (левая панель);
//   MainWindow.Inspector.cs   — свойства выбранного (правая панель);
//   MainWindow.CanvasUi.cs    — поверх полотна: режимы, инструменты, панель у
//                               выбранного, подсказки и описание связи.
// Перестройка интерфейса 29.09.2026 — практика interfeys-razmetki-dokumentov-
// klavishi-palitra-komand-inspektor-po-vyb.
public partial class MainWindow : Window
{
    ProjectStore? _store;
    Chapter? _chapter;
    Sheet? _sheet;
    readonly UndoStack _undo = new();
    bool _dirty;
    bool _syncing;
    DateTime? _savedAt;
    readonly DispatcherTimer _draftTimer = new() { Interval = TimeSpan.FromSeconds(5) };

    public ProjectStore? Store => _store;
    public SheetView Canvas => View;

    public MainWindow()
    {
        InitializeComponent();
        View.EditStarting += () => { if (_store != null) _undo.Begin(_store.Project); };
        View.EditCommitted += Committed;
        View.SelectionChanged += SelectionChangedUi;
        View.ViewChanged += () => { ZoomText.Text = $"{Math.Round(View.Zoom * 100)} %"; PlacePops(); PlaceSelBar(); CloseEditor(); };
        View.LinkClicked += (k, p) => ShowPop(k, p);
        View.ContextRequested += ShowContext;
        View.EditLinkRequested += (k, _) => EditLinkCard(k);
        View.HoverHint += h => { if (!_statusPinned) StatusText.Text = h; };
        View.Dragging += d => { _dragging = d; PlaceSelBar(); };
        View.ToolChanged += SyncTool;
        View.LinkDrawn += (a, b) => CreateLink(a, b);
        View.NotePlaced += p => AddNoteAt(p);
        View.StraightenRequested += k => Edit("Выпрямить стрелку", () => { k.Points.Clear(); SheetGeo.Reroute(_sheet!, new[] { k.Id }); });
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

        BuildCommands();
        _cmds.Apply(App.Settings.Keys);
        InitTopBar();
        InitNavigator();
        InitCanvasUi();
        InitPages();
        SyncKeyTips();
        // Смена темы: разметка перекрашивается сама (DynamicResource),
        // построенное кодом — перестраивается.
        Theme.Changed += () =>
        {
            ClearPops();
            SyncKeyTips();
            BuildInspector(force: true);
            UpdateAll();
            if (_flow) { _flowCache.Clear(); BuildFlow(keepCurrent: true); }
            View.Refresh();
        };

        Drop += OnDrop;
        PreviewKeyDown += OnKey;
        PreviewMouseDown += (_, e) =>
        {
            // Щелчок мимо палитры закрывает её.
            if (Pal.IsOpen && !Pal.IsMouseOver) Pal.Close();
        };
        SizeChanged += (_, _) => FitPanels();
        // Узкое полотно: у панели инструментов остаются инструменты, «Добавить»
        // и масштаб в процентах — отмена есть на Ctrl+Z, шаг масштаба — в меню.
        CanvasArea.SizeChanged += (_, _) =>
        {
            var tight = CanvasArea.ActualWidth < 600;
            foreach (var e in new UIElement[] { SepUndo, TUndo, TRedo, TZoomOut, TZoomIn })
                e.Visibility = tight ? Visibility.Collapsed : Visibility.Visible;
        };
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
            MessageBox.Show(this, "В этой папке уже есть проект — он будет открыт.", "Разметка");
            OpenDir(dlg.FolderName);
            return;
        }
        LoadStore(ProjectStore.Create(dlg.FolderName, Path.GetFileName(dlg.FolderName)));
    }

    void OpenProject()
    {
        if (!ConfirmDiscard()) return;
        var dlg = new OpenFolderDialog { Title = "Папка проекта (где лежит razmetka.json)" };
        if (dlg.ShowDialog(this) != true) return;
        OpenDir(dlg.FolderName, confirm: false);
    }

    public void OpenDir(string dir, bool askDraft = true, bool confirm = true)
    {
        if (confirm && _store != null && !ConfirmDiscard()) return;
        if (!File.Exists(Path.Combine(dir, ProjectStore.FileName)))
        {
            MessageBox.Show(this, "В папке нет файла razmetka.json — это не папка проекта.", "Разметка");
            return;
        }
        ProjectStore store;
        try { store = ProjectStore.Open(dir); }
        catch (Exception ex) { MessageBox.Show(this, $"Проект не открылся: {ex.Message}", "Разметка"); return; }
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

    void CloseProject()
    {
        if (!ConfirmDiscard()) return;
        LeaveFlow();
        _store = null;
        _chapter = null;
        _sheet = null;
        View.Store = null;
        View.SetSheet(null);
        _undo.Clear();
        _dirty = false;
        ClearPops();
        UpdateAll();
    }

    void LoadStore(ProjectStore store, bool keepDirty = false)
    {
        LeaveFlow();
        _store = store;
        View.Store = store;
        _undo.Clear();
        _dirty = keepDirty;
        _savedAt = null;
        _issueAt = -1;
        _chapter = store.Project.Chapters.FirstOrDefault();
        _sheet = _chapter?.Sheets.FirstOrDefault();
        ClearPops();
        ResetTools();
        View.Doc = new DocInfo(_chapter?.Title ?? "", _chapter?.DocName ?? "");
        FixStale(_sheet);
        View.SetSheet(_sheet);
        if (!App.Scripted) Recent.Touch(store.Dir, store.Project.Title);
        UpdateAll();
        FocusCanvas();
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
        _savedAt = DateTime.Now;
        UpdateAll();
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
        _version++;
        View.Refresh();
        UpdateAll();
    }

    public void Undo()
    {
        if (_store == null || !_undo.CanUndo) { Status("Отменять нечего"); return; }
        var what = _undo.UndoWhat;
        var p = _undo.Undo(_store.Project);
        if (p != null) { ApplySnapshot(p); Status($"Отменено: {what}"); }
    }

    public void Redo()
    {
        if (_store == null || !_undo.CanRedo) { Status("Повторять нечего"); return; }
        var what = _undo.RedoWhat;
        var p = _undo.Redo(_store.Project);
        if (p != null) { ApplySnapshot(p); Status($"Повторено: {what}"); }
    }

    void ApplySnapshot(Project p)
    {
        var chId = _chapter?.Id;
        var shId = _sheet?.Id;
        var sel = View.Selection.ToList();
        var link = View.LinkId;
        _store!.Replace(p);
        _chapter = p.Chapters.FirstOrDefault(c => c.Id == chId) ?? p.Chapters.FirstOrDefault();
        _sheet = _chapter?.Sheets.FirstOrDefault(s => s.Id == shId) ?? _chapter?.Sheets.FirstOrDefault();
        var zoom = View.Zoom;
        var off = View.Offset;
        View.SetSheet(_sheet);
        View.SetView(zoom, off);
        View.Select(sel.Where(id => View.Find(id) != null));
        if (link != null && _sheet?.Links.Any(k => k.Id == link) == true) View.SelectLink(link);
        _dirty = true;
        _version++;
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
        if (added.Count > 0) { View.FitAll(); Status(added.Count == 1 ? "Картинка добавлена" : $"Добавлено картинок: {added.Count}"); }
    }

    async Task AddPdfFromDialog()
    {
        if (_store == null) return;
        var dlg = new OpenFileDialog { Title = "Документ PDF", Filter = "PDF|*.pdf" };
        if (dlg.ShowDialog(this) == true) await AddPdf(dlg.FileName, null);
    }

    // Документ из PDF: каждая выбранная страница — разворот со страницей-слоем
    // (закреплён: страницу не сдвинуть случайно, пока рисуешь рамки).
    // opts — для сценариев проверки: (страницы, документ, глава).
    public async Task AddPdf(string path, (string Pages, string Doc, string Chapter)? opts)
    {
        if (_store == null) return;
        int count;
        try { count = await Model.PdfPages.Count(path); }
        catch (Exception ex) { MessageBox.Show(this, $"Не удалось открыть PDF: {ex.Message}", "Разметка"); return; }
        string pagesText, doc, chTitle;
        var newChapter = true;
        if (opts is { } o) (pagesText, doc, chTitle) = o;
        else
        {
            var d = new PdfImportDialog(path, count, _chapter != null) { Owner = this };
            if (d.ShowDialog() != true) return;
            (pagesText, doc, chTitle, newChapter) = (d.Pages, d.DocName, d.ChapterTitle, d.NewChapter);
        }
        var pages = Model.PdfPages.ParseRange(pagesText, count);
        if (pages.Count == 0) { Status("Страницы не выбраны"); return; }
        Status($"Страницы PDF: {pages.Count}…");
        Cursor = Cursors.Wait;
        var images = new List<(int Page, BitmapSource Bmp)>();
        try { foreach (var n in pages) images.Add((n, await Model.PdfPages.Render(path, n))); }
        finally { Cursor = null; }
        Chapter? target = null;
        Sheet? first = null;
        Edit("Документ из PDF", () =>
        {
            target = newChapter || _chapter == null
                ? new Chapter { Title = string.IsNullOrWhiteSpace(chTitle) ? Path.GetFileNameWithoutExtension(path) : chTitle, DocName = doc }
                : _chapter;
            if (!_store.Project.Chapters.Contains(target)) _store.Project.Chapters.Add(target);
            foreach (var (n, bmp) in images)
            {
                var sh = new Sheet { Title = $"Страница {n}", Page = $"стр. {n}" };
                var asset = _store.Import(bmp, $"{Path.GetFileName(path)}, стр. {n}");
                // Страница рисуется в 300 dpi, а на полотне стоит в прежнем
                // размере (как при 110 dpi) — рамки и снимки системы рядом не
                // становятся мелкими; подробность — при увеличении и в экспорте.
                var l = LayerOps.AddImage(sh, _store, asset, $"{doc}, стр. {n}", _store.Project.Assets[asset].W * Model.PdfPages.CanvasDpi / Model.PdfPages.Dpi);
                l.Locked = true;
                target.Sheets.Add(sh);
                first ??= sh;
            }
        });
        if (first != null) PickSheet(target, first);
        Status($"Добавлено разворотов: {images.Count}");
    }

    // Стрелки, оторванные от рамок (например, после переноса старой разметки,
    // где рамки правили отдельно от стрелок), перекладываются при открытии
    // разворота — не дожидаясь первой правки.
    static void FixStale(Sheet? s)
    {
        if (s != null && s.Links.Any(k => !SheetGeo.PathFits(s, k))) SheetGeo.Reroute(s);
    }

    void ExportTo(string filter, string ext, Action<string> write)
    {
        if (_store == null) return;
        var name = (_sheet != null && ext == ".png" ? _sheet.Title : _store.Project.Title) + ext;
        var dlg = new SaveFileDialog { Filter = filter, FileName = string.Join("_", name.Split(Path.GetInvalidFileNameChars())),
            InitialDirectory = Path.GetDirectoryName(_store.Dir) };
        if (dlg.ShowDialog(this) != true) return;
        try
        {
            Cursor = Cursors.Wait;
            write(dlg.FileName);
            Status($"Экспорт готов: {dlg.FileName}");
        }
        catch (Exception ex) { MessageBox.Show(this, $"Экспорт не удался: {ex.Message}", "Разметка"); }
        finally { Cursor = null; }
    }

    void ExportHtml() => ExportTo("HTML-страница|*.html", ".html", p => Export.Exporter.Html(_store!, p));
    void ExportXlsx() => ExportTo("Книга Excel|*.xlsx", ".xlsx", p => Export.Exporter.Xlsx(_store!, p));
    void ExportPng() => ExportTo("Картинка PNG|*.png", ".png", p => Export.Exporter.Png(_store!, _chapter!, _sheet!, p));

    void PasteImage()
    {
        if (_sheet == null || _store == null) return;
        if (Clipboard.ContainsFileDropList())
        {
            AddImageFiles(Clipboard.GetFileDropList().Cast<string>());
            return;
        }
        if (!Clipboard.ContainsImage()) { Status("В буфере обмена нет картинки — сделайте снимок экрана (Win+Shift+S) и вставьте снова"); return; }
        var img = Clipboard.GetImage();
        if (img == null) return;
        string? id = null;
        Edit("Вставка фото", () => id = LayerOps.AddImage(_sheet, _store, _store.Import(img, "Вставка"), "Вставка").Id);
        if (id != null) { View.Select(new[] { id }); Status("Картинка вставлена"); }
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

    // На окно можно бросить картинки (на разворот) или папку проекта.
    void OnDrop(object sender, DragEventArgs e)
    {
        if (e.Data.GetData(DataFormats.FileDrop) is not string[] files || files.Length == 0) return;
        if (files.Length == 1 && Directory.Exists(files[0]))
        {
            if (File.Exists(Path.Combine(files[0], ProjectStore.FileName))) OpenDir(files[0]);
            else Status("В папке нет razmetka.json — это не папка проекта");
            return;
        }
        if (_sheet == null) { Status("Сначала откройте проект — картинки ложатся на разворот"); return; }
        AddImageFiles(files.Where(File.Exists));
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
        Edit(ids.Count == 1 ? "Удаление слоя" : "Удаление слоёв", () => LayerOps.Delete(_sheet, ids));
        View.ClearSelection();
        Status(ids.Count == 1 ? "Слой удалён — Ctrl+Z вернёт" : $"Удалено слоёв: {ids.Count} — Ctrl+Z вернёт");
    }

    void Reorder(int step)
    {
        if (_sheet == null || View.Selection.Count == 0) return;
        Edit("Порядок слоёв", () => LayerOps.Reorder(_sheet, View.Selection, step));
    }

    void ToggleLock()
    {
        var ls = View.SelectedLayers().ToList();
        if (ls.Count == 0) return;
        var on = !ls.All(l => l.Locked);
        Edit(on ? "Закрепить слой" : "Открепить слой", () => { foreach (var l in ls) l.Locked = on; });
        // Закреплённый мышью не выбирается — снимаем выбор, чтобы не путать.
        if (on) View.ClearSelection();
        Status(on ? "Закреплено: мышью не выбирается и не двигается" : "Откреплено");
    }

    void ToggleHide()
    {
        var ls = View.SelectedLayers().ToList();
        if (ls.Count == 0) return;
        var hide = !ls.All(l => l.Hidden);
        Edit(hide ? "Скрыть слой" : "Показать слой", () => { foreach (var l in ls) l.Hidden = hide; });
        if (hide) View.ClearSelection();
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
        FocusInspectorField("chapter");
    }

    // Новый разворот — сразу после текущего, а не в конец главы.
    void AddSheet()
    {
        if (_store == null) return;
        var ch = _chapter ?? _store.Project.Chapters.FirstOrDefault();
        if (ch == null) { AddChapter(); return; }
        Sheet? sh = null;
        Edit("Новый разворот", () =>
        {
            sh = new Sheet { Title = $"Разворот {ch.Sheets.Count + 1}" };
            var at = _sheet != null && ch.Sheets.Contains(_sheet) ? ch.Sheets.IndexOf(_sheet) + 1 : ch.Sheets.Count;
            ch.Sheets.Insert(at, sh);
        });
        PickSheet(ch, sh);
        FocusInspectorField("title");
    }

    void DeleteSheet(Chapter ch, Sheet sh)
    {
        if (_store == null) return;
        if ((sh.Layers.Count > 0 || sh.Links.Count > 0) && MessageBox.Show(this,
                $"Удалить разворот «{sh.Title}»" + (sh.Links.Count > 0 ? $" вместе со связями ({sh.Links.Count})?" : "?"),
                "Разметка", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        var i = ch.Sheets.IndexOf(sh);
        Edit("Удаление разворота", () => ch.Sheets.Remove(sh));
        if (sh == _sheet) PickSheet(ch, ch.Sheets.ElementAtOrDefault(Math.Min(i, ch.Sheets.Count - 1)));
        Status($"Разворот «{sh.Title}» удалён — Ctrl+Z вернёт");
    }

    void DeleteChapter(Chapter ch)
    {
        if (_store == null) return;
        if (MessageBox.Show(this, $"Удалить главу «{ch.Title}» со всеми разворотами ({ch.Sheets.Count})?", "Разметка",
                MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        Edit("Удаление главы", () => _store.Project.Chapters.Remove(ch));
        if (ch == _chapter) PickSheet(_store.Project.Chapters.FirstOrDefault(), _store.Project.Chapters.FirstOrDefault()?.Sheets.FirstOrDefault());
        Status($"Глава «{ch.Title}» удалена — Ctrl+Z вернёт");
    }

    // Порядок разворотов внутри главы.
    void MoveSheet(Chapter ch, Sheet sh, int step)
    {
        var i = ch.Sheets.IndexOf(sh);
        var j = Math.Clamp(i + step, 0, ch.Sheets.Count - 1);
        if (i == j) return;
        Edit("Порядок разворотов", () => { ch.Sheets.RemoveAt(i); ch.Sheets.Insert(j, sh); });
    }

    public void PickSheet(Chapter? ch, Sheet? sh)
    {
        View.EndCrop();
        CloseEditor();
        ClearPops();
        // Режим новой связи или заметки на другом развороте не продолжается:
        // недорисованная рамка осталась бы от прежнего.
        ResetTools();
        _chapter = ch;
        _sheet = sh;
        View.Doc = new DocInfo(ch?.Title ?? "", ch?.DocName ?? "");
        FixStale(sh);
        _store?.KeepOnly(sh?.Layers.Select(l => l.Asset) ?? Enumerable.Empty<string?>());
        View.SetSheet(sh);
        UpdateAll();
    }

    // Все развороты проекта подряд — для PageDown / PageUp.
    IEnumerable<(Chapter Ch, Sheet Sh)> AllSheets() =>
        _store == null ? Enumerable.Empty<(Chapter, Sheet)>() : _store.Project.Chapters.SelectMany(c => c.Sheets.Select(s => (c, s)));

    void StepSheet(int step)
    {
        var all = AllSheets().ToList();
        if (all.Count == 0) return;
        var i = all.FindIndex(x => x.Sh == _sheet);
        var j = Math.Clamp(i + step, 0, all.Count - 1);
        if (i == j) { Status(step > 0 ? "Это последний разворот проекта" : "Это первый разворот проекта"); return; }
        OpenSheet(all[j].Ch, all[j].Sh);
        Status($"{all[j].Ch.Title} · {all[j].Sh.Title} — {j + 1} из {all.Count}");
    }

    void StepChapter(int step)
    {
        if (_store == null || _store.Project.Chapters.Count == 0) return;
        var cs = _store.Project.Chapters;
        var i = _chapter == null ? 0 : cs.IndexOf(_chapter);
        var j = Math.Clamp(i + step, 0, cs.Count - 1);
        if (i == j) { Status(step > 0 ? "Это последняя глава" : "Это первая глава"); return; }
        OpenSheet(cs[j], cs[j].Sheets.FirstOrDefault());
        Status($"Глава {j + 1} из {cs.Count}: {cs[j].Title}");
    }

    // --- синхронизация панелей с моделью --------------------------------

    List<Issue> _issues = new();

    void UpdateAll()
    {
        _syncing = true;
        try
        {
            var open = _store != null;
            StartScreen.Visibility = open ? Visibility.Collapsed : Visibility.Visible;
            Toolbar.Visibility = _sheet != null && !_flow ? Visibility.Visible : Visibility.Collapsed;
            LeftPane.IsEnabled = RightPane.IsEnabled = open;
            _issues = open ? Checks.Run(_store!.Project) : new();
            SyncTopBar();
            BuildNav();
            BuildFilter();
            BuildLayers();
            BuildInspector();
            SyncTool();
            SyncEmptySheet();
            PlaceSelBar();
            BuildTabs();
            SyncFlow();
            if (!open) BuildStart();
            TUndo.ToolTip = _undo.CanUndo ? $"Отменить: {_undo.UndoWhat} — Ctrl+Z" : "Отменить — Ctrl+Z";
            TRedo.ToolTip = _undo.CanRedo ? $"Повторить: {_undo.RedoWhat} — Ctrl+Y" : "Повторить — Ctrl+Y";
            TUndo.IsEnabled = _undo.CanUndo;
            TRedo.IsEnabled = _undo.CanRedo;
            Title = open ? $"{(_dirty ? "● " : "")}{_store!.Project.Title} — Разметка документов" : "Разметка документов";
            SizeText.Text = open ? $"Картинки проекта: {_store!.ImagesBytes() / 1024.0 / 1024.0:0.0} МБ" : "";
            ZoomText.Text = $"{Math.Round(View.Zoom * 100)} %";
            SyncSelText();
        }
        finally { _syncing = false; }
    }

    void SelectionChangedUi()
    {
        if (_syncing) return;
        _syncing = true;
        try
        {
            foreach (ListBoxItem i in Layers.Items) i.IsSelected = View.Selection.Contains((string)i.Tag);
            if (View.LinkId != null) _lastLinkId = View.LinkId;
            BuildInspector();
            SyncTool();
            PlaceSelBar();
            SyncSelText();
        }
        finally { _syncing = false; }
    }

    void SyncSelText()
    {
        var sel = View.SelectedLayers().ToList();
        SelText.Text = View.SelectedLink is { } k && _sheet != null
            ? $"Связь {k.N} · {SheetGeo.Ordered(_sheet).FindIndex(x => x.Id == k.Id) + 1} из {_sheet.Links.Count} на развороте"
            : View.SelectedNote != null ? "Заметка"
            : sel.Count == 1 ? $"{sel[0].Name} · {sel[0].W:0} × {sel[0].H:0}"
            : sel.Count > 1 ? $"Выбрано слоёв: {sel.Count}"
            : _sheet != null ? $"Связей на развороте: {_sheet.Links.Count}" : "";
    }

    // Сообщение о сделанном держится 4 секунды — подсказки наведения его не
    // перебивают.
    bool _statusPinned;
    readonly DispatcherTimer _statusTimer = new() { Interval = TimeSpan.FromSeconds(4) };

    void Status(string s)
    {
        StatusText.Text = s;
        _statusPinned = s.Length > 0;
        _statusTimer.Stop();
        _statusTimer.Tick -= StatusRelease;
        _statusTimer.Tick += StatusRelease;
        _statusTimer.Start();
    }

    void StatusRelease(object? o, EventArgs e) { _statusPinned = false; _statusTimer.Stop(); }

    public void FocusCanvas() => Dispatcher.BeginInvoke(() => View.Focus(), DispatcherPriority.Input);

    // Панели: ширину, которую пользователь выставил разделителем, помнит
    // _leftW / _rightW; на узком окне по умолчанию — уже. Фильтр по блоку на
    // узком окне уходит из шапки — он остаётся в палитре (Ctrl+K, «блок»).
    bool _panelsHidden;
    double _leftW = 272, _rightW = 316;

    void FitPanels()
    {
        var w = ActualWidth;
        FilterBox.Visibility = w < 1280 ? Visibility.Collapsed : Visibility.Visible;
        SearchHost.Width = w < 1100 ? 220 : 300;
        // Узкое окно: у кнопок шапки — только значки (подпись — в подсказке).
        var compact = w < 1180;
        CheckLabel.Visibility = ExportLabel.Visibility = compact ? Visibility.Collapsed : Visibility.Visible;
        PaletteKbd.Visibility = compact ? Visibility.Collapsed : Visibility.Visible;
        SaveState.Visibility = compact ? Visibility.Collapsed : Visibility.Visible;
        if (_store == null || _panelsHidden) return;
        var narrow = w < 1240;
        if (_leftW is 272 or 220) { _leftW = narrow ? 220 : 272; ColLeft.Width = new GridLength(_leftW); }
        if (_rightW is 316 or 264) { _rightW = narrow ? 264 : 316; ColRight.Width = new GridLength(_rightW); }
    }

    void TogglePanels()
    {
        _panelsHidden = !_panelsHidden;
        if (_panelsHidden)
        {
            RememberPanelWidths();
            ColLeft.Width = ColRight.Width = new GridLength(0);
            LeftSplit.Visibility = RightSplit.Visibility = Visibility.Collapsed;
            Status("Только полотно — Ctrl+\\ вернёт панели");
        }
        else
        {
            ColLeft.Width = new GridLength(Math.Max(200, _leftW));
            ColRight.Width = new GridLength(Math.Max(240, _rightW));
            LeftSplit.Visibility = RightSplit.Visibility = Visibility.Visible;
        }
    }

    void RememberPanelWidths()
    {
        if (ColLeft.ActualWidth > 0) _leftW = ColLeft.ActualWidth;
        if (ColRight.ActualWidth > 0) _rightW = ColRight.ActualWidth;
    }

    // F6 — фокус по областям окна: развороты → полотно → инспектор.
    void CycleFocus()
    {
        var f = Keyboard.FocusedElement as DependencyObject;
        bool In(DependencyObject root) => f != null && (f == root || IsDescendant(root, f));
        if (In(Nav) || In(Layers)) FocusCanvas();
        else if (f is SheetView || f == null || f == this)
        {
            var first = FindFocusable(Insp);
            if (first != null) first.Focus(); else FocusNav();
        }
        else FocusNav();
    }

    static bool IsDescendant(DependencyObject root, DependencyObject node)
    {
        for (var p = node; p != null; p = VisualTreeHelper.GetParent(p) ?? LogicalTreeHelper.GetParent(p))
            if (p == root) return true;
        return false;
    }

    static UIElement? FindFocusable(DependencyObject root)
    {
        foreach (var c in LogicalTreeHelper.GetChildren(root).OfType<DependencyObject>())
        {
            if (c is Control { Focusable: true, IsEnabled: true, IsVisible: true } ctl && c is not Button) return ctl;
            if (FindFocusable(c) is { } x) return x;
        }
        return null;
    }
}
