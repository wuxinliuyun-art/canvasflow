const $ = (id) => document.getElementById(id);

const NODE_WIDTH = 240;
const NODE_HEIGHT = 172;
const AI_NODE_HEIGHT = 400;
const CONNECT_SNAP_RADIUS = 38;
const STORAGE_KEY = "webimage.pages.v2";
let runtimeExportFolder = "export";

function resolvedExportFolderLabel(value) {
  const label = String(value || "").trim();
  return !label || label === "export" || label === "export（项目文件夹）" || label === "export (project folder)"
    ? runtimeExportFolder
    : label;
}
const LANGUAGE_KEY = "webimage.language";
const GLOBAL_LIBRARY_KEY = "canvasflow.globalLibrary.v1";

// UI language is stored separately from project data so switching projects never
// changes the application language. New UI nodes are translated automatically.
const UI_EN = {
  "CanvasFlow — Visual AI Image Workflow": "CanvasFlow — Visual AI Image Workflow",
  "单击切换项目，双击重命名": "Click to switch projects; double-click to rename",
  "未命名项目": "Untitled Project", "未命名": "Untitled", "项目1": "Project 1",
  "新建项目": "New Project", "保存JSON": "Save JSON", "加载JSON": "Load JSON",
  "一键生成AI绘图节点": "Create AI Image Nodes", "批量执行": "Batch Run", "导出": "Export",
  "皮肤切换": "Switch Theme", "设置": "Settings", "准备导出": "Preparing export",
  "取消所有任务": "Cancel all tasks", "取消全部": "Cancel All",
  "居中显示所有节点": "Center all nodes", "居中显示": "Center View",
  "输入文字后回车创建文字节点；上传图片可创建图片节点": "Type text and press Enter to create a text node; upload images to create image nodes",
  "上传图片": "Upload Image", "创建节点": "Create Node", "创建": "Create", "关闭": "Close",
  "画布": "Canvas", "AI绘图": "AI Image", "快捷键": "Shortcuts", "界面语言": "Interface Language",
  "网格对齐距离": "Grid spacing", "开启网格吸附": "Enable grid snapping",
  "ZIP 压缩包导出（兼容性最好，推荐）": "Export as ZIP (best compatibility, recommended)",
  "导出文件夹": "Export folder", "export（项目文件夹）": "export (project folder)",
  "打开导出文件夹": "Open Export Folder", "设置导出文件夹": "Set Export Folder", "复制路径": "Copy Path", "查看导出文件": "View Exported Files",
  "完整路径可直接选择或复制；打开和设置文件夹使用相同的 Windows 授权方式。": "Select or copy the full path directly. Opening and choosing folders use the same Windows permission flow.",
  "完整路径可直接选择或复制；如果无法自动打开目录，可将路径粘贴到资源管理器地址栏。": "Select or copy the full path directly. Paste it into File Explorer's address bar if the folder cannot be opened automatically.",
  "选择文件夹后会保存完整路径；若手动填写，请输入完整路径。": "The full path is saved after choosing a folder. Enter a full path when editing manually.",
  "⚠ 由于浏览器安全限制，无法直接写入系统盘（C 盘）。请将导出文件夹设置在 D 盘或其他非系统盘，否则可能导致导出失败。": "⚠ Due to browser security restrictions, the system drive (C:) cannot be written directly. Choose D: or another non-system drive to avoid export failures.",
  "自定义素材": "Custom Assets", "添加常用图片作为素材，右键画布空白处可快速插入对应图片节点。": "Add frequently used images as assets, then right-click an empty area of the canvas to insert them quickly.",
  "素材名称（如：男模特）": "Asset name (e.g. male model)", "选择图片": "Choose Image", "添加": "Add",
  "输入你的 API Key": "Enter your API Key", "验证 API Key 是否有效": "Verify API Key",
  "验证": "Verify", "保存 API Key": "Save API Key", "保存": "Save",
  "清除所有已保存的 API Key（分享前使用）": "Clear all saved API keys (before sharing)", "清除": "Clear",
  "API 代理：api.apib.ai / api.aiuxu.com / api.aishuch.com / api.apimart.ai（自动故障转移）": "API proxies: api.apib.ai / api.aiuxu.com / api.aishuch.com / api.apimart.ai (automatic failover)",
  "积分：--": "Credits: --", "刷新余额": "Refresh Balance", "刷新": "Refresh",
  "模型": "Model", "分辨率": "Resolution", "画质": "Quality", "比例": "Aspect ratio",
  "auto（自动）": "auto", "low（快速）": "low (fast)", "medium（平衡）": "medium (balanced)", "high（最高）": "high (best)",
  "默认图片比例": "Default aspect ratio", "1:1（正方）": "1:1 (square)", "3:2（横图）": "3:2 (landscape)",
  "2:3（竖图）": "2:3 (portrait)", "4:3（横图）": "4:3 (landscape)", "3:4（竖图）": "3:4 (portrait)",
  "5:4（横图）": "5:4 (landscape)", "4:5（竖图）": "4:5 (portrait)", "16:9（横图）": "16:9 (landscape)",
  "9:16（竖图）": "9:16 (portrait)", "2:1（横图）": "2:1 (landscape)", "1:2（竖图）": "1:2 (portrait)",
  "3:1（横图）": "3:1 (landscape)", "1:3（竖图）": "1:3 (portrait)", "21:9（横图）": "21:9 (landscape)",
  "9:21（竖图）": "9:21 (portrait)",
  "快捷键说明": "Keyboard Shortcuts", "删除选中节点和相关连线": "Delete selected nodes and connected edges",
  "撤销": "Undo", "重做": "Redo", "复制选中节点": "Copy selected nodes", "粘贴节点、文字或图片": "Paste nodes, text, or images",
  "将选中节点编组": "Group selected nodes", "右键编组节点": "Right-click a group node",
  "取消编组，还原内部节点和连线": "Ungroup and restore contained nodes and edges", "Shift + 点击": "Shift + Click",
  "多选节点": "Select multiple nodes", "Space + 拖拽": "Space + Drag", "平移画布": "Pan canvas",
  "鼠标滚轮": "Mouse Wheel", "缩放画布": "Zoom canvas", "颜色": "Color", "大小": "Size",
  "取消": "Cancel", "确认并生成节点": "Confirm & Create Node", "在图片上绘制色块": "Paint color blocks on image",
  "画色块": "Paint", "上一张": "Previous", "下一张": "Next", "执行 AI 绘图": "Run AI Image Generation",
  "全部执行": "Run All", "重命名": "Rename", "删除素材": "Delete Asset", "重命名素材": "Rename Asset",
  "已撤回删除": "Deletion restored", "已撤销": "Undone", "已重做": "Redone", "素材已重命名": "Asset renamed",
  "素材已删除": "Asset deleted", "请输入素材名称": "Enter an asset name", "请选择图片文件": "Choose an image file",
  "素材已添加": "Asset added", "正在导出": "Exporting", "完成": "Done", "失败": "Failed", "已取消": "Cancelled",
  "生成中": "Generating", "等待中": "Waiting", "请输入文字内容": "Enter text", "至少选中 2 个节点才能编组": "Select at least 2 nodes to create a group",
  "不是编组节点": "This is not a group node", "该编组节点无可取消的内容": "This group has no content to ungroup",
  "已取消编组": "Group dissolved", "不能连接到自己": "A node cannot connect to itself", "这两个端口已经连接": "These ports are already connected",
  "等待提示词...": "Waiting for a prompt...", "重新生成": "Regenerate", "连接文字节点作为提示词": "Connect a text node as the prompt",
  "生成": "Generate", "需要提示词或参考图": "A prompt or reference image is required", "提交失败": "Submission failed",
  "未获取到任务ID": "No task ID received", "查询失败": "Query failed", "任务完成但无图片结果": "Task completed without an image result",
  "生成失败": "Generation failed", "提交AI生成任务": "Submitting AI generation task", "等待生成结果": "Waiting for generation result",
  "下载生成图片": "Downloading generated image", "AI生成完成": "AI generation complete", "AI绘图完成": "AI image generation complete",
  "正在提交任务": "Submitting task", "正在提交": "Submitting", "正在生成": "Generating", "正在下载": "Downloading", "正在下载结果": "Downloading result", "生成完成": "Generation complete", "提交中": "Submitting", "下载中": "Downloading",
  "已取消剩余任务": "Remaining tasks cancelled", "批量生成失败": "Batch generation failed", "已创建 AI 绘图节点": "AI image node created",
  "该节点已有输出节点": "This node already has an output node", "已添加输出节点": "Output node added",
  "请先在设置中填入 API Key": "Enter an API Key in Settings first", "删除项目": "Delete Project",
  "文字节点": "Text Node", "图片节点": "Image Node", "编组节点": "Group Node", "输入端口": "Input port", "输出端口": "Output port",
  "拖拽缩放": "Drag to resize", "空编组": "Empty group", "暂无图片": "No images", "添加图片": "Add Images", "清空": "Clear",
  "无图片": "No image", "上传": "Upload", "图片节点粘贴后为空": "Image node is empty after pasting", "停用": "Disabled", "启用": "Enabled",
  "取消连线": "Remove Connection", "已居中显示": "View centered", "已整理节点": "Nodes arranged", "没有需要添加的节点": "No nodes need to be added",
  "已生成局部修改图片节点": "Edited image node created", "请输入文字或选择图片": "Enter text or choose an image", "已创建节点": "Node created",
  "已从剪贴板创建图片节点": "Image node created from clipboard", "已从剪贴板创建文字节点": "Text node created from clipboard",
  "切换启用/停用": "Toggle Enabled/Disabled", "编组": "Group", "取消编组": "Ungroup", "添加输出节点": "Add Output Node",
  "打开本地文件夹": "Open Local Folder", "断开连接": "Disconnect", "复制": "Copy", "删除节点": "Delete Nodes", "粘贴节点": "Paste Nodes",
  "批量停用": "Disable Selected", "批量启用": "Enable Selected", "批量删除": "Delete Selected", "添加文字节点": "Add Text Node",
  "添加图片节点": "Add Image Node", "添加AI绘图节点": "Add AI Image Node", "节点对齐": "Arrange Nodes",
  "已新建标签页": "New project created", "至少保留一个项目": "At least one project must remain", "已删除项目（Ctrl+Z 可撤回）": "Project deleted (Ctrl+Z to restore)",
  "上传图片文件": "Upload Image Files", "上传图片文件夹": "Upload Image Folder", "文件夹中没有图片文件": "No image files found in the folder",
  "请先输入 API Key": "Enter an API Key first", "API Key 有效": "API Key is valid", "API Key 无效": "API Key is invalid",
  "验证失败，请检查网络": "Verification failed. Check your network connection", "积分：请先填入 API Key": "Credits: enter an API Key first",
  "积分：查询中...": "Credits: loading...", "积分：查询失败": "Credits: query failed", "积分：网络错误": "Credits: network error",
  "API Key 已保存": "API Key saved", "API Key 已从所有页面清除，可安全分享": "API Key cleared from all projects; it is now safe to share",
  "JSON已加载": "JSON loaded", "JSON已保存到输出文件夹": "JSON saved to the output folder", "JSON已保存到 download 文件夹": "JSON saved to the download folder",
  "JSON已下载（浏览器下载）": "JSON downloaded by the browser", "当前浏览器不支持直接选择文件夹，请使用 Chrome 或 Edge": "This browser cannot select folders directly. Use Chrome or Edge",
  "已选择文件夹": "Folder selected", "已取消选择文件夹": "Folder selection cancelled", "请先设置导出文件夹路径": "Set an export folder path first",
  "无法打开文件夹，请检查路径是否正确": "Could not open the folder. Check the path", "没有可导出的末端节点": "No terminal nodes to export",
  "生成Excel": "Creating Excel file", "没有可导出内容": "Nothing to export", "没有可导出的文字或图片": "No text or images to export",
  "写入文件": "Writing files", "导出完成": "Export complete", "导出失败": "Export failed",
  "导出失败，请检查文件夹权限或内容大小": "Export failed. Check folder permissions or content size",
  "当前项目还没有保存，确定要离开吗？": "This project has not been saved. Are you sure you want to leave?",
  "画布上没有可执行的 AI 绘图节点": "There are no runnable AI image nodes on the canvas", "双击标题栏可最大化窗口": "Double-click the title bar to maximize",
  "无参考图": "No reference image", "(无文字输入)": "(no text input)", "单图": "Single image",
  "自定义文字": "Custom Text", "自定义图片": "Custom Images",
  "添加常用图片，或在图片节点上右键收藏。支持项目独立和全局共用。": "Add reusable images or save one from an image node. Assets can be project-only or global.",
  "模板名称（如：产品摄影）": "Template name (e.g. product photography)", "输入需要重复使用的完整文字": "Enter the complete reusable text",
  "边框颜色": "Border color", "添加文字模板": "Add Text Template", "添加图片素材": "Add Image Asset",
  "从 JSON 导入素材": "Import Assets from JSON",
  "导入自定义图文": "Import Custom Text and Images", "来源项目": "Source project", "取消": "Cancel", "导入所选内容": "Import Selected",
  "当前项目": "Current project", "全局": "Global", "刷新当前项目": "Refresh Current Project",
  "保存为自定义文字": "Save as Custom Text", "保存为自定义图片": "Save as Custom Image",
  "设置分类": "Settings categories", "常规": "General", "素材库": "Asset Library", "导出": "Export",
  "调整界面语言与画布操作习惯。": "Adjust interface language and canvas behavior.", "界面与画布": "Interface & Canvas",
  "保存常用图文，所有项目均可使用；创建出的节点是独立副本。": "Save reusable text and images for every project; created nodes are independent copies.",
  "导入素材": "Import Assets", "保存修改": "Save Changes", "注册获取 API Key": "Register for an API Key", "注册获取 API Key ↗": "Register for an API Key ↗",
  "导出": "Export", "管理导出方式和本地文件夹。": "Manage export options and local folders.",
  "从项目导入": "Import from Project", "从 JSON 导入": "Import from JSON", "保存可重复使用的完整多行文字。": "Save reusable complete multi-line text.",
  "保存常用图片，也可从图片节点右键收藏。": "Save reusable images or collect them from an image node.",
  "＋ 新建文字": "+ New Text", "＋ 新建图片": "+ New Image", "AI 绘图": "AI Image", "自定义节点": "Custom Nodes", "暂无素材": "No assets", "双击放大预览": "Double-click to enlarge", "当前素材预览": "Current asset preview",
  "配置 API Key；模型和画面参数在每个 AI 绘图节点中单独设置。": "Configure the API key; set model and image options separately in each AI Image node.",
  "文件导出": "File Export", "同时导出输入素材（关键词和参考图）": "Also export inputs (prompts and reference images)",
  "默认只导出 AI 生成结果；输入素材会与生成结果分开放置，不包含项目 JSON。": "By default, export only AI results. Inputs are stored separately and project JSON is never included."
};

let uiLanguage = (() => {
  try { return localStorage.getItem(LANGUAGE_KEY) || (navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en"); }
  catch { return "zh-CN"; }
})();
const uiTextSource = new WeakMap();
const uiAttrSource = new WeakMap();

function translateEnglishString(source) {
  if (!source) return source;
  const trimmed = source.trim();
  if (trimmed !== source) {
    const start = source.indexOf(trimmed);
    return source.slice(0, start) + translateEnglishString(trimmed) + source.slice(start + trimmed.length);
  }
  if (UI_EN[source]) return UI_EN[source];
  const rules = [
    [/^项目(\d+)$/, "Project $1"], [/^AI绘图 #(\d+)$/, "AI Image #$1"], [/^输出节点 (\d+)$/, "Output Node $1"],
    [/^图片(\d+)$/, "Image $1"], [/^(\d+) 张图片$/, "$1 images"], [/^已编组 (\d+) 个节点$/, "Grouped $1 nodes"],
    [/^已复制 (\d+) 个节点$/, "Copied $1 nodes"], [/^已粘贴 (\d+) 个节点$/, "Pasted $1 nodes"],
    [/^已添加 (\d+) 个 AI 绘图节点$/, "Added $1 AI image nodes"], [/^已选择图片：(.+)$/, "Selected image: $1"],
    [/^已导入 (\d+) 张图片$/, "Imported $1 images"], [/^已创建编组节点，包含 (\d+) 张图片$/, "Created a group containing $1 images"],
    [/^(\d+) 张图片已生成$/, "$1 images generated"], [/^批量生成 (\d+)\/(\d+)$/, "Batch generation $1/$2"],
    [/^拆分生成 (\d+)\/(\d+)$/, "Split generation $1/$2"], [/^AI生成中 (\d+)%$/, "AI generating $1%"],
    [/^等待中 · 已完成 (\d+)\/(\d+)$/, "Waiting · $1/$2 completed"], [/^正在提交 · 已完成 (\d+)\/(\d+)$/, "Submitting · $1/$2 completed"],
    [/^正在生成 · 已完成 (\d+)\/(\d+)$/, "Generating · $1/$2 completed"], [/^正在下载 · 已完成 (\d+)\/(\d+)$/, "Downloading · $1/$2 completed"],
    [/^已完成 (\d+)\/(\d+)$/, "$1/$2 completed"], [/^完成 (\d+)\/(\d+)，失败 (\d+)$/, "$1/$2 completed, $3 failed"], [/^已取消，完成 (\d+)\/(\d+)$/, "Cancelled, $1/$2 completed"],
    [/^收集输出 (\d+)\/(\d+)$/, "Collecting output $1/$2"], [/^写入文件 (\d+)\/(\d+)$/, "Writing files $1/$2"],
    [/^任务(\d+)$/, "Task $1"], [/^共 (\d+) 个任务（(\d+) 个节点）· 双击标题放大$/, "$1 tasks ($2 nodes) · Double-click the title to maximize"],
    [/^积分：([\d.]+)（已用 ([\d.]+)）$/, "Credits: $1 ($2 used)"], [/^已打开文件夹: (.+)$/, "Opened folder: $1"],
    [/^已导出到 (.+)$/, "Exported to $1"], [/^保存失败: (.*)$/, "Save failed: $1"], [/^AI 生成失败: (.*)$/, "AI generation failed: $1"],
    [/^API 返回异常状态 (.+)$/, "Unexpected API status: $1"],
    [/^自定义文字：(.+)$/, "Custom Text: $1"], [/^自定义图片：(.+)$/, "Custom Image: $1"],
    [/^当前图片：(.+)（可选择新图片替换）$/, "Current image: $1 (choose a new image to replace it)"],
    [/^文字：(.+)$/, "Text: $1"], [/^图片：(.+)$/, "Image: $1"]
  ];
  for (const [pattern, replacement] of rules) if (pattern.test(source)) return source.replace(pattern, replacement);
  return source;
}

function translateUiString(source) {
  return uiLanguage === "en" ? translateEnglishString(source) : source;
}

function translateUiTree(root) {
  if (!root) return;
  const nodes = [];
  if (root.nodeType === Node.TEXT_NODE) {
    nodes.push(root);
  } else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let textNode;
    while ((textNode = walker.nextNode())) nodes.push(textNode);
  }
  for (const node of nodes) {
    if (!node.parentElement || ["SCRIPT", "STYLE"].includes(node.parentElement.tagName) || !node.nodeValue.trim()) continue;
    let source = uiTextSource.get(node);
    if (!source || (node.nodeValue !== source && node.nodeValue !== translateEnglishString(source))) source = node.nodeValue;
    uiTextSource.set(node, source);
    const translated = uiLanguage === "en" ? translateUiString(source) : source;
    if (node.nodeValue !== translated) node.nodeValue = translated;
  }
  const elements = root.nodeType === Node.ELEMENT_NODE ? [root, ...root.querySelectorAll("*")] : [];
  for (const el of elements) {
    let sources = uiAttrSource.get(el) || {};
    for (const attr of ["title", "placeholder", "aria-label"]) {
      if (!el.hasAttribute(attr)) continue;
      const current = el.getAttribute(attr);
      if (!sources[attr] || (current !== sources[attr] && current !== translateEnglishString(sources[attr]))) sources[attr] = current;
      const translated = uiLanguage === "en" ? translateUiString(sources[attr]) : sources[attr];
      if (current !== translated) el.setAttribute(attr, translated);
    }
    uiAttrSource.set(el, sources);
  }
}

function setUiLanguage(language) {
  uiLanguage = language === "en" ? "en" : "zh-CN";
  try { localStorage.setItem(LANGUAGE_KEY, uiLanguage); } catch {}
  document.documentElement.lang = uiLanguage;
  const select = document.getElementById("languageSelect");
  if (select) select.value = uiLanguage;
  translateUiTree(document.documentElement);
}

const state = {
  pages: [],
  activePageId: "",
  nodes: [],
  edges: [],
  selected: new Set(),
  view: { x: 120, y: 90, scale: 1 },
  settings: { gridSize: 20, snap: true, theme: "light", exportFolderLabel: "", apiKey: "", zipExport: true, exportInputs: false, customMaterials: [] },
  customLibrary: { textTemplates: [], imageMaterials: [] },
  nextNode: 1,
  nextEdge: 1,
  nextPageNum: 1,
  _deletedPage: null,
  history: [],
  future: [],
  clipboard: null,
  exportDirHandle: null,
  dirty: false,
};

let globalLibrary = loadGlobalLibrary();
let pendingLibraryImport = null;
let editingTextTemplate = null;
let editingImageTemplate = null;
let librarySaveQueue = Promise.resolve();

function emptyLibrary() { return { textTemplates: [], imageMaterials: [] }; }
function normalizeLibrary(lib) {
  const source = lib || {};
  return {
    textTemplates: Array.isArray(source.textTemplates) ? source.textTemplates.map(normalizeTemplate) : [],
    imageMaterials: Array.isArray(source.imageMaterials) ? source.imageMaterials.map(normalizeTemplate) : [],
  };
}
function normalizeTemplate(item, idx) {
  const value = { ...(item || {}) };
  value.id = value.id || `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  value.name = String(value.name || "未命名").trim();
  delete value.color;
  value.revision = Math.max(1, Number(value.revision) || 1);
  return value;
}
function loadGlobalLibrary() {
  try { return normalizeLibrary(JSON.parse(localStorage.getItem(GLOBAL_LIBRARY_KEY) || "{}")); }
  catch (e) { console.error("[加载] 全局素材库读取失败", e); return emptyLibrary(); }
}
async function loadGlobalLibraryFromDisk() {
  const browserLibrary = normalizeLibrary(globalLibrary);
  try {
    const resp = await fetch("/api/custom-library");
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    globalLibrary = normalizeLibrary(await resp.json());
    let migrated = 0;
    for (const kind of ["text", "image"]) {
      const key = kind === "text" ? "textTemplates" : "imageMaterials";
      for (const item of browserLibrary[key]) {
        if (globalLibrary[key].some(existing => existing.id === item.id)) continue;
        item.name = uniqueTemplateName(kind, item.name, globalLibrary);
        globalLibrary[key].push(item); migrated++;
      }
    }
    console.log(`[加载] 本地素材库：文字=${globalLibrary.textTemplates.length}，图片=${globalLibrary.imageMaterials.length}`);
    if (migrated) console.log(`[迁移] 已从浏览器存储合并 ${migrated} 个素材到本地文件`);
    saveGlobalLibrary();
  } catch (e) {
    console.error("[加载] 本地素材库文件读取失败，继续使用浏览器备份", e);
    toast("本地素材库读取失败：将暂时使用浏览器备份，请检查程序目录写入权限");
  }
}
function saveGlobalLibrary() {
  try { localStorage.setItem(GLOBAL_LIBRARY_KEY, JSON.stringify(globalLibrary)); }
  catch (e) { console.error("[保存] 全局素材库写入失败", e); toast("全局素材保存失败，可能是浏览器存储空间不足"); }
  const snapshot = JSON.stringify(globalLibrary);
  librarySaveQueue = librarySaveQueue.catch(() => {}).then(async () => {
    const resp = await fetch("/api/custom-library", { method: "POST", headers: { "Content-Type": "application/json" }, body: snapshot });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || `HTTP ${resp.status}`);
  }).catch(e => { console.error("[保存] 本地素材库文件写入失败", e); toast("素材未能保存到本地：请检查程序目录写入权限后重试"); });
}
function migrateLegacyMaterials(data) {
  const projectLibrary = normalizeLibrary(data?.customLibrary);
  const oldImages = Array.isArray(data?.settings?.customMaterials) ? data.settings.customMaterials : [];
  if (oldImages.length) projectLibrary.imageMaterials.push(...oldImages.map((m, i) => normalizeTemplate(m, i)));
  let migrated = 0;
  for (const kind of ["text", "image"]) {
    const key = kind === "text" ? "textTemplates" : "imageMaterials";
    for (const item of projectLibrary[key]) {
      if (globalLibrary[key].some(existing => existing.id === item.id)) continue;
      item.name = uniqueTemplateName(kind, item.name, globalLibrary);
      globalLibrary[key].push(item); migrated++;
    }
  }
  if (migrated) { saveGlobalLibrary(); console.log(`[迁移] 已将 ${migrated} 个项目素材合并到全局素材库`); }
}
function libraryItems(kind) {
  const key = kind === "text" ? "textTemplates" : "imageMaterials";
  return globalLibrary[key] || [];
}
function findTemplate(kind, id) {
  const key = kind === "text" ? "textTemplates" : "imageMaterials";
  return (globalLibrary[key] || []).find(x => x.id === id) || null;
}
function persistLibraries() {
  saveGlobalLibrary();
}

const els = {
  app: $("app"),
  viewport: $("viewport"),
  world: $("world"),
  nodes: $("nodes"),
  edges: $("edges"),
  selectionBox: $("selectionBox"),
  contextMenu: $("contextMenu"),
  minimap: $("minimap"),
  settings: $("settingsPanel"),
  gridSize: $("gridSizeInput"),
  snap: $("snapToggle"),
  exportFolder: $("exportFolderInput"),
  copyExportPathBtn: $("copyExportPathBtn"),
  loadJson: $("loadJsonInput"),
  projectNameBtn: $("projectNameBtn"),
  projectMenu: $("projectMenu"),
  progressPanel: $("progressPanel"),
  progressLabel: $("progressLabel"),
  progressPercent: $("progressPercent"),
  progressFill: $("progressFill"),
  batchTaskList: $("batchTaskList"),
  batchCancelAllBtn: $("batchCancelAllBtn"),
  composerText: $("composerText"),
  composerUploadBtn: $("composerUploadBtn"),
  composerSubmitBtn: $("composerSubmitBtn"),
  composerFileInput: $("composerFileInput"),
  composerFolderInput: $("composerFolderInput"),
  composerImageName: $("composerImageName"),
  centerViewBtn: $("centerViewBtn"),
  apiKeyInput: $("apiKeyInput"),
  aiGenerateBtn: $("aiGenerateBtn"),
  verifyKeyBtn: $("verifyKeyBtn"),
  saveKeyBtn: $("saveKeyBtn"),
  clearKeyBtn: $("clearKeyBtn"),
  balanceDisplay: $("balanceDisplay"),
  balanceRefreshBtn: $("balanceRefreshBtn"),
  runBtn: $("runBtn"),
  zipExportToggle: $("zipExportToggle"),
  exportInputsToggle: $("exportInputsToggle"),
  lightbox: $("lightbox"),
  lightboxImg: $("lightboxImg"),
  lightboxClose: $("lightboxClose"),
  lightboxPrev: $("lightboxPrev"),
  lightboxNext: $("lightboxNext"),
  lightboxCounter: $("lightboxCounter"),
  lightboxDots: $("lightboxDots"),
  lightboxPaintBtn: $("lightboxPaintBtn"),
  lightboxPaintCanvas: $("lightboxPaintCanvas"),
  lightboxPaintToolbar: $("lightboxPaintToolbar"),
  lightboxPaintColor: $("lightboxPaintColor"),
  lightboxPaintSize: $("lightboxPaintSize"),
  lightboxPaintCancel: $("lightboxPaintCancel"),
  lightboxPaintConfirm: $("lightboxPaintConfirm"),
  executeDialog: $("executeDialog"),
  executeTitle: $("executeTitle"),
  executeList: $("executeList"),
  executeClose: $("executeClose"),
  executeCancelBtn: $("executeCancelBtn"),
  executeRunBtn: $("executeRunBtn"),
  customMaterialsList: $("customMaterialsList"),
  customMaterialName: $("customMaterialName"),
  customMaterialFileBtn: $("customMaterialFileBtn"),
  customMaterialFileInput: $("customMaterialFileInput"),
  customMaterialFileHint: $("customMaterialFileHint"),
  customMaterialEditorPreview: $("customMaterialEditorPreview"),
  customMaterialAddBtn: $("customMaterialAddBtn"),
  customMaterialGlobal: $("customMaterialGlobal"),
  customTextsList: $("customTextsList"),
  customTextName: $("customTextName"),
  customTextContent: $("customTextContent"),
  customTextGlobal: $("customTextGlobal"),
  customTextAddBtn: $("customTextAddBtn"),
  customTextEditor: $("customTextEditor"),
  customImageEditor: $("customImageEditor"),
  newCustomTextBtn: $("newCustomTextBtn"),
  newCustomImageBtn: $("newCustomImageBtn"),
  customTextCancelBtn: $("customTextCancelBtn"),
  customImageCancelBtn: $("customImageCancelBtn"),
  shortcutHelpBtn: $("shortcutHelpBtn"),
  shortcutPopover: $("shortcutPopover"),
  shortcutPopoverClose: $("shortcutPopoverClose"),
  importLibraryProjectBtn: $("importLibraryProjectBtn"),
  importLibraryJsonBtn: $("importLibraryJsonBtn"),
  importLibraryJsonInput: $("importLibraryJsonInput"),
  libraryImportDialog: $("libraryImportDialog"),
  libraryImportSource: $("libraryImportSource"),
  libraryImportItems: $("libraryImportItems"),
  libraryImportCloseBtn: $("libraryImportCloseBtn"),
  libraryImportCancelBtn: $("libraryImportCancelBtn"),
  libraryImportConfirmBtn: $("libraryImportConfirmBtn"),
  languageSelect: $("languageSelect"),
};

let drag = null;
let connectDraft = null;
let selectionDraft = null;
let spaceDown = false;
let lastPointerWorld = { x: 180, y: 140 };
let composerImage = null;

function uid(prefix) {
  return `${prefix}${prefix === "n" ? state.nextNode++ : state.nextEdge++}`;
}

function pageId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function blankPage(name = "未命名") {
  return {
    id: pageId(),
    name,
    data: {
      nodes: [],
      edges: [],
      settings: { ...state.settings },
      customLibrary: { textTemplates: [], imageMaterials: [] },
      view: { x: 120, y: 90, scale: 1 },
      nextNode: 1,
      nextEdge: 1,
    },
  };
}

function cloneData() {
  return JSON.parse(JSON.stringify({
    nodes: state.nodes,
    edges: state.edges,
    settings: state.settings,
    customLibrary: state.customLibrary,
    view: state.view,
    nextNode: state.nextNode,
    nextEdge: state.nextEdge,
  }));
}

function currentPage() {
  return state.pages.find(p => p.id === state.activePageId);
}

function saveCurrentPage() {
  const page = currentPage();
  if (page) page.data = cloneData();
}

function restoreData(data) {
  state.nodes = data.nodes || [];
  state.edges = data.edges || [];
  state.settings = { gridSize: 20, snap: true, theme: "light", exportFolderLabel: "", apiKey: "", model: "gpt-image-2", resolution: "1k", quality: "medium", defaultRatio: "1:1", zipExport: true, exportInputs: false, customMaterials: [], ...(data.settings || {}) };
  const legacyAiSettings = { model: state.settings.model, resolution: state.settings.resolution, quality: state.settings.quality, size: state.settings.defaultRatio };
  delete state.settings.geminiAutomation;
  delete state.settings.model;
  delete state.settings.resolution;
  delete state.settings.quality;
  delete state.settings.defaultRatio;
  migrateLegacyMaterials(data);
  state.customLibrary = emptyLibrary();
  walkNodes(state.nodes, node => { if (node.customRef) delete node.customRef; });
  walkNodes(state.nodes, node => normalizeAiNodeSettings(node, legacyAiSettings));
  state.view = { x: 120, y: 90, scale: 1, ...(data.view || {}) };
  state.nextNode = data.nextNode || inferNext("n", state.nodes.map(n => n.id));
  state.nextEdge = data.nextEdge || inferNext("e", state.edges.map(e => e.id));
  state.selected.clear();
  normalizeNodeSizes();
  render();
}

function inferNext(prefix, ids) {
  const max = ids.reduce((m, id) => Math.max(m, Number(String(id).replace(prefix, "")) || 0), 0);
  return max + 1;
}

function markDirty() {
  state.dirty = true;
  saveCurrentPage();
  persistPages();
  renderPageTabs();
}

function pushHistory() {
  state.history.push(cloneData());
  if (state.history.length > 20) state.history.shift();
  state.future = [];
  updateUndoRedo();
  markDirty();
}

function undo() {
  if (state._deletedPage) {
    const { page, index } = state._deletedPage;
    state.pages.splice(index, 0, page);
    state._deletedPage = null;
    state.activePageId = page.id;
    restoreData(page.data);
    state.history = [cloneData()];
    state.future = [];
    persistPages();
    updateUndoRedo();
    render();
    toast("已撤回删除");
    return;
  }
  if (state.history.length < 2) return;
  state.future.push(state.history.pop());
  restoreData(state.history[state.history.length - 1]);
  saveCurrentPage();
  persistPages();
  updateUndoRedo();
  toast("已撤销");
}

function redo() {
  const next = state.future.pop();
  if (!next) return;
  state.history.push(next);
  restoreData(next);
  saveCurrentPage();
  persistPages();
  updateUndoRedo();
  toast("已重做");
}

function updateUndoRedo() {
  const undoBtn = $("undoBtn");
  const redoBtn = $("redoBtn");
  if (undoBtn) undoBtn.disabled = state.history.length < 2;
  if (redoBtn) redoBtn.disabled = state.future.length === 0;
}

function applySettings() {
  els.app.className = `app theme-${state.settings.theme}`;
  updateViewportGrid();
  $("themeBtn").innerHTML = state.settings.theme === "light"
    ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
    : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
}

function syncSettingsPanel() {
  if (els.languageSelect) els.languageSelect.value = uiLanguage;
  els.gridSize.value = state.settings.gridSize;
  els.snap.checked = state.settings.snap;
  state.settings.exportFolderLabel = resolvedExportFolderLabel(state.settings.exportFolderLabel);
  els.exportFolder.value = state.settings.exportFolderLabel;
  els.apiKeyInput.value = state.settings.apiKey || "";
  els.zipExportToggle.checked = state.settings.zipExport !== false;
  els.exportInputsToggle.checked = state.settings.exportInputs === true;
  syncCustomMaterialsList();
}

function syncCustomMaterialsList() {
  renderLibraryList("text", els.customTextsList);
  renderLibraryList("image", els.customMaterialsList);
}

function renderLibraryList(kind, container) {
  if (!container) return;
  const items = libraryItems(kind);
  container.innerHTML = items.map(item => `<div class="material-item" data-kind="${kind}" data-id="${escHtml(item.id)}">
    ${kind === "image" ? `<img class="material-thumb" src="/download/images/${encodeURIComponent(item.fileName || "")}" alt="" title="双击放大预览">` : ""}
    <span class="material-copy ${kind === "text" ? "with-preview" : ""}"><span class="material-name" title="${escHtml(item.name)}">${escHtml(item.name)}</span>${kind === "text" ? `<span class="material-content-preview" title="${escHtml(item.content || "")}">${escHtml((item.content || "").replace(/\s+/g, " "))}</span>` : ""}</span>
    <button class="material-rename-btn" title="编辑">✎</button>
    <button class="material-del-btn" title="删除素材">×</button>
  </div>`).join("");
  container.querySelectorAll(".material-item").forEach(row => {
    const kind = row.dataset.kind, id = row.dataset.id;
    const thumb = row.querySelector(".material-thumb");
    if (thumb) thumb.ondblclick = ev => {
      ev.preventDefault();
      ev.stopPropagation();
      showLightbox(thumb.src);
    };
    row.querySelector(".material-rename-btn").onclick = () => editTemplate(kind, id);
    row.querySelector(".material-del-btn").onclick = () => deleteTemplate(kind, id);
  });
}

function escHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function templateLocation(kind, id) {
  const key = kind === "text" ? "textTemplates" : "imageMaterials";
  const index = globalLibrary[key].findIndex(x => x.id === id);
  return index >= 0 ? { library: globalLibrary, key, index } : null;
}

function uniqueTemplateName(kind, desired, library) {
  const key = kind === "text" ? "textTemplates" : "imageMaterials";
  const names = new Set((library[key] || []).map(x => x.name));
  if (!names.has(desired)) return desired;
  let i = 2;
  while (names.has(`${desired} (${i})`)) i++;
  return `${desired} (${i})`;
}

function editTemplate(kind, id) {
  const loc = templateLocation(kind, id); if (!loc) return;
  const item = loc.library[loc.key][loc.index];
  if (kind === "text") {
    editingTextTemplate = { id };
    const textTab = els.settings.querySelector('.asset-type-btn[data-asset-tab="text"]');
    if (textTab && !textTab.classList.contains("active")) textTab.click();
    els.customTextName.value = item.name;
    els.customTextContent.value = item.content || "";
    els.customTextAddBtn.textContent = "保存修改";
    els.customTextEditor.classList.remove("hidden");
    els.customTextContent.focus();
    return;
  }
  editingImageTemplate = { id };
  const imageTab = els.settings.querySelector('.asset-type-btn[data-asset-tab="image"]');
  if (imageTab && !imageTab.classList.contains("active")) imageTab.click();
  els.customMaterialName.value = item.name;
  els.customMaterialFileInput.value = "";
  els.customMaterialFileHint.textContent = `当前图片：${item.fileName || "未知文件"}（可选择新图片替换）`;
  els.customMaterialEditorPreview.src = "/download/images/" + encodeURIComponent(item.fileName || "");
  els.customMaterialEditorPreview.classList.remove("hidden");
  els.customMaterialAddBtn.textContent = "保存修改";
  els.customImageEditor.classList.remove("hidden");
  els.customMaterialName.focus();
}

async function deleteTemplate(kind, id) {
  const loc = templateLocation(kind, id); if (!loc) return;
  const item = loc.library[loc.key][loc.index];
  if (!confirm(`删除“${item.name}”？已创建的节点不会受影响。`)) return;
  loc.library[loc.key].splice(loc.index, 1);
  if (kind === "image" && item.fileName) try { await fetch("/api/custom-material", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: item.fileName }) }); } catch (e) { console.error("[自定义图片] 删除文件失败", e); }
  persistLibraries(); syncCustomMaterialsList(); toast("素材已删除");
}

async function addCustomMaterial(source) {
  var name = (els.customMaterialName.value || "").trim();
  if (source?.name) name = source.name;
  if (!name) { toast("请输入素材名称"); return; }
  var file = source?.file || els.customMaterialFileInput.files?.[0];
  var base64 = source?.data || "";
  const editingLoc = !source && editingImageTemplate ? templateLocation("image", editingImageTemplate.id) : null;
  if (editingImageTemplate && !source && !editingLoc) { closeImageTemplateEditor(); toast("保存失败：原图片素材不存在"); return false; }
  if (!file && !base64 && !editingLoc) { toast("请选择图片文件"); return; }
  if (editingLoc && !file && !base64) {
    const item = editingLoc.library[editingLoc.key][editingLoc.index];
    item.name = name;
    item.revision = (item.revision || 1) + 1;
    persistLibraries(); syncCustomMaterialsList(); closeImageTemplateEditor(); toast("图片素材已更新");
    return true;
  }
  const target = globalLibrary;
  if (!editingLoc) name = uniqueTemplateName("image", name, target);
  console.log(`[自定义图片] ${editingLoc ? "替换" : "添加"}: 名称=${name}, 原始文件=${file?.name || source?.fileName || "节点图片"}, size=${file?.size || "base64"}`);
  if (!base64) base64 = await fileToBase64(file);
  try {
    const originalName = source?.fileName || file?.name || "custom.png";
    var resp = await fetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: originalName, data: stripDataUrl(base64) }) });
    var result = await resp.json();
    if (!result.success) { toast("保存失败: " + (result.error || "")); return; }
    console.log("[自定义素材] 服务端保存成功: fileName=" + result.fileName);
    if (editingLoc) {
      const item = editingLoc.library[editingLoc.key][editingLoc.index];
      const oldFileName = item.fileName;
      item.name = name;
      item.fileName = result.fileName;
      item.mime = source?.mime || file?.type || "image/png";
      item.revision = (item.revision || 1) + 1;
      if (oldFileName && oldFileName !== result.fileName) {
        try {
          await fetch("/api/custom-material", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: oldFileName }) });
        } catch (cleanupError) { console.error("[自定义图片] 旧图片清理失败", cleanupError); }
      }
    } else {
      target.imageMaterials.push(normalizeTemplate({ name, fileName: result.fileName, mime: source?.mime || file?.type || "image/png", revision: 1 }));
    }
    closeImageTemplateEditor();
    persistLibraries();
    syncCustomMaterialsList();
    toast(editingLoc ? "图片素材已更新" : "素材已添加");
    return true;
  } catch (e) {
    console.error("[自定义素材] 保存失败:", e);
    toast("保存失败: " + e.message);
    return false;
  }
}

function addCustomText(source) {
  let name = (source?.name || els.customTextName?.value || "").trim();
  const content = String(source?.content || els.customTextContent?.value || "").trim();
  if (!name) { toast("请输入模板名称"); return false; }
  if (!content) { toast("请输入完整文字内容"); return false; }
  if (!source && editingTextTemplate) {
    const loc = templateLocation("text", editingTextTemplate.id);
    if (!loc) { closeTextTemplateEditor(); toast("保存失败：原文字模板不存在"); return false; }
    const item = loc.library[loc.key][loc.index];
    item.name = name; item.content = content;
    persistLibraries(); syncCustomMaterialsList(); closeTextTemplateEditor(); toast("文字模板已更新");
    return true;
  }
  const target = globalLibrary;
  name = uniqueTemplateName("text", name, target);
  target.textTemplates.push(normalizeTemplate({ name, content, revision: 1 }));
  if (els.customTextName) els.customTextName.value = "";
  if (els.customTextContent) els.customTextContent.value = "";
  if (els.customTextEditor) els.customTextEditor.classList.add("hidden");
  persistLibraries(); syncCustomMaterialsList(); toast("文字模板已添加");
  return true;
}

function closeTextTemplateEditor() {
  editingTextTemplate = null;
  els.customTextName.value = "";
  els.customTextContent.value = "";
  els.customTextAddBtn.textContent = "添加文字模板";
  els.customTextEditor.classList.add("hidden");
}

function closeImageTemplateEditor() {
  editingImageTemplate = null;
  els.customMaterialName.value = "";
  els.customMaterialFileInput.value = "";
  els.customMaterialFileHint.textContent = "";
  els.customMaterialEditorPreview.src = "";
  els.customMaterialEditorPreview.classList.add("hidden");
  els.customMaterialAddBtn.textContent = "添加图片素材";
  els.customImageEditor.classList.add("hidden");
}

function stripDataUrl(value) { return String(value || "").replace(/^data:[^,]+,/, ""); }

function openLibraryImport(sources) {
  pendingLibraryImport = sources;
  els.libraryImportSource.innerHTML = sources.map((source, i) => `<option value="${i}">${escHtml(source.name)}</option>`).join("");
  renderLibraryImportItems();
  els.libraryImportDialog.classList.remove("hidden");
}

function closeLibraryImport() { els.libraryImportDialog.classList.add("hidden"); pendingLibraryImport = null; }

function renderLibraryImportItems() {
  const source = pendingLibraryImport?.[Number(els.libraryImportSource.value) || 0];
  if (!source) { els.libraryImportItems.innerHTML = ""; return; }
  const rows = [];
  for (const item of source.library.textTemplates || []) rows.push({ kind: "text", item });
  for (const item of source.library.imageMaterials || []) rows.push({ kind: "image", item });
  els.libraryImportItems.innerHTML = rows.length ? rows.map(row => `<label class="library-import-item">
    <input type="checkbox" class="library-import-check" data-kind="${row.kind}" data-id="${escHtml(row.item.id)}" checked>
    <span>${row.kind === "text" ? "文字" : "图片"}：${escHtml(row.item.name)}</span>
  </label>`).join("") : '<div class="setting-desc">没有可导入的自定义图文素材</div>';
}

async function confirmLibraryImport() {
  const source = pendingLibraryImport?.[Number(els.libraryImportSource.value) || 0]; if (!source) return;
  const selected = Array.from(els.libraryImportItems.querySelectorAll(".library-import-check:checked"));
  if (!selected.length) return toast("请至少勾选一个素材");
  els.libraryImportConfirmBtn.disabled = true;
  let textCount = 0, imageCount = 0, failed = 0;
  for (const checkbox of selected) {
    const kind = checkbox.dataset.kind;
    const key = kind === "text" ? "textTemplates" : "imageMaterials";
    const item = source.library[key].find(x => x.id === checkbox.dataset.id); if (!item) continue;
    try {
      if (kind === "text") { if (addCustomText({ ...item })) textCount++; else failed++; }
      else {
        let data = item.data || "";
        if (!data && item.fileName) {
          const resp = await fetch("/download/images/" + encodeURIComponent(item.fileName));
          if (!resp.ok) throw new Error("图片文件不存在");
          data = await blobToBase64(await resp.blob());
        }
        if (await addCustomMaterial({ ...item, data })) imageCount++; else failed++;
      }
    } catch (e) { failed++; console.error("[导入] 素材导入失败", item.name, e); }
  }
  els.libraryImportConfirmBtn.disabled = false; closeLibraryImport();
  console.log(`[导入] 文字=${textCount}, 图片=${imageCount}, 失败=${failed}`);
  toast(`导入完成：文字 ${textCount}，图片 ${imageCount}${failed ? `，失败 ${failed}` : ""}`);
}

function fileToBase64(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function() {
      var result = reader.result;
      var comma = result.indexOf(",");
      resolve(comma >= 0 ? result.substring(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updateViewportGrid() {
  const size = Math.max(4, state.settings.gridSize * state.view.scale);
  els.viewport.style.backgroundSize = `${size}px ${size}px`;
  els.viewport.style.backgroundPosition = `${state.view.x}px ${state.view.y}px`;
}

function setProgress(value, label = "正在导出") {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  els.progressPanel.classList.remove("hidden");
  els.progressLabel.textContent = label;
  els.progressPercent.textContent = `${pct}%`;
  els.progressFill.style.width = `${pct}%`;
}

function hideProgressSoon() {
  window.setTimeout(() => { els.progressPanel.classList.add("hidden"); els.batchTaskList.classList.add("hidden"); }, 900);
}

function setBatchProgress(total, done, tasks) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  els.progressPanel.classList.remove("hidden");
  els.progressLabel.textContent = `批量生成 ${done}/${total}`;
  els.progressPercent.textContent = `${pct}%`;
  els.progressFill.style.width = `${pct}%`;
  els.batchCancelAllBtn.classList.remove("hidden");
  // Build task list with cancel buttons
  els.batchTaskList.classList.remove("hidden");
  els.batchTaskList.innerHTML = tasks.map((t, i) => {
    const active = ["submitting", "generating", "downloading"].includes(t.status);
    let statusText = t.status === "done" ? "✓ 完成" : t.status === "failed" ? "✗ 失败" : t.status === "cancelled" ? "已取消" : t.status === "submitting" ? "⏳ 提交中" : t.status === "downloading" ? "⇩ 下载中" : t.status === "generating" ? "⏳ 生成中" : "等待中";
    let cls = t.status === "done" ? "done" : t.status === "failed" ? "failed" : t.status === "cancelled" ? "cancelled" : active ? "generating" : "";
    let cancelBtn = (t.status === "waiting" || active) ? `<button class="batch-task-cancel" data-task="${i}">✕</button>` : "";
    return `<div class="batch-task-item ${cls}"><span>${i + 1}. ${t.fileName || `任务${i + 1}`}</span><span>${statusText}${cancelBtn}</span></div>`;
  }).join("");
  // Bind task cancel clicks
  els.batchTaskList.querySelectorAll(".batch-task-cancel").forEach(btn => {
    btn.onclick = () => {
      const ti = parseInt(btn.dataset.task);
      if (tasks[ti]) tasks[ti].status = "cancelled";
      const owner = tasks[ti]?.nodeId ? findNode(tasks[ti].nodeId) : state.nodes.find(n => n.batchTasks === tasks);
      if (owner) syncAiNodeTaskProgress(owner, tasks[ti]?.nodeId ? tasks.filter(t => t.nodeId === tasks[ti].nodeId) : tasks);
      setBatchProgress(total, tasks.filter(t => t.status === "done").length, tasks);
    };
  });
}

function hideBatchProgressSoon() {
  window.setTimeout(() => { els.progressPanel.classList.add("hidden"); els.batchTaskList.classList.add("hidden"); els.batchCancelAllBtn.classList.add("hidden"); }, 2000);
}

function nextPaint() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function toast(text) {
  const el = document.createElement("div");
  el.className = "toast-msg";
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  window.setTimeout(() => {
    el.classList.remove("show");
    window.setTimeout(() => el.remove(), 300);
  }, 2400);
}

function screenToWorld(clientX, clientY) {
  const r = els.viewport.getBoundingClientRect();
  return {
    x: (clientX - r.left - state.view.x) / state.view.scale,
    y: (clientY - r.top - state.view.y) / state.view.scale,
  };
}

function snap(v) {
  return state.settings.snap ? Math.round(v / state.settings.gridSize) * state.settings.gridSize : v;
}

function addNode(type, x = 160, y = 120, commit = true) {
  const node = {
    id: uid("n"),
    type,
    x: snap(x),
    y: snap(y),
    w: NODE_WIDTH,
    h: type === "ai-image" ? AI_NODE_HEIGHT : type === "group" ? 200 : NODE_HEIGHT,
    disabled: false,
    created: Date.now() + state.nextNode,
    text: type === "text" ? "请输入文字内容" : "",
    image: null,
    fileName: "",
    mime: "",
    prompt: "",
    generatedImage: null,
    taskId: null,
    generating: false,
    images: type === "group" ? [] : undefined,
    items: null,
    internalEdges: null,
    seq: 0,
  };
  state.nodes.push(node);
  state.selected = new Set([node.id]);
  if (commit) {
    pushHistory();
    render();
  }
  return node;
}

function walkNodes(nodes, fn) {
  for (const node of nodes || []) {
    fn(node);
    if (Array.isArray(node.items)) walkNodes(node.items, fn);
  }
}

async function createNodeFromTemplate(kind, template, x, y) {
  const node = addNode(kind === "text" ? "text" : "image", x, y, false);
  if (kind === "text") node.text = template.content || "";
  else {
    try {
      const resp = await fetch("/download/images/" + encodeURIComponent(template.fileName));
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      node.image = await blobToBase64(await resp.blob()); node.fileName = template.fileName; node.mime = template.mime || "image/png";
    } catch (e) { state.nodes = state.nodes.filter(x => x.id !== node.id); console.error("[自定义图片] 创建失败", e); return toast("创建失败：素材图片无法读取"); }
  }
  pushHistory(); render(); toast(kind === "text" ? "已创建自定义文字节点" : "已创建自定义图片节点");
}

async function saveNodeAsTemplate(node) {
  const kind = node.type === "text" ? "text" : "image";
  const content = kind === "text" ? String(node.text || "").trim() : (node.type === "ai-image" ? node.generatedImage : node.image);
  if (!content) return toast(kind === "text" ? "无法收藏：文字节点内容为空" : "无法收藏：图片节点没有图片");
  const suggested = kind === "text" ? content.split(/\r?\n/)[0].slice(0, 30) : (node.fileName || "自定义图片");
  const name = prompt("自定义素材名称", suggested); if (name === null || !name.trim()) return;
  const target = globalLibrary;
  const finalName = uniqueTemplateName(kind, name.trim(), target);
  if (kind === "text") {
    const template = normalizeTemplate({ name: finalName, content, revision: 1 });
    target.textTemplates.push(template);
  } else {
    const raw = stripDataUrl(content);
    const originalName = node.fileName || "custom.png";
    try {
      const resp = await fetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: originalName, data: raw }) });
      const result = await resp.json(); if (!result.success) throw new Error(result.error || "保存失败");
      const template = normalizeTemplate({ name: finalName, fileName: result.fileName, mime: node.mime || "image/png", revision: 1 });
      target.imageMaterials.push(template);
    } catch (e) { console.error("[自定义图片] 节点收藏失败", e); return toast("收藏失败：" + e.message); }
  }
  persistLibraries(); syncCustomMaterialsList(); toast("已保存到全局素材库");
}

function groupSelection() {
  const nodeIds = new Set([...state.selected].filter(id => {
    const n = findNode(id);
    return n && n.type !== "output";
  }));
  if (nodeIds.size < 2) return toast("至少选中 2 个节点才能编组");

  const nodes = state.nodes.filter(n => nodeIds.has(n.id));
  const internalEdges = state.edges.filter(e => nodeIds.has(e.from.node) && nodeIds.has(e.to.node)).map(e => ({ ...e }));
  const externalInEdges = state.edges.filter(e => nodeIds.has(e.to.node) && !nodeIds.has(e.from.node));
  const externalOutEdges = state.edges.filter(e => nodeIds.has(e.from.node) && !nodeIds.has(e.to.node));

  const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
  const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;

  const group = addNode("group", snap(cx - NODE_WIDTH / 2), snap(cy - NODE_HEIGHT / 2), false);
  group.images = undefined;
  group.items = JSON.parse(JSON.stringify(nodes));
  group.internalEdges = internalEdges;
  group._extInSources = externalInEdges.length >= 1 ? externalInEdges.map(e => ({ ...e })) : null;
  group._extOutTargets = externalOutEdges.length >= 1 ? externalOutEdges.map(e => ({ ...e })) : null;

  state.nodes = state.nodes.filter(n => !nodeIds.has(n.id));
  state.edges = state.edges.filter(e => !nodeIds.has(e.from.node) && !nodeIds.has(e.to.node));

  if (group._extInSources) {
    for (const e of group._extInSources) {
      state.edges.push({ id: uid("e"), from: { node: e.from.node, port: "out" }, to: { node: group.id, port: "in" } });
    }
  }
  if (group._extOutTargets) {
    for (const e of group._extOutTargets) {
      state.edges.push({ id: uid("e"), from: { node: group.id, port: "out" }, to: { node: e.to.node, port: "in" } });
    }
  }

  state.selected = new Set([group.id]);
  pushHistory();
  render();
  toast(`已编组 ${nodes.length} 个节点`);
}

function ungroupNode(groupId) {
  const group = findNode(groupId);
  if (!group || group.type !== "group") return toast("不是编组节点");

  const restoredIds = new Set();
  if (group.items) {
    for (const item of group.items) {
      state.nodes.push(item);
      restoredIds.add(item.id);
    }
    if (group.internalEdges) {
      for (const e of group.internalEdges) state.edges.push(e);
    }
    if (group._extInSources) {
      for (const e of group._extInSources) state.edges.push({ id: uid("e"), from: { node: e.from.node, port: "out" }, to: { node: e.to.node, port: "in" } });
    }
    if (group._extOutTargets) {
      for (const e of group._extOutTargets) state.edges.push({ id: uid("e"), from: { node: e.from.node, port: "out" }, to: { node: e.to.node, port: "in" } });
    }
  } else if (group.images && group.images.length) {
    const incomingEdges = state.edges.filter(e => e.to.node === groupId);
    for (let i = 0; i < group.images.length; i++) {
      const gImg = group.images[i];
      const imgNode = addNode("image", group.x + i * 260, group.y + 60, false);
      imgNode.image = gImg.image || null;
      imgNode.fileName = gImg.fileName || "";
      imgNode.mime = gImg.mime || "";
      restoredIds.add(imgNode.id);
      for (const e of incomingEdges) {
        state.edges.push({ id: uid("e"), from: { node: e.from.node, port: "out" }, to: { node: imgNode.id, port: "in" } });
      }
    }
  } else {
    return toast("该编组节点无可取消的内容");
  }

  state.nodes = state.nodes.filter(n => n.id !== groupId);
  state.edges = state.edges.filter(e => e.from.node !== groupId && e.to.node !== groupId);

  state.selected = restoredIds;
  pushHistory();
  render();
  toast("已取消编组");
}

function splitMultiInputAiNode(nodeId) {
  const node = findNode(nodeId);
  if (!node || node.type !== "ai-image") return [nodeId];

  const incoming = buildIncomingIndex();
  const directEdges = incoming.get(nodeId) || [];
  if (directEdges.length <= 1) return [nodeId];

  const newNodeIds = [nodeId];
  for (let i = 1; i < directEdges.length; i++) {
    const newAi = JSON.parse(JSON.stringify(node));
    newAi.id = uid("n");
    newAi.x = node.x + i * (NODE_WIDTH + 40);
    newAi.seq = state.nextNode++;
    newAi.generating = false;
    newAi.generatedImage = null;
    newAi.taskId = null;
    newAi.batchTasks = null;
    state.nodes.push(newAi);
    newNodeIds.push(newAi.id);
    var edge = directEdges[i];
    var existingEdge = state.edges.find(function(e) { return e.id === edge.id; });
    if (existingEdge) existingEdge.to.node = newAi.id;
  }
  return newNodeIds;
}

function deleteNodes(ids) {
  if (!ids.size) return;
  state.nodes = state.nodes.filter(n => !ids.has(n.id));
  state.edges = state.edges.filter(e => !ids.has(e.from.node) && !ids.has(e.to.node));
  state.selected.clear();
  pushHistory();
  render();
}

function toggleDisabled(ids, disabled = null) {
  state.nodes.forEach(n => {
    if (ids.has(n.id)) n.disabled = disabled === null ? !n.disabled : disabled;
  });
  pushHistory();
  render();
}

function copySelection(clearSystemClipboard = true) {
  const nodes = state.nodes.filter(n => state.selected.has(n.id)).map(stripCopiedImage);
  state.clipboard = {
    nodes,
    edges: state.edges.filter(e => state.selected.has(e.from.node) && state.selected.has(e.to.node)),
  };
  if (clearSystemClipboard && navigator.clipboard?.writeText) navigator.clipboard.writeText("").catch(() => {});
  toast(`已复制 ${nodes.length} 个节点`);
}

function stripCopiedImage(n) {
  const copy = JSON.parse(JSON.stringify(n));
  if (copy.type === "ai-image") {
    copy.generatedImage = null;
    copy.taskId = null;
    copy.generating = false;
  }
  return copy;
}

function pasteNodes(data, anchor = null) {
  const map = new Map();
  const pasted = [];
  const minX = Math.min(...data.nodes.map(n => n.x));
  const minY = Math.min(...data.nodes.map(n => n.y));
  data.nodes.forEach(n => {
    const nn = {
      ...JSON.parse(JSON.stringify(n)),
      id: uid("n"),
      x: anchor ? anchor.x + (n.x - minX) : n.x + 36,
      y: anchor ? anchor.y + (n.y - minY) : n.y + 36,
      w: NODE_WIDTH,
      h: n.type === "ai-image" ? Math.max(Number(n.h) || 0, AI_NODE_HEIGHT) : n.type === "group" ? Math.max(Number(n.h) || 0, 200) : NODE_HEIGHT,
      created: Date.now() + state.nextNode,
    };
    walkNodes([nn], pastedNode => { if (pastedNode.customRef) delete pastedNode.customRef; });
    map.set(n.id, nn.id);
    pasted.push(nn);
  });
  state.nodes.push(...pasted);
  (data.edges || []).forEach(e => {
    if (map.has(e.from.node) && map.has(e.to.node)) {
      state.edges.push({ id: uid("e"), from: { node: map.get(e.from.node), port: "out" }, to: { node: map.get(e.to.node), port: "in" } });
    }
  });
  state.selected = new Set(pasted.map(n => n.id));
  pushHistory();
  render();
  toast(`已粘贴 ${pasted.length} 个节点`);
}

function addEdge(fromNode, toNode) {
  if (fromNode === toNode) return toast("不能连接到自己");
  const target = findNode(toNode);
  if (!target || target.type !== "output" && !target) return;
  if (state.edges.some(e => e.from.node === fromNode && e.to.node === toNode)) return toast("这两个端口已经连接");
  state.edges.push({ id: uid("e"), from: { node: fromNode, port: "out" }, to: { node: toNode, port: "in" } });
  pushHistory();
  render();
}

function removeEdge(id) {
  state.edges = state.edges.filter(e => e.id !== id);
  pushHistory();
  render();
}

function disconnectEdges(ids) {
  if (!ids.size) return;
  state.edges = state.edges.filter(e => !ids.has(e.from.node) && !ids.has(e.to.node));
  pushHistory();
  render();
}

function findNode(id) {
  return state.nodes.find(n => n.id === id);
}

function normalizeAiNodeSettings(node, fallback = {}) {
  if (!node || node.type !== "ai-image") return node;
  node._model = node._model || fallback.model || "gpt-image-2";
  node._resolution = node._resolution || fallback.resolution || "1k";
  node._size = node._size || fallback.size || "1:1";
  node._quality = node._model === "gpt-image-2" ? (node._quality || fallback.quality || "medium") : null;
  return node;
}

function selectOptions(options, selected) {
  return options.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function aiNodeControls(node) {
  normalizeAiNodeSettings(node);
  const isGpt = node._model === "gpt-image-2";
  const models = [["gpt-image-2", "GPT Image 2"], ["gemini-3.1-flash-image-preview", "Gemini 3.1 Flash"]];
  const resolutions = [["1k", "1K"], ["2k", "2K"], ["4k", "4K"]];
  const qualities = [["auto", "auto"], ["low", "low"], ["medium", "medium"], ["high", "high"]];
  const ratios = ["1:1", "auto", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"].map(value => [value, value]);
  return `<div class="ai-node-settings">
    <label class="ai-model-field"><span>模型</span><select data-role="ai-model">${selectOptions(models, node._model)}</select></label>
    <label><span>分辨率</span><select data-role="ai-resolution">${selectOptions(resolutions, node._resolution)}</select></label>
    <label class="${isGpt ? "" : "hidden"}"><span>画质</span><select data-role="ai-quality">${selectOptions(qualities, node._quality || "medium")}</select></label>
    <label><span>比例</span><select data-role="ai-size">${selectOptions(ratios, node._size)}</select></label>
  </div>`;
}

function setAiNodeProgress(node, status, label, percent = null, error = "") {
  if (!node || node.type !== "ai-image") return;
  node._aiProgress = {
    status: ["waiting", "submitting", "generating", "downloading", "done", "failed", "cancelled"].includes(status) ? status : "generating",
    label: String(label || "生成中"),
    percent: Number.isFinite(Number(percent)) ? Math.max(0, Math.min(100, Number(percent))) : null,
    error: String(error || ""),
  };
  renderNodes();
}

function clearAiNodeProgressSoon(node, delay = 1800) {
  const expected = node?._aiProgress;
  window.setTimeout(() => {
    if (!node || node._aiProgress !== expected) return;
    node._aiProgress = null;
    renderNodes();
  }, delay);
}

function syncAiNodeTaskProgress(node, tasks) {
  if (!node || !tasks?.length) return;
  const total = tasks.length;
  const done = tasks.filter(t => t.status === "done").length;
  const failed = tasks.filter(t => t.status === "failed").length;
  const cancelled = tasks.filter(t => t.status === "cancelled").length;
  const active = tasks.filter(t => ["submitting", "generating", "downloading"].includes(t.status));
  const progressSum = tasks.reduce((sum, t) => sum + (t.status === "done" ? 100 : Number(t.progress) || 0), 0);
  const percent = Math.round(progressSum / total);
  if (done + failed + cancelled === total) {
    if (failed) setAiNodeProgress(node, "failed", `完成 ${done}/${total}，失败 ${failed}`, percent, tasks.find(t => t.error)?.error || "");
    else if (cancelled) setAiNodeProgress(node, "cancelled", `已取消，完成 ${done}/${total}`, percent);
    else { setAiNodeProgress(node, "done", `已完成 ${done}/${total}`, 100); clearAiNodeProgressSoon(node); }
    return;
  }
  const status = active.some(t => t.status === "downloading") ? "downloading" : active.some(t => t.status === "generating") ? "generating" : active.some(t => t.status === "submitting") ? "submitting" : "waiting";
  const label = status === "waiting" ? `等待中 · 已完成 ${done}/${total}` : `${status === "submitting" ? "正在提交" : status === "downloading" ? "正在下载" : "正在生成"} · 已完成 ${done}/${total}`;
  setAiNodeProgress(node, status, label, active.length || done ? percent : null);
}

function aiNodeProgressMarkup(node) {
  const progress = node._aiProgress;
  if (!progress) return "";
  const hasPercent = progress.percent !== null;
  const percentText = hasPercent ? `${Math.round(progress.percent)}%` : "";
  const title = progress.error || progress.label;
  return `<div class="ai-node-progress ai-progress-${progress.status}" title="${escapeHtml(title)}">
    <div class="ai-node-progress-row"><span>${escapeHtml(progress.label)}</span><b>${percentText}</b></div>
    <div class="ai-node-progress-track"><span class="${hasPercent ? "" : "indeterminate"}" style="${hasPercent ? `width:${progress.percent}%` : ""}"></span></div>
  </div>`;
}

function aiImageBody(node) {
  const controls = aiNodeControls(node);
  if (node.generating) {
    return `<div class="ai-generating"><div class="ai-spinner"></div>生成中...</div>
      <div class="ai-prompt">${escapeHtml(node.prompt || "等待提示词...")}</div>${controls}`;
  }
  if (node.generatedImage) {
    return `<div class="image-preview"><img src="${node.generatedImage}" alt="" draggable="false"></div>
      <div class="ai-actions">
        <button data-role="ai-generate" class="ai-generate-btn">重新生成</button>
        <button data-role="clear-image">清除</button>
      </div>
      <div class="ai-prompt">${escapeHtml(node.prompt || "")}</div>${controls}`;
  }
  return `<div class="ai-preview">${node.prompt ? escapeHtml(node.prompt) : "连接文字节点作为提示词"}</div>
    <div class="ai-actions">
      <button data-role="ai-generate" class="ai-generate-btn">生成</button>
    </div>
    ${node.prompt ? `<div class="ai-prompt">${escapeHtml(node.prompt)}</div>` : ""}${controls}`;
}

function collectUpstreamForAI(nodeId, incoming) {
  incoming = incoming || buildIncomingIndex();
  const result = { texts: [], images: [], groupImages: [], orderedRefs: [] };
  const visited = new Set();
  function visit(id) {
    if (visited.has(id) || id === nodeId) { visited.add(id); return; }
    visited.add(id);
    const n = findNode(id);
    if (!n) return;
    // AI 节点截断：收集已生成图片后不再向上追溯（包括停用的 AI 节点）
    if (n.type === "ai-image") {
      if (n.generatedImage) {
        const ref = { image: n.generatedImage, fileName: n.fileName, mime: n.mime, _x: n.x };
        result.images.push(ref);
        result.orderedRefs.push(ref);
      }
      return;
    }
    if (n.disabled) return;
    if (n.type === "text" && n.text && n.text.trim()) result.texts.push(n.text.trim());
    if (n.type === "image" && n.image) {
      const ref = { image: n.image, fileName: n.fileName, mime: n.mime, _x: n.x };
      result.images.push(ref);
      result.orderedRefs.push(ref);
    }
    if (n.type === "group") {
      // Ctrl+G 编组 (items)
      if (n.items) {
        for (const item of n.items) {
          if (item.type === "text" && item.text && item.text.trim()) result.texts.push(item.text.trim());
          if (item.type === "image" && item.image) {
            const ref = { image: item.image, fileName: item.fileName, mime: item.mime, _x: n.x };
            result.groupImages.push(ref);
            result.orderedRefs.push(ref);
          }
          if (item.type === "ai-image" && item.generatedImage) {
            const ref = { image: item.generatedImage, fileName: item.fileName, mime: item.mime, _x: n.x };
            result.groupImages.push(ref);
            result.orderedRefs.push(ref);
          }
        }
      }
      // 文件夹编组 (images)
      if (n.images && n.images.length) {
        for (const gImg of n.images) {
          const ref = { image: gImg.image, fileName: gImg.fileName, mime: gImg.mime, _x: n.x };
          result.groupImages.push(ref);
          result.orderedRefs.push(ref);
        }
      }
    }
    const incomingEdges = incoming.get(id) || [];
    incomingEdges.forEach(e => visit(e.from.node));
  }
  (incoming.get(nodeId) || []).forEach(e => visit(e.from.node));
  result.images.sort((a, b) => (a._x || 0) - (b._x || 0));
  result.orderedRefs.sort((a, b) => (a._x || 0) - (b._x || 0));
  return result;
}

function refreshAiPrompt(nodeId) {
  const node = findNode(nodeId);
  if (!node || node.type !== "ai-image") return;
  const incoming = buildIncomingIndex();
  const { texts, images } = collectUpstreamForAI(nodeId, incoming);
  node.prompt = texts.join("，");
  render();
}

async function submitGeneration(prompt, imageUrls, node) {
  if (!prompt && !imageUrls.length) throw new Error("需要提示词或参考图");
  normalizeAiNodeSettings(node);
  const payload = {
    model: node._model,
    prompt: prompt || "generate an image",
    n: 1,
    size: node._size,
    resolution: node._resolution,
  };
  if (node._model === "gpt-image-2") {
    payload.quality = node._quality || "medium";
  }
  if (imageUrls.length) payload.image_urls = imageUrls;

  payload._apiKey = state.settings.apiKey;

  const resp = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || "提交失败");
  if (!data.data || !data.data[0] || !data.data[0].task_id) throw new Error("未获取到任务ID");
  return data.data[0].task_id;
}

async function pollTask(taskId, onProgress = null) {
  const maxAttempts = 120;
  let lastErr = null;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));
    let data;
    try {
      const resp = await fetch(`/api/task/${encodeURIComponent(taskId)}?apiKey=${encodeURIComponent(state.settings.apiKey)}`);
      data = await resp.json();
    } catch (e) {
      lastErr = e;
      if (i < maxAttempts - 1) continue;
      break;
    }
    lastErr = null;
    if (data.error) throw new Error(data.error.message || "查询失败");
    if (data.data) {
      if (data.data.status === "completed") {
        if (onProgress) onProgress(100, "completed");
        const images = data.data.result?.images;
        if (images && images.length && images[0].url) {
          const url = images[0].url;
          return Array.isArray(url) ? url[0] : url;
        }
        throw new Error("任务完成但无图片结果");
      }
      if (data.data.status === "failed") {
        throw new Error(data.data.error?.message || "生成失败");
      }
      const pct = data.data.progress || 0;
      if (onProgress) onProgress(pct || null, data.data.status || "processing");
      setProgress(15 + pct * 0.75, `AI生成中 ${pct}%`);
    }
  }
  throw new Error(lastErr ? `网络超时，任务 ${taskId} 已提交，可稍后重试` : "任务超时，请稍后重试");
}

async function fetchImageAsBase64(url) {
  const resp = await fetch("/api/download-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl: url }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data.base64;
}

async function generateAiImage(nodeId) {
  const node = findNode(nodeId);
  if (!node || node.type !== "ai-image") return;
  if (!state.settings.apiKey) {
    toast("请先在设置中填入 API Key");
    return;
  }

  const nodeIds = splitMultiInputAiNode(nodeId);
  if (nodeIds.length > 1) pushHistory();
  const total = nodeIds.length;
  let idx = 0;

  for (const nid of nodeIds) {
    const aiNode = findNode(nid);
    if (!aiNode) continue;

    refreshAiPrompt(nid);
    const upstream = collectUpstreamForAI(nid);
    if (!upstream.texts.length && !upstream.images.length && !upstream.groupImages.length) continue;

    if (total > 1) setProgress(idx / total * 100, `拆分生成 ${idx + 1}/${total}`);
    if (upstream.groupImages.length > 0) {
      await generateBatchFromGroup(aiNode, upstream);
    } else {
      await generateSingle(aiNode, upstream);
    }
    idx++;
  }
}

async function generateSingle(node, upstream) {
  const { texts, images } = upstream;
  const imageUrls = images.map(img => img.image);

  node.batchTasks = null;
  node.generating = true;
  node.generatedImage = null;
  node.taskId = null;
  setAiNodeProgress(node, "submitting", "正在提交任务");
  render();

  try {
    setProgress(5, "提交AI生成任务");
    await nextPaint();
    const taskId = await submitGeneration(texts.join("，"), imageUrls, node);
    node.taskId = taskId;
    setAiNodeProgress(node, "generating", "正在生成");
    setProgress(10, "等待生成结果");
    await nextPaint();
    const imageUrl = await pollTask(taskId, pct => setAiNodeProgress(node, "generating", "正在生成", pct));
    setAiNodeProgress(node, "downloading", "正在下载结果", 96);
    setProgress(92, "下载生成图片");
    await nextPaint();
    const base64 = await fetchImageAsBase64(imageUrl);
    node.generatedImage = base64;
    node.generating = false;
    node.fileName = `ai_generated_${Date.now()}.png`;
    node.mime = "image/png";
    fetch("/api/save-export-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderName: "ai_generated", files: [{ name: node.fileName, data: base64 }] }),
    }).catch(() => {});
    setAiNodeProgress(node, "done", "生成完成", 100);
    clearAiNodeProgressSoon(node);
    setProgress(100, "AI生成完成");
    pushHistory();
    render();
    hideProgressSoon();
    toast("AI绘图完成");
  } catch (err) {
    node.generating = false;
    node.taskId = null;
    setAiNodeProgress(node, "failed", "生成失败", null, err.message);
    setProgress(100, "生成失败");
    hideProgressSoon();
    render();
    toast("AI 生成失败: " + err.message);
    console.error(err);
  }
}

async function generateBatchFromGroup(node, upstream) {
  const { texts, images, groupImages } = upstream;
  const regularUrls = images.map(img => img.image);
  const prompt = texts.join("，");
  const totalTasks = groupImages.length;
  const MAX_CONCURRENT = 5;

  node.generatedImage = null;
  node.generating = true;
  node.batchTasks = groupImages.map((gImg, i) => ({
    index: i,
    status: "waiting",
    fileName: gImg.fileName,
    taskId: null,
    result: null,
  }));
  node._batchCancelled = false;
  syncAiNodeTaskProgress(node, node.batchTasks);
  render();

  els.batchCancelAllBtn.onclick = () => {
    node._batchCancelled = true;
    node.batchTasks.forEach(t => { if (t.status === "waiting") t.status = "cancelled"; });
    syncAiNodeTaskProgress(node, node.batchTasks);
    setBatchProgress(totalTasks, node.batchTasks.filter(t => t.status === "done").length, node.batchTasks);
    toast("已取消剩余任务");
  };

  try {
    setBatchProgress(totalTasks, 0, node.batchTasks);

    let nextIndex = 0;
    let running = 0;

    const submitOne = async (t) => {
      if (node._batchCancelled || t.status === "cancelled") return;
      t.status = "submitting";
      t.progress = null;
      syncAiNodeTaskProgress(node, node.batchTasks);
      setBatchProgress(totalTasks, node.batchTasks.filter(bt => bt.status === "done").length, node.batchTasks);
      await nextPaint();
      try {
        const taskImages = [...regularUrls, groupImages[t.index].image];
        t.taskId = await submitGeneration(prompt, taskImages, node);
        if (node._batchCancelled || t.status === "cancelled") { t.status = "cancelled"; return; }
        t.status = "generating";
        syncAiNodeTaskProgress(node, node.batchTasks);
        const imageUrl = await pollTask(t.taskId, pct => {
          t.progress = pct;
          syncAiNodeTaskProgress(node, node.batchTasks);
        });
        if (node._batchCancelled || t.status === "cancelled") { t.status = "cancelled"; return; }
        t.status = "downloading";
        t.progress = 96;
        syncAiNodeTaskProgress(node, node.batchTasks);
        t.result = await fetchImageAsBase64(imageUrl);
        t.status = "done";
        t.progress = 100;
      } catch (err) {
        if (node._batchCancelled) t.status = "cancelled";
        else { t.status = "failed"; t.error = err.message; }
      } finally {
        running--;
        syncAiNodeTaskProgress(node, node.batchTasks);
        setBatchProgress(totalTasks, node.batchTasks.filter(bt => bt.status === "done").length, node.batchTasks);
        await nextPaint();
      }
    };

    const startNext = () => {
      while (nextIndex < totalTasks && running < MAX_CONCURRENT && !node._batchCancelled) {
        const t = node.batchTasks[nextIndex];
        if (t.status !== "cancelled") {
          running++;
          submitOne(t);
        }
        nextIndex++;
      }
    };

    startNext();

    // Poll until all tasks done or cancelled
    while (nextIndex < totalTasks || running > 0) {
      // Check if any cancelled tasks should skip
      for (let i = nextIndex; i < totalTasks; i++) {
        if (node.batchTasks[i].status === "cancelled") {
          nextIndex = Math.max(nextIndex, i + 1);
        }
      }
      // Send new tasks at 1-second intervals
      if (running < MAX_CONCURRENT && nextIndex < totalTasks && !node._batchCancelled) {
        startNext();
      }
      await new Promise(r => setTimeout(r, 1000));
      // Check for completion
      const allDone = node.batchTasks.every(t => t.status === "done" || t.status === "failed" || t.status === "cancelled");
      if (allDone && running === 0) break;
    }

    if (node._batchCancelled) {
      node.batchTasks.forEach(t => { if (t.status === "waiting") t.status = "cancelled"; });
      syncAiNodeTaskProgress(node, node.batchTasks);
    }

    // Create resulting image nodes
    const aiX = node.x, aiY = node.y;
    let seqNum = 0;
    for (const t of node.batchTasks) {
      if (t.status !== "done" || !t.result) continue;
      seqNum++;
      const imgNode = addNode("image", aiX + NODE_WIDTH + 40, aiY + (seqNum - 1) * 220, false);
      imgNode.image = t.result;
      imgNode.fileName = t.fileName || `ai_batch_${seqNum}.png`;
      imgNode.mime = "image/png";
      imgNode.aiSourceNodeId = node.id;
      imgNode.aiBatchIndex = t.index;
    }
    node.generating = false;
    node._batchCancelled = false;
    syncAiNodeTaskProgress(node, node.batchTasks);
    pushHistory();
    render();
    toast(`${seqNum} 张图片已生成`);
    hideBatchProgressSoon();
  } catch (err) {
    node.generating = false;
    node._batchCancelled = false;
    setAiNodeProgress(node, "failed", "批量生成失败", null, err.message);
    render();
    toast("批量生成失败: " + err.message);
    console.error(err);
    hideBatchProgressSoon();
  }
}

function addAiImageNode(x, y, sourceIds) {
  const node = addNode("ai-image", x, y, false);
  normalizeAiNodeSettings(node);
  if (sourceIds && sourceIds.length) {
    sourceIds.forEach(sourceId => {
      const source = findNode(sourceId);
      if (!source) return;
      if (source.type === "output") return;
      state.edges.push({ id: uid("e"), from: { node: sourceId, port: "out" }, to: { node: node.id, port: "in" } });
    });
  }
  state.selected = new Set([node.id]);
  refreshAiPrompt(node.id);
  pushHistory();
  render();
  toast("已创建 AI 绘图节点");
  return node;
}

function addOutputNode(sourceId) {
  const source = findNode(sourceId);
  if (!source) return;
  if (state.edges.some(e => e.from.node === sourceId)) {
    // Already has outgoing edge — check if it goes to an output node
    const existingOut = state.edges.find(e => e.from.node === sourceId);
    if (existingOut) {
      const target = findNode(existingOut.to.node);
      if (target && target.type === "output") return toast("该节点已有输出节点");
    }
  }
  const out = {
    id: uid("n"),
    type: "output",
    x: snap(source.x + 330),
    y: snap(source.y),
    w: NODE_WIDTH,
    h: NODE_HEIGHT,
    disabled: false,
    created: Date.now() + state.nextNode,
    text: "",
    image: null,
    fileName: "",
    mime: "",
    prompt: "",
    generatedImage: null,
    taskId: null,
    generating: false,
  };
  state.nodes.push(out);
  state.edges.push({ id: uid("e"), from: { node: sourceId, port: "out" }, to: { node: out.id, port: "in" } });
  pushHistory();
  render();
  toast("已添加输出节点");
}



function normalizeNodeSizes() {
  state.nodes.forEach(n => {
    if (!n.w) n.w = NODE_WIDTH;
    if (!n.h) n.h = n.type === "ai-image" ? AI_NODE_HEIGHT : n.type === "group" ? 200 : NODE_HEIGHT;
    if (n.type === "ai-image" && n.h < AI_NODE_HEIGHT) n.h = AI_NODE_HEIGHT;
  });
}

function outputNodes() {
  return state.nodes.filter(n => n.type === "output").sort((a, b) => a.y - b.y || a.x - b.x || a.created - b.created);
}

function terminalSourceNodes() {
  return state.nodes
    .filter(n => n.type !== "output" && !n.disabled)
    .filter(n => !state.edges.some(e => e.from.node === n.id))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.created - b.created);
}

function exportTargets() {
  const outputs = outputNodes();
  if (outputs.length) return outputs.filter(n => !n.disabled).map(n => ({ id: n.id, virtual: false }));
  return terminalSourceNodes()
    .filter(n => (n.type === "ai-image" && (n.generatedImage || n.batchTasks?.some(t => t.status === "done" && t.result))) || (n.type === "image" && n.aiSourceNodeId && n.image))
    .map(n => ({ id: n.id, virtual: true }));
}

function outputNumber(id) {
  return outputNodes().findIndex(n => n.id === id) + 1;
}

function portPoint(node, side) {
  return {
    x: node.x + (side === "out" ? node.w : 0),
    y: node.y + node.h / 2,
  };
}

function edgePath(a, b) {
  const p1 = portPoint(a, "out");
  const p2 = portPoint(b, "in");
  const gap = 60;
  const mid = p2.x > p1.x + gap ? (p1.x + p2.x) / 2 : Math.max(p1.x + gap, p2.x - gap);
  return `M ${p1.x} ${p1.y} L ${mid} ${p1.y} L ${mid} ${p2.y} L ${p2.x} ${p2.y}`;
}

function render() {
  applySettings();
  normalizeNodeSizes();
  applyView();
  renderPageTabs();
  renderNodes();
  renderEdges();
  renderMinimap();
}

function applyView() {
  els.world.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`;
}

function renderPageTabs() {
  const page = currentPage();
  els.projectNameBtn.textContent = page ? page.name : "未命名项目";
  els.projectMenu.innerHTML = "";
  state.pages.forEach(page => {
    const row = document.createElement("div");
    row.className = "project-menu-row";

    const btn = document.createElement("button");
    btn.className = page.id === state.activePageId ? "active" : "";
    btn.textContent = page.name;
    btn.title = page.name;
    btn.onclick = () => {
      els.projectMenu.classList.add("hidden");
      switchPage(page.id);
    };
    row.appendChild(btn);

    const delBtn = document.createElement("button");
    delBtn.className = "project-delete-btn";
    delBtn.textContent = "×";
    delBtn.title = "删除项目";
    delBtn.onclick = (ev) => {
      ev.stopPropagation();
      deletePage(page.id);
    };
    row.appendChild(delBtn);

    els.projectMenu.appendChild(row);
  });
}

function renderNodes() {
  els.nodes.innerHTML = "";
  for (const node of state.nodes) {
    const div = document.createElement("div");
    const progressClass = node.type === "ai-image" && node._aiProgress ? `ai-status-${node._aiProgress.status}` : "";
    div.className = `node ${node.type} ${progressClass} ${node.disabled ? "disabled" : ""} ${state.selected.has(node.id) ? "selected" : ""}`;
    div.dataset.id = node.id;
    div.style.left = `${node.x}px`;
    div.style.top = `${node.y}px`;
    div.style.width = `${node.w}px`;
    div.style.height = `${node.h}px`;
    div.innerHTML = nodeTemplate(node);
    els.nodes.appendChild(div);
  }
}

function nodeTemplate(node) {
  const num = node.type === "output" ? outputNumber(node.id) : 0;
  const title = node.type === "text" ? "文字节点" : node.type === "image" ? "图片节点" : node.type === "ai-image" ? (node.seq ? `AI绘图 #${node.seq}` : "AI绘图") : node.type === "group" ? "编组节点" : `输出节点 ${num}`;
  const inPort = `<span class="port in" data-port="in" title="输入端口"></span>`;
  const outPort = node.type === "output" ? "" : `<span class="port out" data-port="out" title="输出端口"></span>`;
  let body = "";
  if (node.type === "text") {
    body = `<textarea data-role="text" style="height:${(node.h || NODE_HEIGHT) - 50}px">${escapeHtml(node.text || "")}</textarea><span class="resize-handle" title="拖拽缩放"></span>`;
  } else if (node.type === "group") {
    if (node.items) {
      const textCount = node.items.filter(it => it.type === "text").length;
      const imgCount = node.items.filter(it => it.type === "image").length;
      const aiCount = node.items.filter(it => it.type === "ai-image").length;
      const parts = [];
      if (textCount) parts.push(`${textCount}文字`);
      if (imgCount) parts.push(`${imgCount}图片`);
      if (aiCount) parts.push(`${aiCount}AI绘图`);
      const summary = parts.join(" + ") || "空编组";
      const totalImgs = node.items.filter(it => (it.type === "image" && it.image) || (it.type === "ai-image" && it.generatedImage));
      let thumbs = "";
      const maxShow = 8;
      const show = Math.min(totalImgs.length, maxShow);
      for (let i = 0; i < show; i++) {
        const src = totalImgs[i].type === "ai-image" ? totalImgs[i].generatedImage : totalImgs[i].image;
        if (src) thumbs += `<img src="${src}" alt="" draggable="false">`;
      }
      if (totalImgs.length > maxShow) thumbs += `<div class="group-more">+${totalImgs.length - maxShow}</div>`;
      body = `<div class="group-preview">${thumbs || "暂无图片"}</div>
        <div class="group-count">${summary}</div>`;
    } else {
      const total = node.images ? node.images.length : 0;
      let thumbs = "";
      if (total > 0) {
        const maxShow = 8;
        const show = Math.min(total, maxShow);
        for (let i = 0; i < show; i++) {
          thumbs += `<img src="${node.images[i].image}" alt="" draggable="false">`;
        }
        if (total > maxShow) thumbs += `<div class="group-more">+${total - maxShow}</div>`;
      }
      body = `<div class="group-preview">${thumbs || "暂无图片"}</div>
        <div class="group-count">${total} 张图片</div>
        <div class="image-actions">
          <button data-role="upload-group">添加图片</button>
          <button data-role="clear-group">清空</button>
        </div>`;
    }
  } else if (node.type === "image") {
    const seqTag = node.seq ? `<span class="image-seq">#${node.seq}</span>` : "";
    body = `<div class="image-preview" title="双击放大预览">${node.image ? `<img src="${node.image}" alt="" draggable="false">` : "无图片"}${seqTag}</div>
      <div class="image-actions">
        <button data-role="upload">上传</button>
        <button data-role="clear-image">清除</button>
      </div>
      <div class="file-hint">${escapeHtml(node.fileName || "图片节点粘贴后为空")}</div>`;
  } else if (node.type === "ai-image") {
    body = aiImageBody(node) + aiNodeProgressMarkup(node);
  } else {
    body = `<div class="output-label">图片${num}</div>`;
  }
  return `${inPort}${outPort}<div class="node-head"><span>${title}</span><span>${node.disabled ? "停用" : "启用"}</span></div><div class="node-body">${body}</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

function renderEdges() {
  els.edges.innerHTML = "";
  for (const e of state.edges) {
    const a = findNode(e.from.node);
    const b = findNode(e.to.node);
    if (!a || !b) continue;
    const d = edgePath(a, b);
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hit.setAttribute("class", "edge-hit");
    hit.setAttribute("d", d);
    hit.dataset.edgeId = e.id;
    hit.addEventListener("dblclick", ev => {
      ev.stopPropagation();
      removeEdge(e.id);
    });
    hit.addEventListener("contextmenu", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      showMenu(ev.clientX, ev.clientY, [["取消连线", () => removeEdge(e.id)]]);
    });
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "edge");
    path.setAttribute("d", d);
    els.edges.appendChild(hit);
    els.edges.appendChild(path);
  }
  if (connectDraft) {
    const draftTarget = { x: connectDraft.end.x, y: connectDraft.end.y - NODE_HEIGHT / 2, w: 0, h: NODE_HEIGHT };
    const draftSource = { x: connectDraft.start.x - NODE_WIDTH, y: connectDraft.start.y - NODE_HEIGHT / 2, w: NODE_WIDTH, h: NODE_HEIGHT };
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "edge");
    path.setAttribute("d", edgePath(draftSource, draftTarget));
    els.edges.appendChild(path);
  }
}

function renderMinimap() {
  const ctx = els.minimap.getContext("2d");
  ctx.clearRect(0, 0, 180, 120);
  ctx.fillStyle = getComputedStyle(els.app).getPropertyValue("--panel").trim();
  ctx.fillRect(0, 0, 180, 120);
  const bounds = contentBounds();
  const scale = Math.min(170 / bounds.w, 110 / bounds.h);
  const ox = 5 - bounds.x * scale;
  const oy = 5 - bounds.y * scale;
  ctx.strokeStyle = getComputedStyle(els.app).getPropertyValue("--muted").trim();
  ctx.strokeRect(0.5, 0.5, 179, 119);
  for (const e of state.edges) {
    const a = findNode(e.from.node), b = findNode(e.to.node);
    if (!a || !b) continue;
    const p1 = portPoint(a, "out"), p2 = portPoint(b, "in");
    const mid = (p1.x + p2.x) / 2;
    ctx.beginPath();
    ctx.moveTo(p1.x * scale + ox, p1.y * scale + oy);
    ctx.lineTo(mid * scale + ox, p1.y * scale + oy);
    ctx.lineTo(mid * scale + ox, p2.y * scale + oy);
    ctx.lineTo(p2.x * scale + ox, p2.y * scale + oy);
    ctx.stroke();
  }
  for (const n of state.nodes) {
    ctx.fillStyle = n.disabled ? "#999999" : (n.type === "output" ? "#0078d4" : n.type === "image" ? "#b15c00" : n.type === "ai-image" ? "#6c5ce7" : n.type === "group" ? "#b8860b" : "#006f62");
    ctx.fillRect(n.x * scale + ox, n.y * scale + oy, Math.max(3, n.w * scale), Math.max(3, n.h * scale));
  }
}

function contentBounds() {
  if (!state.nodes.length) return { x: 0, y: 0, w: 1000, h: 700 };
  const xs = state.nodes.map(n => n.x);
  const ys = state.nodes.map(n => n.y);
  const xe = state.nodes.map(n => n.x + n.w);
  const ye = state.nodes.map(n => n.y + n.h);
  const x = Math.min(...xs) - 100, y = Math.min(...ys) - 100;
  return { x, y, w: Math.max(...xe) - x + 100, h: Math.max(...ye) - y + 100 };
}

function visibleWorldCenter() {
  const r = els.viewport.getBoundingClientRect();
  return {
    x: (r.width / 2 - state.view.x) / state.view.scale,
    y: (r.height / 2 - state.view.y) / state.view.scale,
  };
}

function centerViewOnContent() {
  const r = els.viewport.getBoundingClientRect();
  const bounds = contentBounds();
  const fitScale = Math.min(1.4, Math.max(.25, Math.min((r.width - 220) / bounds.w, (r.height - 220) / bounds.h)));
  state.view.scale = Number.isFinite(fitScale) ? fitScale : 1;
  state.view.x = r.width / 2 - (bounds.x + bounds.w / 2) * state.view.scale;
  state.view.y = r.height / 2 - (bounds.y + bounds.h / 2) * state.view.scale;
  saveCurrentPage();
  persistPages();
  render();
  toast("已居中显示");
}

function tidyNodes() {
  const depths = new Map();
  const visit = (nodeId, stack = new Set()) => {
    if (depths.has(nodeId)) return depths.get(nodeId);
    if (stack.has(nodeId)) return 0;
    stack.add(nodeId);
    const incoming = state.edges.filter(e => e.to.node === nodeId);
    const depth = incoming.length ? Math.max(...incoming.map(e => visit(e.from.node, stack) + 1)) : 0;
    stack.delete(nodeId);
    depths.set(nodeId, depth);
    return depth;
  };
  state.nodes.forEach(n => visit(n.id));
  const columns = new Map();
  state.nodes
    .slice()
    .sort((a, b) => (depths.get(a.id) || 0) - (depths.get(b.id) || 0) || a.created - b.created)
    .forEach(n => {
      const d = depths.get(n.id) || 0;
      const row = columns.get(d) || 0;
      n.x = snap(80 + d * 330);
      n.y = snap(80 + row * 220);
      columns.set(d, row + 1);
    });
  pushHistory();
  render();
  toast("已整理节点");
}

function autoAddAiNodes() {
  const selected = state.nodes.filter(n => state.selected.has(n.id) && n.type !== "output" && n.type !== "ai-image" && !n.disabled);
  const source = selected.length ? selected : state.nodes.filter(n => n.type !== "output" && n.type !== "ai-image" && !n.disabled);
  const terminals = source.filter(n => !state.edges.some(e => e.from.node === n.id));
  if (!terminals.length) return toast("没有需要添加的节点");

  terminals.forEach((n, index) => {
    const aiNode = addNode("ai-image", snap(n.x + 330), snap(n.y + index * 20), false);
    aiNode.prompt = n.type === "text" && n.text ? n.text.trim() : "";
    state.edges.push({ id: uid("e"), from: { node: n.id, port: "out" }, to: { node: aiNode.id, port: "in" } });
  });
  pushHistory();
  render();
  toast(`已添加 ${terminals.length} 个 AI 绘图节点`);
}

els.viewport.addEventListener("wheel", ev => {
  ev.preventDefault();
  const before = screenToWorld(ev.clientX, ev.clientY);
  const factor = ev.deltaY < 0 ? 1.08 : .92;
  state.view.scale = Math.max(.25, Math.min(2.5, state.view.scale * factor));
  const r = els.viewport.getBoundingClientRect();
  state.view.x = ev.clientX - r.left - before.x * state.view.scale;
  state.view.y = ev.clientY - r.top - before.y * state.view.scale;
  saveCurrentPage();
  persistPages();
  render();
}, { passive: false });

els.viewport.addEventListener("mousedown", ev => {
  hideMenu();
  els.projectMenu.classList.add("hidden");
  lastPointerWorld = screenToWorld(ev.clientX, ev.clientY);
  if (ev.target.closest(".edge-hit")) return; // 点击连线不做任何操作，交给 dblclick / contextmenu
  const port = ev.target.closest(".port");
  const nodeEl = ev.target.closest(".node");
  const interactive = ev.target.closest("textarea,button,input,select");
  if (!interactive) els.viewport.focus();
  if (port && port.dataset.port === "out") {
    const node = findNode(nodeEl.dataset.id);
    connectDraft = { from: node.id, start: portPoint(node, "out"), end: screenToWorld(ev.clientX, ev.clientY) };
    renderEdges();
    return;
  }
  if (nodeEl && ev.target.closest(".resize-handle")) {
    const id = nodeEl.dataset.id;
    const node = findNode(id);
    if (!node) return;
    if (!state.selected.has(id)) state.selected = new Set([id]);
    drag = { type: "resize", nodeId: id, sx: ev.clientX, sy: ev.clientY, sw: node.w, sh: node.h };
    renderNodes();
    return;
  }
  if (nodeEl && interactive) {
    const id = nodeEl.dataset.id;
    if (!ev.shiftKey && !state.selected.has(id)) state.selected = new Set([id]);
    else if (ev.shiftKey) state.selected.add(id);
    return;
  }
  if (nodeEl && ev.button === 0) {
    const id = nodeEl.dataset.id;
    if (!ev.shiftKey && !state.selected.has(id)) state.selected = new Set([id]);
    else if (ev.shiftKey) state.selected.add(id);
    const start = screenToWorld(ev.clientX, ev.clientY);
    drag = { type: "nodes", start, original: state.nodes.filter(n => state.selected.has(n.id)).map(n => ({ id: n.id, x: n.x, y: n.y })) };
    renderNodes();
    return;
  }
  if (spaceDown || ev.button === 1) {
    drag = { type: "pan", sx: ev.clientX, sy: ev.clientY, vx: state.view.x, vy: state.view.y };
    return;
  }
  if (ev.button === 0) {
    const p = screenToWorld(ev.clientX, ev.clientY);
    state.selected.clear();
    selectionDraft = { start: p, end: p };
    updateSelectionBox();
    renderNodes();
  }
});

window.addEventListener("mousemove", ev => {
  if (ev.target.closest?.("#viewport")) lastPointerWorld = screenToWorld(ev.clientX, ev.clientY);
  if (connectDraft) {
    connectDraft.end = screenToWorld(ev.clientX, ev.clientY);
    renderEdges();
  }
  if (drag?.type === "resize") {
    const node = findNode(drag.nodeId);
    if (node) {
      const scale = state.view.scale;
      node.w = Math.max(180, drag.sw + (ev.clientX - drag.sx) / scale);
      const minHeight = node.type === "ai-image" ? AI_NODE_HEIGHT : 120;
      node.h = Math.max(minHeight, drag.sh + (ev.clientY - drag.sy) / scale);
      const el = document.querySelector(`.node[data-id="${node.id}"]`);
      if (el) {
        el.style.width = `${node.w}px`;
        el.style.height = `${node.h}px`;
        const ta = el.querySelector("textarea");
        if (ta) ta.style.height = `${node.h - 50}px`;
      }
    }
  } else if (drag?.type === "nodes") {
    const p = screenToWorld(ev.clientX, ev.clientY);
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    for (const item of drag.original) {
      const n = findNode(item.id);
      n.x = snap(item.x + dx);
      n.y = snap(item.y + dy);
    }
    render();
  } else if (drag?.type === "pan") {
    state.view.x = drag.vx + ev.clientX - drag.sx;
    state.view.y = drag.vy + ev.clientY - drag.sy;
    render();
  }
  if (selectionDraft) {
    selectionDraft.end = screenToWorld(ev.clientX, ev.clientY);
    updateSelectionBox();
    const r = normalizedRect(selectionDraft.start, selectionDraft.end);
    state.selected = new Set(state.nodes.filter(n => intersects(r, { x: n.x, y: n.y, w: n.w, h: n.h })).map(n => n.id));
    renderNodes();
  }
});

window.addEventListener("mouseup", ev => {
  if (connectDraft) {
    const targetNode = findNearbyInputNode(ev.clientX, ev.clientY);
    if (targetNode) addEdge(connectDraft.from, targetNode.id);
    connectDraft = null;
    renderEdges();
  }
  if (drag?.type === "resize") { render(); pushHistory(); }
  if (drag?.type === "nodes") pushHistory();
  if (drag?.type === "pan") {
    saveCurrentPage();
    persistPages();
  }
  drag = null;
  if (selectionDraft) {
    selectionDraft = null;
    els.selectionBox.classList.add("hidden");
  }
});

function findNearbyInputNode(clientX, clientY) {
  const directPort = document.elementFromPoint(clientX, clientY)?.closest?.(".port.in");
  if (directPort) {
    const nodeEl = directPort.closest(".node");
    return nodeEl ? findNode(nodeEl.dataset.id) : null;
  }
  let best = null;
  let bestDistance = Infinity;
  for (const port of els.nodes.querySelectorAll(".port.in")) {
    const rect = port.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const distance = Math.hypot(clientX - cx, clientY - cy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = port;
    }
  }
  if (!best || bestDistance > CONNECT_SNAP_RADIUS) return null;
  const nodeEl = best.closest(".node");
  return nodeEl ? findNode(nodeEl.dataset.id) : null;
}

function normalizedRect(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function intersects(a, b) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function updateSelectionBox() {
  const r = normalizedRect(selectionDraft.start, selectionDraft.end);
  els.selectionBox.classList.remove("hidden");
  Object.assign(els.selectionBox.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
}

els.nodes.addEventListener("input", ev => {
  const nodeEl = ev.target.closest(".node");
  if (!nodeEl) return;
  const node = findNode(nodeEl.dataset.id);
  if (ev.target.dataset.role === "text") {
    node.text = ev.target.value;
    markDirty();
  }
});

els.nodes.addEventListener("change", ev => {
  const nodeEl = ev.target.closest(".node");
  const node = nodeEl ? findNode(nodeEl.dataset.id) : null;
  const role = ev.target.dataset.role;
  if (role === "text") pushHistory();
  if (!node || node.type !== "ai-image") return;
  if (role === "ai-model") {
    node._model = ev.target.value;
    node._quality = node._model === "gpt-image-2" ? (node._quality || "medium") : null;
    pushHistory(); render();
  } else if (role === "ai-resolution") {
    node._resolution = ev.target.value; pushHistory();
  } else if (role === "ai-quality") {
    node._quality = ev.target.value; pushHistory();
  } else if (role === "ai-size") {
    node._size = ev.target.value; pushHistory();
  }
});

els.nodes.addEventListener("click", ev => {
  const nodeEl = ev.target.closest(".node");
  if (!nodeEl) return;
  const node = findNode(nodeEl.dataset.id);
  if (ev.target.dataset.role === "upload") uploadImage(node);
  if (ev.target.dataset.role === "upload-group") uploadGroupImages(node);
  if (ev.target.dataset.role === "ai-generate") generateAiImage(node.id);
  if (ev.target.dataset.role === "clear-image") {
    if (node.type === "ai-image") {
      node.generatedImage = null;
      node.taskId = null;
    } else {
      node.image = null;
      node.fileName = "";
      node.mime = "";
    }
    pushHistory();
    render();
  }
  if (ev.target.dataset.role === "clear-group") {
    node.images = [];
    pushHistory();
    render();
  }
});

els.nodes.addEventListener("dblclick", ev => {
  if (ev.target.closest(".image-preview") || ev.target.closest(".ai-preview") || ev.target.closest(".group-preview")) {
    ev.preventDefault();
    ev.stopPropagation();
    const nodeEl = ev.target.closest(".node");
    if (!nodeEl) return;
    const node = findNode(nodeEl.dataset.id);
    if (!node) return;
    if (node.type === "group" && node.images && node.images.length) {
      showLightbox(node.images.map(img => img.image));
    } else if (node.type === "group" && node.items) {
      const allImages = [];
      for (const item of node.items) {
        if (item.type === "image" && item.image) allImages.push(item.image);
        if (item.type === "ai-image" && item.generatedImage) allImages.push(item.generatedImage);
      }
      if (allImages.length) showLightbox(allImages);
    } else {
      const src = node.type === "ai-image" ? node.generatedImage : node.image;
      if (src) showLightbox(src, node.id);
    }
  }
});

async function uploadImage(node) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/gif,image/webp";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    node.image = await fileToDataUrl(file);
    node.fileName = file.name;
    node.mime = file.type || "image/png";
    pushHistory();
    render();
  };
  input.click();
}

async function uploadGroupImages(node) {
  if (node.type !== "group") return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/gif,image/webp";
  input.multiple = true;
  input.onchange = async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    if (!node.images) node.images = [];
    for (const file of files) {
      node.images.push({
        image: await fileToDataUrl(file),
        fileName: file.name,
        mime: file.type || "image/png",
        name: file.name.replace(/\.[^.]+$/, ""),
      });
    }
    pushHistory();
    render();
  };
  input.click();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

let lightboxImages = [];
let lightboxIdx = 0;
let lightboxSourceNodeId = "";
let lightboxPainting = false;
let lightboxDrawing = false;

function showLightbox(src, sourceNodeId = "") {
  if (Array.isArray(src)) {
    lightboxImages = src;
    lightboxIdx = 0;
  } else {
    lightboxImages = [src];
    lightboxIdx = 0;
  }
  lightboxSourceNodeId = Array.isArray(src) ? "" : sourceNodeId;
  updateLightboxImage();
  els.lightbox.classList.remove("hidden");
}

function updateLightboxImage() {
  if (lightboxImages.length === 0) return;
  els.lightboxImg.src = lightboxImages[lightboxIdx];
  var multi = lightboxImages.length > 1;
  els.lightboxPaintBtn.classList.toggle("hidden", multi || !lightboxSourceNodeId || lightboxPainting);
  els.lightboxPrev.classList.toggle("hidden", !multi);
  els.lightboxNext.classList.toggle("hidden", !multi);
  els.lightboxCounter.classList.toggle("hidden", !multi);
  els.lightboxDots.classList.toggle("hidden", !multi);
  if (multi) {
    els.lightboxCounter.textContent = (lightboxIdx + 1) + " / " + lightboxImages.length;
    var dotsHtml = "";
    for (var i = 0; i < lightboxImages.length; i++) {
      dotsHtml += '<button class="lightbox-dot' + (i === lightboxIdx ? ' active' : '') + '" data-idx="' + i + '"></button>';
    }
    els.lightboxDots.innerHTML = dotsHtml;
  }
}

function lightboxPrev() {
  if (lightboxImages.length <= 1) return;
  lightboxIdx = (lightboxIdx - 1 + lightboxImages.length) % lightboxImages.length;
  updateLightboxImage();
}

function lightboxNext() {
  if (lightboxImages.length <= 1) return;
  lightboxIdx = (lightboxIdx + 1) % lightboxImages.length;
  updateLightboxImage();
}

function hideLightbox() {
  cancelLightboxPaint();
  els.lightbox.classList.add("hidden");
  els.lightboxImg.src = "";
  lightboxImages = [];
  lightboxIdx = 0;
  lightboxSourceNodeId = "";
}

function startLightboxPaint() {
  if (!lightboxSourceNodeId || !els.lightboxImg.naturalWidth) return;
  const canvas = els.lightboxPaintCanvas;
  canvas.width = els.lightboxImg.naturalWidth;
  canvas.height = els.lightboxImg.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(els.lightboxImg, 0, 0, canvas.width, canvas.height);
  lightboxPainting = true;
  els.lightboxImg.classList.add("hidden");
  canvas.classList.remove("hidden");
  els.lightboxPaintToolbar.classList.remove("hidden");
  els.lightboxPaintBtn.classList.add("hidden");
}

function cancelLightboxPaint() {
  lightboxPainting = false;
  lightboxDrawing = false;
  els.lightboxPaintCanvas.classList.add("hidden");
  els.lightboxPaintToolbar.classList.add("hidden");
  els.lightboxImg.classList.remove("hidden");
  const editable = lightboxImages.length === 1 && !!lightboxSourceNodeId;
  els.lightboxPaintBtn.classList.toggle("hidden", !editable);
}

function paintCanvasPoint(ev) {
  const canvas = els.lightboxPaintCanvas;
  const rect = canvas.getBoundingClientRect();
  return { x: (ev.clientX - rect.left) * canvas.width / rect.width, y: (ev.clientY - rect.top) * canvas.height / rect.height, scale: canvas.width / rect.width };
}

els.lightboxPaintCanvas.addEventListener("pointerdown", ev => {
  if (!lightboxPainting) return;
  lightboxDrawing = true;
  els.lightboxPaintCanvas.setPointerCapture(ev.pointerId);
  const p = paintCanvasPoint(ev);
  const ctx = els.lightboxPaintCanvas.getContext("2d");
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + 0.01, p.y + 0.01);
  ctx.strokeStyle = els.lightboxPaintColor.value;
  ctx.lineWidth = Number(els.lightboxPaintSize.value) * p.scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
});

els.lightboxPaintCanvas.addEventListener("pointermove", ev => {
  if (!lightboxDrawing) return;
  const p = paintCanvasPoint(ev);
  const ctx = els.lightboxPaintCanvas.getContext("2d");
  ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = els.lightboxPaintColor.value;
  ctx.lineWidth = Number(els.lightboxPaintSize.value) * p.scale;
  ctx.stroke();
});

els.lightboxPaintCanvas.addEventListener("pointerup", () => { lightboxDrawing = false; });
els.lightboxPaintCanvas.addEventListener("pointercancel", () => { lightboxDrawing = false; });
els.lightboxPaintBtn.onclick = startLightboxPaint;
els.lightboxPaintCancel.onclick = cancelLightboxPaint;
els.lightboxPaintConfirm.onclick = () => {
  if (!lightboxPainting) return;
  const source = findNode(lightboxSourceNodeId);
  const image = els.lightboxPaintCanvas.toDataURL("image/png");
  const x = source ? source.x + NODE_WIDTH + 40 : lastPointerWorld.x;
  const y = source ? source.y : lastPointerWorld.y;
  const node = addNode("image", x, y, false);
  node.image = image;
  node.fileName = `局部修改_${Date.now()}.png`;
  node.mime = "image/png";
  pushHistory();
  render();
  hideLightbox();
  toast("已生成局部修改图片节点");
};

els.lightboxClose.onclick = hideLightbox;
els.lightboxPrev.onclick = lightboxPrev;
els.lightboxNext.onclick = lightboxNext;
els.lightbox.querySelector(".lightbox-bg").onclick = hideLightbox;
els.lightbox.addEventListener("wheel", ev => {
  if (lightboxImages.length <= 1) return;
  ev.preventDefault();
  if (ev.deltaY < 0) lightboxPrev(); else lightboxNext();
});
els.lightboxDots.addEventListener("click", ev => {
  var dot = ev.target.closest(".lightbox-dot");
  if (!dot) return;
  var idx = parseInt(dot.getAttribute("data-idx"), 10);
  if (idx >= 0 && idx < lightboxImages.length) {
    lightboxIdx = idx;
    updateLightboxImage();
  }
});
document.addEventListener("keydown", ev => {
  if (els.lightbox.classList.contains("hidden")) return;
  if (ev.key === "Escape") { ev.preventDefault(); hideLightbox(); }
  if (ev.key === "ArrowLeft") { ev.preventDefault(); lightboxPrev(); }
  if (ev.key === "ArrowRight") { ev.preventDefault(); lightboxNext(); }
});

async function setComposerImage(file) {
  if (!file) return;
  composerImage = {
    image: await fileToDataUrl(file),
    fileName: file.name || `upload_${timestamp()}.png`,
    mime: file.type || "image/png",
  };
  els.composerImageName.textContent = `已选择图片：${composerImage.fileName}`;
}

function clearComposer() {
  els.composerText.value = "";
  els.composerFileInput.value = "";
  els.composerImageName.textContent = "";
  composerImage = null;
}

function createNodesFromComposer() {
  const text = els.composerText.value.trim();
  const image = composerImage;
  if (!text && !image) return toast("请输入文字或选择图片");
  const center = visibleWorldCenter();
  if (text && image) {
    const textNode = addNode("text", center.x - 290, center.y - NODE_HEIGHT / 2, false);
    textNode.text = text;
    const imageNode = addNode("image", center.x + 30, center.y - NODE_HEIGHT / 2, false);
    imageNode.image = image.image;
    imageNode.fileName = image.fileName;
    imageNode.mime = image.mime;
    state.edges.push({ id: uid("e"), from: { node: textNode.id, port: "out" }, to: { node: imageNode.id, port: "in" } });
    state.selected = new Set([textNode.id, imageNode.id]);
  } else if (text) {
    const node = addNode("text", center.x - NODE_WIDTH / 2, center.y - NODE_HEIGHT / 2, false);
    node.text = text;
  } else if (image) {
    const node = addNode("image", center.x - NODE_WIDTH / 2, center.y - NODE_HEIGHT / 2, false);
    node.image = image.image;
    node.fileName = image.fileName;
    node.mime = image.mime;
  }
  clearComposer();
  pushHistory();
  render();
  toast("已创建节点");
}

async function createFromImageFile(file) {
  await setComposerImage(file);
  createNodesFromComposer();
}

async function createNodeFromClipboard(ev) {
  const data = ev.clipboardData;
  if (!data) return false;
  const items = Array.from(data.items || []);
  const imageItem = items.find(item => item.kind === "file" && item.type.startsWith("image/"));
  if (imageItem) {
    const file = imageItem.getAsFile();
    if (!file) return false;
    const node = addNode("image", lastPointerWorld.x, lastPointerWorld.y, false);
    node.image = await fileToDataUrl(file);
    node.fileName = file.name || `clipboard_${timestamp()}.png`;
    node.mime = file.type || "image/png";
    pushHistory();
    render();
    toast("已从剪贴板创建图片节点");
    return true;
  }
  const text = data.getData("text/plain");
  if (text && text.trim()) {
    const node = addNode("text", lastPointerWorld.x, lastPointerWorld.y, false);
    node.text = text;
    pushHistory();
    render();
    toast("已从剪贴板创建文字节点");
    return true;
  }
  return false;
}

els.viewport.addEventListener("contextmenu", ev => {
  ev.preventDefault();
  const nodeEl = ev.target.closest(".node");
  const p = screenToWorld(ev.clientX, ev.clientY);
  if (nodeEl) {
    const id = nodeEl.dataset.id;
    if (!state.selected.has(id)) state.selected = new Set([id]);
    const selectedNode = findNode(id);
    const isGroupWithItems = selectedNode?.type === "group" && (selectedNode?.items || (selectedNode?.images && selectedNode?.images.length));
    const items = [
      ["切换启用/停用", () => toggleDisabled(state.selected)],
      ...((selectedNode?.type === "text" || selectedNode?.type === "image" || (selectedNode?.type === "ai-image" && selectedNode.generatedImage)) ? [[selectedNode.type === "text" ? "保存为自定义文字" : "保存为自定义图片", () => saveNodeAsTemplate(selectedNode)]] : []),
      ...(state.selected.size > 1 ? [["编组", () => groupSelection()]] : []),
      ...(isGroupWithItems ? [["取消编组", () => ungroupNode(id)]] : []),
      ["AI绘图", () => {
        const sources = state.nodes.filter(n => state.selected.has(n.id) && n.type !== "output");
        if (sources.length) {
          sources.forEach(source => {
            addAiImageNode(source.x + 290, source.y, [source.id]);
          });
        }
      }],
      ["添加输出节点", () => addOutputNode(id)],
      ...(selectedNode?.type === "ai-image" ? [["打开本地文件夹", async () => {
        await fetch("/api/open-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderPath: "export/ai_generated" }),
        });
      }]] : []),
      ["断开连接", () => disconnectEdges(state.selected)],
      ["复制", () => copySelection()],
      ["删除节点", () => deleteNodes(state.selected)],
    ];
    showMenu(ev.clientX, ev.clientY, items);
    renderNodes();
  } else if (state.selected.size > 1) {
    const items = [];
    if (state.clipboard?.nodes?.length) items.push(["粘贴节点", () => pasteNodes(state.clipboard, p)]);
    items.push(
      ["编组", () => groupSelection()],
      ["AI绘图", () => {
        const sources = state.nodes.filter(n => state.selected.has(n.id) && n.type !== "output");
        if (sources.length) {
          sources.forEach(source => {
            addAiImageNode(source.x + 290, source.y, [source.id]);
          });
        }
      }],
      ["添加输出节点", () => {
        state.nodes.filter(n => state.selected.has(n.id) && n.type !== "output").forEach(n => addOutputNode(n.id));
      }],
      ["批量停用", () => toggleDisabled(state.selected, true)],
      ["批量启用", () => toggleDisabled(state.selected, false)],
      ["断开连接", () => disconnectEdges(state.selected)],
      ["批量删除", () => deleteNodes(state.selected)],
    );
    showMenu(ev.clientX, ev.clientY, items);
  } else {
    const items = [];
    if (state.clipboard?.nodes?.length) items.push(["粘贴节点", () => pasteNodes(state.clipboard, p)]);
    const textTemplates = libraryItems("text");
    const imageTemplates = libraryItems("image");
    items.push(
      ["添加文字节点", () => addNode("text", p.x, p.y)],
      ["添加图片节点", () => addNode("image", p.x, p.y)],
      ["自定义节点", [
        ["自定义文字", textTemplates.length ? textTemplates.map(template => [template.name, () => createNodeFromTemplate("text", template, p.x, p.y)]) : [["暂无素材", null]]],
        ["自定义图片", imageTemplates.length ? imageTemplates.map(template => [template.name, () => createNodeFromTemplate("image", template, p.x, p.y)]) : [["暂无素材", null]]],
      ]],
      ["添加AI绘图节点", () => addAiImageNode(p.x, p.y, [])],
      ["节点对齐", () => tidyNodes()],
      ["添加输出节点", () => {
        const out = {
          id: uid("n"), type: "output", x: snap(p.x), y: snap(p.y),
          w: NODE_WIDTH, h: NODE_HEIGHT, disabled: false,
          created: Date.now() + state.nextNode, text: "", image: null,
          fileName: "", mime: "", prompt: "", generatedImage: null,
          taskId: null, generating: false,
        };
        state.nodes.push(out);
        pushHistory(); render();
      }],
    );
    showMenu(ev.clientX, ev.clientY, items);
  }
});

function showMenu(x, y, items) {
  els.contextMenu.innerHTML = "";
  function positionSubmenu(item, submenu) {
    submenu.classList.remove("open-left");
    submenu.style.top = "-8px";
    submenu.style.minWidth = "";
    submenu.style.maxWidth = "";
    const previousDisplay = submenu.style.display;
    const previousVisibility = submenu.style.visibility;
    submenu.style.display = "block";
    submenu.style.visibility = "hidden";

    const itemRect = item.getBoundingClientRect();
    const rightSpace = window.innerWidth - itemRect.right - 12;
    const leftSpace = itemRect.left - 12;
    const preferredWidth = Math.min(submenu.scrollWidth + 2, 420);
    const openLeft = rightSpace < preferredWidth && leftSpace > rightSpace;
    const availableWidth = Math.max(120, openLeft ? leftSpace : rightSpace);
    submenu.classList.toggle("open-left", openLeft);
    submenu.style.minWidth = `${Math.min(190, availableWidth)}px`;
    submenu.style.maxWidth = `${availableWidth}px`;

    const submenuRect = submenu.getBoundingClientRect();
    let top = -8;
    if (submenuRect.bottom > window.innerHeight - 12) top -= submenuRect.bottom - (window.innerHeight - 12);
    if (itemRect.top + top < 12) top = 12 - itemRect.top;
    submenu.style.top = `${top}px`;
    submenu.style.display = previousDisplay;
    submenu.style.visibility = previousVisibility;
  }

  function buildMenu(container, menuItems) {
    menuItems.forEach(([label, action]) => {
      const item = document.createElement("div");
      item.className = "context-menu-item";
      const btn = document.createElement("button");
      btn.textContent = label;
      if (Array.isArray(action)) {
        btn.classList.add("has-submenu");
        const submenu = document.createElement("div");
        submenu.className = "context-submenu";
        if (action.some(entry => Array.isArray(entry?.[1]))) submenu.classList.add("context-submenu-branch");
        buildMenu(submenu, action);
        item.appendChild(btn);
        item.appendChild(submenu);
        item.addEventListener("pointerenter", () => positionSubmenu(item, submenu));
      } else if (typeof action === "function") {
        btn.onclick = () => { hideMenu(); action(); };
        item.appendChild(btn);
      } else {
        btn.disabled = true;
        item.appendChild(btn);
      }
      container.appendChild(item);
    });
  }
  buildMenu(els.contextMenu, items);
  els.contextMenu.style.left = `${x}px`;
  els.contextMenu.style.top = `${y}px`;
  els.contextMenu.style.bottom = "";
  els.contextMenu.classList.remove("hidden");
  const menuRect = els.contextMenu.getBoundingClientRect();
  const safeLeft = Math.max(12, Math.min(x, window.innerWidth - menuRect.width - 12));
  const safeTop = Math.max(12, Math.min(y, window.innerHeight - menuRect.height - 12));
  els.contextMenu.style.left = `${safeLeft}px`;
  els.contextMenu.style.top = `${safeTop}px`;
}

function hideMenu() {
  els.contextMenu.classList.add("hidden");
}

window.addEventListener("keydown", ev => {
  if (ev.target.matches("textarea,input,select")) return;
  if (ev.code === "Space") { spaceDown = true; ev.preventDefault(); }
  if (ev.key === "Delete") deleteNodes(state.selected);
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") undo();
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") redo();
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "g") {
    ev.preventDefault();
    groupSelection();
  }
});

window.addEventListener("keyup", ev => {
  if (ev.code === "Space") spaceDown = false;
});

window.addEventListener("copy", ev => {
  if (ev.target.matches("textarea,input,select") || !state.selected.size || !ev.clipboardData) return;
  ev.preventDefault();
  ev.clipboardData.setData("application/x-canvasflow-nodes", "1");
  ev.clipboardData.setData("text/plain", "");
  copySelection(false);
});

window.addEventListener("paste", async ev => {
  const data = ev.clipboardData;
  const internalNodeCopy = !!data && Array.from(data.types || []).includes("application/x-canvasflow-nodes");
  const hasExternalContent = !!data && (Array.from(data.items || []).some(item => item.kind === "file" && item.type.startsWith("image/")) || !!data.getData("text/plain").trim());
  if (ev.target === els.composerText && data) {
    const imageItem = Array.from(data.items || []).find(item => item.kind === "file" && item.type.startsWith("image/"));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        ev.preventDefault();
        await createFromImageFile(file);
        return;
      }
    }
    return;
  }
  if (ev.target.matches("textarea,input,select")) return;
  if (internalNodeCopy && state.clipboard?.nodes?.length) {
    ev.preventDefault();
    pasteNodes(state.clipboard);
    return;
  }
  if (hasExternalContent && await createNodeFromClipboard(ev)) {
    ev.preventDefault();
    return;
  }
  if (state.clipboard?.nodes?.length) {
    ev.preventDefault();
    pasteNodes(state.clipboard);
  }
});

function isSupportedImageFile(file) {
  return !!file && (String(file.type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name || ""));
}

async function droppedImageSources(dataTransfer) {
  const files = Array.from(dataTransfer?.files || []).filter(isSupportedImageFile);
  if (files.length) {
    return Promise.all(files.map(async file => ({ image: await fileToDataUrl(file), fileName: file.name || `drop_${timestamp()}.png`, mime: file.type || "image/png" })));
  }
  const urls = [];
  const uriList = String(dataTransfer?.getData("text/uri-list") || "").split(/\r?\n/).map(v => v.trim()).filter(v => v && !v.startsWith("#"));
  urls.push(...uriList);
  if (!urls.length) {
    const html = dataTransfer?.getData("text/html") || "";
    const src = html ? new DOMParser().parseFromString(html, "text/html").querySelector("img")?.src : "";
    if (src) urls.push(src);
  }
  const uniqueUrls = [...new Set(urls)].filter(url => /^(https?:|data:image\/)/i.test(url));
  const results = [];
  for (const url of uniqueUrls) {
    if (url.startsWith("data:image/")) {
      const mime = url.match(/^data:([^;,]+)/)?.[1] || "image/png";
      results.push({ image: url, fileName: `drop_${timestamp()}.${extensionFor("", mime)}`, mime });
      continue;
    }
    const resp = await fetch("/api/download-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: url }) });
    const data = await resp.json();
    if (!resp.ok || !data.base64) throw new Error(data.error || `HTTP ${resp.status}`);
    const urlName = decodeURIComponent(new URL(url).pathname.split("/").pop() || "").split("?")[0];
    const mime = data.base64.match(/^data:([^;,]+)/)?.[1] || "image/png";
    results.push({ image: data.base64, fileName: /\.(png|jpe?g|webp|gif)$/i.test(urlName) ? urlName : `drop_${timestamp()}.${extensionFor("", mime)}`, mime });
  }
  return results;
}

let imageDragDepth = 0;
function clearImageDragState() {
  imageDragDepth = 0;
  els.viewport.classList.remove("image-drag-active");
  els.nodes.querySelectorAll(".image-drop-target").forEach(el => el.classList.remove("image-drop-target"));
}

els.nodes.addEventListener("dragstart", ev => {
  if (!ev.target.closest("img")) return;
  if (ev.dataTransfer) ev.dataTransfer.setData("application/x-canvasflow-internal-image", "1");
  ev.preventDefault();
  clearImageDragState();
});

els.viewport.addEventListener("dragenter", ev => {
  if (!Array.from(ev.dataTransfer?.types || []).includes("Files") && !ev.dataTransfer?.getData("text/uri-list") && !ev.dataTransfer?.getData("text/html")) return;
  ev.preventDefault();
  imageDragDepth++;
  els.viewport.classList.add("image-drag-active");
});

els.viewport.addEventListener("dragover", ev => {
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
  els.nodes.querySelectorAll(".image-drop-target").forEach(el => el.classList.remove("image-drop-target"));
  ev.target.closest(".node.image")?.classList.add("image-drop-target");
});

els.viewport.addEventListener("dragleave", ev => {
  imageDragDepth = Math.max(0, imageDragDepth - 1);
  if (!imageDragDepth || !els.viewport.contains(ev.relatedTarget)) clearImageDragState();
});

els.viewport.addEventListener("drop", async ev => {
  ev.preventDefault();
  if (ev.dataTransfer?.getData("application/x-canvasflow-internal-image") === "1") {
    clearImageDragState();
    return;
  }
  const targetNodeEl = ev.target.closest(".node.image");
  clearImageDragState();
  try {
    const sources = await droppedImageSources(ev.dataTransfer);
    if (!sources.length) return toast("未发现支持的图片；请拖入 PNG、JPG、WebP 或 GIF 文件");
    if (targetNodeEl && sources.length === 1) {
      const node = findNode(targetNodeEl.dataset.id);
      if (!node) return;
      node.image = sources[0].image;
      node.fileName = sources[0].fileName;
      node.mime = sources[0].mime;
      state.selected = new Set([node.id]);
      pushHistory();
      render();
      toast("已替换图片节点");
      return;
    }
    const p = screenToWorld(ev.clientX, ev.clientY);
    const cols = Math.min(sources.length, 4);
    const createdIds = [];
    sources.forEach((source, i) => {
      const node = addNode("image", p.x + (i % cols) * 280, p.y + Math.floor(i / cols) * 220, false);
      node.image = source.image;
      node.fileName = source.fileName;
      node.mime = source.mime;
      createdIds.push(node.id);
    });
    state.selected = new Set(createdIds);
    pushHistory();
    render();
    toast(`已拖入 ${sources.length} 张图片`);
  } catch (err) {
    console.error("[拖入] 图片读取失败", err);
    toast(`图片拖入失败：${err.message || "文件无法读取"}；请检查图片格式或网络后重试`);
  }
});

function newPage() {
  saveCurrentPage();
  const page = blankPage(`项目${state.nextPageNum++}`);
  state.pages.push(page);
  state.activePageId = page.id;
  restoreData(page.data);
  state.history = [cloneData()];
  state.future = [];
  updateUndoRedo();
  markDirty();
  render();
  toast("已新建标签页");
}

function deletePage(id) {
  if (state.pages.length <= 1) {
    toast("至少保留一个项目");
    return;
  }
  const idx = state.pages.findIndex(p => p.id === id);
  if (idx === -1) return;
  saveCurrentPage();
  const removed = state.pages.splice(idx, 1)[0];
  state._deletedPage = { page: removed, index: idx };
  if (state.activePageId === id) {
    state.activePageId = state.pages[Math.min(idx, state.pages.length - 1)].id;
    const page = currentPage();
    if (page) restoreData(page.data);
  }
  state.history = [cloneData()];
  state.future = [];
  updateUndoRedo();
  markDirty();
  render();
  toast("已删除项目（Ctrl+Z 可撤回）");
}

function switchPage(id) {
  if (id === state.activePageId) return;
  saveCurrentPage();
  state.activePageId = id;
  const page = currentPage();
  restoreData(page.data);
  state.history = [cloneData()];
  state.future = [];
  updateUndoRedo();
}

function renamePage() {
  const page = currentPage();
  if (!page) return;
  const input = document.createElement("input");
  input.className = "project-name-input";
  input.value = page.name;
  els.projectNameBtn.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    const name = input.value.trim();
    if (name) page.name = name;
    input.replaceWith(els.projectNameBtn);
    markDirty();
    renderPageTabs();
  };
  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter") commit();
    if (ev.key === "Escape") {
      input.replaceWith(els.projectNameBtn);
      renderPageTabs();
    }
  });
  input.addEventListener("blur", commit, { once: true });
}

function persistPages() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pages: state.pages, activePageId: state.activePageId, nextPageNum: state.nextPageNum }));
  } catch {
    // Large base64 images can exceed local storage; JSON save still works.
  }
}

function loadPagesFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved.pages) || !saved.pages.length) return false;
    state.pages = saved.pages;
    state.activePageId = saved.activePageId || state.pages[0].id;
    state.nextPageNum = saved.nextPageNum || (state.pages.length + 1);
    const page = currentPage() || state.pages[0];
    state.activePageId = page.id;
    restoreData(page.data);
    return true;
  } catch {
    return false;
  }
}


$("newCanvasBtn").onclick = newPage;
$("saveJsonBtn").onclick = saveJson;
$("loadJsonBtn").onclick = () => els.loadJson.click();
$("autoOutputBtn").onclick = autoAddAiNodes;
els.runBtn.onclick = runExport;
$("themeBtn").onclick = () => {
  state.settings.theme = state.settings.theme === "light" ? "dark" : "light";
  pushHistory();
  render();
};
$("settingsBtn").onclick = () => {
  els.settings.classList.toggle("hidden");
  if (!els.settings.classList.contains("hidden")) { syncSettingsPanel(); fetchBalance(); }
};
$("closeSettingsBtn").onclick = () => els.settings.classList.add("hidden");

function switchSettingsTab(name) {
  var btns = els.settings.querySelectorAll(".settings-tab-btn");
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle("active", btns[i].getAttribute("data-tab") === name);
  }
  var pages = els.settings.querySelectorAll(".tab-page");
  for (var j = 0; j < pages.length; j++) {
    pages[j].classList.toggle("hidden", pages[j].getAttribute("data-tab") !== name);
  }
}

var tabBtns = els.settings.querySelectorAll(".settings-tab-btn");
for (var t = 0; t < tabBtns.length; t++) {
  tabBtns[t].onclick = function() {
    switchSettingsTab(this.getAttribute("data-tab"));
  };
}
var assetTabBtns = els.settings.querySelectorAll(".asset-type-btn");
for (var at = 0; at < assetTabBtns.length; at++) {
  assetTabBtns[at].onclick = function() {
    var name = this.getAttribute("data-asset-tab");
    assetTabBtns.forEach(btn => btn.classList.toggle("active", btn === this));
    els.settings.querySelectorAll(".asset-pane").forEach(pane => pane.classList.toggle("hidden", pane.getAttribute("data-asset-pane") !== name));
  };
}
els.newCustomTextBtn.onclick = () => {
  if (editingTextTemplate) closeTextTemplateEditor();
  els.customTextEditor.classList.toggle("hidden");
  els.customImageEditor.classList.add("hidden");
  if (!els.customTextEditor.classList.contains("hidden")) els.customTextName.focus();
};
els.newCustomImageBtn.onclick = () => {
  if (editingImageTemplate) closeImageTemplateEditor();
  els.customImageEditor.classList.toggle("hidden");
  els.customTextEditor.classList.add("hidden");
  if (!els.customImageEditor.classList.contains("hidden")) els.customMaterialName.focus();
};
els.customTextCancelBtn.onclick = closeTextTemplateEditor;
els.customImageCancelBtn.onclick = closeImageTemplateEditor;

function setShortcutPopover(open) {
  els.shortcutPopover.classList.toggle("hidden", !open);
  els.shortcutHelpBtn.classList.toggle("active", open);
  els.shortcutHelpBtn.setAttribute("aria-expanded", String(open));
}
els.shortcutHelpBtn.onclick = ev => { ev.stopPropagation(); setShortcutPopover(els.shortcutPopover.classList.contains("hidden")); };
els.shortcutPopoverClose.onclick = () => setShortcutPopover(false);
els.shortcutPopover.onclick = ev => ev.stopPropagation();
document.addEventListener("click", () => setShortcutPopover(false));
document.addEventListener("keydown", ev => { if (ev.key === "Escape") setShortcutPopover(false); });
els.projectNameBtn.onclick = () => els.projectMenu.classList.toggle("hidden");
els.projectNameBtn.ondblclick = ev => {
  ev.preventDefault();
  els.projectMenu.classList.add("hidden");
  renamePage();
};
els.centerViewBtn.onclick = centerViewOnContent;
els.aiGenerateBtn.onclick = openExecuteDialog;
els.composerSubmitBtn.onclick = createNodesFromComposer;
els.composerText.addEventListener("keydown", ev => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    createNodesFromComposer();
  }
});
els.composerUploadBtn.onclick = (ev) => {
  const r = els.composerUploadBtn.getBoundingClientRect();
  showMenu(r.left, r.top, [
    ["上传图片文件", () => els.composerFileInput.click()],
    ["上传图片文件夹", () => els.composerFolderInput.click()],
  ]);
};
els.composerFileInput.onchange = async () => {
  const files = Array.from(els.composerFileInput.files || []);
  if (!files.length) return;
  if (files.length === 1) {
    // Single file: use composer flow (allows text+image pairing via "创建")
    await createFromImageFile(files[0]);
  } else {
    // Multiple files: create image nodes directly in a grid
    const center = visibleWorldCenter();
    const cols = Math.min(files.length, 4);
    for (let i = 0; i < files.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const node = addNode("image", center.x - NODE_WIDTH / 2 + col * 280, center.y - NODE_HEIGHT / 2 + row * 220, false);
      node.image = await fileToDataUrl(files[i]);
      node.fileName = files[i].name;
      node.mime = files[i].type || "image/png";
    }
    pushHistory();
    render();
    toast(`已导入 ${files.length} 张图片`);
  }
  els.composerFileInput.value = "";
};

els.composerFolderInput.onchange = async () => {
  const files = Array.from(els.composerFolderInput.files || []);
  if (!files.length) { els.composerFolderInput.value = ""; return; }
  const imageFiles = files.filter(f => f.type.startsWith("image/"));
  if (!imageFiles.length) {
    toast("文件夹中没有图片文件");
    els.composerFolderInput.value = "";
    return;
  }
  const center = visibleWorldCenter();
  const node = addNode("group", center.x - NODE_WIDTH / 2, center.y - NODE_HEIGHT / 2, false);
  node.images = [];
  for (const file of imageFiles) {
    node.images.push({
      image: await fileToDataUrl(file),
      fileName: file.name,
      mime: file.type || "image/png",
      name: file.name.replace(/\.[^.]+$/, ""),
    });
  }
  pushHistory();
  render();
  toast(`已创建编组节点，包含 ${node.images.length} 张图片`);
  els.composerFolderInput.value = "";
};

els.snap.onchange = () => {
  state.settings.snap = els.snap.checked;
  pushHistory();
  applySettings();
};

els.gridSize.onchange = () => {
  state.settings.gridSize = Math.max(1, Number(els.gridSize.value) || 20);
  pushHistory();
  applySettings();
};

if (els.languageSelect) {
  els.languageSelect.onchange = () => {
    setUiLanguage(els.languageSelect.value);
    render();
    syncSettingsPanel();
  };
}

els.apiKeyInput.onchange = () => {
  state.settings.apiKey = els.apiKeyInput.value.trim();
  pushHistory();
};

els.verifyKeyBtn.onclick = async () => {
  const key = els.apiKeyInput.value.trim();
  if (!key) { toast("请先输入 API Key"); return; }
  els.verifyKeyBtn.disabled = true;
  els.verifyKeyBtn.textContent = "...";
  els.verifyKeyBtn.style.color = "";
  try {
    const resp = await fetch(`/api/models?apiKey=${encodeURIComponent(key)}`);
    if (resp.status === 200) {
      els.verifyKeyBtn.textContent = "✓";
      els.verifyKeyBtn.style.color = "#34c759";
      toast("API Key 有效");
    } else if (resp.status === 401 || resp.status === 403) {
      els.verifyKeyBtn.textContent = "✗";
      els.verifyKeyBtn.style.color = "#ff3b30";
      toast("API Key 无效");
    } else {
      els.verifyKeyBtn.textContent = "✗";
      els.verifyKeyBtn.style.color = "#ff3b30";
      toast("API 返回异常状态 " + resp.status);
    }
  } catch (err) {
    els.verifyKeyBtn.textContent = "✗";
    els.verifyKeyBtn.style.color = "#ff3b30";
    toast("验证失败，请检查网络");
  }
  els.verifyKeyBtn.disabled = false;
  window.setTimeout(() => { els.verifyKeyBtn.textContent = "验证"; els.verifyKeyBtn.style.color = ""; }, 2500);
};

async function fetchBalance() {
  const key = state.settings.apiKey || els.apiKeyInput.value.trim();
  if (!key) { els.balanceDisplay.textContent = "积分：请先填入 API Key"; return; }
  els.balanceDisplay.textContent = "积分：查询中...";
  try {
    const resp = await fetch(`/api/balance?apiKey=${encodeURIComponent(key)}`);
    const data = await resp.json();
    if (data.success) {
      els.balanceDisplay.textContent = `积分：${Number(data.remain_credits).toFixed(2)}（已用 ${Number(data.used_credits).toFixed(2)}）`;
    } else {
      els.balanceDisplay.textContent = "积分：查询失败";
    }
  } catch {
    els.balanceDisplay.textContent = "积分：网络错误";
  }
}

els.balanceRefreshBtn.onclick = fetchBalance;

els.saveKeyBtn.onclick = () => {
  state.settings.apiKey = els.apiKeyInput.value.trim();
  saveCurrentPage();
  persistPages();
  pushHistory();
  toast("API Key 已保存");
};

els.clearKeyBtn.onclick = () => {
  els.apiKeyInput.value = "";
  state.settings.apiKey = "";
  // Clear API key from all pages' saved settings
  state.pages.forEach(page => {
    if (page.data && page.data.settings) {
      page.data.settings.apiKey = "";
    }
  });
  saveCurrentPage();
  persistPages();
  pushHistory();
  applySettings();
  toast("API Key 已从所有页面清除，可安全分享");
};

els.zipExportToggle.onchange = () => {
  state.settings.zipExport = els.zipExportToggle.checked;
  if (!state.settings.zipExport) {
    state.exportDirHandle = null;
    toast("已切换为文件夹导出，浏览器可能限制写入系统盘（C 盘），建议选 D 盘目录");
  }
  pushHistory();
};

els.exportInputsToggle.onchange = () => {
  state.settings.exportInputs = els.exportInputsToggle.checked;
  pushHistory();
};

$("chooseFolderBtn").onclick = chooseFolder;
els.copyExportPathBtn.onclick = copyExportPath;

els.exportFolder.onchange = () => {
  state.settings.exportFolderLabel = els.exportFolder.value.trim();
  saveCurrentPage();
  persistPages();
};

els.customMaterialFileBtn.onclick = () => {
  els.customMaterialFileInput.click();
};

els.customMaterialFileInput.onchange = async function() {
  var file = els.customMaterialFileInput.files?.[0];
  if (els.customMaterialFileHint) {
    els.customMaterialFileHint.textContent = file ? file.name : "";
  }
  if (file && els.customMaterialEditorPreview) {
    try {
      els.customMaterialEditorPreview.src = await fileToBase64(file);
      els.customMaterialEditorPreview.classList.remove("hidden");
    } catch (error) {
      console.error("[自定义图片] 预览失败", error);
      toast("图片预览失败：文件可能损坏，请重新选择");
    }
  }
};

els.customMaterialAddBtn.onclick = () => addCustomMaterial();
els.customTextAddBtn.onclick = () => addCustomText();
els.importLibraryJsonBtn.onclick = () => els.importLibraryJsonInput.click();
els.importLibraryJsonInput.onchange = async () => {
  const file = els.importLibraryJsonInput.files?.[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const pages = Array.isArray(data.pages) ? data.pages : [{ id: "json", name: file.name.replace(/\.json$/i, ""), data }];
    const sources = pages.map(page => ({ id: page.id, name: page.name || "未命名项目", library: normalizeLibrary(page.data?.customLibrary || page.customLibrary) }));
    const importedGlobalLibrary = normalizeLibrary(data.globalLibrary);
    if (importedGlobalLibrary.textTemplates.length || importedGlobalLibrary.imageMaterials.length) sources.unshift({ id: "global", name: "素材库", library: importedGlobalLibrary });
    if (!sources.some(source => source.library.textTemplates.length || source.library.imageMaterials.length)) return toast("该 JSON 中没有可导入的自定义图文");
    openLibraryImport(sources);
  } catch (e) { console.error("[导入] 素材 JSON 解析失败", e); toast("导入失败：JSON 格式不正确"); }
  finally { els.importLibraryJsonInput.value = ""; }
};
els.libraryImportCloseBtn.onclick = closeLibraryImport;
els.libraryImportCancelBtn.onclick = closeLibraryImport;
els.libraryImportSource.onchange = renderLibraryImportItems;
els.libraryImportConfirmBtn.onclick = confirmLibraryImport;

els.loadJson.onchange = async () => {
  const file = els.loadJson.files?.[0];
  if (!file) return;
  const data = JSON.parse(await file.text());
  await restoreLibrariesFromJson(data);
  if (Array.isArray(data.pages)) {
    state.pages = data.pages;
    state.activePageId = data.activePageId || state.pages[0].id;
    const page = currentPage() || state.pages[0];
    state.activePageId = page.id;
    restoreData(page.data);
  } else {
    const page = blankPage(file.name.replace(/\.json$/i, ""));
    page.data = data;
    state.pages.push(page);
    state.activePageId = page.id;
    restoreData(page.data);
  }
  await resolveImageRefs(state.nodes);
  state.history = [cloneData()];
  state.future = [];
  updateUndoRedo();
  markDirty();
  toast("JSON已加载");
  els.loadJson.value = "";
};

async function saveJson() {
  saveCurrentPage();
  const data = JSON.parse(JSON.stringify({ pages: state.pages, activePageId: state.activePageId, globalLibrary }));

  // 收集所有需要提取的图片（data URL → 保存为独立文件）
  const imageFiles = [];
  for (const page of data.pages) {
    for (const node of (page.data.nodes || [])) {
      const imgFields = [];
      if (node.image && node.image.startsWith("data:")) imgFields.push("image");
      if (node.generatedImage && node.generatedImage.startsWith("data:")) imgFields.push("generatedImage");
      for (const field of imgFields) {
        const dataUrl = node[field];
        const parts = dataUrl.split(",");
        const base64 = parts[1];
        if (!base64) continue;
        const mime = (dataUrl.match(/^data:([^;]+)/) || [])[1] || "image/png";
        const fullMime = dataUrl.match(/^data:[^;]+/)?.[0] || "data:image/png;base64";
        const ext = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[mime] || "png";
        let name = node.fileName || `${field}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        if (!name.match(/\.\w{3,4}$/i)) name += "." + ext;
        imageFiles.push({ name, data: base64, nodeRef: node, field, fullMime });
        node[field] = name;
      }
      // Extract group images
      if (node.images && Array.isArray(node.images)) {
        for (let i = 0; i < node.images.length; i++) {
          const gImg = node.images[i];
          if (!gImg.image || !gImg.image.startsWith("data:")) continue;
          const parts = gImg.image.split(",");
          const base64 = parts[1];
          if (!base64) continue;
          const mime = (gImg.image.match(/^data:([^;]+)/) || [])[1] || "image/png";
          const fullMime = gImg.image.match(/^data:[^;]+/)?.[0] || "data:image/png;base64";
          const ext = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[mime] || "png";
          let name = gImg.fileName || `group_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          if (!name.match(/\.\w{3,4}$/i)) name += "." + ext;
          imageFiles.push({ name, data: base64, groupNode: node, groupIndex: i, fullMime });
          gImg.image = name;
        }
      }
    }
  }

  if (imageFiles.length > 0) {
    try {
      const resp = await fetch("/api/save-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: imageFiles.map(f => ({ name: f.name, data: f.data })) }),
      });
      const result = await resp.json();
      if (result.error) throw new Error(result.error);
    } catch {
      for (const f of imageFiles) {
        if (f.groupNode) {
          f.groupNode.images[f.groupIndex].image = f.fullMime + "," + f.data;
        } else {
          f.nodeRef[f.field] = f.fullMime + "," + f.data;
        }
      }
    }
  }

  const libraryFailures = await embedLibraryImages(data);
  if (libraryFailures.length) {
    console.error("[保存] 以下自定义图片未能写入 JSON:", libraryFailures);
    toast(`项目已保存，但 ${libraryFailures.length} 个自定义图片未能备份`);
  }

  const name = `${safeName(currentPage()?.name || "canvas")}.json`;
  const content = JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: "application/json" });
  if (state.exportDirHandle) {
    const handle = await state.exportDirHandle.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    toast("JSON已保存到输出文件夹");
  } else {
    try {
      const resp = await fetch("/api/save-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, content }),
      });
      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      toast("JSON已保存到 download 文件夹");
    } catch {
      downloadBlob(blob, name);
      toast("JSON已下载（浏览器下载）");
    }
  }
  state.dirty = false;
}

async function embedLibraryImages(data) {
  const failures = [];
  const libraries = [data.globalLibrary, ...(data.pages || []).map(page => page.data?.customLibrary)].filter(Boolean);
  for (const library of libraries) {
    for (const item of library.imageMaterials || []) {
      if (!item.fileName) { failures.push(item.name); continue; }
      try {
        const resp = await fetch("/download/images/" + encodeURIComponent(item.fileName));
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        item.data = stripDataUrl(await blobToBase64(await resp.blob()));
      } catch (e) { failures.push(item.name); console.error("[保存] 自定义图片读取失败", item.name, e); }
    }
  }
  return failures;
}

async function restoreLibrariesFromJson(data) {
  const pages = Array.isArray(data.pages) ? data.pages : [];
  const importedGlobal = normalizeLibrary(data.globalLibrary);
  for (const page of pages) {
    const library = normalizeLibrary(page.data?.customLibrary);
    for (const item of library.imageMaterials) {
      if (!item.data) continue;
      try {
        const resp = await fetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: item.fileName || "custom.png", data: stripDataUrl(item.data) }) });
        const result = await resp.json(); if (!result.success) throw new Error(result.error || "恢复失败");
        item.fileName = result.fileName; delete item.data;
      } catch (e) { console.error("[加载] 项目自定义图片恢复失败", item.name, e); }
    }
    importedGlobal.textTemplates.push(...library.textTemplates);
    importedGlobal.imageMaterials.push(...library.imageMaterials);
    if (page.data) {
      page.data.customLibrary = emptyLibrary();
      walkNodes(page.data.nodes || [], node => { if (node.customRef) delete node.customRef; });
    }
  }
  for (const item of importedGlobal.textTemplates) {
    const existing = globalLibrary.textTemplates.find(x => x.id === item.id);
    if (existing) continue;
    item.name = uniqueTemplateName("text", item.name, globalLibrary); globalLibrary.textTemplates.push(item);
  }
  for (const item of importedGlobal.imageMaterials) {
    try {
      const existing = globalLibrary.imageMaterials.find(x => x.id === item.id);
      if (existing) continue;
      if (item.data) {
        const resp = await fetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: item.fileName || "custom.png", data: stripDataUrl(item.data) }) });
        const result = await resp.json(); if (!result.success) throw new Error(result.error || "恢复失败"); item.fileName = result.fileName;
      }
      item.name = uniqueTemplateName("image", item.name, globalLibrary); delete item.data; globalLibrary.imageMaterials.push(item);
    } catch (e) { console.error("[加载] 全局自定义图片恢复失败", item.name, e); }
  }
  saveGlobalLibrary();
}

async function chooseFolder() {
  try {
    const resp = await fetch("/api/choose-folder", { method: "POST" });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    if (data.cancelled) { toast("已取消选择文件夹"); return false; }
    if (!data.folderPath) throw new Error("没有返回文件夹路径");
    state.exportDirHandle = null;
    state.settings.exportFolderLabel = data.folderPath;
    els.exportFolder.value = data.folderPath;
    saveCurrentPage();
    persistPages();
    pushHistory();
    toast("导出文件夹已保存");
    return true;
  } catch (err) {
    console.error("[导出] 选择文件夹失败", err);
    toast("无法设置导出文件夹：可能是系统选择窗口启动失败，请手动输入完整路径");
    return false;
  }
}

async function copyExportPath() {
  const folderPath = els.exportFolder.value.trim();
  if (!folderPath) {
    toast("请先设置导出文件夹路径");
    return false;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(folderPath);
    } else {
      els.exportFolder.focus();
      els.exportFolder.select();
      if (!document.execCommand("copy")) throw new Error("copy command failed");
    }
    toast(`已复制导出路径：${folderPath}`);
    return true;
  } catch (err) {
    console.error("[导出] 复制路径失败", err);
    els.exportFolder.focus();
    els.exportFolder.select();
    toast("无法自动复制路径：可能是浏览器权限受限；已为你选中完整路径，请按 Ctrl+C 复制");
    return false;
  }
}

async function runExport() {
  const targets = exportTargets();
  if (!targets.length) return toast("没有可导出的 AI 生成结果");
  try {
    setProgress(5, "准备导出");
    await nextPaint();
    if (state.settings.zipExport) {
      state.exportDirHandle = null; // force zip download
    }
    const folderName = `${safeName(currentPage()?.name || "导出")}_${timestamp()}`;
    const rows = [];
    const files = [];
    const incoming = buildIncomingIndex();
    const usedPaths = new Set();
    const referenceNames = new Map();
    let resultNumber = 0;

    function uniqueExportPath(folder, preferredName, fallbackName, mime) {
      const ext = extensionFor(preferredName, mime);
      const stem = safeName(baseName(preferredName) || fallbackName) || fallbackName;
      let candidate = `${folder}/${stem}.${ext}`;
      let suffix = 2;
      while (usedPaths.has(candidate.toLowerCase())) candidate = `${folder}/${stem}_${suffix++}.${ext}`;
      usedPaths.add(candidate.toLowerCase());
      return candidate;
    }

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (i === 0 || i === targets.length - 1 || i % 5 === 0) {
        setProgress(10 + (i / Math.max(1, targets.length)) * 35, `收集输出 ${i + 1}/${targets.length}`);
        await nextPaint();
      }
      const collected = target.virtual ? collectForTerminal(target.id, incoming) : collectForOutput(target.id, incoming);
      for (const img of collected.images) {
        resultNumber++;
        const ext = extensionFor(img.fileName, img.mime);
        files.push({ name: `生成结果/图片${resultNumber}.${ext}`, blob: dataUrlToBlob(img.image) });

        if (state.settings.exportInputs && img.aiSourceNodeId) {
          const upstream = collectUpstreamForAI(img.aiSourceNodeId, incoming);
          const refs = [...upstream.images];
          if (Number.isInteger(img.aiBatchIndex) && upstream.groupImages[img.aiBatchIndex]) refs.push(upstream.groupImages[img.aiBatchIndex]);
          else if (!Number.isInteger(img.aiBatchIndex)) refs.push(...upstream.groupImages);

          const refFileNames = [];
          for (const ref of refs) {
            if (!ref.image) continue;
            let path = referenceNames.get(ref.image);
            if (!path) {
              path = uniqueExportPath("参考图", ref.fileName || "参考图.png", `参考图${referenceNames.size + 1}`, ref.mime);
              referenceNames.set(ref.image, path);
              files.push({ name: path, blob: dataUrlToBlob(ref.image) });
            }
            refFileNames.push(path.slice(path.lastIndexOf("/") + 1));
          }
          const prompt = upstream.texts.join("，");
          if (refFileNames.length || prompt) rows.push([[refFileNames.join("、"), prompt].filter(Boolean).join("，")]);
        }
      }
    }
    if (rows.length) {
      setProgress(52, "生成Excel");
      await nextPaint();
      files.push({ name: "关键词.xlsx", blob: makeXlsx([["关键词"], ...rows]) });
    }
    if (!files.length) {
      setProgress(100, "没有可导出内容");
      hideProgressSoon();
      return toast("没有可导出的 AI 生成结果");
    }
    setProgress(62, "写入文件");
    await nextPaint();
    await saveFiles(files, folderName, (done, total) => {
      setProgress(62 + (done / Math.max(1, total)) * 38, `写入文件 ${done}/${total}`);
    });
    setProgress(100, "导出完成");
    await nextPaint();
    hideProgressSoon();
    toast(`已导出到 ${folderName}`);
  } catch (err) {
    console.error(err);
    setProgress(100, "导出失败");
    hideProgressSoon();
    toast("导出失败，请检查文件夹权限或内容大小");
  }
}

function buildIncomingIndex() {
  const incoming = new Map();
  state.edges.forEach(e => {
    if (!incoming.has(e.to.node)) incoming.set(e.to.node, []);
    incoming.get(e.to.node).push(e);
  });
  incoming.forEach(list => {
    list.sort((a, b) => (findNode(a.from.node)?.x || 0) - (findNode(b.from.node)?.x || 0));
  });
  return incoming;
}

function collectForOutput(outputId, incoming = buildIncomingIndex()) {
  const result = { texts: [], images: [] };
  const visited = new Set();
  function appendAiResults(n) {
    const completedBatch = n.batchTasks?.filter(t => t.status === "done" && t.result) || [];
    if (completedBatch.length) {
      completedBatch.forEach(t => result.images.push({ image: t.result, fileName: t.fileName || "ai_generated.png", mime: "image/png", aiSourceNodeId: n.id, aiBatchIndex: t.index }));
    } else if (n.generatedImage) {
      result.images.push({ image: n.generatedImage, fileName: n.fileName || "ai_generated.png", mime: n.mime || "image/png", aiSourceNodeId: n.id });
    }
  }
  function visit(nodeId) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const n = findNode(nodeId);
    if (!n || n.disabled) return;
    // AI 节点等同一张成图：收集结果后停止追溯它之前的提示词和参考图。
    if (n.type === "ai-image") {
      appendAiResults(n);
      return;
    }
    if (n.type === "image" && n.aiSourceNodeId && n.image) {
      result.images.push({ image: n.image, fileName: n.fileName, mime: n.mime, aiSourceNodeId: n.aiSourceNodeId, aiBatchIndex: n.aiBatchIndex });
      return;
    }
    (incoming.get(nodeId) || []).forEach(e => visit(e.from.node));
  }
  visit(outputId);
  return result;
}

function collectForTerminal(nodeId, incoming = buildIncomingIndex()) {
  const n = findNode(nodeId);
  if (!n || n.disabled) return { texts: [], images: [] };
  if (n.type === "image" && n.aiSourceNodeId && n.image) {
    return { texts: [], images: [{ image: n.image, fileName: n.fileName, mime: n.mime, aiSourceNodeId: n.aiSourceNodeId, aiBatchIndex: n.aiBatchIndex }] };
  }
  return collectForOutput(nodeId, incoming);
}

function extensionFor(name, mime) {
  const ext = String(name || "").split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return ext;
  if (mime?.includes("jpeg")) return "jpg";
  if (mime?.includes("gif")) return "gif";
  if (mime?.includes("webp")) return "webp";
  return "png";
}

function baseName(name) {
  return String(name || "").replace(/\.[^.]+$/, "");
}

function safeName(name) {
  return String(name || "未命名").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 80);
}

function timestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)?.[1] || "image/png";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function saveFiles(files, folderName, onProgress = () => {}) {
  if (state.exportDirHandle) {
    const dir = await state.exportDirHandle.getDirectoryHandle(folderName, { create: true });
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const parts = file.name.replace(/\\/g, "/").split("/").filter(Boolean);
      let targetDir = dir;
      for (const part of parts.slice(0, -1)) targetDir = await targetDir.getDirectoryHandle(part, { create: true });
      const handle = await targetDir.getFileHandle(parts.at(-1), { create: true });
      const writable = await handle.createWritable();
      await writable.write(file.blob);
      await writable.close();
      onProgress(i + 1, files.length);
      if (i % 4 === 0 || i === files.length - 1) await nextPaint();
    }
  } else if (state.settings.zipExport) {
    const zip = await zipFiles(files.map(file => ({ path: `${folderName}/${file.name}`, blob: file.blob })), onProgress);
    downloadBlob(zip, `${folderName}.zip`);
    onProgress(files.length, files.length);
    await nextPaint();
  } else {
    // Default: save to project export folder via server
    const fileData = [];
    for (let i = 0; i < files.length; i++) {
      const base64 = await blobToBase64(files[i].blob);
      fileData.push({ name: files[i].name, data: base64 });
      onProgress(i + 1, files.length);
      if (i % 4 === 0 || i === files.length - 1) await nextPaint();
    }
    const resp = await fetch("/api/save-export-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderName, baseFolder: state.settings.exportFolderLabel || "export", files: fileData }),
    });
    const result = await resp.json();
    if (result.error) throw new Error(result.error);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function resolveImageRefs(nodes) {
  const imageFields = ["image", "generatedImage"];
  for (const node of nodes) {
    for (const field of imageFields) {
      const val = node[field];
      if (!val || val.startsWith("data:") || val.startsWith("http")) continue;
      if (val.includes("://")) continue;
      try {
        const resp = await fetch("/download/images/" + encodeURIComponent(val));
        if (!resp.ok) throw new Error("not found");
        const blob = await resp.blob();
        node[field] = await blobToBase64(blob);
      } catch {
        node[field] = null;
      }
    }
    // Resolve group images
    if (node.images && Array.isArray(node.images)) {
      for (const gImg of node.images) {
        if (!gImg.image || gImg.image.startsWith("data:") || gImg.image.startsWith("http")) continue;
        if (gImg.image.includes("://")) continue;
        try {
          const resp = await fetch("/download/images/" + encodeURIComponent(gImg.image));
          if (!resp.ok) throw new Error("not found");
          const blob = await resp.blob();
          gImg.image = await blobToBase64(blob);
        } catch {
          gImg.image = null;
        }
      }
    }
  }
}

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function makeXlsx(rows) {
  const sheetRows = rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => `<c r="${colName(c + 1)}${r + 1}" t="inlineStr"><is><t>${xmlEscape(v)}</t></is></c>`).join("")}</row>`).join("");
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="导出内容" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  };
  return zipStore(files, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function colName(n) {
  let s = "";
  while (n) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

function xmlEscape(v) {
  return String(v).replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" }[c]));
}

function zipStore(files, mime) {
  const entries = Object.entries(files).map(([path, text]) => ({ path, bytes: new TextEncoder().encode(text) }));
  return zipBytes(entries, mime);
}

async function zipFiles(files, onProgress = () => {}) {
  let done = 0;
  const entries = await Promise.all(files.map(async file => {
    const entry = { path: file.path, bytes: new Uint8Array(await file.blob.arrayBuffer()) };
    done += 1;
    onProgress(done, files.length);
    return entry;
  }));
  return zipBytes(entries, "application/zip");
}

function zipBytes(entries, mime) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  entries.forEach(({ path, bytes }) => {
    const nameBytes = encoder.encode(path.replace(/\\/g, "/"));
    const data = bytes;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(8, 0x0800, true);   // bit 11 = UTF-8 filenames
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, data);
    const c = new Uint8Array(46 + nameBytes.length);
    const cd = new DataView(c.buffer);
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);   // bit 11 = UTF-8 filenames
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    c.set(nameBytes, 46);
    central.push(c);
    offset += local.length + data.length;
  });
  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ed = new DataView(end.buffer);
  ed.setUint32(0, 0x06054b50, true);
  ed.setUint16(8, central.length, true);
  ed.setUint16(10, central.length, true);
  ed.setUint32(12, centralSize, true);
  ed.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: mime });
}

function crc32(data) {
  let c = ~0;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (~c) >>> 0;
}

window.addEventListener("beforeunload", ev => {
  if (!state.dirty) return;
  ev.preventDefault();
  ev.returnValue = "当前项目还没有保存，确定要离开吗？";
});

function openExecuteDialog() {
  const aiNodes = state.nodes.filter(n => n.type === "ai-image" && !n.disabled);
  if (!aiNodes.length) { toast("画布上没有可执行的 AI 绘图节点"); return; }

  // 按位置排序，分配稳定编号
  aiNodes.sort((a, b) => a.x - b.x || a.y - b.y);
  aiNodes.forEach((node, i) => { node.seq = i + 1; });

  // 统计总任务数（编组图片展开）
  let totalTasks = 0;
  aiNodes.forEach(node => {
    const up = collectUpstreamForAI(node.id);
    if (up.groupImages.length > 0) totalTasks += up.groupImages.length;
    else if (up.texts.length || up.images.length) totalTasks++;
  });

  els.executeTitle.textContent = `共 ${totalTasks} 个任务（${aiNodes.length} 个节点）· 双击标题放大`;
  els.executeTitle.title = "双击标题栏可最大化窗口";
  els.executeList.innerHTML = "";

  aiNodes.forEach(node => {
    const upstream = collectUpstreamForAI(node.id);
    const refImages = upstream.orderedRefs.slice(0, 8);
    const taskCount = upstream.groupImages.length || 1;
    let imgsHtml = "";
    if (refImages.length) {
      imgsHtml = refImages.map(img => `<img src="${img.image}" alt="">`).join("");
    } else {
      imgsHtml = `<div class="task-noimg">无参考图</div>`;
    }
    const row = document.createElement("div");
    row.className = "execute-task-row";
    row._lightboxImages = refImages.map(r => r.image);
    row.innerHTML = `<span class="task-idx">#${node.seq} ×${taskCount}</span>
      <div class="task-images">${imgsHtml}</div>
      <span class="task-prompt">${escapeHtml(upstream.texts.join("，") || "(无文字输入)")}</span>`;
    row.dataset.nodeId = node.id;
    els.executeList.appendChild(row);
  });

  render(); // 刷新画布上的编号显示

  els.executeDialog.classList.remove("hidden");
  els.executeRunBtn.onclick = () => {
    closeExecuteDialog();
    executeAllAiNodes();
  };
}

function closeExecuteDialog() {
  els.executeDialog.classList.add("hidden");
}

async function executeAllAiNodes() {
  if (!state.settings.apiKey) {
    toast("请先在设置中填入 API Key");
    return;
  }
  // 先拆分多输入 AI 节点
  const aiNodesToCheck = state.nodes.filter(n => n.type === "ai-image" && !n.disabled && !n.generating);
  let anySplit = false;
  for (const n of aiNodesToCheck) {
    const result = splitMultiInputAiNode(n.id);
    if (result.length > 1) anySplit = true;
  }
  if (anySplit) pushHistory();

  // 重新获取所有 AI 节点（含拆分新建的）
  const aiNodes = state.nodes.filter(n => n.type === "ai-image" && !n.disabled && !n.generating);
  if (!aiNodes.length) return;

  // 展开所有任务：每个 AI 节点的编组图片展开为独立任务，单图节点为一个任务
  const allTasks = [];
  aiNodes.forEach(node => {
    const upstream = collectUpstreamForAI(node.id);
    const nodeSeq = node.seq || 0;
    if (upstream.groupImages.length > 0) {
      upstream.groupImages.forEach((gImg, gi) => {
        allTasks.push({ nodeId: node.id, groupIdx: gi, groupImg: gImg, fileName: `#${nodeSeq}-${gImg.fileName || `图${gi+1}`}`, status: "waiting", taskId: null, result: null });
      });
    } else if (upstream.texts.length || upstream.images.length) {
      allTasks.push({ nodeId: node.id, groupIdx: -1, groupImg: null, fileName: `#${nodeSeq} · 单图`, status: "waiting", taskId: null, result: null });
    }
  });
  if (!allTasks.length) return;

  const totalTasks = allTasks.length;
  const MAX_CONCURRENT = 5;
  let cancelled = false;
  const progressTasksByNode = new Map();
  allTasks.forEach(t => {
    if (!progressTasksByNode.has(t.nodeId)) progressTasksByNode.set(t.nodeId, []);
    progressTasksByNode.get(t.nodeId).push(t);
  });
  progressTasksByNode.forEach((tasks, nodeId) => {
    const node = findNode(nodeId);
    if (!node) return;
    node.generating = true;
    syncAiNodeTaskProgress(node, tasks);
  });

  els.batchCancelAllBtn.onclick = () => {
    cancelled = true;
    allTasks.forEach(t => { if (t.status === "waiting") t.status = "cancelled"; });
    progressTasksByNode.forEach((tasks, nodeId) => syncAiNodeTaskProgress(findNode(nodeId), tasks));
    setBatchProgress(totalTasks, allTasks.filter(t => t.status === "done").length, allTasks);
    toast("已取消剩余任务");
  };

  setBatchProgress(totalTasks, 0, allTasks);
  await nextPaint();

  let nextIdx = 0;
  let running = 0;

  const runOne = async (t) => {
    if (cancelled || t.status === "cancelled") return;
    const node = findNode(t.nodeId);
    if (!node) return;
    const nodeTasks = progressTasksByNode.get(t.nodeId) || [t];
    t.status = "submitting";
    t.progress = null;
    syncAiNodeTaskProgress(node, nodeTasks);
    setBatchProgress(totalTasks, allTasks.filter(bt => bt.status === "done").length, allTasks);
    await nextPaint();
    try {
      const upstream = collectUpstreamForAI(t.nodeId);
      const regularUrls = upstream.images.map(img => img.image);
      const prompt = upstream.texts.join("，");
      let taskImages;
      if (t.groupIdx >= 0) {
        taskImages = [...regularUrls, upstream.groupImages[t.groupIdx].image];
      } else {
        taskImages = regularUrls;
      }
      t.taskId = await submitGeneration(prompt, taskImages, node);
      if (cancelled || t.status === "cancelled") { t.status = "cancelled"; return; }
      t.status = "generating";
      syncAiNodeTaskProgress(node, nodeTasks);
      const imageUrl = await pollTask(t.taskId, pct => {
        t.progress = pct;
        syncAiNodeTaskProgress(node, nodeTasks);
      });
      if (cancelled || t.status === "cancelled") { t.status = "cancelled"; return; }
      t.status = "downloading";
      t.progress = 96;
      syncAiNodeTaskProgress(node, nodeTasks);
      t.result = await fetchImageAsBase64(imageUrl);
      t.status = "done";
      t.progress = 100;
    } catch (err) {
      if (cancelled) t.status = "cancelled";
      else { t.status = "failed"; t.error = err.message; }
    } finally {
      running--;
      syncAiNodeTaskProgress(node, nodeTasks);
      setBatchProgress(totalTasks, allTasks.filter(bt => bt.status === "done").length, allTasks);
      await nextPaint();
    }
  };

  function pump() {
    while (nextIdx < totalTasks && running < MAX_CONCURRENT && !cancelled) {
      const t = allTasks[nextIdx];
      if (t.status !== "cancelled") { running++; runOne(t); }
      nextIdx++;
    }
  }

  pump();

  // 每 1 秒检查队列
  await new Promise(resolve => {
    const interval = setInterval(() => {
      if (cancelled) { if (running === 0) { clearInterval(interval); resolve(); } return; }
      pump();
      const allDone = allTasks.every(t => t.status === "done" || t.status === "failed" || t.status === "cancelled");
      if (allDone && running === 0) { clearInterval(interval); resolve(); }
    }, 1000);
  });

  if (cancelled) {
    allTasks.forEach(t => { if (t.status === "waiting") t.status = "cancelled"; });
  }
  progressTasksByNode.forEach((tasks, nodeId) => {
    const node = findNode(nodeId);
    if (!node) return;
    node.generating = false;
    syncAiNodeTaskProgress(node, tasks);
  });

  // 为已完成的任务创建图片节点（按 AI 节点分组排列）
  const byNode = new Map();
  allTasks.forEach(t => {
    if (t.status === "done" && t.result) {
      if (!byNode.has(t.nodeId)) byNode.set(t.nodeId, []);
      byNode.get(t.nodeId).push(t);
    }
  });
  byNode.forEach((tasks, nid) => {
    const node = findNode(nid);
    if (!node) return;
    const aiX = node.x, aiY = node.y;
    tasks.forEach((t, i) => {
      const imgNode = addNode("image", aiX + NODE_WIDTH + 40, aiY + i * 220, false);
      imgNode.image = t.result;
      imgNode.fileName = t.fileName || `ai_batch_${i + 1}.png`;
      imgNode.mime = "image/png";
      imgNode.aiSourceNodeId = node.id;
      imgNode.aiBatchIndex = t.groupIdx >= 0 ? t.groupIdx : null;
    });
  });
  const doneCount = allTasks.filter(t => t.status === "done").length;
  pushHistory();
  render();
  toast(`${doneCount} 张图片已生成`);
  hideBatchProgressSoon();
}

els.executeClose.onclick = closeExecuteDialog;
els.executeCancelBtn.onclick = closeExecuteDialog;
els.executeDialog.querySelector(".execute-dialog-bg").onclick = closeExecuteDialog;
els.executeDialog.querySelector(".execute-dialog-head").ondblclick = () => {
  els.executeDialog.querySelector(".execute-dialog-panel").classList.toggle("maximized");
};
els.executeList.addEventListener("dblclick", ev => {
  const img = ev.target.closest(".task-images img");
  if (!img) return;
  const row = ev.target.closest(".execute-task-row");
  if (!row || !row._lightboxImages || !row._lightboxImages.length) return;
  const imgs = Array.from(row.querySelectorAll(".task-images img"));
  const idx = imgs.indexOf(img);
  const all = row._lightboxImages;
  // Reorder so clicked image is first
  showLightbox([...all.slice(idx), ...all.slice(0, idx)]);
});
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && !els.executeDialog.classList.contains("hidden")) closeExecuteDialog();
});

async function init() {
  await loadGlobalLibraryFromDisk();
  try {
    const resp = await fetch("/api/runtime-paths", { cache: "no-store" });
    const data = await resp.json();
    if (!resp.ok || !data.exportFolder) throw new Error(data.error || `HTTP ${resp.status}`);
    runtimeExportFolder = data.exportFolder;
    console.info("[初始化] 默认导出目录", { exportFolder: runtimeExportFolder });
  } catch (err) {
    console.error("[初始化] 无法识别默认导出目录", err);
    toast("无法识别程序所在目录：将暂时使用 export；请在设置中确认完整导出路径");
  }
  if (!loadPagesFromStorage()) {
    const page = blankPage("项目1");
    state.pages = [page];
    state.activePageId = page.id;
    state.nextPageNum = 2;
    restoreData(page.data);
  }
  state.history = [cloneData()];
  state.future = [];
  updateUndoRedo();
  applySettings();
  render();
  setUiLanguage(uiLanguage);
  const uiObserver = new MutationObserver(changes => {
    for (const change of changes) {
      if (change.type === "characterData") translateUiTree(change.target);
      for (const node of change.addedNodes) translateUiTree(node);
    }
  });
  uiObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
}

init().catch(e => { console.error("[初始化] 启动失败", e); toast("启动失败：" + e.message); });
