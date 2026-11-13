package kg.osmotr.matrix;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Instrumentation;
import android.app.UiAutomation;
import android.graphics.Point;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.Display;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityNodeInfo;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * Дерево экрана по запросу — то же, что «uiautomator dump» (тот же XML: узлы, видимые пользователю,
 * границы обрезаны экраном), но без запуска новой Java-машины на каждый снимок: «uiautomator dump»
 * стоил ~2,3 с, отсюда — доли секунды. Матрица шлёт строку «dump [тишина_мс [предел_мс]]» на
 * 127.0.0.1:9008 устройства (через nc) и читает XML до закрытия соединения.
 *
 *   am instrument -w kg.osmotr.matrix/.Dumper
 */
public class Dumper extends Instrumentation {
    private static final int PORT = 9008;

    @Override
    public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        start();
    }

    @Override
    public void onStart() {
        UiAutomation ua = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
        AccessibilityServiceInfo info = ua.getServiceInfo();
        info.flags |= AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS | AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
        ua.setServiceInfo(info);
        try (ServerSocket server = new ServerSocket(PORT, 8, InetAddress.getByName("127.0.0.1"))) {
            while (true) {
                try (Socket s = server.accept()) {
                    String line = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8)).readLine();
                    if (line == null) continue;
                    String[] a = line.trim().split("\\s+");
                    if (a[0].equals("quit")) break;
                    // Касание и свайп — событиями сенсорного экрана через это же подключение: «input tap» на
                    // каждое касание запускает на устройстве отдельный процесс. «tap x y [удержание_мс]»,
                    // «swipe x1 y1 x2 y2 мс». Ответ «ok» — когда касание доставлено.
                    if (a[0].equals("tap") || a[0].equals("swipe")) {
                        boolean ok = a[0].equals("tap")
                            ? swipe(ua, i(a, 1), i(a, 2), i(a, 1), i(a, 2), a.length > 3 ? i(a, 3) : 0)
                            : swipe(ua, i(a, 1), i(a, 2), i(a, 3), i(a, 4), a.length > 5 ? i(a, 5) : 300);
                        s.getOutputStream().write((ok ? "ok" : "fail").getBytes(StandardCharsets.UTF_8));
                        continue;
                    }
                    long quiet = a.length > 1 ? Long.parseLong(a[1]) : 0, most = a.length > 2 ? Long.parseLong(a[2]) : 1000;
                    if (quiet > 0) {
                        try { ua.waitForIdle(quiet, most); } catch (Exception ignored) { /* не успокоился — снимаем как есть */ }
                    }
                    OutputStream out = s.getOutputStream();
                    out.write(dump(ua).getBytes(StandardCharsets.UTF_8));
                    out.flush();
                } catch (Exception e) {
                    // Один неудачный запрос — не повод останавливать снимки.
                }
            }
        } catch (Exception e) {
            Bundle b = new Bundle();
            b.putString("error", String.valueOf(e));
            finish(1, b);
            return;
        }
        finish(0, new Bundle());
    }

    private String dump(UiAutomation ua) {
        Display d = ((WindowManager) getContext().getSystemService(android.content.Context.WINDOW_SERVICE)).getDefaultDisplay();
        Point size = new Point();
        d.getRealSize(size);
        StringBuilder sb = new StringBuilder("<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>");
        sb.append("<hierarchy rotation=\"").append(d.getRotation()).append("\">");
        // Кэш узлов сбросить: узлы обновляются по событиям приложения, а Compose шлёт их не на всё —
        // без сброса дерево оставалось прежним (переключатель включён, а снимок — «0 предметов»).
        // «uiautomator dump» подключается каждый раз заново — кэша у него нет.
        clearCache(ua);
        // Compose отдаёт прежнее дерево после правки «на месте» (текст сменился, узлы те же): clearCache=true, а
        // снимок — «0 предметов» при «12» на экране и яркость с отставанием на шаг (29.10.2026). Новое подключение
        // лечило — переустановка настроек службы будит приложение так же, без перезапуска.
        AccessibilityServiceInfo info = ua.getServiceInfo();
        if (info != null) { ua.setServiceInfo(info); SystemClockSleep(30); }
        AccessibilityNodeInfo root = null;
        for (int i = 0; i < 10 && root == null; i++) {
            root = ua.getRootInActiveWindow();
            if (root == null) SystemClockSleep(50);
        }
        if (root != null) node(sb, root, 0, size.x, size.y);
        return sb.append("</hierarchy>").toString();
    }

    private static int i(String[] a, int k) { return Integer.parseInt(a[k]); }

    /** Нажать в (x1, y1), провести до (x2, y2) за [ms] (касание: та же точка; удержание — долгое нажатие). */
    private static boolean swipe(UiAutomation ua, int x1, int y1, int x2, int y2, int ms) {
        long t0 = SystemClock.uptimeMillis();
        boolean ok = inject(ua, t0, t0, MotionEvent.ACTION_DOWN, x1, y1);
        int steps = Math.max(1, ms / 16);
        for (int k = 1; k <= steps && ms > 0; k++) {
            SystemClockSleep(ms / steps);
            ok &= inject(ua, t0, SystemClock.uptimeMillis(), MotionEvent.ACTION_MOVE,
                x1 + (x2 - x1) * k / steps, y1 + (y2 - y1) * k / steps);
        }
        return ok & inject(ua, t0, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, x2, y2);
    }

    private static boolean inject(UiAutomation ua, long down, long at, int action, int x, int y) {
        MotionEvent e = MotionEvent.obtain(down, at, action, x, y, 0);
        e.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try { return ua.injectInputEvent(e, true); } finally { e.recycle(); }
    }

    /** UiAutomation.clearCache() — с Android 13 (API 33); раньше — нет, тогда без сброса. */
    private static void clearCache(UiAutomation ua) {
        try { UiAutomation.class.getMethod("clearCache").invoke(ua); } catch (Exception ignored) { }
    }

    private static void SystemClockSleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException ignored) { }
    }

    /** Как AccessibilityNodeInfoDumper (uiautomator): те же атрибуты, видимые границы, только видимые дети. */
    private static void node(StringBuilder sb, AccessibilityNodeInfo n, int index, int w, int h) {
        // Свежие данные узла у приложения: кэш живёт событиями, а Compose шлёт их не на всё (сброс кэша — не везде есть).
        n.refresh();
        Rect r = new Rect();
        n.getBoundsInScreen(r);
        if (!r.intersect(0, 0, w, h)) r.setEmpty();
        sb.append("<node index=\"").append(index).append('"');
        attr(sb, "text", n.getText());
        attr(sb, "resource-id", n.getViewIdResourceName());
        attr(sb, "class", n.getClassName());
        attr(sb, "package", n.getPackageName());
        attr(sb, "content-desc", n.getContentDescription());
        attr(sb, "checkable", n.isCheckable());
        attr(sb, "checked", n.isChecked());
        attr(sb, "clickable", n.isClickable());
        attr(sb, "enabled", n.isEnabled());
        attr(sb, "focusable", n.isFocusable());
        attr(sb, "focused", n.isFocused());
        attr(sb, "scrollable", n.isScrollable());
        attr(sb, "long-clickable", n.isLongClickable());
        attr(sb, "password", n.isPassword());
        attr(sb, "selected", n.isSelected());
        sb.append(" bounds=\"[").append(r.left).append(',').append(r.top).append("][").append(r.right).append(',').append(r.bottom).append("]\">");
        for (int i = 0; i < n.getChildCount(); i++) {
            AccessibilityNodeInfo c = n.getChild(i);
            if (c == null) continue;
            if (c.isVisibleToUser()) node(sb, c, i, w, h);
            c.recycle();
        }
        sb.append("</node>");
    }

    private static void attr(StringBuilder sb, String name, Object v) {
        sb.append(' ').append(name).append("=\"");
        String s = v == null ? "" : v.toString();
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '&': sb.append("&amp;"); break;
                case '<': sb.append("&lt;"); break;
                case '>': sb.append("&gt;"); break;
                case '"': sb.append("&quot;"); break;
                case '\'': sb.append("&apos;"); break;
                case '\n': sb.append("&#10;"); break;
                default:
                    if (ch < 0x20 && ch != '\t') continue;   // управляющие — XML их не примет
                    sb.append(ch);
            }
        }
        sb.append('"');
    }
}
