using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Razmetka.Editor;
using Razmetka.Model;
using Razmetka.Ui;

namespace Razmetka;

// Шапка, стартовый экран и левая панель: развороты по главам и слои текущего.
// Развороты — основной способ навигации (Acrobat: закладки — структура);
// у разворота — страница, число связей и точка, если есть замечания
// проверки. Слои — ниже, как страницы и слои в Figma.
public partial class MainWindow
{
    readonly HashSet<string> _collapsed = new();

    void InitTopBar()
    {
        ProjectBtn.Click += (_, _) => OpenMenu(ProjectMenu(), ProjectBtn);
        CrumbBtn.Click += (_, _) => _cmds.Execute("go.sheet");
        PaletteBtn.Click += (_, _) => _cmds.Execute("go.palette");

        CheckBtn.Click += (_, _) => OpenMenu(CheckMenu(), CheckBtn);
        ExportBtn.Click += (_, _) => OpenMenu(ExportMenu(), ExportBtn);
        SaveBtn.Click += (_, _) => Save();
        HelpBtn.Click += (_, _) => OpenCheatsheet();

        SearchBox.TextChanged += (_, _) =>
        {
            _searchAt = -1;
            var q = SearchBox.Text.Trim();
            SearchPlaceholder.Visibility = SearchBox.Text.Length == 0 ? Visibility.Visible : Visibility.Collapsed;
            SearchKbd.Visibility = SearchBox.Text.Length == 0 ? Visibility.Visible : Visibility.Collapsed;
            SearchCount.Text = q.Length == 0 ? "" : $"{SearchHits(q).Count}";
        };
        SearchBox.PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Enter) { SearchNext(Keyboard.Modifiers.HasFlag(ModifierKeys.Shift) ? -1 : 1); e.Handled = true; }
            else if (e.Key == Key.Escape) { if (SearchBox.Text.Length > 0 && Keyboard.Modifiers == ModifierKeys.Shift) SearchBox.Clear(); View.Focus(); e.Handled = true; }
        };
        FilterBox.SelectionChanged += (_, _) =>
        {
            if (_syncing) return;
            var f = (FilterBox.SelectedItem as ComboBoxItem)?.Tag as string;
            View.SetFilter(f);
            if (f != null) Status($"Ярко — только связи блока «{f}»");
            FocusCanvas();
        };
    }

    ContextMenu ProjectMenu()
    {
        var m = new ContextMenu();
        var recent = Recent.Load().Where(r => _store == null || !string.Equals(r.Dir, _store.Dir, StringComparison.OrdinalIgnoreCase)).Take(8).ToList();
        AddAll(m, Mc("project.new"), Mc("project.open"),
            recent.Count > 0 ? Sub("Недавние", recent.Select(r => (object)Mi(r.Title.Length > 0 ? r.Title : Path.GetFileName(r.Dir), () => OpenRecent(r.Dir)))) : null,
            new Separator(), Mc("project.save"), Sub("Экспорт", new object?[] { Mc("project.export.html"), Mc("project.export.xlsx"), Mc("project.export.png") }),
            new Separator(),
            Sub("Тема", new[] { "system", "light", "dark" }.Select(m => (object)Check(Theme.Label(m), Theme.Mode == m, () => SetTheme(m)))),
            Mc("help.keymap"), Mc("help.keys"),
            new Separator(), Mc("project.close"));
        return m;
    }

    ContextMenu CheckMenu()
    {
        var m = new ContextMenu();
        if (_issues.Count == 0) AddAll(m, new MenuItem { Header = "Замечаний нет", IsEnabled = false });
        else
        {
            AddAll(m, Mc("check.next", "К следующему замечанию"), Mc("project.checks", $"Все замечания ({_issues.Count})…"), new Separator());
            foreach (var i in _issues.OrderByDescending(x => x.Error).Take(12))
            {
                var it = new MenuItem
                {
                    Header = new StackPanel
                    {
                        Children =
                        {
                            Kit.Text(i.Text, 13, i.Error ? "Danger" : "Ink"),
                            Kit.Text($"{i.Chapter.Title} · {i.Sheet.Title}", 11, "Muted"),
                        },
                        MaxWidth = 520,
                    },
                };
                it.Click += (_, _) => GoToIssue(i);
                m.Items.Add(it);
            }
        }
        return m;
    }

    ContextMenu ExportMenu()
    {
        var m = new ContextMenu();
        AddAll(m, Mc("project.export.html"), Mc("project.export.xlsx"), Mc("project.export.png"));
        if (m.Items.Count == 0) AddAll(m, new MenuItem { Header = "Откройте проект — экспортировать нечего", IsEnabled = false });
        return m;
    }

    void SyncTopBar()
    {
        var open = _store != null;
        ProjectTitle.Text = open ? (_store!.Project.Title.Length > 0 ? _store.Project.Title : Path.GetFileName(_store.Dir)) : "Разметка документов";
        CrumbBtn.Visibility = _sheet != null ? Visibility.Visible : Visibility.Collapsed;
        Crumbs.Text = _sheet == null ? "" : $"{_chapter?.Title}  ›  {_sheet.Title}";
        SaveBtn.Visibility = open && _dirty ? Visibility.Visible : Visibility.Collapsed;
        SaveState.Text = !open ? "" : _dirty ? "Не сохранено" : _savedAt is { } t ? $"Сохранено в {t:HH:mm}" : "Сохранено";
        SaveState.Foreground = Kit.B(_dirty ? "Warn" : "Muted");
        // Без проекта панели пусты — стартовый экран на всю ширину.
        var cols = open && !_panelsHidden;
        ColLeft.Width = new GridLength(cols ? Math.Max(200, _leftW) : 0);
        ColRight.Width = new GridLength(cols ? Math.Max(240, _rightW) : 0);
        LeftSplit.Visibility = RightSplit.Visibility = cols ? Visibility.Visible : Visibility.Collapsed;
        SearchHost.IsEnabled = open;
        foreach (var b in new UIElement[] { CheckBtn, ExportBtn, PaletteBtn }) b.IsEnabled = open;
        var errors = _issues.Count(i => i.Error);
        CheckBadge.Visibility = _issues.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        CheckBadge.Background = Kit.B(errors > 0 ? "Danger" : "Warn");
        CheckCount.Text = _issues.Count.ToString();
        CheckIcon.Foreground = Kit.B(!open ? "Muted" : _issues.Count == 0 ? "Ok" : errors > 0 ? "Danger" : "Warn");
        CheckBtn.ToolTip = !open ? "Проверка разметки" : _issues.Count == 0 ? "Проверка: замечаний нет"
            : $"Проверка: ошибок {errors}, проверить {_issues.Count - errors}. F8 — к следующему";
    }

    // --- стартовый экран ------------------------------------------------------

    void BuildStart()
    {
        StartActions.Children.Clear();
        var open = Kit.TextBtn("Открыть проект…", "Папка, где лежит razmetka.json — Ctrl+O", OpenProject, "PrimaryBtn", "");
        open.Margin = new Thickness(0, 0, 8, 0);
        StartActions.Children.Add(open);
        StartActions.Children.Add(Kit.TextBtn("Новый проект…", "Пустая папка для нового проекта — Ctrl+N", NewProject, "OutlineBtn", ""));
        RecentList.Children.Clear();
        var list = Recent.Load();
        RecentTitle.Visibility = list.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        ((Border)RecentList.Parent).Visibility = list.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        foreach (var r in list.Take(8))
        {
            var exists = File.Exists(Path.Combine(r.Dir, ProjectStore.FileName));
            var g = new Grid();
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(32) });
            g.ColumnDefinitions.Add(new ColumnDefinition());
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            g.Children.Add(Kit.Icon("", 16, exists ? "Accent" : "Faint"));
            var t = new StackPanel();
            t.Children.Add(Kit.Text(r.Title.Length > 0 ? r.Title : Path.GetFileName(r.Dir), 13, exists ? "Ink" : "Faint", FontWeights.SemiBold));
            t.Children.Add(Kit.Text(exists ? r.Dir : $"{r.Dir} — папка не найдена", 11, "Muted"));
            Grid.SetColumn(t, 1);
            g.Children.Add(t);
            var when = Kit.Text(r.At.Date == DateTime.Today ? $"сегодня, {r.At:HH:mm}" : $"{r.At:dd.MM.yyyy}", 11, "Faint");
            when.VerticalAlignment = VerticalAlignment.Center;
            Grid.SetColumn(when, 2);
            g.Children.Add(when);
            var b = new Button
            {
                Style = Kit.S("ToolBtn"), Content = g, HorizontalContentAlignment = HorizontalAlignment.Stretch, Padding = new Thickness(8, 7, 12, 7),
                ToolTip = exists ? "Открыть" : "Папки больше нет — убрать из списка",
            };
            var dir = r.Dir;
            b.Click += (_, _) => OpenRecent(dir);
            RecentList.Children.Add(b);
        }
    }

    void OpenRecent(string dir)
    {
        if (!File.Exists(Path.Combine(dir, ProjectStore.FileName)))
        {
            Recent.Forget(dir);
            Status("Папки проекта больше нет — убрана из недавних");
            if (_store == null) BuildStart();
            return;
        }
        OpenDir(dir);
    }

    // --- развороты -------------------------------------------------------------

    void InitNavigator()
    {
        LeftSplit.DragCompleted += (_, _) => RememberPanelWidths();
        RightSplit.DragCompleted += (_, _) => RememberPanelWidths();
        Nav.SelectionChanged += (_, _) =>
        {
            if (_syncing || Nav.SelectedItem is not ListBoxItem { Tag: Sheet sh }) return;
            var ch = _store!.Project.Chapters.First(c => c.Sheets.Contains(sh));
            if (sh != _sheet) OpenSheet(ch, sh);
        };
        Nav.PreviewKeyDown += (_, e) =>
        {
            if (Nav.SelectedItem is not ListBoxItem { Tag: Sheet sh }) return;
            var ch = _store!.Project.Chapters.First(c => c.Sheets.Contains(sh));
            if (e.Key == Key.Enter) { FocusCanvas(); e.Handled = true; }
            else if (e.Key == Key.Delete) { DeleteSheet(ch, sh); e.Handled = true; }
            else if (e.Key == Key.F2) { FocusInspectorField("title"); e.Handled = true; }
            else if (Keyboard.Modifiers == ModifierKeys.Alt && e.SystemKey is Key.Up or Key.Down) { MoveSheet(ch, sh, e.SystemKey == Key.Up ? -1 : 1); FocusNav(); e.Handled = true; }
        };
        NavAddBtn.Click += (_, _) =>
        {
            var m = new ContextMenu();
            AddAll(m, Mc("sheet.new"), Mc("sheet.chapter"), Mc("sheet.pdf"));
            OpenMenu(m, NavAddBtn);
        };
        Layers.SelectionChanged += (_, _) =>
        {
            if (_syncing) return;
            var ids = Layers.SelectedItems.Cast<ListBoxItem>().Select(i => (string)i.Tag).ToList();
            _syncing = true;
            View.Select(ids);
            _syncing = false;
            BuildInspector();
            SyncSelText();
            PlaceSelBar();
        };
        Layers.PreviewKeyDown += (_, e) =>
        {
            if (e.Key == Key.Delete) { DeleteSelected(); e.Handled = true; }
            else if (e.Key == Key.F2) { FocusInspectorField("name"); e.Handled = true; }
            else if (e.Key is Key.Enter or Key.Escape) { FocusCanvas(); e.Handled = true; }
        };
    }

    void FocusNav()
    {
        var item = Nav.Items.OfType<ListBoxItem>().FirstOrDefault(i => i.IsSelected) ?? Nav.Items.OfType<ListBoxItem>().FirstOrDefault(i => i.Tag is Sheet);
        if (item == null) return;
        Nav.ScrollIntoView(item);
        Dispatcher.BeginInvoke(() => item.Focus(), System.Windows.Threading.DispatcherPriority.Input);
    }

    void BuildNav()
    {
        var focused = Nav.IsKeyboardFocusWithin;
        Nav.Items.Clear();
        if (_store == null) return;
        var issuesBySheet = _issues.GroupBy(i => i.Sheet).ToDictionary(g => g.Key, g => (Errors: g.Count(x => x.Error), All: g.Count()));
        ListBoxItem? current = null;
        foreach (var ch in _store.Project.Chapters)
        {
            var collapsed = _collapsed.Contains(ch.Id);
            Nav.Items.Add(ChapterRow(ch, collapsed));
            if (collapsed && ch != _chapter) continue;
            for (var i = 0; i < ch.Sheets.Count; i++)
            {
                var sh = ch.Sheets[i];
                if (collapsed && sh != _sheet) continue;
                var item = SheetRow(ch, sh, i + 1, issuesBySheet.GetValueOrDefault(sh));
                Nav.Items.Add(item);
                if (sh == _sheet) current = item;
            }
        }
        if (current != null)
        {
            current.IsSelected = true;
            Nav.ScrollIntoView(current);
            if (focused) Dispatcher.BeginInvoke(() => current.Focus(), System.Windows.Threading.DispatcherPriority.Input);
        }
    }

    ListBoxItem ChapterRow(Chapter ch, bool collapsed)
    {
        var g = new Grid { Margin = new Thickness(0, 6, 0, 2) };
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(20) });
        g.ColumnDefinitions.Add(new ColumnDefinition());
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        g.Children.Add(Kit.Icon(collapsed ? "" : "", 10, "Muted"));
        var t = new StackPanel();
        var title = Kit.Text(ch.Title.Length > 0 ? ch.Title : "Без названия", 13, "Ink", FontWeights.SemiBold, wrap: true);
        title.MaxHeight = 38;
        t.Children.Add(title);
        Grid.SetColumn(t, 1);
        g.Children.Add(t);
        if (ch.DocName.Length > 0)
        {
            var chip = Kit.Chip(ch.DocName, "Hover", "Muted", 10);
            chip.Margin = new Thickness(6, 0, 0, 0);
            chip.VerticalAlignment = VerticalAlignment.Top;
            Grid.SetColumn(chip, 2);
            g.Children.Add(chip);
        }
        var item = new ListBoxItem
        {
            Content = g, Tag = ch, Focusable = false, Padding = new Thickness(6, 2, 6, 2),
            ToolTip = $"{ch.Title} — разворотов {ch.Sheets.Count}, связей {ch.Sheets.Sum(s => s.Links.Count)}. Щелчок — свернуть или развернуть",
        };
        // Заголовок главы не выбирается — только сворачивается.
        item.PreviewMouseLeftButtonDown += (_, e) =>
        {
            if (!_collapsed.Remove(ch.Id)) _collapsed.Add(ch.Id);
            BuildNav();
            e.Handled = true;
        };
        var m = new ContextMenu();
        AddAll(m, Mi("Новый разворот в главе", () => { PickSheet(ch, ch.Sheets.LastOrDefault()); AddSheet(); }),
            Mi("Название главы и документа", () => { PickSheet(ch, ch.Sheets.FirstOrDefault()); FocusInspectorField("chapter"); }),
            new Separator(), Mi("Удалить главу…", () => DeleteChapter(ch)));
        item.ContextMenu = m;
        return item;
    }

    ListBoxItem SheetRow(Chapter ch, Sheet sh, int n, (int Errors, int All) issues)
    {
        var g = new Grid();
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(26) });
        g.ColumnDefinitions.Add(new ColumnDefinition());
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var num = Kit.Text(n.ToString(), 12, "Faint");
        num.VerticalAlignment = VerticalAlignment.Top;
        num.Margin = new Thickness(0, 1, 0, 0);
        g.Children.Add(num);
        var t = new StackPanel();
        var title = Kit.Text(sh.Title.Length > 0 ? sh.Title : "Без названия", 13, "Ink", wrap: true);
        title.MaxHeight = 36;
        t.Children.Add(title);
        var sub = new List<string>();
        if (sh.Page.Length > 0) sub.Add(sh.Page);
        sub.Add(sh.Links.Count == 0 ? "нет связей" : $"связей {sh.Links.Count}");
        var undescribed = sh.Links.Count(k => k.DocField.Length == 0 || k.SystemField.Length == 0);
        if (undescribed > 0) sub.Add($"без описания {undescribed}");
        t.Children.Add(Kit.Text(string.Join(" · ", sub), 11, "Muted"));
        Grid.SetColumn(t, 1);
        g.Children.Add(t);
        if (issues.All > 0)
        {
            var dot = new Border
            {
                Width = 8, Height = 8, CornerRadius = new CornerRadius(4), Margin = new Thickness(6, 5, 0, 0), VerticalAlignment = VerticalAlignment.Top,
                Background = Kit.B(issues.Errors > 0 ? "Danger" : "Warn"),
                ToolTip = issues.Errors > 0 ? $"Ошибок: {issues.Errors}" : $"Проверить: {issues.All}",
            };
            Grid.SetColumn(dot, 2);
            g.Children.Add(dot);
        }
        var item = new ListBoxItem { Content = g, Tag = sh, Padding = new Thickness(6, 5, 8, 5), ToolTip = $"{sh.Title}{(sh.Page.Length > 0 ? " · " + sh.Page : "")}" };
        var m = new ContextMenu();
        var i = ch.Sheets.IndexOf(sh);
        AddAll(m,
            Mi("Переименовать", () => { PickSheet(ch, sh); FocusInspectorField("title"); }, "F2"),
            Mi("Новый разворот после", () => { PickSheet(ch, sh); AddSheet(); }, "Ctrl+Shift+N"),
            new Separator(),
            i > 0 ? Mi("Выше", () => MoveSheet(ch, sh, -1), "Alt+↑") : null,
            i < ch.Sheets.Count - 1 ? Mi("Ниже", () => MoveSheet(ch, sh, 1), "Alt+↓") : null,
            new Separator(),
            Mi("Удалить разворот…", () => DeleteSheet(ch, sh), "Delete"));
        item.ContextMenu = m;
        return item;
    }

    // --- слои -------------------------------------------------------------------

    void BuildLayers()
    {
        Layers.Items.Clear();
        LayersCount.Text = _sheet == null || _sheet.Layers.Count == 0 ? "" : _sheet.Layers.Count.ToString();
        if (_sheet == null) return;
        // Сверху вниз, как на полотне: первым в списке — верхний слой.
        for (var i = _sheet.Layers.Count - 1; i >= 0; i--)
        {
            var l = _sheet.Layers[i];
            var eye = new ToggleButton
            {
                Content = l.Hidden ? "" : "", IsChecked = !l.Hidden, Style = Kit.S("IconToggle"),
                ToolTip = l.Hidden ? "Скрыт — показать (Ctrl+Shift+H)" : "Виден — скрыть (Ctrl+Shift+H)",
            };
            var lck = new ToggleButton
            {
                Content = l.Locked ? "" : "", IsChecked = l.Locked, Style = Kit.S("IconToggle"),
                ToolTip = l.Locked ? "Закреплён: мышью не выбирается и не двигается — открепить (Ctrl+Shift+L)" : "Закрепить (Ctrl+Shift+L)",
            };
            eye.Click += (_, _) => Edit(eye.IsChecked == true ? "Показать слой" : "Скрыть слой", () => l.Hidden = eye.IsChecked != true);
            lck.Click += (_, _) => Edit(lck.IsChecked == true ? "Закрепить слой" : "Открепить слой", () => l.Locked = lck.IsChecked == true);
            var thumb = new Border
            {
                Width = 40, Height = 30, CornerRadius = new CornerRadius(3), Background = Kit.B("Card"), BorderBrush = Kit.B("Line"),
                BorderThickness = new Thickness(1), Margin = new Thickness(4, 0, 8, 0), ClipToBounds = true,
                Child = l.Kind == LayerKind.Table
                    ? Kit.Icon("", 14, "Muted")
                    : new Image { Stretch = Stretch.Uniform, Source = Thumb(l) },
            };
            if (thumb.Child is TextBlock tb) tb.HorizontalAlignment = HorizontalAlignment.Center;
            var name = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
            name.Children.Add(Kit.Text(l.Name.Length > 0 ? l.Name : "Без названия", 12, l.Hidden ? "Faint" : "Ink"));
            var frames = _sheet.Frames.Count(f => f.LayerId == l.Id);
            name.Children.Add(Kit.Text(l.Kind == LayerKind.Table ? "таблица связей" : frames > 0 ? $"рамок {frames}" : "картинка", 11, "Faint"));
            var row = new Grid { Margin = new Thickness(0, 2, 0, 2) };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.ColumnDefinitions.Add(new ColumnDefinition());
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            Grid.SetColumn(thumb, 0);
            Grid.SetColumn(name, 1);
            Grid.SetColumnSpan(name, 2);
            Grid.SetColumn(lck, 3);
            Grid.SetColumn(eye, 4);
            row.Children.Add(thumb);
            row.Children.Add(name);
            row.Children.Add(lck);
            row.Children.Add(eye);
            // Значки видны у выбранной строки, при наведении и когда слой
            // скрыт или закреплён — иначе список пестрит одинаковыми значками.
            var item = new ListBoxItem { Content = row, Tag = l.Id, Padding = new Thickness(4, 3, 4, 3), HorizontalContentAlignment = HorizontalAlignment.Stretch };
            void Icons() { var show = item.IsMouseOver || item.IsSelected; eye.Opacity = show || l.Hidden ? 1 : 0; lck.Opacity = show || l.Locked ? 1 : 0; }
            item.MouseEnter += (_, _) => Icons();
            item.MouseLeave += (_, _) => Icons();
            item.Selected += (_, _) => Icons();
            item.Unselected += (_, _) => Icons();
            item.MouseDoubleClick += (_, _) => FocusInspectorField("name");
            Layers.Items.Add(item);
            if (View.Selection.Contains(l.Id)) item.IsSelected = true;
            Icons();
        }
    }

    ImageSource? Thumb(Layer l)
    {
        var bmp = _store?.Bitmap(l.Asset);
        if (bmp == null) return null;
        var c = l.Crop;
        var r = new Int32Rect((int)Math.Max(0, c.X), (int)Math.Max(0, c.Y),
            (int)Math.Max(1, Math.Min(c.W, bmp.PixelWidth - c.X)), (int)Math.Max(1, Math.Min(c.H, bmp.PixelHeight - c.Y)));
        try { return new CroppedBitmap(bmp, r); } catch (ArgumentException) { return bmp; }
    }
}
