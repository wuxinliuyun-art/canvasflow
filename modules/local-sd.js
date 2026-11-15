(() => {
  const apiFetch = (...args) => window.CanvasFlowRuntime.apiFetch(...args);
  // 类型标签仅作设置列表的信息展示（后端 detectWorkflowType 自动识别），不再参与任何功能门控
  const TYPE_LABELS = { txt2img: "文生图", img2img: "图生图", upscale: "放大", matting: "抠图", inpaint: "局部重绘", "video-i2v": "图生视频", "video-t2v": "文生视频" };
  const DURATIONS = [2, 3, 5, 8, 10, 15];
  // 尺寸传导：与 AI 绘图节点一致的 分辨率(长边)+比例 档位，经 mapping.params 写入工作流的宽高
  const SD_RESOLUTIONS = ["0.5K", "1K", "2K"];
  const SD_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"];
  // cache.workflows 保留 workflow 内容本身（全参数面板按它构建）；paramInfo 按 工作流id:updatedAt:服务地址
  // 缓存 object_info 子集（combo 选项/数值范围/多行标记），会话态
  const cache = { config: { serverUrl: "http://127.0.0.1:8188", installPath: "", launchPath: "" }, workflows: [], launcherCandidates: [], loaded: false, replaceId: "", userList: [], userListOpen: false, userListLoading: false, userListError: "", paramInfo: {} };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const request = async (url, options = {}) => {
    const response = await apiFetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  };

  function setStatus(text, kind = "") {
    const element = $("comfyStatus");
    if (!element) return;
    element.textContent = text;
    element.className = `comfy-status ${kind ? `is-${kind}` : ""}`;
    const badge = $("localSdExtensionStatus");
    if (badge) {
      const connected = kind === "success" && text === "连接成功";
      badge.dataset.state = kind === "busy" ? "checking" : connected ? "ready" : kind === "error" ? "unavailable" : "idle";
      badge.textContent = kind === "busy" ? "检查中" : connected ? "服务可用" : kind === "error" ? "不可用" : "未连接";
      badge.title = text;
    }
  }

  async function load() {
    try {
      const data = await request("/api/comfyui/config");
      cache.config = data.config || cache.config;
      cache.workflows = Array.isArray(data.workflows) ? data.workflows : [];
      cache.loaded = true;
      syncSettings();
      if (typeof window.renderNodes === "function") window.renderNodes();
    } catch (error) { setStatus(`配置读取失败：${error.message}`, "error"); }
  }

  async function saveConfig() {
    cache.config.serverUrl = $("comfyServerUrl")?.value.trim() || "http://127.0.0.1:8188";
    cache.config.installPath = $("comfyInstallPath")?.value.trim() || "";
    cache.config.launchPath = $("comfyLaunchPath")?.value || "";
    const result = await request("/api/comfyui/config", { method: "POST", body: JSON.stringify(cache.config) });
    cache.config = result.config || cache.config;
  }

  function launcherOptions() {
    const select = $("comfyLaunchPath");
    if (!select) return;
    const entries = [...new Set([cache.config.launchPath, ...cache.launcherCandidates].filter(Boolean))];
    select.innerHTML = entries.length ? entries.map(path => `<option value="${esc(path)}" ${path === cache.config.launchPath ? "selected" : ""}>${esc(path)}</option>`).join("") : `<option value="">未找到启动入口</option>`;
  }

  function workflowList() {
    const holder = $("comfyWorkflowList");
    if (!holder) return;
    holder.innerHTML = cache.workflows.length ? cache.workflows.map(item => `<div class="comfy-workflow-item" draggable="true" data-workflow-id="${esc(item.id)}"><span class="comfy-workflow-drag" title="拖拽排序" aria-hidden="true">⋮⋮</span><span class="comfy-workflow-info"><strong>${esc(item.name)}</strong><small>${esc(TYPE_LABELS[item.type] || item.type)}</small></span><button type="button" data-comfy-action="rename" aria-label="重命名工作流">重命名</button><button type="button" data-comfy-action="replace" aria-label="替换工作流 JSON">替换</button><button type="button" data-comfy-action="delete" class="danger" aria-label="删除工作流">删除</button></div>`).join("") : `<div class="comfy-workflow-empty">还没有工作流；点「导入 ComfyUI JSON 文件…」或「从 ComfyUI 获取」添加</div>`;
  }

  // 「从 ComfyUI 获取」列表条目（设置面板与节点弹层共用）：仅 API 格式可勾选，
  // 不可勾选的条目带 title 说明原因——此前只有徽标没有解释，用户当成"点不动"（2026-11-14 反馈）
  function userWorkflowItemHtml(item) {
    const imported = cache.workflows.some(entry => entry.name === item.name);
    const unavailable = !item.importable || imported;
    const badge = item.error ? `<small class="comfy-user-badge is-error">读取失败</small>` : item.importable ? `<small class="comfy-user-badge">API格式</small>` : `<small class="comfy-user-badge">UI格式</small>`;
    const importedBadge = imported ? `<small class="comfy-user-badge">已导入</small>` : "";
    const sub = item.path.split("/").length > 2 ? `<small class="comfy-user-sub">${esc(item.path)}</small>` : "";
    const reason = item.error ? `读取失败：${item.error}` : imported ? "已导入过同名工作流" : item.importable ? "" : "UI 格式暂不支持导入：请在 ComfyUI 中用「导出（API）」另存后点「刷新」";
    const title = reason ? ` title="${esc(reason)}"` : "";
    return `<label class="comfy-user-item${unavailable ? " is-unavailable" : ""}"${title} data-user-path="${esc(item.path)}"><input type="checkbox" class="comfy-user-check" data-user-path="${esc(item.path)}" ${unavailable ? "disabled" : ""}><span class="comfy-user-info"><span class="comfy-user-name" title="${esc(item.name)}">${esc(item.name)}${badge}${importedBadge}</span>${sub}</span></label>`;
  }

  // 列表存在不可勾选条目时，在搜索框下方给一行说明，避免"复选框点不动"的困惑
  function userWorkflowHintHtml() {
    const hasUnavailable = cache.userList.some(item => !item.importable || cache.workflows.some(entry => entry.name === item.name));
    return hasUnavailable ? `<div class="comfy-user-hint">仅「API格式」可勾选导入；UI 格式请在 ComfyUI 里用「导出（API）」另存后点「刷新」</div>` : "";
  }

  // 自动列出本机 ComfyUI 已保存的工作流（仅 API 格式可勾选导入；面板为会话态不落盘）
  function renderUserList() {
    const holder = $("comfyUserListPanel");
    if (!holder) return;
    holder.classList.toggle("hidden", !cache.userListOpen);
    if (!cache.userListOpen) return;
    const ready = !cache.userListLoading && !cache.userListError;
    let body;
    if (cache.userListLoading) body = `<div class="comfy-user-empty">正在读取 ComfyUI 已保存的工作流…</div>`;
    else if (cache.userListError) body = `<div class="comfy-user-empty is-error">${esc(cache.userListError)}</div>`;
    else if (!cache.userList.length) body = `<div class="comfy-user-empty">ComfyUI 里还没有已保存的工作流；在 ComfyUI 保存后点「刷新」</div>`;
    else {
      body = `<div class="comfy-user-list">${cache.userList.map(userWorkflowItemHtml).join("")}</div>`;
    }
    holder.innerHTML = `<div class="comfy-user-head"><strong>ComfyUI 已保存的工作流</strong><span class="comfy-user-head-actions"><button type="button" data-comfy-user-action="refresh" aria-label="刷新 ComfyUI 工作流列表">刷新</button><button type="button" data-comfy-user-action="close" aria-label="关闭 ComfyUI 工作流列表">×</button></span></div>`
      + (ready && cache.userList.length ? `<input type="text" class="comfy-user-search" placeholder="搜索工作流名" aria-label="搜索工作流名">` : "")
      + (ready && cache.userList.length ? userWorkflowHintHtml() : "")
      + body
      + (ready && cache.userList.length ? `<div class="comfy-user-actions"><button type="button" class="primary" data-comfy-user-action="import-selected" disabled>导入所选(0)</button></div>` : "");
  }

  function updateUserImportCount() {
    const button = document.querySelector('#comfyUserListPanel [data-comfy-user-action="import-selected"]');
    if (!button) return;
    const count = document.querySelectorAll("#comfyUserListPanel .comfy-user-check:checked").length;
    button.textContent = `导入所选(${count})`;
    button.disabled = count === 0;
  }

  async function loadUserWorkflows() {
    cache.userListLoading = true; cache.userListError = "";
    try {
      const result = await request("/api/comfyui/workflows/user-list", { method: "POST", body: JSON.stringify({ serverUrl: cache.config.serverUrl }) });
      cache.userList = Array.isArray(result.items) ? result.items : [];
    } catch (error) {
      cache.userList = [];
      cache.userListError = /路由不存在|HTTP 404/.test(error.message) ? "本机服务尚未包含自动列出接口，请重启 CanvasFlow 服务或更新桌面版后再试" : error.message;
    } finally {
      cache.userListLoading = false;
    }
  }

  // root：勾选项所在容器（设置面板 #comfyUserListPanel 或节点上的选取弹层）；返回导入成功的工作流 id 供节点自动选中
  async function importSelectedUserWorkflows(root = document.getElementById("comfyUserListPanel")) {
    const checks = [...(root?.querySelectorAll(".comfy-user-check:checked") || [])];
    if (!checks.length) return toast("请先勾选要导入的工作流");
    const picked = checks.map(check => cache.userList.find(item => item.path === check.dataset.userPath && item.importable && item.workflow)).filter(Boolean);
    if (!picked.length) return toast("所选工作流没有可用内容（仅 API 格式可导入）");
    let imported = 0; const failures = []; const ids = [];
    for (const item of picked) {
      try {
        // 类型由后端按内容自动识别，与手动导入同一入口
        const result = await request("/api/comfyui/workflows/import", { method: "POST", body: JSON.stringify({ name: item.name, workflow: item.workflow }) });
        imported += 1;
        if (result.workflow?.id) ids.push(result.workflow.id);
      } catch (error) { failures.push(`${item.name}：${error.message}`); }
    }
    if (imported) toast(`已从 ComfyUI 导入 ${imported} 个工作流${failures.length ? `，${failures.length} 个失败` : ""}`);
    else toast(`导入失败：${failures[0] || "未知原因"}`);
    await load();
    return { imported, failures, ids };
  }

  function syncSettings() {
    if ($("comfyServerUrl")) $("comfyServerUrl").value = cache.config.serverUrl || "http://127.0.0.1:8188";
    if ($("comfyInstallPath")) $("comfyInstallPath").value = cache.config.installPath || "";
    $("comfyDesktopFields")?.classList.toggle("hidden", !window.CanvasFlowRuntime.desktop?.chooseComfyFolder);
    $("comfyLaunchBtn")?.classList.toggle("hidden", !window.CanvasFlowRuntime.desktop?.launchComfy);
    launcherOptions(); workflowList(); renderUserList();
  }

  async function importFile(file, replaceId = "") {
    const workflow = JSON.parse(await file.text());
    let newId = "";
    if (replaceId) {
      await request("/api/comfyui/workflows/update", { method: "POST", body: JSON.stringify({ id: replaceId, workflow }) });
      toast("工作流已替换并重新校验");
    } else {
      // 类型由后端按内容自动识别，不再让用户手选
      const result = await request("/api/comfyui/workflows/import", { method: "POST", body: JSON.stringify({ name: file.name.replace(/\.json$/i, ""), workflow }) });
      newId = result.workflow?.id || "";
      toast(`已导入${TYPE_LABELS[result.workflow?.type] || result.workflow?.type || ""}工作流`);
    }
    await load();
    return newId;
  }

  function wireSettings() {
    $("comfyChooseFolder")?.addEventListener("click", async () => {
      try {
        const result = await window.CanvasFlowRuntime.desktop.chooseComfyFolder(cache.config.installPath || "");
        if (result.cancelled) return;
        cache.config.installPath = result.path || "";
        cache.launcherCandidates = result.candidates || [];
        cache.config.launchPath = result.launchPath || cache.launcherCandidates[0] || "";
        syncSettings(); await saveConfig();
        setStatus(cache.config.launchPath ? `已找到启动入口：${cache.config.launchPath}` : "未找到常见启动入口，请检查所选目录", cache.config.launchPath ? "success" : "error");
      } catch (error) { setStatus(`选择失败：${error.message}`, "error"); }
    });
    $("comfyLaunchPath")?.addEventListener("change", () => saveConfig().catch(error => setStatus(error.message, "error")));
    $("comfyServerUrl")?.addEventListener("change", () => saveConfig().catch(error => setStatus(error.message, "error")));
    $("comfyLaunchBtn")?.addEventListener("click", async () => {
      try { await saveConfig(); await window.CanvasFlowRuntime.desktop.launchComfy(cache.config.launchPath); setStatus("已请求启动 ComfyUI，请等待启动完成后测试连接", "success"); }
      catch (error) { setStatus(`启动失败：${error.message}`, "error"); }
    });
    $("comfyTestBtn")?.addEventListener("click", async event => {
      // event.currentTarget 在事件派发结束后被浏览器置 null，async handler 里直接用会让按钮永久卡在 disabled
      const button = event.currentTarget;
      button.disabled = true; setStatus("正在连接…", "busy");
      try { await saveConfig(); await request("/api/comfyui/test", { method: "POST", body: JSON.stringify({ serverUrl: cache.config.serverUrl }) }); setStatus("连接成功", "success"); }
      catch (error) { setStatus(`连接失败：${error.message}`, "error"); }
      finally { button.disabled = false; }
    });
    $("comfyAddBtn")?.addEventListener("click", () => { cache.replaceId = ""; $("comfyWorkflowFile")?.click(); });
    $("comfyUserListBtn")?.addEventListener("click", async () => {
      if (cache.userListOpen) { cache.userListOpen = false; renderUserList(); return; }
      cache.userListOpen = true;
      if (!cache.userList.length) await loadUserWorkflows();
      renderUserList();
    });
    $("comfyUserListPanel")?.addEventListener("click", async event => {
      const button = event.target.closest("[data-comfy-user-action]"); if (!button) return;
      const action = button.dataset.comfyUserAction;
      if (action === "close") { cache.userListOpen = false; renderUserList(); }
      else if (action === "refresh") { await loadUserWorkflows(); renderUserList(); }
      else if (action === "import-selected") { button.disabled = true; try { await importSelectedUserWorkflows(); renderUserList(); } finally { updateUserImportCount(); } }
    });
    // 勾选变化与搜索过滤都只做纯 DOM 更新，不重渲染面板（防打断输入与勾选）
    $("comfyUserListPanel")?.addEventListener("change", event => {
      if (event.target.classList?.contains("comfy-user-check")) updateUserImportCount();
    });
    $("comfyUserListPanel")?.addEventListener("input", event => {
      if (!event.target.classList?.contains("comfy-user-search")) return;
      const query = event.target.value.trim().toLowerCase();
      for (const node of $("comfyUserListPanel").querySelectorAll(".comfy-user-item")) node.hidden = Boolean(query) && !node.textContent.toLowerCase().includes(query);
    });
    $("comfyWorkflowFile")?.addEventListener("change", async event => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      try { await importFile(file, cache.replaceId); } catch (error) { toast(`工作流导入失败：${error.message}`); }
      finally { cache.replaceId = ""; }
    });
    $("comfyWorkflowList")?.addEventListener("click", async event => {
      const button = event.target.closest("[data-comfy-action]"); const row = button?.closest("[data-workflow-id]"); if (!button || !row) return;
      const id = row.dataset.workflowId; const item = cache.workflows.find(entry => entry.id === id); if (!item) return;
      try {
        if (button.dataset.comfyAction === "rename") {
          const name = prompt("工作流名称", item.name); if (!name?.trim()) return;
          await request("/api/comfyui/workflows/update", { method: "POST", body: JSON.stringify({ id, name: name.trim() }) }); await load();
        } else if (button.dataset.comfyAction === "replace") { cache.replaceId = id; $("comfyWorkflowFile")?.click(); }
        else if (button.dataset.comfyAction === "delete") {
          const used = typeof state !== "undefined" && state.nodes?.some(node => node.type === "local-sd" && node._sdWorkflowId === id);
          const ok = await showCanvasDialog({ title: "删除 ComfyUI 工作流", message: used ? "当前画布有节点正在引用它。删除后节点会显示“工作流已删除”，不会自动改用其他工作流。" : `确定删除“${item.name}”吗？`, confirmText: "删除", cancelText: "取消" });
          if (!ok) return;
          await request("/api/comfyui/workflows/delete", { method: "POST", body: JSON.stringify({ id }) }); await load();
        }
      } catch (error) { toast(`操作失败：${error.message}`); }
    });
    let dragging = "";
    $("comfyWorkflowList")?.addEventListener("dragstart", event => { dragging = event.target.closest("[data-workflow-id]")?.dataset.workflowId || ""; });
    $("comfyWorkflowList")?.addEventListener("dragover", event => event.preventDefault());
    $("comfyWorkflowList")?.addEventListener("drop", async event => {
      event.preventDefault(); const target = event.target.closest("[data-workflow-id]")?.dataset.workflowId; if (!dragging || !target || dragging === target) return;
      const ids = cache.workflows.map(item => item.id); const from = ids.indexOf(dragging); const to = ids.indexOf(target); ids.splice(to, 0, ids.splice(from, 1)[0]);
      try { await request("/api/comfyui/workflows/reorder", { method: "POST", body: JSON.stringify({ ids }) }); await load(); } catch (error) { toast(`排序失败：${error.message}`); }
    });
  }

  function normalizeNode(node) {
    // 旧存档遗留的 _sdMode/_sdWorkflowByMode 字段惰性保留（不再读写），节点一律"先选工作流"
    node._sdWorkflowId = String(node._sdWorkflowId || "");
    node._sdNegative = String(node._sdNegative || "");
    node._sdSeed = Number.isFinite(Number(node._sdSeed)) ? Number(node._sdSeed) : Math.floor(Math.random() * 2147483647);
    node._sdDenoise = Math.max(0, Math.min(1, Number(node._sdDenoise) || .7));
    node._sdDuration = DURATIONS.includes(Number(node._sdDuration)) ? Number(node._sdDuration) : 5;
    node._sdResolution = SD_RESOLUTIONS.includes(node._sdResolution) ? node._sdResolution : "1K";
    node._sdRatio = SD_RATIOS.includes(node._sdRatio) ? node._sdRatio : "1:1";
    // 全参数面板状态（2026-11-14）：编辑值按 nodeId.field 存，随存档持久；展开/折叠是界面态
    if (!node._sdParamValues || typeof node._sdParamValues !== "object" || Array.isArray(node._sdParamValues)) node._sdParamValues = {};
    if (typeof node._sdParamsOpen !== "boolean") node._sdParamsOpen = false;
    if (!node._sdParamGroupsCollapsed || typeof node._sdParamGroupsCollapsed !== "object" || Array.isArray(node._sdParamGroupsCollapsed)) node._sdParamGroupsCollapsed = {};
    return node;
  }

  // ---------- 生成进度（2026-11-14 用户要求）----------
  // ComfyUI 不经 REST 回进度，按耗时估平滑刻度（与 ai-video 同思路）：视频模式预期更久，渐近逼近 95%，
  // 完成由 status 端点裁决。进度条复用 AI 绘图节点的 .ai-node-progress 组件，不新增样式。
  const SD_PROGRESS_EXPECTED_SECONDS = { video: 180, image: 45 };
  const sdProgressTimers = new Map();

  function sdEstimatedPercent(node) {
    const startedAt = Number(node?._sdStartedAt || 0);
    if (!startedAt) return 0;
    // 视频工作流（映射含时长字段）预期更久
    const isVideo = Boolean(cache.workflows.find(item => item.id === node?._sdWorkflowId)?.mapping?.durationNodeId);
    const expected = isVideo ? SD_PROGRESS_EXPECTED_SECONDS.video : SD_PROGRESS_EXPECTED_SECONDS.image;
    const elapsed = Math.max(0, (Date.now() - startedAt) / 1000);
    return Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / expected))));
  }

  function sdStatusLabel(node) {
    return node._sdTaskId ? `ComfyUI 执行中… ${sdEstimatedPercent(node)}%` : (node._sdStatus || "正在提交工作流…");
  }

  function sdProgressMarkup(node) {
    const submitting = !node._sdTaskId;
    const label = sdStatusLabel(node);
    const percent = sdEstimatedPercent(node);
    return `<div class="ai-node-progress ai-progress-${submitting ? "submitting" : "generating"}" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100"${submitting ? "" : ` aria-valuenow="${percent}"`} title="${esc(label)}"><div class="ai-node-progress-track"><span class="${submitting ? "indeterminate" : ""}" style="${submitting ? "" : `width:${percent}%`}"></span></div></div>`;
  }

  // 500ms 就地刷新条宽与文案（不整帧 render，遵守进度类局部更新纪律）；循环结束/取消时清理
  function stopSdProgressTimer(nodeId) {
    const timer = sdProgressTimers.get(nodeId);
    if (timer) { window.clearInterval(timer); sdProgressTimers.delete(nodeId); }
  }

  function startSdProgressTimer(nodeId) {
    stopSdProgressTimer(nodeId);
    sdProgressTimers.set(nodeId, window.setInterval(() => {
      const container = document.querySelector(`.node[data-id="${CSS.escape(nodeId)}"]`);
      if (!container) return;
      const node = findNode(nodeId) || (state.nodes || []).find(item => item.id === nodeId);
      if (!node || !node.generating || !node._sdTaskId) return;
      const percent = sdEstimatedPercent(node);
      const label = sdStatusLabel(node);
      const fill = container.querySelector(".ai-node-progress-track span");
      if (fill && !fill.classList.contains("indeterminate")) fill.style.width = `${percent}%`;
      const progress = container.querySelector(".ai-node-progress");
      if (progress) {
        progress.setAttribute("aria-valuenow", String(percent));
        progress.title = label;
        progress.setAttribute("aria-label", label);
      }
      const statusText = container.querySelector(".local-sd-status");
      if (statusText) statusText.textContent = label;
    }, 500));
  }

  // 先选工作流，输入控件按工作流映射自动生成（2026-11-14 用户要求，不再有功能模式）：
  // 映射有提示词节点 → 提示词框；有负面 → 负面框；有 LoadImage → 图片输入提示；有蒙版 →
  // 重绘区域按钮；有采样器 → Seed；有降噪 → 降噪；有时长 → 时长；有宽高参数 → 分辨率/比例。
  function selectedSdWorkflow(node) {
    return cache.workflows.find(item => item.id === node._sdWorkflowId) || null;
  }

  // ---------- 全参数面板（2026-11-14 用户要求"把 ComfyUI 节点参数在画布中显示，修改后再回传"）----------
  // 由 API 工作流直接生成分组参数表单：每个 ComfyUI 节点一组（组头=节点标题，可折叠），
  // 控件按 object_info 类型渲染（combo→真下拉、INT/FLOAT→数字、BOOLEAN→是/否、STRING→文本/多行）。
  // 编辑值存 node._sdParamValues（nodeId→field→值），生成时随请求回传、由服务端在 mapping 补丁后替换。
  // 图片入口字段不进面板（画布上游喂图，与 preparePrompt 的全入口喂图同语义）。
  // 注意：入口类正则与字段序是 comfyui-server.js 侧常量的前端副本（前端模块拿不到 node 侧导出）。
  const SD_IMAGE_ENTRY_CLASS_RE = /^(LoadImage|VHS_LoadImage|LoadImageFromPath|GetImageFromPS)$/i;
  const SD_IMAGE_ENTRY_FIELDS = ["image", "image_filename", "path"];

  // object_info 单字段规格 → 面板控件类型；无法识别的类型按"连线型输入"处理（不进面板）
  function sdInputSpec(classSpec, field) {
    const raw = classSpec?.input?.required?.[field] ?? classSpec?.input?.optional?.[field];
    if (!Array.isArray(raw) || !raw.length) return null;
    const type = raw[0];
    const config = raw[1] && typeof raw[1] === "object" && !Array.isArray(raw[1]) ? raw[1] : {};
    if (Array.isArray(type)) return { kind: "combo", options: type, config };
    if (type === "COMBO") return { kind: "combo", options: Array.isArray(config.options) ? config.options : null, config };
    if (type === "INT" || type === "FLOAT") return { kind: "number", config };
    if (type === "BOOLEAN") return { kind: "boolean", config };
    if (type === "STRING") return { kind: "string", config };
    return { kind: "socket" };
  }

  // 纯函数（可测试）：工作流 + object_info 子集 → 分组参数定义。
  // 排除三类：连线值（数组）、映射已驱动的字段（提示词/负面/Seed/降噪/时长/宽高）、图片入口字段。
  function sdParamGroupsFromWorkflow(workflowItem, info = null) {
    const api = workflowItem?.workflow;
    const map = workflowItem?.mapping || {};
    if (!api || typeof api !== "object" || Array.isArray(api)) return null;
    const excluded = new Set();
    const markMapped = (id, field) => { if (id && field) excluded.add(`${id}\u0000${field}`); };
    if (map.positiveNodeId) markMapped(map.positiveNodeId, map.positiveField || "text");
    if (map.negativeNodeId) markMapped(map.negativeNodeId, map.negativeField || "text");
    if (map.promptNodeId) markMapped(map.promptNodeId, map.promptField || "prompt");
    if (map.durationNodeId) markMapped(map.durationNodeId, map.durationField || "length");
    if (map.samplerNodeId) {
      if (map.seedField) markMapped(map.samplerNodeId, map.seedField);
      if (map.denoiseField) markMapped(map.samplerNodeId, map.denoiseField);
    }
    for (const entry of Array.isArray(map.params) ? map.params : []) {
      if (entry?.nodeId && (entry.param === "width" || entry.param === "height")) markMapped(entry.nodeId, entry.field || entry.param);
    }
    const groups = [];
    let count = 0;
    for (const [nodeId, node] of Object.entries(api)) {
      const classType = String(node?.class_type || "");
      const inputs = node?.inputs;
      if (!classType || !inputs || typeof inputs !== "object" || Array.isArray(inputs)) continue;
      if (SD_IMAGE_ENTRY_CLASS_RE.test(classType)) {
        for (const field of SD_IMAGE_ENTRY_FIELDS) if (typeof inputs[field] === "string") excluded.add(`${nodeId}\u0000${field}`);
      }
      const classSpec = info?.[classType] || null;
      const fields = [];
      for (const [field, value] of Object.entries(inputs)) {
        if (value === null || typeof value === "object") continue;
        if (excluded.has(`${nodeId}\u0000${field}`)) continue;
        const spec = classSpec ? sdInputSpec(classSpec, field) : null;
        if (spec?.kind === "socket") continue;
        let kind = spec?.kind || (typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string");
        let options = null;
        if (kind === "combo") {
          // combo 当前值不在选项里（object_info 与存档版本不一致等）时降级为文本输入，不硬塞
          options = Array.isArray(spec.options) && spec.options.length ? spec.options : null;
          if (!options || !options.some(option => String(option) === String(value))) { kind = "string"; options = null; }
        }
        fields.push({ field, value, kind, options, config: spec?.config || null });
      }
      if (!fields.length) continue;
      groups.push({ nodeId, title: String(node?._meta?.title || classType), classType, fields });
      count += fields.length;
    }
    return { groups, count };
  }

  function sdParamInfoKey(workflowItem) {
    return workflowItem ? `${workflowItem.id}:${workflowItem.updatedAt || 0}:${cache.config.serverUrl}` : "";
  }

  // object_info 子集按需拉取（面板首次展开时触发）；完成后整帧 render 呈现真下拉
  async function loadSdParamInfo(workflowItem) {
    const key = sdParamInfoKey(workflowItem);
    if (!key) return;
    const entry = cache.paramInfo[key] || (cache.paramInfo[key] = { loading: false, info: null, error: "" });
    if (entry.loading || entry.info || entry.error) return;
    const classes = [...new Set(Object.values(workflowItem.workflow || {}).map(node => String(node?.class_type || "")).filter(Boolean))];
    if (!classes.length) { entry.error = "工作流内容为空"; return; }
    entry.loading = true;
    try {
      const result = await request("/api/comfyui/object-info", { method: "POST", body: JSON.stringify({ serverUrl: cache.config.serverUrl, classes }) });
      entry.info = result.info || {};
    } catch (error) {
      entry.error = /路由不存在|HTTP 404/.test(error.message) ? "本机服务尚未包含参数定义接口，请重启 CanvasFlow 服务或更新桌面版" : error.message;
    } finally {
      entry.loading = false;
      if (typeof render === "function") render();
    }
  }

  function sdParamControlHtml(group, field, disabled) {
    const attrs = `data-role="sd-param" data-node-id="${esc(group.nodeId)}" data-field="${esc(field.field)}" data-param-type="${field.kind}" ${disabled}`;
    const label = `<span title="${esc(field.field)}">${esc(field.field)}</span>`;
    if (field.kind === "combo") {
      const options = field.options.map(option => `<option value="${esc(String(option))}" ${String(option) === String(field.value) ? "selected" : ""}>${esc(String(option))}</option>`).join("");
      return `<label class="sd-param-field">${label}<select ${attrs}>${options}</select></label>`;
    }
    if (field.kind === "number") {
      const config = field.config || {};
      const range = `${Number.isFinite(config.min) ? ` min="${config.min}"` : ""}${Number.isFinite(config.max) ? ` max="${config.max}"` : ""} step="${Number.isFinite(config.step) && config.step > 0 ? config.step : "any"}"`;
      return `<label class="sd-param-field">${label}<input type="number" ${attrs} value="${esc(String(field.value))}"${range}></label>`;
    }
    if (field.kind === "boolean") {
      const options = `<option value="true" ${field.value === true ? "selected" : ""}>是</option><option value="false" ${field.value !== true ? "selected" : ""}>否</option>`;
      return `<label class="sd-param-field">${label}<select ${attrs}>${options}</select></label>`;
    }
    if (field.kind === "string" && field.config?.multiline) {
      return `<label class="sd-param-field sd-param-wide">${label}<textarea rows="2" ${attrs}>${esc(String(field.value ?? ""))}</textarea></label>`;
    }
    return `<label class="sd-param-field">${label}<input type="text" ${attrs} value="${esc(String(field.value ?? ""))}"></label>`;
  }

  function sdParamPanelHtml(node, workflow) {
    if (!workflow?.workflow) return "";
    const open = Boolean(node._sdParamsOpen);
    const key = sdParamInfoKey(workflow);
    const entry = cache.paramInfo[key] || (cache.paramInfo[key] = { loading: false, info: null, error: "" });
    const head = `<button type="button" data-role="sd-params-toggle" class="sd-params-toggle" aria-expanded="${open}"><span>${open ? "收起全部参数" : "全部参数"}</span><span class="sd-params-caret">${open ? "▾" : "▸"}</span></button>`;
    if (!open) return `<div class="sd-params">${head}</div>`;
    let body;
    if (entry.error) body = `<div class="sd-params-note is-error">${esc(entry.error)}</div>`;
    else if (entry.loading || !entry.info) {
      if (!entry.loading && !entry.info) loadSdParamInfo(workflow);
      body = `<div class="sd-params-note">正在读取参数定义…</div>`;
    } else {
      const data = sdParamGroupsFromWorkflow(workflow, entry.info);
      body = data?.groups.length ? data.groups.map(group => {
        const collapsed = Boolean(node._sdParamGroupsCollapsed?.[group.nodeId]);
        const fields = collapsed ? "" : `<div class="sd-param-fields">${group.fields.map(field => sdParamControlHtml(group, field, node.generating ? "disabled" : "")).join("")}</div>`;
        return `<div class="sd-param-group${collapsed ? " is-collapsed" : ""}"><button type="button" class="sd-param-group-head" data-role="sd-param-group:${esc(group.nodeId)}" aria-expanded="${!collapsed}"><span class="sd-param-group-title" title="${esc(group.title)}">${esc(group.title)}</span><span class="sd-param-group-count">${group.fields.length}</span><span class="sd-params-caret">${collapsed ? "▸" : "▾"}</span></button>${fields}</div>`;
      }).join("") : `<div class="sd-params-note">该工作流没有可调参数（都已由画布连线或上方字段覆盖）</div>`;
    }
    return `<div class="sd-params is-open">${head}<div class="sd-params-body">${body}</div></div>`;
  }

  // 节点高度由画布的 syncContentDrivenNodeHeights 纯内容自适应（body 已去掉 calc 钳制）——
  // 不再手工估算：渲染期改 node.h 会被同一轮的通用自适应按旧盒子测回，形成死锁（面板大小异常根因）

  function nodeBody(node) {
    normalizeNode(node);
    const workflow = selectedSdWorkflow(node);
    const map = workflow?.mapping || {};
    const disabled = node.generating ? "disabled" : "";
    const workflows = `<option value="">${cache.workflows.length ? "选择工作流…" : "无工作流，请在设置 → 本地 SD 导入"}</option>`
      + cache.workflows.map(item => `<option value="${esc(item.id)}" ${item.id === node._sdWorkflowId ? "selected" : ""}>${esc(item.name)}</option>`).join("");
    const hasPrompt = Boolean(map.positiveNodeId || map.promptNodeId);
    const promptField = hasPrompt ? `<label class="ai-model-field"><span>提示词（留空时使用上游文字）</span><textarea data-role="sd-prompt" rows="2" placeholder="描述画面与动作…" ${disabled}>${esc(node.prompt || "")}</textarea></label>` : "";
    const negativeField = map.negativeNodeId ? `<label class="ai-model-field"><span>负面提示词</span><textarea data-role="sd-negative" rows="1" placeholder="不希望出现的元素" ${disabled}>${esc(node._sdNegative)}</textarea></label>` : "";
    const seedField = map.samplerNodeId && map.seedField ? `<label><span>Seed</span><input data-role="sd-seed" type="number" min="0" value="${node._sdSeed}" ${disabled}></label>` : "";
    const denoiseField = map.denoiseField ? `<label><span>降噪</span><input data-role="sd-denoise" type="number" min="0" max="1" step="0.05" value="${node._sdDenoise}" ${disabled}></label>` : "";
    const durationField = map.durationNodeId ? `<label><span>时长(秒)</span><select data-role="sd-duration" ${disabled}>${DURATIONS.map(value => `<option value="${value}" ${value === node._sdDuration ? "selected" : ""}>${value}</option>`).join("")}</select></label>` : "";
    const sizeFields = Array.isArray(map.params) && map.params.length ? `<label><span>分辨率</span><select data-role="sd-resolution" ${disabled}>${SD_RESOLUTIONS.map(value => `<option value="${value}" ${value === node._sdResolution ? "selected" : ""}>${value}</option>`).join("")}</select></label><label><span>比例</span><select data-role="sd-ratio" ${disabled}>${SD_RATIOS.map(value => `<option value="${value}" ${value === node._sdRatio ? "selected" : ""}>${value}</option>`).join("")}</select></label>` : "";
    const imageHint = map.imageNodeId ? `<label class="sd-io-hint"><span>图片输入</span><span class="sd-hint-text">连接上游图片节点，执行时取第一张</span></label>` : "";
    // 添加工作流直接上节点（2026-11-14 用户要求"只能从设置里添加过于鸡肋"）：导入 JSON / 从 ComfyUI 获取
    const wfActions = `<div class="sd-wf-actions"><button type="button" data-role="sd-import-json" title="导入 ComfyUI API 格式 JSON 文件" ${disabled}>导入 JSON…</button><button type="button" data-role="sd-fetch-comfy" title="列出 ComfyUI 已保存的工作流勾选导入" ${disabled}>从 ComfyUI 获取</button></div>`;
    // 工作流下拉独占整行（2026-11-14 用户要求"工作流放下一行"）：导入按钮行在前，下拉随后占满两列；
    // 常用映射字段之后接全参数面板（占满整行，见 sdParamPanelHtml）
    const settings = `<div class="ai-node-settings">${wfActions}<label class="sd-workflow-field"><span>工作流</span><select data-role="sd-workflow" ${disabled}>${workflows}</select></label>${promptField}${negativeField}${imageHint}${seedField}${denoiseField}${durationField}${sizeFields}${sdParamPanelHtml(node, workflow)}</div>`;
    const status = node.generating
      ? `<div class="local-sd-status is-busy">${esc(sdStatusLabel(node))}</div>`
      : node._sdError ? `<div class="local-sd-status is-error">${esc(node._sdError)}</div>`
      : node._sdWorkflowId && !workflow ? `<div class="local-sd-status is-error">工作流已删除，请重新选择</div>` : "";
    // 无内置预览窗：图片结果直接在节点后方生成图片节点；视频结果保留小型内嵌播放条
    const videoResult = node.videoFile ? `<div class="video-preview sd-video-result"><video controls preload="metadata" src="${esc(videoFileUrl(node.videoFile))}" draggable="false"></video></div>` : "";
    // 生成中只有停止按钮：div 闭合必须写在外层——此前 </div> 只在非生成分支里，
    // 生成中 .ai-actions 未闭合，参数网格被吞进这个 flex 行容器，停止按钮被挤成竖条（2026-11-14 修复）
    const actionButtons = node.generating
      ? `<button type="button" data-role="sd-cancel" class="ai-generate-btn">停止</button>`
      : `<button type="button" data-role="sd-generate" class="ai-generate-btn">${node.videoFile ? "重新生成" : "生成"}</button>${hasPrompt ? `<button type="button" data-role="sd-optimize" title="用内置指令让 AI 优化正面/负面提示词并自动回填" aria-label="AI优化提示词" ${sdOptimizePending.has(node.id) ? "disabled" : ""}>${sdOptimizePending.has(node.id) ? "优化中…" : "AI优化"}</button>` : ""}${map.maskNodeId ? `<button type="button" data-role="sd-mask">${node._sdMaskData ? "重新选择区域" : "选择重绘区域"}</button>` : ""}${node.videoFile ? `<button type="button" data-role="sd-clear-video">清除视频</button>` : ""}`;
    const actions = `<div class="ai-actions">${actionButtons}</div>`;
    // 进度条与 AI 绘图节点同位（节点底边，.ai-node-progress 绝对定位），仅生成中渲染；高度由画布通用自适应接管
    return `${videoResult}${status}<div class="node-hover-controls">${actions}${settings}</div>${node.generating ? sdProgressMarkup(node) : ""}`;
  }

  async function sourceFor(node) {
    const upstream = collectUpstreamForAI(node.id);
    const promptText = [...new Set(upstream.texts || [])].join("，");
    const ref = upstream.orderedRefs?.[0] || upstream.images?.[0] || null;
    const imageData = ref ? await materializeReferenceImage(ref) : "";
    return { promptText, imageData };
  }

  // 结果归档：与云 AI 节点同款（export/ai_generated/，勾选「以项目名称创建文件夹导出」时带项目名子目录）。
  // 拿到 outputPath 后，右键菜单的「打开生成图片所在文件夹」「复制图片」即可用（app.js 按 outputPath 判定）。
  async function saveSdOutputFile(dataUrl, fileName) {
    const response = await apiFetch("/api/save-export-files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderName: "ai_generated", baseFolder: state.settings.exportFolderLabel || runtimeExportFolder || "export", files: [{ name: projectExportFileName(fileName, currentPage()?.name || "项目"), data: dataUrl }] }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || `HTTP ${response.status}`);
    return result.files?.[0] || "";
  }

  async function generate(nodeId) {
    let node = findNode(nodeId); if (!node || node.generating) return;
    normalizeNode(node);
    const workflow = selectedSdWorkflow(node);
    if (!workflow) return toast("请先在节点上选择工作流（设置 → 本地 SD 可导入）");
    const map = workflow.mapping || {};
    let source;
    try { source = await sourceFor(node); } catch (error) { return toast(`读取上游图片失败：${error.message}`); }
    // 校验全部由映射驱动：工作流要什么就检查什么，其余不限制
    if (map.imageNodeId && !source.imageData) return toast("该工作流需要图片输入：请连接一张上游图片");
    if (map.maskNodeId && !node._sdMaskData) return toast("该工作流需要重绘蒙版：请先选择局部重绘区域");
    const promptText = [source.promptText, node.prompt].map(value => String(value || "").trim()).filter(Boolean).join("，");
    if ((map.positiveNodeId || map.promptNodeId) && !promptText) return toast("请输入提示词或连接上游文字");
    const requestSeq = (node._sdRequestSeq || 0) + 1; node._sdRequestSeq = requestSeq; node.generating = true; node._sdError = ""; node._sdStatus = "正在提交工作流…"; node._sdStartedAt = Date.now(); render();
    try {
      const submitted = await request("/api/comfyui/run", { method: "POST", body: JSON.stringify({ workflowId: node._sdWorkflowId, serverUrl: cache.config.serverUrl, prompt: promptText, negativePrompt: node._sdNegative, seed: node._sdSeed, denoise: node._sdDenoise, duration: node._sdDuration, resolution: node._sdResolution, ratio: node._sdRatio, imageData: source.imageData, maskData: node._sdMaskData || "", paramValues: node._sdParamValues || {} }) });
      node = findNode(nodeId); if (!node || node._sdRequestSeq !== requestSeq) return; node._sdTaskId = submitted.taskId; node._sdStatus = "ComfyUI 执行中…"; render();
      startSdProgressTimer(nodeId);
      for (let attempt = 0; attempt < 720; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2500));
        node = findNode(nodeId); if (!node || node._sdRequestSeq !== requestSeq) return;
        if (window.CanvasFlowGroupNodeRunIsStopped?.(node)) { node.generating = false; node._sdTaskId = ""; node._sdStatus = ""; node._sdError = "编组运行已停止，结果已丢弃"; render(); return; }
        const result = await request(`/api/comfyui/status/${encodeURIComponent(submitted.taskId)}`);
        if (result.status === "running") continue;
        if (result.status === "cancelled") throw new Error("任务已取消");
        if (result.status !== "succeeded") throw new Error(result.error || "ComfyUI 执行失败");
        const images = result.images || [];
        const videos = result.videos || [];
        if (!images.length && !videos.length) throw new Error("ComfyUI 没有返回图片或视频");
        node = findNode(nodeId); if (!node || node._sdRequestSeq !== requestSeq) return;
        if (videos.length) {
          // 视频结果：服务端已落盘 download/videos，节点内保留小播放条（高度随内容自适应）
          node.videoFile = videos[0]; node.generatedImage = ""; delete node.generatedAssetId; node.fileName = ""; node.mime = "";
          node.outputPath = (result.videoPaths || [])[0] || "";
        } else {
          // 图片结果：全部（含第一张）在节点后方生成图片节点，逐张归档 + 素材外置
          node.videoFile = ""; node.outputPath = "";
          const baseX = node.x + node.w + 40;
          for (let index = 0; index < images.length; index++) {
            const fileName = `comfyui_${Date.now()}_${index + 1}.png`;
            const out = addNode("image", baseX, node.y + index * 220, false);
            out.image = images[index]; out.fileName = fileName; out.mime = "image/png";
            try { out.outputPath = await saveSdOutputFile(images[index], fileName); }
            catch (error) { console.warn("[本地SD] 归档到输出文件夹失败", { fileName, message: error.message }); }
            try { if (typeof externalizeImageField === "function") await externalizeImageField(out, "image", "imageAssetId", fileName); }
            catch (error) { console.warn("[本地SD] 素材外置失败", { fileName, message: error.message }); }
          }
        }
        node.generating = false; node._sdTaskId = ""; node._sdStatus = ""; pushHistory(); render();
        toast(videos.length ? `ComfyUI 已生成 ${videos.length} 个视频` : `ComfyUI 已生成 ${images.length} 张图片`); return;
      }
      throw new Error("ComfyUI 任务等待超时");
    } catch (error) {
      node = findNode(nodeId); if (!node || node._sdRequestSeq !== requestSeq) return;
      node.generating = false; node._sdTaskId = ""; node._sdStatus = ""; node._sdError = error.message; render();
    } finally {
      stopSdProgressTimer(nodeId);
    }
  }

  async function cancel(node) {
    node._sdRequestSeq = (node._sdRequestSeq || 0) + 1;
    if (node._sdTaskId) request("/api/comfyui/cancel", { method: "POST", body: JSON.stringify({ taskId: node._sdTaskId }) }).catch(() => {});
    stopSdProgressTimer(node.id);
    node.generating = false; node._sdTaskId = ""; node._sdStatus = ""; node._sdError = "任务已取消"; render();
  }

  async function openMaskEditor(node) {
    const source = await sourceFor(node); if (!source.imageData) return toast("请先连接一张上游图片");
    const image = new Image(); image.src = source.imageData; await image.decode();
    const overlay = document.createElement("div"); overlay.className = "manual-matting local-sd-mask-editor"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-label", "局部重绘蒙版编辑器");
    overlay.tabIndex = -1;
    overlay.innerHTML = `<div class="mm-shell"><header><strong>选择局部重绘区域</strong><span>白色区域会被重绘</span><button type="button" data-action="close" aria-label="关闭蒙版编辑器">关闭</button></header><div class="mm-workspace"><div class="mm-preview"><div class="mm-scroll"><div class="mm-surface"><canvas aria-label="局部重绘选区和蒙版编辑区"></canvas></div></div><p class="mm-status" role="status">拖动绘制矩形，或使用画笔精修。</p></div><aside><strong>蒙版</strong><p>白色：重绘<br>黑色：保留</p></aside></div><footer><div class="mm-tools"><button type="button" data-mode="rect">矩形选区</button><button type="button" data-mode="restore">恢复画笔</button><button type="button" data-mode="erase">擦除画笔</button><label>笔刷 <input class="mm-size" type="range" min="4" max="120" value="32" title="快捷键：[ 缩小，] 放大" aria-label="笔刷大小；左方括号缩小，右方括号放大"></label><button type="button" data-action="undo">撤销</button><button type="button" data-action="clear">清空</button><label>缩放 <select class="mm-zoom"><option value="fit">适合窗口</option><option value="1">100%</option><option value="2">200%</option><option value="4">400%</option></select></label></div><div class="mm-actions"><button type="button" class="primary" data-action="confirm">确认蒙版</button></div></footer></div>`;
    document.body.appendChild(overlay); const canvas = overlay.querySelector("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; const ctx = canvas.getContext("2d");
    const base = document.createElement("canvas"); base.width = canvas.width; base.height = canvas.height; const bctx = base.getContext("2d"); bctx.fillStyle = "black"; bctx.fillRect(0, 0, base.width, base.height);
    if (node._sdMaskData) { const saved = new Image(); saved.src = node._sdMaskData; await saved.decode().catch(() => null); if (saved.naturalWidth === base.width && saved.naturalHeight === base.height) bctx.drawImage(saved, 0, 0); }
    let mode = "rect", drawing = false, start = null, history = [];
    const snapshot = () => { history.push(bctx.getImageData(0, 0, base.width, base.height)); if (history.length > 30) history.shift(); };
    const renderMask = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.globalAlpha = 1; ctx.drawImage(image, 0, 0); ctx.globalAlpha = .45; ctx.drawImage(base, 0, 0); ctx.globalAlpha = 1; };
    const point = event => { const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }; };
    canvas.addEventListener("pointerdown", event => { snapshot(); drawing = true; start = point(event); canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener("pointermove", event => { if (!drawing) return; const p = point(event); if (mode === "rect") { renderMask(); ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.strokeRect(start.x, start.y, p.x - start.x, p.y - start.y); } else { bctx.fillStyle = mode === "restore" ? "white" : "black"; bctx.beginPath(); bctx.arc(p.x, p.y, Number(overlay.querySelector(".mm-size").value) / 2, 0, Math.PI * 2); bctx.fill(); renderMask(); } });
    canvas.addEventListener("pointerup", event => { if (!drawing) return; const p = point(event); drawing = false; if (mode === "rect") { bctx.fillStyle = "white"; bctx.fillRect(Math.min(start.x, p.x), Math.min(start.y, p.y), Math.abs(p.x - start.x), Math.abs(p.y - start.y)); } renderMask(); });
    overlay.addEventListener("click", event => { const selected = event.target.closest("[data-mode]")?.dataset.mode; if (selected) mode = selected; const action = event.target.closest("[data-action]")?.dataset.action; if (action === "close") overlay.remove(); if (action === "clear") { snapshot(); bctx.fillStyle = "black"; bctx.fillRect(0, 0, base.width, base.height); renderMask(); } if (action === "undo" && history.length) { bctx.putImageData(history.pop(), 0, 0); renderMask(); } if (action === "confirm") { node._sdMaskData = base.toDataURL("image/png"); node._sdMaskSource = source.imageData.slice(0, 128); pushHistory(); render(); overlay.remove(); } });
    overlay.querySelector(".mm-zoom").addEventListener("change", event => { canvas.style.width = event.target.value === "fit" ? "100%" : `${canvas.width * Number(event.target.value)}px`; });
    // []/【】 调笔刷：app.js 的 adjustRangeByBracketKey 是唯一实现（运行时才触发，全局可用）
    overlay.addEventListener("keydown", event => { window.adjustRangeByBracketKey?.(event, overlay.querySelector(".mm-size")); });
    renderMask();
    overlay.focus({ preventScroll: true });
  }

  function handleChange(node, role, target) {
    if (node.type !== "local-sd") return false;
    if (role === "sd-workflow") {
      node._sdWorkflowId = target.value;
      // 换工作流后蒙版源图可能不同，清掉旧蒙版；控件集变化后高度由 nodeBody 自愈
      node._sdMaskData = ""; node._sdMaskSource = "";
      // 全参数面板随工作流走：换工作流清掉旧编辑值与折叠态（paramValues 键是节点 id，串工作流会错写）
      node._sdParamValues = {}; node._sdParamGroupsCollapsed = {}; node._sdParamsOpen = false;
    }
    else if (role === "sd-param") {
      // 全参数面板控件回写（2026-11-14）：textarea 走 handleInput（逐键），其余在 change 提交
      const paramNodeId = target.dataset.nodeId || "";
      const paramField = target.dataset.field || "";
      if (!paramNodeId || !paramField) return false;
      const paramType = target.dataset.paramType || "string";
      let value;
      if (paramType === "number") {
        const parsed = Number(target.value);
        value = Number.isFinite(parsed) ? parsed : undefined;
      } else if (paramType === "boolean") {
        value = target.value === "true";
      } else if (paramType === "combo") {
        // 数字型 combo 按原始类型回写：从构建器反查选项原始值；找不到按字符串写（上游校验兜底）
        value = target.value;
        const workflowItem = selectedSdWorkflow(node);
        const info = workflowItem ? cache.paramInfo[sdParamInfoKey(workflowItem)]?.info : null;
        const data = workflowItem ? sdParamGroupsFromWorkflow(workflowItem, info) : null;
        const options = data?.groups.find(group => group.nodeId === paramNodeId)?.fields.find(item => item.field === paramField && item.kind === "combo")?.options;
        if (options) { const raw = options.find(option => String(option) === target.value); if (raw !== undefined) value = raw; }
      } else {
        value = target.value;
      }
      if (value !== undefined) {
        if (!node._sdParamValues[paramNodeId] || typeof node._sdParamValues[paramNodeId] !== "object") node._sdParamValues[paramNodeId] = {};
        node._sdParamValues[paramNodeId][paramField] = value;
      }
    }
    else if (role === "sd-seed") node._sdSeed = Math.max(0, Math.floor(Number(target.value) || 0));
    else if (role === "sd-denoise") node._sdDenoise = Math.max(0, Math.min(1, Number(target.value) || 0));
    else if (role === "sd-duration") node._sdDuration = DURATIONS.includes(Number(target.value)) ? Number(target.value) : 5;
    else if (role === "sd-resolution") node._sdResolution = SD_RESOLUTIONS.includes(target.value) ? target.value : "1K";
    else if (role === "sd-ratio") node._sdRatio = SD_RATIOS.includes(target.value) ? target.value : "1:1";
    else return false;
    pushHistory(); render(); return true;
  }
  function handleInput(node, role, target) {
    if (node.type !== "local-sd") return false;
    if (role === "sd-prompt") { node.prompt = target.value; markDirty(); }
    else if (role === "sd-negative") { node._sdNegative = target.value; markDirty(); }
    else if (role === "sd-param") {
      // 全参数面板：多行文本逐键保存（单行/数字/下拉在 change 提交，避免中间态进存档）
      if (target.tagName !== "TEXTAREA") return true;
      const paramNodeId = target.dataset.nodeId || "";
      const paramField = target.dataset.field || "";
      if (!paramNodeId || !paramField) return true;
      if (!node._sdParamValues[paramNodeId] || typeof node._sdParamValues[paramNodeId] !== "object") node._sdParamValues[paramNodeId] = {};
      node._sdParamValues[paramNodeId][paramField] = target.value;
      markDirty();
    }
    else return false;
    return true;
  }

  // ---------- AI优化提示词（2026-11-14 用户要求）----------
  // 固定内置指令（PROMPT_OPTIMIZATION_INSTRUCTIONS.sd，app.js）让模型分两段输出，
  // 解析后自动回填 node.prompt / node._sdNegative；模型按站点固定（与关键词反推同款）。
  const sdOptimizePending = new Set();

  // 解析「正面提示词：…」「负面提示词：…」两段；两段顺序互换也能正确切分，缺锚点报错不静默回填
  function parseSdPromptSections(text) {
    const normalized = String(text || "").replace(/```+/g, "").trim();
    const pos = /正面提示词\s*[:：]/.exec(normalized);
    const neg = /负面提示词\s*[:：]/.exec(normalized);
    if (!pos && !neg) throw new Error("模型输出缺少「正面提示词/负面提示词」分段标记，未做回填");
    const strip = value => value.trim().replace(/^["'「『【（(]+/, "").replace(/["'」』】）)]+$/, "").trim();
    const positive = pos ? strip(normalized.slice(pos.index + pos[0].length, neg && neg.index > pos.index ? neg.index : normalized.length)) : "";
    const negative = neg ? strip(normalized.slice(neg.index + neg[0].length, pos && pos.index > neg.index ? pos.index : normalized.length)) : "";
    if (!positive && !negative) throw new Error("优化结果为空，未做回填");
    return { positive, negative };
  }

  async function optimizeSdPrompts(nodeId) {
    const node = (typeof findNode === "function" && findNode(nodeId)) || (state.nodes || []).find(item => item.id === nodeId);
    if (!node || node.type !== "local-sd" || sdOptimizePending.has(nodeId)) return;
    const apiType = state.settings.apiType === "apimart" ? "apimart" : "agtoken";
    const model = apiType === "apimart" ? "gpt-6-luna" : "gemini-3-flash";
    const apiKey = apiType === "apimart" ? state.settings.apiKey : state.settings.agtokenApiKey;
    if (!apiKey && !desktop) return toast(`请先在设置中填写并保存 ${apiType === "apimart" ? "APIMart" : "AGToken"} Key`);
    sdOptimizePending.add(nodeId);
    render();
    try {
      const source = `当前正面提示词：${String(node.prompt || "").trim() || "（空）"}\n当前负面提示词：${String(node._sdNegative || "").trim() || "（空）"}`;
      const reply = await requestPromptOptimization(source, "sd", model);
      const sections = parseSdPromptSections(reply);
      if (typeof findNode === "function" && findNode(nodeId) !== node) throw new Error("节点已不在画布上，结果未应用");
      if (sections.positive) node.prompt = sections.positive;
      if (sections.negative) node._sdNegative = sections.negative;
      pushHistory();
      toast(`已将优化结果填入正面${sections.negative ? "/负面" : ""}提示词`);
    } catch (error) {
      toast(`AI优化失败：${error.message || "请稍后重试"}`);
    } finally {
      sdOptimizePending.delete(nodeId);
      render();
    }
  }
  // ---------- 节点上直接添加工作流（2026-11-14 用户要求"只能从设置里添加过于鸡肋"）----------
  function importJsonToNode(node) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const id = await importFile(file);
        const fresh = findNode(node.id);
        if (fresh && id) { fresh._sdWorkflowId = id; pushHistory(); toast("已在节点上选中导入的工作流"); }
        render();
      } catch (error) { toast(`工作流导入失败：${error.message}`); }
    });
    input.click();
  }

  // 从 ComfyUI 获取的节点侧选取弹层：复用 comfy-user-* 样式，勾选导入后自动选中第一个新工作流
  async function openComfyWorkflowPicker(nodeId) {
    const node = findNode(nodeId);
    if (!node || node.type !== "local-sd") return;
    const overlay = document.createElement("div");
    overlay.className = "sd-wf-picker";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "从 ComfyUI 获取工作流");
    overlay.tabIndex = -1;
    overlay.innerHTML = `<div class="sd-wf-picker-card"><header><strong>从 ComfyUI 获取工作流</strong><button type="button" data-action="close" aria-label="关闭">×</button></header><div class="sd-wf-picker-body"></div><footer><button type="button" data-action="refresh">刷新</button><button type="button" class="primary" data-action="import" disabled>导入所选(0)</button></footer></div>`;
    const body = overlay.querySelector(".sd-wf-picker-body");
    const renderBody = () => {
      if (cache.userListLoading) { body.innerHTML = `<div class="comfy-user-empty">正在读取 ComfyUI 已保存的工作流…</div>`; return; }
      if (cache.userListError) { body.innerHTML = `<div class="comfy-user-empty is-error">${esc(cache.userListError)}</div>`; return; }
      if (!cache.userList.length) { body.innerHTML = `<div class="comfy-user-empty">ComfyUI 里还没有已保存的工作流；在 ComfyUI 保存后点「刷新」</div>`; return; }
      body.innerHTML = `<input type="text" class="comfy-user-search" placeholder="搜索工作流名" aria-label="搜索工作流名">${userWorkflowHintHtml()}<div class="sd-wf-picker-list">${cache.userList.map(userWorkflowItemHtml).join("")}</div>`;
    };
    const updateCount = () => {
      const button = overlay.querySelector('[data-action="import"]');
      const count = overlay.querySelectorAll(".comfy-user-check:checked").length;
      button.textContent = `导入所选(${count})`;
      button.disabled = count === 0;
    };
    overlay.addEventListener("click", async event => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      if (action === "close") return overlay.remove();
      if (action === "refresh") { cache.userListLoading = true; renderBody(); await loadUserWorkflows(); renderBody(); return; }
      if (action === "import") {
        const button = event.target.closest("[data-action]");
        button.disabled = true;
        try {
          const result = await importSelectedUserWorkflows(overlay);
          if (result?.ids?.length) {
            const fresh = findNode(nodeId);
            if (fresh) { fresh._sdWorkflowId = result.ids[0]; pushHistory(); toast("已在节点上选中导入的工作流"); }
            overlay.remove();
          }
          if (typeof render === "function") render();
        } finally { updateCount(); }
      }
    });
    overlay.addEventListener("change", event => {
      if (event.target.classList?.contains("comfy-user-check")) updateCount();
    });
    overlay.addEventListener("input", event => {
      if (!event.target.classList?.contains("comfy-user-search")) return;
      const query = event.target.value.trim().toLowerCase();
      for (const item of overlay.querySelectorAll(".comfy-user-item")) item.hidden = Boolean(query) && !item.textContent.toLowerCase().includes(query);
    });
    document.body.appendChild(overlay);
    overlay.focus({ preventScroll: true });
    if (!cache.userList.length) {
      cache.userListLoading = true;
      renderBody();
      await loadUserWorkflows();
    }
    renderBody();
  }

  function handleClick(node, role) {
    if (node.type !== "local-sd") return false;
    if (role === "sd-generate") generate(node.id);
    else if (role === "sd-cancel") cancel(node);
    else if (role === "sd-params-toggle") {
      // 全参数面板展开/折叠：纯界面态，不进撤销栈（与蒙版编辑器入口同口径）
      node._sdParamsOpen = !node._sdParamsOpen;
      render();
    }
    else if (role.startsWith("sd-param-group:")) {
      // 组头折叠切换：nodeId 编码在 data-role 里（handleClick 只有 node/role 两个参数）
      const paramNodeId = role.slice("sd-param-group:".length);
      if (paramNodeId) {
        if (!node._sdParamGroupsCollapsed || typeof node._sdParamGroupsCollapsed !== "object") node._sdParamGroupsCollapsed = {};
        if (node._sdParamGroupsCollapsed[paramNodeId]) delete node._sdParamGroupsCollapsed[paramNodeId];
        else node._sdParamGroupsCollapsed[paramNodeId] = true;
        render();
      }
    }
    else if (role === "sd-optimize") optimizeSdPrompts(node.id);
    else if (role === "sd-mask") openMaskEditor(node).catch(error => toast(`无法打开选区：${error.message}`));
    else if (role === "sd-import-json") importJsonToNode(node);
    else if (role === "sd-fetch-comfy") openComfyWorkflowPicker(node.id).catch(error => toast(`读取 ComfyUI 工作流失败：${error.message}`));
    else if (role === "sd-clear-video") {
      node.videoFile = ""; node.outputPath = "";
      pushHistory(); render();
    }
    else return false;
    return true;
  }

  window.LocalSD = { cache, load, nodeBody, normalizeNode, handleChange, handleInput, handleClick, generate, cancel };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { wireSettings(); load(); }); else { wireSettings(); load(); }
})();
