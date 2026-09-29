using System.IO;
using System.Text.Json;

namespace Razmetka.Ui;

// Настройки рабочего места — тема и переназначенные клавиши. Хранятся на этой
// машине, в %LOCALAPPDATA%\Razmetka\settings.json (рядом с недавними
// проектами и черновиками): это привычки пользователя, а не данные проекта.
// Практика razmetka-dokumentov-perenaznachenie-klavish-i-temnaya-tema.
public sealed class Settings
{
    // "system" — как в Windows, "light", "dark".
    public string Theme { get; set; } = "system";
    // Команда → её клавиши (Chord.Serialize). Только изменённые: остальные —
    // из реестра команд; «Сбросить» удаляет запись.
    public Dictionary<string, List<string>> Keys { get; set; } = new();

    static string Path0 => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Razmetka", "settings.json");

    // Сценарии проверки не трогают настройки пользователя.
    public static bool ReadOnly { get; set; }

    public static Settings Load()
    {
        try
        {
            if (!ReadOnly && File.Exists(Path0)) return JsonSerializer.Deserialize<Settings>(File.ReadAllText(Path0)) ?? new();
        }
        catch (Exception) { }
        return new();
    }

    public void Save()
    {
        if (ReadOnly) return;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path0)!);
            File.WriteAllText(Path0, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception) { }
    }
}
