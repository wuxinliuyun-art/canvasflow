using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;

namespace CanvasFlow.Desktop;

internal sealed class ImageUpscalePlugin
{
    private const string PackageUrl = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip";
    private const string ExpectedExeSha256 = "07e49f7cbb4ede01ae4dd4c399d3a7e5846e3d2085c3128eff881e55cb7b1a0c";
    private readonly string _pluginRoot;
    private readonly string _workRoot;
    private readonly Action<string, bool> _log;

    public ImageUpscalePlugin(string appRoot, Action<string, bool> log)
    {
        _pluginRoot = Path.Combine(appRoot, "data", "plugins", "image-upscale");
        _workRoot = Path.Combine(appRoot, "data", "plugin-work", "image-upscale");
        _log = log;
    }

    public async Task<object> StatusAsync()
    {
        var installed = await IsInstalledAsync();
        return new { installed, version = installed ? "20220424" : "", sizeMb = 62.8, requiresVulkan = true };
    }

    public async Task<object> InstallAsync(CancellationToken cancellationToken)
    {
        if (await IsInstalledAsync())
            return new { installed = true, version = "20220424" };
        Directory.CreateDirectory(Path.GetDirectoryName(_pluginRoot)!);
        var archive = _pluginRoot + ".download";
        var staging = _pluginRoot + ".installing";
        if (File.Exists(archive)) File.Delete(archive);
        if (Directory.Exists(staging)) Directory.Delete(staging, true);
        _log("[图片放大插件] 开始下载官方 Windows 便携包", false);
        try
        {
            using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = true }) { Timeout = TimeSpan.FromMinutes(20) };
            client.DefaultRequestHeaders.UserAgent.ParseAdd("CanvasFlow/2.6.0");
            using var response = await client.GetAsync(PackageUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength is > 100_000_000) throw new InvalidDataException("插件安装包超过100MB安全限制");
            await using (var source = await response.Content.ReadAsStreamAsync(cancellationToken))
            await using (var target = new FileStream(archive, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1024 * 1024, true))
                await source.CopyToAsync(target, cancellationToken);
            Directory.CreateDirectory(staging);
            using (var zip = ZipFile.OpenRead(archive))
            {
                foreach (var entry in zip.Entries)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    if (string.IsNullOrEmpty(entry.Name)) continue;
                    var relative = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                    var destination = Path.GetFullPath(Path.Combine(staging, relative));
                    var prefix = Path.GetFullPath(staging).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                    if (!destination.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("插件包包含不安全路径");
                    Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
                    entry.ExtractToFile(destination, true);
                }
            }
            var downloadedExe = Directory.EnumerateFiles(staging, "realesrgan-ncnn-vulkan.exe", SearchOption.AllDirectories).SingleOrDefault()
                ?? throw new FileNotFoundException("官方插件包中没有找到运行程序");
            if (await Sha256Async(downloadedExe) != ExpectedExeSha256) throw new InvalidDataException("插件运行程序 SHA-256 校验失败");
            var sourceRoot = Path.GetDirectoryName(downloadedExe)!;
            if (Directory.Exists(_pluginRoot)) Directory.Delete(_pluginRoot, true);
            Directory.Move(sourceRoot, _pluginRoot);
            _log("[图片放大插件] 安装并校验完成", false);
            return new { installed = true, version = "20220424" };
        }
        finally
        {
            if (File.Exists(archive)) File.Delete(archive);
            if (Directory.Exists(staging)) Directory.Delete(staging, true);
        }
    }

    public object Uninstall()
    {
        if (Directory.Exists(_pluginRoot)) Directory.Delete(_pluginRoot, true);
        _log("[图片放大插件] 已卸载；用户生成图片保持不变", false);
        return new { installed = false };
    }

    public async Task<object> UpscaleAsync(string dataUrl, string fileName, string outputRoot, string model, int scale, CancellationToken cancellationToken)
    {
        var executable = ExecutablePath();
        if (!File.Exists(executable) || await Sha256Async(executable) != ExpectedExeSha256) throw new InvalidOperationException("图片放大插件尚未安装或校验失败");
        model = model is "realesrgan-x4plus-anime" or "realesr-animevideov3" ? model : "realesrgan-x4plus";
        scale = Math.Clamp(scale, 2, 4);
        var comma = dataUrl.IndexOf(',');
        var bytes = Convert.FromBase64String(comma >= 0 ? dataUrl[(comma + 1)..] : dataUrl);
        if (bytes.Length == 0 || bytes.Length > 64 * 1024 * 1024) throw new InvalidDataException("输入图片为空或超过64MB限制");
        Directory.CreateDirectory(_workRoot);
        var workId = Guid.NewGuid().ToString("N");
        var inputPath = Path.Combine(_workRoot, workId + ".png");
        var safeBaseName = string.Concat(Path.GetFileNameWithoutExtension(fileName).Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c));
        if (string.IsNullOrWhiteSpace(safeBaseName)) safeBaseName = "image";
        var outputDirectory = Path.Combine(Path.GetFullPath(outputRoot), "upscaled");
        Directory.CreateDirectory(outputDirectory);
        var outputPath = Path.Combine(outputDirectory, $"{safeBaseName}-x{scale}-{DateTime.Now:yyyyMMdd-HHmmss}.png");
        await File.WriteAllBytesAsync(inputPath, bytes, cancellationToken);
        try
        {
            var start = new ProcessStartInfo { FileName = executable, WorkingDirectory = _pluginRoot, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            foreach (var argument in new[] { "-i", inputPath, "-o", outputPath, "-n", model, "-s", scale.ToString(), "-f", "png" }) start.ArgumentList.Add(argument);
            using var process = Process.Start(start) ?? throw new InvalidOperationException("无法启动图片放大插件");
            var stdout = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderr = process.StandardError.ReadToEndAsync(cancellationToken);
            await process.WaitForExitAsync(cancellationToken);
            var details = (await stderr) + (await stdout);
            if (process.ExitCode != 0 || !File.Exists(outputPath)) throw new InvalidOperationException($"图片放大失败（退出码 {process.ExitCode}）：{details.Trim()}");
            var result = await File.ReadAllBytesAsync(outputPath, cancellationToken);
            _log($"[图片放大插件] 处理完成：{outputPath}", false);
            return new { dataUrl = "data:image/png;base64," + Convert.ToBase64String(result), outputPath, fileName = Path.GetFileName(outputPath), mime = "image/png" };
        }
        finally { if (File.Exists(inputPath)) File.Delete(inputPath); }
    }

    private string ExecutablePath() => Path.Combine(_pluginRoot, "realesrgan-ncnn-vulkan.exe");
    private async Task<bool> IsInstalledAsync()
    {
        var executable = ExecutablePath();
        return File.Exists(executable) && await Sha256Async(executable) == ExpectedExeSha256;
    }
    private static async Task<string> Sha256Async(string path)
    {
        await using var stream = File.OpenRead(path);
        return Convert.ToHexString(await SHA256.HashDataAsync(stream)).ToLowerInvariant();
    }
}
