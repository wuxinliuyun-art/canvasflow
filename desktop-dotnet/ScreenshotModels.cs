using System.Text.Json;
using System.Text.Json.Serialization;
using System.IO;

namespace CanvasFlow.Desktop;

internal sealed class ScreenshotToolSettings
{
    public int Version { get; set; } = 1;
    public double WindowLeft { get; set; } = double.NaN;
    public double WindowTop { get; set; } = double.NaN;
    public bool IsCollapsed { get; set; }
    public bool IsTopmost { get; set; } = true;
    public bool PreviewVisible { get; set; } = true;
    public bool ParametersVisible { get; set; }
    public bool UseCanvasNodeInput { get; set; }
    public string CanvasNodeId { get; set; } = "";
    public string PreviewMode { get; set; } = "capture";
    public bool AutoCaptureBeforeSend { get; set; }
    public string PromptTemplateId { get; set; } = "";
    public string PromptText { get; set; } = "";
    public string Model { get; set; } = "gpt-image-2";
    public string Resolution { get; set; } = "1k";
    public string Quality { get; set; } = "low";
    public string Ratio { get; set; } = "1:1";
    public int Count { get; set; } = 1;
    public SavedScreenRegion? Region { get; set; }
}

public sealed class SavedScreenRegion
{
    public string DeviceName { get; set; } = "";
    public int MonitorLeft { get; set; }
    public int MonitorTop { get; set; }
    public int MonitorWidth { get; set; }
    public int MonitorHeight { get; set; }
    public uint MonitorDpi { get; set; } = 96;
    public double LeftRatio { get; set; }
    public double TopRatio { get; set; }
    public double WidthRatio { get; set; }
    public double HeightRatio { get; set; }
}

public sealed record ScreenshotGenerationRequest(
    string RequestId,
    string ImageDataUrl,
    string Prompt,
    string Model,
    string Resolution,
    string Quality,
    string Ratio,
    int Count,
    string ThumbnailDataUrl,
    bool UseCanvasNodeInput,
    string CanvasNodeId);

public sealed record ScreenshotCanvasNodeOption(string Id, string Name, string Summary);

public sealed record ScreenshotTaskUpdate(
    string RequestId,
    string TaskId,
    string Status,
    int Progress,
    string OutputPath,
    string Error);

internal static class ScreenshotSettingsStore
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    public static ScreenshotToolSettings Load(string path)
    {
        try
        {
            if (!File.Exists(path)) return new ScreenshotToolSettings();
            return JsonSerializer.Deserialize<ScreenshotToolSettings>(File.ReadAllText(path), Options) ?? new ScreenshotToolSettings();
        }
        catch
        {
            return new ScreenshotToolSettings();
        }
    }

    public static void Save(string path, ScreenshotToolSettings settings)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temporary = path + $".{Environment.ProcessId}.{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(settings, Options));
        File.Move(temporary, path, true);
    }
}
