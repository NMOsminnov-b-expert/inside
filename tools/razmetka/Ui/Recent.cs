using System.IO;
using System.Text.Json;

namespace Razmetka.Ui;

// Недавние проекты — для стартового экрана: без них каждый запуск начинается с
// поиска папки в проводнике. Хранятся на этой машине, в
// %LOCALAPPDATA%\Razmetka\recent.json (рядом с черновиками), — это настройка
// рабочего места, а не данные проекта.
public static class Recent
{
    public sealed record Entry(string Dir, string Title, DateTime At);

    static string File0 => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Razmetka", "recent.json");

    public static List<Entry> Load()
    {
        try
        {
            if (!File.Exists(File0)) return new();
            return JsonSerializer.Deserialize<List<Entry>>(File.ReadAllText(File0)) ?? new();
        }
        catch (Exception) { return new(); }
    }

    public static void Touch(string dir, string title)
    {
        var list = Load().Where(e => !string.Equals(Path.GetFullPath(e.Dir), Path.GetFullPath(dir), StringComparison.OrdinalIgnoreCase)).ToList();
        list.Insert(0, new Entry(dir, title, DateTime.Now));
        Save(list.Take(12).ToList());
    }

    public static void Forget(string dir) =>
        Save(Load().Where(e => !string.Equals(e.Dir, dir, StringComparison.OrdinalIgnoreCase)).ToList());

    static void Save(List<Entry> list)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(File0)!);
            File.WriteAllText(File0, JsonSerializer.Serialize(list, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception) { }
    }
}
