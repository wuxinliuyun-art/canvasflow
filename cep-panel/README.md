# CanvasFlow × Photoshop 互传

只做一件事：**画布和 Photoshop 之间互传图片**。面板不做任何 AI 调用。

- **画布 → PS**：图片节点右键 → 「在 PS 中编辑」，用 Photoshop 打开该图的本地文件。
- **PS → 画布**：PS 里安装配套 CEP 面板（窗口 → 扩展 → CanvasFlow 互传），点「合并当前文档并回传到画布」，当前文档所有图层合并成一张 PNG，自动作为**新图片节点**加入画布。原文档不受影响。

## 回传链路

| 运行方式 | 链路 |
| --- | --- |
| 桌面版 | 面板 → `DesktopBridge`（127.0.0.1 随机端口 + 随机令牌，启动时写 `%APPDATA%\CanvasFlowBridge\bridge.json`）→ 宿主向画布页面发 `desktop:paste {kind:"image"}` 消息 → 复用现有"粘贴建图片节点"链路（含素材外置存储） |
| 服务器模式 | 面板 → `node server.js /api/ps/return-image`（内存队列，上限 20）→ 页面每 4 秒轮询 `/api/ps/pending` 领回建节点 |

面板通过发现文件/默认端口探测画布（先手动填的地址 → bridge.json → `http://127.0.0.1:5173`），都失败时提示填画布地址。

## 在 PS 中编辑（画布 → PS）

- 设置 → 拓展 → 「Photoshop 互传」中**浏览选择 photoshop.exe**（仅桌面版；路径保存在本机数据目录 `data\ps-path.txt`，不自动探测注册表）。
- 图片节点右键 → 在 PS 中编辑：解析顺序为节点 `outputPath` → `download\images\{fileName}`，文件不存在时提示完整路径。
- 启动 PS 是右键菜单触发的 `UseShellExecute` 直启（无 PowerShell、无 Shell COM），与"打开所在文件夹"同级；360 可能提示一次，需在 360 环境复验。

## 安装

- **面板**：设置 → 拓展 → 「安装 / 更新 PS 面板」（写入 `%APPDATA%\Adobe\CEP\extensions\CanvasFlowPanel` + HKCU `CSXS.9~12` 的 `PlayerDebugMode=1`）；或手动跑 `cep-panel/install-for-testing.bat`。装完重启 Photoshop。
- **画布侧**：需要 v0.3.0 及以后的桌面版（含 `DesktopBridge` 与 PS 路径设置）；服务器模式直接用最新 `server.js`。

## 使用

1. 桌面版：启动 CanvasFlow → 设置里选一次 photoshop.exe → 装面板 → 重启 PS。
2. 画布里图片节点右键「在 PS 中编辑」→ PS 里改图 → 面板点「合并当前文档并回传到画布」→ 画布出现新图片节点。

## 已知边界

- 服务器模式回传依赖页面轮询（4 秒间隔），画布网页没开着时回传会滞留队列（内存队列，重启即清）。
- 回传始终是"合并后的扁平 PNG"；分层回传（逐图层）暂不做。
- `PlayerDebugMode=1` 为未签名面板必需；正式分发需 ZXPSignCmd 签名。CEP 已被 Adobe 弃用，PS 2021~2025 可用。
- 面板 UI 不走 docs/UI-SPEC.md（那是画布自身样式规范）。
- **版本对照**：面板右上角显示自身版本（`main.js` 的 `PANEL_VERSION`），画布设置里显示已安装版本（来自 manifest 的 `ExtensionBundleVersion`）。两者必须同时改：改版时先改 manifest，再把 `PANEL_VERSION` 同步成同一值。

## 调试

`.debug` 开在 8098 端口：PS 帮助 → 开发者工具，或浏览器开 `http://localhost:8098`。

## 文件

```
cep-panel/
├── CanvasFlowPanel/            ← CEP 扩展本体（整目录安装）
│   ├── CSXS/manifest.xml       ← v0.3.0，菜单名「CanvasFlow 互传」
│   ├── index.html / js/main.js ← 面板 UI（合并回传 + 画布发现）
│   ├── js/csinterface-lite.js  ← 精简版 CSInterface
│   ├── jsx/host.jsx            ← ExtendScript：CF_ping/CF_docInfo/CF_exportMerged（纯 ASCII、ES3）
│   └── .debug                  ← 远程调试端口
└── install-for-testing.bat     ← 手动安装脚本（ASCII，避免中文 BAT 编码坑）
```
