using Graf.Model;
using Graf.Views;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Graf;

// Ход обоих индексов в строке состояния: CodeGraph и поиск по смыслу —
// у каждого полоска и подпись (просьба пользователя 30.09.2026: «должны быть
// видны прогрессбары для обоих индексов со статусами. Иначе не видно,
// актуальная версия у нас или нет»).
//
// Прогон — tools/hooks/reindex.py (сам после коммита, хук
// tools/hooks/post-commit, или «Ещё» → «Обновить граф кода и связи по
// смыслу»); ход он пишет в .graf/index-status.json, программа опрашивает
// файл раз в две секунды. Полоска идёт, пока прогон идёт: сколько файлов
// обработает индекс по смыслу, заранее неизвестно, поэтому ход бегущий
// (HIG Progress indicators: неопределённый ход, когда объём неизвестен),
// а число обработанных файлов — в подписи. Прогон кончился — полоска полная
// и цветом говорит итог: зелёная — индекс на текущем коммите, оранжевая —
// на старом (после коммита прогона ещё не было), красная — ошибка.
public sealed partial class MainWindow
{
    sealed class IndexItem
    {
        public readonly StackPanel Root = new() { Orientation = Orientation.Horizontal, Spacing = 6, VerticalAlignment = VerticalAlignment.Center };
        public readonly ProgressBar Bar = new() { Width = 64, Minimum = 0, Maximum = 100, VerticalAlignment = VerticalAlignment.Center };
        public readonly TextBlock Text = new() { FontSize = 12, VerticalAlignment = VerticalAlignment.Center };
        public string Shown = "";

        public IndexItem(string name)
        {
            Root.Children.Add(new TextBlock { Text = name, FontSize = 12, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                Foreground = Hig.B("HigSecondary"), VerticalAlignment = VerticalAlignment.Center });
            Root.Children.Add(Bar);
            Root.Children.Add(Text);
            Text.Foreground = Hig.B("HigSecondary");
        }
    }

    IndexItem _ixCode = null!, _ixSem = null!;
    string _ixSeen = "";
    // Таймер — полем: из локальной переменной его забирает сборщик мусора,
    // и опрос тихо прекращается.
    Microsoft.UI.Dispatching.DispatcherQueueTimer? _ixTimer;

    void InitIndex()
    {
        _ixCode = new IndexItem("CodeGraph");
        _ixSem = new IndexItem("По смыслу");
        IndexHost.Children.Add(_ixCode.Root);
        IndexHost.Children.Add(_ixSem.Root);
        _ixTimer = DispatcherQueue.CreateTimer();
        _ixTimer.Interval = TimeSpan.FromSeconds(2);
        _ixTimer.Tick += (_, _) => PollIndex();
        _ixTimer.Start();
        PollIndex();
    }

    void PollIndex()
    {
        if (Store == null) return;
        var root = Store.Root;
        var (code, sem) = IndexStatus.Load(root);
        var head = IndexStatus.Head(root);
        Show(_ixCode, code, head);
        Show(_ixSem, sem, head);

        // Прогон закончился — выгрузки новые: перечитать их.
        var seen = $"{code.Finished}|{sem.Finished}";
        if (_ixSeen != "" && seen != _ixSeen && code.State != "running" && sem.State != "running")
        {
            LoadDerived();
            if (_code) BuildCodePane();
            Refresh();
        }
        _ixSeen = seen;
    }

    static void Show(IndexItem it, IndexState s, string head)
    {
        var v = s.Verdict(head);
        var at = s.Finished is { } f ? f.ToString(f.Date == DateTime.Today ? "HH:mm" : "dd.MM HH:mm") : "";
        string text = v switch
        {
            "running" => s.Key == "semsearch" && s.Files > 0 ? $"{s.Stage} · файлов {s.Files}" : s.Stage,
            "current" => $"актуален · {at}",
            "behind" => $"отстаёт · {at}",
            "failed" => $"ошибка · {at}",
            "broken" => "прогон оборвался",
            "skipped" => "не установлен",
            _ => "нет сведений",
        };
        var color = v switch
        {
            "current" => "HigGreen",
            "behind" or "broken" => "HigOrange",
            "failed" => "HigRed",
            "running" => "HigAccent",
            _ => "HigSecondary",
        };
        var key = v + "|" + text;
        if (key == it.Shown) return;
        it.Shown = key;

        it.Bar.IsIndeterminate = v == "running";
        it.Bar.Value = v is "current" or "behind" or "failed" or "broken" ? 100 : 0;
        it.Bar.Foreground = Hig.B(color);
        it.Text.Text = text;
        it.Text.Foreground = v is "current" or "running" ? Hig.B("HigSecondary") : Hig.B(color);

        var tip = new List<string>
        {
            s.Key == "codegraph" ? "Индекс CodeGraph — поиск по словам и граф кода" : "Индекс semsearch — поиск по смыслу и связи «похоже по смыслу»",
        };
        tip.Add(v switch
        {
            "running" => "Идёт обновление" + (s.Stage != "" ? ": " + s.Stage : ""),
            "current" => "Актуален: построен на текущем коммите",
            "behind" => "Построен на прежнем коммите — после коммита обновления ещё не было",
            "failed" => "Последний прогон завершился ошибкой" + (s.Note != "" ? ": " + s.Note : ""),
            "broken" => "Прогон оборвался, не закончив; запустить заново — «Ещё» → «Обновить граф кода и связи по смыслу»",
            "skipped" => "Поиск по смыслу на этой машине не установлен",
            _ => "Прогона ещё не было: «Ещё» → «Обновить граф кода и связи по смыслу»",
        });
        if (s.Commit != "") tip.Add("Коммит прогона: " + s.Commit[..Math.Min(10, s.Commit.Length)]);
        if (s.Finished is { } fin) tip.Add("Закончен: " + fin.ToString("dd.MM.yyyy HH:mm:ss"));
        if (s.Key == "semsearch" && (s.Files > 0 || s.Chunks > 0)) tip.Add($"Обработано файлов {s.Files}, фрагментов {s.Chunks}");
        tip.Add("Журнал — .graf/reindex.log");
        ToolTipService.SetToolTip(it.Root, string.Join("\n", tip));
    }

    // Подписи для сценариев проверки (ScriptRunner, шаг indexstatus).
    public string IndexText() { PollIndex(); return $"CodeGraph: {_ixCode.Text.Text}; По смыслу: {_ixSem.Text.Text}"; }

    // «Ещё» → «Обновить граф кода и связи по смыслу» — тот же прогон, что
    // после коммита; ход показывают полоски, выгрузки перечитываются по его
    // окончании.
    void StartReindex()
    {
        if (Store == null) return;
        try
        {
            var psi = new System.Diagnostics.ProcessStartInfo("python", "tools/hooks/reindex.py")
            {
                WorkingDirectory = Store.Root, UseShellExecute = false, CreateNoWindow = true,
            };
            System.Diagnostics.Process.Start(psi);
            Status("Обновляю оба индекса — ход в строке состояния");
        }
        catch (Exception ex) { Status("Не запустилось: " + ex.Message); }
    }
}
