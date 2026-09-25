using System.IO;
using System.Windows;
using System.Windows.Controls;

namespace Razmetka;

// Документ из PDF: какие страницы взять и куда — новой главой или в
// выбранную. Каждая страница становится разворотом со страницей-слоем.
public sealed class PdfImportDialog : Window
{
    readonly TextBox _doc = new() { Padding = new Thickness(4, 3, 4, 3) };
    readonly TextBox _chapter = new() { Padding = new Thickness(4, 3, 4, 3) };
    readonly TextBox _pages = new() { Padding = new Thickness(4, 3, 4, 3) };
    readonly RadioButton _new = new() { Content = "Новой главой", IsChecked = true, Margin = new Thickness(0, 0, 16, 0) };
    readonly RadioButton _cur = new() { Content = "В выбранную главу" };

    public string DocName => _doc.Text.Trim();
    public string ChapterTitle => _chapter.Text.Trim();
    public string Pages => _pages.Text;
    public bool NewChapter => _new.IsChecked == true;

    public PdfImportDialog(string path, int count, bool hasChapter)
    {
        Title = "Документ из PDF";
        Width = 460;
        SizeToContent = SizeToContent.Height;
        ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        FontFamily = new System.Windows.Media.FontFamily("Segoe UI");
        FontSize = 13;
        var name = Path.GetFileNameWithoutExtension(path);
        _doc.Text = name.Contains("госакт", StringComparison.OrdinalIgnoreCase) ? "Госакт"
            : name.Contains("техпаспорт", StringComparison.OrdinalIgnoreCase) ? "Техпаспорт" : "Документ";
        _chapter.Text = $"Перенос: {name}";
        _cur.IsEnabled = hasChapter;

        var p = new StackPanel { Margin = new Thickness(16) };
        TextBlock Label(string t) => new() { Text = t, Foreground = System.Windows.Media.Brushes.DimGray, FontSize = 11, Margin = new Thickness(0, 8, 0, 2) };
        p.Children.Add(new TextBlock { Text = $"{Path.GetFileName(path)} — страниц: {count}", TextWrapping = TextWrapping.Wrap, FontWeight = FontWeights.SemiBold });
        p.Children.Add(Label("Страницы: «1-3, 5»; пусто — все"));
        p.Children.Add(_pages);
        p.Children.Add(Label("Документ в таблице связей"));
        p.Children.Add(_doc);
        var where = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 10, 0, 0) };
        where.Children.Add(_new);
        where.Children.Add(_cur);
        p.Children.Add(where);
        p.Children.Add(Label("Название новой главы"));
        p.Children.Add(_chapter);
        _new.Checked += (_, _) => _chapter.IsEnabled = true;
        _cur.Checked += (_, _) => _chapter.IsEnabled = false;
        var bar = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 16, 0, 0) };
        var ok = new Button { Content = "Добавить", IsDefault = true, Padding = new Thickness(14, 4, 14, 4), Margin = new Thickness(0, 0, 8, 0) };
        var cancel = new Button { Content = "Отмена", IsCancel = true, Padding = new Thickness(14, 4, 14, 4) };
        ok.Click += (_, _) => DialogResult = true;
        bar.Children.Add(ok);
        bar.Children.Add(cancel);
        p.Children.Add(bar);
        Content = p;
        Loaded += (_, _) => _pages.Focus();
    }
}
