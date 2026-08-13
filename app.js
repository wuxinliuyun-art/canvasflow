const $ = (id) => document.getElementById(id);

const NODE_WIDTH = 240;
const NODE_HEIGHT = 172;
const IMAGE_NODE_HEIGHT = 316;
const IMAGE_NODE_VERTICAL_STEP = IMAGE_NODE_HEIGHT + 40;
const AI_NODE_HEIGHT = 300;
const ANGLE_NODE_HEIGHT = 430;
const GROUP_NODE_HEIGHT = 244;
const SCREENSHOT_NODE_HEIGHT = 250;
const CONNECT_SNAP_RADIUS = 38;
const STORAGE_KEY = "webimage.pages.v2";
const { desktop, apiFetch } = window.CanvasFlowRuntime;
const featureModules = window.CanvasFlowModules || {};

function mindmapFeatureEnabled() {
  return featureModules.mindmap?.enabled === true;
}

let runtimeExportFolder = "export";
let imageUpscalePluginInstalled = false;
let backgroundRemovalPluginInstalled = false;
let autoBackupReady = false;
let autoBackupTimer = null;
let lastUpdateCheckResult = null;
let updateCheckStarted = false;
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
const LANGUAGE_KEY = "webimage.language";
const OUTPUT_FOLDER_KEY = "canvasflow.outputFolder.v1";
const GLOBAL_LIBRARY_KEY = "canvasflow.globalLibrary.v1";
const ONBOARDING_VERSION = 1;
const DEFAULT_TEXT_TEMPLATES = [
  { id: "default_text_line_art", name: "图片转线稿", content: "照片变成线稿，外轮廓稍微粗一点，白色背景，不要文字，不要颜色填充", revision: 1 },
  { id: "default_text_multi_view", name: "多视角参考", content: "生成参考图的正前侧、左侧、右侧、顶侧，四个视角的视图", revision: 1 },
];

// UI language is stored separately from project data so switching projects never
// changes the application language. New UI nodes are translated automatically.
const UI_EN = {
  "调整界面语言、画布与工作流体验": "Tune the interface, canvas, and workflow experience",
  "CanvasFlow — Visual AI Image Workflow": "CanvasFlow — Visual AI Image Workflow",
  "软件更新": "Software Updates", "检查更新": "Check for Updates",
  "启动时自动检查 GitHub Releases；发现新版后由用户手动下载替换。": "Automatically check GitHub Releases. Download and replace the app manually when a new version is available.",
  "当前版本：正在读取…": "Current version: loading…", "下载 Windows 新版本": "Download New Windows Version",
  "角度变化": "Angle Change", "添加角度变化节点": "Add Angle Change Node",
  "截图功能节点": "Screenshot Input Node", "添加截图功能节点": "Add Screenshot Input Node", "使用画布节点输入": "Use Canvas Node Input",
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
  "图片节点按上传图片比例自动调整": "Auto-fit image nodes to uploaded image ratio", "隐藏节点名称": "Hide node titles",
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
  "将选中节点设为多任务": "Create a multi-task node from selected nodes", "右键多任务节点": "Right-click a multi-task node",
  "取消多任务，还原内部节点和连线": "Dissolve multi-task and restore contained nodes and edges", "Shift + 点击": "Shift + Click",
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
  "取消连线": "Remove Connection", "已居中显示": "View centered", "已整理节点": "Nodes arranged", "没有需要添加的节点": "No nodes need to be added",
  "已生成局部修改图片节点": "Edited image node created", "请输入文字或选择图片": "Enter text or choose an image", "已创建节点": "Node created",
  "已从剪贴板创建图片节点": "Image node created from clipboard", "已从剪贴板创建文字节点": "Text node created from clipboard",
  "切换启用/停用": "Toggle Enabled/Disabled", "多任务": "Multi-task", "依次连接": "Connect in Sequence", "取消多任务": "Dissolve Multi-task", "添加输出节点": "Add Output Node",
  "请至少选择 2 个文字、图片或 AI 绘图节点": "Select at least 2 text, image, or AI image nodes", "所选节点已经依次连接": "The selected nodes are already connected in sequence",
  "打开本地文件夹": "Open Local Folder", "断开连接": "Disconnect", "复制": "Copy", "复制节点": "Copy Nodes", "删除节点": "Delete Nodes", "粘贴节点": "Paste Nodes",
  "批量停用": "Disable Selected", "批量启用": "Enable Selected", "批量删除": "Delete Selected", "添加文字节点": "Add Text Node",
  "添加图片节点": "Add Image Node", "添加AI绘图节点": "Add AI Image Node", "节点对齐": "Arrange Nodes",
  "已新建标签页": "New project created", "至少保留一个项目": "At least one project must remain", "已删除项目（Ctrl+Z 可撤回）": "Project deleted (Ctrl+Z to restore)",
  "上传图片文件": "Upload Image Files", "上传图片文件夹": "Upload Image Folder", "文件夹中没有图片文件": "No image files found in the folder",
  "文件夹上传": "Folder Upload", "确认导入图片": "Confirm Image Import", "画布只保存缩略图；执行 AI 时读取本地原图。项目使用期间请勿移动或删除原文件夹。": "Only thumbnails are stored on the canvas. AI tasks read the local originals, so keep the source folder in place while using the project.",
  "确认上传": "Upload", "所选文件夹": "Selected folder",
  "请先输入 API Key": "Enter an API Key first", "API Key 有效": "API Key is valid", "API Key 无效": "API Key is invalid",
  "验证失败，请检查网络": "Verification failed. Check your network connection", "积分：请先填入 API Key": "Credits: enter an API Key first",
  "积分：查询中...": "Credits: loading...", "积分：查询失败": "Credits: query failed", "积分：网络错误": "Credits: network error",
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
  ,"任务队列": "Task Queue", "AI 任务队列": "AI Task Queue", "暂无任务": "No tasks", "最多同时处理 5 个任务": "Up to 5 tasks run at once", "最多同时处理 5 个任务；仅未发送任务可暂停或调整。": "Up to 5 tasks run at once. Only unsent tasks can be paused or reordered.",
  "清除已完成": "Clear Finished", "还没有 AI 绘图任务": "No AI image tasks yet", "等待发送": "Queued", "已暂停": "Paused",
  "无参考图": "No reference image", "暂停等待任务": "Pause queued task", "继续任务": "Resume task", "向前移动": "Move up", "向后移动": "Move down", "删除等待任务": "Remove queued task",
  "打开生成图片所在文件夹": "Open Generated Image Folder", "复制生成图片路径": "Copy Generated Image Path",
  "帮助与引导": "Help & Tour", "重新查看项目、底部操作区、右上工具和 API Key 设置说明。": "Review the project area, bottom controls, top-right tools, and API Key setup.", "查看新手引导": "View Getting Started Tour",
  "截图工具": "Capture Tool", "截取固定屏幕区域，并使用默认提示词快速发送 AI 绘图任务。": "Capture a fixed screen region and send it to AI with a saved prompt.",
  "原生截图窗口": "Native Capture Window", "窗口可置顶、折叠和收起预览。关闭窗口只会隐藏，不会退出 CanvasFlow。": "Keep the window on top, collapse it, or hide previews. Closing it only hides the tool.",
  "打开截图窗口": "Open Capture Window", "截图任务会进入现有任务队列，结果保存到 export/ai_generated，不会自动添加到画布。": "Capture jobs use the existing task queue. Results are saved to export/ai_generated and are not added to the canvas automatically."
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
    [/^编组 (\d+)$/, "Group $1"], [/^(\d+) 个节点 · 双击进入$/, "$1 nodes · Double-click to enter"],
    [/^已创建编组，包含 (\d+) 个节点$/, "Created a group containing $1 nodes"], [/^已创建文件夹节点，包含 (\d+) 张图片$/, "Created an image folder containing $1 images"],
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
  settings: { gridSize: 20, snap: true, smoothEdges: true, autoFitImageNodes: true, hideNodeTitles: false, theme: "light", exportFolderLabel: "", apiKey: "", zipExport: true, exportInputs: false, customMaterials: [] },
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
  graphStack: [],
};
let onboardingSeenVersion = 0;

let globalLibrary = loadGlobalLibrary();
let pendingLibraryImport = null;
let editingTextTemplate = null;
let editingImageTemplate = null;
let librarySaveQueue = Promise.resolve();
let pendingFolderImport = null;
let desktopAssetMigrationTimer = null;
let desktopAssetMigrationPromise = null;
let desktopAssetMigrationQueued = false;
const AI_QUEUE_MAX_CONCURRENT = 5;
const aiTaskQueue = { items: [], running: 0, nextId: 1 };

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
    if (!globalLibrary.textTemplates.length && !globalLibrary.imageMaterials.length) {
      globalLibrary.textTemplates = DEFAULT_TEXT_TEMPLATES.map(item => normalizeTemplate({ ...item }));
      console.log(`[初始化] 已创建 ${globalLibrary.textTemplates.length} 个默认文字素材`);
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
  smoothEdges: $("smoothEdgesToggle"),
  autoFitImageNodes: $("autoFitImageNodesToggle"),
  hideNodeTitles: $("hideNodeTitlesToggle"),
  exportFolder: $("exportFolderInput"),
  chooseExportFolderBtn: $("chooseExportFolderBtn"),
  openExportFolderBtn: $("openExportFolderBtn"),
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
  folderImportDialog: $("folderImportDialog"),
  folderImportSummary: $("folderImportSummary"),
  folderImportCloseBtn: $("folderImportCloseBtn"),
  folderImportCancelBtn: $("folderImportCancelBtn"),
  folderImportConfirmBtn: $("folderImportConfirmBtn"),
  apiKeyInput: $("apiKeyInput"),
  aiGenerateBtn: $("aiGenerateBtn"),
  verifyKeyBtn: $("verifyKeyBtn"),
  saveKeyBtn: $("saveKeyBtn"),
  clearKeyBtn: $("clearKeyBtn"),
  balanceDisplay: $("balanceDisplay"),
  balanceRefreshBtn: $("balanceRefreshBtn"),
  runBtn: $("runBtn"),
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
  checkUpdateBtn: $("checkUpdateBtn"),
  updateStatus: $("updateStatus"),
  updateActions: $("updateActions"),
  releasePageLink: $("releasePageLink"),
  mindmapBreadcrumb: $("mindmapBreadcrumb"),
  mindmapBackBtn: $("mindmapBackBtn"),
  mindmapBreadcrumbText: $("mindmapBreadcrumbText"),
  projectModeDialog: $("projectModeDialog"),
  projectModeCloseBtn: $("projectModeCloseBtn"),
  projectModeCancelBtn: $("projectModeCancelBtn"),
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

function blankPage(name = "未命名", mode = "ai") {
  return {
    id: pageId(),
    name,
    mode: mode === "mindmap" ? "mindmap" : "ai",
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
  const settings = { ...state.settings, apiKey: "" };
  return JSON.parse(JSON.stringify({
    nodes: state.nodes,
    edges: state.edges,
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

function currentProjectMode() {
  return mindmapFeatureEnabled() && currentPage()?.mode === "mindmap" ? "mindmap" : "ai";
}

function isMindmapMode() {
  return currentProjectMode() === "mindmap";
}

function rootDataFromActiveGraph() {
  let data = cloneData();
  for (let index = state.graphStack.length - 1; index >= 0; index--) {
    const entry = state.graphStack[index];
    const parent = JSON.parse(JSON.stringify(entry.parentData));
    const group = (parent.nodes || []).find(node => node.id === entry.groupId);
    if (group) group.subgraph = data;
    data = parent;
  }
  return data;
}

function saveCurrentPage() {
  const page = currentPage();
  if (page) page.data = rootDataFromActiveGraph();
}

function restoreData(data) {
  const runtimeApiKey = desktop ? (state.settings?.apiKey || "") : "";
  state.nodes = data.nodes || [];
  state.edges = data.edges || [];
  state.settings = { gridSize: 20, snap: true, smoothEdges: true, autoFitImageNodes: true, hideNodeTitles: false, theme: "light", exportFolderLabel: "", apiKey: "", model: "gpt-image-2", resolution: "1k", quality: "medium", defaultRatio: "1:1", zipExport: true, exportInputs: false, customMaterials: [], ...(data.settings || {}) };
  const legacyAiSettings = { model: state.settings.model, resolution: state.settings.resolution, quality: state.settings.quality, size: state.settings.defaultRatio };
  delete state.settings.geminiAutomation;
  delete state.settings.model;
  delete state.settings.resolution;
  delete state.settings.quality;
  delete state.settings.defaultRatio;
  if (desktop) state.settings.apiKey = runtimeApiKey;
  migrateLegacyMaterials(data);
  state.customLibrary = emptyLibrary();
  walkNodes(state.nodes, node => { if (node.customRef) delete node.customRef; });
  walkNodes(state.nodes, node => normalizeAiNodeSettings(node, legacyAiSettings));
  walkNodes(state.nodes, node => {
    if (node.type !== "ai-image" && node.type !== "angle-image") return;
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
  state.graphStack = [];
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
  els.app.className = `app theme-${state.settings.theme} mode-${isMindmapMode() ? "mindmap" : "ai"}${state.settings.hideNodeTitles ? " hide-node-titles" : ""}`;
  document.documentElement.style.colorScheme = state.settings.theme;
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
}

// screenshot settings UI removed

function syncSettingsPanel() {
  els.gridSize.value = state.settings.gridSize;
  els.snap.checked = state.settings.snap;
  els.smoothEdges.checked = state.settings.smoothEdges === true;
  els.autoFitImageNodes.checked = state.settings.autoFitImageNodes !== false;
  els.hideNodeTitles.checked = state.settings.hideNodeTitles === true;
  state.settings.exportFolderLabel = resolvedExportFolderLabel(state.settings.exportFolderLabel);
  els.exportFolder.value = state.settings.exportFolderLabel;
  els.apiKeyInput.value = state.settings.apiKey || "";
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
  if (kind === "image" && item.fileName) try { await apiFetch("/api/custom-material", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: item.fileName }) }); } catch (e) { console.error("[自定义图片] 删除文件失败", e); }
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
    var resp = await apiFetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: originalName, data: stripDataUrl(base64) }) });
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
          await apiFetch("/api/custom-material", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: oldFileName }) });
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

const NODE_PLACEMENT_GAP = 24;

function nodeHeightForType(type) {
  return type === "ai-image" ? AI_NODE_HEIGHT
    : type === "angle-image" ? ANGLE_NODE_HEIGHT
      : type === "screenshot-input" ? SCREENSHOT_NODE_HEIGHT
      : type === "image" ? IMAGE_NODE_HEIGHT
        : type === "folder" ? GROUP_NODE_HEIGHT
          : type === "mind-group" ? NODE_HEIGHT
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

function addNode(type, x = 160, y = 120, commit = true, placementOptions = {}) {
  const width = NODE_WIDTH;
  const height = nodeHeightForType(type);
  const position = placementOptions.avoidOverlap === false
    ? { x: snap(x), y: snap(y) }
    : findFreeNodePosition(x, y, width, height, placementOptions);
  const node = {
    id: uid("n"),
    type,
    x: position.x,
    y: position.y,
    w: width,
    h: height,
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
    anglePitch: type === "angle-image" ? 0 : undefined,
    angleYaw: type === "angle-image" ? 0 : undefined,
    angleRoll: type === "angle-image" ? 0 : undefined,
    angleZoom: type === "angle-image" ? 1 : undefined,
    angleReverseDirection: type === "angle-image" ? false : undefined,
    _model: type === "angle-image" ? "gemini-3.1-flash-image-preview" : undefined,
    _resolution: type === "angle-image" ? "1k" : undefined,
    _size: type === "angle-image" ? "1:1" : undefined,
    _count: type === "screenshot-input" ? 1 : undefined,
    images: (type === "group" || type === "folder") ? [] : undefined,
    items: null,
    internalEdges: null,
    subgraph: type === "mind-group" ? { nodes: [], edges: [], settings: { ...state.settings }, customLibrary: emptyLibrary(), view: { x: 120, y: 90, scale: 1 }, nextNode: 1, nextEdge: 1 } : undefined,
    label: type === "mind-group" ? "编组" : "",
    seq: 0,
    screenshotSeq: type === "screenshot-input" ? nextScreenshotNodeSequence() : undefined,
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
    if (Array.isArray(node.subgraph?.nodes)) walkNodes(node.subgraph.nodes, fn);
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
      await externalizeImageField(node, "image", "imageAssetId", node.fileName);
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
      const resp = await apiFetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: originalName, data: raw }) });
      const result = await resp.json(); if (!result.success) throw new Error(result.error || "保存失败");
      const template = normalizeTemplate({ name: finalName, fileName: result.fileName, mime: node.mime || "image/png", revision: 1 });
      target.imageMaterials.push(template);
    } catch (e) { console.error("[自定义图片] 节点收藏失败", e); return toast("收藏失败：" + e.message); }
  }
  persistLibraries(); syncCustomMaterialsList(); toast("已保存到全局素材库");
}

function createMindmapGroup() {
  const nodeIds = new Set([...state.selected].filter(id => !!findNode(id)));
  if (nodeIds.size < 2) return toast("至少选中 2 个节点才能创建编组");
  const nodes = state.nodes.filter(node => nodeIds.has(node.id));
  const internalEdges = state.edges.filter(edge => nodeIds.has(edge.from.node) && nodeIds.has(edge.to.node));
  const externalInEdges = state.edges.filter(edge => nodeIds.has(edge.to.node) && !nodeIds.has(edge.from.node));
  const externalOutEdges = state.edges.filter(edge => nodeIds.has(edge.from.node) && !nodeIds.has(edge.to.node));
  const cx = nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length;
  const cy = nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length;
  const group = addNode("mind-group", cx - NODE_WIDTH / 2, cy - NODE_HEIGHT / 2, false, { avoidOverlap: false });
  group.label = `编组 ${nodes.length}`;
  group.subgraph = {
    nodes: JSON.parse(JSON.stringify(nodes)),
    edges: JSON.parse(JSON.stringify(internalEdges)),
    settings: { ...state.settings, apiKey: "" },
    customLibrary: emptyLibrary(),
    view: { x: 120, y: 90, scale: 1 },
    nextNode: state.nextNode,
    nextEdge: state.nextEdge,
  };
  state.nodes = state.nodes.filter(node => !nodeIds.has(node.id));
  state.edges = state.edges.filter(edge => !nodeIds.has(edge.from.node) && !nodeIds.has(edge.to.node));
  for (const edge of externalInEdges) {
    if (!state.edges.some(item => item.from.node === edge.from.node && item.to.node === group.id)) {
      state.edges.push({ id: uid("e"), from: { node: edge.from.node, port: "out" }, to: { node: group.id, port: "in" }, label: edge.label || "" });
    }
  }
  for (const edge of externalOutEdges) {
    if (!state.edges.some(item => item.from.node === group.id && item.to.node === edge.to.node)) {
      state.edges.push({ id: uid("e"), from: { node: group.id, port: "out" }, to: { node: edge.to.node, port: "in" }, label: edge.label || "" });
    }
  }
  state.selected = new Set([group.id]);
  pushHistory();
  render();
  toast(`已创建编组，包含 ${nodes.length} 个节点`);
}

function enterMindmapGroup(groupId) {
  if (!isMindmapMode()) return;
  const group = findNode(groupId);
  if (!group || group.type !== "mind-group") return;
  const parentData = cloneData();
  state.graphStack.push({ groupId, label: group.label || "编组", parentData });
  restoreData(group.subgraph || { nodes: [], edges: [], settings: parentData.settings, view: { x: 120, y: 90, scale: 1 }, nextNode: state.nextNode, nextEdge: state.nextEdge });
  state.history = [cloneData()];
  state.future = [];
  centerViewOnContent();
  updateUndoRedo();
  console.info("[思维导图] 已进入编组子画布", { groupId, depth: state.graphStack.length });
}

function exitMindmapGroup() {
  const entry = state.graphStack.pop();
  if (!entry) return;
  const childData = cloneData();
  const parentData = JSON.parse(JSON.stringify(entry.parentData));
  const group = (parentData.nodes || []).find(node => node.id === entry.groupId);
  if (group) group.subgraph = childData;
  restoreData(parentData);
  state.history = [cloneData()];
  state.future = [];
  updateUndoRedo();
  markDirty();
  console.info("[思维导图] 已返回上一级画布", { groupId: entry.groupId, depth: state.graphStack.length });
}

function ungroupMindmapNode(groupId) {
  const group = findNode(groupId);
  if (!group || group.type !== "mind-group" || !group.subgraph) return toast("该节点不是编组");
  const incoming = state.edges.filter(edge => edge.to.node === groupId);
  const outgoing = state.edges.filter(edge => edge.from.node === groupId);
  const restoredNodes = JSON.parse(JSON.stringify(group.subgraph.nodes || []));
  const restoredEdges = JSON.parse(JSON.stringify(group.subgraph.edges || []));
  state.nodes = state.nodes.filter(node => node.id !== groupId);
  state.edges = state.edges.filter(edge => edge.from.node !== groupId && edge.to.node !== groupId);
  state.nodes.push(...restoredNodes);
  state.edges.push(...restoredEdges);
  if (restoredNodes.length) {
    const first = restoredNodes[0];
    const last = restoredNodes[restoredNodes.length - 1];
    for (const edge of incoming) state.edges.push({ id: uid("e"), from: { ...edge.from }, to: { node: first.id, port: "in" }, label: edge.label || "" });
    for (const edge of outgoing) state.edges.push({ id: uid("e"), from: { node: last.id, port: "out" }, to: { ...edge.to }, label: edge.label || "" });
  }
  state.selected = new Set(restoredNodes.map(node => node.id));
  pushHistory();
  render();
  toast("已解散编组");
}

function renameMindmapGroup(groupId) {
  const group = findNode(groupId);
  if (!group || group.type !== "mind-group") return;
  const value = prompt("编组名称", group.label || "编组");
  if (value === null || !value.trim()) return;
  group.label = value.trim().slice(0, 60);
  pushHistory();
  render();
}

function groupSelection() {
  if (isMindmapMode()) return createMindmapGroup();
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
  if (copy.type === "ai-image" || copy.type === "angle-image") {
    copy.generatedImage = null;
    delete copy.generatedAssetId;
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
  const maxX = Math.max(...data.nodes.map(n => n.x + (Number(n.w) || NODE_WIDTH)));
  const maxY = Math.max(...data.nodes.map(n => n.y + (Number(n.h) || nodeHeightForType(n.type))));
  const desiredMinX = anchor ? anchor.x : minX + 36;
  const desiredMinY = anchor ? anchor.y : minY + 36;
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
    if (nn.type === "screenshot-input") nn.screenshotSeq = nextScreenshotNodeSequence() + pasted.filter(item => item.type === "screenshot-input").length;
    walkNodes([nn], pastedNode => { if (pastedNode.customRef) delete pastedNode.customRef; });
    map.set(n.id, nn.id);
    pasted.push(nn);
  });
  state.nodes.push(...pasted);
  (data.edges || []).forEach(e => {
    if (map.has(e.from.node) && map.has(e.to.node)) {
      state.edges.push({ id: uid("e"), from: { node: map.get(e.from.node), port: "out" }, to: { node: map.get(e.to.node), port: "in" }, label: e.label || "" });
    }
  });
  state.selected = new Set(pasted.map(n => n.id));
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
  if (target.type === "angle-image") {
    console.log("[角度变化] 输入连线已更新", { nodeId: toNode, sourceNodeId: fromNode, replaced: replacedAngleInputs });
  }
  pushHistory();
  render();
  if (replacedAngleInputs) toast("已断开旧参考图并接入新图片");
}

function removeEdge(id) {
  state.edges = state.edges.filter(e => e.id !== id);
  pushHistory();
  render();
}

function renameEdge(id) {
  const edge = state.edges.find(item => item.id === id);
  if (!edge) return;
  const value = prompt("连线名称（留空表示不显示）", edge.label || "");
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

function normalizeAiNodeSettings(node, fallback = {}) {
  if (!node || (node.type !== "ai-image" && node.type !== "screenshot-input")) return node;
  node._model = node._model || fallback.model || "gpt-image-2";
  node._resolution = node._resolution || fallback.resolution || "1k";
  node._size = node._size || fallback.size || "1:1";
  node._quality = node._model === "gpt-image-2" ? (node._quality || fallback.quality || (node.type === "screenshot-input" ? "low" : "medium")) : null;
  if (node.type === "screenshot-input") node._count = Math.max(1, Math.min(4, Number(node._count) || 1));
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
  const percentText = hasPercent ? `${Math.round(progress.percent)}%` : "";
  const title = progress.error || progress.label;
  return `<div class="ai-node-progress ai-progress-${progress.status}" title="${escapeHtml(title)}">
    <div class="ai-node-progress-row"><span>${escapeHtml(progress.label)}</span><b>${percentText}</b></div>
    <div class="ai-node-progress-track"><span class="${hasPercent ? "" : "indeterminate"}" style="${hasPercent ? `width:${progress.percent}%` : ""}"></span></div>
  </div>`;
}

function imageAspectStyle(node) {
  const ratio = Number(node?._previewAspect);
  return Number.isFinite(ratio) && ratio > 0 ? ` style="aspect-ratio:${ratio}"` : "";
}

function aiImageBody(node) {
  const controls = aiNodeControls(node);
  if (node.generating) {
    return `<div class="ai-preview is-empty"><div class="ai-generating"><div class="ai-spinner"></div>生成中...</div></div>
      <div class="node-hover-controls">${controls}</div>`;
  }
  if (node.generatedImage) {
    return `<div class="image-preview" title="双击放大预览"${imageAspectStyle(node)}><img src="${node.generatedImage}" alt="" draggable="false"></div>
      <div class="node-hover-controls">
        <div class="ai-actions">
          <button data-role="ai-generate" class="ai-generate-btn">重新生成</button>
          <button data-role="clear-image">清除</button>
        </div>${controls}
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
  if (!state.settings.apiKey) return toast("请先在设置中填入 API Key");
  const source = angleNodeInput(node.id);
  if (!source) return toast("请先连接一个图片节点");
  normalizeAngleNodeSettings(node);
  node.generating = true;
  node.prompt = resolvedAnglePrompt(node);
  node._aiProgress = { status: "submitting", label: "正在提交", percent: null, error: "" };
  render();
  console.log("[角度变化] 提交生成", { nodeId, pitch: node.anglePitch, yaw: node.angleYaw, roll: node.angleRoll, zoom: node.angleZoom, resolution: node._resolution, size: node._size });
  try {
    const taskId = await submitGeneration(node.prompt, [source], node);
    node.taskId = taskId;
    node._aiProgress = { status: "generating", label: "正在生成", percent: null, error: "" };
    renderNodes();
    const imageUrl = await pollTask(taskId, pct => {
      node._aiProgress = { status: "generating", label: "正在生成", percent: pct, error: "" };
      renderNodes();
    });
    node._aiProgress = { status: "downloading", label: "正在下载", percent: 96, error: "" };
    renderNodes();
    const generatedImage = await fetchImageAsBase64(imageUrl);
    const outputTask = {
      id: `angle-${Date.now()}`,
      projectName: currentPage()?.name || "项目",
      exportFolder: state.settings.exportFolderLabel || "export",
      referenceName: "角度变化",
    };
    let savedOutput = null;
    try {
      savedOutput = await saveGeneratedOutput(generatedImage, outputTask, node);
    } catch (saveError) {
      console.warn("[角度变化] 图片已生成，但保存到输出文件夹失败", saveError);
      toast(`图片已生成，但保存失败：${saveError.message || saveError}`);
    }
    const fileName = savedOutput?.fileName || `angle_generated_${Date.now()}.png`;
    const existingResults = state.nodes.filter(item => item.type === "image" && item.aiSourceNodeId === node.id);
    const resultNode = addNode("image", node.x + NODE_WIDTH + 40, node.y + existingResults.length * IMAGE_NODE_VERTICAL_STEP, false);
    resultNode.image = generatedImage;
    resultNode.fileName = fileName;
    resultNode.mime = "image/png";
    resultNode.outputPath = savedOutput?.outputPath || "";
    resultNode.aiSourceNodeId = node.id;
    resultNode.angleSourceNodeId = node.id;
    await externalizeImageField(resultNode, "image", "imageAssetId", fileName);
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
    if (n.type === "ai-image" || n.type === "angle-image") {
      if (n.generatedImage) {
        const ref = { image: n.generatedImage, assetId: n.generatedAssetId || "", fileName: n.fileName, mime: n.mime, _x: n.x };
        result.images.push(ref);
        result.orderedRefs.push(ref);
      }
      return;
    }
    if (n.disabled) return;
    if (n.type === "text" && n.text && n.text.trim()) result.texts.push(n.text.trim());
    if (n.type === "image" && n.image) {
      const ref = { image: n.image, assetId: n.imageAssetId || "", fileName: n.fileName, mime: n.mime, _x: n.x };
      result.images.push(ref);
      result.orderedRefs.push(ref);
    }
    if (n.type === "group") {
      // Ctrl+G 多任务节点 (items)
      if (n.items) {
        for (const item of n.items) {
          if (item.type === "text" && item.text && item.text.trim()) result.texts.push(item.text.trim());
          if (item.type === "image" && item.image) {
            const ref = { image: item.image, assetId: item.imageAssetId || "", fileName: item.fileName, mime: item.mime, _x: n.x };
            result.groupImages.push(ref);
            result.orderedRefs.push(ref);
          }
          if (item.type === "ai-image" && item.generatedImage) {
            const ref = { image: item.generatedImage, assetId: item.generatedAssetId || "", fileName: item.fileName, mime: item.mime, _x: n.x };
            result.groupImages.push(ref);
            result.orderedRefs.push(ref);
          }
        }
      }
      // 文件夹多任务 (images)
      if (n.images && n.images.length) {
        for (const gImg of n.images) {
          const ref = {
            image: gImg.image,
            assetId: gImg.assetId || "",
            fileName: gImg.fileName,
            mime: gImg.mime,
            _x: n.x,
          };
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

function directScreenshotNodeInputs(nodeId) {
  const incoming = buildIncomingIndex();
  const visited = new Set([nodeId]);
  const textEntries = [], imageEntries = [], batchEntries = [];
  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = findNode(id);
    if (!node || node.disabled) return;
    const order = { x: Number(node.x) || 0, created: Number(node.created) || 0 };
    if (node.type === "text" && String(node.text || "").trim()) {
      textEntries.push({ text: node.text.trim(), ...order });
    } else if (node.type === "image" && (node.image || node.imageAssetId)) {
      imageEntries.push({ image: node.image || "", assetId: node.imageAssetId || "", fileName: node.fileName || "参考图.png", mime: node.mime || "image/png", ...order });
    } else if (node.type === "group" || node.type === "folder") {
      const groupImages = node.images || (node.items || []).filter(item => item.type === "image").map(item => ({ image: item.image, assetId: item.imageAssetId, fileName: item.fileName, mime: item.mime }));
      groupImages.forEach((image, index) => {
        if (image?.image || image?.assetId) batchEntries.push({ image: image.image || "", assetId: image.assetId || "", fileName: image.fileName || "批量图片.png", mime: image.mime || "image/png", ...order, index });
      });
    }
    // 功能节点是语义边界：使用其自身结果，不继续把更早的工作流输入带入截图任务。
    if (node.type === "ai-image" || node.type === "angle-image" || node.type === "screenshot-input") return;
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

let screenshotCatalogSignature = "";
function publishScreenshotNodeCatalog(force = false) {
  if (!window.chrome?.webview) return;
  const nodes = state.nodes.filter(node => node.type === "screenshot-input").sort((a, b) => (a.screenshotSeq || 0) - (b.screenshotSeq || 0)).map(node => ({ id: node.id, name: `截图功能节点 #${node.screenshotSeq}`, summary: screenshotNodeSummary(node) }));
  const signature = JSON.stringify(nodes);
  if (!force && signature === screenshotCatalogSignature) return;
  screenshotCatalogSignature = signature;
  window.chrome.webview.postMessage({ type: "screenshot:node-catalog", nodes });
}

async function materializeReferenceImage(reference) {
  if (typeof reference === "string") return reference;
  if (desktop && reference?.assetId) {
    const result = await desktop.readAsset(reference.assetId);
    return result.dataUrl || "";
  }
  return reference?.image || "";
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
  if (imageUrls.length) payload.image_urls = await Promise.all(imageUrls.map(materializeReferenceImage));

  // Node is still a temporary local backend during the first .NET migration stage.
  // Keep the key out of URLs and persisted project data; the backend receives it only in this request body.
  if (!desktop) payload._apiKey = state.settings.apiKey;

  const resp = await apiFetch("/api/generate", {
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
      const resp = await apiFetch(`/api/task/${encodeURIComponent(taskId)}`, {
        headers: { "X-CanvasFlow-Api-Key": state.settings.apiKey || "" },
      });
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
  const resp = await apiFetch("/api/download-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl: url }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data.base64;
}

function queueTaskStatusText(task) {
  if (task.kind === "background-removal" || task.kind === "image-upscale") {
    if (task.status === "generating") return task.kind === "background-removal" ? "正在抠图" : "正在放大";
    if (task.status === "submitting") return "正在读取图片";
    if (task.status === "downloading") return "正在保存结果";
  }
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
  return ["submitting", "generating", "downloading"].includes(task.status);
}

function queueTaskIsSettled(task) {
  return ["done", "failed", "cancelled"].includes(task.status);
}

function taskQueueForNode(nodeId) {
  return aiTaskQueue.items.filter(task => task.nodeId === nodeId);
}

function hasUnsettledAiQueueTasks() {
  return aiTaskQueue.items.some(task => !queueTaskIsSettled(task));
}

function refreshQueuedNodeProgress(nodeId) {
  if (!nodeId) return;
  const node = findNode(nodeId);
  if (!node) return;
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
    const canManage = task.status === "waiting" || task.status === "paused";
    const pauseButton = task.status === "waiting" ? `<button data-queue-action="pause" title="${translateUiString("暂停等待任务")}">Ⅱ</button>` : task.status === "paused" ? `<button data-queue-action="resume" title="${translateUiString("继续任务")}">▶</button>` : "";
    const orderButtons = canManage ? `<button data-queue-action="up" title="${translateUiString("向前移动")}">↑</button><button data-queue-action="down" title="${translateUiString("向后移动")}">↓</button><button data-queue-action="remove" title="${translateUiString("删除等待任务")}">×</button>` : "";
    const progress = task.status === "done" ? 100 : Number(task.progress) || 0;
    const runningClass = queueTaskIsRunning(task) ? " is-running" : "";
    const title = task.error || task.warning || task.prompt || "";
    return `<div class="task-queue-item${runningClass}" data-task-id="${task.id}" title="${escapeHtml(title)}">
      <div class="task-queue-thumb">${thumbnail}</div>
      <div class="task-queue-copy">
        <div class="task-queue-title"><span>${escapeHtml(task.label)}</span><span class="task-queue-status">${queueTaskStatusText(task)}</span></div>
        <div class="task-queue-prompt">${escapeHtml(task.prompt || translateUiString("(无文字输入)"))}</div>
        <div class="task-queue-meta">${escapeHtml(task.model)} · ${escapeHtml(task.resolution)} · ${escapeHtml(task.size)}</div>
        <div class="task-queue-mini-progress"><span style="width:${Math.max(0, Math.min(100, progress))}%"></span></div>
      </div>
      <div class="task-queue-actions">${pauseButton}${orderButtons}</div>
    </div>`;
  }).join("") : `<div class="task-queue-empty">${translateUiString("还没有 AI 绘图任务")}</div>`;
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
  return { type: "ai-image", _model: node._model, _resolution: node._resolution, _quality: node._quality, _size: node._size };
}

function generatedResultFileName(task, node, dataUrl) {
  const mime = (String(dataUrl).match(/^data:([^;,]+)/) || [])[1] || "image/png";
  const extension = extensionFor("", mime);
  const project = safeName(task.projectName || "项目").slice(0, 36) || "项目";
  const nodeLabel = task.source === "screenshot" ? "截图工具" : (node?.seq ? `AI${node.seq}` : (node?.id || "AI"));
  const reference = safeName((task.referenceName || "生成结果").replace(/\.[^.]+$/, "")).slice(0, 36) || "生成结果";
  return `${project}_${nodeLabel}_${reference}_${timestamp()}_${task.id}.${extension}`;
}

async function saveGeneratedOutput(dataUrl, task, node) {
  const fileName = generatedResultFileName(task, node, dataUrl);
  const response = await apiFetch("/api/save-export-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderName: "ai_generated", baseFolder: task.exportFolder || "export", files: [{ name: fileName, data: dataUrl }] }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || `HTTP ${response.status}`);
  return { fileName, outputPath: result.files?.[0] || "", outputFolder: result.path || "" };
}

async function applyQueuedResult(task, node, dataUrl) {
  let saved = null;
  try {
    saved = await saveGeneratedOutput(dataUrl, task, node);
    task.outputPath = saved.outputPath;
  } catch (error) {
    task.warning = `图片已生成，但保存到输出文件夹失败：${error.message}`;
    console.error("[生成结果] 输出文件保存失败", { taskId: task.id, nodeId: node.id, message: error.message });
  }
  const fileName = saved?.fileName || generatedResultFileName(task, node, dataUrl);
  if (task.resultMode === "node-preview") {
    node.generatedImage = dataUrl;
    delete node.generatedAssetId;
    node.fileName = fileName;
    node.mime = (String(dataUrl).match(/^data:([^;,]+)/) || [])[1] || "image/png";
    node.outputPath = saved?.outputPath || "";
    await externalizeImageField(node, "generatedImage", "generatedAssetId", fileName);
  } else {
    const resultNode = addNode("image", node.x + NODE_WIDTH + 40, node.y + task.resultOrder * IMAGE_NODE_VERTICAL_STEP, false);
    resultNode.image = dataUrl;
    resultNode.fileName = fileName;
    resultNode.mime = (String(dataUrl).match(/^data:([^;,]+)/) || [])[1] || "image/png";
    resultNode.aiSourceNodeId = node.id;
    resultNode.aiBatchIndex = task.groupIndex >= 0 ? task.groupIndex : null;
    resultNode.outputPath = saved?.outputPath || "";
    await externalizeImageField(resultNode, "image", "imageAssetId", fileName);
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
  const node = findNode(task.nodeId);
  if (!node && task.source !== "screenshot") throw new Error("对应的 AI 绘图节点已被删除");
  task.status = "submitting";
  task.progress = 0;
  refreshQueuedNodeProgress(task.nodeId);
  renderTaskQueue();
  notifyScreenshotTask(task);
  const taskImages = task.groupImage ? [...task.regularImages, task.groupImage] : task.regularImages;
  task.taskId = await submitGeneration(task.prompt, taskImages, task.generationSettings);
  task.status = "generating";
  refreshQueuedNodeProgress(task.nodeId);
  renderTaskQueue();
  notifyScreenshotTask(task);
  const imageUrl = await pollTask(task.taskId, progress => {
    task.progress = progress;
    refreshQueuedNodeProgress(task.nodeId);
    renderTaskQueue();
    notifyScreenshotTask(task);
  });
  task.status = "downloading";
  task.progress = 96;
  refreshQueuedNodeProgress(task.nodeId);
  renderTaskQueue();
  notifyScreenshotTask(task);
  const dataUrl = await fetchImageAsBase64(imageUrl);
  if (task.source === "screenshot") await applyScreenshotQueuedResult(task, dataUrl);
  else await applyQueuedResult(task, node, dataUrl);
  task.status = "done";
  task.progress = 100;
  notifyScreenshotTask(task);
}

function enqueueExtensionTasks(nodes, kind) {
  const valid = (nodes || []).filter(node => node && (node.type === "image" || node.generatedImage || node.image));
  if (!valid.length) return toast("请选择至少一个图片节点");
  valid.forEach((source, index) => {
    const preview = source.type === "image" ? source.image : source.generatedImage;
    aiTaskQueue.items.push({
      id: `q${aiTaskQueue.nextId++}`,
      kind,
      nodeId: source.id,
      status: "waiting",
      progress: 0,
      label: kind === "background-removal" ? "智能抠图" : "图片放大 ×4",
      prompt: source.fileName || `图片 ${index + 1}`,
      model: kind === "background-removal" ? "BiRefNet · DirectML/CPU" : "Real-ESRGAN · Vulkan",
      resolution: "本地处理",
      size: "",
      thumbnail: preview || "",
      sourceFileName: source.fileName || "image.png",
      exportFolder: state.settings.exportFolderLabel || runtimeExportFolder,
      resultOrder: index,
    });
  });
  renderTaskQueue();
  setTaskQueueOpen(true);
  toast(`已加入任务队列：${valid.length} 个任务`);
  pumpAiTaskQueue();
}

async function runQueuedExtensionTask(task) {
  const source = findNode(task.nodeId);
  if (!source) throw new Error("来源图片节点已被删除");
  const reference = source.type === "image"
    ? { image: source.image, assetId: source.imageAssetId }
    : { image: source.generatedImage, assetId: source.generatedAssetId };
  task.status = "submitting";
  task.progress = 8;
  renderTaskQueue();
  const dataUrl = await materializeReferenceImage(reference);
  if (!dataUrl) throw new Error("无法读取原始图片");
  task.status = "generating";
  task.progress = 18;
  renderTaskQueue();
  const progressTimer = window.setInterval(() => {
    if (!queueTaskIsRunning(task)) return;
    task.progress = Math.min(90, (Number(task.progress) || 18) + 2);
    renderTaskQueue();
  }, 700);
  try {
    const payload = { dataUrl, fileName: task.sourceFileName, outputRoot: task.exportFolder };
    const result = task.kind === "background-removal"
      ? await desktop.removeImageBackground(payload)
      : await desktop.upscaleImage({ ...payload, model: "realesrgan-x4plus", scale: 4 });
    task.status = "downloading";
    task.progress = 96;
    renderTaskQueue();
    const currentSource = findNode(task.nodeId);
    if (!currentSource) throw new Error("处理完成，但来源图片节点已被删除");
    const resultNode = addNode("image", currentSource.x + NODE_WIDTH + 40, currentSource.y + (task.resultOrder || 0) * IMAGE_NODE_VERTICAL_STEP, false);
    resultNode.image = result.dataUrl;
    resultNode.fileName = result.fileName || (task.kind === "background-removal" ? "transparent.png" : "upscaled.png");
    resultNode.mime = "image/png";
    resultNode.outputPath = result.outputPath || "";
    if (task.kind === "background-removal") resultNode.backgroundRemovalSourceNodeId = currentSource.id;
    else resultNode.upscaleSourceNodeId = currentSource.id;
    await externalizeImageField(resultNode, "image", "imageAssetId", resultNode.fileName);
    state.edges.push({ id: uid("e"), from: { node: currentSource.id, port: "out" }, to: { node: resultNode.id, port: "in" } });
    pushHistory();
    render();
    task.status = "done";
    task.progress = 100;
    task.outputPath = result.outputPath || "";
  } finally {
    window.clearInterval(progressTimer);
  }
}

function runQueuedTask(task) {
  return task.kind === "background-removal" || task.kind === "image-upscale"
    ? runQueuedExtensionTask(task)
    : runQueuedAiTask(task);
}

function pumpAiTaskQueue() {
  while (aiTaskQueue.running < AI_QUEUE_MAX_CONCURRENT) {
    const task = aiTaskQueue.items.find(item => item.status === "waiting");
    if (!task) break;
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
  if (!state.settings.apiKey) {
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
  const prompt = upstream.texts.join("，");
  const groupImages = upstream.groupImages || [];
  const taskSources = groupImages.length ? groupImages : [null];
  const page = currentPage();
  const existingResultCount = state.nodes.filter(item => item.type === "image" && item.aiSourceNodeId === node.id).length;
  return taskSources.map((groupImage, index) => ({
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
    groupIndex: groupImage ? index : -1,
    referenceName: groupImage?.fileName || upstream.images[0]?.fileName || "生成结果",
    thumbnail: groupImage?.image || upstream.images[0]?.image || "",
    generationSettings: { ...generationSettings },
    model: generationSettings._model,
    resolution: generationSettings._resolution,
    size: generationSettings._size,
    resultMode: groupImages.length ? "image-node" : resultMode,
    resultOrder: existingResultCount + index,
    status: "waiting",
    progress: 0,
    created: Date.now() + index,
  }));
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
    if (!upstream.texts.length && !upstream.images.length && !upstream.groupImages.length) continue;
    const runId = `run-${Date.now()}-${aiTaskQueue.nextId}`;
    node._queueRunId = runId;
    const tasks = buildAiQueueTasks(node, upstream, resultMode, runId);
    if (resultMode === "node-preview" && !upstream.groupImages.length) {
      node.generatedImage = null;
      delete node.generatedAssetId;
      node.outputPath = "";
    }
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
  if (!state.settings.apiKey) {
    toast("请先在设置中填入 API Key");
    return;
  }
  enqueueAiNode(nodeId, "node-preview");
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
    node.generatedImage = base64;
    delete node.generatedAssetId;
    node.generating = false;
    node.fileName = `ai_generated_${Date.now()}.png`;
    node.mime = "image/png";
    await externalizeImageField(node, "generatedImage", "generatedAssetId", node.fileName);
    apiFetch("/api/save-export-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderName: "ai_generated", baseFolder: state.settings.exportFolderLabel || runtimeExportFolder || "export", files: [{ name: node.fileName, data: base64 }] }),
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
        t.result = await fetchImageAsBase64(imageUrl);
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

function addAngleImageNode(x, y, sourceIds = []) {
  const node = addNode("angle-image", x, y, false);
  normalizeAngleNodeSettings(node);
  sourceIds.slice(0, 1).forEach(sourceId => {
    const source = findNode(sourceId);
    if (source && source.type !== "output") state.edges.push({ id: uid("e"), from: { node: sourceId, port: "out" }, to: { node: node.id, port: "in" } });
  });
  node.prompt = anglePrompt(node);
  pushHistory(); render(); toast("已创建角度变化节点（测试功能）");
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

function edgePath(a, b) {
  const p1 = portPoint(a, "out");
  const p2 = portPoint(b, "in");
  if (state.settings.smoothEdges) {
    const dx = Math.abs(p2.x - p1.x) * 0.5;
    return `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
  }
  const gap = 60;
  const mid = p2.x > p1.x + gap ? (p1.x + p2.x) / 2 : Math.max(p1.x + gap, p2.x - gap);
  return `M ${p1.x} ${p1.y} L ${mid} ${p1.y} L ${mid} ${p2.y} L ${p2.x} ${p2.y}`;
}

function render() {
  els.app.classList.toggle("mode-mindmap", isMindmapMode());
  els.app.classList.toggle("mode-ai", !isMindmapMode());
  const activeGroup = state.graphStack[state.graphStack.length - 1];
  els.mindmapBreadcrumb?.classList.toggle("hidden", !activeGroup);
  if (els.mindmapBreadcrumbText && activeGroup) {
    els.mindmapBreadcrumbText.textContent = state.graphStack.map(entry => entry.label || "编组").join(" / ");
  }
  applySettings();
  normalizeNodeSizes();
  applyView();
  renderPageTabs();
  renderNodes();
  renderEdges();
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
    if (pending.nodes) syncNodeGeometry();
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
}

function projectModeName(mode) {
  return mode === "mindmap" ? "思维导图" : "AI 绘图";
}

function projectButtonMarkup(page) {
  const name = page?.name || "未命名项目";
  return `<span class="project-name-text">${escapeHtml(name)}</span>`;
}

function renderPageTabs() {
  const page = currentPage();
  els.projectNameBtn.innerHTML = projectButtonMarkup(page);
  els.projectNameBtn.title = page ? `${page.name} · ${projectModeName(page.mode)}（单击切换项目，双击重命名）` : "未命名项目";
  els.projectMenu.innerHTML = "";
  state.pages.filter(page => page.mode !== "mindmap" || mindmapFeatureEnabled()).forEach(page => {
    const row = document.createElement("div");
    row.className = "project-menu-row";

    const btn = document.createElement("button");
    btn.className = page.id === state.activePageId ? "active" : "";
    btn.innerHTML = projectButtonMarkup(page);
    btn.title = `${page.name} · ${projectModeName(page.mode)}（双击重命名）`;
    let clickTimer = null;
    btn.onclick = () => {
      if (clickTimer) window.clearTimeout(clickTimer);
      clickTimer = window.setTimeout(() => {
        clickTimer = null;
        if (page.id !== state.activePageId) switchPage(page.id);
        els.projectMenu.classList.add("hidden");
      }, 220);
    };
    btn.ondblclick = ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (clickTimer) window.clearTimeout(clickTimer);
      clickTimer = null;
      beginProjectMenuRename(page, btn);
    };
    row.appendChild(btn);

    const delBtn = document.createElement("button");
    delBtn.className = "project-delete-btn";
    delBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8l8 8M16 8l-8 8"/></svg>';
    delBtn.setAttribute("aria-label", "删除项目");
    delBtn.title = "删除项目";
    delBtn.onclick = (ev) => {
      ev.stopPropagation();
      deletePage(page.id);
    };
    row.appendChild(delBtn);

    els.projectMenu.appendChild(row);
  });
}

function beginProjectMenuRename(page, button) {
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
    els.projectMenu.classList.remove("hidden");
  };
  input.addEventListener("keydown", ev => {
    if (ev.key === "Enter") finish(true);
    if (ev.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true), { once: true });
}

function renderNodes() {
  els.nodes.innerHTML = "";
  for (const node of state.nodes) {
    const div = document.createElement("div");
    const progressClass = (node.type === "ai-image" || node.type === "angle-image") && node._aiProgress ? `ai-status-${node._aiProgress.status}` : "";
    div.className = `node ${node.type} ${progressClass} ${node.disabled ? "disabled" : ""} ${state.selected.has(node.id) ? "selected" : ""}`;
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
}

let autoSizePersistTimer = 0;
function syncContentDrivenNodeHeights() {
  let changed = false;
  els.nodes.querySelectorAll(".node").forEach(nodeElement => {
    const node = findNode(nodeElement.dataset.id);
    if (!node || node.type === "text") return;
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
}

function nodeTemplate(node) {
  const num = node.type === "output" ? outputNumber(node.id) : 0;
  const title = node.type === "text" ? "文字节点" : node.type === "image" ? "图片节点" : node.type === "folder" ? (node.folderName || "图片文件夹") : node.type === "mind-group" ? (node.label || "编组") : node.type === "ai-image" ? (node.seq ? `AI绘图 #${node.seq}` : "AI绘图") : node.type === "angle-image" ? "角度变化" : node.type === "screenshot-input" ? `截图功能节点 #${node.screenshotSeq || 1}` : node.type === "group" ? "多任务节点" : `输出节点 ${num}`;
  const inPort = `<span class="port in" data-port="in" title="输入端口"></span>`;
  const outPort = (node.type === "output" || node.type === "screenshot-input") ? "" : `<span class="port out" data-port="out" title="输出端口"></span>`;
  let body = "";
  if (node.type === "text") {
    body = `<textarea data-role="text">${escapeHtml(node.text || "")}</textarea><span class="resize-handle" title="拖拽缩放"></span>`;
  } else if (node.type === "mind-group") {
    const count = node.subgraph?.nodes?.length || 0;
    body = `<div class="mind-group-icon" title="双击进入编组"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="9" y="14" width="6" height="6" rx="1.5"/><path d="M7 10v2h10v-2M12 12v2"/></svg></div><div class="mind-group-summary">${count} 个节点 · 双击进入</div>`;
  } else if (node.type === "folder") {
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
  } else if (node.type === "image") {
    const seqTag = node.seq ? `<span class="image-seq">#${node.seq}</span>` : "";
    body = `<div class="image-preview" title="双击放大预览"${imageAspectStyle(node)}>${node.image ? `<img src="${node.image}" alt="" draggable="false">` : "无图片"}${seqTag}</div>
      <div class="node-hover-controls">
        <div class="image-actions">
          <button data-role="upload">上传</button>
          <button data-role="clear-image">清除</button>
        </div>
      </div>`;
  } else if (node.type === "ai-image") {
    body = aiImageBody(node) + aiNodeProgressMarkup(node);
  } else if (node.type === "angle-image") {
    body = angleImageBody(node);
  } else if (node.type === "screenshot-input") {
    normalizeAiNodeSettings(node);
    node._count = Math.max(1, Math.min(4, Number(node._count) || 1));
    body = `<div class="screenshot-node-summary">${escapeHtml(screenshotNodeSummary(node))}</div><div class="node-hover-controls"><div class="ai-node-settings"><label>模型<select data-role="screenshot-model"><option value="gpt-image-2" ${node._model === "gpt-image-2" ? "selected" : ""}>GPT Image 2</option><option value="gemini-3.1-flash-image-preview" ${node._model === "gemini-3.1-flash-image-preview" ? "selected" : ""}>Gemini 3.1 Flash</option></select></label><label>分辨率<select data-role="screenshot-resolution">${["1k","2k","4k"].map(v => `<option value="${v}" ${node._resolution === v ? "selected" : ""}>${v.toUpperCase()}</option>`).join("")}</select></label><label>画质<select data-role="screenshot-quality">${["low","medium","high"].map(v => `<option value="${v}" ${node._quality === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>比例<select data-role="screenshot-size">${["1:1","auto","3:2","2:3","4:3","3:4","16:9","9:16"].map(v => `<option value="${v}" ${node._size === v ? "selected" : ""}>${v}</option>`).join("")}</select></label><label>生成数量<select data-role="screenshot-count">${[1,2,3,4].map(v => `<option value="${v}" ${node._count === v ? "selected" : ""}>${v}</option>`).join("")}</select></label></div></div>`;
  } else {
    body = `<div class="output-label">图片${num}</div>`;
  }
  return `${inPort}${outPort}<div class="node-head"><span>${title}</span></div><div class="node-body">${body}</div>`;
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
      if (isMindmapMode()) renameEdge(e.id);
      else removeEdge(e.id);
    });
    hit.addEventListener("contextmenu", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      showMenu(ev.clientX, ev.clientY, isMindmapMode()
        ? [["编辑连线名称", () => renameEdge(e.id)], ["删除连线", () => removeEdge(e.id)]]
        : [["取消连线", () => removeEdge(e.id)]]);
    });
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "edge");
    path.setAttribute("d", d);
    els.edges.appendChild(hit);
    els.edges.appendChild(path);
    if (isMindmapMode() && e.label) {
      const fromPoint = portPoint(a, "out");
      const toPoint = portPoint(b, "in");
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "edge-label");
      label.setAttribute("x", String((fromPoint.x + toPoint.x) / 2));
      label.setAttribute("y", String((fromPoint.y + toPoint.y) / 2));
      label.textContent = e.label;
      label.addEventListener("dblclick", event => { event.stopPropagation(); renameEdge(e.id); });
      els.edges.appendChild(label);
    }
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
  const columnNextY = new Map();
  state.nodes
    .slice()
    .sort((a, b) => (depths.get(a.id) || 0) - (depths.get(b.id) || 0) || a.created - b.created)
    .forEach(n => {
      const d = depths.get(n.id) || 0;
      n.x = snap(80 + d * 330);
      n.y = snap(columnNextY.get(d) || 80);
      columnNextY.set(d, n.y + n.h + 40);
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

function connectSelectionInSequence() {
  const selectedSources = state.nodes
    .filter(n => state.selected.has(n.id) && (isMindmapMode() || (!n.disabled && (n.type === "text" || n.type === "image" || n.type === "ai-image"))));
  const byCanvasOrder = (a, b) => a.x - b.x || a.y - b.y || a.created - b.created;
  const sources = selectedSources.sort(byCanvasOrder);
  if (sources.length < 2) return toast(isMindmapMode() ? "请至少选择 2 个节点" : "请至少选择 2 个文字、图片或 AI 绘图节点");

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

els.viewport.addEventListener("wheel", ev => {
  ev.preventDefault();
  const before = screenToWorld(ev.clientX, ev.clientY);
  const factor = ev.deltaY < 0 ? 1.08 : .92;
  state.view.scale = Math.max(.25, Math.min(2.5, state.view.scale * factor));
  const r = els.viewport.getBoundingClientRect();
  state.view.x = ev.clientX - r.left - before.x * state.view.scale;
  state.view.y = ev.clientY - r.top - before.y * state.view.scale;
  scheduleViewPersistence();
  scheduleInteractiveRender({ view: true, minimap: true });
}, { passive: false });

els.viewport.addEventListener("mousedown", ev => {
  hideMenu();
  els.projectMenu.classList.add("hidden");
  lastPointerWorld = screenToWorld(ev.clientX, ev.clientY);
  if (ev.target.closest(".edge-hit")) return; // 点击连线不做任何操作，交给 dblclick / contextmenu
  const port = ev.target.closest(".port");
  const nodeEl = ev.target.closest(".node");
  const interactive = ev.target.closest("textarea,button,input,select,[contenteditable='true']");
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
    syncSelectedNodeClasses();
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
    drag = { type: "nodes", start, moved: false, original: state.nodes.filter(n => state.selected.has(n.id)).map(n => ({ id: n.id, x: n.x, y: n.y })) };
    // Keep the preview element alive so a real mouse double-click can reach it.
    // Rebuilding the node here would discard the first click's DOM target.
    syncSelectedNodeClasses();
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
    syncSelectedNodeClasses();
  }
});

window.addEventListener("mousemove", ev => {
  if (ev.target.closest?.("#viewport")) lastPointerWorld = screenToWorld(ev.clientX, ev.clientY);
  if (connectDraft) {
    connectDraft.end = screenToWorld(ev.clientX, ev.clientY);
    scheduleInteractiveRender({ edges: true });
  }
  if (drag?.type === "resize") {
    const node = findNode(drag.nodeId);
    if (node) {
      const scale = state.view.scale;
      node.w = Math.max(180, drag.sw + (ev.clientX - drag.sx) / scale);
      const minHeight = node.type === "ai-image" ? AI_NODE_HEIGHT : node.type === "angle-image" ? ANGLE_NODE_HEIGHT : 120;
      node.h = Math.max(minHeight, drag.sh + (ev.clientY - drag.sy) / scale);
      const el = document.querySelector(`.node[data-id="${node.id}"]`);
      if (el) {
        el.style.width = `${node.w}px`;
        el.style.height = `${node.h}px`;
      }
      scheduleInteractiveRender({ edges: true, minimap: true });
    }
  } else if (drag?.type === "nodes") {
    const p = screenToWorld(ev.clientX, ev.clientY);
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 3 / state.view.scale) return;
    drag.moved = true;
    for (const item of drag.original) {
      const n = findNode(item.id);
      n.x = snap(item.x + dx);
      n.y = snap(item.y + dy);
    }
    scheduleInteractiveRender({ nodes: true, edges: true, minimap: true });
  } else if (drag?.type === "pan") {
    state.view.x = drag.vx + ev.clientX - drag.sx;
    state.view.y = drag.vy + ev.clientY - drag.sy;
    scheduleInteractiveRender({ view: true, minimap: true });
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
    publishScreenshotNodeCatalog();
  }
});

els.nodes.addEventListener("change", ev => {
  const nodeEl = ev.target.closest(".node");
  const node = nodeEl ? findNode(nodeEl.dataset.id) : null;
  const role = ev.target.dataset.role;
  if (role === "text") pushHistory();
  if (!node) return;
  if (node.type === "screenshot-input") {
    if (role === "screenshot-model") node._model = ev.target.value;
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
  if (node.type !== "ai-image") return;
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
  if (ev.target.dataset.role === "angle-edit") openAngleEditor(node.id);
  if (ev.target.dataset.role === "angle-generate") generateAngleImage(node.id);
  if (ev.target.dataset.role === "clear-image") {
    node.outputPath = "";
    if (node.type === "ai-image" || node.type === "angle-image") {
      node.generatedImage = null;
      delete node.generatedAssetId;
      node.taskId = null;
    } else {
      node.image = null;
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
  const mindGroupElement = ev.target.closest(".node.mind-group");
  if (mindGroupElement) {
    ev.preventDefault();
    ev.stopPropagation();
    enterMindmapGroup(mindGroupElement.dataset.id);
    return;
  }
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
  if (ev.target.closest(".image-preview") || ev.target.closest(".ai-preview") || ev.target.closest(".group-preview") || ev.target.closest(".mind-group-icon")) {
    ev.preventDefault();
    ev.stopPropagation();
    const nodeEl = ev.target.closest(".node");
    if (!nodeEl) return;
    const node = findNode(nodeEl.dataset.id);
    if (!node) return;
    if (node.type === "mind-group") {
      enterMindmapGroup(node.id);
    } else if ((node.type === "group" || node.type === "folder") && node.images && node.images.length) {
      await showNodeLightbox(node);
    } else if (node.type === "group" && node.items) {
      await showNodeLightbox(node);
    } else {
      await showNodeLightbox(node);
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
    delete node.imageAssetId;
    node.fileName = file.name;
    node.mime = file.type || "image/png";
    await externalizeImageField(node, "image", "imageAssetId", node.fileName);
    pushHistory();
    render();
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
  if (node.type === "image" && state.settings.autoFitImageNodes === false) return false;
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
els.lightboxPaintConfirm.onclick = async () => {
  if (!lightboxPainting) return;
  const source = findNode(lightboxSourceNodeId);
  const image = els.lightboxPaintCanvas.toDataURL("image/png");
  const x = source ? source.x + NODE_WIDTH + 40 : lastPointerWorld.x;
  const y = source ? source.y : lastPointerWorld.y;
  const node = addNode("image", x, y, false);
  node.image = image;
  node.fileName = `局部修改_${Date.now()}.png`;
  node.mime = "image/png";
  await externalizeImageField(node, "image", "imageAssetId", node.fileName);
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
    await externalizeImageField(node, "image", "imageAssetId", node.fileName);
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

async function copyTextValue(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
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

async function copyGeneratedImage(node) {
  const outputPath = String(node?.outputPath || "").trim();
  try {
    if (outputPath && window.canvasflowDesktop?.copyImage) {
      await window.canvasflowDesktop.copyImage(outputPath);
    } else {
      const source = node?.generatedImage || node?.image || "";
      if (!source || !navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw new Error("当前运行方式不支持图片剪贴板");
      const blob = await (await fetch(source)).blob();
      const pngBlob = blob.type === "image/png" ? blob : await imageBlobAsPng(blob);
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

els.viewport.addEventListener("contextmenu", ev => {
  ev.preventDefault();
  const nodeEl = ev.target.closest(".node");
  const p = screenToWorld(ev.clientX, ev.clientY);
  if (nodeEl) {
    const id = nodeEl.dataset.id;
    if (!state.selected.has(id)) state.selected = new Set([id]);
    const selectedNode = findNode(id);
    if (isMindmapMode()) {
      const mindmapItems = [
        ...((selectedNode?.type === "text" || selectedNode?.type === "image") ? [[selectedNode.type === "text" ? "保存为自定义文字" : "保存为自定义图片", () => saveNodeAsTemplate(selectedNode)]] : []),
        ...(state.selected.size > 1 ? [["创建编组", () => groupSelection()], ["依次连接", () => connectSelectionInSequence()]] : []),
        ...(selectedNode?.type === "mind-group" ? [["进入编组", () => enterMindmapGroup(id)], ["重命名编组", () => renameMindmapGroup(id)], ["解散编组", () => ungroupMindmapNode(id)]] : []),
        ["断开连接", () => disconnectEdges(state.selected)],
        ["复制节点", () => copySelection()],
        ["删除节点", () => deleteNodes(state.selected)],
      ];
      showMenu(ev.clientX, ev.clientY, mindmapItems);
      renderNodes();
      return;
    }
    const isGroupWithItems = selectedNode?.type === "group" && (selectedNode?.items || (selectedNode?.images && selectedNode?.images.length));
    const extensionSources = state.nodes.filter(node => state.selected.has(node.id) && (
      (node.type === "image" && (node.image || node.imageAssetId)) ||
      ((node.type === "ai-image" || node.type === "angle-image") && (node.generatedImage || node.generatedAssetId))
    ));
    const items = [
      ["切换启用/停用", () => toggleDisabled(state.selected)],
      ...((selectedNode?.outputPath || selectedNode?.generatedImage || selectedNode?.aiSourceNodeId || selectedNode?.angleSourceNodeId) ? [["复制图片", () => copyGeneratedImage(selectedNode)]] : []),
      ...(selectedNode?.outputPath ? [["打开生成图片所在文件夹", () => openGeneratedFileLocation(selectedNode)], ["复制生成图片路径", () => copyGeneratedFilePath(selectedNode)]] : []),
      ...((selectedNode?.type === "text" || selectedNode?.type === "image" || (selectedNode?.type === "ai-image" && selectedNode.generatedImage)) ? [[selectedNode.type === "text" ? "保存为自定义文字" : "保存为自定义图片", () => saveNodeAsTemplate(selectedNode)]] : []),
      ...(state.selected.size > 1 ? [["多任务", () => groupSelection()]] : []),
      ...(state.selected.size > 1 ? [["依次连接", () => connectSelectionInSequence()]] : []),
      ...(isGroupWithItems ? [["取消多任务", () => ungroupNode(id)]] : []),
      ["AI绘图", () => {
        const sources = state.nodes.filter(n => state.selected.has(n.id) && n.type !== "output" && n.type !== "screenshot-input");
        if (sources.length) {
          sources.forEach(source => {
            addAiImageNode(source.x + 290, source.y, [source.id]);
          });
        }
      }],
      ...(extensionSources.length ? [["拓展功能", [
        ["角度变化", () => {
          extensionSources.forEach(source => addAngleImageNode(source.x + 290, source.y, [source.id]));
        }],
        [backgroundRemovalPluginInstalled ? "自动抠图" : "自动抠图（未安装）", () => {
          if (!backgroundRemovalPluginInstalled) return showBackgroundRemovalInstall();
          removeBackgroundFromSources(extensionSources);
        }],
        [imageUpscalePluginInstalled ? "图片放大" : "图片放大（未安装）", () => {
          if (!imageUpscalePluginInstalled) return showImageUpscaleInstall();
          upscaleExtensionSources(extensionSources);
        }],
      ]]] : []),
      ["断开连接", () => disconnectEdges(state.selected)],
      ["复制节点", () => copySelection()],
      ["删除节点", () => deleteNodes(state.selected)],
    ];
    showMenu(ev.clientX, ev.clientY, items);
    renderNodes();
  } else if (state.selected.size > 1) {
    if (isMindmapMode()) {
      const items = [];
      if (state.clipboard?.nodes?.length) items.push(["粘贴节点", () => pasteNodes(state.clipboard, p)]);
      items.push(["创建编组", () => groupSelection()], ["依次连接", () => connectSelectionInSequence()], ["断开连接", () => disconnectEdges(state.selected)], ["批量删除", () => deleteNodes(state.selected)]);
      showMenu(ev.clientX, ev.clientY, items);
      return;
    }
    const items = [];
    if (state.clipboard?.nodes?.length) items.push(["粘贴节点", () => pasteNodes(state.clipboard, p)]);
    items.push(
      ["多任务", () => groupSelection()],
      ["依次连接", () => connectSelectionInSequence()],
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
    if (isMindmapMode()) {
      items.push(
        ["添加文字节点", () => addNode("text", p.x, p.y)],
        ["添加图片节点", () => addNode("image", p.x, p.y)],
        ["添加图片文件夹", () => {
          if (window.chrome?.webview) window.chrome.webview.postMessage({ type: "pick-image-folder" });
          else els.composerFolderInput.click();
        }],
        ["自定义节点", [
          ["自定义文字", textTemplates.length ? textTemplates.map(template => [template.name, () => createNodeFromTemplate("text", template, p.x, p.y)]) : [["暂无素材", null]]],
          ["自定义图片", imageTemplates.length ? imageTemplates.map(template => [template.name, () => createNodeFromTemplate("image", template, p.x, p.y)]) : [["暂无素材", null]]],
        ]],
        ["节点对齐", () => tidyNodes()],
      );
      showMenu(ev.clientX, ev.clientY, items);
      return;
    }
    items.push(
      ["添加文字节点", () => addNode("text", p.x, p.y)],
      ["添加图片节点", () => addNode("image", p.x, p.y)],
      ["自定义节点", [
        ["自定义文字", textTemplates.length ? textTemplates.map(template => [template.name, () => createNodeFromTemplate("text", template, p.x, p.y)]) : [["暂无素材", null]]],
        ["自定义图片", imageTemplates.length ? imageTemplates.map(template => [template.name, () => createNodeFromTemplate("image", template, p.x, p.y)]) : [["暂无素材", null]]],
      ]],
      ["添加AI绘图节点", () => addAiImageNode(p.x, p.y, [])],
      ["拓展功能", [
        ["角度变化", () => addAngleImageNode(p.x, p.y, [])],
        [backgroundRemovalPluginInstalled ? "自动抠图" : "自动抠图（未安装）", () => {
          if (!backgroundRemovalPluginInstalled) return showBackgroundRemovalInstall();
          toast("请先添加或选择图片节点，再使用自动抠图");
        }],
        [imageUpscalePluginInstalled ? "图片放大" : "图片放大（未安装）", () => {
          if (!imageUpscalePluginInstalled) return showImageUpscaleInstall();
          toast("请先添加或选择图片节点，再使用图片放大");
        }],
      ]],
      ["添加截图功能节点", () => addNode("screenshot-input", p.x, p.y)],
      ["节点对齐", () => tidyNodes()],
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
  if (ev.code === "Space") spaceDown = false;
});

els.viewport.addEventListener("pointerdown", ev => {
  if (ev.target.closest("button,input,textarea,select,[contenteditable='true']")) return;
  els.viewport.focus({ preventScroll: true });
}, true);

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
  return !!file && (/^image\/(?:jpeg|png|webp|gif)$/i.test(String(file.type || "")) || /\.(png|jpe?g|webp|gif)$/i.test(file.name || ""));
}

async function showNodeLightbox(node) {
  if (!node) return;
  try {
    const references = [];
    if (node.type === "group" || node.type === "folder") {
      for (const image of node.images || []) references.push({ image: image.image, assetId: image.assetId || "" });
      for (const item of node.items || []) {
        if (item.type === "image" && (item.image || item.imageAssetId)) references.push({ image: item.image, assetId: item.imageAssetId || "" });
        if ((item.type === "ai-image" || item.type === "angle-image") && (item.generatedImage || item.generatedAssetId)) references.push({ image: item.generatedImage, assetId: item.generatedAssetId || "" });
      }
    } else if (node.type === "ai-image" || node.type === "angle-image") {
      if (node.generatedImage || node.generatedAssetId) references.push({ image: node.generatedImage, assetId: node.generatedAssetId || "" });
    } else if (node.image || node.imageAssetId) {
      references.push({ image: node.image, assetId: node.imageAssetId || "" });
    }
    if (!references.length) return;
    const originals = [];
    for (const reference of references) {
      const original = await materializeReferenceImage(reference);
      if (original) originals.push(original);
    }
    if (originals.length) showLightbox(originals, node.id);
  } catch (error) {
    console.error("[高清预览] 原图读取失败", { nodeId: node.id, message: error.message });
    const fallback = node.generatedImage || node.image || node.images?.map(image => image.image).filter(Boolean) || [];
    if ((Array.isArray(fallback) && fallback.length) || (!Array.isArray(fallback) && fallback)) showLightbox(fallback, node.id);
    toast(`高清原图读取失败：可能是素材文件丢失或目录无权限；已显示缩略图，请检查 data 目录。${error.message || ""}`);
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

function createNewPage(mode = "ai") {
  saveCurrentPage();
  resetGraphNavigation();
  const page = blankPage(`项目${state.nextPageNum++}`, mode);
  state.pages.push(page);
  state.activePageId = page.id;
  restoreData(page.data);
  state.history = [cloneData()];
  state.future = [];
  updateUndoRedo();
  markDirty();
  render();
  toast(mode === "mindmap" ? "已新建思维导图项目" : "已新建 AI 绘图项目");
}

function newPage() {
  if (hasUnsettledAiQueueTasks()) {
    toast("任务队列仍有待处理任务，请完成或删除等待任务后再新建项目");
    return;
  }
  if (!mindmapFeatureEnabled()) {
    createNewPage("ai");
    return;
  }
  els.projectModeDialog.classList.remove("hidden");
  window.setTimeout(() => els.projectModeDialog.querySelector('[data-project-mode="ai"]')?.focus(), 0);
}

function closeProjectModeDialog() {
  els.projectModeDialog.classList.add("hidden");
}

function deletePage(id) {
  if (hasUnsettledAiQueueTasks()) {
    toast("任务队列仍有待处理任务，请完成或删除等待任务后再删除项目");
    return;
  }
  const visiblePages = state.pages.filter(page => page.mode !== "mindmap" || mindmapFeatureEnabled());
  if (visiblePages.length <= 1) {
    toast("至少保留一个项目");
    return;
  }
  const idx = state.pages.findIndex(p => p.id === id);
  if (idx === -1) return;
  saveCurrentPage();
  const removed = state.pages.splice(idx, 1)[0];
  state._deletedPage = { page: removed, index: idx };
  if (state.activePageId === id) {
    resetGraphNavigation();
    const fallbackPages = state.pages.filter(page => page.mode !== "mindmap" || mindmapFeatureEnabled());
    state.activePageId = (fallbackPages[Math.min(idx, fallbackPages.length - 1)] || fallbackPages[0]).id;
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
  if (hasUnsettledAiQueueTasks()) {
    toast("任务队列仍有待处理任务，请完成或删除等待任务后再切换项目");
    return;
  }
  const targetPage = state.pages.find(page => page.id === id);
  if (!targetPage || (targetPage.mode === "mindmap" && !mindmapFeatureEnabled())) return;
  saveCurrentPage();
  resetGraphNavigation();
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
  const snapshot = JSON.parse(JSON.stringify({ pages: state.pages, activePageId: state.activePageId, nextPageNum: state.nextPageNum, uiLanguage, onboardingSeenVersion }));
  for (const page of snapshot.pages || []) if (page.data?.settings) page.data.settings.apiKey = "";
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
  const snapshot = JSON.parse(JSON.stringify({ pages: state.pages, activePageId: state.activePageId, nextPageNum: state.nextPageNum, uiLanguage, onboardingSeenVersion, updatedAt: Date.now() }));
  for (const page of snapshot.pages || []) if (page.data?.settings) page.data.settings.apiKey = "";
  return snapshot;
}

function autoBackupContent() {
  saveCurrentPage();
  const data = JSON.parse(JSON.stringify({ pages: state.pages, activePageId: state.activePageId, globalLibrary }));
  for (const page of data.pages || []) {
    if (page.data?.settings) page.data.settings.apiKey = "";
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

function renderCheckedUpdateStatus(data = lastUpdateCheckResult) {
  if (!data || !els.updateStatus) return;
  els.updateStatus.textContent = data.hasUpdate
    ? updateText(`发现新版本 ${data.latestVersion}（当前 ${data.currentVersion}）`, `Version ${data.latestVersion} is available (current: ${data.currentVersion})`)
    : updateText(`当前版本 ${data.currentVersion}，已经是最新版`, `Version ${data.currentVersion} is up to date`);
}

async function checkForUpdates({ silent = false, prompt = false } = {}) {
  if (!els.updateStatus || (updateCheckStarted && silent)) return null;
  updateCheckStarted = true;
  els.checkUpdateBtn.disabled = true;
  els.updateStatus.textContent = updateText("正在连接 GitHub 检查更新…", "Checking GitHub for updates…");
  try {
    const resp = await apiFetch("/api/update/check", { cache: "no-store" });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    lastUpdateCheckResult = data;
    els.updateActions.classList.toggle("hidden", !data.hasUpdate);
    els.releasePageLink.href = data.pageUrl || "https://github.com/wuxinliuyun-art/canvasflow/releases";
    renderCheckedUpdateStatus(data);
    console.info("[自动更新] 检查完成", { current: data.currentVersion, latest: data.latestVersion, hasUpdate: data.hasUpdate, asset: data.asset && data.asset.name });
    if (data.hasUpdate && prompt) toast(updateText(
      `发现 CanvasFlow ${data.latestVersion}，请在设置中打开下载页面更新`,
      `CanvasFlow ${data.latestVersion} is available. Open the download page from Settings to update.`
    ));
    return data;
  } catch (err) {
    els.updateStatus.textContent = updateText("检查失败；可能是网络或 GitHub 暂时不可用，请稍后重试。", "Update check failed. GitHub or the network may be temporarily unavailable; try again later.");
    if (!silent) toast(updateText(`无法检查更新：${err.message}；请检查网络后重试`, `Unable to check for updates: ${err.message}. Check the network and try again.`));
    console.error("[自动更新] 检查失败", { message: err.message });
    return null;
  } finally {
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

window.addEventListener("cut", ev => {
  if (ev.target.matches("textarea,input,select") || !state.selected.size || !ev.clipboardData) return;
  ev.preventDefault();
  ev.clipboardData.setData("application/x-canvasflow-nodes", "1");
  ev.clipboardData.setData("text/plain", "");
  const ids = new Set(state.selected);
  copySelection(false);
  deleteNodes(ids);
});

function loadPagesFromStorage(savedState = null) {
  try {
    const raw = savedState ? null : localStorage.getItem(STORAGE_KEY);
    if (!savedState && !raw) return false;
    const saved = savedState || JSON.parse(raw);
    if (!Array.isArray(saved.pages) || !saved.pages.length) return false;
    state.pages = saved.pages.map(page => ({ ...page, mode: page.mode === "mindmap" ? "mindmap" : "ai" }));
    state.activePageId = saved.activePageId || state.pages[0].id;
    state.nextPageNum = saved.nextPageNum || (state.pages.length + 1);
    let page = currentPage();
    if (!page || (page.mode === "mindmap" && !mindmapFeatureEnabled())) page = state.pages.find(item => item.mode !== "mindmap");
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
els.mindmapBackBtn.onclick = exitMindmapGroup;
els.projectModeCloseBtn.onclick = closeProjectModeDialog;
els.projectModeCancelBtn.onclick = closeProjectModeDialog;
els.projectModeDialog.addEventListener("click", event => {
  if (event.target === els.projectModeDialog) closeProjectModeDialog();
  const modeButton = event.target.closest?.("[data-project-mode]");
  if (!modeButton) return;
  const mode = modeButton.dataset.projectMode === "mindmap" ? "mindmap" : "ai";
  closeProjectModeDialog();
  createNewPage(mode);
});
$("saveJsonBtn").onclick = saveJson;
$("loadJsonBtn").onclick = () => els.loadJson.click();
$("autoOutputBtn").onclick = autoAddAiNodes;
els.runBtn.onclick = runExport;
$("themeBtn").onclick = () => {
  state.settings.theme = state.settings.theme === "light" ? "dark" : "light";
  pushHistory();
  render();
  scheduleOnboardingLayout();
};
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
}

function openPluginSettings() {
  setSettingsSidebarOpen(true);
  switchSettingsTab("plugins");
}

function showBackgroundRemovalInstall() {
  console.info("[插件] 打开智能抠图安装页");
  openPluginSettings();
  requestAnimationFrame(() => $("installBackgroundRemovalPluginBtn")?.focus());
}

async function refreshBackgroundRemovalPluginStatus() {
  const status = $("backgroundRemovalPluginStatus");
  const installButton = $("installBackgroundRemovalPluginBtn");
  const removeButton = $("removeBackgroundRemovalPluginBtn");
  if (!desktop?.backgroundRemovalStatus) {
    backgroundRemovalPluginInstalled = false; status.textContent = "仅桌面版";
    installButton.classList.add("hidden"); removeButton.classList.add("hidden"); return;
  }
  try {
    const result = await desktop.backgroundRemovalStatus();
    backgroundRemovalPluginInstalled = result?.installed === true;
    status.textContent = backgroundRemovalPluginInstalled ? "已安装" : "未安装";
    status.classList.toggle("installed", backgroundRemovalPluginInstalled);
    installButton.classList.toggle("hidden", backgroundRemovalPluginInstalled);
    removeButton.classList.toggle("hidden", !backgroundRemovalPluginInstalled);
    if (backgroundRemovalPluginInstalled && !installButton.disabled) $("backgroundRemovalInstallProgress").classList.add("hidden");
  } catch (error) { backgroundRemovalPluginInstalled = false; status.textContent = "检测失败"; console.error("[智能抠图插件] 状态检测失败", error); }
}

async function removeBackgroundFromSources(nodes) {
  if (desktop?.removeImageBackground) { enqueueExtensionTasks(nodes, "background-removal"); return; }
  if (!desktop?.removeImageBackground) return toast("智能抠图仅支持 .NET 桌面版");
  for (const source of nodes) {
    try {
      const reference = source.type === "image" ? { image: source.image, assetId: source.imageAssetId } : { image: source.generatedImage, assetId: source.generatedAssetId };
      const dataUrl = await materializeReferenceImage(reference);
      if (!dataUrl) throw new Error("无法读取原始图片");
      toast("正在抠图，首次运行可能需要加载模型");
      const result = await desktop.removeImageBackground({ dataUrl, fileName: source.fileName || "image.png", outputRoot: state.settings.exportFolderLabel || runtimeExportFolder });
      const resultNode = addNode("image", source.x + NODE_WIDTH + 40, source.y, false);
      resultNode.image = result.dataUrl; resultNode.fileName = result.fileName || "transparent.png"; resultNode.mime = "image/png";
      resultNode.outputPath = result.outputPath || ""; resultNode.backgroundRemovalSourceNodeId = source.id;
      await externalizeImageField(resultNode, "image", "imageAssetId", resultNode.fileName);
      state.edges.push({ id: uid("e"), from: { node: source.id, port: "out" }, to: { node: resultNode.id, port: "in" } });
      pushHistory(); render(); toast("抠图完成");
    } catch (error) {
      console.error("[智能抠图插件] 处理失败", { nodeId: source.id, message: error.message });
      toast(`智能抠图失败：可能是模型不完整、图片格式不支持或内存不足；建议重新安装插件或换较小图片重试。${error.message || ""}`);
    }
  }
}

function showImageUpscaleInstall() {
  openPluginSettings();
  requestAnimationFrame(() => $("installImageUpscalePluginBtn")?.focus());
}

async function refreshImageUpscalePluginStatus() {
  const status = $("imageUpscalePluginStatus");
  const installButton = $("installImageUpscalePluginBtn");
  const removeButton = $("removeImageUpscalePluginBtn");
  if (!desktop?.imageUpscaleStatus) {
    imageUpscalePluginInstalled = false;
    status.textContent = "仅桌面版";
    installButton.classList.add("hidden");
    removeButton.classList.add("hidden");
    return;
  }
  try {
    const result = await desktop.imageUpscaleStatus();
    imageUpscalePluginInstalled = result?.installed === true;
    status.textContent = imageUpscalePluginInstalled ? "已安装" : "未安装";
    status.classList.toggle("installed", imageUpscalePluginInstalled);
    installButton.classList.toggle("hidden", imageUpscalePluginInstalled);
    removeButton.classList.toggle("hidden", !imageUpscalePluginInstalled);
  } catch (error) {
    imageUpscalePluginInstalled = false;
    status.textContent = "检测失败";
    console.error("[图片放大插件] 状态检测失败", error);
  }
}

async function upscaleExtensionSources(nodes) {
  if (desktop?.upscaleImage) { enqueueExtensionTasks(nodes, "image-upscale"); return; }
  if (!desktop?.upscaleImage) return toast("图片放大仅支持 .NET 桌面版");
  for (const source of nodes) {
    try {
      const reference = source.type === "image"
        ? { image: source.image, assetId: source.imageAssetId }
        : { image: source.generatedImage, assetId: source.generatedAssetId };
      const dataUrl = await materializeReferenceImage(reference);
      if (!dataUrl) throw new Error("无法读取原始图片");
      toast("正在放大图片，请稍候");
      const result = await desktop.upscaleImage({ dataUrl, fileName: source.fileName || "image.png", outputRoot: state.settings.exportFolderLabel || runtimeExportFolder, model: "realesrgan-x4plus", scale: 4 });
      const resultNode = addNode("image", source.x + NODE_WIDTH + 40, source.y, false);
      resultNode.image = result.dataUrl;
      resultNode.fileName = result.fileName || "upscaled.png";
      resultNode.mime = "image/png";
      resultNode.outputPath = result.outputPath || "";
      resultNode.upscaleSourceNodeId = source.id;
      await externalizeImageField(resultNode, "image", "imageAssetId", resultNode.fileName);
      state.edges.push({ id: uid("e"), from: { node: source.id, port: "out" }, to: { node: resultNode.id, port: "in" } });
      pushHistory();
      render();
      toast("图片放大完成");
    } catch (error) {
      console.error("[图片放大插件] 处理失败", { nodeId: source.id, message: error.message });
      toast(`图片放大失败：可能是显卡不支持 Vulkan、驱动过旧或图片过大；建议更新显卡驱动或换较小图片重试。${error.message || ""}`);
    }
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
els.projectNameBtn.onclick = () => els.projectMenu.classList.toggle("hidden");
els.projectNameBtn.ondblclick = ev => {
  ev.preventDefault();
  els.projectMenu.classList.add("hidden");
  renamePage();
};
els.viewport.addEventListener("dblclick", ev => {
  if (ev.target.closest(".node,.edge-hit,button,input,textarea,select,[contenteditable='true']")) return;
  ev.preventDefault();
  centerViewOnContent();
});
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

$("installBackgroundRemovalPluginBtn").onclick = async () => {
  const button = $("installBackgroundRemovalPluginBtn");
  const progress = $("backgroundRemovalInstallProgress");
  button.disabled = true; button.textContent = "安装中…"; progress.classList.remove("hidden");
  $("backgroundRemovalProgressBar").style.width = "0%"; $("backgroundRemovalProgressText").textContent = "准备下载";
  try {
    await desktop.installBackgroundRemoval();
    toast("智能抠图插件安装完成");
  } catch (error) {
    console.error("[智能抠图插件] 安装失败", error);
    showAppAlert(`智能抠图插件安装失败。可能原因：网络无法访问 GitHub、磁盘空间不足或模型校验失败。建议办法：检查网络、剩余空间和 data 目录权限后重试。\n${error.message || ""}`);
  } finally {
    button.disabled = false; button.textContent = "安装插件";
    await refreshBackgroundRemovalPluginStatus();
    if (backgroundRemovalPluginInstalled) {
      $("backgroundRemovalProgressBar").style.width = "100%";
      $("backgroundRemovalProgressText").textContent = "安装完成";
      window.setTimeout(() => progress.classList.add("hidden"), 900);
    } else {
      progress.classList.add("hidden");
    }
  }
};

$("removeBackgroundRemovalPluginBtn").onclick = async () => {
  if (!window.confirm("确定卸载智能抠图插件并删除 213.6 MB 模型吗？已生成的图片不会删除。")) return;
  try { await desktop.uninstallBackgroundRemoval(); toast("智能抠图插件已卸载，生成图片保持不变"); $("backgroundRemovalInstallProgress").classList.add("hidden"); await refreshBackgroundRemovalPluginStatus(); }
  catch (error) { showAppAlert(`无法卸载智能抠图插件。可能原因：抠图任务正在运行或目录权限不足。建议办法：等待任务结束后重试。\n${error.message || ""}`); }
};

$("installImageUpscalePluginBtn").onclick = async () => {
  const button = $("installImageUpscalePluginBtn");
  button.disabled = true;
  button.textContent = "安装中…";
  $("imageUpscalePluginHint").textContent = "正在从 Real-ESRGAN 官方 Release 下载并校验，约 63 MB，请不要关闭软件。";
  try {
    await desktop.installImageUpscale();
    toast("图片放大插件安装完成");
  } catch (error) {
    console.error("[图片放大插件] 安装失败", error);
    showAppAlert(`图片放大插件安装失败。可能原因：网络无法访问 GitHub、磁盘权限不足或文件校验失败。建议办法：检查网络和 data 目录权限后重试。\n${error.message || ""}`);
  } finally {
    button.disabled = false;
    button.textContent = "安装插件";
    $("imageUpscalePluginHint").textContent = "当前默认使用照片模型进行 4× 放大。";
    await refreshImageUpscalePluginStatus();
  }
};

$("removeImageUpscalePluginBtn").onclick = async () => {
  if (!window.confirm("确定卸载图片放大插件吗？已生成的图片不会删除。")) return;
  try {
    await desktop.uninstallImageUpscale();
    toast("图片放大插件已卸载，生成图片保持不变");
    await refreshImageUpscalePluginStatus();
  } catch (error) {
    showAppAlert(`无法卸载图片放大插件。可能原因：插件正在运行或目录权限不足。建议办法：等待当前放大任务结束后重试。\n${error.message || ""}`);
  }
};

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
  if (hint) hint.textContent = isMindmapMode()
    ? "图片将以缩略图保存在文件夹节点中，适合在画布上快速浏览和整理。"
    : "画布只保存缩略图；执行 AI 时读取本地原图。项目使用期间请勿移动或删除原文件夹。";
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

async function externalizeImageField(holder, field, assetField, fallbackName) {
  const dataUrl = holder?.[field];
  if (!desktop || holder?.[assetField] || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return false;
  const mime = (dataUrl.match(/^data:([^;]+)/) || [])[1] || holder.mime || "image/png";
  const generated = field === "generatedImage" || field === "result" || holder.aiSourceNodeId || holder.angleSourceNodeId;
  const stored = await desktop.storeImage(dataUrl, holder.fileName || fallbackName, mime, generated ? "generated" : "originals");
  const assetId = stored.id || stored.Id || "";
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
  const nodeType = isMindmapMode() ? "folder" : "group";
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
    if (message.type === "plugin-install-progress" && message.pluginId === "background-removal") {
      const percent = Math.max(0, Math.min(100, Number(message.percent) || 0));
      $("backgroundRemovalInstallProgress").classList.remove("hidden");
      $("backgroundRemovalProgressBar").style.width = `${percent}%`;
      $("backgroundRemovalProgressText").textContent = message.stage === "verifying" ? "正在校验模型" : message.stage === "complete" ? "安装完成" : `下载 ${percent}%`;
    } else if (message.type === "desktop:paste") {
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
        else {
          const node = addNode("image", lastPointerWorld.x, lastPointerWorld.y, false);
          node.image = await fileToDataUrl(file);
          node.fileName = file.name;
          node.mime = file.type;
          await externalizeImageField(node, "image", "imageAssetId", node.fileName);
          pushHistory();
          render();
          toast("已从剪贴板创建图片节点");
        }
      } else if (message.kind === "text" && String(message.text || "").trim()) {
        const node = addNode("text", lastPointerWorld.x, lastPointerWorld.y, false);
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

els.autoFitImageNodes.onchange = () => {
  state.settings.autoFitImageNodes = els.autoFitImageNodes.checked;
  pushHistory();
  render();
};

els.hideNodeTitles.onchange = () => {
  state.settings.hideNodeTitles = els.hideNodeTitles.checked;
  render();
  pushHistory();
};

// screenshot panel trigger removed

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
  state.settings.gridSize = Math.max(1, Number(els.gridSize.value) || 20);
  pushHistory();
  applySettings();
};

if (els.languageSelect) {
  els.languageSelect.onchange = () => {
    setUiLanguage(els.languageSelect.value);
    render();
    renderTaskQueue();
    syncSettingsPanel();
    renderCheckedUpdateStatus();
    if (onboardingState.active) showOnboardingStep(onboardingState.step);
  };
}

if (els.checkUpdateBtn) els.checkUpdateBtn.onclick = () => checkForUpdates({ silent: false, prompt: false });

els.apiKeyInput.onchange = () => {
  state.settings.apiKey = els.apiKeyInput.value.trim();
  if (desktop) desktop.saveApiKey(state.settings.apiKey).then(result => { if (result.warning) toast(result.warning); });
  pushHistory();
};

els.verifyKeyBtn.onclick = async () => {
  const key = els.apiKeyInput.value.trim();
  if (!key) { toast("请先输入 API Key"); return; }
  els.verifyKeyBtn.disabled = true;
  els.verifyKeyBtn.textContent = "...";
  els.verifyKeyBtn.style.color = "";
  try {
    const resp = await apiFetch("/api/models", { headers: { "X-CanvasFlow-Api-Key": key } });
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
    const resp = await apiFetch("/api/balance", { headers: { "X-CanvasFlow-Api-Key": key } });
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

els.saveKeyBtn.onclick = async () => {
  state.settings.apiKey = els.apiKeyInput.value.trim();
  if (desktop) {
    const result = await desktop.saveApiKey(state.settings.apiKey);
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
  if (desktop) await desktop.saveApiKey("");
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

els.copyExportPathBtn.onclick = copyExportPath;
els.chooseExportFolderBtn.onclick = async () => {
  if (!desktop?.chooseOutputFolder) return toast("修改生成文件夹仅支持 .NET 桌面版");
  try {
    const result = await desktop.chooseOutputFolder(els.exportFolder.value.trim());
    if (result?.cancelled || !result?.path) return;
    const selectedPath = String(result.path).trim();
    runtimeExportFolder = selectedPath;
    state.settings.exportFolderLabel = selectedPath;
    els.exportFolder.value = selectedPath;
    try { localStorage.setItem(OUTPUT_FOLDER_KEY, selectedPath); } catch (_) { /* 桌面状态仍会保存 */ }
    for (const page of state.pages) {
      if (page?.data?.settings) page.data.settings.exportFolderLabel = selectedPath;
    }
    saveCurrentPage();
    persistPages();
    console.info("[生成文件夹] 保存位置已修改", { path: selectedPath });
    toast("生成文件夹已修改");
  } catch (error) {
    console.error("[生成文件夹] 选择失败", error);
    toast(`无法修改生成文件夹：可能是路径权限不足或选择器异常；请换一个普通文件夹后重试。${error.message || ""}`);
  }
};
els.openExportFolderBtn.onclick = async () => {
  const folderPath = els.exportFolder.value.trim();
  if (!folderPath) return toast("生成文件夹路径为空，请先修改位置");
  if (!desktop?.openOutputFolder) return toast("打开生成文件夹仅支持 .NET 桌面版");
  try {
    await desktop.openOutputFolder(folderPath);
    toast("已打开生成文件夹");
  } catch (error) {
    console.error("[生成文件夹] 打开失败", error);
    try { await copyTextValue(folderPath); } catch (_) { /* 保留原始错误 */ }
    toast("无法打开生成文件夹：可能被系统或安全软件拦截；路径已复制，可粘贴到资源管理器地址栏");
  }
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
    state.pages = data.pages.map(page => ({ ...page, mode: page.mode === "mindmap" ? "mindmap" : "ai" }));
    resetGraphNavigation();
    state.activePageId = data.activePageId || state.pages[0].id;
    let page = currentPage();
    if (!page || (page.mode === "mindmap" && !mindmapFeatureEnabled())) page = state.pages.find(item => item.mode !== "mindmap");
    if (!page) {
      page = blankPage(`项目${state.nextPageNum++}`, "ai");
      state.pages.push(page);
    }
    state.activePageId = page.id;
    restoreData(page.data);
  } else {
    const page = blankPage(file.name.replace(/\.json$/i, ""), data.mode === "mindmap" ? "mindmap" : "ai");
    page.data = data;
    state.pages.push(page);
    const activePage = page.mode === "mindmap" && !mindmapFeatureEnabled()
      ? blankPage(`项目${state.nextPageNum++}`, "ai")
      : page;
    if (activePage !== page) state.pages.push(activePage);
    state.activePageId = activePage.id;
    restoreData(activePage.data);
  }
  await resolveImageRefs(state.nodes);
  saveCurrentPage();
  for (const page of state.pages) {
    if (page.id !== state.activePageId) await resolveImageRefs(page.data?.nodes || []);
  }
  state.history = [cloneData()];
  state.future = [];
  updateUndoRedo();
  markDirty();
  toast("项目已打开");
  els.loadJson.value = "";
};

async function materializeNodeAssetsForPortableSave(nodes) {
  for (const node of nodes || []) {
    if (node.imageAssetId) {
      node.image = await materializeReferenceImage({ assetId: node.imageAssetId, image: node.image });
      delete node.imageAssetId;
    }
    if (node.generatedAssetId) {
      node.generatedImage = await materializeReferenceImage({ assetId: node.generatedAssetId, image: node.generatedImage });
      delete node.generatedAssetId;
    }
    for (const image of node.images || []) {
      if (image.assetId) {
        image.image = await materializeReferenceImage(image);
        delete image.assetId;
      }
    }
    for (const task of node.batchTasks || []) {
      if (task.resultAssetId) {
        task.result = await materializeReferenceImage({ assetId: task.resultAssetId, image: task.result });
        delete task.resultAssetId;
      }
    }
    if (Array.isArray(node.items)) await materializeNodeAssetsForPortableSave(node.items);
    if (Array.isArray(node.subgraph?.nodes)) await materializeNodeAssetsForPortableSave(node.subgraph.nodes);
  }
}

async function saveJson() {
  saveCurrentPage();
  const data = JSON.parse(JSON.stringify({ pages: state.pages, activePageId: state.activePageId, globalLibrary }));
  if (desktop) {
    for (const page of data.pages || []) await materializeNodeAssetsForPortableSave(page.data?.nodes || []);
  }

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
      const resp = await apiFetch("/api/save-images", {
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
      const resp = await apiFetch("/api/save-json", {
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
        const resp = await apiFetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: item.fileName || "custom.png", data: stripDataUrl(item.data) }) });
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
        const resp = await apiFetch("/api/custom-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: item.fileName || "custom.png", data: stripDataUrl(item.data) }) });
        const result = await resp.json(); if (!result.success) throw new Error(result.error || "恢复失败"); item.fileName = result.fileName;
      }
      item.name = uniqueTemplateName("image", item.name, globalLibrary); delete item.data; globalLibrary.imageMaterials.push(item);
    } catch (e) { console.error("[加载] 全局自定义图片恢复失败", item.name, e); }
  }
  saveGlobalLibrary();
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

  // 统计总任务数（多任务图片展开）
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
      t.result = await fetchImageAsBase64(imageUrl);
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
  try {
    const resp = await apiFetch("/api/runtime-paths", { cache: "no-store" });
    const data = await resp.json();
    if (!resp.ok || !data.exportFolder) throw new Error(data.error || `HTTP ${resp.status}`);
    runtimeExportFolder = data.exportFolder;
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
    } catch (error) { console.error("[安全存储] API Key 读取失败", error); }
    await flushDesktopAssetMigration();
  }
  state.history = [cloneData()];
  state.future = [];
  updateUndoRedo();
  applySettings();
  render();
  await refreshBackgroundRemovalPluginStatus();
  await refreshImageUpscalePluginStatus();
  setUiLanguage(uiLanguage);
  const uiObserver = new MutationObserver(changes => {
    for (const change of changes) {
      if (change.type === "characterData") translateUiTree(change.target);
      for (const node of change.addedNodes) translateUiTree(node);
    }
  });
  uiObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
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
}

init().catch(e => { console.error("[初始化] 启动失败", e); toast("启动失败：" + e.message); });
