# CanvasFlow macOS 桌面壳（Electron）

本目录是 mac 版 CanvasFlow.app 内 `Contents/Resources/app/` 壳源码的入库版本（自 2.7.3 起）。
与 Windows 版共享仓库根的前端与 `server.js`；本目录只包含 Electron 主进程与 Node 辅助模块。

## 文件职责

| 文件 | 职责 |
|---|---|
| `main.js` | 主进程：启动内嵌 server、IPC 接线、窗口/菜单/生命周期；热更新后重启 server 切换内容根 |
| `preload.js` | `contextBridge` 暴露 `window.canvasflowDesktop`（与 Windows WebView2 版同名同形） |
| `web-update.js` | 界面热更新（Node 版 `WebUpdateManager`），与 Windows `desktop-dotnet/WebUpdateManager.cs` 消费**同一份** Release 资产 `CanvasFlow-Web.zip`，校验与版本门控语义逐项对齐 |
| `extension-service.js` | 拓展服务（input/ → 脚本 → output/，对齐 Windows DesktopApi） |
| `asset-store.js` | 素材仓库（SHA-256 去重落盘 + index.json） |
| `ps-interop.js` | Photoshop 互传（CEP 面板安装/状态/卸载、launchInPs）；面板源优先取热更新内容根 |
| `icon.icns` | 应用图标（从 2.7.2 包提取，构建时替换 Electron 自带 electron.icns） |

截图窗口（openScreenshotWindow）mac 版仍不提供，前端按缺失自动隐藏。

## 构建

Windows 上执行（Electron 官方 darwin zip 含符号链接与 unix 权限位，脚本用 zip→zip 流式转写，不解压）：

```powershell
powershell -File build-mac.ps1 -Arch both -Mirror npmmirror   # x64 + arm64，产物在 release\mac\
powershell -File build-mac.ps1 -Arch arm64                    # 单架构，默认 GitHub 源
```

- 版本号默认取仓库 `package.json`；产物名 `CanvasFlow-<版本>-mac.zip` / `CanvasFlow-<版本>-arm64-mac.zip`。
- Electron 运行时缓存在 `release\mac\.electron-cache\`，重复构建不重新下载。
- 脚本必须保存为 **UTF-8 with BOM**（PowerShell 5.1 对无 BOM 的 UTF-8 按 ANSI 解析，中文注释会破坏语法）。
- 产物结构已与 2.7.2 原包逐条目对照验证；改动转写规则（改名映射、plist 字段、跳过清单）后必须重新对照。
- 脚本构建后自动自检（不满足即失败）：源包符号链接逐条保留（mode 与链接目标一致）；所有非 ASCII 条目名带 UTF-8 语言标志位——ZipArchive 条目名编码参数必须传 `$null`，显式传 `UTF8Encoding` 时 .NET 不置该标志，macOS 会解出乱码文件名。
- Mac 端解压整包用 Finder 双击、`unzip` 或 `ditto -x -k`；**不要用 Python `zipfile` 解压**——它不读 unix mode 位，会把 Electron 框架的符号链接写成"内容为链接目标"的纯文本文件，启动报 "Electron Framework is not a valid Mach-O file"。若已中招，按 zip 内符号链接条目（`ExternalAttributes` 高位 0xA000）逐个重建 `ln -s`。

## mac 真机手动验证清单（Windows 上无法自动化）

1. **首次启动**：解压 zip → 拖入 Applications → 右键打开绕过 Gatekeeper；启动后画布可用，About 面板版本为包版本。
2. **热更新入口**：设置 → 检查更新 → 当 Release 带有更高版本的 `CanvasFlow-Web.zip` 时出现"立即热更新"按钮。
3. **热更新应用**：点击后下载 → 校验 → 界面自动重载；确认 `~/<userData>/data/web-updates/versions/<版本>/` 生成、`active.json` 指针正确，重启应用界面仍为热更新版本。
4. **崩溃回退**：热更新应用后立即强退（未到启动确认）再启动，应回退旧界面（`previousVersion`）。
5. **宿主门控**：把热更新包装到比它新的宿主上（或手工构造），启动应回退随包界面且清空指针。
6. **CEP 面板源**：热更新后安装 PS 面板，安装的版本应来自热更新内容根而非随包目录。
7. **PS 互传/拓展**：launchInPs、拓展运行不受热更新影响（数据根与内容根分离）。
