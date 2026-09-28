using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Graf.Model;

// Выгрузка графа одним файлом и загрузка обратно. Файл — JSON: все записи
// с папкой и полями в том порядке, в каком они стоят в записи, так что
// загрузка восстанавливает файлы записей байт в байт. Файл остаётся на этой
// машине — куда его положить, выбирает человек.
//
// Загрузка сначала сравнивает файл с графом (новые, изменённые, совпадают,
// есть только в графе) и ничего не пишет без подтверждения. Записи, которых
// нет в файле, по умолчанию остаются; удалить их — отдельный выбор.
public static class Exchange
{
    const string Format = "граф проекта";

    static readonly JsonWriterOptions WriterOptions = new()
    {
        Indented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static void Export(Store store, string file)
    {
        using var fs = File.Create(file);
        using var w = new Utf8JsonWriter(fs, WriterOptions);
        w.WriteStartObject();
        w.WriteString("формат", Format);
        w.WriteNumber("версия", 1);
        w.WriteString("выгружено", DateTime.Now.ToString("yyyy-MM-ddTHH:mm:ss"));
        w.WriteString("проект", new DirectoryInfo(store.Root).Name);
        var all = store.All.OrderBy(r => r.Folder).ThenBy(r => r.Id).ToList();
        w.WriteNumber("записей", all.Count);
        w.WritePropertyName("записи");
        w.WriteStartArray();
        foreach (var r in all)
        {
            w.WriteStartObject();
            w.WriteString("папка", r.Folder);
            w.WritePropertyName("поля");
            Write(w, r.Fields);
            w.WriteEndObject();
        }
        w.WriteEndArray();
        w.WriteEndObject();
    }

    static void Write(Utf8JsonWriter w, object? v)
    {
        switch (v)
        {
            case null: w.WriteNullValue(); break;
            case string s: w.WriteStringValue(s); break;
            case bool b: w.WriteBooleanValue(b); break;
            case long or int: w.WriteNumberValue(Convert.ToInt64(v)); break;
            // Дробное число с нулевой дробью JSON записал бы целым — и
            // загрузка вернула бы 1 вместо 1.0. Такое хранится строкой-пометкой.
            case double d when d == Math.Floor(d) && !double.IsInfinity(d):
                w.WriteStartObject(); w.WriteNumber("дробное", d); w.WriteEndObject(); break;
            case double d: w.WriteNumberValue(d); break;
            case Map m:
                w.WriteStartObject();
                foreach (var (k, x) in m) { w.WritePropertyName(k); Write(w, x); }
                w.WriteEndObject();
                break;
            case List<object?> l:
                w.WriteStartArray();
                foreach (var x in l) Write(w, x);
                w.WriteEndArray();
                break;
            default: w.WriteStringValue(v.ToString()); break;
        }
    }

    static object? Read(JsonElement e) => e.ValueKind switch
    {
        JsonValueKind.Null => null,
        JsonValueKind.String => e.GetString(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Number => e.TryGetInt64(out var l) ? (object)l : e.GetDouble(),
        JsonValueKind.Array => e.EnumerateArray().Select(Read).ToList(),
        JsonValueKind.Object when e.EnumerateObject().Count() == 1 && e.TryGetProperty("дробное", out var d) => d.GetDouble(),
        JsonValueKind.Object => ToMap(e),
        _ => null,
    };

    static Map ToMap(JsonElement e)
    {
        var m = new Map();
        foreach (var p in e.EnumerateObject()) m.Add(new(p.Name, Read(p.Value)));
        return m;
    }

    public sealed class Plan
    {
        public string Exported = "", Project = "";
        public List<Record> Added = new(), Changed = new(), Same = new();
        public List<Record> OnlyInGraph = new();
        public List<string> Errors = new();
    }

    public static Plan Compare(Store store, string file)
    {
        var plan = new Plan();
        using var doc = JsonDocument.Parse(File.ReadAllText(file, Encoding.UTF8));
        var root = doc.RootElement;
        if (!root.TryGetProperty("формат", out var f) || f.GetString() != Format)
            throw new InvalidDataException("Это не выгрузка графа проекта: в файле нет пометки «формат: граф проекта».");
        plan.Exported = root.TryGetProperty("выгружено", out var x) ? x.GetString() ?? "" : "";
        plan.Project = root.TryGetProperty("проект", out var p) ? p.GetString() ?? "" : "";
        var folders = Schema.Folders.Select(s => s.Folder).ToHashSet();
        var seen = new HashSet<string>();
        foreach (var e in root.GetProperty("записи").EnumerateArray())
        {
            var folder = e.GetProperty("папка").GetString() ?? "";
            var r = new Record { Folder = folder, Fields = ToMap(e.GetProperty("поля")) };
            if (!folders.Contains(folder)) { plan.Errors.Add($"{r.Id}: неизвестная папка «{folder}»"); continue; }
            if (string.IsNullOrWhiteSpace(r.Fields["id"] as string)) { plan.Errors.Add($"запись без ID в папке {folder}"); continue; }
            if (!seen.Add(r.Id)) { plan.Errors.Add($"{r.Id}: ID повторяется в файле"); continue; }
            var cur = store.ById(r.Id);
            if (cur == null) plan.Added.Add(r);
            else
            {
                r.Path = cur.Path;
                if (cur.Folder == r.Folder && Store.Render(cur) == Store.Render(r)) plan.Same.Add(r);
                else plan.Changed.Add(r);
            }
        }
        plan.OnlyInGraph = store.All.Where(r => !seen.Contains(r.Id)).OrderBy(r => r.Title).ToList();
        return plan;
    }

    public static void Apply(Store store, Plan plan, bool removeMissing)
    {
        foreach (var r in plan.Added.Concat(plan.Changed)) store.Save(r);
        if (removeMissing) foreach (var r in plan.OnlyInGraph) store.Delete(r);
    }
}
