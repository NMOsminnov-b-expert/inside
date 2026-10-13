using System.Text.Json;

namespace Graf.Model;

// Мультиграф (решение пользователя 13.10.2026: «Вынеси данные оттуда в
// отдельный граф… Просто будешь указывать, из какого проекта тебе оно надо… и
// между проектами поиск по всем графам тоже. Пускай это будет мультиграф»).
// Граф — папка с knowledge/; список графов — %LOCALAPPDATA%\Graf\multigraph.json
// (его же пишет и читает tools/knowledge/graph.py: «graphs add», «--all») и
// недавние проекты программы. Записи остальных графов читаются только для
// поиска — без слежения за файлами и без схемы их папок: открыть запись —
// значит открыть её граф.
public static class Multigraph
{
    public sealed record Graph(string Name, string Root);

    sealed class Doc { public List<Settings.Project> Graphs { get; set; } = new(); }

    static string FilePath => System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Graf", "multigraph.json");

    static Doc Read()
    {
        try { return JsonSerializer.Deserialize<Doc>(File.ReadAllText(FilePath)) ?? new(); }
        catch (Exception) { return new(); }
    }

    // Открытый в программе проект — тоже граф мультиграфа.
    public static void Add(string root)
    {
        var d = Read();
        if (d.Graphs.Any(g => string.Equals(g.Path, root, StringComparison.OrdinalIgnoreCase))) return;
        d.Graphs.Add(new Settings.Project { Path = root, Name = new DirectoryInfo(root).Name });
        try
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(FilePath)!);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(d, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception) { }
    }

    // Графы, добавленные снаружи (graph.py graphs add), — в список проектов
    // программы, чтобы их было видно в меню проекта и на стартовом экране.
    public static void MergeInto(Settings s)
    {
        foreach (var g in Read().Graphs)
            if (Directory.Exists(System.IO.Path.Combine(g.Path, "knowledge"))
                && !s.Recent.Any(p => string.Equals(p.Path, g.Path, StringComparison.OrdinalIgnoreCase)))
                s.Recent.Add(new Settings.Project { Path = g.Path, Name = new DirectoryInfo(g.Path).Name });
    }

    public static List<Graph> Others(Settings s, string? current) =>
        Read().Graphs.Concat(s.Recent)
            .Where(p => Directory.Exists(System.IO.Path.Combine(p.Path, "knowledge"))
                        && !string.Equals(p.Path, current, StringComparison.OrdinalIgnoreCase))
            .GroupBy(p => p.Path.ToLowerInvariant()).Select(g => g.First())
            .Select(p => new Graph(new DirectoryInfo(p.Path).Name, p.Path)).ToList();

    static readonly Dictionary<string, (DateTime At, List<Record> Recs)> Cache = new(StringComparer.OrdinalIgnoreCase);

    // Записи графа: читаются раз в минуту, не чаще, — поиск идёт по нажатиям.
    public static List<Record> Records(string root)
    {
        lock (Cache)
        {
            if (Cache.TryGetValue(root, out var c) && DateTime.Now - c.At < TimeSpan.FromMinutes(1)) return c.Recs;
            var recs = new List<Record>();
            var know = System.IO.Path.Combine(root, "knowledge");
            foreach (var dir in Directory.Exists(know) ? Directory.GetDirectories(know) : Array.Empty<string>())
            {
                var folder = System.IO.Path.GetFileName(dir);
                if (folder.StartsWith('.') || folder == "__pycache__") continue;
                foreach (var f in Directory.GetFiles(dir, "*.py"))
                {
                    try { recs.Add(Store.Read(f, folder)); } catch (Exception) { }
                }
            }
            Cache[root] = (DateTime.Now, recs);
            return recs;
        }
    }

    // Найденное в остальных графах: все слова в тексте записи, выше — где
    // слова в заголовке.
    public static List<(Graph G, Record R)> Find(IEnumerable<Graph> graphs, string[] words, int top)
    {
        if (words.Length == 0) return new();
        return graphs.SelectMany(g => Records(g.Root).Where(r => words.All(w => r.Haystack.Contains(w))).Select(r => (g, r)))
            .OrderByDescending(x => words.Count(w => x.r.Title.ToLowerInvariant().Contains(w)))
            .ThenBy(x => x.r.Title).Take(top).ToList();
    }
}
