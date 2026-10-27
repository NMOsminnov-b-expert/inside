using System.IO;
using System.Windows.Media.Imaging;
using Windows.Data.Pdf;
using Windows.Storage.Streams;

namespace Razmetka.Model;

// Страницы PDF — встроенным движком Windows 10/11 (Windows.Data.Pdf):
// сторонняя библиотека не нужна, установка тоже.
public static class PdfPages
{
    // Страница рисуется в 300 dpi — печатное разрешение, сканы в PDF обычно
    // 200–300 dpi: подробность исходника сохраняется (требование пользователя
    // 29.09.2026: «потери качества недопустимы»; прежде — 110 dpi). На полотне
    // страница стоит в размере 110 dpi (CanvasDpi), как прежде.
    public const double Dpi = 300;
    public const double CanvasDpi = 110;
    // Миниатюры в окне выбора страниц: ширина листа A4 ≈ 100 точек.
    public const double ThumbDpi = 12;

    // Движок PDF — в отдельном коротком процессе той же программы
    // (Razmetka.exe --pdf-…, App.xaml.cs): объекты Windows Runtime для PDF при
    // выходе роняли окно (0xC0000409 при закрытии после импорта PDF — было и до
    // 29.09.2026; перенос в фоновый поток, чтение из потока и ранняя сборка
    // мусора не помогли).
    //
    // Скорость (жалоба пользователя 27.10.2026: «мягко говоря не быстрый… ещё и
    // стопорит весь интерфейс»; было 28 с на 10 страниц техпаспорта):
    //   * процесс один на пачку страниц, PDF читается в нём один раз (прежде —
    //     новый процесс и новое чтение на каждую страницу);
    //   * пачек несколько, процессы работают одновременно (Workers);
    //   * PNG от Windows ложится в файл как есть — без раскодирования и двух
    //     повторных кодирований; пиксели те же, потерь нет;
    //   * о каждой готовой странице процесс сразу пишет строку — по ней идёт ход.
    static int Workers(int pages) => Math.Clamp(Math.Min(pages, Environment.ProcessorCount / 2), 1, 4);

    public static async Task<int> Count(string path)
    {
        var o = await Child($"--pdf-count \"{path}\"", null, CancellationToken.None);
        return int.TryParse(o.Trim(), out var n) ? n : throw new InvalidOperationException("PDF не читается");
    }

    // Страницы — PNG-файлами в dir («<номер>.png»). onPage — номер готовой
    // страницы (вызывается из фонового потока). Отмена убивает процессы.
    public static async Task RenderMany(string path, IReadOnlyList<int> pages, double dpi, string dir,
        Action<int> onPage, CancellationToken ct)
    {
        Directory.CreateDirectory(dir);
        var n = Workers(pages.Count);
        var dpiText = dpi.ToString(System.Globalization.CultureInfo.InvariantCulture);
        // Страницы раздаются через одну: у каждого процесса — и начало, и конец
        // документа, первые страницы готовы раньше.
        var jobs = Enumerable.Range(0, n).Select(w => pages.Where((_, i) => i % n == w).ToList()).Where(l => l.Count > 0)
            .Select(l => Child($"--pdf-render-many \"{path}\" {dpiText} \"{dir}\" {string.Join(",", l)}",
                line => { if (int.TryParse(line, out var p)) onPage(p); }, ct));
        await Task.WhenAll(jobs);
        ct.ThrowIfCancellationRequested();
        var missing = pages.Where(p => !File.Exists(PagePng(dir, p))).ToList();
        if (missing.Count > 0) throw new InvalidOperationException($"не нарисовались страницы: {string.Join(", ", missing)}");
    }

    public static string PagePng(string dir, int page) => Path.Combine(dir, $"{page}.png");

    // Одна страница картинкой — для сценариев и мест, где нужна сама картинка.
    public static async Task<BitmapSource> Render(string path, int page, double dpi = Dpi)
    {
        var dir = Path.Combine(Path.GetTempPath(), $"razmetka-pdf-{Guid.NewGuid():N}");
        try
        {
            await RenderMany(path, new[] { page }, dpi, dir, _ => { }, CancellationToken.None);
            var bytes = await File.ReadAllBytesAsync(PagePng(dir, page));
            var dec = BitmapDecoder.Create(new MemoryStream(bytes), BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
            var bmp = dec.Frames[0];
            bmp.Freeze();
            return bmp;
        }
        finally { try { Directory.Delete(dir, true); } catch (IOException) { } }
    }

    static async Task<string> Child(string args, Action<string>? onLine, CancellationToken ct)
    {
        var psi = new System.Diagnostics.ProcessStartInfo(Environment.ProcessPath!, args)
        {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true,
        };
        using var p = System.Diagnostics.Process.Start(psi)!;
        using var reg = ct.Register(() => { try { p.Kill(); } catch (InvalidOperationException) { } });
        var all = new System.Text.StringBuilder();
        string? line;
        while ((line = await p.StandardOutput.ReadLineAsync()) != null)
        {
            all.AppendLine(line);
            onLine?.Invoke(line);
        }
        await p.WaitForExitAsync();
        return all.ToString();
    }

    // --- работа дочернего процесса ----------------------------------------

    public static async Task<int> CountHere(string path) => (int)(await Load(path)).PageCount;

    // Страницы по списку, каждая — PNG прямо от движка Windows (кодировщик по
    // умолчанию — PNG): файл пишется под временным именем и переименовывается,
    // так что родитель не увидит недописанный. После каждой — номер в вывод.
    public static async Task RenderManyHere(string path, double dpi, string dir, IEnumerable<int> pages)
    {
        var doc = await Load(path);
        foreach (var page in pages)
        {
            using var p = doc.GetPage((uint)(page - 1));
            // Size — в DIP (1/96 дюйма).
            var opts = new PdfPageRenderOptions
            {
                DestinationWidth = (uint)Math.Round(p.Size.Width * dpi / 96),
                DestinationHeight = (uint)Math.Round(p.Size.Height * dpi / 96),
                BackgroundColor = Windows.UI.Color.FromArgb(255, 255, 255, 255),
            };
            using var ras = new InMemoryRandomAccessStream();
            await p.RenderToStreamAsync(ras, opts);
            var tmp = PagePng(dir, page) + ".part";
            using (var f = File.Create(tmp)) await ras.AsStreamForRead().CopyToAsync(f);
            File.Move(tmp, PagePng(dir, page), true);
            Console.Out.WriteLine(page);
            Console.Out.Flush();
        }
    }

    // PDF — из байтов файла: StorageFile не нужен, файл не держится открытым.
    static async Task<PdfDocument> Load(string path)
    {
        var bytes = await File.ReadAllBytesAsync(Path.GetFullPath(path));
        var ras = new InMemoryRandomAccessStream();
        using (var w = new DataWriter(ras))
        {
            w.WriteBytes(bytes);
            await w.StoreAsync();
            w.DetachStream();
        }
        ras.Seek(0);
        return await PdfDocument.LoadFromStreamAsync(ras);
    }

    // Ширина и высота PNG — из заголовка (IHDR), без раскодирования картинки.
    public static (int W, int H) PngSize(string file)
    {
        using var f = File.OpenRead(file);
        var b = new byte[24];
        f.ReadExactly(b);
        int Be(int o) => (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
        return (Be(16), Be(20));
    }

    // «1-3, 5, 8-9» → [1,2,3,5,8,9] в пределах 1..count; пусто — все.
    public static List<int> ParseRange(string text, int count)
    {
        var o = new List<int>();
        if (string.IsNullOrWhiteSpace(text)) return Enumerable.Range(1, count).ToList();
        foreach (var part in text.Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var ab = part.Split('-', '–');
            if (ab.Length == 2 && int.TryParse(ab[0], out var a) && int.TryParse(ab[1], out var b))
                for (var i = Math.Max(1, a); i <= Math.Min(count, b); i++) o.Add(i);
            else if (int.TryParse(part, out var n) && n >= 1 && n <= count) o.Add(n);
        }
        return o.Distinct().ToList();
    }

    // [1,2,3,5,8,9] → «1-3, 5, 8-9»: обратное ParseRange, для поля страниц.
    public static string FormatRange(IEnumerable<int> pages)
    {
        var s = pages.Distinct().OrderBy(x => x).ToList();
        var parts = new List<string>();
        for (var i = 0; i < s.Count;)
        {
            var j = i;
            while (j + 1 < s.Count && s[j + 1] == s[j] + 1) j++;
            parts.Add(j == i ? $"{s[i]}" : j == i + 1 ? $"{s[i]}, {s[j]}" : $"{s[i]}-{s[j]}");
            i = j + 1;
        }
        return string.Join(", ", parts);
    }
}
