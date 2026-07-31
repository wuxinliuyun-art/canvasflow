# CanvasFlow

> Visual AI Image Workflow

**English** | [简体中文](#简体中文)

A visual node-based canvas for combining text and images through drag-and-drop connections, generating images with AI, and exporting results in batches.

![CanvasFlow interface screenshot](screenshot.png)

---

## Features

- **Visual node canvas** — Combine text and images by dragging and connecting nodes. No coding experience required.
- **One-click AI image generation** — Mix text prompts and reference images with support for the following models:

| Model | Cost | Speed |
|------|------|------|
| GPT Image 2 | 0.085 credits/image | ~60s |
| Gemini 3.1 Flash | 0.3 credits/image | ~45s |

- **Batch generation** — Import a group of reference images and process them one by one, with concurrency control and progress tracking.
- **Grouping and ungrouping** — Combine selected nodes into a group node, with expansion and thumbnail previews.
- **Multiple projects** — Create multiple project tabs with automatic local browser storage.
- **Undo / redo** — Full history with up to 20 undo and redo steps.
- **Lightbox preview** — Double-click an image to view it in a lightbox and navigate with the keyboard or mouse wheel.
- **Create from clipboard** — Copy an image or text, then press Ctrl+V on the canvas to create a node directly.
- **Drag images onto the canvas** — Drop local images or supported web images to create image nodes; dropping one image onto an existing image node replaces it.
- **Reusable custom assets** — Save complete text blocks and images locally, then insert them quickly from the canvas context menu.
- **Per-node AI progress** — Every AI Image node shows its own generation stage and progress while batch tasks continue independently.
- **Quick custom-asset insertion** — Right-click an empty area and choose a saved text or image asset from the compact submenu.
- **Automatic port cleanup** — Detect and release an occupied server port during startup to prevent launch failures.
- **Bilingual interface** — Switch between Simplified Chinese and English in Settings. The selected language is remembered automatically.
- **Windows-friendly startup** — The packaged EXE starts the local server and opens CanvasFlow in the default browser automatically.

---

## Quick Start (Read This First)

### Runtime Requirements

**Using the Windows Release ZIP:** Windows 10/11 only. No Node.js installation is required. Folder selection and automatic browser launch use the PowerShell 5.1 included with Windows.

**Running from source:** Install Node.js 18 or later. CanvasFlow uses only Node.js built-in modules, so there are no runtime npm dependencies and no `npm install` step is required.

```powershell
node server.js
```

Then open `http://127.0.0.1:5173/`. On Windows, you can also double-click `start.bat`.

**Building the Windows EXE:** Install or temporarily run `pkg` 5.8.1, then execute:

```powershell
npx --yes pkg@5.8.1 . --targets node18-win-x64 --output CanvasFlow-Windows-x64.exe
```

The source code does not bundle Node.js. The Release EXE does. Antivirus software may ask for permission when the EXE starts PowerShell to open the default browser or choose a folder.

### 1. Start the Server

Double-click `CanvasFlow-Windows-x64.exe`. The application starts the local server and opens your browser automatically.

> Node.js and other dependencies are not required.

After startup, visit **http://127.0.0.1:5173** in your browser.

### 2. Choose the Interface Language

1. Click the **gear-shaped Settings** button in the upper-right corner.
2. Choose **General** from the left navigation.
3. Choose **Simplified Chinese** or **English** under **Interface Language**.

The application follows your system language on first launch and remembers your selection afterward.

### 3. Configure the API Key (Required on First Use)

1. Click the **gear-shaped Settings** button in the upper-right corner.
2. Open the **AI Image** section and enter your API Key.
3. Click **Verify** to confirm that the key is valid.
4. Click **Save**. The key will be loaded automatically the next time you start the application.

Need a key? [Register through the API page](https://apimart.ai/register?aff=W5d401).

> The API Key is stored in the browser's localStorage and is not uploaded to any other server. Before sharing the application, click **Clear** to remove saved keys.

### 4. Start Using the Canvas

- **Create a text node:** Enter text in the field at the bottom, then press Enter or click **Create**.
- **Create an image node:** Drag in an image, paste one from the clipboard, or use the right-click menu.
- **Connect nodes:** Drag from a node's output port (the dot on the right) to another node's input port (the dot on the left).
- **Generate an AI image:** Right-click a node and choose **AI Image**, or select nodes and click **Batch Run** in the top toolbar.

---

## Basic Controls

| Action | How to Use It |
|------|------|
| Pan the canvas | Hold Space and drag, or drag with the middle mouse button |
| Zoom the canvas | Use the mouse wheel |
| Move a node | Drag the node |
| Box-select nodes | Drag over an empty area |
| Add to selection | Shift + click a node |
| Undo / redo | Ctrl+Z / Ctrl+Y |
| Copy / paste | Ctrl+C / Ctrl+V |
| Group / ungroup | Right-click selected nodes |
| Delete nodes | Press Delete or use the right-click menu |
| Arrange nodes | Right-click an empty area and choose **Arrange Nodes** |
| Enable / disable | Right-click a node and choose **Toggle Enabled/Disabled**. Disabled nodes are excluded from AI generation and export. |

Click the semi-transparent keyboard button in the lower-left corner to open the shortcut reference. Click outside it or press Esc to close it.

---

## Node Types

| Node | Description |
|------|------|
| **Text Node** | Enter a prompt and resize the node from its lower-right corner. |
| **Image Node** | Upload or paste an image to use as a reference. |
| **AI Image Node** | Connect text and image nodes, then generate an image with AI. |
| **Group Node** | Package multiple nodes together with expanded and thumbnail preview modes. |
| **Output Node** | Mark an export target by connecting it to the node you want to export. |

---

## Custom Image Nodes

In addition to basic image nodes, CanvasFlow includes a custom asset system for quickly reusing frequently needed images.

### Five Ways to Create Image Nodes

| Method | Instructions |
|------|------|
| **Drag a file** | Drag an image file directly onto the canvas. |
| **Paste with Ctrl+V** | Copy an image, then press Ctrl+V on the canvas. |
| **Upload button** | Click **Upload** inside an image node and choose a file. |
| **Right-click menu** | Right-click an empty area and choose **Add Image Node** to create an empty node for later upload. |
| **Custom asset** | Right-click an empty area and select a saved custom asset to insert it immediately. |

### Custom Asset System

Save frequently used reference images—such as model photos, logos, or watermark templates—as custom assets. They can then be inserted from the right-click menu without uploading them each time.

**Location:** Settings → Asset Library

| Feature | Description |
|------|------|
| Add an asset | Enter a name and choose an image. The image is saved by the local server. |
| Rename | Click the button beside the asset name to change its display name. |
| Delete | Remove the asset from the list and right-click menu, and delete its server-side file. |
| Insert from right-click | Right-click an empty area, hover over **Custom Nodes**, then choose a saved text or image asset. |

### Custom Text and Image Templates

CanvasFlow can save complete multi-line text blocks and images as reusable custom nodes.

- Manage custom text and images under **Settings → Asset Library**. The library is stored locally beside the app and shared by every project. Text rows show a shortened preview, while the editor always shows the complete content. Custom assets do not require color settings.
- Right-click an existing text or image node to save it as a custom template. AI image results are supported as well.
- Text or image nodes created from the library are regular independent copies. Editing or deleting an asset never changes nodes that were already created.
- Import selected assets from a project JSON file. Duplicate names receive a numbered suffix automatically. Project JSON files back up the shared library, including complete custom image data.

### Other Image Node Features

| Feature | Instructions |
|------|------|
| **Double-click preview** | Double-click an image node to open the full-screen lightbox. |
| **Lightbox annotation** | Paint color blocks in the lightbox, then confirm to create a new edited image node. |
| **Folder import** | Choose an image folder to create a group node containing all images in that folder. |
| **Batch import** | Select multiple image files to create nodes in a four-column grid. |
| **Use as a reference** | Connect an image node to an AI Image node as an upstream reference image. |

---

## AI Image Workflow

```text
Text Node + Image Node ──connect──▶ AI Image Node ──connect──▶ Output Node
```

1. Create a Text Node for the prompt and/or an Image Node for a reference image.
2. Connect them to an AI Image Node.
3. Set the model, resolution, quality, and aspect ratio in that AI Image Node, then click **Generate**.
4. The generated image appears automatically in a new Image Node on the right.
5. Connect the generated Image Node to an Output Node, then export it.

**Batch generation:** Select multiple nodes and click **Batch Run** in the toolbar to generate AI images for them in sequence.

During single or batch generation, every AI Image node shows its own colored border, current stage, and progress bar. The toolbar progress indicator remains available for the overall batch.

---

## Export

### Export Button

Select an Output Node and click **Export** in the top toolbar:

- Enable **Export as ZIP** (recommended for best compatibility) to download a ZIP archive.
- Disable it to write files directly to a local folder.
- By default, only final AI-generated images are exported under `生成结果/`. Regular text, reference images, and project JSON are excluded.
- Enable **Also export inputs** to add separate `参考图/` and `关键词.xlsx` outputs. Each prompt starts with the exact exported reference-image filenames.

### Export Folder Settings

⚠ Due to browser security restrictions, the application cannot write directly to the system drive (C:). Set the export path to D: or another non-system drive.

---

## API Architecture

```text
Browser app.js ──fetch──▶ localhost:5173 /api/* ──proxy──▶ api.apib.ai / api.aiuxu.com / api.aishuch.com / api.apimart.ai
                                                               ↑ automatic failover ↑
```

- All AI API requests are forwarded through the `server.js` backend proxy to avoid browser cross-origin and network issues.
- Multiple API domains are built in. If one is unavailable, the server automatically tries the next one.

---

## Project Structure

```text
├── app.js              # Main frontend logic (ES6+)
├── index.html          # Page structure
├── styles.css          # Styles
├── server.js           # Node.js HTTP server
├── CanvasFlow-Windows-x64.exe # Standalone executable compiled with pkg (Node.js not required)
├── package.json        # pkg build configuration
├── start.bat           # Development startup script
└── download/images/    # Runtime-only custom image assets (created locally, ignored by Git)
```

---

## Build and Distribution

```bash
npm install -g pkg
pkg server.js --targets node18-win-x64 --output CanvasFlow-Windows-x64.exe
```

After compilation, `CanvasFlow-Windows-x64.exe` runs independently and can be distributed without Node.js or other dependencies.

---

## License

MIT

---

<a id="简体中文"></a>

# CanvasFlow（简体中文）

> Visual AI Image Workflow

[English](#canvasflow) | **简体中文**

一个可视化的节点式画布工具，通过拖拽、连线的方式组合文字和图片，一键调用 AI 生成图片，支持批量导出。

![CanvasFlow 界面截图](screenshot.png)

---

## 特色功能

- **可视化节点画布** — 拖拽连线组合文字和图片，零代码操作，普通人也能上手
- **一键 AI 生图** — 文字+参考图混合输入，支持以下模型：

| 模型 | 消耗 | 速度 |
|------|------|------|
| GPT Image 2 | 0.085 积分/张 | ~60s |
| Gemini 3.1 Flash | 0.3 积分/张 | ~45s |

- **批量生成** — 导入一组参考图后自动逐张生成，支持并发控制和进度显示
- **编组与解组** — 选中多个节点一键打包成编组节点，支持展开和缩略图预览
- **多页面管理** — 支持创建多个项目标签页，数据自动保存在浏览器本地
- **撤回 / 重做** — 完整的历史记录，支持 20 步撤回和重做
- **灯箱预览** — 双击图片以灯箱模式查看，支持键盘/滚轮翻页
- **剪贴板直创建** — 复制图片或文字后，在画布上 Ctrl+V 直接创建节点
- **自定义素材快捷插入** — 右键画布空白处，从紧凑的三级菜单中选择已保存的文字或图片素材
- **拖拽图片创建节点** — 可将本地图片或支持的网页图片拖入画布；拖到已有图片节点上可直接替换
- **AI 节点独立进度** — 单张与批量任务都在对应 AI 绘图节点上显示阶段和进度
- **Windows 便捷启动** — 发布版 EXE启动本地服务后自动使用默认浏览器打开 CanvasFlow
- **端口自动清理** — 启动时自动检测并释放被占用的端口，避免闪退
- **中英双语界面** — 可在设置中切换简体中文和 English，并自动记住选择

---

## 快速开始（第一次使用必读）

### 运行环境

**使用 Windows Release ZIP：** 仅支持 Windows 10/11，不需要安装 Node.js。选择文件夹和自动打开默认浏览器依赖 Windows自带的 PowerShell 5.1。

**从源码运行：** 需要 Node.js 18 或更高版本。CanvasFlow 运行时只使用 Node.js内置模块，没有 npm运行依赖，不需要执行 `npm install`。

```powershell
node server.js
```

然后访问 `http://127.0.0.1:5173/`。Windows也可以双击 `start.bat`。

**构建 Windows EXE：** 使用 `pkg` 5.8.1，执行：

```powershell
npx --yes pkg@5.8.1 . --targets node18-win-x64 --output CanvasFlow-Windows-x64.exe
```

源码不包含 Node.js环境，Release EXE已包含。EXE调用 PowerShell自动打开浏览器或选择文件夹时，杀毒软件可能首次询问授权。

### 1. 启动服务

直接双击 `CanvasFlow-Windows-x64.exe`，程序会自动启动并打开浏览器。

> 无需安装 Node.js，无需安装任何依赖。

启动后在浏览器访问：**http://127.0.0.1:5173**

### 2. 选择界面语言

1. 点击界面右上角的 **齿轮形设置** 按钮
2. 在左侧导航中选择 **常规**
3. 在 **界面语言** 中选择 **简体中文** 或 **English**

首次启动会跟随系统语言，之后自动记住你的选择。

### 3. 配置 API Key（首次使用必做）

1. 点击界面右上角的 **齿轮形设置** 按钮
2. 在"AI绘图"区域，输入你的 API Key
3. 点击 **验证** 确认 Key 有效
4. 点击 **保存** 保存 Key（下次启动自动读取）

还没有 Key？可前往 [API 注册页面](https://apimart.ai/register?aff=W5d401) 获取。

> API Key 保存在浏览器 localStorage 中，不会上传到任何服务器。分享给他人使用前记得点击 **清除**。

### 4. 开始使用

- **创建文字节点**：底部输入框输入文字，回车或点"创建"
- **创建图片节点**：拖入图片、粘贴剪贴板图片，或通过右键菜单
- **连接节点**：从一个节点的输出端口（右侧圆点）拖到另一个节点的输入端口（左侧圆点）
- **AI 生成图片**：右键节点 → AI绘图，或选中后点顶部"批量执行"

---

## 基本操作

| 操作 | 方式 |
|------|------|
| 移动画布 | 按住空格键 + 拖拽，或鼠标中键拖拽 |
| 缩放画布 | 鼠标滚轮 |
| 移动节点 | 直接拖拽 |
| 框选多个节点 | 空白处拖拽 |
| 多选追加 | Shift + 点击节点 |
| 撤回 / 重做 | Ctrl+Z / Ctrl+Y |
| 复制 / 粘贴 | Ctrl+C / Ctrl+V |
| 编组 / 取消编组 | 右键选中的节点 |
| 删除节点 | Delete 键或右键菜单 |
| 节点对齐整理 | 右键空白处 → "节点对齐" |
| 切换启用/停用 | 右键节点 → 切换启用/停用（停用的节点不参与 AI 生成和导出） |

点击屏幕左下角的半透明键盘按钮可查看快捷键；点击空白区域或按 Esc 即可关闭。

---

## 节点类型

| 节点 | 说明 |
|------|------|
| **文字节点** | 输入提示词，可拖拽右下角缩放 |
| **图片节点** | 上传或粘贴图片作为参考图 |
| **AI绘图节点** | 连接文字/图片节点后，一键调用 AI 生成图片 |
| **编组节点** | 将多个节点打包成一个，支持展开/缩略图预览 |
| **输出节点** | 标记导出目标，连接到需要导出的节点 |

---

## 自定义图片节点

除了基本的图片节点，项目还支持自定义素材系统，方便快速复用常用图片：

### 创建图片节点的 5 种方式

| 方式 | 操作 |
|------|------|
| **拖入文件** | 将图片文件直接拖入画布 |
| **Ctrl+V 粘贴** | 复制图片后，在画布上 Ctrl+V 直接创建节点 |
| **上传按钮** | 点击图片节点内的"上传"按钮选择文件 |
| **右键菜单** | 右键空白处 → "添加图片节点"（空白节点，后续上传） |
| **自定义素材** | 右键空白处 → 选择已添加的自定义素材，一键插入（见下文） |

### 自定义素材系统

可以把常用的参考图（如模特图、Logo、水印模板等）预设为"自定义素材"，之后在右键菜单中一键插入，无需每次手动上传。

**配置路径**：设置面板 → 素材库

| 功能 | 说明 |
|------|------|
| 添加素材 | 输入名称 + 选择图片，图片会保存到服务端 |
| 重命名 | 点击素材名称旁的按钮修改显示名 |
| 删除 | 从列表和右键菜单中移除（同时删除服务端文件） |
| 右键插入 | 右键画布空白处，直接选择已有素材创建节点 |

### 自定义图文模板

CanvasFlow 支持把完整的多行文字和图片保存为可复用的自定义节点。

- 在 **设置 → 素材库** 中管理自定义文字和图片。素材库自动保存在程序所在目录并由所有项目共用，文字列表会显示截断的内容摘要，编辑时显示完整内容；图文素材都不需要设置颜色。
- 可在现有文字、图片或已有结果的 AI 图片节点上右键，直接保存为自定义模板。
- 通过素材创建的文字或图片是普通的独立节点；以后编辑或删除素材不会改变已经创建的节点。
- 支持从项目 JSON 中勾选导入；同名素材会自动添加数字后缀。项目 JSON 会备份全局素材库，换电脑后也能恢复。

### 图片节点的其他能力

| 功能 | 操作 |
|------|------|
| **双击预览** | 双击图片节点打开灯箱全屏预览 |
| **灯箱标注** | 在灯箱中使用画笔绘制色块，确认后自动生成"局部修改"图片节点 |
| **文件夹导入** | 选择图片文件夹后，自动创建编组节点，将文件夹内所有图片打包 |
| **批量导入** | 多选图片文件，以网格布局批量创建图片节点（每行4个） |
| **作为参考图** | 将图片节点连接到 AI绘图节点，作为 AI 生成的上游参考图 |

---

## AI 绘图工作流

```
文字节点 + 图片节点 ──连线──▶ AI绘图节点 ──连线──▶ 输出节点
```

1. 创建文字节点（写提示词）和/或图片节点（参考图）
2. 将它们连接到 AI绘图节点
3. 在该 AI绘图节点中设置模型、分辨率、画质和比例，然后点击 **生成**
4. 单张生成结果保留在 AI 绘图节点中，可直接连接到其他 AI 节点或输出节点
5. 批量生成仍会为每张结果创建独立图片节点，方便分别处理

**批量生成**：选中多个节点，点击工具栏的 **批量执行**，会依次为每个节点生成 AI 图片。

单张或批量生成时，每个 AI 绘图节点都会显示独立的彩色边框、当前阶段和进度条；顶部进度仍用于查看整体批次。

---

## 导出

### 按钮导出

选中输出节点，点击顶部 **导出** 按钮：
- 勾选 **ZIP 压缩包导出**（推荐，兼容性最好）：导出为 zip 文件
- 不勾选：直接写入本地文件夹
- 默认只导出 AI 生成结果，并统一放入 `生成结果/`；普通文字、参考图和项目 JSON 不会进入成果导出
- 勾选 **同时导出输入素材** 后，额外生成独立的 `参考图/` 和 `关键词.xlsx`；每条关键词开头使用与参考图文件完全一致的文件名

### 导出文件夹设置

点击 **设置导出文件夹** 选择本地目录，程序会保存并显示完整路径。可以点击 **复制路径**，再粘贴到资源管理器地址栏；也可以直接手动输入完整路径。

---

## API 架构说明

```
浏览器 app.js ──fetch──▶ localhost:5173 /api/* ──代理──▶ api.apib.ai / api.aiuxu.com / api.aishuch.com / api.apimart.ai
                                                              ↑ 自动故障转移 ↑
```

- 所有 AI API 请求通过 `server.js` 后端代理转发，避免浏览器跨域和网络问题
- 内置多域名故障转移，一个不可达自动切换下一个

---

## 项目结构

```
├── app.js              # 前端主逻辑（ES6+）
├── index.html          # 页面骨架
├── styles.css          # 样式
├── server.js           # Node.js HTTP 服务器
├── CanvasFlow-Windows-x64.exe # pkg 编译的独立可执行文件（免装 Node.js）
├── package.json        # pkg 打包配置
├── start.bat           # 开发启动脚本
└── download/images/    # 运行时自定义图片（本地创建，Git忽略）
```

---

## 打包分发

```bash
npm install -g pkg
pkg server.js --targets node18-win-x64 --output CanvasFlow-Windows-x64.exe
```

编译后 `CanvasFlow-Windows-x64.exe` 可独立运行，发给他人无需 Node.js 或其他依赖。

---

## License

MIT
