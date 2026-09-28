using System.Runtime.InteropServices;
namespace Graf;

// Снимок окна для проверок: PrintWindow с PW_RENDERFULLCONTENT — захватывает
// и XAML, и полотно Win2D (RenderTargetBitmap полотно не видит). Пишет BMP.
static class Shot
{
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int w, int h);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr hdc, IntPtr o);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
    [DllImport("gdi32.dll")] static extern int GetDIBits(IntPtr hdc, IntPtr bmp, uint start, uint lines, byte[] bits, ref BITMAPINFO bi, uint usage);
    [StructLayout(LayoutKind.Sequential)] struct BITMAPINFO { public int biSize, biWidth, biHeight; public short biPlanes, biBitCount; public int biCompression, biSizeImage, biX, biY, biClrUsed, biClrImportant; }
    public static void Save(IntPtr hwnd, string path)
    {
        GetWindowRect(hwnd, out var r); int w = r.R - r.L, h = r.B - r.T;
        var sdc = GetDC(IntPtr.Zero); var dc = CreateCompatibleDC(sdc); var bmp = CreateCompatibleBitmap(sdc, w, h); SelectObject(dc, bmp);
        PrintWindow(hwnd, dc, 2);
        var bi = new BITMAPINFO { biSize = 40, biWidth = w, biHeight = -h, biPlanes = 1, biBitCount = 32 };
        var px = new byte[w * h * 4]; GetDIBits(dc, bmp, 0, (uint)h, px, ref bi, 0);
        // простой BMP
        using var f = File.Create(path); using var bw = new BinaryWriter(f);
        bw.Write((ushort)0x4D42); bw.Write(54 + px.Length); bw.Write(0); bw.Write(54);
        bw.Write(40); bw.Write(w); bw.Write(-h); bw.Write((short)1); bw.Write((short)32); bw.Write(0); bw.Write(px.Length); bw.Write(0); bw.Write(0); bw.Write(0); bw.Write(0);
        bw.Write(px);
    }
}
