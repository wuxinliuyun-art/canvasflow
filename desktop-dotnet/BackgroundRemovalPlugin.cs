using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace CanvasFlow.Desktop;

internal sealed class BackgroundRemovalPlugin : IDisposable
{
    private const string ModelUrl = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx";
    private const string ExpectedMd5 = "4fab47adc4ff364be1713e97b7e66334";
    private const long ExpectedBytes = 224005088;
    private const int ModelSize = 1024;
    private readonly string _modelPath;
    private readonly string _workRoot;
    private readonly string _appRoot;
    private readonly Action<string, bool> _log;
    private readonly SemaphoreSlim _inferenceGate = new(1, 1);
    private readonly object _sessionLock = new();
    private InferenceSession? _session;
    private string _executionProvider = "CPU";
    private IntPtr _nativeRuntimeHandle;

    public BackgroundRemovalPlugin(string appRoot, Action<string, bool> log)
    {
        _appRoot = Path.GetFullPath(appRoot);
        _modelPath = Path.Combine(appRoot, "data", "plugins", "background-removal", "models", "birefnet-general-lite.onnx");
        _workRoot = Path.Combine(appRoot, "data", "plugin-work", "background-removal");
        _log = log;
    }

    public async Task<object> StatusAsync()
    {
        var installed = await IsInstalledAsync();
        return new { installed, version = installed ? "1.0.0" : "", modelMb = 213.6, engine = "DirectML 优先，CPU 自动回退" };
    }

    public async Task<object> InstallAsync(Action<int, string>? progress, CancellationToken cancellationToken)
    {
        if (await IsInstalledAsync()) return new { installed = true, version = "1.0.0" };
        Directory.CreateDirectory(Path.GetDirectoryName(_modelPath)!);
        var temporary = _modelPath + ".download";
        if (File.Exists(temporary)) File.Delete(temporary);
        _log("[智能抠图插件] 开始从 rembg Release 下载 BiRefNet General Lite ONNX", false);
        try
        {
            using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = true }) { Timeout = TimeSpan.FromMinutes(30) };
            client.DefaultRequestHeaders.UserAgent.ParseAdd("CanvasFlow/2.6.3");
            using var response = await client.GetAsync(ModelUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength is long length && length != ExpectedBytes)
                throw new InvalidDataException($"模型文件大小不匹配，预期 {ExpectedBytes} 字节，实际 {length} 字节");
            await using (var source = await response.Content.ReadAsStreamAsync(cancellationToken))
            await using (var target = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1024 * 1024, true))
            {
                var buffer = new byte[1024 * 1024]; long received = 0; var lastPercent = -1;
                while (true)
                {
                    var read = await source.ReadAsync(buffer, cancellationToken);
                    if (read == 0) break;
                    await target.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                    received += read;
                    var percent = (int)Math.Clamp(received * 100 / ExpectedBytes, 0, 100);
                    if (percent != lastPercent) { lastPercent = percent; progress?.Invoke(percent, "downloading"); }
                }
            }
            progress?.Invoke(100, "verifying");
            var info = new FileInfo(temporary);
            if (info.Length != ExpectedBytes) throw new InvalidDataException($"模型下载不完整，预期 {ExpectedBytes} 字节，实际 {info.Length} 字节");
            if (await Md5Async(temporary) != ExpectedMd5) throw new InvalidDataException("模型 MD5 校验失败");
            File.Move(temporary, _modelPath, true);
            progress?.Invoke(100, "complete");
            _log("[智能抠图插件] 模型下载并校验完成", false);
            return new { installed = true, version = "1.0.0" };
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }

    public object Uninstall()
    {
        lock (_sessionLock) { _session?.Dispose(); _session = null; }
        var pluginRoot = Directory.GetParent(Directory.GetParent(_modelPath)!.FullName)!.FullName;
        if (Directory.Exists(pluginRoot)) Directory.Delete(pluginRoot, true);
        _log("[智能抠图插件] 已卸载；用户生成图片保持不变", false);
        return new { installed = false };
    }

    public async Task<object> RemoveBackgroundAsync(string dataUrl, string fileName, string outputRoot, CancellationToken cancellationToken)
    {
        if (!await IsInstalledAsync()) throw new InvalidOperationException("智能抠图插件尚未安装或模型校验失败");
        Directory.CreateDirectory(_workRoot);
        var workId = Guid.NewGuid().ToString("N");
        var inputPath = Path.Combine(_workRoot, workId + ".input");
        var responsePath = Path.Combine(_workRoot, workId + ".json");
        var comma = dataUrl.IndexOf(',');
        var bytes = Convert.FromBase64String(comma >= 0 ? dataUrl[(comma + 1)..] : dataUrl);
        if (bytes.Length == 0 || bytes.Length > 64 * 1024 * 1024) throw new InvalidDataException("输入图片为空或超过64MB限制");
        await File.WriteAllBytesAsync(inputPath, bytes, cancellationToken);
        try
        {
            var workerDll = ResolveWorkerDll();
            var dotnetHost = ResolveDotnetHost();
            var start = new ProcessStartInfo { FileName = dotnetHost, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            foreach (var argument in new[] { workerDll, _appRoot, inputPath, responsePath, outputRoot, fileName }) start.ArgumentList.Add(argument);
            using var process = Process.Start(start) ?? throw new InvalidOperationException("无法启动智能抠图工作进程");
            var stdout = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderr = process.StandardError.ReadToEndAsync(cancellationToken);
            await process.WaitForExitAsync(cancellationToken);
            var details = ((await stderr) + Environment.NewLine + (await stdout)).Trim();
            if (process.ExitCode != 0 || !File.Exists(responsePath)) throw new InvalidOperationException($"智能抠图工作进程失败（退出码 {process.ExitCode}）：{details}");
            using var document = JsonDocument.Parse(await File.ReadAllTextAsync(responsePath, cancellationToken));
            var root = document.RootElement;
            var engine = root.TryGetProperty("engine", out var engineProperty) ? engineProperty.GetString() ?? "CPU" : "CPU";
            _log($"[智能抠图插件] 推理设备：{engine}", false);
            var outputPath = root.GetProperty("outputPath").GetString() ?? throw new InvalidDataException("工作进程没有返回输出路径");
            var resultBytes = await File.ReadAllBytesAsync(outputPath, cancellationToken);
            return new { dataUrl = "data:image/png;base64," + Convert.ToBase64String(resultBytes), outputPath, fileName = Path.GetFileName(outputPath), mime = "image/png", engine };
        }
        finally { if (File.Exists(inputPath)) File.Delete(inputPath); if (File.Exists(responsePath)) File.Delete(responsePath); }
    }

    private string ResolveWorkerDll()
    {
        var candidates = new[] {
            Path.Combine(AppContext.BaseDirectory, "workers", "background-removal", "CanvasFlow.BackgroundRemovalWorker.dll"),
            Path.Combine(_appRoot, "background-removal-worker", "bin", "Debug", "net10.0", "win-x64", "CanvasFlow.BackgroundRemovalWorker.dll"),
            Path.Combine(_appRoot, "background-removal-worker", "bin", "Debug", "net10.0", "CanvasFlow.BackgroundRemovalWorker.dll")
        };
        return candidates.FirstOrDefault(File.Exists) ?? throw new FileNotFoundException("缺少智能抠图 Worker，请重新生成或安装完整版本");
    }

    private static string ResolveDotnetHost()
    {
        var bundled = Path.Combine(AppContext.BaseDirectory, "workers", "background-removal", "runtime", "dotnet.exe");
        if (File.Exists(bundled)) return bundled;
        var system = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "dotnet", "dotnet.exe");
        if (File.Exists(system)) return system;
        throw new FileNotFoundException("智能抠图插件缺少专用 .NET Runtime，请重新安装插件");
    }

    internal static async Task<int> RunWorkerAsync(string[] args)
    {
        var offset = args.Length > 0 && args[0] == "--background-removal-worker" ? 1 : 0;
        if (args.Length < offset + 5) return 2;
        var appRoot = args[offset]; var inputPath = args[offset + 1]; var responsePath = args[offset + 2]; var outputRoot = args[offset + 3]; var fileName = args[offset + 4];
        try
        {
            using var plugin = new BackgroundRemovalPlugin(appRoot, (message, _) => Console.Error.WriteLine(message));
            var bytes = await File.ReadAllBytesAsync(inputPath);
            var result = await plugin.RemoveBackgroundInProcessAsync("data:image/png;base64," + Convert.ToBase64String(bytes), fileName, outputRoot, CancellationToken.None);
            await File.WriteAllTextAsync(responsePath, JsonSerializer.Serialize(result));
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }

    private async Task<object> RemoveBackgroundInProcessAsync(string dataUrl, string fileName, string outputRoot, CancellationToken cancellationToken)
    {
        if (!await IsInstalledAsync()) throw new InvalidOperationException("智能抠图插件尚未安装或模型校验失败");
        await _inferenceGate.WaitAsync(cancellationToken);
        try
        {
            var comma = dataUrl.IndexOf(',');
            var bytes = Convert.FromBase64String(comma >= 0 ? dataUrl[(comma + 1)..] : dataUrl);
            if (bytes.Length == 0 || bytes.Length > 64 * 1024 * 1024) throw new InvalidDataException("输入图片为空或超过64MB限制");
            using var original = SixLabors.ImageSharp.Image.Load<Rgba32>(bytes);
            using var resized = original.Clone(context => context.Resize(new ResizeOptions { Size = new SixLabors.ImageSharp.Size(ModelSize, ModelSize), Mode = ResizeMode.Stretch, Sampler = KnownResamplers.Bicubic }));
            var tensor = new DenseTensor<float>(new[] { 1, 3, ModelSize, ModelSize });
            var mean = new[] { 0.485f, 0.456f, 0.406f };
            var std = new[] { 0.229f, 0.224f, 0.225f };
            resized.ProcessPixelRows(accessor =>
            {
                for (var y = 0; y < ModelSize; y++)
                {
                    var row = accessor.GetRowSpan(y);
                    for (var x = 0; x < ModelSize; x++)
                    {
                        var pixel = row[x];
                        tensor[0, 0, y, x] = (pixel.R / 255f - mean[0]) / std[0];
                        tensor[0, 1, y, x] = (pixel.G / 255f - mean[1]) / std[1];
                        tensor[0, 2, y, x] = (pixel.B / 255f - mean[2]) / std[2];
                    }
                }
            });
            var session = GetSession();
            var inputName = session.InputMetadata.Keys.Single();
            using var results = session.Run(new[] { NamedOnnxValue.CreateFromTensor(inputName, tensor) });
            var output = results.First().AsTensor<float>();
            var values = new float[ModelSize * ModelSize];
            var min = float.PositiveInfinity;
            var max = float.NegativeInfinity;
            for (var y = 0; y < ModelSize; y++) for (var x = 0; x < ModelSize; x++)
            {
                var raw = output.Rank == 4 ? output[0, 0, y, x] : output[0, y, x];
                var value = 1f / (1f + MathF.Exp(-raw));
                values[y * ModelSize + x] = value;
                min = Math.Min(min, value); max = Math.Max(max, value);
            }
            var range = Math.Max(1e-6f, max - min);
            using var mask = new SixLabors.ImageSharp.Image<L8>(ModelSize, ModelSize);
            mask.ProcessPixelRows(accessor =>
            {
                for (var y = 0; y < ModelSize; y++)
                {
                    var row = accessor.GetRowSpan(y);
                    for (var x = 0; x < ModelSize; x++) row[x] = new L8((byte)Math.Clamp(MathF.Round((values[y * ModelSize + x] - min) / range * 255f), 0, 255));
                }
            });
            mask.Mutate(context => context.Resize(original.Width, original.Height, KnownResamplers.Lanczos3));
            original.ProcessPixelRows(mask, (imageAccessor, maskAccessor) =>
            {
                for (var y = 0; y < original.Height; y++)
                {
                    var imageRow = imageAccessor.GetRowSpan(y); var maskRow = maskAccessor.GetRowSpan(y);
                    for (var x = 0; x < original.Width; x++) imageRow[x].A = maskRow[x].PackedValue;
                }
            });
            var safeBase = string.Concat(Path.GetFileNameWithoutExtension(fileName).Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
            if (string.IsNullOrWhiteSpace(safeBase)) safeBase = "image";
            var outputDirectory = Path.Combine(Path.GetFullPath(outputRoot), "background_removed");
            Directory.CreateDirectory(outputDirectory);
            var outputPath = Path.Combine(outputDirectory, $"{safeBase}-transparent-{DateTime.Now:yyyyMMdd-HHmmss}.png");
            await original.SaveAsync(outputPath, new PngEncoder { ColorType = PngColorType.RgbWithAlpha }, cancellationToken);
            var resultBytes = await File.ReadAllBytesAsync(outputPath, cancellationToken);
            _log($"[智能抠图插件] 处理完成：{outputPath}；内存={Process.GetCurrentProcess().WorkingSet64 / 1024 / 1024}MB", false);
            return new { dataUrl = "data:image/png;base64," + Convert.ToBase64String(resultBytes), outputPath, fileName = Path.GetFileName(outputPath), mime = "image/png", engine = _executionProvider };
        }
        finally { _inferenceGate.Release(); }
    }

    private InferenceSession GetSession()
    {
        lock (_sessionLock)
        {
            if (_session is not null) return _session;
            try
            {
                _session = CreatePreferredSession();
                return _session;
            }
            catch (Exception error)
            {
                _log($"[智能抠图插件] ONNX Runtime 初始化失败：{error}", true);
                throw new InvalidOperationException($"ONNX Runtime 初始化失败。原生库路径：{Path.Combine(AppContext.BaseDirectory, "onnxruntime.dll")}。详细信息：{InnermostMessage(error)}", error);
            }
        }
    }

    private InferenceSession CreatePreferredSession()
    {
        try
        {
            if (Environment.GetEnvironmentVariable("CANVASFLOW_DISABLE_DIRECTML") == "1")
                throw new InvalidOperationException("DirectML disabled for fallback diagnostics");
            using var options = new SessionOptions
            {
                GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL,
                ExecutionMode = ExecutionMode.ORT_SEQUENTIAL,
                EnableMemoryPattern = false
            };
            options.AppendExecutionProvider_DML(0);
            var session = new InferenceSession(_modelPath, options);
            _executionProvider = "DirectML GPU";
            _log("[智能抠图插件] DirectML 显卡加速初始化成功", false);
            return session;
        }
        catch (Exception directMlError)
        {
            _log($"[智能抠图插件] DirectML 初始化失败，自动回退 CPU：{InnermostMessage(directMlError)}", false);
            var session = new InferenceSession(_modelPath, new SessionOptions
            {
                GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL,
                ExecutionMode = ExecutionMode.ORT_SEQUENTIAL
            });
            _executionProvider = "CPU（DirectML 回退）";
            return session;
        }
    }

    private void EnsureNativeRuntimeLoaded()
    {
        if (_nativeRuntimeHandle != IntPtr.Zero) return;
        var nativePath = new[] {
            Path.Combine(AppContext.BaseDirectory, "onnxruntime.dll"),
            Path.Combine(AppContext.BaseDirectory, "runtimes", "win-x64", "native", "onnxruntime.dll")
        }.FirstOrDefault(File.Exists) ?? Path.Combine(AppContext.BaseDirectory, "onnxruntime.dll");
        if (!File.Exists(nativePath)) throw new FileNotFoundException("桌面发布目录缺少 onnxruntime.dll，请重新生成或安装完整版本", nativePath);
        try { _nativeRuntimeHandle = NativeLibrary.Load(nativePath); }
        catch (Exception error)
        {
            _log($"[智能抠图插件] 无法加载原生运行库：{nativePath}。{error}", true);
            throw new InvalidOperationException($"无法加载 ONNX 原生运行库。可能原因：VC++ 运行库缺失、文件被安全软件隔离或程序架构不匹配。建议重新安装完整版本并检查安全软件隔离区。详细信息：{InnermostMessage(error)}", error);
        }
    }

    private static string InnermostMessage(Exception error)
    {
        while (error.InnerException is not null) error = error.InnerException;
        return error.Message;
    }

    private async Task<bool> IsInstalledAsync() => File.Exists(_modelPath) && new FileInfo(_modelPath).Length == ExpectedBytes && await Md5Async(_modelPath) == ExpectedMd5;
    private static async Task<string> Md5Async(string path)
    {
        await using var stream = File.OpenRead(path);
        return Convert.ToHexString(await MD5.HashDataAsync(stream)).ToLowerInvariant();
    }
    public void Dispose() { lock (_sessionLock) { _session?.Dispose(); _session = null; if (_nativeRuntimeHandle != IntPtr.Zero) { NativeLibrary.Free(_nativeRuntimeHandle); _nativeRuntimeHandle = IntPtr.Zero; } } _inferenceGate.Dispose(); }
}
