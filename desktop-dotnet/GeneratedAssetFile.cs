using System.Buffers.Binary;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace CanvasFlow.Desktop;

internal static class GeneratedAssetFile
{
    // Hash identifies the source bytes, before adding this metadata (avoids a self-hash).
    internal static byte[] WithSourceHash(byte[] bytes, string hash)
    {
        byte[] signature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (bytes.Length < 20 || !bytes.AsSpan(0, 8).SequenceEqual(signature)) return bytes;
        var offset = 8;
        while (offset <= bytes.Length - 12)
        {
            var length = BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset, 4));
            if (length > bytes.Length - offset - 12) return bytes;
            if (bytes.AsSpan(offset + 4, 4).SequenceEqual("IEND"u8))
            {
                var payload = Encoding.UTF8.GetBytes("CanvasFlow.SourceSHA256\0\0\0\0\0" + hash);
                var chunk = new byte[payload.Length + 12];
                BinaryPrimitives.WriteUInt32BigEndian(chunk, (uint)payload.Length);
                "iTXt"u8.CopyTo(chunk.AsSpan(4));
                payload.CopyTo(chunk, 8);
                uint crc = 0xffffffff;
                foreach (var value in chunk.AsSpan(4, payload.Length + 4))
                {
                    crc ^= value;
                    for (var bit = 0; bit < 8; bit++) crc = (crc & 1) != 0 ? 0xedb88320 ^ (crc >> 1) : crc >> 1;
                }
                BinaryPrimitives.WriteUInt32BigEndian(chunk.AsSpan(chunk.Length - 4), ~crc);
                var result = new byte[bytes.Length + chunk.Length];
                bytes.AsSpan(0, offset).CopyTo(result);
                chunk.CopyTo(result, offset);
                bytes.AsSpan(offset).CopyTo(result.AsSpan(offset + chunk.Length));
                return result;
            }
            offset += (int)length + 12;
        }
        return bytes;
    }

    internal static string Write(string directory, string projectName, string extension, byte[] bytes)
    {
        Directory.CreateDirectory(directory);
        var project = Regex.Replace(projectName, "[<>:\"/\\\\|?*\\x00-\\x1f]", "_").Trim().TrimEnd('.');
        if (project.Length > 36) project = project[..36];
        if (string.IsNullOrWhiteSpace(project)) project = "项目";
        var prefix = DateTime.Now.ToString("yyMMdd", CultureInfo.InvariantCulture) + "-" + project + "-";
        for (var sequence = 1; ; sequence++)
        {
            var target = Path.Combine(directory, prefix + sequence.ToString("D3", CultureInfo.InvariantCulture) + extension);
            FileStream stream;
            try { stream = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None); }
            catch (IOException) when (File.Exists(target)) { continue; }
            using (stream) stream.Write(bytes);
            return target;
        }
    }
}
