using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Forms;
using System.IO;
using System.Runtime.InteropServices;

namespace CanvasFlow.Desktop;

internal static class ScreenCaptureService
{
    public static Screen CurrentScreen() => Screen.FromPoint(Cursor.Position);

    public static Screen? ResolveScreen(SavedScreenRegion region)
    {
        var screen = Screen.AllScreens.FirstOrDefault(item => item.DeviceName.Equals(region.DeviceName, StringComparison.OrdinalIgnoreCase));
        if (screen is null) return null;
        var bounds = screen.Bounds;
        return bounds.Left == region.MonitorLeft && bounds.Top == region.MonitorTop
            && bounds.Width == region.MonitorWidth && bounds.Height == region.MonitorHeight
            && (region.MonitorDpi == 0 || region.MonitorDpi == GetScreenDpi(screen))
            ? screen : null;
    }

    public static uint GetScreenDpi(Screen screen)
    {
        var point = new NativePoint(screen.Bounds.Left + screen.Bounds.Width / 2, screen.Bounds.Top + screen.Bounds.Height / 2);
        var monitor = MonitorFromPoint(point, 2);
        return monitor != IntPtr.Zero && GetDpiForMonitor(monitor, 0, out var dpiX, out _) == 0 ? dpiX : 96;
    }

    public static Bitmap CaptureScreen(Screen screen)
    {
        var bounds = screen.Bounds;
        var bitmap = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppPArgb);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);
        return bitmap;
    }

    public static Bitmap CaptureRegion(SavedScreenRegion region)
    {
        var screen = ResolveScreen(region) ?? throw new InvalidOperationException("保存的截图区域已经失效。可能原因：显示器、分辨率或缩放设置发生了变化。建议：点击“重新框选”设置截图区域。");
        using var full = CaptureScreen(screen);
        var x = Math.Clamp((int)Math.Round(region.LeftRatio * full.Width), 0, full.Width - 1);
        var y = Math.Clamp((int)Math.Round(region.TopRatio * full.Height), 0, full.Height - 1);
        var width = Math.Clamp((int)Math.Round(region.WidthRatio * full.Width), 1, full.Width - x);
        var height = Math.Clamp((int)Math.Round(region.HeightRatio * full.Height), 1, full.Height - y);
        if (width < 24 || height < 24) throw new InvalidOperationException("截图区域过小。可能原因：框选范围不足。建议：重新框选一个更大的区域。");
        return full.Clone(new Rectangle(x, y, width, height), PixelFormat.Format32bppPArgb);
    }

    public static void SavePng(Bitmap bitmap, string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temporary = path + $".{Environment.ProcessId}.tmp";
        bitmap.Save(temporary, ImageFormat.Png);
        File.Move(temporary, path, true);
    }

    public static string ToDataUrl(string path) => "data:image/png;base64," + Convert.ToBase64String(File.ReadAllBytes(path));

    [StructLayout(LayoutKind.Sequential)]
    private readonly record struct NativePoint(int X, int Y);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromPoint(NativePoint point, uint flags);

    [DllImport("shcore.dll")]
    private static extern int GetDpiForMonitor(IntPtr monitor, int dpiType, out uint dpiX, out uint dpiY);
}
