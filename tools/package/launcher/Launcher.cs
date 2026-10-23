// Окно запуска макета для показа (решение пользователя 23.10.2026: «Надо собрать
// в архив макет для просмотров. С установкой питона и потом запуском прокси для
// осмотров… пользователь просто запустил легкое приложение, нажал запустить и
// оно все само поставило, открыло браузер. Ибо смотреть будут люди без it
// образования»; «Каждый у себя при этом запускает макет»).
//
// Внутри exe — два ресурса: python.zip (встраиваемый Python с python.org) и
// site.zip (app.html, app/, сервер макета, прокси Кадастра, карточки
// сотрудников). Собирает tools/package/build_viewer.py; компилятор — csc.exe из
// .NET Framework 4, он есть в каждой Windows 10/11. Язык — C# 5 (так умеет этот
// csc): без $-строк и членов-выражений.
//
// Куда ставится: %LOCALAPPDATA%\EstateMaket — без прав администратора.
//   python\  — Python; ставится заново, если в exe другая версия;
//   site\    — макет; заменяется, если в exe другая сборка (build.txt);
//   data\    — правки этого зрителя и карточки сотрудников из сборки; при
//              обновлении макета свои правки зрителя не трогаются;
//   logs\    — вывод серверов.
//
//   «Макет E-state.exe»             окно запуска
//   «Макет E-state.exe» --selftest  поставить, поднять оба сервера, проверить
//                                   ответы, погасить; итог — logs\selftest.txt
//                                   и код выхода (0 — всё работает)
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Макет E-state")]
[assembly: AssemblyProduct("Макет E-state")]

namespace EstateLauncher
{
    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            if (Array.IndexOf(args, "--selftest") >= 0) return Runner.SelfTest();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            bool created;
            using (var m = new Mutex(true, "EstateMaketLauncher", out created))
            {
                if (!created)
                {
                    MessageBox.Show("Окно запуска макета уже открыто — посмотрите на панели задач.",
                        "Макет E-state", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 0;
                }
                Application.Run(new MainForm());
            }
            return 0;
        }
    }

    // Установка и серверы — без окна: их же зовёт --selftest.
    class Runner
    {
        // Порт макета выбирается сам (пользователь 23.10.2026: «Как насчет выбора
        // своего порта, на котором все и будет работать? порт занят - переходим на
        // другой»): прежний из port.txt, занят — следующий свободный от 5500, и он
        // запоминается. Менять без нужды нельзя: результаты осмотров браузер
        // хранит по адресу, на новом порту их не видно. Кадастр макет достаёт
        // через тот же порт (/cadastre/ в tools/serve.py). ESTATE_TEST_PORT —
        // первый пробуемый порт для самопроверки.
        public const int FirstPort = 5500, LastPort = 5599;
        public const int ProxyPort = 8787;  // отдельный прокси Кадастра: адрес зашит в app/kernel/cadastre.js
        public int SitePort = 0;
        public string Url { get { return "http://127.0.0.1:" + SitePort + "/app.html"; } }
        public int MovedFrom;  // порт, который оказался занят (0 — не переезжали)

        public readonly string Root = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EstateMaket");
        string Py { get { return Path.Combine(Root, "python", "python.exe"); } }
        string Site { get { return Path.Combine(Root, "site"); } }
        string Data { get { return Path.Combine(Root, "data"); } }
        string Logs { get { return Path.Combine(Root, "logs"); } }

        Process site, proxy;
        public Action<string> Status = delegate { };

        int ChoosePort()
        {
            string test = Environment.GetEnvironmentVariable("ESTATE_TEST_PORT");
            int first;
            if (!int.TryParse(test, out first)) first = FirstPort;
            int saved;
            if (test != null || !int.TryParse(ReadOr(Path.Combine(Root, "port.txt")), out saved)) saved = first;
            MovedFrom = 0;
            if (PortFree(saved)) return saved;
            for (int p = first; p <= Math.Max(LastPort, first + 99); p++)
                if (p != saved && p != ProxyPort && PortFree(p)) { MovedFrom = saved; return p; }
            return 0;
        }

        static string Resource(string name)
        {
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
            using (var r = new StreamReader(s, Encoding.UTF8)) return r.ReadToEnd().Trim();
        }

        static void Unzip(string resource, string dir)
        {
            if (Directory.Exists(dir)) Directory.Delete(dir, true);
            Directory.CreateDirectory(dir);
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream(resource))
            using (var z = new ZipArchive(s, ZipArchiveMode.Read))
            {
                foreach (var e in z.Entries)
                {
                    var path = Path.GetFullPath(Path.Combine(dir, e.FullName));
                    if (!path.StartsWith(Path.GetFullPath(dir), StringComparison.OrdinalIgnoreCase)) continue;
                    if (e.FullName.EndsWith("/")) { Directory.CreateDirectory(path); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(path));
                    e.ExtractToFile(path, true);
                }
            }
        }

        static string ReadOr(string path)
        {
            try { return File.ReadAllText(path, Encoding.UTF8).Trim(); } catch (Exception) { return ""; }
        }

        public void Install()
        {
            Directory.CreateDirectory(Root);
            Directory.CreateDirectory(Logs);
            Directory.CreateDirectory(Data);
            string pyVer = Resource("python.txt");
            if (!File.Exists(Py) || ReadOr(Path.Combine(Root, "python", "version.txt")) != pyVer)
            {
                Status("Устанавливаю Python…");
                KillOwnPython();
                Unzip("python.zip", Path.Combine(Root, "python"));
                File.WriteAllText(Path.Combine(Root, "python", "version.txt"), pyVer, Encoding.UTF8);
            }
            string build = Resource("build.txt");
            if (ReadOr(Path.Combine(Site, "build.txt")) != build)
            {
                Status("Устанавливаю макет…");
                KillOwnPython();
                Unzip("site.zip", Site);
                File.WriteAllText(Path.Combine(Site, "build.txt"), build, Encoding.UTF8);
                // Карточки сотрудников из сборки — в папку данных зрителя. Его
                // собственный файл (zritel-…) в сборке не бывает и не трогается.
                var pack = Path.Combine(Site, "data", "local");
                if (Directory.Exists(pack))
                    foreach (var f in Directory.GetFiles(pack, "*.json"))
                    {
                        if (Path.GetFileName(f) == "manifest.json") continue;
                        File.Copy(f, Path.Combine(Data, Path.GetFileName(f)), true);
                    }
            }
        }

        // Python, оставшийся от прежнего запуска (окно закрыли через диспетчер
        // задач, выключили компьютер): иначе порт занят, а новый не встанет.
        public void KillOwnPython()
        {
            foreach (var p in Process.GetProcessesByName("python"))
            {
                try
                {
                    if (string.Equals(p.MainModule.FileName, Py, StringComparison.OrdinalIgnoreCase))
                    {
                        p.Kill();
                        p.WaitForExit(3000);
                    }
                }
                catch (Exception) { /* чужой процесс без доступа */ }
            }
        }

        // Порт свободен — никто не слушает его НИ НА ОДНОМ адресе. Пробная
        // привязка к 127.0.0.1 не годится: Windows даёт занять 127.0.0.1:5500,
        // когда Live Server слушает 0.0.0.0:5500, — и после «Остановить» тот же
        // адрес отвечал макетом из Live Server (23.10.2026: «Кнопка остановки
        // как будто сбоит»).
        public static bool PortFree(int port)
        {
            foreach (var e in IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners())
                if (e.Port == port) return false;
            return true;
        }

        static bool Answers(string url)
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(url);
                req.Proxy = null;  // localhost — мимо корпоративного прокси
                req.Timeout = 2000;
                using (var r = (HttpWebResponse)req.GetResponse()) return (int)r.StatusCode < 500;
            }
            catch (Exception) { return false; }
        }

        Process Spawn(string script, string args, string log)
        {
            var psi = new ProcessStartInfo(Py, "-u \"" + script + "\" " + args)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = Site,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };
            psi.EnvironmentVariables["PYTHONIOENCODING"] = "utf-8";
            psi.EnvironmentVariables["PYTHONUTF8"] = "1";
            psi.EnvironmentVariables["NO_PROXY"] = "127.0.0.1,localhost";
            var w = new StreamWriter(Path.Combine(Logs, log), true, new UTF8Encoding(false)) { AutoFlush = true };
            var p = new Process { StartInfo = psi, EnableRaisingEvents = true };
            // Строки вывода приходят и после гашения процесса — запись в
            // закрытый журнал не должна ронять окно.
            DataReceivedEventHandler h = delegate(object s, DataReceivedEventArgs e)
            {
                if (e.Data == null) return;
                lock (w) { try { w.WriteLine(e.Data); } catch (ObjectDisposedException) { } }
            };
            p.OutputDataReceived += h;
            p.ErrorDataReceived += h;
            p.Exited += delegate { lock (w) w.Dispose(); };
            p.Start();
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            return p;
        }

        // Пусто — запущено; иначе — что сказать человеку.
        public string Start()
        {
            Install();
            if (Running) return "";
            KillOwnPython();
            SitePort = ChoosePort();
            if (SitePort == 0)
                return "Все порты с " + FirstPort + " по " + LastPort + " заняты другими программами. " +
                       "Закройте лишние и нажмите «Запустить» ещё раз.";
            File.WriteAllText(Path.Combine(Root, "port.txt"), SitePort.ToString());
            Status("Запускаю макет…");
            string name = "zritel " + Environment.UserName;
            site = Spawn(Path.Combine(Site, "tools", "serve.py"),
                "--port " + SitePort + " --name \"" + name + "\" --data \"" + Data + "\"", "site.log");
            // Прокси Кадастра — для карты осмотра и адреса по ЕНИ; без него макет
            // работает, только без контуров участков. Занят порт — уже запущен.
            if (PortFree(ProxyPort))
                proxy = Spawn(Path.Combine(Site, "tools", "cadastre", "proxy.py"), "--port " + ProxyPort, "proxy.log");
            for (int i = 0; i < 100; i++)
            {
                if (Answers(Url)) return "";
                if (site.HasExited) break;
                Thread.Sleep(200);
            }
            Stop();
            return "Макет не запустился. Подробности — в файле " + Path.Combine(Logs, "site.log");
        }

        public bool Running { get { return site != null && !site.HasExited; } }
        public bool ProxyRunning { get { return proxy != null && !proxy.HasExited; } }

        // Пусто — оба сервера погашены и порты свободны; иначе — что сказать.
        public string Stop()
        {
            foreach (var p in new[] { site, proxy })
            {
                if (p == null) continue;
                try { if (!p.HasExited) { p.Kill(); p.WaitForExit(5000); } } catch (Exception) { }
            }
            site = proxy = null;
            KillOwnPython();  // на случай, если процесс подменился (перезапуск)
            if (SitePort == 0) return "";
            for (int i = 0; i < 25 && !PortFree(SitePort); i++) Thread.Sleep(200);
            return PortFree(SitePort) ? "" : "Макет остановлен, но порт " + SitePort +
                " слушает другая программа — браузер может показывать её.";
        }

        public static int SelfTest()
        {
            var r = new Runner();
            var lines = new List<string>();
            r.Status = delegate(string s) { lines.Add(s); };
            // Прокси уже запущен другим окном — его порт в проверку остановки не входит.
            bool proxyBusy = !PortFree(ProxyPort);
            // Запомненный порт самопроверка возвращает как был: пробные порты не
            // должны стать портом зрителя (на новом порту не видно его осмотров).
            string portFile = Path.Combine(r.Root, "port.txt");
            string portWas = File.Exists(portFile) ? ReadOr(portFile) : null;
            int code = 0;
            try
            {
                string err = r.Start();
                if (err != "") { lines.Add("ОШИБКА: " + err); code = 1; }
                else
                {
                    bool site = Answers(r.Url), persist = Answers("http://127.0.0.1:" + r.SitePort + "/__persist"),
                         proxy = Answers("http://127.0.0.1:" + ProxyPort + "/"),
                         same = Answers("http://127.0.0.1:" + r.SitePort + "/cadastre/main.do");
                    lines.Add("макет: " + (site ? "отвечает на порту " + r.SitePort : "НЕ отвечает"));
                    lines.Add("Кадастр через порт макета (/cadastre/): " + (same ? "отвечает" : "НЕ отвечает"));
                    lines.Add("правки (/__persist): " + (persist ? "отвечает" : "НЕ отвечает"));
                    lines.Add("прокси Кадастра: " + (proxy ? "отвечает" : "НЕ отвечает"));
                    if (!(site && persist && proxy && same)) code = 1;
                }
            }
            catch (Exception e) { lines.Add("ОШИБКА: " + e); code = 1; }
            finally
            {
                // Остановка: процессы погашены, макет больше не отвечает, порты свободны.
                int was = r.SitePort;
                string url = r.Url;
                string err = r.Stop();
                bool off = !Answers(url) && PortFree(was) && (proxyBusy || PortFree(ProxyPort));
                lines.Add("остановка: " + (off && err == "" ? "серверы погашены, порты свободны" : "НЕ остановилось. " + err));
                if (!(off && err == "")) code = 1;
            }
            // Чужой сервер на порту (как Live Server на 0.0.0.0): запуск не встаёт
            // рядом на 127.0.0.1, а переходит на следующий свободный порт.
            int busyPort = r.SitePort;
            var other = new TcpListener(IPAddress.Any, busyPort);
            try
            {
                other.Start();
                string err = r.Start();
                bool moved = err == "" && r.Running && r.SitePort != busyPort && r.MovedFrom == busyPort && Answers(r.Url);
                lines.Add("чужой сервер на порту " + busyPort + ": " + (moved ? "макет перешёл на " + r.SitePort : "НЕ перешёл: " + err));
                if (!moved) code = 1;
            }
            catch (Exception e) { lines.Add("ОШИБКА проверки занятого порта: " + e.Message); code = 1; }
            finally
            {
                other.Stop();
                r.Stop();
                if (portWas == null) File.Delete(portFile); else File.WriteAllText(portFile, portWas);
            }
            lines.Add(code == 0 ? "ИТОГ: всё работает" : "ИТОГ: есть ошибки");
            Directory.CreateDirectory(r.Logs);
            File.WriteAllLines(Path.Combine(r.Logs, "selftest.txt"), lines.ToArray(), new UTF8Encoding(false));
            return code;
        }
    }

    // Окно: одна главная кнопка, состояние словами, остальное — второстепенно.
    class MainForm : Form
    {
        readonly Runner runner = new Runner();
        readonly Label title = new Label(), state = new Label(), note = new Label();
        readonly Button start = new Button(), browser = new Button(), stop = new Button();
        bool busy;

        static readonly Color Ink = Color.FromArgb(0x1F, 0x2A, 0x37);
        static readonly Color Muted = Color.FromArgb(0x5B, 0x67, 0x75);
        static readonly Color Accent = Color.FromArgb(0x1D, 0x5F, 0xD1);

        public MainForm()
        {
            Text = "Макет E-state";
            Font = new Font("Segoe UI", 10f);
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(480, 250);
            BackColor = Color.White;
            AutoScaleMode = AutoScaleMode.Dpi;
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }

            title.Text = "Макет E-state";
            title.Font = new Font("Segoe UI Semibold", 15f);
            title.ForeColor = Ink;
            title.SetBounds(24, 18, 432, 34);

            state.Text = "Нажмите «Запустить» — макет откроется в браузере.";
            state.ForeColor = Muted;
            state.SetBounds(24, 56, 432, 48);

            start.Text = "Запустить";
            start.Font = new Font("Segoe UI Semibold", 11f);
            start.BackColor = Accent;
            start.ForeColor = Color.White;
            start.FlatStyle = FlatStyle.Flat;
            start.FlatAppearance.BorderSize = 0;
            start.SetBounds(24, 112, 432, 44);
            start.Click += delegate { StartAsync(); };

            browser.Text = "Открыть в браузере";
            browser.SetBounds(24, 166, 210, 34);
            browser.Click += delegate { OpenBrowser(); };

            stop.Text = "Остановить";
            stop.SetBounds(246, 166, 210, 34);
            stop.Click += delegate { StopAsync(); };

            note.Text = "Закроете это окно — макет остановится. Ваши правки сохраняются на этом компьютере.";
            note.ForeColor = Muted;
            note.Font = new Font("Segoe UI", 8.5f);
            note.SetBounds(24, 210, 432, 34);

            Controls.AddRange(new Control[] { title, state, start, browser, stop, note });
            AcceptButton = start;
            runner.Status = delegate(string s) { BeginInvoke((Action)delegate { state.Text = s; }); };
            FormClosing += delegate { runner.Stop(); };
            Refresh2(null);
        }

        void Refresh2(string text)
        {
            if (text != null) state.Text = text;
            bool on = runner.Running;
            start.Enabled = !busy && !on;
            start.BackColor = start.Enabled ? Accent : Color.FromArgb(0xB8, 0xC4, 0xD6);
            browser.Enabled = on;
            stop.Enabled = on && !busy;
        }

        void StartAsync()
        {
            busy = true;
            Refresh2("Готовлю макет… При первом запуске это займёт до минуты.");
            var t = new Thread(delegate()
            {
                string err;
                try { err = runner.Start(); } catch (Exception e) { err = "Не получилось: " + e.Message; }
                BeginInvoke((Action)delegate
                {
                    busy = false;
                    if (err != "") { Refresh2(err); return; }
                    Refresh2("Макет работает: " + runner.Url + (runner.MovedFrom != 0
                        ? "\nПорт " + runner.MovedFrom + " был занят другой программой — макет перешёл на " + runner.SitePort + "." : ""));
                    OpenBrowser();
                });
            });
            t.IsBackground = true;
            t.Start();
        }

        // Гашение — не в потоке окна: ожидание процессов и порта не замораживает окно.
        void StopAsync()
        {
            busy = true;
            Refresh2("Останавливаю…");
            var t = new Thread(delegate()
            {
                string err;
                try { err = runner.Stop(); } catch (Exception e) { err = "Не получилось: " + e.Message; }
                BeginInvoke((Action)delegate
                {
                    busy = false;
                    Refresh2(err == "" ? "Макет остановлен. Вкладку браузера можно закрыть." : err);
                });
            });
            t.IsBackground = true;
            t.Start();
        }

        void OpenBrowser()
        {
            try { Process.Start(runner.Url); }
            catch (Exception) { MessageBox.Show("Откройте в браузере адрес " + runner.Url, "Макет E-state"); }
        }
    }
}
