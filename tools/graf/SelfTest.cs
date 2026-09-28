using System.Text;
using Graf.Model;

namespace Graf;

// Самопроверка формата (ключ --selftest <файл отчёта>): каждая запись графа
// читается и записывается заново — текст должен совпасть с файлом байт в
// байт, иначе программа и graph.py пишут по-разному.
public static class SelfTest
{
    public static int Run(string root, string report)
    {
        var s = new Store(root);
        s.Load();
        var sb = new StringBuilder();
        var bad = 0;
        foreach (var r in s.All)
        {
            var disk = File.ReadAllText(r.Path, Encoding.UTF8).Replace("\r\n", "\n");
            var mine = Store.Render(r);
            if (disk != mine)
            {
                bad++;
                if (bad <= 10)
                {
                    var i = 0;
                    while (i < disk.Length && i < mine.Length && disk[i] == mine[i]) i++;
                    sb.AppendLine($"РАЗЛИЧИЕ {Path.GetRelativePath(root, r.Path)} @ {i}:");
                    sb.AppendLine("  диск: " + disk.Substring(Math.Max(0, i - 40), Math.Min(120, disk.Length - Math.Max(0, i - 40))).Replace("\n", "⏎"));
                    sb.AppendLine("  моё : " + mine.Substring(Math.Max(0, i - 40), Math.Min(120, mine.Length - Math.Max(0, i - 40))).Replace("\n", "⏎"));
                }
            }
        }
        sb.Insert(0, $"записей {s.All.Count()}, ошибок чтения {s.LoadErrors.Count}, различий {bad}\n" + string.Join("\n", s.LoadErrors.Take(10)) + "\n");
        var check = s.Check();
        sb.AppendLine($"проверка: замечаний {check.Count}");
        foreach (var (r, t) in check.Take(10)) sb.AppendLine("  " + (r?.Id ?? "") + ": " + t);
        // Выгрузка и загрузка обратно: всё должно совпасть, ничего нового.
        var tmp = Path.Combine(Path.GetTempPath(), "graf-selftest-" + Guid.NewGuid().ToString("N")[..8] + ".json");
        Exchange.Export(s, tmp);
        var plan = Exchange.Compare(s, tmp);
        File.Delete(tmp);
        var roundBad = plan.Added.Count + plan.Changed.Count + plan.OnlyInGraph.Count + plan.Errors.Count;
        sb.AppendLine($"выгрузка→загрузка: совпало {plan.Same.Count}, новых {plan.Added.Count}, изменённых {plan.Changed.Count}, "
            + $"только в графе {plan.OnlyInGraph.Count}, ошибок {plan.Errors.Count}");
        foreach (var r in plan.Changed.Take(3))
        {
            var a = Store.Render(s.ById(r.Id)!);
            var b = Store.Render(r);
            var i = 0;
            while (i < a.Length && i < b.Length && a[i] == b[i]) i++;
            sb.AppendLine($"  изменена: {r.Id} @ {i}");
            sb.AppendLine("    граф : " + a.Substring(Math.Max(0, i - 60), Math.Min(140, a.Length - Math.Max(0, i - 60))).Replace("\n", "⏎"));
            sb.AppendLine("    файл : " + b.Substring(Math.Max(0, i - 60), Math.Min(140, b.Length - Math.Max(0, i - 60))).Replace("\n", "⏎"));
        }
        File.WriteAllText(report, sb.ToString(), new UTF8Encoding(false));
        return bad == 0 && roundBad == 0 && s.LoadErrors.Count == 0 ? 0 : 1;
    }
}
