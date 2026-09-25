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
    // Разрешение страницы на полотне: 110 dpi, как в «Перенос документов в
    // систему» — графы техпаспорта читаются, картинка не тяжёлая.
    public const double Dpi = 110;

    public static async Task<int> Count(string path)
    {
        var doc = await Load(path);
        return (int)doc.PageCount;
    }

    public static async Task<BitmapSource> Render(string path, int page, double dpi = Dpi)
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
        var bmp = dec.Frames[0];
        bmp.Freeze();
        return bmp;
    }

    static async Task<PdfDocument> Load(string path)
    {
        var file = await StorageFile.GetFileFromPathAsync(Path.GetFullPath(path));
        return await PdfDocument.LoadFromFileAsync(file);
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
