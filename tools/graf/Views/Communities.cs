using System;
using System.Collections.Generic;
using System.Linq;

namespace Graf.Views;

// Сообщества графа — «острова по темам» (ответ пользователя 28.09.2026
// «Берем все» на практики улучшения графа, запись kak-uluchshat-graf-znaniy-…).
//
// Louvain: узел переходит в сообщество соседа, если растёт модулярность;
// затем сообщества сворачиваются в узлы, и всё повторяется. Главная поправка
// Leiden к Louvain — сообщество всегда связно: Louvain иногда оставляет в
// одном сообществе куски, не связанные между собой. Здесь это делается
// последним шагом — сообщество делится на связные части. Порядок обхода —
// по ID, поэтому разбиение одно и то же при каждом запуске (острова не
// прыгают между открытиями).
public static class Communities
{
    // ids — узлы; edges — пары индексов (неориентированные, повторы
    // сливаются). Возвращает номер сообщества для каждого узла; узлы без
    // связей — общий номер -1.
    public static int[] Detect(IReadOnlyList<string> ids, IEnumerable<(int A, int B)> edges)
    {
        var n = ids.Count;
        var order = Enumerable.Range(0, n).OrderBy(i => ids[i], StringComparer.Ordinal).ToArray();
        var w = new Dictionary<(int, int), double>();
        foreach (var (a, b) in edges)
        {
            if (a == b) continue;
            var k = a < b ? (a, b) : (b, a);
            w[k] = 1;
        }
        // Граф текущего уровня: смежность с весами.
        var adj = Enumerable.Range(0, n).Select(_ => new Dictionary<int, double>()).ToArray();
        foreach (var ((a, b), x) in w) { adj[a][b] = x; adj[b][a] = x; }
        var member = Enumerable.Range(0, n).ToArray(); // узел исходного графа → узел текущего уровня
        var levelOrder = order;

        for (var pass = 0; pass < 10; pass++)
        {
            var m = adj.Length;
            var deg = adj.Select(d => d.Values.Sum()).ToArray();
            var self = new double[m];
            var total = deg.Sum();
            if (total == 0) break;
            var comm = Enumerable.Range(0, m).ToArray();
            var tot = (double[])deg.Clone();
            var moved = false;
            for (var sweep = 0; sweep < 20; sweep++)
            {
                var any = false;
                foreach (var v in levelOrder)
                {
                    var cv = comm[v];
                    var links = new Dictionary<int, double>();
                    foreach (var (u, x) in adj[v]) if (u != v) links[comm[u]] = links.GetValueOrDefault(comm[u]) + x;
                    tot[cv] -= deg[v];
                    var best = cv;
                    var gain = links.GetValueOrDefault(cv) - tot[cv] * deg[v] / total;
                    foreach (var (c, x) in links.OrderBy(p => p.Key))
                    {
                        var g = x - tot[c] * deg[v] / total;
                        if (g > gain + 1e-12) { gain = g; best = c; }
                    }
                    tot[best] += deg[v];
                    if (best != cv) { comm[v] = best; any = true; moved = true; }
                }
                if (!any) break;
            }
            if (!moved) break;
            // Свёртка: сообщества — узлы следующего уровня.
            var renum = new Dictionary<int, int>();
            foreach (var v in levelOrder) if (!renum.ContainsKey(comm[v])) renum[comm[v]] = renum.Count;
            var next = Enumerable.Range(0, renum.Count).Select(_ => new Dictionary<int, double>()).ToArray();
            for (var v = 0; v < m; v++)
                foreach (var (u, x) in adj[v])
                {
                    // Связи внутри сообщества — петлёй: степень свёрнутого
                    // узла остаётся суммой степеней его узлов.
                    var a = renum[comm[v]];
                    var b = renum[comm[u]];
                    next[a][b] = next[a].GetValueOrDefault(b) + x;
                }
            for (var i = 0; i < n; i++) member[i] = renum[comm[member[i]]];
            adj = next;
            levelOrder = Enumerable.Range(0, adj.Length).ToArray();
        }

        // Связность (поправка Leiden): сообщество — по связным частям внутри него.
        var full = Enumerable.Range(0, n).Select(_ => new List<int>()).ToArray();
        foreach (var ((a, b), _) in w) { full[a].Add(b); full[b].Add(a); }
        var result = Enumerable.Repeat(-2, n).ToArray();
        var next2 = 0;
        foreach (var s in order)
        {
            if (result[s] != -2) continue;
            if (full[s].Count == 0) { result[s] = -1; continue; }
            var id = next2++;
            var st = new Stack<int>();
            st.Push(s);
            result[s] = id;
            while (st.Count > 0)
            {
                var x = st.Pop();
                foreach (var y in full[x])
                    if (result[y] == -2 && member[y] == member[s]) { result[y] = id; st.Push(y); }
            }
        }
        return result;
    }
}
