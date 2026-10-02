using System.Diagnostics;
using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace Graf.Model;

// Поиск по смыслу в самой программе (решение пользователя 02.10.2026: «Ищем
// по знаниям через смысл. В выборке оранжевыми кружками подсвечиваем смысл,
// синими текст. Белые — выбор»). Векторы фрагментов записей графа выгружает
// tools/knowledge/semantic_export.py (.graf/semvec.bin — float32 подряд,
// .graf/semvec.json — путь записи на каждый фрагмент, модель и инструкция к
// запросу). Вектор запроса считает Ollama на этом компьютере той же моделью
// (Qwen3-Embedding), сравнение — здесь: базы программа не касается.
//
// Похожесть записи — лучший из её фрагментов: запись с десятком пунктов не
// размывается средним, и запрос находит ту, где о нём сказано хоть одним
// пунктом (так ищет и сам сервер semsearch — по фрагментам).
public sealed class SemanticIndex
{
    public string Model = "", Prefix = "", Note = "";
    public int NumCtx;
    int _dim;
    float[] _vec = Array.Empty<float>();
    string[] _path = Array.Empty<string>();

    public int Count => _path.Length;

    public static SemanticIndex? Load(string root)
    {
        try
        {
            var dir = System.IO.Path.Combine(root, ".graf");
            var meta = System.IO.Path.Combine(dir, "semvec.json");
            var bin = System.IO.Path.Combine(dir, "semvec.bin");
            if (!File.Exists(meta) || !File.Exists(bin)) return null;
            using var doc = JsonDocument.Parse(File.ReadAllText(meta));
            var r = doc.RootElement;
            var ix = new SemanticIndex
            {
                Model = r.GetProperty("model").GetString() ?? "",
                Prefix = r.GetProperty("prefix").GetString() ?? "",
                NumCtx = r.TryGetProperty("num_ctx", out var c) ? c.GetInt32() : 0,
                Note = "выгрузка " + (r.GetProperty("generated").GetString() ?? "").Replace('T', ' '),
                _dim = r.GetProperty("dim").GetInt32(),
                _path = r.GetProperty("paths").EnumerateArray().Select(x => x.GetString() ?? "").ToArray(),
            };
            var bytes = File.ReadAllBytes(bin);
            if (ix._dim <= 0 || bytes.Length != ix._path.Length * ix._dim * 4) return null;
            ix._vec = new float[ix._path.Length * ix._dim];
            Buffer.BlockCopy(bytes, 0, ix._vec, 0, bytes.Length);
            // Векторы фрагментов сервер хранит как есть — нормируем, чтобы
            // скалярное произведение было косинусом.
            for (int i = 0; i < ix._path.Length; i++) Normalize(ix._vec.AsSpan(i * ix._dim, ix._dim));
            return ix;
        }
        catch (Exception) { return null; }
    }

    static void Normalize(Span<float> v)
    {
        double s = 0;
        foreach (var x in v) s += x * x;
        var n = (float)Math.Sqrt(s);
        if (n > 0) for (int i = 0; i < v.Length; i++) v[i] /= n;
    }

    // Лучшие записи по похожести на запрос: путь файла записи → похожесть.
    // Порог — над «шумом»: по смыслу похоже всегда что-нибудь, и прибитое
    // число одной модели не годится для другой. Шум — средняя похожесть 10–30-й
    // записей; берутся те, что выше него на margin (замер 02.10.2026 на Qwen3:
    // нужные записи выше шума на 0,05–0,2, а на запрос не по теме графа —
    // «стабилизаторы напряжения» — выше шума нет ничего, и выдача пуста).
    public List<(string Path, float Sim)> Top(float[] q, int k, float margin)
    {
        var qs = q.AsSpan();
        Normalize(qs);
        var best = new Dictionary<string, float>();
        for (int i = 0; i < _path.Length; i++)
        {
            var row = _vec.AsSpan(i * _dim, _dim);
            float s = 0;
            for (int j = 0; j < _dim; j++) s += row[j] * qs[j];
            if (!best.TryGetValue(_path[i], out var b) || s > b) best[_path[i]] = s;
        }
        var list = best.OrderByDescending(x => x.Value).ToList();
        if (list.Count == 0) return new();
        var noise = list.Count > 30 ? list.Skip(9).Take(21).Average(x => x.Value) : list[^1].Value;
        return list.Where(x => x.Value >= noise + margin).Take(k).Select(x => (x.Key, x.Value)).ToList();
    }
}

// Вектор запроса — через Ollama на этом компьютере. Сервисы поиска по смыслу
// живут, только пока нужны (svc.py, решение 30.09.2026): не отвечает — поднять
// их тем же svc.py и повторить. Прокси Windows обходится: запросы на localhost.
public static class QueryEmbedder
{
    static readonly HttpClient Http = new(new HttpClientHandler { UseProxy = false }) { Timeout = TimeSpan.FromSeconds(120) };
    const string Ollama = "http://127.0.0.1:11434";

    static string Sem => System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "semsearch");

    static async Task<bool> Alive(CancellationToken ct)
    {
        try
        {
            using var r = await Http.GetAsync(Ollama + "/api/version", ct);
            return r.IsSuccessStatusCode;
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception) { return false; }
    }

    // Поднять PostgreSQL и Ollama (svc.py up ждёт готовности сам).
    static async Task StartServices(CancellationToken ct)
    {
        var py = System.IO.Path.Combine(Sem, "src", "codebase-mcp", ".venv", "Scripts", "python.exe");
        var svc = System.IO.Path.Combine(Sem, "svc.py");
        if (!File.Exists(py) || !File.Exists(svc)) return;
        var psi = new ProcessStartInfo(py, $"\"{svc}\" up") { CreateNoWindow = true, UseShellExecute = false };
        psi.Environment["NO_PROXY"] = "127.0.0.1,localhost";
        using var p = Process.Start(psi);
        if (p != null) await p.WaitForExitAsync(ct);
    }

    public static async Task<float[]?> Embed(SemanticIndex ix, string text, Action<string> note, CancellationToken ct)
    {
        if (!await Alive(ct))
        {
            note("по смыслу: запускаю модель…");
            await StartServices(ct);
            if (!await Alive(ct)) { note("по смыслу: модель не запустилась — ищу только по словам"); return null; }
        }
        // Те же настройки загрузки, что у сервера поиска (.env: 1 поток, контекст
        // модели): иначе Ollama перезагружала бы модель между запросами
        // программы и сервера. Поиск — 1 поток, индексация — своя Ollama на 3
        // (решение пользователя 02.10.2026).
        var options = new Dictionary<string, int> { ["num_thread"] = 1 };
        if (ix.NumCtx > 0) options["num_ctx"] = ix.NumCtx;
        var body = JsonSerializer.Serialize(new { model = ix.Model, input = new[] { ix.Prefix + text }, options });
        using var resp = await Http.PostAsync(Ollama + "/api/embed", new StringContent(body, Encoding.UTF8, "application/json"), ct);
        if (!resp.IsSuccessStatusCode) return null;
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
        var e = doc.RootElement.GetProperty("embeddings")[0];
        return e.EnumerateArray().Select(x => x.GetSingle()).ToArray();
    }
}
