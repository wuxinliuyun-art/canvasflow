using System.IO;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace CanvasFlow.Desktop;

internal static class BrowserImageTransfer
{
    private static readonly object Gate = new();
    private static readonly Dictionary<string, JsonObject> Items = new();
    private static string receiver = "";
    private static long seenAt;

    public static object Handle(string body)
    {
        var payload = JsonNode.Parse(body)!.AsObject();
        string Text(string key) => payload[key]?.GetValue<string>() ?? "";
        lock (Gate)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            foreach (var id in Items.Where(pair => now - pair.Value["createdAt"]!.GetValue<long>() > 600000).Select(pair => pair.Key).ToArray()) Items.Remove(id);
            var ready = receiver.Length > 0 && now - seenAt < 120000;
            switch (Text("action"))
            {
                case "probe": return new { ready };
                case "poll":
                    var incoming = Text("receiver");
                    if (incoming.Length == 0) throw new InvalidDataException("缺少接收窗口");
                    if (!ready || payload["focused"]?.GetValue<bool>() == true) receiver = incoming;
                    if (receiver == incoming) seenAt = now;
                    return new { items = receiver == incoming ? Items.Values.Where(item => item["receiver"]!.GetValue<string>() == receiver).Select(item => item.DeepClone()).ToArray() : Array.Empty<JsonNode>() };
                case "ack":
                    if (Items.TryGetValue(Text("id"), out var item) && item["receiver"]!.GetValue<string>() == Text("receiver")) Items.Remove(Text("id"));
                    return new { ok = true };
                case "send":
                    if (!ready) throw new InvalidDataException("请先打开 CanvasFlow 画布");
                    var image = Text("image");
                    if (image.Length > 14000000 || !Regex.IsMatch(image, @"^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$")) throw new InvalidDataException("图片格式不支持或超过 10MB");
                    if (Items.Count >= 8) throw new InvalidDataException("待接收图片过多，请回画布后重试");
                    var id = Guid.NewGuid().ToString();
                    Items[id] = new JsonObject { ["id"] = id, ["image"] = image, ["receiver"] = receiver, ["createdAt"] = now };
                    return new { ok = true, id };
                default: throw new InvalidDataException("未知图片传送操作");
            }
        }
    }
}
