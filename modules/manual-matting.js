let localMattingRunChain = Promise.resolve();
function runLocalRegionMatting(task) {
  const run = () => executeLocalRegionMatting(task);
  const queued = localMattingRunChain.then(run, run);
  localMattingRunChain = queued.catch(() => {});
  return queued;
}
async function executeLocalRegionMatting(task) {
  const image = task.orderedImages[0].image;
  const input = new Image(); input.src = image; await input.decode();
  const runUrl = task.mattingEngine === "lite" ? "/api/extensions/auto-matting-u2net/run" : "/api/extensions/auto-matting-general/run";
  const runInit = {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({images:[{name:"001.png",data:stripDataUrl(image)}],params:{}})};
  const cfg = extensionSettings();
  const base = cfg.serviceUrl.replace(/\/+$/, "");
  let response;
  try {
    response = window.canvasflowDesktop?.apiRequest ? await apiFetch(runUrl,runInit) : await fetch(`${base}${runUrl}`,runInit);
  } catch (error) {
    throw new Error(`无法启动自动抠图拓展：${error.message || "请在设置 → 拓展中确认已安装并刷新"}`);
  }
  const result = await response.json().catch(()=>({ok:false,error:"拓展响应不是合法 JSON"}));
  if (!response.ok || !result.ok) throw new Error(result.error || `自动抠图拓展返回状态 ${response.status}`);
  const outputImage = result.images?.[0]?.data;
  if (!outputImage) throw new Error("自动抠图拓展没有返回图片");
  const output = new Image(); output.src = `data:image/png;base64,${outputImage}`; await output.decode();
  if (output.naturalWidth !== input.naturalWidth || output.naturalHeight !== input.naturalHeight) throw new Error("本地抠图结果尺寸与选区不一致");
  // Keep manual erasures even when the service replaces the input alpha channel.
  const canvas = document.createElement("canvas"); canvas.width=input.naturalWidth; canvas.height=input.naturalHeight;
  const ctx=canvas.getContext("2d"); ctx.drawImage(output,0,0); ctx.globalCompositeOperation="destination-in"; ctx.drawImage(input,0,0);
  return canvas.toDataURL("image/png");
}
/* Region crops go straight into the existing AI queue; no intermediary nodes or wires. */
async function openImageRegionMatting(node) {
  const pageId = state.activePageId;
  try {
    const dataUrl = await resolveNodeImageDataUrl(node);
    if (!dataUrl) throw new Error("该节点没有可用图片");
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    if (state.activePageId !== pageId || !findNode(node.id)) return;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    await openManualMatting(canvas, node.id);
  } catch (error) { toast(`分区抠图打开失败：${error.message}`); }
}

function enqueueRegionMatting(sourceNodeId, regions, sourceSize, apiType = activeApiType()) {
  const source = findNode(sourceNodeId);
  if (!source) throw new Error("原图片节点已被删除");
  const localMatting = apiType === "local" || apiType === "local-lite";
  if (!localMatting && !activeApiKey(apiType).trim()) throw new Error(`当前使用 ${apiType === "agtoken" ? "AGToken" : "APIMart"}，尚未配置 API Key。请到设置 → AI绘图选择该 API 并保存 Key，然后重新确认。`);
  const hasConflictingTask = aiTaskQueue.items.some(task =>
    task.nodeId === sourceNodeId &&
    task.pageId === state.activePageId &&
    !queueTaskIsSettled(task) &&
    Boolean(task.localMatting) === localMatting
  );
  if (hasConflictingTask) throw new Error(localMatting
    ? "该图片已有等待或运行中的本地抠图任务，请完成后再提交"
    : "该图片已有等待或运行中的 GPT 任务，请完成后再提交");
  const model = apiType === "apimart" ? "gpt-image-2.5-flare" : "gpt-image-2.5";
  const modelLabel = apiType === "apimart" ? "GPT Image 2.5 Flare" : "GPT Image 2.5";
  const entry = modelCatalogEntry(model, apiType);
  if (apiType !== "local" && !entry) throw new Error(`当前 API 不支持 ${modelLabel}`);
  const settings = {type:"ai-image",_apiType:apiType,_model:model,_resolution:"1k",_quality:"medium",_size:"auto",_count:1};
  const runId = `matting-${Date.now()}-${aiTaskQueue.nextId}`;
  const existing = state.nodes.filter(node => node.type === "image" && node.aiSourceNodeId === sourceNodeId).length;
  const tasks = regions.map((region, index) => {
    const reference = {image:region.canvas.toDataURL("image/png"),fileName:`选框${region.id}.png`};
    const task = buildAiQueueTasks({...source,...settings}, {texts:["将图片中主体抠出、透明背景"],images:[reference],orderedRefs:[reference]}, "image-node", runId)[0];
    return {...task,source:"region-matting",generationSettings:{...settings},localMatting,mattingEngine:localMatting ? (apiType === "local-lite" ? "lite" : "general") : undefined,model:localMatting ? (apiType === "local-lite" ? "U²-Net 快速（本地）" : "BiRefNet（本地）") : model,label:`分区抠图 · 选框 ${region.id}`,resultOrder:existing+index,resultCount:existing+regions.length,mattingSourceRect:region.rect.slice(),mattingSourceSize:sourceSize.slice()};
  });
  source._queueRunId = runId;
  aiTaskQueue.items.push(...tasks);
  refreshQueuedNodeProgress(sourceNodeId);
  renderTaskQueue();
  return {count:tasks.length,apiType};
}
// Tie drafts to the actual pixels, so replacing an image cannot restore stale regions.
function mattingImageSignature(canvas) {
  const data = canvas.toDataURL("image/png");
  let hash = 2166136261;
  for (let i=0;i<data.length;i++) hash = Math.imul(hash ^ data.charCodeAt(i),16777619);
  return `${canvas.width}x${canvas.height}:${data.length}:${hash >>> 0}`;
}
function serializeMattingDraft(signature, model, regions) {
  return {version:1,signature,model,regions:regions.map(region => ({
    id:region.id,color:region.color,rect:region.rect.slice(),
    ...(region.edited ? {image:region.canvas.toDataURL("image/png")} : {})
  }))};
}
async function restoreMattingRegions(draft, signature, original) {
  if (draft?.version !== 1 || draft.signature !== signature || !Array.isArray(draft.regions)) return [];
  const regions=[];
  for (const saved of draft.regions) {
    const rect=saved.rect;
    if (!Array.isArray(rect) || rect.length!==4 || !rect.every(Number.isInteger)) continue;
    const [x,y,w,h]=rect;
    if (x<0 || y<0 || w<8 || h<8 || x+w>original.width || y+h>original.height || !Number.isSafeInteger(saved.id) || saved.id<1 || regions.some(r=>r.id===saved.id)) continue;
    const patch=document.createElement("canvas"); patch.width=w; patch.height=h;
    patch.getContext("2d").drawImage(original,...rect,0,0,w,h);
    const canvas=document.createElement("canvas"); canvas.width=w; canvas.height=h;
    canvas.getContext("2d").drawImage(patch,0,0);
    let edited=false;
    if (typeof saved.image === "string" && saved.image.startsWith("data:image/png;base64,")) {
      try {
        const image=new Image(); image.src=saved.image; await image.decode();
        if (image.naturalWidth===w && image.naturalHeight===h) {
          const ctx=canvas.getContext("2d"); ctx.clearRect(0,0,w,h); ctx.drawImage(image,0,0); edited=true;
        }
      } catch (error) { console.warn("[分区抠图] 修整蒙版恢复失败，保留选框",error); }
    }
    regions.push({id:saved.id,color:Number.isInteger(saved.color) && saved.color>=1 && saved.color<=6 ? saved.color : (saved.id-1)%6+1,rect:rect.slice(),canvas,original:patch,undo:[],matted:false,edited});
  }
  return regions;
}
async function openManualMatting(sourceCanvas, sourceNodeId) {
  if (document.querySelector(".manual-matting") || !sourceCanvas.width || !sourceCanvas.height) return;
  const original = document.createElement("canvas");
  original.width = sourceCanvas.width;
  original.height = sourceCanvas.height;
  original.getContext("2d").drawImage(sourceCanvas, 0, 0);
  const pageId = state.activePageId;
  const signature = mattingImageSignature(original);
  const draft = findNode(sourceNodeId)?.mattingDraft;
  const regions = await restoreMattingRegions(draft, signature, original);
  if (state.activePageId !== pageId || !findNode(sourceNodeId) || document.querySelector(".manual-matting")) return;
  const previousFocus = document.activeElement;
  const dialog = document.createElement("div");
  dialog.className = "manual-matting";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "手动分区抠图");
  dialog.tabIndex = -1;
  dialog.innerHTML = `<div class="mm-panel">
    <header><strong>手动分区抠图</strong><span>原图上拖动添加选框，选择选框后放大修整</span><button type="button" data-action="close" aria-label="关闭手动抠图">关闭</button></header>
    <div class="mm-workspace"><div class="mm-preview"><div class="mm-scroll"><div class="mm-surface"><canvas aria-label="图片选框和蒙版编辑区"></canvas><div class="mm-boxes"></div></div></div><p class="mm-status" role="status"></p></div>
    <aside aria-label="选区列表"><strong>原图与选框</strong><div class="mm-list"></div></aside></div>
    <footer><div class="mm-tools"><button type="button" data-action="original">添加选框</button><button type="button" data-action="restore">恢复画笔</button><button type="button" data-action="erase">擦除画笔</button><label>笔刷 <input aria-label="笔刷大小" class="mm-size" type="range" min="4" max="120" value="24"></label><button type="button" data-action="undo">撤销</button><label>缩放 <select class="mm-zoom" aria-label="预览缩放"><option value="fit">适合窗口</option><option value="1">100%</option><option value="2">200%</option><option value="4">400%</option></select></label></div><div class="mm-tools"><label>抠图模型 <select class="mm-model" aria-label="抠图模型"><option value="image25">${activeApiType() === "apimart" ? "GPT Image 2.5 Flare" : "GPT Image 2.5"}</option><option value="local">本地 BiRefNet</option><option value="local-lite">本地 U²-Net 快速</option></select></label></div><div class="mm-actions"><button type="button" class="primary" data-action="export">确认</button></div></footer>
  </div>`;
  // Inherit the app's theme and user-customized semantic color variables.
  els.app.append(dialog);
  const canvas = dialog.querySelector("canvas"), ctx = canvas.getContext("2d");
  const surface = dialog.querySelector(".mm-surface"), scroll = dialog.querySelector(".mm-scroll");
  const boxes = dialog.querySelector(".mm-boxes"), list = dialog.querySelector(".mm-list");
  const status = dialog.querySelector(".mm-status"), zoom = dialog.querySelector(".mm-zoom");
  const modelSelect = dialog.querySelector(".mm-model");
  modelSelect.onchange = () => { submissionError=""; redraw(); };
  if (draft?.signature === signature && String(draft.model || "").startsWith("local")) modelSelect.value=draft.model;
  let selected = null, mode = "erase", drag = null, busy = false, counter = regions.reduce((max,region)=>Math.max(max,region.id),0), adding = false, submissionError = "", confirmation = null;
  const button = action => dialog.querySelector(`[data-action="${action}"]`);
  function close() {
    if (busy) return;
    if (confirmation) { confirmation.cancel(); return; }
    const node = state.activePageId === pageId ? findNode(sourceNodeId) : null;
    if (node) {
      const saved = serializeMattingDraft(signature,modelSelect.value,regions);
      if (JSON.stringify(node.mattingDraft) !== JSON.stringify(saved)) {
        node.mattingDraft = saved;
        pushHistory();
      }
    }
    observer.disconnect();
    document.removeEventListener("keydown", handleKey, true);
    dialog.remove();
    previousFocus?.focus();
  }
  function fit() {
    const scale = zoom.value === "fit" ? Math.max(0.01, Math.min((scroll.clientWidth - 32) / canvas.width, (scroll.clientHeight - 32) / canvas.height, 2)) : Number(zoom.value);
    surface.style.width = `${Math.max(1, canvas.width * scale)}px`;
    surface.style.height = `${Math.max(1, canvas.height * scale)}px`;
  }
  function redraw() {
    const image = selected ? selected.canvas : original;
    canvas.width = image.width; canvas.height = image.height;
    ctx.drawImage(image, 0, 0);
    boxes.replaceChildren();
    boxes.classList.toggle("is-adding", adding);
    if (!selected) for (const region of regions) {
      const box = document.createElement("button");
      box.type = "button"; box.className = "mm-box";
      box.setAttribute("aria-label", `编辑选框 ${region.id}`);
      box.style.setProperty("--region-color", `var(--region-${region.color})`);
      const [x,y,w,h] = region.rect;
      Object.assign(box.style, { left: `${x / original.width * 100}%`, top: `${y / original.height * 100}%`, width: `${w / original.width * 100}%`, height: `${h / original.height * 100}%` });
      box.textContent = region.id;
      box.onclick = () => select(region);
      boxes.append(box);
    }
    list.replaceChildren();
    for (const region of [null, ...regions]) {
      const item = document.createElement("div"); item.className = "mm-list-item";
      const row = document.createElement("button"); row.type = "button";
      row.className = "mm-row"; row.setAttribute("aria-pressed", String(selected === region));
      const dot = document.createElement("span"); dot.className = "mm-dot";
      dot.style.background = region ? `var(--region-${region.color})` : "var(--muted)";
      row.append(dot, document.createTextNode(region ? `选框 ${region.id}` : "原图"));
      row.onclick = () => select(region); row.disabled = busy; item.append(row);
      if (region) {
        const remove = document.createElement("button");
        remove.type = "button"; remove.className = "mm-remove";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `取消选框 ${region.id}`);
        remove.disabled = busy;
        remove.onclick = () => {
          if (busy || drag) return;
          regions.splice(regions.indexOf(region),1);
          if (selected === region) selected=null;
          redraw();
        };
        item.append(remove);
      }
      list.append(item);
    }
    for (const action of ["restore", "erase"]) button(action).disabled = busy || !selected;
    button("undo").disabled = busy || !selected?.undo.length;
    button("export").disabled = busy || !regions.length;
    button("original").disabled = busy;
    button("close").disabled = busy;
    zoom.disabled = busy;
    modelSelect.disabled = busy;
    dialog.querySelector(".mm-size").disabled = busy || !selected;
    button("restore").setAttribute("aria-pressed", String(!!selected && mode === "restore"));
    button("erase").setAttribute("aria-pressed", String(!!selected && mode === "erase"));
    button("original").setAttribute("aria-pressed", String(adding));
    status.classList.toggle("is-error", Boolean(submissionError));
    status.setAttribute("role", submissionError ? "alert" : "status");
    const apiLabel = modelSelect.value === "local" ? "本地 BiRefNet（无需 API Key）" : modelSelect.value === "local-lite" ? "本地 U²-Net 快速（无需 API Key）" : activeApiType() === "agtoken" ? "AGToken" : "APIMart";
    const instruction = selected ? `选框 ${selected.id} · ${canvas.width} × ${canvas.height} · 恢复画笔补回原图，擦除画笔移除像素；放大后用滚动条移动视野` : adding ? "拖动添加选框，可与已有选框重叠；右侧选择选框进入局部编辑。" : "拖动绘制选框；点击右侧选框或彩色框进入局部编辑。";
    status.textContent = submissionError || (busy ? "正在将选区加入抠图队列，请稍候…" : `${instruction} 当前 API：${apiLabel}，已选 ${regions.length} 个区域。`);
    fit();
    if (!dialog.contains(document.activeElement)) dialog.focus({preventScroll:true});
  }
  function select(region) { if (busy || drag) return; selected = region; adding = false; zoom.value = "fit"; redraw(); scroll.scrollTo(0,0); }
  function point(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: Math.max(0,Math.min(canvas.width,(event.clientX-bounds.left)*canvas.width/bounds.width)), y: Math.max(0,Math.min(canvas.height,(event.clientY-bounds.top)*canvas.height/bounds.height)) };
  }
  function snapshot() {
    selected.undo.push({pixels:selected.canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height),matted:selected.matted});
    if (selected.undo.length > 8) selected.undo.shift();
  }
  function stroke(from, to) {
    selected.edited = true;
    const target = selected.canvas.getContext("2d");
    target.save();
    target.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";
    target.lineWidth = Number(dialog.querySelector(".mm-size").value);
    target.lineCap = "round"; target.lineJoin = "round";
    if (mode === "restore") {
      target.strokeStyle = target.createPattern(selected.original,"no-repeat");
    }
    target.beginPath(); target.moveTo(from.x,from.y); target.lineTo(to.x + 0.01,to.y); target.stroke(); target.restore();
    ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(selected.canvas,0,0);
  }
  canvas.onpointerdown = event => {
    if (busy || event.button !== 0) return;
    event.preventDefault(); canvas.setPointerCapture(event.pointerId);
    const p = point(event); drag = { start:p, last:p, pointerId:event.pointerId };
    if (selected) { snapshot(); stroke(p,p); }
  };
  canvas.onpointermove = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const p = point(event);
    if (selected) stroke(drag.last,p);
    else {
      ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(original,0,0);
      ctx.strokeStyle = getComputedStyle(dialog).getPropertyValue(`--region-${counter % 6 + 1}`).trim();
      ctx.lineWidth = 2 * canvas.width / canvas.getBoundingClientRect().width;
      ctx.strokeRect(drag.start.x,drag.start.y,p.x-drag.start.x,p.y-drag.start.y);
    }
    drag.last = p;
  };
  function finish(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag; drag = null;
    if (!selected && event.type !== "pointercancel") {
      const a = current.start, b = point(event);
      const rect = [Math.floor(Math.min(a.x,b.x)),Math.floor(Math.min(a.y,b.y)),Math.ceil(Math.abs(a.x-b.x)),Math.ceil(Math.abs(a.y-b.y))];
      rect[2] = Math.min(rect[2],original.width-rect[0]); rect[3] = Math.min(rect[3],original.height-rect[1]);
      if (rect[2]>=8 && rect[3]>=8) {
        const image = document.createElement("canvas"); image.width=rect[2]; image.height=rect[3];
        image.getContext("2d").drawImage(original,...rect,0,0,image.width,image.height);
        const patch = document.createElement("canvas"); patch.width=image.width; patch.height=image.height;
        patch.getContext("2d").drawImage(image,0,0);
        regions.push({id:++counter,color:(counter-1)%6+1,rect,canvas:image,original:patch,undo:[],matted:false});
      }
    }
    redraw();
  }
  canvas.onpointerup = finish; canvas.onpointercancel = finish;
  button("close").onclick = close;
  button("original").onclick = () => { select(null); adding=true; redraw(); };
  button("restore").onclick = () => { mode="restore"; redraw(); };
  button("erase").onclick = () => { mode="erase"; redraw(); };
  button("undo").onclick = () => { const data=selected?.undo.pop(); if (data) { selected.canvas.getContext("2d").putImageData(data.pixels,0,0); selected.matted=data.matted; } redraw(); };
  zoom.onchange = fit;
  function confirmSubmission(apiType) {
    return new Promise(resolve => {
      const onlineModelLabel = apiType === "apimart" ? "GPT Image 2.5 Flare" : "GPT Image 2.5";
      const lite = apiType === "local-lite";
      const localLabel = lite ? "本地 U²-Net 快速" : "本地 BiRefNet";
      const panel = dialog.querySelector(".mm-panel");
      const overlay = document.createElement("div");
      overlay.className = "mm-confirm";
      overlay.innerHTML = `<section class="mm-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="mmConfirmTitle" aria-describedby="mmConfirmDescription">
        <h2 id="mmConfirmTitle">确认分区抠图</h2>
        <p id="mmConfirmDescription">${lite ? "将使用本地 U²-Net 快速模型进行抠图，无需 API Key，每个选区生成一张透明 PNG。" : apiType === "local" ? "将使用本地 BiRefNet 进行抠图，无需 API Key，每个选区生成一张透明 PNG。" : `将使用 ${onlineModelLabel} 进行抠图，每个选区生成一张图片。`}</p>
        <dl><div><dt>生成张数</dt><dd>${regions.length} 张（${regions.length} 个选区）</dd></div>
        <div><dt>使用模型</dt><dd>${lite ? "U²-Net u2netp（本地拓展模型）" : apiType === "local" ? "BiRefNet（本地服务当前加载的模型）" : onlineModelLabel}</dd></div>
        <div><dt>使用 API</dt><dd>${lite || apiType === "local" ? "自动抠图拓展（自动运行）" : apiType === "agtoken" ? "AGToken" : "APIMart"}</dd></div>
        <div><dt>提示词</dt><dd>${lite || apiType === "local" ? "本地模型直接移除选区背景" : "将图片中主体抠出、透明背景"}</dd></div></dl>
        <div class="mm-confirm-actions"><button type="button" data-confirm-cancel>返回调整</button><button type="button" class="primary" data-confirm-submit>开始抠图</button></div>
      </section>`;
      const finish = accepted => {
        panel.inert = false;
        overlay.remove();
        confirmation = null;
        button("export").focus({preventScroll:true});
        resolve(accepted);
      };
      confirmation = {element:overlay,cancel:()=>finish(false)};
      overlay.querySelector("[data-confirm-cancel]").onclick = () => finish(false);
      overlay.querySelector("[data-confirm-submit]").onclick = () => finish(true);
      panel.inert = true;
      dialog.append(overlay);
      overlay.querySelector("[data-confirm-cancel]").focus();
    });
  }
  button("export").onclick = async () => {
    if (busy || confirmation || !regions.length) return;
    submissionError = "";
    const selectedApiType = modelSelect.value.startsWith("local") ? modelSelect.value : activeApiType();
    if (!await confirmSubmission(selectedApiType)) return;
    busy=true; redraw();
    try {
      const {count,apiType} = enqueueRegionMatting(sourceNodeId,regions,[original.width,original.height],selectedApiType);
      busy=false; close(); render();
      setTaskQueueOpen(true);
      const onlineModelLabel = apiType === "apimart" ? "GPT Image 2.5 Flare" : "GPT Image 2.5";
      toast(`${apiType === "local" ? "本地 BiRefNet" : apiType === "local-lite" ? "本地 U²-Net 快速" : onlineModelLabel + " · " + (apiType === "agtoken" ? "AGToken" : "APIMart")} · ${count} 个选区已加入抠图队列`);
      pumpAiTaskQueue();
    } catch (error) {
      submissionError = `无法提交：${error.message || "发生未知错误，请重试"}`;
      busy=false;
      redraw();
      console.error("[分区抠图] 确认提交失败", {nodeId:sourceNodeId,apiType:activeApiType(),regionCount:regions.length,message:error.message});
    }
  };
  function handleKey(event) {
    // Canvas shortcuts must remain blocked even when replacing a list row loses focus.
    event.stopImmediatePropagation();
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key === "Tab") {
      const scope = confirmation?.element || dialog;
      const controls=[...scope.querySelectorAll("button,input,select")].filter(el=>!el.disabled && !el.hidden);
      const first=controls[0],last=controls[controls.length-1];
      if (event.shiftKey && (document.activeElement===first || !controls.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement===last || !controls.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener("keydown", handleKey, true);
  const observer=new ResizeObserver(fit); observer.observe(scroll);
  redraw(); button("original").focus();
}

