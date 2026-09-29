using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;

namespace Razmetka.Ui;

// Поле с подсказками из уже введённого в проекте: графы документа — из связей
// той же главы, поля системы — из всего проекта. Одно и то же поле системы
// встречается в десятках связей, и набирать его заново — долго и с опечатками
// (практика interfeys-razmetki-dokumentov-klavishi-palitra-komand-inspektor-
// po-vyb: быстрая разметка подряд).
//
// Клавиши: ↓/↑ — по подсказкам, Enter или Tab — взять подсказку (если она
// выбрана стрелкой; иначе Enter уходит карточке — «готово»), Esc — закрыть
// подсказки (второй Esc — карточке).
public sealed class AutoBox : Grid
{
    public TextBox Box { get; } = Kit.Box();
    readonly Popup _pop = new() { Placement = PlacementMode.Bottom, StaysOpen = false, AllowsTransparency = true };
    readonly ListBox _list = new() { MaxHeight = 220, BorderThickness = new Thickness(0), Padding = new Thickness(2) };
    readonly Func<string, IEnumerable<string>> _source;
    bool _picking;

    public string Text { get => Box.Text; set => Box.Text = value; }

    public AutoBox(Func<string, IEnumerable<string>> source, bool multi = false)
    {
        _source = source;
        if (multi) { Box.TextWrapping = TextWrapping.Wrap; Box.MinHeight = 52; Box.VerticalContentAlignment = VerticalAlignment.Top; }
        Children.Add(Box);
        _pop.PlacementTarget = Box;
        _pop.Child = new Border
        {
            Background = Kit.B("Card"), BorderBrush = Kit.B("Line"), BorderThickness = new Thickness(1),
            CornerRadius = new CornerRadius(8), Padding = new Thickness(2), Margin = new Thickness(0, 4, 8, 8), Child = _list,
            Effect = new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 14, ShadowDepth = 2, Opacity = 0.16, Direction = 270 },
        };
        ScrollViewer.SetHorizontalScrollBarVisibility(_list, ScrollBarVisibility.Disabled);
        Children.Add(_pop);
        Box.TextChanged += (_, _) => { if (!_picking && Box.IsKeyboardFocused) Suggest(); };
        Box.LostKeyboardFocus += (_, _) => { if (!_list.IsKeyboardFocusWithin) _pop.IsOpen = false; };
        Box.PreviewKeyDown += OnKey;
        _list.PreviewMouseLeftButtonUp += (_, e) =>
        {
            if (e.OriginalSource is FrameworkElement { DataContext: string s }) Pick(s);
            else if (_list.SelectedItem is ListBoxItem { Tag: string t }) Pick(t);
        };
    }

    public bool SuggestionsOpen => _pop.IsOpen;

    void Suggest()
    {
        var q = Box.Text.Trim();
        var items = _source(q).Where(s => !string.Equals(s, q, StringComparison.OrdinalIgnoreCase)).Take(12).ToList();
        _list.Items.Clear();
        foreach (var s in items)
            _list.Items.Add(new ListBoxItem
            {
                Tag = s, Padding = new Thickness(8, 5, 8, 5),
                Content = new TextBlock { Text = s, TextWrapping = TextWrapping.Wrap, MaxWidth = Math.Max(200, Box.ActualWidth - 24), DataContext = s },
            });
        _pop.Width = Math.Max(220, Box.ActualWidth + 8);
        _pop.IsOpen = items.Count > 0;
    }

    void Pick(string s)
    {
        _picking = true;
        Box.Text = s;
        Box.CaretIndex = s.Length;
        _picking = false;
        _pop.IsOpen = false;
        Box.Focus();
    }

    void OnKey(object sender, KeyEventArgs e)
    {
        if (!_pop.IsOpen)
        {
            if (e.Key == Key.Down && Keyboard.Modifiers == ModifierKeys.None && Box.TextWrapping == TextWrapping.NoWrap) { Suggest(); e.Handled = _pop.IsOpen; }
            return;
        }
        switch (e.Key)
        {
            case Key.Down:
                _list.SelectedIndex = Math.Min(_list.Items.Count - 1, _list.SelectedIndex + 1);
                _list.ScrollIntoView(_list.SelectedItem);
                e.Handled = true;
                break;
            case Key.Up:
                _list.SelectedIndex = Math.Max(-1, _list.SelectedIndex - 1);
                e.Handled = true;
                break;
            case Key.Enter or Key.Tab when _list.SelectedItem is ListBoxItem { Tag: string s } && Keyboard.Modifiers == ModifierKeys.None:
                Pick(s);
                e.Handled = true;
                break;
            case Key.Escape:
                _pop.IsOpen = false;
                e.Handled = true;
                break;
            default:
                if (e.Key is Key.Enter or Key.Tab) _pop.IsOpen = false;
                break;
        }
    }

    // Подсказки из списка значений: сначала начинающиеся с набранного, потом
    // содержащие все набранные слова; пусто — самые частые.
    public static IEnumerable<string> Rank(IEnumerable<string> values, string q)
    {
        var groups = values.Where(v => !string.IsNullOrWhiteSpace(v)).GroupBy(v => v.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(g => (Text: g.Key, N: g.Count())).ToList();
        if (q.Length == 0) return groups.OrderByDescending(g => g.N).ThenBy(g => g.Text).Select(g => g.Text);
        var words = q.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return groups
            .Where(g => words.All(w => g.Text.Contains(w, StringComparison.OrdinalIgnoreCase)))
            .OrderBy(g => g.Text.StartsWith(q, StringComparison.OrdinalIgnoreCase) ? 0 : 1)
            .ThenByDescending(g => g.N).ThenBy(g => g.Text)
            .Select(g => g.Text);
    }
}
