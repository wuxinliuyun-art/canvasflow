# CanvasFlow 项目备忘

## 已知问题 / 踩坑记录

### Windows EXE 缺少静态文件

- 现象：启动 EXE 后提示 `index.html`、`app.js`、`styles.css` 未包含在可执行文件中，页面只能依赖源码目录回退加载。
- 原因：使用 `pkg` 打包时没有读取 `package.json` 的 `pkg.assets`，或打包后未进行独立启动验证。
- 解决：从项目根目录执行 `pkg . --targets node18-win-x64`，确保 `pkg.assets` 包含上述三个文件。
- 避免：发布前用非 5173 的隔离端口启动 EXE，并确认三个静态文件均返回 HTTP 200；ZIP 内 EXE 条目大小必须与源 EXE 一致。

### 360 重复拦截“打开导出文件夹”

- 现象：程序调用资源管理器时，360反复提示进程创建；即使允许，资源管理器窗口也可能没有打开。
- 原因：未签名的单文件 EXE启动 `explorer.exe`、PowerShell 或 Shell COM 会触发行为防护；安全软件放行当前行为不等于重新执行已经失败的请求。
- 解决：设置中不提供“打开导出文件夹”按钮，改为始终显示完整路径，并提供“复制路径”和“设置导出文件夹”。
- 避免：不要再次加入直接启动资源管理器的入口；如将来恢复，必须做成可关闭选项，并在360环境中完成重复启动验证。

### GitHub Release API 检查更新被限流

- 现象：连续检查更新后 `/api/update/check` 返回 HTTP 502，服务端记录 GitHub HTTP 403。
- 原因：GitHub 未登录 REST API 有请求频率限制，同一公网出口下多台电脑会共用额度。
- 解决：成功结果缓存 10 分钟；API 不可用时通过公开的 `/releases/latest` 跳转获取最新版本，并按固定文件名下载 ZIP。
- 避免：不要把自动更新只绑定到 GitHub REST API；Release 的 Windows 资产固定命名为 `CanvasFlow-Windows-x64.zip`。

### 拖动节点图片时意外复制图片节点

- 现象：从图片节点中央预览图开始拖动时，浏览器把它识别为原生图片拖放，松开后又创建一个图片节点。
- 原因：仅设置 `draggable="false"` 和 `user-drag: none` 仍可能让图片元素参与原生拖动命中。
- 解决：画布节点内的图片统一设置 `pointer-events: none`，鼠标操作交给预览容器和节点；同时保留捕获阶段的原生拖动保护。
- 避免：新增节点预览图片时必须放在可处理双击的容器内，不要给图片元素单独绑定拖放行为。

## 架构决策

- EXE 由 `.gitignore` 排除，Windows 分发文件统一放入 `CanvasFlow-Windows-x64.zip`。
- GitHub Release 仅上传一个手工资产 `CanvasFlow-Windows-x64.zip`；GitHub 自动生成的 Source code 条目无法关闭。
- Windows EXE 自动更新前必须先成功写入项目备份；备份失败时不得关闭程序或启动覆盖流程。
- 新安装且图文素材库完全为空时初始化“图片转线稿”和“多视角参考”两条默认文字；已有素材库不得覆盖或追加。
- `download/`、`data/`、`export/` 属于本地运行数据，不纳入源码提交。
