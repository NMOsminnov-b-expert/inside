using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;

namespace Razmetka.Ui;

// Настройка клавиш (VS Code Keyboard Shortcuts editor; практика razmetka-
// dokumentov-perenaznachenie-klavish-i-temnaya-tema): поиск по названию и по
// клавише; «Изменить» — нажать сочетание (Esc — отмена, Backspace — без
// клавиши); занятое сочетание — «уже у «…»», Enter — забрать себе; «Сбросить»
// у строки и «Сбросить все». Сохраняется сразу — окно можно просто закрыть.
public sealed class KeysEditor : Window
{
    readonly CommandSet _cmds;
    readonly Settings _settings;
    readonly Action _changed;
    readonly TextBox _q = Kit.Box();
    readonly StackPanel _list = new();
    readonly TextBlock _hint = Kit.Text("", 12, "Muted", wrap: true);
    Cmd? _recording;
    Chord? _pending;

    public KeysEditor(Window owner, CommandSet cmds, Settings settings, Action changed)
    {
        Owner = owner;
        _cmds = cmds;
        _settings = settings;
        _changed = changed;
        Title = "Клавиши";
        Width = 760;
        Height = 640;
        MinWidth = 560;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        Background = Kit.B("Panel");
        var dock = new DockPanel { Margin = new Thickness(20, 16, 20, 16) };
        var head = new StackPanel();
        head.Children.Add(Kit.Text("Клавиши", 20, "Ink", FontWeights.SemiBold));
        head.Children.Add(Kit.Text("Поиск — по названию команды или по клавише («Ctrl+D», «L»). Изменения сохраняются сразу.", 12, "Muted", wrap: true).Also(t => t.Margin = new Thickness(0, 2, 0, 10)));
        var qrow = new DockPanel { Margin = new Thickness(0, 0, 0, 8) };
        var resetAll = Kit.TextBtn("Сбросить все", "Вернуть все клавиши как были", ResetAll, "OutlineBtn");
        resetAll.Margin = new Thickness(8, 0, 0, 0);
        DockPanel.SetDock(resetAll, Dock.Right);
        qrow.Children.Add(resetAll);
        qrow.Children.Add(_q);
        head.Children.Add(qrow);
        head.Children.Add(_hint);
        DockPanel.SetDock(head, Dock.Top);
        dock.Children.Add(head);
        var sv = new ScrollViewer { Content = _list, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Margin = new Thickness(0, 8, 0, 0) };
        dock.Children.Add(sv);
        // Фон — у содержимого: так окно одинаково и в теме, и на снимке.
        Content = new Border { Background = Kit.B("Panel"), Child = dock };
        _q.TextChanged += (_, _) => Fill();
        PreviewKeyDown += OnKey;
        Loaded += (_, _) => { Fill(); _q.Focus(); };
        Hint();
    }

    void Hint(string? s = null)
    {
        _hint.Text = s ?? "«Изменить» — затем нажмите новое сочетание.";
        _hint.Foreground = Kit.B(s != null && s.StartsWith("Уже") ? "Warn" : "Muted");
    }

    void Fill()
    {
        _list.Children.Clear();
        var q = _q.Text.Trim();
        foreach (var g in _cmds.All.Where(c => Matches(c, q)).GroupBy(c => c.Group))
        {
            var h = Kit.Text(g.Key, 12, "Accent", FontWeights.SemiBold);
            h.Margin = new Thickness(4, _list.Children.Count == 0 ? 0 : 14, 0, 4);
            _list.Children.Add(h);
            foreach (var c in g) _list.Children.Add(Row(c));
        }
        if (_list.Children.Count == 0) _list.Children.Add(Kit.Text("Ничего не найдено", 13, "Muted").Also(t => t.Margin = new Thickness(4, 8, 0, 0)));
    }

    static bool Matches(Cmd c, string q)
    {
        if (q.Length == 0) return true;
        var keys = string.Join(" ", c.Keys.Select(k => k.ToString()));
        return (c.Title + " " + c.Hint + " " + c.Group).Contains(q, StringComparison.OrdinalIgnoreCase)
               || keys.Contains(q, StringComparison.OrdinalIgnoreCase);
    }

    UIElement Row(Cmd c)
    {
        var g = new Grid { Margin = new Thickness(0, 1, 0, 1) };
        g.ColumnDefinitions.Add(new ColumnDefinition());
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(210) });
        g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var t = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        t.Children.Add(Kit.Text(c.InPalette ? c.Title : c.Hint.Length > 0 ? c.Hint : c.Title, 13));
        if (c.Changed) t.Children.Add(Kit.Text("изменено", 11, "Accent"));
        g.Children.Add(t);
        var keys = new WrapPanel { VerticalAlignment = VerticalAlignment.Center };
        if (_recording == c)
            keys.Children.Add(Kit.Text(_pending is { } p ? p.ToString() + " — Enter" : "Нажмите сочетание…", 12, "Accent", FontWeights.SemiBold));
        else if (c.Keys.Length == 0) keys.Children.Add(Kit.Text("без клавиши", 12, "Faint"));
        else foreach (var k in c.Keys) keys.Children.Add(Kit.Kbd(k.ToString()).Also(b => b.Margin = new Thickness(0, 0, 6, 0)));
        Grid.SetColumn(keys, 1);
        g.Children.Add(keys);
        var acts = new StackPanel { Orientation = Orientation.Horizontal };
        acts.Children.Add(Kit.IconBtn("", "Изменить", () => Record(c), 12, "Muted"));
        if (c.Changed) acts.Children.Add(Kit.IconBtn("", "Сбросить: " + string.Join(", ", c.Defaults.Select(k => k.ToString())), () => Reset(c), 12, "Muted"));
        Grid.SetColumn(acts, 2);
        g.Children.Add(acts);
        return new Border
        {
            Child = g, Padding = new Thickness(8, 4, 4, 4), CornerRadius = new CornerRadius(4),
            Background = _recording == c ? Kit.B("AccentSoft") : Brushes.Transparent,
        };
    }

    void Record(Cmd c)
    {
        _recording = c;
        _pending = null;
        Hint($"«{c.Title}»: нажмите сочетание. Esc — отмена, Backspace — без клавиши.");
        Fill();
        Keyboard.Focus(this);
    }

    void OnKey(object sender, KeyEventArgs e)
    {
        if (_recording is not { } c) return;
        e.Handled = true;
        var key = e.Key == Key.System ? e.SystemKey : e.Key;
        if (key is Key.LeftCtrl or Key.RightCtrl or Key.LeftShift or Key.RightShift or Key.LeftAlt or Key.RightAlt or Key.LWin or Key.RWin) return;
        var mods = Keyboard.Modifiers;
        if (key == Key.Escape && mods == ModifierKeys.None) { _recording = null; _pending = null; Hint(); Fill(); _q.Focus(); return; }
        if (key == Key.Back && mods == ModifierKeys.None) { Set(c, Array.Empty<Chord>()); return; }
        if (key == Key.Enter && mods == ModifierKeys.None && _pending is { } p) { Take(c, p); return; }
        var chord = new Chord(key, mods);
        // Команда, работающая и в поле ввода, не получает одиночную букву:
        // она перестала бы печататься.
        var plain = mods is ModifierKeys.None or ModifierKeys.Shift && key is >= Key.A and <= Key.Z or >= Key.D0 and <= Key.D9 or Key.Space;
        if (c.Scope == Scope.Global && plain) { Hint($"«{chord}» — буква: команда работает и в полях ввода, там буква перестала бы печататься. Возьмите сочетание с Ctrl или Alt, или клавишу F1–F12."); return; }
        var holders = _cmds.Holders(chord, c).ToList();
        if (holders.Count > 0)
        {
            _pending = chord;
            Hint($"Уже у «{string.Join("», «", holders.Select(h => h.Title))}». Enter — забрать себе, другое сочетание — попробовать ещё, Esc — отмена.");
            Fill();
            return;
        }
        Set(c, new[] { chord });
    }

    void Take(Cmd c, Chord k)
    {
        foreach (var h in _cmds.Holders(k, c).ToList()) Store(h, h.Keys.Where(x => x != k).ToArray());
        Set(c, new[] { k });
    }

    void Set(Cmd c, Chord[] keys)
    {
        Store(c, keys);
        _recording = null;
        _pending = null;
        Hint(keys.Length == 0 ? $"«{c.Title}» — без клавиши" : $"«{c.Title}» — {keys[0]}");
        Commit();
    }

    void Store(Cmd c, Chord[] keys)
    {
        if (keys.SequenceEqual(c.Defaults)) _settings.Keys.Remove(c.Id);
        else _settings.Keys[c.Id] = keys.Select(k => k.Serialize()).ToList();
    }

    void Reset(Cmd c)
    {
        _settings.Keys.Remove(c.Id);
        Hint($"«{c.Title}» — как было");
        Commit();
    }

    void ResetAll()
    {
        if (_settings.Keys.Count == 0) { Hint("Все клавиши и так исходные"); return; }
        if (MessageBox.Show(this, $"Вернуть исходные клавиши у всех изменённых команд ({_settings.Keys.Count})?", "Клавиши",
                MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        _settings.Keys.Clear();
        Hint("Все клавиши — исходные");
        Commit();
    }

    void Commit()
    {
        _cmds.Apply(_settings.Keys);
        _settings.Save();
        _changed();
        Fill();
    }
}
