using System.Net.Http;
using System.Security.Authentication;
using CanvasFlow.Desktop;

static void Check(bool value, string name)
{
    if (!value) throw new Exception(name);
    Console.WriteLine($"PASS {name}");
}

var handshake = new HttpRequestException(HttpRequestError.SecureConnectionError, "TLS", new AuthenticationException("auth", new IOException("reset")));
Check(AgtokenTransport.CanRetry(handshake), "TLS transport failure can retry");
Check(!AgtokenTransport.CanRetry(new HttpRequestException(HttpRequestError.SecureConnectionError, "TLS", new AuthenticationException("certificate"))), "certificate failure never retries");
Check(!AgtokenTransport.CanRetry(new HttpRequestException(HttpRequestError.ResponseEnded, "response lost", new IOException("reset"))), "response loss never retries");
Check(!AgtokenTransport.CanRetry(new TaskCanceledException()), "timeout never retries");
Check(!AgtokenTransport.CanRetry(new HttpRequestException("SSL connection could not be established")), "message matching cannot authorize retry");
Check(AgtokenTransport.FailureMessage(handshake).Contains("安全连接建立失败"), "TLS diagnostic");
Check(AgtokenTransport.FailureMessage(new HttpRequestException(HttpRequestError.NameResolutionError, "dns")).Contains("域名解析失败"), "DNS diagnostic");
Check(AgtokenTransport.FailureMessage(new TaskCanceledException()).Contains("避免重复扣费"), "unknown outcome warning");
