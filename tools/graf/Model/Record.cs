using System.Text;
using System.Text.RegularExpressions;

namespace Graf.Model;

// Запись графа: папка, файл и поля в порядке файла. Поля хранятся под
// русскими ключами, как в graph.py (id, вид, заголовок, метки…); в файле —
// константы (ID, KIND, TITLE, TAGS…), соответствие — Keys.
public sealed class Record
{
    public string Folder { get; set; } = "";
    public string Path { get; set; } = "";
    public Map Fields { get; set; } = new();

    public string Id => Fields["id"] as string ?? "";
    public string Kind => Fields["вид"] as string ?? "";
    public string Title => (Fields["заголовок"] ?? Fields["термин"]) as string ?? Id;
    public string Status => Fields["статус"] as string ?? "";
    public string Date => Fields["дата"] as string ?? "";
    public string Source => Fields["источник"] as string ?? "";
    public string OldName => Fields["прежнее_имя"] as string ?? "";
    public List<string> Tags => (Fields["метки"] as List<object?> ?? new()).OfType<string>().ToList();
    public List<string> Points => (Fields["пункты"] as List<object?> ?? new()).Select(x => x?.ToString() ?? "").ToList();
    public List<Map> Links => (Fields["связи"] as List<object?> ?? new()).OfType<Map>().ToList();

    // Текст для поиска: всё, что в записи, одной строкой в нижнем регистре.
    string? _hay;
    public string Haystack => _hay ??= string.Join(" ", Fields.Select(p => Flat(p.Value))).ToLowerInvariant();
    static string Flat(object? v) => v switch
    {
        null => "",
        string s => s,
        Map m => string.Join(" ", m.Select(p => Flat(p.Value))),
        IEnumerable<object?> l => string.Join(" ", l.Select(Flat)),
        _ => v.ToString() ?? "",
    };

    public Record Clone() => new() { Folder = Folder, Path = Path, Fields = (Map)DeepCopy(Fields)! };

    public static object? DeepCopy(object? v) => v switch
    {
        Map m => m.Aggregate(new Map(), (acc, p) => { acc.Add(new(p.Key, DeepCopy(p.Value))); return acc; }),
        List<object?> l => l.Select(DeepCopy).ToList(),
        _ => v,
    };
}

public static class Schema
{
    // Папка → вид записи (как FOLDERS в graph.py). Набор графа макета; у
    // проекта со своим набором (knowledge/schema.py — отдельные базы, первая —
    // база категорий по описям, 02.10.2026) его заменяет Load.
    static readonly (string Folder, string Kind, string Name, string Color)[] DefaultFolders =
    {
        ("decisions", "решение", "Решения", "#4E79A7"),
        ("rules", "правило", "Правила", "#E15759"),
        ("questions", "вопрос", "Вопросы", "#F28E2B"),
        ("tasks", "задача", "Задачи", "#EDC948"),
        ("practices", "практика", "Практики", "#59A14F"),
        ("sources", "источник", "Источники", "#B07AA1"),
        ("tools", "утилита", "Утилиты", "#76B7B2"),
        ("code", "модуль кода", "Модули кода", "#9C755F"),
        ("terms", "понятие", "Понятия (пояснения)", "#FF9DA7"),
        ("concepts", "понятие", "Реестр: понятия", "#86BCB6"),
        ("fields", "поле", "Реестр: поля", "#BAB0AC"),
        ("project", "проект", "Проект", "#8C8C8C"),
    };

    static readonly string[] DefaultStatuses =
        { "действует", "отменено", "открыт", "закрыт", "отложено", "актуально", "черновик", "подтверждён" };

    public static (string Folder, string Kind, string Name, string Color)[] Folders { get; private set; } = DefaultFolders;
    public static string[] Statuses { get; private set; } = DefaultStatuses;

    public static string SchemaPath(string root) => System.IO.Path.Combine(root, "knowledge", "schema.py");

    // Набор папок и статусов проекта: knowledge/schema.py —
    //   FOLDERS = [('папка', 'вид', 'Подпись', '#цвет'), …]
    //   STATUSES = ['…', …]            (необязательно)
    // Нет файла или он не читается — набор графа макета.
    public static void Load(string root)
    {
        Folders = DefaultFolders;
        Statuses = DefaultStatuses;
        var path = SchemaPath(root);
        if (!File.Exists(path)) return;
        try
        {
            var p = new Literal.Parser(File.ReadAllText(path, System.Text.Encoding.UTF8));
            while (!p.End)
            {
                var name = p.Name();
                if (name == null) { p.SkipStatement(); continue; }
                var v = p.Value();
                if (name == "FOLDERS" && v is List<object?> fl)
                {
                    var set = fl.OfType<List<object?>>().Where(t => t.Count >= 4)
                        .Select(t => ((string)t[0]!, (string)t[1]!, (string)t[2]!, (string)t[3]!)).ToArray();
                    if (set.Length > 0) Folders = set;
                }
                else if (name == "STATUSES" && v is List<object?> sl)
                {
                    var set = sl.OfType<string>().ToArray();
                    if (set.Length > 0) Statuses = set;
                }
            }
        }
        catch (Exception) { Folders = DefaultFolders; Statuses = DefaultStatuses; }
    }

    // Поле записи → константа в файле (KEYS в graph.py).
    public static readonly (string Key, string Const)[] Keys =
    {
        ("id", "ID"), ("вид", "KIND"), ("заголовок", "TITLE"), ("термин", "TERM"), ("синонимы", "SYNONYMS"),
        ("вид_понятия", "CONCEPT_KIND"), ("определение", "DEFINITION"), ("метки", "TAGS"), ("статус", "STATUS"),
        ("дата", "DATE"), ("источник", "SOURCE"), ("снято", "TAKEN"), ("прежнее_имя", "OLD_NAME"),
        ("понятие_реестра", "REGISTRY_CONCEPT"), ("тип_значения", "VALUE_TYPE"), ("единица", "UNIT"),
        ("значений_в_списке", "LIST_SIZE"), ("строка_таблицы", "TABLE_ROW"), ("обязательное_в", "REQUIRED_IN"),
        ("этап_заполнения", "STAGE"), ("встречается", "OCCURS"), ("пункты", "POINTS"), ("связи", "LINKS"),
    };

    public static string ConstOf(string key)
    {
        foreach (var (k, c) in Keys) if (k == key) return c;
        return Regex.Replace(key, @"\W", "_").ToUpperInvariant();
    }

    public static string KeyOf(string c)
    {
        foreach (var (k, cc) in Keys) if (cc == c) return k;
        return c.ToLowerInvariant();
    }

    public static string KindOf(string folder) => Folders.FirstOrDefault(f => f.Folder == folder).Kind ?? "";
    public static string NameOf(string folder) => Folders.FirstOrDefault(f => f.Folder == folder).Name ?? folder;
    // Циклом, без лямбды: вызывается на каждый узел в каждом кадре графа.
    public static string ColorOf(string folder)
    {
        foreach (var f in Folders) if (f.Folder == folder) return f.Color;
        // Не вид записи (модуль в графе кода) — цвет из палитры по устойчивому
        // хешу имени: у модуля один и тот же цвет при каждом запуске.
        uint h = 2166136261;
        foreach (var ch in folder) { h ^= ch; h *= 16777619; }
        return Palette[h % (uint)Palette.Length];
    }

    static readonly string[] Palette =
    {
        "#5B9BD5", "#ED7D31", "#70AD47", "#FFC000", "#9E7BD8", "#4BC0C0", "#E06C9F", "#A5A5A5",
        "#C9A66B", "#6FCF97", "#F2994A", "#56CCF2", "#BB6BD9", "#EB5757", "#8FB339", "#D4A5A5",
    };

    public static string FileName(string id) => id.Replace('-', '_') + ".py";

    // ID из заголовка — как slug() в migrate_from_graph.py: транслитерация,
    // всё прочее — дефис, не длиннее 70 знаков.
    static readonly Dictionary<char, string> Tr = new()
    {
        ['а'] = "a", ['б'] = "b", ['в'] = "v", ['г'] = "g", ['д'] = "d", ['е'] = "e", ['ё'] = "e", ['ж'] = "zh",
        ['з'] = "z", ['и'] = "i", ['й'] = "y", ['к'] = "k", ['л'] = "l", ['м'] = "m", ['н'] = "n", ['о'] = "o",
        ['п'] = "p", ['р'] = "r", ['с'] = "s", ['т'] = "t", ['у'] = "u", ['ф'] = "f", ['х'] = "h", ['ц'] = "c",
        ['ч'] = "ch", ['ш'] = "sh", ['щ'] = "sch", ['ъ'] = "", ['ы'] = "y", ['ь'] = "", ['э'] = "e", ['ю'] = "yu",
        ['я'] = "ya",
    };

    public static string Slug(string name)
    {
        var s = name.ToLowerInvariant();
        s = Regex.Replace(s, @"^(decision|convention|open|task|practice|ref|probe|otlozheno)\s*:\s*", "");
        var sb = new StringBuilder();
        foreach (var ch in s) sb.Append(Tr.TryGetValue(ch, out var t) ? t : ch.ToString());
        s = Regex.Replace(sb.ToString(), "[^a-z0-9]+", "-").Trim('-');
        if (s.Length > 70) s = s[..70].TrimEnd('-');
        return s.Length > 0 ? s : "zapis";
    }
}
