using System.Windows;

namespace Razmetka;

// Запуск: без ключей — обычное окно. Ключи для проверок (tools/razmetka/README.md):
//   --open <папка проекта>   открыть проект сразу;
//   --script <файл.json>     прогнать сценарий проверки и закрыться.
public partial class App : Application
{
    public static bool Scripted { get; private set; }

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var args = e.Args;
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
