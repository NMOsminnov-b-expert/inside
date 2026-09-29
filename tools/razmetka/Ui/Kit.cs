using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;

namespace Razmetka.Ui;

// Детали интерфейса, из которых собираются инспектор, навигатор и
// всплывающие панели: все отступы и размеры — здесь, по шагу 4 (Fluent 2).
public static class Kit
{
    public static Brush B(string key) => (Brush)Application.Current.Resources[key];
    public static Style S(string key) => (Style)Application.Current.Resources[key];
    public static FontFamily Icons => (FontFamily)Application.Current.Resources["IconFont"];

    public static TextBlock Text(string s, double size = 13, string brush = "Ink", FontWeight? weight = null, bool wrap = false) => new()
    {
        Text = s, FontSize = size, Foreground = B(brush), FontWeight = weight ?? FontWeights.Normal,
        TextWrapping = wrap ? TextWrapping.Wrap : TextWrapping.NoWrap,
        TextTrimming = wrap ? TextTrimming.None : TextTrimming.CharacterEllipsis,
    };

    public static TextBlock Icon(string glyph, double size = 14, string brush = "Ink") => new()
    {
        Text = glyph, FontFamily = Icons, FontSize = size, Foreground = B(brush), VerticalAlignment = VerticalAlignment.Center,
    };

    // Заголовок раздела инспектора: подпись и справа — необязательное действие.
    public static FrameworkElement Section(string title, FrameworkElement? trailing = null)
    {
        var d = new DockPanel { Margin = new Thickness(16, 16, 12, 6), LastChildFill = true };
        if (trailing != null) { DockPanel.SetDock(trailing, Dock.Right); d.Children.Add(trailing); }
        d.Children.Add(Text(title, 12, "Muted", FontWeights.SemiBold));
        return d;
    }

    // Поле: подпись над элементом управления; подсказка — под ним.
    public static FrameworkElement Field(string label, UIElement control, string? hint = null, string? tip = null)
    {
        var p = new StackPanel { Margin = new Thickness(16, 0, 16, 10) };
        var l = Text(label, 12, "Muted");
        l.Margin = new Thickness(0, 0, 0, 4);
        if (tip != null) l.ToolTip = tip;
        p.Children.Add(l);
        p.Children.Add(control);
        if (hint != null)
        {
            var h = Text(hint, 11, "Faint", wrap: true);
            h.Margin = new Thickness(0, 4, 0, 0);
            p.Children.Add(h);
        }
        return p;
    }

    public static TextBox Box(string text = "", bool multi = false) => new()
    {
        Text = text, TextWrapping = multi ? TextWrapping.Wrap : TextWrapping.NoWrap,
        AcceptsReturn = false, MinHeight = multi ? 52 : 0, VerticalContentAlignment = multi ? VerticalAlignment.Top : VerticalAlignment.Center,
    };

    // Клавиша — «клавиша на клавиатуре» (Kbd): в палитре, шпаргалке, меню.
    public static Border Kbd(string keys, bool dark = false)
    {
        var p = new StackPanel { Orientation = Orientation.Horizontal };
        var first = true;
        // «Ctrl++» — последняя часть и есть «+».
        var parts = keys.EndsWith("++") ? keys[..^2].Split('+', StringSplitOptions.RemoveEmptyEntries).Append("+") : keys.Split('+', StringSplitOptions.RemoveEmptyEntries);
        foreach (var part in parts)
        {
            if (!first) p.Children.Add(new TextBlock { Text = "+", Margin = new Thickness(2, 0, 2, 0), Foreground = B(dark ? "Faint" : "Faint"), FontSize = 11, VerticalAlignment = VerticalAlignment.Center });
            first = false;
            p.Children.Add(new Border
            {
                Background = dark ? new SolidColorBrush(Color.FromArgb(0x30, 0xFF, 0xFF, 0xFF)) : B("Card"),
                BorderBrush = dark ? Brushes.Transparent : B("LineStrong"), BorderThickness = new Thickness(1, 1, 1, 2),
                CornerRadius = new CornerRadius(4), Padding = new Thickness(5, 0, 5, 1), MinWidth = 20,
                Child = new TextBlock
                {
                    Text = part, FontSize = 11, HorizontalAlignment = HorizontalAlignment.Center,
                    Foreground = dark ? Brushes.White : B("Muted"),
                },
            });
        }
        return new Border { Child = p, VerticalAlignment = VerticalAlignment.Center };
    }

    // Кнопка-значок: подсказка обязательна — у значка нет подписи.
    public static Button IconBtn(string glyph, string tip, Action act, double size = 14, string brush = "Ink")
    {
        var b = new Button
        {
            Style = S("ToolBtn"), Padding = new Thickness(7, 5, 7, 5), ToolTip = tip,
            Content = Icon(glyph, size, brush),
        };
        AutomationName(b, tip);
        b.Click += (_, _) => act();
        return b;
    }

    public static Button TextBtn(string text, string? tip, Action act, string style = "ToolBtn", string? glyph = null)
    {
        object content = text;
        if (glyph != null)
        {
            var p = new StackPanel { Orientation = Orientation.Horizontal };
            var i = Icon(glyph, 13);
            i.Margin = new Thickness(0, 0, 6, 0);
            if (style == "PrimaryBtn") i.Foreground = Brushes.White;
            p.Children.Add(i);
            p.Children.Add(new TextBlock { Text = text, VerticalAlignment = VerticalAlignment.Center });
            content = p;
        }
        var b = new Button { Style = S(style), Content = content, ToolTip = tip };
        b.Click += (_, _) => act();
        return b;
    }

    // Ряд кнопок-действий раздела.
    public static WrapPanel Actions(params UIElement[] items)
    {
        var w = new WrapPanel { Margin = new Thickness(12, 0, 12, 8) };
        foreach (var i in items) { if (i is FrameworkElement fe) fe.Margin = new Thickness(0, 0, 4, 4); w.Children.Add(i); }
        return w;
    }

    // Переключатель из нескольких вариантов (сегменты): вид связи, сторона
    // стрелки, место таблицы. Выбранный — белый на сером, как в Windows 11.
    public static Border Segmented(IList<(string Key, string Label, string? Tip)> items, string current, Action<string> changed)
    {
        var g = new UniformGrid { Rows = 1 };
        foreach (var (key, label, tip) in items)
        {
            var on = key == current;
            var b = new Button
            {
                Style = S("ToolBtn"), Padding = new Thickness(6, 4, 6, 4), MinHeight = 26, FontSize = 12,
                Content = new TextBlock { Text = label, TextTrimming = TextTrimming.CharacterEllipsis },
                ToolTip = tip ?? label, Background = on ? B("Card") : Brushes.Transparent,
                FontWeight = on ? FontWeights.SemiBold : FontWeights.Normal, Margin = new Thickness(1),
            };
            if (on) { b.BorderBrush = B("Line"); b.BorderThickness = new Thickness(1); }
            b.Click += (_, _) => { if (key != current) changed(key); };
            g.Children.Add(b);
        }
        return new Border { Background = B("Hover"), CornerRadius = new CornerRadius(6), Padding = new Thickness(2), Child = g };
    }

    public static Border Chip(string text, string fill, string fg, double size = 11) => new()
    {
        Background = B(fill), CornerRadius = new CornerRadius(10), Padding = new Thickness(7, 1, 7, 2),
        VerticalAlignment = VerticalAlignment.Center,
        Child = new TextBlock { Text = text, Foreground = B(fg), FontSize = size, FontWeight = FontWeights.SemiBold },
    };

    // Номер связи — кружок её цвета, как на полотне.
    public static Border Badge(int n, Color c) => new()
    {
        Background = new SolidColorBrush(c), CornerRadius = new CornerRadius(11), MinWidth = 22, Height = 22,
        Padding = new Thickness(6, 0, 6, 0), VerticalAlignment = VerticalAlignment.Center,
        Child = new TextBlock
        {
            Text = n.ToString(), Foreground = Brushes.White, FontWeight = FontWeights.Bold, FontSize = 12,
            HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
        },
    };

    // Всплывающая карточка: белая, скругление 8, мягкая тень. Тень — у
    // подложки под карточкой, а не у неё самой: эффект на элементе растрирует
    // всё его содержимое, и текст внутри мылится.
    public static Border Card(UIElement child, Thickness? padding = null, Brush? border = null, double borderW = 1)
    {
        var g = new Grid();
        g.Children.Add(Shadow(8));
        g.Children.Add(new Border
        {
            Background = B("Card"), BorderBrush = border ?? B("Line"), BorderThickness = new Thickness(borderW),
            CornerRadius = new CornerRadius(8), Padding = padding ?? new Thickness(12), Child = child,
        });
        return new Border { Child = g };
    }

    // Подложка с тенью: та же форма, что у карточки, без содержимого.
    public static Border Shadow(double radius, double blur = 18, double opacity = 0.16) => new()
    {
        Background = B("Card"), CornerRadius = new CornerRadius(radius), IsHitTestVisible = false,
        Effect = new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = blur, ShadowDepth = 3, Opacity = opacity, Direction = 270 },
    };

    public static Border Divider(double top = 8, double bottom = 0) => new()
    {
        Height = 1, Background = B("Line"), Margin = new Thickness(0, top, 0, bottom),
    };

    public static void AutomationName(DependencyObject o, string name) =>
        System.Windows.Automation.AutomationProperties.SetName(o, name);
}
