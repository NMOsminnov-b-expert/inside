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
                    case "clickLink":
                    {
                        var n = st.GetProperty("n").GetInt32();
                        var k = w.Canvas.Sheet!.Links.First(x => x.N == n);
                        var p = w.Canvas.LinkBadgeScreen(k)!.Value;
                        w.Canvas.PointerDown(p, MouseButton.Left, ModifierKeys.None);
                        w.Canvas.PointerUp(p);
                        break;
                    }
                    case "dragLinkSeg":
                    {
                        // Потянуть отрезок seg выбранной связи n на dx, dy экранных пикселей.
                        var k = w.Canvas.Sheet!.Links.First(x => x.N == st.GetProperty("n").GetInt32());
                        w.Canvas.SelectLink(k.Id);
                        var pts = Editor.SheetGeo.Path(w.Canvas.Sheet!, k)!;
                        var i = st.GetProperty("seg").GetInt32();
                        var m = w.Canvas.ToScreen((pts[i].X + pts[i + 1].X) / 2, (pts[i].Y + pts[i + 1].Y) / 2);
                        var to = new Point(m.X + st.GetProperty("dx").GetDouble(), m.Y + st.GetProperty("dy").GetDouble());
                        w.Canvas.PointerDown(m, MouseButton.Left, ModifierKeys.None);
                        for (var q = 1; q <= 8; q++) w.Canvas.PointerMove(new Point(m.X + (to.X - m.X) * q / 8, m.Y + (to.Y - m.Y) * q / 8), ModifierKeys.None);
                        w.Canvas.PointerUp(to);
                        break;
                    }
                    case "dragFrame":
                    {
                        // Рамка связи n: which = src|tgt, part = edge (перенос за край) | br (угол).
                        var k = w.Canvas.Sheet!.Links.First(x => x.N == st.GetProperty("n").GetInt32());
                        w.Canvas.SelectLink(k.Id);
                        var id = st.GetProperty("which").GetString() == "src" ? k.Src : k.Tgt;
                        var r = Editor.SheetGeo.FrameRect(w.Canvas.Sheet!, id)!.Value;
                        var part = st.GetProperty("part").GetString();
                        var a = part == "br" ? w.Canvas.ToScreen(r.Right, r.Bottom) : w.Canvas.ToScreen(r.X + r.Width / 2, r.Y);
                        if (part != "br") a = new Point(a.X, a.Y + 3);
                        var b = new Point(a.X + st.GetProperty("dx").GetDouble(), a.Y + st.GetProperty("dy").GetDouble());
                        w.Canvas.PointerDown(a, MouseButton.Left, ModifierKeys.None);
                        for (var q = 1; q <= 8; q++) w.Canvas.PointerMove(new Point(a.X + (b.X - a.X) * q / 8, a.Y + (b.Y - a.Y) * q / 8), ModifierKeys.None);
                        w.Canvas.PointerUp(b);
                        break;
                    }
                    case "bendLink":
                    {
                        var k = w.Canvas.Sheet!.Links.First(x => x.N == st.GetProperty("n").GetInt32());
                        w.Canvas.SelectLink(k.Id);
                        var pts = Editor.SheetGeo.Path(w.Canvas.Sheet!, k)!;
                        var i = st.GetProperty("seg").GetInt32();
                        w.Canvas.DoubleClick(w.Canvas.ToScreen((pts[i].X + pts[i + 1].X) / 2, (pts[i].Y + pts[i + 1].Y) / 2));
                        break;
                    }
                    case "search":
                    {
                        ((System.Windows.Controls.TextBox)w.FindName("SearchBox")).Text = st.GetProperty("text").GetString();
                        var times = st.TryGetProperty("times", out var tm) ? tm.GetInt32() : 1;
                        for (var q = 0; q < times; q++) w.SearchNext();
                        break;
                    }
                    case "filter":
                    {
                        var fb = (System.Windows.Controls.ComboBox)w.FindName("FilterBox");
                        fb.SelectedIndex = st.GetProperty("index").GetInt32();
                        break;
                    }
                    case "lens":
                        if (!w.Canvas.Lens) w.ToggleLens();
                        w.Canvas.MoveLens(Point(w, st.GetProperty("at")));
                        break;
                    case "sides":
                    {
                        var k = w.Canvas.Sheet!.Links.First(x => x.N == st.GetProperty("n").GetInt32());
                        w.Canvas.SelectLink(k.Id);
                        w.SetSides(k, st.GetProperty("src").GetString()!, st.GetProperty("tgt").GetString()!);
                        break;
                    }
                    case "cmd":
                    {
                        // Выполнить команду реестра по id (как из палитры).
                        var id = st.GetProperty("id").GetString()!;
                        if (!w.Commands.Execute(id)) log.Add("  команда недоступна: " + id);
                        break;
                    }
                    case "palette":
                    {
                        // Открыть палитру, набрать запрос; run — выполнить первую строку.
                        w.Commands.Execute(st.TryGetProperty("sheets", out var sh0) && sh0.GetBoolean() ? "go.sheet" : "go.palette");
                        await Idle();
                        var pal = (Ui.Palette)w.FindName("Pal");
                        if (st.TryGetProperty("run", out var run) && run.GetBoolean()) log.Add("  выполнено: " + pal.RunFirst(st.GetProperty("q").GetString()!));
                        else ((System.Windows.Controls.TextBox)((System.Windows.Controls.Grid)((System.Windows.Controls.Grid)((System.Windows.Controls.DockPanel)pal.Child).Children[0]).Children[1]).Children[1]).Text = st.GetProperty("q").GetString();
                        break;
                    }
                    case "overflow":
                    {
                        // Какие элементы выходят за окно — самые глубокие.
                        var root = (FrameworkElement)w.Content;
                        void Walk(DependencyObject d)
                        {
                            var n = VisualTreeHelper.GetChildrenCount(d);
                            var any = false;
                            for (var i = 0; i < n; i++)
                            {
                                var c = VisualTreeHelper.GetChild(d, i);
                                if (c is UIElement u && u.IsVisible && c is Visual v)
                                {
                                    var r = v.TransformToAncestor(root).TransformBounds(new Rect(u.RenderSize));
                                    if (r.Right > root.ActualWidth + 1) { any = true; Walk(c); }
                                }
                            }
                            if (!any && d is FrameworkElement fe && d != root)
                                log.Add($"  за краем: {fe.GetType().Name} {fe.Name} {fe.TransformToAncestor(root).TransformBounds(new Rect(fe.RenderSize))}");
                        }
                        Walk(root);
                        break;
                    }
                    case "flow":
                        w.Commands.Execute("view.flow");
                        break;
                    case "scrollFlow":
                    {
                        var f = (System.Windows.Controls.ScrollViewer)w.FindName("Flow");
                        f.ScrollToVerticalOffset(f.VerticalOffset + st.GetProperty("dy").GetDouble());
                        break;
                    }
                    case "closeOverlays":
                        ((Ui.Palette)w.FindName("Pal")).Close();
                        ((Ui.Cheatsheet)w.FindName("Cheat")).Close();
                        break;
                    case "focus":
                    {
                        // Фокус на элемент окна по имени (Nav, SearchBox) или на полотно.
                        var name = st.GetProperty("name").GetString()!;
                        if (name == "canvas") w.Canvas.Focus();
                        else ((UIElement)w.FindName(name)).Focus();
                        break;
                    }
                    case "keyWin":
                    {
                        // Клавиша так, как её получает окно: с учётом фокуса.
                        var key = Enum.Parse<Key>(st.GetProperty("key").GetString()!);
                        var target = Keyboard.FocusedElement as UIElement ?? w;
                        var src = PresentationSource.FromVisual(w)!;
                        var ev = new KeyEventArgs(Keyboard.PrimaryDevice, src, 0, key) { RoutedEvent = Keyboard.PreviewKeyDownEvent };
                        target.RaiseEvent(ev);
                        if (!ev.Handled) log.Add("  клавиша не обработана: " + key);
                        break;
                    }
                    case "replace":
                    {
                        var l = w.Canvas.Sheet!.Layers.First(x => x.Name == st.GetProperty("layer").GetString());
                        w.ReplaceWith(l, st.GetProperty("file").GetString()!);
                        break;
                    }
                    case "alignClick":
                    {
                        var src = st.GetProperty("src");
                        var p = w.Canvas.AlignSourceToScreen(st.GetProperty("which").GetString() == "old", new Point(src[0].GetDouble(), src[1].GetDouble()));
                        w.Canvas.PointerDown(p, MouseButton.Left, ModifierKeys.None);
                        w.Canvas.PointerUp(p);
                        break;
                    }
                    case "pdf":
                        await w.AddPdf(st.GetProperty("path").GetString()!, (st.GetProperty("pages").GetString()!,
                            st.GetProperty("doc").GetString()!, st.GetProperty("chapter").GetString()!));
                        break;
                    case "export":
                    {
                        var kind = st.GetProperty("kind").GetString();
                        var outp = st.GetProperty("path").GetString()!;
                        if (kind == "html") Export.Exporter.Html(w.Store!, outp);
                        else if (kind == "xlsx") Export.Exporter.Xlsx(w.Store!, outp);
                        break;
                    }
                    case "checks":
                        File.WriteAllLines(st.GetProperty("path").GetString()!,
                            Editor.Checks.Run(w.Store!.Project).Select(i => (i.Error ? "ОШИБКА " : "проверить ") + i.Chapter.Title + " · " + i.Sheet.Title + ": " + i.Text));
                        break;
                    case "rightClick":
                    {
                        var p = Point(w, st.GetProperty("at"));
                        w.Canvas.PointerDown(p, MouseButton.Right, ModifierKeys.None);
                        break;
                    }
                    case "menuShot":
                    {
                        await Idle();
                        var m = w.LastMenu!;
                        var rtb = new RenderTargetBitmap((int)m.ActualWidth, (int)m.ActualHeight, 96, 96, PixelFormats.Pbgra32);
                        rtb.Render(m);
                        var enc = new PngBitmapEncoder();
                        enc.Frames.Add(BitmapFrame.Create(rtb));
                        using (var f = File.Create(st.GetProperty("path").GetString()!)) enc.Save(f);
                        log.Add("  пункты: " + string.Join(" | ", m.Items.OfType<System.Windows.Controls.MenuItem>().Select(i => i.Header)));
                        m.IsOpen = false;
                        break;
                    }
                    case "dblLink":
                    {
                        var k = w.Canvas.Sheet!.Links.First(x => x.N == st.GetProperty("n").GetInt32());
                        w.Canvas.DoubleClick(w.Canvas.LinkBadgeScreen(k)!.Value);
                        break;
                    }
                    case "editorFill":
                    {
                        var boxes = FindAll<System.Windows.Controls.TextBox>(w.Editor!).ToList();
                        boxes[0].Text = st.GetProperty("doc").GetString();
                        boxes[1].Text = st.GetProperty("sys").GetString();
                        var ok = FindAll<System.Windows.Controls.Button>(w.Editor!).First(b => b.Content as string == "Готово");
                        ok.RaiseEvent(new RoutedEventArgs(System.Windows.Controls.Primitives.ButtonBase.ClickEvent));
                        break;
                    }
                    case "button":
                    {
                        // Нажать кнопку окна по её x:Name.
                        var b = (System.Windows.Controls.Button)w.FindName(st.GetProperty("name").GetString()!);
                        b.RaiseEvent(new RoutedEventArgs(System.Windows.Controls.Primitives.ButtonBase.ClickEvent));
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

    static IEnumerable<T> FindAll<T>(DependencyObject root) where T : DependencyObject
    {
        foreach (var c in LogicalTreeHelper.GetChildren(root).OfType<DependencyObject>())
        {
            if (c is T t) yield return t;
            foreach (var x in FindAll<T>(c)) yield return x;
        }
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
            // Окно один к одному: без Viewbox кисть вписывает всё содержимое,
            // и элемент, вылезший за край, сжимал бы снимок.
            dc.DrawRectangle(new VisualBrush(root)
            {
                Stretch = Stretch.None, AlignmentX = AlignmentX.Left, AlignmentY = AlignmentY.Top,
                ViewboxUnits = BrushMappingMode.Absolute, Viewbox = new Rect(0, 0, root.ActualWidth, root.ActualHeight),
            }, null, new Rect(0, 0, root.ActualWidth, root.ActualHeight));
        }
        rtb.Render(dv);
        var enc = new PngBitmapEncoder();
        enc.Frames.Add(BitmapFrame.Create(rtb));
        using var f = File.Create(path);
        enc.Save(f);
    }
}
