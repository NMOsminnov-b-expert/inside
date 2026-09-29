using System.IO;
using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Razmetka.Editor;
using Razmetka.Model;

namespace Razmetka.Export;

// Экспорт проекта: одна HTML-страница (картинки внутри, открывается любым
// браузером без интернета), таблица связей .xlsx и разворот картинкой PNG.
// Развороты рисуются тем же кодом, что полотно (SheetView.RenderBitmap), —
// в экспорте ровно то, что видно в программе.
public static class Exporter
{
    static SheetView ViewFor(ProjectStore store, Chapter ch, Sheet s)
    {
        var v = new SheetView { Store = store, Doc = new DocInfo(ch.Title, ch.DocName) };
        if (s.Links.Any(k => !SheetGeo.PathFits(s, k))) SheetGeo.Reroute(s);
        v.SetSheet(s);
        return v;
    }

    // Масштаб экспорта — по самой подробной картинке разворота: пиксель
    // исходника ложится в пиксель выгрузки, ничего не уменьшается (требование
    // пользователя 29.09.2026: «потери качества недопустимы»). Потолок — чтобы
    // огромный разворот не съел память: 16000 точек по стороне, 120 Мп.
    public static double NativeScale(ProjectStore store, Sheet s, Rect bounds)
    {
        var k = 1.0;
        foreach (var l in s.Layers.Where(l => !l.Hidden && l.Kind == LayerKind.Image && l.W > 0))
            k = Math.Max(k, l.Crop.W / l.W);
        var w = Math.Max(1, bounds.Width + 80);
        var h = Math.Max(1, bounds.Height + 110);
        k = Math.Min(k, Math.Min(16000 / w, 16000 / h));
        k = Math.Min(k, Math.Sqrt(120e6 / (w * h)));
        return Math.Max(1, k);
    }

    public static void Png(ProjectStore store, Chapter ch, Sheet s, string path)
    {
        var v = ViewFor(store, ch, s);
        var bmp = v.RenderBitmap(NativeScale(store, s, v.Bounds()), out _);
        var enc = new PngBitmapEncoder();
        enc.Frames.Add(BitmapFrame.Create(bmp));
        using var f = File.Create(path);
        enc.Save(f);
    }

    static string PngBase64(BitmapSource bmp)
    {
        var enc = new PngBitmapEncoder();
        enc.Frames.Add(BitmapFrame.Create(bmp));
        using var ms = new MemoryStream();
        enc.Save(ms);
        return Convert.ToBase64String(ms.ToArray());
    }

    static string KindLabel(string k) => LinkKind.All.FirstOrDefault(x => x.Key == k).Label ?? "";

    static string Hex(Color c) => $"#{c.R:X2}{c.G:X2}{c.B:X2}";

    // --- HTML ---------------------------------------------------------------

    public static void Html(ProjectStore store, string path)
    {
        var p = store.Project;
        var all = p.Chapters.SelectMany(c => c.Sheets.SelectMany(s => s.Links.Select(k => (c, s, k)))).ToList();
        var sheets = new List<object>();
        foreach (var ch in p.Chapters)
            foreach (var s in ch.Sheets)
            {
                var v = ViewFor(store, ch, s);
                var bmp = v.RenderBitmap(NativeScale(store, s, v.Bounds()), out var b);
                var rows = v.TableRowRects();
                var ordered = SheetGeo.Ordered(s);
                double[] P(Point q) => new[] { Math.Round(q.X - b.X, 1), Math.Round(q.Y - b.Y, 1) };
                var links = new List<object>();
                foreach (var k in ordered)
                {
                    var pts = SheetGeo.DrawPath(s, k);
                    var tgt = SheetGeo.FrameRect(s, k.Tgt);
                    if (pts == null || tgt == null) continue;
                    var (bs, bt) = SheetGeo.Badges(pts, tgt.Value);
                    var row = rows.FirstOrDefault(r => r.Link.Id == k.Id);
                    var also = all.Where(x => x.k.Id != k.Id && x.k.SystemField.Length > 0
                                              && string.Equals(x.k.SystemField, k.SystemField, StringComparison.OrdinalIgnoreCase))
                        .Select(x => new { sheet = x.s.Id, n = x.k.N, label = $"{x.c.DocName} · {x.s.Title} · {x.k.N}" }).ToList();
                    links.Add(new
                    {
                        n = k.N, doc = k.DocField, sys = k.SystemField, comment = k.Comment, kind = k.Kind, kindLabel = KindLabel(k.Kind),
                        color = Hex(SheetGeo.ColorOf(s, k)), url = k.Url,
                        pts = pts.Select(P).ToList(), badges = new[] { P(bs), P(bt) },
                        row = row.Link == null ? null : new[] { Math.Round(row.Row.X - b.X, 1), Math.Round(row.Row.Y - b.Y, 1), Math.Round(row.Row.Width, 1), Math.Round(row.Row.Height, 1) },
                        also,
                    });
                }
                sheets.Add(new
                {
                    id = s.Id, chapter = ch.Title, doc = ch.DocName, title = s.Title, page = s.Page,
                    w = Math.Round(b.Width, 1), h = Math.Round(b.Height, 1), img = PngBase64(bmp), links,
                    notes = s.Notes.Select(n => new { x = Math.Round(n.X - b.X), y = Math.Round(n.Y - b.Y), text = n.Text, author = n.Author }).ToList(),
                });
            }
        var data = JsonSerializer.Serialize(new
        {
            title = p.Title,
            chapters = p.Chapters.Select(c => new { title = c.Title, sheets = c.Sheets.Select(s => s.Id).ToList() }).ToList(),
            sheets,
            // Легенда видов линий — только если в проекте есть связи не
            // «переносится» (прежние проекты): вид теперь один.
            kinds = all.Any(x => x.k.Kind != LinkKind.Transfer) ? LinkKind.All.Select(x => new { key = x.Key, label = x.Label }).ToList() : new(),
        }, new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
        // Данные — в теге JSON; «</» внутри текста не закроет тег.
        data = data.Replace("</", "<\\/");
        var html = Template.Html.Replace("{{TITLE}}", WebUtility.HtmlEncode(p.Title)).Replace("{{DATA}}", data);
        File.WriteAllText(path, html, new UTF8Encoding(false));
    }

    // --- XLSX -----------------------------------------------------------

    // Таблица связей: шапка закреплена, автофильтр, ширины колонок, перенос
    // текста — чтобы ею пользоваться, а не только смотреть (правило проекта
    // для таблиц в .xlsx).
    public static void Xlsx(ProjectStore store, string path)
    {
        var head = new[] { "Глава", "Разворот", "Страница", "№", "Документ", "Графа документа", "Блок и поле системы", "Комментарий", "То же поле также в", "Ссылка" };
        var widths = new[] { 30, 34, 10, 6, 14, 44, 56, 40, 40, 30 };
        var all = store.Project.Chapters.SelectMany(c => c.Sheets.SelectMany(s => SheetGeo.Ordered(s).Select(k => (c, s, k)))).ToList();
        var rows = new List<string[]>();
        foreach (var (c, s, k) in all)
        {
            var also = all.Where(x => x.k.Id != k.Id && x.k.SystemField.Length > 0
                                      && string.Equals(x.k.SystemField, k.SystemField, StringComparison.OrdinalIgnoreCase))
                .Select(x => $"{x.c.DocName} · {x.s.Title} · {x.k.N}");
            rows.Add(new[] { c.Title, s.Title, s.Page, k.N.ToString(), c.DocName, k.DocField, k.SystemField, k.Comment, string.Join("; ", also), k.Url });
        }
        static string Col(int i) => ((char)('A' + i)).ToString();
        static string X(string t) => WebUtility.HtmlEncode(t ?? "");
        var sb = new StringBuilder();
        sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>");
        sb.Append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">");
        sb.Append("<sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews>");
        sb.Append("<cols>");
        for (var i = 0; i < widths.Length; i++) sb.Append($"<col min=\"{i + 1}\" max=\"{i + 1}\" width=\"{widths[i]}\" customWidth=\"1\"/>");
        sb.Append("</cols><sheetData>");
        void Row(int r, string[] cells, int style)
        {
            sb.Append($"<row r=\"{r}\">");
            for (var i = 0; i < cells.Length; i++)
            {
                var num = i == 3 && int.TryParse(cells[i], out var n) && style != 1;
                sb.Append(num
                    ? $"<c r=\"{Col(i)}{r}\" s=\"{style}\"><v>{cells[i]}</v></c>"
                    : $"<c r=\"{Col(i)}{r}\" s=\"{style}\" t=\"inlineStr\"><is><t xml:space=\"preserve\">{X(cells[i])}</t></is></c>");
            }
            sb.Append("</row>");
        }
        Row(1, head, 1);
        for (var i = 0; i < rows.Count; i++) Row(i + 2, rows[i], 2);
        sb.Append("</sheetData>");
        sb.Append($"<autoFilter ref=\"A1:{Col(head.Length - 1)}{rows.Count + 1}\"/>");
        sb.Append("</worksheet>");

        const string styles = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
            + "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">"
            + "<fonts count=\"2\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts>"
            + "<fills count=\"3\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill>"
            + "<fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFE3EEF6\"/></patternFill></fill></fills>"
            + "<borders count=\"1\"><border/></borders><cellStyleXfs count=\"1\"><xf/></cellStyleXfs>"
            + "<cellXfs count=\"3\"><xf/>"
            + "<xf fontId=\"1\" fillId=\"2\" applyFont=\"1\" applyFill=\"1\" applyAlignment=\"1\"><alignment wrapText=\"1\" vertical=\"center\"/></xf>"
            + "<xf applyAlignment=\"1\"><alignment wrapText=\"1\" vertical=\"top\"/></xf></cellXfs></styleSheet>";
        var files = new Dictionary<string, string>
        {
            ["[Content_Types].xml"] = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/>"
                + "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>"
                + "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
                + "<Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/></Types>",
            ["_rels/.rels"] = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>",
            ["xl/workbook.xml"] = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\">"
                + "<sheets><sheet name=\"Связи\" sheetId=\"1\" r:id=\"rId1\"/></sheets>"
                + "<definedNames><definedName name=\"_xlnm._FilterDatabase\" localSheetId=\"0\" hidden=\"1\">Связи!$A$1:$" + Col(head.Length - 1) + "$" + (rows.Count + 1) + "</definedName></definedNames></workbook>",
            ["xl/_rels/workbook.xml.rels"] = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/>"
                + "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>",
            ["xl/styles.xml"] = styles,
            ["xl/worksheets/sheet1.xml"] = sb.ToString(),
        };
        if (File.Exists(path)) File.Delete(path);
        using var zip = ZipFile.Open(path, ZipArchiveMode.Create);
        foreach (var (name, text) in files)
        {
            var e = zip.CreateEntry(name, CompressionLevel.Optimal);
            using var w = new StreamWriter(e.Open(), new UTF8Encoding(false));
            w.Write(text);
        }
    }
}
