using System.IO;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using WpfPoint = System.Windows.Point;
using WpfMouseEventArgs = System.Windows.Input.MouseEventArgs;
using WpfKeyEventArgs = System.Windows.Input.KeyEventArgs;

namespace CanvasFlow.Desktop;

public partial class ImagePreviewWindow : Window
{
    private WpfPoint _dragStart;
    private WpfPoint _translateStart;
    private bool _dragging;

    public ImagePreviewWindow(string path, bool dark)
    {
        InitializeComponent();
        Background = Brush(dark ? "#111214" : "#ECEDEF");
        Viewport.Background = Brush(dark ? "#0B0C0E" : "#F7F7F8");
        PreviewImage.Source = LoadBitmap(path);
        Title = $"图片预览 · {Path.GetFileName(path)}";
    }

    private void Viewport_MouseWheel(object sender, MouseWheelEventArgs e)
    {
        var next = Math.Clamp(ImageScale.ScaleX * (e.Delta > 0 ? 1.16 : 1 / 1.16), 0.25, 8);
        ImageScale.ScaleX = ImageScale.ScaleY = next;
        if (next <= 1) { ImageTranslate.X = 0; ImageTranslate.Y = 0; }
    }

    private void Viewport_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ClickCount == 2) { ResetView(); return; }
        _dragging = true;
        _dragStart = e.GetPosition(this);
        _translateStart = new WpfPoint(ImageTranslate.X, ImageTranslate.Y);
        Viewport.CaptureMouse();
        Cursor = System.Windows.Input.Cursors.Hand;
    }

    private void Viewport_MouseMove(object sender, WpfMouseEventArgs e)
    {
        if (!_dragging || e.LeftButton != MouseButtonState.Pressed) return;
        var point = e.GetPosition(this);
        ImageTranslate.X = _translateStart.X + point.X - _dragStart.X;
        ImageTranslate.Y = _translateStart.Y + point.Y - _dragStart.Y;
    }

    private void Viewport_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        _dragging = false;
        Viewport.ReleaseMouseCapture();
        Cursor = System.Windows.Input.Cursors.Arrow;
    }

    private void Window_KeyDown(object sender, WpfKeyEventArgs e)
    {
        if (e.Key == Key.Escape) Close();
    }

    private void ResetView()
    {
        ImageScale.ScaleX = ImageScale.ScaleY = 1;
        ImageTranslate.X = ImageTranslate.Y = 0;
    }

    private static BitmapImage LoadBitmap(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        var image = new BitmapImage();
        image.BeginInit();
        image.CacheOption = BitmapCacheOption.OnLoad;
        image.StreamSource = stream;
        image.EndInit();
        image.Freeze();
        return image;
    }

    private static System.Windows.Media.Brush Brush(string value) => new System.Windows.Media.SolidColorBrush((System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(value));
}
