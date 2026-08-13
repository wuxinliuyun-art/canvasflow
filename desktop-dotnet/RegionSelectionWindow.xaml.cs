using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Forms;
using DrawingBitmap = System.Drawing.Bitmap;
using WpfPoint = System.Windows.Point;
using WpfCanvas = System.Windows.Controls.Canvas;

namespace CanvasFlow.Desktop;

public partial class RegionSelectionWindow : Window
{
    private const int SwpShowWindow = 0x0040;
    private readonly Screen _screen;
    private WpfPoint _start;
    private bool _selecting;

    public SavedScreenRegion? SelectedRegion { get; private set; }

    public RegionSelectionWindow(Screen screen, DrawingBitmap frozenBitmap)
    {
        InitializeComponent();
        _screen = screen;
        FrozenScreen.Source = BitmapToSource(frozenBitmap);
        Left = screen.Bounds.Left;
        Top = screen.Bounds.Top;
        Width = screen.Bounds.Width;
        Height = screen.Bounds.Height;
        SourceInitialized += (_, _) =>
        {
            var handle = new WindowInteropHelper(this).Handle;
            var bounds = _screen.Bounds;
            SetWindowPos(handle, IntPtr.Zero, bounds.Left, bounds.Top, bounds.Width, bounds.Height, SwpShowWindow);
        };
        Loaded += (_, _) =>
        {
            UpdateShade(null);
            Activate();
            Focus();
        };
    }

    private void SelectionRoot_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        _selecting = true;
        _start = e.GetPosition(SelectionRoot);
        Mouse.Capture(SelectionRoot, CaptureMode.SubTree);
        e.Handled = true;
        UpdateSelection(_start);
    }

    private void SelectionRoot_MouseMove(object sender, System.Windows.Input.MouseEventArgs e)
    {
        if (_selecting) UpdateSelection(e.GetPosition(SelectionRoot));
    }

    private void SelectionRoot_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (!_selecting) return;
        _selecting = false;
        Mouse.Capture(null);
        e.Handled = true;
        var rect = NormalizedRect(_start, e.GetPosition(SelectionRoot));
        if (rect.Width < 24 || rect.Height < 24)
        {
            SelectionBorder.Visibility = Visibility.Collapsed;
            UpdateShade(null);
            return;
        }

        var bounds = _screen.Bounds;
        SelectedRegion = new SavedScreenRegion
        {
            DeviceName = _screen.DeviceName,
            MonitorLeft = bounds.Left,
            MonitorTop = bounds.Top,
            MonitorWidth = bounds.Width,
            MonitorHeight = bounds.Height,
            MonitorDpi = ScreenCaptureService.GetScreenDpi(_screen),
            LeftRatio = rect.Left / Math.Max(1, SelectionRoot.ActualWidth),
            TopRatio = rect.Top / Math.Max(1, SelectionRoot.ActualHeight),
            WidthRatio = rect.Width / Math.Max(1, SelectionRoot.ActualWidth),
            HeightRatio = rect.Height / Math.Max(1, SelectionRoot.ActualHeight)
        };
        DialogResult = true;
    }

    private void UpdateSelection(WpfPoint current)
    {
        var rect = NormalizedRect(_start, current);
        SelectionBorder.Visibility = Visibility.Visible;
        SelectionBorder.Width = rect.Width;
        SelectionBorder.Height = rect.Height;
        WpfCanvas.SetLeft(SelectionBorder, rect.Left);
        WpfCanvas.SetTop(SelectionBorder, rect.Top);
        SizeLabel.Text = $"{Math.Round(rect.Width)} × {Math.Round(rect.Height)}";
        UpdateShade(rect);
    }

    private void UpdateShade(Rect? selection)
    {
        var geometry = new PathGeometry { FillRule = FillRule.EvenOdd };
        geometry.AddGeometry(new RectangleGeometry(new Rect(0, 0, SelectionRoot.ActualWidth, SelectionRoot.ActualHeight)));
        if (selection is { } rect) geometry.AddGeometry(new RectangleGeometry(rect));
        Shade.Data = geometry;
    }

    private static Rect NormalizedRect(WpfPoint first, WpfPoint second)
    {
        var left = Math.Min(first.X, second.X);
        var top = Math.Min(first.Y, second.Y);
        return new Rect(left, top, Math.Abs(second.X - first.X), Math.Abs(second.Y - first.Y));
    }

    private void Window_KeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == Key.Escape)
        {
            Mouse.Capture(null);
            DialogResult = false;
        }
    }

    private static BitmapSource BitmapToSource(DrawingBitmap bitmap)
    {
        var handle = bitmap.GetHbitmap();
        try
        {
            return Imaging.CreateBitmapSourceFromHBitmap(handle, IntPtr.Zero, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
        }
        finally
        {
            DeleteObject(handle);
        }
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr handle, IntPtr insertAfter, int x, int y, int width, int height, uint flags);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr handle);
}
