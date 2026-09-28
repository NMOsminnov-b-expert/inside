using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;

namespace Graf.Views;

// Граница панели, которую тянут мышью: курсор «влево-вправо», линия
// подсвечивается при наведении. Dragged — сдвиг в пикселях, Done — отпустили.
public sealed class Splitter : Grid
{
    readonly Rectangle _line = new() { Width = 1 };
    double _x;
    bool _on;

    public event Action<double>? Dragged;
    public event Action? Done;

    public Splitter()
    {
        Width = 7;
        Background = new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        _line.Fill = (Brush)Application.Current.Resources["CardStrokeColorDefaultBrush"];
        Children.Add(_line);
        ProtectedCursor = InputSystemCursor.Create(InputSystemCursorShape.SizeWestEast);
        PointerEntered += (_, _) => { _line.Width = 3; _line.Fill = (Brush)Application.Current.Resources["AccentFillColorDefaultBrush"]; };
        PointerExited += (_, _) => { if (!_on) Reset(); };
        PointerPressed += (_, e) => { _on = true; _x = e.GetCurrentPoint(null).Position.X; CapturePointer(e.Pointer); e.Handled = true; };
        PointerMoved += (_, e) =>
        {
            if (!_on) return;
            var x = e.GetCurrentPoint(null).Position.X;
            Dragged?.Invoke(x - _x);
            _x = x;
        };
        PointerReleased += (_, e) => { _on = false; ReleasePointerCapture(e.Pointer); Reset(); Done?.Invoke(); };
    }

    void Reset()
    {
        _line.Width = 1;
        _line.Fill = (Brush)Application.Current.Resources["CardStrokeColorDefaultBrush"];
    }
}
