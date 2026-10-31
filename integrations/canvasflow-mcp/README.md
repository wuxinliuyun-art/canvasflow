# CanvasFlow MCP

CanvasFlow 的本机 stdio MCP 伴侣。它让 Codex 在获得用户明确确认后调用 CanvasFlow 绘图，并复用桌面版已经保存的模型路由、Windows 加密密钥与导出规则。MCP 配置中不会出现明文 API Key。

## 安装版用户

1. 安装并至少启动一次 CanvasFlow，在“设置 → AI 绘图”中保存 API Key。
2. 打开 Windows 开始菜单中的“CanvasFlow”文件夹，点击“安装 Codex MCP”。
3. 如果开始菜单入口不可用，也可以进入 CanvasFlow 安装目录的 `app\mcp`，双击 `install-mcp.cmd`。默认安装位置通常是 `D:\CanvasFlow` 或 `%LOCALAPPDATA%\Programs\CanvasFlow`。
4. 看到注册成功后，重启 Codex 或新建一个任务。

安装脚本按自身位置注册 `CanvasFlow.Mcp.exe`，因此 CanvasFlow 安装在中文路径、带空格路径或自定义磁盘时，不需要手工修改配置。

## 源码用户

在 `integrations\canvasflow-mcp` 中双击 `install-mcp.cmd`。脚本会检测源码项目并用本机 .NET SDK 注册。源码模式要求 `codex` 与 `dotnet` 均已加入 PATH。

## 怎么使用

安装后可以直接对 Codex 说：

- “检查 CanvasFlow 是否可以绘图。”
- “用 CanvasFlow 生成一张 16:9 的冰霜剑气特效素材，2K。”
- “查询刚才的 CanvasFlow 生成任务并保存结果。”
- “列出 CanvasFlow 最近生成的 Codex 特效素材。”

真实生成可能产生费用。Codex 调用生成工具时仍必须传入 `confirm_paid_generation=true`，不会因为安装 MCP 就自动提交付费任务。

## 工具与结果位置

- `canvasflow_status`：检查版本、密钥槽和导出目录，不产生费用。
- `canvasflow_start_generation`：提交真实图片生成，必须显式确认可能产生的费用。
- `canvasflow_get_generation`：查询进度，完成后可保存结果。
- `canvasflow_list_outputs`：列出近期生成结果。

结果默认保存到 `CanvasFlow安装目录\export\ai_generated\Codex特效素材`。首版不会改写现有画布项目，也不会自动把结果插入当前画布节点。

## 卸载与恢复

点击开始菜单“CanvasFlow”文件夹中的“卸载 Codex MCP”，或双击 `app\mcp\uninstall-mcp.cmd`。确认后只会移除 Codex 中名为 `canvasflow` 的 MCP 注册，不会删除 CanvasFlow、项目、API Key 或生成图片。

如果移动或重新安装了 CanvasFlow，重新运行新位置下的 `install-mcp.cmd`，选择替换旧注册即可。

## 手动诊断

```powershell
codex mcp get canvasflow
codex mcp list
```

MCP 使用标准输入输出通信。运行日志只写入标准错误，不输出 API Key。
