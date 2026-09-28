using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;

namespace Graf.Model;

// Граф на диске: knowledge/<папка>/<id>.py. Хранилище читает все записи,
// следит за папкой и сообщает об изменениях — программа обновляется сама,
// кто бы ни поменял файл: она, graph.py, редактор или git (переключение
// ветки, pull).
//
// Свои сохранения программа узнаёт по содержимому (хэш последней записи) и
// не принимает их за изменения снаружи.
public sealed class Store : IDisposable
{
    public string Root { get; }
    public string Know => System.IO.Path.Combine(Root, "knowledge");

    readonly Dictionary<string, Record> _byPath = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<string, string> _ownWrites = new(StringComparer.OrdinalIgnoreCase);
    readonly HashSet<string> _pending = new(StringComparer.OrdinalIgnoreCase);
    readonly object _lock = new();
    FileSystemWatcher? _watch;
    System.Threading.Timer? _debounce;
    SynchronizationContext? _ui;

    // Изменения снаружи: какие записи появились или поменялись, какие ушли.
    public event Action<IReadOnlyList<Record>, IReadOnlyList<string>>? Changed;
    public DateTime LastExternal { get; private set; }

    public Store(string root) { Root = root; }

    public IEnumerable<Record> All => _byPath.Values;
    public Record? ById(string id) => _byPath.Values.FirstOrDefault(r => r.Id == id);

    public static string? FindRoot(params string[] starts)
    {
        foreach (var start in starts)
        {
            var d = new DirectoryInfo(start);
            while (d != null)
            {
                if (IsProject(d.FullName)) return d.FullName;
                d = d.Parent;
            }
        }
        return null;
    }

    // Проект — папка, в которой есть граф knowledge/ хотя бы с одной
    // папкой записей (или с README графа).
    public static bool IsProject(string dir)
    {
        var k = System.IO.Path.Combine(dir, "knowledge");
        return Directory.Exists(k) && (File.Exists(System.IO.Path.Combine(k, "README.md"))
            || Schema.Folders.Any(f => Directory.Exists(System.IO.Path.Combine(k, f.Folder))));
    }

    // Пустой граф в папке: knowledge/ и папки записей.
    public static void CreateEmpty(string dir)
    {
        foreach (var f in Schema.Folders) Directory.CreateDirectory(System.IO.Path.Combine(dir, "knowledge", f.Folder));
    }

    public void Load()
    {
        _byPath.Clear();
        foreach (var (folder, _, _, _) in Schema.Folders)
        {
            var dir = System.IO.Path.Combine(Know, folder);
            if (!Directory.Exists(dir)) continue;
            foreach (var p in Directory.EnumerateFiles(dir, "*.py"))
            {
                var r = TryRead(p, folder);
                if (r != null) _byPath[p] = r;
            }
        }
    }

    public List<string> LoadErrors { get; } = new();

    Record? TryRead(string path, string folder)
    {
        try { return Read(path, folder); }
        catch (Exception ex)
        {
            LoadErrors.Add($"{System.IO.Path.GetRelativePath(Root, path)}: {ex.Message}");
            return null;
        }
    }

    public static Record Read(string path, string folder) => Parse(File.ReadAllText(path, Encoding.UTF8), path, folder);

    public static Record Parse(string text, string path, string folder)
    {
        var p = new Literal.Parser(text);
        var fields = new Map();
        while (!p.End)
        {
            var name = p.Name();
            if (name == null) { p.SkipStatement(); continue; }
            var v = p.Value();
            // Как graph.read: берутся константы — имена в верхнем регистре.
            if (name.Any(char.IsLetter) && name == name.ToUpperInvariant()) fields.Add(new(Schema.KeyOf(name), v));
        }
        return new Record { Folder = folder, Path = path, Fields = fields };
    }

    // Файл записи — как render() в graph.py.
    public static string Render(Record r)
    {
        var title = r.Title;
        var doc = string.Join(" ", title.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
            .Replace("\"\"\"", "«»").Replace('\\', '/');
        var sb = new StringBuilder();
        sb.Append("# -*- coding: utf-8 -*-\n");
        sb.Append("\"\"\"").Append(doc).Append('\n');
        sb.Append('\n');
        sb.Append("Запись графа знаний проекта (knowledge/").Append(r.Folder).Append("). Файл — данные, не код:\n");
        sb.Append("читается разбором (tools/knowledge/graph.py), не исполняется.\n");
        sb.Append("\"\"\"\n");
        foreach (var (k, v) in r.Fields)
        {
            var head = Schema.ConstOf(k) + " = ";
            sb.Append(head).Append(Literal.Format(v, 0, head.Length)).Append('\n');
        }
        return sb.ToString();
    }

    static string Hash(string text) => Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(text)));

    // --- правка ---------------------------------------------------------

    public void Save(Record r)
    {
        var dir = System.IO.Path.Combine(Know, r.Folder);
        Directory.CreateDirectory(dir);
        var path = System.IO.Path.Combine(dir, Schema.FileName(r.Id));
        var text = Render(r);
        lock (_lock) _ownWrites[path] = Hash(text);
        File.WriteAllText(path, text, new UTF8Encoding(false));
        if (!string.Equals(r.Path, path, StringComparison.OrdinalIgnoreCase) && r.Path.Length > 0 && File.Exists(r.Path))
        {
            lock (_lock) _ownWrites[r.Path] = "deleted";
            File.Delete(r.Path);
            _byPath.Remove(r.Path);
        }
        r.Path = path;
        _byPath[path] = Read(path, r.Folder);
    }

    public void Delete(Record r)
    {
        lock (_lock) _ownWrites[r.Path] = "deleted";
        if (File.Exists(r.Path)) File.Delete(r.Path);
        _byPath.Remove(r.Path);
    }

    public Record Create(string folder, string title)
    {
        var id = Schema.Slug(title);
        var n = 2;
        while (ById(id) != null) id = $"{Schema.Slug(title)}-{n++}";
        var r = new Record { Folder = folder };
        r.Fields.Add(new("id", id));
        r.Fields.Add(new("вид", Schema.KindOf(folder)));
        r.Fields.Add(new("заголовок", title));
        r.Fields.Add(new("метки", new List<object?> { Schema.KindOf(folder) }));
        r.Fields.Add(new("статус", folder is "questions" or "tasks" ? "открыт" : "действует"));
        r.Fields.Add(new("дата", DateTime.Today.ToString("yyyy-MM-dd")));
        r.Fields.Add(new("источник", ""));
        r.Fields.Add(new("пункты", new List<object?>()));
        r.Fields.Add(new("связи", new List<object?>()));
        Save(r);
        return ById(id)!;
    }

    // Перенос в другую папку: вид — по новой папке; ссылки на запись ведут
    // по ID и не ломаются, у ссылок-«папок» в других записях — обновляется.
    public List<Record> Move(Record r, string folder)
    {
        var old = r.Folder;
        var c = r.Clone();
        c.Folder = folder;
        c.Fields["вид"] = Schema.KindOf(folder);
        Save(c);
        var touched = new List<Record>();
        foreach (var o in All.ToList())
        {
            var changed = false;
            foreach (var l in o.Links)
                if (l["куда"] as string == r.Id && l["папка"] as string == old) { l["папка"] = folder; changed = true; }
            if (changed) { Save(o); touched.Add(o); }
        }
        return touched;
    }

    // Входящие связи: кто ссылается на запись.
    public IEnumerable<(Record From, Map Link)> Incoming(string id) =>
        All.SelectMany(r => r.Links.Where(l => l["куда"] as string == id).Select(l => (r, l)));

    // --- слежение -----------------------------------------------------------

    public void Watch()
    {
        _ui = SynchronizationContext.Current;
        _watch = new FileSystemWatcher(Know, "*.py") { IncludeSubdirectories = true, NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size };
        _watch.Changed += (_, e) => Queue(e.FullPath);
        _watch.Created += (_, e) => Queue(e.FullPath);
        _watch.Deleted += (_, e) => Queue(e.FullPath);
        _watch.Renamed += (_, e) => { Queue(e.OldFullPath); Queue(e.FullPath); };
        _watch.Error += (_, _) => Queue("*");
        _watch.EnableRaisingEvents = true;
        _debounce = new System.Threading.Timer(_ => Flush(), null, Timeout.Infinite, Timeout.Infinite);
    }

    void Queue(string path)
    {
        lock (_lock) _pending.Add(path);
        // Пачка изменений (git checkout, пересборка реестра) — одним обновлением.
        _debounce?.Change(300, Timeout.Infinite);
    }

    void Flush()
    {
        string[] paths;
        lock (_lock) { paths = _pending.ToArray(); _pending.Clear(); }
        var changed = new List<(string Path, string Folder, string? Text)>();
        var full = paths.Contains("*");
        foreach (var p in full ? Directory.EnumerateFiles(Know, "*.py", SearchOption.AllDirectories).ToArray() : paths)
        {
            var folder = new DirectoryInfo(System.IO.Path.GetDirectoryName(p)!).Name;
            if (Schema.Folders.All(f => f.Folder != folder)) continue;
            string? text = null;
            for (var attempt = 0; attempt < 5; attempt++)
            {
                try { text = File.Exists(p) ? File.ReadAllText(p, Encoding.UTF8) : null; break; }
                catch (IOException) { Thread.Sleep(60); }
            }
            lock (_lock)
            {
                if (_ownWrites.TryGetValue(p, out var h) && (text == null ? h == "deleted" : h == Hash(text))) continue;
            }
            changed.Add((p, folder, text));
        }
        if (changed.Count == 0) return;
        void Apply(object? _)
        {
            var updated = new List<Record>();
            var removed = new List<string>();
            foreach (var (p, folder, text) in changed)
            {
                if (text == null)
                {
                    if (_byPath.Remove(p, out var old)) removed.Add(old.Id);
                    continue;
                }
                try
                {
                    var r = Parse(text, p, folder);
                    _byPath[p] = r;
                    updated.Add(r);
                }
                catch (Exception ex) { LoadErrors.Add($"{System.IO.Path.GetRelativePath(Root, p)}: {ex.Message}"); }
            }
            LastExternal = DateTime.Now;
            Changed?.Invoke(updated, removed);
        }
        if (_ui != null) _ui.Post(Apply, null); else Apply(null);
    }

    public void Dispose()
    {
        _watch?.Dispose();
        _debounce?.Dispose();
    }

    // --- проверка -------------------------------------------------------

    public List<(Record? Rec, string Text)> Check()
    {
        var o = new List<(Record?, string)>();
        foreach (var e in LoadErrors) o.Add((null, "не читается: " + e));
        var ids = new Dictionary<string, Record>();
        foreach (var r in All)
        {
            if (r.Id.Length == 0) { o.Add((r, "нет ID")); continue; }
            if (!string.Equals(System.IO.Path.GetFileName(r.Path), Schema.FileName(r.Id), StringComparison.OrdinalIgnoreCase))
                o.Add((r, $"имя файла не совпадает с ID {r.Id}"));
            if (ids.TryGetValue(r.Id, out var dup)) o.Add((r, $"ID {r.Id} уже есть в {dup.Folder}"));
            ids[r.Id] = r;
            if (string.IsNullOrWhiteSpace(r.Title)) o.Add((r, "нет заголовка"));
            if (r.Kind != Schema.KindOf(r.Folder)) o.Add((r, $"вид «{r.Kind}» не для папки {r.Folder}"));
            if (r.Status.Length > 0 && !Schema.Statuses.Contains(r.Status)) o.Add((r, $"неизвестный статус «{r.Status}»"));
            if (r.Folder is not ("concepts" or "fields") && r.Fields["метки"] is not List<object?>) o.Add((r, "нет меток"));
        }
        foreach (var r in All)
            foreach (var l in r.Links)
                if (l["куда"] is string to && !ids.ContainsKey(to)) o.Add((r, $"связь «{l["тип"]}» ведёт в несуществующую запись {to}"));
        return o;
    }

    // --- история (git) -----------------------------------------------------

    public sealed record Commit(string Hash, string Author, string Date, string Subject, string Body);

    public List<Commit> History(Record r)
    {
        var rel = System.IO.Path.GetRelativePath(Root, r.Path).Replace('\\', '/');
        var outp = Git("log", "--follow", "--date=format:%d.%m.%Y %H:%M", "--format=%h%x1f%an%x1f%ad%x1f%s%x1f%b%x1e", "--", rel);
        return outp.Split('\x1e', StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.Trim('\n', '\r').Split('\x1f'))
            .Where(x => x.Length >= 4)
            .Select(x => new Commit(x[0], x[1], x[2], x[3], x.Length > 4 ? x[4].Trim() : ""))
            .ToList();
    }

    // Незакоммиченные правки графа — сколько файлов.
    public int Uncommitted() => Git("status", "--porcelain", "--", "knowledge").Split('\n', StringSplitOptions.RemoveEmptyEntries).Length;

    public string Git(params string[] args)
    {
        try
        {
            var psi = new ProcessStartInfo("git") { WorkingDirectory = Root, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true, StandardOutputEncoding = Encoding.UTF8 };
            foreach (var a in args) psi.ArgumentList.Add(a);
            using var p = Process.Start(psi)!;
            var s = p.StandardOutput.ReadToEnd();
            p.WaitForExit(10000);
            return s;
        }
        catch (Exception) { return ""; }
    }
}
