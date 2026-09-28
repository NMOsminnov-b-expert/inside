using System.Globalization;
using System.Text;

namespace Graf.Model;

// Значения записи графа — подмножество литералов Python: строка, целое,
// дробное, True/False/None, список (или кортеж), словарь со строковыми
// ключами. Разбор — без исполнения: файл записи — данные, не код.
//
// Запись значений — тот же алгоритм, что graph.py (literal, inline, quote):
// значение в строку, если строка с отступом и именем влезает в Width; иначе
// список или словарь по элементу на строку; строки не переносятся. Файл,
// сохранённый отсюда и из graph.py, одинаков байт в байт.

// Словарь с порядком ключей — как dict в Python.
public sealed class Map : List<KeyValuePair<string, object?>>
{
    public object? this[string key]
    {
        get => this.FirstOrDefault(p => p.Key == key).Value;
        set
        {
            var i = FindIndex(p => p.Key == key);
            if (i >= 0) this[i] = new(key, value);
            else Add(new(key, value));
        }
    }

    public bool Has(string key) => this.Any(p => p.Key == key);
    public void Remove(string key) => RemoveAll(p => p.Key == key);
}

public static class Literal
{
    public const int Width = 110;

    // --- запись -----------------------------------------------------------

    public static string Quote(string s)
    {
        var q = s.Contains('\'') && !s.Contains('"') ? '"' : '\'';
        var sb = new StringBuilder(s.Length + 2);
        sb.Append(q);
        foreach (var ch in s)
        {
            switch (ch)
            {
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (ch == q) sb.Append('\\').Append(ch);
                    else if (ch < 0x20 || ch == 0x7f) sb.Append("\\x").Append(((int)ch).ToString("x2"));
                    else sb.Append(ch);
                    break;
            }
        }
        return sb.Append(q).ToString();
    }

    public static string Inline(object? v) => v switch
    {
        null => "None",
        bool b => b ? "True" : "False",
        string s => Quote(s),
        long or int => Convert.ToInt64(v).ToString(CultureInfo.InvariantCulture),
        double d => PyFloat(d),
        Map m => "{" + string.Join(", ", m.Select(p => Quote(p.Key) + ": " + Inline(p.Value))) + "}",
        IEnumerable<object?> l => "[" + string.Join(", ", l.Select(Inline)) + "]",
        _ => throw new ArgumentException("значение не поддерживается: " + v.GetType().Name),
    };

    // repr(float) Python: кратчайшее представление, у целого — «.0».
    static string PyFloat(double d)
    {
        var s = d.ToString("R", CultureInfo.InvariantCulture);
        return s.Contains('.') || s.Contains('E') || s.Contains('N') || s.Contains('I') ? s : s + ".0";
    }

    public static string Format(object? v, int indent = 0, int lead = 0)
    {
        var one = Inline(v);
        var isColl = v is Map || (v is IEnumerable<object?> && v is not string);
        if (lead + one.Length <= Width || !isColl || IsEmpty(v)) return one;
        var pad = new string(' ', indent + 4);
        var sb = new StringBuilder();
        if (v is Map m)
        {
            sb.Append("{\n");
            var rows = m.Select(p =>
            {
                var head = Quote(p.Key) + ": ";
                return pad + head + Format(p.Value, indent + 4, indent + 4 + head.Length) + ",";
            });
            sb.Append(string.Join("\n", rows)).Append('\n').Append(' ', indent).Append('}');
            return sb.ToString();
        }
        var list = (IEnumerable<object?>)v!;
        sb.Append("[\n");
        sb.Append(string.Join("\n", list.Select(x => pad + Format(x, indent + 4, indent + 4) + ",")));
        sb.Append('\n').Append(' ', indent).Append(']');
        return sb.ToString();
    }

    static bool IsEmpty(object? v) => v switch
    {
        Map m => m.Count == 0,
        IEnumerable<object?> l => !l.Any(),
        _ => false,
    };

    // Длина строки в Python — в символах Юникода, как и string.Length в C#
    // для текста без суррогатных пар (кириллица, «», —). Эмодзи в записях
    // графа не ожидаются; если появятся, ширина посчитается чуть иначе, но
    // файл всё равно останется корректным.

    // --- разбор -----------------------------------------------------------

    public sealed class Parser
    {
        readonly string _s;
        int _i;

        public Parser(string s) { _s = s; }

        public int Pos => _i;
        public bool End { get { SkipWs(); return _i >= _s.Length; } }

        public void SkipWs()
        {
            while (_i < _s.Length)
            {
                var c = _s[_i];
                if (c is ' ' or '\t' or '\r' or '\n') { _i++; continue; }
                if (c == '#') { while (_i < _s.Length && _s[_i] != '\n') _i++; continue; }
                break;
            }
        }

        char Peek(int k) => _i + k < _s.Length ? _s[_i + k] : '\0';

        Exception Error(string what) => new FormatException($"{what} (позиция {_i})");

        public object? Value()
        {
            SkipWs();
            if (_i >= _s.Length) throw Error("нет значения");
            var c = _s[_i];
            if (c is '\'' or '"') return Strings();
            if (c == '[') return Seq('[', ']');
            if (c == '(')
            {
                // Скобки: группировка одного значения или кортеж.
                _i++;
                var items = new List<object?>();
                var tuple = false;
                SkipWs();
                while (_s[_i] != ')')
                {
                    items.Add(Value());
                    SkipWs();
                    if (_s[_i] == ',') { tuple = true; _i++; SkipWs(); }
                }
                _i++;
                return tuple || items.Count != 1 ? items : items[0];
            }
            if (c == '{') return Dict();
            if (Word("True")) return true;
            if (Word("False")) return false;
            if (Word("None")) return null;
            if (c is '-' or '+' or '.' || char.IsDigit(c)) return Number();
            throw Error($"неожиданный знак «{c}»");
        }

        bool Word(string w)
        {
            if (string.CompareOrdinal(_s, _i, w, 0, w.Length) != 0) return false;
            var after = _i + w.Length < _s.Length ? _s[_i + w.Length] : ' ';
            if (char.IsLetterOrDigit(after) || after == '_') return false;
            _i += w.Length;
            return true;
        }

        object Number()
        {
            var st = _i;
            while (_i < _s.Length && (char.IsDigit(_s[_i]) || _s[_i] is '-' or '+' or '.' or 'e' or 'E' or '_')) _i++;
            var t = _s[st.._i].Replace("_", "");
            if (long.TryParse(t, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var l)) return l;
            return double.Parse(t, NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        // Соседние строковые литералы склеиваются, как в Python.
        string Strings()
        {
            var sb = new StringBuilder();
            do
            {
                sb.Append(OneString());
                SkipWs();
            } while (_i < _s.Length && _s[_i] is '\'' or '"');
            return sb.ToString();
        }

        string OneString()
        {
            var q = _s[_i];
            var triple = Peek(1) == q && Peek(2) == q;
            _i += triple ? 3 : 1;
            var sb = new StringBuilder();
            while (true)
            {
                if (_i >= _s.Length) throw Error("строка не закрыта");
                var c = _s[_i];
                if (triple ? c == q && Peek(1) == q && Peek(2) == q : c == q)
                {
                    _i += triple ? 3 : 1;
                    return sb.ToString();
                }
                if (c == '\\')
                {
                    var n = Peek(1);
                    _i += 2;
                    switch (n)
                    {
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case '\\': sb.Append('\\'); break;
                        case '\'': sb.Append('\''); break;
                        case '"': sb.Append('"'); break;
                        case '\n': break;
                        case 'x': sb.Append((char)Convert.ToInt32(_s.Substring(_i, 2), 16)); _i += 2; break;
                        case 'u': sb.Append((char)Convert.ToInt32(_s.Substring(_i, 4), 16)); _i += 4; break;
                        case 'U': sb.Append(char.ConvertFromUtf32(Convert.ToInt32(_s.Substring(_i, 8), 16))); _i += 8; break;
                        default: sb.Append('\\').Append(n); break;
                    }
                    continue;
                }
                sb.Append(c);
                _i++;
            }
        }

        List<object?> Seq(char open, char close)
        {
            _i++;
            var list = new List<object?>();
            SkipWs();
            while (_s[_i] != close)
            {
                list.Add(Value());
                SkipWs();
                if (_s[_i] == ',') { _i++; SkipWs(); }
                else if (_s[_i] != close) throw Error("ожидалась запятая или «" + close + "»");
            }
            _i++;
            return list;
        }

        Map Dict()
        {
            _i++;
            var m = new Map();
            SkipWs();
            while (_s[_i] != '}')
            {
                if (Value() is not string key) throw Error("ключ словаря — не строка");
                SkipWs();
                if (_s[_i] != ':') throw Error("ожидалось «:»");
                _i++;
                m.Add(new(key, Value()));
                SkipWs();
                if (_s[_i] == ',') { _i++; SkipWs(); }
                else if (_s[_i] != '}') throw Error("ожидалась запятая или «}»");
            }
            _i++;
            return m;
        }

        // Имя константы в начале строки: «ID = …». Возвращает null, если в
        // этом месте не присваивание (описание модуля, комментарий).
        public string? Name()
        {
            SkipWs();
            var st = _i;
            while (_i < _s.Length && (char.IsLetterOrDigit(_s[_i]) || _s[_i] == '_')) _i++;
            if (_i == st) return null;
            var name = _s[st.._i];
            SkipWs();
            if (_i < _s.Length && _s[_i] == '=' && Peek(1) != '=') { _i++; return name; }
            _i = st;
            return null;
        }

        public void SkipStatement()
        {
            SkipWs();
            if (_i < _s.Length && _s[_i] is '\'' or '"') { Strings(); return; }
            while (_i < _s.Length && _s[_i] != '\n') _i++;
        }
    }
}
