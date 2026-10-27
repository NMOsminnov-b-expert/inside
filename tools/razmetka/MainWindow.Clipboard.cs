using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using Razmetka.Editor;
using Razmetka.Model;

namespace Razmetka;

// Буфер обмена и перенос слоёв между разворотами (пользователь 27.10.2026:
// «полную поддержку ctrl c v a x z… С возможностью встраивания страниц в
// другие страницы… не очень удобно переносить импортированный пдф в другие
// страницы»; «Копировать — в буфер… после чего куда надо, туда и вставляем»).
//
//   Ctrl+C — выбранные картинки в буфер (и в буфер Windows: одна картинка
//            вставится и в Word, и в почту);
//   Ctrl+X — то же и убрать с разворота;
//   Ctrl+V — вставить на открытый разворот; из буфера Windows — картинку,
//            файлы картинок, PDF (окно выбора страниц);
//   перетаскивание из списка «Слои» на разворот слева или на вкладку внизу —
//            перенос, с Ctrl — копия.
// Всё — одним шагом отмены.
public partial class MainWindow
{
    // Последнее скопированное — и на случай, если буфер Windows занят другой
    // программой, и для сценариев проверки, которые буфер пользователя не трогают.
    LayerClip? _clip;

    IEnumerable<string> ClipIds() =>
        View.SelectedLayers().Where(l => l.Kind == LayerKind.Image).Select(l => l.Id).ToList();

    bool CanCopy => _sheet != null && View.SelectedLayers().Any(l => l.Kind == LayerKind.Image);

    void CopyLayers(bool cut)
    {
        if (_sheet == null || _store == null) return;
        var ids = ClipIds().ToList();
        if (ids.Count == 0)
        {
            Status(View.SelectedLayers().Any() ? "Таблица связей не копируется — она строится по связям разворота" : "Выберите картинку — затем Ctrl+C");
            return;
        }
        var clip = LayerClip.Build(_sheet, _store, ids);
        clip.Cut = cut;
        _clip = clip;
        if (!App.Scripted) PutOnSystemClipboard(clip);
        var what = ids.Count == 1 ? "Картинка" : $"Картинок: {ids.Count}";
        if (!cut) { Status($"{what} в буфере — Ctrl+V на нужном развороте"); return; }
        var half = LayerClip.HalfLinks(_sheet, ids);
        View.EndCrop();
        Edit(ids.Count == 1 ? "Вырезать слой" : "Вырезать слои", () => LayerOps.Delete(_sheet, ids));
        View.ClearSelection();
        Status($"{what} вырезано — Ctrl+V на нужном развороте" + (half > 0 ? $"; связей со вторым концом здесь снято: {half}" : "") + ". Ctrl+Z вернёт");
    }

    void PutOnSystemClipboard(LayerClip clip)
    {
        var data = new DataObject();
        data.SetData(LayerClip.Format, clip.ToJson());
        // Одна картинка — ещё и картинкой (видимая часть), чтобы вставлялась в
        // другие программы.
        if (clip.Layers.Count == 1 && _store?.Bitmap(clip.Layers[0].Asset) is { } bmp)
        {
            var c = clip.Layers[0].Crop;
            var r = new Int32Rect((int)Math.Max(0, c.X), (int)Math.Max(0, c.Y),
                (int)Math.Min(bmp.PixelWidth - Math.Max(0, c.X), c.W), (int)Math.Min(bmp.PixelHeight - Math.Max(0, c.Y), c.H));
            if (r.Width > 0 && r.Height > 0) data.SetImage(new CroppedBitmap(bmp, r));
        }
        try { Clipboard.SetDataObject(data, true); }
        catch (System.Runtime.InteropServices.COMException) { /* буфер занят — остаётся _clip */ }
    }

    LayerClip? ClipFromSystem()
    {
        if (App.Scripted) return _clip;
        try
        {
            if (Clipboard.ContainsData(LayerClip.Format) && Clipboard.GetData(LayerClip.Format) is string s) return LayerClip.FromJson(s);
        }
        catch (System.Runtime.InteropServices.COMException) { return _clip; }
        return null;
    }

    // Ctrl+V: свои слои, иначе — что лежит в буфере Windows.
    void Paste()
    {
        if (_sheet == null || _store == null) return;
        var clip = ClipFromSystem();
        if (clip != null) { PasteClip(clip, _sheet); return; }
        if (!App.Scripted && Clipboard.ContainsFileDropList())
        {
            var files = Clipboard.GetFileDropList().Cast<string>().Where(File.Exists).ToList();
            var pdf = files.FirstOrDefault(f => Path.GetExtension(f).Equals(".pdf", StringComparison.OrdinalIgnoreCase));
            if (pdf != null) { _ = AddPdf(pdf, null, here: true); return; }
            AddImageFiles(files);
            return;
        }
        PasteImage();
    }

    void PasteClip(LayerClip clip, Sheet target)
    {
        List<string> ids = new(), missing = new();
        Edit("Вставка", () => ids = clip.PasteInto(target, _store!, out missing));
        // Вырезанное вставляется один раз «на место»; повторная вставка — уже
        // копия со сдвигом.
        clip.Cut = false;
        if (ids.Count > 0) View.Select(ids);
        Status((ids.Count == 1 ? "Картинка вставлена" : $"Вставлено картинок: {ids.Count}")
            + (missing.Count > 0 ? $"; не найдены файлы: {string.Join(", ", missing)}" : ""));
    }

    // Перенос (или копия) слоёв на другой разворот — перетаскиванием из
    // списка «Слои». Открывается разворот назначения, перенесённое выбрано.
    public void MoveLayersTo(Sheet target, IList<string> ids, bool copy)
    {
        if (_sheet == null || _store == null || ids.Count == 0) return;
        var from = _sheet;
        if (target == from) return;
        var clip = LayerClip.Build(from, _store, ids);
        if (clip.Layers.Count == 0) { Status("Таблица связей не переносится — она строится по связям разворота"); return; }
        clip.Cut = !copy;
        var half = copy ? 0 : LayerClip.HalfLinks(from, clip.Layers.Select(l => l.Id));
        List<string> got = new();
        Edit(copy ? "Копия на разворот" : "Перенос на разворот", () =>
        {
            got = clip.PasteInto(target, _store, out _);
            if (!copy) LayerOps.Delete(from, clip.Layers.Select(l => l.Id));
        });
        var ch = _store.Project.Chapters.First(c => c.Sheets.Contains(target));
        PickSheet(ch, target);
        View.Select(got);
        Status($"{(copy ? "Скопировано" : "Перенесено")} на «{target.Title}»: {got.Count}"
            + (half > 0 ? $"; связей со вторым концом на прежнем развороте снято: {half}" : "") + ". Ctrl+Z вернёт");
    }

    // --- перетаскивание из списка «Слои» ----------------------------------

    public sealed record LayerDrag(Sheet From, List<string> Ids);

    Point? _layerDragFrom;

    void InitLayerDrag()
    {
        Layers.PreviewMouseLeftButtonDown += (_, e) => _layerDragFrom = e.GetPosition(Layers);
        Layers.PreviewMouseLeftButtonUp += (_, _) => _layerDragFrom = null;
        Layers.PreviewMouseMove += (_, e) =>
        {
            if (_layerDragFrom is not { } p0 || e.LeftButton != MouseButtonState.Pressed || _sheet == null) return;
            var d = e.GetPosition(Layers) - p0;
            if (Math.Abs(d.X) < SystemParameters.MinimumHorizontalDragDistance && Math.Abs(d.Y) < SystemParameters.MinimumVerticalDragDistance) return;
            _layerDragFrom = null;
            var ids = Layers.SelectedItems.Cast<ListBoxItem>().Select(i => (string)i.Tag).ToList();
            if (ids.Count == 0) return;
            Status("Перетащите на разворот слева или на вкладку внизу; с Ctrl — копия");
            DragDrop.DoDragDrop(Layers, new DataObject(typeof(LayerDrag), new LayerDrag(_sheet, ids)), DragDropEffects.Move | DragDropEffects.Copy);
        };
    }

    // Цель перетаскивания — строка разворота или вкладка.
    void AcceptLayerDrop(FrameworkElement target, Sheet sh)
    {
        target.AllowDrop = true;
        target.DragOver += (_, e) =>
        {
            if (e.Data.GetData(typeof(LayerDrag)) is not LayerDrag d) return;
            e.Effects = d.From == sh ? DragDropEffects.None
                : e.KeyStates.HasFlag(DragDropKeyStates.ControlKey) ? DragDropEffects.Copy : DragDropEffects.Move;
            e.Handled = true;
        };
        target.Drop += (_, e) =>
        {
            if (e.Data.GetData(typeof(LayerDrag)) is not LayerDrag d || d.From != _sheet || d.From == sh) return;
            e.Handled = true;
            var copy = e.KeyStates.HasFlag(DragDropKeyStates.ControlKey);
            Dispatcher.BeginInvoke(() => MoveLayersTo(sh, d.Ids, copy));
        };
    }
}
