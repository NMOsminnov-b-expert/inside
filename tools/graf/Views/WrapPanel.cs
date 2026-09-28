using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Foundation;

namespace Graf.Views;

// Панель с переносом строк — для меток-плашек (в WinUI такой панели нет).
public sealed class WrapPanel : Panel
{
    public double Gap { get; set; } = 6;

    protected override Size MeasureOverride(Size available)
    {
        double x = 0, y = 0, row = 0, w = 0;
        foreach (var c in Children)
        {
            c.Measure(new Size(available.Width, double.PositiveInfinity));
            var d = c.DesiredSize;
            if (x > 0 && x + d.Width > available.Width) { x = 0; y += row + Gap; row = 0; }
            x += d.Width + Gap;
            row = Math.Max(row, d.Height);
            w = Math.Max(w, x);
        }
        return new Size(double.IsInfinity(available.Width) ? w : available.Width, y + row);
    }

    protected override Size ArrangeOverride(Size final)
    {
        double x = 0, y = 0, row = 0;
        foreach (var c in Children)
        {
            var d = c.DesiredSize;
            if (x > 0 && x + d.Width > final.Width) { x = 0; y += row + Gap; row = 0; }
            c.Arrange(new Rect(x, y, d.Width, d.Height));
            x += d.Width + Gap;
            row = Math.Max(row, d.Height);
        }
        return final;
    }
}
