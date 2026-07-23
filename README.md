# CanvasFlow

> Visual AI Image Workflow

**English** | [简体中文](README_CN.md)

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
- **Quick model-image insertion** — Right-click an empty area to insert built-in male or female model images.
- **Automatic port cleanup** — Detect and release an occupied server port during startup to prevent launch failures.
- **Bilingual interface** — Switch between Simplified Chinese and English in Settings. The selected language is remembered automatically.

---

## Quick Start (Read This First)

### 1. Start the Server

Double-click `CanvasFlow-Windows-x64.exe`. The application starts the local server and opens your browser automatically.

> Node.js and other dependencies are not required.

After startup, visit **http://127.0.0.1:5173** in your browser.

### 2. Choose the Interface Language

1. Click the **☰ Settings** button in the upper-right corner.
2. Open the **Canvas** tab.
3. Choose **Simplified Chinese** or **English** under **Interface Language**.

The application follows your system language on first launch and remembers your selection afterward.

### 3. Configure the API Key (Required on First Use)

1. Click the **☰ Settings** button in the upper-right corner.
2. Open the **AI Image** section and enter your API Key.
3. Click **Verify** to confirm that the key is valid.
4. Click **Save**. The key will be loaded automatically the next time you start the application.

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

**Location:** Settings → Canvas → Custom Assets

| Feature | Description |
|------|------|
| Add an asset | Enter a name and choose an image. The image is saved by the local server. |
| Rename | Click the button beside the asset name to change its display name. |
| Delete | Remove the asset from the list and right-click menu, and delete its server-side file. |
| Insert from right-click | Right-click an empty area and select a saved asset to create an image node. |

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
3. Click **Generate** in the AI Image Node and wait for the result.
4. The generated image appears automatically in a new Image Node on the right.
5. Connect the generated Image Node to an Output Node, then export it.

**Batch generation:** Select multiple nodes and click **Batch Run** in the toolbar to generate AI images for them in sequence.

---

## Export

### Export Button

Select an Output Node and click **Export** in the top toolbar:

- Enable **Export as ZIP** (recommended for best compatibility) to download a ZIP archive.
- Disable it to write files directly to a local folder.

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
└── download/images/    # Local image assets, including model images
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
