using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Razmetka.Editor;
using Razmetka.Ui;

namespace Razmetka;

// Итог проверки разметки: список замечаний, двойной щелчок или Enter —
// перейти к месту.
//
// Цвета — ссылкой на ресурсы темы (обход тёмной темы 27.10.2026: окно
// оставалось белым с белым текстом), список без прокрутки вбок — длинное
// замечание переносится по ширине окна, а не уходит за правый край.
public sealed class ChecksWindow : Window
{
    public ChecksWindow(MainWindow owner, List<Issue> issues)
    {
        Owner = owner;
        Title = "Проверка разметки";
        Width = 760;
        Height = 520;
        MinWidth = 420;
        MinHeight = 300;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        FontSize = 13;
        SetResourceReference(BackgroundProperty, "Panel");
        SetResourceReference(ForegroundProperty, "Ink");
        SetResourceReference(FontFamilyProperty, "UiFont");
        var errors = issues.Count(i => i.Error);
        var dock = new DockPanel();
        var head = Kit.Text(issues.Count == 0 ? "Замечаний нет."
                : $"Ошибок: {errors}, предупреждений: {issues.Count - errors}. Двойной щелчок или Enter — перейти к месту.",
            13, "Ink", FontWeights.SemiBold, wrap: true);
        head.Margin = new Thickness(0, 0, 0, 10);
        DockPanel.SetDock(head, Dock.Top);
        dock.Children.Add(head);
        var list = new ListBox { BorderThickness = new Thickness(1), Padding = new Thickness(2) };
        list.SetResourceReference(BackgroundProperty, "Card");
        list.SetResourceReference(BorderBrushProperty, "Line");
        ScrollViewer.SetHorizontalScrollBarVisibility(list, ScrollBarVisibility.Disabled);
        foreach (var i in issues.OrderByDescending(i => i.Error))
        {
            var row = new DockPanel { Margin = new Thickness(2, 4, 2, 4) };
            var tag = new Border
            {
                Background = Kit.B(i.Error ? "DangerSoft" : "WarnSoft"), VerticalAlignment = VerticalAlignment.Top,
                CornerRadius = new CornerRadius(4), Padding = new Thickness(6, 1, 6, 1), Margin = new Thickness(0, 1, 10, 0),
                Child = Kit.Text(i.Error ? "ошибка" : "проверить", 11, i.Error ? "Danger" : "Warn", FontWeights.SemiBold),
            };
            DockPanel.SetDock(tag, Dock.Left);
            row.Children.Add(tag);
            var txt = new StackPanel();
            txt.Children.Add(Kit.Text(i.Text, 13, "Ink", wrap: true));
            var where = Kit.Text($"{i.Chapter.Title} · {i.Sheet.Title}", 11, "Muted", wrap: true);
            where.Margin = new Thickness(0, 2, 0, 0);
            txt.Children.Add(where);
            row.Children.Add(txt);
            list.Items.Add(new ListBoxItem { Content = row, Tag = i, HorizontalContentAlignment = HorizontalAlignment.Stretch });
        }
        void Go()
        {
            if (list.SelectedItem is ListBoxItem { Tag: Issue i }) owner.GoToIssue(i);
        }
        list.MouseDoubleClick += (_, _) => Go();
        list.KeyDown += (_, e) => { if (e.Key == System.Windows.Input.Key.Enter) Go(); };
        dock.Children.Add(list);
        // Отступ — внутри рамки с фоном темы, а не полем вокруг содержимого.
        var root = new Border { Padding = new Thickness(16, 14, 16, 16), Child = dock };
        root.SetResourceReference(Border.BackgroundProperty, "Panel");
        Content = root;
    }
}
