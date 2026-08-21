(() => {
  const desktop = window.canvasflowDesktop || null;
  const desktopApiPaths = new Set([
    "/api/runtime-paths", "/api/app-state", "/api/custom-library", "/api/auto-backup",
    "/api/save-json", "/api/save-project", "/api/save-images", "/api/custom-material", "/api/save-export-files",
    "/api/generate", "/api/models", "/api/balance", "/api/download-image", "/api/update/check",
  ]);

  async function apiFetch(input, options = {}) {
    const rawUrl = typeof input === "string" ? input : input?.url || String(input || "");
    const url = new URL(rawUrl, location.href);
    if (desktop?.apiRequest && (desktopApiPaths.has(url.pathname) || url.pathname.startsWith("/api/task/"))) {
      const result = await desktop.apiRequest(url.pathname + url.search, {
        method: options.method || "GET",
        body: typeof options.body === "string" ? options.body : "",
      });
      return new Response(result.body || "", {
        status: Number(result.status) || 500,
        headers: { "Content-Type": result.contentType || "application/json;charset=utf-8" },
      });
    }
    return fetch(input, options);
  }

  window.CanvasFlowRuntime = Object.freeze({ desktop, apiFetch });
})();
