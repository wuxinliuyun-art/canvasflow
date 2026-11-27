const test = require("node:test");
const assert = require("node:assert/strict");
const { detectWorkflowMapping, detectWorkflowType, normalizeServerUrl, fitWorkflowModels, fetchUserWorkflows, classifyUserWorkflow, videoFrameLength, sdImageSize, pickVirtualOutputNode, loadStore, preparePrompt, fetchObjectInfoSubset } = require("../modules/comfyui-server");

function baseWorkflow() {
  return {
    "1": { class_type: "CLIPTextEncode", inputs: { text: "prompt" }, _meta: { title: "Positive Prompt" } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "bad" }, _meta: { title: "Negative Prompt" } },
    "3": { class_type: "KSampler", inputs: { seed: 1, denoise: 0.7 } },
    "9": { class_type: "SaveImage", inputs: { images: ["3", 0] } },
  };
}

// 映射检测"尽力而为"（2026-11-14 重构）：除工作流格式错误外零抛错，能识别多少映射多少；
// 字段名与旧存档 mapping 兼容，新增可选 positiveField/negativeField。

test("txt2img detects prompt, negative, sampler and output", () => {
  const mapping = detectWorkflowMapping(baseWorkflow());
  assert.equal(mapping.positiveNodeId, "1");
  assert.equal(mapping.negativeNodeId, "2");
  assert.equal(mapping.samplerNodeId, "3");
  assert.equal(mapping.denoiseField, "denoise");
  assert.deepEqual(mapping.outputNodeIds, ["9"]);
  assert.equal(mapping.positiveField, undefined); // text 字段省略（旧存档兼容形状）
});

test("untitled CLIPTextEncode pair maps the second as negative", () => {
  const workflow = {
    "1": { class_type: "CLIPTextEncode", inputs: { text: "p" } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "n" } },
  };
  const mapping = detectWorkflowMapping(workflow);
  assert.equal(mapping.positiveNodeId, "1");
  assert.equal(mapping.negativeNodeId, "2");
});

test("mixed-field text nodes skip the second-as-negative convention (H3 prompt must not be zeroed)", () => {
  const workflow = {
    "1": { class_type: "MiniMaxH3ImageToVideo", inputs: { prompt: "move", length: 124, seed: 7 }, _meta: { title: "H3" } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "plain" } },
  };
  const mapping = detectWorkflowMapping(workflow);
  assert.equal(mapping.negativeNodeId, undefined);
  assert.equal(mapping.positiveNodeId, "1");
  assert.equal(mapping.positiveField, "prompt");
  assert.equal(mapping.durationNodeId, "1");
  assert.equal(mapping.durationField, "length");
  assert.equal(mapping.samplerNodeId, "1"); // 无 KSampler：数值 seed 节点兜底
  assert.equal(mapping.seedField, "seed");
});

test("SeedVR2-shaped workflow (no SaveImage/CLIPTextEncode/KSampler) imports with best-effort mapping", () => {
  const workflow = {
    "1": { class_type: "SeedVR2", inputs: { prompt: "enhance", seed: 42, cfg: 1.0 }, _meta: { title: "PS桥接-SeedVR2-倍-API" } },
    "2": { class_type: "LoadImage", inputs: { image: "input.png" }, _meta: { title: "SeedVR2 输入" } },
    "3": { class_type: "VHS_VideoCombine", inputs: { images: ["1", 0] } },
  };
  const mapping = detectWorkflowMapping(workflow); // 不得抛"缺少输出节点"
  assert.equal(mapping.positiveNodeId, "1");
  assert.equal(mapping.positiveField, "prompt");
  assert.equal(mapping.samplerNodeId, "1");
  assert.equal(mapping.seedField, "seed");
  assert.equal(mapping.imageNodeId, "2");
  assert.equal(mapping.outputNodeIds, undefined); // 无 SaveImage/SaveVideo 类，不再强制
  assert.equal(mapping.params, undefined);
});

test("workflow with nothing recognizable maps to an empty object", () => {
  assert.deepEqual(detectWorkflowMapping({ "1": { class_type: "SomeCustomNode", inputs: { value: 3 } } }), {});
});

test("multiple samplers no longer throw; the first wins", () => {
  const workflow = baseWorkflow();
  workflow["4"] = { class_type: "KSamplerAdvanced", inputs: { noise_seed: 9 } };
  const mapping = detectWorkflowMapping(workflow);
  assert.equal(mapping.samplerNodeId, "3");
  assert.equal(mapping.seedField, "seed");
});

test("image/mask mapping follows LoadImage titles, no hard requirement", () => {
  const workflow = baseWorkflow();
  workflow["4"] = { class_type: "LoadImage", inputs: { image: "input.png" }, _meta: { title: "Source Image" } };
  let mapping = detectWorkflowMapping(workflow);
  assert.equal(mapping.imageNodeId, "4");
  assert.equal(mapping.maskNodeId, undefined);
  workflow["5"] = { class_type: "LoadImage", inputs: { image: "mask.png" }, _meta: { title: "Inpaint Mask" } };
  mapping = detectWorkflowMapping(workflow);
  assert.equal(mapping.imageNodeId, "4");
  assert.equal(mapping.maskNodeId, "5");
});

test("size params only map onto Latent/Empty/MiniMaxH3 classes", () => {
  const workflow = baseWorkflow();
  workflow["4"] = { class_type: "MyWeirdNode", inputs: { width: 512, height: 512 } };
  assert.equal(detectWorkflowMapping(workflow).params, undefined);
  workflow["4"].class_type = "EmptySD3LatentImage";
  const mapping = detectWorkflowMapping(workflow);
  assert.deepEqual(mapping.params, [
    { param: "width", nodeId: "4", field: "width" },
    { param: "height", nodeId: "4", field: "height" },
  ]);
});

test("invalid workflows still report format errors", () => {
  assert.throws(() => detectWorkflowMapping("not an object"), /API 格式/);
  assert.throws(() => detectWorkflowMapping({ nodes: [] }), /API 节点|API 格式/);
});

test("server URL rejects credentials and non-http schemes", () => {
  assert.equal(normalizeServerUrl("http://127.0.0.1:8188/"), "http://127.0.0.1:8188");
  assert.throws(() => normalizeServerUrl("file:///tmp/comfy"), /HTTP/);
  assert.throws(() => normalizeServerUrl("http://user:pass@127.0.0.1:8188"), /HTTP/);
});

test("videoFrameLength snaps seconds onto the 17k+5 grid at 24fps", () => {
  assert.equal(videoFrameLength(5), 124);
  assert.equal(videoFrameLength(2), 39);
  assert.equal(videoFrameLength(3), 73);
  assert.equal(videoFrameLength(10), 243);
  assert.equal(videoFrameLength(15), 362);
  assert.equal(videoFrameLength(0), 39);   // 下限 2 秒
  assert.equal(videoFrameLength(99), 362); // 上限 15 秒
  assert.equal(videoFrameLength(), 124);   // 默认 5 秒
});

test("sdImageSize maps resolution( long edge ) and ratio onto 32-aligned pixels", () => {  assert.deepEqual(sdImageSize("1K", "1:1"), { width: 1024, height: 1024 });
  assert.deepEqual(sdImageSize("1K", "16:9"), { width: 1024, height: 576 });
  assert.deepEqual(sdImageSize("1K", "4:3"), { width: 1024, height: 768 });
  assert.deepEqual(sdImageSize("1K", "9:16"), { width: 576, height: 1024 });
  assert.deepEqual(sdImageSize("2K", "4:3"), { width: 2048, height: 1536 });
  assert.deepEqual(sdImageSize("0.5K", "3:2"), { width: 512, height: 352 });
  assert.deepEqual(sdImageSize(undefined, undefined), { width: 1024, height: 1024 }); // 默认 1K/1:1
  assert.deepEqual(sdImageSize("8K", "乱码"), { width: 1024, height: 1024 }); // 未知档位回退
});

test("detectWorkflowType handles edge cases", () => {
  const txt2img = { "1": { class_type: "CLIPTextEncode", inputs: { text: "" } }, "2": { class_type: "KSampler", inputs: { seed: 0 } }, "3": { class_type: "SaveImage", inputs: { images: ["2", 0] } } };
  assert.equal(detectWorkflowType(txt2img), "txt2img");
  const i2vWithLastFrame = { "1": { class_type: "LoadImage", inputs: { image: "a.png" } }, "2": { class_type: "SaveVideo", inputs: { video: ["3", 0] } } };
  assert.equal(detectWorkflowType(i2vWithLastFrame), "video-i2v");
  // SeedVR2 类（无 SaveVideo）：仅作展示标签，不影响任何功能门控
  const seedvr = { "1": { class_type: "LoadImage", inputs: { image: "a.png" } }, "2": { class_type: "SeedVR2", inputs: { seed: 1 } } };
  assert.equal(detectWorkflowType(seedvr), "img2img");
});

test("fitWorkflowModels rewrites stale model names by prefer patterns", () => {
  const workflow = { "1": { class_type: "UNETLoader", inputs: { unet_name: "old.safetensors" } } };
  const hints = [{ nodeId: "1", field: "unet_name", prefer: [["flux2", "klein"]] }];
  const objectInfo = { UNETLoader: { input: { required: { unet_name: [["Flux2-Klein-9B-True-V3-fp8mixed.safetensors", "krea2_turbo_fp8.safetensors"]] } } } };
  fitWorkflowModels(workflow, hints, objectInfo);
  assert.equal(workflow["1"].inputs.unet_name, "Flux2-Klein-9B-True-V3-fp8mixed.safetensors");
});

test("fitWorkflowModels keeps values already present on this machine", () => {
  const workflow = { "3": { class_type: "SDMatteApply", inputs: { ckpt_name: "SDMatte_plus.safetensors" } } };
  const hints = [{ nodeId: "3", field: "ckpt_name", prefer: [["sdmatte_plus"]] }];
  const objectInfo = { SDMatteApply: { input: { required: { ckpt_name: [["SDMatte_plus.safetensors", "SDMatte.safetensors"]] } } } };
  fitWorkflowModels(workflow, hints, objectInfo);
  assert.equal(workflow["3"].inputs.ckpt_name, "SDMatte_plus.safetensors");
});

test("fitWorkflowModels reports missing models instead of failing silently", () => {
  const workflow = { "1": { class_type: "UpscaleModelLoader", inputs: { model_name: "4x-UltraSharp.pth" } } };
  const hints = [{ nodeId: "1", field: "model_name", prefer: [["omnisr"]] }];
  const objectInfo = { UpscaleModelLoader: { input: { required: { model_name: [["RealESRGAN_x4plus.pth"]] } } } };
  assert.throws(() => fitWorkflowModels(workflow, hints, objectInfo), /缺少工作流需要的模型/);
});

test("classifyUserWorkflow separates API format, UI format and garbage", () => {
  const api = baseWorkflow();
  api.extra_data = { api_key: "x" };
  api.output = {};
  assert.equal(classifyUserWorkflow(api), "api");
  assert.equal(classifyUserWorkflow({ nodes: [{ id: 1 }], links: [] }), "ui");
  assert.equal(classifyUserWorkflow({ anyKey: "plain text" }), "unknown");
  assert.equal(classifyUserWorkflow(null), "unknown");
  assert.equal(classifyUserWorkflow([1, 2, 3]), "unknown");
});

test("fetchUserWorkflows lists, classifies and tolerates per-file failures", async () => {
  const list = [
    { path: "workflows", type: "directory" },
    { path: "workflows/正常.png", type: "file", size: 1, modified: 50 },
    { path: "workflows/ui 画布.json", type: "file", size: 10, modified: 9 },
    { path: "workflows/子目录/broken 中文.json", type: "file", size: 10, modified: 99 },
    { path: "workflows/API导出.json", type: "file", size: 10, modified: 5 },
  ];
  const contents = {
    "workflows/ui 画布.json": { nodes: [], links: [] },
    "workflows/子目录/broken 中文.json": "{这不是JSON",
    "workflows/API导出.json": baseWorkflow(),
  };
  const requestedUrls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    requestedUrls.push(String(url));
    const path = decodeURIComponent(String(url).split("/userdata/")[1] || "");
    if (String(url).includes("/v2/userdata")) {
      return { ok: true, status: 200, json: async () => list };
    }
    if (!(path in contents)) return { ok: false, status: 404, json: async () => ({}) };
    const parsed = contents[path];
    const text = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    return { ok: true, status: 200, json: async () => parsed, text: async () => text };
  };
  try {
    const result = await fetchUserWorkflows("http://127.0.0.1:8188/");
    assert.equal(result.length, 3); // 目录与非 json 被过滤
    const byPath = Object.fromEntries(result.map(item => [item.path, item]));
    // modified 降序：broken(99) → ui(9) → api(5)
    assert.deepEqual(result.map(item => item.name), ["broken 中文", "ui 画布", "API导出"]);
    assert.equal(byPath["workflows/API导出.json"].format, "api");
    assert.equal(byPath["workflows/API导出.json"].importable, true);
    assert.equal(byPath["workflows/API导出.json"].workflow["1"].class_type, "CLIPTextEncode");
    assert.equal(byPath["workflows/ui 画布.json"].format, "ui");
    assert.equal(byPath["workflows/ui 画布.json"].importable, false);
    assert.equal(byPath["workflows/ui 画布.json"].workflow, undefined);
    assert.equal(byPath["workflows/子目录/broken 中文.json"].format, "unknown");
    assert.equal(byPath["workflows/子目录/broken 中文.json"].importable, false);
    assert.ok(byPath["workflows/子目录/broken 中文.json"].error);
    // 取文件 URL：斜杠必须编码成 %2F 才能命中 /userdata/{file} 单段路由
    assert.ok(requestedUrls.some(url => url.endsWith("/userdata/workflows%2F%E5%AD%90%E7%9B%AE%E5%BD%95%2Fbroken%20%E4%B8%AD%E6%96%87.json")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchUserWorkflows surfaces list failures as an error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  try {
    await assert.rejects(fetchUserWorkflows("http://127.0.0.1:8188/"), /读取 ComfyUI 工作流列表失败/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// 2026-11-14 用户要求"工作流只能从设置里添加过于鸡肋，把对应的功能直接放到节点上"
const fs = require("node:fs");
const path = require("node:path");
const localSdSource = fs.readFileSync(path.join(__dirname, "..", "modules", "local-sd.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

test("local-sd node hosts workflow adding: import-json / fetch-from-comfy buttons on the node", () => {
  assert.match(localSdSource, /<div class="sd-wf-actions"><button type="button" data-role="sd-import-json"/);
  assert.match(localSdSource, /data-role="sd-fetch-comfy"/);
  assert.match(localSdSource, /role === "sd-import-json"\) importJsonToNode\(node\)/);
  assert.match(localSdSource, /role === "sd-fetch-comfy"\) openComfyWorkflowPicker\(node\.id\)/);
});

test("workflow select occupies its own full row; uncheckable items explain why (2026-11-14 用户反馈)", () => {
  // 工作流下拉独立整行：按钮行在前，带 sd-workflow-field 类的下拉随后（styles.css 中两块都 grid-column: 1 / -1）
  assert.match(localSdSource, /\$\{wfActions\}<label class="sd-workflow-field"><span>工作流<\/span>/);
  assert.match(stylesSource, /\.sd-wf-actions \{[^}]*grid-column: 1 \/ -1/);
  assert.match(stylesSource, /\.sd-workflow-field \{ grid-column: 1 \/ -1; \}/);
  // 不可勾选条目（UI 格式/已导入/读取失败）带 title 说明原因，列表顶部有提示行
  assert.match(localSdSource, /function userWorkflowItemHtml\(item\)/);
  assert.match(localSdSource, /UI 格式暂不支持导入/);
  assert.match(localSdSource, /function userWorkflowHintHtml\(\)/);
  assert.match(localSdSource, /仅「API格式」可勾选导入/);
  assert.match(localSdSource, /cache\.userList\.map\(userWorkflowItemHtml\)/);
});

test("node-side import auto-selects the new workflow; picker imports are root-scoped", () => {
  // importFile 返回新工作流 id，节点导入后自动选中
  assert.match(localSdSource, /async function importFile\(file, replaceId = ""\) \{[\s\S]*?let newId = "";[\s\S]*?return newId;/);
  // importSelectedUserWorkflows 支持任意容器（设置面板或节点弹层）并返回导入 id
  assert.match(localSdSource, /async function importSelectedUserWorkflows\(root = document\.getElementById\("comfyUserListPanel"\)\)/);
  assert.match(localSdSource, /root\?\.querySelectorAll\("\.comfy-user-check:checked"\)/);
  assert.match(localSdSource, /return \{ imported, failures, ids \};/);
  // 弹层导入后自动选中第一个新工作流
  assert.match(localSdSource, /fresh\._sdWorkflowId = result\.ids\[0\]; pushHistory\(\); toast\("已在节点上选中导入的工作流"\);/);
  // loadUserWorkflows 不再内部渲染（设置面板与节点弹层各自负责渲染）
  const loadSlice = localSdSource.match(/async function loadUserWorkflows\(\) \{[\s\S]*?\n  \}/)[0];
  assert.ok(!loadSlice.includes("renderUserList()"), "loadUserWorkflows must not render internally");
});

// 2026-11-14 PS 桥接工作流（GetImageFromPS 入口 / SendImageToPS 出口）实测驱动的三处修复
test("PS-bridge shaped workflow maps image entry by filename field and picks virtual output", () => {
  const workflow = {
    "1": { class_type: "GetImageFromPS", inputs: { image_filename: "", mask_filename: "__xyps_no_mask__" } },
    "2": { class_type: "ImageScaleBy", inputs: { image: ["1", 0], upscale_method: "lanczos", scale_by: 2 } },
    "3": { class_type: "KSampler", inputs: { seed: 9527, denoise: 1 } },
    "9": { class_type: "VAEDecodeTiled", inputs: { samples: ["8", 0] } },
    "10": { class_type: "SeedVR2PostProcessing", inputs: { images: ["9", 0] } },
    "11": { class_type: "SendImageToPS", inputs: { images: ["10", 0], client_id: "" } },
  };
  const mapping = detectWorkflowMapping(workflow);
  assert.equal(mapping.imageNodeId, "1");
  assert.equal(mapping.imageField, "image_filename"); // 非标准 image 字段必须显式记录
  assert.equal(mapping.samplerNodeId, "3");
  assert.equal(mapping.negativeNodeId, undefined);
  assert.equal(pickVirtualOutputNode(workflow), "10"); // SendImageToPS 的图链上游
});

test("workflows with real output nodes never get a virtual injection point", () => {
  assert.equal(pickVirtualOutputNode(baseWorkflow()), ""); // 终端是 SaveImage
  const preview = baseWorkflow();
  delete preview["9"];
  preview["8"] = { class_type: "PreviewImage", inputs: { images: ["3", 0] } };
  assert.equal(pickVirtualOutputNode(preview), ""); // 终端是 PreviewImage 同样不注入
});

// 2026-11-14 用户要求清除内置模板残留（"内置放大/局部重绘这种需要蒙版输入的没法正常运行"）
test("loadStore sweeps builtin template leftovers from old installs", t => {
  // Use the writable workspace: the Windows sandbox temp filesystem can reject atomic replacement.
  const fixtureRoot = path.join(__dirname, "..", ".codex-tmp");
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const dataRoot = fs.mkdtempSync(path.join(fixtureRoot, "comfy-"));
  t.after(() => fs.rmSync(dataRoot, { recursive: true, force: true }));
  const storeDir = path.join(dataRoot, "data");
  fs.mkdirSync(storeDir, { recursive: true });
  const workflow = { "1": { class_type: "KSampler", inputs: { seed: 1 } } };
  fs.writeFileSync(path.join(storeDir, "comfyui.json"), JSON.stringify({
    config: { serverUrl: "http://127.0.0.1:8188" },
    workflows: [
      { id: "a", name: "内置 · OmniSR 2倍放大", templateId: "builtin-omnisr-upscale", workflow, mapping: {} },
      { id: "b", name: "我的工作流", workflow, mapping: {} },
    ],
  }), "utf8");
  const store = loadStore(dataRoot);
  assert.deepEqual(store.workflows.map(entry => entry.name), ["我的工作流"]);
  // 清扫结果落盘（重启后不会回来）
  const persisted = JSON.parse(fs.readFileSync(path.join(storeDir, "comfyui.json"), "utf8"));
  assert.equal(persisted.workflows.length, 1);
});

test("loadStore preserves readable workflows when migration cannot be saved", () => {
  const vm = require("node:vm");
  const source = fs.readFileSync(path.join(__dirname, "..", "modules", "comfyui-server.js"), "utf8");
  const start = source.indexOf("function loadStore(");
  const end = source.indexOf("function saveStore(", start);
  const warnings = [];
  const context = {
    fs: { readFileSync: () => JSON.stringify({ workflows: [{ name: "我的工作流", workflow: {} }] }) },
    storePath: () => "fixture.json",
    detectWorkflowMapping: () => ({}),
    saveStore: () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); },
    console: { log() {}, warn: message => warnings.push(message) }
  };
  vm.runInNewContext(source.slice(start, end), context);
  const store = context.loadStore("fixture");
  assert.equal(store.workflows[0].name, "我的工作流");
  assert.equal(store.workflows[0].mappingVersion, 2);
  assert.match(warnings[0], /EACCES/);
});

// ---------- 全参数面板（2026-11-14 用户要求"把 ComfyUI 节点参数在画布中显示，修改后再回传"）----------

function okJson(data) { return { ok: true, status: 200, json: async () => data }; }

// preparePrompt 双改动：图片喂全部图片入口节点（蒙版入口走 maskData 单独喂）；paramValues 在 mapping 补丁之后替换
test("preparePrompt feeds the upstream image to every image-entry node and applies paramValues last", async () => {
  const item = {
    workflow: {
      "1": { class_type: "CLIPTextEncode", inputs: { text: "old" }, _meta: { title: "Positive" } },
      "2": { class_type: "KSampler", inputs: { seed: 1, denoise: 0.7, steps: 8 } },
      "3": { class_type: "LoadImage", inputs: { image: "a.png" }, _meta: { title: "Mask 蒙版" } },
      "4": { class_type: "LoadImage", inputs: { image: "b.png" }, _meta: { title: "Source" } },
      "5": { class_type: "GetImageFromPS", inputs: { image_filename: "c.png" } },
      "9": { class_type: "SaveImage", inputs: { images: ["2", 0] } },
    },
    mapping: {},
  };
  item.mapping = detectWorkflowMapping(item.workflow);
  assert.equal(item.mapping.imageNodeId, "4");
  assert.equal(item.mapping.maskNodeId, "3");
  let uploads = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/upload/image")) { uploads += options?.body ? 1 : 0; return okJson({ name: uploads === 1 ? "src.png" : "mask.png" }); }
    return { ok: false, status: 500, json: async () => ({}) };
  };
  try {
    const prompt = await preparePrompt(item, { prompt: "hello", seed: 1, denoise: 0.5, imageData: "data:image/png;base64,AAAA", maskData: "data:image/png;base64,BBBB", paramValues: { "2": { seed: 999, steps: 30 }, "5": { extra: "keep" } } }, "http://127.0.0.1:8188");
    assert.equal(prompt["1"].inputs.text, "hello");
    assert.equal(prompt["2"].inputs.seed, 999);                 // paramValues 覆盖 mapping 补丁（后者优先）
    assert.equal(prompt["2"].inputs.steps, 30);                 // 面板新字段直接写入
    assert.equal(prompt["4"].inputs.image, "src.png");          // 映射入口喂图
    assert.equal(prompt["5"].inputs.image_filename, "src.png"); // PS 桥接入口同样喂图（同一次上传的文件名）
    assert.equal(prompt["3"].inputs.image, "mask.png");         // 蒙版入口不被源图覆盖
    assert.equal(prompt["5"].inputs.extra, "keep");
    assert.equal(uploads, 2);                                   // 只上传两次：source + mask
  } finally { globalThis.fetch = originalFetch; }
});

// object-info 子集：逐类端点优先（payload 小）；任一失败回退整包摘取；入参去重
test("fetchObjectInfoSubset fetches per-class and falls back to full object_info", async () => {
  const spec = { input: { required: { seed: ["INT", { min: 0 }] } } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.endsWith("/object_info/KSampler")) return okJson({ KSampler: spec });
    if (target.endsWith("/object_info/EmptyLatentImage")) return okJson({ EmptyLatentImage: spec });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  try {
    const subset = await fetchObjectInfoSubset("http://127.0.0.1:8188", ["KSampler", "KSampler", "EmptyLatentImage"]);
    assert.equal(Object.keys(subset).length, 2);
    assert.equal(subset.KSampler, spec);
  } finally { globalThis.fetch = originalFetch; }
  let fullCalls = 0;
  globalThis.fetch = async url => {
    if (String(url).endsWith("/object_info")) { fullCalls += 1; return okJson({ KSampler: spec, EmptyLatentImage: spec }); }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  try {
    const subset = await fetchObjectInfoSubset("http://127.0.0.1:8188", ["KSampler", "EmptyLatentImage"]);
    assert.equal(fullCalls, 1);
    assert.equal(subset.EmptyLatentImage, spec);
  } finally { globalThis.fetch = originalFetch; }
});

// 面板构建器是前端模块里的纯函数：切片进 vm 直接测行为（不拉 DOM）
const vm = require("node:vm");
function loadPanelBuilder() {
  const start = localSdSource.indexOf("const SD_IMAGE_ENTRY_CLASS_RE");
  const end = localSdSource.indexOf("function sdParamInfoKey");
  assert.ok(start > 0 && end > start, "面板构建器切片定位失败");
  const context = vm.createContext({});
  vm.runInContext(`${localSdSource.slice(start, end)}\nglobalThis.__panel = { sdInputSpec, sdParamGroupsFromWorkflow };`, context);
  return context.__panel;
}

test("panel builder groups editable fields and excludes mapped/link/image-entry fields", () => {
  const { sdParamGroupsFromWorkflow } = loadPanelBuilder();
  const workflowItem = {
    id: "wf1", updatedAt: 1,
    mapping: {
      positiveNodeId: "1",
      samplerNodeId: "2", seedField: "seed", denoiseField: "denoise",
      params: [{ param: "width", nodeId: "6", field: "width" }, { param: "height", nodeId: "6", field: "height" }],
    },
    workflow: {
      "1": { class_type: "CLIPTextEncode", inputs: { text: "hello" } },
      "2": { class_type: "KSampler", inputs: { seed: 1, denoise: 0.7, steps: 20, sampler_name: "euler" } },
      "3": { class_type: "LoadImage", inputs: { image: "a.png" } },
      "4": { class_type: "GetImageFromPS", inputs: { image_filename: "b.png" } },
      "5": { class_type: "SaveImage", inputs: { filename_prefix: "out", images: ["4", 0] } },
      "6": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1 } },
    },
  };
  const info = {
    KSampler: { input: { required: { seed: ["INT", { min: 0 }], denoise: ["FLOAT", {}], steps: ["INT", { min: 1, max: 100 }], sampler_name: [["euler", "dpmpp"]] } } },
    EmptyLatentImage: { input: { required: { width: ["INT", {}], height: ["INT", {}], batch_size: ["INT", { min: 1 }] } } },
  };
  const data = sdParamGroupsFromWorkflow(workflowItem, info);
  const byClass = Object.fromEntries(data.groups.map(group => [group.classType, group]));
  // vm 跨 realm 的数组原型与主 realm 不同，deepStrictEqual 会误判，统一用 JSON 比较
  const j = value => JSON.stringify(value);
  // KSampler：seed/denoise 被常用区占用 → 只剩 steps(number) 与 sampler_name(combo)
  assert.equal(j(byClass.KSampler.fields.map(f => [f.field, f.kind])), j([["steps", "number"], ["sampler_name", "combo"]]));
  assert.equal(j(byClass.KSampler.fields[1].options), j(["euler", "dpmpp"]));
  // SaveImage：数组连线不进面板，filename_prefix 保留
  assert.equal(j(byClass.SaveImage.fields.map(f => f.field)), j(["filename_prefix"]));
  // EmptyLatentImage：宽高被分辨率/比例档占用 → batch_size 保留
  assert.equal(j(byClass.EmptyLatentImage.fields.map(f => [f.field, f.kind])), j([["batch_size", "number"]]));
  // 图片入口（LoadImage/GetImageFromPS）与被映射占满的 CLIPTextEncode 不产生分组
  assert.equal(byClass.LoadImage, undefined);
  assert.equal(byClass.GetImageFromPS, undefined);
  assert.equal(byClass.CLIPTextEncode, undefined);
  assert.equal(data.count, 4);
});

test("panel builder degrades out-of-range combos to text and skips socket specs", () => {
  const { sdParamGroupsFromWorkflow } = loadPanelBuilder();
  const workflowItem = {
    mapping: {},
    workflow: {
      "1": { class_type: "Custom", inputs: { mode: "weird-value", model: "x.safetensors" }, _meta: { title: "Custom" } },
      "2": { class_type: "Other", inputs: { value: 3 } },
    },
  };
  const info = {
    Custom: { input: { required: { mode: [["a", "b"]], model: ["MODEL"] } } },
    Other: { input: { required: { value: ["INT", {}] } } },
  };
  const data = sdParamGroupsFromWorkflow(workflowItem, info);
  const custom = data.groups.find(group => group.classType === "Custom");
  assert.equal(custom.fields.length, 1);            // MODEL 是连线型规格 → 跳过
  assert.equal(custom.fields[0].field, "mode");
  assert.equal(custom.fields[0].kind, "string");    // combo 值不在选项里 → 文本降级，不硬塞
  const other = data.groups.find(group => group.classType === "Other");
  assert.equal(other.fields[0].kind, "number");
});

// 接线断言：run 请求带 paramValues；面板展开/组折叠两种点击；换工作流清空面板编辑值
test("panel wiring: run carries paramValues; toggle/group roles; workflow switch clears edits", () => {
  const comfyServerSource = fs.readFileSync(path.join(__dirname, "..", "modules", "comfyui-server.js"), "utf8");
  assert.match(localSdSource, /paramValues: node\._sdParamValues \|\| \{\}/);
  assert.match(localSdSource, /data-role="sd-params-toggle"/);
  assert.match(localSdSource, /data-role="sd-param-group:\$\{esc\(group\.nodeId\)\}"/);
  assert.match(localSdSource, /role\.startsWith\("sd-param-group:"\)/);
  assert.match(localSdSource, /role === "sd-param"/);
  assert.match(localSdSource, /node\._sdParamValues = \{\}; node\._sdParamGroupsCollapsed = \{\}; node\._sdParamsOpen = false;/);
  assert.match(localSdSource, /\/api\/comfyui\/object-info/);
  assert.match(comfyServerSource, /\/api\/comfyui\/object-info/);
  assert.match(comfyServerSource, /payload\.paramValues/);
});
