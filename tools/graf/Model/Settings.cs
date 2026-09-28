using System.Text.Json;

namespace Graf.Model;

// Настройки программы на этой машине: недавние проекты (последний
// открывается сам), закреплённые проекты, размеры панелей. Лежат в
// %LOCALAPPDATA%\Graf\settings.json — не в проекте и не в .claude: это
// удобство одного человека, а не знание проекта.
public sealed class Settings
{
    public sealed class Project
    {
        public string Path { get; set; } = "";
        public string Name { get; set; } = "";
        public DateTime Opened { get; set; }
        public bool Pinned { get; set; }
    }

    public List<Project> Recent { get; set; } = new();
    public double LeftWidth { get; set; } = 270;
    public double RightWidth { get; set; } = 460;
    public bool GroupByKind { get; set; }
    // Сортировка списка записей: kind | title | added | modified.
    public string SortBy { get; set; } = "kind";
    public bool SortDesc { get; set; }
    // Вкладка левой панели: «Оглавление» или «Фильтры».
    public string LeftTab { get; set; } = "toc";

    static string Dir => System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Graf");
    static string FilePath => System.IO.Path.Combine(Dir, "settings.json");

    public static Settings Load()
    {
        try { return JsonSerializer.Deserialize<Settings>(File.ReadAllText(FilePath)) ?? new(); }
        catch (Exception) { return new(); }
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(Dir);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception) { }
    }

    public void Touch(string path)
    {
        var p = Recent.FirstOrDefault(x => string.Equals(x.Path, path, StringComparison.OrdinalIgnoreCase));
        if (p == null)
        {
            p = new Project { Path = path, Name = new DirectoryInfo(path).Name };
            Recent.Add(p);
        }
        p.Opened = DateTime.Now;
        Save();
    }

    public void Forget(string path)
    {
        Recent.RemoveAll(x => string.Equals(x.Path, path, StringComparison.OrdinalIgnoreCase));
        Save();
    }

    // Порядок в списке: закреплённые, затем недавние.
    public IEnumerable<Project> Ordered => Recent.OrderByDescending(p => p.Pinned).ThenByDescending(p => p.Opened);

    public Project? Last => Recent.Where(p => Directory.Exists(p.Path)).OrderByDescending(p => p.Opened).FirstOrDefault();

    // Место узлов графа — отдельно для каждого проекта.
    public static string LayoutPath(string root)
    {
        var key = Convert.ToHexString(System.Security.Cryptography.SHA1.HashData(System.Text.Encoding.UTF8.GetBytes(root.ToLowerInvariant())))[..12];
        return System.IO.Path.Combine(Dir, "layout-" + key + ".json");
    }
}
