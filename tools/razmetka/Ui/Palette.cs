using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace Razmetka.Ui;

// Палитра команд (Ctrl+K). Одно поле — команды, развороты и связи проекта
// (Superhuman, Linear, VS Code; uxpatterns.dev command-palette): нечёткий
// поиск, где начало слова важнее; на пустом запросе — недавние команды и
// команды для выбранного; у каждой строки — клавиша, поэтому палитра учит
// клавишам. Enter — выполнить, ↑/↓ — по списку, Esc — закрыть и вернуть
// фокус туда, где он был.
public sealed record PaletteItem(string Group, string Title, string Sub, string Keys, Action Run, string? Glyph = null);

public sealed class Palette : Border
{
    readonly TextBox _q = new() { FontSize = 15, BorderThickness = new Thickness(0), Padding = new Thickness(4, 6, 4, 6), Background = Brushes.Transparent };
    readonly ListBox _list = new() { BorderThickness = new Thickness(0), Background = Brushes.Transparent, MaxHeight = 420 };
    readonly TextBlock _placeholder = Kit.Text("Команда, разворот или связь…", 15, "Faint");
    Func<string, List<PaletteItem>> _source = _ => new();
    Action? _closed;

    public bool IsOpen => Visibility == Visibility.Visible;

    public Palette()
    {
        Visibility = Visibility.Collapsed;
        HorizontalAlignment = HorizontalAlignment.Center;
        VerticalAlignment = VerticalAlignment.Top;
        Margin = new Thickness(0, 72, 0, 0);
        Width = 620;
        Background = Kit.B("Card");
        BorderBrush = Kit.B("Line");
        BorderThickness = new Thickness(1);
        CornerRadius = new CornerRadius(8);

        ScrollViewer.SetHorizontalScrollBarVisibility(_list, ScrollBarVisibility.Disabled);

        var head = new Grid { Margin = new Thickness(14, 8, 14, 8) };
        head.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        head.ColumnDefinitions.Add(new ColumnDefinition());
        var icon = Kit.Icon("", 16, "Muted");
        icon.Margin = new Thickness(0, 0, 8, 0);
        head.Children.Add(icon);
        var qwrap = new Grid();
        _placeholder.IsHitTestVisible = false;
        _placeholder.VerticalAlignment = VerticalAlignment.Center;
        _placeholder.Margin = new Thickness(6, 0, 0, 0);
        qwrap.Children.Add(_placeholder);
        qwrap.Children.Add(_q);
        Grid.SetColumn(qwrap, 1);
        head.Children.Add(qwrap);

        var foot = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(14, 6, 14, 8) };
        void F(string k, string t)
        {
            foot.Children.Add(Kit.Kbd(k));
            var x = Kit.Text(t, 11, "Faint");
            x.Margin = new Thickness(4, 0, 14, 0);
            x.VerticalAlignment = VerticalAlignment.Center;
            foot.Children.Add(x);
        }
        F("Enter", "выполнить");
        F("↑+↓", "выбрать");
        F("Esc", "закрыть");

        var dock = new DockPanel();
        DockPanel.SetDock(head, Dock.Top);
        dock.Children.Add(head);
        var d1 = Kit.Divider(0);
        DockPanel.SetDock(d1, Dock.Top);
        dock.Children.Add(d1);
        var fw = new StackPanel();
        fw.Children.Add(Kit.Divider(0));
        fw.Children.Add(foot);
        DockPanel.SetDock(fw, Dock.Bottom);
        dock.Children.Add(fw);
        _list.Margin = new Thickness(6, 4, 6, 4);
        dock.Children.Add(_list);
        Child = dock;

        _q.TextChanged += (_, _) => { _placeholder.Visibility = _q.Text.Length == 0 ? Visibility.Visible : Visibility.Collapsed; Fill(); };
        _q.PreviewKeyDown += OnKey;
        _list.PreviewMouseLeftButtonUp += (_, _) => RunSelected();
    }

    public void Open(Func<string, List<PaletteItem>> source, Action closed, string query = "")
    {
        _source = source;
        _closed = closed;
        Visibility = Visibility.Visible;
        _q.Text = query;
        Fill();
        Dispatcher.BeginInvoke(() => { _q.Focus(); _q.SelectAll(); }, System.Windows.Threading.DispatcherPriority.Input);
    }

    public void Close()
    {
        if (!IsOpen) return;
        Visibility = Visibility.Collapsed;
        _closed?.Invoke();
    }

    // Для сценариев проверки: набрать запрос и выполнить первую строку.
    public string? RunFirst(string query)
    {
        _q.Text = query;
        Fill();
        var first = _list.Items.OfType<ListBoxItem>().FirstOrDefault(i => i.Tag is PaletteItem);
        if (first?.Tag is not PaletteItem p) return null;
        _list.SelectedItem = first;
        RunSelected();
        return p.Title;
    }

    void Fill()
    {
        _list.Items.Clear();
        var items = _source(_q.Text.Trim());
        string? group = null;
        foreach (var it in items)
        {
            if (it.Group != group)
            {
                group = it.Group;
                var gh = Kit.Text(it.Group, 11, "Faint", FontWeights.SemiBold);
                gh.Margin = new Thickness(8, _list.Items.Count == 0 ? 4 : 10, 0, 4);
                _list.Items.Add(new ListBoxItem { Content = gh, IsEnabled = false, Focusable = false, Padding = new Thickness(0) });
            }
            _list.Items.Add(new ListBoxItem { Tag = it, Content = Row(it), Padding = new Thickness(8, 6, 8, 6) });
        }
        if (items.Count == 0)
        {
            var none = Kit.Text("Ничего не найдено", 13, "Muted");
            none.Margin = new Thickness(8, 12, 8, 12);
            _list.Items.Add(new ListBoxItem { Content = none, IsEnabled = false });
        }
        _list.SelectedItem = _list.Items.OfType<ListBoxItem>().FirstOrDefault(i => i.Tag is PaletteItem);
        if (_list.SelectedItem != null) _list.ScrollIntoView(_list.SelectedItem);
    }

    static UIElement Row(PaletteItem it)
    {
        var g = new Grid();
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(28) });
        g.ColumnDefinitions.Add(new ColumnDefinition());
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        if (it.Glyph != null) g.Children.Add(Kit.Icon(it.Glyph, 14, "Muted"));
        var t = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        t.Children.Add(Kit.Text(it.Title, 13));
        if (it.Sub.Length > 0) t.Children.Add(Kit.Text(it.Sub, 11, "Muted"));
        Grid.SetColumn(t, 1);
        g.Children.Add(t);
        if (it.Keys.Length > 0)
        {
            var k = Kit.Kbd(it.Keys);
            k.Margin = new Thickness(12, 0, 0, 0);
            Grid.SetColumn(k, 2);
            g.Children.Add(k);
        }
        return g;
    }

    void Move(int step)
    {
        var rows = _list.Items.OfType<ListBoxItem>().Where(i => i.Tag is PaletteItem).ToList();
        if (rows.Count == 0) return;
        var i = rows.IndexOf(_list.SelectedItem as ListBoxItem ?? rows[0]);
        i = Math.Clamp(i + step, 0, rows.Count - 1);
        _list.SelectedItem = rows[i];
        _list.ScrollIntoView(rows[i]);
    }

    void OnKey(object s, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Down: Move(1); e.Handled = true; break;
            case Key.Up: Move(-1); e.Handled = true; break;
            case Key.Next: Move(8); e.Handled = true; break;
            case Key.Prior: Move(-8); e.Handled = true; break;
            case Key.Enter: RunSelected(); e.Handled = true; break;
            case Key.Escape: Close(); e.Handled = true; break;
        }
    }

    void RunSelected()
    {
        if (_list.SelectedItem is not ListBoxItem { Tag: PaletteItem p }) return;
        Close();
        p.Run();
    }

    // Нечёткое совпадение: все слова запроса есть в тексте; начало слова —
    // выше. Возвращает счёт (меньше — лучше) или -1.
    public static int Score(string text, string q)
    {
        if (q.Length == 0) return 0;
        var t = text.ToLowerInvariant();
        var score = 0;
        foreach (var w in q.ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var i = t.IndexOf(w, StringComparison.Ordinal);
            if (i < 0) return -1;
            var wordStart = i == 0 || !char.IsLetterOrDigit(t[i - 1]);
            score += (i == 0 ? 0 : wordStart ? 10 : 40) + i / 8;
        }
        return score;
    }
}
