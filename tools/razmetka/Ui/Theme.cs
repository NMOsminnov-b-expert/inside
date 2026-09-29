using System.Windows;
using System.Windows.Media;
using Microsoft.Win32;

namespace Razmetka.Ui;

// Тема оформления (практика razmetka-dokumentov-perenaznachenie-klavish-i-
// temnaya-tema): у каждой кисти — светлое и тёмное значение; переключение
// подменяет кисти в ресурсах приложения, разметка берёт их через
// DynamicResource, а построенное кодом перестраивается. Темнеет только
// интерфейс и фон вокруг разворота: сам разворот, документы, снимки и
// экспорт — своих цветов (Figma: цвета холста при смене темы не меняются).
public static class Theme
{
    static readonly (string Key, string Light, string Dark)[] Tokens =
    {
        ("Ground", "#F3F4F6", "#1B1C1F"),
        ("Panel", "#FAFAFB", "#232428"),
        ("Card", "#FFFFFF", "#2C2E33"),
        ("Line", "#E3E5E9", "#393B41"),
        ("LineStrong", "#CDD1D8", "#4B4E55"),
        ("Ink", "#1B1F24", "#ECEEF1"),
        ("Muted", "#5E6672", "#A7ADB6"),
        ("Faint", "#8C939E", "#7D838D"),
        ("Hover", "#EEF0F3", "#33353B"),
        ("Pressed", "#E4E7EB", "#3D4046"),
        ("Accent", "#0067C0", "#3B8EEA"),
        ("AccentHover", "#1975C5", "#5AA0EE"),
        ("AccentSoft", "#E6F0FA", "#1D3550"),
        ("AccentText", "#005299", "#8EC3F7"),
        ("Danger", "#C42B1C", "#FF7B6E"),
        ("DangerSoft", "#FDE7E9", "#4A2624"),
        ("Warn", "#9D5D00", "#F2B558"),
        ("WarnSoft", "#FFF4CE", "#4A3B1F"),
        ("Ok", "#0F7B0F", "#6CCB5F"),
        ("Dark", "#E61F2328", "#F00F1013"),
    };

    public static bool IsDark { get; private set; }
    public static string Mode { get; private set; } = "system";
    public static event Action? Changed;

    public static void Init(string mode)
    {
        Mode = mode;
        Apply();
        SystemEvents.UserPreferenceChanged += (_, e) =>
        {
            if (e.Category == UserPreferenceCategory.General && Mode == "system")
                Application.Current.Dispatcher.BeginInvoke(Apply);
        };
    }

    public static void Set(string mode)
    {
        Mode = mode;
        Apply();
    }

    // Тема Windows для приложений: HKCU…\Personalize, AppsUseLightTheme.
    static bool SystemDark()
    {
        try
        {
            using var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            return k?.GetValue("AppsUseLightTheme") is int v && v == 0;
        }
        catch (Exception) { return false; }
    }

    static void Apply()
    {
        var dark = Mode == "dark" || (Mode == "system" && SystemDark());
        var first = !_applied;
        _applied = true;
        if (!first && dark == IsDark) return;
        IsDark = dark;
#pragma warning disable WPF0001
        Application.Current.ThemeMode = dark ? ThemeMode.Dark : ThemeMode.Light;
#pragma warning restore WPF0001
        var res = Application.Current.Resources;
        foreach (var (key, light, darkHex) in Tokens)
        {
            var b = new SolidColorBrush((Color)ColorConverter.ConvertFromString(dark ? darkHex : light));
            b.Freeze();
            res[key] = b;
        }
        Editor.SheetView.SetDark(dark);
        Changed?.Invoke();
    }

    static bool _applied;

    public static string Label(string mode) => mode switch { "dark" => "Тёмная", "light" => "Светлая", _ => "Как в Windows" };
}
