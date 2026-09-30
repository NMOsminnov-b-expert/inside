using System.Text.Json;

namespace Graf.Model;

// Ход обоих индексов проекта — CodeGraph и поиска по смыслу (semsearch).
// Пишет его tools/hooks/reindex.py (после каждого коммита — хук
// tools/hooks/post-commit) в .graf/index-status.json; программа читает и
// сравнивает коммит прогона с текущим HEAD. Просьба пользователя 30.09.2026:
// «В приложении графа должны быть видны прогрессбары для обоих индексов со
// статусами. Иначе не видно, актуальная версия у нас или нет».
public sealed class IndexState
{
    public string Key = "", State = "", Stage = "", Commit = "", Note = "";
    public DateTime? Finished;
    public int Pid, Files, Chunks;

    // Что показать: running — идёт; current — готов на текущем коммите;
    // behind — готов, но на старом коммите; failed; skipped — не установлен;
    // none — сведений нет; broken — «идёт», а процесса прогона уже нет.
    public string Verdict(string head)
    {
        if (State == "") return "none";
        if (State == "running") return Alive(Pid) ? "running" : "broken";
        if (State == "failed") return "failed";
        if (State == "skipped") return "skipped";
        return head != "" && Commit != head ? "behind" : "current";
    }

    static bool Alive(int pid)
    {
        if (pid <= 0) return false;
        try { using var p = System.Diagnostics.Process.GetProcessById(pid); return !p.HasExited; }
        catch (Exception) { return false; }
    }
}

public static class IndexStatus
{
    public static string PathOf(string root) => System.IO.Path.Combine(root, ".graf", "index-status.json");

    public static (IndexState Code, IndexState Sem) Load(string root)
    {
        var code = new IndexState { Key = "codegraph" };
        var sem = new IndexState { Key = "semsearch" };
        try
        {
            var p = PathOf(root);
            if (!File.Exists(p)) return (code, sem);
            using var doc = JsonDocument.Parse(File.ReadAllText(p));
            Fill(doc.RootElement, code);
            Fill(doc.RootElement, sem);
        }
        catch (Exception) { }
        return (code, sem);
    }

    static void Fill(JsonElement root, IndexState s)
    {
        if (!root.TryGetProperty(s.Key, out var e)) return;
        string Str(string k) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
        int Int(string k) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : 0;
        s.State = Str("state");
        s.Stage = Str("stage");
        s.Commit = Str("commit");
        s.Note = Str("note");
        s.Pid = Int("pid");
        s.Files = Int("files");
        s.Chunks = Int("chunks");
        if (DateTime.TryParse(Str("finished"), out var f)) s.Finished = f;
    }

    // Текущий коммит без запуска git: .git/HEAD → ссылка ветки → её файл или
    // packed-refs. Опрос идёт раз в пару секунд, процесс git на каждый — лишний.
    public static string Head(string root)
    {
        try
        {
            var git = System.IO.Path.Combine(root, ".git");
            var head = File.ReadAllText(System.IO.Path.Combine(git, "HEAD")).Trim();
            if (!head.StartsWith("ref: ")) return head;
            var r = head[5..];
            var f = System.IO.Path.Combine(git, r.Replace('/', System.IO.Path.DirectorySeparatorChar));
            if (File.Exists(f)) return File.ReadAllText(f).Trim();
            var packed = System.IO.Path.Combine(git, "packed-refs");
            if (File.Exists(packed))
                foreach (var line in File.ReadLines(packed))
                    if (line.EndsWith(" " + r)) return line[..line.IndexOf(' ')];
        }
        catch (Exception) { }
        return "";
    }
}
