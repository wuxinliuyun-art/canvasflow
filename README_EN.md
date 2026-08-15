# CanvasFlow

**A local visual workflow tool for AI image generation**

CanvasFlow lets you connect text, reference images, and AI Image nodes to generate, organize, and save images without writing code.

[Download for Windows](https://github.com/wuxinliuyun-art/canvasflow/releases/latest) · [简体中文](README.md)

## What's New in the 2.6 Series

- Native `.NET 10 WPF + WebView2` desktop app with no Node process, local server, or listening port
- Optional **Background Removal** plugin powered by BiRefNet General Lite, using DirectML first with automatic CPU fallback
- AI generation and background removal share one right-side task queue with progress
- Independent always-on-top screenshot tool for fixed-region AI workflows
- Faster startup, image preview, and refined minimap and node interactions
- Program files live under `app\`; user data remains in `data\`, `download\`, and `export\`

---

## How to Use

### 1. Download and Run

1. Open [GitHub Releases](https://github.com/wuxinliuyun-art/canvasflow/releases/latest).
2. Download and run `CanvasFlow-Setup.exe`.
3. Complete the per-user installation, then launch CanvasFlow from the desktop or Start menu.
4. Launch CanvasFlow to enter the main canvas directly.

> The installer is not commercially code-signed yet. Windows or antivirus software may request confirmation on first launch. Confirm that the file came from this project's official Release before allowing it.

### 2. Enter Your API Key

1. Click the gear button in the upper-right corner.
2. Open the **AI Image** settings.
3. Enter your API Key and save.

[Register for API access](https://apimart.ai/register?aff=W5d401)

> Your API Key is stored on this computer and is not included in automatic project backups.

The desktop app encrypts the API Key through Windows secure storage. If secure storage is unavailable, CanvasFlow warns you and keeps the key only for the current session.

### 3. Create Nodes

Right-click an empty area of the canvas to create Text, Image, AI Image, Angle Change, Group, and Screenshot Input nodes, or insert saved custom text and images.

You can also drag images from your computer onto the canvas or paste copied images.

### 4. Connect and Generate

```text
Text Node  ─┐
            ├─→ AI Image Node ─→ Generated Image Node
Image Node ─┘
```

1. Describe the desired image in a Text node.
2. Upload a reference image to an Image node.
3. Connect the text and image to an AI Image node.
4. Choose the model, resolution, quality, and aspect ratio in that node.
5. Click **Generate**.

Connect only text for text-to-image generation. Add an Image node when you want the AI to use a reference image. Each completed result is automatically created as a regular Image node.

---

## Core Features

### Visual Node Canvas

- Organize image workflows with nodes and connections
- Move, select, copy, paste, delete, undo, and redo
- Grid snapping, canvas zoom, minimap, and grouping
- Click the keyboard icon in the lower-left corner to view shortcuts

### AI Image Generation

- Text-to-image, text with references, and multiple reference images
- Independent model, resolution, quality, and aspect-ratio settings per AI Image node
- Multiple tasks can run separately with progress shown on each node
- Results become regular Image nodes that can be connected and processed further
- Network failures and HTTP `500 / 502 / 503 / 504` responses automatically try the next backup API endpoint; `401 / 403` stops immediately and asks you to check the API Key

### Task Queue

- AI generation and background removal jobs appear in the right-side task queue, with up to five jobs processed at once
- Each task shows a thumbnail, prompt summary, and status; queued jobs that have not been sent can be paused, resumed, or removed
- Running jobs continue to completion to avoid duplicate charges or lost results

### Optional Local Plugins

- Install or uninstall plugins yourself from **Settings → Plugins**; large models are not bundled with the base installer
- **Background Removal** uses BiRefNet General Lite to create transparent PNGs locally, preferring DirectML and falling back to CPU automatically
- Completed plugin tasks create result Image nodes connected to their source nodes
- Uninstalling the background-removal plugin never deletes generated images

### Screenshot Tool

- The Windows desktop app provides an independent always-on-top window for capturing a fixed screen region and sending it to AI generation
- Reuse custom text or take text and reference images from a Screenshot Input node on the canvas
- The screenshot is always the first reference image, and results are saved to `export\ai_generated\`
- Collapse the tool, preview results, double-click to enlarge, or right-click a generated result to copy the image

### Batch Generation

Multiple AI Image nodes can run at the same time. When using multiple references or grouped images, each result is displayed separately for easy selection and further processing.

### Custom Assets

- Save complete reusable text blocks and reference images
- Insert them quickly from the canvas context menu
- Share one local asset library across all projects
- Nodes created from assets are independent copies
- Editing or deleting an asset does not alter existing nodes
- Double-click custom images for a larger preview

On a fresh installation with an empty library, CanvasFlow provides two sample text assets: **Image to Line Art** and **Multi-view Reference**.

### Angle Change

- Connect one reference image and regenerate it from another viewpoint
- Horizontal, pitch, and roll adjustments from `-180°` to `180°`
- Zoom and optional reversal of left/right wording in the automatic prompt
- Prompts are relative to the source image's current viewpoint
- Results are created and connected as regular Image nodes

> This feature uses AI regeneration rather than true 3D rotation. Complex objects, hidden areas, and large angle changes may produce inconsistent results.

### Images and Interface

- Upload, drag, paste, replace, and clear images
- Double-click to preview and save images as custom assets
- Right-click an AI-generated Image node to copy the image itself and paste it into another application
- Simplified Chinese and English interfaces with remembered language choice
- Automatic project backup and GitHub Release update checks

---

## Saved Files and Common Questions

### Where are generated images saved?

Generated images appear on the canvas and are also saved automatically to:

```text
CanvasFlow folder\export\ai_generated\
```

For example, if CanvasFlow is installed at `D:\CanvasFlow\`, the executable is at `D:\CanvasFlow\app\CanvasFlow.exe`, and generated images are saved in `D:\CanvasFlow\export\ai_generated\`.

Use the canvas **Export** action when you want to collect and organize generated results.

### Where are projects saved?

Automatic project backups are stored in:

```text
CanvasFlow folder\download\自动备份\
```

The current project name is used as the filename. Later saves overwrite the same named file, so only the latest backup for each project name is retained. You can also use the top Save button to save a project JSON manually.

### Where are custom assets saved?

Custom text and images are stored in CanvasFlow's local data folder. They remain on this computer, are not uploaded to GitHub, and are not preloaded in the installer.

`data/custom-library.json` is generated locally after the application runs; it is not bundled with the download.

### The installer will not run

- Check whether Windows or antivirus software blocked it.
- Confirm that the file came from the official Release.

### Why is CanvasFlow still running after I close a window?

Before the main window closes, CanvasFlow saves the current state and automatic project backup. If saving fails, the app blocks exit and shows an error.

### AI image generation failed

Check the API Key, network connection, token balance, and whether the selected model supports the chosen resolution and aspect ratio. CanvasFlow automatically tries backup endpoints after network failures or HTTP `500 / 502 / 503 / 504`; `401 / 403` means the API Key is invalid or lacks permission and must be verified again.

### Why can't CanvasFlow open the image folder directly?

Some antivirus tools block applications from launching Windows File Explorer. Copy the full path shown in Settings and paste it into the File Explorer address bar.

### How do updates work?

CanvasFlow checks GitHub Releases. When a new version is available, download `CanvasFlow-Setup.exe`. Save the current project before updating; the installer never silently overwrites the running EXE.

---

## Download and Feedback

### Download the Latest Version

[Download CanvasFlow for Windows](https://github.com/wuxinliuyun-art/canvasflow/releases/latest)

Choose `CanvasFlow-Setup.exe`. The Source code downloads shown automatically by GitHub are for developers and are not needed by regular users.

### Report a Problem

Open a [GitHub Issue](https://github.com/wuxinliuyun-art/canvasflow/issues) and, when possible, include a screenshot, reproduction steps, CanvasFlow version, browser console error, and the name of any antivirus software in use.

### Data and Privacy

- CanvasFlow runs locally; projects and custom assets remain on this computer.
- API Keys are encrypted with Windows secure storage and excluded from projects and automatic backups.
- AI generation sends prompts and reference images to the API service configured by the user.
- Do not upload private, confidential, or unauthorized images.

---

## License

CanvasFlow is open source under the [MIT License](LICENSE).

You may use, modify, and distribute this project, including for commercial purposes, as long as the original copyright and license notice are retained. The software is provided “as is,” without warranty.

Third-party AI APIs, models, and generated content remain subject to their respective service terms.

---

[Latest Release](https://github.com/wuxinliuyun-art/canvasflow/releases/latest) · [Report an Issue](https://github.com/wuxinliuyun-art/canvasflow/issues) · [简体中文](README.md)

Developer setup and build instructions are available in [SOURCE_SETUP.md](SOURCE_SETUP.md) (Chinese).
