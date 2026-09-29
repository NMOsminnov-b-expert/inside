using System.Windows;

namespace Razmetka;

// Запуск: без ключей — обычное окно. Ключи для проверок (tools/razmetka/README.md):
//   --open <папка проекта>   открыть проект сразу;
//   --script <файл.json>     прогнать сценарий проверки и закрыться.
public partial class App : Application
{
    public static bool Scripted { get; private set; }

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var args = e.Args;
        // Дочерний процесс для PDF (Model/PdfPages.cs): без окна; выход —
        // сразу после записи, не дожидаясь закрытия движка PDF.
        if (args.Length >= 2 && args[0] is "--pdf-count" or "--pdf-render")
        {
            ShutdownMode = ShutdownMode.OnExplicitShutdown;
            var code = 0;
            try
            {
                if (args[0] == "--pdf-count") Console.Out.Write(await Model.PdfPages.CountHere(args[1]));
                else await Model.PdfPages.RenderHere(args[1], int.Parse(args[2]),
                    double.Parse(args[3], System.Globalization.CultureInfo.InvariantCulture), args[4]);
            }
            catch (Exception) { code = 1; }
            Console.Out.Flush();
            System.Diagnostics.Process.GetCurrentProcess().Kill();
            Environment.Exit(code);
            return;
        }
        string? open = null, script = null;
        for (var i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == "--open") open = args[i + 1];
            if (args[i] == "--script") script = args[i + 1];
        }
        Scripted = script != null;
        var w = new MainWindow();
        w.Show();
        if (open != null) w.OpenDir(open, askDraft: !Scripted);
        if (script != null) _ = ScriptRunner.Run(w, script);
    }
}
