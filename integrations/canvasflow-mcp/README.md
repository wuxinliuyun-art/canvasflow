# CanvasFlow MCP

CanvasFlow 的本机 stdio MCP 伴侣。它复用 CanvasFlow 桌面端的模型路由、Windows 加密密钥和导出规则，不在 MCP 配置中保存明文 Key。

## 工具

- `canvasflow_status`：检查版本、密钥槽和导出目录，不产生费用。
- `canvasflow_start_generation`：提交真实图片生成；必须传入 `confirm_paid_generation=true`。
- `canvasflow_get_generation`：查询进度，完成后保存至 `export/ai_generated/Codex特效素材`。
- `canvasflow_list_outputs`：列出近期生成结果。

首版不会改写现有画布项目，也不会自动把结果插入当前画布节点。生成和导出闭环确认稳定后，再增加独立的“Codex 特效素材”项目导入。

## 本地运行

```powershell
$env:CANVASFLOW_ROOT='H:\aitools\ai画布'
dotnet run --project 'H:\aitools\ai画布\integrations\canvasflow-mcp\CanvasFlow.Mcp.csproj'
```

MCP 使用标准输入输出通信。日志仅写入标准错误，不输出 API Key。
