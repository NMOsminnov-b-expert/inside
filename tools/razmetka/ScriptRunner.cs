using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Razmetka.Model;

namespace Razmetka;

// Сценарии проверки: JSON-массив шагов, которые идут тем же путём, что мышь
// и клавиатура (SheetView.Pointer*, MainWindow.HandleKey), плюс снимки окна
// и выгрузка проекта для сверки. Журнал — рядом со сценарием, файл .log.
//
// Точка задаётся одним из способов:
//   {"screen":[x,y]}                         — пиксели полотна;
//   {"world":[x,y]}                          — единицы разворота;
//   {"layer":"имя","anchor":"c|tl|tr|br|bl","dx":0,"dy":0} — угол или центр слоя.
public static class ScriptRunner
{
    public static async Task Run(MainWindow w, string path)
    {
        var log = new List<string>();
        var code = 0;
        try
        {
            var steps = JsonDocument.Parse(File.ReadAllText(path)).RootElement;
            await Idle();
            foreach (var st in steps.EnumerateArray())
            {
                var op = st.GetProperty("op").GetString();
                log.Add("> " + st.GetRawText());
                switch (op)
                {
                    case "size":
                        w.Width = st.GetProperty("w").GetDouble();
                        w.Height = st.GetProperty("h").GetDouble();
                        break;
                    case "open":
                        w.OpenDir(st.GetProperty("dir").GetString()!, askDraft: false);
                        break;
                    case "sheet":
                    {
                        var ch = w.Store!.Project.Chapters[st.GetProperty("chapter").GetInt32()];
                        w.PickSheet(ch, ch.Sheets[st.GetProperty("index").GetInt32()]);
                        break;
                    }
                    case "addImages":
                        w.AddImageFiles(st.GetProperty("paths").EnumerateArray().Select(x => x.GetString()!).ToList());
                        break;
                    case "fit":
                        w.Canvas.FitAll();
                        break;
                    case "zoom":
                        w.Canvas.SetZoom(st.GetProperty("value").GetDouble());
                        break;
                    case "click":
                    {
                        var p = Point(w, st.GetProperty("at"));
                        var mods = Mods(st);
                        w.Canvas.PointerDown(p, MouseButton.Left, mods);
                        w.Canvas.PointerUp(p);
                        break;
                    }
                    case "dbl":
                        w.Canvas.DoubleClick(Point(w, st.GetProperty("at")));
                        break;
                    case "drag":
                    {
                        var a = Point(w, st.GetProperty("from"));
                        var b = Point(w, st.GetProperty("to"));
                        var mods = Mods(st);
                        var btn = st.TryGetProperty("button", out var bt) && bt.GetString() == "middle" ? MouseButton.Middle : MouseButton.Left;
                        w.Canvas.PointerDown(a, btn, mods);
                        const int n = 12;
                        for (var i = 1; i <= n; i++)
                        {
                            var t = (double)i / n;
                            w.Canvas.PointerMove(new Point(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t), mods);
                        }
                        w.Canvas.PointerUp(b);
                        break;
                    }
                    case "key":
                    {
                        var key = Enum.Parse<Key>(st.GetProperty("key").GetString()!);
                        if (!w.HandleKey(key, Mods(st))) log.Add("  клавиша не обработана");
                        break;
                    }
                    case "select":
                    {
                        var names = st.GetProperty("layers").EnumerateArray().Select(x => x.GetString()).ToHashSet();
                        w.Canvas.Select(w.Canvas.Sheet!.Layers.Where(l => names.Contains(l.Name)).Select(l => l.Id));
                        break;
                    }
                    case "save":
                        w.Save();
                        break;
                    case "shot":
                        await Idle();
                        Shot(w, st.GetProperty("path").GetString()!);
                        break;
                    case "dump":
                        File.WriteAllText(st.GetProperty("path").GetString()!, ProjectStore.Serialize(w.Store!.Project));
                        break;
                    case "wait":
                        await Task.Delay(st.GetProperty("ms").GetInt32());
                        break;
                    default:
                        throw new InvalidOperationException("неизвестный шаг: " + op);
                }
                await Idle();
            }
            log.Add("ГОТОВО");
        }
        catch (Exception ex)
        {
            log.Add("ОШИБКА: " + ex);
            code = 1;
        }
        File.WriteAllLines(path + ".log", log);
        Application.Current.Shutdown(code);
    }

    static Task Idle() => Application.Current.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle).Task;

    static ModifierKeys Mods(JsonElement st)
    {
        if (!st.TryGetProperty("mods", out var m)) return ModifierKeys.None;
        var r = ModifierKeys.None;
        foreach (var part in (m.GetString() ?? "").Split('+', StringSplitOptions.RemoveEmptyEntries))
            r |= part.Trim().ToLowerInvariant() switch
            {
                "ctrl" => ModifierKeys.Control,
                "shift" => ModifierKeys.Shift,
                "alt" => ModifierKeys.Alt,
                _ => ModifierKeys.None,
            };
        return r;
    }

    static Point Point(MainWindow w, JsonElement at)
    {
        if (at.TryGetProperty("screen", out var s)) return new Point(s[0].GetDouble(), s[1].GetDouble());
        if (at.TryGetProperty("world", out var wd)) return w.Canvas.ToScreen(wd[0].GetDouble(), wd[1].GetDouble());
        var name = at.GetProperty("layer").GetString();
        var l = w.Canvas.Sheet!.Layers.First(x => x.Name == name);
        var anchor = at.TryGetProperty("anchor", out var an) ? an.GetString() : "c";
        var (x, y) = anchor switch
        {
            "tl" => (l.X, l.Y),
            "tr" => (l.X + l.W, l.Y),
            "br" => (l.X + l.W, l.Y + l.H),
            "bl" => (l.X, l.Y + l.H),
            "t" => (l.X + l.W / 2, l.Y),
            "r" => (l.X + l.W, l.Y + l.H / 2),
            "b" => (l.X + l.W / 2, l.Y + l.H),
            "l" => (l.X, l.Y + l.H / 2),
            _ => (l.X + l.W / 2, l.Y + l.H / 2),
        };
        var p = w.Canvas.ToScreen(x, y);
        var dx = at.TryGetProperty("dx", out var ddx) ? ddx.GetDouble() : 0;
        var dy = at.TryGetProperty("dy", out var ddy) ? ddy.GetDouble() : 0;
        return new Point(p.X + dx, p.Y + dy);
    }

    static void Shot(Window w, string path)
    {
        var root = (FrameworkElement)w.Content;
        var dpi = VisualTreeHelper.GetDpi(root);
        var rtb = new RenderTargetBitmap((int)(root.ActualWidth * dpi.DpiScaleX), (int)(root.ActualHeight * dpi.DpiScaleY),
            dpi.PixelsPerInchX, dpi.PixelsPerInchY, PixelFormats.Pbgra32);
        var dv = new DrawingVisual();
        using (var dc = dv.RenderOpen())
        {
            dc.DrawRectangle(new VisualBrush(root), null, new Rect(0, 0, root.ActualWidth, root.ActualHeight));
        }
        rtb.Render(dv);
        var enc = new PngBitmapEncoder();
        enc.Frames.Add(BitmapFrame.Create(rtb));
        using var f = File.Create(path);
        enc.Save(f);
    }
}
