const $ = (id) => document.getElementById(id);

const NODE_WIDTH = 240;
const NODE_HEIGHT = 172;
const IMAGE_NODE_HEIGHT = 316;
const IMAGE_NODE_VERTICAL_STEP = IMAGE_NODE_HEIGHT + 40;
const AI_NODE_HEIGHT = 300;
const ANGLE_NODE_HEIGHT = 430;
const TOOL_NODE_HEIGHT = 250;
const DEFAULT_EXTENSION_SERVICE_URL = "http://127.0.0.1:8788";
const GROUP_NODE_HEIGHT = 244;
const SCREENSHOT_NODE_HEIGHT = 250;
const CHAT_NODE_WIDTH = 300;
const CHAT_NODE_HEIGHT = 220;
const CHAT_HISTORY_LIMIT = 20;
const CHAT_MAX_REFERENCE_IMAGES = 12;
// 回复不覆盖框内关键词,而是以一条长横线分隔展示在关键词区之后;该线只能由程序写入(键盘敲不出 U+2500)
const CHAT_RESULT_DIVIDER = "────────";
const CHAT_RESULT_DIVIDER_LINE_RE = /^[ \t]*─{6,}[ \t\r]*$/;
const BROWSER_NODE_HEIGHT = 300;
const BROWSER_TASK_TIMEOUT_MS = 360000;
const BROWSER_TASK_POLL_MS = 2500;
const CANVAS_MIN_SCALE = .15;
const CANVAS_MAX_SCALE = 2.5;
// AI 视频节点（ai-video）：统一视频接口异步生成 mp4，成片落盘 download/videos，节点只存文件名
const VIDEO_NODE_WIDTH = 340;
const VIDEO_NODE_HEIGHT = 430;
const VIDEO_TASK_POLL_MS = 5000;
const VIDEO_TASK_MAX_ATTEMPTS = 360; // 5 秒一轮 × 360 ≈ 30 分钟总超时
const VIDEO_TASK_MAX_IMAGES = 9;
const BROWSER_SITES = [
  { id: "gemini", label: "Gemini" },
  { id: "chatgpt", label: "ChatGPT" },
];
const CONNECT_SNAP_RADIUS = 38;
const EDGE_DROP_DWELL_MS = 500;
const NODE_RELEASE_HOLD_MS = 500;
const STORAGE_KEY = "webimage.pages.v2";
const { desktop, apiFetch } = window.CanvasFlowRuntime;


let runtimeExportFolder = "export";
let runtimeProjectFolder = "projects";
let autoBackupReady = false;
let autoBackupTimer = null;
let lastUpdateCheckResult = null;
let updateCheckStarted = false;
let updateCheckInFlight = false;
let desktopStateTimer = null;
let lastDesktopTheme = "";

function autoBackupFileName() {
  const projectName = safeName(currentPage()?.name || "未命名项目").slice(0, 80) || "未命名项目";
  return `${projectName}.json`;
}

function resolvedExportFolderLabel(value) {
  const label = String(value || "").trim();
  return !label || label === "export" || label === "export（项目文件夹）" || label === "export (project folder)"
    ? runtimeExportFolder
    : label;
}

function resolvedProjectFolderLabel(value) {
  const label = String(value || "").trim();
  return !label || label === "projects" || label === "projects（项目文件夹）" || label === "projects (project folder)"
    ? runtimeProjectFolder
    : label;
}
const LANGUAGE_KEY = "webimage.language";
const OUTPUT_FOLDER_KEY = "canvasflow.outputFolder.v1";
const PROJECT_FOLDER_KEY = "canvasflow.projectFolder.v1";
const GLOBAL_LIBRARY_KEY = "canvasflow.globalLibrary.v1";
const ONBOARDING_VERSION = 1;
const DEFAULT_TEXT_TEMPLATES = [
  { id: "builtin_text_model_line_art_v1", name: "模特转线稿", content: "将第二张图中的模特照片变成线稿，外轮廓稍微粗一点，白色背景，模特服装和长相参考第一张图，人物动作和第二张图中人物动作保持一致，不要任何颜色填充", revision: 1 },
  { id: "builtin_text_image_line_art_v1", name: "图片转线稿", content: "照片变成线稿，外轮廓稍微粗一点，白色背景，不要文字，不要颜色填充", revision: 1 },
  { id: "builtin_text_multi_view_v1", name: "多视角参考", content: "生成参考图的正前侧、左侧、右侧、顶侧，四个视角的视图", revision: 1 },
  { id: "builtin_text_cmf_transfer_v1", name: "cmf迁移", content: "将第二张图的材质迁移应用到一张图的产品上", revision: 1 },
  { id: "builtin_text_hd_restore_v1", name: "高清修复", content: "严格参考输入图片重新绘制，保持原有主体、结构、轮廓、比例、视角、构图、颜色和材质一致，不增加或删除元素。修复模糊、噪点、压缩痕迹和锯齿，重建清晰自然的边缘与细节，真实准确的材质表现，细腻柔和的光影，主体完整居中，背景简洁干净，专业高品质视觉效果，高清，高细节，8K。", revision: 1 },
  { id: "builtin_text_photo_line_art_v1", name: "照片转线稿", content: "照片转线稿，外轮廓稍微粗一点，白色背景，不要文字，不要颜色填充", revision: 1 },
];
// 自带自定义组件（多节点模板）：随软件分发，启动注入全局素材库。
// BUILTIN_MULTI_NODE_SEED_VERSION 递增才会向已有用户补发新组件；
// 用户删除过的内置组件记录在 builtinMultiNodeRemovedIds，不随种子版本升级复活。
// imageFiles[].src 指向应用目录 builtin-templates/ 下的随包图片，注入时复制到数据目录。
const BUILTIN_MULTI_NODE_SEED_VERSION = 2;
const DEFAULT_MULTI_NODE_TEMPLATES = [
  {
    id: "builtin_multi_rerender_v1",
    name: "重新渲染",
    revision: 1,
    nodes: [
      { id: "n1", type: "text", x: -520, y: 740, w: 240, h: 172, text: "将第一张图仅作为风格和材质参考，将第二张图图完善细节生成效果图，精致的光影关系，不考虑原图背景而是根据第二张图类型生成合适电商背景" },
      { id: "n2", type: "image", x: -200, y: 740, w: 240, h: 196, fileName: "builtin-rerender-style.jpg", mime: "image/jpeg", templateImageId: "img_builtin_rerender_style", _previewAspect: 2.481133962264151 },
      { id: "n3", type: "image", x: 160, y: 680, w: 240, h: 476, fileName: "builtin-rerender-product.png", mime: "image/png", templateImageId: "img_builtin_rerender_product", _previewAspect: 0.5853658536585366 },
      { id: "n4", type: "ai-image", x: 560, y: 680, w: 240, h: 409, prompt: "将第一张图仅作为风格和材质参考，将第二张图图完善细节生成效果图，精致的光影关系，不考虑原图背景而是根据第二张图类型生成合适电商背景", _model: "gpt-image-2.5-flare", _resolution: "1k", _size: "1:1", _quality: "medium", _count: 1 },
    ],
    edges: [
      { id: "e1", from: { node: "n1", port: "out" }, to: { node: "n2", port: "in" }, label: "" },
      { id: "e2", from: { node: "n2", port: "out" }, to: { node: "n3", port: "in" }, label: "" },
      { id: "e3", from: { node: "n3", port: "out" }, to: { node: "n4", port: "in" }, label: "" },
    ],
    imageFiles: [
      { id: "img_builtin_rerender_style", fileName: "builtin-rerender-style.jpg", mime: "image/jpeg", src: "builtin-templates/rerender-style.jpg" },
      { id: "img_builtin_rerender_product", fileName: "builtin-rerender-product.png", mime: "image/png", src: "builtin-templates/rerender-product.png" },
    ],
  },
  {
    id: "builtin_multi_marker_sketch_v1",
    name: "马克笔草图上色",
    revision: 1,
    nodes: [
      { id: "n1", type: "text", x: -520, y: 740, w: 240, h: 172, text: "将第二张图线稿图完善细节生成效果图，将第一张图仅作为风格和质感参考（不含颜色），适当优化线稿细节，允许细节处适当发散" },
      { id: "n2", type: "text", x: -200, y: 740, w: 240, h: 172, text: "头盔主体用黑色塑料，点缀白色塑料" },
      { id: "n3", type: "image", x: 120, y: 740, w: 240, h: 240, fileName: "builtin-marker-style.png", mime: "image/png", templateImageId: "img_builtin_marker_style", _previewAspect: 1 },
      { id: "n4", type: "image", x: 440, y: 680, w: 240, h: 384, fileName: "builtin-marker-lineart.png", mime: "image/png", templateImageId: "img_builtin_marker_lineart", _previewAspect: 0.625 },
      { id: "n5", type: "ai-image", x: 760, y: 680, w: 240, h: 409, prompt: "将第二张图线稿图完善细节生成效果图，将第一张图仅作为风格和质感参考（不含颜色），适当优化线稿细节，允许细节处适当发散，头盔主体用黑色塑料，点缀白色塑料", _model: "gpt-image-2.5-flare", _resolution: "1k", _size: "1:1", _quality: "medium", _count: 1 },
    ],
    edges: [
      { id: "e1", from: { node: "n1", port: "out" }, to: { node: "n2", port: "in" }, label: "" },
      { id: "e2", from: { node: "n2", port: "out" }, to: { node: "n3", port: "in" }, label: "" },
      { id: "e3", from: { node: "n3", port: "out" }, to: { node: "n4", port: "in" }, label: "" },
      { id: "e4", from: { node: "n4", port: "out" }, to: { node: "n5", port: "in" }, label: "" },
    ],
    imageFiles: [
      { id: "img_builtin_marker_style", fileName: "builtin-marker-style.png", mime: "image/png", src: "builtin-templates/builtin-marker-style.png" },
      { id: "img_builtin_marker_lineart", fileName: "builtin-marker-lineart.png", mime: "image/png", src: "builtin-templates/builtin-marker-lineart.png" },
    ],
  },
];

// UI language is stored separately from project data so switching projects never
// changes the application language. New UI nodes are translated automatically.
const UI_EN = {
  "调整界面语言、画布与工作流体验": "Tune the interface, canvas, and workflow experience",
  "CanvasFlow — Visual AI Image Workflow": "CanvasFlow — Visual AI Image Workflow",
  "拓展": "Extensions", "拓展节点": "Extension Node", "扩展服务": "Extension Service",
  "导出方式": "Export Mode", "导出时打包成 ZIP 下载（关闭则逐个文件保存到导出文件夹）": "Pack exports into a ZIP download (off = save files individually to the export folder)",
  "生成图片保存": "Generated Image Saving", "以项目名称创建文件夹导出（生成图片保存到 ai_generated\\项目名\\ 子文件夹）": "Create a per-project export folder (generated images are saved to ai_generated\\<project name>\\)",
  "服务地址": "Service URL", "刷新拓展": "Refresh Extensions", "拓展列表": "Extension List",
  "执行": "Run", "运行中…": "Running…",
  "拓展文件夹里的工具会自动接入画布，作为拓展节点使用。": "Tools in the extensions folder automatically appear as canvas nodes.",
  "桌面版已内置拓展服务，刷新按钮会重新检索拓展文件夹；仅服务器运行模式需要手动双击拓展文件夹里的 扩展服务.bat。": "The desktop app has a built-in extension service; Refresh rescans the extensions folder. Only server mode needs 扩展服务.bat started manually.",
  "拖动可排序，顺序即画布右键“拓展”菜单的顺序；关闭开关的拓展不会出现在右键菜单。": "Drag to reorder — the order applies to the canvas right-click Extensions menu; disabled extensions are hidden from the menu.",
  "软件更新": "Software Updates", "检查更新": "Check for Updates",
  "界面更新可直接下载、校验并切换；宿主程序变化时使用完整安装包。": "Interface updates can be downloaded, verified, and switched directly. Use the full installer for host changes.",
  "立即热更新": "Update Now", "下载完整安装包": "Download Full Installer",
  "当前版本：正在读取…": "Current version: loading…", "下载 Windows 新版本": "Download New Windows Version",
  "v2.7.3 更新说明": "v2.7.3 Release Notes",
  "新增交互·增加节点：长按节点，放置到连线上，松手接入连线": "New gestures · Add a node: hold a node, place it onto a connection, release to insert it into the line",
  "新增交互·删减节点：长按节点不动，松手隔离该节点（前后连线自动接通）": "New gestures · Remove a node: hold a node without moving it, release to isolate it (its upstream and downstream connections are rejoined)",
  "新增「以项目名称创建文件夹导出」开关，生成图片自动按项目名归档保存": "New \"export into per-project folders\" toggle — generated images are archived automatically under a folder named after the project",
  "AI 绘图设置新增默认分辨率、默认比例，并与默认模型一起移到 API 设置下方": "AI image settings add default resolution and aspect ratio, moved together with the default model below the API settings",
  "任务运行中可直接新建、切换项目，完成后结果自动落回原项目": "Create and switch projects while tasks are running; finished results are delivered back to their own project",
  "任务队列显示任务所属项目": "The task queue now shows which project each task belongs to",
  "v2.7.1 更新说明": "v2.7.1 Release Notes",
  "新增 AGToken（agtoken.vip）API 支持，没有网络加速器也不影响注册会员": "Added AGToken (agtoken.vip) API support — register and use it without a network accelerator",
  "修复有时点击 AI 生图没反应的问题": "Fixed AI image generation sometimes not responding to clicks",
  "同一个节点接多条线时，将被视为多个任务分别生成": "A node connected to multiple lines is now treated as separate generation tasks",
  "新交互：按住 Alt 画线可切断连线；同时和两条线相交，会把这个节点隔离出去": "New gesture: hold Alt and draw to cut connections; crossing two lines isolates the node between them",
  "模型设置支持自定义默认 AI 生图模型": "Model settings now include a default AI image model",
  "优化整理节点体验，防止整理后失焦": "Improved node tidying to prevent losing focus afterwards",
  "新增自定义组件：多个节点可作为模板保存复用": "New Custom Components: save multiple nodes as reusable templates",
  "APIMart 新增 Nano Banana Pro 模型": "Added the Nano Banana Pro model on APIMart",
  "角度变化": "Angle Change", "添加角度变化节点": "Add Angle Change Node",
  "截图功能节点": "Screenshot Input Node", "添加截图功能节点": "Add Screenshot Input Node", "使用画布节点输入": "Use Canvas Node Input",
  "AI对话": "AI Chat", "添加对话节点": "Add Chat Node", "清空对话记忆": "Clear chat memory", "停止生成": "Stop generating", "对话模型": "Chat model",
  "发送消息": "Send message", "批量": "Batch", "复制消息": "Copy message", "拆成文字节点": "Split into text nodes", "重新生成": "Regenerate", "清空对话": "Clear chat",
  "批量提示词：要求 AI 按 a. b. 序号输出；收到回复后可手动拆成文字节点": "Batch prompts: ask AI for a. b. numbered items, then split the reply manually",
  "浏览器生图": "Browser Image", "添加浏览器生图节点": "Add Browser Image Node", "自定义站点…": "Custom site…", "站点网址": "Site URL", "取消等待": "Cancel waiting", "清除结果": "Clear result",
  "右键菜单节点": "Context Menu Nodes", "关闭后只隐藏画布右键菜单中的新建入口，已有节点不受影响。": "Turning an item off only hides its create entry in the canvas context menu. Existing nodes are unaffected.",
  "显示浏览器生图节点": "Show Browser Image Node", "显示 AI 视频节点": "Show AI Video Node", "显示截图功能节点": "Show Screenshot Input Node",
  "按换行拆分为文字节点": "Split into text nodes by line", "已合并文案（Ctrl+Z 可撤销）": "Text merged (Ctrl+Z to undo)", "已按换行拆分为文字节点": "Split into text nodes by line",
  "输入内容，Enter 发送；Shift+Enter 换行": "Type here. Enter to send; Shift+Enter for a new line",
  "反转左右关键词": "Reverse left/right prompt directions", "仅交换自动关键词中的左、右，不镜像图片": "Only swaps left and right in the automatic prompt; the image is not mirrored",
  "单击切换项目，双击重命名": "Click to switch projects; double-click to rename",
  "未命名项目": "Untitled Project", "未命名": "Untitled", "项目1": "Project 1",
  "新建项目": "New Project", "保存JSON": "Save JSON", "加载JSON": "Load JSON", "导入JSON": "Import JSON", "保存项目": "Save Project", "打开项目": "Open Project",
  "选择项目模式": "Choose Project Mode", "项目创建后将固定使用所选模式，避免 AI 工作流和关系图数据混在一起。": "The selected mode is fixed for this project so AI workflows and relationship maps stay separate.",
  "AI 绘图画板": "AI Image Canvas", "组合文字、参考图和 AI 绘图节点": "Combine text, reference images, and AI image nodes",
  "思维导图 / 关系图": "Mind Map / Relationship Map", "整理文字、图片、文件夹和编组关系": "Organize text, images, folders, groups, and their relationships",
  "一键连接": "Connect All", "批量执行": "Batch Run", "导出": "Export",
  "皮肤切换": "Switch Theme", "设置": "Settings", "准备导出": "Preparing export",
  "取消所有任务": "Cancel all tasks", "取消全部": "Cancel All",
  "居中显示所有节点": "Center all nodes", "居中显示": "Center View",
  "输入文字后回车创建文字节点；上传图片可创建图片节点": "Type text and press Enter to create a text node; upload images to create image nodes",
  "上传图片": "Upload Image", "创建节点": "Create Node", "创建": "Create", "关闭": "Close",
  "画布": "Canvas", "AI绘图": "AI Image", "快捷键": "Shortcuts", "界面语言": "Interface Language",
  "网格对齐距离": "Grid spacing", "开启网格吸附": "Enable grid snapping", "平滑连线": "Smooth edges",
  "创建节点或连线时自动对齐": "Auto-align when creating nodes or edges", "隐藏节点名称": "Hide node titles",
  "图片重叠时打开图片编辑": "Open image editor when images overlap",
  "ZIP 压缩包导出（兼容性最好，推荐）": "Export as ZIP (best compatibility, recommended)",
  "导出文件夹": "Export folder", "export（项目文件夹）": "export (project folder)",
  "复制路径": "Copy Path", "查看导出文件": "View Exported Files",
  "完整路径可直接选择或复制；打开和设置文件夹使用相同的 Windows 授权方式。": "Select or copy the full path directly. Opening and choosing folders use the same Windows permission flow.",
  "完整路径可直接选择或复制；如果杀毒软件误判，请复制路径打开。": "Select or copy the full path directly. If antivirus software blocks the action by mistake, copy the path and open it manually.",
  "默认显示程序所在目录的完整路径；如需更改，请直接粘贴新的完整路径。": "The full path under the app folder is shown by default. Paste a new full path here if you need to change it.",
  "选择文件夹后会保存完整路径；若手动填写，请输入完整路径。": "The full path is saved after choosing a folder. Enter a full path when editing manually.",
  "⚠ 由于浏览器安全限制，无法直接写入系统盘（C 盘）。请将导出文件夹设置在 D 盘或其他非系统盘，否则可能导致导出失败。": "⚠ Due to browser security restrictions, the system drive (C:) cannot be written directly. Choose D: or another non-system drive to avoid export failures.",
  "自定义素材": "Custom Assets", "添加常用图片作为素材，右键画布空白处可快速插入对应图片节点。": "Add frequently used images as assets, then right-click an empty area of the canvas to insert them quickly.",
  "素材名称（如：男模特）": "Asset name (e.g. male model)", "选择图片": "Choose Image", "添加": "Add",
  "输入你的 API Key": "Enter your API Key", "验证 API Key 是否有效": "Verify API Key",
  "验证": "Verify", "保存 API Key": "Save API Key", "保存": "Save",
  "清除所有已保存的 API Key（分享前使用）": "Clear all saved API keys (before sharing)", "清除": "Clear",
  "API 代理：api.apib.ai / api.aiuxu.com / api.aishuch.com / api.apimart.ai（自动故障转移）": "API proxies: api.apib.ai / api.aiuxu.com / api.aishuch.com / api.apimart.ai (automatic failover)",
  "令牌余额：--": "Token balance: --", "刷新令牌余额": "Refresh token balance", "刷新": "Refresh",
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
  "裁剪": "Crop", "应用裁剪": "Apply crop", "拖框选择需要保留的区域": "Drag to select the area to keep", "拖框选择保留区域，再点击应用裁剪": "Drag to select the area to keep, then apply the crop", "置入": "Insert", "返回": "Back", "画笔": "Brush", "橡皮擦": "Eraser", "箭头": "Arrow", "方框": "Box", "绘制工具": "Drawing tools", "置入图片": "Insert image", "从画布置入": "Insert from canvas", "左右镜像": "Flip horizontal", "上下镜像": "Flip vertical", "编辑图片": "Edit image", "绘制、置入或镜像图片": "Paint, insert, or flip images", "松开置入 · 移开取消": "Release to insert · Move away to cancel",
  "填色": "Fill", "填色：点击区域填入颜色，可跨过草图细线": "Fill: click a region to fill it; thin sketch lines can be crossed", "容差": "Tolerance", "忽略细线": "Ignore thin lines", "保留线稿": "Keep line art",
  "颜色差异在此范围内的相邻像素视为同一区域": "Neighboring pixels within this color difference count as the same region", "区域内不超过此宽度的线条（排线、辅助线）会被一并填满；更粗的深色实线作为边界": "Lines inside the region no wider than this (hatching, guide lines) are filled over too; thicker dark strokes act as boundaries", "覆盖原色时保留深色线稿；关闭则以实色覆盖填色区域（对全部填色生效）": "Replace the original color while preserving dark line art. Turn off for solid fill (applies to all fills).",
  "点击要填色的区域；拖动容差或忽略细线可实时调整本次填色": "Click the region to fill; drag Tolerance or Ignore thin lines to adjust this fill live",
  "将选中节点设为多任务": "Create a multi-task node from selected nodes", "右键多任务节点": "Right-click a multi-task node",
  "取消多任务，还原内部节点和连线": "Dissolve multi-task and restore contained nodes and edges", "Shift + 点击": "Shift + Click",
  "Alt + 拖拽": "Alt + Drag", "划线切断连线；同时划中两条连线时自动桥接两端节点": "Draw a line to cut a connection; crossing two at once bridges their endpoints",
  "多选节点": "Select multiple nodes", "Space + 拖拽": "Space + Drag", "平移画布": "Pan canvas",
  "鼠标滚轮": "Mouse Wheel", "缩放画布": "Zoom canvas", "颜色": "Color", "大小": "Size",
  "取消": "Cancel", "确认并生成节点": "Confirm & Create Node", "在图片上绘制色块": "Paint color blocks on image",
  "画色块": "Paint", "上一张": "Previous", "下一张": "Next", "执行 AI 绘图": "Run AI Image Generation",
  "全部执行": "Run All", "重命名": "Rename", "删除素材": "Delete Asset", "重命名素材": "Rename Asset",
  "已撤回删除": "Deletion restored", "已撤销": "Undone", "已重做": "Redone", "素材已重命名": "Asset renamed",
  "素材已删除": "Asset deleted", "请输入素材名称": "Enter an asset name", "请选择图片文件": "Choose an image file",
  "素材已添加": "Asset added", "正在导出": "Exporting", "完成": "Done", "失败": "Failed", "已取消": "Cancelled",
  "生成中": "Generating", "等待中": "Waiting", "请输入文字内容": "Enter text", "至少选中 2 个节点才能创建多任务": "Select at least 2 nodes to create a multi-task",
  "不是多任务节点": "This is not a multi-task node", "该多任务节点无可取消的内容": "This multi-task has no content to dissolve",
  "已取消多任务": "Multi-task dissolved", "不能连接到自己": "A node cannot connect to itself", "这两个端口已经连接": "These ports are already connected",
  "等待提示词...": "Waiting for a prompt...", "重新生成": "Regenerate", "连接文字节点作为提示词": "Connect a text node as the prompt",
  "生成": "Generate", "需要提示词或参考图": "A prompt or reference image is required", "提交失败": "Submission failed",
  "未获取到任务ID": "No task ID received", "查询失败": "Query failed", "任务完成但无图片结果": "Task completed without an image result",
  "生成失败": "Generation failed", "提交AI生成任务": "Submitting AI generation task", "等待生成结果": "Waiting for generation result",
  "下载生成图片": "Downloading generated image", "AI生成完成": "AI generation complete", "AI绘图完成": "AI image generation complete",
  "正在提交任务": "Submitting task", "正在提交": "Submitting", "正在生成": "Generating", "正在下载": "Downloading", "正在下载结果": "Downloading result", "生成完成": "Generation complete", "提交中": "Submitting", "下载中": "Downloading",
  "已取消剩余任务": "Remaining tasks cancelled", "批量生成失败": "Batch generation failed", "已创建 AI 绘图节点": "AI image node created",
  "该节点已有输出节点": "This node already has an output node", "已添加输出节点": "Output node added",
  "请先在设置中填入 API Key": "Enter an API Key in Settings first", "删除项目": "Delete Project",
  "文字节点": "Text Node", "图片节点": "Image Node", "多任务节点": "Multi-task Node", "输入端口": "Input port", "输出端口": "Output port",
  "图片文件夹": "Image Folder", "编组": "Group", "双击进入编组": "Double-click to enter group", "进入编组": "Enter Group", "创建编组": "Create Group", "重命名编组": "Rename Group", "解散编组": "Dissolve Group",
  "添加图片文件夹": "Add Image Folder", "编辑连线名称": "Edit Connection Label", "删除连线": "Delete Connection", "保存项目 JSON": "Save Project JSON", "复制或剪切选中节点": "Copy or cut selected nodes", "将选中节点创建为编组或多任务": "Create a group or multi-task from selected nodes",
  "图片将以缩略图保存在文件夹节点中，适合在画布上快速浏览和整理。": "Images are stored as thumbnails in a folder node for fast browsing and organization.",
  "拖拽缩放": "Drag to resize", "空多任务": "Empty multi-task", "暂无图片": "No images", "添加图片": "Add Images", "清空": "Clear",
  "无图片": "No image", "上传": "Upload", "图片节点粘贴后为空": "Image node is empty after pasting", "停用": "Disabled", "启用": "Enabled",
  "取消连线": "Remove Connection", "已居中显示": "View centered", "已整理节点": "Nodes arranged", "没有需要添加的节点": "No nodes need to be added", "没有需要连接的节点": "No nodes need to be connected",
  "已生成局部修改图片节点": "Edited image node created", "请输入文字或选择图片": "Enter text or choose an image", "已创建节点": "Node created",
  "已从剪贴板创建图片节点": "Image node created from clipboard", "已从 Photoshop 回传创建图片节点": "Image node created from Photoshop return", "已从剪贴板创建文字节点": "Text node created from clipboard",
  "切换启用/停用": "Toggle Enabled/Disabled", "多任务": "Multi-task", "依次连接": "Connect in Sequence", "取消多任务": "Dissolve Multi-task", "添加输出节点": "Add Output Node",
  "请至少选择 2 个文字、图片或 AI 绘图节点": "Select at least 2 text, image, or AI image nodes", "所选节点已经依次连接": "The selected nodes are already connected in sequence",
  "打开本地文件夹": "Open Local Folder", "断开连接": "Disconnect", "复制": "Copy", "复制节点": "Copy Nodes", "删除节点": "Delete Nodes", "粘贴节点": "Paste Nodes",
  "批量停用": "Disable Selected", "批量启用": "Enable Selected", "批量删除": "Delete Selected", "添加文字节点": "Add Text Node",
  "添加图片节点": "Add Image Node", "添加AI绘图节点": "Add AI Image Node", "添加AI视频节点": "Add AI Video Node", "节点对齐": "Arrange Nodes", "对齐所选节点": "Arrange Selected Nodes",
  "已新建标签页": "New project created", "至少保留一个项目": "At least one project must remain", "已删除项目（Ctrl+Z 可撤回）": "Project deleted (Ctrl+Z to restore)",
  "上传图片文件": "Upload Image Files", "上传图片文件夹": "Upload Image Folder", "文件夹中没有图片文件": "No image files found in the folder",
  "文件夹上传": "Folder Upload", "确认导入图片": "Confirm Image Import", "画布只保存缩略图；执行 AI 时读取本地原图。项目使用期间请勿移动或删除原文件夹。": "Only thumbnails are stored on the canvas. AI tasks read the local originals, so keep the source folder in place while using the project.",
  "确认上传": "Upload", "所选文件夹": "Selected folder",
  "请先输入 API Key": "Enter an API Key first", "API Key 有效": "API Key is valid", "API Key 无效": "API Key is invalid",
  "验证失败，请检查网络": "Verification failed. Check your network connection", "令牌余额：请先填入 API Key": "Token balance: enter an API Key first",
  "令牌余额：查询中...": "Token balance: loading...", "令牌余额：查询失败": "Token balance: query failed", "令牌余额：网络错误": "Token balance: network error", "令牌余额：无限额度": "Token balance: unlimited",
  "API Key 已保存": "API Key saved", "API Key 已从所有页面清除，可安全分享": "API Key cleared from all projects; it is now safe to share",
  "JSON已加载": "JSON loaded", "项目已打开": "Project opened", "JSON已保存到输出文件夹": "JSON saved to the output folder", "JSON已保存到 download 文件夹": "JSON saved to the download folder",
  "JSON已下载（浏览器下载）": "JSON downloaded by the browser", "当前浏览器不支持直接选择文件夹，请使用 Chrome 或 Edge": "This browser cannot select folders directly. Use Chrome or Edge",
  "已选择文件夹": "Folder selected", "已取消选择文件夹": "Folder selection cancelled", "请先设置导出文件夹路径": "Set an export folder path first",
  "无法打开文件夹，请检查路径是否正确": "Could not open the folder. Check the path", "没有可导出的末端节点": "No terminal nodes to export",
  "生成Excel": "Creating Excel file", "没有可导出内容": "Nothing to export", "没有可导出的文字或图片": "No text or images to export",
  "写入文件": "Writing files", "导出完成": "Export complete", "导出失败": "Export failed",
  "导出失败，请检查文件夹权限或内容大小": "Export failed. Check folder permissions or content size",
  "当前项目还没有保存，确定要离开吗？": "This project has not been saved. Are you sure you want to leave?",
  "画布上没有可执行的 AI 绘图节点": "There are no runnable AI image nodes on the canvas", "双击标题栏可最大化窗口": "Double-click the title bar to maximize",
  "无参考图": "No reference image", "(无文字输入)": "(no text input)", "单图": "Single image",
  "自定义文字": "Custom Text", "自定义图片": "Custom Images", "自定义组件": "Custom Components",
  "添加常用图片，或在图片节点上右键收藏。支持项目独立和全局共用。": "Add reusable images or save one from an image node. Assets can be project-only or global.",
  "模板名称（如：产品摄影）": "Template name (e.g. product photography)", "输入需要重复使用的完整文字": "Enter the complete reusable text",
  "边框颜色": "Border color", "添加文字模板": "Add Text Template", "添加图片素材": "Add Image Asset",
  "从 JSON 导入素材": "Import Assets from JSON",
  "导入自定义图文": "Import Custom Text and Images", "来源项目": "Source project", "取消": "Cancel", "导入所选内容": "Import Selected",
  "当前项目": "Current project", "全局": "Global", "刷新当前项目": "Refresh Current Project",
  "保存为自定义文字": "Save as Custom Text", "保存为自定义图片": "Save as Custom Image", "保存为自定义组件": "Save as Custom Component",
  "提取生成所用关键词": "Extract Generation Keywords", "关键词反推": "Reverse Prompt", "反推中…": "Analyzing…",
  "设置分类": "Settings categories", "常规": "General", "素材库": "Asset Library", "导出": "Export",
  "调整画布操作习惯。": "Adjust canvas behavior.", "界面与画布": "Interface & Canvas",
  "保存常用图文和节点组合，所有项目均可使用；创建出的节点是独立副本。": "Save reusable text, images, and node sets for every project; created nodes are independent copies.",
  "导入素材": "Import Assets", "导出素材": "Export Assets", "保存修改": "Save Changes", "注册获取 API Key": "Register for an API Key", "注册获取 API Key ↗": "Register for an API Key ↗",
  "导出": "Export", "管理导出方式和本地文件夹。": "Manage export options and local folders.", "选择项目文件的默认保存位置。": "Choose the default folder for project files.",
  "变量库": "Variable Library", "定义所有项目共用的变量和单选值；写在文字节点里（变量名前后留空格）即可自动变成可切换的下拉选项。": "Define global variables and single-choice values; type a variable name (with spaces around it) inside a text node and it becomes a switchable dropdown.",
  "文字节点识别规则：变量名前后需要有空格（位于文字首尾也可以），如「红色 发色 长发」可识别，「红色发色长发」不识别。": "Recognition rule in text nodes: a variable name needs spaces before and after (text start/end also counts); \"red 发色 hair\" matches, \"红色发色长发\" does not.",
  "＋ 新建变量": "+ New Variable", "变量名": "Variable Name", "可选值（每行一个）": "Choices (one per line)", "保存变量": "Save Variable",
  "变量节点": "Variable Node", "选择变量": "Select variable", "选择值": "Select value", "输出": "Output",
  "＋ 添加一行": "+ Add Row", "请先在设置 → 变量库中创建变量": "Create a variable in Settings → Variable Library first",
  "文字中的变量": "Variables in text", "未选择值": "No value chosen", "清除选择": "Clear selection",
  "项目文件夹": "Project Folder", "修改位置": "Change Folder",
  "从项目导入": "Import from Project", "从 JSON 导入": "Import from JSON", "保存可重复使用的完整多行文字。": "Save reusable complete multi-line text.",
  "保存常用图片，也可从图片节点右键收藏。": "Save reusable images or collect them from an image node.", "在画布中多选节点后右键保存，同时保留节点布局和内部连线。": "Select multiple nodes on the canvas, then right-click to save their layout and internal connections.",
  "＋ 新建文字": "+ New Text", "＋ 新建图片": "+ New Image", "AI 绘图": "AI Image", "自定义节点": "Custom Nodes", "暂无素材": "No assets", "双击放大预览": "Double-click to enlarge", "当前素材预览": "Current asset preview",
  "配置 API 连接与新建节点的默认模型、分辨率和比例；画面参数在每个 AI 绘图节点中单独设置。": "Configure the API connection and the default model, resolution, and aspect ratio for new nodes; set image options separately in each AI Image node.",
  "默认绘图模型": "Default image model",
  "默认分辨率": "Default resolution",
  "默认比例": "Default aspect ratio",
  "本地 SD": "Local SD", "连接本机或局域网 ComfyUI，为画布上的本地 SD 节点配置工作流。": "Connect to a local or LAN ComfyUI and configure workflows for canvas Local SD nodes.",
  "内置工作流": "Built-in Workflows", "一键载入常用工作流，载入时会按本机 ComfyUI 实际存在的模型自动匹配文件名；缺模型时会列出缺失项。": "One-click load of common workflows; model filenames are matched against the models actually present on your ComfyUI, missing models are listed.",
  "图生视频": "Image to Video", "文生视频": "Text to Video", "时长(秒)": "Duration (s)",
  "功能": "Mode", "负面提示词": "Negative Prompt", "Seed": "Seed", "降噪": "Denoise",
  "提示词（留空时使用上游文字）": "Prompt (upstream text used when empty)", "选择重绘区域": "Select Repaint Area", "重新选择区域": "Reselect Area",
  "打开视频所在文件夹": "Open Video Folder", "清除视频": "Clear Video",
  "载入": "Load", "已载入": "Loaded", "一键载入内置工作流": "One-click load built-in workflow", "可一键载入内置工作流": "Built-in workflow available", "工作流库": "Workflow Library", "ComfyUI": "ComfyUI", "尚未测试": "Not tested", "测试连接": "Test Connection", "启动 ComfyUI": "Launch ComfyUI", "导入工作流": "Import Workflow", "尚未导入工作流": "No workflows imported",
  "该项目仍有未完成任务，请等任务完成或先取消再删除": "This project still has unfinished tasks — wait for them to finish or cancel them before deleting",
  "仅影响之后新建的 AI 绘图节点，不会修改已有节点。": "Only affects AI Image nodes created later; existing nodes are unchanged.",
  "文件导出": "File Export", "同时导出输入素材（关键词和参考图）": "Also export inputs (prompts and reference images)",
  "默认只导出 AI 生成结果；输入素材会与生成结果分开放置，不包含项目 JSON。": "By default, export only AI results. Inputs are stored separately and project JSON is never included."
  ,"任务队列": "Task Queue", "AI 任务队列": "AI Task Queue", "暂无任务": "No tasks", "最多同时处理 5 个任务": "Up to 5 tasks run at once", "最多同时处理 5 个任务；仅未发送任务可暂停或调整。": "Up to 5 tasks run at once. Only unsent tasks can be paused or reordered.",
  "清除已完成": "Clear Finished", "还没有 AI 绘图任务": "No AI image tasks yet", "等待发送": "Queued", "已暂停": "Paused",
  "无参考图": "No reference image", "暂停等待任务": "Pause queued task", "继续任务": "Resume task", "向前移动": "Move up", "向后移动": "Move down", "删除等待任务": "Remove queued task",
  "打开生成图片所在文件夹": "Open Generated Image Folder", "复制生成图片路径": "Copy Generated Image Path",
  "帮助与引导": "Help & Tour", "重新查看项目、底部操作区、右上工具和 API Key 设置说明。": "Review the project area, bottom controls, top-right tools, and API Key setup.", "查看新手引导": "View Getting Started Tour",
  "截图工具": "Capture Tool", "截取固定屏幕区域，并使用默认提示词快速发送 AI 绘图任务。": "Capture a fixed screen region and send it to AI with a saved prompt.",
  "打开截图窗口": "Open Capture Window",
  "画布背景": "Canvas Background", "网格线": "Grid Lines", "网格 + 十字焦点": "Grid + Cross Focus", "点状": "Dots"
};

Object.assign(UI_EN, {
  "外观": "Appearance",
  "MCP 连接": "MCP Connection",
  "让支持 MCP 的 AI 工具连接 CanvasFlow；真实绘图仍需单独确认。": "Connect any MCP-capable AI tool to CanvasFlow. Actual image generation still requires separate confirmation.",
  "CanvasFlow MCP 服务": "CanvasFlow MCP Service",
  "提供 stdio MCP 服务，可供不同 AI 客户端连接。": "Provides a stdio MCP service that different AI clients can connect to.",
  "检查中": "Checking",
  "正在检查 MCP 服务文件与客户端连接…": "Checking MCP service files and client connections…",
  "连接到 Codex": "Connect to Codex",
  "从 Codex 移除": "Remove from Codex",
  "打开所在文件夹": "Open Folder",
  "刷新状态": "Refresh Status",
  "Codex 按钮只是快捷连接；其他支持 stdio MCP 的工具可使用下方启动命令。连接操作不会删除项目、API Key 或图片。": "The Codex buttons are only shortcuts. Other stdio MCP clients can use the launch command below. Connecting does not delete projects, API keys, or images.",
  "通用 MCP 连接信息": "Generic MCP Connection",
  "传输方式为 stdio。把下面的启动命令填入当前 AI 工具的 MCP 服务器配置。": "Transport is stdio. Add the launch command below to the MCP server settings of your current AI tool.",
  "CanvasFlow MCP stdio 启动命令": "CanvasFlow MCP stdio launch command",
  "复制启动命令": "Copy Launch Command",
  "简体中文": "简体中文",
  "文字节点重叠时合并文案": "Merge text when text nodes overlap",
  "Photoshop 互传": "Photoshop Integration",
  "安装面板后，可在 CanvasFlow 与 Photoshop 间互传图片。": "Install the panel to transfer images between CanvasFlow and Photoshop.",
  "Photoshop 路径": "Photoshop Path",
  "选择路径": "Choose Path",
  "安装 / 更新面板": "Install / Update Panel",
  "Photoshop 主程序路径（photoshop.exe）": "Photoshop executable path (photoshop.exe)",
  "浏览选择…": "Browse…",
  "安装 / 更新 PS 面板": "Install / Update PS Panel",
  "移除面板": "Remove Panel",
  "切换深色或浅色主题，自定义界面颜色，按当前主题（暗色/浅色）分别保存，实时生效。": "Switch between dark and light themes and customize interface colors. Colors are saved separately for each theme and applied immediately.",
  "主题": "Theme",
  "深色主题": "Dark theme",
  "界面颜色": "Interface Colors",
  "画布背景样式": "Canvas background style",
  "画布底色": "Canvas color",
  "默认": "Default",
  "面板底色": "Panel color",
  "节点内控件": "Node controls",
  "主按钮": "Primary button",
  "全部恢复默认": "Reset All to Defaults",
  "API 类型": "API type",
  "APIMart（内置代理）": "APIMart (built-in proxy)",
  "AGToken（agtoken.vip · 同步直连）": "AGToken (agtoken.vip · synchronous connection)",
  "接口地址：https://agtoken.vip（OpenAI 兼容，同步返回结果）": "API URL: https://agtoken.vip (OpenAI compatible, synchronous results)",
  "API Key 与 APIMart 相互独立，切换类型后请分别填写。": "This API key is separate from APIMart. Enter a key for each provider.",
  "API 地址（Base URL）": "API Base URL",
  "自定义请求头（每行一条，格式：名称: 值）": "Custom headers (one per line: Name: Value)",
  "会自动携带 Authorization: Bearer <API Key>；此处可追加或覆盖其他请求头。": "Authorization: Bearer <API Key> is included automatically. Add or override other headers here.",
  "GPT Image 2.5 Flare（快速）": "GPT Image 2.5 Flare (fast)",
  "GPT Image 2.5 Sunburst（质量）": "GPT Image 2.5 Sunburst (quality)",
  "Nano Banana Pro（官方）": "Nano Banana Pro (official)",
  "GPT-5.2 Chat（多模态·APIMart）": "GPT-5.2 Chat (multimodal · APIMart)",
  "保存位置": "Save location",
  "projects（项目文件夹）": "projects (project folder)",
  "打开文件夹": "Open Folder",
  "应用": "Apply",
  "保存项目 .cflow": "Save Project .cflow",
  "跳过": "Skip",
  "项目入口": "Projects",
  "需要设置 API Key 后才能正常使用 AI 绘图功能。": "Set an API key to use AI image generation.",
  "上一步": "Previous",
  "下一步": "Next",
  "项目工具": "Project tools",
  "编组导航": "Group navigation",
  "返回上一级": "Back to parent",
  "画布缩略图": "Canvas overview",
  "工作流工具": "Workflow tools",
  "例如：产品": "e.g. product",
  "检测中…": "Checking…",
  "打开拓展文件夹": "Open Extensions Folder",
  "刷新拓展（重新检索拓展文件夹）": "Refresh extensions (rescan the extensions folder)",
  "例如 C:\\Program Files\\Adobe\\Adobe Photoshop 2024\\photoshop.exe": "e.g. C:\\Program Files\\Adobe\\Adobe Photoshop 2024\\photoshop.exe",
  "快捷色板": "Color presets",
  "例如 https://api.example.com": "e.g. https://api.example.com",
  "镜像图片": "Flip image",
  "左右镜像当前图片": "Flip current image horizontally",
  "上下镜像当前图片": "Flip current image vertically",
  "图片编辑": "Image Editor",
  "手动分区抠图": "Manual Region Cutout",
  "分区抠图": "Region Cutout",
  "关闭手动抠图": "Close manual cutout",
  "原图上拖动添加选框，选择选框后放大修整": "Drag on the original to add regions; select a region and zoom in to refine it",
  "图片选框和蒙版编辑区": "Image regions and mask editor",
  "选区列表": "Region list",
  "原图与选框": "Original & Regions",
  "添加选框": "Add Region",
  "恢复画笔": "Restore Brush",
  "擦除画笔": "Erase Brush",
  "笔刷": "Brush",
  "笔刷大小": "Brush size",
  "缩放": "Zoom",
  "预览缩放": "Preview zoom",
  "适合窗口": "Fit to Window",
  "确认": "Confirm",
  "原图": "Original",
  "正在将选区加入抠图队列，请稍候…": "Adding regions to the cutout queue…",
  "确认分区抠图": "Confirm Region Cutout",
  "将使用 GPT Image 2.5 进行抠图，每个选区生成一张图片。": "GPT Image 2.5 will cut out each region, producing one image per region.",
  "生成张数": "Image count",
  "使用模型": "Model",
  "使用 API": "API provider",
  "提示词": "Prompt",
  "将图片中主体抠出、透明背景": "Cut out the subject with a transparent background",
  "返回调整": "Back to Editing",
  "开始抠图": "Start Cutout",
  "拖动添加选框，可与已有选框重叠；右侧选择选框进入局部编辑。": "Drag to add regions, including overlapping regions. Select a region on the right to edit it.",
  "拖动绘制选框；点击右侧选框或彩色框进入局部编辑。": "Drag to draw a region. Click a region on the right or a colored box to edit it.",
  "自定义素材名称": "Custom asset name",
  "自定义组件名称": "Custom component name",
  "编组名称": "Group name",
  "编组": "Group",
  "连线名称（留空表示不显示）": "Connection label (leave blank to hide)",
  "多节点模板": "Multi-node template",
  "该节点没有可用图片": "This node has no available image",
  "原图片节点已被删除": "The original image node has been deleted",
  "该图片已有等待或运行中的任务，请完成后再提交": "This image has queued or running tasks. Wait for them to finish before submitting.",
  "当前 API 不支持 GPT Image 2.5": "The current API does not support GPT Image 2.5",
  "发生未知错误，请重试": "An unknown error occurred. Try again.",
  "已创建节点": "Node created",
  "已从剪贴板创建图片节点": "Image node created from clipboard",
  "已从剪贴板创建文字节点": "Text node created from clipboard",
  "已替换图片节点": "Image node replaced",
  "已新建思维导图项目": "Mind map project created",
  "已新建 AI 绘图项目": "AI image project created",
  "项目已保存": "Project saved",
  "已取消剩余任务": "Remaining tasks cancelled",
  "没有可导出的 AI 生成结果": "No AI-generated results to export",
  "请先在设置中填入 API Key": "Enter an API key in Settings first",
  "没有可加入队列的 AI 绘图任务": "No AI image tasks to queue",
  "Photoshop 路径已保存": "Photoshop path saved",
  "已选择并保存 Photoshop 路径": "Photoshop path selected and saved",
  "暂时无法验证，不代表 API Key 无效，请稍后重试": "Verification is temporarily unavailable. Your API key may still be valid; try again later."
});

Object.assign(UI_EN, {
  "还没有变量，请创建一个全局变量。": "No variables yet. Create a global variable.",
  "没有可导入的图文、多个节点或变量": "No text, images, node sets, or variables to import",
  "拓展信息缺失，请删除后从右键菜单重新添加。": "Extension information is missing. Delete this node and add it again from the context menu.",
  "未检测到扩展服务": "Extension service not detected",
  "拓展文件夹中没有可用拓展": "No extensions available in the extensions folder",
  "生成中...": "Generating...",
  "结果已生成，下载失败": "Result generated, but download failed",
  "连接图片节点使用": "Connect an image node to use this",
  "编辑角度": "Edit Angle",
  "拖动预览调整视角，滚轮缩放": "Drag the preview to adjust the angle; scroll to zoom",
  "原始参考图": "Original reference image",
  "三维视角预览": "3D Angle Preview",
  "拖动调整 X / Y · 滚轮缩放": "Drag to adjust X / Y · Scroll to zoom",
  "恢复默认": "Reset to Defaults",
  "确认角度": "Confirm Angle",
  "普通参考图": "Reference image",
  "批量图片": "Batch images",
  "无法读取": "Unable to read",
  "单图生成": "Single image generation",
  "最终任务": "Final tasks",
  "请先填写 API Key": "Enter an API key first",
  "未生成——连接上游文字/图片，或直接在上方输入提示词": "No result yet — connect upstream text/images or enter a prompt above",
  "站点": "Site",
  "每次创建新对话": "Start a new conversation each time",
  "添加一行": "Add Row",
  "生成数量": "Image count",
  "暂无可选值": "No choices available",
  "附件": "Attach",
  "发送后保留": "Kept after sending",
  "不支持图片": "Images unsupported",
  "添加图片附件": "Add image attachments",
  "已添加的图片附件": "Attached images",
  "清空图片附件": "Clear image attachments",
  "当前模型不支持图片": "The current model does not support images",
  "当前模型不支持图片，请切换到多模态模型或移除附件": "The current model does not support images. Switch to a multimodal model or remove the attachments.",
  "当前模型不支持图片，请切换到多模态模型或输入文字": "The current model does not support images. Switch to a multimodal model or enter text.",
  "需要输入内容，或添加/连接图片": "Enter text, attach an image, or connect an image node",
  "请分析这些图片": "Please analyze these images"
});

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
    [/^删除变量“(.+)”？已有节点会保留快照并标记为失效。$/, 'Delete variable "$1"? Existing nodes will retain a snapshot and be marked invalid.'],
    [/^多节点模板 (\d+)$/, "Multi-node template $1"],
    [/^编辑选框 (\d+)$/, "Edit region $1"], [/^取消选框 (\d+)$/, "Remove region $1"], [/^选框 (\d+)$/, "Region $1"],
    [/^(\d+) 张（(\d+) 个选区）$/, "$1 images ($2 regions)"],
    [/^分区抠图 · 选框 (\d+)$/, "Region cutout · Region $1"],
    [/^选框 (\d+) · (\d+) × (\d+) · 恢复画笔补回原图，擦除画笔移除像素；放大后用滚动条移动视野$/, "Region $1 · $2 × $3 · Restore original pixels or erase them; use scrollbars to pan when zoomed in"],
    [/^(.+) 当前 API：(.+)，已选 (\d+) 个区域。$/, (_, instruction, api, count) => `${translateEnglishString(instruction)} API: ${api}, ${count} regions selected.`],
    [/^无法提交：(.*)$/, (_, message) => `Unable to submit: ${translateEnglishString(message)}`],
    [/^分区抠图打开失败：(.*)$/, (_, message) => `Could not open region cutout: ${translateEnglishString(message)}`],
    [/^项目(\d+)$/, "Project $1"], [/^已新增 (\d+) 个项目$/, "Added $1 projects"], [/^AI绘图 #(\d+)$/, "AI Image #$1"], [/^输出节点 (\d+)$/, "Output Node $1"],
    [/^编组 (\d+)$/, "Group $1"], [/^(\d+) 个节点 · 双击进入$/, "$1 nodes · Double-click to enter"],
    [/^已创建编组，包含 (\d+) 个节点$/, "Created a group containing $1 nodes"], [/^已创建文件夹节点，包含 (\d+) 张图片$/, "Created an image folder containing $1 images"],
    [/^已依次连接 (\d+) 个节点并添加 1 个 AI 绘图节点$/, "Connected $1 nodes in sequence and added 1 AI image node"],
    [/^已依次连接 (\d+) 个节点$/, "Connected $1 nodes in sequence"],
    [/^图片(\d+)$/, "Image $1"], [/^(\d+) 张图片$/, "$1 images"], [/^已创建多任务 (\d+) 个节点$/, "Created a multi-task with $1 nodes"],
    [/^已复制 (\d+) 个节点$/, "Copied $1 nodes"], [/^已粘贴 (\d+) 个节点$/, "Pasted $1 nodes"],
    [/^已添加 (\d+) 个 AI 绘图节点$/, "Added $1 AI image nodes"], [/^已选择图片：(.+)$/, "Selected image: $1"],
    [/^已导入 (\d+) 张图片$/, "Imported $1 images"], [/^已创建多任务节点，包含 (\d+) 张图片$/, "Created a multi-task containing $1 images"],
    [/^(\d+) 张图片已生成$/, "$1 images generated"], [/^批量生成 (\d+)\/(\d+)$/, "Batch generation $1/$2"],
    [/^拆分生成 (\d+)\/(\d+)$/, "Split generation $1/$2"], [/^AI生成中 (\d+)%$/, "AI generating $1%"],
    [/^等待中 · 已完成 (\d+)\/(\d+)$/, "Waiting · $1/$2 completed"], [/^正在提交 · 已完成 (\d+)\/(\d+)$/, "Submitting · $1/$2 completed"],
    [/^正在生成 · 已完成 (\d+)\/(\d+)$/, "Generating · $1/$2 completed"], [/^正在下载 · 已完成 (\d+)\/(\d+)$/, "Downloading · $1/$2 completed"],
    [/^已完成 (\d+)\/(\d+)$/, "$1/$2 completed"], [/^完成 (\d+)\/(\d+)，失败 (\d+)$/, "$1/$2 completed, $3 failed"], [/^已取消，完成 (\d+)\/(\d+)$/, "Cancelled, $1/$2 completed"],
    [/^收集输出 (\d+)\/(\d+)$/, "Collecting output $1/$2"], [/^写入文件 (\d+)\/(\d+)$/, "Writing files $1/$2"],
    [/^任务(\d+)$/, "Task $1"], [/^共 (\d+) 个任务（(\d+) 个节点）· 双击标题放大$/, "$1 tasks ($2 nodes) · Double-click the title to maximize"],
    [/^令牌余额：([\d.]+)（已用 ([\d.]+)）$/, "Token balance: $1 ($2 used)"], [/^已打开文件夹: (.+)$/, "Opened folder: $1"],
    [/^已导出到 (.+)$/, "Exported to $1"], [/^保存失败: (.*)$/, "Save failed: $1"], [/^AI 生成失败: (.*)$/, "AI generation failed: $1"], [/^填色失败：(.*)$/, "Fill failed: $1"],
    [/^API 返回异常状态 (.+)$/, "Unexpected API status: $1"],
    [/^自定义文字：(.+)$/, "Custom Text: $1"], [/^自定义图片：(.+)$/, "Custom Image: $1"],
    [/^其他项目仍有 (\d+) 个任务运行中，完成后结果会自动落回原项目$/, "$1 task(s) still running in other projects — results will be delivered back to their projects when done"],
    [/^确定删除项目“(.+)”吗？删除后可按 Ctrl\+Z 撤回。$/, 'Delete project "$1"? You can press Ctrl+Z to restore it afterwards.'],
  [/^结果已落回项目「(.+)」$/, "Results delivered back to project \"$1\""],
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
    for (const attr of ["title", "placeholder", "aria-label", "alt"]) {
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
  document.querySelectorAll("[data-ui-language]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.uiLanguage === uiLanguage));
  });
  translateUiTree(document.documentElement);
}

const state = {
  pages: [],
  groups: [],
  activePageId: "",
  nodes: [],
  edges: [],
  annotations: [],
  selectedAnnotationId: "",
  selected: new Set(),
  // 画布节点编组：成员节点带 canvasGroupId，外框按成员范围拟合后缓存在这里
  canvasGroupFrames: {},
  selectedCanvasGroupId: "",
  view: { x: 120, y: 90, scale: 1 },
  settings: { gridSize: 40, snap: true, smoothEdges: true, autoAlign: true, hideNodeTitles: false, editOnOverlap: true, textMergeOnOverlap: true, showBrowserNodeMenu: true, showVideoNodeMenu: true, showLocalSdNodeMenu: true, showScreenshotNodeMenu: true, canvasBackground: "grid", theme: "dark", exportFolderLabel: "", projectFolderLabel: "", apiKey: "", agtokenApiKey: "", apiType: "agtoken", customApiBaseUrl: "", customApiHeaders: "", chatDisabledModels: [], chatCustomSites: [], chatCustomKeys: {}, chatSiteModels: {}, chatSiteModelsFetched: {}, defaultImageModel: "gpt-image-2.5-flare", defaultResolution: "1k", defaultSize: "1:1", zipExport: false, exportInputs: false, projectExportFolder: false, customMaterials: [], uiColors: {} },
  customLibrary: { textTemplates: [], imageMaterials: [], multiNodeTemplates: [], variableDefinitions: [] },
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
let onboardingSeenVersion = 0;

let globalLibrary = loadGlobalLibrary();
let editorPaletteId = "";
const paletteWidgets = new Map();
const paletteDragType = "application/x-canvasflow-palette-color";
let pendingLibraryImport = null;
let editingTextTemplate = null;
let editingVariableDefinitionId = "";
let editingImageTemplate = null;
let pendingCustomImage = null;
let librarySaveQueue = Promise.resolve();
let pendingFolderImport = null;
let desktopAssetMigrationTimer = null;
let desktopAssetMigrationPromise = null;
let desktopAssetMigrationQueued = false;
const AI_QUEUE_MAX_CONCURRENT = 5;
// 远程 AI 与本地 BiRefNet 分开计数：本地任务不占用远程并发名额，
// 但本地拓展仍固定串行，避免多个任务同时清理同一 input/output 目录。
const aiTaskQueue = { items: [], running: 0, localRunning: 0, nextId: 1 };
const aiApiSlots = { active: 0, waiters: [] };

function acquireAiApiSlot(label = "AI任务") {
  return new Promise(resolve => {
    const enter = () => {
      aiApiSlots.active++;
      console.info(`[AI并发] 开始：${label}，服务端进行中 ${aiApiSlots.active}/${AI_QUEUE_MAX_CONCURRENT}`);
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        aiApiSlots.active = Math.max(0, aiApiSlots.active - 1);
        console.info(`[AI并发] 完成：${label}，服务端进行中 ${aiApiSlots.active}/${AI_QUEUE_MAX_CONCURRENT}`);
        aiApiSlots.waiters.shift()?.();
      });
    };
    if (aiApiSlots.active < AI_QUEUE_MAX_CONCURRENT) enter();
    else {
      aiApiSlots.waiters.push(enter);
      console.info(`[AI并发] 等待：${label}，前方 ${aiApiSlots.waiters.length - 1} 个任务`);
    }
  });
}

function emptyLibrary() { return { palettes: [], textTemplates: [], imageMaterials: [], multiNodeTemplates: [], variableDefinitions: [], builtinDefaultsInitialized: true, builtinMultiNodeSeedVersion: BUILTIN_MULTI_NODE_SEED_VERSION, builtinMultiNodeRemovedIds: [] }; }
function normalizeLibrary(lib) {
  const source = lib || {};
  return {
    palettes: Array.isArray(source.palettes) ? source.palettes.filter(item => item?.id && Array.isArray(item.colors)).map(item => ({
      id: String(item.id), name: String(item.name || "未命名调色盘"),
      colors: item.colors.filter(color => /^#[0-9a-f]{6}$/i.test(color?.hex)).map(color => ({
        hex: color.hex.toUpperCase(), share: Number.isFinite(color.share) ? color.share : null,
      })),
    })) : [],
    textTemplates: Array.isArray(source.textTemplates) ? source.textTemplates.filter(item => item?.id !== "builtin_text_local_to_panorama_v1").map(normalizeTemplate) : [],
    imageMaterials: Array.isArray(source.imageMaterials) ? source.imageMaterials.map(normalizeTemplate) : [],
    multiNodeTemplates: Array.isArray(source.multiNodeTemplates) ? source.multiNodeTemplates.map(normalizeMultiNodeTemplate) : [],
    variableDefinitions: Array.isArray(source.variableDefinitions) ? source.variableDefinitions.map(normalizeVariableDefinition) : [],
    // A missing marker means this is an existing pre-marker library. Never append defaults to it.
    builtinDefaultsInitialized: source.builtinDefaultsInitialized !== false,
    builtinMultiNodeSeedVersion: Math.max(0, Number(source.builtinMultiNodeSeedVersion) || 0),
    builtinMultiNodeRemovedIds: Array.isArray(source.builtinMultiNodeRemovedIds) ? source.builtinMultiNodeRemovedIds.map(String) : [],
  };
}
function normalizeVariableDefinition(item) {
  const value = { ...(item || {}) };
  value.id = value.id || uid("var");
  value.name = String(value.name || "未命名变量").trim();
  value.options = Array.isArray(value.options) ? value.options.map(option => ({
    id: option?.id || uid("opt"),
    label: String(option?.label ?? option ?? "").trim(),
  })).filter(option => option.label) : [];
  value.revision = Math.max(1, Number(value.revision) || 1);
  return value;
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
  try {
    const stored = localStorage.getItem(GLOBAL_LIBRARY_KEY);
    return stored === null
      ? { palettes: [], textTemplates: [], imageMaterials: [], multiNodeTemplates: [], variableDefinitions: [], builtinDefaultsInitialized: false, builtinMultiNodeSeedVersion: 0, builtinMultiNodeRemovedIds: [] }
      : normalizeLibrary(JSON.parse(stored));
  }
  catch (e) { console.error("[加载] 全局素材库读取失败", e); return emptyLibrary(); }
}
async function loadGlobalLibraryFromDisk() {
  const browserLibrary = normalizeLibrary(globalLibrary);
  try {
    const resp = await apiFetch("/api/custom-library");
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
    for (const item of browserLibrary.multiNodeTemplates) {
      if (globalLibrary.multiNodeTemplates.some(existing => existing.id === item.id)) continue;
      item.name = uniqueMultiNodeTemplateName(item.name, globalLibrary);
      globalLibrary.multiNodeTemplates.push(item); migrated++;
    }
    for (const item of browserLibrary.variableDefinitions) {
      if (!globalLibrary.variableDefinitions.some(existing => existing.id === item.id)) globalLibrary.variableDefinitions.push(item);
    }
    const shouldInitializeDefaults = globalLibrary.builtinDefaultsInitialized === false
      && browserLibrary.builtinDefaultsInitialized === false
      && !globalLibrary.textTemplates.length
      && !globalLibrary.imageMaterials.length
      && !globalLibrary.multiNodeTemplates.length;
    if (shouldInitializeDefaults) {
      globalLibrary.textTemplates = DEFAULT_TEXT_TEMPLATES.map(item => normalizeTemplate({ ...item }));
      console.log(`[初始化] 已创建 ${globalLibrary.textTemplates.length} 个默认文字素材`);
    }
    // Persist immediately after the first decision, including an intentionally empty library.
    globalLibrary.builtinDefaultsInitialized = true;
    await seedBuiltinMultiNodeTemplates();
    console.log(`[加载] 本地素材库：文字=${globalLibrary.textTemplates.length}，图片=${globalLibrary.imageMaterials.length}，多节点=${globalLibrary.multiNodeTemplates.length}，变量=${globalLibrary.variableDefinitions.length}`);
    if (migrated) console.log(`[迁移] 已从浏览器存储合并 ${migrated} 个素材到本地文件`);
    saveGlobalLibrary();
  } catch (e) {
    console.error("[加载] 本地素材库文件读取失败，继续使用浏览器备份", e);
    toast("本地素材库读取失败：将暂时使用浏览器备份，请检查程序目录写入权限");
  }
}
async function seedBuiltinMultiNodeTemplates() {
  const seedVersion = Math.max(0, Number(globalLibrary.builtinMultiNodeSeedVersion) || 0);
  if (seedVersion >= BUILTIN_MULTI_NODE_SEED_VERSION) return;
  const removedIds = new Set(globalLibrary.builtinMultiNodeRemovedIds || []);
  const pending = DEFAULT_MULTI_NODE_TEMPLATES.filter(template =>
    !globalLibrary.multiNodeTemplates.some(existing => existing.id === template.id) && !removedIds.has(template.id));
  if (pending.length) {
    for (const builtin of pending) {
      const copy = JSON.parse(JSON.stringify(builtin));
      const createdFiles = [];
      try {
        for (const image of copy.imageFiles) {
          const resp = await fetch(image.src, { cache: "no-store" });
          if (!resp.ok) throw new Error(`读取 ${image.src} 失败：HTTP ${resp.status}`);
          const saved = await apiFetch("/api/custom-material", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: image.fileName, data: stripDataUrl(await blobToBase64(await resp.blob())) }),
          });
          const result = await saved.json().catch(() => ({}));
          if (!saved.ok || !result.success || !result.fileName) throw new Error(result.error || `HTTP ${saved.status}`);
          image.fileName = result.fileName;
          delete image.src;
          createdFiles.push(result.fileName);
        }
        globalLibrary.multiNodeTemplates.push(normalizeMultiNodeTemplate(copy));
        console.log(`[内置组件] 已注入自带自定义组件「${copy.name}」`);
      } catch (error) {
        for (const fileName of createdFiles) {
          try { await apiFetch("/api/custom-material", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName }) }); } catch (_) {}
        }
        console.error("[内置组件] 注入失败，将在下次启动重试", builtin.id, error);
        return;
      }
    }
  }
  globalLibrary.builtinMultiNodeSeedVersion = BUILTIN_MULTI_NODE_SEED_VERSION;
  saveGlobalLibrary();
}
function saveGlobalLibrary() {
  try { localStorage.setItem(GLOBAL_LIBRARY_KEY, JSON.stringify(globalLibrary)); }
  catch (e) { console.error("[保存] 全局素材库写入失败", e); toast("全局素材保存失败，可能是浏览器存储空间不足"); }
  const snapshot = JSON.stringify(globalLibrary);
  librarySaveQueue = librarySaveQueue.catch(() => {}).then(async () => {
    const resp = await apiFetch("/api/custom-library", { method: "POST", headers: { "Content-Type": "application/json" }, body: snapshot });
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
  for (const item of projectLibrary.multiNodeTemplates) {
    if (globalLibrary.multiNodeTemplates.some(existing => existing.id === item.id)) continue;
    item.name = uniqueMultiNodeTemplateName(item.name, globalLibrary);
    globalLibrary.multiNodeTemplates.push(item); migrated++;
  }
  if (migrated) { saveGlobalLibrary(); console.log(`[迁移] 已将 ${migrated} 个项目素材合并到全局素材库`); }
}
function libraryItems(kind) {
  const key = kind === "text" ? "textTemplates" : kind === "image" ? "imageMaterials" : "multiNodeTemplates";
  return globalLibrary[key] || [];
}
function findTemplate(kind, id) {
  const key = kind === "text" ? "textTemplates" : kind === "image" ? "imageMaterials" : "multiNodeTemplates";
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
  annotations: $("annotations"),
  gestureStroke: $("gestureStroke"),
  selectionBox: $("selectionBox"),
  contextMenu: $("contextMenu"),
  minimap: $("minimap"),
  settings: $("settingsPanel"),
  gridSize: $("gridSizeInput"),
  canvasBg: $("canvasBgSelect"),
  snap: $("snapToggle"),
  smoothEdges: $("smoothEdgesToggle"),
  autoAlign: $("autoAlignToggle"),
  hideNodeTitles: $("hideNodeTitlesToggle"),
  editOnOverlap: $("editOnOverlapToggle"),
  textMergeOnOverlap: $("textMergeOnOverlapToggle"),
  showBrowserNodeMenu: $("showBrowserNodeMenuToggle"),
  showVideoNodeMenu: $("showVideoNodeMenuToggle"),
  showLocalSdNodeMenu: $("showLocalSdNodeMenuToggle"),
  showScreenshotNodeMenu: $("showScreenshotNodeMenuToggle"),
  projectFolder: $("projectFolderInput"),
  zipExportToggle: $("zipExportToggle"),
  projectExportFolderToggle: $("projectExportFolderToggle"),
  chooseProjectFolderBtn: $("chooseProjectFolderBtn"),
  openProjectFolderBtn: $("openProjectFolderBtn"),
  copyProjectPathBtn: $("copyProjectPathBtn"),
  mcpStatusBadge: $("mcpStatusBadge"),
  mcpStatusText: $("mcpStatusText"),
  mcpLocation: $("mcpLocation"),
  mcpInstallBtn: $("mcpInstallBtn"),
  mcpUninstallBtn: $("mcpUninstallBtn"),
  mcpOpenFolderBtn: $("mcpOpenFolderBtn"),
  mcpRefreshBtn: $("mcpRefreshBtn"),
  mcpLaunchCommand: $("mcpLaunchCommand"),
  mcpCopyLaunchCommandBtn: $("mcpCopyLaunchCommandBtn"),
  mcpApiSiteSelect: $("mcpApiSiteSelect"),
  mcpExtensionSection: $("mcpExtensionSection"),
  browserExtensionOpenFolderBtn: $("browserExtensionOpenFolderBtn"),
  browserExtensionStatus: $("browserExtensionStatus"),
  photoshopExtensionStatus: $("photoshopExtensionStatus"),

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
  folderImportDialog: $("folderImportDialog"),
  folderImportSummary: $("folderImportSummary"),
  folderImportCloseBtn: $("folderImportCloseBtn"),
  folderImportCancelBtn: $("folderImportCancelBtn"),
  folderImportConfirmBtn: $("folderImportConfirmBtn"),
  apiKeyInput: $("apiKeyInput"),
  defaultImageModelSelect: $("defaultImageModelSelect"),
  defaultResolutionSelect: $("defaultResolutionSelect"),
  defaultSizeSelect: $("defaultSizeSelect"),
  aiGenerateBtn: $("aiGenerateBtn"),
  verifyKeyBtn: $("verifyKeyBtn"),
  saveKeyBtn: $("saveKeyBtn"),
  apiTypeSelect: $("apiTypeSelect"),
  apimartApiInfo: $("apimartApiInfo"),
  agtokenApiInfo: $("agtokenApiInfo"),
  customApiSettings: $("customApiSettings"),
  customApiBaseUrlInput: $("customApiBaseUrlInput"),
  customApiHeadersInput: $("customApiHeadersInput"),
  clearKeyBtn: $("clearKeyBtn"),
  chatSiteSelect: $("chatSiteSelect"),
  chatSiteKeyArea: $("chatSiteKeyArea"),
  chatSiteKeyInput: $("chatSiteKeyInput"),
  chatSiteKeySaveBtn: $("chatSiteKeySaveBtn"),
  chatSiteKeyClearBtn: $("chatSiteKeyClearBtn"),
  chatSiteKeyHint: $("chatSiteKeyHint"),
  chatCustomSiteArea: $("chatCustomSiteArea"),
  chatModelToggleList: $("chatModelToggleList"),
  chatCustomSiteList: $("chatCustomSiteList"),
  chatAddCustomSiteBtn: $("chatAddCustomSiteBtn"),
  balanceDisplay: $("balanceDisplay"),
  balanceRefreshBtn: $("balanceRefreshBtn"),
  lightbox: $("lightbox"),
  lightboxImg: $("lightboxImg"),
  lightboxClose: $("lightboxClose"),
  lightboxPrev: $("lightboxPrev"),
  lightboxNext: $("lightboxNext"),
  lightboxCounter: $("lightboxCounter"),
  lightboxDots: $("lightboxDots"),
  lightboxPaintBtn: $("lightboxPaintBtn"),
  lightboxMattingBtn: $("lightboxMattingBtn"),
  lightboxPaintCanvas: $("lightboxPaintCanvas"),
  lightboxEraserRing: $("lightboxEraserRing"),
  lightboxPaintToolbar: $("lightboxPaintToolbar"),
  lightboxMainTools: $("lightboxMainTools"),
  lightboxPaintBrush: $("lightboxPaintBrush"),
  lightboxPaintEraser: $("lightboxPaintEraser"),
  lightboxInsertBtn: $("lightboxInsertBtn"),
  lightboxFlipHorizontal: $("lightboxFlipHorizontal"),
  lightboxFlipVertical: $("lightboxFlipVertical"),
  lightboxMirrorTools: $("lightboxMirrorTools"),
  lightboxCanvasPicker: $("lightboxCanvasPicker"),
  lightboxCanvasPickerClose: $("lightboxCanvasPickerClose"),
  lightboxCanvasPickerList: $("lightboxCanvasPickerList"),
  lightboxPaintOptions: $("lightboxPaintOptions"),
  lightboxPaintColorField: $("lightboxPaintColorField"),
  lightboxPaintColor: $("lightboxPaintColor"),
  lightboxPaintSize: $("lightboxPaintSize"),
  lightboxPaintUndo: $("lightboxPaintUndo"),
  lightboxPaintCancel: $("lightboxPaintCancel"),
  lightboxPaintConfirm: $("lightboxPaintConfirm"),
  lightboxPaintArrow: $("lightboxPaintArrow"),
  lightboxPaintRect: $("lightboxPaintRect"),
  lightboxPaintFill: $("lightboxPaintFill"),
  lightboxPaintSizeField: $("lightboxPaintSizeField"),
  lightboxFillToleranceField: $("lightboxFillToleranceField"),
  lightboxFillTolerance: $("lightboxFillTolerance"),
  lightboxFillToleranceValue: $("lightboxFillToleranceValue"),
  lightboxFillLineWidthField: $("lightboxFillLineWidthField"),
  lightboxFillLineWidth: $("lightboxFillLineWidth"),
  lightboxFillLineWidthValue: $("lightboxFillLineWidthValue"),
  lightboxFillKeepLines: $("lightboxFillKeepLines"),
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
  multiNodeTemplatesList: $("multiNodeTemplatesList"),
  customTextName: $("customTextName"),
  customTextContent: $("customTextContent"),
  customTextGlobal: $("customTextGlobal"),
  customTextAddBtn: $("customTextAddBtn"),
  customTextEditor: $("customTextEditor"),
  customImageEditor: $("customImageEditor"),
  newCustomTextBtn: $("newCustomTextBtn"),
  newCustomImageBtn: $("newCustomImageBtn"),
  variableDefinitionsList: $("variableDefinitionsList"),
  variableDefinitionEditor: $("variableDefinitionEditor"),
  variableDefinitionName: $("variableDefinitionName"),
  variableDefinitionOptions: $("variableDefinitionOptions"),
  newVariableDefinitionBtn: $("newVariableDefinitionBtn"),
  variableDefinitionSaveBtn: $("variableDefinitionSaveBtn"),
  variableDefinitionCancelBtn: $("variableDefinitionCancelBtn"),
  extensionServiceUrl: $("extensionServiceUrl"),
  extensionServiceStatus: $("extensionServiceStatus"),
  extensionRefreshBtn: $("extensionRefreshBtn"),
  extensionOpenFolderBtn: $("extensionOpenFolderBtn"),
  extensionList: $("extensionList"),
  cepPanelCard: $("cepPanelCard"),
  cepInstallBtn: $("cepInstallBtn"),
  cepUninstallBtn: $("cepUninstallBtn"),
  cepStatusLine: $("cepStatusLine"),
  psPathInput: $("psPathInput"),
  psPathBrowseBtn: $("psPathBrowseBtn"),
  customTextCancelBtn: $("customTextCancelBtn"),
  customImageCancelBtn: $("customImageCancelBtn"),
  shortcutHelpBtn: $("shortcutHelpBtn"),
  shortcutPopover: $("shortcutPopover"),
  shortcutPopoverClose: $("shortcutPopoverClose"),
  importLibraryProjectBtn: $("importLibraryProjectBtn"),
  importLibraryJsonBtn: $("importLibraryJsonBtn"),
  importLibraryJsonInput: $("importLibraryJsonInput"),
  exportLibraryJsonBtn: $("exportLibraryJsonBtn"),
  libraryImportDialog: $("libraryImportDialog"),
  libraryImportSource: $("libraryImportSource"),
  libraryImportItems: $("libraryImportItems"),
  libraryImportCloseBtn: $("libraryImportCloseBtn"),
  libraryImportCancelBtn: $("libraryImportCancelBtn"),
  libraryImportConfirmBtn: $("libraryImportConfirmBtn"),
  checkUpdateBtn: $("checkUpdateBtn"),
  updateStatus: $("updateStatus"),
  updateActions: $("updateActions"),
  installWebUpdateBtn: $("installWebUpdateBtn"),
  releasePageLink: $("releasePageLink"),
  taskQueueBtn: $("taskQueueBtn"),
  taskQueueBadge: $("taskQueueBadge"),
  taskQueuePanel: $("taskQueuePanel"),
  taskQueueCloseBtn: $("taskQueueCloseBtn"),
  taskQueueSummary: $("taskQueueSummary"),
  taskQueueClearBtn: $("taskQueueClearBtn"),
  taskQueueList: $("taskQueueList"),
  replayOnboardingBtn: $("replayOnboardingBtn"),
  apiSettingsCard: $("apiSettingsCard"),
  onboardingTour: $("onboardingTour"),
  onboardingTargetBlocker: $("onboardingTargetBlocker"),
  onboardingSpotlight: $("onboardingSpotlight"),
  onboardingCard: $("onboardingCard"),
  onboardingProgress: $("onboardingProgress"),
  onboardingTitle: $("onboardingTitle"),
  onboardingDescription: $("onboardingDescription"),
  onboardingApiStatus: $("onboardingApiStatus"),
  onboardingApiRequirement: $("onboardingApiRequirement"),
  onboardingItems: $("onboardingItems"),
  onboardingSkipBtn: $("onboardingSkipBtn"),
  onboardingBackBtn: $("onboardingBackBtn"),
  onboardingNextBtn: $("onboardingNextBtn"),
};

let drag = null;
let compositeHoverTargetId = "";
let compositeHoverReady = false;
let edgeDropTargetId = "";
let edgeDropPoint = null;
let edgeDropArmed = false;
let edgeDwellTimer = 0;
let nodeReleaseTargetId = "";
let nodeReleaseBridged = false;
let nodeHoldTimer = 0;
let connectDraft = null;
let selectionDraft = null;
let spaceDown = false;
let altDown = false;
let cutStroke = null;
let lastPointerWorld = { x: 180, y: 140 };
let lastPointerClient = null;
let composerImage = null;

function uid(prefix) {
  return `${prefix}${prefix === "n" ? state.nextNode++ : state.nextEdge++}`;
}

function pageId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function uniqueImportedProjectName(name, usedNames) {
  const requested = String(name || "未命名项目").trim() || "未命名项目";
  if (!usedNames.has(requested)) {
    usedNames.add(requested);
    return requested;
  }
  const suffixMatch = requested.match(/^(.*)（(\d+)）$/);
  const base = suffixMatch?.[1]?.trim() || requested;
  let sequence = suffixMatch ? Number(suffixMatch[2]) + 1 : 1;
  let candidate = `${base}（${sequence}）`;
  while (usedNames.has(candidate)) candidate = `${base}（${++sequence}）`;
  usedNames.add(candidate);
  return candidate;
}

function prepareImportedProjects(data, fallbackName) {
  const sourcePages = Array.isArray(data.pages)
    ? data.pages
    : [{ name: fallbackName, mode: data.mode, data }];
  const usedNames = new Set(state.pages.map(page => String(page.name || "未命名项目")));
  const importedGroups = Array.isArray(data.groups) ? data.groups : [];
  const groupIdMap = new Map();
  const groups = importedGroups
    .filter(group => group && typeof group.name === "string" && group.name.trim())
    .map(group => {
      const id = createGroupId();
      if (typeof group.id === "string" && group.id) groupIdMap.set(group.id, id);
      return { id, name: group.name.trim() };
    });
  const sourceActiveId = data.activePageId;
  let activePageId = "";
  const pages = sourcePages.map(sourcePage => {
    const imported = JSON.parse(JSON.stringify(sourcePage || {}));
    const originalId = imported.id;
    imported.id = pageId();
    imported.name = uniqueImportedProjectName(imported.name || fallbackName, usedNames);
    imported.mode = "ai";
    imported.groupId = groupIdMap.get(imported.groupId) || UNGROUPED_GROUP_ID;
    imported.data = imported.data && typeof imported.data === "object" ? imported.data : blankPage(imported.name, imported.mode).data;
    imported._history = [];
    imported._future = [];
    if (originalId === sourceActiveId) activePageId = imported.id;
    return imported;
  });
  return { pages, groups, activePageId: activePageId || pages[0]?.id || "" };
}

function blankPage(name = "未命名", mode = "ai") {
  return {
    id: pageId(),
    name,
    mode: "ai",
    data: {
      nodes: [],
      edges: [],
      annotations: [],
      settings: { ...state.settings },
      customLibrary: { textTemplates: [], imageMaterials: [], multiNodeTemplates: [], variableDefinitions: [] },
      view: { x: 120, y: 90, scale: 1 },
      nextNode: 1,
      nextEdge: 1,
    },
    _history: [],
    _future: [],
  };
}

function savePageHistory() {
  const page = currentPage();
  if (page) { page._history = state.history; page._future = state.future; }
}

function loadPageHistory() {
  const page = currentPage();
  if (page && Array.isArray(page._history) && page._history.length) {
    state.history = page._history;
    state.future = Array.isArray(page._future) ? page._future : [];
  } else {
    state.history = [cloneData()];
    state.future = [];
  }
}

function cloneData() {
  const settings = { ...state.settings, apiKey: "" };
  return JSON.parse(JSON.stringify({
    nodes: state.nodes,
    edges: state.edges,
    annotations: state.annotations,
    canvasGroupFrames: state.canvasGroupFrames,
    settings,
    customLibrary: state.customLibrary,
    view: state.view,
    nextNode: state.nextNode,
    nextEdge: state.nextEdge,
  }));
}

function currentPage() {
  return state.pages.find(p => p.id === state.activePageId);
}

function rootDataFromActiveGraph() {
  // 思维导图编组子画布已移除：当前画布即根画布
  return cloneData();
}

function saveCurrentPage() {
  const page = currentPage();
  if (page) page.data = rootDataFromActiveGraph();
}

function restoreData(data) {
  const runtimeApiKey = desktop ? (state.settings?.apiKey || "") : "";
  const runtimeAgtokenApiKey = desktop ? (state.settings?.agtokenApiKey || "") : "";
  // 自定义对话站点 key 桌面模式存 secrets（存档剥离），换项目/撤销时同样保运行时值
  const runtimeChatCustomKeys = desktop ? (state.settings?.chatCustomKeys || {}) : "";
  state.nodes = data.nodes || [];
  state.edges = data.edges || [];
  // 旧工程没有 canvasGroupFrames 字段：留空即可，外框会在渲染时按成员范围重新推导
  state.canvasGroupFrames = { ...(data.canvasGroupFrames || {}) };
  state.selectedCanvasGroupId = "";
  state.annotations = Array.isArray(data.annotations)
    ? data.annotations.filter(item => item && typeof item === "object" && item.id).map(item => ({ id: String(item.id), text: String(item.text || ""), x: Number(item.x) || 0, y: Number(item.y) || 0 }))
    : [];
  state.selectedAnnotationId = "";
  state.settings = { gridSize: 40, snap: true, smoothEdges: true, autoAlign: true, hideNodeTitles: false, editOnOverlap: true, textMergeOnOverlap: true, showBrowserNodeMenu: true, showVideoNodeMenu: true, showLocalSdNodeMenu: true, showScreenshotNodeMenu: true, canvasBackground: "grid", theme: "dark", exportFolderLabel: "", projectFolderLabel: "", apiKey: "", agtokenApiKey: "", apiType: "agtoken", customApiBaseUrl: "", customApiHeaders: "", chatDisabledModels: [], chatCustomSites: [], chatCustomKeys: {}, chatSiteModels: {}, chatSiteModelsFetched: {}, defaultImageModel: "gpt-image-2.5-flare", defaultResolution: "1k", defaultSize: "1:1", model: "gpt-image-2", resolution: "1k", quality: "medium", defaultRatio: "1:1", zipExport: false, exportInputs: false, projectExportFolder: false, customMaterials: [], uiColors: {}, ...(data.settings || {}) };
  if (!state.settings._gridStepMigrated) {
    if (Number(state.settings.gridSize) === 20) state.settings.gridSize = 40;
    state.settings._gridStepMigrated = true;
  }
  state.settings.gridSize = Math.min(200, Math.max(10, Math.round(Number(state.settings.gridSize) || 40)));
  if (!activeCatalog().models.some(model => model.id === state.settings.defaultImageModel)) {
    console.warn("[默认绘图模型] 存档值在当前 API 类型下无效，已恢复默认", { value: state.settings.defaultImageModel, apiType: activeApiType() });
    state.settings.defaultImageModel = activeCatalog().defaultModel;
  }
  const legacyAiSettings = { model: state.settings.model, resolution: state.settings.resolution, quality: state.settings.quality, size: state.settings.defaultRatio };
  delete state.settings.geminiAutomation;
  delete state.settings.model;
  delete state.settings.resolution;
  delete state.settings.quality;
  delete state.settings.defaultRatio;
  delete state.settings.showBoardExportMenu;
  delete state.settings.showPackageBoxNodeMenu;
  if (desktop) {
    state.settings.apiKey = runtimeApiKey;
    state.settings.agtokenApiKey = runtimeAgtokenApiKey;
    state.settings.chatCustomKeys = runtimeChatCustomKeys || {};
  }
  migrateLegacyMaterials(data);
  state.customLibrary = emptyLibrary();
  // 思维导图编组（mind-group 子画布）已下线：老画布里的存量编组节点连同其连线一并剔除
  const legacyGroupIds = new Set(state.nodes.filter(node => node.type === "mind-group").map(node => node.id));
  if (legacyGroupIds.size) {
    state.nodes = state.nodes.filter(node => !legacyGroupIds.has(node.id));
    state.edges = state.edges.filter(edge => !legacyGroupIds.has(edge.from.node) && !legacyGroupIds.has(edge.to.node));
    console.warn(`[旧编组] 思维导图编组功能已下线，已移除 ${legacyGroupIds.size} 个编组节点`);
  }
  walkNodes(state.nodes, node => { if (node.customRef) delete node.customRef; });
  walkNodes(state.nodes, node => normalizeAiNodeSettings(node, legacyAiSettings));
  walkNodes(state.nodes, node => { if (node.type === "variable") normalizeVariableNode(node); });
  // 已移除的包装盒节点迁移为普通图片节点，保留生成结果和原有连线。
  walkNodes(state.nodes, node => {
    if (node.type !== "package-box") return;
    node.type = "image";
    node.image = node.generatedImage || node.image || "";
    node.imageAssetId = node.generatedAssetId || node.imageAssetId;
    delete node.generatedImage;
    delete node.generatedAssetId;
    for (const key of Object.keys(node)) if (key.startsWith("package")) delete node[key];
  });
  // 浏览器生图节点:存档加载时清掉不可能仍存活的等待状态
  walkNodes(state.nodes, node => {
    if (node.type !== "browser-image") return;
    normalizeBrowserNode(node);
    node.generating = false;
    node._browserStatus = "";
    node._browserTaskId = null;
  });
  walkNodes(state.nodes, node => {
    if (node.type !== "local-sd") return;
    window.LocalSD?.normalizeNode(node);
    node.generating = false;
    node._sdTaskId = "";
    node._sdStatus = "";
  });
  // 对话节点:存档加载时清掉不可能仍存活的请求状态
  walkNodes(state.nodes, node => {
    if (node.type !== "chat") return;
    normalizeChatNode(node);
    node._chatBusy = false;
    delete node._chatAbort;
    delete node._chatCancelled;
  });
  // AI 视频节点:归一化参数并清掉不可能仍存活的任务状态(队列任务存续判断与 AI 绘图节点一致)
  walkNodes(state.nodes, node => {
    if (node.type !== "ai-video") return;
    normalizeVideoNode(node);
  });
  walkNodes(state.nodes, node => {
    if (node.type !== "ai-image" && node.type !== "ai-video" && node.type !== "angle-image") return;
    const hasLiveQueueTask = aiTaskQueue.items.some(task => task.nodeId === node.id && task.runId === node._queueRunId && !queueTaskIsSettled(task));
    if (!hasLiveQueueTask) {
      node.generating = false;
      node._aiProgress = null;
      delete node._queueRunId;
    }
  });
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
  if (desktop) scheduleDesktopAssetMigration();
  else persistPages();
  renderPageTabs();
}

function resetGraphNavigation() {
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
    loadPageHistory();
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

// ===== UI 自定义颜色(暗色/浅色主题各自独立保存与应用) =====
const UI_COLOR_FIELDS = [
  { key: "bg",           label: "画布底色",   cssVar: "--canvas-bg",    darkDefault: "#000000", lightDefault: "#f5f5f5" },
  { key: "grid",         label: "网格线",     cssVar: "--canvas-grid",  darkDefault: "#212121", lightDefault: "#e8e8e8" },
  { key: "panel",        label: "面板底色",   cssVar: "--panel-solid",  darkDefault: "#131316", lightDefault: "#ffffff" },
  { key: "nodeControl",  label: "节点内控件", cssVar: "--node-control", darkDefault: "#1c1c21", lightDefault: "#f2f2f5" },
  { key: "accent",       label: "主按钮",     cssVar: "--accent",       darkDefault: "#f4f4f5", lightDefault: "#27292d" },
];
function uiColorsActiveMap() {
  // 兼容旧结构(顶层平铺 = 暗色):迁移为 { dark, light }
  const raw = state.settings.uiColors;
  if (raw && !raw.dark && !raw.light && Object.keys(raw).length) {
    state.settings.uiColors = { dark: { ...raw }, light: {} };
  }
  if (!state.settings.uiColors || typeof state.settings.uiColors !== "object") state.settings.uiColors = {};
  if (!state.settings.uiColors.dark) state.settings.uiColors.dark = {};
  if (!state.settings.uiColors.light) state.settings.uiColors.light = {};
  return state.settings.uiColors[state.settings.theme === "dark" ? "dark" : "light"] || {};
}
function uiColorAccentInk(accentHex) {
  // 主按钮改色时按亮度反算墨色(浅底配黑字、深底配白字)
  if (!accentHex) return;
  const n = parseInt(accentHex.slice(1), 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  els.app.style.setProperty("--accent-ink", lum > 140 ? "#0c0c0e" : "#f4f4f5");
}
function applyUiColors() {
  const app = els.app;
  if (!app) return;
  UI_COLOR_FIELDS.forEach(f => {
    app.style.removeProperty(f.cssVar);
    if (f.key === "grid") {
      app.style.removeProperty("--canvas-cross");
      app.style.removeProperty("--canvas-dot");
    }
  });
  app.style.removeProperty("--accent-ink");
  const uc = uiColorsActiveMap();
  UI_COLOR_FIELDS.forEach(f => {
    const v = uc[f.key];
    if (v && /^#[0-9a-f]{6}$/i.test(v)) {
      app.style.setProperty(f.cssVar, v);
      // 网格线一项统一驱动三种网格样式(线格/十字/点阵)
      if (f.key === "grid") {
        app.style.setProperty("--canvas-cross", v);
        app.style.setProperty("--canvas-dot", v);
      }
      if (f.key === "accent") uiColorAccentInk(v);
    }
  });
}

function applySettings() {
  els.app.className = `app theme-${state.settings.theme} mode-ai${state.settings.hideNodeTitles ? " hide-node-titles" : ""}`;
  document.documentElement.style.colorScheme = state.settings.theme;
  applyUiColors();
  if (!["grid", "cross", "dots"].includes(state.settings.canvasBackground)) state.settings.canvasBackground = "grid";
  els.viewport.classList.toggle("bg-cross", state.settings.canvasBackground === "cross");
  els.viewport.classList.toggle("bg-dots", state.settings.canvasBackground === "dots");
  if (window.chrome?.webview && lastDesktopTheme !== state.settings.theme) {
    try {
      window.chrome.webview.postMessage({ type: "theme-change", theme: state.settings.theme });
      lastDesktopTheme = state.settings.theme;
      console.log(`[主题] 已同步桌面标题栏：${state.settings.theme}`);
    } catch (error) {
      console.error("[主题] 同步桌面标题栏失败", error);
    }
  }
  updateViewportGrid();
  $("themeBtn").innerHTML = state.settings.theme === "light"
    ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
    : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  const darkThemeToggle = $("darkThemeToggle");
  if (darkThemeToggle) darkThemeToggle.checked = state.settings.theme === "dark";
}

// screenshot settings UI removed

function syncSettingsPanel() {
  els.gridSize.value = state.settings.gridSize;
  els.canvasBg.value = state.settings.canvasBackground || "grid";
  els.snap.checked = state.settings.snap;
  els.smoothEdges.checked = state.settings.smoothEdges === true;
  els.autoAlign.checked = state.settings.autoAlign !== false;
  els.hideNodeTitles.checked = state.settings.hideNodeTitles === true;
  els.editOnOverlap.checked = state.settings.editOnOverlap !== false;
  els.textMergeOnOverlap.checked = state.settings.textMergeOnOverlap !== false;
  els.showBrowserNodeMenu.checked = state.settings.showBrowserNodeMenu !== false;
  els.showVideoNodeMenu.checked = state.settings.showVideoNodeMenu !== false;
  if (els.showLocalSdNodeMenu) els.showLocalSdNodeMenu.checked = state.settings.showLocalSdNodeMenu !== false;
  if (els.showScreenshotNodeMenu) els.showScreenshotNodeMenu.checked = state.settings.showScreenshotNodeMenu !== false;
  els.zipExportToggle.checked = state.settings.zipExport === true;
  if (els.projectExportFolderToggle) els.projectExportFolderToggle.checked = state.settings.projectExportFolder === true;
  const darkThemeToggle = $("darkThemeToggle");
  if (darkThemeToggle) darkThemeToggle.checked = state.settings.theme === "dark";
  state.settings.exportFolderLabel = resolvedExportFolderLabel(state.settings.exportFolderLabel);
  state.settings.projectFolderLabel = resolvedProjectFolderLabel(state.settings.projectFolderLabel) || runtimeProjectFolder;
  els.projectFolder.textContent = state.settings.projectFolderLabel;
  els.apiKeyInput.value = activeApiKey();
  els.defaultImageModelSelect.value = state.settings.defaultImageModel || "gpt-image-2.5-flare";
  applyApiTypeSettingsUi();
  syncCustomMaterialsList();
  renderVariableDefinitions();
}

function variableDefinitionById(id) {
  return globalLibrary.variableDefinitions.find(item => item.id === id) || null;
}

function renderVariableDefinitions() {
  if (!els.variableDefinitionsList) return;
  const items = globalLibrary.variableDefinitions;
  els.variableDefinitionsList.innerHTML = items.length ? items.map(item => `<div class="variable-definition-item material-item" data-kind="variable" data-id="${escHtml(item.id)}">
    <button class="material-drag-handle" type="button" title="拖动排序" aria-label="拖动排序">⋮⋮</button>
    <div><strong>${escHtml(item.name)}</strong><p>${escHtml(item.options.map(option => option.label).join("、") || "暂无可选值")}</p></div>
    <div class="variable-definition-actions"><button data-variable-action="edit" title="编辑" aria-label="编辑变量">✎</button><button data-variable-action="delete" title="删除" aria-label="删除变量">×</button></div>
  </div>`).join("") : '<div class="setting-desc variable-definition-empty">还没有变量，请创建一个全局变量。</div>';
  bindLibraryDragSort("variable", els.variableDefinitionsList);
}

function openVariableDefinitionEditor(id = "") {
  editingVariableDefinitionId = id;
  const item = id ? variableDefinitionById(id) : null;
  els.variableDefinitionName.value = item?.name || "";
  els.variableDefinitionOptions.value = item?.options.map(option => option.label).join("\n") || "";
  els.variableDefinitionSaveBtn.textContent = item ? "保存修改" : "保存变量";
  els.variableDefinitionEditor.classList.remove("hidden");
  els.variableDefinitionName.focus();
}

function closeVariableDefinitionEditor() {
  editingVariableDefinitionId = "";
  els.variableDefinitionEditor.classList.add("hidden");
  els.variableDefinitionName.value = "";
  els.variableDefinitionOptions.value = "";
}

function saveVariableDefinition() {
  const name = els.variableDefinitionName.value.trim();
  const labels = els.variableDefinitionOptions.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  if (!name) return toast("请输入变量名");
  if (!labels.length) return toast("请至少输入一个可选值");
  const folded = labels.map(value => value.toLocaleLowerCase());
  if (new Set(folded).size !== folded.length) return toast("同一变量内的可选值不能重名");
  if (globalLibrary.variableDefinitions.some(item => item.id !== editingVariableDefinitionId && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return toast("变量名不能重复");
  const existing = variableDefinitionById(editingVariableDefinitionId);
  if (existing) {
    const oldByLabel = new Map(existing.options.map(option => [option.label.toLocaleLowerCase(), option]));
    const usedOptionIds = new Set();
    existing.name = name;
    existing.options = labels.map((label, index) => {
      const exact = oldByLabel.get(label.toLocaleLowerCase());
      const positional = existing.options[index];
      const option = exact || (positional && !usedOptionIds.has(positional.id) ? positional : null) || { id: uid("opt"), label };
      usedOptionIds.add(option.id);
      return option;
    });
    existing.options.forEach((option, index) => { option.label = labels[index]; });
    existing.revision = (existing.revision || 1) + 1;
  } else {
    globalLibrary.variableDefinitions.push(normalizeVariableDefinition({ name, options: labels.map(label => ({ id: uid("opt"), label })) }));
  }
  persistLibraries();
  closeVariableDefinitionEditor();
  renderVariableDefinitions();
  render();
  toast(existing ? "变量已更新" : "变量已创建");
}

function syncCustomMaterialsList() {
  renderLibraryList("text", els.customTextsList);
  renderLibraryList("image", els.customMaterialsList);
  renderLibraryList("multi", els.multiNodeTemplatesList);
}
function normalizeMultiNodeTemplate(item) {
  const value = normalizeTemplate(item);
  value.nodes = Array.isArray(value.nodes) ? value.nodes : [];
  value.edges = Array.isArray(value.edges) ? value.edges : [];
  value.imageFiles = Array.isArray(value.imageFiles) ? value.imageFiles : [];
  return value;
}

function customMaterialImageUrl(fileName) {
  const path = `/download/images/${encodeURIComponent(fileName || "")}`;
  return desktop ? `https://canvasflow-data.local/${encodeURIComponent(fileName || "")}` : path;
}

function renderLibraryList(kind, container) {
  if (!container) return;
  const items = libraryItems(kind);
  container.innerHTML = items.map(item => `<div class="material-item" data-kind="${kind}" data-id="${escHtml(item.id)}">
    <button class="material-drag-handle" type="button" title="拖动排序" aria-label="拖动排序">⋮⋮</button>
    ${kind === "image" ? `<img class="material-thumb" src="${customMaterialImageUrl(item.fileName)}" alt="${escHtml(item.name)}" title="双击放大预览">` : ""}
    <span class="material-copy ${kind !== "image" ? "with-preview" : ""}"><span class="material-name" title="${escHtml(item.name)}">${escHtml(item.name)}</span>${kind === "text" ? `<span class="material-content-preview" title="${escHtml(item.content || "")}">${escHtml((item.content || "").replace(/\s+/g, " "))}</span>` : kind === "multi" ? `<span class="material-content-preview">${uiLanguage === "en" ? `${item.nodes.length} nodes · ${item.edges.length} connections` : `${item.nodes.length} 个节点 · ${item.edges.length} 条连线`}</span>` : ""}</span>
    <button class="material-rename-btn" title="编辑">✎</button>
    <button class="material-del-btn" title="删除素材">×</button>
  </div>`).join("");
  bindLibraryDragSort(kind, container);
}

// 自定义节点和变量库共用拖拽手柄、落点指示与排序保存。
function bindLibraryDragSort(kind, container) {
  const dropIndicator = document.createElement("div");
  dropIndicator.className = "material-drop-indicator hidden";
  container.appendChild(dropIndicator);
  let dropTargetId = "";
  let dropAfter = false;
  container.querySelectorAll(".material-item").forEach(row => {
    const kind = row.dataset.kind, id = row.dataset.id;
    const handle = row.querySelector(".material-drag-handle");
    handle.onpointerdown = () => { row.draggable = true; };
    handle.onpointerup = () => { if (!row.classList.contains("is-dragging")) row.draggable = false; };
    row.ondragstart = ev => {
      if (!row.draggable) { ev.preventDefault(); return; }
      row.classList.add("is-dragging");
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", `${kind}:${id}`);
    };
    row.ondragend = () => {
      row.draggable = false;
      row.classList.remove("is-dragging");
      dropIndicator.classList.add("hidden");
      dropTargetId = "";
    };
    const thumb = row.querySelector(".material-thumb");
    if (thumb) thumb.ondblclick = ev => {
      ev.preventDefault();
      ev.stopPropagation();
      showLightbox(thumb.src);
    };
    const editButton = row.querySelector(".material-rename-btn");
    if (editButton) editButton.onclick = () => kind === "multi" ? renameMultiNodeTemplate(id) : editTemplate(kind, id);
    const deleteButton = row.querySelector(".material-del-btn");
    if (deleteButton) deleteButton.onclick = () => deleteTemplate(kind, id);
  });
  container.ondragover = ev => {
    const dragging = container.querySelector(".material-item.is-dragging");
    const target = ev.target.closest?.(".material-item");
    if (!dragging || !target || target === dragging || target.dataset.kind !== dragging.dataset.kind) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    dropAfter = ev.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
    dropTargetId = target.dataset.id;
    dropIndicator.style.top = `${target.offsetTop + (dropAfter ? target.offsetHeight : 0) - 1}px`;
    dropIndicator.classList.remove("hidden");
  };
  container.ondrop = ev => {
    const dragging = container.querySelector(".material-item.is-dragging");
    if (!dragging || !dropTargetId) return;
    ev.preventDefault();
    dropIndicator.classList.add("hidden");
    const key = kind === "variable" ? "variableDefinitions" : kind === "text" ? "textTemplates" : kind === "image" ? "imageMaterials" : "multiNodeTemplates";
    const items = globalLibrary[key];
    const sourceIndex = items.findIndex(item => item.id === dragging.dataset.id);
    if (sourceIndex < 0) return;
    const [movedItem] = items.splice(sourceIndex, 1);
    const targetIndex = items.findIndex(item => item.id === dropTargetId);
    if (targetIndex < 0) { items.splice(sourceIndex, 0, movedItem); return; }
    items.splice(targetIndex + (dropAfter ? 1 : 0), 0, movedItem);
    persistLibraries();
    console.info(`[素材排序] ${kind}：${globalLibrary[key].map(item => item.name).join(" → ")}`);
    if (kind === "variable") { renderVariableDefinitions(); renderNodes(); }
    else renderLibraryList(kind, container);
  };
}

function escHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function templateLocation(kind, id) {
  const key = kind === "text" ? "textTemplates" : kind === "image" ? "imageMaterials" : "multiNodeTemplates";
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
  els.customMaterialEditorPreview.src = customMaterialImageUrl(item.fileName);
  els.customMaterialEditorPreview.classList.remove("hidden");
  els.customMaterialAddBtn.textContent = "保存修改";
  els.customImageEditor.classList.remove("hidden");
  els.customMaterialName.focus();
}

async function deleteTemplate(kind, id) {
  const loc = templateLocation(kind, id); if (!loc) return;
  const item = loc.library[loc.key][loc.index];
  loc.library[loc.key].splice(loc.index, 1);
  if (kind === "image" && item.fileName) try { await apiFetch("/api/custom-material", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: item.fileName }) }); } catch (e) { console.error("[自定义图片] 删除文件失败", e); }
  if (kind === "multi") {
    if (DEFAULT_MULTI_NODE_TEMPLATES.some(template => template.id === id) && !(globalLibrary.builtinMultiNodeRemovedIds || []).includes(id)) {
      globalLibrary.builtinMultiNodeRemovedIds.push(id);
    }
    for (const image of item.imageFiles || []) {
      if (!image.fileName) continue;
      try { await apiFetch("/api/custom-material", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: image.fileName }) }); }
      catch (e) { console.error("[自定义多个节点] 删除图片副本失败", { fileName: image.fileName, message: e.message }); }
    }
  }
  persistLibraries(); syncCustomMaterialsList(); toast("素材已删除");
}

async function addCustomMaterial(source) {
  var name = (els.customMaterialName.value || "").trim();
  if (source?.name) name = source.name;
  if (!name) { toast("请输入素材名称"); return; }
  var file = source?.file || els.customMaterialFileInput.files?.[0];
  var base64 = source?.data || "";
  if (pendingCustomImage) {
    base64 = pendingCustomImage.data || "";
    file = null;
  }
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
  const srcName = source?.fileName || file?.name || pendingCustomImage?.name || "custom.png";
  const srcMime = source?.mime || file?.type || pendingCustomImage?.mime || "image/png";
  console.log(`[自定义图片] ${editingLoc ? "替换" : "添加"}: 名称=${name}, 原始文件=${srcName}, size=${file?.size || pendingCustomImage?.size || "base64"}`);
  if (!base64) base64 = await fileToBase64(file);
  try {
    var resp = await apiFetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: srcName, data: stripDataUrl(base64) }) });
    var result = await resp.json();
    if (!result.success) { toast("保存失败: " + (result.error || "")); return; }
    console.log("[自定义素材] 服务端保存成功: fileName=" + result.fileName);
    if (editingLoc) {
      const item = editingLoc.library[editingLoc.key][editingLoc.index];
      const oldFileName = item.fileName;
      item.name = name;
      item.fileName = result.fileName;
      item.mime = srcMime;
      item.revision = (item.revision || 1) + 1;
      if (oldFileName && oldFileName !== result.fileName) {
        try {
          await apiFetch("/api/custom-material", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: oldFileName }) });
        } catch (cleanupError) { console.error("[自定义图片] 旧图片清理失败", cleanupError); }
      }
    } else {
      target.imageMaterials.push(normalizeTemplate({ name, fileName: result.fileName, mime: srcMime, revision: 1 }));
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
  pendingCustomImage = null;
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
  for (const item of source.library.multiNodeTemplates || []) rows.push({ kind: "multi", item });
  for (const item of source.library.variableDefinitions || []) rows.push({ kind: "variable", item });
  els.libraryImportItems.innerHTML = rows.length ? rows.map(row => `<label class="library-import-item">
    <input type="checkbox" class="library-import-check" data-kind="${row.kind}" data-id="${escHtml(row.item.id)}" checked>
    <span>${row.kind === "text" ? "文字" : row.kind === "image" ? "图片" : row.kind === "multi" ? "多个节点" : "变量"}：${escHtml(row.item.name)}</span>
  </label>`).join("") : '<div class="setting-desc">没有可导入的图文、多个节点或变量</div>';
}

async function confirmLibraryImport() {
  const source = pendingLibraryImport?.[Number(els.libraryImportSource.value) || 0]; if (!source) return;
  const selected = Array.from(els.libraryImportItems.querySelectorAll(".library-import-check:checked"));
  if (!selected.length) return toast("请至少勾选一个素材");
  els.libraryImportConfirmBtn.disabled = true;
  let textCount = 0, imageCount = 0, multiCount = 0, variableCount = 0, failed = 0;
  for (const checkbox of selected) {
    const kind = checkbox.dataset.kind;
    const key = kind === "text" ? "textTemplates" : kind === "image" ? "imageMaterials" : kind === "multi" ? "multiNodeTemplates" : "variableDefinitions";
    const item = source.library[key].find(x => x.id === checkbox.dataset.id); if (!item) continue;
    try {
      if (kind === "text") { if (addCustomText({ ...item })) textCount++; else failed++; }
      else if (kind === "multi") {
        const copy = normalizeMultiNodeTemplate(JSON.parse(JSON.stringify(item)));
        if (globalLibrary.multiNodeTemplates.some(existing => existing.id === copy.id)) copy.id = `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        for (const image of copy.imageFiles) {
          let data = image.data || "";
          if (!data && image.fileName) {
            const resp = await fetch(customMaterialImageUrl(image.fileName));
            if (!resp.ok) throw new Error(`模板图片不存在：${image.fileName}`);
            data = await blobToBase64(await resp.blob());
          }
          const resp = await apiFetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: image.fileName || "template.png", data: stripDataUrl(data) }) });
          const result = await resp.json(); if (!result.success) throw new Error(result.error || "模板图片恢复失败");
          image.fileName = result.fileName; delete image.data;
        }
        copy.name = uniqueMultiNodeTemplateName(copy.name);
        globalLibrary.multiNodeTemplates.push(copy); multiCount++;
      } else if (kind === "variable") {
        const copy = normalizeVariableDefinition(JSON.parse(JSON.stringify(item)));
        if (globalLibrary.variableDefinitions.some(existing => existing.id === copy.id)) copy.id = uid("var");
        let desiredName = copy.name, suffix = 2;
        while (globalLibrary.variableDefinitions.some(existing => existing.name.toLocaleLowerCase() === desiredName.toLocaleLowerCase())) desiredName = `${copy.name} (${suffix++})`;
        copy.name = desiredName;
        globalLibrary.variableDefinitions.push(copy); variableCount++;
      } else {
        let data = item.data || "";
        if (!data && item.fileName) {
            const resp = await fetch(customMaterialImageUrl(item.fileName));
          if (!resp.ok) throw new Error("图片文件不存在");
          data = await blobToBase64(await resp.blob());
        }
        if (await addCustomMaterial({ ...item, data })) imageCount++; else failed++;
      }
    } catch (e) { failed++; console.error("[导入] 素材导入失败", item.name, e); }
  }
  if (variableCount) { persistLibraries(); renderVariableDefinitions(); }
  els.libraryImportConfirmBtn.disabled = false; closeLibraryImport();
  if (multiCount) { persistLibraries(); syncCustomMaterialsList(); }
  console.log(`[导入] 文字=${textCount}, 图片=${imageCount}, 多节点=${multiCount}, 变量=${variableCount}, 失败=${failed}`);
  toast(`导入完成：文字 ${textCount}，图片 ${imageCount}，多个节点 ${multiCount}，变量 ${variableCount}${failed ? `，失败 ${failed}` : ""}`);
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

function fileToDataUrl(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function() { resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updateViewportGrid() {
  const size = Math.max(4, state.settings.gridSize * state.view.scale);
  const half = size / 2;
  const grid = document.getElementById("vpPatternGrid");
  const cross = document.getElementById("vpPatternCross");
  const dots = document.getElementById("vpPatternDots");
  if (!grid || !cross || !dots) return;
  // 十字模式：只保留十字所在的大格（4 格一格），十字落在大格交点；点状：每 2 格一个点
  const crossSpan = size * 4;
  const dotsSpan = size * 2;
  for (const [pattern, span] of [[grid, size], [cross, crossSpan], [dots, dotsSpan]]) {
    pattern.setAttribute("width", span);
    pattern.setAttribute("height", span);
  }
  grid.setAttribute("x", state.view.x);
  grid.setAttribute("y", state.view.y);
  cross.setAttribute("x", state.view.x - crossSpan / 2);
  cross.setAttribute("y", state.view.y - crossSpan / 2);
  dots.setAttribute("x", state.view.x - dotsSpan / 2);
  dots.setAttribute("y", state.view.y - dotsSpan / 2);
  const arm = Math.min(Math.max(size * .28, 4.5), 8);
  cross.querySelector(".vp-cross-mark").setAttribute("d", `M${(crossSpan / 2 - arm).toFixed(2)} ${(crossSpan / 2).toFixed(2)}H${(crossSpan / 2 + arm).toFixed(2)}M${(crossSpan / 2).toFixed(2)} ${(crossSpan / 2 - arm).toFixed(2)}V${(crossSpan / 2 + arm).toFixed(2)}`);
  cross.querySelector(".vp-cross-line").setAttribute("d", `M0 ${(crossSpan / 2).toFixed(2)}H${crossSpan.toFixed(2)}M${(crossSpan / 2).toFixed(2)} 0V${crossSpan.toFixed(2)}`);
  grid.querySelector(".vp-grid-line").setAttribute("d", `M0 0.5H${size.toFixed(2)}M0.5 0V${size.toFixed(2)}`);
  const dot = dots.querySelector("circle");
  dot.setAttribute("cx", dotsSpan / 2);
  dot.setAttribute("cy", dotsSpan / 2);
  dot.setAttribute("r", Math.min(Math.max(size * .05, .9), 2).toFixed(2));
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

function currentPasteAnchor() {
  const r = els.viewport.getBoundingClientRect();
  if (!r.width || !r.height) return lastPointerWorld;
  const sourceX = lastPointerClient?.x ?? (r.left + r.width / 2);
  const sourceY = lastPointerClient?.y ?? (r.top + r.height / 2);
  const clientX = Math.max(r.left + 20, Math.min(r.right - 40, sourceX + 16));
  const clientY = Math.max(r.top + 20, Math.min(r.bottom - 40, sourceY + 16));
  return screenToWorld(clientX, clientY);
}

function snap(v) {
  return state.settings.snap ? Math.round(v / state.settings.gridSize) * state.settings.gridSize : v;
}

// 自动对齐：把新节点贴齐附近节点的边/中心（屏幕距离容差，缩放越小容差越大）
function autoAlignPosition(x, y, w, h) {
  const tol = Math.max(4, 9 / state.view.scale);
  let bestX = null, bestXD = tol;
  let bestY = null, bestYD = tol;
  for (const other of state.nodes) {
    for (const guide of [other.x, other.x + other.w / 2, other.x + other.w]) {
      for (const mine of [x, x + w / 2, x + w]) {
        const d = Math.abs(guide - mine);
        if (d < bestXD) { bestXD = d; bestX = x + (guide - mine); }
      }
    }
    for (const guide of [other.y, other.y + other.h / 2, other.y + other.h]) {
      for (const mine of [y, y + h / 2, y + h]) {
        const d = Math.abs(guide - mine);
        if (d < bestYD) { bestYD = d; bestY = y + (guide - mine); }
      }
    }
  }
  return { x: snap(bestX ?? x), y: snap(bestY ?? y) };
}

// 自动对齐：连线时按串联/并联规则排布目标节点
// 串联(源节点唯一的输出)：目标排在源节点正右侧,行中心对齐
// 并联(源节点多路输出)：所有输出目标纵向一列、等间距,整列与源节点垂直居中
function autoAlignEdgeTarget(fromNode, toNode) {
  if (!fromNode || !toNode) return;
  const COL_GAP = 80, ROW_GAP = 40;
  const targets = [...new Set(state.edges.filter(e => e.from.node === fromNode.id).map(e => e.to.node))]
    .map(findNode).filter(Boolean);
  if (!targets.includes(toNode)) targets.push(toNode);
  if (targets.length <= 1) {
    toNode.x = snap(fromNode.x + fromNode.w + COL_GAP);
    // 吸附"源中心"而不是最终 y:奇数高度节点才不会偏移半格
    toNode.y = snap(fromNode.y + fromNode.h / 2) - toNode.h / 2;
    return;
  }
  const colX = snap(fromNode.x + fromNode.w + COL_GAP);
  targets.forEach(node => { node.x = colX; });
  // 按中心 y 排序,保持既有分支的上下相对位置,新节点落在哪就插在哪
  targets.sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  const totalH = targets.reduce((sum, n) => sum + n.h, 0) + ROW_GAP * (targets.length - 1);
  // 纵向坐标不做网格吸附:吸附会破坏等间距和整列居中(见 AGENTS.md 整理节点教训)
  let cursor = fromNode.y + fromNode.h / 2 - totalH / 2;
  targets.forEach(node => {
    node.y = cursor;
    cursor += node.h + ROW_GAP;
  });
}

const NODE_PLACEMENT_GAP = 24;

function nodeHeightForType(type) {
  return type === "ai-image" ? AI_NODE_HEIGHT
    : type === "ai-video" ? VIDEO_NODE_HEIGHT
    : type === "angle-image" ? ANGLE_NODE_HEIGHT
      : type === "screenshot-input" ? SCREENSHOT_NODE_HEIGHT
    : type === "palette" ? 640
    : type === "tool-node" ? TOOL_NODE_HEIGHT
      : type === "image" ? IMAGE_NODE_HEIGHT
        : type === "chat" ? CHAT_NODE_HEIGHT
        : type === "browser-image" ? BROWSER_NODE_HEIGHT
        : type === "local-sd" ? 430
        : type === "folder" ? GROUP_NODE_HEIGHT
        : type === "group" ? GROUP_NODE_HEIGHT
          : NODE_HEIGHT;
}

function placementOverlaps(x, y, w, h, ignoredIds = new Set(), pendingNodes = []) {
  const candidate = { x: x - NODE_PLACEMENT_GAP, y: y - NODE_PLACEMENT_GAP, w: w + NODE_PLACEMENT_GAP * 2, h: h + NODE_PLACEMENT_GAP * 2 };
  return [...state.nodes, ...pendingNodes].some(node => {
    if (!node || ignoredIds.has(node.id)) return false;
    return intersects(candidate, {
      x: Number(node.x) || 0,
      y: Number(node.y) || 0,
      w: Number(node.w) || NODE_WIDTH,
      h: Number(node.h) || nodeHeightForType(node.type),
    });
  });
}

function findFreeNodePosition(x, y, w = NODE_WIDTH, h = NODE_HEIGHT, options = {}) {
  const ignoredIds = options.ignoredIds || new Set();
  const pendingNodes = options.pendingNodes || [];
  const base = { x: snap(x), y: snap(y) };
  if (!placementOverlaps(base.x, base.y, w, h, ignoredIds, pendingNodes)) return base;

  const stepX = w + NODE_PLACEMENT_GAP * 2;
  const stepY = h + NODE_PLACEMENT_GAP * 2;
  for (let ring = 1; ring <= 40; ring++) {
    const candidates = [];
    for (let gy = -ring; gy <= ring; gy++) {
      for (let gx = -ring; gx <= ring; gx++) {
        if (Math.max(Math.abs(gx), Math.abs(gy)) !== ring) continue;
        candidates.push({
          x: snap(base.x + gx * stepX),
          y: snap(base.y + gy * stepY),
          distance: Math.hypot(gx * stepX, gy * stepY),
          directionRank: gx >= 0 && gy >= 0 ? 0 : gx >= 0 ? 1 : gy >= 0 ? 2 : 3,
        });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.directionRank - b.directionRank || a.y - b.y || a.x - b.x);
    const free = candidates.find(candidate => !placementOverlaps(candidate.x, candidate.y, w, h, ignoredIds, pendingNodes));
    if (free) {
      console.log("[节点放置] 目标位置被占用，已自动错开放置", { requested: base, placed: { x: free.x, y: free.y }, width: w, height: h });
      return { x: free.x, y: free.y };
    }
  }
  const fallback = { x: snap(base.x + stepX * 41), y: snap(base.y + stepY * 41) };
  console.warn("[节点放置] 未在常规范围找到空位，已使用远端备用位置", { requested: base, fallback, width: w, height: h });
  return fallback;
}

function nextScreenshotNodeSequence() {
  return state.nodes.reduce((max, node) => node.type === "screenshot-input" ? Math.max(max, Number(node.screenshotSeq) || 0) : max, 0) + 1;
}

function normalizeVariableNode(node) {
  node.w = Math.max(420, Number(node.w) || 420);
  if (!Array.isArray(node.variableRows) || !node.variableRows.length) node.variableRows = [{ id: uid("vrow"), definitionId: "", optionId: "", variableNameSnapshot: "", valueLabelSnapshot: "" }];
  node.variableRows = node.variableRows.map(row => ({
    id: row?.id || uid("vrow"), definitionId: String(row?.definitionId || ""), optionId: String(row?.optionId || ""),
    variableNameSnapshot: String(row?.variableNameSnapshot || ""), valueLabelSnapshot: String(row?.valueLabelSnapshot || ""),
  }));
  return node;
}

function resolvedVariableRow(row) {
  const definition = variableDefinitionById(row.definitionId);
  const option = definition?.options.find(item => item.id === row.optionId) || null;
  return { definition, option, variableName: definition?.name || row.variableNameSnapshot || "", valueLabel: option?.label || row.valueLabelSnapshot || "", invalid: !!(row.definitionId && (!definition || (row.optionId && !option))) };
}

function variableNodeOutput(node) {
  normalizeVariableNode(node);
  return node.variableRows.map(resolvedVariableRow).filter(row => row.variableName && row.valueLabel).map(row => `${row.valueLabel}${row.variableName}`).join("，");
}

// ===== 文字节点内嵌变量：文字内容中出现变量库名称时自动出现下拉，选择后按“值+变量名”展开 =====
function variableDefinitionByName(name) {
  const target = String(name || "").trim().toLocaleLowerCase();
  if (!target) return null;
  return globalLibrary.variableDefinitions.find(item => item.name.toLocaleLowerCase() === target) || null;
}

// 检测文字中出现的变量名：命中要求变量名前后都是空白（文字首尾也视为边界），普通词句里的相同文字不触发；
// 再按名称长度降序占用区间，避免“发色”/“发色板”这类子串互相误伤
function detectTextNodeVariables(text) {
  const value = String(text || "");
  if (!value || !globalLibrary.variableDefinitions.length) return [];
  const lowerValue = value.toLocaleLowerCase();
  const atSpaceBoundary = index => index < 0 || index >= value.length || /\s/.test(value[index]);
  const taken = new Array(value.length).fill(false);
  const found = [];
  const definitions = [...globalLibrary.variableDefinitions].sort((a, b) => (b.name.length - a.name.length) || String(a.name).localeCompare(String(b.name)));
  for (const definition of definitions) {
    const name = String(definition.name || "");
    if (!name) continue;
    const lowerName = name.toLocaleLowerCase();
    let from = 0;
    while (from <= lowerValue.length - lowerName.length) {
      const index = lowerValue.indexOf(lowerName, from);
      if (index < 0) break;
      from = index + Math.max(1, lowerName.length);
      if (!atSpaceBoundary(index - 1) || !atSpaceBoundary(index + lowerName.length)) continue;
      if (taken.slice(index, index + lowerName.length).some(Boolean)) continue;
      taken.fill(true, index, index + lowerName.length);
      found.push({ definition, name, index, length: lowerName.length });
    }
  }
  return found;
}

// 展开文字内容：已选择值的变量名替换为“值+变量名”（与原变量节点输出格式一致）；未选择的保持原文
function expandTextNodeVariables(node) {
  const value = String(node?.text || "");
  if (!value || !globalLibrary.variableDefinitions.length) return value;
  const choices = node?.variableChoices || {};
  const matches = detectTextNodeVariables(value).filter(match => {
    const choice = choices[match.name];
    return choice?.label && choice.enabled !== false;
  }).sort((a, b) => a.index - b.index);
  if (!matches.length) return value;
  let expanded = "";
  let cursor = 0;
  for (const match of matches) {
    expanded += value.slice(cursor, match.index) + choices[match.name].label + value.slice(match.index, match.index + match.length);
    cursor = match.index + match.length;
  }
  return expanded + value.slice(cursor);
}

function buildNodeObject(type, position, width, height) {
  return {
    id: uid("n"),
    type,
    x: position.x,
    y: position.y,
    w: width,
    h: height,
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
    anglePitch: type === "angle-image" ? 0 : undefined,
    angleYaw: type === "angle-image" ? 0 : undefined,
    angleRoll: type === "angle-image" ? 0 : undefined,
    angleZoom: type === "angle-image" ? 1 : undefined,
    angleReverseDirection: type === "angle-image" ? false : undefined,
    _model: type === "angle-image" ? "gemini-3.1-flash-image-preview" : type === "ai-image" ? (state.settings.defaultImageModel || "gpt-image-2.5-flare") : undefined,
    _resolution: type === "angle-image" ? "1k" : type === "ai-image" ? (state.settings.defaultResolution || "1k") : undefined,
    _size: type === "angle-image" ? "1:1" : type === "ai-image" ? (state.settings.defaultSize || "1:1") : undefined,
    _count: (type === "ai-image" || type === "screenshot-input") ? 1 : undefined,
    images: (type === "group" || type === "folder") ? [] : undefined,
    items: null,
    internalEdges: null,
    seq: 0,
    screenshotSeq: type === "screenshot-input" ? nextScreenshotNodeSequence() : undefined,
    variableRows: type === "variable" ? [{ id: uid("vrow"), definitionId: "", optionId: "", variableNameSnapshot: "", valueLabelSnapshot: "" }] : undefined,
    _chatModel: type === "chat" ? (window.CANVASFLOW_CHAT_CATALOG?.defaultModel || "") : undefined,
    _chatEnumerated: type === "chat" ? false : undefined,
    chatMessages: type === "chat" ? [] : undefined,
    chatText: type === "chat" ? "" : undefined,
    chatDraft: type === "chat" ? "" : undefined,
    chatAttachments: type === "chat" ? [] : undefined,
    chatSessions: type === "chat" ? [] : undefined,
    activeChatSessionId: type === "chat" ? "" : undefined,
    _browserSite: type === "browser-image" ? BROWSER_SITES[0].id : undefined,
    _browserOrigin: type === "browser-image" ? "" : undefined,
    _sdMode: type === "local-sd" ? "txt2img" : undefined,
    _sdWorkflowId: type === "local-sd" ? "" : undefined,
    _sdWorkflowByMode: type === "local-sd" ? {} : undefined,
    _sdNegative: type === "local-sd" ? "" : undefined,
    _sdSeed: type === "local-sd" ? Math.floor(Math.random() * 2147483647) : undefined,
    _sdDenoise: type === "local-sd" ? 0.7 : undefined,
    _sdDuration: type === "local-sd" ? 5 : undefined,
    _sdResolution: type === "local-sd" ? "1K" : undefined,
    _sdRatio: type === "local-sd" ? "1:1" : undefined,
    _sdMaskData: type === "local-sd" ? "" : undefined,
    videoFile: type === "ai-video" ? "" : undefined,
    _videoRatio: type === "ai-video" ? "16:9" : undefined,
    _videoResolution: type === "ai-video" ? "1080p" : undefined,
    _videoDuration: type === "ai-video" ? 5 : undefined,
    _videoAudio: type === "ai-video" ? true : undefined,
  };
}

// Reveal only explicitly created nodes; generated results retain their existing placement/view.
function nodeViewportRevealOffset(node, view, rect, padding = 24) {
  function axis(start, size, available) {
    const end = start + size;
    if (size > available - padding * 2) return padding - start;
    if (start < padding) return padding - start;
    if (end > available - padding) return available - padding - end;
    return 0;
  }
  return {
    x: axis(view.x + node.x * view.scale, node.w * view.scale, rect.width),
    y: axis(view.y + node.y * view.scale, node.h * view.scale, rect.height),
  };
}

function revealCreatedNode(node) {
  const rect = els.viewport.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  // Keep the newly revealed node clear of floating tools and the minimap.
  const header = document.querySelector(".topbar")?.getBoundingClientRect();
  const bottomRects = [...document.querySelectorAll(".composer-dock, .minimap-panel")]
    .map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
  const top = Math.max(0, (header?.bottom || rect.top) - rect.top);
  const bottom = Math.min(rect.height, ...bottomRects.map(r => r.top - rect.top));
  const safeRect = { width: rect.width, height: Math.max(1, bottom - top) };
  const offset = nodeViewportRevealOffset(node, { ...state.view, y: state.view.y - top }, safeRect);
  if (!offset.x && !offset.y) return;
  state.view.x += offset.x;
  state.view.y += offset.y;
  scheduleViewPersistence();
}

function addNode(type, x = 160, y = 120, commit = true, placementOptions = {}) {
  const width = placementOptions.width || (type === "chat" ? CHAT_NODE_WIDTH : type === "palette" ? 300 : NODE_WIDTH);
  const height = placementOptions.height || nodeHeightForType(type);
  let position = placementOptions.avoidOverlap === false
    ? { x: snap(x), y: snap(y) }
    : findFreeNodePosition(x, y, width, height, placementOptions);
  if (commit && placementOptions.autoAlign !== false && state.settings.autoAlign !== false) {
    position = autoAlignPosition(position.x, position.y, width, height);
  }
  const node = buildNodeObject(type, position, width, height);
  state.nodes.push(node);
  state.selected = new Set([node.id]);
  if (commit || placementOptions.reveal === true) revealCreatedNode(node);
  if (commit) {
    pushHistory();
    render();
  }
  return node;
}

// 离页落位专用:把结果节点直接写进非激活项目的 page.data(深克隆副本),不渲染、不选中、不进当前页历史
function addNodeToPageData(page, type, x, y) {
  const node = buildNodeObject(type, { x: snap(x), y: snap(y) }, NODE_WIDTH, nodeHeightForType(type));
  page.data.nodes.push(node);
  return node;
}

function walkNodes(nodes, fn) {
  for (const node of nodes || []) {
    fn(node);
    if (Array.isArray(node.items)) walkNodes(node.items, fn);
    if (Array.isArray(node.subgraph?.nodes)) walkNodes(node.subgraph.nodes, fn);
  }
}

async function createNodeFromTemplate(kind, template, x, y) {
  const node = addNode(kind === "text" ? "text" : "image", x, y, false);
  if (kind === "text") node.text = template.content || "";
  else {
    try {
      const resp = await fetch(customMaterialImageUrl(template.fileName));
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      node.image = await blobToBase64(await resp.blob()); node.fileName = template.fileName; node.mime = template.mime || "image/png";
      await externalizeImageField(node, "image", "imageAssetId", node.fileName);
    } catch (e) { state.nodes = state.nodes.filter(x => x.id !== node.id); console.error("[自定义图片] 创建失败", e); return toast("创建失败：素材图片无法读取"); }
  }
  pushHistory(); render(); toast(kind === "text" ? "已创建自定义文字节点" : "已创建自定义图片节点");
}

async function saveNodeAsTemplate(node) {
  const kind = node.type === "text" ? "text" : "image";
  const content = kind === "text" ? String(node.text || "").trim() : await resolveNodeImageDataUrl(node);
  if (!content) return toast(kind === "text" ? "无法收藏：文字节点内容为空" : "无法收藏：图片节点没有图片");
  const suggested = kind === "text" ? content.split(/\r?\n/)[0].slice(0, 30) : (node.fileName || "自定义图片");
  const name = prompt(translateUiString("自定义素材名称"), suggested); if (name === null || !name.trim()) return;
  const target = globalLibrary;
  const finalName = uniqueTemplateName(kind, name.trim(), target);
  if (kind === "text") {
    const template = normalizeTemplate({ name: finalName, content, revision: 1 });
    target.textTemplates.push(template);
  } else {
    const raw = stripDataUrl(content);
    const originalName = node.fileName || "custom.png";
    try {
      const resp = await apiFetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: originalName, data: raw }) });
      const result = await resp.json(); if (!result.success) throw new Error(result.error || "保存失败");
      const template = normalizeTemplate({ name: finalName, fileName: result.fileName, mime: node.mime || "image/png", revision: 1 });
      target.imageMaterials.push(template);
    } catch (e) { console.error("[自定义图片] 节点收藏失败", e); return toast("收藏失败：" + e.message); }
  }
  persistLibraries(); syncCustomMaterialsList(); toast("已保存到全局素材库");
}

async function storeMultiTemplateImage(dataUrl, originalName, mime, imageFiles) {
  if (!dataUrl) throw new Error(`图片内容为空：${originalName || "未命名图片"}`);
  const resp = await apiFetch("/api/custom-material", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: originalName || "template.png", data: stripDataUrl(dataUrl) }),
  });
  const result = await resp.json().catch(() => ({}));
  if (!resp.ok || !result.success || !result.fileName) throw new Error(result.error || `图片副本保存失败：HTTP ${resp.status}`);
  const image = { id: `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, fileName: result.fileName, mime: mime || "image/png" };
  imageFiles.push(image);
  return image.id;
}

function clearGeneratedTemplateState(node) {
  node.generating = false;
  node.taskId = null;
  node.outputPath = "";
  node._aiProgress = null;
  delete node._queueRunId;
  if (node.type === "ai-image" || node.type === "angle-image") {
    node.generatedImage = null;
    delete node.generatedAssetId;
    if (Array.isArray(node.batchTasks)) node.batchTasks = [];
  }
  if (node.type === "image" && (node.aiSourceNodeId || node.angleSourceNodeId)) {
    node.image = null;
    delete node.imageAssetId;
  }
}

async function captureMultiTemplateImages(nodes, imageFiles) {
  for (const node of nodes || []) {
    clearGeneratedTemplateState(node);
    if (node.type === "image" && !node.aiSourceNodeId && !node.angleSourceNodeId && (node.image || node.imageAssetId)) {
      const dataUrl = await materializeReferenceImage({ image: node.image || "", assetId: node.imageAssetId || "", fileName: node.fileName || "template.png" });
      node.templateImageId = await storeMultiTemplateImage(dataUrl, node.fileName, node.mime, imageFiles);
      node.image = null;
      delete node.generationPrompt;
      delete node.imageAssetId;
    }
    for (const image of node.images || []) {
      if (!image?.image && !image?.assetId) continue;
      const dataUrl = await materializeReferenceImage(image);
      image.templateImageId = await storeMultiTemplateImage(dataUrl, image.fileName, image.mime, imageFiles);
      image.image = null;
      delete image.assetId;
    }
    if (Array.isArray(node.items)) await captureMultiTemplateImages(node.items, imageFiles);
    if (Array.isArray(node.subgraph?.nodes)) await captureMultiTemplateImages(node.subgraph.nodes, imageFiles);
  }
}

async function saveSelectionAsMultiNodeTemplate() {
  const selectedIds = new Set([...state.selected].filter(id => !!findNode(id)));
  if (selectedIds.size < 2) return toast("至少选中 2 个节点才能保存为自定义组件");
  const name = prompt(translateUiString("自定义组件名称"), `多节点模板 ${globalLibrary.multiNodeTemplates.length + 1}`);
  if (name === null || !name.trim()) return;
  const nodes = state.nodes.filter(node => selectedIds.has(node.id)).map(node => JSON.parse(JSON.stringify(node)));
  const edges = state.edges.filter(edge => selectedIds.has(edge.from.node) && selectedIds.has(edge.to.node)).map(edge => JSON.parse(JSON.stringify(edge)));
  const imageFiles = [];
  try {
    await captureMultiTemplateImages(nodes, imageFiles);
    const template = normalizeMultiNodeTemplate({ name: uniqueMultiNodeTemplateName(name.trim()), nodes, edges, imageFiles, revision: 1 });
    globalLibrary.multiNodeTemplates.push(template);
    persistLibraries(); syncCustomMaterialsList();
    console.info("[自定义多个节点] 已保存", { id: template.id, nodes: nodes.length, edges: edges.length, images: imageFiles.length });
    toast(`已保存 ${nodes.length} 个节点和 ${edges.length} 条内部连线`);
  } catch (error) {
    for (const image of imageFiles) {
      try { await apiFetch("/api/custom-material", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: image.fileName }) }); } catch (_) {}
    }
    console.error("[自定义多个节点] 保存失败", error);
    toast(`保存失败：${error.message || "节点图片无法读取"}；请检查图片文件和程序目录权限后重试`);
  }
}

async function hydrateMultiTemplateImages(nodes, imageFiles) {
  const byId = new Map((imageFiles || []).map(image => [image.id, image]));
  for (const node of nodes || []) {
    if (node.templateImageId) {
      const image = byId.get(node.templateImageId);
      if (!image?.fileName) throw new Error(`模板图片记录不存在：${node.fileName || node.templateImageId}`);
      const resp = await fetch(customMaterialImageUrl(image.fileName));
      if (!resp.ok) throw new Error(`模板图片无法读取：${image.fileName}`);
      node.image = await blobToBase64(await resp.blob());
      node.mime = image.mime || node.mime || "image/png";
      delete node.templateImageId;
      await externalizeImageField(node, "image", "imageAssetId", node.fileName || image.fileName);
    }
    for (const entry of node.images || []) {
      if (!entry.templateImageId) continue;
      const image = byId.get(entry.templateImageId);
      if (!image?.fileName) throw new Error(`模板图片记录不存在：${entry.fileName || entry.templateImageId}`);
      const resp = await fetch(customMaterialImageUrl(image.fileName));
      if (!resp.ok) throw new Error(`模板图片无法读取：${image.fileName}`);
      entry.image = await blobToBase64(await resp.blob());
      entry.mime = image.mime || entry.mime || "image/png";
      delete entry.templateImageId;
      await externalizeImageField(entry, "image", "assetId", entry.fileName || image.fileName);
    }
    if (Array.isArray(node.items)) await hydrateMultiTemplateImages(node.items, imageFiles);
    if (Array.isArray(node.subgraph?.nodes)) await hydrateMultiTemplateImages(node.subgraph.nodes, imageFiles);
  }
}

async function createNodesFromMultiTemplate(template, x, y) {
  if (!template?.nodes?.length) return toast("创建失败：该多节点模板没有节点；请删除后重新保存");
  const data = { nodes: JSON.parse(JSON.stringify(template.nodes)), edges: JSON.parse(JSON.stringify(template.edges || [])) };
  try {
    await hydrateMultiTemplateImages(data.nodes, template.imageFiles || []);
    pasteNodes(data, { x, y });
    console.info("[自定义多个节点] 已插入", { id: template.id, nodes: data.nodes.length, edges: data.edges.length });
  } catch (error) {
    console.error("[自定义多个节点] 插入失败", error);
    toast(`创建失败：${error.message || "模板图片无法读取"}；请检查素材文件是否存在后重试`);
  }
}

function groupSelection() {
  const nodeIds = new Set([...state.selected].filter(id => {
    const n = findNode(id);
    return n && n.type !== "output";
  }));
  if (nodeIds.size < 2) return toast("至少选中 2 个节点才能创建多任务");

  const nodes = state.nodes.filter(n => nodeIds.has(n.id));
  const internalEdges = state.edges.filter(e => nodeIds.has(e.from.node) && nodeIds.has(e.to.node)).map(e => ({ ...e }));
  const externalInEdges = state.edges.filter(e => nodeIds.has(e.to.node) && !nodeIds.has(e.from.node));
  const externalOutEdges = state.edges.filter(e => nodeIds.has(e.from.node) && !nodeIds.has(e.to.node));

  const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
  const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;

  const group = addNode("group", snap(cx - NODE_WIDTH / 2), snap(cy - NODE_HEIGHT / 2), false, { avoidOverlap: false });
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
  toast(`已创建多任务 ${nodes.length} 个节点`);
}

// ── 画布节点编组 ────────────────────────────────────────────────────────────
// 数据模型：成员节点带 node.canvasGroupId；外框按成员范围拟合，缓存进 state.canvasGroupFrames
// （随工程存档，用于复制粘贴与旧档兼容）；整组拖动时 selectedCanvasGroupId 记住当前组，
// 使随后点击组内单个节点能回到"只动这个节点"的语义。
const CANVAS_GROUP_PAD_X = 16;
const CANVAS_GROUP_PAD_TOP = 28; // 顶部留给"编组 · N 个节点"标签
const CANVAS_GROUP_PAD_BOTTOM = 16;
const canvasGroupRuns = new Map();
const CANVAS_GROUP_RUNNABLE_TYPES = new Set(["ai-image", "ai-video", "angle-image", "browser-image", "chat", "local-sd", "tool-node"]);
function canvasGroupNodeRunIsStopped(node) { return !!(node?.canvasGroupId && canvasGroupRuns.get(node.canvasGroupId)?.stopped); }
window.CanvasFlowGroupNodeRunIsStopped = canvasGroupNodeRunIsStopped;

function canvasGroupMembers(groupId) {
  return state.nodes.filter(node => node.canvasGroupId === groupId);
}

function expandCanvasGroupIds(ids) {
  const selected = new Set(ids);
  const groups = new Set(state.nodes.filter(node => selected.has(node.id) && node.canvasGroupId).map(node => node.canvasGroupId));
  for (const node of state.nodes) if (groups.has(node.canvasGroupId)) selected.add(node.id);
  return selected;
}

function groupCanvasSelection() {
  const ids = expandCanvasGroupIds(state.selected);
  if (ids.size < 2) return toast("至少选中 2 个节点才能创建编组");
  for (const node of state.nodes) if (ids.has(node.id) && node.canvasGroupId) delete state.canvasGroupFrames[node.canvasGroupId];
  const groupId = uid("canvas-group");
  for (const node of state.nodes) if (ids.has(node.id)) node.canvasGroupId = groupId;
  state.selected = ids;
  state.selectedCanvasGroupId = groupId;
  canvasGroupBounds(canvasGroupMembers(groupId));
  if (typeof separateCanvasGroupFromOthers === "function") separateCanvasGroupFromOthers(groupId);
  pushHistory();
  render();
  toast(`已将 ${ids.size} 个节点编组`);
}

function ungroupCanvasSelection() {
  const ids = expandCanvasGroupIds(state.selected);
  let count = 0;
  for (const node of state.nodes) if (ids.has(node.id) && node.canvasGroupId) {
    delete state.canvasGroupFrames[node.canvasGroupId];
    delete node.canvasGroupId;
    count++;
  }
  if (!count) return;
  state.selected = ids;
  state.selectedCanvasGroupId = "";
  pushHistory();
  render();
  toast(`已解散编组，保留 ${count} 个节点`);
}

function canvasGroupNodeRect(node) {
  return {
    x: Number(node.x) || 0, y: Number(node.y) || 0,
    w: Number(node.w) || NODE_WIDTH, h: Number(node.h) || NODE_HEIGHT,
  };
}

function canvasGroupBounds(nodes) {
  if (!nodes.length) return { x: 0, y: 0, w: 0, h: 0 };
  const rects = nodes.map(canvasGroupNodeRect);
  const x = Math.min(...rects.map(rect => rect.x)) - CANVAS_GROUP_PAD_X;
  const y = Math.min(...rects.map(rect => rect.y)) - CANVAS_GROUP_PAD_TOP;
  const right = Math.max(...rects.map(rect => rect.x + rect.w)) + CANVAS_GROUP_PAD_X;
  const bottom = Math.max(...rects.map(rect => rect.y + rect.h)) + CANVAS_GROUP_PAD_BOTTOM;
  const bounds = { x, y, w: right - x, h: bottom - y };
  const groupId = nodes[0]?.canvasGroupId;
  if (groupId) (state.canvasGroupFrames ||= {})[groupId] = bounds;
  return bounds;
}

// 选中单个节点：整组被选中（或刚拖过外框）时收敛为只选它，避免误动整组
function selectCanvasNode(id, additive = false) {
  if (!additive && (!state.selected.has(id) || state.selectedCanvasGroupId)) state.selected = new Set([id]);
  else if (additive) state.selected.add(id);
  state.selectedCanvasGroupId = "";
}

function canvasDragGroupFrames(nodes) {
  const ids = new Set(nodes.map(node => node.id));
  const groups = new Set(nodes.map(node => node.canvasGroupId).filter(Boolean));
  const frames = [];
  for (const groupId of groups) {
    const members = canvasGroupMembers(groupId);
    const bounds = canvasGroupBounds(members);
    if (members.every(node => ids.has(node.id))) frames.push({ groupId, ...bounds });
  }
  return frames;
}

// 沿单个轴求允许位移：把"成员外扩边"与"整组平移"都限制在组外节点之外。
// 允许沿已接触的边滑行（tangent），允许反向退出（收缩），正向只走到贴着障碍为止。
function constrainCanvasGroupDelta(nodes, axis, delta, movingIds, blockedGroups) {
  if (!delta) return delta;
  const groups = new Set(nodes.map(node => node.canvasGroupId).filter(Boolean));
  let allowed = delta;
  for (const groupId of groups) {
    const members = canvasGroupMembers(groupId);
    if (members.length < 2) continue; // 只剩一个成员时等同于普通节点，不再套用整组碰撞
    const moving = members.filter(node => movingIds.has(node.id)).map(canvasGroupNodeRect);
    const frame = canvasGroupBounds(members);
    const horizontal = axis === "x", size = horizontal ? "w" : "h";
    const otherAxis = horizontal ? "y" : "x", otherSize = horizontal ? "h" : "w";
    const leading = Math.min(...moving.map(node => node[axis])) - (horizontal ? CANVAS_GROUP_PAD_X : CANVAS_GROUP_PAD_TOP);
    const trailing = Math.max(...moving.map(node => node[axis] + node[size])) + CANVAS_GROUP_PAD_X;
    const beforeGroup = allowed;
    for (const obstacle of state.nodes) {
      if (obstacle.canvasGroupId === groupId || movingIds.has(obstacle.id)) continue;
      const box = canvasGroupNodeRect(obstacle);
      if (frame[otherAxis] > box[otherAxis] + box[otherSize] || frame[otherAxis] + frame[otherSize] < box[otherAxis]) continue;
      const tangent = frame[otherAxis] === box[otherAxis] + box[otherSize] || frame[otherAxis] + frame[otherSize] === box[otherAxis];
      const overlapsAxis = frame[axis] < box[axis] + box[size] && frame[axis] + frame[size] > box[axis];
      if (tangent && overlapsAxis) continue; // 沿接触边滑行，不进入障碍
      // 接触包含拐角：已经轻微重叠的边也继续挡，但允许反向退出
      if (delta > 0 && frame[axis] < box[axis] && frame[axis] + frame[size] <= box[axis] + box[size]) {
        allowed = Math.min(allowed, Math.max(0, box[axis] - trailing));
      } else if (delta < 0 && frame[axis] + frame[size] > box[axis] + box[size] && frame[axis] >= box[axis]) {
        allowed = Math.max(allowed, Math.min(0, box[axis] + box[size] - leading));
      }
    }
    const otherGroupIds = [...new Set(state.nodes.map(node => node.canvasGroupId).filter(id => id && id !== groupId))];
    for (const otherGroupId of otherGroupIds) {
      const box = canvasGroupBounds(canvasGroupMembers(otherGroupId));
      if (frame[otherAxis] >= box[otherAxis] + box[otherSize] || frame[otherAxis] + frame[otherSize] <= box[otherAxis]) continue;
      if (delta > 0 && frame[axis] < box[axis]) allowed = Math.min(allowed, Math.max(0, box[axis] - frame[axis] - frame[size]));
      else if (delta < 0 && frame[axis] > box[axis]) allowed = Math.max(allowed, Math.min(0, box[axis] + box[size] - frame[axis]));
    }
    if (allowed !== beforeGroup) blockedGroups?.add(groupId);
  }
  return allowed;
}

function moveCanvasDragNodes(dragState, point) {
  const moving = dragState.original.map(item => findNode(item.id)).filter(Boolean);
  if (!moving.length) return;
  const first = dragState.original[0];
  const involvesGroup = moving.some(node => node.canvasGroupId);
  if (!involvesGroup) {
    // 未编组：保持改动前的逐节点吸附行为，避免影响普通多选的既有手感
    const dx = point.x - dragState.start.x, dy = point.y - dragState.start.y;
    for (const item of dragState.original) {
      const node = findNode(item.id);
      if (!node) continue;
      node.x = snap(item.x + dx);
      node.y = snap(item.y + dy);
    }
    return;
  }
  // 整组：只吸附一次共享位移，组内成员的相对间距/离格偏移原样保留
  const dx = snap(first.x + point.x - dragState.start.x) - first.x;
  const dy = snap(first.y + point.y - dragState.start.y) - first.y;
  const movingIds = new Set(moving.map(node => node.id));
  dragState.blockedGroups = new Set();
  for (const [axis, delta] of [["x", dx], ["y", dy]]) {
    // 从当前实际位置推进，受阻后仍可滑行、反向时立刻解除阻挡
    const requested = first[axis] + delta - findNode(first.id)[axis];
    const allowed = constrainCanvasGroupDelta(moving, axis, requested, movingIds, dragState.blockedGroups);
    for (const node of moving) node[axis] += allowed;
  }
  for (const frame of dragState.groupFrames || []) {
    state.canvasGroupFrames[frame.groupId] = { x: frame.x + dx, y: frame.y + dy, w: frame.w, h: frame.h };
  }
  const groups = new Set(dragState.original.map(item => findNode(item.id)?.canvasGroupId).filter(Boolean));
  for (const groupId of groups) canvasGroupBounds(canvasGroupMembers(groupId));
}

function ungroupNode(groupId) {
  const group = findNode(groupId);
  if (!group || group.type !== "group") return toast("不是多任务节点");

  const liveIncoming = state.edges.filter(edge => edge.to.node === groupId).map(edge => JSON.parse(JSON.stringify(edge)));
  const liveOutgoing = state.edges.filter(edge => edge.from.node === groupId).map(edge => JSON.parse(JSON.stringify(edge)));
  const restoredIds = new Set();
  const addRestoredEdge = (fromNode, toNode, label = "") => {
    if (!fromNode || !toNode || fromNode === toNode) return;
    if (state.edges.some(edge => edge.from.node === fromNode && edge.to.node === toNode)) return;
    state.edges.push({ id: uid("e"), from: { node: fromNode, port: "out" }, to: { node: toNode, port: "in" }, label });
  };
  if (group.items) {
    for (const item of group.items) {
      if (item.type === "image") item.h = Math.max(Number(item.h) || 0, 160);
      state.nodes.push(item);
      restoredIds.add(item.id);
    }
    if (group.internalEdges) {
      for (const e of group.internalEdges) state.edges.push(e);
    }
    if (group._extInSources) {
      for (const e of group._extInSources) addRestoredEdge(e.from.node, e.to.node, e.label || "");
    }
    if (group._extOutTargets) {
      for (const e of group._extOutTargets) addRestoredEdge(e.from.node, e.to.node, e.label || "");
    }
    const restoredNodeIds = new Set(group.items.map(item => item.id));
    const internalEdges = group.internalEdges || [];
    const entryNodeIds = group.items.filter(item => !internalEdges.some(edge => edge.to.node === item.id && restoredNodeIds.has(edge.from.node))).map(item => item.id);
    const terminalNodeIds = group.items.filter(item => !internalEdges.some(edge => edge.from.node === item.id && restoredNodeIds.has(edge.to.node))).map(item => item.id);
    const storedIncomingSources = new Set((group._extInSources || []).map(edge => edge.from.node));
    const storedOutgoingTargets = new Set((group._extOutTargets || []).map(edge => edge.to.node));
    for (const edge of liveIncoming) {
      if (storedIncomingSources.has(edge.from.node)) continue;
      for (const entryId of entryNodeIds) addRestoredEdge(edge.from.node, entryId, edge.label || "");
    }
    for (const edge of liveOutgoing) {
      if (storedOutgoingTargets.has(edge.to.node)) continue;
      for (const terminalId of terminalNodeIds) addRestoredEdge(terminalId, edge.to.node, edge.label || "");
    }
  } else if (group.images && group.images.length) {
    const createdImageIds = [];
    for (let i = 0; i < group.images.length; i++) {
      const gImg = group.images[i];
      const imgNode = addNode("image", group.x + i * 260, group.y + 60, false, { ignoredIds: new Set([groupId]) });
      imgNode.image = gImg.image || null;
      imgNode.imageAssetId = gImg.assetId || "";
      imgNode.fileName = gImg.fileName || "";
      imgNode.mime = gImg.mime || "";
      restoredIds.add(imgNode.id);
      createdImageIds.push(imgNode.id);
    }
    for (const edge of liveIncoming) for (const imageId of createdImageIds) addRestoredEdge(edge.from.node, imageId, edge.label || "");
    for (const edge of liveOutgoing) for (const imageId of createdImageIds) addRestoredEdge(imageId, edge.to.node, edge.label || "");
  } else {
    return toast("该多任务节点无可取消的内容");
  }

  state.nodes = state.nodes.filter(n => n.id !== groupId);
  state.edges = state.edges.filter(e => e.from.node !== groupId && e.to.node !== groupId);

  state.selected = restoredIds;
  pushHistory();
  render();
  toast("已取消多任务");
}

function splitMultiInputAiNode(nodeId) {
  const node = findNode(nodeId);
  if (!node || node.type !== "ai-image") return [nodeId];
  if (node.keepCombinedInputs) return [nodeId];

  const incoming = buildIncomingIndex();
  const directEdges = incoming.get(nodeId) || [];
  if (directEdges.length <= 1) return [nodeId];

  const newNodeIds = [nodeId];
  for (let i = 1; i < directEdges.length; i++) {
    const newAi = JSON.parse(JSON.stringify(node));
    newAi.id = uid("n");
    const position = findFreeNodePosition(node.x + i * (NODE_WIDTH + 40), node.y, Number(newAi.w) || NODE_WIDTH, Number(newAi.h) || AI_NODE_HEIGHT);
    newAi.x = position.x;
    newAi.y = position.y;
    newAi.seq = state.nextNode++;
    newAi.generating = false;
    newAi.generatedImage = null;
    delete newAi.generatedAssetId;
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
  state.selectedCanvasGroupId = "";
  // 编组收尾：成员不足 2 个的组自动解散（单个节点不该再受整组碰撞约束），空组连外框一起清掉
  const memberCounts = new Map();
  for (const node of state.nodes) if (node.canvasGroupId) memberCounts.set(node.canvasGroupId, (memberCounts.get(node.canvasGroupId) || 0) + 1);
  for (const groupId of Object.keys(state.canvasGroupFrames || {})) if ((memberCounts.get(groupId) || 0) < 2) delete state.canvasGroupFrames[groupId];
  for (const node of state.nodes) if (node.canvasGroupId && (memberCounts.get(node.canvasGroupId) || 0) < 2) delete node.canvasGroupId;
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

const CLIPBOARD_NODES_HTML_MARK = "canvasflow-nodes-v1";

// 节点复制数据序列化进系统剪贴板的 text/html 注释：多实例多开时页面内存
// state.clipboard 不共享，靠这段隐藏 HTML 注释在实例之间传递节点数据。
function encodeCanvasflowNodesHtml(payload) {
  try {
    if (!payload || (!payload.nodes?.length && !payload.edges?.length)) return "";
    return `<!--${CLIPBOARD_NODES_HTML_MARK}:${btoa(unescape(encodeURIComponent(JSON.stringify(payload))))}-->`;
  } catch (err) {
    return "";
  }
}

function decodeCanvasflowNodesHtml(html) {
  try {
    const raw = typeof html === "string" ? html : "";
    const prefix = `<!--${CLIPBOARD_NODES_HTML_MARK}:`;
    const start = raw.indexOf(prefix);
    if (start < 0) return null;
    const end = raw.indexOf("-->", start + prefix.length);
    if (end < 0) return null;
    const payload = JSON.parse(decodeURIComponent(escape(atob(raw.slice(start + prefix.length, end)))));
    if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.edges)) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

async function copySelection(event = null) {
  const nodes = state.nodes.filter(n => state.selected.has(n.id)).map(cloneNodeForClipboard);
  const payload = {
    copyId: uid("copy"),
    nodes,
    edges: state.edges.filter(e => state.selected.has(e.from.node) && state.selected.has(e.to.node)),
    // 整组被完整复制时带上外框，粘贴后保留被撑开的组内空间
    canvasGroupFrames: Object.fromEntries(canvasDragGroupFrames(nodes).map(({ groupId, ...bounds }) => [groupId, bounds])),
  };
  if (!desktop && event?.clipboardData) {
    const html = encodeCanvasflowNodesHtml(payload);
    if (!html) return false;
    event.clipboardData.setData("text/html", html);
    state.clipboard = payload;
    toast(`已复制 ${nodes.length} 个节点`);
    return true;
  }
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error("当前环境不支持写入节点剪贴板");
    }
    const portable = structuredClone(payload);
    // Start the clipboard write while the copy gesture still grants access.
    const htmlBlob = (async () => {
      if (desktop) {
        await materializeNodeAssetsForPortableSave(portable.nodes, async ({ assetId }) => {
          const { dataUrl } = await desktop.readAsset(assetId);
          if (!dataUrl) throw new Error("素材原图为空");
          return dataUrl;
        });
      }
      const html = encodeCanvasflowNodesHtml(portable);
      if (!html) throw new Error("节点数据无法写入剪贴板");
      return new Blob([html], { type: "text/html" });
    })();
    await navigator.clipboard.write([new ClipboardItem({ "text/html": htmlBlob })]);
    state.clipboard = payload;
    toast(`已复制 ${nodes.length} 个节点`);
    return true;
  } catch (error) {
    console.warn("[节点复制] 剪贴板写入失败", error);
    toast("复制失败，请检查原图是否可读取以及剪贴板权限");
    return false;
  }
}

function cloneNodeForClipboard(n) {
  const copy = JSON.parse(JSON.stringify(n));
  // 组合两侧语义:master 的完整重置(图/视频/SD) + 旧线的 walkNodes 层级(编组内嵌套节点同样重置)
  walkNodes([copy], node => {
    if (node.type === "ai-image" || node.type === "angle-image") {
      node.generatedImage = null;
      delete node.generatedAssetId;
      node.taskId = null;
      node.generating = false;
    }
    if (node.type === "ai-video") {
      // 副本指向同一份磁盘文件即可(只读播放),但运行状态必须归零
      node.taskId = null;
      node.generating = false;
      node._aiProgress = null;
      delete node._queueRunId;
      delete node._pendingVideoUrl;
    }
    if (node.type === "local-sd") {
      node.generating = false;
      node._sdTaskId = "";
      node._sdStatus = "";
      node._sdError = "";
      node._sdRequestSeq = 0;
    }
  });
  return copy;
}

function rekeyContainedGraph(nodes, edges) {
  const map = new Map();
  for (const node of nodes || []) {
    const oldId = node.id;
    node.id = uid("n");
    map.set(oldId, node.id);
  }
  for (const node of nodes || []) {
    if (map.has(node.aiSourceNodeId)) node.aiSourceNodeId = map.get(node.aiSourceNodeId);
    if (map.has(node.angleSourceNodeId)) node.angleSourceNodeId = map.get(node.angleSourceNodeId);
    if (Array.isArray(node.items)) rekeyContainedGraph(node.items, node.internalEdges || []);
    if (Array.isArray(node.subgraph?.nodes)) {
      rekeyContainedGraph(node.subgraph.nodes, node.subgraph.edges || []);
      node.subgraph.nextNode = inferNext("n", node.subgraph.nodes.map(item => item.id));
      node.subgraph.nextEdge = inferNext("e", (node.subgraph.edges || []).map(edge => edge.id));
    }
  }
  for (const edge of edges || []) {
    edge.id = uid("e");
    if (map.has(edge.from?.node)) edge.from.node = map.get(edge.from.node);
    if (map.has(edge.to?.node)) edge.to.node = map.get(edge.to.node);
  }
}

function pasteNodes(data, anchor = null) {
  const map = new Map();
  const groupMap = new Map();
  const pasted = [];
  const minX = Math.min(...data.nodes.map(n => n.x));
  const minY = Math.min(...data.nodes.map(n => n.y));
  const maxX = Math.max(...data.nodes.map(n => n.x + (Number(n.w) || NODE_WIDTH)));
  const maxY = Math.max(...data.nodes.map(n => n.y + (Number(n.h) || nodeHeightForType(n.type))));
  const pasteAnchor = anchor || currentPasteAnchor();
  const desiredMinX = pasteAnchor.x;
  const desiredMinY = pasteAnchor.y;
  const groupPosition = findFreeNodePosition(desiredMinX, desiredMinY, maxX - minX, maxY - minY);
  data.nodes.forEach(n => {
    const nn = {
      ...JSON.parse(JSON.stringify(n)),
      id: uid("n"),
      x: groupPosition.x + (n.x - minX),
      y: groupPosition.y + (n.y - minY),
      w: NODE_WIDTH,
      h: n.type === "ai-image" ? Math.max(Number(n.h) || 0, AI_NODE_HEIGHT) : n.type === "angle-image" ? Math.max(Number(n.h) || 0, ANGLE_NODE_HEIGHT) : n.type === "screenshot-input" ? Math.max(Number(n.h) || 0, SCREENSHOT_NODE_HEIGHT) : n.type === "image" ? Math.max(Number(n.h) || 0, 160) : (n.type === "group" || n.type === "folder") ? Math.max(Number(n.h) || 0, GROUP_NODE_HEIGHT) : NODE_HEIGHT,
      created: Date.now() + state.nextNode,
    };
    if (n.canvasGroupId && data.nodes.filter(item => item.canvasGroupId === n.canvasGroupId).length > 1) {
      // 新组 ID，避免和原组混在一起；组内成员保留原始宽高以维持组内布局
      if (!groupMap.has(n.canvasGroupId)) groupMap.set(n.canvasGroupId, uid("canvas-group"));
      nn.canvasGroupId = groupMap.get(n.canvasGroupId);
      nn.w = Number(n.w) || NODE_WIDTH;
      nn.h = Number(n.h) || nodeHeightForType(n.type);
    } else {
      delete nn.canvasGroupId;
    }
    if (nn.type === "screenshot-input") nn.screenshotSeq = nextScreenshotNodeSequence() + pasted.filter(item => item.type === "screenshot-input").length;
    if (Array.isArray(nn.items)) rekeyContainedGraph(nn.items, nn.internalEdges || []);
    if (Array.isArray(nn.subgraph?.nodes)) rekeyContainedGraph(nn.subgraph.nodes, nn.subgraph.edges || []);
    walkNodes([nn], pastedNode => { if (pastedNode.customRef) delete pastedNode.customRef; });
    // PR-5 图片批注：粘贴副本重新生成批注 ID（坐标深拷贝、顺序保留、imageId 指向新节点），旧 comments 一并规范化为 imageAnnotations
    if (Array.isArray(nn.imageAnnotations) || Array.isArray(nn.comments)) {
      const pasteAnnotationModule = window.CanvasFlowImageAnnotations;
      if (pasteAnnotationModule) pasteAnnotationModule.writeNodeAnnotations(nn, pasteAnnotationModule.remapAnnotationIds(pasteAnnotationModule.readNodeAnnotations(nn)));
      else console.warn("[图片批注] 模块未加载，粘贴副本保留原批注 ID");
    }
    map.set(n.id, nn.id);
    pasted.push(nn);
  });
  state.nodes.push(...pasted);
  for (const [oldId, newId] of groupMap) {
    const bounds = data.canvasGroupFrames?.[oldId];
    if (bounds) state.canvasGroupFrames[newId] = { ...bounds, x: bounds.x + groupPosition.x - minX, y: bounds.y + groupPosition.y - minY };
  }
  (data.edges || []).forEach(e => {
    if (map.has(e.from.node) && map.has(e.to.node)) {
      state.edges.push({ id: uid("e"), from: { node: map.get(e.from.node), port: "out" }, to: { node: map.get(e.to.node), port: "in" }, label: e.label || "" });
    }
  });
  state.selected = new Set(pasted.map(n => n.id));
  state.selectedCanvasGroupId = groupMap.size === 1 && pasted.every(node => node.canvasGroupId === pasted[0].canvasGroupId) ? pasted[0].canvasGroupId : "";
  pushHistory();
  render();
  toast(`已粘贴 ${pasted.length} 个节点`);
}

function addEdge(fromNode, toNode) {
  if (fromNode === toNode) return toast("不能连接到自己");
  if (findNode(fromNode)?.type === "screenshot-input") return toast("截图功能节点只接收输入，不能向后连接");
  const target = findNode(toNode);
  if (!target) return;
  if (state.edges.some(e => e.from.node === fromNode && e.to.node === toNode)) return toast("这两个端口已经连接");
  let replacedAngleInputs = 0;
  if (target.type === "angle-image") {
    const before = state.edges.length;
    state.edges = state.edges.filter(e => e.to.node !== toNode);
    replacedAngleInputs = before - state.edges.length;
  }
  state.edges.push({ id: uid("e"), from: { node: fromNode, port: "out" }, to: { node: toNode, port: "in" }, label: "" });
  if (state.settings.autoAlign !== false) {
    const source = findNode(fromNode);
    autoAlignEdgeTarget(source, target);
  }
  if (target.type === "angle-image") {
    console.log("[角度变化] 输入连线已更新", { nodeId: toNode, sourceNodeId: fromNode, replaced: replacedAngleInputs });
  }
  if (target.type === "ai-video") refreshAiVideoPrompt(toNode);
  pushHistory();
  render();
  if (replacedAngleInputs) toast("已断开旧参考图并接入新图片");
}

function removeEdge(id) {
  const edge = state.edges.find(e => e.id === id);
  state.edges = state.edges.filter(e => e.id !== id);
  if (edge) {
    for (const nodeId of [edge.from.node, edge.to.node]) {
      if (findNode(nodeId)?.type === "ai-video") refreshAiVideoPrompt(nodeId);
    }
  }
  pushHistory();
  render();
}

function insertNodeIntoEdge(edgeId, nodeId) {
  const edge = state.edges.find(item => item.id === edgeId);
  const node = findNode(nodeId);
  if (!edge || !edgeInsertableNode(node)) return false;
  const fromNode = findNode(edge.from.node);
  const toNode = findNode(edge.to.node);
  if (!fromNode || !toNode) return false;
  if (state.edges.some(item => item.id !== edgeId && item.from.node === fromNode.id && item.to.node === nodeId)
    || state.edges.some(item => item.id !== edgeId && item.from.node === nodeId && item.to.node === toNode.id)) {
    toast("插入失败：节点与连线两端已存在相同连线");
    return false;
  }
  state.edges = state.edges.filter(item => item.id !== edgeId);
  if (node.type === "angle-image") state.edges = state.edges.filter(item => item.to.node !== nodeId);
  if (toNode.type === "angle-image") state.edges = state.edges.filter(item => item.to.node !== toNode.id);
  state.edges.push({ id: uid("e"), from: { node: fromNode.id, port: "out" }, to: { node: nodeId, port: "in" }, label: edge.label || "" });
  state.edges.push({ id: uid("e"), from: { node: nodeId, port: "out" }, to: { node: toNode.id, port: "in" }, label: "" });
  pushHistory();
  render();
  toast("已将节点插入连线，自动连接两端");
  console.log("[连线插入] 节点已接入原连线两端", { previous: `${fromNode.id} -> ${toNode.id}`, inserted: nodeId });
  return true;
}

function renameEdge(id) {
  const edge = state.edges.find(item => item.id === id);
  if (!edge) return;
  const value = prompt(translateUiString("连线名称（留空表示不显示）"), edge.label || "");
  if (value === null) return;
  edge.label = value.trim().slice(0, 80);
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

function isImage25StandardModel(model) {
  return model === "gpt-image-2.5";
}

// ---- 模型目录（model-catalog.js）访问层：模型列表/画质档/分辨率档均由目录驱动 ----
function activeApiType() {
  const value = state.settings.apiType;
  return value === "agtoken" ? "agtoken" : "apimart";
}

function activeCatalog(apiType = activeApiType()) {
  const fallback = {
    defaultModel: "gpt-image-2.5-flare",
    models: [
      { id: "gpt-image-2", label: "GPT Image 2（ext · 便宜）", quality: false, qualities: [], resolutions: ["1k", "2k", "4k"], sizes: ["1:1", "auto", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"] },
      { id: "gpt-image-2.5-flare", label: "GPT Image 2.5 Flare（快速）", quality: false, qualities: [], resolutions: ["1k", "2k", "4k"], sizes: ["1:1", "auto", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "21:9"] },
      { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst（质量）", quality: false, qualities: [], resolutions: ["1k", "2k", "4k"], sizes: ["1:1", "auto", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "21:9"] },
      { id: "gemini-3.1-flash-image-preview", label: "Nano Banana 2", quality: false, qualities: [], resolutions: ["1k", "2k", "4k"], sizes: ["1:1", "auto", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"] },
    ],
  };
  const catalog = (window.CANVASFLOW_MODEL_CATALOG || {})[apiType];
  return catalog && Array.isArray(catalog.models) && catalog.models.length ? catalog : fallback;
}

function modelCatalogEntry(model, apiType = activeApiType()) {
  return activeCatalog(apiType).models.find(item => item.id === model) || null;
}

// PR-5 图片批注：模型参考图上限只采信目录里来源明确的 maxImages 声明（如 APIMart 文档 image_urls ≤16、Nano Banana Pro ≤14）。
// 未声明的模型视为上限未知 → 返回 0，发送准备将保守跳过定位图（仅坐标说明提交），不把任何历史数值当作通用模型能力。
function annotationModelImageLimit(settings) {
  const entry = modelCatalogEntry(settings?._model, settings?._apiType || activeApiType());
  return Number.isFinite(entry?.maxImages) && entry.maxImages > 0 ? entry.maxImages : 0;
}

function catalogModels() {
  return activeCatalog().models.filter(model => !model.hidden);
}

// ---- 拓展（扩展服务 + 拓展节点）----
// 拓展 = 拓展文件夹里遵守《拓展脚本规范.md》的文件夹工具，由扩展服务扫描并通过
// HTTP 暴露；画布里表现为 tool-node，执行时把上游图片发给服务、结果回画布。

function extensionSettings() {
  let cfg = state.settings.extensions;
  if (!cfg || typeof cfg !== "object") cfg = state.settings.extensions = {};
  if (typeof cfg.serviceUrl !== "string" || !cfg.serviceUrl.trim()) cfg.serviceUrl = DEFAULT_EXTENSION_SERVICE_URL;
  if (!Array.isArray(cfg.order)) cfg.order = [];
  if (!Array.isArray(cfg.disabled)) cfg.disabled = [];
  return cfg;
}

const toolExtensionCache = { list: [], invalid: [], at: 0, online: false, baseDir: "" };

async function fetchToolExtensions(refresh = false) {
  const cfg = extensionSettings();
  const base = cfg.serviceUrl.replace(/\/+$/, "");
  try {
    let data;
    if (desktop?.apiRequest) {
      // 桌面版：扩展服务内置在桌面端，无需外部服务
      const resp = await apiFetch(refresh ? "/api/extensions/refresh" : "/api/extensions", { method: refresh ? "POST" : "GET" });
      data = await resp.json();
    } else {
      const resp = await fetch(refresh ? `${base}/api/extensions/refresh` : `${base}/api/extensions`, {
        method: refresh ? "POST" : "GET",
      });
      data = await resp.json();
    }
    if (!data.ok) throw new Error(data.error || "服务响应异常");
    toolExtensionCache.list = Array.isArray(data.extensions) ? data.extensions : [];
    toolExtensionCache.invalid = Array.isArray(data.invalid) ? data.invalid : [];
    toolExtensionCache.baseDir = String(data.baseDir || "");
    toolExtensionCache.online = true;
  } catch (error) {
    console.warn("[拓展] 扩展服务不可达", { serviceUrl: base, message: error.message });
    toolExtensionCache.online = false;
    if (!refresh) toolExtensionCache.list = [];
  } finally {
    toolExtensionCache.at = Date.now();
  }
  return toolExtensionCache.list;
}

function enabledToolExtensions() {
  const cfg = extensionSettings();
  const order = new Map(cfg.order.map((id, index) => [id, index]));
  return toolExtensionCache.list
    .filter(ext => ext && ext.id && !cfg.disabled.includes(ext.id))
    .sort((a, b) =>
      (order.has(a.id) ? order.get(a.id) : 9999) - (order.has(b.id) ? order.get(b.id) : 9999)
      || String(a.name || a.id).localeCompare(String(b.name || b.id), "zh"));
}

function toolNodeHeightFor(params, columns = 1) {
  // 描述 + 合并开关行 + 参数区（文本/下拉/滑块为"标签在上"的高行，开关为矮行）+ 状态行预留 + 执行按钮
  const list = params || [];
  const boxCount = list.filter(param => param.type !== "toggle").length;
  const toggleCount = list.length - boxCount;
  if (columns === 2) {
    const rows = Math.ceil(list.length / 2);
    return 144 + rows * (boxCount ? 54 : 30) + 30;
  }
  return 144 + boxCount * 54 + toggleCount * 30 + 30;
}

function addToolNode(ext, x = 160, y = 120) {
  const params = Array.isArray(ext.params) ? ext.params : [];
  const node = addNode("tool-node", x, y, false, { height: toolNodeHeightFor(params, ext.columns) });
  node.toolMeta = {
    id: ext.id,
    name: ext.name || ext.id,
    description: ext.description || "",
    output: ext.output || "images",
    params,
    columns: ext.columns === 2 ? 2 : 1,
    timeout: ext.timeout || 600,
  };
  node.toolName = node.toolMeta.name;
  node.toolValues = {};
  for (const param of node.toolMeta.params) node.toolValues[param.key] = param.default;
  node.toolStatus = null;
  pushHistory();
  render();
  return node;
}

function toolMimeFromName(name) {
  const ext = String(name || "").split(".").pop().toLowerCase();
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
}

function toolNodeBody(node) {
  const meta = node.toolMeta;
  if (!meta) return `<div class="tool-node-desc">拓展信息缺失，请删除后从右键菜单重新添加。</div>`;
  const params = meta.params || [];
  const whitePoint = node.toolValues?.whitePoint ?? params.find(param => param.key === "whitePoint")?.default;
  const controls = params.filter(param =>
    !(meta.id === "image-vectorize" && param.key === "preset")
      && (!isLinkedUpscaleNode(node) || param.key !== "strength" || whitePoint)
  ).map(param => {
    const value = node.toolValues?.[param.key] ?? param.default;
    const label = `<span class="tool-param-label">${escapeHtml(param.label || param.key)}</span>`;
    const attrs = `data-role="tool-param" data-key="${escapeHtml(param.key)}"`;
    if (param.type === "toggle") {
      // 开关：参数名称在前，选项在后
      return `<label class="tool-param">${label}<label class="tool-param-toggle"><input type="checkbox" ${attrs} data-param-type="toggle" ${value ? "checked" : ""}></label></label>`;
    }
    if (param.type === "select") {
      const options = (param.options || []).map(option => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");
      return `<label class="tool-param stacked">${label}<select ${attrs} data-param-type="select">${options}</select></label>`;
    }
    if (param.type === "text") {
      return `<label class="tool-param stacked">${label}<input type="text" ${attrs} data-param-type="text" value="${escapeHtml(String(value ?? ""))}"></label>`;
    }
    const bounds = `${param.min != null ? ` min="${param.min}"` : ""}${param.max != null ? ` max="${param.max}"` : ""}`;
    return `<label class="tool-param stacked">${label}<input type="number" ${attrs} data-param-type="slider" value="${Number(value) || 0}"${bounds}></label>`;
  }).join("");
  const status = node.toolStatus
    ? `<div class="tool-node-status tool-status-${node.toolStatus.state}">${escapeHtml(node.toolStatus.message || "")}</div>`
    : "";
  return `<div class="tool-node-desc">${escapeHtml(meta.description)}</div><div class="tool-node-params${meta.columns === 2 ? " cols-2" : ""}">${controls}</div>${status}<button class="tool-run-btn" data-role="tool-run" type="button" ${node.toolRunning ? "disabled" : ""}>${node.toolRunning ? "运行中…" : "执行"}</button>`;
}

async function runToolNode(nodeId) {
  const node = findNode(nodeId);
  if (!node || node.type !== "tool-node" || node.toolRunning) return;
  if (!node.toolMeta) { toast("拓展信息缺失，请删除后重新添加"); return; }
  node.toolRunning = true;
  node.toolStatus = { state: "running", message: "收集输入图片…" };
  renderNodes();
  try {
    const collected = collectUpstreamForAI(nodeId, buildIncomingIndex());
    let refs;
    if (node.toolMeta.id === "image-to-pptx") {
      const seen = new Set();
      refs = [];
      for (const branch of [...collected.branches.map(item => item.images), ...(collected.groupImages.length ? [collected.groupImages] : [])]) {
        for (const ref of branch) {
          // 组节点多张图共用同一节点 id，去重键优先用素材/内容标识
          const key = ref.assetId || ref.image || ref._nodeId;
          if (key && seen.has(key)) continue;
          if (key) seen.add(key);
          refs.push(ref);
        }
      }
    } else {
      refs = collected.images;
    }
    if (!refs.length) throw new Error("没有输入图片：请先连接图片节点");
    // 输入顺序：按来源节点画布纵坐标从上到下（同高按 x 从左到右），pptx 等拓展的页序随之可预期
    refs.sort((a, b) => (a._y ?? a.y ?? 0) - (b._y ?? b.y ?? 0) || (a._x ?? a.x ?? 0) - (b._x ?? b.x ?? 0));
    const payloadImages = [];
    for (let index = 0; index < refs.length; index++) {
      const ref = refs[index];
      node.toolStatus = { state: "running", message: `读取图片 ${index + 1}/${refs.length}…` };
      renderNodes();
      const url = await materializeReferenceImage(ref);
      if (!url) throw new Error(`无法读取图片：${ref.fileName || "未命名图片"}`);
      const dataUrl = await fetchImageAsBase64(url);
      const comma = dataUrl.indexOf(",");
      const extFromName = String(ref.fileName || "").split(".").pop().toLowerCase();
      const ext = ["jpg", "jpeg", "png", "webp"].includes(extFromName)
        ? extFromName
        : ref.mime === "image/jpeg" ? "jpg" : ref.mime === "image/webp" ? "webp" : "png";
      // 工具脚本按文件名排序读取 input/，用三位序号命名让页序严格等于画布自上而下的节点顺序
      payloadImages.push({ name: `${String(index + 1).padStart(3, "0")}.${ext}`, data: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl });
    }
    const cfg = extensionSettings();
    const base = cfg.serviceUrl.replace(/\/+$/, "");
    node.toolStatus = { state: "running", message: "拓展运行中…（可能需要数分钟）" };
    renderNodes();
    const runUrl = `/api/extensions/${encodeURIComponent(node.toolMeta.id)}/run`;
    const runInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: payloadImages, params: node.toolValues || {} }),
    };
    const resp = desktop?.apiRequest ? await apiFetch(runUrl, runInit) : await fetch(`${base}${runUrl}`, runInit);
    const data = await resp.json().catch(() => ({ ok: false, error: "服务响应不是合法 JSON" }));
    if (!resp.ok || !data.ok) throw new Error(data.error || `服务返回状态 ${resp.status}`);
    if (canvasGroupNodeRunIsStopped(node)) { node.toolStatus = { state: "cancelled", message: "编组运行已停止，结果已丢弃" }; return; }

    const outputNodeIds = [];
    let seq = 0;
    for (const image of data.images || []) {
      seq++;
      const mime = toolMimeFromName(image.name);
      const imgNode = addNode("image", node.x + NODE_WIDTH + 40, node.y + (seq - 1) * IMAGE_NODE_VERTICAL_STEP, false);
      imgNode.image = `data:${mime};base64,${image.data}`;
      imgNode.fileName = image.name || `tool_${seq}.png`;
      imgNode.mime = mime;
      imgNode.toolSourceNodeId = node.id;
      outputNodeIds.push(imgNode.id);
      await externalizeImageField(imgNode, "image", "imageAssetId", imgNode.fileName);
    }
    let savedPaths = [];
    if (node.toolMeta.id === "image-vectorize") {
      data.files?.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }
    if ((data.files || []).length) {
      // 直接走服务器落盘到 export/拓展输出/，不走 saveFiles（其 zipExport 默认分支会把文件打包成 zip 下载到浏览器下载目录，用户找不到）
      const baseFolder = state.settings.exportFolderLabel || "export";
      const resp2 = await apiFetch("/api/save-export-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderName: "拓展输出",
          baseFolder,
          files: (data.files || []).map(file => ({ name: file.name, data: file.data })),
        }),
      });
      const result2 = await resp2.json();
      if (result2.error) throw new Error(result2.error);
      savedPaths = (result2.files || []).map(p => String(p));
      if (!savedPaths.length) {
        const baseDir = baseFolder === "export" ? (runtimeExportFolder || "export") : baseFolder;
        savedPaths = (data.files || []).map(file => `${baseDir}/拓展输出/${file.name}`);
      }
    }
    if (node.toolMeta.id === "image-vectorize") {
      for (const [index, file] of (data.files || []).entries()) {
        if (!/\.svg$/i.test(file.name)) continue;
        const preview = addNode("image", node.x + NODE_WIDTH + 40, node.y + seq * IMAGE_NODE_VERTICAL_STEP, false);
        preview.mime = "image/svg+xml";
        preview.image = `data:${preview.mime};base64,${file.data}`;
        preview.fileName = String(savedPaths[index] || file.name).split(/[\\/]/).pop();
        preview.toolSourceNodeId = node.id;
        seq++;
      }
    }
    if (isLinkedUpscaleNode(node)) node.toolOutputNodeIds = outputNodeIds;
    node.toolOutputFiles = savedPaths;
    node.toolStatus = {
      state: "done",
      message: (data.files || []).length
        ? `完成（${data.duration ?? "?"} 秒）：${savedPaths.join("，")}`
        : `完成（${data.duration ?? "?"} 秒）`,
    };
    pushHistory();
    render();
    const parts = [];
    if ((data.images || []).length) parts.push(`${data.images.length} 张图片`);
    if ((data.files || []).length) parts.push(`${data.files.length} 个文件`);
    toast(`拓展「${node.toolMeta.name}」完成：${parts.join("、") || "无输出"}`);
    if (savedPaths.length) toast(`文件已保存：${savedPaths.join("，")}`);
  } catch (error) {
    node.toolStatus = { state: "failed", message: error.message || String(error) };
    render();
    toast("拓展执行失败: " + (error.message || error));
  } finally {
    node.toolRunning = false;
    renderNodes();
  }
}

let _extensionRenderToken = 0;

async function renderExtensionsPage(refresh = false) {
  const token = ++_extensionRenderToken;
  const cfg = extensionSettings();
  els.extensionServiceUrl.value = cfg.serviceUrl;
  els.extensionServiceStatus.title = "检测中…";
  els.extensionServiceStatus.dataset.state = "checking";
  els.extensionServiceStatus.textContent = "检查中";
  els.extensionList.innerHTML = `<div class="extension-empty">检测中…</div>`;
  refreshCepPanelStatus();
  const list = await fetchToolExtensions(refresh);
  if (token !== _extensionRenderToken) return;
  if (!toolExtensionCache.online) {
    els.extensionServiceStatus.title = desktop?.apiRequest
      ? "桌面端拓展服务异常：请重启 CanvasFlow 后重试"
      : "扩展服务未启动：请到拓展文件夹双击 扩展服务.bat";
    els.extensionServiceStatus.dataset.state = "unavailable";
    els.extensionServiceStatus.textContent = "不可用";
    els.extensionList.innerHTML = `<div class="extension-empty">未检测到扩展服务</div>`;
    return;
  }
  const invalidCount = (toolExtensionCache.invalid || []).length;
  els.extensionServiceStatus.title = `扩展服务在线：${list.length} 个拓展${invalidCount ? `，${invalidCount} 个无效拓展` : ""}`;
  els.extensionServiceStatus.dataset.state = "ready";
  els.extensionServiceStatus.textContent = "服务可用";
  renderExtensionList(list);
}

function orderIndexOf(order, id) {
  const index = order.indexOf(id);
  return index === -1 ? 9999 : index;
}

function renderExtensionList(list) {
  const cfg = extensionSettings();
  const ordered = [...list].sort((a, b) =>
    orderIndexOf(cfg.order, a.id) - orderIndexOf(cfg.order, b.id)
    || String(a.name || a.id).localeCompare(String(b.name || b.id), "zh"));
  if (!ordered.length) {
    els.extensionList.innerHTML = `<div class="extension-empty">拓展文件夹中没有可用拓展</div>`;
    return;
  }
  els.extensionList.innerHTML = ordered.map(ext => {
    const enabled = !cfg.disabled.includes(ext.id);
    return `<div class="extension-item" data-ext-id="${escapeHtml(ext.id)}"${enabled ? "" : " data-disabled=\"1\""}>
      <span class="extension-drag-handle" title="拖动排序"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="5" r="1.7"/><circle cx="15" cy="5" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="19" r="1.7"/><circle cx="15" cy="19" r="1.7"/></svg></span>
      <div class="extension-item-info" title="${escapeHtml(ext.description || "")}"><div class="extension-item-text"><strong>${escapeHtml(ext.name || ext.id)}</strong>${ext.version ? `<span class="extension-item-ver">v${escapeHtml(ext.version)}</span>` : ""}<span class="extension-item-desc">${escapeHtml(ext.description || "")}</span></div></div>
      <span class="extension-toggle"><input type="checkbox" data-ext-toggle="${escapeHtml(ext.id)}" ${enabled ? "checked" : ""} title="启用后出现在画布右键“拓展”菜单"><span>启用</span></span>
    </div>`;
  }).join("");

  let dragId = null;
  els.extensionList.querySelectorAll(".extension-item").forEach(row => {
    const id = row.dataset.extId;
    const handle = row.querySelector(".extension-drag-handle");
    handle.addEventListener("pointerdown", () => { row.draggable = true; });
    handle.addEventListener("pointerup", () => { row.draggable = false; });
    row.addEventListener("dragstart", ev => {
      dragId = id;
      row.classList.add("dragging");
      ev.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      dragId = null;
      row.classList.remove("dragging");
      row.draggable = false;
      const newOrder = [...els.extensionList.querySelectorAll(".extension-item")].map(item => item.dataset.extId);
      const current = extensionSettings();
      if (newOrder.join("|") !== current.order.join("|")) {
        current.order = newOrder;
        pushHistory();
      }
    });
    row.addEventListener("dragover", ev => {
      if (!dragId || id === dragId) return;
      ev.preventDefault();
      const rect = row.getBoundingClientRect();
      const before = ev.clientY < rect.top + rect.height / 2;
      const dragging = els.extensionList.querySelector(".extension-item.dragging");
      if (dragging && dragging !== row) {
        els.extensionList.insertBefore(dragging, before ? row : row.nextSibling);
      }
    });
    row.querySelector("input[data-ext-toggle]").addEventListener("change", ev => {
      const current = extensionSettings();
      current.disabled = current.disabled.filter(value => value !== id);
      if (!ev.target.checked) current.disabled.push(id);
      row.toggleAttribute("data-disabled", !ev.target.checked);
      pushHistory();
    });
  });
  els.extensionList.addEventListener("dragover", ev => ev.preventDefault());
}

function activeApiKey(apiType = activeApiType()) {
  return apiType === "agtoken" ? (state.settings.agtokenApiKey || "") : (state.settings.apiKey || "");
}

function setActiveApiKey(value) {
  if (activeApiType() === "agtoken") state.settings.agtokenApiKey = value;
  else state.settings.apiKey = value;
}

function uniqueMultiNodeTemplateName(desired, library = globalLibrary) {
  const names = new Set((library.multiNodeTemplates || []).map(item => item.name));
  if (!names.has(desired)) return desired;
  let index = 2;
  while (names.has(`${desired} (${index})`)) index++;
  return `${desired} (${index})`;
}

function renameMultiNodeTemplate(id) {
  const loc = templateLocation("multi", id); if (!loc) return;
  const item = loc.library[loc.key][loc.index];
  const name = prompt(translateUiString("自定义组件名称"), item.name || "多节点模板");
  if (name === null || !name.trim()) return;
  const desired = name.trim();
  const otherNames = new Set(globalLibrary.multiNodeTemplates.filter(template => template.id !== id).map(template => template.name));
  let finalName = desired, suffix = 2;
  while (otherNames.has(finalName)) finalName = `${desired} (${suffix++})`;
  item.name = finalName;
  item.revision = (item.revision || 1) + 1;
  persistLibraries(); syncCustomMaterialsList();
  toast("多节点模板已重命名");
}

function image25ExtVersion(model) {
  if (model === "gpt-image-2.5-flare") return "flare";
  if (model === "gpt-image-2.5-sunburst") return "sunburst";
  return "";
}

function isImage25ExtModel(model) {
  return Boolean(image25ExtVersion(model));
}

function isImage25Model(model) {
  return isImage25StandardModel(model) || isImage25ExtModel(model);
}

function modelSupportsQuality(model) {
  return Boolean(modelCatalogEntry(model)?.quality);
}

// AI 对话（chat）节点：模型目录与工具函数。对话与绘图是两套目录、两套网关格式，互不回退。
// 下拉只显示已填 key 的站点：只填一家只出该站点模型,两家都填才全部显示;都没填时不显示模型，提示填写 API Key。
// 自定义 OpenAI 兼容站点存 settings.chatCustomSites，key 存 settings.chatCustomKeys（按站点 id；
// 落盘剥离、桌面模式经 secrets "chatcustom:<siteId>" 槽持久化）；模型 id 形如 "custom:<siteId>:<modelName>"。
function chatCustomSites() {
  const sites = state?.settings?.chatCustomSites;
  if (!Array.isArray(sites)) return [];
  return sites.filter(site => site && site.id && typeof site.baseUrl === "string");
}

function chatCustomSiteById(siteId) {
  return chatCustomSites().find(site => site.id === siteId) || null;
}

function chatCustomSiteKey(siteId) {
  const keys = state?.settings?.chatCustomKeys;
  return keys && typeof keys === "object" ? String(keys[siteId] || "").trim() : "";
}

function chatModelEnabled(modelId) {
  const disabled = state?.settings?.chatDisabledModels;
  return !(Array.isArray(disabled) && disabled.includes(modelId));
}

// 内置站点的模型列表：settings.chatSiteModels[site] 有值（拉取/手动编辑过的）用之，
// 否则用目录默认（非 hidden）。拉取与手动增删只改这份列表，勾选开关仍走 chatDisabledModels。
function chatSiteKeyReady(site) {
  return String(site === "agtoken" ? state?.settings?.agtokenApiKey : state?.settings?.apiKey || "").trim().length > 0;
}

function chatBuiltinModelIds(site) {
  const explicit = state?.settings?.chatSiteModels?.[site];
  if (Array.isArray(explicit)) return explicit.map(item => String(item || "").trim()).filter(Boolean);
  return (window.CANVASFLOW_CHAT_CATALOG?.models || [])
    .filter(model => model.apiType === site && !model.hidden)
    .map(model => model.id);
}

function chatSiteModelsCustomized(site) {
  return Array.isArray(state?.settings?.chatSiteModels?.[site]);
}

function chatBuiltinModelEntry(site, modelId) {
  const known = (window.CANVASFLOW_CHAT_CATALOG?.models || []).find(model => model.id === modelId && model.apiType === site);
  if (known) return known;
  // 拉取/手动添加的未知模型：默认纯文本（多模态未知时不发参考图，安全侧）
  return { id: modelId, label: modelId, apiType: site, multimodal: false };
}

// 自定义站点派生模型条目：就绪条件 = baseUrl + 至少一个模型名（key 可选，本地服务通常无需 key）
function chatCustomModels() {
  const models = [];
  for (const site of chatCustomSites()) {
    const baseUrl = String(site.baseUrl || "").trim();
    const names = Array.isArray(site.modelNames) ? site.modelNames.map(item => String(item || "").trim()).filter(Boolean) : [];
    if (!baseUrl || !names.length) continue;
    const siteLabel = String(site.name || "").trim() || "自定义站点";
    for (const name of names) {
      models.push({
        id: `custom:${site.id}:${name}`,
        label: `${siteLabel}·${name}`,
        apiType: "custom",
        multimodal: site.multimodal === true,
        model: name,
        siteId: site.id,
      });
    }
  }
  return models;
}

function chatCatalogModels() {
  const out = [];
  const seen = new Set();
  for (const site of ["apimart", "agtoken"]) {
    if (!chatSiteKeyReady(site)) continue;
    for (const id of chatBuiltinModelIds(site)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const entry = chatBuiltinModelEntry(site, id);
      if (chatModelEnabled(entry.id)) out.push(entry);
    }
  }
  for (const model of chatCustomModels()) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    if (chatModelEnabled(model.id)) out.push(model);
  }
  return out;
}

function parseCustomChatModelId(modelId) {
  const raw = String(modelId || "");
  if (!raw.startsWith("custom:")) return null;
  const rest = raw.slice("custom:".length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const siteId = rest.slice(0, sep);
  const modelName = rest.slice(sep + 1).trim();
  if (!siteId || !modelName) return null;
  const site = chatCustomSiteById(siteId);
  if (!site) return null;
  const siteLabel = String(site.name || "").trim() || "自定义站点";
  return {
    id: raw,
    label: `${siteLabel}·${modelName}`,
    apiType: "custom",
    multimodal: site.multimodal === true,
    model: modelName,
    siteId,
  };
}

function chatModelEntry(modelId) {
  const custom = parseCustomChatModelId(modelId);
  if (custom) return custom;
  const raw = String(modelId || "");
  // 先查两站点的当前列表（覆盖拉取/手动添加的非目录模型）
  for (const site of ["apimart", "agtoken"]) {
    if (chatBuiltinModelIds(site).includes(raw)) {
      return chatSiteKeyReady(site) ? chatBuiltinModelEntry(site, raw) : null;
    }
  }
  // 目录兜底（含 hidden：老节点存量模型不受列表重构影响）
  const model = (window.CANVASFLOW_CHAT_CATALOG?.models || []).find(item => item.id === modelId) || null;
  if (!model) return null;
  return chatSiteKeyReady(model.apiType) ? model : null;
}

function createChatSession(node, overrides = {}) {
  const now = Date.now();
  const session = { id: uid("chat-session"), title: "新对话", closed: false, model: node?._chatModel || chatCatalogModels()[0]?.id || "", enumerated: false, messages: [], text: "", draft: "", attachments: [], createdAt: now, updatedAt: now, ...overrides };
  session.title = String(session.title || "新对话").trim() || "新对话";
  return session;
}

function chatSessionTitleFromMessages(messages) {
  const first = (messages || []).find(message => message?.role === "user" && String(message.content || "").trim());
  if (!first) return "";
  const text = String(first.content).replace(/\s+/g, " ").trim();
  return text.length > 18 ? `${text.slice(0, 18)}…` : text;
}

function normalizeChatSession(session, node) {
  const now = Date.now();
  const fallbackId = session?.id || uid("chat-session");
  const fallbackModel = node?._chatModel || chatCatalogModels()[0]?.id || "";
  const messages = Array.isArray(session?.messages) ? session.messages : [];
  return { ...session, id: String(fallbackId), title: String(session?.title || "新对话").trim() || "新对话", closed: session?.closed === true, model: String(session?.model || fallbackModel), enumerated: session?.enumerated === true, messages: messages.filter(item => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string" && item.content.trim()).slice(-CHAT_HISTORY_LIMIT), text: String(session?.text || ""), draft: String(session?.draft || ""), attachments: Array.isArray(session?.attachments) ? session.attachments : [], createdAt: Number(session?.createdAt) || now, updatedAt: Number(session?.updatedAt) || now };
}

function activeChatSession(node) {
  return node?.chatSessions?.find(session => session.id === node.activeChatSessionId) || null;
}

function allChatAttachments(node) {
  const attachments = [...(node?.chatAttachments || [])];
  for (const session of node?.chatSessions || []) attachments.push(...(session.attachments || []));
  return attachments.filter((item, index, items) => item && items.indexOf(item) === index);
}

function saveActiveChatSession(node, touch = false) {
  const session = activeChatSession(node);
  if (!session) return null;
  session.model = node._chatModel || "";
  session.enumerated = node._chatEnumerated === true;
  session.messages = node.chatMessages || [];
  session.text = node.chatText || "";
  session.draft = node.chatDraft || "";
  session.attachments = node.chatAttachments || [];
  if (touch) session.updatedAt = Date.now();
  return session;
}

function loadChatSession(node, sessionId) {
  const session = node.chatSessions?.find(item => item.id === sessionId);
  if (!session) return false;
  node.activeChatSessionId = session.id;
  session.closed = false;
  node._chatModel = session.model || chatCatalogModels()[0]?.id || "";
  node._chatEnumerated = session.enumerated === true;
  node.chatMessages = session.messages;
  node.chatText = session.text;
  node.chatDraft = session.draft;
  node.chatAttachments = session.attachments;
  node._chatError = "";
  return true;
}

function ensureChatSessions(node) {
  if (!Array.isArray(node.chatSessions) || !node.chatSessions.length) {
    const migrated = createChatSession(node, { title: chatSessionTitleFromMessages(node.chatMessages) || "对话 1", model: node._chatModel, enumerated: node._chatEnumerated === true, messages: Array.isArray(node.chatMessages) ? node.chatMessages : [], text: node.chatText || "", draft: node.chatDraft || "", attachments: Array.isArray(node.chatAttachments) ? node.chatAttachments : [] });
    node.chatSessions = [migrated];
    node.activeChatSessionId = migrated.id;
  } else {
    saveActiveChatSession(node);
    node.chatSessions = node.chatSessions.map(session => normalizeChatSession(session, node));
    if (!node.chatSessions.some(session => session.id === node.activeChatSessionId)) node.activeChatSessionId = node.chatSessions.find(session => !session.closed)?.id || node.chatSessions[0].id;
    loadChatSession(node, node.activeChatSessionId);
  }
}

function normalizeChatNode(node) {
  // 尺寸不强制:节点支持拖拽缩放(与文字节点一致),只钳制最小值;新建默认 380×380
  node.w = Math.max(280, Number(node.w) || CHAT_NODE_WIDTH);
  node.h = Math.max(220, Number(node.h) || CHAT_NODE_HEIGHT);
  ensureChatSessions(node);
  const messages = Array.isArray(node.chatMessages) ? node.chatMessages : [];
  node.chatMessages = messages
    .filter(item => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string" && item.content.trim())
    .slice(-CHAT_HISTORY_LIMIT);
  // 回退以"当前可见集合"为准：key 被清、模型被勾选关闭、自定义站点被删，节点都自动切到第一个可用模型
  if (!chatCatalogModels().some(model => model.id === node._chatModel)) node._chatModel = chatCatalogModels()[0]?.id || "";
  node._chatEnumerated = node._chatEnumerated === true;
  node.chatAttachments = (Array.isArray(node.chatAttachments) ? node.chatAttachments : [])
    .filter(item => item && (typeof item.image === "string" || typeof item.assetId === "string"))
    .map(item => ({
      id: String(item.id || uid("chat-image")),
      image: String(item.image || ""),
      assetId: String(item.assetId || ""),
      fileName: String(item.fileName || "对话附件.png"),
      mime: String(item.mime || "image/png"),
    }))
    .filter(item => item.image || item.assetId)
    .slice(0, CHAT_MAX_REFERENCE_IMAGES);
  // 内测旧字段 chatResult 平滑迁移为 chatText
  if (node.chatText === undefined && node.chatResult !== undefined) node.chatText = node.chatResult;
  delete node.chatResult;
  // chatText 仅保留旧版兼容与最新输出；新消息草稿使用 chatDraft。
  node.chatText = String(node.chatText || "");
  if (node.chatDraft === undefined) {
    const legacy = findChatResultDivider(node.chatText);
    const hasLegacyDivider = node.chatText.split(/\r?\n/).some(line => CHAT_RESULT_DIVIDER_LINE_RE.test(line));
    node.chatDraft = hasLegacyDivider || !node.chatMessages.length ? legacy.prompt.trim() : "";
  }
  node.chatDraft = String(node.chatDraft || "");
  node._chatError = String(node._chatError || "");
  saveActiveChatSession(node);
  // 注意:这里不重置 _chatBusy/_chatAbort——模板每次渲染都会走本函数,
  // 运行时状态只能由存档加载路径清掉(见 loadProject 的 walkNodes)
  return node;
}

// 上游 content 可能是字符串，也可能是多模态内容数组（[{type:"text",...},...]），统一取文字
function chatContentToText(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map(part => (part && typeof part === "object" && typeof part.text === "string" ? part.text : "")).join("").trim();
  }
  return "";
}

// ---------- 提示词优化（文字节点 → 对话接口） ----------
// 优化规则与消息构造独立成纯函数，便于在不依赖 DOM 的测试中验证。

const PROMPT_OPTIMIZATION_INSTRUCTIONS = {
  image: "你是图像生成提示词编辑。请保留用户原意、专有名词、数量、变量占位符和明确限制；使主体、场景、构图、光线、色彩、风格更清晰。不要凭空加入品牌、人物身份或用户没有要求的细节。只输出可直接用于图像生成的优化后提示词，不要解释。",
  chat: "你是 AI 对话提示词编辑。请保留用户原意、专有名词、数量、变量占位符和明确限制；使任务目标、必要上下文、约束条件和期望输出更清晰。不要编造事实或改变任务。只输出可直接发送的优化后提示词，不要解释。",
};

function buildPromptOptimizationMessages(source, mode) {
  const instruction = PROMPT_OPTIMIZATION_INSTRUCTIONS[mode];
  if (!instruction) throw new Error("未知的优化方向");
  return [
    { role: "system", content: instruction },
    { role: "user", content: String(source || "") },
  ];
}

function selectedPromptOptimizeModel(node, models = chatCatalogModels()) {
  return models.find(item => item.id === node?._promptOptimizeModel) || models[0] || null;
}

async function requestPromptOptimization(source, mode, modelId) {
  const entry = chatModelEntry(modelId);
  if (!entry) throw new Error("所选优化模型不可用，请先在设置 → API 中填写对应站点的 API Key");
  const payload = {
    apiType: entry.apiType,
    model: entry.apiType === "custom" ? entry.model : entry.id,
    stream: false,
    messages: buildPromptOptimizationMessages(source, mode),
  };
  if (entry.apiType === "custom") {
    const site = chatCustomSiteById(entry.siteId);
    payload.__chatCustom = { baseUrl: String(site?.baseUrl || "").trim(), siteId: entry.siteId };
    payload._apiKey = chatCustomSiteKey(entry.siteId);
  } else if (!desktop) {
    payload._apiKey = entry.apiType === "agtoken" ? (state.settings.agtokenApiKey || "") : (state.settings.apiKey || "");
  }
  const resp = await apiFetch("/api/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  const apiError = typeof data.error === "string" ? data.error : data.error?.message;
  if (resp.status === 404) {
    throw new Error(desktop
      ? "当前桌面程序没有对话接口：请保存画布并关闭窗口，再重新构建启动桌面版"
      : "本机服务没有对话接口：请重启「启动CanvasFlow服务.bat」后再试");
  }
  if (!resp.ok || data.error) throw new Error(apiError || `优化请求失败（HTTP ${resp.status}）`);
  // apimart 响应为 {code,data} 包装(data 内为标准 OpenAI 结构),其余为标准结构;按 choices 形状自适应解包
  const inner = data && typeof data === "object" && data.data && Array.isArray(data.data.choices) ? data.data : data;
  const optimized = chatContentToText(inner?.choices?.[0]?.message?.content);
  if (!optimized) throw new Error("模型没有返回优化后的提示词");
  return optimized;
}

// 同一节点同时只允许一个优化请求；对话框与节点按钮共同依据该集合禁用入口。
const promptOptimizationPending = new Set();
const imageKeywordReversePending = new Set();

// 只有显式确认才替换节点文字；结果为空或节点内容已被编辑时一律保留现状。
function applyPromptOptimization(nodeId, optimizedText, originalText) {
  const node = findNode(nodeId);
  if (!node) return { ok: false, message: "节点不存在，已保留原文" };
  const value = String(optimizedText || "").trim();
  if (!value) return { ok: false, message: "优化结果为空，已保留原文" };
  if (String(node.text || "") !== String(originalText || "")) return { ok: false, message: "节点内容已被编辑，已保留最新内容" };
  if (typeof node._promptOriginalText !== "string") node._promptOriginalText = String(originalText || "");
  node.text = value;
  publishScreenshotNodeCatalog();
  pushHistory();
  return { ok: true, message: "优化后的提示词已应用，可点击「还原」恢复原文" };
}

function restorePromptOptimizedText(nodeId) {
  const node = findNode(nodeId);
  if (!node || typeof node._promptOriginalText !== "string") return { ok: false, message: "" };
  node.text = node._promptOriginalText;
  delete node._promptOriginalText;
  publishScreenshotNodeCatalog();
  pushHistory();
  return { ok: true, message: "已还原优化前的提示词" };
}

function openPromptOptimizer(nodeId) {
  const node = findNode(nodeId);
  if (!node || node.type !== "text") return;
  const originalText = String(node.text || "");
  if (!originalText.trim()) return toast("请先输入需要优化的提示词");
  const models = chatCatalogModels();
  if (!models.length) return toast("请先在设置 → API 中填写对应站点的 API Key");
  document.querySelector(".prompt-optimizer-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "prompt-optimizer-overlay";
  overlay.innerHTML = `<div class="prompt-optimizer-dialog" role="dialog" aria-modal="true" aria-label="优化提示词">
    <div class="prompt-optimizer-head"><strong>优化提示词</strong><button type="button" data-action="close" aria-label="关闭">×</button></div>
    <div class="prompt-optimizer-controls"><label>优化方向<select data-field="mode"><option value="image">图像生成</option><option value="chat">AI 对话</option></select></label><label>优化模型<select data-field="model">${models.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join("")}</select></label></div>
    <div class="prompt-optimizer-comparison"><label>原文<textarea data-field="original" readonly></textarea></label><label>优化结果<textarea data-field="result" placeholder="点击「开始优化」生成结果；也可以在这里修改后再应用"></textarea></label></div>
    <p class="prompt-optimizer-status" role="status">优化会把原文发送给所选模型；确认结果后再应用到节点。</p>
    <div class="prompt-optimizer-actions"><button type="button" data-action="close">取消</button><button type="button" data-action="optimize">开始优化</button><button type="button" data-action="apply" disabled>应用到节点</button></div>
  </div>`;
  document.body.appendChild(overlay);
  const originalField = overlay.querySelector('[data-field="original"]');
  const resultField = overlay.querySelector('[data-field="result"]');
  const modeField = overlay.querySelector('[data-field="mode"]');
  const modelField = overlay.querySelector('[data-field="model"]');
  const status = overlay.querySelector(".prompt-optimizer-status");
  const optimize = overlay.querySelector('[data-action="optimize"]');
  const apply = overlay.querySelector('[data-action="apply"]');
  originalField.value = originalText;
  modelField.value = selectedPromptOptimizeModel(node, models)?.id || models[0].id;
  const close = () => overlay.remove();
  overlay.addEventListener("click", event => {
    if (event.target === overlay || event.target.closest('[data-action="close"]')) close();
  });
  overlay.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
  for (const selector of [modeField, modelField]) selector.addEventListener("change", () => {
    resultField.value = "";
    apply.disabled = true;
    status.textContent = "优化方向或模型已改变，请重新生成结果。";
  });
  resultField.addEventListener("input", () => { apply.disabled = !resultField.value.trim(); });
  optimize.addEventListener("click", async () => {
    optimize.disabled = true;
    apply.disabled = true;
    promptOptimizationPending.add(nodeId);
    status.textContent = "正在优化…";
    try {
      resultField.value = await requestPromptOptimization(originalText, modeField.value, modelField.value);
      apply.disabled = !resultField.value.trim();
      status.textContent = "请检查结果；只有点击「应用到节点」才会替换原文。";
    } catch (error) {
      status.textContent = `优化失败：${error.message || error}`;
    } finally {
      promptOptimizationPending.delete(nodeId);
      optimize.disabled = false;
    }
  });
  apply.addEventListener("click", () => {
    const result = applyPromptOptimization(nodeId, resultField.value, originalText);
    if (!result.ok) {
      status.textContent = result.message;
      return;
    }
    render();
    close();
    toast(result.message);
  });
  optimize.focus();
}

// 浏览器生图节点:把提示词/参考图交给浏览器扩展,在 Gemini/ChatGPT 等站点页面模拟人工操作并回收结果
function normalizeBrowserNode(node) {
  if (!BROWSER_SITES.some(site => site.id === node._browserSite) && node._browserSite !== "custom") node._browserSite = BROWSER_SITES[0].id;
  node._browserOrigin = String(node._browserOrigin || "").trim();
  node._browserNewConversation = node._browserNewConversation === true;
  node._browserError = String(node._browserError || "");
  node._browserStatus = String(node._browserStatus || "");
  return node;
}

// 自定义站点输入 → 规整 origin(https://host);内置站点直接返回 id,由本地服务映射到允许的 origin
function browserNodeSiteTarget(node) {
  if (node._browserSite !== "custom") return node._browserSite;
  const raw = String(node._browserOrigin || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeAiNodeSettings(node, fallback = {}, apiType = activeApiType()) {
if (!node || (node.type !== "ai-image" && node.type !== "screenshot-input")) return node;
  // 旧项目的官方渠道选择迁移到普通渠道，避免继续提交官方模型。
  if (apiType === "apimart" && node._model === "gemini-3-pro-image-preview-official") node._model = "gemini-3-pro-image-preview";
  const catalog = activeCatalog(apiType);
  if (node._model && !modelCatalogEntry(node._model, apiType)) {
    const target = fallback.model && modelCatalogEntry(fallback.model, apiType) ? fallback.model : catalog.defaultModel;
    console.warn("[AI节点] 模型在当前 API 类型下不可用，已回退默认模型", { model: node._model, apiType: activeApiType(), fallback: target });
    node._model = target;
  }
  node._model = node._model || fallback.model || catalog.defaultModel;
  const entry = modelCatalogEntry(node._model, apiType) || catalog.models.find(model => !model.hidden) || catalog.models[0];
  if (!entry.resolutions.includes(node._resolution)) {
    if (node._resolution) console.warn("[AI节点] 分辨率在当前模型下不可用，已调整", { model: node._model, resolution: node._resolution });
    node._resolution = entry.resolutions.includes(fallback.resolution) ? fallback.resolution : entry.resolutions[0];
  }
  if (!entry.sizes.includes(node._size)) {
    node._size = entry.sizes.includes(fallback.size) ? fallback.size : entry.sizes[0];
  }
  if (entry.quality) {
    let quality = node._quality || fallback.quality || (node.type === "screenshot-input" ? "low" : "medium");
    if (!entry.qualities.includes(quality)) {
      if (quality === "auto") quality = "medium";
      else if ((quality === "xhigh" || quality === "max") && entry.qualities.includes("high")) quality = "high";
      else quality = entry.qualities.includes("medium") ? "medium" : entry.qualities[0];
    }
    node._quality = quality;
  } else {
    node._quality = null;
  }
if (node.type === "screenshot-input" || node.type === "ai-image") node._count = Math.max(1, Math.min(4, Number(node._count) || 1));
return node;
}

function selectOptions(options, selected) {
  return options.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function imageModelOptions(selected) {
  return selectOptions(catalogModels().map(model => [model.id, model.label]), selected);
}

function imageModelPricingHtml(entry, node, apiType = activeApiType()) {
  if (apiType === "agtoken" && entry) {
    return '<div class="ai-model-pricing"><a href="https://agtoken.vip/pricing" target="_blank" rel="noopener noreferrer" title="在 AGToken 模型广场查看对应模型及渠道价格">AGToken · 查看模型广场价格 ↗</a></div>';
  }
  if (apiType !== "apimart" || !entry?.pricingUrl) return "";
  const hint = entry.id === "gpt-image-2"
    ? "打开后向下查看 gpt-image-2-ext（gpt-image-2）价格表；页面上方为官方版价格。"
    : "查看 APIMart 对应模型价格，以页面当前渠道和规格为准。";
  return '<div class="ai-model-pricing"><a href="' + escapeHtml(entry.pricingUrl) + '" target="_blank" rel="noopener noreferrer" title="' + escapeHtml(hint) + '">APIMart · 查看模型广场价格 ↗</a></div>';
}

function aiNodeControls(node) {
normalizeAiNodeSettings(node);
  const entry = modelCatalogEntry(node._model) || catalogModels()[0];
  const isGpt = entry.quality;
  const models = catalogModels().map(model => [model.id, model.label]);
  const resolutions = entry.resolutions.map(value => [value, value.toUpperCase()]);
  const qualities = entry.qualities.map(value => [value, value]);
  const ratios = entry.sizes.map(value => [value, value]);
  return `<div class="ai-node-settings">
    <label class="ai-model-field"><span>模型</span><select data-role="ai-model">${imageModelOptions(node._model)}</select></label>
    ${entry.id === "midjourney" ? `<label><span>版本</span><select data-role="ai-mj-version">${selectOptions(entry.versions.map(value => [value, value]), entry.versions.includes(node._mjVersion) ? node._mjVersion : entry.versions[0])}</select></label><label><span>速度</span><select data-role="ai-mj-speed">${selectOptions(entry.speeds.map(value => [value, value]), node._mjSpeed || "relax")}</select></label>` : `<label><span>分辨率</span><select data-role="ai-resolution">${selectOptions(resolutions, node._resolution)}</select></label>`}
    <label class="${isGpt ? "" : "hidden"}"><span>画质</span><select data-role="ai-quality">${selectOptions(qualities, node._quality || "medium")}</select></label>
    <label><span>比例</span><select data-role="ai-size">${selectOptions(ratios, node._size)}</select></label>
    <label><span>${entry.id === "midjourney" ? "任务次数" : "生成张数"}</span><select data-role="ai-count">${selectOptions([[1, "1"], [2, "2"], [3, "3"], [4, "4"]], node._count)}</select></label>
    ${imageModelPricingHtml(entry, node)}
  </div>`;
}

function normalizeAngleNodeSettings(node) {
  if (!node || node.type !== "angle-image") return node;
  const clampAngle = (value, fallback) => Math.max(-180, Math.min(180, Number.isFinite(Number(value)) ? Number(value) : fallback));
  node.anglePitch = clampAngle(node.anglePitch, 0);
  node.angleYaw = clampAngle(node.angleYaw, 0);
  node.angleRoll = clampAngle(node.angleRoll, 0);
  node.angleZoom = Number.isFinite(Number(node.angleZoom)) ? Number(node.angleZoom) : 1;
  node.angleReverseDirection = node.angleReverseDirection === true;
  node._model = "gemini-3.1-flash-image-preview";
  node._resolution = node._resolution || "1k";
  node._size = node._size || "1:1";
  return node;
}

function anglePrompt(node) {
  normalizeAngleNodeSettings(node);
  const horizontal = node.angleYaw;
  const vertical = -node.anglePitch;
  const roll = -node.angleRoll;
  let horizontalDirection = horizontal > 0 ? "左" : "右";
  if (node.angleReverseDirection) horizontalDirection = horizontalDirection === "左" ? "右" : "左";
  const changes = [];
  if (Math.abs(horizontal) >= 4) changes.push(`将观察视角向${horizontalDirection}水平旋转约 ${Math.abs(horizontal)}°`);
  if (Math.abs(vertical) >= 4) changes.push(`向${vertical > 0 ? "上" : "下"}垂直旋转约 ${Math.abs(vertical)}°`);
  if (Math.abs(roll) >= 3) changes.push(`将画面${roll > 0 ? "顺时针" : "逆时针"}旋转约 ${Math.abs(roll)}°`);
  if (node.angleZoom >= 1.05) changes.push("采用更近距离的构图");
  else if (node.angleZoom <= .95) changes.push("采用更远距离的构图");
  const viewpoint = changes.length
    ? `以参考图当前视角为基准，${changes.join("，")}。`
    : "以参考图当前视角为基准，保持原有观察角度、画面方向和构图距离。";
  return `${viewpoint}保持主体的造型、结构、比例、材质、颜色、图案、文字和品牌细节一致。保持主体位于画面中心，仅改变观察角度、透视关系和构图距离，不改变主体本身，不添加参考图中不存在的部件。`;
}

function resolvedAnglePrompt(node) {
  return String(node?.anglePromptCustom || "").trim() || anglePrompt(node);
}

function angleNodeControls(node) {
  normalizeAngleNodeSettings(node);
  const resolutions = [["1k", "1K"], ["2k", "2K"], ["4k", "4K"]];
  const ratios = ["1:1", "auto", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"].map(value => [value, value]);
  return `<div class="angle-node-settings">
    <label><span>分辨率</span><select data-role="angle-resolution">${selectOptions(resolutions, node._resolution)}</select></label>
    <label><span>比例</span><select data-role="angle-size">${selectOptions(ratios, node._size)}</select></label>
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
  const title = progress.error || progress.label;
  const progressValue = hasPercent ? ` aria-valuenow="${Math.round(progress.percent)}"` : "";
  return `<div class="ai-node-progress ai-progress-${progress.status}" role="progressbar" aria-label="${escapeHtml(title)}" aria-valuemin="0" aria-valuemax="100"${progressValue} title="${escapeHtml(title)}">
    <div class="ai-node-progress-track"><span class="${hasPercent ? "" : "indeterminate"}" style="${hasPercent ? `width:${progress.percent}%` : ""}"></span></div>
  </div>`;
}

function imageAspectStyle(node) {
  const ratio = Number(node?._previewAspect);
  return Number.isFinite(ratio) && ratio > 0 ? ` style="aspect-ratio:${ratio}"` : "";
}

// ===== PR-5 图片批注编辑层：图片节点内编辑点位/矩形批注 =====
// 图钉与定位图共用同一套归一化坐标（0–1，相对图片显示区域）与 ① 序号（CanvasFlowImageAnnotations.number），
// 保证画布标记位置与最终定位图标记一致。编辑态是视图状态（不进撤销栈），数据增删改才 pushHistory。

function annotationModule() {
  return window.CanvasFlowImageAnnotations || null;
}

function startImageAnnotationEditor(node) {
  if (!node || node.type !== "image" || (!node.image && !node.imageAssetId)) return;
  if (!annotationModule()) { toast("批注模块尚未加载，请刷新页面后重试"); return; }
  delete node._annotationEditingId;
  state.annotationEditorNodeId = node.id;
  render();
}

function exitImageAnnotationEditor() {
  if (!state.annotationEditorNodeId) return;
  state.annotationEditorNodeId = "";
  render();
}

// 编辑层标记：仅编辑态的图片节点渲染；图钉按归一化坐标百分比定位（相对批注操作面=图片实际显示区域）。
// 点位图钉的 left/top 用 clamp 做边界内偏移（PR5-UI-09C）：贴边锚点的徽章视觉上整体留在操作面内，
// 锚点数据（归一化坐标）不改动；矩形批注坐标已钳制在 0–1 且 border-box，天然不出界。
function imageAnnotationEditorMarkup(node) {
  const mod = annotationModule();
  if (!mod) return "";
  const PIN_HALF_PX = 11; // 徽章视觉半径：20px 徽章 + 1px 余量
  const pins = mod.readNodeAnnotations(node).map(item => {
    const pct = v => Math.round(v * 1000) / 10;
    const rect = item.type === "rectangle" ? `width:${pct(item.coordinates.width)}%;height:${pct(item.coordinates.height)}%;` : "";
    const editing = node._annotationEditingId === item.annotationId;
    const left = item.type === "rectangle" ? `${pct(item.coordinates.x)}%` : `clamp(${PIN_HALF_PX}px, ${pct(item.coordinates.x)}%, calc(100% - ${PIN_HALF_PX}px))`;
    const top = item.type === "rectangle" ? `${pct(item.coordinates.y)}%` : `clamp(${PIN_HALF_PX}px, ${pct(item.coordinates.y)}%, calc(100% - ${PIN_HALF_PX}px))`;
    return `<div class="image-annotation-pin ${item.type}${editing ? " is-editing" : ""}" data-role="annotation-pin" data-annotation-id="${escapeHtml(item.annotationId)}" style="left:${left};top:${top};${rect}">
      <span class="annotation-pin-number" aria-hidden="true">${mod.number(item.index)}</span>
      <button type="button" class="annotation-pin-delete" data-role="annotation-delete" data-annotation-id="${escapeHtml(item.annotationId)}" aria-label="删除批注${item.index}">×</button>
      ${editing ? `<div class="annotation-pin-editor"><textarea data-role="annotation-content" rows="2" placeholder="批注内容（可留空）">${escapeHtml(item.content)}</textarea><div class="annotation-pin-editor-actions"><button type="button" data-role="annotation-save" data-annotation-id="${escapeHtml(item.annotationId)}">确定</button></div></div>` : ""}
    </div>`;
  }).join("");
  return `<div class="image-annotation-editor" data-role="annotation-editor">
    <div class="image-annotation-surface" data-role="annotation-surface">${pins}</div>
  </div>`;
}

// 批注工具条独立于图片预览之外（图片下方）：编辑层此前把工具条作为流内子项排在
// 图片顶部并盖住上部批注点（PR5 验收发现的提示层遮挡）。移出后工具条不再遮挡
// 任何图钉/编号/文字，节点高度随编辑态自动撑高、退出即恢复。
function imageAnnotationToolbarMarkup() {
  return `<div class="image-annotation-toolbar"><span class="annotation-hint">点击添加点位，拖拽框选区域，点击标记可编辑</span><button type="button" data-role="annotation-done">完成</button></div>`;
}

// 操作面对齐图片实际显示区域：object-fit: contain 的留白不计入坐标（缩放/平移下按百分比自适应）
function positionAnnotationSurface() {
  const editor = els.nodes.querySelector('[data-role="annotation-editor"]');
  const surface = editor?.querySelector('[data-role="annotation-surface"]');
  if (!editor || !surface) return;
  const img = editor.closest(".image-preview")?.querySelector("img");
  let left = 0, top = 0, width = 100, height = 100;
  if (img && img.naturalWidth > 0 && img.clientWidth > 0 && img.clientHeight > 0) {
    const scale = Math.min(img.clientWidth / img.naturalWidth, img.clientHeight / img.naturalHeight);
    const dispW = img.naturalWidth * scale, dispH = img.naturalHeight * scale;
    left = (img.clientWidth - dispW) / 2 / img.clientWidth * 100;
    top = (img.clientHeight - dispH) / 2 / img.clientHeight * 100;
    width = dispW / img.clientWidth * 100;
    height = dispH / img.clientHeight * 100;
  }
  const pct = v => `${Math.round(v * 1000) / 1000}%`;
  surface.style.left = pct(left);
  surface.style.top = pct(top);
  surface.style.width = pct(width);
  surface.style.height = pct(height);
  clampAnnotationPinEditor(surface);
}

// 编辑中弹层自适应翻转（PR5-UI-09C）：贴右/下边缘的批注，180px 输入弹层按默认方向展开会越出
// 操作面被节点裁剪；按实测边界改向左/向上展开。仅调整视觉方向，不触碰批注数据。
function clampAnnotationPinEditor(surface) {
  const pin = surface.querySelector(".image-annotation-pin.is-editing");
  const popup = pin?.querySelector(".annotation-pin-editor");
  if (!pin || !popup) return;
  const surfaceRect = surface.getBoundingClientRect();
  const pinRect = pin.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  if (!surfaceRect.width || !surfaceRect.height) return;
  popup.classList.toggle("flip-left", popupRect.right > surfaceRect.right + 1);
  popup.classList.toggle("flip-up", popupRect.bottom > surfaceRect.bottom + 1 || pinRect.bottom > surfaceRect.bottom - 4);
}

function annotationSurfacePoint(surface, clientX, clientY) {
  const rect = surface.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
}

function addNodeAnnotation(node, partial) {
  const mod = annotationModule();
  if (!mod || !node) return null;
  const list = mod.readNodeAnnotations(node);
  // 新增批注一律分配全新 ID：normalize 的 legacy 回退 ID 按下标生成，删除重排后可能与既有 ID 撞车
  list.push({ annotationId: mod.makeAnnotationId(), ...partial });
  const written = mod.writeNodeAnnotations(node, list);
  return written.at(-1) || null;
}

function saveAnnotationContent(node, annotationId, content) {
  const mod = annotationModule();
  if (!mod || !node || !annotationId) return;
  const list = mod.readNodeAnnotations(node);
  const item = list.find(i => i.annotationId === annotationId);
  if (!item) return;
  const next = String(content ?? "");
  if (item.content === next) {
    delete node._annotationEditingId;
    render();
    return; // 内容无变化不进撤销栈
  }
  item.content = next;
  mod.writeNodeAnnotations(node, list);
  delete node._annotationEditingId;
  pushHistory();
  render();
}

function deleteNodeAnnotation(node, annotationId) {
  const mod = annotationModule();
  if (!mod || !node || !annotationId) return;
  mod.writeNodeAnnotations(node, mod.readNodeAnnotations(node).filter(i => i.annotationId !== annotationId));
  delete node._annotationEditingId;
  pushHistory();
  render();
}

// —— 编辑层事件（委托到 els.nodes；操作面上的按下不冒泡为画布/节点拖动） ——
let annotationDraft = null;

function annotationDraftRectEl(surface) {
  let el = surface.querySelector(".annotation-rect-draft");
  if (!el) {
    el = document.createElement("div");
    el.className = "annotation-rect-draft";
    surface.appendChild(el);
  }
  return el;
}

function updateAnnotationDraftRect(surface, start, end) {
  const el = annotationDraftRectEl(surface);
  el.style.left = `${Math.min(start.x, end.x) * 100}%`;
  el.style.top = `${Math.min(start.y, end.y) * 100}%`;
  el.style.width = `${Math.abs(end.x - start.x) * 100}%`;
  el.style.height = `${Math.abs(end.y - start.y) * 100}%`;
}

function clearAnnotationDraftRect(surface) {
  surface.querySelector(".annotation-rect-draft")?.remove();
}

els.nodes.addEventListener("pointerdown", ev => {
  const surface = ev.target.closest?.('[data-role="annotation-surface"]');
  if (!surface || ev.target.closest("[data-role='annotation-pin']")) return;
  const nodeEl = surface.closest(".node");
  const node = findNode(nodeEl?.dataset.id);
  if (!node || state.annotationEditorNodeId !== node.id) return;
  ev.preventDefault();
  ev.stopPropagation();
  surface.setPointerCapture?.(ev.pointerId);
  annotationDraft = { node, surface, startX: ev.clientX, startY: ev.clientY, startPoint: annotationSurfacePoint(surface, ev.clientX, ev.clientY), moved: false };
});

els.nodes.addEventListener("pointermove", ev => {
  if (!annotationDraft || ev.target.closest?.('[data-role="annotation-surface"]') !== annotationDraft.surface) return;
  if (!annotationDraft.moved && Math.hypot(ev.clientX - annotationDraft.startX, ev.clientY - annotationDraft.startY) >= 6) annotationDraft.moved = true;
  if (annotationDraft.moved) {
    updateAnnotationDraftRect(annotationDraft.surface, annotationDraft.startPoint, annotationSurfacePoint(annotationDraft.surface, ev.clientX, ev.clientY));
  }
});

els.nodes.addEventListener("pointerup", ev => {
  const draft = annotationDraft;
  annotationDraft = null;
  if (!draft) return;
  clearAnnotationDraftRect(draft.surface);
  const end = annotationSurfacePoint(draft.surface, ev.clientX, ev.clientY);
  const created = draft.moved
    ? addNodeAnnotation(draft.node, { type: "rectangle", coordinates: annotationModule().rectangleFromPoints(draft.startPoint, end), content: "" })
    : addNodeAnnotation(draft.node, { type: "point", coordinates: draft.startPoint, content: "" });
  if (created) {
    draft.node._annotationEditingId = created.annotationId; // 新增后立即进入内容编辑
    pushHistory();
    render();
    window.queueMicrotask(() => els.nodes.querySelector('[data-role="annotation-content"]')?.focus());
  }
});

els.nodes.addEventListener("keydown", ev => {
  if (ev.target.dataset?.role !== "annotation-content") return;
  if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing && ev.keyCode !== 229) {
    ev.preventDefault();
    const node = findNode(ev.target.closest(".node")?.dataset.id);
    saveAnnotationContent(node, ev.target.closest("[data-role='annotation-pin']")?.dataset.annotationId, ev.target.value);
  }
  if (ev.key === "Escape" && !ev.isComposing) {
    const node = findNode(ev.target.closest(".node")?.dataset.id);
    saveAnnotationContent(node, ev.target.closest("[data-role='annotation-pin']")?.dataset.annotationId, ev.target.value);
  }
});

// 批注内容输入期间推迟全量渲染（与其他节点文本编辑器同一保护），失焦时静默提交数据
els.nodes.addEventListener("focusout", ev => {
  if (ev.target.dataset?.role !== "annotation-content") return;
  const node = findNode(ev.target.closest(".node")?.dataset.id);
  const annotationId = ev.target.closest("[data-role='annotation-pin']")?.dataset.annotationId;
  const mod = annotationModule();
  if (!node || !annotationId || !mod) return;
  const list = mod.readNodeAnnotations(node);
  const item = list.find(i => i.annotationId === annotationId);
  if (!item || item.content === ev.target.value) return;
  item.content = ev.target.value;
  mod.writeNodeAnnotations(node, list);
  pushHistory();
});

function aiPendingDownloadButton(node) {
  const count = node._pendingResults?.items?.length || 0;
  if (!count || node.generating || node._redownloadBusy) return "";
  const label = count > 1 ? `重新下载结果（${count} 张未下载）` : "重新下载结果";
  return `<button type="button" class="ai-redownload-btn" data-role="ai-redownload" title="有 ${count} 张已生成结果下载失败，点击重新下载（结果链接约24小时内有效）">${label}</button>`;
}

function aiImageBody(node) {
  const controls = aiNodeControls(node);
  if (node.generating) {
    return `<div class="ai-preview is-empty"><div class="ai-generating"><div class="ai-spinner"></div>生成中...</div></div>
      <div class="node-hover-controls">${controls}</div>`;
  }
  const redownloadButton = aiPendingDownloadButton(node);
  if (node.generatedImage) {
    return `<div class="image-preview" title="双击放大预览"${imageAspectStyle(node)}><img src="${node.generatedImage}" alt="" draggable="false"></div>
      ${redownloadButton ? `<div class="ai-pending-download">${redownloadButton}</div>` : ""}
      <div class="node-hover-controls">
        <div class="ai-actions">
          <button data-role="ai-generate" class="ai-generate-btn">重新生成</button>
          <button data-role="clear-image">清除</button>
        </div>${controls}
      </div>`;
  }
  if (redownloadButton) {
    return `<div class="ai-preview is-empty ai-pending-download"><span>结果已生成，下载失败</span>${redownloadButton}</div>
      <div class="node-hover-controls">
        <div class="ai-actions">
          <button data-role="ai-generate" class="ai-generate-btn">生成</button>
        </div>
        ${controls}
      </div>`;
  }
  return `<div class="ai-preview is-empty">等待生成结果</div>
    <div class="node-hover-controls">
      <div class="ai-actions">
        <button data-role="ai-generate" class="ai-generate-btn">生成</button>
      </div>
      ${controls}
    </div>`;
}

// ---------- AI 视频节点（ai-video · agtoken 统一视频接口） ----------

function videoCatalog() {
  return window.CANVASFLOW_VIDEO_CATALOG || { defaultModel: "", models: [] };
}

function videoCatalogEntry(modelId) {
  const catalog = videoCatalog();
  return catalog.models.find(model => model.id === modelId) || null;
}

function normalizeVideoNode(node) {
  if (!node || node.type !== "ai-video") return node;
  const catalog = videoCatalog();
  const entry = videoCatalogEntry(node._model) || catalog.models.find(model => model.apiType === "agtoken") || catalog.models[0];
  if (node._model && !videoCatalogEntry(node._model)) console.warn("[视频节点] 模型不可用，已回退默认模型", { model: node._model });
  node._model = entry?.id || catalog.defaultModel;
  if (entry) {
    if (!entry.resolutions.includes(node._videoResolution)) node._videoResolution = entry.resolutions.includes("1080p") ? "1080p" : entry.resolutions[0];
    if (!entry.ratios.includes(node._videoRatio)) node._videoRatio = entry.ratios.includes("16:9") ? "16:9" : entry.ratios[0];
    const duration = Number(node._videoDuration);
    node._videoDuration = entry.durations.includes(duration) ? duration : 5;
    if (!entry.audio) node._videoAudio = false;
  }
  node._videoAudio = node._videoAudio !== false;
  node.videoFile = typeof node.videoFile === "string" ? node.videoFile : "";
  return node;
}

function videoFileUrl(fileName) {
  const encoded = encodeURIComponent(fileName || "");
  return desktop ? `https://canvasflow-videos.local/${encoded}` : `/download/videos/${encoded}`;
}

function videoUpstreamSummary(node) {
  const upstream = collectUpstreamForAI(node.id);
  const imageCount = (upstream.orderedRefs || []).length;
  const textCount = upstream.texts.filter(text => String(text || "").trim()).length;
  const entry = videoCatalogEntry(node._model);
  const maxImages = entry?.maxImages || VIDEO_TASK_MAX_IMAGES;
  const parts = [`${textCount} 条文字`];
  parts.push(imageCount > maxImages ? `前 ${maxImages} 张参考图（共 ${imageCount} 张，超出部分不发送）` : `${imageCount} 张参考图`);
  return parts.join(" · ");
}

// 上游变化由事件驱动刷新(创建/连线/删除连线/入队),渲染时只读缓存,避免每次 render 递归收集
function refreshAiVideoPrompt(nodeId) {
  const node = findNode(nodeId);
  if (!node || node.type !== "ai-video") return;
  const upstream = collectUpstreamForAI(nodeId);
  node.prompt = upstream.texts.join("，");
  node._videoInputSummary = videoUpstreamSummary(node);
}


function videoNodeControls(node) {
  normalizeVideoNode(node);
  const entry = videoCatalogEntry(node._model);
  const models = videoCatalog().models.map(model => [model.id, model.label]);
  const resolutions = (entry?.resolutions || []).map(value => [value, value === "4k" ? "4K" : value.toUpperCase()]);
  const ratios = (entry?.ratios || []).map(value => [value, value === "adaptive" ? "自适应" : value]);
  const durations = (entry?.durations || [5]).map(value => [String(value), value === -1 ? "智能" : `${value} 秒`]);
  return `<div class="ai-node-settings video-node-settings">
    <label class="ai-model-field"><span>模型</span><select data-role="video-model">${selectOptions(models, node._model)}</select></label>
    <label><span>分辨率</span><select data-role="video-resolution">${selectOptions(resolutions, node._videoResolution)}</select></label>
    <label><span>比例</span><select data-role="video-ratio">${selectOptions(ratios, node._videoRatio)}</select></label>
    <label><span>时长</span><select data-role="video-duration">${selectOptions(durations, String(node._videoDuration))}</select></label>
    ${entry?.audio ? `<label class="video-audio-field"><span>声音</span><input type="checkbox" data-role="video-audio" ${node._videoAudio ? "checked" : ""}></label>` : ""}
    ${entry?.pricingUrl ? `<div class="ai-model-pricing"><a href="${escapeHtml(entry.pricingUrl)}" target="_blank" rel="noopener noreferrer" title="在 AGToken 模型广场查看对应模型及渠道价格">AGToken · 查看模型广场价格 ↗</a></div>` : ""}
  </div>`;
}

function videoNodeBody(node) {
  normalizeVideoNode(node);
  const summary = `<div class="video-node-summary">${escapeHtml(node._videoInputSummary || "0 条文字 · 0 张参考图")}</div>`;
  const progress = node._aiProgress ? aiNodeProgressMarkup(node) : "";
  if (node.generating) {
    return `${summary}<div class="ai-preview is-empty video-preview-empty"><div class="ai-generating"><div class="ai-spinner"></div>视频生成中（约 2-10 分钟）...</div></div>
      <div class="node-hover-controls">${videoNodeControls(node)}</div>${progress}`;
  }
  if (node._pendingVideoUrl) {
    return `${summary}<div class="ai-preview is-empty video-preview-empty"><span>视频已生成，下载失败</span><button type="button" class="ai-redownload-btn" data-role="video-redownload" title="点击重新下载成片（结果链接约24小时内有效）">重新下载视频</button></div>
      <div class="node-hover-controls"><div class="ai-actions"><button data-role="ai-video-generate" class="ai-generate-btn">生成</button></div>${videoNodeControls(node)}</div>${progress}`;
  }
  if (node.videoFile) {
    return `${summary}<div class="video-preview"><video controls preload="metadata" src="${escapeHtml(videoFileUrl(node.videoFile))}" draggable="false"></video></div>
      <div class="node-hover-controls"><div class="ai-actions"><button data-role="ai-video-generate" class="ai-generate-btn">重新生成</button><button data-role="video-clear">清除</button></div>${videoNodeControls(node)}</div>${progress}`;
  }
  return `${summary}<div class="ai-preview is-empty video-preview-empty">等待生成视频</div>
    <div class="node-hover-controls"><div class="ai-actions"><button data-role="ai-video-generate" class="ai-generate-btn">生成</button></div>${videoNodeControls(node)}</div>${progress}`;
}


function angleNodeInput(nodeId) {
  const upstream = collectUpstreamForAI(nodeId);
  return upstream.images[0]?.image || upstream.groupImages[0]?.image || null;
}

function angleImageBody(node) {
  normalizeAngleNodeSettings(node);
  const source = angleNodeInput(node.id);
  const transform = `perspective(1600px) rotateX(${node.anglePitch}deg) rotateY(${node.angleYaw}deg) rotateZ(${node.angleRoll}deg) scale(${node.angleZoom})`;
  const status = node.generating ? `<div class="angle-node-busy">生成中...</div>` : source ? `<div class="angle-node-grid"></div><div class="angle-node-plane" style="transform:${transform}"><img src="${source}" alt="三维角度预览" draggable="false"></div>` : `<div class="angle-node-empty">连接图片节点使用</div>`;
  return `<div class="angle-node-preview ${node.generating ? "is-generating" : ""}">${status}</div>
    <div class="node-hover-controls">
      <div class="angle-node-actions">
        <button data-role="angle-edit">编辑角度</button>
        <button data-role="angle-generate" class="ai-generate-btn">生成</button>
      </div>
      <div class="angle-prompt-preview" data-role="angle-prompt" title="双击编辑关键词">${escapeHtml(resolvedAnglePrompt(node))}</div>
      ${angleNodeControls(node)}
    </div>${node._aiProgress ? aiNodeProgressMarkup(node) : ""}`;
}

async function generateAngleImage(nodeId) {
  const node = findNode(nodeId);
  if (!node || node.type !== "angle-image") return;
  if (!activeApiKey()) return toast("请先在设置中填入 API Key");
  const source = angleNodeInput(node.id);
  if (!source) return toast("请先连接一个图片节点");
  normalizeAngleNodeSettings(node);
  node.generating = true;
  node.prompt = resolvedAnglePrompt(node);
  node._aiProgress = { status: "submitting", label: "正在提交", percent: null, error: "" };
  render();
  console.log("[角度变化] 提交生成", { nodeId, pitch: node.anglePitch, yaw: node.angleYaw, roll: node.angleRoll, zoom: node.angleZoom, resolution: node._resolution, size: node._size });
  try {
    const releaseSlot = await acquireAiApiSlot(`角度变化 ${node.id}`);
    let imageUrl;
    try {
    const taskId = await submitGeneration(node.prompt, [source], node);
    node.taskId = taskId;
    node._aiProgress = { status: "generating", label: "正在生成", percent: null, error: "" };
    renderNodes();
    imageUrl = await pollTask(taskId, pct => {
      node._aiProgress = { status: "generating", label: "正在生成", percent: pct, error: "" };
      renderNodes();
    });
    if (canvasGroupNodeRunIsStopped(node)) { node.generating = false; node._aiProgress = { status: "cancelled", label: "已停止", percent: null, error: "" }; render(); return; }
    } finally {
      releaseSlot();
    }
    node._aiProgress = { status: "downloading", label: "正在下载", percent: 96, error: "" };
    renderNodes();
    let generatedImage;
    try {
      generatedImage = await fetchImageAsBase64(imageUrl);
    } catch (downloadError) {
      throw new Error(`任务已完成，但结果图片下载失败（${downloadError.message}）。请检查网络或代理后重新生成`);
    }
    node.generationPrompt = node.prompt || "";
    const taggedImage = embedGenerationMetadata(generatedImage, generationMetadataFor(node.generationPrompt, currentPage()?.name || "项目", node.taskId));
    const outputTask = {
      id: `angle-${Date.now()}`,
      projectName: currentPage()?.name || "项目",
      exportFolder: state.settings.exportFolderLabel || "export",
      referenceName: "角度变化",
    };
    let savedOutput = null;
    try {
      savedOutput = await saveGeneratedOutput(taggedImage, outputTask, node);
    } catch (saveError) {
      console.warn("[角度变化] 图片已生成，但保存到输出文件夹失败", saveError);
      toast(`图片已生成，但保存失败：${saveError.message || saveError}`);
    }
    const fileName = savedOutput?.fileName || `angle_generated_${Date.now()}.png`;
    const existingResults = state.nodes.filter(item => item.type === "image" && item.aiSourceNodeId === node.id);
    const resultNode = addNode("image", node.x + NODE_WIDTH + 40, node.y + existingResults.length * IMAGE_NODE_VERTICAL_STEP, false);
    resultNode.image = taggedImage;
    resultNode.generationPrompt = node.generationPrompt;
    resultNode.fileName = fileName;
    resultNode.mime = "image/png";
    resultNode.outputPath = savedOutput?.outputPath || "";
    resultNode.aiSourceNodeId = node.id;
    resultNode.angleSourceNodeId = node.id;
    await externalizeImageField(resultNode, "image", "imageAssetId", fileName, savedOutput?.assetId);
    state.edges.push({ id: uid("e"), from: { node: node.id, port: "out" }, to: { node: resultNode.id, port: "in" } });
    node.generating = false;
    node._aiProgress = { status: "done", label: "生成完成", percent: 100, error: "" };
    console.log("[角度变化] 已创建结果图片节点", { nodeId, resultNodeId: resultNode.id, fileName });
    pushHistory(); render();
    toast("角度变化图片已生成并连接");
    window.setTimeout(() => { if (node._aiProgress?.status === "done") { node._aiProgress = null; renderNodes(); } }, 1800);
  } catch (err) {
    node.generating = false;
    node._aiProgress = { status: "failed", label: "生成失败", percent: null, error: err.message || String(err) };
    console.error("[角度变化] 生成失败", err);
    render();
    toast(`角度变化生成失败：${err.message || err}`);
  }
}

function openAngleEditor(nodeId) {
  const node = findNode(nodeId);
  const source = node ? angleNodeInput(node.id) : null;
  if (!node || node.type !== "angle-image") return;
  if (!source) return toast("请先连接一个图片节点");
  normalizeAngleNodeSettings(node);
  const draft = { pitch: node.anglePitch, yaw: node.angleYaw, roll: node.angleRoll, zoom: node.angleZoom, reverseDirection: node.angleReverseDirection };
  const overlay = document.createElement("div");
  overlay.className = "angle-editor-backdrop";
  overlay.innerHTML = `<div class="angle-editor" role="dialog" aria-modal="true" aria-label="角度变化编辑器">
    <div class="angle-editor-head"><div><strong>角度变化</strong><span>拖动预览调整视角，滚轮缩放</span></div><button data-angle-close>×</button></div>
    <div class="angle-editor-main">
      <div class="angle-source"><span>原始参考图</span><div><img src="${source}" draggable="false" alt="原始参考图"></div></div>
      <div class="angle-stage-wrap"><span>三维视角预览</span><div class="angle-stage"><div class="angle-grid"></div><div class="angle-plane"><img src="${source}" draggable="false" alt="三维预览"></div><small>拖动调整 X / Y · 滚轮缩放</small></div></div>
    </div>
    <div class="angle-editor-controls"></div>
    <label class="angle-direction-toggle"><input type="checkbox" data-angle-reverse><span><strong>反转左右关键词</strong><small>仅交换自动关键词中的左、右，不镜像图片</small></span></label>
    <div class="angle-editor-prompt"></div>
    <div class="angle-editor-actions"><button data-angle-reset>恢复默认</button><div><button data-angle-close>取消</button><button class="primary" data-angle-confirm>确认角度</button></div></div>
  </div>`;
  document.body.appendChild(overlay);
  const stage = overlay.querySelector(".angle-stage");
  const plane = overlay.querySelector(".angle-plane");
  const controls = overlay.querySelector(".angle-editor-controls");
  const reverseDirectionToggle = overlay.querySelector("[data-angle-reverse]");
  const promptBox = overlay.querySelector(".angle-editor-prompt");
  let dragging = false, start = null;
  const fields = [["pitch","X","俯仰",-180,180,1],["yaw","Y","水平",-180,180,1],["roll","Z","滚转",-180,180,1],["zoom","S","缩放",.35,1.8,.05]];
  controls.innerHTML = fields.map(([key,axis,label,min,max,step]) => `<label><span><b>${axis}</b>${label}</span><input data-angle-key="${key}" type="range" min="${min}" max="${max}" step="${step}"><output></output></label>`).join("");
  function updateEditor() {
    plane.style.transform = `perspective(1800px) rotateX(${draft.pitch}deg) rotateY(${draft.yaw}deg) rotateZ(${draft.roll}deg) scale(${draft.zoom})`;
    controls.querySelectorAll("input").forEach(input => { input.value = draft[input.dataset.angleKey]; input.nextElementSibling.textContent = `${draft[input.dataset.angleKey]}${input.dataset.angleKey === "zoom" ? "×" : "°"}`; });
    reverseDirectionToggle.checked = draft.reverseDirection;
    const temp = { ...node, anglePitch: draft.pitch, angleYaw: draft.yaw, angleRoll: draft.roll, angleZoom: draft.zoom, angleReverseDirection: draft.reverseDirection };
    promptBox.textContent = anglePrompt(temp);
  }
  stage.addEventListener("pointerdown", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    dragging = true;
    start = { x: ev.clientX, y: ev.clientY, pitch: draft.pitch, yaw: draft.yaw };
    stage.setPointerCapture(ev.pointerId);
  });
  stage.addEventListener("pointermove", ev => {
    if (!dragging || !start) return;
    ev.preventDefault();
    draft.yaw = Math.max(-180, Math.min(180, Math.round(start.yaw + (ev.clientX-start.x)*.35)));
    draft.pitch = Math.max(-180, Math.min(180, Math.round(start.pitch - (ev.clientY-start.y)*.35)));
    updateEditor();
  });
  const stopAngleDrag = () => { dragging = false; start = null; };
  stage.addEventListener("pointerup", stopAngleDrag);
  stage.addEventListener("pointercancel", stopAngleDrag);
  stage.addEventListener("lostpointercapture", stopAngleDrag);
  stage.addEventListener("dragstart", ev => { ev.preventDefault(); ev.stopPropagation(); });
  stage.addEventListener("wheel", ev => { ev.preventDefault(); ev.stopPropagation(); draft.zoom = Math.max(.35, Math.min(1.8, Number((draft.zoom + (ev.deltaY > 0 ? -.08 : .08)).toFixed(2)))); updateEditor(); }, { passive: false });
  controls.addEventListener("input", ev => { const key = ev.target.dataset.angleKey; if (!key) return; draft[key] = Number(ev.target.value); updateEditor(); });
  reverseDirectionToggle.addEventListener("change", () => { draft.reverseDirection = reverseDirectionToggle.checked; updateEditor(); });
  overlay.querySelectorAll("[data-angle-close]").forEach(btn => btn.onclick = () => overlay.remove());
  overlay.querySelector("[data-angle-reset]").onclick = () => { Object.assign(draft, { pitch: 0, yaw: 0, roll: 0, zoom: 1, reverseDirection: false }); updateEditor(); };
  overlay.querySelector("[data-angle-confirm]").onclick = () => { node.anglePitch=draft.pitch; node.angleYaw=draft.yaw; node.angleRoll=draft.roll; node.angleZoom=draft.zoom; node.angleReverseDirection=draft.reverseDirection; node.anglePromptCustom=""; node.prompt=anglePrompt(node); pushHistory(); render(); overlay.remove(); };
  updateEditor();
}

function isLinkedUpscaleNode(node) {
  return node?.type === "tool-node" && ["upscale-white-point", "realesrgan-upscale"].includes(node.toolMeta?.id);
}

function linkedUpscaleOutputs(node) {
  return (node.toolOutputNodeIds || []).map(findNode).filter(output =>
    output?.type === "image" && !output.disabled && output.toolSourceNodeId === node.id
      && (output.image || output.imageAssetId));
}

function collectUpstreamForAI(nodeId, incoming) {
  incoming = incoming || buildIncomingIndex();
  const result = { texts: [], images: [], groupImages: [], groupTexts: [], orderedRefs: [], branches: [] };
  const aiNode = findNode(nodeId);
  const keepCombined = aiNode?.type !== "tool-node" && aiNode?.keepCombinedInputs === true;
  const groupsSeen = new Set();

  function imageRef(n, image, assetId) {
    // PR-5 图片批注：仅当节点带批注字段时附加规范化 annotations（发送准备阶段只读；无批注节点结构不变）
    const annotationModule = window.CanvasFlowImageAnnotations;
    const annotations = annotationModule && (Array.isArray(n.imageAnnotations) || Array.isArray(n.comments)) ? annotationModule.readNodeAnnotations(n) : null;
    return { image, assetId: assetId || "", fileName: n.fileName, mime: n.mime, _x: n.x, _y: n.y, _nodeId: n.id, hasColorArrowNotes: !!n.hasColorArrowNotes, ...(annotations ? { annotations } : {}) };
  }

  // 深度优先展开上游,返回该子图的分支列表;每个分支是 { texts, images }。
  // 一个节点同时接多条线(扇入)时按线拆分支:图片线携带路径上的图片,
  // 文字/变量线携带该线文字;每条线独立成任务,与汇聚节点自身图片融合。
  // 文字/变量节点沿所在支线向上游透传(串联文字按路径顺序合并);只有 AI/角度节点是语义边界。
  function visit(id, pathVisited) {
    if (pathVisited.has(id)) return [];
    const nextVisited = new Set(pathVisited);
    nextVisited.add(id);
    const n = findNode(id);
    if (!n || n.disabled) return [];
    if (isLinkedUpscaleNode(n)) {
      const images = linkedUpscaleOutputs(n).map(output => imageRef(output, output.image, output.imageAssetId));
      return images.length ? [{ texts: [], images }] : [];
    }
    if (n.type === "ai-image" || n.type === "angle-image" || n.type === "browser-image" || n.type === "local-sd") {
      // AI/角度/浏览器生图节点截断:取其已生成图片作为参考,不再向上追溯
      if (n.generatedImage) return [{ texts: [], images: [imageRef(n, n.generatedImage, n.generatedAssetId)] }];
      return [];
    }
    if (n.type === "chat") {
      // 对话节点是语义边界:框内保留「关键词+分隔线+最新结果」,下游只取最新结果;生成期间读最近一条回复;不向上追溯
      const chatOutput = chatNodeOutputText(n).trim();
      return chatOutput ? [{ texts: [chatOutput], images: [] }] : [];
    }
    if (n.type === "text" || n.type === "variable") {
      // 串联组合:文字/变量节点继续向上游收集,线内文字按路径顺序合并,自身文字排最下游
      const ownText = n.type === "text" ? String(expandTextNodeVariables(n) || "").trim() : String(variableNodeOutput(n) || "").trim();
      const edges = incoming.get(id) || [];
      const upBranches = [];
      for (const edge of edges) {
        for (const branch of visit(edge.from.node, nextVisited)) upBranches.push(branch);
      }
      if (!upBranches.length) return ownText ? [{ texts: [ownText], images: [] }] : [];
      return upBranches.map(branch => ({
        texts: ownText ? [...branch.texts, ownText] : branch.texts,
        images: branch.images,
      }));
    }
    if (n.type === "group") {
      // 组节点维持现有批量语义:全部条目进 groupImages/groupTexts,由任务构建按组拆任务
      if (groupsSeen.has(n.id)) return [];
      groupsSeen.add(n.id);
      if (n.items) {
        for (const item of n.items) {
          if (item.type === "text" && item.text && item.text.trim()) result.groupTexts.push(item.text.trim());
          if (item.type === "image" && item.image) result.groupImages.push(imageRef({ ...n, fileName: item.fileName, mime: item.mime }, item.image, item.assetId));
          if (item.type === "ai-image" && item.generatedImage) result.groupImages.push(imageRef({ ...n, fileName: item.fileName, mime: item.mime }, item.generatedImage, item.generatedAssetId));
        }
      }
      if (n.images && n.images.length) {
        for (const gImg of n.images) result.groupImages.push(imageRef({ ...n, fileName: gImg.fileName, mime: gImg.mime }, gImg.image, gImg.assetId));
      }
      return [];
    }
    // 图片节点等:自身图片加入每条经过它的分支
    const own = n.type === "image" && n.image ? [imageRef(n, n.image, n.imageAssetId)] : [];
    const edges = incoming.get(id) || [];
    const branches = [];
    for (const edge of edges) {
      for (const branch of visit(edge.from.node, nextVisited)) branches.push(branch);
    }
    if (!branches.length) return own.length ? [{ texts: [], images: own }] : [];
    return branches.map(branch => ({ texts: branch.texts, images: [...branch.images, ...own] }));
  }

  const branchLists = [];
  for (const edge of incoming.get(nodeId) || []) {
    for (const branch of visit(edge.from.node, new Set([nodeId]))) branchLists.push(branch);
  }
  for (const branch of branchLists) {
    branch.images.sort((a, b) => (a._x || 0) - (b._x || 0));
  }
  if (keepCombined) {
    // 合并输入模式:全部分支打平为单个分支(文字并集 + 图片按节点去重,与旧行为一致)
    const combinedTexts = [];
    const seenTexts = new Set();
    const flat = [];
    const seenRefs = new Set();
    for (const branch of branchLists) {
      for (const text of branch.texts) {
        if (!seenTexts.has(text)) { seenTexts.add(text); combinedTexts.push(text); }
      }
      for (const ref of branch.images) {
        const key = ref._nodeId || ref.assetId || ref.image;
        if (key && seenRefs.has(key)) continue;
        if (key) seenRefs.add(key);
        flat.push(ref);
      }
    }
    branchLists.length = 0;
    branchLists.push({ texts: combinedTexts, images: flat });
  }
  result.branches = branchLists;
  result.images = branchLists[0]?.images || [];
  result.orderedRefs = branchLists[0]?.images || [];
  // 汇总文字 = 全部分支文字(按出现顺序去重) + 组节点共享文字;用于节点提示词显示与输入存在性判断
  const unionTexts = [];
  const seenUnion = new Set();
  for (const branch of branchLists) {
    for (const text of branch.texts) {
      if (!seenUnion.has(text)) { seenUnion.add(text); unionTexts.push(text); }
    }
  }
  for (const text of result.groupTexts) {
    if (!seenUnion.has(text)) { seenUnion.add(text); unionTexts.push(text); }
  }
  result.texts = unionTexts;
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

function directScreenshotNodeInputs(nodeId) {
  const incoming = buildIncomingIndex();
  const visited = new Set([nodeId]);
  const textEntries = [], imageEntries = [], batchEntries = [];
  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = findNode(id);
    if (!node || node.disabled) return;
    if (isLinkedUpscaleNode(node)) {
      for (const output of linkedUpscaleOutputs(node)) visit(output.id);
      return;
    }
    const order = { x: Number(node.x) || 0, created: Number(node.created) || 0 };
    if (node.type === "text") {
      const expandedText = String(expandTextNodeVariables(node) || "").trim();
      if (expandedText) textEntries.push({ text: expandedText, ...order });
    } else if (node.type === "variable") {
      const output = variableNodeOutput(node);
      if (output) textEntries.push({ text: output, ...order });
    } else if (node.type === "chat") {
      const chatOutput = chatNodeOutputText(node).trim();
      if (chatOutput) textEntries.push({ text: chatOutput, ...order });
    } else if (node.type === "image" && (node.image || node.imageAssetId)) {
      imageEntries.push({ image: node.image || "", assetId: node.imageAssetId || "", fileName: node.fileName || "参考图.png", mime: node.mime || "image/png", hasColorArrowNotes: !!node.hasColorArrowNotes, ...order });
    } else if (node.type === "group" || node.type === "folder") {
      const groupImages = node.images || (node.items || []).filter(item => item.type === "image").map(item => ({ image: item.image, assetId: item.imageAssetId, fileName: item.fileName, mime: item.mime }));
      groupImages.forEach((image, index) => {
        if (image?.image || image?.assetId) batchEntries.push({ image: image.image || "", assetId: image.assetId || "", fileName: image.fileName || "批量图片.png", mime: image.mime || "image/png", ...order, index });
      });
    }
    // 功能节点是对话语义边界:使用其自身结果,不继续把更早的工作流输入带入截图任务。
    if (node.type === "ai-image" || node.type === "angle-image" || node.type === "screenshot-input" || node.type === "chat" || node.type === "browser-image" || node.type === "local-sd") return;
    for (const edge of incoming.get(id) || []) visit(edge.from.node);
  }
  for (const edge of incoming.get(nodeId) || []) visit(edge.from.node);
  const byCanvasOrder = (a, b) => a.x - b.x || a.created - b.created || (a.index || 0) - (b.index || 0);
  textEntries.sort(byCanvasOrder);
  imageEntries.sort(byCanvasOrder);
  batchEntries.sort(byCanvasOrder);
  return {
    texts: textEntries.map(item => item.text),
    images: imageEntries.map(({ x, created, ...item }) => item),
    batchImages: batchEntries.map(({ x, created, index, ...item }) => item),
  };
}

function screenshotNodeSummary(node) {
  const input = directScreenshotNodeInputs(node.id);
  return `${input.texts.length} 条文字 · ${input.images.length} 张参考图 · ${input.batchImages.length} 张批量图 · 单图生成 ${Math.max(1, Number(node._count) || 1)} 张`;
}

// 批量提示词:点击按钮后追加到本轮提问末尾的指令,要求模型按 a. b. c. 序号输出多条
const CHAT_ENUMERATED_INSTRUCTION = "请针对上面的内容输出多条不同的提示词方案：每条独占一行，以英文字母序号开头（a. b. c. …），序号后直接跟提示词本身；不要输出序号条目以外的任何标题、说明或结尾。";

// 按首条结果分隔线把框内文字切成两区:关键词区(用户指令,长期保留可编辑)与结果区(展示最新回复,每次整体替换)
function findChatResultDivider(text) {
  const raw = String(text || "").replace(/\r\n?/g, "\n");
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (CHAT_RESULT_DIVIDER_LINE_RE.test(lines[i])) return { prompt: lines.slice(0, i).join("\n"), result: lines.slice(i + 1).join("\n") };
  }
  return { prompt: raw, result: "" };
}

// 对话节点的结果 = 最后一条结果分隔线之后的文字(即最新回复);没有分隔线时整段框内文字都是结果(首次生成前/手改后)
function chatResultPortion(text) {
  const raw = String(text || "").replace(/\r\n?/g, "\n");
  const lines = raw.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (CHAT_RESULT_DIVIDER_LINE_RE.test(lines[i])) start = i + 1;
  }
  return (start < 0 ? raw : lines.slice(start).join("\n")).trim();
}

// 本轮发送文字 = 关键词区 + 结果区中用户新写的内容;与最近一条回复相同的结果本体不重发,结果区被改写过则整段并入
function chatComposeSendText(node) {
  const { prompt, result } = findChatResultDivider(node.chatText);
  const promptText = prompt.trim();
  let resultText = result.trim();
  if (!resultText) return promptText;
  const lastReply = String([...(node.chatMessages || [])].reverse().find(message => message.role === "assistant")?.content || "").trim();
  if (lastReply && resultText === lastReply) return promptText;
  if (lastReply && resultText.startsWith(lastReply)) resultText = resultText.slice(lastReply.length).trim();
  return [promptText, resultText].filter(Boolean).join("\n\n");
}

// 下游与截图收集读取对话节点输出的统一入口:生成期间读最近一条回复(框内是提问草稿),其余时候读最新结果
function chatNodeOutputText(node) {
  const latestReply = String([...(node.chatMessages || [])].reverse().find(message => message.role === "assistant")?.content || "");
  return latestReply || chatResultPortion(node.chatText);
}

// 解析 a. b. c. 序号回复:返回序号后的内容数组;无序号行并入上一条(多行提示词),序号条目不足 2 条视为普通回复(返回 null)
function parseNumberedChatItems(text) {
  const items = [];
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/[*`_#>]/g, "").trim();
    if (!line) continue;
    const matched = line.match(/^([a-zA-Z])\s*[.、．)）:：]\s*(.+)$/);
    if (matched) items.push(matched[2].trim());
    else if (items.length) items[items.length - 1] += `\n${line}`;
  }
  return items.length >= 2 ? items : null;
}

// 把拆分出的提示词在对话节点右侧排成一列文字节点(与图片结果落位同风格);不负责 pushHistory,由调用方一次性提交
function createChatPromptTextNodes(chatNode, items) {
  const baseX = chatNode.x + chatNode.w + 40;
  items.forEach((text, index) => {
    const textNode = addNode("text", baseX, chatNode.y + index * (NODE_HEIGHT + 40), false);
    textNode.text = text;
  });
  render();
}

let chatRequestSeq = 0;
// AI 对话节点:消息记录与输入草稿分离；历史由 CanvasFlow 随请求重发，API 本身不保存会话。
// 「批量」只追加序号输出指令；编号回复由用户在消息操作中明确拆成文字节点，不自动创建节点。
// 下游始终消费最新 assistant 回复，不读取输入框草稿。
async function sendChatNodeMessage(nodeId, options = {}) {
  const node = findNode(nodeId);
  if (!node || node.type !== "chat" || node.disabled || node._chatBusy) return;
  normalizeChatNode(node);
  const entry = chatModelEntry(node._chatModel);
  if (!entry) {
    node._chatError = chatCatalogModels().length ? "对话模型不可用，请重新选择模型" : "请先在设置 → API 中填写对应站点的 API Key";
    syncChatNodeBody(node);
    return;
  }
  const retryAssistantIndex = Number.isInteger(options.retryAssistantIndex) ? options.retryAssistantIndex : -1;
  const retryUser = retryAssistantIndex > 0 && node.chatMessages[retryAssistantIndex]?.role === "assistant"
    ? node.chatMessages[retryAssistantIndex - 1]
    : null;
  const typed = retryUser?.role === "user" ? String(retryUser.content || "").trim() : node.chatDraft.trim();
  const collected = collectUpstreamForAI(node.id, buildIncomingIndex());
  const upstreamText = collected.texts.join("，").trim();
  const userText = retryUser ? typed : [upstreamText, typed].filter(Boolean).join("\n\n");
  const attachedImages = node.chatAttachments.map(item => ({
    image: item.image,
    assetId: item.assetId,
    fileName: item.fileName,
    mime: item.mime,
  }));
  if (attachedImages.length && !entry.multimodal) {
    node._chatError = "当前模型不支持图片，请切换到多模态模型或移除附件";
    syncChatNodeBody(node);
    return;
  }
  const imageRefs = (retryUser ? [] : [...attachedImages, ...collected.images])
    .filter((ref, index, refs) => refs.findIndex(other => (other.assetId || other.image) === (ref.assetId || ref.image)) === index)
    .slice(0, CHAT_MAX_REFERENCE_IMAGES);
  if (!userText && !imageRefs.length) {
    node._chatError = "需要输入内容，或添加/连接图片";
    syncChatNodeBody(node);
    return;
  }
  if (!userText && imageRefs.length && !entry.multimodal) {
    node._chatError = "当前模型不支持图片，请切换到多模态模型或输入文字";
    syncChatNodeBody(node);
    return;
  }
  const baseRequestText = userText || translateUiString("请分析这些图片");
  const requestText = retryUser ? baseRequestText : (node._chatEnumerated === true ? `${baseRequestText}\n\n${CHAT_ENUMERATED_INSTRUCTION}` : baseRequestText);
  let imageDataUrls = [];
  if (entry.multimodal && imageRefs.length) {
    try {
      imageDataUrls = (await Promise.all(imageRefs.map(ref => materializeReferenceImage(ref)))).filter(url => typeof url === "string" && url);
    } catch (error) {
      node._chatError = `图片读取失败：${error.message || "请重新添加图片"}`;
      syncChatNodeBody(node);
      return;
    }
  }
  const historyMessages = retryUser ? node.chatMessages.slice(0, retryAssistantIndex - 1) : node.chatMessages;
  const history = historyMessages.map(message => ({ role: message.role, content: message.content }));
  const userContent = entry.multimodal && imageDataUrls.length
    ? [{ type: "text", text: requestText }, ...imageDataUrls.map(url => ({ type: "image_url", image_url: { url } }))]
    : requestText;
  const payload = { apiType: entry.apiType, model: entry.apiType === "custom" ? entry.model : node._chatModel, stream: false, messages: [...history, { role: "user", content: userContent }] };
  // 自定义 OpenAI 兼容站点：Base URL/站点号随请求体携带（服务端转发前移除），上游 model 用真实模型名
  if (entry.apiType === "custom") {
    // chatModelEntry 的 custom 条目只有 siteId（无 site 属性），Base URL 须经站点表解析
    const customSite = chatCustomSiteById(entry.siteId);
    payload.__chatCustom = { baseUrl: String(customSite?.baseUrl || "").trim(), siteId: entry.siteId };
    // 自定义站点无既有桌面槽语义，两种模式都随请求体带 key（桌面值来自 secrets 回填）
    payload._apiKey = chatCustomSiteKey(entry.siteId);
  } else if (!desktop) {
    // 服务器/浏览器模式:密钥随请求体按 apiType 分槽携带;桌面模式走 secrets.json,不带 key
    payload._apiKey = entry.apiType === "agtoken" ? (state.settings.agtokenApiKey || "") : (state.settings.apiKey || "");
  }

  node._chatBusy = true;
  node._chatError = "";
  node._chatCancelled = false;
  // 回车发送时输入框仍持有焦点,置 disabled 会丢焦点;完成后若之前在输入就还给它,方便连续追问
  node._chatRefocus = document.activeElement?.matches?.(`.node[data-id="${node.id}"] textarea[data-role="chat-text"], .chat-workspace-backdrop[data-node-id="${node.id}"] textarea[data-role="chat-text"]`) || false;
  const controller = new AbortController();
  node._chatAbort = controller;
  const requestId = ++chatRequestSeq;
  node._chatRequestId = requestId;
  syncChatNodeBody(node);
  try {
    const resp = await apiFetch("/api/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    // 停止后迟到的结果直接丢弃(桌面桥无法中断进行中的请求)
    if (node._chatRequestId !== requestId || node._chatCancelled) return;
    const data = await resp.json().catch(() => ({}));
    const apiError = typeof data.error === "string" ? data.error : data.error?.message;
    if (resp.status === 404 && (!data.error || apiError === "桌面接口不存在")) {
      throw new Error(desktop
        ? "当前桌面程序没有对话接口：请保存画布并关闭窗口，再运行「启动CanvasFlow-NET.bat」重新构建启动"
        : "本机服务没有对话接口：请重启「启动CanvasFlow服务.bat」，再用新标签页打开画布");
    }
    if (!resp.ok || data.error) throw new Error(apiError || `${entry.apiType === "agtoken" ? "AGToken" : entry.apiType === "custom" ? "自定义接口" : "APIMart"} 对话请求失败（HTTP ${resp.status}）`);
    // apimart 响应为 {code,data} 包装(data 内为标准 OpenAI 结构),agtoken 为标准结构;按 choices 形状自适应解包
    const inner = data && typeof data === "object" && data.data && Array.isArray(data.data.choices) ? data.data : data;
    const reply = chatContentToText(inner?.choices?.[0]?.message?.content);
    if (!reply) throw new Error("上游未返回文字内容");
    if (retryUser) {
      node.chatMessages[retryAssistantIndex] = { role: "assistant", content: reply };
    } else {
      node.chatMessages.push({ role: "user", content: requestText, imageCount: imageDataUrls.length });
      node.chatMessages.push({ role: "assistant", content: reply });
      node.chatDraft = "";
      node.chatAttachments = [];
    }
    if (node.chatMessages.length > CHAT_HISTORY_LIMIT) node.chatMessages = node.chatMessages.slice(-CHAT_HISTORY_LIMIT);
    // 关键词区原样保留,结果区整体替换为最新回复(不累加);下游/截图收集只取最后一条分隔线之后的结果
    node.chatText = typed ? `${typed}\n\n${CHAT_RESULT_DIVIDER}\n\n${reply}` : reply;
    node._chatError = "";
    const session = saveActiveChatSession(node, true);
    if (session && (/^对话\s+\d+$/.test(session.title) || session.title === "新对话")) session.title = chatSessionTitleFromMessages(node.chatMessages) || session.title;
    pushHistory();
  } catch (error) {
    if (node._chatRequestId !== requestId) return;
    if (node._chatCancelled || error.name === "AbortError") node._chatError = "已停止生成";
    else node._chatError = error.message || "对话请求失败";
  } finally {
    if (node._chatRequestId === requestId) {
      node._chatBusy = false;
      delete node._chatAbort;
      delete node._chatCancelled;
      syncChatNodeBody(node);
      const messageList = els.nodes.querySelector(`.node[data-id="${node.id}"] .chat-messages`);
      if (messageList) messageList.scrollTop = messageList.scrollHeight;
      if (node._chatRefocus) {
        const textarea = expandedChatNodeId === node.id
          ? document.querySelector(`.chat-workspace-backdrop[data-node-id="${node.id}"] textarea[data-role="chat-text"]`)
          : els.nodes.querySelector(`.node[data-id="${node.id}"] textarea[data-role="chat-text"]`);
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
      }
      delete node._chatRefocus;
      markDirty();
    }
  }
}

// 就地刷新对话节点正文(不整节点重建);仅在对话自身状态变化时调用
function syncChatNodeBody(node) {
  const nodeEl = els.nodes.querySelector(`.node[data-id="${node.id}"]`);
  const body = nodeEl?.querySelector(".node-body");
  if (!nodeEl || !body) return;
  body.innerHTML = chatNodeBody(node);
  renderChatWorkspace();
}

let expandedChatNodeId = "";

function chatOverlayClass(baseClass) {
  return `${baseClass}${els.app.classList.contains("theme-dark") ? " theme-dark" : ""}`;
}

function closeChatWorkspace() {
  expandedChatNodeId = "";
  document.querySelector(".chat-workspace-backdrop")?.remove();
}

function renderChatWorkspace() {
  const existing = document.querySelector(".chat-workspace-backdrop");
  if (!expandedChatNodeId) { existing?.remove(); return; }
  const node = findNode(expandedChatNodeId);
  if (!node || node.type !== "chat") { closeChatWorkspace(); return; }
  const backdrop = existing || document.createElement("div");
  backdrop.className = chatOverlayClass("chat-workspace-backdrop");
  backdrop.dataset.nodeId = node.id;
  backdrop.innerHTML = `<section class="chat-workspace" role="dialog" aria-modal="true" aria-label="AI 对话工作区">`
    + `<header class="chat-workspace-head"><div class="chat-workspace-title"><span class="chat-workspace-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z"/></svg></span><div><strong>AI 对话</strong><span>消息随当前画布保存</span></div></div><button type="button" data-chat-workspace-close aria-label="关闭对话工作区"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>`
    + `<div class="chat-workspace-body">${chatNodeBody(node, true)}</div>`
    + `</section>`;
  if (!existing) document.body.appendChild(backdrop);
  const composer = backdrop.querySelector(".chat-composer");
  const controls = backdrop.querySelector(".chat-node-bar");
  const send = backdrop.querySelector(".chat-composer-send");
  if (composer && controls && send) composer.insertBefore(controls, send);
  const messages = backdrop.querySelector(".chat-messages");
  if (messages) messages.scrollTop = messages.scrollHeight;
}

function openChatWorkspace(nodeId) {
  expandedChatNodeId = nodeId;
  renderChatWorkspace();
  window.requestAnimationFrame(() => document.querySelector(".chat-workspace textarea[data-role='chat-text']")?.focus());
}

function openChatHtmlPreview(node, messageIndex, initialMode = "preview") {
  const html = extractHtmlDocument(node?.chatMessages?.[messageIndex]?.content);
  if (!html) return toast("没有识别到完整 HTML 文档");
  const backdrop = document.createElement("div");
  backdrop.className = chatOverlayClass("chat-html-preview-backdrop");
  backdrop.innerHTML = `<section class="chat-html-preview-dialog" role="dialog" aria-modal="true" aria-label="HTML 网页预览与代码">`
    + `<header><div><strong>HTML 网页</strong><span data-html-view-description></span></div><div class="chat-html-view-actions" role="group" aria-label="HTML 查看方式">`
    + `<button type="button" data-html-view="preview">预览</button><button type="button" data-html-view="code">代码</button><button type="button" data-html-copy-code>复制代码</button><button type="button" data-html-save>保存 HTML</button>`
    + `<button type="button" data-html-view-close aria-label="关闭 HTML 查看器"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></header>`
    + `<iframe title="HTML 网页完整预览" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>`
    + `<textarea class="chat-html-code" aria-label="完整 HTML 代码" readonly spellcheck="false"></textarea></section>`;
  const close = () => backdrop.remove();
  const frame = backdrop.querySelector("iframe");
  const code = backdrop.querySelector(".chat-html-code");
  const description = backdrop.querySelector("[data-html-view-description]");
  const setMode = mode => {
    const codeMode = mode === "code";
    frame.hidden = codeMode;
    code.hidden = !codeMode;
    description.textContent = codeMode ? "完整源码（只读）" : "内容运行在隔离沙箱中";
    backdrop.querySelectorAll("[data-html-view]").forEach(button => button.classList.toggle("is-active", button.dataset.htmlView === mode));
  };
  backdrop.querySelector("[data-html-view-close]").addEventListener("click", close);
  backdrop.querySelectorAll("[data-html-view]").forEach(button => button.addEventListener("click", () => setMode(button.dataset.htmlView)));
  backdrop.querySelector("[data-html-copy-code]").addEventListener("click", async () => {
    if (await copyTextValue(html)) toast("已复制 HTML 代码");
    else toast("复制失败，请在代码视图中手动选择复制");
  });
  backdrop.querySelector("[data-html-save]").addEventListener("click", () => saveChatHtmlFile(html));
  backdrop.addEventListener("mousedown", event => { if (event.target === backdrop) close(); });
  frame.srcdoc = html;
  code.value = html;
  setMode(initialMode === "code" ? "code" : "preview");
  document.body.appendChild(backdrop);
}

function saveChatHtmlFile(html) {
  const source = String(html || "").trim();
  if (!source) return false;
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const url = URL.createObjectURL(new Blob([source], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `CanvasFlow-网页-${stamp}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("HTML 已保存到本地下载目录");
  return true;
}

let chatHtmlEditorState = null;

function replaceHtmlDocumentInMessage(content, nextHtml) {
  const source = String(content || "");
  let replaced = false;
  const fenced = source.replace(/```(?:html)?\s*([\s\S]*?)```/gi, (whole, block) => {
    if (replaced || !extractHtmlDocument(block)) return whole;
    replaced = true;
    return `\`\`\`html\n${nextHtml.trim()}\n\`\`\``;
  });
  if (replaced) return fenced;
  const current = extractHtmlDocument(source);
  return current ? source.replace(current, nextHtml.trim()) : source;
}

function serializeEditedHtml(doc, original) {
  const doctype = /^\s*<!doctype[^>]*>/i.exec(String(original || ""))?.[0] || "<!DOCTYPE html>";
  return `${doctype}\n${doc.documentElement.outerHTML}`;
}

function chatHtmlEditorDocument(html) {
  return new DOMParser().parseFromString(String(html || ""), "text/html");
}

function chatHtmlEditorElement(doc, index) {
  return [...doc.body.querySelectorAll("*")][Number(index)] || null;
}

function chatHtmlEditorTextEditable(element) {
  return /^(H[1-6]|P|SPAN|A|LI|BUTTON|LABEL|STRONG|EM|SMALL|FIGCAPTION|BLOCKQUOTE|TD|TH)$/i.test(element?.tagName || "")
    || element?.children?.length === 0 && element?.tagName !== "IMG";
}

function buildChatHtmlEditorPreview(html) {
  const doc = chatHtmlEditorDocument(html);
  doc.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]').forEach(item => item.remove());
  [...doc.body.querySelectorAll("*")].forEach((element, index) => element.setAttribute("data-cf-edit-id", String(index)));
  const appStyle = getComputedStyle(document.documentElement);
  const editorPrimary = appStyle.getPropertyValue("--primary").trim();
  const editorInverseText = appStyle.getPropertyValue("--inverse-text").trim();
  const bridge = doc.createElement("script");
  bridge.setAttribute("data-cf-editor-bridge", "1");
  bridge.textContent = `(()=>{if(window.__cfVisualEditor)return;window.__cfVisualEditor=true;const primary=${JSON.stringify(editorPrimary)},inverseText=${JSON.stringify(editorInverseText)};let selected=null,hover=null;const root=document.createElement('div'),hoverBox=document.createElement('div'),selectedBox=document.createElement('div'),label=document.createElement('div');root.style.cssText='position:fixed;inset:0;z-index:299;pointer-events:none';hoverBox.style.cssText='position:fixed;display:none;border:2px dashed '+primary+';pointer-events:none';selectedBox.style.cssText='position:fixed;display:none;border:2px solid '+primary+';pointer-events:none';label.style.cssText='position:fixed;display:none;padding:2px 6px;border-radius:4px;background:'+primary+';color:'+inverseText+';font:12px/1.5 inherit;pointer-events:none';root.append(hoverBox,selectedBox,label);(document.body||document.documentElement).append(root);const draw=(box,el)=>{if(!el){box.style.display='none';return}const r=el.getBoundingClientRect();box.style.display='block';box.style.left=r.left+'px';box.style.top=r.top+'px';box.style.width=r.width+'px';box.style.height=r.height+'px'};const tick=()=>{draw(hoverBox,hover===selected?null:hover);draw(selectedBox,selected);if(selected){const r=selected.getBoundingClientRect();label.style.display='block';label.style.left=Math.max(0,r.left)+'px';label.style.top=Math.max(0,r.top-22)+'px';label.textContent=selected.tagName.toLowerCase()}else label.style.display='none';requestAnimationFrame(tick)};document.addEventListener('mousemove',e=>{hover=e.target instanceof Element?e.target.closest('[data-cf-edit-id]'):null},true);document.addEventListener('click',e=>{const el=e.target instanceof Element?e.target.closest('[data-cf-edit-id]'):null;if(!el)return;e.preventDefault();e.stopPropagation();selected=el;const style=getComputedStyle(el);parent.postMessage({type:'cf-html-element-selected',id:Number(el.getAttribute('data-cf-edit-id')),tag:el.tagName.toLowerCase(),text:el.children.length?'':el.textContent||'',isImage:el.tagName==='IMG',src:el.getAttribute('src')||'',style:{color:style.color,backgroundColor:style.backgroundColor,fontSize:style.fontSize,fontWeight:style.fontWeight,textAlign:style.textAlign,borderRadius:style.borderRadius,width:style.width,height:style.height}},'*')},true);document.addEventListener('submit',e=>e.preventDefault(),true);tick()})()`;
  doc.body.appendChild(bridge);
  return serializeEditedHtml(doc, html);
}

function updateChatHtmlEditorElement(mutator) {
  const state = chatHtmlEditorState;
  if (!state || state.selectedIndex === null) return false;
  const doc = chatHtmlEditorDocument(state.current);
  const element = chatHtmlEditorElement(doc, state.selectedIndex);
  if (!element) return false;
  state.undo.push(state.current);
  if (state.undo.length > 50) state.undo.shift();
  state.redo = [];
  mutator(element, doc);
  state.current = serializeEditedHtml(doc, state.current);
  return true;
}

function refreshChatHtmlEditor({ preview = true, selection = true } = {}) {
  const state = chatHtmlEditorState;
  const root = document.querySelector(".chat-html-editor-backdrop");
  if (!state || !root) return;
  if (preview) root.querySelector("iframe").srcdoc = buildChatHtmlEditorPreview(state.current);
  root.querySelector("[data-html-editor-undo]").disabled = !state.undo.length;
  root.querySelector("[data-html-editor-redo]").disabled = !state.redo.length;
  if (!selection) return;
  const empty = root.querySelector(".chat-html-editor-empty");
  const fields = root.querySelector(".chat-html-editor-fields");
  empty.hidden = state.selectedIndex !== null;
  fields.hidden = state.selectedIndex === null;
  if (state.selectedIndex === null) return;
  const doc = chatHtmlEditorDocument(state.current);
  const element = chatHtmlEditorElement(doc, state.selectedIndex);
  if (!element) { state.selectedIndex = null; return refreshChatHtmlEditor({ preview: false }); }
  root.querySelector("[data-html-selected-tag]").textContent = `<${element.tagName.toLowerCase()}>`;
  const textEditable = chatHtmlEditorTextEditable(element);
  root.querySelector("[data-html-property-text]").value = textEditable ? (element.textContent || "") : "";
  root.querySelector("[data-html-property-text]").disabled = !textEditable;
  const computed = state.selectedInfo?.style || {};
  root.querySelector("[data-html-property-color]").value = element.style.color || computed.color || "";
  root.querySelector("[data-html-property-bg]").value = element.style.backgroundColor || computed.backgroundColor || "";
  root.querySelector("[data-html-property-size]").value = element.style.fontSize || computed.fontSize || "";
  root.querySelector("[data-html-property-weight]").value = element.style.fontWeight || computed.fontWeight || "";
  root.querySelector("[data-html-property-align]").value = element.style.textAlign || computed.textAlign || "";
  root.querySelector("[data-html-property-radius]").value = element.style.borderRadius || computed.borderRadius || "";
  root.querySelector("[data-html-property-width]").value = element.style.width || computed.width || "";
  root.querySelector("[data-html-property-height]").value = element.style.height || computed.height || "";
  root.querySelector(".chat-html-editor-image-field").hidden = element.tagName !== "IMG";
}

function closeChatHtmlEditor() {
  if (chatHtmlEditorState?.messageHandler) window.removeEventListener("message", chatHtmlEditorState.messageHandler);
  document.querySelector(".chat-html-editor-backdrop")?.remove();
  chatHtmlEditorState = null;
}

function openChatHtmlEditor(node, messageIndex) {
  const html = extractHtmlDocument(node?.chatMessages?.[messageIndex]?.content);
  if (!html) return toast("没有识别到完整 HTML 文档");
  closeChatHtmlEditor();
  chatHtmlEditorState = { nodeId: node.id, messageIndex, original: html, current: html, undo: [], redo: [], selectedIndex: null, selectedInfo: null, messageHandler: null };
  const backdrop = document.createElement("div");
  backdrop.className = chatOverlayClass("chat-html-editor-backdrop");
  backdrop.innerHTML = `<section class="chat-html-editor" role="dialog" aria-modal="true" aria-label="HTML 编辑器">`
    + `<header class="chat-html-editor-head"><div><strong>编辑 HTML</strong><span>修改同一条 AI 回复，不创建聊天分支</span></div><div class="chat-html-editor-head-actions">`
    + `<button type="button" data-html-editor-undo disabled>撤销</button><button type="button" data-html-editor-redo disabled>重做</button>`
    + `<button type="button" data-html-editor-cancel>取消</button><button type="button" class="is-primary" data-html-editor-apply>应用到聊天</button></div></header>`
    + `<div class="chat-html-editor-body"><section class="chat-html-editor-preview"><div class="chat-html-editor-panel-title"><strong>网页画布</strong><span>点击页面中的对象进行编辑</span></div><iframe title="HTML 可视化编辑画布" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></section>`
    + `<aside class="chat-html-editor-properties"><div class="chat-html-editor-panel-title"><strong>属性</strong><span data-html-selected-tag>未选择</span></div>`
    + `<div class="chat-html-editor-empty">请在左侧网页中点击文字、图片或容器。</div><div class="chat-html-editor-fields" hidden>`
    + `<label class="is-wide">文字内容<textarea data-html-property-text rows="5" placeholder="包含子元素的容器不能直接修改文字"></textarea></label>`
    + `<label>文字颜色<input type="text" data-html-property-color placeholder="#222 或 rgb(...) "></label><label>背景颜色<input type="text" data-html-property-bg placeholder="transparent"></label>`
    + `<label>字号<input type="text" data-html-property-size placeholder="例如 24px"></label><label>字重<input type="text" data-html-property-weight placeholder="400 / 700"></label>`
    + `<label>对齐<select data-html-property-align><option value="">继承</option><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option><option value="justify">两端对齐</option></select></label><label>圆角<input type="text" data-html-property-radius placeholder="例如 12px"></label>`
    + `<label>宽度<input type="text" data-html-property-width placeholder="auto / 100% / 320px"></label><label>高度<input type="text" data-html-property-height placeholder="auto / 240px"></label>`
    + `<div class="chat-html-editor-image-field is-wide" hidden><span>图片</span><button type="button" data-html-editor-replace-image>替换所选图片</button><input type="file" accept="image/*" data-html-editor-image-file hidden></div>`
    + `<div class="chat-html-editor-object-actions is-wide"><button type="button" data-html-editor-delete>删除所选对象</button></div>`
    + `</div></aside></div></section>`;
  document.body.appendChild(backdrop);
  const frame = backdrop.querySelector("iframe");
  chatHtmlEditorState.messageHandler = event => {
    if (event.source !== frame.contentWindow || event.data?.type !== "cf-html-element-selected") return;
    chatHtmlEditorState.selectedIndex = Number(event.data.id);
    chatHtmlEditorState.selectedInfo = event.data;
    refreshChatHtmlEditor({ preview: false });
  };
  window.addEventListener("message", chatHtmlEditorState.messageHandler);
  refreshChatHtmlEditor();
  backdrop.addEventListener("mousedown", event => { if (event.target === backdrop) closeChatHtmlEditor(); });
  backdrop.addEventListener("click", event => {
    const state = chatHtmlEditorState;
    if (!state) return;
    if (event.target.closest("[data-html-editor-cancel]")) return closeChatHtmlEditor();
    if (event.target.closest("[data-html-editor-undo]")) {
      const previous = state.undo.pop();
      if (previous !== undefined) { state.redo.push(state.current); state.current = previous; refreshChatHtmlEditor(); }
      return;
    }
    if (event.target.closest("[data-html-editor-redo]")) {
      const next = state.redo.pop();
      if (next !== undefined) { state.undo.push(state.current); state.current = next; refreshChatHtmlEditor(); }
      return;
    }
    if (event.target.closest("[data-html-editor-replace-image]")) {
      backdrop.querySelector("[data-html-editor-image-file]").click();
      return;
    }
    if (event.target.closest("[data-html-editor-delete]")) {
      if (updateChatHtmlEditorElement(element => element.remove())) {
        state.selectedIndex = null;
        refreshChatHtmlEditor();
      }
      return;
    }
    if (event.target.closest("[data-html-editor-apply]")) {
      const liveNode = findNode(state.nodeId);
      const message = liveNode?.chatMessages?.[state.messageIndex];
      if (!message) return closeChatHtmlEditor();
      message.content = replaceHtmlDocumentInMessage(message.content, state.current);
      pushHistory();
      closeChatHtmlEditor();
      render();
      toast("HTML 已更新，可继续对话修改");
    }
  });
  backdrop.querySelector(".chat-html-editor-fields").addEventListener("change", event => {
    const target = event.target;
    const propertyMap = {
      htmlPropertyColor: "color", htmlPropertyBg: "backgroundColor", htmlPropertySize: "fontSize", htmlPropertyWeight: "fontWeight",
      htmlPropertyAlign: "textAlign", htmlPropertyRadius: "borderRadius", htmlPropertyWidth: "width", htmlPropertyHeight: "height",
    };
    if (target.matches("[data-html-property-text]")) {
      if (updateChatHtmlEditorElement(element => { element.textContent = target.value; })) refreshChatHtmlEditor();
      return;
    }
    const key = Object.keys(propertyMap).find(name => target.dataset[name] !== undefined);
    if (!key) return;
    if (updateChatHtmlEditorElement(element => { element.style[propertyMap[key]] = target.value.trim(); })) refreshChatHtmlEditor();
  });
  backdrop.querySelector("[data-html-editor-image-file]").addEventListener("change", event => {
    const file = event.target.files?.[0];
    const state = chatHtmlEditorState;
    if (!file || !state) return;
    const reader = new FileReader();
    reader.onload = () => {
      const changed = updateChatHtmlEditorElement(image => {
        if (image.tagName !== "IMG") return;
        image.setAttribute("src", String(reader.result || ""));
      });
      if (changed) refreshChatHtmlEditor();
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  });
  window.requestAnimationFrame(() => frame.focus());
}

document.addEventListener("click", async event => {
  const backdrop = event.target.closest?.(".chat-workspace-backdrop");
  if (!backdrop) return;
  if (event.target.closest("[data-chat-workspace-close]") || event.target === backdrop) {
    closeChatWorkspace();
    return;
  }
  const action = event.target.closest("[data-role]");
  if (!action || action.dataset.role === "chat-expand") return;
  const node = findNode(backdrop.dataset.nodeId);
  if (!node) return closeChatWorkspace();
  if (action.dataset.role === "chat-html-open") {
    openChatHtmlPreview(node, Number(action.dataset.messageIndex));
    return;
  }
  if (action.dataset.role === "chat-html-code") {
    openChatHtmlPreview(node, Number(action.dataset.messageIndex), "code");
    return;
  }
  if (action.dataset.role === "chat-html-edit") {
    openChatHtmlEditor(node, Number(action.dataset.messageIndex));
    return;
  }
  // 对话节点专属控件直接分发:紧凑卡上没有同名控件,转发到画布会落空（附件按钮失联的根因）
  if (node.type === "chat" && action.dataset.role?.startsWith("chat-")) {
    await handleChatNodeAction(node, action.dataset.role, action);
    return;
  }
  let selector = `.node[data-id="${CSS.escape(node.id)}"] [data-role="${CSS.escape(action.dataset.role)}"]`;
  if (action.dataset.messageIndex !== undefined) selector += `[data-message-index="${CSS.escape(action.dataset.messageIndex)}"]`;
  if (action.dataset.attachmentId !== undefined) selector += `[data-attachment-id="${CSS.escape(action.dataset.attachmentId)}"]`;
  els.nodes.querySelector(selector)?.click();
});

document.addEventListener("input", event => {
  const backdrop = event.target.closest?.(".chat-workspace-backdrop");
  if (!backdrop) return;
  const node = findNode(backdrop.dataset.nodeId);
  if (!node) return;
  if (event.target.dataset.role === "chat-history-search") {
    node._chatHistoryQuery = event.target.value;
    syncChatNodeBody(node);
    document.querySelector('.chat-workspace [data-role="chat-history-search"]')?.focus();
    return;
  }
  if (event.target.dataset.role !== "chat-text") return;
  node.chatDraft = event.target.value;
  saveActiveChatSession(node, true);
  const compactInput = els.nodes.querySelector(`.node[data-id="${CSS.escape(node.id)}"] textarea[data-role="chat-text"]`);
  if (compactInput) compactInput.value = node.chatDraft;
  markDirty();
});

document.addEventListener("change", async event => {
  const backdrop = event.target.closest?.(".chat-workspace-backdrop");
  const role = event.target.dataset?.role;
  if (!backdrop || (role !== "chat-model" && role !== "chat-enumerate-toggle")) return;
  const node = findNode(backdrop.dataset.nodeId);
  if (!node) return;
  const compactControl = node && els.nodes.querySelector(`.node[data-id="${CSS.escape(node.id)}"] [data-role="${CSS.escape(role)}"]`);
  if (compactControl) {
    if (role === "chat-model") compactControl.value = event.target.value;
    else compactControl.checked = event.target.checked;
    compactControl.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  // 紧凑卡上没有同名控件时直接写回节点（与画布 change 委托同款语义）
  if (role === "chat-model") {
    await changeChatNodeModel(node, event.target.value);
  } else {
    // 批量提示词开关:只落盘不渲染(checkbox 自身持态),下次回车发送即生效
    node._chatEnumerated = event.target.checked;
    saveActiveChatSession(node, true);
    markDirty();
  }
});

document.addEventListener("dblclick", event => {
  const tab = event.target.closest?.(".chat-session-tab");
  const backdrop = tab?.closest(".chat-workspace-backdrop");
  if (!tab || !backdrop) return;
  const node = findNode(backdrop.dataset.nodeId);
  const opener = tab.querySelector('[data-role="chat-session-open"]');
  if (node && opener) handleChatNodeAction(node, "chat-session-rename", opener);
});

document.addEventListener("dragstart", event => {
  const tab = event.target.closest?.(".chat-session-tab");
  if (!tab) return;
  event.dataTransfer?.setData("text/x-canvasflow-chat-session", tab.dataset.chatSessionId || "");
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
});

document.addEventListener("dragover", event => {
  if (event.target.closest?.(".chat-session-tab")) event.preventDefault();
});

document.addEventListener("drop", event => {
  const target = event.target.closest?.(".chat-session-tab");
  const backdrop = target?.closest(".chat-workspace-backdrop");
  const sourceId = event.dataTransfer?.getData("text/x-canvasflow-chat-session");
  if (!target || !backdrop || !sourceId || sourceId === target.dataset.chatSessionId) return;
  event.preventDefault();
  const node = findNode(backdrop.dataset.nodeId);
  if (!node) return;
  const from = node.chatSessions.findIndex(session => session.id === sourceId);
  const to = node.chatSessions.findIndex(session => session.id === target.dataset.chatSessionId);
  if (from < 0 || to < 0) return;
  const [session] = node.chatSessions.splice(from, 1);
  node.chatSessions.splice(to, 0, session);
  pushHistory(); syncChatNodeBody(node);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && document.querySelector(".chat-html-editor-backdrop")) {
    closeChatHtmlEditor();
    return;
  }
  if (event.key === "Escape" && document.querySelector(".chat-html-preview-backdrop")) {
    document.querySelector(".chat-html-preview-backdrop")?.remove();
    return;
  }
  if (event.key === "Escape" && expandedChatNodeId) {
    closeChatWorkspace();
    return;
  }
  const backdrop = event.target.closest?.(".chat-workspace-backdrop");
  if (!backdrop || event.target.dataset.role !== "chat-text" || event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  const node = findNode(backdrop.dataset.nodeId);
  if (node && !node._chatBusy) sendChatNodeMessage(node.id);
});

// 浏览器生图:建任务 → 扩展内容脚本在站点页面模拟人工操作 → 轮询取结果。
// 首图进节点预览,多余图片各自生成图片节点(与 AI 节点多图语义一致)。
async function generateBrowserImage(nodeId) {
  const node = findNode(nodeId);
  if (!node || node.type !== "browser-image" || node.disabled || node.generating) return;
  normalizeBrowserNode(node);
  const siteTarget = browserNodeSiteTarget(node);
  if (!siteTarget) {
    node._browserError = "请填写自定义站点网址（含域名）";
    render();
    return;
  }
  const collected = collectUpstreamForAI(node.id, buildIncomingIndex());
  const upstreamText = collected.texts.join("，").trim();
  const prompt = String(node.prompt || "").trim() || upstreamText;
  const images = [];
  for (const ref of [...(collected.branches || []).flatMap(branch => branch.images || []), ...(collected.groupImages || [])].filter((ref, index, refs) => refs.findIndex(other => (other.assetId || other.image || other._nodeId) === (ref.assetId || ref.image || ref._nodeId)) === index).slice(0, 4)) {
    const url = await materializeReferenceImage(ref);
    if (typeof url === "string" && url.startsWith("data:image/")) images.push(url);
  }
  if (!prompt && !images.length) {
    node._browserError = "需要提示词，或连接上游文字/图片节点";
    render();
    return;
  }
  node.generating = true;
  node._browserError = "";
  node._browserStatus = "正在创建任务";
  const queueTask = { id: `q${aiTaskQueue.nextId++}`, kind: "browser", nodeId: node.id, pageId: state.activePageId, label: "浏览器生图", model: node._browserSite, resolution: "串行", size: node._browserNewConversation ? "新对话" : "继续对话", projectName: currentPage()?.name || "", prompt, thumbnail: images[0] || "", status: "waiting", progress: 0 };
  aiTaskQueue.items.push(queueTask);
  renderTaskQueue();
  const requestId = `breq-${++chatRequestSeq}`;
  node._browserRequestId = requestId;
  render();
  try {
    const resp = await apiFetch("/api/browser-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site: siteTarget, pageUrl: node._browserSite === "custom" ? node._browserOrigin : "", newConversation: node._browserNewConversation, prompt, images, nodeId: node.id }),
    });
    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error((typeof data.error === "string" ? data.error : data.error?.message) || `创建任务失败（HTTP ${resp.status}）`);
    const taskId = String(data.taskId || "");
    node._browserTaskId = taskId;
    queueTask.browserTaskId = taskId;
    node._browserStatus = "等待浏览器插件领取";
    renderNodes();
    const startedAt = Date.now();
    for (;;) {
      await new Promise(resolve => setTimeout(resolve, BROWSER_TASK_POLL_MS));
      if (node._browserRequestId !== requestId || node._browserTaskId !== taskId) { queueTask.status = "cancelled"; renderTaskQueue(); return; } // 已取消/节点已删除
      let status;
      try {
        const statusResp = await apiFetch(`/api/browser-task/status/${encodeURIComponent(taskId)}`);
        status = await statusResp.json();
      } catch (error) {
        if (Date.now() - startedAt > BROWSER_TASK_TIMEOUT_MS) throw new Error("查询任务状态失败");
        continue;
      }
      queueTask.status = status.status === "running" ? "generating" : "waiting";
      queueTask.progress = status.status === "running" ? 30 : 0;
      if (status.status === "running" && !queueTask.startedAt) queueTask.startedAt = Date.now();
      renderTaskQueue();
      if (status.status === "completed") {
        const urls = Array.isArray(status.images) ? status.images.filter(url => typeof url === "string") : [];
        if (!urls.length) throw new Error(status.text ? "站点只返回了文字，没有生成图片" : "站点未返回图片");
        queueTask.status = "done"; queueTask.progress = 100; queueTask.thumbnail = urls[0]; renderTaskQueue();
        node.generatedImage = urls[0];
        urls.slice(1).forEach((url, index) => {
          const imageNode = addNode("image", node.x + node.w + 40, node.y + index * IMAGE_NODE_VERTICAL_STEP, false);
          imageNode.image = url;
          imageNode.fileName = `browser-result-${index + 2}.png`;
          imageNode.mime = "image/png";
        });
        node.generating = false;
        node._browserStatus = "";
        node._browserError = "";
        pushHistory();
        render();
        toast(urls.length > 1 ? `浏览器生成完成，共 ${urls.length} 张` : "浏览器生成完成");
        return;
      }
      if (status.status === "failed") throw new Error(status.error || "浏览器生成失败");
      if (status.status === "expired") throw new Error("浏览器任务已过期或服务已重启，请重新生成");
      if (queueTask.startedAt && Date.now() - queueTask.startedAt > BROWSER_TASK_TIMEOUT_MS) throw new Error("浏览器插件超时未响应（确认已在目标站点页面安装并启用 CanvasFlow 插件）");
      node._browserStatus = status.status === "running" ? "浏览器页面执行中…" : "等待浏览器插件领取";
      renderNodes();
    }
  } catch (error) {
    if (node._browserRequestId !== requestId) return;
    node.generating = false;
    queueTask.status = "failed"; queueTask.error = error.message || "浏览器生成失败"; renderTaskQueue();
    node._browserError = error.message || "浏览器生成失败";
    render();
  } finally {
    if (node._browserRequestId === requestId) delete node._browserRequestId;
  }
}

let screenshotCatalogSignature = "";
function publishScreenshotNodeCatalog(force = false) {
  if (!window.chrome?.webview) return;
  const nodes = state.nodes.filter(node => node.type === "screenshot-input").sort((a, b) => (a.screenshotSeq || 0) - (b.screenshotSeq || 0)).map(node => ({ id: node.id, name: `截图功能节点 #${node.screenshotSeq}`, summary: screenshotNodeSummary(node) }));
  const signature = JSON.stringify(nodes);
  if (!force && signature === screenshotCatalogSignature) return;
  screenshotCatalogSignature = signature;
  window.chrome.webview.postMessage({ type: "screenshot:node-catalog", nodes });
}

async function materializeReferenceImage(reference, options = {}) {
  if (typeof reference === "string") return reference;
  const assetBridge = window.canvasflowDesktop || desktop;
  if (assetBridge && reference?.assetId) {
    try {
      const result = await assetBridge.readAsset(reference.assetId);
      return result.dataUrl || "";
    } catch (error) {
      const node = reference._nodeId ? findNode(reference._nodeId) : null;
      const inline = String(reference.image || node?.image || node?.generatedImage || "");
      const fallback = inline.startsWith("data:image/") ? inline : "";
      console.warn("[参考图] 素材读取失败", { assetId: reference.assetId, fileName: reference.fileName, usedInline: Boolean(fallback), message: error.message });
      if (options.requireOriginal) {
        markNodeAssetIssue(node, `原图素材读取失败，已阻止使用缩略图编辑：${reference.fileName || "未命名图片"}`);
        throw error;
      }
      if (fallback) {
        markNodeAssetIssue(node, `素材文件丢失，本次已自动改用内嵌缩略图（清晰度可能降低）；建议重新上传图片：${reference.fileName || "未命名图片"}`);
        return fallback;
      }
      markNodeAssetIssue(node, `素材文件丢失，可能已被移动或删除，请重新上传图片：${reference.fileName || "未命名图片"}`);
      throw error;
    }
  }
  if (reference?.assetId && options.requireOriginal) throw new Error("当前运行方式无法读取素材仓库原图");
  return reference?.image || "";
}

function markNodeAssetIssue(node, message) {
  if (!node || node._assetIssue === message) return;
  node._assetIssue = message;
  console.warn("[参考图] 节点素材问题标记", { nodeId: node.id, message });
  renderNodes();
}

// agtoken 同步接口的返回结果暂存表：submitGeneration 返回伪任务号，pollTask 取走后即删
const agtokenSyncResults = new Map();
let agtokenSyncSeq = 0;

async function parseAgtokenImageResponse(resp) {
  const raw = await resp.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    if (resp.status === 524 || /error\s*code\s*:\s*524/i.test(raw)) {
      throw new Error("AGToken 生成超时（HTTP 524）：上游可能仍已生成，但画布未收到结果。请先到 AGToken 检查；若已生成，请下载图片后拖回画布，确认未生成再重试，避免重复扣费");
    }
    const detail = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
    throw new Error(`AGToken 返回了非 JSON 响应（HTTP ${resp.status || "未知"}）${detail ? `：${detail}` : ""}`);
  }
  const apiMessage = typeof data?.error === "string" ? data.error : data?.error?.message;
  if (!resp.ok || data?.error) {
    if (resp.status === 524) {
      throw new Error("AGToken 生成超时（HTTP 524）：上游可能仍已生成，但画布未收到结果。请先到 AGToken 检查；若已生成，请下载图片后拖回画布，确认未生成再重试，避免重复扣费");
    }
    throw new Error(apiMessage || `AGToken 生成失败（HTTP ${resp.status || "未知"}）`);
  }
  return data;
}

async function submitAgtokenGeneration(prompt, imageUrls, node) {
  const apiType = node._apiType || activeApiType();
  const entry = modelCatalogEntry(node._model, apiType);
  const payload = {
    model: node._model,
    prompt: prompt || "generate an image",
    n: entry?.quality && isImage25ExtModel(node._model) ? Math.max(1, Math.min(4, Number(node._count) || 1)) : 1,
    size: String(node._resolution || "1k").toLowerCase(),
    response_format: "url",
  };
  if (node._size && node._size !== "auto") payload.aspect_ratio = node._size;
  if (entry?.quality && node._quality) payload.quality = node._quality;
  if (imageUrls.length) payload.images = await Promise.all(imageUrls.map(materializeReferenceImage));

  const endpoint = imageUrls.length ? "/api/agtoken/edits" : "/api/agtoken/generate";
  const resp = await apiFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CanvasFlow-Api-Key": activeApiKey(apiType) || "" },
    body: JSON.stringify(desktop ? payload : { ...payload, _apiKey: activeApiKey(apiType) }),
  });
  const data = await parseAgtokenImageResponse(resp);
  const urls = (Array.isArray(data.data) ? data.data : [])
    .map(item => {
      if (item?.url) return item.url;
      if (item?.b64_json) return item.b64_json.startsWith("data:") ? item.b64_json : `data:image/png;base64,${item.b64_json}`;
      return "";
    })
    .filter(Boolean);
  if (!urls.length) throw new Error("agtoken 生成完成但无图片结果");
  const token = `agtoken-sync-${++agtokenSyncSeq}`;
  agtokenSyncResults.set(token, urls);
  return token;
}

async function submitGeneration(prompt, imageUrls, node) {
  if (!prompt && !imageUrls.length) throw new Error("需要提示词或参考图");
  const apiType = node._apiType || activeApiType();
  normalizeAiNodeSettings(node, {}, apiType);
  if (apiType === "agtoken") return submitAgtokenGeneration(prompt, imageUrls, node);
  const extVersion = image25ExtVersion(node._model);
  const payload = {
    model: extVersion ? "gpt-image-2.5-ext" : node._model,
    prompt: prompt || "generate an image",
    n: extVersion ? Math.max(1, Math.min(4, Number(node._count) || 1)) : 1,
    size: node._size,
    resolution: extVersion ? String(node._resolution || "1k").toUpperCase() : node._resolution,
  };
  if (extVersion) payload.version = extVersion;
if (node._model === "gpt-image-2-official" || isImage25StandardModel(node._model)) {
    payload.quality = node._quality || "medium";
}
  if (imageUrls.length) payload.image_urls = await Promise.all(imageUrls.map(materializeReferenceImage));

  if (node._model === "midjourney") {
    const entry = modelCatalogEntry(node._model, apiType);
    payload.version = entry.versions.includes(node._mjVersion) ? node._mjVersion : entry.versions[0];
    payload.speed = entry.speeds.includes(node._mjSpeed) ? node._mjSpeed : "relax";
    delete payload.model;
    delete payload.n;
    delete payload.resolution;
  }

  // Node is still a temporary local backend during the first .NET migration stage.
  // Keep the key out of URLs and persisted project data; the backend receives it only in this request body.
  if (!desktop) payload._apiKey = state.settings.apiKey;

  const resp = await apiFetch(node._model === "midjourney" ? "/api/midjourney/generate" : "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (!resp.ok || data.error) throw new Error(data.error?.message || (resp.status === 404 ? "当前宿主不支持此模型，请更新并重启服务或桌面程序" : `提交失败（HTTP ${resp.status}）`));
  const taskId = data.data?.id || data.data?.[0]?.task_id;
  if (!taskId) throw new Error("未获取到任务ID");
  return taskId;
}

async function pollTask(taskId, onProgress = null, returnAllImages = false, maxAttempts = 120) {
  if (typeof taskId === "string" && taskId.startsWith("agtoken-sync-")) {
    const urls = agtokenSyncResults.get(taskId);
    agtokenSyncResults.delete(taskId);
    if (!urls) throw new Error("同步生成结果已失效，请重新生成");
    if (onProgress) onProgress(100, "completed");
    if (!urls.length) throw new Error("任务完成但无图片结果");
    return returnAllImages ? urls : urls[0];
  }
  // 3 秒一轮、120 次 ≈ 6 分钟总超时（沿用原 1s×360 的超时预算，仅降低查询频率）
  let lastErr = null;
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 3000));
    let data;
    try {
      const resp = await apiFetch(`/api/task/${encodeURIComponent(taskId)}`, {
        headers: { "X-CanvasFlow-Api-Key": state.settings.apiKey || "" },
      });
      if (resp.status === 429 || [500, 502, 503, 504].includes(resp.status)) {
        lastErr = new Error(`查询服务暂时不可用（${resp.status}）`);
        console.warn(`[任务查询] ${taskId} 第 ${i + 1} 次遇到临时状态 ${resp.status}，将继续重试`);
        continue;
      }
      if (!resp.ok) {
        const error = new Error(`查询失败（HTTP ${resp.status}）`);
        error.retryable = false;
        throw error;
      }
      data = await resp.json();
    } catch (e) {
      lastErr = e;
      console.warn(`[任务查询] ${taskId} 第 ${i + 1} 次失败：${e.message || e}`);
      if (e.retryable === false) throw e;
      if (i < maxAttempts - 1) continue;
      break;
    }
    lastErr = null;
    if (data.error) throw new Error(data.error.message || "查询失败");
    if (data.data) {
      if (data.data.status === "completed") {
        if (onProgress) onProgress(100, "completed");
        const images = data.data.result?.images;
        if (images && images.length) {
          const urls = images.flatMap(image => Array.isArray(image?.url) ? image.url : [image?.url]).filter(Boolean);
          if (urls.length) return returnAllImages ? urls : urls[0];
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
  if (typeof url === "string" && url.startsWith("data:image/")) return url;
  const maxAttempts = 3;
  const retryDelayMs = 2000;
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await apiFetch("/api/download-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url }),
      });
      const data = await resp.json();
      if (data.error) {
        const message = typeof data.error === "string" ? data.error : (data.error.message || "图片下载失败");
        throw new Error(message);
      }
      if (!data.base64) throw new Error("图片下载响应缺少 base64 数据");
      return data.base64;
    } catch (error) {
      lastError = error.message || String(error);
      console.warn(`[生成结果] 图片下载失败（第 ${attempt}/${maxAttempts} 次）`, { url, message: lastError });
      if (attempt < maxAttempts) await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error(`图片下载失败：${lastError}`);
}

function queueTaskStatusText(task) {
  const status = task.status === "waiting" ? "等待发送"
    : task.status === "paused" ? "已暂停"
      : task.status === "submitting" ? "正在提交"
        : task.status === "generating" ? "正在生成"
          : task.status === "downloading" ? "正在下载"
            : task.status === "done" ? (task.warning ? "完成·保存异常" : "已完成")
              : task.status === "failed" ? "失败"
                : "已取消";
  return translateUiString(status);
}

function queueTaskIsRunning(task) {
  return ["slot-waiting", "submitting", "generating", "downloading"].includes(task.status);
}

function queueTaskIsSettled(task) {
  return ["done", "failed", "cancelled"].includes(task.status);
}

function taskQueueForNode(nodeId) {
  return aiTaskQueue.items.filter(task => task.nodeId === nodeId);
}

// 任务可能属于非激活项目(切换已放开):按 pageId 找回所属页与页内节点
function taskTargetPage(task) {
  return state.pages.find(page => page.id === task.pageId) || null;
}

function nodeFromPageData(page, nodeId) {
  return (page?.data?.nodes || []).find(node => node.id === nodeId) || null;
}

function countForeignUnsettledTasks() {
  return aiTaskQueue.items.filter(task => !queueTaskIsSettled(task) && task.pageId && task.pageId !== state.activePageId).length;
}

function refreshQueuedNodeProgress(nodeId) {
  if (!nodeId) return;
  const node = findNode(nodeId);
  if (!node) return;
  if (node.type === "browser-image") { renderNodes(); return; }
  const tasks = taskQueueForNode(nodeId).filter(task => !node._queueRunId || task.runId === node._queueRunId);
  const pending = tasks.filter(task => !queueTaskIsSettled(task));
  node.generating = pending.some(queueTaskIsRunning);
  if (tasks.length) syncAiNodeTaskProgress(node, tasks);
  else {
    node._aiProgress = null;
    renderNodes();
  }
}

function renderTaskQueue() {
  if (!els.taskQueueList) return;
  const waiting = aiTaskQueue.items.filter(task => task.status === "waiting").length;
  const paused = aiTaskQueue.items.filter(task => task.status === "paused").length;
  const running = aiTaskQueue.items.filter(queueTaskIsRunning).length;
  const activeCount = waiting + paused + running;
  els.taskQueueBadge.textContent = String(activeCount);
  els.taskQueueBadge.classList.toggle("hidden", activeCount === 0);
  els.taskQueueBtn.classList.toggle("has-active", running > 0);
  els.taskQueueSummary.textContent = aiTaskQueue.items.length
    ? (uiLanguage === "en" ? `Running ${running} · Queued ${waiting} · Paused ${paused}` : `运行 ${running} · 等待 ${waiting} · 暂停 ${paused}`)
    : translateUiString("暂无任务");
  els.taskQueueList.innerHTML = aiTaskQueue.items.length ? aiTaskQueue.items.map((task, index) => {
    const thumbnail = task.thumbnail ? `<img src="${task.thumbnail}" alt="">` : translateUiString("无参考图");
    const canManage = task.kind !== "browser" && (task.status === "waiting" || task.status === "paused");
    const pauseButton = task.kind === "browser" ? "" : task.status === "waiting" ? `<button data-queue-action="pause" title="${translateUiString("暂停等待任务")}">Ⅱ</button>` : task.status === "paused" ? `<button data-queue-action="resume" title="${translateUiString("继续任务")}">▶</button>` : "";
    const orderButtons = canManage ? `<button data-queue-action="up" title="${translateUiString("向前移动")}">↑</button><button data-queue-action="down" title="${translateUiString("向后移动")}">↓</button><button data-queue-action="remove" title="${translateUiString("删除等待任务")}">×</button>` : "";
    const progress = task.status === "done" ? 100 : Number(task.progress) || 0;
    const runningClass = queueTaskIsRunning(task) ? " is-running" : "";
    const title = task.error || task.warning || task.prompt || "";
    return `<div class="task-queue-item${runningClass}" data-task-id="${task.id}" title="${escapeHtml(title)}">
      <div class="task-queue-thumb">${thumbnail}</div>
      <div class="task-queue-copy">
        <div class="task-queue-title"><span>${escapeHtml(task.label)}</span><span class="task-queue-status">${queueTaskStatusText(task)}</span></div>
        <div class="task-queue-prompt">${escapeHtml(task.prompt || translateUiString("(无文字输入)"))}</div>
        <div class="task-queue-meta">${escapeHtml(task.projectName ? `${task.projectName} · ` : "")}${escapeHtml(task.model)} · ${escapeHtml(task.resolution)} · ${escapeHtml(task.size)}</div>
        ${task.error ? taskQueueErrorMarkup(task.error) : ""}
        <div class="task-queue-mini-progress"><span style="width:${Math.max(0, Math.min(100, progress))}%"></span></div>
      </div>
      <div class="task-queue-actions">${pauseButton}${orderButtons}</div>
    </div>`;
  }).join("") : `<div class="task-queue-empty">${translateUiString("还没有 AI 绘图任务")}</div>`;
}

function taskQueueErrorMarkup(error) {
  const message = String(error || "");
  const agtokenCheckLink = /AGToken.*(?:HTTP\s*524|任务结果未知)/i.test(message)
    ? `<a class="task-queue-error-link" href="https://agtoken.vip/usage-logs/task" target="_blank" rel="noopener noreferrer">打开 AGToken 任务记录，检查是否已生成</a>`
    : "";
  return `<div class="task-queue-error" role="alert"><span>${escapeHtml(message)}</span>${agtokenCheckLink}</div>`;
}

function moveQueuedTask(taskId, direction) {
  const index = aiTaskQueue.items.findIndex(task => task.id === taskId);
  if (index < 0) return;
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= aiTaskQueue.items.length) return;
  const task = aiTaskQueue.items[index];
  const target = aiTaskQueue.items[targetIndex];
  if (!["waiting", "paused"].includes(task.status) || !["waiting", "paused"].includes(target.status)) return;
  aiTaskQueue.items.splice(index, 1);
  aiTaskQueue.items.splice(targetIndex, 0, task);
  renderTaskQueue();
}

function manageQueuedTask(taskId, action) {
  const task = aiTaskQueue.items.find(item => item.id === taskId);
  if (!task) return;
  if (action === "pause" && task.status === "waiting") task.status = "paused";
  else if (action === "resume" && task.status === "paused") task.status = "waiting";
  else if (action === "remove" && ["waiting", "paused"].includes(task.status)) {
    aiTaskQueue.items = aiTaskQueue.items.filter(item => item.id !== taskId);
    refreshQueuedNodeProgress(task.nodeId);
  } else if (action === "up") return moveQueuedTask(taskId, -1);
  else if (action === "down") return moveQueuedTask(taskId, 1);
  renderTaskQueue();
  pumpAiTaskQueue();
}

function queuedGenerationSettings(node) {
  normalizeAiNodeSettings(node);
  return { type: "ai-image", _model: node._model, _resolution: node._resolution, _quality: node._quality, _size: node._size, _count: node._count, _mjVersion: node._mjVersion, _mjSpeed: node._mjSpeed };
}

// 队列任务数系数：gpt-image-2.5 系单任务 n>1 恒为 1，其余模型按“生成张数”拆成多个任务
function taskCountFactor(settings) {
  if (isImage25ExtModel(settings?._model)) return 1;
  return Math.max(1, Math.min(4, Number(settings?._count) || 1));
}

function generatedResultFileName(task, node, dataUrl) {
  const mime = (String(dataUrl).match(/^data:([^;,]+)/) || [])[1] || "image/png";
  const extension = extensionFor("", mime);
  const project = safeName(task.projectName || "项目").slice(0, 36) || "项目";
  const taskNumber = Number(String(task.id || "").replace(/^q/, ""));
  const sequence = String(Number.isFinite(taskNumber) && taskNumber > 0 ? taskNumber : Math.max(0, Number(task.resultOrder) || 0) + 1).padStart(3, "0");
  const resultSuffix = Number(task.resultImageIndex) > 0 ? `_${String(Number(task.resultImageIndex) + 1).padStart(2, "0")}` : "";
  const date = new Date();
  const dateLabel = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `${dateLabel}-${project}-${sequence}${resultSuffix}.${extension}`;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
let pngCrcTable = null;
function pngCrc32(bytes) {
  if (!pngCrcTable) {
    pngCrcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      pngCrcTable[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = pngCrcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dataUrlToBytes(dataUrl) {
  const body = String(dataUrl).split(",")[1] || "";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToDataUrl(bytes, mime = "image/png") {
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return `data:${mime};base64,${btoa(bin)}`;
}

function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, pngCrc32(out.subarray(4, 8 + data.length)));
  return out;
}

// iTXt uses UTF-8 so Chinese prompts survive; layout: keyword NUL flag method langNUL translatedNUL text
function embedGenerationMetadata(dataUrl, meta) {
  try {
    if (!/^data:image\/png;base64,/i.test(String(dataUrl))) return dataUrl;
    const bytes = dataUrlToBytes(dataUrl);
    if (bytes.length < 8 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) return dataUrl;
    const chunks = [];
    for (const [keyword, value] of Object.entries(meta)) {
      if (!value) continue;
      const keywordBytes = new TextEncoder().encode(keyword);
      const textBytes = new TextEncoder().encode(String(value));
      const payload = new Uint8Array(keywordBytes.length + 5 + textBytes.length);
      payload.set(keywordBytes, 0);
      payload.set(textBytes, keywordBytes.length + 5);
      chunks.push(pngChunk("iTXt", payload));
    }
    if (!chunks.length) return dataUrl;
    const extra = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const insertAt = bytes.length - 12; // before IEND chunk (length + type + crc)
    const out = new Uint8Array(bytes.length + extra);
    out.set(bytes.subarray(0, insertAt), 0);
    let offset = insertAt;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
    out.set(bytes.subarray(insertAt), offset);
    console.debug("[生成结果] 已写入PNG生成信息", Object.keys(meta));
    return bytesToDataUrl(out);
  } catch (error) {
    console.warn("[生成结果] 写入PNG生成信息失败，使用原始图片", error);
    return dataUrl;
  }
}

function readGenerationMetadataFromPng(dataUrl) {
  try {
    const bytes = dataUrlToBytes(dataUrl);
    if (bytes.length < 8 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const decoder = new TextDecoder();
    const meta = {};
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (type === "IEND") break;
      if (type === "iTXt") {
        const data = bytes.subarray(offset + 8, offset + 8 + length);
        const keywordEnd = data.indexOf(0);
        // uncompressed iTXt: flag=0 right after keyword NUL; text starts after flag + method + lang NUL + translated NUL
        if (keywordEnd > 0 && data[keywordEnd + 1] === 0 && data[keywordEnd + 4] === 0) {
          const keyword = decoder.decode(data.subarray(0, keywordEnd));
          meta[keyword] = decoder.decode(data.subarray(keywordEnd + 5));
        }
      }
      offset += 12 + length;
    }
    return Object.keys(meta).length ? meta : null;
  } catch (error) {
    console.warn("[生成结果] 读取PNG生成信息失败", error);
    return null;
  }
}

function generationMetadataFor(prompt, projectName, taskId) {
  return {
    prompt,
    "CanvasFlow.Project": projectName || "",
    "CanvasFlow.Time": new Date().toISOString(),
    "CanvasFlow.TaskId": taskId || "",
  };
}

// 勾选"以项目名称创建文件夹导出"时,生成图片保存到 ai_generated/项目名/ 子文件夹(保存接口支持文件名带子目录并自动建目录)
function projectExportFileName(fileName, projectName) {
  if (!state.settings.projectExportFolder) return fileName;
  const folder = safeName(projectName || "项目").slice(0, 36) || "项目";
  return `${folder}/${fileName}`;
}

async function saveGeneratedOutput(dataUrl, task, node) {
  const fileName = generatedResultFileName(task, node, dataUrl);
  const response = await apiFetch("/api/save-export-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderName: "ai_generated", linkGenerated: Boolean(node), baseFolder: task.exportFolder || "export", files: [{ name: projectExportFileName(fileName, task.projectName), data: dataUrl }] }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || `HTTP ${response.status}`);
  return { fileName, outputPath: result.files?.[0] || "", outputFolder: result.path || "", assetId: result.assetIds?.[0] || "" };
}

async function applyQueuedResult(task, node, rawResultDataUrl) {
  const dataUrl = embedGenerationMetadata(rawResultDataUrl, generationMetadataFor(task.prompt, task.projectName, task.id));
  let saved = null;
  try {
    saved = await saveGeneratedOutput(dataUrl, task, node);
    task.outputPath = saved.outputPath;
  } catch (error) {
    task.warning = `图片已生成，但保存到输出文件夹失败：${error.message}`;
    console.error("[生成结果] 输出文件保存失败", { taskId: task.id, nodeId: node.id, message: error.message });
  }
  const fileName = saved?.fileName || generatedResultFileName(task, node, dataUrl);
  // 离页落位:任务所属项目不是当前页时,直接写回该项目的 page.data(节点按 id 重新解析,新节点不进当前画布)
  const targetPage = taskTargetPage(task);
  const offPage = targetPage && targetPage.id !== state.activePageId ? targetPage : null;
  if (offPage) {
    node = nodeFromPageData(offPage, task.nodeId) || node;
  }
  if (task.resultMode === "node-preview") {
    node.generatedImage = dataUrl;
    delete node.generatedAssetId;
    node.fileName = fileName;
    node.mime = (String(dataUrl).match(/^data:([^;,]+)/) || [])[1] || "image/png";
    node.generationPrompt = task.prompt || "";
    node.outputPath = saved?.outputPath || "";
    await externalizeImageField(node, "generatedImage", "generatedAssetId", fileName, saved?.assetId);
  } else {
    const columns = Math.min(3, Math.max(1, Number(task.resultCount) || 1));
    const resultIndex = Math.max(0, Number(task.resultOrder) || 0);
    const column = resultIndex % columns;
    const row = Math.floor(resultIndex / columns);
    const resultNode = offPage
      ? addNodeToPageData(offPage, "image", node.x + NODE_WIDTH + 40 + column * (NODE_WIDTH + 40), node.y + row * IMAGE_NODE_VERTICAL_STEP)
      : addNode("image", node.x + NODE_WIDTH + 40 + column * (NODE_WIDTH + 40), node.y + row * IMAGE_NODE_VERTICAL_STEP, false);
    resultNode.image = dataUrl;
    resultNode.fileName = fileName;
    resultNode.mime = (String(dataUrl).match(/^data:([^;,]+)/) || [])[1] || "image/png";
    resultNode.generationPrompt = task.prompt || "";
    resultNode.aiSourceNodeId = node.id;
    if (task.source === "region-matting") {
      resultNode.mattingSourceRect = task.mattingSourceRect?.slice();
      resultNode.mattingSourceSize = task.mattingSourceSize?.slice();
    }
    resultNode.aiBatchIndex = task.groupIndex >= 0 ? task.groupIndex : null;
    resultNode.outputPath = saved?.outputPath || "";
    task.resultNodeId = resultNode.id;
    if (!offPage) render();
    try {
      await externalizeImageField(resultNode, "image", "imageAssetId", fileName, saved?.assetId);
    } catch (error) {
      task.warning = `结果已显示，但写入素材仓库失败：${error.message}`;
      console.error("[生成结果] 素材仓库写入失败，保留画布结果", { taskId: task.id, resultNodeId: resultNode.id, message: error.message });
    }
  }
  if (offPage) {
    // 离页变更直接持久化(page.data 已改写),不进当前页的撤销历史
    markDirty();
  } else {
    pushHistory();
    render();
  }
}

// 生成成功但下载失败时，把结果链接暂存到节点上，供“重新下载结果”取回（结果链接约24小时有效）
function recordNodePendingResults(node, task, urls) {
  if (!node || node.type !== "ai-image" || !Array.isArray(urls)) return;
  const list = urls.filter(Boolean);
  if (!list.length) return;
  const pending = node._pendingResults && Array.isArray(node._pendingResults.items) ? node._pendingResults : { items: [] };
  for (const url of list) {
    if (pending.items.some(item => item.url === url)) continue;
    pending.items.push({ url, prompt: task.prompt || "", taskId: task.taskId || "", at: Date.now() });
  }
  if (pending.items.length > 16) pending.items.splice(0, pending.items.length - 16);
  node._pendingResults = pending;
}

function clearNodePendingResults(node, task) {
  const pending = node?._pendingResults;
  if (!pending?.items?.length) return;
  pending.items = pending.items.filter(item => !task?.taskId || item.taskId !== task.taskId);
  if (!pending.items.length) delete node._pendingResults;
}

async function redownloadAiResults(nodeId) {
  const node = findNode(nodeId);
  const items = (node?._pendingResults?.items || []).slice();
  if (!node || !items.length || node.generating || node._redownloadBusy) return;
  node._redownloadBusy = true;
  setAiNodeProgress(node, "downloading", "正在重新下载结果", 8);
  let recovered = 0;
  let firstToNode = !node.generatedImage;
  const failedItems = [];
  for (let i = 0; i < items.length; i++) {
    setAiNodeProgress(node, "downloading", `正在重新下载结果 ${i + 1}/${items.length}`, 8 + Math.round(((i + 1) / items.length) * 84));
    try {
      const dataUrl = await fetchImageAsBase64(items[i].url);
      const task = {
        id: `q${aiTaskQueue.nextId++}`,
        nodeId: node.id,
        pageId: state.activePageId,
        projectName: currentPage()?.name || "项目",
        exportFolder: state.settings.exportFolderLabel || "export",
        referenceName: "重新下载结果",
        prompt: items[i].prompt || "",
        groupIndex: -1,
        resultMode: firstToNode ? "node-preview" : "image-node",
        resultOrder: state.nodes.filter(n => n.type === "image" && n.aiSourceNodeId === node.id).length,
        resultCount: 1,
      };
      firstToNode = false;
      await applyQueuedResult(task, node, dataUrl);
      recovered++;
    } catch (error) {
      failedItems.push(items[i]);
      console.error("[生成结果] 重新下载失败", { url: items[i].url, message: error.message });
    }
  }
  delete node._redownloadBusy;
  if (failedItems.length) node._pendingResults = { items: failedItems };
  else delete node._pendingResults;
  if (recovered) {
    setAiNodeProgress(node, "done", `已取回 ${recovered} 张结果`, 100);
    clearAiNodeProgressSoon(node);
    setProgress(100, "AI生成完成");
    hideProgressSoon();
    toast(failedItems.length ? `已取回 ${recovered} 张，仍有 ${failedItems.length} 张下载失败，可稍后重试` : `已取回 ${recovered} 张生成结果`);
  } else {
    setAiNodeProgress(node, "failed", "重新下载失败", null, "图片下载仍失败，请检查网络或代理后重试；结果链接约24小时内有效");
    toast("重新下载失败，请检查网络或代理后重试");
  }
  pushHistory();
  render();
}

function notifyScreenshotTask(task, error = "") {
  if (task.source !== "screenshot" || !window.chrome?.webview) return;
  window.chrome.webview.postMessage({
    type: "screenshot:task-update",
    requestId: task.screenshotRequestId || "",
    taskId: task.id,
    status: task.status,
    progress: Number(task.progress) || 0,
    outputPath: task.outputPath || "",
    error: error || task.error || task.warning || "",
  });
}

async function applyScreenshotQueuedResult(task, dataUrl) {
  try {
    const saved = await saveGeneratedOutput(dataUrl, task, null);
    task.outputPath = saved.outputPath;
  } catch (error) {
    task.warning = `图片已经生成，但保存到输出文件夹失败：${error.message}`;
    throw error;
  }
}

async function runQueuedAiTask(task) {
  // 切换项目已放开:任务节点可能不在当前页,按 pageId 从页数据兜底解析
  let node = findNode(task.nodeId) || nodeFromPageData(taskTargetPage(task), task.nodeId);
  if (!node && task.source !== "screenshot") throw new Error("对应的 AI 绘图节点已被删除");
  task.status = "slot-waiting";
  refreshQueuedNodeProgress(task.nodeId);
  renderTaskQueue();
  const releaseSlot = task.localMatting ? () => {} : await acquireAiApiSlot(task.label || task.id);
  let imageUrls;
  try {
  task.status = "submitting";
  task.progress = 0;
  refreshQueuedNodeProgress(task.nodeId);
  renderTaskQueue();
  notifyScreenshotTask(task);
  const taskImages = task.orderedImages || (task.groupImage ? [...task.regularImages, task.groupImage] : task.regularImages);
  console.debug("[AI队列] 提交参考图顺序", {
    taskId: task.id,
    images: taskImages.map(image => image?.fileName || image?.assetId || "未命名图片"),
  });
  if (task.localMatting) {
    imageUrls = await runLocalRegionMatting(task);
  } else {
  // PR-5 图片批注：发送前合成定位图与提示词。原图序号不变、定位图统一追加到尾部；
  // taskImages（任务原始参考图）永不改动，每次尝试都从它重新推导，定位图天然不会重复插入；
  // 提示词每次尝试都从固定来源 _annotationPromptSource（首次捕获的原始 prompt）重算，
  // 与当轮实际发送数组严格一致（定位图成败、超限、未知上限等降级都会如实反映到编号说明中）。
  let sendImages = taskImages;
  let sendPrompt = task.prompt;
  let annotationApplied = false;
  const annotationModule = window.CanvasFlowImageAnnotations;
  if (annotationModule?.hasAnnotatedReference(taskImages)) {
    if (task._annotationPromptSource === undefined) task._annotationPromptSource = task.prompt ?? ""; // 原始 prompt 来源，只捕获一次
    const locatorLimit = annotationModelImageLimit(task.generationSettings);
    const prepared = await annotationModule.prepareSubmission(task._annotationPromptSource, taskImages, async (reference, refs) => {
      try {
        const original = await materializeReferenceImage(reference);
        const locator = await annotationModule.createLocatorImage(original, refs);
        return { image: locator, assetId: "", fileName: `${reference.fileName || "image"}-批注定位图.png`, mime: "image/png", _annotationLocator: true };
      } catch (error) {
        console.warn("[图片批注] 定位图创建失败，该图仅按坐标说明提交", error);
        return null;
      }
    }, locatorLimit);
    sendImages = prepared.references;
    sendPrompt = prepared.prompt;
    annotationApplied = true;
    if (prepared.annotatedCount && !prepared.locatorAllowed) {
      console.warn(locatorLimit
        ? `[图片批注] 参考图 ${taskImages.length} 张 + 定位图 ${prepared.annotatedCount} 张超出模型上限 ${locatorLimit}，本次仅按坐标说明提交（不删原图）`
        : `[图片批注] 模型 ${task.generationSettings?._model || "?"} 未声明参考图上限，保守跳过定位图，仅按坐标说明提交（不删原图）`);
    }
    if (sendImages !== taskImages) {
      console.debug("[图片批注] 最终发送数组", { taskId: task.id, images: sendImages.map(image => image?.fileName || "未命名图片") });
    }
  }
  // 带配色标注箭头的参考图:按本次实际发送的图片顺序内置颜色修改提示词;子句文本只计算一次
  // （序号基于最终数组 sendImages 计算；尾部追加规则下原图序号跨尝试稳定，重试复用同一子句文本是安全的）
  if (task._arrowNoteClause === undefined) {
    const colorArrowIndexes = sendImages.map((image, index) => image?.hasColorArrowNotes ? index + 1 : 0).filter(Boolean);
    task._arrowNoteClause = colorArrowIndexes.length ? `根据第${colorArrowIndexes.join("、")}张图标注要求进行颜色修改，未标注部分不要改动，生成结果中不要带选框、箭头、标注` : "";
  }
  if (task._arrowNoteClause) {
    if (annotationApplied) {
      // 批注任务：sendPrompt 每轮从固定来源整体重算，此处拼接不会跨轮累积
      sendPrompt = sendPrompt ? `${sendPrompt}，${task._arrowNoteClause}` : task._arrowNoteClause;
    } else if (task._arrowNoteAppended !== true) {
      // 非批注任务：保持上游"子句只拼接一次"语义
      sendPrompt = sendPrompt ? `${sendPrompt}，${task._arrowNoteClause}` : task._arrowNoteClause;
      task._arrowNoteAppended = true;
    }
  }
  // Persist the same fallback text sent to the API, including image-only requests.
  if (!sendPrompt && taskImages.length) sendPrompt = "generate an image";
  task.prompt = sendPrompt; // 与本次实际发送一致（导出 PNG 的 generationPrompt 取此值）
  task.taskId = await submitGeneration(task.prompt, sendImages, task.generationSettings);
  task.status = "generating";
  refreshQueuedNodeProgress(task.nodeId);
  renderTaskQueue();
  notifyScreenshotTask(task);
  imageUrls = await pollTask(task.taskId, progress => {
    task.progress = progress;
    refreshQueuedNodeProgress(task.nodeId);
    renderTaskQueue();
    notifyScreenshotTask(task);
  }, isImage25ExtModel(task.generationSettings?._model) || task.generationSettings?._model === "midjourney", task.generationSettings?._model === "midjourney" ? 600 : 120);
  }
  } finally {
    releaseSlot();
  }
  task.status = "downloading";
  task.progress = 96;
  refreshQueuedNodeProgress(task.nodeId);
  renderTaskQueue();
  notifyScreenshotTask(task);
  const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
  // 落位前必须按 id 重新解析节点:任务运行期间用户可能切走又切回、撤销重做或新建项目,
  // saveCurrentPage/restoreData 的深克隆会替换全部节点对象,启动时捕获的 node 会失联——
  // 只在"任务属于其他项目"时重解析不够,同项目切回后也要落到当前画布的活节点上,
  // 否则 node-preview 结果写进失联对象,任务显示已完成而画布无图
  const liveNode = findNode(task.nodeId);
  node = liveNode || nodeFromPageData(taskTargetPage(task), task.nodeId) || node;
  if (task.groupRunId && canvasGroupRuns.get(node?.canvasGroupId)?.id === task.groupRunId && canvasGroupRuns.get(node.canvasGroupId).stopped) {
    task.status = "cancelled";
    if (node) node.generating = false;
    return;
  }
  if (!liveNode && node) {
    // 离页节点没人清理进度状态,切回时会卡"生成中",这里直接清掉(同节点其余任务的进度回调会重建)
    node.generating = false;
    delete node._aiProgress;
  }
  const expectedCount = isImage25ExtModel(task.generationSettings?._model)
    ? Math.max(1, Math.min(4, Number(task.generationSettings?._count) || 1))
    : 1;
  if (urls.length < expectedCount) console.warn("[生成结果] 返回图片数量少于请求数量", { taskId: task.id, expectedCount, actualCount: urls.length });
  const baseOrder = Math.max(0, Number(task.resultOrder) || 0);
  // 预览模式：第一张留在节点预览，其余图片节点从 baseOrder 起紧凑排布（单图任务两者等价）
  const firstResultStaysInNode = task.resultMode === "node-preview";
  const externalResultCount = Math.max(0, urls.length - (firstResultStaysInNode ? 1 : 0));
  const totalResults = firstResultStaysInNode
    ? baseOrder + externalResultCount
    : Math.max(Number(task.resultCount) || 0, baseOrder + externalResultCount);
  task.outputPaths = [];
  for (let index = 0; index < urls.length; index++) {
    let dataUrl;
    try {
      dataUrl = await fetchImageAsBase64(urls[index]);
    } catch (downloadError) {
      // 任务在服务端已生成并计费，把未下载的结果链接暂存到节点，避免网络抖动导致整单损失
      recordNodePendingResults(node, task, urls.slice(index));
      console.error("[生成结果] 下载失败，已在节点保留重新下载入口", { taskId: task.id, nodeId: node?.id || "", url: urls[index], message: downloadError.message });
      throw new Error(`任务已完成，但结果图片下载失败（${downloadError.message}）。已生成的结果链接约24小时内有效，可在节点上点击“重新下载结果”取回`);
    }
    if (task.source === "screenshot") {
      await applyScreenshotQueuedResult(task, dataUrl);
      if (task.outputPath) task.outputPaths.push(task.outputPath);
      continue;
    }
    const resultTask = index === 0 ? task : {
      ...task,
      id: `${task.id}-${index + 1}`,
      resultMode: "image-node",
      resultOrder: baseOrder + index - (firstResultStaysInNode ? 1 : 0),
      resultCount: totalResults,
      resultImageIndex: index,
      outputPath: "",
    };
    if (index === 0) {
      resultTask.resultOrder = baseOrder;
      resultTask.resultCount = totalResults;
    }
    await applyQueuedResult(resultTask, node, dataUrl);
    if (resultTask.outputPath) task.outputPaths.push(resultTask.outputPath);
  }
  task.outputPath = task.outputPaths[0] || task.outputPath || "";
  clearNodePendingResults(node, task);
  task.status = "done";
  task.progress = 100;
  notifyScreenshotTask(task);
  const landedPage = taskTargetPage(task);
  if (landedPage && landedPage.id !== state.activePageId && task.source !== "screenshot") {
    toast(`结果已落回项目「${landedPage.name || "未命名"}」`);
  }
}

function runQueuedTask(task) {
  return task.kind === "video" ? runQueuedVideoTask(task) : runQueuedAiTask(task);
}

// 并发任务错峰提交：同步接口(如 agtoken)对同一密钥的瞬时并发提交可能被上游拒绝。
// 以"最近一次提交时间"为基准保证任意两次任务启动至少间隔 AI_TASK_SUBMIT_STAGGER_MS，
// 无论触发来源是入队、错峰定时器还是任务完成补位(补位不会被瞬时完成的任务绕过)。
const AI_TASK_SUBMIT_STAGGER_MS = 500;
let aiQueueStaggerTimer = null;
let aiQueueLastSubmitAt = 0;

function pumpAiTaskQueue() {
  if (aiQueueStaggerTimer) { clearTimeout(aiQueueStaggerTimer); aiQueueStaggerTimer = null; }

  // 本地抠图拥有独立的单任务通道，不等待远程 AI 槽位，也不参与远程提交错峰。
  if (aiTaskQueue.localRunning < 1) {
    const localTask = aiTaskQueue.items.find(item => item.kind !== "browser" && item.localMatting && item.status === "waiting");
    if (localTask) {
      aiTaskQueue.localRunning++;
      runQueuedTask(localTask).catch(error => {
        localTask.status = "failed";
        localTask.error = error.message;
        console.error("[本地抠图队列] 任务执行失败", { taskId: localTask.id, nodeId: localTask.nodeId, message: error.message });
      }).finally(() => {
        aiTaskQueue.localRunning--;
        refreshQueuedNodeProgress(localTask.nodeId);
        renderTaskQueue();
        pumpAiTaskQueue();
      });
    }
  }

  while (aiTaskQueue.running < AI_QUEUE_MAX_CONCURRENT) {
    const task = aiTaskQueue.items.find(item => item.kind !== "browser" && !item.localMatting && item.status === "waiting");
    if (!task) break;
    const sinceLastSubmit = Date.now() - aiQueueLastSubmitAt;
    if (sinceLastSubmit < AI_TASK_SUBMIT_STAGGER_MS) {
      aiQueueStaggerTimer = setTimeout(() => { aiQueueStaggerTimer = null; pumpAiTaskQueue(); }, AI_TASK_SUBMIT_STAGGER_MS - sinceLastSubmit);
      break;
    }
    aiQueueLastSubmitAt = Date.now();
    aiTaskQueue.running++;
    runQueuedTask(task).catch(error => {
      task.status = "failed";
      task.error = error.message;
      notifyScreenshotTask(task, error.message);
      console.error("[任务队列] 任务执行失败", { taskId: task.id, nodeId: task.nodeId, message: error.message });
    }).finally(() => {
      aiTaskQueue.running--;
      refreshQueuedNodeProgress(task.nodeId);
      renderTaskQueue();
      pumpAiTaskQueue();
    });
  }
  renderTaskQueue();
}

async function enqueueScreenshotTasks(message) {
  if (!activeApiKey()) {
    toast("请先在设置中填写并保存 API Key");
    if (window.chrome?.webview) window.chrome.webview.postMessage({
      type: "screenshot:task-update", requestId: message.requestId || "", taskId: "",
      status: "failed", progress: 0, outputPath: "", error: "尚未设置 API Key",
    });
    return 0;
  }
  const imageDataUrl = String(message.imageDataUrl || "");
  let prompt = String(message.prompt || "").trim();
  let regularImages = [];
  let batchImages = [];
  let sourceNode = null;
  if (message.useCanvasNodeInput) {
    sourceNode = findNode(String(message.canvasNodeId || ""));
    if (!sourceNode || sourceNode.type !== "screenshot-input") {
      notifyScreenshotRequestFailure(message, "请选择有效的截图功能节点");
      return showAppAlert("所选截图功能节点已不存在，请重新选择后再发送。");
    }
    const input = directScreenshotNodeInputs(sourceNode.id);
    if (!input.texts.length) {
      notifyScreenshotRequestFailure(message, "截图功能节点没有连接有效文字");
      return showAppAlert("截图功能节点没有连接有效文字，请连接文字节点后重试。");
    }
    prompt = input.texts.join("，");
    regularImages = input.images;
    batchImages = input.batchImages;
  }
  if (!imageDataUrl.startsWith("data:image/") || !prompt) {
    toast("截图任务缺少有效截图或提示词");
    return 0;
  }
  const count = Math.max(1, Math.min(4, Number(sourceNode?._count ?? message.count) || 1));
  const rawBatchCount = batchImages.length;
  const preparedRegular = await prepareScreenshotReferences(regularImages);
  const preparedBatch = await prepareScreenshotReferences(batchImages);
  regularImages = preparedRegular.valid;
  batchImages = preparedBatch.valid;
  const skippedImages = preparedRegular.failed + preparedBatch.failed;
  if (skippedImages && !rawBatchCount) toast(`有 ${skippedImages} 张参考图无法读取，已跳过；其余内容继续发送`);
  if (rawBatchCount && !batchImages.length) {
    notifyScreenshotRequestFailure(message, "批量图片均无法读取");
    return showAppAlert("连接的多任务或图片文件夹中没有可读取的图片，请检查本地原图是否仍然存在。");
  }
  const generationSettings = {
    type: "ai-image",
    _model: String(sourceNode?._model || message.model || "gpt-image-2"),
    _resolution: String(sourceNode?._resolution || message.resolution || "1k"),
    _quality: String(sourceNode?._quality || message.quality || "low"),
    _size: String(sourceNode?._size || message.ratio || "1:1"),
  };
  const batches = batchImages.length ? batchImages : [null];
  const total = batches.length * count;
  if (batchImages.length) {
    window.chrome?.webview?.postMessage({ type: "screenshot:batch-dialog-open" });
    let confirmed = false;
    try { confirmed = await confirmScreenshotBatch({ imageDataUrl, batchImages, prompt, regularCount: regularImages.length, count, total, skippedImages }); }
    finally { window.chrome?.webview?.postMessage({ type: "screenshot:batch-dialog-close" }); }
    if (!confirmed) {
      notifyScreenshotRequestStatus(message, "cancelled", "已取消批量任务");
      return 0;
    }
  }
  let order = 0;
  for (const batchImage of batches) for (let index = 0; index < count; index++) {
    aiTaskQueue.items.push({
      id: `q${aiTaskQueue.nextId++}`,
      nodeId: "",
      source: "screenshot",
      screenshotRequestId: String(message.requestId || ""),
      pageId: state.activePageId,
      projectName: currentPage()?.name || "项目",
      exportFolder: state.settings.exportFolderLabel || "export",
      label: total > 1 ? `截图工具 · ${order + 1}/${total}` : "截图工具",
      prompt,
      regularImages: [{ image: imageDataUrl, fileName: "screenshot.png", mime: "image/png" }, ...regularImages],
      groupImage: batchImage,
      groupIndex: -1,
      referenceName: batchImage?.fileName || "screenshot.png",
      thumbnail: String(message.thumbnailDataUrl || imageDataUrl),
      generationSettings: { ...generationSettings },
      model: generationSettings._model,
      resolution: generationSettings._resolution,
      size: generationSettings._size,
      resultMode: "external-only",
      resultOrder: order,
      status: "waiting",
      progress: 0,
      created: Date.now() + order,
    });
    order++;
  }
  renderTaskQueue();
  pumpAiTaskQueue();
  toast(`截图任务已加入队列：${total} 个任务`);
  return total;
}

async function prepareScreenshotReferences(references) {
  const valid = [];
  let failed = 0;
  for (const reference of references) {
    try {
      const image = await materializeReferenceImage(reference);
      if (!String(image).startsWith("data:image/")) throw new Error("图片内容无效");
      valid.push({ ...reference, image, assetId: "" });
    } catch (error) {
      failed++;
      console.warn("[截图节点] 参考图读取失败，已跳过", { fileName: reference.fileName, message: error.message });
    }
  }
  return { valid, failed };
}

function notifyScreenshotRequestStatus(message, status, error) {
  if (!window.chrome?.webview) return;
  window.chrome.webview.postMessage({ type: "screenshot:task-update", requestId: message.requestId || "", taskId: "", status, progress: 0, outputPath: "", error });
}
function notifyScreenshotRequestFailure(message, error) { notifyScreenshotRequestStatus(message, "failed", error); }

function buildAiQueueTasks(node, upstream, resultMode, runId) {
  const generationSettings = queuedGenerationSettings(node);
  const nativeBatch = isImage25ExtModel(generationSettings._model);
  const count = Math.max(1, Math.min(4, Number(generationSettings._count) || 1));
  // gpt-image-2.5 系单个任务带 n=1-4；其余模型把“生成张数”拆成多个独立任务，每个任务生成 1 张
  const imagesPerRequest = nativeBatch ? count : 1;
  const tasksPerRequest = nativeBatch ? 1 : count;
  const prompt = upstream.texts.join("，");
  const groupImages = upstream.groupImages || [];
  const taskSources = groupImages.length ? groupImages : [null];
  const page = currentPage();
  const existingResultCount = state.nodes.filter(item => item.type === "image" && item.aiSourceNodeId === node.id).length;
  const tasks = taskSources.map((groupImage, index) => ({
    id: `q${aiTaskQueue.nextId++}`,
    nodeId: node.id,
    pageId: state.activePageId,
    runId,
    projectName: page?.name || "项目",
    exportFolder: state.settings.exportFolderLabel || "export",
    label: `${node.seq ? `AI #${node.seq}` : "AI 绘图"}${taskSources.length > 1 ? ` · ${index + 1}/${taskSources.length}` : ""}`,
    prompt,
    regularImages: upstream.images.map(image => ({ ...image })),
    groupImage: groupImage ? { ...groupImage } : null,
    orderedImages: (groupImage ? [...(upstream.orderedRefs || []), groupImage] : (upstream.orderedRefs || []))
      .slice()
      .sort((a, b) => (a._x || 0) - (b._x || 0))
      .map(image => ({ ...image })),
    groupIndex: groupImage ? index : -1,
    referenceName: groupImage?.fileName || upstream.images[0]?.fileName || "生成结果",
    thumbnail: groupImage?.image || upstream.images[0]?.image || "",
    generationSettings: { ...generationSettings },
    model: generationSettings._model,
    resolution: generationSettings._resolution,
    size: generationSettings._size,
    resultMode: groupImages.length ? "image-node" : resultMode,
    resultOrder: existingResultCount + index * imagesPerRequest,
    resultCount: existingResultCount + taskSources.length * imagesPerRequest,
    status: "waiting",
    progress: 0,
    created: Date.now() + index,
  }));
  if (tasksPerRequest <= 1) return tasks;
  const split = [];
  for (const task of tasks) {
    split.push(task);
    for (let k = 1; k < tasksPerRequest; k++) {
      split.push({
        ...task,
        id: `q${aiTaskQueue.nextId++}`,
        regularImages: task.regularImages.map(image => ({ ...image })),
        orderedImages: task.orderedImages.map(image => ({ ...image })),
        groupImage: task.groupImage ? { ...task.groupImage } : null,
        created: task.created + k,
      });
    }
  }
  return split;
}

function enqueueAiNode(nodeId, resultMode = "node-preview") {
  const splitIds = splitMultiInputAiNode(nodeId);
  if (splitIds.length > 1) pushHistory();
  let added = 0;
  for (const id of splitIds) {
    const node = findNode(id);
    if (!node || node.disabled) continue;
    if (taskQueueForNode(id).some(task => !queueTaskIsSettled(task))) {
      toast("该 AI 节点已有等待或运行中的任务");
      continue;
    }
    refreshAiPrompt(id);
    const upstream = collectUpstreamForAI(id);
    const branches = upstream.branches?.length ? upstream.branches : [{ texts: [], images: [] }];
    const hasInputs = upstream.texts.length || upstream.groupImages.length || branches.some(branch => branch.images.length);
    if (!hasInputs) continue;
    const runId = `run-${Date.now()}-${aiTaskQueue.nextId}`;
    node._queueRunId = runId;
    // 扇入(图片线或文字/变量线并列)时按线拆任务;多任务结果各自生成图片节点
    const effectiveResultMode = branches.length > 1 ? "image-node" : resultMode;
    const generationSettings = queuedGenerationSettings(node);
    const imagesPerRequest = isImage25ExtModel(generationSettings._model) ? Math.max(1, Math.min(4, Number(generationSettings._count) || 1)) : 1;
    const existingResultCount = state.nodes.filter(item => item.type === "image" && item.aiSourceNodeId === node.id).length;
    const baseLabel = node.seq ? `AI #${node.seq}` : "AI 绘图";
    const tasks = [];
    for (const branch of branches) {
      tasks.push(...buildAiQueueTasks(node, {
        ...upstream,
        texts: [...(branch.texts || []), ...upstream.groupTexts],
        images: branch.images,
        orderedRefs: branch.images,
      }, effectiveResultMode, runId));
    }
    tasks.forEach((task, index) => {
      task.resultOrder = existingResultCount + index * imagesPerRequest;
      task.resultCount = existingResultCount + tasks.length * imagesPerRequest;
      task.label = `${baseLabel}${tasks.length > 1 ? ` · ${index + 1}/${tasks.length}` : ""}`;
    });
    // 按“生成张数”拆出的任务(单支线、无组图、预览模式)：第一张仍留在节点预览，其余各自生成图片节点
    if (effectiveResultMode === "node-preview" && tasks.length > 1 && tasks[0].resultMode === "node-preview") {
      tasks.forEach((task, index) => {
        if (!index) return;
        task.resultMode = "image-node";
        task.resultOrder = existingResultCount + index - 1;
        task.resultCount = existingResultCount + tasks.length - 1;
      });
    }
    if (effectiveResultMode === "node-preview") {
      node.generatedImage = null;
      delete node.generationPrompt;
      delete node.generatedAssetId;
      node.outputPath = "";
    }
    delete node._pendingResults;
    aiTaskQueue.items.push(...tasks);
    added += tasks.length;
    refreshQueuedNodeProgress(id);
  }
  if (added) {
    render();
    renderTaskQueue();
    pumpAiTaskQueue();
    toast(`已加入任务队列：${added} 个任务`);
  }
  return added;
}

async function generateAiImage(nodeId) {
  const node = findNode(nodeId);
  if (!node || node.type !== "ai-image") return;
  if (!activeApiKey()) {
    toast("请先在设置中填入 API Key");
    return;
  }
  enqueueAiNode(nodeId, "node-preview");
}

// ---------- AI 视频任务链路（队列复用 aiTaskQueue，kind = "video"） ----------

function videoGenerationSettings(node) {
  normalizeVideoNode(node);
  return { type: "ai-video", _model: node._model, _videoRatio: node._videoRatio, _videoResolution: node._videoResolution, _videoDuration: node._videoDuration, _videoAudio: node._videoAudio };
}

function videoResultFileName(task) {
  const date = new Date();
  const dateLabel = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const project = safeName(task.projectName || "项目").slice(0, 36) || "项目";
  const taskNumber = Number(String(task.id || "").replace(/^q/, ""));
  const sequence = String(Number.isFinite(taskNumber) && taskNumber > 0 ? taskNumber : 1).padStart(3, "0");
  return `${dateLabel}-${project}-vid${sequence}.mp4`;
}

function enqueueVideoNode(nodeId) {
  const node = findNode(nodeId);
  if (!node || node.type !== "ai-video" || node.disabled) return 0;
  if (taskQueueForNode(nodeId).some(task => !queueTaskIsSettled(task))) {
    toast("该视频节点已有等待或运行中的任务");
    return 0;
  }
  refreshAiVideoPrompt(nodeId);
  const upstream = collectUpstreamForAI(nodeId);
  const images = (upstream.orderedRefs || [])
    .slice()
    .sort((a, b) => (a._x || 0) - (b._x || 0))
    .slice(0, VIDEO_TASK_MAX_IMAGES);
  const prompt = upstream.texts.join("，");
  if (!prompt.trim() && !images.length) {
    toast("视频节点需要连接文字或参考图");
    return 0;
  }
  const page = currentPage();
  const runId = `run-${Date.now()}-${aiTaskQueue.nextId}`;
  node._queueRunId = runId;
  delete node._pendingVideoUrl;
  const generationSettings = videoGenerationSettings(node);
  const task = {
    id: `q${aiTaskQueue.nextId++}`,
    kind: "video",
    nodeId: node.id,
    pageId: state.activePageId,
    runId,
    projectName: page?.name || "项目",
    exportFolder: state.settings.exportFolderLabel || "export",
    label: node.seq ? `AI 视频 #${node.seq}` : "AI 视频",
    prompt,
    regularImages: images.map(image => ({ ...image })),
    groupImage: null,
    orderedImages: images.map(image => ({ ...image })),
    groupIndex: -1,
    referenceName: images[0]?.fileName || "生成视频",
    thumbnail: images[0]?.image || "",
    generationSettings,
    model: generationSettings._model,
    resolution: generationSettings._videoResolution,
    size: generationSettings._videoRatio,
    resultMode: "node-preview",
    resultOrder: 0,
    resultCount: 1,
    status: "waiting",
    progress: 0,
    created: Date.now(),
  };
  aiTaskQueue.items.push(task);
  node.generating = true;
  node._aiProgress = null;
  refreshQueuedNodeProgress(nodeId);
  render();
  renderTaskQueue();
  pumpAiTaskQueue();
  toast("视频任务已加入队列");
  return 1;
}

async function generateAiVideo(nodeId) {
  const node = findNode(nodeId);
  if (!node || node.type !== "ai-video") return;
  if (!activeApiKey("agtoken")) {
    toast("请先在设置中填写并保存 AGToken API Key");
    return;
  }
  enqueueVideoNode(nodeId);
}

// 统一视频接口请求体（New API /v1/video/generations）：
//   prompt = 文字；images[] = 参考图（dataURL 或公网 URL，插件转成 Ark 的 image_url content 部分）；
//   duration/seconds = 时长（-1 智能时长）；metadata.{ratio,resolution,generate_audio,watermark} 合并入 Ark 请求体。
// duration 与 seconds 同时携带：不同网关版本读取的字段名不同，两个名字指向同一时长不冲突。
async function submitVideoGeneration(task) {
  const settings = task.generationSettings || {};
  const images = [];
  for (const ref of (task.orderedImages || []).slice(0, VIDEO_TASK_MAX_IMAGES)) {
    const dataUrl = await materializeReferenceImage(ref);
    if (dataUrl) images.push(dataUrl);
  }
  const prompt = String(task.prompt || "").trim();
  if (!prompt && !images.length) throw new Error("视频任务需要提示词或参考图");
  const duration = Number(settings._videoDuration) || 5;
  const payload = {
    model: settings._model,
    prompt,
    images,
    duration,
    seconds: duration,
    metadata: {
      ratio: settings._videoRatio || "16:9",
      resolution: String(settings._videoResolution || "1080p").toLowerCase(),
      generate_audio: settings._videoAudio !== false,
      watermark: false,
    },
  };
  const resp = await apiFetch("/api/agtoken/video-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CanvasFlow-Api-Key": activeApiKey("agtoken") || "" },
    body: JSON.stringify(desktop ? payload : { ...payload, _apiKey: activeApiKey("agtoken") }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.error) {
    const message = data.error?.message || data.message || `视频任务提交失败（HTTP ${resp.status}）`;
    throw new Error(resp.status === 404 ? "当前宿主不支持视频接口，请更新并重启服务或桌面程序" : message);
  }
  const taskId = data.task_id || data.data?.task_id || data.id || data.data?.id || "";
  if (!taskId) throw new Error("视频任务未返回任务编号");
  return taskId;
}

// 统一视频接口的查询响应在不同网关版本形状不同：新版 {code,data:{status,url}}，
// 旧版插件直接返回 {id,status,url}，原生透传则是火山 Ark 的 {status,content:{video_url}}——
// 这里对全部形状做宽容解析，避免绑死某一种。
function extractVideoTaskInfo(data) {
  const pick = (...values) => values.find(value => value !== undefined && value !== null && value !== "") || "";
  const asObject = value => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
  const root = asObject(data);
  const inner = asObject(root.data);
  const innerData = asObject(inner.data);
  // 各层 content 合并取并集(内层优先),避免空对象短路导致外层 content 取不到
  const content = { ...asObject(root.content), ...asObject(innerData.content), ...asObject(inner.content) };
  const errorNode = root.error || inner.error;
  const errorMessage = typeof errorNode === "string" ? errorNode : errorNode?.message || "";
  const failReason = pick(root.fail_reason, inner.fail_reason, errorMessage);
  const statusRaw = String(pick(root.status, inner.status, root.task_status, inner.task_status, "")).toLowerCase();
  const status = /succeed|success|complet/.test(statusRaw) ? "succeeded"
    : /fail|error|cancel|expired/.test(statusRaw) ? "failed"
      : /progress|running|process|generat/.test(statusRaw) ? "running"
        : statusRaw ? "queued" : "";
  const url = String(pick(root.url, inner.url, root.result_url, inner.result_url, content.video_url, root.video_url, inner.video_url) || "");
  const progressRaw = Number(pick(root.progress, inner.progress, 0));
  const progress = Number.isFinite(progressRaw) && progressRaw > 0 ? Math.min(99, progressRaw) : null;
  return { status, url, progress, error: failReason };
}

async function pollVideoTask(taskId, onProgress = null) {
  const startedAt = Date.now();
  let lastError = null;
  for (let attempt = 0; attempt < VIDEO_TASK_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, VIDEO_TASK_POLL_MS));
    let data;
    try {
      const resp = await apiFetch(`/api/agtoken/video-task/${encodeURIComponent(taskId)}`, {
        headers: { "X-CanvasFlow-Api-Key": activeApiKey("agtoken") || "" },
      });
      if (resp.status === 429 || [500, 502, 503, 504].includes(resp.status)) {
        lastError = new Error(`查询服务暂时不可用（${resp.status}）`);
        console.warn(`[视频任务] ${taskId} 第 ${attempt + 1} 次遇到临时状态 ${resp.status}，将继续重试`);
        continue;
      }
      if (!resp.ok) {
        const error = new Error(`视频任务查询失败（HTTP ${resp.status}）`);
        error.retryable = false;
        throw error;
      }
      data = await resp.json();
    } catch (error) {
      lastError = error;
      console.warn(`[视频任务] ${taskId} 第 ${attempt + 1} 次查询失败：${error.message || error}`);
      if (error.retryable === false) throw error;
      continue;
    }
    lastError = null;
    if (data?.error && !data.status && !data.data) throw new Error(data.error.message || "视频任务查询失败");
    const info = extractVideoTaskInfo(data);
    if (info.error && info.status === "failed") throw new Error(info.error);
    if (info.status === "succeeded") {
      if (onProgress) onProgress(100);
      if (!info.url) throw new Error("视频生成完成但未返回成片链接");
      return info.url;
    }
    if (info.status === "failed") throw new Error(info.error || "视频生成失败");
    // 上游不给进度时按耗时估个平滑刻度（Seedance 2.0 通常 2-10 分钟）
    const elapsedMinutes = (Date.now() - startedAt) / 60000;
    const estimate = Math.min(92, 4 + elapsedMinutes * 12);
    if (onProgress) onProgress(info.progress ?? estimate);
  }
  throw new Error(`视频生成超时（约 ${Math.round(VIDEO_TASK_MAX_ATTEMPTS * VIDEO_TASK_POLL_MS / 60000)} 分钟），任务可能仍在上游运行，可稍后重试`);
}

async function downloadVideoFile(url, task) {
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await apiFetch("/api/download-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, fileName: videoResultFileName(task) }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : data.error.message || "视频下载失败");
      if (!data.fileName) throw new Error("视频下载响应缺少文件名");
      return data;
    } catch (error) {
      lastError = error.message || String(error);
      console.warn(`[视频任务] 成片下载失败（第 ${attempt}/3 次）`, { url, message: lastError });
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error(`视频下载失败：${lastError}`);
}

async function redownloadVideoResult(nodeId) {
  const node = findNode(nodeId);
  if (!node || node.type !== "ai-video" || node._videoRedownloadBusy) return;
  const url = node._pendingVideoUrl;
  if (!url) return;
  node._videoRedownloadBusy = true;
  node._aiProgress = { status: "downloading", label: "正在重新下载视频", percent: 20, error: "" };
  renderNodes();
  try {
    const saved = await downloadVideoFile(url, { id: node.id, projectName: currentPage()?.name || "项目" });
    delete node._pendingVideoUrl;
    node.videoFile = saved.fileName;
    node._aiProgress = { status: "done", label: "下载完成", percent: 100, error: "" };
    clearAiNodeProgressSoon(node);
    pushHistory();
    render();
    toast("视频已重新下载");
  } catch (error) {
    node._aiProgress = { status: "failed", label: "下载失败", percent: null, error: error.message };
    renderNodes();
    toast("视频下载失败：" + error.message);
  } finally {
    delete node._videoRedownloadBusy;
  }
}

async function runQueuedVideoTask(task) {
  // 落位前按 id 重新解析节点：任务运行期间切页/撤销会把节点对象整体换掉（同图片任务铁律）
  let node = findNode(task.nodeId) || nodeFromPageData(taskTargetPage(task), task.nodeId);
  if (!node) throw new Error("对应的 AI 视频节点已被删除");
  task.status = "slot-waiting";
  refreshQueuedNodeProgress(task.nodeId);
  renderTaskQueue();
  const releaseSlot = await acquireAiApiSlot(task.label || task.id);
  let videoUrl;
  try {
    task.status = "submitting";
    task.progress = 0;
    refreshQueuedNodeProgress(task.nodeId);
    renderTaskQueue();
    task.taskId = await submitVideoGeneration(task);
    task.status = "generating";
    refreshQueuedNodeProgress(task.nodeId);
    renderTaskQueue();
    videoUrl = await pollVideoTask(task.taskId, progress => {
      task.progress = progress;
      refreshQueuedNodeProgress(task.nodeId);
      renderTaskQueue();
    });
  } finally {
    releaseSlot();
  }
  task.status = "downloading";
  task.progress = 96;
  refreshQueuedNodeProgress(task.nodeId);
  renderTaskQueue();
  const liveNode = findNode(task.nodeId);
  node = liveNode || nodeFromPageData(taskTargetPage(task), task.nodeId) || node;
  if (!liveNode && node) {
    node.generating = false;
    node._aiProgress = null;
  }
  let saved;
  try {
    saved = await downloadVideoFile(videoUrl, task);
  } catch (downloadError) {
    // 上游已计费：把成片链接暂存到节点，保留“重新下载视频”入口（链接约24小时内有效）
    if (node) node._pendingVideoUrl = videoUrl;
    console.error("[视频任务] 成片下载失败，已在节点保留重新下载入口", { taskId: task.id, nodeId: node?.id || "", url: videoUrl, message: downloadError.message });
    throw downloadError;
  }
  delete node._pendingVideoUrl;
  node.videoFile = saved.fileName;
  node.generationPrompt = task.prompt || "";
  const landedPage = taskTargetPage(task);
  if (landedPage && landedPage.id !== state.activePageId) {
    markDirty();
    toast(`视频已落回项目「${landedPage.name || "未命名"}」`);
  } else {
    pushHistory();
    render();
  }
  task.status = "done";
  task.progress = 100;
  refreshQueuedNodeProgress(task.nodeId);
  renderTaskQueue();
}


async function generateSingle(node, upstream) {
  const { texts, images } = upstream;
  const imageUrls = images;

  node.batchTasks = null;
  node.generating = true;
  node.generatedImage = null;
  delete node.generatedAssetId;
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
    node.generationPrompt = texts.join("，");
    const taggedBase64 = embedGenerationMetadata(base64, generationMetadataFor(node.generationPrompt, currentPage()?.name || "项目", taskId));
    node.generatedImage = taggedBase64;
    delete node.generatedAssetId;
    node.generating = false;
    node.fileName = `ai_generated_${Date.now()}.png`;
    node.mime = "image/png";
    const saved = await saveGeneratedOutput(taggedBase64, {
      id: node.taskId,
      projectName: currentPage()?.name || "项目",
      exportFolder: state.settings.exportFolderLabel || runtimeExportFolder || "export",
    }, node).catch(error => {
      console.warn("[生成结果] 输出文件保存失败", error);
      return null;
    });
    node.fileName = saved?.fileName || node.fileName;
    node.outputPath = saved?.outputPath || "";
    await externalizeImageField(node, "generatedImage", "generatedAssetId", node.fileName, saved?.assetId);
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
  const regularUrls = images;
  const prompt = texts.join("，");
  const totalTasks = groupImages.length;
  const MAX_CONCURRENT = 5;

  node.generatedImage = null;
  delete node.generatedAssetId;
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
        const taskImages = [...regularUrls, groupImages[t.index]];
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
        t.result = embedGenerationMetadata(await fetchImageAsBase64(imageUrl), generationMetadataFor(prompt, currentPage()?.name || "项目", t.taskId));
        await externalizeImageField(t, "result", "resultAssetId", t.fileName || "ai_batch.png");
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
      const imgNode = addNode("image", aiX + NODE_WIDTH + 40, aiY + (seqNum - 1) * IMAGE_NODE_VERTICAL_STEP, false);
      imgNode.image = t.result;
      imgNode.imageAssetId = t.resultAssetId || "";
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
  // reveal 延迟到 refreshAiPrompt 的 render() 让 syncContentDrivenNodeHeights 定型节点高度之后：
  // addNode 时节点还是初始高度，渲染后内容自适应会撑高（如 300→433），提前 reveal 会按旧几何平移。
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
  revealCreatedNode(node);
  pushHistory();
  render();
  toast("已创建 AI 绘图节点");
  return node;
}

function addAiVideoNode(x, y, sourceIds) {
  const node = addNode("ai-video", x, y, false, { width: VIDEO_NODE_WIDTH });
  normalizeVideoNode(node);
  if (sourceIds && sourceIds.length) {
    sourceIds.slice(0, VIDEO_TASK_MAX_IMAGES + 4).forEach(sourceId => {
      const source = findNode(sourceId);
      if (!source || source.type === "output") return;
      state.edges.push({ id: uid("e"), from: { node: sourceId, port: "out" }, to: { node: node.id, port: "in" } });
    });
  }
  state.selected = new Set([node.id]);
  refreshAiVideoPrompt(node.id);
  pushHistory();
  render();
  toast("已创建 AI 视频节点");
  return node;
}

function addAngleImageNode(x, y, sourceIds = []) {
  // 与 addAiImageNode 相同：先渲染定型高度，再按最终几何 reveal。
  const node = addNode("angle-image", x, y, false);
  normalizeAngleNodeSettings(node);
  sourceIds.slice(0, 1).forEach(sourceId => {
    const source = findNode(sourceId);
    if (source && source.type !== "output") state.edges.push({ id: uid("e"), from: { node: sourceId, port: "out" }, to: { node: node.id, port: "in" } });
  });
  node.prompt = anglePrompt(node);
  pushHistory(); render(); revealCreatedNode(node); render(); toast("已创建角度变化节点（测试功能）");
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
  const outputPosition = findFreeNodePosition(source.x + 330, source.y, NODE_WIDTH, NODE_HEIGHT);
  const out = {
    id: uid("n"),
    type: "output",
    x: outputPosition.x,
    y: outputPosition.y,
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
  const usedScreenshotSequences = new Set();
  let nextScreenshotSequence = state.nodes.reduce((max, node) => node.type === "screenshot-input" ? Math.max(max, Number(node.screenshotSeq) || 0) : max, 0) + 1;
  state.nodes.forEach(n => {
    if (!n.w) n.w = NODE_WIDTH;
    if (!n.h) n.h = n.type === "ai-image" ? AI_NODE_HEIGHT : n.type === "angle-image" ? ANGLE_NODE_HEIGHT : n.type === "screenshot-input" ? SCREENSHOT_NODE_HEIGHT : n.type === "image" ? IMAGE_NODE_HEIGHT : (n.type === "group" || n.type === "folder") ? GROUP_NODE_HEIGHT : NODE_HEIGHT;
    if (n.type === "text") {
      const titlesHidden = state.settings.hideNodeTitles === true;
      const sizedForHiddenTitles = n._titleHiddenSized === true;
      if (titlesHidden !== sizedForHiddenTitles) n.h = Math.max(120, n.h + (titlesHidden ? -46 : 46));
      n._titleHiddenSized = titlesHidden;
    }
    if (n.type === "ai-image" && n.h === 400) n.h = AI_NODE_HEIGHT;
    if (n.type === "angle-image") normalizeAngleNodeSettings(n);
    if (n.type === "screenshot-input") {
      const sequence = Math.max(0, Math.trunc(Number(n.screenshotSeq) || 0));
      if (sequence && !usedScreenshotSequences.has(sequence)) {
        n.screenshotSeq = sequence;
        usedScreenshotSequences.add(sequence);
      } else {
        while (usedScreenshotSequences.has(nextScreenshotSequence)) nextScreenshotSequence++;
        n.screenshotSeq = nextScreenshotSequence;
        usedScreenshotSequences.add(nextScreenshotSequence++);
      }
    }
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
  const rendered = els.nodes.querySelector(`.node[data-id="${node.id}"]`);
  const width = rendered?.offsetWidth || node.w;
  const height = rendered?.offsetHeight || node.h;
  return {
    x: node.x + (side === "out" ? width : 0),
    y: node.y + (Number(node._portAnchorY) || height / 2),
  };
}

function edgeGeometry(a, b) {
  const p1 = portPoint(a, "out");
  const p2 = portPoint(b, "in");
  if (state.settings.smoothEdges) {
    const dx = Math.abs(p2.x - p1.x) * 0.5;
    return { type: "cubic", p1, c1: { x: p1.x + dx, y: p1.y }, c2: { x: p2.x - dx, y: p2.y }, p2 };
  }
  const gap = 60;
  const mid = p2.x > p1.x + gap ? (p1.x + p2.x) / 2 : Math.max(p1.x + gap, p2.x - gap);
  return { type: "polyline", points: [p1, { x: mid, y: p1.y }, { x: mid, y: p2.y }, p2] };
}

function edgePath(a, b) {
  const g = edgeGeometry(a, b);
  if (g.type === "cubic") return `M ${g.p1.x} ${g.p1.y} C ${g.c1.x} ${g.c1.y}, ${g.c2.x} ${g.c2.y}, ${g.p2.x} ${g.p2.y}`;
  return g.points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
}

function edgeSamplePoints(a, b) {
  const g = edgeGeometry(a, b);
  if (g.type === "polyline") return g.points;
  const points = [];
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    points.push({
      x: mt * mt * mt * g.p1.x + 3 * mt * mt * t * g.c1.x + 3 * mt * t * t * g.c2.x + t * t * t * g.p2.x,
      y: mt * mt * mt * g.p1.y + 3 * mt * mt * t * g.c1.y + 3 * mt * t * t * g.c2.y + t * t * t * g.p2.y,
    });
  }
  return points;
}

function segmentsIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (!d) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function render() {
  applySettings();
  normalizeNodeSizes();
  applyView();
  renderPageTabs();
  renderNodes();
  renderEdges();
  renderAnnotations();
  renderMinimap();
  publishScreenshotNodeCatalog();
}

function showCanvasDialog({ title, message, content = "", confirmText = "确定", cancelText = "" }) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "canvas-confirm-backdrop";
    overlay.innerHTML = `<section class="canvas-confirm-panel" role="dialog" aria-modal="true"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>${content}<div class="canvas-confirm-actions">${cancelText ? `<button data-dialog-cancel>${escapeHtml(cancelText)}</button>` : ""}<button class="primary" data-dialog-confirm>${escapeHtml(confirmText)}</button></div></section>`;
    const finish = value => { overlay.remove(); resolve(value); };
    overlay.querySelector("[data-dialog-confirm]").onclick = () => finish(true);
    overlay.querySelector("[data-dialog-cancel]")?.addEventListener("click", () => finish(false));
    overlay.addEventListener("mousedown", event => { if (event.target === overlay && cancelText) finish(false); });
    document.body.appendChild(overlay);
  });
}

function showAppAlert(message) { return showCanvasDialog({ title: "无法发送任务", message, confirmText: "知道了" }); }

function confirmScreenshotBatch({ imageDataUrl, batchImages, prompt, regularCount, count, total, skippedImages = 0 }) {
  const thumbs = [imageDataUrl, ...batchImages.map(image => image.image).filter(Boolean)].slice(0, 24).map((src, index) => `<figure><img src="${src}" alt=""><figcaption>${index === 0 ? "截图" : `批量图 ${index}`}</figcaption></figure>`).join("");
  const content = `<div class="screenshot-batch-summary"><div class="screenshot-batch-thumbs">${thumbs}</div><dl><div><dt>提示词</dt><dd>${escapeHtml(prompt.slice(0, 160))}</dd></div><div><dt>普通参考图</dt><dd>${regularCount} 张</dd></div><div><dt>批量图片</dt><dd>${batchImages.length} 张</dd></div>${skippedImages ? `<div><dt>无法读取</dt><dd>${skippedImages} 张，已跳过</dd></div>` : ""}<div><dt>单图生成</dt><dd>${count} 张</dd></div><div class="is-warning"><dt>最终任务</dt><dd>${total} 个，将消耗多次生成额度</dd></div></dl></div>`;
  return showCanvasDialog({ title: "确认批量截图任务", message: "每张批量图片都会与当前截图组合生成。", content, confirmText: `发送 ${total} 个任务`, cancelText: "取消" });
}

let interactiveRenderFrame = 0;
const interactiveRenderFlags = { view: false, nodes: false, edges: false, minimap: false, selection: false };
function scheduleInteractiveRender(flags = {}) {
  for (const key of Object.keys(interactiveRenderFlags)) interactiveRenderFlags[key] ||= !!flags[key];
  if (interactiveRenderFrame) return;
  interactiveRenderFrame = window.requestAnimationFrame(() => {
    interactiveRenderFrame = 0;
    const pending = { ...interactiveRenderFlags };
    for (const key of Object.keys(interactiveRenderFlags)) interactiveRenderFlags[key] = false;
    if (pending.view) applyView();
    if (pending.nodes) { syncNodeGeometry(); syncTextNodeScrollEdges(); }
    if (pending.selection) syncSelectedNodeClasses();
    if (pending.edges) renderEdges();
    if (pending.minimap) renderMinimap();
  });
}

function syncNodeGeometry() {
  for (const node of state.nodes) {
    const element = els.nodes.querySelector(`.node[data-id="${CSS.escape(node.id)}"]`);
    if (!element) continue;
    element.style.left = `${node.x}px`;
    element.style.top = `${node.y}px`;
    element.style.width = `${node.w}px`;
    element.style.height = `${node.h}px`;
  }
  els.nodes.querySelectorAll(".node-group-frame").forEach(frame => {
    const members = canvasGroupMembers(frame.dataset.groupId);
    if (members.length < 2) return;
    const bounds = canvasGroupBounds(members);
    frame.style.left = `${bounds.x}px`;
    frame.style.top = `${bounds.y}px`;
    frame.style.width = `${bounds.w}px`;
    frame.style.height = `${bounds.h}px`;
    frame.classList.toggle("is-blocked", !!drag?.blockedGroups?.has(frame.dataset.groupId));
  });
}

let viewPersistTimer = 0;
function scheduleViewPersistence() {
  saveCurrentPage();
  window.clearTimeout(viewPersistTimer);
  viewPersistTimer = window.setTimeout(() => {
    viewPersistTimer = 0;
    persistPages();
  }, 220);
}

function applyView() {
  els.world.style.transform = `translate(${state.view.x}px, ${state.view.y}px) scale(${state.view.scale})`;
  syncAnnotationPositions();
  updateViewportGrid();
}

function projectModeName(mode) {
  return "AI 绘图";
}

function projectButtonMarkup(page) {
  const name = page?.name || "未命名项目";
  return `<span class="project-name-text">${escapeHtml(name)}</span>`;
}

const UNGROUPED_GROUP_ID = "__ungrouped__";

// 悬停预览：临时把画布切换到悬停的项目；peek 记录原始页面，离开面板时切回
let projectPeek = null;
// 重命名输入期间必须冻结悬停预览：peek 会 switchPage 并整体重建面板 DOM，
// 正在编辑的重命名输入框会被销毁，表现为“打第一个字就中断输入”。
let projectPanelEditingName = false;

function peekProjectPage(target) {
  if (projectPanelEditingName) return;
  if (!target || target.id === state.activePageId) return;
  // 切换已放开,悬停预览不再受任务队列限制
  if (!projectPeek) projectPeek = { originalId: state.activePageId };
  switchPage(target.id);
}

function endProjectPeek(revert) {
  const peek = projectPeek;
  projectPeek = null;
  if (peek && revert && peek.originalId !== state.activePageId) switchPage(peek.originalId);
}

function normalizeGroups(rawGroups = null) {
  if (rawGroups !== null) state.groups = Array.isArray(rawGroups) ? rawGroups : [];
  if (!Array.isArray(state.groups)) state.groups = [];
  const seen = new Set();
  state.groups = state.groups.filter(group => {
    if (!group || typeof group.id !== "string" || !group.id || group.id === UNGROUPED_GROUP_ID) return false;
    if (typeof group.name !== "string" || !group.name.trim()) return false;
    if (seen.has(group.id)) return false;
    seen.add(group.id);
    return true;
  }).map(group => ({ id: group.id, name: group.name }));
  for (const page of state.pages) {
    if (!page.groupId || !state.groups.some(group => group.id === page.groupId)) page.groupId = UNGROUPED_GROUP_ID;
  }
}

function createGroupId() {
  return "grp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function projectGroupId(page) {
  return page && page.groupId && state.groups.some(group => group.id === page.groupId) ? page.groupId : UNGROUPED_GROUP_ID;
}

function renderPageTabs() {
  const page = currentPage();
  els.projectNameBtn.innerHTML = projectButtonMarkup(page);
  els.projectNameBtn.title = page ? page.name + " · " + projectModeName(page.mode) + "（点击打开项目管理器）" : "未命名项目";
  const menu = els.projectMenu;
  if (menu.classList.contains("hidden")) return;
  normalizeGroups();
  menu.innerHTML = "";

  const head = document.createElement("div");
  head.className = "project-panel-head";
  const title = document.createElement("span");
  title.className = "project-panel-title";
  title.textContent = "项目管理器";
  head.appendChild(title);
  const addGroupBtn = document.createElement("button");
  addGroupBtn.type = "button";
  addGroupBtn.className = "project-panel-mini-btn";
  addGroupBtn.textContent = "＋ 新建分组";
  addGroupBtn.onclick = () => {
    state.groups.push({ id: createGroupId(), name: "分组" + (state.groups.length + 1) });
    markDirty();
    persistPages();
    renderPageTabs();
  };
  head.appendChild(addGroupBtn);
  menu.appendChild(head);
  for (const group of state.groups) menu.appendChild(projectPanelGroupSection(group));
  menu.appendChild(projectPanelGroupSection({ id: UNGROUPED_GROUP_ID, name: "未分组" }));
  const footer = document.createElement("div");
  footer.className = "project-panel-footer";
  footer.textContent = "点击切换项目 · 悬停 0.5 秒预览";
  menu.appendChild(footer);

  let previewTimer = null;
  let pendingPreviewId = null;
  const clearPreviewTimer = () => { if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; } pendingPreviewId = null; };
  menu.addEventListener("mouseover", ev => {
    if (projectPanelEditingName) { clearPreviewTimer(); return; }
    const row = ev.target.closest(".project-panel-row");
    if (!row || row.dataset.pageId === state.activePageId) { clearPreviewTimer(); return; }
    if (row.dataset.pageId === pendingPreviewId) return;
    clearPreviewTimer();
    pendingPreviewId = row.dataset.pageId;
    const target = state.pages.find(item => item.id === row.dataset.pageId);
    if (!target) { clearPreviewTimer(); return; }
    // 悬停 0.5 秒临时把后面的画布切换成该项目；移开鼠标恢复，点击则正式切换
    previewTimer = setTimeout(() => {
      previewTimer = null;
      pendingPreviewId = null;
      peekProjectPage(target);
    }, 500);
  });
  menu.addEventListener("mouseleave", () => {
    clearPreviewTimer();
    if (projectPanelEditingName) return; // 改名中不动画布，避免重建面板
    endProjectPeek(true);
  });
}

function projectPanelVisiblePages(groupId) {
  return state.pages.filter(page => projectGroupId(page) === groupId);
}



function projectPanelIconBtn(className, title, svgPath, onclick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + svgPath + "</svg>";
  btn.onclick = onclick;
  return btn;
}

function projectPanelPageRow(page) {
  const row = document.createElement("div");
  row.className = "project-panel-row";
  row.dataset.pageId = page.id;
  row.draggable = true;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = page.id === state.activePageId ? "active" : "";
  btn.innerHTML = projectButtonMarkup(page);
  btn.onclick = () => {
    if (page.id !== state.activePageId) switchPage(page.id);
    projectPeek = null; // 点击 = 正式切换，悬停预览结束
    els.projectMenu.classList.add("hidden");
  };
  btn.ondblclick = ev => {
    ev.preventDefault();
    ev.stopPropagation();
    beginProjectPanelRename(page, btn);
  };
  row.appendChild(btn);

  const actions = document.createElement("div");
  actions.className = "project-panel-row-actions";
  actions.appendChild(projectPanelIconBtn("project-panel-icon-btn", "重命名项目",
    '<path d="M4 20l4.5-1L20 7.5a2.1 2.1 0 0 0-3-3L5.5 16 4 20z"/><path d="M13.5 6l3 3"/>',
    ev => {
      ev.stopPropagation();
      beginProjectPanelRename(page, btn);
    }));
  actions.appendChild(projectPanelIconBtn("project-panel-icon-btn danger", "删除项目",
    '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
    ev => {
      ev.stopPropagation();
      requestDeletePage(page.id);
    }));
  row.appendChild(actions);

  row.addEventListener("dragstart", ev => {
    ev.dataTransfer.setData("text/canvasflow-page", page.id);
    ev.dataTransfer.effectAllowed = "move";
  });
  row.addEventListener("dragend", () => {
    document.querySelectorAll(".drop-above, .drop-below").forEach(el => el.classList.remove("drop-above", "drop-below"));
  });
  row.addEventListener("dragover", ev => {
    if (!Array.from(ev.dataTransfer.types).includes("text/canvasflow-page")) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    const rect = row.getBoundingClientRect();
    const before = ev.clientY < rect.top + rect.height / 2;
    row.classList.toggle("drop-above", before);
    row.classList.toggle("drop-below", !before);
  });
  row.addEventListener("dragleave", () => row.classList.remove("drop-above", "drop-below"));
  row.addEventListener("drop", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    row.classList.remove("drop-above", "drop-below");
    const pageId = ev.dataTransfer.getData("text/canvasflow-page");
    if (!pageId || pageId === page.id) return;
    const rect = row.getBoundingClientRect();
    const before = ev.clientY < rect.top + rect.height / 2;
    const groupId = projectGroupId(page);
    let beforePageId = page.id;
    if (!before) {
      const groupPages = projectPanelVisiblePages(groupId);
      const pos = groupPages.findIndex(item => item.id === page.id);
      const next = groupPages[pos + 1];
      beforePageId = next ? next.id : null;
    }
    moveProjectPage(pageId, groupId, beforePageId);
  });
  return row;
}

function moveProjectPage(pageId, groupId, beforePageId) {
  const fromIdx = state.pages.findIndex(item => item.id === pageId);
  if (fromIdx === -1) return;
  const moved = state.pages.splice(fromIdx, 1)[0];
  moved.groupId = groupId;
  let insertIdx = state.pages.length;
  if (beforePageId) {
    const targetIdx = state.pages.findIndex(item => item.id === beforePageId);
    if (targetIdx !== -1) insertIdx = targetIdx;
  } else {
    const groupPages = state.pages.filter(item => projectGroupId(item) === groupId);
    if (groupPages.length) insertIdx = state.pages.findIndex(item => item.id === groupPages[groupPages.length - 1].id) + 1;
  }
  state.pages.splice(insertIdx, 0, moved);
  normalizeGroups();
  markDirty();
  persistPages();
  renderPageTabs();
}

function projectPanelGroupSection(group) {
  const isUngrouped = group.id === UNGROUPED_GROUP_ID;
  const section = document.createElement("div");
  section.className = "project-panel-group";
  section.dataset.groupId = group.id;
  const activePage = currentPage();
  if (activePage && projectGroupId(activePage) === group.id) section.classList.add("current-group");

  const head = document.createElement("div");
  head.className = "project-panel-group-head";
  if (!isUngrouped) head.draggable = true;

  const icon = document.createElement("span");
  icon.className = "project-panel-group-icon";
  icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>';
  head.appendChild(icon);

  const name = document.createElement("span");
  name.className = "project-panel-group-name";
  name.textContent = group.name;
  name.title = isUngrouped ? "默认分组（固定在最后，不可删除）" : "双击重命名分组；拖动可排序";
  if (!isUngrouped) {
    name.ondblclick = ev => {
      ev.preventDefault();
      ev.stopPropagation();
      beginProjectPanelGroupRename(group, name);
    };
  }
  head.appendChild(name);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "project-panel-mini-btn fixed";
  addBtn.textContent = "＋";
  addBtn.title = "在此分组新建项目";
  addBtn.onclick = ev => {
    ev.stopPropagation();
    newPage(isUngrouped ? null : group.id);
  };
  head.appendChild(addBtn);

  if (!isUngrouped) {
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "project-panel-mini-btn danger fixed";
    delBtn.textContent = "×";
    delBtn.title = "删除分组（组内项目移入未分组）";
    delBtn.onclick = ev => {
      ev.stopPropagation();
      const inside = state.pages.filter(item => projectGroupId(item) === group.id).length;
      const text = inside
        ? "分组“" + group.name + "”包含 " + inside + " 个项目，删除分组后这些项目将移入“未分组”。确定删除该分组吗？"
        : "确定删除空分组“" + group.name + "”吗？";
      if (!window.confirm(translateUiString(text))) return;
      for (const item of state.pages) {
        if (projectGroupId(item) === group.id) item.groupId = UNGROUPED_GROUP_ID;
      }
      state.groups = state.groups.filter(item => item.id !== group.id);
      markDirty();
      persistPages();
      renderPageTabs();
      toast("已删除分组");
    };
    head.appendChild(delBtn);
  }

  head.addEventListener("dragstart", ev => {
    if (isUngrouped) {
      ev.preventDefault();
      return;
    }
    ev.dataTransfer.setData("text/canvasflow-group", group.id);
    ev.dataTransfer.effectAllowed = "move";
  });
  head.addEventListener("dragend", () => {
    document.querySelectorAll(".drop-above, .drop-below").forEach(el => el.classList.remove("drop-above", "drop-below"));
  });
  head.addEventListener("dragover", ev => {
    const types = Array.from(ev.dataTransfer.types);
    if (types.includes("text/canvasflow-group") && !isUngrouped) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      const rect = head.getBoundingClientRect();
      const before = ev.clientY < rect.top + rect.height / 2;
      head.classList.toggle("drop-above", before);
      head.classList.toggle("drop-below", !before);
    } else if (types.includes("text/canvasflow-page")) {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
    }
  });
  head.addEventListener("dragleave", () => head.classList.remove("drop-above", "drop-below"));
  head.addEventListener("drop", ev => {
    head.classList.remove("drop-above", "drop-below");
    const types = Array.from(ev.dataTransfer.types);
    if (types.includes("text/canvasflow-page")) {
      ev.preventDefault();
      const pageId = ev.dataTransfer.getData("text/canvasflow-page");
      if (pageId) moveProjectPage(pageId, group.id, null);
      return;
    }
    if (isUngrouped) return;
    ev.preventDefault();
    ev.stopPropagation();
    const groupId = ev.dataTransfer.getData("text/canvasflow-group");
    if (!groupId || groupId === group.id) return;
    const from = state.groups.findIndex(item => item.id === groupId);
    if (from === -1) return;
    const rect = head.getBoundingClientRect();
    const before = ev.clientY < rect.top + rect.height / 2;
    const moved = state.groups.splice(from, 1)[0];
    let to = state.groups.findIndex(item => item.id === group.id);
    if (to === -1) to = state.groups.length;
    state.groups.splice(before ? to : to + 1, 0, moved);
    markDirty();
    persistPages();
    renderPageTabs();
  });

  section.appendChild(head);

  const list = document.createElement("div");
  list.className = "project-panel-list";
  list.addEventListener("dragover", ev => {
    if (!Array.from(ev.dataTransfer.types).includes("text/canvasflow-page")) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    section.classList.add("drop-target");
  });
  list.addEventListener("dragleave", () => section.classList.remove("drop-target"));
  list.addEventListener("drop", ev => {
    section.classList.remove("drop-target");
    const pageId = ev.dataTransfer.getData("text/canvasflow-page");
    if (!Array.from(ev.dataTransfer.types).includes("text/canvasflow-page") || !pageId) return;
    ev.preventDefault();
    ev.stopPropagation();
    moveProjectPage(pageId, group.id, null);
  });
  const groupPages = projectPanelVisiblePages(group.id);
  for (const item of groupPages) list.appendChild(projectPanelPageRow(item));
  const empty = document.createElement("div");
  empty.className = "project-panel-empty";
  empty.textContent = groupPages.length ? "" : "暂无项目，点“＋”新建";
  list.appendChild(empty);
  section.appendChild(list);
  return section;
}

// 重命名输入框的统一事件绑定：中文输入法组合期间（选字、确认候选）的 Enter/Escape
// 不代表完成重命名，必须忽略，否则第一个字还没上屏输入框就被重渲染替换掉。
function attachProjectRenameInputEvents(input, finish) {
  let composing = false;
  let done = false;
  const finishAndClear = save => {
    if (done) return;
    done = true;
    projectPanelEditingName = false;
    finish(save);
  };
  projectPanelEditingName = true;
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; });
  input.addEventListener("keydown", ev => {
    if (composing || ev.isComposing || ev.keyCode === 229) return;
    if (ev.key === "Enter") finishAndClear(true);
    if (ev.key === "Escape") finishAndClear(false);
  });
  input.addEventListener("blur", () => finishAndClear(true), { once: true });
}

function beginProjectPanelRename(page, button) {
  const input = document.createElement("input");
  input.className = "project-menu-name-input";
  input.value = page.name;
  button.replaceWith(input);
  input.focus();
  input.select();
  let finished = false;
  const finish = save => {
    if (finished) return;
    finished = true;
    const name = input.value.trim();
    if (save && name) {
      page.name = name;
      markDirty();
      persistPages();
    }
    renderPageTabs();
  };
  attachProjectRenameInputEvents(input, finish);
}

function beginProjectPanelGroupRename(group, nameEl) {
  const input = document.createElement("input");
  input.className = "project-menu-name-input";
  input.value = group.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  let finished = false;
  const finish = save => {
    if (finished) return;
    finished = true;
    const name = input.value.trim();
    const target = state.groups.find(item => item.id === group.id);
    if (save && name && target) {
      target.name = name;
      markDirty();
      persistPages();
    }
    renderPageTabs();
  };
  attachProjectRenameInputEvents(input, finish);
}

let pendingNodeRenderAfterTextEdit = false;
let pendingNodeRenderAfterSelect = false;

function activeNodeTextEditor() {
  const active = document.activeElement;
  // 文字节点与对话节点正文都是常驻 textarea:输入期间推迟全量渲染,避免重建打断输入/IME
  return active?.matches?.('.node textarea[data-role="text"], .node textarea[data-role="chat-text"], .node textarea[data-role="sd-prompt"], .node textarea[data-role="sd-negative"], .node textarea[data-role="annotation-content"]') && els.nodes.contains(active) ? active : null;
}

function activeNodeSelect() {
  const active = document.activeElement;
  return active?.matches?.(".node select") && els.nodes.contains(active) ? active : null;
}

function releaseNodeSelectLock(select) {
  select?.closest?.(".node")?.classList.remove("select-menu-open");
  window.queueMicrotask(() => {
    if (activeNodeSelect() || !pendingNodeRenderAfterSelect) return;
    pendingNodeRenderAfterSelect = false;
    renderNodes({ force: true });
    renderEdges();
    renderMinimap();
  });
}

function renderNodes(options = {}) {
  if (!options.force && activeNodeTextEditor()) {
    pendingNodeRenderAfterTextEdit = true;
    return;
  }
  if (!options.force && activeNodeSelect()) {
    pendingNodeRenderAfterSelect = true;
    return;
  }
  pendingNodeRenderAfterTextEdit = false;
  pendingNodeRenderAfterSelect = false;
  els.nodes.innerHTML = "";
  // 外框先入 DOM，节点后入，保证节点始终盖在外框之上
  const canvasGroups = new Map();
  for (const node of state.nodes) {
    if (!node.canvasGroupId) continue;
    if (!canvasGroups.has(node.canvasGroupId)) canvasGroups.set(node.canvasGroupId, []);
    canvasGroups.get(node.canvasGroupId).push(node);
  }
  for (const [groupId, members] of canvasGroups) {
    if (members.length < 2) continue;
    const bounds = canvasGroupBounds(members);
    const frame = document.createElement("div");
    const selectedClass = members.every(node => state.selected.has(node.id)) ? " is-selected" : "";
    const blockedClass = drag?.blockedGroups?.has(groupId) ? " is-blocked" : "";
    frame.className = `node-group-frame${selectedClass}${blockedClass}`;
    frame.dataset.groupId = groupId;
    frame.style.left = `${bounds.x}px`;
    frame.style.top = `${bounds.y}px`;
    frame.style.width = `${bounds.w}px`;
    frame.style.height = `${bounds.h}px`;
    const groupRun = canvasGroupRuns.get(groupId);
    frame.innerHTML = `<span>编组 · ${members.length} 个节点${groupRun ? " · 运行中" : ""}</span><button type="button" class="node-group-run" data-group-action="${groupRun ? "stop" : "run"}" aria-label="${groupRun ? "停止编组运行" : "运行整个编组"}">${groupRun ? "停止" : "运行"}</button>`;
    els.nodes.appendChild(frame);
  }
  for (const node of state.nodes) {
    const div = document.createElement("div");
    const progressClass = (node.type === "ai-image" || node.type === "angle-image") && node._aiProgress ? `ai-status-${node._aiProgress.status}` : "";
    const variableInvalid = node.type === "variable" && (normalizeVariableNode(node), node.variableRows.some(row => resolvedVariableRow(row).invalid));
    div.className = `node ${node.type} ${progressClass} ${variableInvalid ? "variable-invalid" : ""} ${node.disabled ? "disabled" : ""} ${state.selected.has(node.id) ? "selected" : ""} ${compositeHoverReady && compositeHoverTargetId === node.id ? "composite-drop-ready" : ""} ${nodeReleaseTargetId === node.id ? (nodeReleaseBridged ? "edge-release-armed edge-release-bridge" : "edge-release-armed") : ""}`;
    div.dataset.id = node.id;
    div.draggable = false;
    div.style.left = `${node.x}px`;
    div.style.top = `${node.y}px`;
    div.style.width = `${node.w}px`;
    div.style.height = `${node.h}px`;
    if (Number(node._portAnchorY) > 0) div.style.setProperty("--port-anchor-y", `${node._portAnchorY}px`);
    div.innerHTML = nodeTemplate(node);
    if (state.settings.hideNodeTitles && div.querySelector(".node-hover-controls")) {
      const syncHoverEdges = () => window.requestAnimationFrame(renderEdges);
      div.addEventListener("mouseenter", syncHoverEdges);
      div.addEventListener("mouseleave", syncHoverEdges);
    }
    els.nodes.appendChild(div);
  }
  syncContentDrivenNodeHeights();
  syncTextNodeScrollEdges();
  els.nodes.querySelectorAll(".node.chat .chat-messages").forEach(list => { list.scrollTop = list.scrollHeight; });
  if (expandedChatNodeId) renderChatWorkspace();
  if (state.annotationEditorNodeId) {
    if (!findNode(state.annotationEditorNodeId)) state.annotationEditorNodeId = ""; // 编辑对象已删除则自动退出
    else positionAnnotationSurface();
  }
}

let autoSizePersistTimer = 0;
function syncContentDrivenNodeHeights() {
  let changed = false;
  els.nodes.querySelectorAll(".node").forEach(nodeElement => {
    const node = findNode(nodeElement.dataset.id);
    // 文字节点与对话节点高度固定:对话节点历史区内部滚动,不随内容撑高
    if (!node || node.type === "text" || node.type === "chat" || node.type === "palette") return;
    const head = nodeElement.querySelector(":scope > .node-head");
    const body = nodeElement.querySelector(":scope > .node-body");
    if (!body) return;
    const usesStableAnchor = state.settings.hideNodeTitles && !!nodeElement.querySelector(".node-hover-controls");
    const bodyStyle = getComputedStyle(body);
    const bodyPadding = (parseFloat(bodyStyle.paddingTop) || 0) + (parseFloat(bodyStyle.paddingBottom) || 0);
    const preview = body.firstElementChild;
    const collapsedBodyHeight = preview ? preview.offsetHeight + bodyPadding : body.scrollHeight;
    const desiredHeight = Math.max(88, Math.ceil((head?.offsetHeight || 0) + (usesStableAnchor ? collapsedBodyHeight : body.scrollHeight) + 2));
    const desiredAnchor = usesStableAnchor ? desiredHeight / 2 : 0;
    if (Math.abs((Number(node._portAnchorY) || 0) - desiredAnchor) >= 1) {
      node._portAnchorY = desiredAnchor || undefined;
      if (desiredAnchor) nodeElement.style.setProperty("--port-anchor-y", `${desiredAnchor}px`);
      else nodeElement.style.removeProperty("--port-anchor-y");
      changed = true;
    }
    if (Math.abs((Number(node.h) || 0) - desiredHeight) < 2) return;
    node.h = desiredHeight;
    nodeElement.style.height = `${desiredHeight}px`;
    changed = true;
  });
  if (!changed) return;
  window.clearTimeout(autoSizePersistTimer);
  autoSizePersistTimer = window.setTimeout(() => {
    saveCurrentPage();
    persistPages();
  }, 120);
}

function syncSelectedNodeClasses() {
  els.nodes.querySelectorAll(".node").forEach(nodeEl => {
    nodeEl.classList.toggle("selected", state.selected.has(nodeEl.dataset.id));
  });
  els.nodes.querySelectorAll(".node-group-frame").forEach(frame => {
    const members = canvasGroupMembers(frame.dataset.groupId);
    frame.classList.toggle("is-selected", members.length > 0 && members.every(node => state.selected.has(node.id)));
  });
}

// 在正文中原位显示变量选择；点击普通文字切回原文编辑，失焦恢复正文控件。
// select 宽度按选中项真实文字宽度计算（canvas 以 select 同款字体测量，预留 40px 内边距+余量），避免中文选值被省略号截断。
let variableChoiceMeasureCtx = null;
function variableChoiceSelectWidth(label) {
  const text = String(label || "选值");
  if (!variableChoiceMeasureCtx) variableChoiceMeasureCtx = document.createElement("canvas").getContext("2d");
  variableChoiceMeasureCtx.font = `12px "HarmonyOS Sans SC", "HarmonyOS Sans", "鸿蒙黑体", "PingFang SC", "Microsoft YaHei", sans-serif`;
  return Math.max(64, Math.ceil((variableChoiceMeasureCtx.measureText(text).width + 44) / 4) * 4);
}

function textVariableStripHtml(node) {
  const matches = detectTextNodeVariables(node?.text);
  if (!matches.length) return "";
  const choices = node?.variableChoices || {};
  const chips = new Map(matches.map(match => {
    const choice = choices[match.name] || null;
    const enabled = choice ? choice.enabled !== false : true;
    const hasValidChoice = !!(choice?.optionId && match.definition.options.some(option => option.id === choice.optionId));
    const missingOption = choice?.optionId && !hasValidChoice ? `<option value="${escapeHtml(choice.optionId)}" selected>已失效：${escapeHtml(choice.label || "未知值")}</option>` : "";
    const options = match.definition.options.map(option => `<option value="${escapeHtml(option.id)}" ${choice?.optionId === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
    const toggleTitle = `${enabled ? "停用" : "启用"}变量${match.name}`;
    const displayLabel = hasValidChoice ? (choice.label || match.definition.options.find(option => option.id === choice.optionId)?.label || "选值") : (choice?.optionId ? `已失效：${choice.label || "未知值"}` : "选值");
    const width = variableChoiceSelectWidth(displayLabel);
    return [match.name, `<span class="text-variable-chip ${enabled ? "" : "is-off"}"><span class="variable-select-wrap"><select data-role="text-variable-choice" title="${escapeHtml(displayLabel)}" data-var-name="${escapeHtml(match.name)}" style="width:${width}px" aria-label="选择${escapeHtml(match.name)}的值"${enabled ? "" : " disabled"}><option value="" ${hasValidChoice ? "" : "selected"}>${hasValidChoice ? "清除选择" : "选值"}</option>${missingOption}${options}</select><span class="variable-select-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span></span><button type="button" class="text-variable-toggle" data-role="text-variable-toggle" data-var-name="${escapeHtml(match.name)}" role="switch" aria-checked="${enabled}" aria-label="${toggleTitle}" title="${toggleTitle}">${escapeHtml(match.name)}</button></span>`];

  }));
  const text = String(node.text || "");
  const ordered = [...matches].sort((a, b) => a.index - b.index);
  let html = "";
  let cursor = 0;
  for (const match of ordered) {
    html += escapeHtml(text.slice(cursor, match.index)) + chips.get(match.name);
    cursor = match.index + match.length;
  }
  html += escapeHtml(text.slice(cursor));
  return `<div class="text-inline-preview" data-role="text-inline-edit" tabindex="0" aria-label="文字内容，点击编辑">${html}</div>`;
}

function chatAttachmentBar(node, entry, busy) {
  const attachments = node.chatAttachments || [];
  const atLimit = attachments.length >= CHAT_MAX_REFERENCE_IMAGES;
  const unsupported = attachments.length > 0 && entry && !entry.multimodal;
  const addTitle = atLimit ? `最多添加 ${CHAT_MAX_REFERENCE_IMAGES} 张图片` : "添加图片附件";
  const thumbnails = attachments.map(item => {
    const name = escapeHtml(item.fileName || "对话附件");
    const preview = item.image
      ? `<img src="${escapeHtml(item.image)}" alt="" draggable="false">`
      : `<span class="chat-attachment-placeholder" aria-hidden="true">图</span>`;
    return `<span class="chat-attachment-item" title="${name}">${preview}<button type="button" data-role="chat-attachment-remove" data-attachment-id="${escapeHtml(item.id)}" title="移除 ${name}" aria-label="移除附件 ${name}" ${busy ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></span>`;
  }).join("");
  const status = unsupported
    ? `<span class="chat-attachment-status is-warning" title="当前模型不支持图片">不支持图片</span>`
    : attachments.length
      ? `<span class="chat-attachment-status">${attachments.length}/${CHAT_MAX_REFERENCE_IMAGES}</span>`
      : `<span class="chat-attachment-status">发送后保留</span>`;
  return `<div class="chat-attachment-bar ${unsupported ? "is-unsupported" : ""}">`
    + `<button class="chat-attachment-add" data-role="chat-attachment-add" type="button" title="${addTitle}" aria-label="${addTitle}" ${(busy || atLimit) ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.5 12 20a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.9-2.8l8.5-8.5"/></svg><span>附件</span></button>`
    + `<div class="chat-attachment-list" aria-label="已添加的图片附件">${thumbnails}</div>`
    + status
    + (attachments.length ? `<button class="chat-attachment-clear" data-role="chat-attachment-clear" type="button" title="清空图片附件" aria-label="清空图片附件" ${busy ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` : "")
    + `</div>`;
}

// 对话节点正文 = 顶部模型条 + 整块可输入文本框 + 底部图片附件栏。
// 「批量」是发送前勾选的开关:勾选后本轮请求自动追加 a. b. 序号输出指令；拆分由消息按钮触发。
function chatMessageActions(message, index, lastAssistantIndex, busy, previousHasImages) {
  const copy = `<button type="button" data-role="chat-message-copy" data-message-index="${index}" aria-label="复制消息">复制</button>`;
  if (message.role !== "assistant") return copy;
  const split = parseNumberedChatItems(message.content)
    ? `<button type="button" data-role="chat-message-split" data-message-index="${index}" aria-label="拆成文字节点">拆成文字节点</button>`
    : "";
  const retry = index === lastAssistantIndex
    ? `<button type="button" data-role="chat-message-retry" data-message-index="${index}" aria-label="重新生成" title="${previousHasImages ? "含图片的旧消息暂不支持重新生成" : "重新生成"}" ${busy || previousHasImages ? "disabled" : ""}>重新生成</button>`
    : "";
  return copy + split + retry;
}

function extractHtmlDocument(text) {
  const source = String(text || "");
  const fenced = [...source.matchAll(/```(?:html)?\s*([\s\S]*?)```/gi)]
    .map(match => match[1].trim())
    .find(block => /<(?:!doctype\s+html|html)\b/i.test(block));
  const candidate = fenced || source.slice(Math.max(0, source.search(/<(?:!doctype\s+html|html)\b/i))).trim();
  if (!candidate || !/<html\b[^>]*>/i.test(candidate) || !/<\/html\s*>/i.test(candidate)) return "";
  return candidate.slice(0, candidate.search(/<\/html\s*>/i) + candidate.match(/<\/html\s*>/i)[0].length);
}

function chatHtmlPreviewCard(message, index) {
  if (message.role !== "assistant" || !extractHtmlDocument(message.content)) return "";
  return `<section class="chat-html-card" aria-label="HTML 网页操作">`
    + `<div class="chat-html-card-head"><div><strong>HTML 网页</strong><span>完整文档已生成</span></div><span class="chat-html-card-actions"><button type="button" data-role="chat-html-open" data-message-index="${index}">预览</button><button type="button" data-role="chat-html-code" data-message-index="${index}">代码</button><button type="button" data-role="chat-html-save" data-message-index="${index}">保存</button><button type="button" data-role="chat-html-edit" data-message-index="${index}">编辑</button></span></div>`
    + `</section>`;
}

function chatMessageContentHtml(message) {
  const html = message.role === "assistant" ? extractHtmlDocument(message.content) : "";
  if (!html) return `<div class="chat-message-content">${escapeHtml(message.content || "")}</div>`;
  const source = String(message.content || "");
  const narrative = source.replace(/```(?:html)?\s*([\s\S]*?)```/gi, (whole, block) => extractHtmlDocument(block) ? "" : whole)
    .replace(html, "")
    .trim();
  return narrative ? `<div class="chat-message-content">${escapeHtml(narrative)}</div>` : "";
}

function chatMessagesHtml(node, busy) {
  const messages = node.chatMessages || [];
  if (!messages.length) return `<div class="chat-empty-state"><span class="chat-empty-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3ZM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></svg></span><strong>开始一段新对话</strong><span>输入消息与 AI 对话，历史随画布保存。</span></div>`;
  const lastAssistantIndex = messages.findLastIndex(message => message.role === "assistant");
  return messages.map((message, index) => {
    const role = message.role === "assistant" ? "assistant" : "user";
    const label = role === "assistant" ? "AI" : "你";
    const imageNote = role === "user" && Number(message.imageCount) > 0 ? `<span class="chat-message-images">${Number(message.imageCount)} 张图片</span>` : "";
    const avatar = role === "assistant"
      ? `<span class="chat-message-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z"/></svg></span>`
      : `<span class="chat-message-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg></span>`;
    return `<article class="chat-message is-${role}" data-message-index="${index}">`
      + `<div class="chat-message-head">${avatar}<strong>${label}</strong>${imageNote}<div class="chat-message-actions">${chatMessageActions(message, index, lastAssistantIndex, busy, Number(messages[index - 1]?.imageCount) > 0)}</div></div>`
      + chatMessageContentHtml(message)
      + chatHtmlPreviewCard(message, index)
      + `</article>`;
  }).join("");
}

function chatSessionTabsHtml(node) {
  const open = (node.chatSessions || []).filter(session => !session.closed);
  const tabs = open.map(session => `<div class="chat-session-tab${session.id === node.activeChatSessionId ? " is-active" : ""}" draggable="true" data-chat-session-id="${escapeHtml(session.id)}"><button type="button" data-role="chat-session-open" data-session-id="${escapeHtml(session.id)}" title="${escapeHtml(session.title)}">${escapeHtml(session.title)}</button><button type="button" data-role="chat-session-close" data-session-id="${escapeHtml(session.id)}" aria-label="关闭对话 ${escapeHtml(session.title)}">×</button></div>`).join("");
  return `<div class="chat-session-strip"><button class="chat-session-history-toggle" type="button" data-role="chat-session-history" aria-label="打开聊天历史" title="聊天历史">历史</button><div class="chat-session-tabs" role="tablist" aria-label="对话标签">${tabs}</div><button class="chat-session-add" type="button" data-role="chat-session-add" aria-label="新建对话" title="新建对话">+</button></div>`;
}

function chatSessionHistoryHtml(node) {
  if (!node._chatHistoryOpen) return "";
  const query = String(node._chatHistoryQuery || "").trim().toLowerCase();
  const sessions = [...(node.chatSessions || [])].sort((a, b) => b.updatedAt - a.updatedAt).filter(session => !query || session.title.toLowerCase().includes(query));
  const items = sessions.map(session => {
    const model = chatModelEntry(session.model)?.label || session.model || "未选择模型";
    const time = new Date(session.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    return `<div class="chat-history-item${session.id === node.activeChatSessionId ? " is-active" : ""}" data-session-id="${escapeHtml(session.id)}"><button type="button" data-role="chat-session-open" data-session-id="${escapeHtml(session.id)}"><strong>${escapeHtml(session.title)}</strong><span>${escapeHtml(model)} · ${escapeHtml(time)}</span></button><div><button type="button" data-role="chat-session-rename" data-session-id="${escapeHtml(session.id)}">改名</button><button type="button" data-role="chat-session-delete" data-session-id="${escapeHtml(session.id)}">删除</button></div></div>`;
  }).join("") || `<div class="chat-history-empty">没有匹配的对话</div>`;
  return `<aside class="chat-history-panel" aria-label="聊天历史"><label><span>搜索历史</span><input type="search" data-role="chat-history-search" value="${escapeHtml(node._chatHistoryQuery || "")}" placeholder="搜索对话名称"></label><div class="chat-history-list">${items}</div></aside>`;
}

function chatNodeBody(node, expanded = false) {
  normalizeChatNode(node);
  const busy = node._chatBusy === true;
  const entry = chatModelEntry(node._chatModel);
  if (!expanded) {
    const messageCount = (node.chatMessages || []).length;
    const hasHtml = (node.chatMessages || []).some(message => message.role === "assistant" && extractHtmlDocument(message.content));
    const summary = busy ? "正在生成…" : node._chatError ? "生成失败，点击查看" : hasHtml ? "含网页回复，可预览编辑" : "";
    return `<button class="chat-compact-card${busy ? " is-busy" : ""}${node._chatError ? " has-error" : ""}" data-role="chat-expand" type="button" aria-label="打开 AI 对话侧边栏">`
      + `<span class="chat-compact-card-head"><span class="chat-compact-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3ZM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></svg></span><span><strong>AI 对话</strong><small>${escapeHtml(entry?.label || "选择模型")}</small></span><span class="chat-compact-status-dot" aria-hidden="true"></span></span>`
      + `<span class="chat-compact-summary"><strong>${messageCount ? `${messageCount} 条消息` : "尚未开始"}</strong>${summary ? `<small>${escapeHtml(summary)}</small>` : ""}</span>`
      + `<span class="chat-compact-card-foot"><span>打开侧边栏</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>`
      + `</button><span class="resize-handle" title="拖拽缩放"></span>`;
  }
  const models = chatCatalogModels().map(model => `<option value="${escapeHtml(model.id)}" ${node._chatModel === model.id ? "selected" : ""}>${escapeHtml(model.label)}</option>`).join("") || '<option value="">请先填写 API Key</option>';
  const expandTool = `<button class="chat-tool-btn" data-role="chat-expand" type="button" title="编辑对话" aria-label="展开编辑对话"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg></button>`;
  const historyTool = busy
    ? `<button class="chat-tool-btn is-busy" data-role="chat-stop" type="button" title="停止生成" aria-label="停止生成"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg></button>`
    : `<label class="chat-enumerate-toggle" title="批量提示词：要求 AI 按 a. b. 序号输出；收到回复后可手动拆成文字节点"><input type="checkbox" data-role="chat-enumerate-toggle" ${node._chatEnumerated ? "checked" : ""} ${busy ? "disabled" : ""}><span>批量</span></label>`
      + `<button class="chat-tool-btn" data-role="chat-clear" type="button" title="清空对话（保留输入框草稿）" aria-label="清空对话" ${(node.chatMessages || []).length ? "" : "hidden"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
  return chatSessionTabsHtml(node)
    + chatSessionHistoryHtml(node)
    + `<div class="chat-node-bar"><select data-role="chat-model" aria-label="对话模型" ${busy ? "disabled" : ""}>${models}</select>${expandTool}${historyTool}</div>`
    + (node._chatError ? `<div class="chat-node-error">${escapeHtml(node._chatError)}</div>` : "")
    + `<div class="chat-messages" role="log" aria-label="对话记录">${chatMessagesHtml(node, busy)}</div>`
    + `<div class="chat-composer"><textarea data-role="chat-text" placeholder="输入新消息，Enter 发送；Shift+Enter 换行" ${busy ? "disabled" : ""}>${escapeHtml(node.chatDraft || "")}</textarea>`
    + chatAttachmentBar(node, entry, busy)
    + `<button class="chat-composer-send" data-role="chat-send" type="button" title="发送" aria-label="发送消息" ${busy ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button></div>`
    + `<span class="resize-handle" title="拖拽缩放"></span>`;
}

// 浏览器生图节点正文:站点下拉(+自定义网址)/提示词/生成按钮/结果预览
function browserNodeBody(node) {
  normalizeBrowserNode(node);
  const isCustom = node._browserSite === "custom";
  const sites = BROWSER_SITES.map(site => `<option value="${escapeHtml(site.id)}" ${node._browserSite === site.id ? "selected" : ""}>${escapeHtml(site.label)}</option>`).join("")
    + `<option value="custom" ${isCustom ? "selected" : ""}>自定义站点…</option>`;
  const status = node.generating
    ? `<div class="browser-node-status is-busy">${escapeHtml(node._browserStatus || "执行中…")}<button class="browser-node-cancel" data-role="browser-cancel" type="button" title="取消等待" aria-label="取消等待">取消</button></div>`
    : node._browserError
      ? `<div class="browser-node-status is-error">${escapeHtml(node._browserError)}</div>`
      : "";
  const preview = node.generatedImage
    ? `<div class="image-preview" title="双击放大预览"><img src="${node.generatedImage}" alt="" draggable="false"></div>`
    : `<div class="browser-node-empty">未生成——连接上游文字/图片，或直接在上方输入提示词</div>`;
  return `<div class="ai-node-settings"><label class="ai-model-field">站点<select data-role="browser-site" ${node.generating ? "disabled" : ""}>${sites}</select></label><label class="${isCustom ? "" : "hidden"}">站点网址<input type="text" data-role="browser-origin" placeholder="https://站点域名" value="${escapeHtml(node._browserOrigin)}" ${node.generating ? "disabled" : ""}></label></div>`
    + `<textarea data-role="browser-prompt" rows="2" placeholder="提示词" ${node.generating ? "disabled" : ""}>${escapeHtml(node.prompt || "")}</textarea>`
    + `<label class="browser-new-conversation"><input type="checkbox" data-role="browser-new-conversation" ${node._browserNewConversation ? "checked" : ""} ${node.generating ? "disabled" : ""}>每次创建新对话</label>`
    + status
    + `<div class="image-actions browser-node-actions">${node.generating ? "" : `<button type="button" data-role="browser-generate" class="ai-generate-btn">生成</button>${node.generatedImage ? `<button type="button" data-role="browser-clear">清除结果</button>` : ""}`}</div>`
    + preview;
}

// 文字节点正文底部的提示词操作行：未优化过 → 打开优化对话框；已应用过优化 → 一键还原原文。
function textPromptActionsHtml(node) {
  const restoring = typeof node._promptOriginalText === "string";
  const busy = promptOptimizationPending.has(node.id);
  const label = restoring ? "还原优化前的提示词" : "优化提示词";
  return `<div class="text-prompt-actions"><button type="button" class="prompt-optimize-btn${restoring ? " is-restore" : ""}${busy ? " is-busy" : ""}" data-role="prompt-optimize" title="${label}" aria-label="${label}" ${busy ? "disabled" : ""}>${restoring ? "还原" : "优化"}</button></div>`;
}

function nodeTemplate(node) {
  const num = node.type === "output" ? outputNumber(node.id) : 0;
  const title = node.type === "palette" ? "调色盘" : node.type === "text" ? "文字节点" : node.type === "variable" ? "变量节点" : node.type === "chat" ? "AI对话" : node.type === "browser-image" ? "浏览器生图" : node.type === "local-sd" ? "本地 SD" : node.type === "image" ? "图片节点" : node.type === "folder" ? (node.folderName || "图片文件夹") : node.type === "ai-image" ? (node.seq ? `AI绘图 #${node.seq}` : "AI绘图") : node.type === "ai-video" ? (node.seq ? `AI视频 #${node.seq}` : "AI视频") : node.type === "angle-image" ? "角度变化" : node.type === "screenshot-input" ? `截图功能节点 #${node.screenshotSeq || 1}` : node.type === "tool-node" ? (node.toolName || "拓展节点") : node.type === "group" ? "多任务节点" : `输出节点 ${num}`;
  const inPort = `<span class="port in" data-port="in" title="输入端口"></span>`;
  const outPort = !edgeInsertableNode(node) ? "" : `<span class="port out" data-port="out" title="输出端口"></span>`;
  let body = "";
  if (node.type === "text") {
    body = `${textVariableStripHtml(node)}<textarea data-role="text" placeholder="请输入文字内容">${escapeHtml(node.text || "")}</textarea>${textPromptActionsHtml(node)}<span class="resize-handle" title="拖拽缩放"></span>`;
  } else if (node.type === "variable") {
    normalizeVariableNode(node);
    if (!globalLibrary.variableDefinitions.length && !node.variableRows.some(row => row.variableNameSnapshot)) {
      body = `<div class="variable-node-empty">请先在设置 → 变量库中创建变量</div><button data-role="variable-add-row" class="variable-add-row" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>添加一行</span></button>`;
    } else {
      const rows = node.variableRows.map(row => {
        const resolved = resolvedVariableRow(row);
        const definitionOptions = globalLibrary.variableDefinitions.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === row.definitionId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
        const missingDefinition = row.definitionId && !resolved.definition ? `<option value="${escapeHtml(row.definitionId)}" selected>已失效：${escapeHtml(row.variableNameSnapshot || "未知变量")}</option>` : "";
        const options = resolved.definition?.options.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === row.optionId ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("") || "";
        const missingOption = row.optionId && !resolved.option ? `<option value="${escapeHtml(row.optionId)}" selected>已失效：${escapeHtml(row.valueLabelSnapshot || "未知值")}</option>` : "";
        return `<div class="variable-node-row ${resolved.invalid ? "is-invalid" : ""}" data-row-id="${escapeHtml(row.id)}"><span class="variable-select-wrap"><select data-role="variable-definition" aria-label="变量"><option value="" hidden></option>${missingDefinition}${definitionOptions}</select><span class="variable-select-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span></span><span class="variable-select-wrap"><select data-role="variable-option" aria-label="变量值" ${resolved.definition ? "" : "disabled"}><option value="" hidden></option>${missingOption}${options}</select><span class="variable-select-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span></span><button class="variable-row-remove" data-role="variable-remove-row" type="button" title="删除该行" aria-label="删除该行"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;
      }).join("");
      const output = variableNodeOutput(node);
      body = `<div class="variable-node-rows">${rows}</div><div class="variable-node-add-wrap"><button data-role="variable-add-row" class="variable-add-row" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>添加一行</span></button></div><div class="variable-node-output">${escapeHtml(output || "暂无组合数据")}</div>`;
    }

    const total = node.images?.length || 0;
    let thumbs = "";
    for (let i = 0; i < Math.min(total, 8); i++) thumbs += `<img src="${node.images[i].image}" alt="" draggable="false">`;
    if (total > 8) thumbs += `<div class="group-more">+${total - 8}</div>`;
    body = `<div class="group-preview" title="双击浏览文件夹图片">${thumbs || "暂无图片"}</div>
      <div class="group-count">${total} 张图片</div>
      <div class="image-actions"><button data-role="upload-group">添加图片</button><button data-role="clear-group">清空</button></div>`;
  } else if (node.type === "group") {
    if (node.items) {
      const textCount = node.items.filter(it => it.type === "text").length;
      const imgCount = node.items.filter(it => it.type === "image").length;
      const aiCount = node.items.filter(it => it.type === "ai-image").length;
      const parts = [];
      if (textCount) parts.push(`${textCount}文字`);
      if (imgCount) parts.push(`${imgCount}图片`);
      if (aiCount) parts.push(`${aiCount}AI绘图`);
      const summary = parts.join(" + ") || "空多任务";
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
  } else if (node.type === "local-sd") {
    body = window.LocalSD?.nodeBody(node) || `<div class="local-sd-empty">本地 SD 模块正在载入…</div>`;
  } else if (node.type === "image") {
    const seqTag = node.seq ? `<span class="image-seq">#${node.seq}</span>` : "";
    const annotating = state.annotationEditorNodeId === node.id;
    // 编辑态隐藏上传/清除：编辑中替换图片会使批注的归一化坐标系失效；退出编辑即恢复
    body = `<div class="image-preview"${annotating ? ' data-annotating="1"' : ""} title="双击放大预览"${imageAspectStyle(node)}>${node.image ? `<img src="${node.image}" alt="" draggable="false">` : "无图片"}${seqTag}${annotating ? imageAnnotationEditorMarkup(node) : ""}</div>
      ${annotating ? imageAnnotationToolbarMarkup() : ""}
      ${annotating ? "" : `<div class="node-hover-controls">
        <div class="image-actions">
          <button data-role="upload">上传</button>
          ${(node.image || node.imageAssetId) ? `<button data-role="reverse-image-keywords" ${imageKeywordReversePending.has(node.id) ? "disabled" : ""}>${imageKeywordReversePending.has(node.id) ? "反推中…" : "关键词反推"}</button>` : ""}
          <button data-role="clear-image">清除</button>
        </div>
      </div>`}`;
  } else if (node.type === "ai-image") {
    body = aiImageBody(node) + aiNodeProgressMarkup(node);
  } else if (node.type === "ai-video") {
    body = videoNodeBody(node);
  } else if (node.type === "palette") {
    body = paletteMarkup(node);
  } else if (node.type === "tool-node") {
    body = toolNodeBody(node);
  } else if (node.type === "chat") {
    body = chatNodeBody(node);
  } else if (node.type === "browser-image") {
    body = browserNodeBody(node);
  } else if (node.type === "angle-image") {
    body = angleImageBody(node);
  } else if (node.type === "screenshot-input") {
    normalizeAiNodeSettings(node);
    node._count = Math.max(1, Math.min(4, Number(node._count) || 1));
    const entry = modelCatalogEntry(node._model) || catalogModels()[0];
    const models = catalogModels().map(model => `<option value="${model.id}" ${node._model === model.id ? "selected" : ""}>${model.label}</option>`).join("");
    const resolutions = entry.resolutions.map(v => `<option value="${v}" ${node._resolution === v ? "selected" : ""}>${v.toUpperCase()}</option>`).join("");
    const qualities = entry.qualities.filter(v => v !== "auto").map(v => `<option value="${v}" ${node._quality === v ? "selected" : ""}>${v}</option>`).join("");
    const sizes = ["1:1", "auto", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"].filter(v => entry.sizes.includes(v)).map(v => `<option value="${v}" ${node._size === v ? "selected" : ""}>${v}</option>`).join("");
    body = `<div class="screenshot-node-summary">${escapeHtml(screenshotNodeSummary(node))}</div><div class="node-hover-controls"><div class="ai-node-settings"><label>模型<select data-role="screenshot-model">${models}</select></label><label>分辨率<select data-role="screenshot-resolution">${resolutions}</select></label><label class="${entry.quality ? "" : "hidden"}">画质<select data-role="screenshot-quality">${qualities}</select></label><label>比例<select data-role="screenshot-size">${sizes}</select></label><label>生成数量<select data-role="screenshot-count">${[1,2,3,4].map(v => `<option value="${v}" ${node._count === v ? "selected" : ""}>${v}</option>`).join("")}</select></label></div></div>`;
  } else {
    body = `<div class="output-label">图片${num}</div>`;
  }
  if ((node.type === "text" || node.type === "image") && /^https?:\/\//i.test(String(node.sourceUrl || ""))) {
    body += `<button type="button" class="node-source-link" data-role="open-source-page" title="返回发送此内容的网页" aria-label="返回原网页"><span>返回原网页</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></button>`;
  }
  const head = node.type === "variable"
    ? `<div class="node-head variable-node-head"><span class="variable-node-title">变量节点</span></div>`
    : `<div class="node-head"><span>${title}</span>${node._assetIssue ? `<span class="node-asset-flag" title="${escapeHtml(node._assetIssue)}">!</span>` : ""}</div>`;
  return `${inPort}${outPort}${head}<div class="node-body">${body}</div>${node.type === "palette" ? '<span class="resize-handle" title="拖拽缩放调色盘"></span>' : ""}`;
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
    hit.dataset.edgeId = e.id;    hit.addEventListener("dblclick", ev => {
      ev.stopPropagation();
      removeEdge(e.id);
    });
    hit.addEventListener("contextmenu", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      showMenu(ev.clientX, ev.clientY, [["取消连线", () => removeEdge(e.id)]]);
    });
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const dropReady = edgeDropArmed && e.id === edgeDropTargetId;
    const releaseReady = nodeReleaseTargetId && (e.from.node === nodeReleaseTargetId || e.to.node === nodeReleaseTargetId);
    let edgeClass = "edge";
    if (dropReady) edgeClass += " edge-drop-ready";
    if (releaseReady) edgeClass += " edge-release-ready";
    path.setAttribute("class", edgeClass);
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

function strokeSmoothPath(points) {
  if (points.length < 3) return `M ${points.map(p => `${p.x} ${p.y}`).join(" L ")}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y}, ${mx} ${my}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function renderCutStroke() {
  const svg = els.gestureStroke;
  svg.innerHTML = "";
  if (!cutStroke || cutStroke.points.length < 2) return;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "cut-stroke-line");
  path.setAttribute("d", strokeSmoothPath(cutStroke.points));
  svg.appendChild(path);
}

function applyCutStroke(points) {
  if (points.length < 2) return;
  const hitEdges = [];
  for (const e of state.edges) {
    const a = findNode(e.from.node);
    const b = findNode(e.to.node);
    if (!a || !b) continue;
    const samples = edgeSamplePoints(a, b);
    outer: for (let i = 0; i < samples.length - 1; i++) {
      for (let j = 0; j < points.length - 1; j++) {
        if (segmentsIntersect(samples[i], samples[i + 1], points[j], points[j + 1])) {
          hitEdges.push(e);
          break outer;
        }
      }
    }
  }
  if (!hitEdges.length) return;
  const ids = new Set(hitEdges.map(e => e.id));
  const chainPairs = [];
  for (const e1 of hitEdges) {
    for (const e2 of hitEdges) {
      if (e1 !== e2 && e1.to.node === e2.from.node && e1.from.node !== e2.to.node) chainPairs.push([e1, e2]);
    }
  }
  state.edges = state.edges.filter(e => !ids.has(e.id));
  let bridged = 0;
  for (const [e1, e2] of chainPairs) {
    if (state.edges.some(e => e.from.node === e1.from.node && e.to.node === e2.to.node)) continue;
    state.edges.push({ id: uid("e"), from: { node: e1.from.node, port: "out" }, to: { node: e2.to.node, port: "in" }, label: "" });
    bridged++;
  }
  pushHistory();
  render();
  toast(bridged ? `已切断 ${ids.size} 条连线，两端节点已重新连接` : `已切断 ${ids.size} 条连线`);
  console.log("[划线切线] 手势完成", { cut: ids.size, bridged });
}

function renderMinimap() {
  const ctx = els.minimap.getContext("2d");
  const width = els.minimap.width;
  const height = els.minimap.height;
  const styles = getComputedStyle(els.app);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = styles.getPropertyValue("--minimap-bg").trim();
  ctx.fillRect(0, 0, width, height);
  const bounds = contentBounds();
  const scale = Math.min((width - 10) / bounds.w, (height - 10) / bounds.h);
  const ox = 5 - bounds.x * scale;
  const oy = 5 - bounds.y * scale;
  ctx.lineWidth = 1;
  ctx.strokeStyle = styles.getPropertyValue("--minimap-line").trim();
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
    const x = n.x * scale + ox;
    const y = n.y * scale + oy;
    const w = Math.max(3, n.w * scale);
    const h = Math.max(3, n.h * scale);
    ctx.fillStyle = styles.getPropertyValue(n.disabled ? "--minimap-node-disabled" : "--minimap-node").trim();
    ctx.strokeStyle = styles.getPropertyValue("--minimap-node-outline").trim();
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + .5, y + .5, Math.max(1, w - 1), Math.max(1, h - 1));
  }
  const viewport = els.viewport.getBoundingClientRect();
  const visibleX = -state.view.x / state.view.scale;
  const visibleY = -state.view.y / state.view.scale;
  const visibleWidth = viewport.width / state.view.scale;
  const visibleHeight = viewport.height / state.view.scale;
  const frameX = visibleX * scale + ox;
  const frameY = visibleY * scale + oy;
  const frameWidth = Math.max(4, visibleWidth * scale);
  const frameHeight = Math.max(4, visibleHeight * scale);
  ctx.fillStyle = styles.getPropertyValue("--minimap-viewport-fill").trim();
  ctx.strokeStyle = styles.getPropertyValue("--minimap-viewport-outline").trim();
  ctx.lineWidth = 1.5;
  ctx.fillRect(frameX, frameY, frameWidth, frameHeight);
  ctx.strokeRect(frameX + .75, frameY + .75, Math.max(1, frameWidth - 1.5), Math.max(1, frameHeight - 1.5));
}

function navigateFromMinimap(event) {
  const rect = els.minimap.getBoundingClientRect();
  const canvasX = (event.clientX - rect.left) * els.minimap.width / Math.max(1, rect.width);
  const canvasY = (event.clientY - rect.top) * els.minimap.height / Math.max(1, rect.height);
  const bounds = contentBounds();
  const mapScale = Math.min((els.minimap.width - 10) / bounds.w, (els.minimap.height - 10) / bounds.h);
  const mapOffsetX = 5 - bounds.x * mapScale;
  const mapOffsetY = 5 - bounds.y * mapScale;
  const worldX = (canvasX - mapOffsetX) / mapScale;
  const worldY = (canvasY - mapOffsetY) / mapScale;
  const viewport = els.viewport.getBoundingClientRect();
  state.view.x = viewport.width / 2 - worldX * state.view.scale;
  state.view.y = viewport.height / 2 - worldY * state.view.scale;
  applyView();
  renderMinimap();
}

let minimapNavigationPointer = null;
els.minimap.addEventListener("pointerdown", event => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  minimapNavigationPointer = event.pointerId;
  els.minimap.setPointerCapture(event.pointerId);
  els.minimap.classList.add("is-navigating");
  navigateFromMinimap(event);
});
els.minimap.addEventListener("pointermove", event => {
  if (minimapNavigationPointer !== event.pointerId) return;
  event.preventDefault();
  navigateFromMinimap(event);
});
function finishMinimapNavigation(event) {
  if (minimapNavigationPointer !== event.pointerId) return;
  minimapNavigationPointer = null;
  els.minimap.classList.remove("is-navigating");
  if (els.minimap.hasPointerCapture(event.pointerId)) els.minimap.releasePointerCapture(event.pointerId);
  scheduleViewPersistence();
}
els.minimap.addEventListener("pointerup", finishMinimapNavigation);
els.minimap.addEventListener("pointercancel", finishMinimapNavigation);

// ===== 小地图增强：点击选中命中节点 + Enter/Space 键盘导航 =====
// 增量叠加，不改动上方上游导航实现：按下即导航的手感保持不变；
// 阈值只用于“松开时是否选中”，不影响导航时机。组节点与普通节点同样可命中。
function minimapProjection(bounds, width, height) {
  const scale = Math.min((width - 10) / bounds.w, (height - 10) / bounds.h);
  return { scale, ox: 5 - bounds.x * scale, oy: 5 - bounds.y * scale };
}

// 小地图画布坐标命中检测：逆序取最上层节点，含 4px 容差
function minimapNodeAtPoint(nodes, point, projection) {
  const { scale, ox, oy } = projection;
  return [...nodes].reverse().find(node => {
    const x = node.x * scale + ox, y = node.y * scale + oy;
    const w = Math.max(3, node.w * scale), h = Math.max(3, node.h * scale);
    return point.x >= x - 4 && point.x <= x + w + 4 && point.y >= y - 4 && point.y <= y + h + 4;
  }) || null;
}

// 事件坐标 → 小地图画布坐标（画布属性尺寸 150×96 与 CSS 显示尺寸解耦）
function minimapEventPoint(clientX, clientY) {
  const rect = els.minimap.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    point: { x: (clientX - rect.left) * els.minimap.width / rect.width, y: (clientY - rect.top) * els.minimap.height / rect.height },
    projection: minimapProjection(contentBounds(), els.minimap.width, els.minimap.height),
  };
}

// 指针按下时记录命中候选；位移 ≥4px（CSS 像素）视为拖拽，松开不再选中
let minimapSelectCandidate = null;
els.minimap.addEventListener("pointerdown", event => {
  if (event.button !== 0) return;
  // 上游 pointerdown 的 preventDefault 会取消“点击聚焦”这一浏览器默认动作，
  // 导致键盘导航永远拿不到焦点；这里补一次编程式聚焦（不影响上游手感，
  // 鼠标路径不触发 :focus-visible 焦点环，Tab 键盘聚焦仍显示焦点环）。
  els.minimap.focus({ preventScroll: true });
  const eventPoint = minimapEventPoint(event.clientX, event.clientY);
  minimapSelectCandidate = eventPoint ? { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, point: eventPoint.point, projection: eventPoint.projection, moved: false } : null;
});
els.minimap.addEventListener("pointermove", event => {
  if (!minimapSelectCandidate || minimapSelectCandidate.pointerId !== event.pointerId) return;
  if (Math.hypot(event.clientX - minimapSelectCandidate.clientX, event.clientY - minimapSelectCandidate.clientY) >= 4) minimapSelectCandidate.moved = true;
});
els.minimap.addEventListener("pointerup", event => {
  const candidate = minimapSelectCandidate;
  minimapSelectCandidate = null;
  if (!candidate || candidate.pointerId !== event.pointerId || candidate.moved) return;
  const hit = minimapNodeAtPoint(state.nodes, candidate.point, candidate.projection);
  if (!hit) return; // 空白点击：保持上游“仅导航”语义，不动选区
  state.selected = new Set([hit.id]);
  syncSelectedNodeClasses();
});
els.minimap.addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  const selected = state.nodes.find(node => state.selected.has(node.id));
  const bounds = contentBounds();
  const target = selected
    ? { x: selected.x + selected.w / 2, y: selected.y + selected.h / 2 }
    : { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  const viewRect = els.viewport.getBoundingClientRect();
  state.view.x = viewRect.width / 2 - target.x * state.view.scale;
  state.view.y = viewRect.height / 2 - target.y * state.view.scale;
  applyView();
  renderMinimap();
  scheduleViewPersistence();
});

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

// ===== 画布文字标注（双击空白创建；屏幕像素渲染，缩放不改变字号） =====
function annotationId() {
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function findAnnotation(id) {
  return state.annotations.find(item => item.id === id) || null;
}

function buildAnnotationElement(ann) {
  const el = document.createElement("div");
  el.className = "canvas-annotation";
  el.dataset.id = ann.id;
  el.tabIndex = 0;
  el.textContent = ann.text;
  return el;
}

function renderAnnotations() {
  const layer = els.annotations;
  if (!layer) return; // 旧壳/旧 index.html 无标注层时静默降级
  // 编辑中的标注元素持有输入焦点，只同步位置不重建，避免打断输入
  if (layer.querySelector(".canvas-annotation.is-editing")) {
    syncAnnotationPositions();
    syncAnnotationSelectionClasses();
    return;
  }
  layer.replaceChildren(...state.annotations.map(buildAnnotationElement));
  syncAnnotationPositions();
  syncAnnotationSelectionClasses();
}

function syncAnnotationPositions() {
  if (!els.annotations) return;
  for (const el of els.annotations.querySelectorAll(".canvas-annotation")) {
    const ann = findAnnotation(el.dataset.id);
    if (!ann) continue;
    el.style.left = `${ann.x * state.view.scale + state.view.x}px`;
    el.style.top = `${ann.y * state.view.scale + state.view.y}px`;
  }
}

function syncAnnotationSelectionClasses() {
  if (!els.annotations) return;
  for (const el of els.annotations.querySelectorAll(".canvas-annotation")) {
    el.classList.toggle("is-selected", el.dataset.id === state.selectedAnnotationId);
  }
}

function selectAnnotation(id) {
  state.selectedAnnotationId = id;
  if (state.selected.size) {
    state.selected.clear();
    syncSelectedNodeClasses();
  }
  syncAnnotationSelectionClasses();
}

function createAnnotationAt(world) {
  const ann = { id: annotationId(), text: "", x: world.x, y: world.y };
  state.annotations.push(ann);
  selectAnnotation(ann.id);
  renderAnnotations();
  startAnnotationEdit(ann.id, true);
}

function startAnnotationEdit(id, selectAll = false) {
  const el = els.annotations.querySelector(`.canvas-annotation[data-id="${CSS.escape(id)}"]`);
  const ann = findAnnotation(id);
  if (!el || !ann) return;
  try { el.contentEditable = "plaintext-only"; } catch { el.contentEditable = "true"; }
  el.classList.add("is-editing");
  el.focus();
  if (selectAll) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function commitAnnotationEdit(el) {
  if (!el.isContentEditable) return;
  const ann = findAnnotation(el.dataset.id);
  const cancelled = el.dataset.cancelEdit === "1";
  delete el.dataset.cancelEdit;
  el.contentEditable = "false";
  el.classList.remove("is-editing");
  if (cancelled || !ann) { renderAnnotations(); return; } // Escape 取消：保留原文
  const next = (el.innerText || "").replace(/\u00a0/g, " ").replace(/\s+$/, "").trim();
  if (!next) {
    // 清空文本 = 删除标注（新建即放弃不进历史；原本有文字的进历史）
    const hadText = !!ann.text;
    state.annotations = state.annotations.filter(item => item.id !== ann.id);
    if (state.selectedAnnotationId === ann.id) state.selectedAnnotationId = "";
    if (hadText) pushHistory();
    renderAnnotations();
    return;
  }
  if (next !== ann.text) {
    ann.text = next;
    pushHistory();
  }
  renderAnnotations();
}

function deleteSelectedAnnotation() {
  const id = state.selectedAnnotationId;
  if (!id || !findAnnotation(id)) return false;
  state.annotations = state.annotations.filter(item => item.id !== id);
  state.selectedAnnotationId = "";
  pushHistory();
  renderAnnotations();
  return true;
}

if (els.annotations) {
  els.annotations.addEventListener("mousedown", ev => {
    const el = ev.target.closest(".canvas-annotation");
    if (!el) return;
    if (el.isContentEditable) return; // 编辑中走原生文本选择
    if (ev.button !== 0) return; // 右键/中键交给画布（菜单、平移）
    ev.stopPropagation();
    hideMenu();
    els.projectMenu.classList.add("hidden");
    const id = el.dataset.id;
    els.viewport.focus({ preventScroll: true });
    const ann = findAnnotation(id);
    if (!ann) return;
    selectAnnotation(id);
    drag = { type: "annotation", id, sx: ev.clientX, sy: ev.clientY, ox: ann.x, oy: ann.y, moved: false };
  });

  els.annotations.addEventListener("dblclick", ev => {
    const el = ev.target.closest(".canvas-annotation");
    if (!el) return;
    ev.preventDefault();
    ev.stopPropagation();
    startAnnotationEdit(el.dataset.id, false);
  });

  els.annotations.addEventListener("focusout", ev => {
    const el = ev.target.closest?.(".canvas-annotation");
    if (el?.isContentEditable) commitAnnotationEdit(el);
  });

  els.annotations.addEventListener("keydown", ev => {
    const el = ev.target.closest?.(".canvas-annotation");
    if (!el || !el.isContentEditable) return;
    ev.stopPropagation(); // 编辑期间屏蔽画布快捷键（Delete/Space/Ctrl+Z）
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing && ev.keyCode !== 229) {
      ev.preventDefault();
      el.blur();
    } else if (ev.key === "Escape") {
      el.dataset.cancelEdit = "1";
      el.blur();
    }
  });
}

function centerViewOnContent() {
  const r = els.viewport.getBoundingClientRect();
  const bounds = contentBounds();
  const fitScale = Math.min(1.4, Math.max(CANVAS_MIN_SCALE, Math.min((r.width - 220) / bounds.w, (r.height - 220) / bounds.h)));
  state.view.scale = Number.isFinite(fitScale) ? fitScale : 1;
  state.view.x = r.width / 2 - (bounds.x + bounds.w / 2) * state.view.scale;
  state.view.y = r.height / 2 - (bounds.y + bounds.h / 2) * state.view.scale;
  saveCurrentPage();
  persistPages();
  render();
  toast("已居中显示");
}

function tidyNodes() {
  const scope = state.selected.size ? state.nodes.filter(n => state.selected.has(n.id)) : state.nodes;
  if (!scope.length) return toast("没有需要整理的节点");
  const scopeSet = new Set(scope.map(n => n.id));
  const edges = state.edges.filter(e => scopeSet.has(e.from.node) && scopeSet.has(e.to.node));
  // 局部整理时保持选区原中心不动；全量整理时把结果放到当前视口中央，避免内容跑到一侧。
  // 选区中心必须在布局改位前记录，否则拿到的已是新位置。
  const isPartial = state.selected.size > 0 && scope.length !== state.nodes.length;
  let targetCenter;
  if (isPartial) {
    const xs = scope.map(n => n.x), ys = scope.map(n => n.y);
    const xe = scope.map(n => n.x + n.w), ye = scope.map(n => n.y + n.h);
    targetCenter = { x: (Math.min(...xs) + Math.max(...xe)) / 2, y: (Math.min(...ys) + Math.max(...ye)) / 2 };
  } else {
    targetCenter = visibleWorldCenter();
  }

  const depths = new Map();
  const visit = (nodeId, stack = new Set()) => {
    if (depths.has(nodeId)) return depths.get(nodeId);
    if (stack.has(nodeId)) return 0;
    stack.add(nodeId);
    const incoming = edges.filter(e => e.to.node === nodeId);
    const depth = incoming.length ? Math.max(...incoming.map(e => visit(e.from.node, stack) + 1)) : 0;
    stack.delete(nodeId);
    depths.set(nodeId, depth);
    return depth;
  };
  scope.forEach(n => visit(n.id));
  const neighbors = new Map(scope.map(node => [node.id, new Set()]));
  edges.forEach(edge => {
    neighbors.get(edge.from.node)?.add(edge.to.node);
    neighbors.get(edge.to.node)?.add(edge.from.node);
  });
  const components = [];
  const seen = new Set();
  scope
    .slice()
    .sort((a, b) => a.created - b.created)
    .forEach(start => {
      if (seen.has(start.id)) return;
      const component = [];
      const queue = [start.id];
      seen.add(start.id);
      while (queue.length) {
        const id = queue.shift();
        const node = findNode(id);
        if (node) component.push(node);
        for (const nextId of neighbors.get(id) || []) {
          if (seen.has(nextId)) continue;
          seen.add(nextId);
          queue.push(nextId);
        }
      }
      components.push(component);
    });

  // 行式布局：同一条链上的节点排在同一行，行距由该行最高的节点决定，列宽由该层最宽的节点决定。
  const successors = new Map(scope.map(node => [node.id, []]));
  edges.forEach(edge => successors.get(edge.from.node)?.push(edge.to.node));
  const columnWidths = new Map();
  scope.forEach(node => {
    const depth = depths.get(node.id) || 0;
    columnWidths.set(depth, Math.max(columnWidths.get(depth) || 0, node.w));
  });
  const columnX = new Map();
  let nextColumnX = 0;
  [...columnWidths.keys()].sort((a, b) => a - b).forEach(depth => {
    columnX.set(depth, nextColumnX);
    nextColumnX += columnWidths.get(depth) + 80;
  });
  const sourceIds = new Set(scope.map(n => n.id));
  edges.forEach(e => sourceIds.delete(e.to.node));

  let nextGroupY = 0;
  components.forEach(component => {
    const rows = [];
    const rowOf = new Map();
    const newRow = () => { rows.push([]); return rows.length - 1; };
    const walk = (nodeId, row) => {
      if (rowOf.has(nodeId)) return;
      rowOf.set(nodeId, row);
      rows[row].push(nodeId);
      const next = (successors.get(nodeId) || [])
        .slice()
        .sort((a, b) => (findNode(a)?.created || 0) - (findNode(b)?.created || 0));
      next.forEach((id, index) => {
        if (rowOf.has(id)) return;
        walk(id, index === 0 ? row : newRow());
      });
    };
    component
      .slice()
      .sort((a, b) => a.created - b.created)
      .forEach(node => {
        if (sourceIds.has(node.id)) walk(node.id, newRow());
      });
    component.forEach(node => {
      if (!rowOf.has(node.id)) walk(node.id, newRow());
    });

    const rowHeights = rows.map(ids => Math.max(...ids.map(id => findNode(id)?.h || 0)));
    const rowYs = [];
    let rowCursor = 0;
    rows.forEach((ids, row) => { rowYs[row] = rowCursor; rowCursor += rowHeights[row] + 40; });
    rows.forEach((ids, row) => ids.forEach(id => {
      const node = findNode(id);
      node.x = snap(columnX.get(depths.get(id) || 0));
      // 吸附行中心而不是逐节点吸附，保证同一条链的节点中心严格对齐
      node.y = snap(nextGroupY + rowYs[row] + rowHeights[row] / 2) - node.h / 2;
    }));
    nextGroupY = nextGroupY + rowCursor - 40 + 80;
  });

  const bx = Math.min(...scope.map(n => n.x)), by = Math.min(...scope.map(n => n.y));
  const bx2 = Math.max(...scope.map(n => n.x + n.w)), by2 = Math.max(...scope.map(n => n.y + n.h));
  // 偏移量吸附网格即可；节点坐标不能二次吸附，否则奇数高度节点会被挪偏、破坏行中心对齐
  const dx = snap(targetCenter.x - (bx + bx2) / 2);
  const dy = snap(targetCenter.y - (by + by2) / 2);
  scope.forEach(n => { n.x += dx; n.y += dy; });

  pushHistory();
  render();
  toast(isPartial ? `已整理选中的 ${scope.length} 个节点` : "已整理节点");
}

function autoAddAiNodes() {
  const isSource = node => node.type !== "output" && node.type !== "ai-image" && !node.disabled;
  const selected = state.nodes.filter(node => state.selected.has(node.id) && isSource(node));
  const sources = (selected.length ? selected : state.nodes.filter(isSource))
    .sort((a, b) => a.x - b.x || a.y - b.y || a.created - b.created);
  if (!sources.length) return toast("没有需要连接的节点");

  const sourceIds = new Set(sources.map(node => node.id));
  const replacedEdges = state.edges.filter(edge => sourceIds.has(edge.from.node) && sourceIds.has(edge.to.node));
  state.edges = state.edges.filter(edge => !sourceIds.has(edge.from.node) || !sourceIds.has(edge.to.node));
  for (let index = 0; index < sources.length - 1; index++) {
    state.edges.push({
      id: uid("e"),
      from: { node: sources[index].id, port: "out" },
      to: { node: sources[index + 1].id, port: "in" },
      label: "",
    });
  }

  const terminal = sources[sources.length - 1];
  const aiNode = addNode("ai-image", snap(terminal.x + 330), snap(terminal.y), false);
  normalizeAiNodeSettings(aiNode);
  state.edges.push({ id: uid("e"), from: { node: terminal.id, port: "out" }, to: { node: aiNode.id, port: "in" }, label: "" });
  state.selected = new Set([aiNode.id]);
  refreshAiPrompt(aiNode.id);
  pushHistory();
  render();
  console.log("[一键连接] 已按画布位置创建单链", {
    sourceIds: sources.map(node => node.id),
    aiNodeId: aiNode.id,
    replacedEdges: replacedEdges.length,
  });
  toast(`已依次连接 ${sources.length} 个节点并添加 1 个 AI 绘图节点`);
}

function connectSelectionInSequence() {
  const selectedSources = state.nodes
    .filter(n => state.selected.has(n.id) && (!n.disabled && (n.type === "text" || n.type === "variable" || n.type === "image" || n.type === "ai-image")));
  const byCanvasOrder = (a, b) => a.x - b.x || a.y - b.y || a.created - b.created;
  const sources = selectedSources.sort(byCanvasOrder);
  if (sources.length < 2) return toast("请至少选择 2 个文字、变量、图片或 AI 绘图节点");

  const selectedIds = new Set(sources.map(n => n.id));
  const desiredPairs = new Set();
  for (let i = 0; i < sources.length - 1; i++) {
    desiredPairs.add(`${sources[i].id}>${sources[i + 1].id}`);
  }

  const internalEdges = state.edges.filter(e => selectedIds.has(e.from.node) && selectedIds.has(e.to.node));
  const currentPairs = new Set(internalEdges.map(e => `${e.from.node}>${e.to.node}`));
  const alreadyConnected = internalEdges.length === desiredPairs.size
    && currentPairs.size === desiredPairs.size
    && [...desiredPairs].every(pair => currentPairs.has(pair));
  if (alreadyConnected) return toast("所选节点已经依次连接");

  state.edges = state.edges.filter(e => !selectedIds.has(e.from.node) || !selectedIds.has(e.to.node));
  for (let i = 0; i < sources.length - 1; i++) {
    state.edges.push({ id: uid("e"), from: { node: sources[i].id, port: "out" }, to: { node: sources[i + 1].id, port: "in" }, label: "" });
  }
  pushHistory();
  render();
  console.log("[依次连接] 已按画布顺序重建单链", { sourceIds: sources.map(n => n.id), replacedEdges: internalEdges.length, addedEdges: sources.length - 1 });
  toast(`已依次连接 ${sources.length} 个节点`);
}

function nodeImageReference(node) {
  if (!node) return null;
  if (node.type === "image" && (node.image || node.imageAssetId)) return { image: node.image || "", assetId: node.imageAssetId || "" };
  if ((node.type === "ai-image" || node.type === "angle-image") && (node.generatedImage || node.generatedAssetId)) return { image: node.generatedImage || "", assetId: node.generatedAssetId || "" };
  return null;
}

function imageNodeOverlapsOthers(node) {
  return state.nodes.some(other => {
    if (!other || other.id === node.id || !nodeImageReference(other)) return false;
    return Math.min(node.x + node.w, other.x + other.w) > Math.max(node.x, other.x)
      && Math.min(node.y + node.h, other.y + other.h) > Math.max(node.y, other.y);
  });
}

function clearCompositeHover() {
  const hadReadyState = compositeHoverReady;
  compositeHoverTargetId = "";
  compositeHoverReady = false;
  els.nodes.querySelectorAll(".composite-drop-ready").forEach(element => element.classList.remove("composite-drop-ready"));
  if (hadReadyState) scheduleInteractiveRender({ nodes: true });
}

function updateCompositeHover(dragState) {
  if (!dragState?.moved || dragState.original.length !== 1) return clearCompositeHover();
  const source = findNode(dragState.original[0].id);
  if (!source) return clearCompositeHover();
  // 文字节点重合=文案合并(独立开关);其余走图片叠放编辑(独立开关)
  const textMergeMode = state.settings.textMergeOnOverlap !== false
    && source.type === "text" && String(source.text || "").trim().length > 0;
  const imageMode = state.settings.editOnOverlap !== false && Boolean(nodeImageReference(source));
  if (!textMergeMode && !imageMode) return clearCompositeHover();
  let bestTarget = null;
  let bestRatio = 0;
  for (const target of state.nodes) {
    if (target.id === source.id || state.selected.has(target.id)) continue;
    if (textMergeMode ? (target.type !== "text") : !nodeImageReference(target)) continue;
    const overlapWidth = Math.max(0, Math.min(source.x + source.w, target.x + target.w) - Math.max(source.x, target.x));
    const overlapHeight = Math.max(0, Math.min(source.y + source.h, target.y + target.h) - Math.max(source.y, target.y));
    const ratio = overlapWidth * overlapHeight / Math.max(1, Math.min(source.w * source.h, target.w * target.h));
    if (ratio > bestRatio) { bestRatio = ratio; bestTarget = target; }
  }
  const targetId = bestRatio >= .2 ? bestTarget?.id || "" : "";
  if (targetId === compositeHoverTargetId) return;
  clearCompositeHover();
  if (!targetId) return;
  compositeHoverTargetId = targetId;
  compositeHoverReady = true;
  const targetElement = els.nodes.querySelector(`.node[data-id="${CSS.escape(targetId)}"]`);
  targetElement?.classList.add("composite-drop-ready");
  scheduleInteractiveRender({ nodes: true });
}

function edgeInsertableNode(node) {
  return !!node && node.type !== "output" && node.type !== "screenshot-input" && node.type !== "palette" && (node.type !== "tool-node" || isLinkedUpscaleNode(node));
}

// 文字节点重合合并:两段文案按画布位置从左到右(同列按从上到下)拼接,并入被叠节点,删除拖动节点;
// 拖动节点的连线转到被叠节点,变量词选择同名冲突时保留被叠节点的选择
function mergeTextNodeTexts(target, source) {
  const ordered = [source, target].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  target.text = ordered.map(node => String(node.text || "").trim()).filter(Boolean).join("\n");
  if (source.variableChoices) target.variableChoices = { ...source.variableChoices, ...(target.variableChoices || {}) };
  for (const edge of state.edges) {
    if (edge.from.node === source.id) edge.from.node = target.id;
    if (edge.to.node === source.id) edge.to.node = target.id;
  }
  state.edges = state.edges.filter(edge => !(edge.from.node === target.id && edge.to.node === target.id));
  state.nodes = state.nodes.filter(node => node.id !== source.id);
  state.selected.delete(source.id);
  state.selected.add(target.id);
  pushHistory();
  render();
  toast("已合并文案（Ctrl+Z 可撤销）");
  console.log("[文字节点合并]", { targetId: target.id, removedId: source.id });
}

// 文字节点按换行拆分:每个非空行一个文字节点,首个留在原节点,其余在右侧排成一列
function splitTextNodeByLines(node) {
  const lines = String(node.text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    toast("文字没有多个非空行，无法拆分");
    return;
  }
  node.text = lines[0];
  lines.slice(1).forEach((line, index) => {
    const textNode = addNode("text", node.x + node.w + 40, node.y + index * (node.h + 24), false);
    textNode.text = line;
  });
  pushHistory();
  render();
  toast(`已按换行拆分为 ${lines.length} 个文字节点`);
}

function edgeHitPoints(a, b) {
  const g = edgeGeometry(a, b);
  if (g.type !== "polyline") return edgeSamplePoints(a, b);
  const points = [];
  for (let i = 0; i < g.points.length - 1; i++) {
    const p = g.points[i];
    const q = g.points[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 16));
    for (let s = 0; s < steps; s++) points.push({ x: p.x + (q.x - p.x) * s / steps, y: p.y + (q.y - p.y) * s / steps });
  }
  points.push(g.points[g.points.length - 1]);
  return points;
}

function setEdgeDropNodeHint(nodeId) {
  els.nodes.querySelectorAll(".node.edge-drop-armed").forEach(element => {
    if (element.dataset.id !== nodeId) element.classList.remove("edge-drop-armed");
  });
  if (!nodeId) return;
  els.nodes.querySelector(`.node[data-id="${CSS.escape(nodeId)}"]`)?.classList.add("edge-drop-armed");
}

function clearEdgeDropHover() {
  if (edgeDwellTimer) {
    window.clearTimeout(edgeDwellTimer);
    edgeDwellTimer = 0;
  }
  edgeDropArmed = false;
  setEdgeDropNodeHint("");
  if (!edgeDropTargetId) return;
  edgeDropTargetId = "";
  edgeDropPoint = null;
  scheduleInteractiveRender({ edges: true });
}

function armEdgeDropTarget() {
  edgeDwellTimer = 0;
  edgeDropArmed = true;
  setEdgeDropNodeHint(drag?.original[0]?.id || "");
  scheduleInteractiveRender({ edges: true });
}

function updateEdgeDropHover(dragState) {
  if (!dragState?.moved || dragState.original.length !== 1 || compositeHoverReady) return clearEdgeDropHover();
  const source = findNode(dragState.original[0].id);
  if (!edgeInsertableNode(source)) return clearEdgeDropHover();
  const margin = 10;
  const centerX = source.x + source.w / 2;
  const centerY = source.y + source.h / 2;
  let bestEdgeId = "";
  let bestPoint = null;
  let bestDistance = Infinity;
  for (const edge of state.edges) {
    if (edge.from.node === source.id || edge.to.node === source.id) continue;
    const a = findNode(edge.from.node);
    const b = findNode(edge.to.node);
    if (!a || !b) continue;
    for (const p of edgeHitPoints(a, b)) {
      if (p.x < source.x - margin || p.x > source.x + source.w + margin || p.y < source.y - margin || p.y > source.y + source.h + margin) continue;
      const distance = Math.hypot(p.x - centerX, p.y - centerY);
      if (distance < bestDistance) { bestDistance = distance; bestEdgeId = edge.id; bestPoint = p; }
    }
  }
  if (bestEdgeId !== edgeDropTargetId) {
    if (edgeDwellTimer) {
      window.clearTimeout(edgeDwellTimer);
      edgeDwellTimer = 0;
    }
    edgeDropTargetId = bestEdgeId;
    edgeDropPoint = bestPoint;
    edgeDropArmed = false;
    setEdgeDropNodeHint("");
    if (bestEdgeId) edgeDwellTimer = window.setTimeout(armEdgeDropTarget, EDGE_DROP_DWELL_MS);
    scheduleInteractiveRender({ edges: true });
  } else if (bestEdgeId) {
    edgeDropPoint = bestPoint;
  }
}

function armNodeRelease() {
  nodeHoldTimer = 0;
  if (!drag || drag.type !== "nodes" || drag.moved || drag.original.length !== 1) return;
  const nodeId = drag.original[0].id;
  const ins = state.edges.filter(e => e.to.node === nodeId);
  const outs = state.edges.filter(e => e.from.node === nodeId);
  if (!ins.length && !outs.length) return;
  nodeReleaseTargetId = nodeId;
  nodeReleaseBridged = ins.length > 0 && outs.length > 0;
  const element = els.nodes.querySelector(`.node[data-id="${CSS.escape(nodeId)}"]`);
  element?.classList.add("edge-release-armed");
  element?.classList.toggle("edge-release-bridge", nodeReleaseBridged);
  scheduleInteractiveRender({ edges: true });
}

function clearNodeRelease() {
  if (nodeHoldTimer) {
    window.clearTimeout(nodeHoldTimer);
    nodeHoldTimer = 0;
  }
  if (!nodeReleaseTargetId) return;
  nodeReleaseTargetId = "";
  nodeReleaseBridged = false;
  els.nodes.querySelectorAll(".node.edge-release-armed").forEach(element => {
    element.classList.remove("edge-release-armed");
    element.classList.remove("edge-release-bridge");
  });
  scheduleInteractiveRender({ edges: true });
}

els.viewport.addEventListener("wheel", ev => {
  if (ev.target.closest(".palette-widget")) return;
  ev.preventDefault();
  clearNodeRelease();
  const before = screenToWorld(ev.clientX, ev.clientY);
  const factor = ev.deltaY < 0 ? 1.08 : .92;
  state.view.scale = Math.max(CANVAS_MIN_SCALE, Math.min(CANVAS_MAX_SCALE, state.view.scale * factor));
  const r = els.viewport.getBoundingClientRect();
  state.view.x = ev.clientX - r.left - before.x * state.view.scale;
  state.view.y = ev.clientY - r.top - before.y * state.view.scale;
  scheduleViewPersistence();
  scheduleInteractiveRender({ view: true, minimap: true });
}, { passive: false });

els.viewport.addEventListener("mousedown", ev => {
  hideMenu();
  els.projectMenu.classList.add("hidden");
  if (ev.target.closest(".minimap-panel")) return;
  if (ev.target.closest("[data-role='annotation-editor']")) return; // 批注编辑层上的按下交给批注绘制，不触发画布空白选框/节点拖动
  lastPointerWorld = screenToWorld(ev.clientX, ev.clientY);
  if (state.selectedAnnotationId) {
    state.selectedAnnotationId = "";
    syncAnnotationSelectionClasses();
  }
  if (altDown && ev.button === 0 && !ev.target.closest(".minimap-panel") && !ev.target.closest("textarea,button,input,select,video,[contenteditable='true'],[data-role='text-inline-edit']")) {
    ev.preventDefault();
    cutStroke = { points: [screenToWorld(ev.clientX, ev.clientY)] };
    return;
  }
  if (ev.target.closest(".edge-hit")) return; // 点击连线不做任何操作，交给 dblclick / contextmenu
  const port = ev.target.closest(".port");
  const nodeEl = ev.target.closest(".node");
  const interactive = ev.target.closest("textarea,button,input,select,video,summary,[contenteditable='true'],[data-role='text-inline-edit']");
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
    selectCanvasNode(id, ev.shiftKey);
    drag = { type: "resize", nodeId: id, sx: ev.clientX, sy: ev.clientY, sw: node.w, sh: node.h };
    syncSelectedNodeClasses();
    return;
  }
  if (nodeEl && interactive) {
    const id = nodeEl.dataset.id;
    selectCanvasNode(id, ev.shiftKey);
    return;
  }
  if (nodeEl && ev.button === 0) {
    const id = nodeEl.dataset.id;
    selectCanvasNode(id, ev.shiftKey);
    const start = screenToWorld(ev.clientX, ev.clientY);
    const nodes = state.nodes.filter(n => state.selected.has(n.id));
    drag = { type: "nodes", start, moved: false, original: nodes.map(n => ({ id: n.id, x: n.x, y: n.y })), groupFrames: canvasDragGroupFrames(nodes) };
    // Keep the preview element alive so a real mouse double-click can reach it.
    // Rebuilding the node here would discard the first click's DOM target.
    clearNodeRelease();
    nodeHoldTimer = window.setTimeout(armNodeRelease, NODE_RELEASE_HOLD_MS);
    syncSelectedNodeClasses();
    return;
  }
  if (spaceDown || ev.button === 1) {
    drag = { type: "pan", sx: ev.clientX, sy: ev.clientY, vx: state.view.x, vy: state.view.y };
    return;
  }
  const groupFrame = ev.target.closest(".node-group-frame");
  if (groupFrame && ev.button === 0) {
    const groupAction = ev.target.closest("[data-group-action]");
    if (groupAction) {
      ev.preventDefault(); ev.stopPropagation();
      if (groupAction.dataset.groupAction === "stop") stopCanvasGroup(groupFrame.dataset.groupId);
      else runCanvasGroup(groupFrame.dataset.groupId);
      return;
    }
    const nodes = canvasGroupMembers(groupFrame.dataset.groupId);
    if (nodes.length < 2) return;
    ev.preventDefault();
    state.selected = new Set(nodes.map(node => node.id));
    state.selectedCanvasGroupId = groupFrame.dataset.groupId;
    drag = { type: "canvas-group", start: screenToWorld(ev.clientX, ev.clientY), moved: false, original: nodes.map(node => ({ id: node.id, x: node.x, y: node.y })), groupFrames: canvasDragGroupFrames(nodes) };
    selectionDraft = null;
    els.selectionBox.classList.add("hidden");
    clearNodeRelease();
    clearCompositeHover();
    clearEdgeDropHover();
    syncSelectedNodeClasses();
    return;
  }
  if (ev.button === 0) {
    const p = screenToWorld(ev.clientX, ev.clientY);
    state.selected.clear();
    state.selectedCanvasGroupId = "";
    selectionDraft = { start: p, end: p };
    updateSelectionBox();
    syncSelectedNodeClasses();
  }
});

window.addEventListener("mousemove", ev => {
  lastPointerClient = { x: ev.clientX, y: ev.clientY };
  if (ev.target.closest?.("#viewport")) lastPointerWorld = screenToWorld(ev.clientX, ev.clientY);
  if (cutStroke) {
    const p = screenToWorld(ev.clientX, ev.clientY);
    const pts = cutStroke.points;
    const last = pts[pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) > 4 / state.view.scale) {
      pts.push(p);
      renderCutStroke();
    }
    return;
  }
  if (connectDraft) {
    connectDraft.end = screenToWorld(ev.clientX, ev.clientY);
    scheduleInteractiveRender({ edges: true });
  }
  if (drag?.type === "resize") {
    const node = findNode(drag.nodeId);
    if (node) {
      const scale = state.view.scale;
      const minWidth = node.type === "palette" ? 220 : 180;
      const width = Math.max(minWidth, drag.sw + (ev.clientX - drag.sx) / scale);
      const minHeight = node.type === "ai-image" ? AI_NODE_HEIGHT : node.type === "angle-image" ? ANGLE_NODE_HEIGHT : node.type === "palette" ? 200 : 120;
      const height = Math.max(minHeight, drag.sh + (ev.clientY - drag.sy) / scale);
      drag.blockedGroups = new Set();
      const movingIds = new Set([node.id]);
      // 编组成员放大同样会撑开外框，因此扩张要受组外节点限制；缩小不受限，可随时回缩
      const widthDelta = width - node.w;
      node.w += widthDelta > 0 ? constrainCanvasGroupDelta([node], "x", widthDelta, movingIds, drag.blockedGroups) : widthDelta;
      const heightDelta = height - node.h;
      node.h += heightDelta > 0 ? constrainCanvasGroupDelta([node], "y", heightDelta, movingIds, drag.blockedGroups) : heightDelta;
      const el = document.querySelector(`.node[data-id="${node.id}"]`);
      if (el) {
        el.style.width = `${node.w}px`;
        el.style.height = `${node.h}px`;
      }
      if (node.canvasGroupId) canvasGroupBounds(canvasGroupMembers(node.canvasGroupId));
      scheduleInteractiveRender({ nodes: true, edges: true, minimap: true });
    }
  } else if (drag?.type === "nodes" || drag?.type === "canvas-group") {
    const p = screenToWorld(ev.clientX, ev.clientY);
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 3 / state.view.scale) return;
    drag.moved = true;
    clearNodeRelease();
    moveCanvasDragNodes(drag, p);
    if (drag.type === "nodes") {
      updateCompositeHover(drag);
      updateEdgeDropHover(drag);
    }
    scheduleInteractiveRender({ nodes: true, edges: true, minimap: true });
  } else if (drag?.type === "pan") {
    state.view.x = drag.vx + ev.clientX - drag.sx;
    state.view.y = drag.vy + ev.clientY - drag.sy;
    scheduleInteractiveRender({ view: true, minimap: true });
  } else if (drag?.type === "annotation") {
    const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    const ann = findAnnotation(drag.id);
    if (!ann) return;
    ann.x = drag.ox + dx / state.view.scale;
    ann.y = drag.oy + dy / state.view.scale;
    syncAnnotationPositions();
  }
  if (selectionDraft) {
    selectionDraft.end = screenToWorld(ev.clientX, ev.clientY);
    updateSelectionBox();
    const r = normalizedRect(selectionDraft.start, selectionDraft.end);
    state.selected = new Set(state.nodes.filter(n => intersects(r, { x: n.x, y: n.y, w: n.w, h: n.h })).map(n => n.id));
    scheduleInteractiveRender({ selection: true });
  }
});

window.addEventListener("mouseup", ev => {
  if (cutStroke) {
    const stroke = cutStroke;
    cutStroke = null;
    renderCutStroke();
    applyCutStroke(stroke.points);
    return;
  }
  if (connectDraft) {
    const targetNode = findNearbyInputNode(ev.clientX, ev.clientY);
    if (targetNode) addEdge(connectDraft.from, targetNode.id);
    connectDraft = null;
    renderEdges();
  }
  if (drag?.type === "resize") { render(); pushHistory(); }
  if (drag?.type === "canvas-group" && drag.moved) pushHistory();
  let compositeRequest = null;
  if (drag?.type === "nodes" && compositeHoverReady && compositeHoverTargetId && drag.original.length === 1) {
    const source = findNode(drag.original[0].id);
    const target = findNode(compositeHoverTargetId);
    if (source && target) {
      source.x = drag.original[0].x;
      source.y = drag.original[0].y;
      // 文字节点重合=合并文案;图片照旧打开叠放编辑
      compositeRequest = { source, target, textMerge: source.type === "text" && target.type === "text" };
      render();
    }
  } else if (drag?.type === "nodes") {
    if (nodeReleaseTargetId) {
      const nodeId = nodeReleaseTargetId;
      const removed = state.edges.filter(e => e.from.node === nodeId || e.to.node === nodeId);
      const ins = removed.filter(e => e.to.node === nodeId);
      const outs = removed.filter(e => e.from.node === nodeId);
      clearNodeRelease();
      if (removed.length) {
        // 隔离语义与 Alt 划线切线一致:被切断的 入边×出边 链路重新桥接,跳过自环与重复
        state.edges = state.edges.filter(e => !removed.includes(e));
        let bridged = 0;
        for (const e1 of ins) {
          for (const e2 of outs) {
            if (e1.from.node === e2.to.node) continue;
            if (state.edges.some(e => e.from.node === e1.from.node && e.to.node === e2.to.node)) continue;
            state.edges.push({ id: uid("e"), from: { node: e1.from.node, port: "out" }, to: { node: e2.to.node, port: "in" }, label: "" });
            bridged++;
          }
        }
        pushHistory();
        render();
        console.log("[长按隔离] 节点已从连线中隔离", { nodeId, removed: removed.length, bridged });
        toast(bridged ? `已隔离节点，前后连线已接通（断开 ${removed.length} 条）` : `已解除该节点的 ${removed.length} 条连线`);
      }
    } else {
      const dropEdgeId = edgeDropArmed ? edgeDropTargetId : "";
      const draggedNodeId = drag.original[0]?.id;
      clearEdgeDropHover();
      if (!(dropEdgeId && draggedNodeId && insertNodeIntoEdge(dropEdgeId, draggedNodeId))) pushHistory();
    }
  }
  if (drag?.type === "pan") {
    saveCurrentPage();
    persistPages();
  }
  if (drag?.type === "annotation" && drag.moved) {
    if (findAnnotation(drag.id)) pushHistory();
  }
  if (drag?.blockedGroups?.size) scheduleInteractiveRender({ nodes: true });
  clearCompositeHover();
  clearEdgeDropHover();
  clearNodeRelease();
  drag = null;
  if (compositeRequest) {
    if (compositeRequest.textMerge) {
      mergeTextNodeTexts(compositeRequest.target, compositeRequest.source);
    } else {
      console.log("[节点叠放合成] 已触发编辑", { baseNodeId: compositeRequest.target.id, placedNodeId: compositeRequest.source.id });
      void openNodeCompositeEditor(compositeRequest.target, compositeRequest.source);
    }
  }
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

// 文字内容变化后就地同步该节点的变量下拉条(不动 textarea,避免打断输入/IME);变量集合没变就不动 DOM
let textVariableStripSyncTimer = 0;
function syncTextNodeVariableStrip(node) {
  const nodeEl = els.nodes.querySelector(`.node[data-id="${node.id}"]`);
  const textarea = nodeEl?.querySelector('textarea[data-role="text"]');
  if (!nodeEl || !textarea) return;
  const html = textVariableStripHtml(node);
  const preview = nodeEl.querySelector(".text-inline-preview");
  if (html) {
    if (preview) { const wrap = document.createElement("div"); wrap.innerHTML = html; preview.replaceWith(wrap.firstElementChild); }
    else textarea.insertAdjacentHTML("beforebegin", html);
  } else preview?.remove();
  syncTextNodeScrollEdges(node.id);
}

// 文字节点滚动边缘渐隐:预览区或编辑区还有未显示的内容时,在节点内容区上/下缘显示渐隐层,
// 提示存在被裁剪的文字。纯视觉层:渐隐层 pointer-events:none,不拦截滚动/输入/选择;
// 测量目标 = 当前可见的滚动元素(编辑态 textarea,预览态 .text-inline-preview),两者均为原生滚动容器。
// 浏览器本身按帧合并 scroll 事件,这里不再包 rAF(后台标签 rAF 会被节流,直接同步更稳)。
function syncTextNodeScrollEdges(nodeId) {
  const nodes = nodeId ? [findNode(nodeId)] : state.nodes;
  for (const node of nodes) {
    if (!node || node.type !== "text") continue;
    const nodeEl = els.nodes.querySelector(`.node[data-id="${node.id}"]`);
    if (!nodeEl) continue;
    const preview = nodeEl.querySelector(".text-inline-preview");
    const editing = nodeEl.classList.contains("is-text-editing");
    const scroller = editing || !preview ? nodeEl.querySelector('textarea[data-role="text"]') : preview;
    if (!scroller) continue;
    const before = scroller.scrollTop > 1;
    const after = scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1;
    nodeEl.classList.toggle("has-scroll-before", before);
    nodeEl.classList.toggle("has-scroll-after", after);
  }
}

els.nodes.addEventListener("input", ev => {
  const nodeEl = ev.target.closest(".node");
  if (!nodeEl) return;
  const node = findNode(nodeEl.dataset.id);
  if (ev.target.dataset.role === "text") {
    node.text = ev.target.value;
    markDirty();
    publishScreenshotNodeCatalog();
    syncTextNodeScrollEdges(node.id);
    if (!ev.isComposing) {
      window.clearTimeout(textVariableStripSyncTimer);
      textVariableStripSyncTimer = window.setTimeout(() => syncTextNodeVariableStrip(node), 250);
    }
  }
  // 对话输入框只保存本轮草稿,不作为节点输出；不触发渲染以免打断输入/IME。
  if (ev.target.dataset.role === "chat-text") {
    node.chatDraft = ev.target.value;
    saveActiveChatSession(node, true);
    markDirty();
  }
  // 浏览器生图:提示词与自定义网址只落盘不渲染(保住输入焦点)
  if (ev.target.dataset.role === "browser-prompt") {
    node.prompt = ev.target.value;
    markDirty();
  }
  if (ev.target.dataset.role === "browser-origin") {
    node._browserOrigin = ev.target.value;
    markDirty();
  }
  window.LocalSD?.handleInput(node, ev.target.dataset.role, ev.target);
});

// 预览区/编辑区滚动不冒泡,用捕获阶段统一接住(scroll 事件由浏览器按帧合并,直接同步即可);
// 单次滚动只改变一个节点的滚动状态,按节点过滤同步,避免大画布上每个滚动事件全量扫描
els.nodes.addEventListener("scroll", ev => {
  if (!(ev.target instanceof Element) || !ev.target.matches('textarea[data-role="text"], .text-inline-preview')) return;
  const nodeEl = ev.target.closest(".node");
  if (nodeEl) syncTextNodeScrollEdges(nodeEl.dataset.id);
}, { capture: true, passive: true });

// 对话正文回车即发送(Shift+Enter 换行);IME 组合中的回车是选字确认,不发送
els.nodes.addEventListener("keydown", ev => {
  if (ev.target.dataset?.role !== "chat-text") return;
  if (ev.key !== "Enter" || ev.shiftKey) return;
  if (ev.isComposing || ev.keyCode === 229) return;
  ev.preventDefault();
  const nodeEl = ev.target.closest(".node");
  const node = nodeEl ? findNode(nodeEl.dataset.id) : null;
  if (!node || node.type !== "chat" || node._chatBusy) return;
  sendChatNodeMessage(node.id);
});

els.nodes.addEventListener("pointerdown", ev => {
  const select = ev.target.closest?.(".node select");
  if (!select) return;
  els.nodes.querySelectorAll(".node.select-menu-open").forEach(node => {
    if (node !== select.closest(".node")) node.classList.remove("select-menu-open");
  });
  select.closest(".node")?.classList.add("select-menu-open");
});

els.nodes.addEventListener("focusin", ev => {
  if (ev.target.dataset.role !== "text") return;
  ev.target.closest(".node")?.classList.add("is-text-editing");
  syncTextNodeScrollEdges(ev.target.closest(".node")?.dataset.id);
  const value = ev.target.value.trim();
  if (value !== "请输入文字内容" && value !== "Enter text") return;
  const nodeEl = ev.target.closest(".node");
  const node = nodeEl ? findNode(nodeEl.dataset.id) : null;
  ev.target.value = "";
  if (!node) return;
  node.text = "";
  markDirty();
  pushHistory();
  publishScreenshotNodeCatalog();
});

els.nodes.addEventListener("focusout", ev => {
  if (ev.target.dataset?.role === "text") {
    ev.target.closest(".node")?.classList.remove("is-text-editing");
    // 失焦时立即把变量下拉条刷到最新（输入期间的 250ms 定时器可能被后台节流推迟）
    const node = findNode(ev.target.closest(".node")?.dataset.id);
    if (node) {
      window.clearTimeout(textVariableStripSyncTimer);
      syncTextNodeVariableStrip(node);
    }
  }
  const isNodeTextEditor = ev.target.dataset?.role === "text" || ev.target.dataset?.role === "chat-text";
  if (!isNodeTextEditor || !pendingNodeRenderAfterTextEdit) return;
  // 焦点仍移向画布节点内部的控件(按钮/下拉等)时不立即强制重建:
  // 否则按钮元素会在命中与派发之间被整体替换,吞掉这次点击(见已知问题"异步全量重渲染吞掉节点按钮的第一次点击"),
  // 挂起的渲染留待下一次 render() 自然处理
  if (ev.relatedTarget && els.nodes.contains(ev.relatedTarget)) return;
  window.queueMicrotask(() => {
    if (!activeNodeTextEditor() && pendingNodeRenderAfterTextEdit) {
      renderNodes({ force: true });
      renderEdges();
      renderMinimap();
    }
  });
});

els.nodes.addEventListener("focusout", ev => {
  if (!ev.target.matches?.(".node select")) return;
  releaseNodeSelectLock(ev.target);
});

els.nodes.addEventListener("change", async ev => {
  const nodeEl = ev.target.closest(".node");
  const node = nodeEl ? findNode(nodeEl.dataset.id) : null;
  const role = ev.target.dataset.role;
  if (ev.target.matches?.(".node select")) releaseNodeSelectLock(ev.target);
  if (role === "text") pushHistory();
  if (!node) return;
  // 本地 SD 节点的功能/工作流/Seed/降噪下拉(否则修改不会写回节点，见 local-sd.js handleChange)
  if (window.LocalSD?.handleChange(node, role, ev.target)) return;
  if (node.type === "variable") {
    const rowElement = ev.target.closest(".variable-node-row");
    const row = node.variableRows?.find(item => item.id === rowElement?.dataset.rowId);
    if (!row) return;
    if (role === "variable-definition") {
      const definition = variableDefinitionById(ev.target.value);
      row.definitionId = definition?.id || "";
      row.variableNameSnapshot = definition?.name || "";
      row.optionId = "";
      row.valueLabelSnapshot = "";
    } else if (role === "variable-option") {
      const definition = variableDefinitionById(row.definitionId);
      const option = definition?.options.find(item => item.id === ev.target.value);
      row.optionId = option?.id || "";
      row.valueLabelSnapshot = option?.label || "";
      row.variableNameSnapshot = definition?.name || row.variableNameSnapshot;
    } else return;
    pushHistory(); render();
    return;
  }
  if (role === "text-variable-choice" && node.type === "text") {
    const definition = variableDefinitionByName(ev.target.dataset.varName);
    const option = definition?.options.find(item => item.id === ev.target.value) || null;
    node.variableChoices = node.variableChoices || {};
    if (definition && option) node.variableChoices[definition.name] = { optionId: option.id, label: option.label };
    else delete node.variableChoices[definition?.name || ev.target.dataset.varName];
    pushHistory(); render();
    return;
  }
  if (node.type === "screenshot-input") {
    if (role === "screenshot-model") {
      node._model = ev.target.value;
      if (isImage25StandardModel(node._model)) node._resolution = "1k";
    }
    else if (role === "screenshot-resolution") node._resolution = ev.target.value;
    else if (role === "screenshot-quality") node._quality = ev.target.value;
    else if (role === "screenshot-size") node._size = ev.target.value;
    else if (role === "screenshot-count") node._count = Math.max(1, Math.min(4, Number(ev.target.value) || 1));
    else return;
    pushHistory(); render();
    return;
  }
  if (node.type === "angle-image") {
    if (role === "angle-resolution") node._resolution = ev.target.value;
    else if (role === "angle-size") node._size = ev.target.value;
    else return;
    pushHistory();
    return;
  }
  if (node.type === "chat") {
    if (role === "chat-model") {
      await changeChatNodeModel(node, ev.target.value);
      return;
    }
    if (role === "chat-enumerate-toggle") {
      // 批量提示词开关:只落盘不渲染(checkbox 自身持态),下次回车发送即生效
      node._chatEnumerated = ev.target.checked;
      saveActiveChatSession(node, true);
      markDirty();
      return;
    }
    return;
  }
  if (node.type === "browser-image") {
    if (role === "browser-new-conversation") { node._browserNewConversation = ev.target.checked; pushHistory(); return; }
    if (role === "browser-site") {
      node._browserSite = ev.target.value;
      pushHistory(); render();
    }
    return;
  }
  if (node.type === "tool-node") {
    if (role === "tool-param") {
      node.toolValues = node.toolValues || {};
      node.toolValues[ev.target.dataset.key] = ev.target.dataset.paramType === "toggle" ? ev.target.checked : ev.target.value;
      pushHistory();
      if (isLinkedUpscaleNode(node) && ev.target.dataset.key === "whitePoint") renderNodes();
      return;
    }
    return;
  }
  if (node.type === "ai-video") {
    if (role === "video-model") {
      node._model = ev.target.value;
      normalizeVideoNode(node);
      refreshAiVideoPrompt(node.id);
      pushHistory(); render();
    } else if (role === "video-resolution") {
      node._videoResolution = ev.target.value; pushHistory();
    } else if (role === "video-ratio") {
      node._videoRatio = ev.target.value; pushHistory();
    } else if (role === "video-duration") {
      node._videoDuration = Number(ev.target.value) || 5; pushHistory();
    } else if (role === "video-audio") {
      node._videoAudio = ev.target.checked; pushHistory();
    }
    return;
  }
  if (node.type !== "ai-image") return;
  if (role === "ai-model") {
    node._model = ev.target.value;
    if (isImage25StandardModel(node._model)) node._resolution = "1k";
    if (modelSupportsQuality(node._model)) {
      node._quality = node._quality || "medium";
    } else {
      node._quality = null;
    }
    pushHistory(); render();
  } else if (role === "ai-resolution") {
    node._resolution = ev.target.value; pushHistory();
  } else if (role === "ai-quality") {
    node._quality = ev.target.value; pushHistory();
  } else if (role === "ai-size") {
    node._size = ev.target.value; pushHistory();
  } else if (role === "ai-count") {
    node._count = Math.max(1, Math.min(4, Number(ev.target.value) || 1)); pushHistory();
  } else if (role === "ai-mj-version") {
    node._mjVersion = ev.target.value; pushHistory();
  } else if (role === "ai-mj-speed") {
    node._mjSpeed = ev.target.value; pushHistory();
  }
  if (["ai-resolution", "ai-quality", "ai-size", "ai-count", "ai-mj-speed"].includes(role)) {
    const pricingElement = ev.target.closest(".node")?.querySelector(".ai-model-pricing");
    const entry = modelCatalogEntry(node._model);
    if (pricingElement && entry) pricingElement.outerHTML = imageModelPricingHtml(entry, node);
  }
});

async function changeChatNodeModel(node, nextModel) {
  if (!node || node.type !== "chat" || !nextModel || nextModel === node._chatModel) return;
  const previous = chatModelEntry(node._chatModel);
  const next = chatModelEntry(nextModel);
  const hasHistory = Boolean(node.chatMessages?.length);
  if (hasHistory && previous?.apiType && next?.apiType && previous.apiType !== next.apiType) {
    const keepHistory = await showCanvasDialog({ title: "切换对话站点", message: "继续当前对话会把已有聊天历史发送给新站点。你也可以新建一份空对话。", confirmText: "当前对话继续", cancelText: "新建对话" });
    if (!keepHistory) {
      saveActiveChatSession(node, true);
      const session = createChatSession(node, { title: `对话 ${node.chatSessions.length + 1}`, model: nextModel });
      node.chatSessions.push(session);
      loadChatSession(node, session.id);
      pushHistory(); syncChatNodeBody(node);
      return;
    }
  }
  node._chatModel = nextModel;
  node._chatError = "";
  saveActiveChatSession(node, true);
  pushHistory(); render();
}

// 对话节点动作分发:画布节点点击与对话工作区点击共用（工作区不在 .node 内,紧凑卡上也没有这些控件,不能走中继点击）
async function handleChatNodeAction(node, actionRole, action) {
  if (!node || node.type !== "chat") return;
  if (actionRole === "chat-session-history") {
    node._chatHistoryOpen = !node._chatHistoryOpen;
    syncChatNodeBody(node);
    return;
  }
  if (actionRole === "chat-session-add") {
    if (node._chatBusy) return toast("请等当前回复完成后再新建对话");
    saveActiveChatSession(node, true);
    const session = createChatSession(node, { title: `对话 ${node.chatSessions.length + 1}` });
    node.chatSessions.push(session);
    loadChatSession(node, session.id);
    pushHistory(); syncChatNodeBody(node);
    return;
  }
  if (actionRole === "chat-session-open") {
    if (node._chatBusy) return toast("请等当前回复完成后再切换对话");
    if (action.dataset.sessionId === node.activeChatSessionId) return;
    saveActiveChatSession(node, true);
    if (loadChatSession(node, action.dataset.sessionId)) { pushHistory(); syncChatNodeBody(node); }
    return;
  }
  if (actionRole === "chat-session-close") {
    if (node._chatBusy && action.dataset.sessionId === node.activeChatSessionId) return toast("请先停止或等待当前回复完成");
    saveActiveChatSession(node, true);
    const session = node.chatSessions.find(item => item.id === action.dataset.sessionId);
    if (!session) return;
    session.closed = true;
    let next = node.chatSessions.find(item => !item.closed && item.id !== session.id);
    if (!next) { next = createChatSession(node, { title: `对话 ${node.chatSessions.length + 1}` }); node.chatSessions.push(next); }
    if (session.id === node.activeChatSessionId) loadChatSession(node, next.id);
    pushHistory(); syncChatNodeBody(node);
    return;
  }
  if (actionRole === "chat-session-rename") {
    const session = node.chatSessions.find(item => item.id === action.dataset.sessionId);
    const host = action.closest(".chat-history-item, .chat-session-tab");
    if (!session || !host || host.querySelector(".chat-session-rename-input")) return;
    const input = document.createElement("input");
    input.className = "chat-session-rename-input";
    input.value = session.title;
    input.setAttribute("aria-label", "对话名称");
    const target = host.querySelector("strong") || host.querySelector('[data-role="chat-session-open"]');
    target.replaceWith(input);
    let finished = false;
    const finish = save => {
      if (finished) return;
      finished = true;
      const value = input.value.trim();
      if (save && value) { session.title = value; session.updatedAt = Date.now(); pushHistory(); }
      else if (save && !value) toast("对话名称不能为空");
      syncChatNodeBody(node);
    };
    input.addEventListener("keydown", event => { if (event.key === "Enter") finish(true); if (event.key === "Escape") finish(false); });
    input.addEventListener("blur", () => finish(Boolean(input.value.trim())), { once: true });
    input.focus(); input.select();
    return;
  }
  if (actionRole === "chat-session-delete") {
    const session = node.chatSessions.find(item => item.id === action.dataset.sessionId);
    if (!session) return;
    if (node._chatBusy && session.id === node.activeChatSessionId) return toast("请先停止或等待当前回复完成");
    const confirmed = await showCanvasDialog({ title: "删除对话", message: `将永久删除“${session.title}”及其聊天记录。`, confirmText: "删除", cancelText: "取消" });
    if (!confirmed) return;
    node.chatSessions = node.chatSessions.filter(item => item.id !== session.id);
    let next = node.chatSessions.find(item => !item.closed);
    if (!next) { next = createChatSession(node, { title: "新对话" }); node.chatSessions.push(next); }
    if (session.id === node.activeChatSessionId) loadChatSession(node, next.id);
    pushHistory(); syncChatNodeBody(node);
    return;
  }
  if (actionRole === "chat-attachment-add") uploadChatAttachments(node);
  if (actionRole === "chat-attachment-remove") {
    normalizeChatNode(node);
    node.chatAttachments = node.chatAttachments.filter(item => item.id !== action.dataset.attachmentId);
    node._chatError = "";
    saveActiveChatSession(node, true);
    pushHistory();
    syncChatNodeBody(node);
  }
  if (actionRole === "chat-attachment-clear") {
    node.chatAttachments = [];
    node._chatError = "";
    saveActiveChatSession(node, true);
    pushHistory();
    syncChatNodeBody(node);
  }
  if (actionRole === "chat-send") sendChatNodeMessage(node.id);
  if (actionRole === "chat-expand") openChatWorkspace(node.id);
  if (actionRole === "chat-html-open") openChatHtmlPreview(node, Number(action.dataset.messageIndex));
  if (actionRole === "chat-html-code") openChatHtmlPreview(node, Number(action.dataset.messageIndex), "code");
  if (actionRole === "chat-html-save") {
    const html = extractHtmlDocument(node.chatMessages?.[Number(action.dataset.messageIndex)]?.content);
    if (!saveChatHtmlFile(html)) toast("没有识别到完整 HTML 文档");
  }
  if (actionRole === "chat-html-edit") openChatHtmlEditor(node, Number(action.dataset.messageIndex));
  if (actionRole === "chat-message-copy") {
    const message = node.chatMessages?.[Number(action.dataset.messageIndex)];
    if (message && await copyTextValue(message.content)) toast("已复制消息");
  }
  if (actionRole === "chat-message-retry") {
    sendChatNodeMessage(node.id, { retryAssistantIndex: Number(action.dataset.messageIndex) });
  }
  if (actionRole === "chat-message-split" && node.type === "chat") {
    const message = node.chatMessages?.[Number(action.dataset.messageIndex)];
    const items = message?.role === "assistant" ? parseNumberedChatItems(message.content) : null;
    if (!items) toast("这条回复没有至少两项 a. b. 编号内容");
    else {
      createChatPromptTextNodes(node, items);
      pushHistory();
      toast(`已拆分为 ${items.length} 个文字节点`);
    }
  }
  if (actionRole === "chat-stop" && node._chatBusy) {
    // 桌面桥无法中断进行中的请求:立即回到可输入状态,迟到的结果由请求序列号丢弃
    node._chatCancelled = true;
    node._chatAbort?.abort();
    node._chatBusy = false;
    node._chatError = "已停止生成";
    syncChatNodeBody(node);
  }
  if (actionRole === "chat-clear") {
    const confirmed = await showCanvasDialog({ title: "清空当前对话", message: "将删除当前对话的全部消息和待发图片，保留对话名称与模型。", confirmText: "清空", cancelText: "取消" });
    if (confirmed) {
      node.chatMessages = [];
      node.chatText = "";
      node.chatAttachments = [];
      node._chatError = "";
      saveActiveChatSession(node, true);
      pushHistory(); render();
    }
  }
}

els.nodes.addEventListener("click", async ev => {
  const nodeEl = ev.target.closest(".node");
  if (!nodeEl) return;
  const node = findNode(nodeEl.dataset.id);
  const action = ev.target.closest("[data-role]");
  const actionRole = action?.dataset.role;
  if (node && window.LocalSD?.handleClick(node, actionRole)) return;
  if (actionRole === "open-source-page") {
    const sourceUrl = String(node.sourceUrl || "");
    if (/^https?:\/\//i.test(sourceUrl)) window.open(sourceUrl, "_blank", "noopener,noreferrer");
    else toast("来源网页地址无效");
    return;
  }
  if (ev.target.dataset.role === "upload") { uploadImage(node); delete node._assetIssue; }
  if (actionRole === "reverse-image-keywords" && node.type === "image") reverseImageKeywords(node);
  if (ev.target.dataset.role === "upload-group") uploadGroupImages(node);
  if (ev.target.dataset.role === "ai-generate") generateAiImage(node.id);
  if (ev.target.dataset.role === "ai-video-generate" && node.type === "ai-video") generateAiVideo(node.id);
  if (actionRole === "video-clear" && node.type === "ai-video") {
    node.videoFile = "";
    node.generationPrompt = "";
    delete node._pendingVideoUrl;
    pushHistory(); render();
  }
  if (actionRole === "video-redownload" && node.type === "ai-video") redownloadVideoResult(node.id);
  if (actionRole === "ai-redownload") redownloadAiResults(node.id);
  if (ev.target.dataset.role === "angle-edit") openAngleEditor(node.id);
  if (ev.target.dataset.role === "angle-generate") generateAngleImage(node.id);
  if (actionRole === "tool-run") runToolNode(node.id);
  // PR-5 图片批注编辑层
  if (actionRole === "annotation-done") exitImageAnnotationEditor();
  if (actionRole === "annotation-delete") deleteNodeAnnotation(node, action.dataset.annotationId);
  if (actionRole === "annotation-save") saveAnnotationContent(node, action.dataset.annotationId, nodeEl.querySelector('[data-role="annotation-content"]')?.value);
  if (actionRole === "annotation-pin" && node && state.annotationEditorNodeId === node.id && !ev.target.closest("[data-role='annotation-delete'],[data-role='annotation-content'],[data-role='annotation-save']")) {
    node._annotationEditingId = action.dataset.annotationId;
    render();
  }
  if (actionRole === "browser-generate" && node.type === "browser-image") generateBrowserImage(node.id);
  if (actionRole === "browser-cancel" && node.type === "browser-image" && node.generating) {
    if (node._browserTaskId) apiFetch("/api/browser-task/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: node._browserTaskId }) }).catch(() => {});
    for (const task of aiTaskQueue.items) if (task.kind === "browser" && task.nodeId === node.id && !queueTaskIsSettled(task)) task.status = "cancelled";
    renderTaskQueue();
    node.generating = false;
    node._browserTaskId = null;
    node._browserStatus = "";
    node._browserError = "已取消等待（站点页面可能仍在生成）";
    render();
  }
  if (actionRole === "browser-clear" && node.type === "browser-image") {
    node.generatedImage = null;
    delete node.generatedAssetId;
    pushHistory(); render();
  }
  if (node && node.type === "chat") await handleChatNodeAction(node, actionRole, action);
  if (actionRole === "variable-add-row") {
    normalizeVariableNode(node);
    node.variableRows.push({ id: uid("vrow"), definitionId: "", optionId: "", variableNameSnapshot: "", valueLabelSnapshot: "" });
    pushHistory(); render();
  }
  if (actionRole === "variable-remove-row") {
    normalizeVariableNode(node);
    const rowId = action.closest(".variable-node-row")?.dataset.rowId;
    node.variableRows = node.variableRows.filter(row => row.id !== rowId);
    if (!node.variableRows.length) node.variableRows.push({ id: uid("vrow"), definitionId: "", optionId: "", variableNameSnapshot: "", valueLabelSnapshot: "" });
    pushHistory(); render();
  }
  if (actionRole === "prompt-optimize" && node.type === "text") {
    if (typeof node._promptOriginalText === "string") {
      const restored = restorePromptOptimizedText(node.id);
      if (restored.ok) { render(); toast(restored.message); }
      return;
    }
    openPromptOptimizer(node.id);
    return;
  }
  if (actionRole === "text-inline-edit" && node.type === "text") {
    nodeEl.classList.add("is-text-editing");
    const editor = nodeEl.querySelector('textarea[data-role="text"]');
    editor?.focus();
    editor?.setSelectionRange(editor.value.length, editor.value.length);
    return;
  }
  if (actionRole === "text-variable-toggle" && node.type === "text") {
    const definition = variableDefinitionByName(action.dataset.varName);
    if (definition) {
      node.variableChoices = node.variableChoices || {};
      const entry = node.variableChoices[definition.name];
      const isOn = entry ? entry.enabled !== false : true;
      node.variableChoices[definition.name] = { ...(entry || {}), enabled: !isOn };
      pushHistory(); render();
    }
  }
  if (ev.target.dataset.role === "clear-image") {
    node.outputPath = "";
    delete node._assetIssue;
    if (node.type === "ai-image" || node.type === "angle-image") {
      node.generatedImage = null;
      delete node.generatedAssetId;
      node.taskId = null;
      delete node._pendingResults;
    } else {
      node.image = null;
      delete node.generationPrompt;
      delete node.imageAssetId;
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

els.nodes.addEventListener("load", ev => {
  const imageElement = ev.target.closest?.(".node.image .image-preview img, .node.ai-image .image-preview img");
  if (!imageElement) return;
  const nodeElement = imageElement.closest(".node");
  const node = nodeElement ? findNode(nodeElement.dataset.id) : null;
  if (!fitImageNodeToNaturalSize(node, imageElement)) return;
  render();
  saveCurrentPage();
  persistPages();
}, true);

els.nodes.addEventListener("dblclick", async ev => {
  const promptEl = ev.target.closest('[data-role="angle-prompt"]');
  if (promptEl) {
    ev.preventDefault();
    ev.stopPropagation();
    promptEl.dataset.originalText = promptEl.textContent;
    promptEl.contentEditable = "true";
    promptEl.classList.add("is-editing");
    promptEl.focus();
    const range = document.createRange();
    range.selectNodeContents(promptEl);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }
  if (ev.target.closest(".image-preview") || ev.target.closest(".ai-preview") || ev.target.closest(".group-preview")) {
    ev.preventDefault();
    ev.stopPropagation();
    const nodeEl = ev.target.closest(".node");
    if (!nodeEl) return;
    const node = findNode(nodeEl.dataset.id);
    if (!node) return;
    if (state.settings.editOnOverlap === false && nodeImageReference(node) && imageNodeOverlapsOthers(node)) return;
    if ((node.type === "group" || node.type === "folder") && node.images && node.images.length) {
      await showNodeLightbox(node);
    } else if (node.type === "group" && node.items) {
      await showNodeLightbox(node);
    } else {
      await showNodeLightbox(node);
      if (!els.lightbox.classList.contains("hidden") && lightboxImages.length === 1 && lightboxSourceNodeId) {
        await startLightboxPaint();
      }
    }
  }
});

els.nodes.addEventListener("focusout", ev => {
  const promptEl = ev.target.closest?.('[data-role="angle-prompt"][contenteditable="true"]');
  if (!promptEl) return;
  const nodeEl = promptEl.closest(".node");
  const node = nodeEl ? findNode(nodeEl.dataset.id) : null;
  if (node?.type === "angle-image") {
    node.anglePromptCustom = promptEl.textContent.trim();
    node.prompt = resolvedAnglePrompt(node);
    console.log("[角度变化] 关键词已编辑", { nodeId: node.id, length: node.prompt.length });
    pushHistory();
  }
  promptEl.contentEditable = "false";
  promptEl.classList.remove("is-editing");
  render();
});

els.nodes.addEventListener("keydown", ev => {
  const promptEl = ev.target.closest?.('[data-role="angle-prompt"][contenteditable="true"]');
  if (!promptEl) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    promptEl.textContent = promptEl.dataset.originalText || "";
    promptEl.blur();
  } else if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
    ev.preventDefault();
    promptEl.blur();
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
    delete node.generationPrompt;
    delete node.generatedAssetId;
    delete node.generatedImage;
    delete node.imageAssetId;
    node.fileName = file.name;
    node.mime = file.type || "image/png";
    await externalizeImageField(node, "image", "imageAssetId", node.fileName);
    pushHistory();
    render();
  };
  input.click();
}

async function uploadChatAttachments(node) {
  if (!node || node.type !== "chat" || node._chatBusy) return;
  normalizeChatNode(node);
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/gif,image/webp";
  input.multiple = true;
  input.onchange = async () => {
    const files = Array.from(input.files || []).filter(isSupportedImageFile);
    if (!files.length) return;
    const remaining = CHAT_MAX_REFERENCE_IMAGES - node.chatAttachments.length;
    const selected = files.slice(0, Math.max(0, remaining));
    let storageFailures = 0;
    for (const file of selected) {
      const attachment = {
        id: uid("chat-image"),
        image: await fileToDataUrl(file),
        assetId: "",
        fileName: file.name,
        mime: file.type || "image/png",
      };
      try {
        await externalizeImageField(attachment, "image", "assetId", attachment.fileName);
      } catch (error) {
        storageFailures += 1;
        console.warn("[对话附件] 原图保存失败，暂以内嵌图片保留", { fileName: file.name, message: error.message });
      }
      node.chatAttachments.push(attachment);
    }
    node._chatError = "";
    saveActiveChatSession(node, true);
    pushHistory();
    syncChatNodeBody(node);
    if (files.length > selected.length) toast(`最多保留 ${CHAT_MAX_REFERENCE_IMAGES} 张对话附件`);
    else if (storageFailures) toast(`已添加 ${selected.length} 张图片，其中 ${storageFailures} 张暂以内嵌方式保存`);
    else toast(`已添加 ${selected.length} 张对话图片`);
  };
  input.click();
}

async function uploadGroupImages(node) {
  if (node.type !== "group" && node.type !== "folder") return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/gif,image/webp";
  input.multiple = true;
  input.onchange = async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    if (!node.images) node.images = [];
    for (const file of files) {
      const image = {
        image: await fileToDataUrl(file),
        fileName: file.name,
        mime: file.type || "image/png",
        name: file.name.replace(/\.[^.]+$/, ""),
      };
      await externalizeImageField(image, "image", "assetId", image.fileName);
      node.images.push(image);
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

function fitImageNodeToNaturalSize(node, imageElement) {
  if (!node || (node.type !== "image" && node.type !== "ai-image")) return false;
  const naturalWidth = Number(imageElement?.naturalWidth) || 0;
  const naturalHeight = Number(imageElement?.naturalHeight) || 0;
  if (!naturalWidth || !naturalHeight) return false;
  const ratio = naturalWidth / naturalHeight;
  if (Math.abs((Number(node._previewAspect) || 0) - ratio) < .001) return false;
  node._previewAspect = ratio;
  console.log("[节点预览] 已读取原图比例", { nodeId: node.id, nodeType: node.type, naturalWidth, naturalHeight, ratio });
  return true;
}

let lightboxImages = [];
let lightboxIdx = 0;
let lightboxSourceNodeId = "";
let lightboxPainting = false;
let lightboxViewZoom = 1;
let lightboxViewOffset = { x: 0, y: 0 };
let lightboxViewDrag = null;
let lightboxDrawing = false;
let lightboxPaintMode = "idle";
const lightboxPaintSizes = { brush: 36, "color-brush": 36, eraser: 36, arrow: 4, rect: 4 };
const lightboxPaintSizeRanges = {
  "color-brush": { min: 4, max: 160 },
  brush: { min: 4, max: 120 }, eraser: { min: 4, max: 120 },
  arrow: { min: 1, max: 16 }, rect: { min: 1, max: 16 }
};

function adjustRangeByBracketKey(event, input) {
  const direction = event.code === "BracketLeft" || event.key === "[" ? -1
    : event.code === "BracketRight" || event.key === "]" ? 1 : 0;
  const target = event.target;
  const isTextEditing = target && target !== input && (target.matches?.("textarea, input:not([type=range]):not([type=color])") || target.isContentEditable);
  if (!direction || isTextEditing || event.ctrlKey || event.altKey || event.metaKey || event.isComposing || !input || input.disabled) return false;
  const min = Number(input.min);
  const max = Number(input.max);
  const step = Number(input.step) || 1;
  const next = Math.max(Number.isFinite(min) ? min : -Infinity, Math.min(Number.isFinite(max) ? max : Infinity, Number(input.value) + direction * step));
  if (next !== Number(input.value)) {
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  event.preventDefault();
  return true;
}

function canvasGroupFramesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function separateCanvasGroupFromOthers(groupId) {
  const members = canvasGroupMembers(groupId);
  if (members.length < 2) return;
  let bounds = canvasGroupBounds(members);
  for (let attempt = 0; attempt < 100; attempt++) {
    const otherIds = [...new Set(state.nodes.map(node => node.canvasGroupId).filter(id => id && id !== groupId))];
    const hit = otherIds.map(id => canvasGroupBounds(canvasGroupMembers(id))).find(other => canvasGroupFramesOverlap(bounds, other));
    if (!hit) return;
    const dx = snap(hit.x + hit.w + CANVAS_GROUP_PAD_X - bounds.x);
    for (const node of members) node.x += dx;
    bounds = canvasGroupBounds(members);
  }
}

function canvasGroupExecutionPlan(groupId) {
  const members = canvasGroupMembers(groupId);
  const ids = new Set(members.map(node => node.id));
  const incoming = new Map(members.map(node => [node.id, 0]));
  const outgoing = new Map(members.map(node => [node.id, []]));
  for (const edge of state.edges) if (ids.has(edge.from.node) && ids.has(edge.to.node)) {
    incoming.set(edge.to.node, incoming.get(edge.to.node) + 1);
    outgoing.get(edge.from.node).push(edge.to.node);
  }
  const byPosition = (a, b) => a.x - b.x || a.y - b.y;
  const ready = members.filter(node => incoming.get(node.id) === 0).sort(byPosition);
  const ordered = [];
  while (ready.length) {
    const node = ready.shift(); ordered.push(node);
    for (const id of outgoing.get(node.id)) {
      incoming.set(id, incoming.get(id) - 1);
      if (incoming.get(id) === 0) ready.push(findNode(id));
    }
    ready.sort(byPosition);
  }
  if (ordered.length !== members.length) throw new Error("编组内存在循环连线，请先断开循环后再运行");
  return { ordered: ordered.filter(node => CANVAS_GROUP_RUNNABLE_TYPES.has(node.type) && !node.disabled), outgoing };
}

function waitForGroupQueueTasks(node, run, tasks) {
  return new Promise(resolve => {
    const timer = window.setInterval(() => {
      if (run.stopped) for (const task of tasks) if (task.status === "waiting") task.status = "cancelled";
      if (tasks.length && tasks.every(queueTaskIsSettled)) {
        clearInterval(timer);
        resolve(tasks.every(task => task.status === "done"));
      }
    }, 150);
  });
}

async function runCanvasGroupNode(node, run) {
  if (run.stopped) return false;
  run.activeNodeId = node.id;
  renderNodes();
  if (node.type === "ai-image") {
    node.generatedImage = null; delete node.generatedAssetId; node.outputPath = "";
    const queueStart = aiTaskQueue.items.length;
    if (!enqueueAiNode(node.id, "node-preview")) return false;
    const tasks = aiTaskQueue.items.slice(queueStart);
    tasks.forEach(task => task.groupRunId = run.id);
    const completed = await waitForGroupQueueTasks(node, run, tasks);
    const liveNodes = tasks.map(task => findNode(task.nodeId)).filter(Boolean);
    return completed && liveNodes.every(item => item.generatedImage || state.nodes.some(result => result.type === "image" && result.aiSourceNodeId === item.id && tasks.some(task => task.nodeId === item.id && task.status === "done")));
  }
  if (node.type === "ai-video") {
    const queueStart = aiTaskQueue.items.length;
    if (!enqueueVideoNode(node.id)) return false;
    const tasks = aiTaskQueue.items.slice(queueStart);
    tasks.forEach(task => task.groupRunId = run.id);
    return await waitForGroupQueueTasks(node, run, tasks);
  }
  if (node.type === "browser-image") { node.generatedImage = null; await generateBrowserImage(node.id); return !run.stopped && !!node.generatedImage; }
  if (node.type === "chat") { await sendChatNodeMessage(node.id); return !run.stopped && !node._chatError; }
  if (node.type === "angle-image") { node.generatedImage = null; await generateAngleImage(node.id); return !run.stopped && node._aiProgress?.status === "done"; }
  if (node.type === "tool-node") { await runToolNode(node.id); return !run.stopped && node.toolStatus?.state === "done"; }
  if (node.type === "local-sd") { await window.LocalSD?.generate?.(node.id); return !run.stopped && !node._sdError; }
  return true;
}

async function runCanvasGroup(groupId) {
  if (canvasGroupRuns.has(groupId)) return;
  let plan;
  try { plan = canvasGroupExecutionPlan(groupId); }
  catch (error) { return toast(error.message); }
  if (!plan.ordered.length) return toast("该编组没有可执行节点");
  const run = { id: `group-run-${Date.now()}`, groupId, stopped: false, activeNodeId: "", failed: new Set() };
  canvasGroupRuns.set(groupId, run); renderNodes();
  try {
    for (const node of plan.ordered) {
      if (run.stopped) break;
      const blocked = state.edges.some(edge => edge.to.node === node.id && run.failed.has(edge.from.node));
      if (blocked) { run.failed.add(node.id); continue; }
      if (!await runCanvasGroupNode(node, run)) run.failed.add(node.id);
    }
    toast(run.stopped ? "已停止编组运行，未发送任务已截断" : run.failed.size ? `编组运行完成，${run.failed.size} 个节点失败或被跳过` : "编组运行完成");
  } finally {
    canvasGroupRuns.delete(groupId); renderNodes();
  }
}

function stopCanvasGroup(groupId) {
  const run = canvasGroupRuns.get(groupId);
  if (!run) return;
  run.stopped = true;
  const node = findNode(run.activeNodeId);
  if (node?._chatBusy) { node._chatCancelled = true; node._chatAbort?.abort(); }
  if (node?.type === "browser-image") { node._browserRequestId = `stopped-${Date.now()}`; node.generating = false; }
  if (node?.type === "local-sd") window.LocalSD?.cancel?.(node);
  for (const task of aiTaskQueue.items) if (task.groupRunId === run.id && task.status === "waiting") task.status = "cancelled";
  renderTaskQueue(); renderNodes();
}
let lightboxEraserRingPoint = null;
let lightboxPaintActions = [];
let lightboxPaintCurrentAction = null;
const lightboxPaintOverlay = document.createElement("canvas");
let lightboxBaseFlipX = false;
let lightboxBaseFlipY = false;
let lightboxPlacedImage = null;
let lightboxPlacedSelected = false;
let lightboxTransformDrag = null;
let lightboxEditUndoStack = [];
// 填色：独立于画笔动作的填充层列表，始终渲染在底图/置入图之上、画笔描边之下
let lightboxFillActions = [];
let lightboxLastFill = null;
let lightboxFillReapplyTimer = 0;
const lightboxFillSettings = { sketchTolerance: 5, lineWidth: 3, keepLines: true };
// 硬线余量（百分点）：色差超过 容差+余量 的像素始终阻挡填色；实测草图轮廓≈75–85%、排线≈45–57%、辅助线≈30%
let lightboxEditBase = null;
let lightboxCropRect = null;
let lightboxCropDrag = null;
const lightboxCropBtn = $("lightboxCropBtn");
const lightboxCropApply = $("lightboxCropApply");


function clearLightboxCrop() {
  lightboxCropRect = null;
  lightboxCropDrag = null;
  lightboxCropApply.disabled = true;
}

function updateLightboxCrop(point) {
  const canvas = els.lightboxPaintCanvas;
  const end = { x: Math.max(0, Math.min(canvas.width, point.x)), y: Math.max(0, Math.min(canvas.height, point.y)) };
  const start = lightboxCropDrag;
  const x = Math.floor(Math.min(start.x, end.x));
  const y = Math.floor(Math.min(start.y, end.y));
  lightboxCropRect = { x, y, w: Math.ceil(Math.max(start.x, end.x)) - x, h: Math.ceil(Math.max(start.y, end.y)) - y };
  lightboxCropApply.disabled = lightboxCropRect.w < 2 || lightboxCropRect.h < 2;
  renderLightboxPaintComposite();
}

function drawLightboxCropSelection(context) {
  if (lightboxPaintMode !== "crop" || !lightboxCropRect) return;
  const { x, y, w, h } = lightboxCropRect;
  const canvas = els.lightboxPaintCanvas;
  const tokens = getComputedStyle(canvas);
  context.save();
  context.fillStyle = tokens.getPropertyValue("--text").trim();
  context.globalAlpha = .6;
  context.fillRect(0, 0, canvas.width, y);
  context.fillRect(0, y + h, canvas.width, canvas.height - y - h);
  context.fillRect(0, y, x, h);
  context.fillRect(x + w, y, canvas.width - x - w, h);
  context.globalAlpha = 1;
  context.strokeStyle = tokens.getPropertyValue("--primary").trim();
  context.lineWidth = 2 * canvas.width / canvas.getBoundingClientRect().width;
  context.strokeRect(x, y, w, h);
  context.restore();
}

function applyLightboxCrop() {
  if (!lightboxPainting || lightboxCropApply.disabled || !lightboxCropRect) return;
  const canvas = els.lightboxPaintCanvas;
  const rect = { ...lightboxCropRect };
  const previous = { base: lightboxEditBase, width: canvas.width, height: canvas.height, actions: lightboxPaintActions, fills: lightboxFillActions, placed: cloneLightboxPlacedImage(), selected: lightboxPlacedSelected, flipX: lightboxBaseFlipX, flipY: lightboxBaseFlipY };
  clearLightboxCrop();
  lightboxPlacedSelected = false;
  renderLightboxPaintComposite();
  const cropped = document.createElement("canvas");
  cropped.width = rect.w;
  cropped.height = rect.h;
  cropped.getContext("2d").drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  lightboxEditBase = cropped;
  canvas.width = rect.w;
  canvas.height = rect.h;
  lightboxPaintOverlay.width = rect.w;
  lightboxPaintOverlay.height = rect.h;
  lightboxPaintActions = [];
  lightboxFillActions = [];
  markLightboxFillLayerDirty();
  lightboxPlacedImage = null;
  lightboxBaseFlipX = false;
  lightboxBaseFlipY = false;
  pushLightboxEditUndo(() => {
    clearLightboxCrop();
    lightboxEditBase = previous.base;
    canvas.width = previous.width;
    canvas.height = previous.height;
    lightboxPaintOverlay.width = previous.width;
    lightboxPaintOverlay.height = previous.height;
    lightboxPaintActions = previous.actions;
    lightboxFillActions = previous.fills;
    markLightboxFillLayerDirty();
    lightboxPlacedImage = previous.placed;
    lightboxPlacedSelected = previous.selected;
    lightboxBaseFlipX = previous.flipX;
    lightboxBaseFlipY = previous.flipY;
    updateLightboxPaintDisplaySize();
  });
  updateLightboxPaintDisplaySize();
  setLightboxPaintMode("crop");
  rebuildLightboxPaintOverlay();
}

lightboxCropBtn.onclick = () => { setLightboxPaintMode("crop"); toast("拖框选择保留区域，再点击应用裁剪"); };
lightboxCropApply.onclick = applyLightboxCrop;

function showLightbox(src, sourceNodeId = "") {
  els.lightboxImg.classList.remove("hidden");
  if (Array.isArray(src)) {
    lightboxImages = src;
    lightboxIdx = 0;
  } else {
    lightboxImages = [src];
    lightboxIdx = 0;
  }
  lightboxSourceNodeId = sourceNodeId;
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

async function startLightboxPaint() {
  if (!lightboxSourceNodeId) return;
  const sourceUrl = lightboxImages[lightboxIdx];
  if (!sourceUrl) return;
  const sourceImage = new Image();
  sourceImage.src = sourceUrl;
  await sourceImage.decode();
  if (!sourceImage.naturalWidth || sourceUrl !== lightboxImages[lightboxIdx]) return;
  lightboxViewZoom = 1;
  lightboxViewOffset = { x: 0, y: 0 };
  lightboxEditBase = null;
  clearLightboxCrop();
  const canvas = els.lightboxPaintCanvas;
  canvas.width = sourceImage.naturalWidth;
  canvas.height = sourceImage.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
  $("lightboxFillMode").value = detectLightboxDefaultFillModeFromImage(sourceImage);
  lightboxPaintOverlay.width = canvas.width;
  lightboxPaintOverlay.height = canvas.height;
  lightboxPaintActions = [];
  lightboxPaintCurrentAction = null;
  lightboxBaseFlipX = false;
  lightboxBaseFlipY = false;
  lightboxPlacedImage = null;
  lightboxPlacedSelected = false;
  lightboxTransformDrag = null;
  lightboxEditUndoStack = [];
  resetLightboxFillState();
  setLightboxPaintMode("idle");
  updateLightboxPaintUndo();
  lightboxPainting = true;
  renderEditorPalette();
  els.lightbox.classList.add("is-editing");
  els.lightboxImg.classList.add("hidden");
  canvas.classList.remove("hidden");
  updateLightboxPaintDisplaySize();
  syncLightboxPaletteTop();
  els.lightboxPaintToolbar.classList.remove("hidden");
  els.lightboxMirrorTools.classList.remove("hidden");
  positionLightboxMirrorTools();
  els.lightboxPaintBtn.classList.add("hidden");
}

function detectLightboxDefaultFillMode(imageData) {
  const data = imageData?.data || [];
  const pixels = Math.floor(data.length / 4);
  if (!pixels) return "sketch";
  const stride = Math.max(1, Math.floor(pixels / 20000));
  let sampled = 0, white = 0, chromatic = 0, neutral = 0;
  for (let index = 0; index < pixels; index += stride) {
    const offset = index * 4;
    if (data[offset + 3] < 32) continue;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    const high = Math.max(r, g, b), low = Math.min(r, g, b);
    const spread = high - low;
    sampled++;
    if (low >= 232) white++;
    if (spread >= 28 && spread / Math.max(1, high) >= .14) chromatic++;
    if (spread <= 18) neutral++;
  }
  if (!sampled) return "sketch";
  const whiteRatio = white / sampled;
  const chromaticRatio = chromatic / sampled;
  const neutralRatio = neutral / sampled;
  return (whiteRatio >= .55 && chromaticRatio <= .2) || (whiteRatio >= .35 && chromaticRatio <= .08 && neutralRatio >= .78)
    ? "sketch" : "material";
}

function detectLightboxDefaultFillModeFromImage(image) {
  const maxSide = 256;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
  const sample = document.createElement("canvas");
  sample.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
  sample.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
  const context = sample.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, sample.width, sample.height);
  return detectLightboxDefaultFillMode(context.getImageData(0, 0, sample.width, sample.height));
}

function cancelLightboxPaint() {
  els.lightboxPaintCanvas.style.transform = "";
  els.lightboxPaintCanvas.style.left = "";
  els.lightboxPaintCanvas.style.maxWidth = "";
  els.lightboxPaintCanvas.style.maxHeight = "";
  lightboxEditBase = null;
  clearLightboxCrop();
  clearCompositeHover();
  lightboxPainting = false;
  $("lightboxLeftTools").classList.add("hidden");
  lightboxDrawing = false;
  hideLightboxEraserRing();
  lightboxPaintActions = [];
  lightboxPaintCurrentAction = null;
  lightboxPlacedImage = null;
  lightboxPlacedSelected = false;
  lightboxTransformDrag = null;
  lightboxEditUndoStack = [];
  resetLightboxFillState();
  lightboxBaseFlipX = false;
  lightboxBaseFlipY = false;
  lightboxPaintOverlay.width = 0;
  lightboxPaintOverlay.height = 0;
  els.lightboxPaintCanvas.classList.add("hidden");
  els.lightboxPaintCanvas.classList.remove("is-rotate-target");
  els.lightboxPaintCanvas.style.width = "";
  els.lightboxPaintCanvas.style.height = "";
  els.lightboxPaintToolbar.classList.add("hidden");
  els.lightboxMirrorTools.classList.add("hidden");
  els.lightboxCanvasPicker.classList.add("hidden");
  els.lightboxImg.classList.remove("hidden");
  els.lightbox.classList.remove("is-editing");
  const editable = lightboxImages.length === 1 && !!lightboxSourceNodeId;
  els.lightboxPaintBtn.classList.toggle("hidden", !editable);
}

function paintCanvasPoint(ev) {
  const canvas = els.lightboxPaintCanvas;
  const rect = canvas.getBoundingClientRect();
  return { x: (ev.clientX - rect.left) * canvas.width / rect.width, y: (ev.clientY - rect.top) * canvas.height / rect.height, scale: canvas.width / rect.width };
}

function updateLightboxPaintDisplaySize() {
  const canvas = els.lightboxPaintCanvas;
  if (!lightboxPainting || !canvas.width || !canvas.height) return;
  const palette = $("lightboxLeftTools");
  const wide = window.innerWidth >= 768;
  const paletteExpanded = wide && !palette.querySelector(".quick-palette-body").classList.contains("hidden");
  const paletteWidth = paletteExpanded ? palette.offsetWidth : 0;
  const leftSpace = paletteWidth ? 16 + paletteWidth + 24 : 16;
  const rightSpace = 16;
  const maxWidth = Math.max(1, Math.min(window.innerWidth * .9, window.innerWidth - leftSpace - rightSpace));
  const maxHeight = Math.max(1, window.innerHeight * .82);
  // 默认最多按原图 1:1 像素显示，避免小图被自动放大后产生插值模糊。
  const displayScale = Math.min(1, maxWidth / canvas.width, maxHeight / canvas.height);
  canvas.style.width = `${Math.max(1, Math.round(canvas.width * displayScale))}px`;
  canvas.style.height = `${Math.max(1, Math.round(canvas.height * displayScale))}px`;
  palette.style.setProperty("--editor-palette-left", "16px");
  canvas.style.maxWidth = "none";
  canvas.style.maxHeight = "none";
  const layoutOffsetX = Math.round((leftSpace - rightSpace) / 2);
  canvas.style.left = `${layoutOffsetX}px`;
  const hasViewTransform = lightboxViewZoom !== 1 || lightboxViewOffset.x !== 0 || lightboxViewOffset.y !== 0;
  canvas.style.transform = hasViewTransform
    ? `translate(${Math.round(lightboxViewOffset.x)}px, ${Math.round(lightboxViewOffset.y)}px) scale(${lightboxViewZoom})`
    : "";
}

// 左侧工具面板垂直定位：仅在打开/窗口变化/折叠调色盘时按当前内容高度“大概居中”定一次 top；
// 之后容差等调节行增减只让面板向下伸展，底部不够时收进 max-height 内部滚动，面板不再上下跳动
function syncLightboxPaletteTop() {
  const palette = $("lightboxLeftTools");
  if (!palette || palette.classList.contains("hidden") || !palette.offsetHeight) return;
  if (window.innerWidth < 768) { // 移动端断点交给 CSS 固定定位
    palette.style.removeProperty("top");
    palette.style.removeProperty("max-height");
    return;
  }
  // 先把高度上限收到“距屏幕上下各留出余量”，再测量、再居中：
  // 内容再高也只会收进上限内部滚动，top 计算永远不会顶到下限，任何窗口尺寸都能真正居中
  palette.style.maxHeight = `${Math.max(240, window.innerHeight - 96)}px`;
  const top = Math.max(24, Math.round((window.innerHeight - palette.offsetHeight) / 2 - 24));
  palette.style.top = `${top}px`;
}

function setLightboxPaintMode(mode) {
  clearLightboxCrop();
  lightboxPaintMode = ["brush", "color-brush", "eraser", "arrow", "rect", "fill", "transform", "crop"].includes(mode) ? mode : "idle";
  lightboxCropBtn.classList.toggle("active", lightboxPaintMode === "crop");
  lightboxCropApply.classList.toggle("hidden", lightboxPaintMode !== "crop");
  els.lightboxPaintCanvas.style.cursor = ["crop", "fill"].includes(lightboxPaintMode) ? "crosshair" : "";
  const sizeRange = lightboxPaintSizeRanges[lightboxPaintMode];
  if (sizeRange) {
    els.lightboxPaintSize.min = sizeRange.min;
    els.lightboxPaintSize.max = sizeRange.max;
    lightboxPaintSizes[lightboxPaintMode] = Math.max(sizeRange.min, Math.min(sizeRange.max, lightboxPaintSizes[lightboxPaintMode]));
    els.lightboxPaintSize.value = lightboxPaintSizes[lightboxPaintMode];
  }
  const isFill = lightboxPaintMode === "fill";
  const isColorBrush = lightboxPaintMode === "color-brush";
  const toolColor = $("lightboxToolColor");
  const colorField = els.lightboxPaintColorField;
  toolColor.classList.toggle("hidden", !isFill);
  const colorParent = isFill ? toolColor : els.lightboxPaintOptions;
  if (colorField.parentElement !== colorParent) colorParent.prepend(colorField);
  els.lightboxPaintFill.setAttribute("aria-pressed", String(isFill));
  $("lightboxColorBrush").setAttribute("aria-pressed", String(isColorBrush));
  const annotateColor = isColorBrush || lightboxPaintMode === "brush" || lightboxPaintMode === "arrow" || lightboxPaintMode === "rect" || isFill;
  els.lightboxPaintFill.classList.toggle("active", isFill);
  els.lightboxPaintSizeField.classList.toggle("hidden", isFill);
  if (!isFill) commitLightboxLastFill();
  syncLightboxFillControls();
  $("lightboxFillOptions").classList.toggle("hidden", !isFill);
  $("lightboxPaintPointer").classList.toggle("active", lightboxPaintMode === "idle" || lightboxPaintMode === "transform");
  els.lightboxPaintBrush.classList.toggle("active", lightboxPaintMode === "brush");
  els.lightboxPaintEraser.classList.toggle("active", lightboxPaintMode === "eraser");
  els.lightboxPaintArrow.classList.toggle("active", lightboxPaintMode === "arrow");
  els.lightboxPaintRect.classList.toggle("active", lightboxPaintMode === "rect");
  els.lightboxPaintOptions.classList.toggle("hidden", ["idle", "transform", "crop", "fill"].includes(lightboxPaintMode));
  els.lightboxPaintColorField.classList.toggle("hidden", !annotateColor);
  els.lightboxPaintColor.disabled = !annotateColor;
  els.lightboxPaintCanvas.classList.toggle("transform-mode", lightboxPaintMode === "transform");
  els.lightboxPaintCanvas.classList.toggle("brush-mode", isColorBrush || lightboxPaintMode === "brush");
  els.lightboxPaintCanvas.classList.toggle("eraser-mode", lightboxPaintMode === "eraser");
  els.lightboxPaintCanvas.classList.toggle("arrow-mode", lightboxPaintMode === "arrow");
  els.lightboxPaintCanvas.classList.toggle("rect-mode", lightboxPaintMode === "rect");
  if (lightboxPaintMode !== "transform") els.lightboxPaintCanvas.classList.remove("is-rotate-target");
  if (lightboxPaintMode !== "eraser") hideLightboxEraserRing();
  if (lightboxPainting) renderLightboxPaintComposite();
}

function positionLightboxMirrorTools() {
  if (!lightboxPainting || els.lightboxMirrorTools.classList.contains("hidden")) return;
  requestAnimationFrame(() => {
    const rect = els.lightboxPaintCanvas.getBoundingClientRect();
    const tools = els.lightboxMirrorTools;
    const halfHeight = tools.offsetHeight / 2;
    tools.style.left = `${Math.max(8, Math.min(window.innerWidth - tools.offsetWidth - 8, rect.right + 8))}px`;
    tools.style.top = `${Math.max(halfHeight + 8, Math.min(window.innerHeight - halfHeight - 56, rect.top + rect.height / 2))}px`;
  });
}

function syncLightboxEraserRing(clientX, clientY) {
  if (clientX != null) lightboxEraserRingPoint = { x: clientX, y: clientY };
  if (!lightboxPainting || lightboxPaintMode !== "eraser" || !lightboxEraserRingPoint) return hideLightboxEraserRing();
  const diameter = Math.max(2, Number(els.lightboxPaintSize.value));
  els.lightboxEraserRing.style.width = `${diameter}px`;
  els.lightboxEraserRing.style.height = `${diameter}px`;
  els.lightboxEraserRing.style.transform = `translate(${lightboxEraserRingPoint.x}px, ${lightboxEraserRingPoint.y}px) translate(-50%, -50%)`;
  els.lightboxEraserRing.classList.remove("hidden");
}

function hideLightboxEraserRing() {
  els.lightboxEraserRing.classList.add("hidden");
  lightboxEraserRingPoint = null;
}

function drawLightboxPaintSegment(context, action, from, to) {
  context.save();
  context.globalCompositeOperation = action.mode === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = (lightboxFillSettings.keepLines && action.inkPattern) || action.color;
  context.lineWidth = action.size;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
}

function drawLightboxShape(context, action) {
  const start = action.points[0];
  const end = action.points[action.points.length - 1];
  if (!start || !end) return;
  context.save();
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = action.color;
  context.fillStyle = action.color;
  context.lineWidth = action.size;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (action.kind === "rect") {
    context.strokeRect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y));
  } else {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const head = Math.min(Math.hypot(end.x - start.x, end.y - start.y) * .55, Math.max(action.size * 3.2, action.size + 4));
    const shaftCover = Math.max(head * .8, Math.min(head, action.size * 1.2));
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x - shaftCover * Math.cos(angle), end.y - shaftCover * Math.sin(angle));
    context.stroke();
    context.beginPath();
    context.moveTo(end.x, end.y);
    context.lineTo(end.x - head * Math.cos(angle - Math.PI / 7), end.y - head * Math.sin(angle - Math.PI / 7));
    context.lineTo(end.x - head * Math.cos(angle + Math.PI / 7), end.y - head * Math.sin(angle + Math.PI / 7));
    context.closePath();
    context.fill();
  }
  context.restore();
}

function isLightboxShapeAction(action) {
  return action.kind === "arrow" || action.kind === "rect";
}

// 所有填色共用的一个颜色层：后填的颜色覆盖先填的（不互相叠色），整层再按模式合成到底图上
const lightboxFillLayer = document.createElement("canvas");
let lightboxFillLayerDirty = true;

function markLightboxFillLayerDirty() {
  lightboxFillLayerDirty = true;
}

function getLightboxFillLayer() {
  const canvas = els.lightboxPaintCanvas;
  if (lightboxFillLayer.width !== canvas.width || lightboxFillLayer.height !== canvas.height) {
    lightboxFillLayer.width = canvas.width;
    lightboxFillLayer.height = canvas.height;
    lightboxFillLayerDirty = true;
  }
  if (!lightboxFillLayerDirty) return lightboxFillLayer;
  const context = lightboxFillLayer.getContext("2d");
  context.clearRect(0, 0, lightboxFillLayer.width, lightboxFillLayer.height);
  for (const fill of lightboxFillActions) {
    if (fill.mode === "eraser" || fill.mode === "color-brush") {
      const first = fill.points[0];
      if (fill.points.length === 1) drawLightboxPaintSegment(context, fill, first, { x: first.x + .01, y: first.y + .01 });
      for (let index = 1; index < fill.points.length; index++) {
        drawLightboxPaintSegment(context, fill, fill.points[index - 1], fill.points[index]);
      }
      continue;
    }
    const layer = lightboxFillSettings.keepLines && fill.inkLayer ? fill.inkLayer : fill.layer;
    if (layer) context.drawImage(layer, 0, 0);
  }
  lightboxFillLayerDirty = false;
  return lightboxFillLayer;
}

function drawLightboxBaseLayers(context) {
  const canvas = els.lightboxPaintCanvas;
  context.save();
  context.translate(lightboxBaseFlipX ? canvas.width : 0, lightboxBaseFlipY ? canvas.height : 0);
  context.scale(lightboxBaseFlipX ? -1 : 1, lightboxBaseFlipY ? -1 : 1);
  context.drawImage(lightboxEditBase || els.lightboxImg, 0, 0, canvas.width, canvas.height);
  context.restore();
  if (lightboxPlacedImage?.element) {
    const placed = lightboxPlacedImage;
    context.save();
    context.translate(placed.x + placed.w / 2, placed.y + placed.h / 2);
    context.rotate((Number(placed.rotation) || 0) * Math.PI / 180);
    context.scale(placed.flipX ? -1 : 1, placed.flipY ? -1 : 1);
    context.drawImage(placed.element, -placed.w / 2, -placed.h / 2, placed.w, placed.h);
    context.restore();
  }
}

// 草图可以用手绘线条划分区域，材质选区只看底图和置入图。
function lightboxFillSourceImageData(includeSketchLines = false) {
  const canvas = els.lightboxPaintCanvas;
  const offscreen = document.createElement("canvas");
  offscreen.width = canvas.width;
  offscreen.height = canvas.height;
  const context = offscreen.getContext("2d");
  drawLightboxBaseLayers(context);
  if (includeSketchLines) context.drawImage(lightboxPaintOverlay, 0, 0);
  return context.getImageData(0, 0, offscreen.width, offscreen.height);
}
function renderLightboxPaintComposite() {
  const canvas = els.lightboxPaintCanvas;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawLightboxBaseLayers(context);
  if (lightboxFillActions.length) {
    context.drawImage(getLightboxFillLayer(), 0, 0);
  }
  context.drawImage(lightboxPaintOverlay, 0, 0);
  if (lightboxPaintMode === "transform" && lightboxPlacedSelected && lightboxPlacedImage) drawLightboxPlacedSelection(context);
}

function drawLightboxPlacedSelection(context) {
  const placed = lightboxPlacedImage;
  const handle = Math.max(8, els.lightboxPaintCanvas.width / Math.max(300, els.lightboxPaintCanvas.getBoundingClientRect().width) * 6);
  const rotation = Number(placed.rotation) || 0;
  const rotationOffset = handle * 5;
  context.save();
  context.translate(placed.x + placed.w / 2, placed.y + placed.h / 2);
  context.rotate(rotation * Math.PI / 180);
  context.strokeStyle = "#ffffff";
  context.lineWidth = Math.max(2, handle / 3);
  context.setLineDash([handle, handle * .7]);
  context.strokeRect(-placed.w / 2, -placed.h / 2, placed.w, placed.h);
  context.setLineDash([]);
  context.fillStyle = "#ffffff";
  [[-placed.w / 2, -placed.h / 2], [placed.w / 2, -placed.h / 2], [-placed.w / 2, placed.h / 2], [placed.w / 2, placed.h / 2]].forEach(([x, y]) => context.fillRect(x - handle, y - handle, handle * 2, handle * 2));
  context.beginPath();
  context.moveTo(0, -placed.h / 2);
  context.lineTo(0, -placed.h / 2 - rotationOffset);
  context.stroke();
  context.beginPath();
  context.arc(0, -placed.h / 2 - rotationOffset, handle * 1.35, 0, Math.PI * 2);
  context.fill();
  context.restore();

  const radians = rotation * Math.PI / 180;
  const labelX = placed.x + placed.w / 2 + Math.sin(radians) * (placed.h / 2 + rotationOffset + handle * 3);
  const labelY = placed.y + placed.h / 2 - Math.cos(radians) * (placed.h / 2 + rotationOffset + handle * 3);
  context.save();
  context.font = `700 ${Math.max(12, handle * 1.8)}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = Math.max(3, handle / 2);
  context.strokeStyle = "rgba(0,0,0,.72)";
  context.fillStyle = "#ffffff";
  const angleLabel = `${Math.round(rotation)}°`;
  context.strokeText(angleLabel, labelX, labelY);
  context.fillText(angleLabel, labelX, labelY);
  context.restore();
}

function rebuildLightboxPaintOverlay() {
  const context = lightboxPaintOverlay.getContext("2d");
  context.clearRect(0, 0, lightboxPaintOverlay.width, lightboxPaintOverlay.height);
  lightboxPaintActions.forEach(action => {
    if (isLightboxShapeAction(action)) return drawLightboxShape(context, action);
    if (!action.points.length) return;
    if (action.points.length === 1) drawLightboxPaintSegment(context, action, action.points[0], { x: action.points[0].x + .01, y: action.points[0].y + .01 });
    for (let index = 1; index < action.points.length; index++) drawLightboxPaintSegment(context, action, action.points[index - 1], action.points[index]);
  });
  renderLightboxPaintComposite();
}

function updateLightboxPaintUndo() {
  els.lightboxPaintUndo.disabled = lightboxEditUndoStack.length === 0;
}

function undoLightboxPaint() {
  if (!lightboxPainting || !lightboxEditUndoStack.length) return;
  clearLightboxCrop();
  lightboxDrawing = false;
  lightboxPaintCurrentAction = null;
  const undoAction = lightboxEditUndoStack.pop();
  undoAction();
  syncLightboxPlacedControls();
  rebuildLightboxPaintOverlay();
  updateLightboxPaintUndo();
}

function pushLightboxEditUndo(undoAction) {
  // 任何新编辑都会终止“上一次填色”的实时调整；填色路径会在 push 之后重新标记
  commitLightboxLastFill();
  lightboxEditUndoStack.push(undoAction);
  if (lightboxEditUndoStack.length > 50) lightboxEditUndoStack.shift();
  updateLightboxPaintUndo();
}

function cloneLightboxPlacedImage(placed = lightboxPlacedImage) {
  return placed ? { ...placed } : null;
}

function syncLightboxPlacedControls() {
  const hasPlacedImage = !!lightboxPlacedImage;
  if (!hasPlacedImage && lightboxPaintMode === "transform") setLightboxPaintMode("idle");
}

function lightboxPlacedHit(point) {
  const placed = lightboxPlacedImage;
  if (!placed) return null;
  const handle = Math.max(8, point.scale * 6);
  const threshold = Math.max(handle * 1.6, Math.min(placed.w, placed.h) * .045);
  const rotationOffset = handle * 5;
  const rotation = (Number(placed.rotation) || 0) * Math.PI / 180;
  const centerX = placed.x + placed.w / 2;
  const centerY = placed.y + placed.h / 2;
  const dx = point.x - centerX;
  const dy = point.y - centerY;
  const local = {
    x: dx * Math.cos(rotation) + dy * Math.sin(rotation),
    y: -dx * Math.sin(rotation) + dy * Math.cos(rotation),
  };
  const rotationHandle = { x: 0, y: -placed.h / 2 - rotationOffset };
  if (Math.hypot(local.x - rotationHandle.x, local.y - rotationHandle.y) <= threshold) return { type: "rotate" };
  const corners = [
    ["nw", -placed.w / 2, -placed.h / 2], ["ne", placed.w / 2, -placed.h / 2],
    ["sw", -placed.w / 2, placed.h / 2], ["se", placed.w / 2, placed.h / 2],
  ];
  const corner = corners.find(([, x, y]) => Math.hypot(local.x - x, local.y - y) <= threshold);
  if (corner) return { type: "resize", corner: corner[0] };
  if (Math.abs(local.x) <= placed.w / 2 && Math.abs(local.y) <= placed.h / 2) return { type: "move" };
  return null;
}

function updateLightboxPlacedTransform(point) {
  if (!lightboxTransformDrag || !lightboxPlacedImage) return;
  const initial = lightboxTransformDrag.initial;
  if (lightboxTransformDrag.type === "move") {
    lightboxPlacedImage.x = initial.x + point.x - lightboxTransformDrag.start.x;
    lightboxPlacedImage.y = initial.y + point.y - lightboxTransformDrag.start.y;
  } else if (lightboxTransformDrag.type === "rotate") {
    const centerX = initial.x + initial.w / 2;
    const centerY = initial.y + initial.h / 2;
    const startAngle = Math.atan2(lightboxTransformDrag.start.y - centerY, lightboxTransformDrag.start.x - centerX);
    const currentAngle = Math.atan2(point.y - centerY, point.x - centerX);
    let rotation = (Number(initial.rotation) || 0) + (currentAngle - startAngle) * 180 / Math.PI;
    rotation = ((rotation + 180) % 360 + 360) % 360 - 180;
    lightboxPlacedImage.rotation = rotation;
  } else {
    const corner = lightboxTransformDrag.corner;
    const rotation = (Number(initial.rotation) || 0) * Math.PI / 180;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const centerX = initial.x + initial.w / 2;
    const centerY = initial.y + initial.h / 2;
    const sx = corner.includes("e") ? 1 : -1;
    const sy = corner.includes("s") ? 1 : -1;
    const oppositeLocalX = -sx * initial.w / 2;
    const oppositeLocalY = -sy * initial.h / 2;
    const anchorX = centerX + oppositeLocalX * cos - oppositeLocalY * sin;
    const anchorY = centerY + oppositeLocalX * sin + oppositeLocalY * cos;
    const pointerDx = point.x - anchorX;
    const pointerDy = point.y - anchorY;
    const localDx = pointerDx * cos + pointerDy * sin;
    const localDy = -pointerDx * sin + pointerDy * cos;
    const aspect = initial.w / initial.h;
    let width = Math.max(24, Math.abs(localDx));
    let height = width / aspect;
    if (Math.abs(localDy) * aspect > width) {
      height = Math.max(24, Math.abs(localDy));
      width = height * aspect;
    }
    lightboxPlacedImage.w = width;
    lightboxPlacedImage.h = height;
    const newCenterOffsetX = sx * width / 2;
    const newCenterOffsetY = sy * height / 2;
    const newCenterX = anchorX + newCenterOffsetX * cos - newCenterOffsetY * sin;
    const newCenterY = anchorY + newCenterOffsetX * sin + newCenterOffsetY * cos;
    lightboxPlacedImage.x = newCenterX - width / 2;
    lightboxPlacedImage.y = newCenterY - height / 2;
  }
  renderLightboxPaintComposite();
}

els.lightboxPaintCanvas.addEventListener("pointerdown", ev => {
  if (!lightboxPainting) return;
  if (ev.button === 1) {
    ev.preventDefault();
    lightboxViewDrag = { ...lightboxViewOffset, startX: ev.clientX, startY: ev.clientY };
    els.lightboxPaintCanvas.setPointerCapture(ev.pointerId);
    return;
  }
  if (ev.button !== 0) return;
  ev.preventDefault();
  ev.stopPropagation();
  if (lightboxPaintMode === "idle") return;
  const p = paintCanvasPoint(ev);
  if (lightboxPaintMode === "fill") {
    applyLightboxFillAt(p);
    return;
  }
  if (lightboxPaintMode === "crop") {
    lightboxCropDrag = { x: Math.max(0, Math.min(els.lightboxPaintCanvas.width, p.x)), y: Math.max(0, Math.min(els.lightboxPaintCanvas.height, p.y)) };
    els.lightboxPaintCanvas.setPointerCapture(ev.pointerId);
    updateLightboxCrop(p);
    return;
  }
  if (lightboxPaintMode === "transform") {
    const hit = lightboxPlacedHit(p);
    els.lightboxPaintCanvas.classList.toggle("is-rotate-target", hit?.type === "rotate");
    lightboxPlacedSelected = !!hit;
    if (!hit) return renderLightboxPaintComposite();
    lightboxTransformDrag = { ...hit, start: p, initial: cloneLightboxPlacedImage() };
    els.lightboxPaintCanvas.setPointerCapture(ev.pointerId);
    return renderLightboxPaintComposite();
  }
  lightboxDrawing = true;
  els.lightboxPaintCanvas.setPointerCapture(ev.pointerId);
  if (lightboxPaintMode === "arrow" || lightboxPaintMode === "rect") {
    lightboxPaintCurrentAction = { kind: lightboxPaintMode, mode: lightboxPaintMode, color: els.lightboxPaintColor.value, size: Number(els.lightboxPaintSize.value) * p.scale, points: [p, { ...p }] };
    lightboxPaintActions.push(lightboxPaintCurrentAction);
    rebuildLightboxPaintOverlay();
    updateLightboxPaintUndo();
    return;
  }
  lightboxPaintCurrentAction = { mode: lightboxPaintMode, color: els.lightboxPaintColor.value, size: Number(els.lightboxPaintSize.value) * p.scale, points: [p] };
  if (lightboxPaintMode === "color-brush") {
    const action = lightboxPaintCurrentAction;
    try {
      const source = lightboxFillSourceImageData(true);
      const tint = document.createElement("canvas");
      tint.width = source.width;
      tint.height = source.height;
      const context = tint.getContext("2d");
      const pixels = context.createImageData(source.width, source.height);
      const color = parseHexColor(action.color);
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        writeSketchFillPixel(pixels.data, source.data, offset, color, true);
        pixels.data[offset + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      action.inkPattern = getLightboxFillLayer().getContext("2d").createPattern(tint, "no-repeat");
      lightboxFillActions.push(action);
      markLightboxFillLayerDirty();
    } catch (error) {
      lightboxPaintCurrentAction = null;
      lightboxDrawing = false;
      toast(`上色笔刷无法读取图片：${error.message}`);
      return;
    }
  } else if (lightboxPaintMode === "eraser") {
    lightboxFillActions.push(lightboxPaintCurrentAction);
    markLightboxFillLayerDirty();
  } else {
    lightboxPaintActions.push(lightboxPaintCurrentAction);
    drawLightboxPaintSegment(lightboxPaintOverlay.getContext("2d"), lightboxPaintCurrentAction, p, { x: p.x + .01, y: p.y + .01 });
  }
  renderLightboxPaintComposite();
  updateLightboxPaintUndo();
});

els.lightboxPaintCanvas.addEventListener("pointermove", ev => {
  if (lightboxViewDrag) {
    lightboxViewOffset = { x: lightboxViewDrag.x + ev.clientX - lightboxViewDrag.startX, y: lightboxViewDrag.y + ev.clientY - lightboxViewDrag.startY };
    updateLightboxPaintDisplaySize();
    return;
  }
  if (lightboxCropDrag) return updateLightboxCrop(paintCanvasPoint(ev));
  if (lightboxTransformDrag) return updateLightboxPlacedTransform(paintCanvasPoint(ev));
  if (lightboxPaintMode === "transform") {
    const hit = lightboxPlacedHit(paintCanvasPoint(ev));
    els.lightboxPaintCanvas.classList.toggle("is-rotate-target", hit?.type === "rotate");
    return;
  }
  if (!lightboxDrawing) return;
  const p = paintCanvasPoint(ev);
  if (!lightboxPaintCurrentAction) return;
  if (isLightboxShapeAction(lightboxPaintCurrentAction)) {
    lightboxPaintCurrentAction.points[1] = p;
    rebuildLightboxPaintOverlay();
    return;
  }
  const previous = lightboxPaintCurrentAction.points[lightboxPaintCurrentAction.points.length - 1];
  const layer = ["eraser", "color-brush"].includes(lightboxPaintCurrentAction.mode) ? getLightboxFillLayer() : lightboxPaintOverlay;
  lightboxPaintCurrentAction.points.push(p);
  drawLightboxPaintSegment(layer.getContext("2d"), lightboxPaintCurrentAction, previous, p);
  renderLightboxPaintComposite();
});
els.lightboxPaintCanvas.addEventListener("pointermove", ev => syncLightboxEraserRing(ev.clientX, ev.clientY));
els.lightboxPaintCanvas.addEventListener("pointerleave", () => {
  if (!lightboxTransformDrag) els.lightboxPaintCanvas.classList.remove("is-rotate-target");
  hideLightboxEraserRing();
});

function finishLightboxPointerAction(ev) {
  if (lightboxViewDrag) { lightboxViewDrag = null; return; }
  if (lightboxCropDrag) {
    if (ev.type === "pointercancel") clearLightboxCrop();
    else { updateLightboxCrop(paintCanvasPoint(ev)); lightboxCropDrag = null; }
    renderLightboxPaintComposite();
    return;
  }
  if (lightboxTransformDrag) {
    const previous = lightboxTransformDrag.initial;
    lightboxTransformDrag = null;
    pushLightboxEditUndo(() => { lightboxPlacedImage = cloneLightboxPlacedImage(previous); lightboxPlacedSelected = true; });
  } else if (lightboxDrawing && lightboxPaintCurrentAction) {
    const action = lightboxPaintCurrentAction;
    if (isLightboxShapeAction(action) && action.points.length >= 2 && Math.hypot(action.points[1].x - action.points[0].x, action.points[1].y - action.points[0].y) <= action.size) {
      const index = lightboxPaintActions.lastIndexOf(action);
      if (index >= 0) lightboxPaintActions.splice(index, 1);
      lightboxDrawing = false;
      lightboxPaintCurrentAction = null;
      rebuildLightboxPaintOverlay();
      return;
    }
    pushLightboxEditUndo(() => {
      const actions = ["eraser", "color-brush"].includes(action.mode) ? lightboxFillActions : lightboxPaintActions;
      const index = actions.lastIndexOf(action);
      if (index >= 0) actions.splice(index, 1);
      if (actions === lightboxFillActions) markLightboxFillLayerDirty();
    });
  }
  lightboxDrawing = false;
}
els.lightboxPaintCanvas.addEventListener("pointerup", finishLightboxPointerAction);
els.lightboxPaintCanvas.addEventListener("pointercancel", finishLightboxPointerAction);
els.lightboxPaintCanvas.addEventListener("dragstart", ev => ev.preventDefault());
els.lightboxPaintCanvas.addEventListener("lostpointercapture", finishLightboxPointerAction);
$("lightboxPaintPointer").onclick = () => setLightboxPaintMode(lightboxPlacedImage ? "transform" : "idle");
els.lightboxPaintBtn.onclick = () => startLightboxPaint().catch(error => toast(`原图加载失败：${error.message || "无法读取图片"}`));
els.lightboxMattingBtn.onclick = () => {
  const node = findNode(lightboxSourceNodeId);
  if (!node) return toast("原图片节点已被删除");
  hideLightbox();
  openImageRegionMatting(node);
};
els.lightboxPaintBrush.onclick = () => setLightboxPaintMode("brush");
els.lightboxPaintEraser.onclick = () => setLightboxPaintMode("eraser");
els.lightboxPaintArrow.onclick = () => setLightboxPaintMode("arrow");
els.lightboxPaintRect.onclick = () => setLightboxPaintMode("rect");

els.lightboxPaintUndo.onclick = undoLightboxPaint;
els.lightboxPaintSize.addEventListener("input", () => {
  if (lightboxPaintSizes[lightboxPaintMode] != null) lightboxPaintSizes[lightboxPaintMode] = Number(els.lightboxPaintSize.value);
  syncLightboxEraserRing();
});
// ===== 填色（魔棒式区域填充）=====
// 流程：按容差二值化 → 按“忽略细线”半径膨胀可通行区（浅色细线被吸收，深色硬线保持阻挡）→ 扫描线连通填充 → 闭运算填满区域内细线 → 生成颜色层。
// 所有填色写入同一颜色层（后填覆盖先填，不叠色），按“保留线稿”选择保留深色笔画的覆盖层或实色覆盖层；上一次填色在滑块变动时可实时重算。

let lightboxFillBusy = false;
let lightboxFillHintShown = false;
function resetLightboxFillState() {
  lightboxFillActions = [];
  lightboxLastFill = null;
  $("lightboxFillAdjustment").classList.add("hidden");
  lightboxFillBusy = false;
  lightboxFillLayer.width = 0;
  lightboxFillLayer.height = 0;
  lightboxFillLayerDirty = true;
  if (lightboxFillReapplyTimer) clearTimeout(lightboxFillReapplyTimer);
  lightboxFillReapplyTimer = 0;
}

function syncLightboxFillControls() {
  $("lightboxFillAdjustment").classList.toggle("hidden", !lightboxLastFill || lightboxPaintMode !== "fill");
  const material = lightboxLastFill?.material ?? ($("lightboxFillMode").value === "material");
  els.lightboxFillTolerance.max = material ? 150 : 20;
  els.lightboxFillTolerance.value = lightboxLastFill?.tolerance ?? (material ? 65 : lightboxFillSettings.sketchTolerance);
  els.lightboxFillLineWidthField.classList.toggle("hidden", material);
  $("lightboxSketchOptions").classList.toggle("hidden", material || lightboxPaintMode !== "fill");
  els.lightboxFillLineWidth.value = (lightboxLastFill?.lineWidth ?? lightboxFillSettings.lineWidth);
  els.lightboxFillKeepLines.checked = lightboxFillSettings.keepLines;
  els.lightboxFillToleranceValue.textContent = els.lightboxFillTolerance.value;
  els.lightboxFillLineWidthValue.textContent = `${(lightboxLastFill?.lineWidth ?? lightboxFillSettings.lineWidth)}px`;
}

// 结束“上一次填色”的实时调整，释放其缓存的源像素与掩膜
function commitLightboxLastFill() {
  if (!lightboxLastFill) return;
  if (lightboxFillReapplyTimer) {
    clearTimeout(lightboxFillReapplyTimer);
    lightboxFillReapplyTimer = 0;
    reapplyLightboxLastFill();
  }
  $("lightboxFillAdjustment").classList.add("hidden");
  lightboxLastFill.source = null;
  lightboxLastFill.selectionSource = null;
  lightboxLastFill.mask = null;
  lightboxLastFill = null;
}

function parseHexColor(hex) {
  const value = String(hex || "").replace("#", "");
  const full = value.length === 3 ? value.split("").map(ch => ch + ch).join("") : value.padEnd(6, "0").slice(0, 6);
  const num = parseInt(full, 16);
  return Number.isNaN(num) ? [255, 59, 48] : [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function extractLightboxLinePixels(image, strength, cleanup) {
  const { width, height, data } = image;
  const threshold = 36 + cleanup * 0.65;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const left = (y * width + Math.max(0, x - 1)) * 4;
      const right = (y * width + Math.min(width - 1, x + 1)) * 4;
      const top = (Math.max(0, y - 1) * width + x) * 4;
      const bottom = (Math.min(height - 1, y + 1) * width + x) * 4;
      let edge = 0;
      for (let c = 0; c < 3; c++) {
        const dx = data[right + c] - data[left + c];
        const dy = data[bottom + c] - data[top + c];
        edge = Math.max(edge, Math.abs(dx) + Math.abs(dy));
      }
      const high = Math.max(data[p], data[p + 1], data[p + 2]);
      const low = Math.min(data[p], data[p + 1], data[p + 2]);
      const ink = high < 96 && high - low < 24 ? 255 - high : 0;
      const value = Math.max(0, Math.max(edge, ink) - threshold) * (0.8 + strength / 35);
      image.linePixels[p] = image.linePixels[p + 1] = image.linePixels[p + 2] = 255 - Math.min(255, value);
      image.linePixels[p + 3] = 255;
    }
  }
}

function makeLightboxLineArt(source, width, height, strength, cleanup) {
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const ctx = output.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  const input = ctx.getImageData(0, 0, width, height);
  const lines = ctx.createImageData(width, height);
  extractLightboxLinePixels({ width, height, data: input.data, linePixels: lines.data }, strength, cleanup);
  ctx.putImageData(lines, 0, 0);
  return output;
}

document.getElementById("lightboxLineArtBtn").addEventListener("click", () => {
  if (!lightboxPainting || document.querySelector(".line-art-dialog")) return;
  const source = lightboxEditBase || els.lightboxImg;
  const canvas = els.lightboxPaintCanvas;
  const { width, height } = canvas;
  const ratio = Math.min(1, 800 / Math.max(width, height));
  const dialog = document.createElement("dialog");
  dialog.className = "palette-mask-dialog line-art-dialog";
  dialog.setAttribute("aria-label", "提取线稿");
  dialog.innerHTML = `<h2>提取线稿</h2><div class="quick-palette-row">
    <label>线条强度 <input type="range" min="0" max="100" value="55"></label>
    <label>去杂纹 <input type="range" min="0" max="100" value="40"></label>
    </div><div class="palette-mask-surface"></div><p role="status">预览提取结果</p>
    <div class="quick-palette-row"><button type="button" data-line-action="apply">应用线稿</button><button type="button" data-line-action="cancel">取消</button></div>`;
  const inputs = [...dialog.querySelectorAll("input")];
  const settings = () => inputs.map(input => Number(input.value));
  const surface = dialog.querySelector(".palette-mask-surface");
  let frame = 0;
  const preview = () => {
    frame = 0;
    surface.replaceChildren(makeLightboxLineArt(source, Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio)), ...settings()));
  };
  dialog.addEventListener("input", () => { if (!frame) frame = requestAnimationFrame(preview); });
  dialog.addEventListener("close", () => { cancelAnimationFrame(frame); dialog.remove(); }, { once: true });
  dialog.addEventListener("click", event => {
    const action = event.target.closest("[data-line-action]")?.dataset.lineAction;
    if (action === "cancel") dialog.close();
    if (action !== "apply" || !lightboxPainting) return;
    try {
      const previous = lightboxEditBase;
      const lines = makeLightboxLineArt(source, width, height, ...settings());
      commitLightboxLastFill();
      lightboxEditBase = lines;
      pushLightboxEditUndo(() => { lightboxEditBase = previous; });
      setLightboxPaintMode("fill");
      renderLightboxPaintComposite();
      dialog.close();
    } catch (error) {
      dialog.querySelector("[role=status]").textContent = `提取失败：${error.message}`;
    }
  });
  try {
    preview();
    document.body.append(dialog);
    dialog.showModal();
  } catch (error) {
    dialog.remove();
    toast(`提取线稿失败：${error.message}`);
  }
});

function buildLightboxFillLayer(mask, source, color, materialSeed = null) {
  const { width, height, data } = source;
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const context = layer.getContext("2d");
  const image = context.createImageData(width, height);
  const rgb = parseHexColor(color);
  const pixels = image.data;
  if (materialSeed) {
    const luma = p => (54 * data[p] + 183 * data[p + 1] + 19 * data[p + 2]) / 256;
    const anchor = luma((materialSeed.y * width + materialSeed.x) * 4);
    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      if (!mask[i]) continue;
      const delta = luma(p) - anchor;
      for (let c = 0; c < 3; c++) {
        pixels[p + c] = delta < 0 ? rgb[c] * (1 + delta / Math.max(1, anchor))
          : rgb[c] + (255 - rgb[c]) * delta / Math.max(1, 255 - anchor);
      }
      pixels[p + 3] = data[p + 3];
    }
    context.putImageData(image, 0, 0);
    return { layer, inkLayer: null };
  }
  const inkLayer = document.createElement("canvas");
  inkLayer.width = width;
  inkLayer.height = height;
  const inkContext = inkLayer.getContext("2d");
  const inkImage = inkContext.createImageData(width, height);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (!mask[i]) continue;
    writeSketchFillPixel(pixels, data, p, rgb, false);
    writeSketchFillPixel(inkImage.data, data, p, rgb, true);
    pixels[p + 3] = inkImage.data[p + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  inkContext.putImageData(inkImage, 0, 0);
  return { layer, inkLayer };
}

function lightboxSketchMask(source, seed, tolerance, lineWidth, preprocess) {
  const point = preprocess ? findSketchInteriorPoint(source, seed.x, seed.y) : seed;
  if (!point) return null;
  const { mask, count } = computeLightboxFillMask(source, point.x, point.y, { tolerance, lineWidth, sketch: true });
  if (!count) return null;
  if (preprocess) {
    const span = Math.max(8, Math.min(24, Math.round(Math.min(source.width, source.height) / 45)));
    suppressSketchPinholeRegions(mask, source.width, source.height, span, span * 6);
  }
  return mask;
}

async function applyLightboxFillAt(point) {
  if (lightboxFillBusy) return;
  commitLightboxLastFill();
  const canvas = els.lightboxPaintCanvas;
  const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(point.x)));
  const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(point.y)));
  const session = lightboxFillActions;
  lightboxFillBusy = true;
  canvas.style.cursor = "progress";
  // 让出一次事件循环以便忙碌光标有机会绘制；不用 requestAnimationFrame——嵌入式 WebView 会把帧节流到秒级
  await new Promise(resolve => setTimeout(resolve, 0));
  try {
    if (!lightboxPainting || lightboxPaintMode !== "fill") return;
    if (session !== lightboxFillActions) return;
    const material = $("lightboxFillMode").value === "material";
    const source = lightboxFillSourceImageData(!material);
    const preprocess = !material && $("lightboxSketchPrepare").checked;
    const selectionSource = preprocess ? prepareSketchSelection(source) : source;
    const color = els.lightboxPaintColor.value;
    const { sketchTolerance, lineWidth } = lightboxFillSettings;
    const tolerance = material ? 65 : sketchTolerance;
    const seed = { x, y };
    const mask = material ? selectMaterialRegion(source, x, y, { tolerance }).mask
      : lightboxSketchMask(selectionSource, seed, tolerance, lineWidth, preprocess);
    if (!mask?.some(Boolean)) return;
    const action = { kind: "fill", seed, color, tolerance, lineWidth, ...buildLightboxFillLayer(mask, source, color, material ? seed : null),
      source, selectionSource, mask, preprocess, material };
    lightboxFillActions.push(action);
    markLightboxFillLayerDirty();
    pushLightboxEditUndo(() => {
      const index = lightboxFillActions.lastIndexOf(action);
      if (index >= 0) lightboxFillActions.splice(index, 1);
      if (lightboxLastFill === action) commitLightboxLastFill();
      markLightboxFillLayerDirty();
    });
    // 在 push 之后标记，允许随后拖动滑块/改色实时重算本次填色
    lightboxLastFill = action;
    syncLightboxFillControls();
    renderLightboxPaintComposite();
    if (!lightboxFillHintShown) {
      lightboxFillHintShown = true;
      toast("点击要填色的区域；拖动容差或忽略细线可实时调整本次填色");
    }
  } catch (error) {
    console.error("[图片编辑] 填色失败", { x, y, message: error.message });
    toast(`填色失败：${error.message || "无法读取图片像素"}`);
  } finally {
    if (session === lightboxFillActions) {
      lightboxFillBusy = false;
      canvas.style.cursor = lightboxPaintMode === "fill" ? "crosshair" : "";
    }
  }
}

function scheduleLightboxFillReapply() {
  if (!lightboxLastFill || !lightboxPainting || lightboxPaintMode !== "fill") return;
  // 尾随去抖：拖动滑块期间合并连续输入，停顿即重算
  if (lightboxFillReapplyTimer) clearTimeout(lightboxFillReapplyTimer);
  lightboxFillReapplyTimer = setTimeout(() => {
    lightboxFillReapplyTimer = 0;
    reapplyLightboxLastFill();
  }, 40);
}

function reapplyLightboxLastFill() {
  const action = lightboxLastFill;
  if (!action || !action.source || !lightboxFillActions.includes(action)) return;
  const color = els.lightboxPaintColor.value;
  const tolerance = Number(els.lightboxFillTolerance.value);
  const lineWidth = Number(els.lightboxFillLineWidth.value);
  const selectionChanged = tolerance !== action.tolerance || lineWidth !== action.lineWidth;
  if (!selectionChanged && color === action.color) return;
  if (selectionChanged) {
    action.mask = action.material
      ? selectMaterialRegion(action.source, action.seed.x, action.seed.y, { tolerance }).mask
      : lightboxSketchMask(action.selectionSource, action.seed, tolerance, lineWidth, action.preprocess)
        || new Uint8Array(action.source.width * action.source.height);
  }
  action.color = color;
  action.tolerance = tolerance;
  action.lineWidth = lineWidth;
  Object.assign(action, buildLightboxFillLayer(action.mask, action.source, action.color, action.material ? action.seed : null));
  markLightboxFillLayerDirty();
  renderLightboxPaintComposite();
}

$("lightboxFillMode").onchange = () => {
  commitLightboxLastFill();
  syncLightboxFillControls();
};
els.lightboxPaintFill.onclick = () => setLightboxPaintMode("fill");
$("lightboxColorBrush").onclick = () => setLightboxPaintMode("color-brush");
els.lightboxPaintColor.addEventListener("input", scheduleLightboxFillReapply);
els.lightboxFillTolerance.addEventListener("input", () => {
  els.lightboxFillToleranceValue.textContent = String(els.lightboxFillTolerance.value);
  scheduleLightboxFillReapply();
});
els.lightboxFillLineWidth.addEventListener("input", () => {
  els.lightboxFillLineWidthValue.textContent = `${els.lightboxFillLineWidth.value}px`;
  scheduleLightboxFillReapply();
});
$("lightboxFillAdjustmentDone").onclick = commitLightboxLastFill;
els.lightboxFillKeepLines.addEventListener("change", () => {
  // 保留线稿是整个填色层的合成模式，切换即时生效于全部填色，无需重算掩膜
  lightboxFillSettings.keepLines = els.lightboxFillKeepLines.checked;
  markLightboxFillLayerDirty();
  if (lightboxPainting) renderLightboxPaintComposite();
});

async function placeImageInLightbox(source) {
  const element = new Image();
  await new Promise((resolve, reject) => {
    element.onload = resolve;
    element.onerror = () => reject(new Error("置入图片无法读取"));
    element.src = source;
  });
  const previous = cloneLightboxPlacedImage();
  const canvas = els.lightboxPaintCanvas;
  const scale = Math.min(canvas.width * .55 / element.naturalWidth, canvas.height * .55 / element.naturalHeight, 1);
  const width = Math.max(24, element.naturalWidth * scale);
  const height = Math.max(24, element.naturalHeight * scale);
  lightboxPlacedImage = { element, source, x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, w: width, h: height, rotation: 0, flipX: false, flipY: false };
  lightboxPlacedSelected = true;
  syncLightboxPlacedControls();
  setLightboxPaintMode("transform");
  pushLightboxEditUndo(() => {
    lightboxPlacedImage = cloneLightboxPlacedImage(previous);
    lightboxPlacedSelected = !!previous;
    syncLightboxPlacedControls();
  });
  renderLightboxPaintComposite();
}

function compositeNodeLabel(node) {
  if (node.type === "ai-image") return node.seq ? `AI绘图 #${node.seq}` : "AI绘图结果";
  if (node.type === "angle-image") return "角度变化结果";
  return node.fileName || (node.seq ? `图片 #${node.seq}` : "图片节点");
}

els.lightboxInsertBtn.onclick = () => {
  const candidates = state.nodes.filter(node => node.id !== lightboxSourceNodeId && nodeImageReference(node));
  if (!candidates.length) return toast("画布中没有其他可置入的图片节点");
  els.lightboxCanvasPickerList.innerHTML = "";
  candidates.forEach(node => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lightbox-canvas-picker-item";
    const label = compositeNodeLabel(node);
    button.title = label;
    button.setAttribute("aria-label", `置入 ${label}`);
    button.disabled = true;
    const thumbnail = document.createElement("img");
    thumbnail.alt = label;
    thumbnail.draggable = false;
    const caption = document.createElement("span");
    caption.textContent = label;
    button.append(thumbnail, caption);
    let sourceUrl = "";
    button.onclick = async () => {
      if (!sourceUrl) return;
      els.lightboxCanvasPicker.classList.add("hidden");
      try {
        await placeImageInLightbox(sourceUrl);
      } catch (error) {
        console.error("[图片编辑] 从画布置入失败", { nodeId: node.id, message: error.message });
        toast(`置入图片失败：节点原图可能已丢失或目录无权限；请检查 data 素材目录。${error.message || ""}`);
      }
    };
    els.lightboxCanvasPickerList.appendChild(button);
    materializeReferenceImage(nodeImageReference(node)).then(source => {
      if (!source) throw new Error("无法读取节点原图");
      thumbnail.src = source;
      sourceUrl = source;
      button.disabled = false;
    }).catch(error => {
      button.classList.add("is-unavailable");
      caption.textContent = "图片不可用";
      console.warn("[图片编辑] 置入缩略图加载失败", { nodeId: node.id, message: error.message });
    });
  });
  els.lightboxCanvasPicker.classList.remove("hidden");
};
els.lightboxCanvasPickerClose.onclick = () => els.lightboxCanvasPicker.classList.add("hidden");

async function openNodeCompositeEditor(baseNode, placedNode) {
  try {
    const [baseSource, placedSource] = await Promise.all([
      materializeReferenceImage(nodeImageReference(baseNode)),
      materializeReferenceImage(nodeImageReference(placedNode)),
    ]);
    if (!baseSource || !placedSource) throw new Error("无法读取参与合成的原图");
    showLightbox(baseSource, baseNode.id);
    await startLightboxPaint();
    await placeImageInLightbox(placedSource);
  } catch (error) {
    console.error("[节点叠放合成] 打开失败", { baseNodeId: baseNode?.id, placedNodeId: placedNode?.id, message: error.message });
    toast(`无法打开合成编辑：节点原图可能丢失或目录无权限；请检查 data 素材目录后重试。${error.message || ""}`);
  }
}

function flipLightboxSelection(axis) {
  if (lightboxPlacedSelected && lightboxPlacedImage) {
    const placed = lightboxPlacedImage;
    if (axis === "x") placed.flipX = !placed.flipX;
    else placed.flipY = !placed.flipY;
    pushLightboxEditUndo(() => {
      if (!lightboxPlacedImage) return;
      if (axis === "x") lightboxPlacedImage.flipX = !lightboxPlacedImage.flipX;
      else lightboxPlacedImage.flipY = !lightboxPlacedImage.flipY;
    });
  } else {
    if (axis === "x") lightboxBaseFlipX = !lightboxBaseFlipX;
    else lightboxBaseFlipY = !lightboxBaseFlipY;
    pushLightboxEditUndo(() => {
      if (axis === "x") lightboxBaseFlipX = !lightboxBaseFlipX;
      else lightboxBaseFlipY = !lightboxBaseFlipY;
    });
  }
  renderLightboxPaintComposite();
}

els.lightboxFlipHorizontal.onclick = () => flipLightboxSelection("x");
els.lightboxFlipVertical.onclick = () => flipLightboxSelection("y");
els.lightboxPaintCancel.onclick = hideLightbox;
els.lightboxPaintConfirm.onclick = async () => {
  if (!lightboxPainting) return;
  if (lightboxCropRect && !lightboxCropApply.disabled) applyLightboxCrop();
  clearLightboxCrop();
  clearCompositeHover();
  const source = findNode(lightboxSourceNodeId);
  lightboxPlacedSelected = false;
  renderLightboxPaintComposite();
  const image = els.lightboxPaintCanvas.toDataURL("image/png");
  const x = source ? source.x + NODE_WIDTH + 40 : lastPointerWorld.x;
  const y = source ? source.y : lastPointerWorld.y;
  const node = addNode("image", x, y, false);
  node.image = image;
  node.fileName = `局部修改_${Date.now()}.png`;
  node.mime = "image/png";
  // 来源图本身带配色标注(重编辑时旧标注已烘焙进底图):产物继承标记,任务发送时据此内置颜色修改提示词
  // 灯箱箭头标注已下线,画笔不会再产生新标注;此继承只服务存量旧图
  if (source?.hasColorArrowNotes) node.hasColorArrowNotes = true;
  await externalizeImageField(node, "image", "imageAssetId", node.fileName);
  pushHistory();
  render();
  hideLightbox();
  toast("已生成局部修改图片节点");
};

els.lightboxClose.onclick = hideLightbox;
els.lightboxPrev.onclick = lightboxPrev;
els.lightboxNext.onclick = lightboxNext;
els.lightbox.querySelector(".lightbox-bg").onclick = () => { if (!lightboxPainting) hideLightbox(); };
els.lightbox.addEventListener("wheel", ev => {
  if (ev.target.closest(".editor-quick-palette")) return;
  if (lightboxPainting) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (!ev.target.closest("#lightboxPaintCanvas, .lightbox-bg") || lightboxDrawing || lightboxTransformDrag || lightboxCropDrag || lightboxViewDrag) return;
    const rect = els.lightboxPaintCanvas.getBoundingClientRect();
    const nextZoom = Math.max(.25, Math.min(16, lightboxViewZoom * Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? window.innerHeight : 1) * .0015)));
    const ratio = nextZoom / lightboxViewZoom;
    lightboxViewOffset.x += (ev.clientX - (rect.left + rect.width / 2)) * (1 - ratio);
    lightboxViewOffset.y += (ev.clientY - (rect.top + rect.height / 2)) * (1 - ratio);
    lightboxViewZoom = nextZoom;
    updateLightboxPaintDisplaySize();
    syncLightboxEraserRing(ev.clientX, ev.clientY);
    return;
  }
  if (lightboxImages.length <= 1) return;
  ev.preventDefault();
  if (ev.deltaY < 0) lightboxPrev(); else lightboxNext();
}, { passive: false, capture: true });
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
  if (lightboxPainting && lightboxPaintSizeRanges[lightboxPaintMode] && adjustRangeByBracketKey(ev, els.lightboxPaintSize)) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    hideLightbox();
  }
  if (ev.key === "ArrowLeft") { ev.preventDefault(); lightboxPrev(); }
  if (ev.key === "ArrowRight") { ev.preventDefault(); lightboxNext(); }
});
window.addEventListener("resize", updateLightboxPaintDisplaySize);
window.addEventListener("resize", syncLightboxPaletteTop);

async function setComposerImage(file) {
  if (!file) return;
  composerImage = {
    image: await fileToDataUrl(file),
    fileName: file.name || `upload_${timestamp()}.png`,
    mime: file.type || "image/png",
  };
  await externalizeImageField(composerImage, "image", "assetId", composerImage.fileName);
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
    imageNode.imageAssetId = image.assetId || "";
    imageNode.generationPrompt = image.generationPrompt || "";
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
    node.imageAssetId = image.assetId || "";
    node.generationPrompt = image.generationPrompt || "";
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

async function addImageNodeFromDataUrl(dataUrl, fileName, mime, toastText = "已创建图片节点") {
  const blob = await (await fetch(dataUrl)).blob();
  const safeName = fileName || `ps_${timestamp()}.png`;
  const anchor = currentPasteAnchor();
  const node = addNode("image", anchor.x, anchor.y, false);
  node.image = await fileToDataUrl(new File([blob], safeName, { type: mime || "image/png" }));
  node.fileName = safeName;
  node.mime = mime || blob.type || "image/png";
  await externalizeImageField(node, "image", "imageAssetId", node.fileName);
  pushHistory();
  render();
  toast(toastText);
  return node;
}

async function createNodeFromClipboard(ev) {
  const data = ev.clipboardData;
  if (!data) return false;
  const items = Array.from(data.items || []);
  const imageItem = items.find(item => item.kind === "file" && item.type.startsWith("image/"));
  if (imageItem) {
    const file = imageItem.getAsFile();
    if (!file) return false;
    const anchor = currentPasteAnchor();
    const node = addNode("image", anchor.x, anchor.y, false);
    node.image = await fileToDataUrl(file);
    node.fileName = file.name || `clipboard_${timestamp()}.png`;
    node.mime = file.type || "image/png";
    await externalizeImageField(node, "image", "imageAssetId", node.fileName);
    pushHistory();
    render();
    toast("已从剪贴板创建图片节点");
    return true;
  }
  const text = data.getData("text/plain");
  if (text && text.trim()) {
    const anchor = currentPasteAnchor();
    const node = addNode("text", anchor.x, anchor.y, false);
    node.text = text;
    pushHistory();
    render();
    toast("已从剪贴板创建文字节点");
    return true;
  }
  return false;
}

async function copyTextValue(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // WebView、非安全来源或剪贴板权限被拒绝时继续使用兼容复制。
    }
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  return copied;
}

async function copyGeneratedFilePath(node) {
  const outputPath = String(node?.outputPath || "").trim();
  if (!outputPath) return toast("该图片没有可用的本地输出路径");
  try {
    if (!await copyTextValue(outputPath)) throw new Error("copy failed");
    toast("已复制生成图片的完整路径");
  } catch (error) {
    console.error("[生成结果] 复制文件路径失败", error);
    toast("复制路径失败：可能是剪贴板权限受限；请稍后重试");
  }
}

async function generationImageForClipboard(node) {
  const source = await materializeReferenceImage({
    image: node?.generatedImage || node?.image || "",
    assetId: node?.generatedAssetId || node?.imageAssetId || "",
  });
  if (!source) throw new Error("图片内容不可用");
  const blob = await (await fetch(source)).blob();
  const pngDataUrl = blob.type === "image/png" ? source : await fileToDataUrl(await imageBlobAsPng(blob));
  const prompt = await readEmbeddedGenerationPrompt(node);
  return prompt ? embedGenerationMetadata(pngDataUrl, generationMetadataFor(prompt, currentPage()?.name || "项目", node?.taskId)) : pngDataUrl;
}
async function copyGeneratedImage(node) {
  const outputPath = String(node?.outputPath || "").trim();
  try {
    const pngDataUrl = await generationImageForClipboard(node);
    if (window.canvasflowDesktop?.copyImage && window.chrome?.webview) {
      // Native Windows clipboard keeps both PNG bytes (including metadata) and bitmap interoperability.
      await window.canvasflowDesktop.copyImage(outputPath, pngDataUrl);
    } else {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw new Error("当前运行方式不支持图片剪贴板");
      const pngBlob = await (await fetch(pngDataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
    }
    toast("已复制图片，可直接粘贴使用");
  } catch (error) {
    console.error("[生成结果] 复制图片失败", error);
    toast("复制图片失败：图片文件可能已移动，或剪贴板正被其他程序占用；请稍后重试");
  }
}

async function imageBlobAsPng(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("图片转换失败")), "image/png"));
}

async function openGeneratedFileLocation(node) {
  const outputPath = String(node?.outputPath || "").trim();
  if (!outputPath) return toast("该图片没有可用的本地输出路径");
  try {
    if (!window.canvasflowDesktop?.openFileLocation) throw new Error("当前运行方式不支持打开文件夹");
    await window.canvasflowDesktop.openFileLocation(outputPath);
    toast("已打开生成图片所在文件夹");
  } catch (error) {
    console.warn("[生成结果] 打开所在文件夹失败", { outputPath, message: error.message });
    try { await copyTextValue(outputPath); } catch (_) { /* 保留原始错误提示 */ }
    toast("无法打开所在文件夹：可能被系统或杀毒软件拦截；已复制完整路径，请粘贴到资源管理器地址栏");
  }
}

async function openImageNodeLocation(node) {
  const assetId = String(node?.imageAssetId || "").trim();
  if (!assetId) return toast("该图片没有可用的本地素材文件");
  try {
    if (!window.canvasflowDesktop?.openAssetLocation) throw new Error("当前运行方式不支持打开文件夹");
    await window.canvasflowDesktop.openAssetLocation(assetId);
    toast("已打开图片所在文件夹");
  } catch (error) {
    console.warn("[图片节点] 打开所在文件夹失败", { assetId, message: error.message });
    toast("无法打开所在文件夹：" + (error.message || "可能被系统或杀毒软件拦截"));
  }
}

async function editNodeInPs(node) {
  if (!window.canvasflowDesktop?.launchInPs) return toast("仅桌面版支持在 PS 中编辑");
  try {
    const result = await window.canvasflowDesktop.launchInPs(node.outputPath || "", node.fileName || "", node.imageAssetId || node.generatedAssetId || "");
    toast("已请求 Photoshop 打开：" + (result.path || node.fileName || "图片"));
  } catch (error) {
    console.warn("[图片节点] 在 PS 中编辑失败", { message: error.message });
    toast("在 PS 中打开失败：" + error.message);
  }
}

async function openToolNodeFileLocation(node) {
  const outputPath = (Array.isArray(node?.toolOutputFiles) ? node.toolOutputFiles : []).map(p => String(p).trim()).find(Boolean);
  if (!outputPath) return toast("该拓展节点没有可用的输出文件；先执行一次产出文件后再试");
  try {
    if (!window.canvasflowDesktop?.openFileLocation) throw new Error("当前运行方式不支持打开文件夹");
    await window.canvasflowDesktop.openFileLocation(outputPath);
    toast("已打开文件所在文件夹");
  } catch (error) {
    console.warn("[拓展节点] 打开文件所在文件夹失败", { outputPath, message: error.message });
    try { await copyTextValue(outputPath); } catch (_) { /* 保留原始错误提示 */ }
    toast("无法打开文件所在文件夹：可能被系统或杀毒软件拦截；已复制完整路径，请粘贴到资源管理器地址栏");
  }
}

async function resolveNodeImageDataUrl(node) {
  const assetId = node.generatedAssetId || node.imageAssetId || "";
  // 优先读素材仓库的原始完整图：节点上的内嵌图是 canvas 缩略图，重编码会丢失PNG元数据
  if (assetId && window.canvasflowDesktop?.readAsset) {
    try {
      const asset = await window.canvasflowDesktop.readAsset(assetId);
      if (asset?.dataUrl) {
        console.debug("[关键词提取] 使用素材仓库原始图", { nodeId: node.id, assetId });
        return asset.dataUrl;
      }
    } catch (error) {
      console.warn("[关键词提取] 读取素材仓库失败，回退内嵌图", { assetId, message: error.message });
    }
  }
  const direct = String(node.generatedImage || node.image || "");
  if (/^data:image/.test(direct)) {
    console.debug("[关键词提取] 使用节点内嵌图", { nodeId: node.id, hasAssetId: Boolean(assetId) });
    return direct;
  }
  return "";
}

async function readEmbeddedGenerationPrompt(node) {
  if (!node) return "";
  const preservedPrompt = String(node.generationPrompt || "").trim();
  if (preservedPrompt) return preservedPrompt;
  const dataUrl = await resolveNodeImageDataUrl(node);
  if (!dataUrl) return "";
  const meta = readGenerationMetadataFromPng(dataUrl) || {};
  const prompt = String(meta.prompt || "").trim();
  if (prompt) node.generationPrompt = prompt;
  console.debug("[关键词提取] 元数据检测结果", {
    nodeId: node.id,
    metaKeys: Object.keys(meta),
    hasEmbeddedPrompt: Boolean(prompt),
  });
  return prompt;
}

function generationKeywordMenuItems(node) {
  const supported = ["image", "ai-image", "angle-image"].includes(node?.type);
  const hasImage = Boolean(node?.image || node?.imageAssetId || node?.generatedImage || node?.generatedAssetId);
  return supported && hasImage ? [["提取生成所用关键词", () => extractGenerationKeywords(node)]] : [];
}

async function extractGenerationKeywords(node, detectedPrompt = "") {
  if (!node) return;
  const prompt = String(detectedPrompt || await readEmbeddedGenerationPrompt(node)).trim();
  if (!prompt) {
    toast("该图片没有保存生成关键词，无法提取。PNG 格式本身不代表包含关键词记录；旧图缺失的原始关键词无法从图片准确还原。");
    return;
  }
  const textNode = addNode("text", node.x + NODE_WIDTH + 40, node.y, false);
  textNode.text = prompt;
  state.edges.push({ id: uid("e"), from: { node: textNode.id, port: "out" }, to: { node: node.id, port: "in" } });
  state.selected = new Set([textNode.id]);
  console.debug("[关键词提取] 已创建关键词文字节点", { sourceNodeId: node.id, textNodeId: textNode.id, length: prompt.length });
  pushHistory();
  render();
  toast("已提取生成关键词并创建文字节点");
}

const IMAGE_KEYWORD_REVERSE_PROMPT = "分析这张图片并反推出适合再次生成相似图片的中文关键词。只输出最终关键词，不要解释、标题、Markdown 或序号。关键词应准确描述主体、数量、外观特征、动作、构图、镜头视角、画面风格、颜色、光影、材质、背景和画质；不要臆造图片中看不到的品牌、作者或作品名。";

async function reverseImageKeywords(node) {
  if (!node || node.type !== "image" || imageKeywordReversePending.has(node.id)) return;
  const apiType = state.settings.apiType === "apimart" ? "apimart" : "agtoken";
  const model = apiType === "apimart" ? "gpt-6-luna" : "gemini-3-flash";
  const apiKey = apiType === "apimart" ? state.settings.apiKey : state.settings.agtokenApiKey;
  if (!apiKey && !desktop) return toast(`请先在设置中填写并保存 ${apiType === "apimart" ? "APIMart" : "AGToken"} Key`);
  imageKeywordReversePending.add(node.id);
  render();
  try {
    const image = await materializeReferenceImage(nodeImageReference(node), { requireOriginal: true });
    if (!String(image || "").startsWith("data:image/")) throw new Error("图片原文件无法读取，请重新上传后再试");
    const payload = {
      apiType,
      model,
      stream: false,
      messages: [{ role: "user", content: [
        { type: "text", text: IMAGE_KEYWORD_REVERSE_PROMPT },
        { type: "image_url", image_url: { url: image } },
      ] }],
    };
    if (!desktop) payload._apiKey = apiKey || "";
    const response = await apiFetch("/api/chat/completions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    const apiError = typeof data.error === "string" ? data.error : data.error?.message;
    if (response.status === 404 && (!data.error || apiError === "桌面接口不存在")) {
      throw new Error(desktop ? "当前桌面程序没有反推接口，请重新运行「启动CanvasFlow-NET.bat」" : "本机服务没有反推接口，请重启 CanvasFlow 服务");
    }
    if (!response.ok || data.error) throw new Error(apiError || `${apiType === "apimart" ? "APIMart" : "AGToken"} 关键词反推失败（HTTP ${response.status}）`);
    const inner = data?.data && Array.isArray(data.data.choices) ? data.data : data;
    const keywords = chatContentToText(inner?.choices?.[0]?.message?.content).trim();
    if (!keywords) throw new Error("模型没有返回关键词");
    if (findNode(node.id) !== node) return;
    const textNode = addNode("text", node.x + node.w + 40, node.y, false);
    textNode.text = keywords;
    state.edges.push({ id: uid("e"), from: { node: textNode.id, port: "out" }, to: { node: node.id, port: "in" } });
    state.selected = new Set([textNode.id]);
    pushHistory();
    toast(`已用 ${apiType === "apimart" ? "GPT-6 Luna · APIMart" : "Gemini 3 Flash · AGToken"} 反推关键词`);
  } catch (error) {
    console.error("[关键词反推] 失败", { nodeId: node.id, apiType, model, message: error.message });
    toast(`关键词反推失败：${error.message || "请稍后重试"}`);
  } finally {
    imageKeywordReversePending.delete(node.id);
    render();
  }
}

els.viewport.addEventListener("contextmenu", async ev => {
  ev.preventDefault();
  const nodeEl = ev.target.closest(".node");
  const p = screenToWorld(ev.clientX, ev.clientY);
  if (nodeEl) {
    const id = nodeEl.dataset.id;
    if (!state.selected.has(id)) state.selected = new Set([id]);
    const selectedNode = findNode(id);
    const isGroupWithItems = selectedNode?.type === "group" && (selectedNode?.items || (selectedNode?.images && selectedNode?.images.length));
    const extensionSources = state.nodes.filter(node => state.selected.has(node.id) && (
      (node.type === "image" && (node.image || node.imageAssetId)) ||
      ((node.type === "ai-image" || node.type === "angle-image") && (node.generatedImage || node.generatedAssetId))
    ));
    const aiDrawAction = () => {
      const sources = state.nodes.filter(n => state.selected.has(n.id) && n.type !== "output" && n.type !== "screenshot-input");
      if (sources.length) {
        sources.forEach(source => {
          addAiImageNode(source.x + 290, source.y, [source.id]);
        });
      }
    };
    const items = [
      ...(state.selected.size > 1 ? [["AI绘图", aiDrawAction]] : []),
      ...(state.selected.size > 1 ? [["保存为自定义组件", () => saveSelectionAsMultiNodeTemplate()]] : []),
      ...(state.selected.size > 1 ? [["创建编组", () => groupCanvasSelection()], ["多任务", () => groupSelection()]] : []),
      ...(state.nodes.some(node => state.selected.has(node.id) && node.canvasGroupId) ? [["解散编组", () => ungroupCanvasSelection()]] : []),
      ["切换启用/停用", () => toggleDisabled(state.selected)],
      ...((selectedNode?.outputPath || selectedNode?.generatedImage || selectedNode?.generatedAssetId || selectedNode?.image || selectedNode?.imageAssetId || selectedNode?.aiSourceNodeId || selectedNode?.angleSourceNodeId) ? [["复制图片", () => copyGeneratedImage(selectedNode)]] : []),
      ...(selectedNode?.outputPath ? [["打开生成图片所在文件夹", () => openGeneratedFileLocation(selectedNode)]] : []),
      ...(selectedNode?.videoFile && selectedNode?.outputPath ? [["打开视频所在文件夹", () => openGeneratedFileLocation(selectedNode)]] : []),
      ...(selectedNode?.type === "tool-node" && (selectedNode?.toolOutputFiles || []).length ? [["打开文件所在文件夹", () => openToolNodeFileLocation(selectedNode)]] : []),
      ...(selectedNode?.type === "image" && selectedNode?.imageAssetId && window.canvasflowDesktop?.openAssetLocation ? [["打开所在文件夹", () => openImageNodeLocation(selectedNode)]] : []),
      ...(window.canvasflowDesktop?.launchInPs && selectedNode?.type === "image" && (selectedNode?.imageAssetId || selectedNode?.outputPath || selectedNode?.fileName) ? [["在 PS 中编辑", () => editNodeInPs(selectedNode)]] : []),
      ...(window.canvasflowDesktop?.launchInPs && (selectedNode?.type === "ai-image" || selectedNode?.type === "angle-image") && (selectedNode?.generatedAssetId || selectedNode?.outputPath) ? [["在 PS 中编辑", () => editNodeInPs(selectedNode)]] : []),
      ...(state.selected.size === 1 && (selectedNode?.type === "text" || selectedNode?.type === "image" || (selectedNode?.type === "ai-image" && (selectedNode.generatedImage || selectedNode.generatedAssetId))) ? [[selectedNode.type === "text" ? "保存为自定义文字" : "保存为自定义图片", () => saveNodeAsTemplate(selectedNode)]] : []),
      ...(state.selected.size === 1 && selectedNode?.type === "text" && String(selectedNode.text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).length > 1 ? [["按换行拆分为文字节点", () => splitTextNodeByLines(selectedNode)]] : []),
      ...(state.selected.size === 1 && selectedNode?.type === "image" && (selectedNode?.image || selectedNode?.imageAssetId) ? [["编辑图片批注", () => startImageAnnotationEditor(selectedNode)]] : []),
      ...generationKeywordMenuItems(selectedNode),
      ...(state.selected.size > 1 ? [["依次连接", () => connectSelectionInSequence()]] : []),
      ...(state.selected.size > 1 ? [["对齐所选节点", () => tidyNodes()]] : []),
      ...(isGroupWithItems ? [["取消多任务", () => ungroupNode(id)]] : []),
      ...(state.selected.size === 1 ? [["AI绘图", aiDrawAction]] : []),
      ...(extensionSources.length ? [["角度变化", () => {
        extensionSources.forEach(source => addAngleImageNode(source.x + 290, source.y, [source.id]));
      }]] : []),
      ["断开连接", () => disconnectEdges(state.selected)],
      ["复制节点", () => copySelection()],
      ["删除节点", () => deleteNodes(state.selected)],
    ];
    showMenu(ev.clientX, ev.clientY, items);
    renderNodes();
  } else if (state.selected.size > 1) {
    const items = [];
    if (state.clipboard?.nodes?.length) items.push(["粘贴节点", () => pasteNodes(state.clipboard, p)]);
    items.push(
      ["保存为自定义组件", () => saveSelectionAsMultiNodeTemplate()],
      ["创建编组", () => groupCanvasSelection()],
      ["多任务", () => groupSelection()],
      ["依次连接", () => connectSelectionInSequence()],
      ["对齐所选节点", () => tidyNodes()],
      ["AI绘图", () => {
        const sources = state.nodes.filter(n => state.selected.has(n.id) && n.type !== "output" && n.type !== "screenshot-input");
        if (sources.length) {
          sources.forEach(source => {
            addAiImageNode(source.x + 290, source.y, [source.id]);
          });
        }
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
    const multiTemplates = libraryItems("multi");
    items.push(["添加文字节点", () => addNode("text", p.x, p.y)], ["添加调色盘", () => addNode("palette", p.x, p.y)]);
    items.push(
      ["添加图片节点", () => addNode("image", p.x, p.y)],
      ["添加AI绘图节点", () => addAiImageNode(p.x, p.y, [])],
    );
    if (state.settings.showVideoNodeMenu !== false) items.push(["添加AI视频节点", () => addAiVideoNode(p.x, p.y, [])]);
    items.push(["添加对话节点", () => addNode("chat", p.x, p.y)]);
    if (state.settings.showBrowserNodeMenu !== false) items.push(["添加浏览器生图节点", () => addNode("browser-image", p.x, p.y)]);
    if (state.settings.showLocalSdNodeMenu !== false) items.push(["添加本地 SD 节点", () => addNode("local-sd", p.x, p.y, true, { width: 340, height: 430 })]);
    items.push(
      ["自定义节点", [
        ["自定义文字", textTemplates.length ? textTemplates.map(template => [template.name, () => createNodeFromTemplate("text", template, p.x, p.y)]) : [["暂无素材", null]]],
        ["自定义图片", imageTemplates.length ? imageTemplates.map(template => [template.name, () => createNodeFromTemplate("image", template, p.x, p.y)]) : [["暂无素材", null]]],
        ["自定义组件", multiTemplates.length ? multiTemplates.map(template => [template.name, () => createNodesFromMultiTemplate(template, p.x, p.y)]) : [["暂无素材", null]]],
      ]],
      ["拓展", toolMenuItems(p)],
      ["角度变化", () => addAngleImageNode(p.x, p.y, [])],
      ...(state.settings.showScreenshotNodeMenu !== false ? [["添加截图功能节点", () => addNode("screenshot-input", p.x, p.y)]] : []),
      ["节点对齐", () => tidyNodes()],
    );
    showMenu(ev.clientX, ev.clientY, items);
  }
});

function toolMenuItems(p) {
  if (Date.now() - toolExtensionCache.at > 30000) {
    fetchToolExtensions().then(() => renderNodes());
  }
  const items = enabledToolExtensions().map(ext => [ext.name || ext.id, () => addToolNode(ext, p.x, p.y)]);
  if (!items.length) {
    return [["拓展服务未启动或暂无拓展", null]];
  }
  return items;
}

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
  if (ev.key === "Alt") {
    altDown = true;
    if (!ev.target.matches?.("textarea,input,select,[contenteditable='true']")) ev.preventDefault();
    return;
  }
  if (lightboxPainting && (ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
    ev.preventDefault();
    undoLightboxPaint();
    return;
  }
  if (ev.target.matches("textarea,input,select")) return;
  const annotationTarget = ev.target.closest?.(".canvas-annotation");
  if (annotationTarget?.isContentEditable) return; // 仅编辑状态交给文本输入；选中状态仍响应 Delete
  if (ev.code === "Space") { spaceDown = true; ev.preventDefault(); }
  if (ev.key === "Delete") {
    if (!deleteSelectedAnnotation()) deleteNodes(state.selected);
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
    ev.preventDefault();
    if (ev.shiftKey) redo(); else undo();
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") redo();
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
    ev.preventDefault();
    saveJson();
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "g") {
    ev.preventDefault();
    groupSelection();
  }
});

window.addEventListener("keyup", ev => {
  if (ev.key === "Alt") altDown = false;
  if (ev.code === "Space") spaceDown = false;
});

window.addEventListener("blur", () => {
  altDown = false;
  spaceDown = false;
});

// 阻止 Ctrl+滚轮 触发浏览器页面缩放：本工具是固定尺寸画布界面，页面缩放会破坏布局；
// 编辑器内 Ctrl+滚轮属于缩放图片（画布自己的 wheel 处理不受影响）
window.addEventListener("wheel", ev => { if (ev.ctrlKey || ev.metaKey) ev.preventDefault(); }, { passive: false, capture: true });

els.viewport.addEventListener("pointerdown", ev => {
  if (ev.target.closest("button,input,textarea,select,video,[contenteditable='true']")) return;
  els.viewport.focus({ preventScroll: true });
}, true);

window.addEventListener("copy", ev => {
  if (ev.target.closest?.(".canvas-annotation")) return; // 标注编辑中的复制走原生行为
  if (ev.target.matches("textarea,input,select") || !state.selected.size || !ev.clipboardData) return;
  ev.preventDefault();
  void copySelection(ev);
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
  if (ev.target.closest?.(".canvas-annotation")) return; // 标注编辑中的粘贴走原生行为
  if (internalNodeCopy && state.clipboard?.nodes?.length) {
    ev.preventDefault();
    pasteNodes(state.clipboard);
    return;
  }
  // 其他实例/标签页复制的节点：数据藏在系统剪贴板 text/html 的注释里
  const crossCopy = decodeCanvasflowNodesHtml(data?.getData("text/html"));
  if (crossCopy && (crossCopy.nodes.length || crossCopy.edges.length)) {
    ev.preventDefault();
    if (!crossCopy.copyId || crossCopy.copyId !== state.clipboard?.copyId) state.clipboard = crossCopy;
    pasteNodes(state.clipboard);
    if (desktop) scheduleDesktopAssetMigration();
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
  return !!file && (/^image\/(?:jpeg|png|webp|gif)$/i.test(String(file.type || "")) || /\.(png|jpe?g|webp|gif)$/i.test(file.name || ""));
}

async function showNodeLightbox(node) {
  if (!node) return;
  try {
    const references = [];
    if (node.type === "group" || node.type === "folder") {
      for (const image of node.images || []) references.push({ image: image.image, assetId: image.assetId || "", fileName: image.fileName || "", _nodeId: node.id });
      for (const item of node.items || []) {
        if (item.type === "image" && (item.image || item.imageAssetId)) references.push({ image: item.image, assetId: item.imageAssetId || "", fileName: item.fileName || "", _nodeId: node.id });
        if ((item.type === "ai-image" || item.type === "angle-image") && (item.generatedImage || item.generatedAssetId)) references.push({ image: item.generatedImage, assetId: item.generatedAssetId || "", fileName: item.fileName || "", _nodeId: node.id });
      }
    } else if (node.type === "ai-image" || node.type === "angle-image") {
      if (node.generatedImage || node.generatedAssetId) references.push({ image: node.generatedImage, assetId: node.generatedAssetId || "", fileName: node.fileName || "", _nodeId: node.id });
    } else if (node.image || node.imageAssetId) {
      references.push({ image: node.image, assetId: node.imageAssetId || "", fileName: node.fileName || "", _nodeId: node.id });
    }
    if (!references.length) return;
    const originals = [];
    for (const reference of references) {
      const original = await materializeReferenceImage(reference, { requireOriginal: true });
      if (original) originals.push(original);
    }
    if (originals.length) showLightbox(originals, node.id);
  } catch (error) {
    console.error("[高清预览] 原图读取失败", { nodeId: node.id, message: error.message });
    toast(`原图读取失败，已阻止使用缩略图编辑。请检查 data 目录或重新上传图片。${error.message || ""}`);
  }
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
    const resp = await apiFetch("/api/download-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: url }) });
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
  const nodeEl = ev.target.closest(".node");
  if (!nodeEl) return;
  if (ev.dataTransfer) ev.dataTransfer.setData("application/x-canvasflow-internal-image", "1");
  ev.preventDefault();
  ev.stopPropagation();
  clearImageDragState();
  console.info("[节点拖动] 已阻止浏览器原生拖放", { nodeId: nodeEl.dataset.id, source: ev.target.tagName });
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
      delete node.generationPrompt;
      delete node.generatedAssetId;
      delete node.generatedImage;
      delete node.imageAssetId;
      node.fileName = sources[0].fileName;
      node.mime = sources[0].mime;
      await externalizeImageField(node, "image", "imageAssetId", node.fileName);
      state.selected = new Set([node.id]);
      pushHistory();
      render();
      toast("已替换图片节点");
      return;
    }
    const p = screenToWorld(ev.clientX, ev.clientY);
    const cols = Math.min(sources.length, 4);
    const createdIds = [];
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      const node = addNode("image", p.x + (i % cols) * 280, p.y + Math.floor(i / cols) * IMAGE_NODE_VERTICAL_STEP, false);
      node.image = source.image;
      node.fileName = source.fileName;
      node.mime = source.mime;
      await externalizeImageField(node, "image", "imageAssetId", node.fileName);
      createdIds.push(node.id);
    }
    state.selected = new Set(createdIds);
    pushHistory();
    render();
    toast(`已拖入 ${sources.length} 张图片`);
  } catch (err) {
    console.error("[拖入] 图片读取失败", err);
    toast(`图片拖入失败：${err.message || "文件无法读取"}；请检查图片格式或网络后重试`);
  }
});

function createNewPage(mode = "ai", groupId = null) {
  saveCurrentPage();
  savePageHistory();
  resetGraphNavigation();
  const page = blankPage(`项目${state.nextPageNum++}`, mode);
  page.groupId = groupId || UNGROUPED_GROUP_ID;
  state.pages.push(page);
  state.activePageId = page.id;
  state._deletedPage = null;
  restoreData(page.data);
  state.history = [cloneData()];
  state.future = [];
  updateUndoRedo();
  markDirty();
  render();
  toast("已新建 AI 绘图项目");
  const foreign = countForeignUnsettledTasks();
  if (foreign) toast(`其他项目仍有 ${foreign} 个任务运行中，完成后结果会自动落回原项目`);
}

function newPage(groupId = null) {
  // 任务不再阻止新建项目:运行中的任务完成后自动落回原项目(pageId 定位)
  createNewPage("ai", groupId);
}


function requestDeletePage(id) {
  // 删除前先切到该项目画布让用户看清内容，再弹窗确认；明显删不了的直接提示，不做切换
  const page = state.pages.find(item => item.id === id);
  if (!page) return;
  if (aiTaskQueue.items.some(task => task.pageId === id && !queueTaskIsSettled(task))) {
    toast("该项目仍有未完成任务，请等任务完成或先取消再删除");
    return;
  }
  const visiblePages = state.pages;
  if (visiblePages.length <= 1) {
    toast("至少保留一个项目");
    return;
  }
  if (id !== state.activePageId) switchPage(id);
  projectPeek = null; // 悬停预览结束：停在要删的项目上，不回跳原项目
  els.projectMenu.classList.add("hidden");
  const text = "确定删除项目“" + page.name + "”吗？删除后可按 Ctrl+Z 撤回。";
  if (!window.confirm(translateUiString(text))) return;
  deletePage(id);
}

function deletePage(id) {
  // 只拦要删的那个项目自己的任务;其他项目的任务照常运行并落回各自项目
  if (aiTaskQueue.items.some(task => task.pageId === id && !queueTaskIsSettled(task))) {
    toast("该项目仍有未完成任务，请等任务完成或先取消再删除");
    return;
  }
  const visiblePages = state.pages;
  if (visiblePages.length <= 1) {
    toast("至少保留一个项目");
    return;
  }
  const idx = state.pages.findIndex(p => p.id === id);
  if (idx === -1) return;
  saveCurrentPage();
  savePageHistory();
  const removed = state.pages.splice(idx, 1)[0];
  state._deletedPage = { page: removed, index: idx };
  if (state.activePageId === id) {
    resetGraphNavigation();
    const fallbackPages = state.pages;
    state.activePageId = (fallbackPages[Math.min(idx, fallbackPages.length - 1)] || fallbackPages[0]).id;
    const page = currentPage();
    if (page) restoreData(page.data);
    loadPageHistory();
  }
  updateUndoRedo();
  markDirty();
  render();
  toast("已删除项目（Ctrl+Z 可撤回）");
}

function switchPage(id) {
  if (id === state.activePageId) return;
  // 任务运行中允许切换:非激活页的任务完成后由 pageId 定位落回原项目
  const targetPage = state.pages.find(page => page.id === id);
  if (!targetPage) return;
  saveCurrentPage();
  savePageHistory();
  resetGraphNavigation();
  state.activePageId = id;
  state._deletedPage = null;
  const page = currentPage();
  restoreData(page.data);
  loadPageHistory();
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
  const finish = save => {
    if (save) {
      const name = input.value.trim();
      if (name) page.name = name;
      markDirty();
    }
    input.replaceWith(els.projectNameBtn);
    renderPageTabs();
  };
  attachProjectRenameInputEvents(input, finish);
}

function persistPages() {
  const snapshot = JSON.parse(JSON.stringify({ pages: state.pages, groups: state.groups, activePageId: state.activePageId, nextPageNum: state.nextPageNum, uiLanguage, onboardingSeenVersion }));
  for (const page of snapshot.pages || []) {
    if (page.data?.settings) {
      page.data.settings.apiKey = "";
      page.data.settings.agtokenApiKey = "";
      delete page.data.settings.chatCustomKeys;
    }
    delete page._history;
    delete page._future;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Large base64 images can exceed local storage; JSON save still works.
  }
  if (desktop) {
    if (desktopStateTimer) clearTimeout(desktopStateTimer);
    desktopStateTimer = window.setTimeout(() => { desktopStateTimer = null; persistDesktopStateNow().catch(error => console.error("[项目状态] 保存失败", error)); }, 300);
  }
  scheduleAutoBackup();
}

async function persistDesktopStateNow() {
  saveCurrentPage();
  const snapshot = desktopStateSnapshot();
  const response = await apiFetch("/api/app-state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || `HTTP ${response.status}`);
  return true;
}

function desktopStateSnapshot() {
  const snapshot = JSON.parse(JSON.stringify({ pages: state.pages, groups: state.groups, activePageId: state.activePageId, nextPageNum: state.nextPageNum, uiLanguage, onboardingSeenVersion, updatedAt: Date.now() }));
  for (const page of snapshot.pages || []) {
    if (page.data?.settings) {
      page.data.settings.apiKey = "";
      page.data.settings.agtokenApiKey = "";
      delete page.data.settings.chatCustomKeys;
    }
    delete page._history;
    delete page._future;
  }
  return snapshot;
}

function autoBackupContent() {
  saveCurrentPage();
  const data = JSON.parse(JSON.stringify({ pages: state.pages, groups: state.groups, activePageId: state.activePageId, globalLibrary }));
  for (const page of data.pages || []) {
    if (page.data?.settings) {
      page.data.settings.apiKey = "";
      page.data.settings.agtokenApiKey = "";
      delete page.data.settings.chatCustomKeys;
    }
    delete page._history;
    delete page._future;
  }
  return JSON.stringify(data, null, 2);
}

async function writeAutoBackup(reason = "change") {
  if (!autoBackupReady) return false;
  const started = Date.now();
  const fileName = autoBackupFileName();
  try {
    const content = autoBackupContent();
    const resp = await apiFetch("/api/auto-backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fileName, content }),
    });
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || !result.success) throw new Error(result.error || `HTTP ${resp.status}`);
    console.info("[自动备份] 保存完成", { reason, file: fileName, bytes: content.length, elapsedMs: Date.now() - started });
    return true;
  } catch (err) {
    console.error("[自动备份] 保存失败", { reason, file: fileName, message: err.message, elapsedMs: Date.now() - started });
    return false;
  }
}

function scheduleAutoBackup() {
  if (!autoBackupReady) return;
  if (autoBackupTimer) clearTimeout(autoBackupTimer);
  autoBackupTimer = window.setTimeout(() => {
    autoBackupTimer = null;
    writeAutoBackup("change");
  }, 2000);
}

function updateText(zh, en) {
  return uiLanguage === "en" ? en : zh;
}

// 更新提醒免打扰（自 2.7.8 界面包移植）：localStorage 全局开关，只静音启动自动弹窗，手动"检查更新"不受影响
const UPDATE_QUIET_KEY = "canvasflow-update-quiet";

function updateRemindersMuted() {
  return localStorage.getItem(UPDATE_QUIET_KEY) === "1";
}

function setUpdateRemindersMuted(muted) {
  localStorage.setItem(UPDATE_QUIET_KEY, muted ? "1" : "0");
  $("updateQuietToggle").checked = muted;
}

function showStartupUpdatePrompt(message, canHotUpdate) {
  const dialog = $("updatePromptDialog");
  $("updatePromptMessage").textContent = message;
  $("updatePromptConfirm").textContent = canHotUpdate
    ? updateText("立即更新", "Update now") : updateText("打开下载页", "Open download page");
  dialog.returnValue = "";
  return new Promise(resolve => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true });
    dialog.showModal();
  });
}

function renderCheckedUpdateStatus(data = lastUpdateCheckResult) {
  if (!data || !els.updateStatus) return;
  els.updateStatus.textContent = data.hasUpdate
    ? updateText(`发现新版本 ${data.latestVersion}（当前 ${data.currentVersion}）`, `Version ${data.latestVersion} is available (current: ${data.currentVersion})`)
    : updateText(`当前版本 ${data.currentVersion}，已经是最新版`, `Version ${data.currentVersion} is up to date`);
}

async function checkForUpdates({ silent = false, prompt = false } = {}) {
  if (!els.updateStatus || updateCheckInFlight || (updateCheckStarted && silent)) return null;
  updateCheckInFlight = true;
  updateCheckStarted = true;
  els.checkUpdateBtn.disabled = true;
  els.updateStatus.textContent = updateText("正在连接 GitHub 检查更新…", "Checking GitHub for updates…");
  try {
    const resp = await apiFetch("/api/update/check", { cache: "no-store" });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    lastUpdateCheckResult = data;
    els.updateActions.classList.toggle("hidden", !data.hasUpdate);
    els.installWebUpdateBtn?.classList.toggle("hidden", !data.hasUpdate || !data.canHotUpdate || !desktop?.applyWebUpdate);
    els.releasePageLink.href = data.pageUrl || "https://github.com/wuxinliuyun-art/canvasflow/releases";
    renderCheckedUpdateStatus(data);
    console.info("[自动更新] 检查完成", { current: data.currentVersion, latest: data.latestVersion, hasUpdate: data.hasUpdate, asset: data.asset && data.asset.name });
    if (data.hasUpdate && (!silent || (prompt && !updateRemindersMuted()))) {
      const canHotUpdate = data.canHotUpdate && Boolean(desktop?.applyWebUpdate);
      const message = canHotUpdate
        ? updateText(
          `发现新版本 ${data.latestVersion}（当前 ${data.currentVersion}）。更新前会保存并备份当前项目，完成后画布会自动重新载入。现在更新吗？`,
          `Version ${data.latestVersion} is available (current: ${data.currentVersion}). Your project will be saved and backed up, then the canvas will reload after updating. Update now?`
        )
        : updateText(
          `发现新版本 ${data.latestVersion}（当前 ${data.currentVersion}），需要下载完整安装包。现在打开下载页面吗？`,
          `Version ${data.latestVersion} is available (current: ${data.currentVersion}) and requires the full installer. Open the download page now?`
        );
      const action = silent ? await showStartupUpdatePrompt(message, canHotUpdate)
        : window.confirm(message) ? "update" : "later";
      if (action === "quiet") setUpdateRemindersMuted(true);
      if (action === "update") {
        if (canHotUpdate) await applyWebUpdate({ confirmed: true });
        else els.releasePageLink.click();
      }
    } else if (!data.hasUpdate && !silent) {
      toast(updateText(`当前版本 ${data.currentVersion}，已经是最新版`, `Version ${data.currentVersion} is up to date`));
    }
    return data;
  } catch (err) {
    els.updateStatus.textContent = updateText("检查失败；可能是网络或 GitHub 暂时不可用，请稍后重试。", "Update check failed. GitHub or the network may be temporarily unavailable; try again later.");
    if (!silent) toast(updateText(`无法检查更新：${err.message}；请检查网络后重试`, `Unable to check for updates: ${err.message}. Check the network and try again.`));
    console.error("[自动更新] 检查失败", { message: err.message });
    return null;
  } finally {
    updateCheckInFlight = false;
    els.checkUpdateBtn.disabled = false;
  }
}

window.addEventListener("pagehide", () => {
  if (desktop) return; // Desktop exit uses the acknowledged save handshake instead of an HTTP beacon.
  if (!autoBackupReady || !navigator.sendBeacon) return;
  if (autoBackupTimer) clearTimeout(autoBackupTimer);
  autoBackupTimer = null;
  try {
    const fileName = autoBackupFileName();
    const content = autoBackupContent();
    const payload = new Blob([JSON.stringify({ name: fileName, content })], { type: "application/json" });
    const queued = navigator.sendBeacon("/api/auto-backup", payload);
    console.info("[自动备份] 页面关闭补发", { file: fileName, bytes: content.length, queued });
  } catch (err) {
    console.error("[自动备份] 页面关闭补发失败", { file: autoBackupFileName(), message: err.message });
  }
});

window.addEventListener("cut", async ev => {
  if (ev.target.matches("textarea,input,select") || !state.selected.size || !ev.clipboardData) return;
  ev.preventDefault();
  const ids = new Set(state.selected);
  const pageId = state.activePageId;
  if (await copySelection(ev) && state.activePageId === pageId) deleteNodes(ids);
});

function loadPagesFromStorage(savedState = null) {
  try {
    const raw = savedState ? null : localStorage.getItem(STORAGE_KEY);
    if (!savedState && !raw) return false;
    const saved = savedState || JSON.parse(raw);
    if (!Array.isArray(saved.pages) || !saved.pages.length) return false;
    state.pages = saved.pages.map(page => ({ ...page, mode: "ai" }));
    normalizeGroups(saved.groups);
    state.activePageId = saved.activePageId || state.pages[0].id;
    state.nextPageNum = saved.nextPageNum || (state.pages.length + 1);
    let page = currentPage();
    if (!page) page = state.pages[0];
    if (!page) {
      page = blankPage(`项目${state.nextPageNum++}`, "ai");
      state.pages.push(page);
    }
    state.activePageId = page.id;
    restoreData(page.data);
    if (saved.uiLanguage) uiLanguage = saved.uiLanguage;
    onboardingSeenVersion = Number.isFinite(Number(saved.onboardingSeenVersion)) ? Number(saved.onboardingSeenVersion) : ONBOARDING_VERSION;
    return true;
  } catch {
    return false;
  }
}

async function loadDesktopState() {
  if (!desktop) return null;
  try {
    const response = await apiFetch("/api/app-state", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const saved = (await response.json()).state || null;
    if (!saved || !Number.isFinite(Number(saved.updatedAt))) {
      console.info("[项目状态] 旧版状态缺少更新时间，优先使用WebView2中的较新项目并重新建立桌面状态");
      return null;
    }
    return saved;
  } catch (error) {
    console.error("[项目状态] 无法读取本地文件", error);
    toast("本地项目状态读取失败：将尝试浏览器备份；请检查程序目录写入权限");
    return null;
  }
}


$("newCanvasBtn").onclick = newPage;
$("saveJsonBtn").onclick = saveJson;
$("loadJsonBtn").onclick = () => els.loadJson.click();
$("autoOutputBtn").onclick = autoAddAiNodes;
// ===== UI 颜色设置事件 =====
function syncUiColorInputs() {
  const uc = uiColorsActiveMap();
  UI_COLOR_FIELDS.forEach(f => {
    const input = $("uiColor" + f.key.charAt(0).toUpperCase() + f.key.slice(1));
    if (!input) return;
    const v = uc[f.key];
    const fallback = state.settings.theme === "dark" ? f.darkDefault : f.lightDefault;
    input.value = v && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
    input.disabled = false;
  });
}
UI_COLOR_FIELDS.forEach(f => {
  const input = $("uiColor" + f.key.charAt(0).toUpperCase() + f.key.slice(1));
  if (!input) return;
  input.addEventListener("input", () => {
    const map = uiColorsActiveMap();
    map[f.key] = input.value;
    applyUiColors();
    pushHistory();
  });
  const reset = document.querySelector(`[data-ui-color="${f.key}"]`);
  if (reset) reset.onclick = () => {
    const map = uiColorsActiveMap();
    delete map[f.key];
    applyUiColors();
    syncUiColorInputs();
    pushHistory();
  };
});
// ===== 快捷色板(原生取色器不可用/失灵时的备用路径) =====
const UI_COLOR_PRESETS = ["#000000", "#1c1c21", "#131316", "#2a2b2f", "#f4f4f5", "#78aaff", "#22c55e", "#f59e0b", "#ff3b30", "#e91e63", "#9c27b0", "#00bcd4"];
let uiColorPopoverTarget = null;
function uiColorApplyKey(key, value) {
  const map = uiColorsActiveMap();
  map[key] = value;
  applyUiColors();
  syncUiColorInputs();
  pushHistory();
}
document.querySelectorAll("[data-ui-color-alt]").forEach(btn => {
  btn.onclick = ev => {
    ev.stopPropagation();
    uiColorPopoverTarget = btn.getAttribute("data-ui-color-alt");
    const pop = $("uiColorPopover");
    const sw = pop.querySelector(".ui-color-popover-swatches");
    sw.innerHTML = "";
    UI_COLOR_PRESETS.forEach(color => {
      const b = document.createElement("button");
      b.type = "button";
      b.style.background = color;
      b.title = color;
      b.onclick = () => {
        uiColorApplyKey(uiColorPopoverTarget, color);
        pop.classList.add("hidden");
      };
      sw.appendChild(b);
    });
    $("uiColorHex").value = "";
    const r = btn.getBoundingClientRect();
    pop.classList.remove("hidden");
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 200)) + "px";
    pop.style.top = Math.min(r.bottom + 6, window.innerHeight - 140) + "px";
  };
});
$("uiColorHexApply").onclick = () => {
  const v = ($("uiColorHex").value || "").trim();
  if (!/^#[0-9a-f]{6}$/i.test(v) || !uiColorPopoverTarget) return toast("请输入 # 开头的 6 位十六进制颜色");
  uiColorApplyKey(uiColorPopoverTarget, v);
  $("uiColorPopover").classList.add("hidden");
};
document.addEventListener("click", ev => {
  const pop = $("uiColorPopover");
  if (!pop || pop.classList.contains("hidden")) return;
  if (ev.target.closest("#uiColorPopover") || ev.target.closest("[data-ui-color-alt]")) return;
  pop.classList.add("hidden");
});
const uiColorResetAll = $("uiColorResetAll");
if (uiColorResetAll) uiColorResetAll.onclick = () => {
  const which = state.settings.theme === "dark" ? "dark" : "light";
  state.settings.uiColors = state.settings.uiColors || {};
  state.settings.uiColors[which] = {};
  applyUiColors();
  syncUiColorInputs();
  pushHistory();
};
function setAppTheme(theme) {
  if (state.settings.theme === theme) return;
  state.settings.theme = theme;
  pushHistory();
  render();
  if (!els.settings.classList.contains("hidden")) syncUiColorInputs();
  scheduleOnboardingLayout();
}
$("themeBtn").onclick = () => setAppTheme(state.settings.theme === "light" ? "dark" : "light");
$("darkThemeToggle").onchange = () => setAppTheme($("darkThemeToggle").checked ? "dark" : "light");
const SIDEBAR_PAIR_MIN_WIDTH = 1800;

function syncSidebarLayoutClasses() {
  const settingsOpen = !els.settings.classList.contains("hidden");
  const queueOpen = !els.taskQueuePanel.classList.contains("hidden");
  document.body.classList.toggle("settings-sidebar-open", settingsOpen);
  document.body.classList.toggle("queue-sidebar-open", queueOpen);
  $("settingsBtn").classList.toggle("active", settingsOpen);
  els.taskQueueBtn.classList.toggle("active", queueOpen);
}

function setSettingsSidebarOpen(open) {
  if (open && window.innerWidth < SIDEBAR_PAIR_MIN_WIDTH && !els.taskQueuePanel.classList.contains("hidden")) {
    setTaskQueueOpen(false);
  }
  els.settings.classList.toggle("hidden", !open);
  if (open) { syncSettingsPanel(); fetchBalance(); }
  syncSidebarLayoutClasses();
}

function setTaskQueueOpen(open) {
  if (open && window.innerWidth < SIDEBAR_PAIR_MIN_WIDTH && !els.settings.classList.contains("hidden")) {
    setSettingsSidebarOpen(false);
  }
  els.taskQueuePanel.classList.toggle("hidden", !open);
  syncSidebarLayoutClasses();
}

$("settingsBtn").onclick = () => setSettingsSidebarOpen(els.settings.classList.contains("hidden"));
$("closeSettingsBtn").onclick = () => setSettingsSidebarOpen(false);
window.addEventListener("resize", () => {
  if (window.innerWidth < SIDEBAR_PAIR_MIN_WIDTH && !els.settings.classList.contains("hidden") && !els.taskQueuePanel.classList.contains("hidden")) {
    setTaskQueueOpen(false);
  } else {
    syncSidebarLayoutClasses();
  }
});

function switchSettingsTab(name) {
  var btns = els.settings.querySelectorAll(".settings-tab-btn");
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle("active", btns[i].getAttribute("data-tab") === name);
  }
  var pages = els.settings.querySelectorAll(".tab-page");
  for (var j = 0; j < pages.length; j++) {
    pages[j].classList.toggle("hidden", pages[j].getAttribute("data-tab") !== name);
  }
  if (name === "extensions") {
    renderExtensionsPage();
    refreshMcpStatus();
  }
  if (name === "appearance") syncUiColorInputs();
  if (name === "aichat") renderChatSettingsTab();
  if (name === "extensions") window.LocalSD?.syncSettings?.();
}

let lastMcpStatus = null;

function mcpCopy(zh, en) {
  return uiLanguage === "en" ? en : zh;
}

function mcpLaunchCommand(status = lastMcpStatus || {}) {
  const directory = status.directory || "CanvasFlow安装目录\\app\\mcp";
  const executable = `${directory}\\CanvasFlow.Mcp.exe`;
  const project = `${directory}\\CanvasFlow.Mcp.csproj`;
  return status.mode === "source"
    ? `dotnet run --project "${project}"`
    : `"${executable}"`;
}

function renderMcpStatus(status) {
  if (!els.mcpStatusBadge) return;
  lastMcpStatus = status || {};
  let stateName = "ready";
  let badge = mcpCopy("服务可用", "Service ready");
  let description = mcpCopy("MCP 服务文件已就绪。", "MCP service files are ready.");
  if (!desktop?.getMcpStatus) {
    stateName = "unavailable";
    badge = mcpCopy("仅桌面版", "Desktop only");
    description = mcpCopy("浏览器模式不能检测本机 MCP 文件或客户端连接；请使用 Windows 桌面版查看准确状态。", "Browser mode cannot inspect local MCP files or client connections. Use the Windows desktop app for an accurate status.");
  } else if (!status?.filesAvailable) {
    stateName = "unavailable";
    badge = mcpCopy("缺少文件", "Files missing");
    description = mcpCopy("当前 CanvasFlow 安装包不含 MCP 文件，请安装最新完整版本。", "This CanvasFlow build does not include the MCP files. Install the latest full version.");
  } else if (status?.registered) {
    description = mcpCopy("MCP 服务文件已就绪；Codex 已连接。其他客户端也可以使用下方启动命令。", "MCP service files are ready and Codex is connected. Other clients can also use the launch command below.");
  } else if (status?.codexAvailable) {
    description = mcpCopy("MCP 服务文件已就绪；Codex 尚未连接，可用快捷按钮连接。其他客户端请使用下方启动命令。", "MCP service files are ready. Codex is not connected yet; use the shortcut button. Other clients can use the launch command below.");
  } else {
    description = mcpCopy("MCP 服务文件已就绪；未检测到 Codex CLI。其他客户端仍可使用下方启动命令。", "MCP service files are ready. Codex CLI was not detected, but other clients can still use the launch command below.");
  }
  els.mcpStatusBadge.dataset.state = stateName;
  els.mcpStatusBadge.textContent = badge;
  els.mcpStatusText.textContent = description;
  const directory = status?.directory || "";
  els.mcpLocation.hidden = !directory;
  els.mcpLocation.textContent = directory ? `${mcpCopy("MCP 位置", "MCP location")}: ${directory}` : "";
  els.mcpInstallBtn.disabled = !desktop?.installMcp || !status?.codexAvailable || !status?.filesAvailable;
  els.mcpUninstallBtn.disabled = !desktop?.uninstallMcp || !status?.registered;
  els.mcpOpenFolderBtn.disabled = !desktop?.openOutputFolder || !directory || !status?.filesAvailable;
  els.mcpLaunchCommand.value = mcpLaunchCommand(status);
  if (els.mcpApiSiteSelect) els.mcpApiSiteSelect.value = status?.apiSite === "agtoken" ? "agtoken" : "apimart";
  if (els.browserExtensionStatus) {
    const available = Boolean(status?.browserExtensionDirectory && desktop?.openOutputFolder);
    els.browserExtensionStatus.dataset.state = available ? "ready" : "unavailable";
    els.browserExtensionStatus.textContent = available ? mcpCopy("文件可用", "Files ready") : mcpCopy("不可用", "Unavailable");
    els.browserExtensionStatus.title = available
      ? mcpCopy("插件文件可用；不代表浏览器已经加载或连接", "Extension files are available; this does not mean the browser has loaded or connected it")
      : mcpCopy("当前运行方式无法定位浏览器插件文件", "The extension files cannot be located in this mode");
  }
}

async function refreshMcpStatus() {
  if (!els.mcpStatusBadge) return;
  els.mcpStatusBadge.dataset.state = "checking";
  els.mcpStatusBadge.textContent = mcpCopy("检查中", "Checking");
  els.mcpStatusText.textContent = mcpCopy("正在检查 MCP 服务文件与客户端连接…", "Checking MCP service files and client connections…");
  if (!desktop?.getMcpStatus) return renderMcpStatus({});
  try {
    renderMcpStatus(await desktop.getMcpStatus());
  } catch (error) {
    renderMcpStatus({ codexAvailable: false, filesAvailable: false });
    els.mcpStatusText.textContent = `${mcpCopy("检查失败", "Check failed")}: ${error.message}`;
  }
}

async function runMcpAction(kind) {
  const installing = kind === "install";
  const confirmation = installing
    ? mcpCopy("将把 CanvasFlow MCP 连接到 Codex；已有同名 Codex 注册会被替换。继续吗？", "Connect CanvasFlow MCP to Codex? An existing Codex registration with the same name will be replaced.")
    : mcpCopy("从 Codex 中移除 CanvasFlow MCP？这不会删除 CanvasFlow、项目、密钥或图片。", "Remove CanvasFlow MCP from Codex? This will not delete CanvasFlow, projects, keys, or images.");
  if (!window.confirm(confirmation)) return;
  const buttons = [els.mcpInstallBtn, els.mcpUninstallBtn, els.mcpOpenFolderBtn, els.mcpRefreshBtn, els.mcpCopyLaunchCommandBtn].filter(Boolean);
  buttons.forEach(button => { button.disabled = true; });
  els.mcpStatusBadge.dataset.state = "checking";
  els.mcpStatusBadge.textContent = installing ? mcpCopy("连接中", "Connecting") : mcpCopy("移除中", "Removing");
  try {
    const result = installing ? await desktop.installMcp() : await desktop.uninstallMcp();
    renderMcpStatus(result);
    toast(installing ? mcpCopy("CanvasFlow MCP 已连接到 Codex，请重启 Codex 或新建任务", "CanvasFlow MCP connected to Codex. Restart Codex or start a new task") : mcpCopy("CanvasFlow MCP 已从 Codex 移除", "CanvasFlow MCP removed from Codex"));
  } catch (error) {
    toast(`${installing ? mcpCopy("连接失败", "Connection failed") : mcpCopy("移除失败", "Removal failed")}: ${error.message}`);
    await refreshMcpStatus();
  } finally {
    if (!lastMcpStatus) buttons.forEach(button => { button.disabled = false; });
  }
}

const onboardingState = { active: false, step: 0, manual: false, settingsWasOpen: false, layoutFrame: 0 };

function onboardingCopy(zh, en) {
  return uiLanguage === "en" ? en : zh;
}

function onboardingIcon(selector, fallback = "•") {
  const source = document.querySelector(selector);
  const svg = source?.querySelector("svg");
  return svg ? svg.outerHTML : `<span class="onboarding-text-icon">${fallback}</span>`;
}

function onboardingSteps() {
  return [
    {
      selector: ".project-shell",
      title: onboardingCopy("项目入口", "Projects"),
      description: onboardingCopy("从这里管理当前画板。单击项目名称可以切换项目，双击可以重命名。", "Manage the current canvas here. Click the project name to switch projects, or double-click it to rename."),
      items: [
        [onboardingIcon("#projectNameBtn", "P"), onboardingCopy("项目", "Projects"), onboardingCopy("切换、重命名和管理项目", "Switch, rename, and manage projects")],
        [onboardingIcon("#newCanvasBtn", "+"), onboardingCopy("新建项目", "New Project"), onboardingCopy("创建一个新的 AI 绘图画板", "Create a new AI image canvas")],
      ],
    },
    {
      selector: ".composer-dock",
      title: onboardingCopy("底部操作区", "Bottom Controls"),
      description: onboardingCopy("在这里快速创建内容、整理连接并查看正在执行的任务。", "Quickly create content, organize connections, and review active tasks here."),
      items: [
        [`<span class="onboarding-text-icon">T</span>`, onboardingCopy("文字与图片", "Text & Images"), onboardingCopy("输入文字创建文字节点，或上传图片", "Enter text to create a text node, or upload images")],
        [onboardingIcon("#composerSubmitBtn", "+"), onboardingCopy("创建", "Create"), onboardingCopy("把当前输入添加到画布", "Add the current input to the canvas")],
        [onboardingIcon("#autoOutputBtn", "↗"), onboardingCopy("一键连接", "Connect in Sequence"), onboardingCopy("按顺序连接框选的节点", "Connect selected nodes in sequence")],
        [onboardingIcon("#aiGenerateBtn", "▶"), onboardingCopy("批量执行", "Run Batch"), onboardingCopy("批量提交可执行的 AI 绘图节点", "Submit runnable AI image nodes in a batch")],
        [onboardingIcon("#taskQueueBtn", "≡"), onboardingCopy("任务队列", "Task Queue"), onboardingCopy("查看等待、运行和已完成的任务", "Review queued, running, and completed tasks")],
      ],
    },
    {
      selector: ".top-utility-track",
      title: onboardingCopy("右上工具", "Top-right Tools"),
      description: onboardingCopy("这些图标用于管理项目文件和应用界面。", "Use these icons to manage project files and the application interface."),
      items: [
        [onboardingIcon("#saveJsonBtn", "S"), onboardingCopy("保存项目", "Save Project"), onboardingCopy("将当前项目保存为可携带的项目文件", "Save the current work as a portable project file")],
        [onboardingIcon("#loadJsonBtn", "O"), onboardingCopy("打开项目", "Open Project"), onboardingCopy("打开之前保存的项目文件", "Open a previously saved project file")],
        [onboardingIcon("#themeBtn", "◐"), onboardingCopy("主题切换", "Theme"), onboardingCopy("切换明亮或深色界面", "Switch between light and dark themes")],
        [onboardingIcon("#shortcutHelpBtn", "⌨"), onboardingCopy("快捷键", "Shortcuts"), onboardingCopy("查看常用鼠标和键盘操作", "Review common mouse and keyboard controls")],
        [onboardingIcon("#settingsBtn", "⚙"), onboardingCopy("设置", "Settings"), onboardingCopy("配置画布、素材、API 和导出", "Configure the canvas, assets, API, and export")],
      ],
    },
    {
      selector: "#apiSettingsCard",
      api: true,
      title: onboardingCopy("设置 API Key", "Set Up Your API Key"),
      description: onboardingCopy("AI 绘图需要 API Key。你可以现在完成设置，也可以选择稍后设置。", "AI image generation requires an API Key. Set it up now, or choose to do it later."),
      items: [
        [`<span class="onboarding-text-icon">1</span>`, onboardingCopy("注册获取", "Register"), onboardingCopy("点击“注册获取 API Key”打开注册页面", "Open the registration page to get an API Key")],
        [`<span class="onboarding-text-icon">2</span>`, onboardingCopy("输入并验证", "Enter & Verify"), onboardingCopy("粘贴 API Key 后点击“验证”", "Paste the API Key, then select Verify")],
        [`<span class="onboarding-text-icon">3</span>`, onboardingCopy("安全保存", "Save Securely"), onboardingCopy("点击“保存”，桌面版会使用 Windows 加密存储", "Select Save; the desktop app encrypts it with Windows")],
      ],
    },
  ];
}

function renderOnboardingItems(items) {
  els.onboardingItems.innerHTML = items.map(([icon, title, description]) => `<div class="onboarding-item"><span class="onboarding-item-icon">${icon}</span><span class="onboarding-item-copy"><strong>${title}</strong><span>${description}</span></span></div>`).join("");
}

function updateOnboardingApiStatus() {
  if (!onboardingState.active || onboardingState.step !== 3) return;
  const inputKey = els.apiKeyInput.value.trim();
  const savedKey = String(state.settings.apiKey || "").trim();
  const hasSavedKey = !!savedKey && inputKey === savedKey;
  els.onboardingApiStatus.classList.remove("hidden");
  els.onboardingApiStatus.classList.toggle("is-ready", hasSavedKey);
  els.onboardingApiStatus.textContent = hasSavedKey
    ? onboardingCopy("API Key 已设置（内容已隐藏）", "API Key is set (value hidden)")
    : inputKey
      ? onboardingCopy("API Key 已输入，请验证并保存。", "API Key entered. Verify and save it to finish setup.")
      : onboardingCopy("尚未设置 API Key，不影响先使用画布基础功能。", "No API Key is set yet. You can still use the basic canvas features.");
}

function setOnboardingRect(element) {
  const raw = element?.getBoundingClientRect();
  const margin = 8;
  const left = Math.max(8, (raw?.left || innerWidth / 2) - margin);
  const top = Math.max(8, (raw?.top || innerHeight / 2) - margin);
  const right = Math.min(innerWidth - 8, (raw?.right || innerWidth / 2) + margin);
  const bottom = Math.min(innerHeight - 8, (raw?.bottom || innerHeight / 2) + margin);
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const masks = {
    ".onboarding-mask-top": [0, 0, innerWidth, top],
    ".onboarding-mask-right": [right, top, innerWidth - right, height],
    ".onboarding-mask-bottom": [0, bottom, innerWidth, innerHeight - bottom],
    ".onboarding-mask-left": [0, top, left, height],
  };
  for (const [selector, [x, y, w, h]] of Object.entries(masks)) {
    const mask = els.onboardingTour.querySelector(selector);
    Object.assign(mask.style, { left: `${x}px`, top: `${y}px`, width: `${Math.max(0, w)}px`, height: `${Math.max(0, h)}px` });
  }
  for (const target of [els.onboardingSpotlight, els.onboardingTargetBlocker]) {
    Object.assign(target.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
  }
  return { left, top, right, bottom, width, height };
}

function positionOnboardingCard(targetRect, apiStep) {
  const gap = 16;
  const cardRect = els.onboardingCard.getBoundingClientRect();
  const settingsRect = apiStep ? els.settings.getBoundingClientRect() : null;
  let left;
  let top;
  if (apiStep && settingsRect.left >= cardRect.width + gap + 12) {
    left = settingsRect.left - cardRect.width - gap;
    top = Math.max(12, Math.min(targetRect.top, innerHeight - cardRect.height - 12));
  } else if (targetRect.bottom + gap + cardRect.height <= innerHeight - 12) {
    left = targetRect.left + (targetRect.width - cardRect.width) / 2;
    top = targetRect.bottom + gap;
  } else if (targetRect.top - gap - cardRect.height >= 12) {
    left = targetRect.left + (targetRect.width - cardRect.width) / 2;
    top = targetRect.top - cardRect.height - gap;
  } else {
    left = (innerWidth - cardRect.width) / 2;
    top = Math.max(12, (innerHeight - cardRect.height) / 2);
  }
  left = Math.max(12, Math.min(left, innerWidth - cardRect.width - 12));
  top = Math.max(12, Math.min(top, innerHeight - cardRect.height - 12));
  Object.assign(els.onboardingCard.style, { left: `${left}px`, top: `${top}px` });
}

function scheduleOnboardingLayout() {
  if (!onboardingState.active) return;
  els.onboardingTour.classList.toggle("theme-dark", state.settings.theme === "dark");
  els.onboardingTour.classList.toggle("theme-light", state.settings.theme !== "dark");
  cancelAnimationFrame(onboardingState.layoutFrame);
  onboardingState.layoutFrame = requestAnimationFrame(() => {
    const step = onboardingSteps()[onboardingState.step];
    const target = document.querySelector(step.selector);
    if (!target) return;
    const rect = setOnboardingRect(target);
    positionOnboardingCard(rect, step.api === true);
  });
}

async function showOnboardingStep(index) {
  const steps = onboardingSteps();
  onboardingState.step = Math.max(0, Math.min(index, steps.length - 1));
  const step = steps[onboardingState.step];
  const apiStep = step.api === true;
  document.body.classList.toggle("onboarding-step-project", onboardingState.step === 0);
  document.body.classList.toggle("onboarding-api-step", apiStep);
  els.onboardingTour.classList.toggle("api-step", apiStep);
  els.onboardingTargetBlocker.classList.toggle("is-interactive", apiStep);
  if (apiStep) {
    setSettingsSidebarOpen(true);
    switchSettingsTab("ai");
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    els.apiSettingsCard.scrollIntoView({ block: "center" });
  } else {
    setSettingsSidebarOpen(false);
    setTaskQueueOpen(false);
  }
  els.onboardingProgress.textContent = `${onboardingState.step + 1} / ${steps.length}`;
  els.onboardingTitle.textContent = step.title;
  els.onboardingDescription.textContent = step.description;
  renderOnboardingItems(step.items);
  els.onboardingApiStatus.classList.toggle("hidden", !apiStep);
  els.onboardingApiRequirement.classList.toggle("hidden", !apiStep);
  els.onboardingApiRequirement.textContent = onboardingCopy("需要设置 API Key 后才能正常使用 AI 绘图功能。", "An API Key is required to use AI image generation.");
  els.onboardingBackBtn.classList.toggle("hidden", onboardingState.step === 0);
  els.onboardingNextBtn.textContent = onboardingState.step === steps.length - 1 ? onboardingCopy("完成", "Finish") : onboardingCopy("下一步", "Next");
  els.onboardingSkipBtn.textContent = apiStep ? onboardingCopy("稍后设置", "Set Up Later") : onboardingCopy("跳过", "Skip");
  updateOnboardingApiStatus();
  scheduleOnboardingLayout();
  els.onboardingCard.focus({ preventScroll: true });
}

function startOnboarding({ manual = false } = {}) {
  if (onboardingState.active) return;
  onboardingState.active = true;
  onboardingState.manual = manual;
  onboardingState.settingsWasOpen = !els.settings.classList.contains("hidden");
  setShortcutPopover(false);
  els.onboardingTour.classList.remove("hidden");
  showOnboardingStep(0);
  console.info("[新手引导] 已开始", { manual, version: ONBOARDING_VERSION });
}

function finishOnboarding(reason = "complete") {
  if (!onboardingState.active) return;
  const wasManual = onboardingState.manual;
  const completedApiStep = reason === "complete" && onboardingState.step === onboardingSteps().length - 1;
  onboardingState.active = false;
  onboardingSeenVersion = ONBOARDING_VERSION;
  els.onboardingTour.classList.add("hidden");
  els.onboardingTour.classList.remove("api-step");
  document.body.classList.remove("onboarding-step-project");
  document.body.classList.remove("onboarding-api-step");
  if (completedApiStep) {
    setSettingsSidebarOpen(true);
    switchSettingsTab("ai");
  } else {
    setSettingsSidebarOpen(wasManual && onboardingState.settingsWasOpen);
    if (wasManual && onboardingState.settingsWasOpen) switchSettingsTab("general");
  }
  persistPages();
  console.info("[新手引导] 已结束", { reason, version: ONBOARDING_VERSION });
}

els.onboardingBackBtn.onclick = () => showOnboardingStep(onboardingState.step - 1);
els.onboardingNextBtn.onclick = () => onboardingState.step >= onboardingSteps().length - 1 ? finishOnboarding("complete") : showOnboardingStep(onboardingState.step + 1);
els.onboardingSkipBtn.onclick = () => finishOnboarding(onboardingState.step === 3 ? "api-later" : "skip");
els.replayOnboardingBtn.onclick = () => startOnboarding({ manual: true });
els.apiKeyInput.addEventListener("input", updateOnboardingApiStatus);
window.addEventListener("resize", scheduleOnboardingLayout);
document.addEventListener("keydown", event => {
  if (!onboardingState.active || event.key !== "Escape") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  finishOnboarding("escape");
}, true);

var tabBtns = els.settings.querySelectorAll(".settings-tab-btn");
for (var t = 0; t < tabBtns.length; t++) {
  tabBtns[t].onclick = function() {
    switchSettingsTab(this.getAttribute("data-tab"));
  };
}
if (els.mcpRefreshBtn) els.mcpRefreshBtn.onclick = refreshMcpStatus;
if (els.mcpInstallBtn) els.mcpInstallBtn.onclick = () => runMcpAction("install");
if (els.mcpUninstallBtn) els.mcpUninstallBtn.onclick = () => runMcpAction("uninstall");
if (els.mcpOpenFolderBtn) els.mcpOpenFolderBtn.onclick = async () => {
  const directory = lastMcpStatus?.directory || "";
  if (!directory || !desktop?.openOutputFolder) return;
  try { await desktop.openOutputFolder(directory); }
  catch (error) { toast(`${mcpCopy("打开文件夹失败", "Could not open folder")}: ${error.message}`); }
};
if (els.mcpCopyLaunchCommandBtn) els.mcpCopyLaunchCommandBtn.onclick = async () => {
  try {
    await copyTextValue(els.mcpLaunchCommand.value || mcpLaunchCommand());
    toast(mcpCopy("MCP 启动命令已复制", "MCP launch command copied"));
  } catch (error) {
    toast(`${mcpCopy("复制失败", "Copy failed")}: ${error.message}`);
  }
};
if (els.mcpExtensionSection) els.mcpExtensionSection.addEventListener("toggle", () => {
  if (els.mcpExtensionSection.open) refreshMcpStatus();
});
if (els.mcpApiSiteSelect) els.mcpApiSiteSelect.onchange = async () => {
  if (!desktop?.saveMcpSettings) {
    els.mcpApiSiteSelect.value = lastMcpStatus?.apiSite === "agtoken" ? "agtoken" : "apimart";
    return toast(mcpCopy("MCP 默认站点仅支持在 Windows 桌面版保存", "The MCP default site can only be saved in the Windows desktop app"));
  }
  els.mcpApiSiteSelect.disabled = true;
  try {
    const result = await desktop.saveMcpSettings(els.mcpApiSiteSelect.value);
    lastMcpStatus = { ...(lastMcpStatus || {}), apiSite: result.apiSite };
    toast(mcpCopy(`MCP 默认绘图站点已设为 ${result.apiSite === "agtoken" ? "AGToken" : "APIMart"}`, `MCP default image site set to ${result.apiSite === "agtoken" ? "AGToken" : "APIMart"}`));
  } catch (error) {
    toast(`${mcpCopy("保存 MCP 默认站点失败", "Could not save the MCP default site")}: ${error.message}`);
    els.mcpApiSiteSelect.value = lastMcpStatus?.apiSite === "agtoken" ? "agtoken" : "apimart";
  } finally { els.mcpApiSiteSelect.disabled = false; }
};
if (els.browserExtensionOpenFolderBtn) els.browserExtensionOpenFolderBtn.onclick = async () => {
  try {
    if (!lastMcpStatus && desktop?.getMcpStatus) lastMcpStatus = await desktop.getMcpStatus();
    const directory = lastMcpStatus?.browserExtensionDirectory || "";
    if (!directory) return toast(mcpCopy("浏览器模式无法确定插件文件夹，请使用桌面版", "Browser mode cannot locate the extension folder; use the desktop app"));
    if (desktop?.openOutputFolder) await desktop.openOutputFolder(directory);
    else { await copyTextValue(directory); toast(mcpCopy("已复制插件文件夹路径", "Extension folder path copied")); }
  } catch (error) {
    toast(`${mcpCopy("打开插件文件夹失败", "Could not open the extension folder")}: ${error.message}`);
  }
};
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
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && !els.projectModeDialog.classList.contains("hidden")) closeProjectModeDialog();
});
els.projectNameBtn.onclick = () => {
  const hiding = !els.projectMenu.classList.contains("hidden");
  if (hiding) endProjectPeek(true); // 收起面板时取消悬停预览，恢复原项目
  els.projectMenu.classList.toggle("hidden");
  renderPageTabs();
};
document.addEventListener("mousedown", ev => {
  if (els.projectMenu.classList.contains("hidden")) return;
  if (els.projectMenu.contains(ev.target) || els.projectNameBtn.contains(ev.target)) return;
  endProjectPeek(true);
  els.projectMenu.classList.add("hidden");
});
document.addEventListener("keydown", ev => {
  if (ev.key === "Escape" && !els.projectMenu.classList.contains("hidden")) {
    endProjectPeek(true);
    els.projectMenu.classList.add("hidden");
  }
});
els.projectNameBtn.ondblclick = ev => {
  ev.preventDefault();
  els.projectMenu.classList.add("hidden");
  renamePage();
};
els.viewport.addEventListener("dblclick", ev => {
  if (ev.target.closest(".node,.edge-hit,button,input,textarea,select,video,[contenteditable='true'],.canvas-annotation")) return;
  ev.preventDefault();
  // 双击空白创建文字标注（原“居中显示”行为替换；居中仍保留给进入编组等场景）
  createAnnotationAt(screenToWorld(ev.clientX, ev.clientY));
});
els.aiGenerateBtn.onclick = openExecuteDialog;
els.composerSubmitBtn.onclick = createNodesFromComposer;
els.composerText.addEventListener("keydown", ev => {
  if (ev.isComposing || ev.keyCode === 229) return; // 输入法选字回车不创建节点
  if (ev.key === "Enter") {
    ev.preventDefault();
    createNodesFromComposer();
  }
});
els.composerUploadBtn.onclick = (ev) => {
  const r = els.composerUploadBtn.getBoundingClientRect();
  showMenu(r.left, r.top, [
    ["上传图片文件", () => els.composerFileInput.click()],
    ["上传图片文件夹", () => {
      if (window.chrome?.webview) window.chrome.webview.postMessage({ type: "pick-image-folder" });
      else els.composerFolderInput.click();
    }],
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
      const node = addNode("image", center.x - NODE_WIDTH / 2 + col * 280, center.y - NODE_HEIGHT / 2 + row * IMAGE_NODE_VERTICAL_STEP, false);
      node.image = await fileToDataUrl(files[i]);
      node.fileName = files[i].name;
      node.mime = files[i].type || "image/png";
      await externalizeImageField(node, "image", "imageAssetId", node.fileName);
    }
    pushHistory();
    render();
    toast(`已导入 ${files.length} 张图片`);
  }
  els.composerFileInput.value = "";
};

function closeFolderImportDialog(force = false) {
  if (!force && els.folderImportConfirmBtn.disabled) return;
  els.folderImportDialog.classList.add("hidden");
  pendingFolderImport = null;
}

function openFolderImportDialog(entries, folderName = "") {
  const imageEntries = Array.from(entries || []).filter(entry => isSupportedImageFile(entry.file || entry));
  if (!imageEntries.length) {
    toast("文件夹中没有图片文件");
    return;
  }
  pendingFolderImport = { entries: imageEntries, folderName };
  els.folderImportSummary.textContent = uiLanguage === "en"
    ? `${folderName || "Selected folder"} · ${imageEntries.length} images`
    : `${folderName || "所选文件夹"} · ${imageEntries.length} 张图片`;
  const hint = els.folderImportDialog.querySelector(".folder-import-hint");
  if (hint) hint.textContent = "画布只保存缩略图；执行 AI 时读取本地原图。项目使用期间请勿移动或删除原文件夹。";
  els.folderImportDialog.classList.remove("hidden");
  window.setTimeout(() => els.folderImportConfirmBtn.focus(), 0);
}

async function fileToThumbnailDataUrl(file, maxSize = 420) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error("缩略图编码失败")),
      "image/webp",
      .76,
    ));
    return fileToDataUrl(blob);
  } finally {
    bitmap.close();
  }
}

async function dataUrlToThumbnailDataUrl(dataUrl, maxSize = 420) {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error(`缩略图读取失败：HTTP ${response.status}`);
  return fileToThumbnailDataUrl(await response.blob(), maxSize);
}

async function externalizeImageField(holder, field, assetField, fallbackName, exportAssetId) {
  const dataUrl = holder?.[field];
  // Keep vector previews intact through saves and reloads.
  if (field === "image" && holder.mime === "image/svg+xml" && dataUrl?.startsWith("data:image/svg+xml;base64,")) return false;
  // Capture the original PNG prompt before replacing image bytes with a WebP thumbnail.
  if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) {
    const prompt = String(readGenerationMetadataFromPng(dataUrl)?.prompt || "").trim();
    if (prompt) holder.generationPrompt = prompt;
  }
  if (!desktop || holder?.[assetField] || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return false;
  const mime = (dataUrl.match(/^data:([^;]+)/) || [])[1] || holder.mime || "image/png";
  const generated = field === "generatedImage" || field === "result" || holder.aiSourceNodeId || holder.angleSourceNodeId;
  const projectName = generated ? (readGenerationMetadataFromPng(dataUrl)?.["CanvasFlow.Project"] || currentPage()?.name || "项目") : "";
  let assetId = exportAssetId;
  if (!assetId) {
    const stored = await desktop.storeImage(dataUrl, holder.fileName || fallbackName, mime, generated ? "generated" : "originals", projectName);
    assetId = stored.id || stored.Id || "";
  }
  if (!assetId) throw new Error("桌面素材仓库没有返回素材编号");
  holder[assetField] = assetId;
  holder[field] = await dataUrlToThumbnailDataUrl(dataUrl);
  return true;
}

async function migrateNodeAssets(nodes) {
  let changed = false;
  const failures = [];
  for (const node of nodes || []) {
    try {
      if (await externalizeImageField(node, "image", "imageAssetId", node.fileName || `${node.id || "image"}.png`)) changed = true;
      if (await externalizeImageField(node, "generatedImage", "generatedAssetId", node.fileName || `${node.id || "generated"}.png`)) changed = true;
    } catch (error) {
      failures.push({ nodeId: node.id || "unknown", field: "image", message: error.message || String(error) });
    }
    for (const image of node.images || []) {
      try {
        if (await externalizeImageField(image, "image", "assetId", image.fileName || "group-image.png")) changed = true;
      } catch (error) {
        failures.push({ nodeId: node.id || "unknown", field: "groupImage", message: error.message || String(error) });
      }
    }
    for (const attachment of allChatAttachments(node)) {
      try {
        if (await externalizeImageField(attachment, "image", "assetId", attachment.fileName || "chat-attachment.png")) changed = true;
      } catch (error) {
        failures.push({ nodeId: node.id || "unknown", field: "chatAttachment", message: error.message || String(error) });
      }
    }
    for (const task of node.batchTasks || []) {
      try {
        if (await externalizeImageField(task, "result", "resultAssetId", task.fileName || "batch-result.png")) changed = true;
      } catch (error) {
        failures.push({ nodeId: node.id || "unknown", field: "batchResult", message: error.message || String(error) });
      }
    }
    if (Array.isArray(node.items)) {
      const nested = await migrateNodeAssets(node.items);
      changed = nested.changed || changed;
      failures.push(...nested.failures);
    }
    if (Array.isArray(node.subgraph?.nodes)) {
      const nested = await migrateNodeAssets(node.subgraph.nodes);
      changed = nested.changed || changed;
      failures.push(...nested.failures);
    }
    await nextPaint();
  }
  return { changed, failures };
}

function scheduleDesktopAssetMigration(delay = 80) {
  if (!desktop) return;
  desktopAssetMigrationQueued = true;
  if (desktopAssetMigrationTimer) clearTimeout(desktopAssetMigrationTimer);
  desktopAssetMigrationTimer = window.setTimeout(() => {
    desktopAssetMigrationTimer = null;
    flushDesktopAssetMigration().catch(error => console.error("[素材迁移] 保存失败", error));
  }, delay);
}

async function flushDesktopAssetMigration() {
  if (!desktop) return { changed: false, failures: [] };
  if (desktopAssetMigrationTimer) {
    clearTimeout(desktopAssetMigrationTimer);
    desktopAssetMigrationTimer = null;
  }
  desktopAssetMigrationQueued = true;
  if (desktopAssetMigrationPromise) return desktopAssetMigrationPromise;
  desktopAssetMigrationPromise = (async () => {
    let changed = false;
    const failures = [];
    do {
      desktopAssetMigrationQueued = false;
      const active = await migrateNodeAssets(state.nodes);
      changed = active.changed || changed;
      failures.push(...active.failures);
      saveCurrentPage();
      for (const page of state.pages) {
        if (page.id === state.activePageId) continue;
        const result = await migrateNodeAssets(page.data?.nodes || []);
        changed = result.changed || changed;
        failures.push(...result.failures);
      }
    } while (desktopAssetMigrationQueued);
    if (changed) {
      state.history = [cloneData()];
      state.future = [];
      updateUndoRedo();
      render();
      console.info("[素材迁移] 原图已写入桌面素材仓库，项目状态仅保留缩略图与素材编号");
    }
    persistPages();
    if (failures.length) {
      console.error("[素材迁移] 部分图片保存失败", failures);
      toast(`有 ${failures.length} 张图片未能写入本地素材仓库：可能是图片格式、大小或目录权限问题；请检查图片后重试。`);
    }
    return { changed, failures };
  })().finally(() => { desktopAssetMigrationPromise = null; });
  return desktopAssetMigrationPromise;
}

async function createGroupFromFolderFiles(imageEntries, folderName = "") {
  const preparedImages = [];
  for (let index = 0; index < imageEntries.length; index++) {
    const entry = imageEntries[index];
    const file = entry.file || entry;
    els.folderImportSummary.textContent = uiLanguage === "en"
      ? `Creating thumbnails ${index + 1}/${imageEntries.length}`
      : `正在生成缩略图 ${index + 1}/${imageEntries.length}`;
    const image = desktop ? await fileToThumbnailDataUrl(file) : await fileToDataUrl(file);
    preparedImages.push({
      image,
      assetId: entry.assetId || "",
      fileName: file.name,
      mime: file.type || "image/png",
      name: file.name.replace(/\.[^.]+$/, ""),
    });
    if (index % 2 === 0) await nextPaint();
  }
  const center = visibleWorldCenter();
  const nodeType = "group";
  const node = addNode(nodeType, center.x - NODE_WIDTH / 2, center.y - NODE_HEIGHT / 2, false);
  node.images = preparedImages;
  if (nodeType === "folder") node.folderName = folderName || "图片文件夹";
  pushHistory();
  render();
  toast(nodeType === "folder" ? `已创建文件夹节点，包含 ${node.images.length} 张图片` : `已创建多任务节点，包含 ${node.images.length} 张图片`);
}

async function confirmFolderImport() {
  if (!pendingFolderImport) return;
  const { entries, folderName } = pendingFolderImport;
  els.folderImportConfirmBtn.disabled = true;
  els.folderImportCancelBtn.disabled = true;
  els.folderImportCloseBtn.disabled = true;
  try {
    await createGroupFromFolderFiles(entries, folderName);
    closeFolderImportDialog(true);
  } catch (error) {
    console.error("[文件夹上传] 图片读取失败", error);
    toast(`文件夹上传失败：可能是图片无法读取或权限不足；请重新选择文件夹。${error.message || ""}`);
  } finally {
    els.folderImportConfirmBtn.disabled = false;
    els.folderImportCancelBtn.disabled = false;
    els.folderImportCloseBtn.disabled = false;
  }
}

async function collectFolderImageFiles(directoryHandle) {
  const files = [];
  async function visit(handle, parentPath = "") {
    for await (const entry of handle.values()) {
      const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      if (entry.kind === "directory") await visit(entry, relativePath);
      else {
        const file = await entry.getFile();
        if (isSupportedImageFile(file)) files.push({ file, relativePath });
      }
    }
  }
  await visit(directoryHandle);
  return files;
}

if (window.chrome?.webview) {
  window.chrome.webview.addEventListener("message", async event => {
    const message = event.data || {};
    if (message.type === "desktop:paste") {
      const active = document.activeElement;
      const isTextField = active?.matches?.("textarea,input");
      if (message.kind === "text" && isTextField) {
        const value = String(message.text || "");
        const start = active.selectionStart ?? active.value.length;
        const end = active.selectionEnd ?? start;
        active.setRangeText(value, start, end, "end");
        active.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (message.kind === "image" && String(message.dataUrl || "").startsWith("data:image/")) {
        const blob = await (await fetch(message.dataUrl)).blob();
        const file = new File([blob], `clipboard_${timestamp()}.png`, { type: message.mime || "image/png" });
        if (active === els.composerText) await createFromImageFile(file);
        else await addImageNodeFromDataUrl(message.dataUrl, message.name || `clipboard_${timestamp()}.png`, message.mime || "image/png", "已从剪贴板创建图片节点");
      } else if (message.kind === "text" && String(message.text || "").trim()) {
        const anchor = currentPasteAnchor();
        const node = addNode("text", anchor.x, anchor.y, false);
        node.text = String(message.text);
        pushHistory();
        render();
        toast("已从剪贴板创建文字节点");
      }
    } else if (message.type === "image-folder-selected") {
      try {
        const directoryHandle = event.additionalObjects?.[0];
        if (!directoryHandle) throw new Error("没有取得文件夹读取权限");
        const imageFiles = await collectFolderImageFiles(directoryHandle);
        const assetsByPath = new Map((message.assets || []).map(asset => [String(asset.relativePath || "").replace(/\\/g, "/").toLowerCase(), asset]));
        for (const entry of imageFiles) {
          const asset = assetsByPath.get(String(entry.relativePath || "").replace(/\\/g, "/").toLowerCase());
          if (asset) entry.assetId = asset.assetId || "";
        }
        openFolderImportDialog(imageFiles, message.folderName || directoryHandle.name || "");
      } catch (error) {
        console.error("[文件夹上传] 无法读取所选文件夹", error);
        toast(`无法读取所选文件夹：可能是权限已失效；请重新选择。${error.message || ""}`);
      }
    } else if (message.type === "image-folder-error") {
      toast(`无法选择文件夹：${message.error || "系统文件夹选择器发生错误"}；请重新尝试。`);
    } else if (message.type === "screenshot:enqueue") {
      enqueueScreenshotTasks(message);
    } else if (message.type === "screenshot:prompt-library-changed") {
      await loadGlobalLibraryFromDisk();
      syncCustomMaterialsList();
      toast("截图工具中的提示词已同步到自定义文字");
    } else if (message.type === "screenshot:request-node-catalog") {
      publishScreenshotNodeCatalog(true);
    }
  });
}

els.folderImportCloseBtn.onclick = () => closeFolderImportDialog();
els.folderImportCancelBtn.onclick = () => closeFolderImportDialog();
els.folderImportConfirmBtn.onclick = confirmFolderImport;
els.folderImportDialog.onclick = event => {
  if (event.target === els.folderImportDialog) closeFolderImportDialog();
};
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !els.folderImportDialog.classList.contains("hidden")) closeFolderImportDialog();
});

els.composerFolderInput.onchange = () => {
  const files = Array.from(els.composerFolderInput.files || []);
  if (files.length) {
    const relativePath = files[0].webkitRelativePath || "";
    openFolderImportDialog(files.map(file => ({ file, relativePath: file.webkitRelativePath || file.name })), relativePath.split("/")[0]);
  }
  els.composerFolderInput.value = "";
};

els.canvasBg.onchange = () => {
  state.settings.canvasBackground = els.canvasBg.value;
  pushHistory();
  applySettings();
};

els.snap.onchange = () => {
  state.settings.snap = els.snap.checked;
  pushHistory();
  applySettings();
};

els.smoothEdges.onchange = () => {
  state.settings.smoothEdges = els.smoothEdges.checked;
  pushHistory();
  render();
};

els.autoAlign.onchange = () => {
  state.settings.autoAlign = els.autoAlign.checked;
  pushHistory();
};

els.hideNodeTitles.onchange = () => {
  state.settings.hideNodeTitles = els.hideNodeTitles.checked;
  render();
  pushHistory();
};

els.editOnOverlap.onchange = () => {
  state.settings.editOnOverlap = els.editOnOverlap.checked;
  pushHistory();
};

els.textMergeOnOverlap.onchange = () => {
  state.settings.textMergeOnOverlap = els.textMergeOnOverlap.checked;
  pushHistory();
};

els.showBrowserNodeMenu.onchange = () => {
  state.settings.showBrowserNodeMenu = els.showBrowserNodeMenu.checked;
  pushHistory();
};

els.showVideoNodeMenu.onchange = () => {
  state.settings.showVideoNodeMenu = els.showVideoNodeMenu.checked;
  pushHistory();
};

if (els.showLocalSdNodeMenu) els.showLocalSdNodeMenu.onchange = () => {
  state.settings.showLocalSdNodeMenu = els.showLocalSdNodeMenu.checked;
  pushHistory();
};

if (els.showScreenshotNodeMenu) els.showScreenshotNodeMenu.onchange = () => {
  state.settings.showScreenshotNodeMenu = els.showScreenshotNodeMenu.checked;
  pushHistory();
};


// screenshot panel trigger removed

// mac 桌面壳不提供截图窗口：桌面桥存在但没有 openScreenshotWindow 时隐藏"截图工具"设置入口
// （浏览器模式 desktop 为空、Windows 桌面有该能力，两种情况的入口行为不变）
if (desktop && !desktop.openScreenshotWindow) {
  document.querySelector('.settings-tab-btn[data-tab="screenshot"]')?.classList.add("hidden");
}

const openScreenshotToolBtn = $("openScreenshotToolBtn");
if (openScreenshotToolBtn) openScreenshotToolBtn.onclick = async () => {
  if (!desktop?.openScreenshotWindow) {
    toast("截图工具仅在 CanvasFlow Windows 桌面版中可用");
    return;
  }
  try {
    await desktop.openScreenshotWindow();
  } catch (error) {
    console.error("[截图工具] 无法打开原生截图窗口", error);
    toast(`截图窗口无法打开：${error.message || "桌面桥接暂时不可用"}`);
  }
};

els.gridSize.onchange = () => {
  state.settings.gridSize = Math.min(200, Math.max(10, Math.round(Number(els.gridSize.value) || 40)));
  pushHistory();
  applySettings();
  syncSettingsPanel();
};

function changeInterfaceLanguage(language) {
  setUiLanguage(language);
  render();
  renderTaskQueue();
  syncSettingsPanel();
  renderCheckedUpdateStatus();
  if (lastMcpStatus) renderMcpStatus(lastMcpStatus);
  if (onboardingState.active) showOnboardingStep(onboardingState.step);
}
document.querySelectorAll("[data-ui-language]").forEach(button => {
  button.onclick = () => changeInterfaceLanguage(button.dataset.uiLanguage);
});

if (els.checkUpdateBtn) els.checkUpdateBtn.onclick = () => checkForUpdates({ silent: false, prompt: false });
if (els.installWebUpdateBtn) els.installWebUpdateBtn.onclick = applyWebUpdate;
$("updateQuietToggle").checked = updateRemindersMuted();
$("updateQuietToggle").onchange = event => setUpdateRemindersMuted(event.target.checked);

function populateDefaultModelOptions() {
  if (!els.defaultImageModelSelect) return;
  const catalog = activeCatalog();
  if (!catalogModels().some(model => model.id === state.settings.defaultImageModel)) {
    console.warn("[默认绘图模型] 当前 API 类型下无效，已恢复默认", { value: state.settings.defaultImageModel, apiType: activeApiType() });
    state.settings.defaultImageModel = catalog.defaultModel;
  }
  els.defaultImageModelSelect.innerHTML = imageModelOptions(state.settings.defaultImageModel);
  els.defaultImageModelSelect.value = state.settings.defaultImageModel;
  syncDefaultParameterOptions();
}

// 默认分辨率/比例跟随默认绘图模型:选项取该模型在当前 API 类型目录下的档位,存档值无效时回退首档
function syncDefaultParameterOptions() {
  if (!els.defaultResolutionSelect && !els.defaultSizeSelect) return;
  const catalog = activeCatalog();
  const entry = modelCatalogEntry(state.settings.defaultImageModel) || catalog.models.find(model => !model.hidden) || catalog.models[0];
  if (els.defaultResolutionSelect) {
    els.defaultResolutionSelect.innerHTML = entry.resolutions.map(value => `<option value="${value}">${value.toUpperCase()}</option>`).join("");
    if (!entry.resolutions.includes(state.settings.defaultResolution)) state.settings.defaultResolution = entry.resolutions[0];
    els.defaultResolutionSelect.value = state.settings.defaultResolution;
  }
  if (els.defaultSizeSelect) {
    els.defaultSizeSelect.innerHTML = entry.sizes.map(value => `<option value="${value}">${value}</option>`).join("");
    if (!entry.sizes.includes(state.settings.defaultSize)) state.settings.defaultSize = entry.sizes[0];
    els.defaultSizeSelect.value = state.settings.defaultSize;
  }
}

function applyApiTypeSettingsUi() {
  const apiType = activeApiType();
  state.settings.apiType = apiType;
  if (els.apiTypeSelect) els.apiTypeSelect.value = apiType;
  if (els.apimartApiInfo) els.apimartApiInfo.classList.toggle("hidden", apiType !== "apimart");
  if (els.agtokenApiInfo) els.agtokenApiInfo.classList.toggle("hidden", apiType !== "agtoken");
  if (els.customApiSettings) els.customApiSettings.classList.toggle("hidden", apiType !== "custom");
  if (els.customApiBaseUrlInput) els.customApiBaseUrlInput.value = state.settings.customApiBaseUrl || "";
  if (els.customApiHeadersInput) els.customApiHeadersInput.value = state.settings.customApiHeaders || "";
  if (els.apiKeyInput) els.apiKeyInput.value = activeApiKey();
  populateDefaultModelOptions();
  const card = els.apiSettingsCard;
  if (card) card.dataset.apiType = apiType;
  console.info("[API类型] 当前类型：", apiType);
}

function parseCustomApiHeaders(raw) {
  const headers = {};
  String(raw || "").split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) return;
    const name = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (name && value) headers[name] = value;
  });
  return headers;
}

els.apiTypeSelect.onchange = () => {
  state.settings.apiType = els.apiTypeSelect.value === "agtoken" ? "agtoken" : "apimart";
  console.info("[API类型] 切换为", state.settings.apiType);
  applyApiTypeSettingsUi();
  pushHistory();
  render();
};

els.customApiBaseUrlInput.onchange = () => {
  state.settings.customApiBaseUrl = els.customApiBaseUrlInput.value.trim().replace(/\/+$/, "");
  els.customApiBaseUrlInput.value = state.settings.customApiBaseUrl;
  pushHistory();
};

els.customApiHeadersInput.onchange = () => {
  state.settings.customApiHeaders = els.customApiHeadersInput.value;
  pushHistory();
};

// ---------- 设置 → AI对话 页签 ----------
// 站点卡输入走 input/change 委托就地写回（input 只写 state 不压历史、change 冲刷），
// 不得在输入过程中重渲染站点卡，会打断输入与 IME。
let chatSettingsSite = "agtoken";
// 「添加模型」候选面板的展开状态（会话态）：内置站一个开关，自定义站按站点 id 记在 Set
let chatBuiltinPickerOpen = false;
const chatCustomPickerOpen = new Set();

// 候选模型选择面板（内置站与自定义站卡共用）：拉取结果不全量进列表，用户搜索+勾选后「添加所选」。
// 搜索过滤走纯 DOM hidden（input 事件直接改 style），不重渲染、不打断 IME。
function chatModelPickerHtml(candidates, open) {
  if (!open) {
    return '<button type="button" class="apikey-btn" data-picker-toggle>+ 添加模型（从拉取结果选）</button>';
  }
  const rows = candidates.map(id => `<label class="check-row compact chat-picker-item" data-pick-model="${escapeHtml(id)}"><input type="checkbox" class="chat-picker-candidate" data-pick-model="${escapeHtml(id)}"><span>${escapeHtml(id)}</span></label>`).join("");
  return `<div class="chat-model-picker">`
    + `<div class="chat-picker-head"><strong>添加模型</strong><button type="button" class="chat-model-remove" data-picker-toggle title="收起" aria-label="收起添加面板"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`
    + '<input type="text" class="chat-picker-search" placeholder="搜索模型名" aria-label="搜索模型名">'
    + `<div class="chat-picker-list">${rows || '<div class="chat-toggle-hint">还没有拉取过模型列表，或拉取结果都已添加。</div>'}</div>`
    + '<div class="chat-picker-manual"><input type="text" class="chat-picker-manual-input" placeholder="或手动输入模型名" aria-label="手动输入模型名"></div>'
    + '<div class="chat-picker-actions"><button type="button" class="apikey-btn" data-pick-add-selected>添加所选</button></div>'
    + `</div>`;
}

function chatToggleGroupHtml(label, inner, keyReady) {
  return `<div class="chat-model-group"><div class="chat-model-group-head">${escapeHtml(label)}${keyReady ? "" : '<span class="chat-toggle-hint">未填写 Key，暂不可用</span>'}</div>${inner}</div>`;
}

function chatToggleRowHtml(modelId, label, checked, enabled, note = "") {
  const noteHtml = note ? ` <span class="chat-model-note">${escapeHtml(note)}</span>` : "";
  return `<label class="check-row compact chat-model-toggle"><input type="checkbox" data-chat-model="${escapeHtml(modelId)}" ${checked ? "checked" : ""} ${enabled ? "" : "disabled"}><span>${escapeHtml(label)}${noteHtml}</span></label>`;
}

function renderChatSiteKeyArea() {
  // 站点下拉三选一：apimart / agtoken 填 Key，custom 在同一卡片内展开自定义站点列表管理
  const isCustom = chatSettingsSite === "custom";
  if (els.chatSiteKeyArea) els.chatSiteKeyArea.classList.toggle("hidden", isCustom);
  if (els.chatCustomSiteArea) els.chatCustomSiteArea.classList.toggle("hidden", !isCustom);
  if (isCustom) {
    renderChatCustomSiteList();
    return;
  }
  if (els.chatSiteKeyInput) els.chatSiteKeyInput.value = chatSettingsSite === "agtoken" ? (state.settings.agtokenApiKey || "") : (state.settings.apiKey || "");
  if (els.chatSiteKeyHint) {
    els.chatSiteKeyHint.textContent = chatSettingsSite === "agtoken"
      ? "接口地址：https://agtoken.vip（OpenAI 兼容，同步直连）；与 APIMart 的 Key 相互独立。"
      : "API 代理：api.apib.ai / api.aiuxu.com / api.aishuch.com / api.apimart.ai（自动故障转移）。";
  }
}

function renderChatModelToggleList() {
  if (!els.chatModelToggleList) return;
  const disabled = Array.isArray(state.settings.chatDisabledModels) ? state.settings.chatDisabledModels : [];
  if (chatSettingsSite === "custom") {
    // 自定义站点：勾选列表按站点分组；模型名增删在站点卡里管理（textarea/拉取按钮）
    const groups = [];
    for (const site of chatCustomSites()) {
      const names = Array.isArray(site.modelNames) ? site.modelNames.map(item => String(item || "").trim()).filter(Boolean) : [];
      if (!names.length) continue;
      const siteReady = String(site.baseUrl || "").trim().length > 0;
      const siteLabel = String(site.name || "").trim() || "自定义站点";
      const rows = names.map(name => {
        const modelId = `custom:${site.id}:${name}`;
        return chatToggleRowHtml(modelId, `${siteLabel}·${name}${site.multimodal === true ? "（图片）" : ""}`, !disabled.includes(modelId), siteReady);
      }).join("");
      groups.push(chatToggleGroupHtml(siteLabel, siteReady ? rows : rows + '<div class="chat-toggle-hint">未填写接口地址，暂不可用</div>', siteReady));
    }
    els.chatModelToggleList.innerHTML = groups.join("") || '<div class="chat-toggle-hint">还没有自定义站点。在上方站点下拉选择「自定义站点」添加。</div>';
    return;
  }
  // 内置站点（apimart/agtoken）：只显示当前站点模型；拉取进候选池，从池勾选添加，支持全不选与行内删除
  const ready = chatSiteKeyReady(chatSettingsSite);
  const customized = chatSiteModelsCustomized(chatSettingsSite);
  const currentIds = chatBuiltinModelIds(chatSettingsSite);
  const rows = currentIds.map(id => {
    const entry = chatBuiltinModelEntry(chatSettingsSite, id);
    const label = entry.label || id;
    return `<div class="chat-model-row">`
      + `<label class="check-row compact chat-model-toggle"><input type="checkbox" data-chat-model="${escapeHtml(id)}" ${disabled.includes(id) ? "" : "checked"} ${ready ? "" : "disabled"}><span>${escapeHtml(label)}${entry.note ? ` <span class="chat-model-note">${escapeHtml(entry.note)}</span>` : ""}</span></label>`
      + `<button type="button" class="chat-model-remove" data-chat-model-delete="${escapeHtml(id)}" title="从列表移除此模型" aria-label="移除模型 ${escapeHtml(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`
      + `</div>`;
  }).join("");
  const fetched = Array.isArray(state.settings.chatSiteModelsFetched?.[chatSettingsSite]) ? state.settings.chatSiteModelsFetched[chatSettingsSite] : [];
  const candidates = fetched.filter(id => !currentIds.includes(id));
  const toolbar = `<div class="chat-model-toolbar">`
    + `<button type="button" class="apikey-btn" data-chat-site-fetch="${escapeHtml(chatSettingsSite)}">拉取模型列表</button>`
    + (currentIds.length ? '<button type="button" class="apikey-btn" data-chat-model-disable-all title="全部取消勾选，再勾选需要的模型">全不选</button>' : "")
    + (customized ? '<button type="button" class="apikey-btn" data-chat-model-reset>恢复默认</button>' : "")
    + `</div>`;
  els.chatModelToggleList.innerHTML = toolbar + rows
    + `<div class="chat-picker-foot">${chatModelPickerHtml(candidates, chatBuiltinPickerOpen)}</div>`
    + (ready ? "" : '<div class="chat-toggle-hint">未填写 Key，暂不可用；填写后可勾选与拉取。</div>');
}

// 内置站点拉取上游全量模型：apimart 走 /api/models（透传 /v1/models），agtoken 走 /api/agtoken/models；
// 桌面模式桥自动从 secrets 注入，浏览器/服务器模式带 X-CanvasFlow-Api-Key 头。
// 结果进候选池 chatSiteModelsFetched（不直接进列表——中转站动辄上百个模型，由用户勾选添加）。
async function fetchChatSiteModels(site) {
  const route = site === "agtoken" ? "/api/agtoken/models" : "/api/models";
  const key = site === "agtoken" ? (state.settings.agtokenApiKey || "").trim() : (state.settings.apiKey || "").trim();
  const button = els.chatModelToggleList?.querySelector(`[data-chat-site-fetch="${site}"]`);
  const original = button ? button.textContent : "";
  if (button) { button.disabled = true; button.textContent = "拉取中…"; }
  try {
    const resp = await apiFetch(route, { headers: key ? { "X-CanvasFlow-Api-Key": key } : {} });
    const data = await resp.json().catch(() => ({}));
    const apiError = typeof data.error === "string" ? data.error : data.error?.message;
    if (!resp.ok || apiError) throw new Error(apiError || `HTTP ${resp.status}`);
    // OpenAI 标准 {data:[{id}]}；apimart 可能为 {code,data:{data:[...]}} 包装，两级自适应
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.data?.data) ? data.data.data : [];
    const ids = list.map(item => String(item?.id || "")).filter(Boolean);
    if (!ids.length) throw new Error("上游未返回模型列表");
    state.settings.chatSiteModelsFetched = state.settings.chatSiteModelsFetched && typeof state.settings.chatSiteModelsFetched === "object" ? state.settings.chatSiteModelsFetched : {};
    state.settings.chatSiteModelsFetched[site] = ids;
    chatBuiltinPickerOpen = true;
    pushHistory();
    renderChatModelToggleList();
    toast(`已拉取 ${ids.length} 个模型，请勾选需要的加入列表`);
  } catch (error) {
    toast(`拉取模型列表失败：${error.message}（可在添加面板手动输入）`);
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

// 候选面板通用行为：收集勾选+手输、更新按钮计数、搜索过滤（纯 DOM，不打断输入）
function chatUpdatePickerCount(panel) {
  if (!panel) return;
  const count = panel.querySelectorAll(".chat-picker-candidate:checked").length;
  const button = panel.querySelector("[data-pick-add-selected]");
  if (button) button.textContent = count ? `添加所选（${count}）` : "添加所选";
}

function chatFilterPicker(panel, query) {
  const needle = String(query || "").trim().toLowerCase();
  panel.querySelectorAll(".chat-picker-item").forEach(item => {
    item.hidden = Boolean(needle) && !String(item.getAttribute("data-pick-model") || "").toLowerCase().includes(needle);
  });
}

function chatCollectPickerFresh(panel, existingIds) {
  const picked = [...panel.querySelectorAll(".chat-picker-candidate:checked")].map(box => box.getAttribute("data-pick-model")).filter(Boolean);
  const manual = String(panel.querySelector(".chat-picker-manual-input")?.value || "").trim();
  return [...new Set([...picked, manual].filter(Boolean))].filter(id => !existingIds.includes(id));
}

// 把候选面板所选加入内置站列表：物化 chatSiteModels + 从黑名单清掉（新加默认启用），加完收起面板
function chatAddPickedBuiltin(site, panel) {
  const fresh = chatCollectPickerFresh(panel, chatBuiltinModelIds(site));
  if (!fresh.length) { toast("请先勾选要添加的模型，或输入新模型名"); return; }
  if (!state.settings.chatSiteModels || typeof state.settings.chatSiteModels !== "object") state.settings.chatSiteModels = {};
  state.settings.chatSiteModels[site] = [...chatBuiltinModelIds(site), ...fresh];
  const disabled = new Set(state.settings.chatDisabledModels || []);
  fresh.forEach(id => disabled.delete(id));
  state.settings.chatDisabledModels = [...disabled];
  chatBuiltinPickerOpen = false;
  pushHistory();
  renderChatModelToggleList();
  renderNodes();
  toast(`已添加 ${fresh.length} 个模型`);
}

// 把候选面板所选加入自定义站点的 modelNames（textarea 同步刷新），加完收起该卡面板
function chatAddPickedCustom(site, panel) {
  const existing = Array.isArray(site.modelNames) ? site.modelNames : [];
  const fresh = chatCollectPickerFresh(panel, existing);
  if (!fresh.length) { toast("请先勾选要添加的模型，或输入新模型名"); return; }
  site.modelNames = [...existing, ...fresh];
  chatCustomPickerOpen.delete(site.id);
  pushHistory();
  renderChatCustomSiteList();
  renderChatModelToggleList();
  renderNodes();
  toast(`已添加 ${fresh.length} 个模型`);
}

function renderChatCustomSiteList() {
  if (!els.chatCustomSiteList) return;
  const sites = chatCustomSites();
  if (!sites.length) {
    els.chatCustomSiteList.innerHTML = '<div class="chat-toggle-hint">还没有自定义站点。点击下方按钮添加，可接入本地 Ollama、中转站等任意 OpenAI 兼容服务。</div>';
    return;
  }
  els.chatCustomSiteList.innerHTML = sites.map(site => {
    const modelNames = Array.isArray(site.modelNames) ? site.modelNames : [];
    const fetchedModels = Array.isArray(site.fetchedModels) ? site.fetchedModels : [];
    const pickCandidates = fetchedModels.filter(id => !modelNames.includes(id));
    return `
    <div class="chat-custom-site" data-site-id="${escapeHtml(site.id)}">
      <div class="chat-custom-site-head">
        <input type="text" class="chat-site-name" value="${escapeHtml(site.name || "")}" placeholder="站点名称（如 本地Ollama）" aria-label="站点名称">
        <button type="button" class="apikey-btn danger" data-chat-site-action="delete" title="删除此站点">删除</button>
      </div>
      <label>接口地址（Base URL，填到 /v1 一级）
        <input type="text" class="chat-site-url" value="${escapeHtml(site.baseUrl || "")}" placeholder="例如 http://127.0.0.1:11434/v1">
      </label>
      <label>API Key（可选）
        <input type="password" class="chat-site-key" value="${escapeHtml(chatCustomSiteKey(site.id))}" placeholder="本地服务通常无需填写">
      </label>
      <label>模型名（每行一个）
        <textarea class="chat-site-models" rows="3" placeholder="每行一个模型名">${escapeHtml((Array.isArray(site.modelNames) ? site.modelNames : []).join("\n"))}</textarea>
      </label>
      <div class="chat-picker-foot">${chatModelPickerHtml(pickCandidates, chatCustomPickerOpen.has(site.id))}</div>
      <div class="chat-custom-site-actions">
        <label class="check-row compact"><input type="checkbox" class="chat-site-multimodal" ${site.multimodal === true ? "checked" : ""}><span>支持图片输入（多模态）</span></label>
        <button type="button" class="apikey-btn" data-chat-site-action="fetch">获取模型列表</button>
      </div>
    </div>`;
  }).join("");
}

function renderChatSettingsTab() {
  if (!els.chatSiteSelect) return;
  if (!["apimart", "agtoken", "custom"].includes(chatSettingsSite)) chatSettingsSite = "apimart";
  els.chatSiteSelect.innerHTML = [
    '<option value="apimart">APIMart</option>',
    '<option value="agtoken">AGToken</option>',
    '<option value="custom">自定义站点</option>',
  ].join("");
  els.chatSiteSelect.value = chatSettingsSite;
  renderChatSiteKeyArea();
  renderChatModelToggleList();
  renderChatCustomSiteList();
}

async function saveChatSiteKey() {
  const value = els.chatSiteKeyInput.value.trim();
  if (chatSettingsSite === "agtoken") {
    state.settings.agtokenApiKey = value;
    if (desktop) await desktop.saveApiKey(value, "agtoken");
  } else {
    state.settings.apiKey = value;
    if (desktop) await desktop.saveApiKey(value, "apimart");
  }
  pushHistory();
  renderChatModelToggleList();
  toast(value ? "API Key 已保存" : "API Key 已清除");
}

async function fetchChatCustomModels(card, site) {
  const url = String(site.baseUrl || "").trim();
  if (!url) { toast("请先填写接口地址（填到 /v1 一级）"); return; }
  const button = card.querySelector('[data-chat-site-action="fetch"]');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "获取中…";
  try {
    const resp = await apiFetch("/api/chat-custom/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: url, siteId: site.id, _apiKey: chatCustomSiteKey(site.id) }),
    });
    const data = await resp.json().catch(() => ({}));
    const apiError = typeof data.error === "string" ? data.error : data.error?.message;
    if (!resp.ok || apiError) throw new Error(apiError || `HTTP ${resp.status}`);
    const ids = Array.isArray(data.data) ? data.data.map(item => String(item?.id || "")).filter(Boolean) : [];
    if (!ids.length) throw new Error("上游未返回模型列表");
    // 进候选池不直接进列表：中转站模型可能上百个，展开面板由用户勾选添加
    site.fetchedModels = ids;
    chatCustomPickerOpen.add(site.id);
    pushHistory();
    renderChatCustomSiteList();
    renderChatModelToggleList();
    toast(`已拉取 ${ids.length} 个模型，请勾选需要的加入列表`);
  } catch (error) {
    toast(`获取模型列表失败：${error.message}（可在添加面板手动输入）`);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

if (els.chatSiteSelect) {
  els.chatSiteSelect.addEventListener("change", () => {
    chatSettingsSite = els.chatSiteSelect.value || "apimart";
    chatBuiltinPickerOpen = false;
    renderChatSiteKeyArea();
    renderChatModelToggleList();
  });
  // 输入即生效：只写运行时 state + 刷新模型列表启停（不压历史、不落 secrets）；
  // 失焦或点「保存」才走 saveChatSiteKey 持久化，避免每个击键都加密写盘
  els.chatSiteKeyInput.addEventListener("input", () => {
    const value = els.chatSiteKeyInput.value.trim();
    if (chatSettingsSite === "agtoken") state.settings.agtokenApiKey = value;
    else state.settings.apiKey = value;
    renderChatModelToggleList();
  });
  els.chatSiteKeyInput.addEventListener("change", () => { saveChatSiteKey(); });
  els.chatSiteKeySaveBtn.addEventListener("click", () => { saveChatSiteKey(); });
  els.chatSiteKeyClearBtn.addEventListener("click", () => {
    els.chatSiteKeyInput.value = "";
    saveChatSiteKey();
  });
  els.chatModelToggleList.addEventListener("change", event => {
    const input = event.target.closest("input[data-chat-model]");
    if (!input || input.disabled) return;
    const modelId = input.getAttribute("data-chat-model");
    const set = new Set(Array.isArray(state.settings.chatDisabledModels) ? state.settings.chatDisabledModels : []);
    if (input.checked) set.delete(modelId); else set.add(modelId);
    state.settings.chatDisabledModels = [...set];
    pushHistory();
    renderNodes();
  });
  els.chatModelToggleList.addEventListener("click", async event => {
    // 内置站点行删除：从 chatSiteModels 列表移除（首次操作会把目录默认物化成显式列表）
    const deleteButton = event.target.closest("[data-chat-model-delete]");
    if (deleteButton && chatSettingsSite !== "custom") {
      const modelId = deleteButton.getAttribute("data-chat-model-delete");
      const site = chatSettingsSite;
      if (!state.settings.chatSiteModels || typeof state.settings.chatSiteModels !== "object") state.settings.chatSiteModels = {};
      state.settings.chatSiteModels[site] = chatBuiltinModelIds(site).filter(item => item !== modelId);
      state.settings.chatDisabledModels = (state.settings.chatDisabledModels || []).filter(item => item !== modelId);
      pushHistory();
      renderChatModelToggleList();
      renderNodes();
      return;
    }
    const pickerToggle = event.target.closest("[data-picker-toggle]");
    if (pickerToggle && chatSettingsSite !== "custom") {
      chatBuiltinPickerOpen = !chatBuiltinPickerOpen;
      renderChatModelToggleList();
      return;
    }
    const addSelected = event.target.closest("[data-pick-add-selected]");
    if (addSelected && chatSettingsSite !== "custom") {
      const panel = addSelected.closest(".chat-model-picker");
      if (panel) chatAddPickedBuiltin(chatSettingsSite, panel);
      return;
    }
    // 全不选：当前列表全部取消勾选（黑名单整体加入），方便先清空再挑需要的
    const disableAll = event.target.closest("[data-chat-model-disable-all]");
    if (disableAll && chatSettingsSite !== "custom") {
      const set = new Set(state.settings.chatDisabledModels || []);
      chatBuiltinModelIds(chatSettingsSite).forEach(id => set.add(id));
      state.settings.chatDisabledModels = [...set];
      pushHistory();
      renderChatModelToggleList();
      renderNodes();
      return;
    }
    const resetButton = event.target.closest("[data-chat-model-reset]");
    if (resetButton && chatSettingsSite !== "custom") {
      if (state.settings.chatSiteModels) delete state.settings.chatSiteModels[chatSettingsSite];
      pushHistory();
      renderChatModelToggleList();
      renderNodes();
      return;
    }
    const fetchButton = event.target.closest("[data-chat-site-fetch]");
    if (fetchButton) await fetchChatSiteModels(fetchButton.getAttribute("data-chat-site-fetch"));
  });
  els.chatModelToggleList.addEventListener("keydown", event => {
    if (event.key !== "Enter" || !event.target.classList.contains("chat-picker-manual-input")) return;
    event.preventDefault();
    const panel = event.target.closest(".chat-model-picker");
    if (panel) chatAddPickedBuiltin(chatSettingsSite, panel);
  });
  els.chatModelToggleList.addEventListener("change", event => {
    if (event.target.classList.contains("chat-picker-candidate")) {
      chatUpdatePickerCount(event.target.closest(".chat-model-picker"));
    }
  });
  els.chatModelToggleList.addEventListener("input", event => {
    if (event.target.classList.contains("chat-picker-search")) {
      chatFilterPicker(event.target.closest(".chat-model-picker"), event.target.value);
    }
  });
  els.chatCustomSiteList.addEventListener("input", event => {
    const card = event.target.closest(".chat-custom-site");
    if (!card) return;
    const site = chatCustomSiteById(card.getAttribute("data-site-id"));
    if (!site) return;
    if (event.target.classList.contains("chat-picker-search")) {
      chatFilterPicker(event.target.closest(".chat-model-picker"), event.target.value);
      return;
    }
    if (event.target.classList.contains("chat-site-name")) site.name = event.target.value;
    else if (event.target.classList.contains("chat-site-url")) site.baseUrl = event.target.value.trim();
    else if (event.target.classList.contains("chat-site-models")) site.modelNames = event.target.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    else if (event.target.classList.contains("chat-site-key")) {
      state.settings.chatCustomKeys = state.settings.chatCustomKeys && typeof state.settings.chatCustomKeys === "object" ? state.settings.chatCustomKeys : {};
      state.settings.chatCustomKeys[site.id] = event.target.value.trim();
    }
  });
  els.chatCustomSiteList.addEventListener("change", async event => {
    const card = event.target.closest(".chat-custom-site");
    if (!card) return;
    const site = chatCustomSiteById(card.getAttribute("data-site-id"));
    if (!site) return;
    if (event.target.classList.contains("chat-picker-candidate")) {
      chatUpdatePickerCount(event.target.closest(".chat-model-picker"));
      return;
    }
    if (event.target.classList.contains("chat-site-multimodal")) {
      site.multimodal = event.target.checked === true;
      pushHistory();
      renderChatModelToggleList();
      return;
    }
    // 文本输入失焦冲刷：写回 + 压历史；模型名变化同时刷新上方勾选列表
    if (event.target.classList.contains("chat-site-name")) site.name = event.target.value;
    else if (event.target.classList.contains("chat-site-url")) site.baseUrl = event.target.value.trim();
    else if (event.target.classList.contains("chat-site-models")) site.modelNames = event.target.value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    else if (event.target.classList.contains("chat-site-key")) {
      state.settings.chatCustomKeys = state.settings.chatCustomKeys && typeof state.settings.chatCustomKeys === "object" ? state.settings.chatCustomKeys : {};
      state.settings.chatCustomKeys[site.id] = event.target.value.trim();
      if (desktop) await desktop.saveApiKey(state.settings.chatCustomKeys[site.id], `chatcustom:${site.id}`);
    }
    pushHistory();
    renderChatModelToggleList();
    if (!event.target.classList.contains("chat-site-key")) renderChatSettingsTab();
  });
  els.chatCustomSiteList.addEventListener("click", async event => {
    const card = event.target.closest(".chat-custom-site");
    const site = card ? chatCustomSiteById(card.getAttribute("data-site-id")) : null;
    if (!site) return;
    const pickerToggle = event.target.closest("[data-picker-toggle]");
    if (pickerToggle) {
      if (chatCustomPickerOpen.has(site.id)) chatCustomPickerOpen.delete(site.id); else chatCustomPickerOpen.add(site.id);
      renderChatCustomSiteList();
      return;
    }
    const addSelected = event.target.closest("[data-pick-add-selected]");
    if (addSelected) {
      const panel = addSelected.closest(".chat-model-picker");
      if (panel) chatAddPickedCustom(site, panel);
      return;
    }
    const button = event.target.closest("[data-chat-site-action]");
    if (!button) return;
    if (button.getAttribute("data-chat-site-action") === "delete") {
      state.settings.chatCustomSites = chatCustomSites().filter(item => item.id !== site.id);
      if (state.settings.chatCustomKeys) delete state.settings.chatCustomKeys[site.id];
      chatCustomPickerOpen.delete(site.id);
      if (desktop) await desktop.saveApiKey("", `chatcustom:${site.id}`);
      pushHistory();
      renderChatSettingsTab();
      renderNodes();
      toast("已删除自定义站点，使用它的对话节点已回退默认模型");
    } else if (button.getAttribute("data-chat-site-action") === "fetch") {
      await fetchChatCustomModels(card, site);
    }
  });
  els.chatAddCustomSiteBtn.addEventListener("click", () => {
    const site = { id: uid("cs"), name: "", baseUrl: "", modelNames: [], multimodal: false };
    state.settings.chatCustomSites = [...chatCustomSites(), site];
    pushHistory();
    chatSettingsSite = "custom";
    renderChatSettingsTab();
    // 新卡片的名称输入框直接聚焦，减少一次点击
    els.chatCustomSiteList.querySelector(`.chat-custom-site[data-site-id="${CSS.escape(site.id)}"] .chat-site-name`)?.focus();
  });
}

els.zipExportToggle.onchange = () => {
  state.settings.zipExport = els.zipExportToggle.checked;
  pushHistory();
};

const clearOriginalCacheBtn = document.querySelector("#clearOriginalCacheBtn");
if (window.canvasflowDesktop?.clearOriginalCache) {
  document.querySelector("#originalCacheCard").classList.remove("hidden");
  clearOriginalCacheBtn.onclick = async () => {
    clearOriginalCacheBtn.disabled = true;
    try {
      saveCurrentPage();
      const ids = new Set();
      const seen = new WeakSet();
      const pending = [state.pages, state.history, state.future, state.graphStack, state.clipboard, globalLibrary];
      while (pending.length) {
        const value = pending.pop();
        if (typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)) {
          ids.add(value.toLowerCase());
        } else if (value && typeof value === "object" && !seen.has(value)) {
          seen.add(value);
          for (const child of Object.values(value)) pending.push(child);
        }
      }
      const { deleted, failed } = await window.canvasflowDesktop.clearOriginalCache([...ids]);
      toast(failed ? `已清理 ${deleted} 张参考图，${failed} 张清理失败` :
        deleted ? `已清理 ${deleted} 张参考图` : "没有符合条件的参考图缓存");
    } catch (error) {
      toast(`清理缓存失败：${error.message}`);
    } finally {
      clearOriginalCacheBtn.disabled = false;
    }
  };
}

els.projectExportFolderToggle.onchange = () => {
  state.settings.projectExportFolder = els.projectExportFolderToggle.checked;
  pushHistory();
};

els.extensionServiceUrl.onchange = () => {
  const cfg = extensionSettings();
  cfg.serviceUrl = els.extensionServiceUrl.value.trim().replace(/\/+$/, "") || DEFAULT_EXTENSION_SERVICE_URL;
  els.extensionServiceUrl.value = cfg.serviceUrl;
  pushHistory();
  renderExtensionsPage();
};

els.extensionRefreshBtn.onclick = () => renderExtensionsPage(true);

els.extensionOpenFolderBtn.onclick = async () => {
  const dir = toolExtensionCache.baseDir || extensionSettings().extensionsFolder || "";
  if (!dir) return toast("暂不知道拓展文件夹位置：请先启动扩展服务再试");
  try {
    if (window.canvasflowDesktop?.openOutputFolder) {
      await window.canvasflowDesktop.openOutputFolder(dir);
    } else {
      await copyTextValue(dir);
      toast(`浏览器运行方式无法直接打开文件夹，已复制路径：${dir}`);
    }
  } catch (error) {
    try { await copyTextValue(dir); } catch (_) { /* 保留原始错误提示 */ }
    toast("打开拓展文件夹失败：可能被系统或杀毒软件拦截；已复制完整路径");
  }
};

// ---- Photoshop CEP 面板：仅桌面版提供一键安装，走 DesktopApi 的 /api/cep/* 路由 ----
function describeCepStatus(status) {
  if (!status.sourceExists) return "未找到随包面板文件（cep-panel/CanvasFlowPanel）：安装版需重新打包，源码版请检查仓库目录。";
  if (!status.installed) return `面板未安装\n安装目标：${status.installFolder}`;
  if (status.needsUpdate) return `已安装 v${status.installedVersion}，随包新版本 v${status.sourceVersion}，点击“安装 / 更新面板”覆盖更新。`;
  return `已安装 v${status.installedVersion}\n安装目录：${status.installFolder}`;
}

function setPhotoshopExtensionStatus(text, state, title = "") {
  if (!els.photoshopExtensionStatus) return;
  els.photoshopExtensionStatus.textContent = text;
  els.photoshopExtensionStatus.dataset.state = state;
  els.photoshopExtensionStatus.title = title || text;
}

async function refreshCepPanelStatus() {
  if (!els.cepStatusLine) return;
  refreshPsPathUi();
  if (!desktop) {
    setPhotoshopExtensionStatus("不可用", "unavailable", "仅 CanvasFlow 桌面版支持 Photoshop 插件管理");
    els.cepStatusLine.textContent = "仅 CanvasFlow 桌面版支持一键安装；服务器模式请按 cep-panel/README.md 手动安装。";
    els.cepStatusLine.hidden = false;
    els.cepInstallBtn.disabled = true;
    els.cepUninstallBtn.disabled = true;
    return;
  }
  try {
    const resp = await apiFetch("/api/cep/status");
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const status = await resp.json();
    els.cepStatusLine.textContent = describeCepStatus(status);
    if (!status.sourceExists) setPhotoshopExtensionStatus("缺少文件", "unavailable");
    else if (!status.installed) setPhotoshopExtensionStatus("未安装", "idle");
    else if (status.needsUpdate) setPhotoshopExtensionStatus("可更新", "warning");
    else setPhotoshopExtensionStatus("已安装", "ready");
  } catch (error) {
    const message = String(error.message || error);
    els.cepStatusLine.textContent = message.includes("404")
      ? "当前桌面版还没有 Photoshop 互传组件：面板可以安装，但“在 PS 中编辑”和回传需要下载最新完整安装包。"
      : "面板状态获取失败：" + message;
    setPhotoshopExtensionStatus("不可用", "unavailable", els.cepStatusLine.textContent);
  }
  els.cepStatusLine.hidden = false;
}

async function cepPanelAction(path, confirmText, doneText) {
  if (!confirm(translateUiString(confirmText))) return;
  els.cepInstallBtn.disabled = true;
  els.cepUninstallBtn.disabled = true;
  try {
    const resp = await apiFetch(path, { method: "POST" });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.error) throw new Error(typeof data.error === "string" ? data.error : (data.error?.message || "HTTP " + resp.status));
    toast(doneText);
  } catch (error) {
    toast("操作失败：" + error.message);
  } finally {
    els.cepInstallBtn.disabled = false;
    els.cepUninstallBtn.disabled = false;
    refreshCepPanelStatus();
  }
}

els.cepInstallBtn.onclick = () => cepPanelAction(
  "/api/cep/install",
  "将把 Photoshop CEP 面板安装到当前用户扩展目录（%APPDATA%\\Adobe\\CEP\\extensions\\CanvasFlowPanel），并写入 HKCU 注册表开启 CEP 调试模式（未签名面板必需）。安全软件可能提示一次。继续安装？",
  "CEP 面板已安装：重启 Photoshop 后，在 窗口 > 扩展 > CanvasFlow 面板 打开"
);

els.cepUninstallBtn.onclick = () => cepPanelAction(
  "/api/cep/uninstall",
  "移除已安装的 CanvasFlow 面板目录？（不影响其他扩展，也不关闭 CEP 调试模式开关）",
  "已移除 Photoshop 面板，重启 Photoshop 后生效"
);

// ---- Photoshop 路径设置：存桌面端 data\ps-path.txt，仅桌面版可改 ----
function refreshPsPathUi() {
  if (!els.psPathInput) return;
  if (!desktop?.getPsPath) {
    els.psPathInput.value = "";
    els.psPathInput.disabled = true;
    if (els.psPathBrowseBtn) els.psPathBrowseBtn.disabled = true;
    return;
  }
  els.psPathInput.disabled = false;
  if (els.psPathBrowseBtn) els.psPathBrowseBtn.disabled = false;
  desktop.getPsPath().then(result => { els.psPathInput.value = result.path || ""; }).catch(() => { });
}

els.psPathInput.onchange = async () => {
  if (!desktop?.savePsPath) return;
  try {
    await desktop.savePsPath(els.psPathInput.value.trim());
    toast("Photoshop 路径已保存");
  } catch (error) {
    toast("保存 Photoshop 路径失败：" + error.message);
  }
};

els.psPathBrowseBtn.onclick = async () => {
  if (!desktop?.choosePsExe) return;
  try {
    const result = await desktop.choosePsExe();
    if (result.path) {
      els.psPathInput.value = result.path;
      toast("已选择并保存 Photoshop 路径");
    }
  } catch (error) {
    toast("选择失败：" + error.message);
  }
};

// 服务器模式：轮询 PS 面板回传（桌面版由桥接直接注入 desktop:paste，不走此轮询）
if (!desktop) {
  setInterval(async () => {
    try {
      const resp = await apiFetch("/api/ps/pending");
      if (!resp.ok) return;
      const data = await resp.json();
      for (const item of (data.data || [])) {
        if (item?.data && String(item.data).startsWith("data:image/")) {
          const node = await addImageNodeFromDataUrl(item.data, item.name || "", "image/png", "已从 Photoshop 回传创建图片节点");
          if (node) {
            state.selected = new Set([node.id]);
            revealCreatedNode(node);
            scheduleInteractiveRender({ view: true, minimap: true, selection: true });
          }
        }
      }
    } catch (error) { /* 画布服务未启动等情况静默跳过 */ }
  }, 4000);
}

els.apiKeyInput.onchange = () => {
  setActiveApiKey(els.apiKeyInput.value.trim());
  renderNodes();
  if (desktop) desktop.saveApiKey(activeApiKey(), activeApiType()).then(result => { if (result.warning) toast(result.warning); });
  pushHistory();
};

els.defaultImageModelSelect.onchange = () => {
  state.settings.defaultImageModel = els.defaultImageModelSelect.value;
  syncDefaultParameterOptions();
  console.info("[默认绘图模型] 已更新", { model: state.settings.defaultImageModel });
  pushHistory();
};

els.defaultResolutionSelect.onchange = () => {
  state.settings.defaultResolution = els.defaultResolutionSelect.value;
  pushHistory();
};

els.defaultSizeSelect.onchange = () => {
  state.settings.defaultSize = els.defaultSizeSelect.value;
  pushHistory();
};

els.verifyKeyBtn.onclick = async () => {
  const key = els.apiKeyInput.value.trim();
  if (!key) { toast("请先输入 API Key"); return; }
  els.verifyKeyBtn.disabled = true;
  els.verifyKeyBtn.textContent = "...";
  els.verifyKeyBtn.style.color = "";
  let verified = false;
  let invalid = false;
  let lastStatus = 0;
  let lastError = null;
  const verifyEndpoint = activeApiType() === "agtoken" ? "/api/agtoken/models" : "/api/models";
  for (let attempt = 1; attempt <= 3 && !verified && !invalid; attempt++) {
    try {
      const resp = await apiFetch(verifyEndpoint, { headers: { "X-CanvasFlow-Api-Key": key } });
      lastStatus = resp.status;
      verified = resp.status === 200;
      invalid = resp.status === 401 || resp.status === 403;
      if (!verified && !invalid) console.warn(`[API验证] 第 ${attempt} 次返回 HTTP ${resp.status}`);
    } catch (err) {
      lastError = err;
      console.warn(`[API验证] 第 ${attempt} 次网络失败：${err.message || err}`);
    }
    if (!verified && !invalid && attempt < 3) await new Promise(resolve => setTimeout(resolve, 800));
  }
  if (verified) {
    els.verifyKeyBtn.textContent = "✓";
    els.verifyKeyBtn.style.color = "#34c759";
    toast("API Key 有效");
  } else if (invalid) {
    els.verifyKeyBtn.textContent = "✗";
    els.verifyKeyBtn.style.color = "#ff3b30";
    toast("API Key 无效");
  } else {
    els.verifyKeyBtn.textContent = "!";
    els.verifyKeyBtn.style.color = "#ff9f0a";
    const detail = lastStatus ? `HTTP ${lastStatus}` : (lastError?.message || "网络连接失败");
    console.warn(`[API验证] 暂时无法确认 Key：${detail}`);
    toast("暂时无法验证，不代表 API Key 无效，请稍后重试");
  }
  els.verifyKeyBtn.disabled = false;
  window.setTimeout(() => { els.verifyKeyBtn.textContent = "验证"; els.verifyKeyBtn.style.color = ""; }, 2500);
};

async function fetchBalance() {
  const key = state.settings.apiKey || els.apiKeyInput.value.trim();
  if (!key) { els.balanceDisplay.textContent = "令牌余额：请先填入 API Key"; return; }
  els.balanceDisplay.textContent = "令牌余额：查询中...";
  try {
    const resp = await apiFetch("/api/balance", { headers: { "X-CanvasFlow-Api-Key": key } });
    const data = await resp.json();
    if (resp.ok && data.success) {
      if (data.unlimited_quota === true) {
        els.balanceDisplay.textContent = "令牌余额：无限额度";
      } else {
        const remainBalance = Number(data.remain_balance);
        const usedBalance = Number(data.used_balance);
        if (!Number.isFinite(remainBalance)) throw new Error("令牌余额响应缺少 remain_balance");
        const balance = remainBalance * 10;
        const used = (Number.isFinite(usedBalance) ? usedBalance : 0) * 10;
        els.balanceDisplay.textContent = `令牌余额：${balance.toFixed(2)}（已用 ${used.toFixed(2)}）`;
      }
    } else {
      console.warn("[令牌余额] 查询失败", { status: resp.status, message: data.message || data.error?.message || "" });
      els.balanceDisplay.textContent = "令牌余额：查询失败";
    }
  } catch (error) {
    console.error("[令牌余额] 查询异常", error);
    els.balanceDisplay.textContent = "令牌余额：网络错误";
  }
}

async function applyWebUpdate({ confirmed = false } = {}) {
  if (!desktop?.applyWebUpdate || !lastUpdateCheckResult?.canHotUpdate) return;
  if (!confirmed && !window.confirm(updateText("更新前会保存当前项目，完成后画布会自动重新载入。现在更新吗？", "The current project will be saved and the canvas will reload after updating. Continue?"))) return;
  els.installWebUpdateBtn.disabled = true;
  els.updateStatus.textContent = updateText("正在下载并校验界面更新…", "Downloading and verifying the interface update…");
  toast(updateText("正在保存项目并下载界面更新，请稍候…", "Saving your project and downloading the interface update. Please wait…"));
  try {
    saveCurrentPage();
    await persistDesktopStateNow();
    const backupSaved = await writeAutoBackup("web-update");
    if (!backupSaved) throw new Error(updateText("自动备份失败", "automatic backup failed"));
    const result = await desktop.applyWebUpdate();
    console.info("[界面热更新] 已完成，等待重新载入", result);
    els.updateStatus.textContent = updateText(`界面 ${result.version || ""} 已安装，正在重新载入…`, `Interface ${result.version || ""} installed; reloading…`);
  } catch (error) {
    els.updateStatus.textContent = updateText("热更新失败，当前版本未改变；请重试或下载完整安装包。", "Hot update failed and the current version was kept. Retry or download the full installer.");
    toast(updateText(`更新没有完成：${error.message}`, `Update did not complete: ${error.message}`));
    console.error("[界面热更新] 失败", error);
    els.installWebUpdateBtn.disabled = false;
  }
}

els.balanceRefreshBtn.onclick = fetchBalance;

els.saveKeyBtn.onclick = async () => {
  setActiveApiKey(els.apiKeyInput.value.trim());
  renderNodes();
  if (desktop) {
    const result = await desktop.saveApiKey(activeApiKey(), activeApiType());
    if (result.warning) toast(result.warning);
  }
  saveCurrentPage();
  persistPages();
  pushHistory();
  toast("API Key 已保存");
  updateOnboardingApiStatus();
};

els.clearKeyBtn.onclick = async () => {
  els.apiKeyInput.value = "";
  state.settings.apiKey = "";
  state.settings.agtokenApiKey = "";
  renderNodes();
  if (desktop) {
    await desktop.saveApiKey("", "apimart");
    await desktop.saveApiKey("", "agtoken");
    // 自定义对话站点的 key 同存 secrets，逐站点清除
    for (const site of chatCustomSites()) {
      await desktop.saveApiKey("", `chatcustom:${site.id}`);
    }
    state.settings.chatCustomKeys = {};
  }
  // Clear API key from all pages' saved settings
  state.pages.forEach(page => {
    if (page.data && page.data.settings) {
      page.data.settings.apiKey = "";
      page.data.settings.agtokenApiKey = "";
      delete page.data.settings.chatCustomKeys;
    }
  });
  saveCurrentPage();
  persistPages();
  pushHistory();
  applySettings();
  renderChatSettingsTab();
  toast("API Key 已从所有页面清除，可安全分享");
};

els.copyProjectPathBtn.onclick = copyProjectPath;
els.chooseProjectFolderBtn.onclick = async () => {
  if (!desktop?.chooseProjectFolder) return toast("修改项目文件夹仅支持 .NET 桌面版");
  try {
    const result = await desktop.chooseProjectFolder(els.projectFolder.textContent.trim());
    if (result?.cancelled || !result?.path) return;
    const selectedPath = String(result.path).trim();
    runtimeProjectFolder = selectedPath;
    state.settings.projectFolderLabel = selectedPath;
    els.projectFolder.textContent = selectedPath;
    try { localStorage.setItem(PROJECT_FOLDER_KEY, selectedPath); } catch (_) { /* 桌面状态仍会保存 */ }
    for (const page of state.pages) {
      if (page?.data?.settings) page.data.settings.projectFolderLabel = selectedPath;
    }
    saveCurrentPage();
    persistPages();
    console.info("[项目文件夹] 保存位置已修改", { path: selectedPath });
    toast("项目保存位置已修改");
  } catch (error) {
    console.error("[项目文件夹] 选择失败", error);
    toast(`无法修改项目文件夹：可能是路径权限不足或选择器异常；请换一个普通文件夹后重试。${error.message || ""}`);
  }
};
els.openProjectFolderBtn.onclick = async () => {
  const folderPath = els.projectFolder.textContent.trim();
  if (!folderPath) return toast("项目文件夹路径为空，请先修改位置");
  if (!desktop?.openOutputFolder) return toast("打开项目文件夹仅支持 .NET 桌面版");
  try {
    await desktop.openOutputFolder(folderPath);
    toast("已打开项目文件夹");
  } catch (error) {
    console.error("[项目文件夹] 打开失败", error);
    try { await copyTextValue(folderPath); } catch (_) { /* 保留原始错误 */ }
    toast("无法打开项目文件夹：可能被系统或安全软件拦截；路径已复制，可粘贴到资源管理器地址栏");
  }
};

els.customMaterialFileBtn.onclick = async () => {
  if (desktop?.chooseImageFile) {
    try {
      const exportPath = state.settings.exportFolderLabel || runtimeExportFolder;
      const result = await desktop.chooseImageFile(exportPath);
      if (result?.cancelled || !result?.data) return;
      pendingCustomImage = result;
      if (els.customMaterialFileHint) {
        els.customMaterialFileHint.textContent = result.name || "";
      }
      if (els.customMaterialEditorPreview) {
        els.customMaterialEditorPreview.src = `data:${result.mime || "image/png"};base64,${result.data}`;
        els.customMaterialEditorPreview.classList.remove("hidden");
      }
    } catch (error) {
      console.error("[自定义图片] 选择图片失败", error);
      toast(`选择图片失败：${error.message || "无法选择图片"}`);
    }
    return;
  }
  els.customMaterialFileInput.click();
};

els.customMaterialFileInput.onchange = async function() {
  var file = els.customMaterialFileInput.files?.[0];
  if (els.customMaterialFileHint) {
    els.customMaterialFileHint.textContent = file ? file.name : "";
  }
  if (file && els.customMaterialEditorPreview) {
    try {
      els.customMaterialEditorPreview.src = await fileToDataUrl(file);
      els.customMaterialEditorPreview.classList.remove("hidden");
    } catch (error) {
      console.error("[自定义图片] 预览失败", error);
      toast("图片预览失败：文件可能损坏，请重新选择");
    }
  }
};

els.customMaterialAddBtn.onclick = () => addCustomMaterial();
els.customTextAddBtn.onclick = () => addCustomText();
els.newVariableDefinitionBtn.onclick = () => openVariableDefinitionEditor();
els.variableDefinitionCancelBtn.onclick = closeVariableDefinitionEditor;
els.variableDefinitionSaveBtn.onclick = saveVariableDefinition;
els.variableDefinitionsList.onclick = event => {
  const row = event.target.closest(".variable-definition-item");
  if (!row) return;
  const index = globalLibrary.variableDefinitions.findIndex(item => item.id === row.dataset.id);
  if (index < 0) return;
  const action = event.target.dataset.variableAction;
  if (action === "edit") return openVariableDefinitionEditor(row.dataset.id);
  if (action === "delete") {
    const item = globalLibrary.variableDefinitions[index];
    if (!confirm(translateUiString(`删除变量“${item.name}”？已有节点会保留快照并标记为失效。`))) return;
    globalLibrary.variableDefinitions.splice(index, 1);
  } else return;
  persistLibraries(); renderVariableDefinitions(); render();
};
async function importLibraryFile(name, content) {
  try {
    const parsed = JSON.parse(content);
    const data = parsed?.type === "library" ? { globalLibrary: parsed.library } : parsed;
    const pages = Array.isArray(data.pages) ? data.pages : [{ id: "json", name: name.replace(/\.(?:cflow|json)$/i, ""), data }];
    const sources = pages.map(page => ({ id: page.id, name: page.name || "未命名项目", library: normalizeLibrary(page.data?.customLibrary || page.customLibrary) }));
    const importedGlobalLibrary = normalizeLibrary(data.globalLibrary);
    if (importedGlobalLibrary.textTemplates.length || importedGlobalLibrary.imageMaterials.length || importedGlobalLibrary.multiNodeTemplates.length || importedGlobalLibrary.variableDefinitions.length) sources.unshift({ id: "global", name: "素材库", library: importedGlobalLibrary });
    if (!sources.some(source => source.library.textTemplates.length || source.library.imageMaterials.length || source.library.multiNodeTemplates.length || source.library.variableDefinitions.length)) return toast("该文件中没有可导入的图文、多个节点或变量");
    openLibraryImport(sources);
  } catch (e) { console.error("[导入] 素材 JSON 解析失败", e); toast("导入失败：JSON 格式不正确"); }
}
els.exportLibraryJsonBtn.onclick = async () => {
  try {
    const library = JSON.parse(JSON.stringify(globalLibrary));
    const payload = { canvasflowVersion: 1, type: "library", savedAt: new Date().toISOString(), library };
    const failures = await embedLibraryImages({ globalLibrary: payload.library });
    if (failures.length) throw new Error(`${failures.length} 个图片素材无法读取`);
    const saved = await writeCflowFile("CanvasFlow素材库.cflow", payload);
    toast(`素材库已导出：${saved.path || "CanvasFlow素材库.cflow"}`);
  } catch (error) {
    console.error("[素材库] 导出失败", error);
    toast(`导出失败：${error.message || "无法写入文件"}`);
  }
};
els.importLibraryJsonBtn.onclick = async () => {
  if (!desktop?.chooseLibraryFile) return els.importLibraryJsonInput.click();
  try {
    const result = await desktop.chooseLibraryFile(state.settings.projectFolderLabel || runtimeProjectFolder);
    if (!result?.cancelled && result?.name && typeof result.content === "string") await importLibraryFile(result.name, result.content);
  } catch (error) {
    console.error("[导入] 无法读取素材文件", error);
    toast(`导入失败：${error.message || "无法读取文件"}`);
  }
};
els.importLibraryJsonInput.onchange = async () => {
  const file = els.importLibraryJsonInput.files?.[0]; if (!file) return;
  try { await importLibraryFile(file.name, await file.text()); }
  finally { els.importLibraryJsonInput.value = ""; }
};
els.libraryImportCloseBtn.onclick = closeLibraryImport;
els.libraryImportCancelBtn.onclick = closeLibraryImport;
els.libraryImportSource.onchange = renderLibraryImportItems;
els.libraryImportConfirmBtn.onclick = confirmLibraryImport;

els.loadJson.onchange = async () => {
  const file = els.loadJson.files?.[0];
  if (!file) return;
  try {
  const parsed = JSON.parse(await file.text());
  if (parsed?.type === "library") {
    toast("这是素材库备份，请在“设置 → 素材库 → 导入素材”中打开");
    els.loadJson.value = "";
    return;
  }
  const data = parsed?.type === "project" ? parsed.project : parsed;
  if (!data || (!Array.isArray(data.pages) && !Array.isArray(data.nodes))) throw new Error("缺少项目数据");
  if (!parsed?.type) await restoreLibrariesFromJson(data);
  saveCurrentPage();
  savePageHistory();
  resetGraphNavigation();
  const fallbackName = file.name.replace(/\.(?:cflow|json)$/i, "");
  const imported = prepareImportedProjects(data, fallbackName);
  if (!imported.pages.length) throw new Error("项目文件中没有可打开的项目");
  state.groups.push(...imported.groups);
  imported.pages.forEach(page => { page.mode = "ai"; });
  state.pages.push(...imported.pages);
  normalizeGroups();
  let page = state.pages.find(item => item.id === imported.activePageId);
  if (!page) {
    page = imported.pages[0];
  }
  if (!page) {
    page = blankPage(`项目${state.nextPageNum++}`, "ai");
    state.pages.push(page);
  }
  state.activePageId = page.id;
  restoreData(page.data);
  await resolveImageRefs(state.nodes);
  saveCurrentPage();
  for (const page of state.pages) {
    if (page.id !== state.activePageId) await resolveImageRefs(page.data?.nodes || []);
  }
  state._deletedPage = null;
  state.history = [cloneData()];
  state.future = [];
  updateUndoRedo();
  markDirty();
  toast(`已新增 ${imported.pages.length} 个项目`);
  } catch (error) {
    console.error("[项目打开] 失败", { file: file.name, message: error.message });
    toast(`打开失败：${error.message || "文件格式不正确"}；请选择有效的 .cflow 项目或旧版 JSON`);
  }
  els.loadJson.value = "";
};

async function materializeNodeAssetsForPortableSave(nodes, readImage = materializeReferenceImage) {
  for (const node of nodes || []) {
    if (node.imageAssetId) {
      node.image = await readImage({ assetId: node.imageAssetId, image: node.image });
      delete node.imageAssetId;
    }
    if (node.generatedAssetId) {
      node.generatedImage = await readImage({ assetId: node.generatedAssetId, image: node.generatedImage });
      delete node.generatedAssetId;
    }
    for (const image of node.images || []) {
      if (image.assetId) {
        image.image = await readImage(image);
        delete image.assetId;
      }
    }
    for (const attachment of allChatAttachments(node)) {
      if (attachment.assetId) {
        attachment.image = await readImage(attachment);
        delete attachment.assetId;
      }
    }
    for (const task of node.batchTasks || []) {
      if (task.resultAssetId) {
        task.result = await readImage({ assetId: task.resultAssetId, image: task.result });
        delete task.resultAssetId;
      }
    }
    if (Array.isArray(node.items)) await materializeNodeAssetsForPortableSave(node.items, readImage);
    if (Array.isArray(node.subgraph?.nodes)) await materializeNodeAssetsForPortableSave(node.subgraph.nodes, readImage);
  }
}

async function saveJson() {
  try {
    saveCurrentPage();
    normalizeGroups();
    const project = JSON.parse(JSON.stringify({ pages: state.pages, groups: state.groups, activePageId: state.activePageId }));
    for (const page of project.pages || []) { delete page._history; delete page._future; }
    for (const page of project.pages || []) await materializeNodeAssetsForPortableSave(page.data?.nodes || []);
    const payload = { canvasflowVersion: 1, type: "project", savedAt: new Date().toISOString(), project };
    const name = `${safeName(currentPage()?.name || "canvas")}.cflow`;
    const saved = await writeCflowFile(name, payload);
    console.info("[项目保存] 已写入", { path: saved.path || name, pages: project.pages?.length || 0 });
    state.dirty = false;
    toast("项目已保存");
  } catch (error) {
    console.error("[项目保存] 失败", error);
    toast(`保存失败：${error.message || "文件夹权限不足或内容无法读取"}；请检查保存位置后重试`);
  }
}

async function writeCflowFile(name, payload) {
  const content = JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: "application/x-canvasflow+json" });
  if (state.exportDirHandle) {
    const handle = await state.exportDirHandle.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { path: name };
  }
  if (desktop) {
    const resp = await apiFetch("/api/save-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content, folderPath: state.settings.projectFolderLabel || runtimeProjectFolder }),
    });
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok || !result.success) throw new Error(result.error || `HTTP ${resp.status}`);
    return result;
  }
  downloadBlob(blob, name);
  return { path: name };
}

async function embedLibraryImages(data) {
  const failures = [];
  const libraries = [data.globalLibrary, ...(data.pages || []).map(page => page.data?.customLibrary)].filter(Boolean);
  for (const library of libraries) {
    for (const item of library.imageMaterials || []) {
      if (!item.fileName) { failures.push(item.name); continue; }
      try {
        const resp = await fetch(customMaterialImageUrl(item.fileName));
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        item.data = stripDataUrl(await blobToBase64(await resp.blob()));
      } catch (e) { failures.push(item.name); console.error("[保存] 自定义图片读取失败", item.name, e); }
    }
    for (const template of library.multiNodeTemplates || []) {
      for (const image of template.imageFiles || []) {
        if (!image.fileName) { failures.push(`${template.name} / 图片`); continue; }
        try {
          const resp = await fetch(customMaterialImageUrl(image.fileName));
          if (!resp.ok) throw new Error("HTTP " + resp.status);
          image.data = stripDataUrl(await blobToBase64(await resp.blob()));
        } catch (e) { failures.push(`${template.name} / ${image.fileName}`); console.error("[保存] 多节点模板图片读取失败", template.name, image.fileName, e); }
      }
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
        const resp = await apiFetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: item.fileName || "custom.png", data: stripDataUrl(item.data) }) });
        const result = await resp.json(); if (!result.success) throw new Error(result.error || "恢复失败");
        item.fileName = result.fileName; delete item.data;
      } catch (e) { console.error("[加载] 项目自定义图片恢复失败", item.name, e); }
    }
    for (const template of library.multiNodeTemplates) {
      for (const image of template.imageFiles || []) {
        if (!image.data) continue;
        try {
          const resp = await apiFetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: image.fileName || "template.png", data: stripDataUrl(image.data) }) });
          const result = await resp.json(); if (!result.success) throw new Error(result.error || "恢复失败");
          image.fileName = result.fileName; delete image.data;
        } catch (e) { console.error("[加载] 项目多节点模板图片恢复失败", template.name, e); }
      }
    }
    importedGlobal.textTemplates.push(...library.textTemplates);
    importedGlobal.imageMaterials.push(...library.imageMaterials);
    importedGlobal.multiNodeTemplates.push(...library.multiNodeTemplates);
    importedGlobal.variableDefinitions.push(...library.variableDefinitions);
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
        const resp = await apiFetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: item.fileName || "custom.png", data: stripDataUrl(item.data) }) });
        const result = await resp.json(); if (!result.success) throw new Error(result.error || "恢复失败"); item.fileName = result.fileName;
      }
      item.name = uniqueTemplateName("image", item.name, globalLibrary); delete item.data; globalLibrary.imageMaterials.push(item);
    } catch (e) { console.error("[加载] 全局自定义图片恢复失败", item.name, e); }
  }
  for (const template of importedGlobal.multiNodeTemplates) {
    try {
      if (globalLibrary.multiNodeTemplates.some(existing => existing.id === template.id)) continue;
      for (const image of template.imageFiles || []) {
        if (!image.data) continue;
        const resp = await apiFetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: image.fileName || "template.png", data: stripDataUrl(image.data) }) });
        const result = await resp.json(); if (!result.success) throw new Error(result.error || "恢复失败");
        image.fileName = result.fileName; delete image.data;
      }
      template.name = uniqueMultiNodeTemplateName(template.name, globalLibrary);
      globalLibrary.multiNodeTemplates.push(normalizeMultiNodeTemplate(template));
    } catch (e) { console.error("[加载] 全局多节点模板恢复失败", template.name, e); }
  }
  for (const item of importedGlobal.variableDefinitions) {
    if (globalLibrary.variableDefinitions.some(existing => existing.id === item.id)) continue;
    const copy = normalizeVariableDefinition(item);
    let desiredName = copy.name, suffix = 2;
    while (globalLibrary.variableDefinitions.some(existing => existing.name.toLocaleLowerCase() === desiredName.toLocaleLowerCase())) desiredName = `${copy.name} (${suffix++})`;
    copy.name = desiredName;
    globalLibrary.variableDefinitions.push(copy);
  }
  saveGlobalLibrary();
}

async function copyProjectPath() {
  const folderPath = els.projectFolder.textContent.trim();
  if (!folderPath) {
    toast("请先设置项目文件夹路径");
    return false;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(folderPath);
    } else {
      if (!document.execCommand("copy")) throw new Error("copy command failed");
    }
    toast(`已复制项目路径：${folderPath}`);
    return true;
  } catch (err) {
    console.error("[项目文件夹] 复制路径失败", err);
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
        const resultData = await materializeReferenceImage(img);
        files.push({ name: `生成结果/图片${resultNumber}.${ext}`, blob: dataUrlToBlob(resultData) });

        if (state.settings.exportInputs && img.aiSourceNodeId) {
          const upstream = collectUpstreamForAI(img.aiSourceNodeId, incoming);
          const refs = [...upstream.images];
          if (Number.isInteger(img.aiBatchIndex) && upstream.groupImages[img.aiBatchIndex]) refs.push(upstream.groupImages[img.aiBatchIndex]);
          else if (!Number.isInteger(img.aiBatchIndex)) refs.push(...upstream.groupImages);

          const refFileNames = [];
          for (const ref of refs) {
            if (!ref.image && !ref.assetId) continue;
            const referenceKey = ref.assetId || ref.image;
            let path = referenceNames.get(referenceKey);
            if (!path) {
              path = uniqueExportPath("参考图", ref.fileName || "参考图.png", `参考图${referenceNames.size + 1}`, ref.mime);
              referenceNames.set(referenceKey, path);
              files.push({ name: path, blob: dataUrlToBlob(await materializeReferenceImage(ref)) });
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
      completedBatch.forEach(t => result.images.push({ image: t.result, assetId: t.resultAssetId || "", fileName: t.fileName || "ai_generated.png", mime: "image/png", aiSourceNodeId: n.id, aiBatchIndex: t.index }));
    } else if (n.generatedImage) {
      result.images.push({ image: n.generatedImage, assetId: n.generatedAssetId || "", fileName: n.fileName || "ai_generated.png", mime: n.mime || "image/png", aiSourceNodeId: n.id });
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
      result.images.push({ image: n.image, assetId: n.imageAssetId || "", fileName: n.fileName, mime: n.mime, aiSourceNodeId: n.aiSourceNodeId, aiBatchIndex: n.aiBatchIndex });
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
    return { texts: [], images: [{ image: n.image, assetId: n.imageAssetId || "", fileName: n.fileName, mime: n.mime, aiSourceNodeId: n.aiSourceNodeId, aiBatchIndex: n.aiBatchIndex }] };
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
    const resp = await apiFetch("/api/save-export-files", {
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
    if (allChatAttachments(node).length) {
      for (const attachment of allChatAttachments(node)) {
        if (!attachment.image || attachment.image.startsWith("data:") || attachment.image.startsWith("http")) continue;
        if (attachment.image.includes("://")) continue;
        try {
          const resp = await fetch("/download/images/" + encodeURIComponent(attachment.image));
          if (!resp.ok) throw new Error("not found");
          const blob = await resp.blob();
          attachment.image = await blobToBase64(blob);
        } catch {
          attachment.image = null;
        }
      }
    }
    if (Array.isArray(node.items)) await resolveImageRefs(node.items);
    if (Array.isArray(node.subgraph?.nodes)) await resolveImageRefs(node.subgraph.nodes);
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

  // 统计总任务数（图片扇入按支线拆分 × 组批量展开 × 生成张数；gpt-image-2.5 系单任务多图不拆）
  let totalTasks = 0;
  aiNodes.forEach(node => {
    const up = collectUpstreamForAI(node.id);
    if (up.texts.length || up.groupImages.length || (up.branches || []).some(branch => branch.images.length)) {
      totalTasks += (up.branches.length || 1) * (up.groupImages.length || 1) * taskCountFactor(node);
    }
  });

  els.executeTitle.textContent = `共 ${totalTasks} 个任务（${aiNodes.length} 个节点）· 双击标题放大`;
  els.executeTitle.title = "双击标题栏可最大化窗口";
  els.executeList.innerHTML = "";

  aiNodes.forEach(node => {
    const upstream = collectUpstreamForAI(node.id);
    const refImages = upstream.orderedRefs.slice(0, 8);
    const taskCount = (upstream.branches?.length || 1) * (upstream.groupImages.length || 1) * taskCountFactor(node);
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
  if (!activeApiKey()) {
    toast("请先在设置中填入 API Key");
    return;
  }
  const candidates = state.nodes
    .filter(node => node.type === "ai-image" && !node.disabled)
    .map(node => node.id);
  let added = 0;
  candidates.forEach(nodeId => { added += enqueueAiNode(nodeId, "image-node"); });
  if (!added) toast("没有可加入队列的 AI 绘图任务");
  return;

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

  // 展开所有任务：每个 AI 节点的多任务图片展开为独立任务，单图节点为一个任务
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
      const regularUrls = upstream.images;
      const prompt = upstream.texts.join("，");
      let taskImages;
      if (t.groupIdx >= 0) {
        taskImages = [...regularUrls, upstream.groupImages[t.groupIdx]];
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
      t.result = embedGenerationMetadata(await fetchImageAsBase64(imageUrl), generationMetadataFor(prompt, currentPage()?.name || "项目", t.taskId));
      await externalizeImageField(t, "result", "resultAssetId", t.fileName || "ai_batch.png");
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
      const imgNode = addNode("image", aiX + NODE_WIDTH + 40, aiY + i * IMAGE_NODE_VERTICAL_STEP, false);
      imgNode.image = t.result;
      imgNode.imageAssetId = t.resultAssetId || "";
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

if (els.taskQueueBtn) {
  els.taskQueueBtn.onclick = () => setTaskQueueOpen(els.taskQueuePanel.classList.contains("hidden"));
  els.taskQueueCloseBtn.onclick = () => setTaskQueueOpen(false);
  els.taskQueueClearBtn.onclick = () => {
    const affectedNodeIds = new Set(aiTaskQueue.items.filter(queueTaskIsSettled).map(task => task.nodeId));
    aiTaskQueue.items = aiTaskQueue.items.filter(task => !queueTaskIsSettled(task));
    affectedNodeIds.forEach(refreshQueuedNodeProgress);
    renderTaskQueue();
  };
  els.taskQueueList.addEventListener("click", event => {
    const button = event.target.closest("[data-queue-action]");
    const row = event.target.closest("[data-task-id]");
    if (!button || !row) return;
    manageQueuedTask(row.dataset.taskId, button.dataset.queueAction);
  });
  renderTaskQueue();
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
  fetchToolExtensions();
  try {
    const resp = await apiFetch("/api/runtime-paths", { cache: "no-store" });
    const data = await resp.json();
    if (!resp.ok || !data.exportFolder) throw new Error(data.error || `HTTP ${resp.status}`);
    runtimeExportFolder = data.exportFolder;
    runtimeProjectFolder = data.projectsFolder || runtimeProjectFolder;
    console.info("[初始化] 默认导出目录", { exportFolder: runtimeExportFolder });
  } catch (err) {
    console.error("[初始化] 无法识别默认导出目录", err);
    toast("无法识别程序所在目录：将暂时使用 export；请在设置中确认完整导出路径");
  }
  try {
    const savedOutputFolder = localStorage.getItem(OUTPUT_FOLDER_KEY)?.trim();
    if (savedOutputFolder) {
      runtimeExportFolder = savedOutputFolder;
      console.info("[初始化] 使用用户设置的生成目录", { exportFolder: runtimeExportFolder });
    }
  } catch (error) {
    console.warn("[初始化] 无法读取生成目录设置，将使用默认目录", error);
  }
  try {
    const savedProjectFolder = localStorage.getItem(PROJECT_FOLDER_KEY)?.trim();
    if (savedProjectFolder) runtimeProjectFolder = savedProjectFolder;
    console.info("[初始化] 项目保存目录", { projectFolder: runtimeProjectFolder });
  } catch (error) {
    console.warn("[初始化] 无法读取项目保存目录，将使用默认目录", error);
  }
  const desktopState = await loadDesktopState();
  const restoredExistingState = loadPagesFromStorage(desktopState);
  if (!restoredExistingState) {
    const page = blankPage("项目1");
    state.pages = [page];
    state.activePageId = page.id;
    state.nextPageNum = 2;
    restoreData(page.data);
  }
  if (desktop) {
    try {
      const secret = await desktop.getApiKey();
      state.settings.apiKey = secret.apiKey || "";
      state.settings.agtokenApiKey = secret.agtokenApiKey || "";
      if (secret.chatCustomKeys && typeof secret.chatCustomKeys === "object") state.settings.chatCustomKeys = secret.chatCustomKeys;
    } catch (error) { console.error("[安全存储] API Key 读取失败", error); }
    await flushDesktopAssetMigration();
  }
  state.history = [cloneData()];
  state.future = [];
  updateUndoRedo();
  applySettings();
  syncUiColorInputs();
  applyApiTypeSettingsUi();
  render();
  setUiLanguage(uiLanguage);
  const uiObserver = new MutationObserver(changes => {
    for (const change of changes) {
      if (change.type === "characterData" || change.type === "attributes") translateUiTree(change.target);
      for (const node of change.addedNodes) translateUiTree(node);
    }
  });
  uiObserver.observe(document.body, { childList: true, characterData: true, attributes: true, attributeFilter: ["title", "placeholder", "aria-label", "alt"], subtree: true });
  autoBackupReady = true;
  scheduleAutoBackup();
  console.info("[自动备份] 已启用", { file: autoBackupFileName(), intervalMs: 2000 });
  if (desktop) {
    try { await persistDesktopStateNow(); }
    catch (error) { console.error("[项目状态] 首次保存失败", error); toast("项目状态无法保存到本地：请检查安装目录写入权限"); }
  }
  window.setTimeout(() => checkForUpdates({ silent: true, prompt: true }), 1200);
  if (onboardingSeenVersion < ONBOARDING_VERSION) {
    window.setTimeout(() => startOnboarding({ manual: false }), 450);
  }

  if (desktop) desktop.onSaveRequest(async request => {
    try {
      if (desktopStateTimer) { clearTimeout(desktopStateTimer); desktopStateTimer = null; }
      await flushDesktopAssetMigration();
      await persistDesktopStateNow();
      const backupSaved = await writeAutoBackup(request.reason || "desktop-exit");
      if (!backupSaved) throw new Error("项目状态已保存，但自动备份文件写入失败");
      desktop.completeSave({ requestId: request.requestId, ok: true });
    } catch (error) {
      console.error("[退出保存] 保存失败", error);
      desktop.completeSave({ requestId: request.requestId, ok: false, error: error.message });
    }
  });
  if (desktop?.webReady) desktop.webReady();
}

init().catch(e => { console.error("[初始化] 启动失败", e); toast("启动失败：" + e.message); });

els.nodes.addEventListener("keydown", ev => { if (ev.target.dataset.role === "text-inline-edit" && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); ev.target.click(); } });


// Extension inbox. Keep deliveries until the canvas has committed and acknowledged them.
const browserTransferReceiver = crypto.randomUUID();
const browserTransferReceived = new Set();
let browserTransferPolling = false;
async function pollBrowserImageTransfers() {
  if (browserTransferPolling) return;
  browserTransferPolling = true;
  const request = async payload => {
    const response = await apiFetch("/api/browser-transfer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, receiver: browserTransferReceiver }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
  try {
    const result = await request({ action: "poll", focused: document.hasFocus() });
    for (const item of result.items || []) {
      if (!browserTransferReceived.has(item.id)) {
        const bounds = els.viewport.getBoundingClientRect();
        const point = screenToWorld(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
        let node;
        if (item.kind === "text") {
          const text = String(item.text || "");
          if (!text.trim()) {
            await request({ action: "ack", id: item.id });
            continue;
          }
          node = addNode("text", point.x, point.y, false);
          node.text = text;
        } else {
          // Decode before touching the graph; invalid downloads must not create empty nodes.
          const preview = new Image();
          preview.src = item.image;
          try { await preview.decode(); }
          catch {
            await request({ action: "ack", id: item.id });
            toast("网页图片无法解码，请换一张图片后重试");
            continue;
          }
          const source = { image: item.image, mime: item.image.match(/^data:([^;,]+)/)?.[1] || "image/png" };
          source.fileName = `browser_${timestamp()}.${extensionFor("", source.mime)}`;
          await externalizeImageField(source, "image", "imageAssetId", source.fileName);
          node = addNode("image", point.x, point.y, false);
          Object.assign(node, source);
        }
        if (/^https?:\/\//i.test(String(item.sourceUrl || ""))) node.sourceUrl = String(item.sourceUrl).slice(0, 4096);
        browserTransferReceived.add(item.id);
        state.selected = new Set([node.id]);
        pushHistory();
        render();
        toast(item.kind === "text" ? "已接收网页文字" : "已接收网页图片");
      }
      await request({ action: "ack", id: item.id });
      browserTransferReceived.delete(item.id);
    }
  } catch (error) {
    // Old hosts may lack this optional route. Retain unacknowledged images for retry.
    if (!/^HTTP (404|405)$/.test(error.message)) console.debug("[网页图片接收]", error.message);
  } finally { browserTransferPolling = false; }
}
setInterval(pollBrowserImageTransfers, 2500);
pollBrowserImageTransfers();
window.addEventListener("focus", pollBrowserImageTransfers);


// Global color palettes and reference-image sampling.
function paletteFor(node) {
  return globalLibrary.palettes.find(item => item.id === (node ? node.paletteId : editorPaletteId));
}

function paletteCardInk(hex) {
  const luminance = hex.slice(1).match(/../g).reduce((sum, part, channel) => {
    const value = parseInt(part, 16) / 255;
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][channel];
  }, 0);
  return luminance >= 0.65 ? "dark" : "light";
}

function paletteHue(hex) {
  const [r, g, b] = hex.slice(1).match(/../g).map(part => parseInt(part, 16));
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (!delta) return 360;
  const sector = max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta;
  return (sector * 60 + 360) % 360;
}

const paletteFamilies = {
  all: ["全部色系", 0, 360], red: ["红色系", -15, 15], warm: ["橙黄色系", 20, 55],
  green: ["绿色系", 80, 150], blue: ["青蓝色系", 180, 240], purple: ["紫色系", 260, 300],
  pink: ["粉色系", 310, 340], earth: ["棕色系", 15, 45], gray: ["黑白灰", 0, 360],
};
const paletteLevels = { all: "不限", low: "低", mid: "中", high: "高" };

function paletteWidget(owner) {
  if (!paletteWidgets.has(owner)) {
    const widget = { family: "all", saturation: "all", lightness: "all", layout: "strip", colors: [], selected: "" };
    paletteWidgets.set(owner, widget);
    generateWidgetPalette(widget);
  }
  return paletteWidgets.get(owner);
}

function generateWidgetPalette(widget) {
  const [, from, to] = paletteFamilies[widget.family];
  const hue = from + Math.random() * (to - from);
  const [sMin, sMax] = widget.family === "gray" ? [0, 0] :
    ({ low: [12, 38], mid: [40, 70], high: [70, 100] }[widget.saturation] ||
      ({ earth: [20, 50], pink: [40, 80] }[widget.family] || [24, 80]));
  const [lMin, lMax] = { low: [10, 35], mid: [40, 70], high: [70, 95] }[widget.lightness] || [10, 90];
  widget.colors = Array.from({ length: 6 }, (_, i) => {
    const h = (Math.min(to, Math.max(from, hue + (i - 2.5) * 5)) + 360) % 360;
    const s = (sMin + Math.random() * (sMax - sMin)) / 100;
    const l = (lMin + i * (lMax - lMin) / 5) / 100;
    const v = l + s * Math.min(l, 1 - l);
    return paletteHsvHex([h, v ? 200 * (1 - l / v) : 0, v * 100]);
  });
  widget.selected = widget.colors[0];
}

function widgetOptions(options, selected) {
  return Object.entries(options).map(([value, text]) =>
    `<option value="${value}" ${value === selected ? "selected" : ""}>${Array.isArray(text) ? text[0] : text}</option>`).join("");
}

function widgetResults(widget, draggable) {
  return widget.colors.map((hex, index) =>
    `<button type="button" data-palette-action="sample" draggable="${draggable}" data-color="${hex}" data-ink="${paletteCardInk(hex)}" style="--swatch-color:${hex};--palette-enter-delay:${index * 36}ms" aria-label="选择 ${hex}" aria-pressed="${hex === widget.selected}"><span>${String(index + 1).padStart(2, "0")}</span><span>${hex}</span></button>`).join("");
}

function widgetInspector(hex) {
  const rgb = hex.slice(1).match(/../g).map(part => parseInt(part, 16));
  const key = 1 - Math.max(...rgb) / 255;
  const cmyk = [...rgb.map(value => key === 1 ? 0 : (1 - value / 255 - key) / (1 - key)), key].map(value => Math.round(value * 100));
  return `<span>HEX <b>${hex}</b></span><span>RGB <b>${rgb.join(", ")}</b></span><span>CMYK <b>${cmyk.join(", ")}</b></span>`;
}

function updatePaletteWidget(root, widget) {
  root.dataset.layout = widget.layout;
  const results = root.querySelector(".palette-widget-results");
  results.dataset.layout = widget.layout;
  results.innerHTML = widgetResults(widget, root.dataset.paletteOwner === "editor");
  root.querySelector(".palette-widget-inspector").innerHTML = widgetInspector(widget.selected);
  for (const button of root.querySelectorAll('[data-palette-action="layout"]')) {
    button.setAttribute("aria-pressed", String(button.dataset.layout === widget.layout));
  }
}

function paletteMarkup(node) {
  const palette = paletteFor(node);
  const owner = node?.id || "editor";
  const widget = paletteWidget(owner);
  return `<div class="quick-palette palette-widget" data-palette-owner="${escapeHtml(owner)}" data-layout="${widget.layout}">
    <header class="palette-widget-header">
      <div><strong>智能灵感调色盘</strong><small>按条件生成与收藏颜色</small></div>
      <div class="palette-widget-layouts" role="group" aria-label="配色展示方式">${[
        ["stack", "纵条", "M3 3h10v4H3z M3 9h10v4H3z"],
        ["strip", "横条", "M3 3h4v10H3z M9 3h4v10H9z"],
        ["cards", "卡片", "M3 3h4v4H3z M9 3h4v4H9z M3 9h4v4H3z M9 9h4v4H9z"],
      ].map(([key, label, path]) => `<button type="button" data-palette-action="layout" data-layout="${key}" aria-label="${label}" title="${label}" aria-pressed="${key === widget.layout}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor"/></svg></button>`).join("")}</div>
    </header>
    <div class="quick-palette-heading"><input class="palette-name-input" data-palette-action="name" list="palette-names-${escapeHtml(owner)}" value="${escapeHtml(palette?.name || "")}" placeholder="选择或输入名称" aria-label="选择调色盘，输入名称可重命名或新建" autocomplete="off"><datalist id="palette-names-${escapeHtml(owner)}">${globalLibrary.palettes.map(item =>
      `<option value="${escapeHtml(item.name)}">`).join("")}</datalist>
      <button type="button" class="palette-widget-icon" data-palette-action="copy" aria-label="复制全套 HEX" title="复制全套 HEX"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1" fill="none" stroke="currentColor"/><path d="M3 10V4a1 1 0 0 1 1-1h6" fill="none" stroke="currentColor"/></svg></button>
      <button type="button" class="palette-widget-icon" data-palette-action="delete" aria-label="删除当前方案" title="删除当前方案" ${palette ? "" : "disabled"}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 8h5.6l.7-8M7 7v3m2-3v3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      ${node ? '<button data-palette-action="extract">提取颜色</button>' : ""}</div>
    <section class="palette-widget-saved"><div class="palette-widget-head"><strong>已选颜色 <span>${palette?.colors.length || 0}</span></strong><span class="palette-widget-custom"><button type="button" data-palette-action="custom">＋ 自定义</button><input type="color" data-palette-custom aria-label="自定义颜色" tabindex="-1"></span>${window.EyeDropper || node ? '<button type="button" data-palette-action="eyedropper">吸管</button>' : ""}<button type="button" data-palette-action="clear-colors" ${palette?.colors.length ? "" : "disabled"}>清空</button></div>
    <div class="quick-palette-colors">${(palette?.colors || []).map((color, index) => ({ color, index, hue: paletteHue(color.hex) })).sort((a, b) => a.hue - b.hue).map(({ color, index }) => `<div class="quick-palette-chip">
      <button type="button" data-palette-action="pick" data-color="${color.hex}" data-ink="${paletteCardInk(color.hex)}" style="--swatch-color:${color.hex}" draggable="${!node}" title="${color.hex}${color.share == null ? "" : ` / ${(color.share * 100).toFixed(1)}%`}" aria-label="使用 ${color.hex}" aria-pressed="${color.hex === widget.selected}"><span class="quick-palette-code">${color.hex}</span></button>
      <button type="button" data-palette-action="remove" data-index="${index}" aria-label="删除颜色 ${color.hex}">×</button></div>`).join("")}</div>
    ${palette?.colors.length ? "" : '<p>点击生成的色块收藏颜色</p>'}</section>
    <section class="palette-widget-filters"><label>色系<select data-palette-filter="family">${widgetOptions(paletteFamilies, widget.family)}</select></label>
      <div><label>饱和度<select data-palette-filter="saturation">${widgetOptions(paletteLevels, widget.saturation)}</select></label>
      <label>明度<select data-palette-filter="lightness">${widgetOptions(paletteLevels, widget.lightness)}</select></label></div>
      <button type="button" data-palette-action="generate">按条件生成配色条</button></section>
    <div class="palette-widget-results" data-layout="${widget.layout}">${widgetResults(widget, !node)}</div>
    <section class="palette-widget-details"><div class="palette-widget-head"><strong>颜色详情</strong></div><div class="palette-widget-inspector" aria-live="polite">${widgetInspector(widget.selected)}</div></section>
  </div>`;
}

function renderEditorPalette() {
  const panel = document.getElementById("editorPalette");
  if (!lightboxPainting) return;
  $("lightboxLeftTools").classList.remove("hidden");
  // 打开编辑时默认选中一个调色盘（上次用的失效则取第一个有颜色的，再退而取第一个），免手动选择
  if (!paletteFor(null) && globalLibrary.palettes.length) {
    const withColors = globalLibrary.palettes.find(item => item.colors.length);
    editorPaletteId = (withColors || globalLibrary.palettes[0]).id;
  }
  panel.querySelector(".quick-palette-body").innerHTML = paletteMarkup();
}

function refreshPalettes() {
  saveGlobalLibrary();
  renderNodes();
  renderEditorPalette();
}

function choosePalette(node, id, select) {
  if (node) {
    node.paletteId = id;
    pushHistory();
    if (select) {
      const widget = select.closest(".palette-widget");
      widget.outerHTML = paletteMarkup(node);
    } else {
      renderNodes();
    }
  } else {
    editorPaletteId = id;
    renderEditorPalette();
  }
}

function findPaletteByName(name) {
  const key = String(name || "").trim().toLowerCase();
  return key ? globalLibrary.palettes.find(item => item.name.trim().toLowerCase() === key) || null : null;
}

function paletteHsvHex([h, s, v]) {
  return "#" + [5, 3, 1].map(offset => {
    const k = (offset + h / 60) % 6;
    return Math.round(255 * v / 100 * (1 - s / 100 * Math.max(0, Math.min(k, 4 - k, 1))))
      .toString(16).padStart(2, "0");
  }).join("").toUpperCase();
}

function extractPaletteColors(pixels, mask, limit = 8) {
  const buckets = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3] || mask[i + 3] > 0) continue;
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) || [0, 0, 0, 0];
    bucket[0] += r; bucket[1] += g; bucket[2] += b; bucket[3]++;
    buckets.set(key, bucket);
  }
  const samples = [...buckets.values()].map(([r, g, b, n]) => ({ rgb: [r / n, g / n, b / n], n })).sort((a, b) => b.n - a.n);
  if (!samples.length) return [];
  const distance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const centers = [samples[0].rgb];
  while (centers.length < limit) {
    let best = null, score = 0;
    for (const sample of samples) {
      const weighted = Math.min(...centers.map(center => distance(sample.rgb, center))) * Math.sqrt(sample.n);
      if (weighted > score) { best = sample; score = weighted; }
    }
    if (!best) break;
    centers.push(best.rgb);
  }
  let groups;
  for (let iteration = 0; iteration < 10; iteration++) {
    groups = centers.map(() => [0, 0, 0, 0]);
    for (const { rgb, n } of samples) {
      let nearest = 0;
      for (let i = 1; i < centers.length; i++) if (distance(rgb, centers[i]) < distance(rgb, centers[nearest])) nearest = i;
      const group = groups[nearest];
      rgb.forEach((value, channel) => { group[channel] += value * n; });
      group[3] += n;
    }
    groups.forEach(([r, g, b, n], i) => { if (n) centers[i] = [r / n, g / n, b / n]; });
  }
  const total = groups.reduce((sum, group) => sum + group[3], 0);
  return groups.filter(group => group[3]).sort((a, b) => b[3] - a[3]).map(([r, g, b, n]) => ({
    hex: "#" + [r, g, b].map(value => Math.round(value / n).toString(16).padStart(2, "0")).join("").toUpperCase(),
    share: n / total,
  }));
}

// 调用抠图拓展（自动抠图 U²-Net 快速 / 本地 BiRefNet 通用）生成透明背景主体图，供参考图取色只提取产品颜色
async function runExtensionMatting(dataUrl, extensionId) {
  const route = `/api/extensions/${encodeURIComponent(extensionId)}/run`;
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      images: [{ name: "001.png", data: dataUrl.split(",")[1] }],
      params: { background: "透明" },
    }),
  };
  const response = desktop?.apiRequest
    ? await apiFetch(route, init)
    : await fetch(extensionSettings().serviceUrl.replace(/\/+$/, "") + route, init);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json();
  if (!result.ok || !result.images?.[0]?.data) throw new Error(result.error || "没有返回抠图结果");
  return `data:image/png;base64,${result.images[0].data}`;
}

async function openPaletteExtraction(node, onPick) {
  const collected = collectUpstreamForAI(node.id);
  const ref = collected.images[0] || collected.groupImages[0];
  if (!ref) { toast("请先连接一张参考图"); return; }
  const source = await materializeReferenceImage(ref);
  if (!source) throw new Error("参考图无法读取");
  const image = new Image();
  image.src = source;
  await image.decode();
  if (findNode(node.id) !== node || document.querySelector(".palette-mask-dialog")) return;
  // 抠图拓展可用性：已安装且未停用时提供「自动抠图去背景」（优先 U²-Net 快速，其次 BiRefNet 通用）
  let mattingId = "";
  await fetchToolExtensions();
  if (toolExtensionCache.online) {
    const cfg = extensionSettings();
    const ids = toolExtensionCache.list.filter(ext => ext?.id && !cfg.disabled.includes(ext.id)).map(ext => ext.id);
    mattingId = ids.includes("auto-matting-u2net") ? "auto-matting-u2net"
      : ids.includes("auto-matting-general") ? "auto-matting-general" : "";
  }
  const dialog = document.createElement("dialog");
  dialog.className = "palette-mask-dialog";
  dialog.setAttribute("aria-label", "参考图取色");
  dialog.innerHTML = `<h2>参考图取色</h2>
    ${mattingId ? '<div class="quick-palette-row"><label class="lightbox-check"><input type="checkbox" data-mask="matting" checked>自动抠图去背景</label><span class="palette-mask-matting-hint">只提取主体颜色，首次运行需加载模型</span></div>' : ""}
    <div class="quick-palette-row">
      <label>画笔 <select data-mask-tool aria-label="蒙版工具"><option value="exclude">排除背景</option><option value="restore">恢复取色</option></select></label>
      <label>大小 <input data-mask-size type="range" min="8" max="96" value="32" title="快捷键：[ 缩小，] 放大" aria-label="蒙版画笔大小；左方括号缩小，右方括号放大"></label>
      <button data-mask="clear">清空蒙版</button></div>
    <div class="palette-mask-surface"><canvas aria-label="参考图"></canvas><canvas aria-label="取色蒙版"></canvas></div>
    <p role="status">点击「提取颜色」取色，再点击色块划线排除不需要的颜色。</p><div class="palette-mask-result"></div>
    <div class="palette-mask-actions hidden"><button data-mask="add" hidden>加入当前方案</button><button data-mask="replace" hidden>替换当前方案</button><button data-mask="save" hidden>保存为新方案</button></div>
    <div class="quick-palette-row palette-dialog-heading"><input class="palette-name-input" data-mask="name" list="palette-mask-names" value="${escapeHtml(paletteFor(node)?.name || "")}" placeholder="选择或输入方案名称" aria-label="选择调色盘方案，输入名称可重命名或新建" autocomplete="off"><datalist id="palette-mask-names">${globalLibrary.palettes.map(item =>
      `<option value="${escapeHtml(item.name)}">`).join("")}</datalist>
    <button type="button" class="palette-widget-icon" data-mask="copy" aria-label="复制当前方案 HEX" title="复制当前方案 HEX" disabled><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1" fill="none" stroke="currentColor"/><path d="M3 10V4a1 1 0 0 1 1-1h6" fill="none" stroke="currentColor"/></svg></button>
    <button type="button" class="palette-widget-icon" data-mask="delete" aria-label="删除当前方案" title="删除当前方案" disabled><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 8h5.6l.7-8M7 7v3m2-3v3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button data-mask="sample">提取颜色</button><button data-mask="close">关闭</button></div>`;
  const [base, mask] = dialog.querySelectorAll("canvas");
  const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
  base.width = mask.width = Math.max(1, Math.round(image.naturalWidth * scale));
  base.height = mask.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const sourceContext = base.getContext("2d", { willReadFrequently: true });
  const maskContext = mask.getContext("2d", { willReadFrequently: true });
  sourceContext.drawImage(image, 0, 0, base.width, base.height);
  let pixels = sourceContext.getImageData(0, 0, base.width, base.height).data;
  if (onPick) {
    dialog.querySelector("h2").textContent = "参考图吸管";
    for (const row of dialog.querySelectorAll(".quick-palette-row")) row.remove();
    dialog.querySelector("[role=status]").textContent = "点击参考图上的颜色，按 Esc 退出。";
    mask.addEventListener("click", event => {
      const rect = mask.getBoundingClientRect();
      const x = Math.min(base.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * base.width / rect.width)));
      const y = Math.min(base.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * base.height / rect.height)));
      const offset = (y * base.width + x) * 4;
      if (!pixels[offset + 3]) return;
      const hex = "#" + [...pixels.slice(offset, offset + 3)].map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase();
      dialog.close();
      onPick(hex);
    });
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
    return;
  }
  let colors = [], excluded = new Set();
  const status = dialog.querySelector("[role=status]");
  const result = dialog.querySelector(".palette-mask-result");
  const sample = dialog.querySelector('[data-mask="sample"]');
  const save = dialog.querySelector('[data-mask="save"]');
  const replace = dialog.querySelector('[data-mask="replace"]');
  const nameInput = dialog.querySelector('[data-mask="name"]');
  const copyHex = dialog.querySelector('[data-mask="copy"]');
  const removePaletteBtn = dialog.querySelector('[data-mask="delete"]');
  const actionsRow = dialog.querySelector(".palette-mask-actions");
  const add = dialog.querySelector('[data-mask="add"]');
  const mattingToggle = dialog.querySelector('[data-mask="matting"]');
  const hint = mattingToggle
    ? "点击「提取颜色」取色；涂抹图片可排除区域，点击色块划线可排除颜色。"
    : "点击「提取颜色」取色，再点击色块划线排除不需要的颜色。";
  let cutoutImage = null, mattingBusy = false, mattingStarted = false, showingCutout = false, previous = null, pointer = null;
  // 名称框状态：精确匹配方案 = 选中（可加入/替换，复制/删除可用）；未匹配 = 新方案名（保存为新方案）
  let committedPalette = paletteFor(node) || null;
  function matchedPalette() {
    return findPaletteByName(nameInput.value);
  }
  function syncDialogDatalist() {
    dialog.querySelector("#palette-mask-names").innerHTML = globalLibrary.palettes.map(item => `<option value="${escapeHtml(item.name)}">`).join("");
  }
  function syncActionButtons(keptCount = colors.filter(color => !excluded.has(color.hex)).length) {
    const matched = matchedPalette();
    sample.disabled = mattingBusy;
    copyHex.disabled = mattingBusy || !matched;
    removePaletteBtn.disabled = mattingBusy || !matched;
    const showActions = keptCount > 0 && !mattingBusy;
    add.hidden = !showActions || !matched;
    replace.hidden = !showActions || !matched;
    save.hidden = !showActions || Boolean(matched);
    actionsRow.classList.toggle("hidden", !showActions);
  }
  function invalidate(text = hint) {
    colors = [];
    excluded.clear();
    maskContext.clearRect(0, 0, mask.width, mask.height);
    result.replaceChildren();
    syncActionButtons(0);
    status.textContent = text;
  }
  function renderMaskResult() {
    const kept = colors.filter(color => !excluded.has(color.hex));
    status.textContent = !colors.length ? "没有可取色像素，请换一张参考图。"
      : kept.length ? `提取到 ${colors.length} 个颜色，点击色块划线排除不需要的（保留 ${kept.length} 个）`
      : "全部颜色已划线排除，点击色块可恢复。";
    result.innerHTML = colors.map(color => {
      const off = excluded.has(color.hex);
      return `<button type="button" class="quick-palette-chip palette-mask-chip${off ? " is-excluded" : ""}" data-hex="${color.hex}" aria-pressed="${String(!off)}" title="${off ? "点击恢复该颜色" : "点击划线排除该颜色"}"><span style="--swatch-color:${color.hex}"></span>${color.hex} · ${(color.share * 100).toFixed(1)}%</button>`;
    }).join("");
    syncActionButtons(kept.length);
  }
  nameInput.addEventListener("input", () => syncActionButtons());
  nameInput.addEventListener("change", () => {
    const name = nameInput.value.trim();
    const matched = findPaletteByName(name);
    if (matched) {
      committedPalette = matched;
    } else if (name && committedPalette) {
      committedPalette.name = name; // 对已选方案改文字 = 输入即重命名
      refreshPalettes();
      syncDialogDatalist();
    } else {
      committedPalette = null;
    }
    nameInput.value = committedPalette ? committedPalette.name : name;
    syncActionButtons();
  });
  function redrawBase(img) {
    const imgScale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
    base.width = mask.width = Math.max(1, Math.round(img.naturalWidth * imgScale));
    base.height = mask.height = Math.max(1, Math.round(img.naturalHeight * imgScale));
    sourceContext.drawImage(img, 0, 0, base.width, base.height);
    pixels = sourceContext.getImageData(0, 0, base.width, base.height).data;
    showingCutout = Boolean(cutoutImage) && img === cutoutImage;
    invalidate();
  }
  // 涂抹排除蒙版（手动微调）：默认排除画笔涂抹处，可切换为恢复取色
  function paintMask(event) {
    const rect = mask.getBoundingClientRect();
    const point = [(event.clientX - rect.left) * mask.width / rect.width, (event.clientY - rect.top) * mask.height / rect.height];
    const from = previous || point;
    maskContext.globalCompositeOperation = dialog.querySelector("[data-mask-tool]").value === "restore" ? "destination-out" : "source-over";
    maskContext.lineCap = "round";
    maskContext.lineWidth = Number(dialog.querySelector("[data-mask-size]").value);
    maskContext.strokeStyle = maskContext.fillStyle = getComputedStyle(dialog).getPropertyValue("--danger").trim();
    maskContext.beginPath();
    if (previous) {
      maskContext.moveTo(...from); maskContext.lineTo(...point); maskContext.stroke();
    } else {
      maskContext.arc(...point, maskContext.lineWidth / 2, 0, 2 * Math.PI); maskContext.fill();
    }
    previous = point;
  }
  mask.addEventListener("pointerdown", event => {
    if (event.button !== 0 || pointer !== null) return;
    invalidate("蒙版已更新，可以重新提取颜色。");
    pointer = event.pointerId;
    mask.setPointerCapture(pointer);
    paintMask(event);
  });
  mask.addEventListener("pointermove", event => { if (event.pointerId === pointer) paintMask(event); });
  mask.addEventListener("lostpointercapture", () => { pointer = previous = null; });
  dialog.addEventListener("keydown", event => adjustRangeByBracketKey(event, dialog.querySelector("[data-mask-size]")));
  // 自动抠图：拓展可用时默认执行，把产品抠出来只提取主体颜色；不需要可取消勾选
  async function runMatting() {
    if (mattingStarted || !mattingId) return;
    mattingStarted = true;
    mattingBusy = true;
    status.textContent = "正在调用抠图拓展去除背景（首次运行需加载模型）…";
    syncActionButtons(colors.filter(color => !excluded.has(color.hex)).length);
    try {
      const cutout = new Image();
      cutout.src = await runExtensionMatting(source, mattingId);
      await cutout.decode();
      cutoutImage = cutout;
    } catch (error) {
      console.warn("[取色] 自动抠图失败", error);
      toast(`自动抠图失败：${error.message}，已改用原图提取`);
      mattingToggle.checked = false;
    } finally {
      mattingBusy = false;
      if (cutoutImage && mattingToggle.checked) redrawBase(cutoutImage);
      else {
        status.textContent = hint;
        syncActionButtons(colors.filter(color => !excluded.has(color.hex)).length);
      }
    }
  }
  mattingToggle?.addEventListener("change", () => {
    const wantCutout = mattingToggle.checked;
    if (wantCutout === showingCutout) return;
    if (wantCutout && !cutoutImage) { runMatting(); return; }
    redrawBase(wantCutout ? cutoutImage : image);
  });
  status.textContent = hint;
  if (mattingToggle?.checked) runMatting();
  dialog.addEventListener("click", event => {
    const chip = event.target.closest(".palette-mask-chip");
    if (chip) {
      const hex = chip.dataset.hex;
      if (excluded.has(hex)) excluded.delete(hex); else excluded.add(hex);
      renderMaskResult();
      return;
    }
    const action = event.target.closest("[data-mask]")?.dataset.mask;
    if (action === "close") dialog.close();
    if (action === "clear") invalidate();
    if (action === "sample") {
      colors = extractPaletteColors(pixels, maskContext.getImageData(0, 0, mask.width, mask.height).data);
      excluded.clear();
      renderMaskResult();
    }
    const kept = colors.filter(color => !excluded.has(color.hex));
    const target = matchedPalette();
    if (action === "copy" && target) {
      navigator.clipboard.writeText(target.colors.map(color => color.hex).join(", ")).then(() => toast("已复制方案 HEX"), () => toast("复制失败"));
      return;
    }
    if (action === "delete" && target && window.confirm(`删除全局调色盘「${target.name}」？`)) {
      globalLibrary.palettes = globalLibrary.palettes.filter(item => item !== target);
      if (paletteFor(node)?.id === target.id) choosePalette(node, "");
      committedPalette = null;
      nameInput.value = "";
      syncDialogDatalist();
      refreshPalettes();
      syncActionButtons(kept.length);
      return;
    }
    if (action === "add" && kept.length && target && findNode(node.id) === node) {
      const existing = new Set(target.colors.map(color => color.hex));
      const fresh = kept.filter(color => !existing.has(color.hex));
      if (!fresh.length) { toast("当前方案已包含这些颜色"); return; }
      target.colors.push(...fresh);
      editorPaletteId = target.id;
      choosePalette(node, target.id);
      refreshPalettes();
      dialog.close();
      return;
    }
    if (action === "save" && kept.length && !target && findNode(node.id) === node) {
      const name = nameInput.value.trim() || "参考图调色盘";
      const id = uid("palette");
      globalLibrary.palettes.push({ id, name, colors: kept });
      editorPaletteId = id;
      choosePalette(node, id);
      refreshPalettes();
      dialog.close();
      return;
    }
    if (action === "replace" && kept.length && target && findNode(node.id) === node) {
      target.colors = kept;
      editorPaletteId = target.id;
      choosePalette(node, target.id);
      refreshPalettes();
      dialog.close();
    }
  });
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  // 锁定打开时的宽度：提取结果只让面板变高，不变宽
  dialog.style.width = `${dialog.getBoundingClientRect().width}px`;
}

function saveWidgetColor(node, widget, hex) {
  let palette = paletteFor(node);
  if (palette?.colors.some(color => color.hex === hex)) return false;
  if (!palette) {
    palette = { id: uid("palette"), name: (widget.pendingName || "").trim() || "我的配色", colors: [] };
    widget.pendingName = "";
    globalLibrary.palettes.push(palette);
    choosePalette(node, palette.id);
  }
  widget.selected = hex;
  palette.colors.push({ hex, share: null });
  refreshPalettes();
  return true;
}

document.addEventListener("change", event => {
  const root = event.target.closest(".palette-widget");
  if (!root) return;
  const owner = root.dataset.paletteOwner;
  const node = owner === "editor" ? null : findNode(owner);
  const widget = paletteWidget(owner);
  if (event.target.matches("[data-palette-filter]")) {
    widget[event.target.dataset.paletteFilter] = event.target.value;
    return;
  }
  if (event.target.matches("[data-palette-custom]")) {
    saveWidgetColor(node, widget, event.target.value.toUpperCase());
    return;
  }
  if (!event.target.matches('[data-palette-action="name"]')) return;
  {
    // 名称框提交：精确匹配方案 = 选中；对当前方案改文字 = 重命名；全新名称 = 记住，收藏颜色时用作新方案名
    const name = event.target.value.trim();
    const matched = findPaletteByName(name);
    if (matched) {
      widget.pendingName = "";
      if (matched !== palette) choosePalette(node, matched.id, event.target);
    } else if (name && palette) {
      palette.name = name;
      widget.pendingName = "";
      refreshPalettes();
    } else if (name) {
      widget.pendingName = name;
    } else if (palette) {
      choosePalette(node, "", event.target);
    } else {
      widget.pendingName = "";
    }
  }
});

document.addEventListener("click", event => {
  const button = event.target.closest("button[data-palette-action]");
  if (!button) return;
  const root = button.closest(".quick-palette");
  const node = root.dataset.paletteOwner === "editor" ? null : findNode(root.dataset.paletteOwner);
  const palette = paletteFor(node);
  const widget = paletteWidget(root.dataset.paletteOwner);
  switch (button.dataset.paletteAction) {
    case "generate":
      generateWidgetPalette(widget);
      updatePaletteWidget(root, widget);
      return;
    case "layout":
      widget.layout = button.dataset.layout;
      updatePaletteWidget(root, widget);
      return;
    case "custom":
      {
        const picker = root.querySelector("[data-palette-custom]");
        picker.value = widget.selected;
        if (picker.showPicker) picker.showPicker();
        else picker.click();
      }
      return;
    case "eyedropper": {
      const picked = hex => {
        if (node && findNode(node.id) !== node) return;
        widget.selected = hex;
        if (!saveWidgetColor(node, widget, hex)) {
          root.querySelector(".palette-widget-inspector").innerHTML = widgetInspector(hex);
          for (const item of root.querySelectorAll("[data-color][aria-pressed]")) item.setAttribute("aria-pressed", String(item.dataset.color === hex));
        }
        if (!node && lightboxPainting) {
          els.lightboxPaintColor.value = hex;
          if (lightboxPaintMode !== "color-brush") setLightboxPaintMode("fill");
          scheduleLightboxFillReapply();
        }
        toast(`已取色 ${hex}`);
      };
      const fallback = () => {
        if (node) openPaletteExtraction(node, picked).catch(error => toast(`参考图取色失败：${error.message}`));
        else toast("屏幕吸管无法启动，请使用自定义选色");
      };
      if (!window.EyeDropper) { fallback(); return; }
      try {
        const pending = new window.EyeDropper().open();
        toast("点击屏幕上的颜色取色，按 Esc 取消");
        pending.then(({ sRGBHex }) => picked(sRGBHex.toUpperCase())).catch(error => {
          if (error.name !== "AbortError") fallback();
        });
      } catch {
        fallback();
      }
      return;
    }
    case "clear-colors":
      if (!palette || !window.confirm("清空当前方案的颜色？")) return;
      palette.colors = [];
      break;
    case "copy":
      navigator.clipboard.writeText(widget.colors.join(", ")).then(() => toast("已复制全套 HEX"), () => toast("复制失败"));
      return;
    case "sample":
    case "pick": {
      const hex = button.dataset.color;
      widget.selected = hex;
      if (!node && lightboxPainting) {
        els.lightboxPaintColor.value = hex;
        if (lightboxPaintMode !== "color-brush") setLightboxPaintMode("fill");
        scheduleLightboxFillReapply();
      }
      if (button.dataset.paletteAction !== "sample" || !saveWidgetColor(node, widget, hex)) {
        for (const item of root.querySelectorAll("[data-color][aria-pressed]")) item.setAttribute("aria-pressed", String(item.dataset.color === hex));
        root.querySelector(".palette-widget-inspector").innerHTML = widgetInspector(hex);
      }
      return;
    }
    case "delete":
      if (!palette || !window.confirm(`删除全局调色盘「${palette.name}」？`)) return;
      globalLibrary.palettes = globalLibrary.palettes.filter(item => item !== palette);
      choosePalette(node, "");
      break;
    case "remove":
      if (!palette) return;
      palette.colors.splice(Number(button.dataset.index), 1);
      break;
    case "extract":
      if (node) openPaletteExtraction(node).catch(error => toast(`取色失败：${error.message}`));
      return;
    default: return;
  }
  refreshPalettes();
});

document.getElementById("editorPaletteToggle").addEventListener("click", event => {
  const body = document.querySelector("#editorPalette .quick-palette-body");
  const hidden = body.classList.toggle("hidden");
  event.currentTarget.setAttribute("aria-expanded", String(!hidden));
  updateLightboxPaintDisplaySize();
  syncLightboxPaletteTop();
});
document.getElementById("editorPalette").addEventListener("dragstart", event => {
  const button = event.target.closest('button[draggable="true"][data-color]');
  if (button) event.dataTransfer.setData(paletteDragType, button.dataset.color);
});
els.lightboxPaintCanvas.addEventListener("dragover", event => {
  if (lightboxPainting && event.dataTransfer.types.includes(paletteDragType)) event.preventDefault();
});
els.lightboxPaintCanvas.addEventListener("drop", event => {
  const hex = event.dataTransfer.getData(paletteDragType);
  if (!lightboxPainting || !/^#[0-9A-F]{6}$/i.test(hex)) return;
  event.preventDefault();
  event.stopPropagation();
  const point = paintCanvasPoint(event);
  if (point.x < 0 || point.y < 0 || point.x >= els.lightboxPaintCanvas.width || point.y >= els.lightboxPaintCanvas.height) return;
  commitLightboxLastFill();
  els.lightboxPaintColor.value = hex;
  setLightboxPaintMode("fill");
  applyLightboxFillAt(point);
});
