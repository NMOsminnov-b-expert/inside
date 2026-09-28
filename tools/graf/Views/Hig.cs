using Microsoft.UI;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace Graf.Views;

// Элементы интерфейса по Human Interface Guidelines Apple — из них собраны
// боковая панель, карточка записи и диалоги (практика графа
// dizayn-programmy-graf-proekta-po-hig-apple, задача пользователя 28.09.2026
// «в стиле iOS… пересмотри дизайн целиком»).
//
// Ступени шрифта — iPadOS в масштабе настольного окна (Body 17 → 14):
// LargeTitle 26, Title3 18, Headline 14 полужирный, Body 14, Subhead 13,
// Footnote 12, Caption 11. Цвета — кисти Hig* из App.xaml (значения iOS,
// светлая и тёмная тема). Строка списка — 36 (на касание в iOS 44; у мыши
// точность выше).
public static class Hig
{
    public enum T { LargeTitle, Title3, Headline, Body, Subhead, Footnote, Caption }

    public static Brush B(string key) => (Brush)Application.Current.Resources[key];
    public static Color C(string key) => ((SolidColorBrush)Application.Current.Resources[key]).Color;

    public static TextBlock Text(string s, T t = T.Body, string color = "HigLabel", bool wrap = false)
    {
        var tb = new TextBlock
        {
            Text = s, Foreground = B(color), TextWrapping = wrap ? TextWrapping.Wrap : TextWrapping.NoWrap,
            TextTrimming = TextTrimming.CharacterEllipsis, VerticalAlignment = VerticalAlignment.Center,
        };
        switch (t)
        {
            case T.LargeTitle: tb.FontSize = 26; tb.FontWeight = FontWeights.Bold; tb.FontFamily = (FontFamily)Application.Current.Resources["HigDisplayFont"]; break;
            case T.Title3: tb.FontSize = 18; tb.FontWeight = FontWeights.SemiBold; tb.FontFamily = (FontFamily)Application.Current.Resources["HigDisplayFont"]; break;
            case T.Headline: tb.FontSize = 14; tb.FontWeight = FontWeights.SemiBold; break;
            case T.Body: tb.FontSize = 14; break;
            case T.Subhead: tb.FontSize = 13; break;
            case T.Footnote: tb.FontSize = 12; break;
            case T.Caption: tb.FontSize = 11; break;
        }
        return tb;
    }

    // --- списки --------------------------------------------------------------

    public enum Acc { None, Chevron, Check, Plus }

    // Строка списка: слева — цветная точка или значок, заголовок и подпись
    // под ним, справа — значение (вторичным цветом) и признак: шеврон (переход
    // вглубь), галочка (выбран вариант), «+» (добавить). Выбранная строка
    // навигации подсвечена постоянно (HIG Split views).
    public static FrameworkElement Row(
        string title, string? subtitle = null, string? value = null, Acc acc = Acc.None,
        Color? dot = null, string? glyph = null, Action? click = null, bool selected = false,
        bool wrap = false, string? tooltip = null, UIElement? trailing = null, string titleColor = "HigLabel")
    {
        var g = new Grid { ColumnSpacing = 10, MinHeight = 36, Padding = new Thickness(14, 7, 12, 7) };
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        g.ColumnDefinitions.Add(new ColumnDefinition());
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var fg = selected ? "HigAccent" : titleColor;
        if (dot is { } d)
            g.Children.Add(new Border { Width = 10, Height = 10, CornerRadius = new CornerRadius(5), Background = new SolidColorBrush(d), VerticalAlignment = subtitle != null || wrap ? VerticalAlignment.Top : VerticalAlignment.Center, Margin = new Thickness(0, subtitle != null || wrap ? 5 : 0, 0, 0) });
        else if (glyph != null)
            g.Children.Add(new FontIcon { Glyph = glyph, FontSize = 15, Foreground = B(selected ? "HigAccent" : "HigAccent"), Width = 20 });
        var col = new StackPanel { Spacing = 1, VerticalAlignment = VerticalAlignment.Center };
        var t = Text(title, T.Body, fg, wrap);
        if (wrap) t.MaxLines = 3;
        if (selected) t.FontWeight = FontWeights.SemiBold;
        col.Children.Add(t);
        if (subtitle != null) col.Children.Add(Text(subtitle, T.Footnote, "HigSecondary", wrap));
        Grid.SetColumn(col, 1);
        g.Children.Add(col);
        if (value != null)
        {
            var v = Text(value, T.Body, "HigSecondary");
            Grid.SetColumn(v, 2);
            g.Children.Add(v);
        }
        if (trailing != null) { Grid.SetColumn((FrameworkElement)trailing, 3); g.Children.Add(trailing); }
        var a = acc switch
        {
            Acc.Chevron => new FontIcon { Glyph = "", FontSize = 11, Foreground = B("HigTertiary") },
            Acc.Check => new FontIcon { Glyph = "", FontSize = 14, Foreground = B("HigAccent"), FontWeight = FontWeights.Bold },
            Acc.Plus => new FontIcon { Glyph = "", FontSize = 14, Foreground = B("HigAccent") },
            _ => null,
        };
        if (a != null) { Grid.SetColumn(a, 4); g.Children.Add(a); }
        if (acc == Acc.Check || acc == Acc.None) { }
        if (click == null) return g;
        var b = new Button
        {
            Content = g, Padding = new Thickness(0), BorderThickness = new Thickness(0), CornerRadius = new CornerRadius(0),
            HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch,
            Background = selected ? B("HigAccentSoft") : new SolidColorBrush(Colors.Transparent),
        };
        if (tooltip != null) ToolTipService.SetToolTip(b, tooltip);
        b.Click += (_, _) => click();
        return b;
    }

    // Карточка группы (inset grouped): белая подложка со скруглением 10,
    // строки через тонкий разделитель, отступивший до текста строки.
    public static Border Card(IEnumerable<UIElement> rows, double indent = 14)
    {
        var sp = new StackPanel();
        var first = true;
        foreach (var r in rows)
        {
            if (!first) sp.Children.Add(new Border { Height = 1, Background = B("HigSeparator"), Margin = new Thickness(indent, 0, 0, 0) });
            sp.Children.Add(r);
            first = false;
        }
        return new Border { Child = sp, Background = B("HigCard"), CornerRadius = new CornerRadius(10) };
    }

    // Раздел: подпись заглавными над карточкой, пояснение — под ней.
    public static StackPanel Section(string? header, IEnumerable<UIElement> rows, string? footer = null, double indent = 14)
    {
        var sp = new StackPanel { Spacing = 6 };
        if (header != null) sp.Children.Add(Header(header));
        sp.Children.Add(Card(rows, indent));
        if (footer != null) sp.Children.Add(Footer(footer));
        return sp;
    }

    public static TextBlock Header(string s)
    {
        var t = Text(s.ToUpperInvariant(), T.Footnote, "HigSecondary");
        t.CharacterSpacing = 30;
        t.Margin = new Thickness(14, 0, 14, 0);
        return t;
    }

    public static TextBlock Footer(string s)
    {
        var t = Text(s, T.Footnote, "HigSecondary", wrap: true);
        t.Margin = new Thickness(14, 0, 14, 0);
        return t;
    }

    // Заголовок группы боковой панели: название полужирным, справа — что
    // задано (акцентом) и треугольник раскрытия (HIG Sidebars: иерархия —
    // треугольниками, не больше двух уровней).
    public static Button SidebarHeader(string title, bool open, string? note, Action toggle)
    {
        var g = new Grid { ColumnSpacing = 8, Padding = new Thickness(14, 6, 10, 6) };
        g.ColumnDefinitions.Add(new ColumnDefinition());
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var t = Text(title, T.Headline, wrap: true);
        t.FontSize = 15;
        t.MaxLines = 2;
        g.Children.Add(t);
        if (!string.IsNullOrEmpty(note))
        {
            var n = Text(note, T.Subhead, "HigAccent");
            Grid.SetColumn(n, 1);
            g.Children.Add(n);
        }
        var chev = new FontIcon { Glyph = open ? "" : "", FontSize = 11, Foreground = B("HigAccent") };
        Grid.SetColumn(chev, 2);
        g.Children.Add(chev);
        var b = new Button
        {
            Content = g, Padding = new Thickness(0), BorderThickness = new Thickness(0), Background = new SolidColorBrush(Colors.Transparent),
            HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Stretch,
        };
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(b, title);
        b.Click += (_, _) => toggle();
        return b;
    }

    // --- управление ----------------------------------------------------------

    // Метка-капсула; с onRemove — крестик в круге (снять).
    public static FrameworkElement Token(string text, Action? onRemove = null, Action? onClick = null, bool accent = false)
    {
        var sp = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 };
        sp.Children.Add(Text(text, T.Subhead, accent ? "HigAccent" : "HigLabel"));
        if (onRemove != null) sp.Children.Add(new FontIcon { Glyph = "", FontSize = 9, Foreground = B("HigSecondary") });
        var b = new Button
        {
            Content = sp, Padding = new Thickness(11, 4, onRemove != null ? 9 : 11, 4), CornerRadius = new CornerRadius(14),
            BorderThickness = new Thickness(0), Background = accent ? B("HigAccentSoft") : B("HigFill"), Margin = new Thickness(0, 0, 6, 6),
        };
        if (onRemove != null) { ToolTipService.SetToolTip(b, "Убрать: " + text); b.Click += (_, _) => onRemove(); }
        else if (onClick != null) b.Click += (_, _) => onClick();
        else b.IsHitTestVisible = false;
        return b;
    }

    // Переключатель iOS: зелёный во включённом положении, без подписей «Вкл/Выкл».
    public static ToggleSwitch Switch(bool on, Action<bool> changed)
    {
        var ts = new ToggleSwitch { IsOn = on, OnContent = "", OffContent = "", MinWidth = 0, Margin = new Thickness(0, -4, -8, -4) };
        foreach (var k in new[] { "ToggleSwitchFillOn", "ToggleSwitchFillOnPointerOver", "ToggleSwitchFillOnPressed" })
            ts.Resources[k] = B("HigGreen");
        ts.Toggled += (_, _) => changed(ts.IsOn);
        return ts;
    }

    public static FrameworkElement SwitchRow(string title, bool on, Action<bool> changed, string? subtitle = null)
        => Row(title, subtitle, trailing: Switch(on, changed));

    // Значок без рамки (HIG Toolbars: символы без рамок, монохромные).
    public static Button Icon(string glyph, string tooltip, Action click, string color = "HigLabel", double size = 16)
    {
        var b = new Button
        {
            Content = new FontIcon { Glyph = glyph, FontSize = size, Foreground = B(color) }, Padding = new Thickness(8, 6, 8, 6),
            BorderThickness = new Thickness(0), Background = new SolidColorBrush(Colors.Transparent), CornerRadius = new CornerRadius(8),
            VerticalAlignment = VerticalAlignment.Center,
        };
        ToolTipService.SetToolTip(b, tooltip);
        b.Click += (_, _) => click();
        return b;
    }

    // Текстовая кнопка акцентом («Отменить», «Готово» — как в навигационной
    // панели iOS); strong — главное действие полужирным.
    public static Button TextButton(string text, Action click, bool strong = false, string color = "HigAccent")
    {
        var t = Text(text, T.Body, color);
        if (strong) t.FontWeight = FontWeights.SemiBold;
        var b = new Button
        {
            Content = t, Padding = new Thickness(8, 4, 8, 4), BorderThickness = new Thickness(0),
            Background = new SolidColorBrush(Colors.Transparent), VerticalAlignment = VerticalAlignment.Center,
        };
        b.Click += (_, _) => click();
        return b;
    }

    // Выделенная кнопка (prominent): капсула акцентного цвета.
    public static Button Prominent(UIElement content, string tooltip, Action click)
    {
        var b = new Button
        {
            Content = content, Padding = new Thickness(12, 5, 12, 5), CornerRadius = new CornerRadius(16), BorderThickness = new Thickness(0),
            Background = B("HigAccent"), Foreground = new SolidColorBrush(Colors.White), VerticalAlignment = VerticalAlignment.Center,
        };
        b.Resources["ButtonBackgroundPointerOver"] = new SolidColorBrush(C("HigAccent")) { Opacity = 0.85 };
        b.Resources["ButtonBackgroundPressed"] = new SolidColorBrush(C("HigAccent")) { Opacity = 0.7 };
        b.Resources["ButtonForegroundPointerOver"] = new SolidColorBrush(Colors.White);
        b.Resources["ButtonForegroundPressed"] = new SolidColorBrush(Colors.White);
        ToolTipService.SetToolTip(b, tooltip);
        b.Click += (_, _) => click();
        return b;
    }
}

// Сегментированный переключатель (HIG Segmented controls): сегменты равной
// ширины, выбранный — светлой «плашкой» на сером желобе; только текст.
// dark — вариант для управления поверх тёмного холста графа.
public sealed class Segmented : UserControl
{
    readonly Grid _g = new();
    readonly Border _box = new();
    readonly List<Button> _btns = new();
    int _sel;
    readonly bool _dark;
    public event Action<int>? Changed;
    public int SelectedIndex { get => _sel; set { _sel = value; Paint(); } }

    public Segmented(IEnumerable<string> items, int selected = 0, bool dark = false, double fontSize = 13)
    {
        _dark = dark;
        _sel = selected;
        _box.CornerRadius = new CornerRadius(9);
        _box.Padding = new Thickness(2);
        _box.Background = dark ? new SolidColorBrush(Color.FromArgb(0x3D, 0x76, 0x76, 0x80)) : Hig.B("HigFill");
        _box.Child = _g;
        Content = _box;
        var i = 0;
        foreach (var it in items)
        {
            _g.ColumnDefinitions.Add(new ColumnDefinition());
            var idx = i++;
            var b = new Button
            {
                Content = new TextBlock { Text = it, FontSize = fontSize, TextTrimming = TextTrimming.CharacterEllipsis, HorizontalAlignment = HorizontalAlignment.Center },
                HorizontalAlignment = HorizontalAlignment.Stretch, HorizontalContentAlignment = HorizontalAlignment.Center,
                Padding = new Thickness(10, 3, 10, 3), CornerRadius = new CornerRadius(7), BorderThickness = new Thickness(0), MinHeight = 26,
            };
            b.Click += (_, _) => { if (_sel == idx) return; _sel = idx; Paint(); Changed?.Invoke(idx); };
            Grid.SetColumn(b, idx);
            _g.Children.Add(b);
            _btns.Add(b);
        }
        Paint();
    }

    void Paint()
    {
        for (var i = 0; i < _btns.Count; i++)
        {
            var on = i == _sel;
            var b = _btns[i];
            b.Background = on ? (_dark ? new SolidColorBrush(Color.FromArgb(0xFF, 0x63, 0x63, 0x66)) : Hig.B("HigSegmentThumb")) : new SolidColorBrush(Colors.Transparent);
            var t = (TextBlock)b.Content;
            t.FontWeight = on ? FontWeights.SemiBold : FontWeights.Normal;
            t.Foreground = _dark ? new SolidColorBrush(Colors.White) : Hig.B("HigLabel");
            if (on) { b.Translation = new System.Numerics.Vector3(0, 0, 8); b.Shadow = _shadow; }
            else { b.Translation = default; b.Shadow = null; }
        }
    }

    static readonly ThemeShadow _shadow = new();
}
