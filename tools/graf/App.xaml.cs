using Microsoft.UI.Xaml;

namespace Graf;

// Запуск: без ключей — окно. Ключи для проверок (README):
//   --root <папка репозитория>   где граф (иначе ищется от текущей папки и от программы);
//   --selftest <отчёт>           сверка формата с graph.py и выход;
//   --script <сценарий.json>     прогон сценария проверки и выход.
public partial class App : Application
{
    public static string[] Args { get; private set; } = Array.Empty<string>();
    MainWindow? _w;

    public App()
    {
        InitializeComponent();
        // Необработанное исключение — в журнал %TEMP%\graf-crash.log: без него
        // WinUI падает с кодом 0xc000027b без подробностей.
        UnhandledException += (_, e) => System.IO.File.AppendAllText(System.IO.Path.Combine(System.IO.Path.GetTempPath(), "graf-crash.log"), DateTime.Now + " " + e.Exception + Environment.NewLine);
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        Args = Environment.GetCommandLineArgs().Skip(1).ToArray();
        string? Opt(string name) { var i = Array.IndexOf(Args, name); return i >= 0 && i + 1 < Args.Length ? Args[i + 1] : null; }
        // Проект: ключ --root, иначе последний открытый, иначе поиск от
        // текущей папки. Не нашёлся — окно откроется со списком проектов.
        var root = Opt("--root") ?? Model.Settings.Load().Last?.Path
            ?? Model.Store.FindRoot(Environment.CurrentDirectory, AppContext.BaseDirectory);
        if (Opt("--selftest") is { } rep)
        {
            var code = root == null ? 2 : SelfTest.Run(root, rep);
            Environment.Exit(code);
            return;
        }
        _w = new MainWindow(root, Opt("--script"), remember: Opt("--script") == null);
        _w.Activate();
    }
}
