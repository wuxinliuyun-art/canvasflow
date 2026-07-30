# CanvasFlow 项目备忘

## 已知问题 / 踩坑记录

### Windows EXE 缺少静态文件

- 现象：启动 EXE 后提示 `index.html`、`app.js`、`styles.css` 未包含在可执行文件中，页面只能依赖源码目录回退加载。
- 原因：使用 `pkg` 打包时没有读取 `package.json` 的 `pkg.assets`，或打包后未进行独立启动验证。
- 解决：从项目根目录执行 `pkg . --targets node18-win-x64`，确保 `pkg.assets` 包含上述三个文件。
- 避免：发布前用非 5173 的隔离端口启动 EXE，并确认三个静态文件均返回 HTTP 200；ZIP 内 EXE 条目大小必须与源 EXE 一致。

## 架构决策

- EXE 由 `.gitignore` 排除，Windows 分发文件统一放入 `CanvasFlow-Windows-x64.zip`。
- `download/`、`data/`、`export/` 属于本地运行数据，不纳入源码提交。
