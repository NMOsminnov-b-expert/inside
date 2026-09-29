using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace Razmetka.Ui;

// Шпаргалка по клавишам (F1): все команды реестра с клавишами, по группам,
// в три колонки. Строится из того же реестра, что и обработка клавиш, —
// поэтому показывает ровно то, что работает. Esc, F1 или щелчок мимо —
// закрыть.
public sealed class Cheatsheet : Grid
{
    Action? _closed;
    public bool IsOpen => Visibility == Visibility.Visible;

    public Cheatsheet()
    {
        Visibility = Visibility.Collapsed;
        Background = new SolidColorBrush(Color.FromArgb(0x55, 0x10, 0x14, 0x18));
        MouseLeftButtonDown += (_, e) => { if (e.OriginalSource == this) Close(); };
        PreviewKeyDown += (_, e) => { if (e.Key is Key.Escape or Key.F1) { Close(); e.Handled = true; } };
        Focusable = true;
    }

    public void Open(CommandSet cmds, Action closed)
    {
        _closed = closed;
        Children.Clear();
        var groups = cmds.All.Where(c => c.KeyLabel.Length > 0).GroupBy(c => c.Group).ToList();
        var cols = new Grid();
        for (var i = 0; i < 3; i++) cols.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var stacks = Enumerable.Range(0, 3).Select(i =>
        {
            var s = new StackPanel { Margin = new Thickness(i == 0 ? 0 : 20, 0, 0, 0) };
            Grid.SetColumn(s, i);
            cols.Children.Add(s);
            return s;
        }).ToArray();
        // Раскладка по колонкам — по числу строк, чтобы колонки вышли ровными.
        var heights = new int[3];
        foreach (var g in groups)
        {
            var col = Array.IndexOf(heights, heights.Min());
            var s = stacks[col];
            var h = Kit.Text(g.Key, 12, "Accent", FontWeights.SemiBold);
            h.Margin = new Thickness(0, s.Children.Count == 0 ? 0 : 16, 0, 6);
            s.Children.Add(h);
            // Команды с одной и той же подписью клавиш (служебные) — одной строкой.
            foreach (var c in g.GroupBy(c => c.InPalette ? c.Id : c.KeysText ?? c.Id).Select(x => x.First()))
            {
                var row = new DockPanel { Margin = new Thickness(0, 3, 0, 3) };
                var k = Kit.Kbd(c.KeyLabel);
                k.Margin = new Thickness(12, 0, 0, 0);
                DockPanel.SetDock(k, Dock.Right);
                row.Children.Add(k);
                row.Children.Add(Kit.Text(c.InPalette ? c.Title : c.Hint.Length > 0 ? c.Hint : c.Title, 13, wrap: true));
                s.Children.Add(row);
                heights[col]++;
            }
            heights[col] += 2;
        }
        var head = new DockPanel { Margin = new Thickness(0, 0, 0, 16) };
        var close = Kit.IconBtn("", "Закрыть — Esc", Close, 12, "Muted");
        DockPanel.SetDock(close, Dock.Right);
        head.Children.Add(close);
        var title = new StackPanel();
        title.Children.Add(Kit.Text("Клавиши", 20, "Ink", FontWeights.SemiBold));
        var sub = Kit.Text("Буквы инструментов работают везде, кроме полей ввода, — там они печатают текст; стрелки, Tab, Enter и Delete — когда фокус на полотне. Раскладка не важна: V и «М» — одна клавиша.", 12, "Muted", wrap: true);
        sub.Margin = new Thickness(0, 2, 0, 0);
        title.Children.Add(sub);
        head.Children.Add(title);
        var body = new DockPanel();
        DockPanel.SetDock(head, Dock.Top);
        body.Children.Add(head);
        body.Children.Add(new ScrollViewer { Content = cols, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        var card = Kit.Card(body, new Thickness(24, 20, 24, 20));
        card.MaxWidth = 1040;
        card.Margin = new Thickness(40);
        card.VerticalAlignment = VerticalAlignment.Center;
        Children.Add(card);
        Visibility = Visibility.Visible;
        Dispatcher.BeginInvoke(() => Focus(), System.Windows.Threading.DispatcherPriority.Input);
    }

    public void Close()
    {
        if (!IsOpen) return;
        Visibility = Visibility.Collapsed;
        _closed?.Invoke();
    }
}
