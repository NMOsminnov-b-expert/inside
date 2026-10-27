using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace Razmetka.Ui;

// Вопрос и сообщение в цветах темы — вместо системного MessageBox: тот
// Windows рисует всегда светлым, и в тёмной теме «Сохранить изменения в
// проекте?» выскакивало белым окном (снимок пользователя 27.10.2026). Те же
// кнопки и результат, что у MessageBox: Enter — основная кнопка, Esc —
// отмена (или «Нет»), крестик — то же, что Esc.
public static class Ask
{
    public static MessageBoxResult Show(Window owner, string text, string caption,
        MessageBoxButton buttons = MessageBoxButton.OK, MessageBoxImage image = MessageBoxImage.None)
    {
        var result = buttons switch
        {
            MessageBoxButton.YesNo => MessageBoxResult.No,
            MessageBoxButton.YesNoCancel or MessageBoxButton.OKCancel => MessageBoxResult.Cancel,
            _ => MessageBoxResult.OK,
        };
        var w = new Window
        {
            Owner = owner, Title = caption, SizeToContent = SizeToContent.WidthAndHeight, ResizeMode = ResizeMode.NoResize,
            WindowStartupLocation = owner != null ? WindowStartupLocation.CenterOwner : WindowStartupLocation.CenterScreen,
            ShowInTaskbar = false, FontSize = 13, MinWidth = 340, MaxWidth = 520,
        };
        w.SetResourceReference(Control.BackgroundProperty, "Panel");
        w.SetResourceReference(Control.ForegroundProperty, "Ink");
        w.SetResourceReference(Control.FontFamilyProperty, "UiFont");

        var body = new DockPanel();
        var (glyph, brush) = image switch
        {
            MessageBoxImage.Question => ("", "Accent"),
            MessageBoxImage.Warning => ("", "Warn"),
            MessageBoxImage.Error => ("", "Danger"),
            MessageBoxImage.Information => ("", "Accent"),
            _ => ((string?)null, "Accent"),
        };
        var bar = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 18, 0, 0) };
        DockPanel.SetDock(bar, Dock.Bottom);
        body.Children.Add(bar);
        if (glyph != null)
        {
            var ic = Kit.Icon(glyph, 22, brush);
            ic.VerticalAlignment = VerticalAlignment.Top;
            ic.Margin = new Thickness(0, 0, 14, 0);
            DockPanel.SetDock(ic, Dock.Left);
            body.Children.Add(ic);
        }
        var msg = new TextBlock { Text = text, TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center, LineHeight = 19 };
        body.Children.Add(msg);

        void Btn(string label, MessageBoxResult r, bool primary, bool cancel)
        {
            var b = new Button
            {
                Content = label, Style = Kit.S(primary ? "PrimaryBtn" : "OutlineBtn"), MinWidth = 88,
                Padding = new Thickness(14, 5, 14, 5), Margin = new Thickness(8, 0, 0, 0), IsDefault = primary, IsCancel = cancel,
            };
            if (primary) b.Foreground = Brushes.White;
            b.Click += (_, _) => { result = r; w.Close(); };
            bar.Children.Add(b);
        }
        switch (buttons)
        {
            case MessageBoxButton.YesNo:
                Btn("Да", MessageBoxResult.Yes, true, false);
                Btn("Нет", MessageBoxResult.No, false, true);
                break;
            case MessageBoxButton.YesNoCancel:
                Btn("Да", MessageBoxResult.Yes, true, false);
                Btn("Нет", MessageBoxResult.No, false, false);
                Btn("Отмена", MessageBoxResult.Cancel, false, true);
                break;
            case MessageBoxButton.OKCancel:
                Btn("ОК", MessageBoxResult.OK, true, false);
                Btn("Отмена", MessageBoxResult.Cancel, false, true);
                break;
            default:
                Btn("ОК", MessageBoxResult.OK, true, true);
                break;
        }
        var root = new Border { Padding = new Thickness(20, 18, 20, 16), Child = body };
        root.SetResourceReference(Border.BackgroundProperty, "Panel");
        w.Content = root;
        w.ShowDialog();
        return result;
    }
}
