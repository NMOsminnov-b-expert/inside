using System.Text.Json;

namespace Graf.Model;

// Выгрузки для программы (.graf/ в корне проекта, вне git): связи «похоже по
// смыслу» (tools/knowledge/semantic_export.py — из индекса semsearch) и граф
// кода (tools/knowledge/code_export.py — из индекса CodeGraph). Решение
// пользователя 29.09.2026 «В приложении увижу графы? Оба.» — «Делаем оба.»;
// практика graf-koda-i-svyazi-po-smyslu-v-programme-graf-proekta.
public sealed class Derived
{
    public List<(string A, string B, float Sim)> Pairs { get; } = new();
    public Dictionary<string, List<(string Id, float Sim)>> Neighbors { get; } = new();
    public string SemanticNote { get; private set; } = "";
    public CodeData? Code { get; private set; }

    public static Derived Load(string root)
    {
        var d = new Derived();
        var dir = System.IO.Path.Combine(root, ".graf");
        try
        {
            var p = System.IO.Path.Combine(dir, "semantic.json");
            if (File.Exists(p))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(p));
                var r = doc.RootElement;
                foreach (var x in r.GetProperty("pairs").EnumerateArray())
                    d.Pairs.Add((x[0].GetString()!, x[1].GetString()!, x[2].GetSingle()));
                foreach (var kv in r.GetProperty("neighbors").EnumerateObject())
                    d.Neighbors[kv.Name] = kv.Value.EnumerateArray().Select(x => (x[0].GetString()!, x[1].GetSingle())).ToList();
                d.SemanticNote = $"выгрузка {r.GetProperty("generated").GetString()?.Replace('T', ' ')}";
            }
        }
        catch (Exception) { }
        try
        {
            var p = System.IO.Path.Combine(dir, "code.json");
            if (File.Exists(p)) d.Code = CodeData.Load(root, p);
        }
        catch (Exception) { }
        return d;
    }
}

public sealed class CodeFile
{
    public string Path = "", Lang = "", Module = "";
    public List<(string Kind, string Name, int Line)> Symbols = new();
    public string Id => "file:" + Path;
}

public sealed class CodeData
{
    public const string Kind = "файл кода";
    public string Note = "";
    public List<CodeFile> Files = new();
    public Dictionary<string, CodeFile> ById = new();
    public List<(string From, string To, string Kind, int N)> Edges = new();
    public List<Record> Records = new();

    // Вид связи файла с файлом — по-русски (как виды связей графа знаний).
    public static string KindName(string k) => k switch
    {
        "calls" => "вызывает", "imports" => "импортирует", "instantiates" => "создаёт", _ => "ссылается",
    };

    public static CodeData Load(string root, string path)
    {
        var c = new CodeData();
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        var r = doc.RootElement;
        c.Note = $"выгрузка {r.GetProperty("generated").GetString()?.Replace('T', ' ')}";
        foreach (var f in r.GetProperty("files").EnumerateArray())
        {
            var cf = new CodeFile
            {
                Path = f.GetProperty("path").GetString()!, Lang = f.GetProperty("lang").GetString()!,
                Module = f.GetProperty("module").GetString()!,
                Symbols = f.GetProperty("symbols").EnumerateArray().Select(s => (s[0].GetString()!, s[1].GetString()!, s[2].GetInt32())).ToList(),
            };
            c.Files.Add(cf);
            c.ById[cf.Id] = cf;
        }
        foreach (var e in r.GetProperty("edges").EnumerateArray())
            c.Edges.Add((e[0].GetString()!, e[1].GetString()!, KindName(e[2].GetString()!), e[3].GetInt32()));
        // Файл — запись для графа: вид «файл кода», «папка» — модуль (по ней
        // острова и цвет), заголовок — путь внутри модуля, функции — в поиске.
        foreach (var f in c.Files)
        {
            var title = f.Path.StartsWith(f.Module + "/") ? f.Path[(f.Module.Length + 1)..] : f.Path;
            var rec = new Record { Folder = f.Module, Path = System.IO.Path.Combine(root, f.Path.Replace('/', System.IO.Path.DirectorySeparatorChar)) };
            rec.Fields["id"] = f.Id;
            rec.Fields["вид"] = Kind;
            rec.Fields["заголовок"] = title;
            rec.Fields["статус"] = f.Lang;
            rec.Fields["метки"] = new List<object?> { f.Module, f.Lang };
            rec.Fields["функции"] = f.Symbols.Select(s => (object?)s.Name).ToList();
            c.Records.Add(rec);
        }
        return c;
    }

    // Связи файла: один вид на пару — самый частый; концы — id записей
    // («file:» + путь), как у узлов графа.
    public IEnumerable<(string From, string To, string Type)> Links() =>
        Edges.GroupBy(e => (e.From, e.To)).Select(g => ("file:" + g.Key.From, "file:" + g.Key.To, g.OrderByDescending(x => x.N).First().Kind));
}
