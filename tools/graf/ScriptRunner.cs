using System.Text;
using System.Text.Json;
using Graf.Model;
using Microsoft.UI.Xaml;

namespace Graf;

// Сценарии проверки (--script <файл.json>): JSON-массив шагов, журнал —
// <файл>.log. Шаги: select, search, next, mode (graph/3d/list), set, save,
// new, fit, external (правка файла снаружи — проверка живого обновления),
// pull (потянуть узел), orbit, motion (замер движения узлов), export,
// import, wait, shot, dump; zoom (масштаб плоского графа), quality (числа,
// замечания и подсказки связей выбранной записи — в журнал), check (окно
// проверки, не дожидаясь закрытия), closedlg; opengroup (раскрыть раздел
// панели фильтров, не записывая в настройки), datepreset.
//
// Готовые сценарии с проверкой результата — tools/graf/checks (run.py).
public static class ScriptRunner
{
    public static async Task Run(MainWindow w, string path)
    {
        var log = new List<string>();
        var code = 0;
        try
        {
            await Task.Delay(1500);
            foreach (var st in JsonDocument.Parse(File.ReadAllText(path)).RootElement.EnumerateArray())
            {
                var op = st.GetProperty("op").GetString();
                log.Add("> " + st.GetRawText());
                string S(string n) => st.GetProperty(n).GetString()!;
                switch (op)
                {
                    case "select": w.Select(S("id"), true); break;
                    case "search": w.SetSearch(S("text")); break;
                    case "next": w.NextMatch(); break;
                    case "mode": w.SetModePublic(S("value") switch { "3d" => 1, "list" => 2, _ => 0 }); break;
                    case "pull":
                        await w.GraphCtl.PullTest(S("id"), new System.Numerics.Vector2(st.GetProperty("dx").GetSingle(), st.GetProperty("dy").GetSingle()), 30);
                        break;
                    case "orbit": w.GraphCtl.Orbit(st.GetProperty("dx").GetSingle(), st.GetProperty("dy").GetSingle()); break;
                    case "export": w.ExportTo(S("path")); break;
                    case "import":
                    {
                        var plan = await w.ImportFrom(S("path"), ask: false, removeMissing: st.TryGetProperty("remove", out var rm) && rm.GetBoolean());
                        log.Add(plan == null ? "  загрузка: ошибка" : $"  загрузка: новых {plan.Added.Count}, изменено {plan.Changed.Count}, совпало {plan.Same.Count}, только в графе {plan.OnlyInGraph.Count}, ошибок {plan.Errors.Count}");
                        break;
                    }
                    case "set": w.PanelCtl.TestSet(S("key"), S("value")); break;
                    case "save": w.PanelCtl.SaveNow(); break;
                    case "new": await w.NewRecord(S("folder"), S("title")); break;
                    case "fit": w.GraphCtl.FitAll(); break;
                    case "start": w.ShowStart(); break;
                    case "tag": w.ToggleTag(S("value")); break;
                    case "sort": w.SetSort(S("key"), st.TryGetProperty("desc", out var dsc) && dsc.GetBoolean()); break;
                    case "lefttab": w.SetLeftTabPublic(S("value")); break;
                    case "islands": w.SetLayout(S("value") switch { "on" => 1, "topics" => 2, "sense" => 3, _ => 0 }); break;
                    case "ego": w.GraphCtl.SetEgo(st.GetProperty("hops").GetInt32()); break;
                    case "islandstat": log.Add("  острова: " + w.GraphCtl.IslandStats()); break;
                    case "datepreset": w.SetDatePresetPublic(S("value")); break;
                    case "opengroup": w.OpenGroupPublic(S("value")); break;
                    case "colorbydate": w.ColorByDatePublic(true); break;
                    case "tocopen": w.OpenTocSection(S("value")); break;
                    case "listed":
                        log.Add("  список: " + string.Join(", ", w.ListedIds().Take(st.TryGetProperty("n", out var nn) ? nn.GetInt32() : 5)));
                        break;
                    case "external":
                    {
                        var file = Path.Combine(w.Store!.Root, S("file"));
                        var text = File.ReadAllText(file, Encoding.UTF8).Replace(S("find"), S("replace"));
                        File.WriteAllText(file, text, new UTF8Encoding(false));
                        break;
                    }
                    case "wait": await Task.Delay(st.GetProperty("ms").GetInt32()); break;
                    case "write":
                    {
                        // Файл проекта целиком (например, .graf/index-status.json).
                        var file = Path.Combine(w.Store!.Root, S("file"));
                        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
                        // {PID} — процесс самой программы: «живой» прогон для проверки хода.
                        File.WriteAllText(file, S("text").Replace("{PID}", Environment.ProcessId.ToString()), new UTF8Encoding(false));
                        break;
                    }
                    case "indexstatus":
                    {
                        // Подписи обоих индексов; expect — ожидаемая строка целиком.
                        var got = w.IndexText();
                        log.Add("  индексы: " + got);
                        if (st.TryGetProperty("expect", out var ex) && ex.GetString() != got)
                            log.Add("  ОШИБКА индексы: ждали «" + ex.GetString() + "»");
                        break;
                    }
                    case "zoom": w.GraphCtl.SetZoom(st.GetProperty("value").GetSingle()); break;
                    case "check": w.OpenCheck(); break;
                    case "perf": log.Add("  " + await w.GraphCtl.PerfRun(S("kind"), st.TryGetProperty("s", out var sec) ? sec.GetDouble() : 5)); break;
                    case "paneltab": w.PanelCtl.OpenTab(S("value")); break;
                    case "datasource": w.SetDataSource(S("value") == "code"); break;
                    case "closedlg": w.CloseDialogs(); break;
                    case "quality":
                    {
                        var st2 = w.Store!;
                        var q = Graf.Model.Quality.Count(st2);
                        log.Add($"  записей {q.Records}, связей {q.Links}, частей {q.Components}, самая большая {q.Largest}, без связей {q.Lonely}, видов связей {q.Kinds}, 10+ пунктов {q.Big}");
                        foreach (var g in Graf.Model.Quality.Warnings(st2).GroupBy(n => n.Kind)) log.Add($"  замечание «{g.Key}»: {g.Count()}");
                        if (w.PanelCtl.Current is { } cur)
                            foreach (var c in Graf.Model.Quality.Suggest(st2, cur.Id))
                                log.Add($"  возможно связано: {c.Rec.Id} соседи {c.ByNeighbours:0.00} текст {c.ByText:0.00}");
                        break;
                    }
                    case "motion":
                    {
                        // Движение узлов за ms: наибольший и средний сдвиг в
                        // мировых единицах, число кадров, идёт ли раскладка.
                        var g = w.GraphCtl;
                        var p0 = g.Positions();
                        var f0 = g.Frames;
                        await Task.Delay(st.GetProperty("ms").GetInt32());
                        var p1 = g.Positions();
                        var d = p0.Keys.Where(p1.ContainsKey).Select(k => System.Numerics.Vector3.Distance(p0[k], p1[k])).ToList();
                        log.Add($"  движение: узлов {d.Count}, наиб. сдвиг {(d.Count > 0 ? d.Max() : 0):0.00}, "
                            + $"средний {(d.Count > 0 ? d.Average() : 0):0.000}, сдвинулось >0.5: {d.Count(x => x > 0.5f)}, "
                            + $"кадров {g.Frames - f0}, раскладка идёт: {g.Animating}");
                        break;
                    }
                    case "shot":
                        await Task.Delay(300);
                        Shot.Save(WinRT.Interop.WindowNative.GetWindowHandle(w), S("path"));
                        break;
                    case "dump":
                        File.WriteAllText(S("path"), JsonSerializer.Serialize(new
                        {
                            selected = w.PanelCtl.Current?.Id,
                            passing = w.GraphCtl.Passing?.Count,
                            title = w.PanelCtl.Current?.Title,
                            dirty = w.PanelCtl.IsDirty,
                            nodes = w.GraphCtl.NodeCount,
                            edges = w.GraphCtl.EdgeCount,
                        }, new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
                        break;
                    default: throw new InvalidOperationException("неизвестный шаг " + op);
                }
                await Task.Delay(150);
            }
            log.Add("ГОТОВО");
        }
        catch (Exception ex) { log.Add("ОШИБКА: " + ex); code = 1; }
        File.WriteAllLines(path + ".log", log);
        Environment.Exit(code);
    }
}
