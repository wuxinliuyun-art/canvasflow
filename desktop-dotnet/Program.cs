namespace CanvasFlow.Desktop;

internal static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--background-removal-worker")
            return BackgroundRemovalPlugin.RunWorkerAsync(args).GetAwaiter().GetResult();
        var app = new App();
        app.InitializeComponent();
        return app.Run();
    }
}
