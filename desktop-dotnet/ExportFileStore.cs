using System.IO;

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
        for (var index = 0; ; index++)
        {
            var candidate = index == 0 ? requestedPath : Path.Combine(directory, $"{stem} ({index}){extension}");
            FileStream stream;
            try { stream = new FileStream(candidate, FileMode.CreateNew, FileAccess.Write, FileShare.None); }
            catch (IOException) when (File.Exists(candidate)) { continue; }
            using (stream) stream.Write(bytes);
            return candidate;
        }
    }
}
