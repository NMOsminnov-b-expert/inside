using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Razmetka.Editor;

namespace Razmetka;

// Итог проверки разметки: список замечаний, двойной щелчок или Enter —
// перейти к месту.
public sealed class ChecksWindow : Window
{
    public ChecksWindow(MainWindow owner, List<Issue> issues)
    {
        Owner = owner;
        Title = "Проверка разметки";
        Width = 760;
        Height = 520;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        FontFamily = new FontFamily("Segoe UI");
        FontSize = 13;
        var errors = issues.Count(i => i.Error);
        var dock = new DockPanel { Margin = new Thickness(14) };
        var head = new TextBlock
        {
            Text = issues.Count == 0 ? "Замечаний нет."
                : $"Ошибок: {errors}, предупреждений: {issues.Count - errors}. Двойной щелчок — перейти к месту.",
            Margin = new Thickness(0, 0, 0, 10), FontWeight = FontWeights.SemiBold,
        };
        DockPanel.SetDock(head, Dock.Top);
        dock.Children.Add(head);
        var list = new ListBox { BorderThickness = new Thickness(1) };
        foreach (var i in issues.OrderByDescending(i => i.Error))
        {
            var row = new DockPanel { Margin = new Thickness(2, 4, 2, 4) };
            var tag = new Border
            {
                Background = Ui.Kit.B(i.Error ? "DangerSoft" : "WarnSoft"),
                CornerRadius = new CornerRadius(4), Padding = new Thickness(6, 0, 6, 0), Margin = new Thickness(0, 0, 10, 0),
                Child = new TextBlock
                {
                    Text = i.Error ? "ошибка" : "проверить", FontSize = 11, FontWeight = FontWeights.SemiBold,
                    Foreground = Ui.Kit.B(i.Error ? "Danger" : "Warn"),
                },
            };
            DockPanel.SetDock(tag, Dock.Left);
            row.Children.Add(tag);
            var txt = new StackPanel();
            txt.Children.Add(new TextBlock { Text = i.Text, TextWrapping = TextWrapping.Wrap });
            txt.Children.Add(new TextBlock { Text = $"{i.Chapter.Title} · {i.Sheet.Title}", FontSize = 11, Foreground = Ui.Kit.B("Muted") });
            row.Children.Add(txt);
            list.Items.Add(new ListBoxItem { Content = row, Tag = i });
        }
        void Go()
        {
            if (list.SelectedItem is ListBoxItem { Tag: Issue i }) owner.GoToIssue(i);
        }
        list.MouseDoubleClick += (_, _) => Go();
        list.KeyDown += (_, e) => { if (e.Key == System.Windows.Input.Key.Enter) Go(); };
        dock.Children.Add(list);
        Content = dock;
    }
}
