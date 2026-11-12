(() => {
  const apiFetch = (...args) => window.CanvasFlowRuntime.apiFetch(...args);
  const labels = { txt2img: "文生图", img2img: "图生图", upscale: "放大", matting: "抠图", inpaint: "局部重绘", "video-i2v": "图生视频", "video-t2v": "文生视频" };
  const PROMPT_MODES = ["txt2img", "img2img", "inpaint", "video-i2v", "video-t2v"];
  const VIDEO_MODES = ["video-i2v", "video-t2v"];
  const DURATIONS = [2, 3, 5, 8, 10, 15];
  // 尺寸传导：与 AI 绘图节点一致的 分辨率(长边)+比例 档位，经 mapping.params 写入工作流的宽高
  const SIZE_MODES = ["txt2img", "video-i2v", "video-t2v"];
  const SD_RESOLUTIONS = ["0.5K", "1K", "2K"];
  const SD_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"];
  // 紧凑参数卡高度（无内置预览窗）；视频结果出现时由 generate 临时加高，清除后还原
  const LOCAL_SD_HEIGHTS = { txt2img: 430, img2img: 400, inpaint: 400, matting: 250, upscale: 250, "video-i2v": 430, "video-t2v": 430 };
  const cache = { config: { serverUrl: "http://127.0.0.1:8188", installPath: "", launchPath: "" }, workflows: [], launcherCandidates: [], loaded: false, replaceId: "" };
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
      cache.workflows = Array.isArray(data.workflows) ? data.workflows.map(({ workflow, ...item }) => item) : [];
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
    holder.innerHTML = cache.workflows.length ? cache.workflows.map(item => `<div class="comfy-workflow-item" draggable="true" data-workflow-id="${esc(item.id)}"><span class="comfy-workflow-drag" title="拖拽排序" aria-hidden="true">⋮⋮</span><span class="comfy-workflow-info"><strong>${esc(item.name)}${item.templateId ? `<small class="comfy-builtin-badge">内置</small>` : ""}</strong><small>${esc(labels[item.type] || item.type)}</small></span><button type="button" data-comfy-action="rename" aria-label="重命名工作流">重命名</button><button type="button" data-comfy-action="replace" aria-label="替换工作流 JSON">替换</button><button type="button" data-comfy-action="delete" class="danger" aria-label="删除工作流">删除</button></div>`).join("") : `<div class="comfy-workflow-empty">还没有工作流；画布上使用对应功能时会自动置入内置模板</div>`;
  }

  function builtinTemplates() { return Array.isArray(window.CANVASFLOW_SD_TEMPLATES) ? window.CANVASFLOW_SD_TEMPLATES : []; }

  // 统一添加入口：下拉 = 未载入的内置模板 + 导入 JSON；已载入的内置模板不再重复出现
  function renderAddWorkflow() {
    const select = $("comfyAddWorkflow");
    if (!select) return;
    const uninstalled = builtinTemplates().filter(template => !cache.workflows.some(item => item.templateId === template.id || item.name === template.name));
    select.innerHTML = `<option value="">添加工作流…</option>`
      + (uninstalled.length ? `<optgroup label="内置模板">${uninstalled.map(template => `<option value="${esc(template.id)}">${esc(template.name)}（${esc(labels[template.type] || template.type)}）</option>`).join("")}</optgroup>` : "")
      + `<optgroup label="更多"><option value="import-json">导入 ComfyUI JSON 文件…</option></optgroup>`;
  }

  // 一键载入内置工作流：服务端按本机 ComfyUI /object_info 自动匹配模型文件名；
  // 前端先按 templateId/名称去重，旧版后端不认识 templateId 时靠名称兜底避免重复导入。
  async function importBuiltin(template, nodeId = "") {
    const installed = cache.workflows.find(item => item.templateId === template.id || item.name === template.name);
    let id = installed?.id || "";
    if (!id) {
      try {
        const result = await request("/api/comfyui/workflows/import", { method: "POST", body: JSON.stringify({ name: template.name, type: template.type, templateId: template.id, hints: template.hints || [], serverUrl: cache.config.serverUrl, workflow: template.workflow }) });
        id = result.workflow?.id || "";
      } catch (error) {
        if (/路由不存在|HTTP 404/.test(error.message)) throw new Error("本机服务尚未包含内置工作流接口，请重启 CanvasFlow 服务或更新桌面版后再试");
        throw error;
      }
    }
    await load();
    if (nodeId) {
      const node = findNode(nodeId);
      if (node && id) { node._sdWorkflowId = id; pushHistory(); }
    }
    render();
    return id;
  }

  function syncSettings() {
    if ($("comfyServerUrl")) $("comfyServerUrl").value = cache.config.serverUrl || "http://127.0.0.1:8188";
    if ($("comfyInstallPath")) $("comfyInstallPath").value = cache.config.installPath || "";
    $("comfyDesktopFields")?.classList.toggle("hidden", !window.CanvasFlowRuntime.desktop?.chooseComfyFolder);
    $("comfyLaunchBtn")?.classList.toggle("hidden", !window.CanvasFlowRuntime.desktop?.launchComfy);
    launcherOptions(); workflowList(); renderAddWorkflow();
  }

  async function importFile(file, replaceId = "") {
    const workflow = JSON.parse(await file.text());
    if (replaceId) {
      await request("/api/comfyui/workflows/update", { method: "POST", body: JSON.stringify({ id: replaceId, workflow }) });
      toast("工作流已替换并重新校验");
    } else {
      // 类型由后端按内容自动识别，不再让用户手选
      const result = await request("/api/comfyui/workflows/import", { method: "POST", body: JSON.stringify({ name: file.name.replace(/\.json$/i, ""), workflow }) });
      toast(`已导入${labels[result.workflow?.type] || result.workflow?.type || ""}工作流`);
    }
    await load();
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
      event.currentTarget.disabled = true; setStatus("正在连接…", "busy");
      try { await saveConfig(); await request("/api/comfyui/test", { method: "POST", body: JSON.stringify({ serverUrl: cache.config.serverUrl }) }); setStatus("连接成功", "success"); }
      catch (error) { setStatus(`连接失败：${error.message}`, "error"); }
      finally { event.currentTarget.disabled = false; }
    });
    $("comfyAddBtn")?.addEventListener("click", async () => {
      const select = $("comfyAddWorkflow"); if (!select) return;
      const value = select.value; if (!value) return toast("请先在下拉中选择要添加的工作流");
      if (value === "import-json") { cache.replaceId = ""; $("comfyWorkflowFile")?.click(); return; }
      const template = builtinTemplates().find(item => item.id === value); if (!template) return;
      try { await importBuiltin(template); toast(`已添加：${template.name}`); }
      catch (error) { toast(`添加失败：${error.message}`); }
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
    node._sdMode = labels[node._sdMode] ? node._sdMode : "txt2img";
    node._sdWorkflowId = String(node._sdWorkflowId || "");
    if (!node._sdWorkflowByMode || typeof node._sdWorkflowByMode !== "object" || Array.isArray(node._sdWorkflowByMode)) node._sdWorkflowByMode = {};
    node._sdNegative = String(node._sdNegative || "");
    node._sdSeed = Number.isFinite(Number(node._sdSeed)) ? Number(node._sdSeed) : Math.floor(Math.random() * 2147483647);
    node._sdDenoise = Math.max(0, Math.min(1, Number(node._sdDenoise) || .7));
    node._sdDuration = DURATIONS.includes(Number(node._sdDuration)) ? Number(node._sdDuration) : 5;
    node._sdResolution = SD_RESOLUTIONS.includes(node._sdResolution) ? node._sdResolution : "1K";
    node._sdRatio = SD_RATIOS.includes(node._sdRatio) ? node._sdRatio : "1:1";
    return node;
  }

  // 节点布局与 AI 绘图节点一致：预览在上，生成按钮 + 参数区在下（复用 .ai-preview/.ai-node-settings 样式）
  function nodeBody(node) {
    normalizeNode(node);
    const compatible = cache.workflows.filter(item => item.type === node._sdMode);
    const selectedExists = compatible.some(item => item.id === node._sdWorkflowId);
    const builtinTemplate = builtinForMode(node._sdMode);
    const workflows = `<option value="">${compatible.length ? "自动选择工作流" : builtinTemplate ? "将自动载入内置工作流" : "无可用工作流，请在设置添加"}</option>` + compatible.map(item => `<option value="${esc(item.id)}" ${item.id === node._sdWorkflowId ? "selected" : ""}>${esc(item.name)}</option>`).join("");
    const modes = Object.entries(labels).map(([value, label]) => `<option value="${value}" ${value === node._sdMode ? "selected" : ""}>${label}</option>`).join("");
    const isVideo = VIDEO_MODES.includes(node._sdMode);
    const disabled = node.generating ? "disabled" : "";
    const promptField = PROMPT_MODES.includes(node._sdMode) ? `<label class="ai-model-field"><span>提示词（留空时使用上游文字）</span><textarea data-role="sd-prompt" rows="2" placeholder="描述画面与动作…" ${disabled}>${esc(node.prompt || "")}</textarea></label>` : "";
    const negativeField = node._sdMode === "txt2img" ? `<label class="ai-model-field"><span>负面提示词</span><textarea data-role="sd-negative" rows="1" placeholder="不希望出现的元素" ${disabled}>${esc(node._sdNegative)}</textarea></label>` : "";
    const denoiseField = ["img2img", "inpaint"].includes(node._sdMode) ? `<label><span>降噪</span><input data-role="sd-denoise" type="number" min="0" max="1" step="0.05" value="${node._sdDenoise}" ${disabled}></label>` : "";
    const durationField = isVideo ? `<label><span>时长(秒)</span><select data-role="sd-duration" ${disabled}>${DURATIONS.map(value => `<option value="${value}" ${value === node._sdDuration ? "selected" : ""}>${value}</option>`).join("")}</select></label>` : "";
    const sizeFields = SIZE_MODES.includes(node._sdMode) ? `<label><span>分辨率</span><select data-role="sd-resolution" ${disabled}>${SD_RESOLUTIONS.map(value => `<option value="${value}" ${value === node._sdResolution ? "selected" : ""}>${value}</option>`).join("")}</select></label><label><span>比例</span><select data-role="sd-ratio" ${disabled}>${SD_RATIOS.map(value => `<option value="${value}" ${value === node._sdRatio ? "selected" : ""}>${value}</option>`).join("")}</select></label>` : "";
    const settings = `<div class="ai-node-settings"><label><span>功能</span><select data-role="sd-mode" ${disabled}>${modes}</select></label><label><span>工作流</span><select data-role="sd-workflow" ${disabled}>${workflows}</select></label>${promptField}${negativeField}<label><span>Seed</span><input data-role="sd-seed" type="number" min="0" value="${node._sdSeed}" ${disabled}></label>${denoiseField}${durationField}${sizeFields}</div>`;
    const status = node.generating
      ? `<div class="local-sd-status is-busy">${esc(node._sdStatus || "ComfyUI 执行中…")}</div>`
      : node._sdError ? `<div class="local-sd-status is-error">${esc(node._sdError)}</div>`
      : !selectedExists && node._sdWorkflowId ? `<div class="local-sd-status is-error">工作流已删除，请重新选择</div>` : "";
    // 无内置预览窗：图片结果直接在节点后方生成图片节点；仅视频结果保留小型内嵌播放条（不可作为图片节点生成）
    const videoResult = node.videoFile && isVideo ? `<div class="video-preview sd-video-result"><video controls preload="metadata" src="${esc(videoFileUrl(node.videoFile))}" draggable="false"></video></div>` : "";
    const actions = `<div class="ai-actions">${node.generating
      ? `<button type="button" data-role="sd-cancel" class="ai-generate-btn">停止</button>`
      : `<button type="button" data-role="sd-generate" class="ai-generate-btn">${node.videoFile ? "重新生成" : "生成"}</button>${node._sdMode === "inpaint" ? `<button type="button" data-role="sd-mask">${node._sdMaskData ? "重新选择区域" : "选择重绘区域"}</button>` : ""}${!compatible.length && builtinTemplate ? `<button type="button" data-role="sd-install-template">一键载入「${esc(builtinTemplate.name)}」</button>` : ""}${node.videoFile ? `<button type="button" data-role="sd-clear-video">清除视频</button>` : ""}</div>`}`;
    return `${videoResult}${status}<div class="node-hover-controls">${actions}${settings}</div>`;
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

  function builtinForMode(mode) { return builtinTemplates().find(template => template.type === mode); }

  // "直接使用"：切到某功能时优先恢复该功能上次用的工作流（按功能记忆），其次选第一个；
  // 一个都没有则一键载入内置模板——切换功能全程无需手动点载入。
  async function autoSelectBuiltinFor(node) {
    const compatible = cache.workflows.filter(item => item.type === node._sdMode);
    if (compatible.length) {
      if (!compatible.some(item => item.id === node._sdWorkflowId)) { node._sdWorkflowId = compatible[0].id; pushHistory(); render(); }
      node._sdWorkflowByMode = { ...(node._sdWorkflowByMode || {}), [node._sdMode]: node._sdWorkflowId };
      return;
    }
    const template = builtinForMode(node._sdMode);
    if (!template) return;
    const id = await importBuiltin(template, node.id);
    if (id) {
      const fresh = findNode(node.id);
      if (fresh) fresh._sdWorkflowByMode = { ...(fresh._sdWorkflowByMode || {}), [fresh._sdMode]: id };
      toast(`已自动载入「${template.name}」`);
    }
  }

  async function generate(nodeId) {
    let node = findNode(nodeId); if (!node || node.generating) return;
    normalizeNode(node);
    let workflow = cache.workflows.find(item => item.id === node._sdWorkflowId && item.type === node._sdMode);
    if (!workflow) {
      // 生成时仍无工作流：自动置入该模式的内置模板后继续（用户全程只点一次「生成」）
      const template = builtinForMode(node._sdMode);
      if (!template) return toast("请先选择与当前功能匹配的 ComfyUI 工作流");
      const installedId = await importBuiltin(template, node.id);
      node = findNode(nodeId); if (!node || node.generating) return;
      normalizeNode(node);
      workflow = cache.workflows.find(item => item.id === (installedId || node._sdWorkflowId) && item.type === node._sdMode);
      if (!workflow) return toast("内置工作流载入失败，请到设置 → 本地 SD 检查");
      node._sdWorkflowByMode = { ...(node._sdWorkflowByMode || {}), [node._sdMode]: workflow.id };
    }
    let source;
    try { source = await sourceFor(node); } catch (error) { return toast(`读取上游图片失败：${error.message}`); }
    const needsImage = ["img2img", "upscale", "matting", "inpaint", "video-i2v"].includes(node._sdMode);
    if (needsImage && !source.imageData) return toast(`${labels[node._sdMode]}需要连接一张上游图片`);
    if (node._sdMode === "inpaint" && !node._sdMaskData) return toast("请先选择局部重绘区域");
    const promptText = [source.promptText, node.prompt].map(value => String(value || "").trim()).filter(Boolean).join("，");
    if (PROMPT_MODES.includes(node._sdMode) && !promptText) return toast("请输入提示词或连接上游文字");
    const requestSeq = (node._sdRequestSeq || 0) + 1; node._sdRequestSeq = requestSeq; node.generating = true; node._sdError = ""; node._sdStatus = "正在提交工作流…"; render();
    try {
      const submitted = await request("/api/comfyui/run", { method: "POST", body: JSON.stringify({ workflowId: node._sdWorkflowId, serverUrl: cache.config.serverUrl, prompt: promptText, negativePrompt: node._sdNegative, seed: node._sdSeed, denoise: node._sdDenoise, duration: node._sdDuration, resolution: node._sdResolution, ratio: node._sdRatio, imageData: source.imageData, maskData: node._sdMaskData || "" }) });
      node = findNode(nodeId); if (!node || node._sdRequestSeq !== requestSeq) return; node._sdTaskId = submitted.taskId; node._sdStatus = "ComfyUI 执行中…"; render();
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
          // 视频结果：服务端已落盘 download/videos，节点内保留小播放条（加高容纳），清除按钮可还原高度
          node.videoFile = videos[0]; node.generatedImage = ""; delete node.generatedAssetId; node.fileName = ""; node.mime = "";
          node.outputPath = (result.videoPaths || [])[0] || "";
          node.h = Math.max(Number(node.h) || 0, (LOCAL_SD_HEIGHTS[node._sdMode] || 430) + 200);
        } else {
          // 图片结果：全部（含第一张）在节点后方生成图片节点，逐张归档 + 素材外置
          node.videoFile = ""; node.outputPath = "";
          node.h = LOCAL_SD_HEIGHTS[node._sdMode] || 400;
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
    }
  }

  async function cancel(node) {
    node._sdRequestSeq = (node._sdRequestSeq || 0) + 1;
    if (node._sdTaskId) request("/api/comfyui/cancel", { method: "POST", body: JSON.stringify({ taskId: node._sdTaskId }) }).catch(() => {});
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
    overlay.addEventListener("keydown", event => {
      const direction = event.code === "BracketLeft" || event.key === "[" ? -1
        : event.code === "BracketRight" || event.key === "]" ? 1 : 0;
      if (!direction || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      const size = overlay.querySelector(".mm-size");
      event.preventDefault();
      size.value = String(Math.max(Number(size.min), Math.min(Number(size.max), Number(size.value) + direction * (Number(size.step) || 1))));
      size.dispatchEvent(new Event("input", { bubbles: true }));
    });
    renderMask();
    overlay.focus({ preventScroll: true });
  }

  function handleChange(node, role, target) {
    if (node.type !== "local-sd") return false;
    if (role === "sd-mode") {
      // 切功能：优先恢复该功能上次用的工作流，其次选第一个，没有就自动载入内置模板
      node._sdMode = target.value; node._sdMaskData = "";
      node.h = LOCAL_SD_HEIGHTS[node._sdMode] || 400;
      const remembered = node._sdWorkflowByMode?.[node._sdMode];
      const compatible = cache.workflows.filter(item => item.type === node._sdMode);
      node._sdWorkflowId = remembered && compatible.some(item => item.id === remembered) ? remembered : compatible[0]?.id || "";
      if (!node._sdWorkflowId) autoSelectBuiltinFor(node).catch(() => {});
    }
    else if (role === "sd-workflow") { node._sdWorkflowId = target.value; node._sdWorkflowByMode = { ...(node._sdWorkflowByMode || {}), [node._sdMode]: target.value }; }
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
    if (role === "sd-prompt") node.prompt = target.value; else if (role === "sd-negative") node._sdNegative = target.value; else return false;
    markDirty(); return true;
  }
  function handleClick(node, role) {
    if (node.type !== "local-sd") return false;
    if (role === "sd-generate") generate(node.id);
    else if (role === "sd-cancel") cancel(node);
    else if (role === "sd-mask") openMaskEditor(node).catch(error => toast(`无法打开选区：${error.message}`));
    else if (role === "sd-install-template") {
      const template = builtinTemplates().find(item => item.type === node._sdMode);
      if (!template) return true;
      importBuiltin(template, node.id).then(() => toast(`已载入并选择：${template.name}`)).catch(error => toast(`载入失败：${error.message}`));
    }
    else if (role === "sd-clear-video") {
      node.videoFile = ""; node.outputPath = "";
      node.h = LOCAL_SD_HEIGHTS[node._sdMode] || 400;
      pushHistory(); render();
    }
    else return false;
    return true;
  }

  window.LocalSD = { cache, load, nodeBody, normalizeNode, handleChange, handleInput, handleClick, generate, cancel };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { wireSettings(); load(); }); else { wireSettings(); load(); }
})();
