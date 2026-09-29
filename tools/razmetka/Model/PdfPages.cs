using System.IO;
using System.Windows.Media.Imaging;
using Windows.Data.Pdf;
using Windows.Storage;
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

    // Работа с движком PDF — в фоновом потоке: объекты Windows Runtime,
    // созданные в потоке окна, при выходе из программы освобождались не там и
    // роняли её (0xC0000409 при закрытии после импорта PDF, найдено 29.09.2026).
    // Движок PDF — в отдельном коротком процессе той же программы
    // (Razmetka.exe --pdf-count / --pdf-render, App.xaml.cs): объекты Windows
    // Runtime для PDF при выходе роняли окно (0xC0000409 при закрытии после
    // импорта PDF — было и до 29.09.2026; перенос в фоновый поток, чтение из
    // потока и ранняя сборка мусора не помогли). Страница передаётся PNG —
    // без потерь.
    public static async Task<int> Count(string path)
    {
        var o = await Child($"--pdf-count \"{path}\"");
        return int.TryParse(o.Trim(), out var n) ? n : throw new InvalidOperationException("PDF не читается");
    }

    public static async Task<BitmapSource> Render(string path, int page, double dpi = Dpi)
    {
        var png = Path.Combine(Path.GetTempPath(), $"razmetka-pdf-{Guid.NewGuid():N}.png");
        try
        {
            await Child($"--pdf-render \"{path}\" {page} {dpi.ToString(System.Globalization.CultureInfo.InvariantCulture)} \"{png}\"");
            if (!File.Exists(png)) throw new InvalidOperationException($"страница {page} не нарисовалась");
            var bytes = await File.ReadAllBytesAsync(png);
            var dec = BitmapDecoder.Create(new MemoryStream(bytes), BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
            var bmp = dec.Frames[0];
            bmp.Freeze();
            return bmp;
        }
        finally { try { File.Delete(png); } catch (IOException) { } }
    }

    static async Task<string> Child(string args)
    {
        var psi = new System.Diagnostics.ProcessStartInfo(Environment.ProcessPath!, args)
        {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true,
        };
        using var p = System.Diagnostics.Process.Start(psi)!;
        var o = await p.StandardOutput.ReadToEndAsync();
        await p.WaitForExitAsync();
        return o;
    }

    // Работа дочернего процесса: число страниц или страница в PNG.
    public static async Task<int> CountHere(string path) => (int)(await Load(path)).PageCount;

    public static async Task RenderHere(string path, int page, double dpi, string png)
    {
        var bmp = await RenderCore(path, page, dpi);
        var enc = new PngBitmapEncoder();
        enc.Frames.Add(BitmapFrame.Create(bmp));
        using var f = File.Create(png);
        enc.Save(f);
    }

    static async Task<BitmapSource> RenderCore(string path, int page, double dpi)
    {
        var doc = await Load(path);
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
        using var ms = new MemoryStream();
        await ras.AsStreamForRead().CopyToAsync(ms);
        ms.Position = 0;
        var dec = BitmapDecoder.Create(ms, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
        // Пиксели — в отдельную картинку: кадр декодера привязан к потоку, где
        // создан, а нужен потоку окна. Копия точная, без пересжатия.
        BitmapSource f = dec.Frames[0];
        if (f.Format != System.Windows.Media.PixelFormats.Bgra32)
            f = new FormatConvertedBitmap(f, System.Windows.Media.PixelFormats.Bgra32, null, 0);
        var stride = f.PixelWidth * 4;
        var px = new byte[stride * f.PixelHeight];
        f.CopyPixels(px, stride, 0);
        var bmp = BitmapSource.Create(f.PixelWidth, f.PixelHeight, 96, 96, System.Windows.Media.PixelFormats.Bgra32, null, px, stride);
        bmp.Freeze();
        return bmp;
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
}
