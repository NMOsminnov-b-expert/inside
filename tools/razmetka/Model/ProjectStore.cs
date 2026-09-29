using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Razmetka.Model;

// Папка проекта: razmetka.json + images/. Запись — через временный файл и
// замену, чтобы сбой посреди записи не оставил битый проект.
//
// Черновик: несохранённые правки раз в несколько секунд уходят в
// %LOCALAPPDATA%\Razmetka\drafts — при следующем открытии проекта
// предлагается их восстановить. Это страховка, а не основное хранение.
public sealed class ProjectStore
{
    public const string FileName = "razmetka.json";
    public const string ImagesDir = "images";

    public static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public string Dir { get; }
    public Project Project { get; private set; }
    readonly Dictionary<string, BitmapSource> _cache = new();

    ProjectStore(string dir, Project p) { Dir = dir; Project = p; }

    public string ProjectPath => Path.Combine(Dir, FileName);

    public static ProjectStore Create(string dir, string title)
    {
        Directory.CreateDirectory(Path.Combine(dir, ImagesDir));
        var p = new Project { Title = title };
        p.Chapters.Add(new Chapter { Title = "Глава 1", Sheets = { new Sheet { Title = "Разворот 1" } } });
        var s = new ProjectStore(dir, p);
        s.Save();
        return s;
    }

    public static ProjectStore Open(string dir)
    {
        var text = File.ReadAllText(Path.Combine(dir, FileName));
        var p = JsonSerializer.Deserialize<Project>(text, Json) ?? new Project();
        Directory.CreateDirectory(Path.Combine(dir, ImagesDir));
        return new ProjectStore(dir, p);
    }

    public void Save()
    {
        var tmp = ProjectPath + ".tmp";
        File.WriteAllText(tmp, Serialize(Project));
        if (File.Exists(ProjectPath)) File.Replace(tmp, ProjectPath, null);
        else File.Move(tmp, ProjectPath);
        DeleteDraft();
    }

    public static string Serialize(Project p) => JsonSerializer.Serialize(p, Json);

    public static Project Clone(Project p) => JsonSerializer.Deserialize<Project>(Serialize(p), Json)!;

    public void Replace(Project p) => Project = p;

    // --- картинки --------------------------------------------------------

    public BitmapSource? Bitmap(string? asset)
    {
        if (asset == null || !Project.Assets.TryGetValue(asset, out var info)) return null;
        if (_cache.TryGetValue(asset, out var bmp)) return bmp;
        var path = Path.Combine(Dir, ImagesDir, info.File);
        if (!File.Exists(path)) return null;
        var img = new BitmapImage();
        img.BeginInit();
        img.CacheOption = BitmapCacheOption.OnLoad;
        img.CreateOptions = BitmapCreateOptions.IgnoreColorProfile;
        img.UriSource = new Uri(path);
        img.EndInit();
        img.Freeze();
        _cache[asset] = img;
        return img;
    }

    // Импорт без потерь (требование пользователя 29.09.2026: «потери качества
    // недопустимы»): файл кладётся в проект как есть — байт в байт, без
    // пересжатия и без уменьшения. Прежде картинки уменьшались до 3000 точек
    // и шли в JPEG 88 — такие в старых проектах заменяются исходником
    // («Заменить»).
    static readonly string[] Kept = { ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tif", ".tiff" };

    // Уровни картинки для экрана (как в просмотрщиках — «пирамида»): копии в
    // 2, 4, 8 раз меньше. Страница PDF в 300 dpi, уменьшаемая на каждом кадре
    // до размера окна, давала рывки при масштабе; с уровнем уменьшать почти
    // нечего. Копии готовятся в фоне, пока их нет — рисуется исходник. Экспорт
    // берёт только исходник.
    readonly Dictionary<(string, int), BitmapSource> _levels = new();
    readonly HashSet<(string, int)> _making = new();
    public event Action? LevelReady;

    // pxPerSrc — сколько точек экрана приходится на точку исходника.
    public BitmapSource? BitmapFor(string? asset, double pxPerSrc)
    {
        var full = Bitmap(asset);
        if (full == null || asset == null) return full;
        var n = 0;
        while (n < 3 && pxPerSrc * (1 << (n + 1)) <= 1.0 && Math.Max(full.PixelWidth, full.PixelHeight) >> (n + 1) >= 256) n++;
        if (n == 0) return full;
        for (var m = n; m >= 1; m--)
            if (_levels.TryGetValue((asset, m), out var lv))
            {
                if (m < n) MakeLevel(asset, full, n);
                return lv;
            }
        MakeLevel(asset, full, n);
        return full;
    }

    void MakeLevel(string asset, BitmapSource full, int n)
    {
        if (!_making.Add((asset, n))) return;
        var dispatcher = System.Windows.Application.Current.Dispatcher;
        Task.Run(() =>
        {
            var k = 1.0 / (1 << n);
            BitmapSource tb = new TransformedBitmap(full, new ScaleTransform(k, k));
            if (tb.Format != PixelFormats.Bgra32 && tb.Format != PixelFormats.Pbgra32)
                tb = new FormatConvertedBitmap(tb, PixelFormats.Bgra32, null, 0);
            var stride = tb.PixelWidth * 4;
            var px = new byte[stride * tb.PixelHeight];
            tb.CopyPixels(px, stride, 0);
            var bmp = BitmapSource.Create(tb.PixelWidth, tb.PixelHeight, 96, 96, tb.Format, null, px, stride);
            bmp.Freeze();
            dispatcher.BeginInvoke(() =>
            {
                _making.Remove((asset, n));
                if (!_cache.ContainsKey(asset)) return;
                _levels[(asset, n)] = bmp;
                LevelReady?.Invoke();
            });
        });
    }

    public string ImportFile(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        var dec = BitmapDecoder.Create(new Uri(path), BitmapCreateOptions.PreservePixelFormat | BitmapCreateOptions.IgnoreColorProfile, BitmapCacheOption.OnLoad);
        var frame = dec.Frames[0];
        // Многостраничный TIFF или незнакомый формат — первая страница в PNG
        // (без потерь); остальное — исходный файл.
        if (!Kept.Contains(ext) || dec.Frames.Count > 1) return Import(frame, Path.GetFileName(path));
        var data = File.ReadAllBytes(path);
        return Store(data, ext == ".jpeg" ? ".jpg" : ext, frame.PixelWidth, frame.PixelHeight, Path.GetFileName(path));
    }

    // Картинка из памяти (буфер обмена, страница PDF) — PNG, без потерь.
    // Имя файла — хэш содержимого: одинаковая картинка второй раз не
    // записывается.
    public string Import(BitmapSource src, string name)
    {
        var bmp = src;
        if (bmp.Format != PixelFormats.Bgra32 && bmp.Format != PixelFormats.Bgr32 && bmp.Format != PixelFormats.Pbgra32)
            bmp = new FormatConvertedBitmap(bmp, PixelFormats.Bgra32, null, 0);
        return Store(Encode(new PngBitmapEncoder(), bmp), ".png", bmp.PixelWidth, bmp.PixelHeight, name);
    }

    string Store(byte[] data, string ext, int w, int h, string name)
    {
        var hash = Convert.ToHexString(SHA1.HashData(data))[..16].ToLowerInvariant();
        var file = hash + ext;
        if (!Project.Assets.ContainsKey(hash))
        {
            File.WriteAllBytes(Path.Combine(Dir, ImagesDir, file), data);
            Project.Assets[hash] = new AssetInfo { File = file, W = w, H = h, Name = name };
        }
        return hash;
    }

    // Картинки в памяти — только нужные сейчас: страница PDF в 300 dpi — это
    // десятки мегабайт, весь проект разом не помещается. Держатся картинки
    // текущего разворота, остальные читаются с диска заново при переходе.
    public void KeepOnly(IEnumerable<string?> assets)
    {
        var keep = assets.Where(a => a != null).ToHashSet();
        foreach (var k in _cache.Keys.Where(k => !keep.Contains(k)).ToList()) _cache.Remove(k);
        foreach (var k in _levels.Keys.Where(k => !keep.Contains(k.Item1)).ToList()) _levels.Remove(k);
    }

    static byte[] Encode(BitmapEncoder enc, BitmapSource bmp)
    {
        enc.Frames.Add(BitmapFrame.Create(bmp));
        using var ms = new MemoryStream();
        enc.Save(ms);
        return ms.ToArray();
    }

    public long ImagesBytes()
    {
        var dir = new DirectoryInfo(Path.Combine(Dir, ImagesDir));
        return dir.Exists ? dir.EnumerateFiles().Sum(f => f.Length) : 0;
    }

    // Картинки, на которые не ссылается ни один слой, — после сохранения
    // удаляются из папки, чтобы проект не копил выброшенные фото.
    public int PruneAssets()
    {
        var used = Project.Chapters.SelectMany(c => c.Sheets).SelectMany(s => s.Layers)
            .Select(l => l.Asset).Where(a => a != null).ToHashSet();
        var dead = Project.Assets.Keys.Where(k => !used.Contains(k)).ToList();
        foreach (var k in dead)
        {
            var path = Path.Combine(Dir, ImagesDir, Project.Assets[k].File);
            try { if (File.Exists(path)) File.Delete(path); } catch (IOException) { }
            Project.Assets.Remove(k);
            _cache.Remove(k);
        }
        return dead.Count;
    }

    // --- черновик ----------------------------------------------------------

    string DraftPath
    {
        get
        {
            var key = Convert.ToHexString(SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(Dir.ToLowerInvariant())))[..16];
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Razmetka", "drafts");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, key + ".json");
        }
    }

    public void SaveDraft() => File.WriteAllText(DraftPath, Serialize(Project));

    public void DeleteDraft() { try { File.Delete(DraftPath); } catch (IOException) { } }

    // Черновик новее файла проекта — значит, остались несохранённые правки.
    public Project? PendingDraft()
    {
        var d = DraftPath;
        if (!File.Exists(d) || File.GetLastWriteTimeUtc(d) <= File.GetLastWriteTimeUtc(ProjectPath)) return null;
        try { return JsonSerializer.Deserialize<Project>(File.ReadAllText(d), Json); }
        catch (JsonException) { return null; }
    }
}
