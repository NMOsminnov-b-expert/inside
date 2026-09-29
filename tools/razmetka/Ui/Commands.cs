using System.Windows.Input;

namespace Razmetka.Ui;

// Реестр команд (практика interfeys-razmetki-dokumentov-klavishi-palitra-
// komand-inspektor-po-vyb, по образцу actions у tldraw): каждое действие
// описано один раз — название, группа, клавиши, когда доступно, что делает.
// Из реестра строятся обработка клавиш, палитра команд (Ctrl+K), меню правой
// кнопки, подсказки «Название — клавиша» и шпаргалка (F1). Поэтому подпись и
// клавиша нигде не расходятся, а переназначить клавишу — правка одной строки.
//
// Где действует клавиша (Scope):
//   Global — всегда, и в поле ввода тоже (Ctrl+S, Ctrl+K, F1);
//   App    — всегда, кроме поля ввода (Ctrl+Z в поле — отмена набора);
//   Canvas — только когда фокус на полотне или ни на чём: одиночные буквы,
//            стрелки, Tab, Enter, Delete не должны срабатывать в списке
//            разворотов или в поле описания.
public enum Scope { Global, App, Canvas }

public readonly record struct Chord(Key Key, ModifierKeys Mods = ModifierKeys.None)
{
    public bool Matches(Key k, ModifierKeys m) => k == Key && m == Mods;

    public override string ToString()
    {
        var parts = new List<string>();
        if (Mods.HasFlag(ModifierKeys.Control)) parts.Add("Ctrl");
        if (Mods.HasFlag(ModifierKeys.Shift)) parts.Add("Shift");
        if (Mods.HasFlag(ModifierKeys.Alt)) parts.Add("Alt");
        parts.Add(KeyName(Key));
        return string.Join("+", parts);
    }

    public static string KeyName(Key k) => k switch
    {
        >= Key.D0 and <= Key.D9 => ((int)(k - Key.D0)).ToString(),
        Key.OemPlus or Key.Add => "+",
        Key.OemMinus or Key.Subtract => "−",
        Key.OemOpenBrackets => "[",
        Key.OemCloseBrackets => "]",
        Key.Oem5 => "\\",
        Key.Next => "PageDown",
        Key.Prior => "PageUp",
        Key.Return => "Enter",
        Key.Escape => "Esc",
        Key.Delete => "Delete",
        Key.Back => "Backspace",
        Key.Space => "Пробел",
        Key.Left => "←",
        Key.Right => "→",
        Key.Up => "↑",
        Key.Down => "↓",
        _ => k.ToString(),
    };
}

public sealed class Cmd
{
    public required string Id { get; init; }
    public required string Title { get; init; }
    public required string Group { get; init; }
    public Scope Scope { get; init; } = Scope.Canvas;
    public Chord[] Keys { get; init; } = Array.Empty<Chord>();
    public Func<bool> When { get; init; } = () => true;
    public required Action Run { get; init; }
    // Пояснение в палитре и шпаргалке: что именно сделает команда.
    public string Hint { get; init; } = "";
    // Служебные (сдвиг стрелками, вид связи цифрой) — в шпаргалке одной
    // строкой, в палитре не показываются.
    public bool InPalette { get; init; } = true;
    // Подпись клавиш для шпаргалки, если их несколько или они — диапазон.
    public string? KeysText { get; init; }

    public string KeyLabel => KeysText ?? (Keys.Length == 0 ? "" : Keys[0].ToString());
    public string Tip => KeyLabel.Length == 0 ? Title : $"{Title} — {KeyLabel}";
}

public sealed class CommandSet
{
    readonly List<Cmd> _all = new();
    readonly Dictionary<string, Cmd> _byId = new();
    // Недавние команды — первыми в палитре на пустом запросе.
    readonly List<string> _recent = new();

    public IReadOnlyList<Cmd> All => _all;
    public IReadOnlyList<string> Recent => _recent;

    public Cmd Add(Cmd c)
    {
        _all.Add(c);
        _byId[c.Id] = c;
        return c;
    }

    public Cmd this[string id] => _byId[id];
    public bool Has(string id) => _byId.ContainsKey(id);

    public bool Execute(string id)
    {
        if (!_byId.TryGetValue(id, out var c) || !c.When()) return false;
        Remember(c);
        c.Run();
        return true;
    }

    void Remember(Cmd c)
    {
        // Служебные — палитра, шпаргалка, Esc — в недавние не попадают.
        if (!c.InPalette || c.Id is "go.palette" or "help.keys" or "edit.escape") return;
        _recent.Remove(c.Id);
        _recent.Insert(0, c.Id);
        if (_recent.Count > 8) _recent.RemoveAt(_recent.Count - 1);
    }

    // Клавиша → команда. inText — фокус в поле ввода; onCanvas — фокус на
    // полотне или ни на чём (одиночные клавиши работают только тогда).
    public bool Handle(Key key, ModifierKeys mods, bool inText, bool onCanvas)
    {
        foreach (var c in _all)
        {
            if (c.Scope == Scope.App && inText) continue;
            if (c.Scope == Scope.Canvas && (inText || !onCanvas)) continue;
            if (!c.Keys.Any(k => k.Matches(key, mods))) continue;
            if (!c.When()) continue;
            Remember(c);
            c.Run();
            return true;
        }
        return false;
    }
}
