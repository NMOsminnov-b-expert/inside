using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Graf.Views;

namespace Graf.Model;

// Качество графа: замечания к наполнению, числа, подсказки связей.
//
// Ответ пользователя 28.09.2026 «Берем все» на практики улучшения графа
// (запись kak-uluchshat-graf-znaniy-…). То же самое, что
// tools/knowledge/quality.py (graph.py check / stats / suggest): правила
// менять в обоих местах.
//
// Замечания — не ошибки: запись читается и связи ведут куда надо, но
// наполнения не хватает (пустое определение, запись без связей) или история
// не сведена (заменённое не снято). Подсказки связей — локально: общие
// соседи (индекс Адамик — Адар без «братьев» по одному виду связи) и
// сходство текста (TF-IDF по основам слов и косинус). Связь ставит человек.
public static class Quality
{
    static readonly HashSet<string> Part = new() { "часть", "part_of", "часть от", "входит в" };
    static readonly HashSet<string> Contains = new() { "содержит", "contains", "включает" };
    static readonly HashSet<string> Replaces = new() { "заменяет", "supersedes", "заменило", "отменяет" };
    static readonly HashSet<string> NeedLinks = new() { "decisions", "rules", "practices", "tasks" };
    static readonly HashSet<string> Active = new() { "действует", "актуально", "открыт" };
    const string Closed = "отменено";

    public sealed record Note(string Kind, Record Rec, string Text);

    // Связи оглавления — навигация, а не смысл: в подсказках не в счёт.
    static readonly HashSet<string> Nav = new() { "раздел", "якорь" };

    static Dictionary<string, HashSet<string>> Adjacency(Store s, bool nav = true)
    {
        var adj = s.All.ToDictionary(r => r.Id, _ => new HashSet<string>());
        foreach (var r in s.All)
            foreach (var l in r.Links)
                if (l["куда"] is string to && to != r.Id && adj.ContainsKey(to) && (nav || !Nav.Contains(l["тип"] as string ?? "")))
                { adj[r.Id].Add(to); adj[to].Add(r.Id); }
        return adj;
    }

    public static List<Note> Warnings(Store s)
    {
        var o = new List<Note>();
        var by = s.All.GroupBy(r => r.Id).ToDictionary(g => g.Key, g => g.First());
        var adj = Adjacency(s);
        var vocab = GraphView.EdgeTypes.Select(e => e.Type).ToHashSet();
        foreach (var r in s.All)
        {
            if (r.Folder is "fields" or "concepts" && string.IsNullOrWhiteSpace(r.Fields["определение"] as string))
                o.Add(new("пустое определение", r, $"у {r.Kind} «{r.Title}» нет определения"));
            if (NeedLinks.Contains(r.Folder) && adj[r.Id].Count == 0 && Active.Contains(r.Status))
                o.Add(new("без связей", r, $"{r.Kind} без единой связи"));
            foreach (var l in r.Links)
            {
                var t = l["тип"] as string ?? "";
                var to = l["куда"] as string ?? "";
                if (!vocab.Contains(t)) o.Add(new("вид связи не из словаря", r, $"«{t}» → {to}"));
                if (Active.Contains(r.Status) && r.Folder is "rules" or "code" or "tools" && by.TryGetValue(to, out var tr) && tr.Status == Closed)
                    o.Add(new("ссылка на снятое", r, $"«{t}» → {tr.Title} (статус «отменено»)"));
                if (Replaces.Contains(t) && by.TryGetValue(to, out var old) && old.Status != Closed)
                    o.Add(new("заменено, но действует", old, $"его заменяет «{r.Title}», а статус «{old.Status}»"));
            }
            var path = r.Title.Trim();
            if (r.Folder is "code" or "tools" or "terms" && Active.Contains(r.Status) && path.Contains('/') && !path.Contains(' ')
                && !path.Contains('*') && !File.Exists(Path.Combine(s.Root, path)) && !Directory.Exists(Path.Combine(s.Root, path)))
                o.Add(new("кода нет", r, $"файла {path} нет в репозитории — снять статусом «отменено»"));
        }
        var parts = s.All.SelectMany(r => r.Links.Where(l => Part.Contains(l["тип"] as string ?? "")).Select(l => (r.Id, l["куда"] as string))).ToHashSet();
        foreach (var r in s.All)
            foreach (var l in r.Links)
                if (Contains.Contains(l["тип"] as string ?? "") && parts.Contains((l["куда"] as string ?? "", r.Id)))
                    o.Add(new("двойная связь", r, $"содержит {l["куда"]}, а та уже «часть» этой"));
        return o;
    }

    public sealed record Numbers(int Records, int Links, int Components, int Largest, int Lonely,
        List<(string Folder, int N)> LonelyByFolder, List<(Record Rec, int N)> Hubs, int Kinds, int Big);

    public static Numbers Count(Store s)
    {
        var adj = Adjacency(s);
        var seen = new HashSet<string>();
        var comps = new List<int>();
        foreach (var v in adj.Keys)
        {
            if (!seen.Add(v)) continue;
            var st = new Stack<string>();
            st.Push(v);
            var c = 0;
            while (st.Count > 0)
            {
                var x = st.Pop();
                c++;
                foreach (var y in adj[x]) if (seen.Add(y)) st.Push(y);
            }
            comps.Add(c);
        }
        var by = s.All.GroupBy(r => r.Id).ToDictionary(g => g.Key, g => g.First());
        return new Numbers(
            s.All.Count(), s.All.Sum(r => r.Links.Count), comps.Count, comps.DefaultIfEmpty(0).Max(),
            adj.Count(kv => kv.Value.Count == 0),
            adj.Where(kv => kv.Value.Count == 0).GroupBy(kv => by[kv.Key].Folder).Select(g => (g.Key, g.Count())).OrderByDescending(x => x.Item2).ToList(),
            adj.OrderByDescending(kv => kv.Value.Count).Take(8).Select(kv => (by[kv.Key], kv.Value.Count)).ToList(),
            s.All.SelectMany(r => r.Links).Select(l => l["тип"] as string ?? "").Distinct().Count(),
            s.All.Count(r => r.Points.Count >= 10));
    }

    // --- подсказки связей --------------------------------------------------------------

    public sealed record Candidate(Record Rec, double ByNeighbours, double ByText);

    static readonly Regex Word = new("[а-яёa-z0-9]{3,}", RegexOptions.Compiled);
    static Store? _vecStore;
    static int _vecVersion = -1;
    static Dictionary<string, Dictionary<string, double>> _vec = new();

    // Векторы TF-IDF — по основам слов (первые 6 букв); служебный пункт,
    // повторённый дословно в трёх записях и больше, не в счёт; запись короче
    // шести основ не сравнивается.
    static Dictionary<string, Dictionary<string, double>> Vectors(Store s)
    {
        if (ReferenceEquals(_vecStore, s) && _vecVersion == s.Version) return _vec;
        var same = s.All.SelectMany(r => r.Points).GroupBy(p => p).ToDictionary(g => g.Key, g => g.Count());
        var docs = new Dictionary<string, Dictionary<string, int>>();
        foreach (var r in s.All)
        {
            var text = string.Join(" ", new[] { r.Title, r.Fields["определение"] as string ?? "" }
                .Concat(r.Points.Where(p => same[p] < 3))).ToLowerInvariant();
            var d = new Dictionary<string, int>();
            foreach (Match m in Word.Matches(text))
            {
                var w = m.Value.Length > 6 ? m.Value[..6] : m.Value;
                d[w] = d.GetValueOrDefault(w) + 1;
            }
            if (d.Count >= 6) docs[r.Id] = d;
        }
        var df = new Dictionary<string, int>();
        foreach (var d in docs.Values) foreach (var w in d.Keys) df[w] = df.GetValueOrDefault(w) + 1;
        var n = Math.Max(1, docs.Count);
        _vec = new();
        foreach (var (k, d) in docs)
        {
            var v = d.ToDictionary(p => p.Key, p => (1 + Math.Log(p.Value)) * Math.Log((double)n / df[p.Key]));
            var norm = Math.Sqrt(v.Values.Sum(x => x * x));
            if (norm == 0) norm = 1;
            _vec[k] = v.Where(p => p.Value > 0).ToDictionary(p => p.Key, p => p.Value / norm);
        }
        _vecStore = s;
        _vecVersion = s.Version;
        return _vec;
    }

    public static List<Candidate> Suggest(Store s, string id, int top = 6)
    {
        var by = s.All.GroupBy(r => r.Id).ToDictionary(g => g.Key, g => g.First());
        if (!by.ContainsKey(id)) return new();
        var adj = Adjacency(s, nav: false);
        var kind = new Dictionary<(string, string), string>();
        foreach (var r in s.All)
            foreach (var l in r.Links)
                if (l["куда"] is string to) kind[(r.Id, to)] = kind[(to, r.Id)] = l["тип"] as string ?? "";
        // Снятые — история; оглавление и карты разделов (project) связываются
        // через оглавление, не подсказками.
        bool Live(string x) => by[x].Status != Closed && by[x].Folder != "project";

        var aa = new Dictionary<string, double>();
        foreach (var z in adj[id])
        {
            if (adj[z].Count < 2) continue;
            var w = 1 / Math.Log(adj[z].Count);
            foreach (var b in adj[z])
            {
                if (b == id || adj[id].Contains(b) || !Live(b)) continue;
                // «Братья» — оба связаны с общим соседом одним видом связи
                // (модули, что оба зависят от ядра): сходство устройства, не повод.
                if (kind.GetValueOrDefault((id, z)) == kind.GetValueOrDefault((b, z))) continue;
                aa[b] = aa.GetValueOrDefault(b) + w;
            }
        }
        var tx = new Dictionary<string, double>();
        var vec = Vectors(s);
        if (vec.TryGetValue(id, out var me))
            foreach (var (k, v) in vec)
            {
                if (k == id || adj[id].Contains(k) || !Live(k)) continue;
                double sum = 0;
                foreach (var (w, x) in me) if (v.TryGetValue(w, out var y)) sum += x * y;
                if (sum >= 0.12) tx[k] = sum;
            }
        return aa.Keys.Where(k => aa[k] >= 0.3).Union(tx.Keys)
            .Select(k => new Candidate(by[k], aa.GetValueOrDefault(k), tx.GetValueOrDefault(k)))
            .OrderByDescending(c => Math.Min(c.ByNeighbours / 3, 1) + c.ByText)
            .Take(top).ToList();
    }
}
