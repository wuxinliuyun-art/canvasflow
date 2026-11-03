using System.IO;
using System.Text.RegularExpressions;

namespace CanvasFlow.Desktop;

// Exports are user documents. Reserve the destination atomically, never overwrite.
internal static class ExportFileStore
{
    internal static string Write(string requestedPath, byte[] bytes)
    {
        var directory = Path.GetDirectoryName(requestedPath)!;
        Directory.CreateDirectory(directory);
        var stem = Path.GetFileNameWithoutExtension(requestedPath);
        var extension = Path.GetExtension(requestedPath);
        var sequence = extension.Equals(".svg", StringComparison.OrdinalIgnoreCase)
            ? Regex.Match(stem, @"^(\d{6}-\d{4})-([1-9]\d{0,8})$")
            : Match.Empty;
        for (var index = 0; ; index++)
        {
            var candidate = index == 0 ? requestedPath : Path.Combine(directory, sequence.Success
                ? $"{sequence.Groups[1].Value}-{int.Parse(sequence.Groups[2].Value) + index}{extension}"
                : $"{stem} ({index}){extension}");
            FileStream stream;
            try { stream = new FileStream(candidate, FileMode.CreateNew, FileAccess.Write, FileShare.None); }
            catch (IOException) when (File.Exists(candidate)) { continue; }
            using (stream) stream.Write(bytes);
            return candidate;
        }
    }
}
