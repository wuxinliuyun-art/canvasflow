using System.IO;
using System.Net.Http;
using System.Net.Sockets;

namespace CanvasFlow.Desktop;

internal static class AgtokenTransport
{
    // Only a typed TLS handshake failure with a transport cause is safe to replay.
    // Certificate/protocol failures, response loss and timeouts must not replay paid POSTs.
    internal static bool CanRetry(Exception error) =>
        error is HttpRequestException { HttpRequestError: HttpRequestError.SecureConnectionError }
        && HasTransportCause(error.InnerException);

    private static bool HasTransportCause(Exception? error)
    {
        for (; error is not null; error = error.InnerException)
            if (error is IOException or SocketException) return true;
        return false;
    }

    internal static string FailureMessage(Exception error) => error switch
    {
        HttpRequestException { HttpRequestError: HttpRequestError.SecureConnectionError } =>
            "agtoken HTTPS 安全连接建立失败：请检查系统代理、VPN、安全软件的 HTTPS 检查及系统时间，或换手机热点对比。",
        HttpRequestException { HttpRequestError: HttpRequestError.NameResolutionError } =>
            "agtoken 域名解析失败：请检查网络和 DNS，或换手机热点对比。",
        _ => "agtoken 连接中断或超时：任务结果未知，请先到站点任务记录确认是否已生成，再决定重试，避免重复扣费。"
    };
}
