# CanvasFlow 项目备忘

## 已知问题 / 踩坑记录

### SVG 图标在按钮内视觉不居中

- 现象：快捷键、上传等 SVG 图标看起来偏向按钮一侧，不同按钮重复出现类似问题。
- 原因：只依赖按钮的默认行高或局部 `grid` 布局，没有统一校验按钮中心、SVG `viewBox` 和图形视觉重心。
- 解决：图标按钮统一使用无内边距的居中容器；SVG 以按钮 50%/50% 几何中心定位，并保持明确的宽高和 `display: block`。
- 避免：新增或修改图标按钮时，必须在真实浏览器中测量按钮与 SVG 的中心坐标，并同时检查明暗主题和常用缩放比例。

### 旧版单文件 EXE 缺少静态文件

- 现象：启动 EXE 后提示 `index.html`、`app.js`、`styles.css` 未包含在可执行文件中，页面只能依赖源码目录回退加载。
- 原因：使用 `pkg` 打包时没有读取 `package.json` 的 `pkg.assets`，或打包后未进行独立启动验证。
- 解决：从项目根目录执行 `pkg . --targets node18-win-x64`，确保 `pkg.assets` 包含上述三个文件。
- 避免：Electron 发布前检查 `app.asar` 必须包含主画板与控制中心资源，并验证安装版独立启动。

### 360 重复拦截“打开导出文件夹”

- 现象：程序调用资源管理器时，360反复提示进程创建；即使允许，资源管理器窗口也可能没有打开。
- 原因：未签名的单文件 EXE启动 `explorer.exe`、PowerShell 或 Shell COM 会触发行为防护；安全软件放行当前行为不等于重新执行已经失败的请求。
- 解决：设置中不提供“打开导出文件夹”按钮，改为始终显示完整路径，并提供“复制路径”和“设置导出文件夹”。
- 避免：不要再次加入直接启动资源管理器的入口；如将来恢复，必须做成可关闭选项，并在360环境中完成重复启动验证。

### 未签名 EXE 被杀毒软件误报

- 现象：Windows 或第三方杀毒软件将分发版 EXE 标记为可疑程序或木马。
- 原因：未签名单文件 EXE 曾同时包含 PowerShell `EncodedCommand`、强制结束端口进程、复制并覆盖自身更新、启动资源管理器等高敏感行为。
- 解决：移除 PowerShell、资源管理器调用、强制结束进程和自动覆盖更新；端口冲突时安全换端口；更新只保留检查和手动下载。
- 避免：新增功能不得通过编码脚本、Shell COM、`taskkill`、复制自身或覆盖当前 EXE 实现；确需系统集成时先评估签名和杀毒软件影响。

### GitHub Release API 检查更新被限流

- 现象：连续检查更新后 `/api/update/check` 返回 HTTP 502，服务端记录 GitHub HTTP 403。
- 原因：GitHub 未登录 REST API 有请求频率限制，同一公网出口下多台电脑会共用额度。
- 解决：成功结果缓存 10 分钟；API 不可用时只能通过公开的 `/releases/latest` 判断版本，未取得 SHA-256 digest 时不得自动安装。
- 避免：Release 的唯一手工 Windows 资产固定命名为 `CanvasFlow-Setup.exe`；下载后同时校验文件大小和 GitHub API digest。

### 拖动节点图片时意外复制图片节点

- 现象：从图片节点中央预览图开始拖动时，浏览器把它识别为原生图片拖放，松开后又创建一个图片节点。
- 原因：仅设置 `draggable="false"` 和 `user-drag: none` 仍可能让图片元素参与原生拖动命中。
- 解决：画布节点内的图片统一设置 `pointer-events: none`，鼠标操作交给预览容器和节点；同时保留捕获阶段的原生拖动保护。
- 避免：新增节点预览图片时必须放在可处理双击的容器内，不要给图片元素单独绑定拖放行为。

## 架构决策

- .NET迁移采用`.NET 8 WPF + WebView2`，保留现有HTML/CSS/JS画布；第一阶段由WPF隐藏启动现有Node服务，后续再将接口逐项迁移到C#。
- .NET窗口不重复设置画布已有的顶部工具栏，也不常驻显示运行日志；启动状态使用临时覆盖层，详细日志写入`data/desktop.log`。
- .NET窗口保留Windows原生标题栏和最小化、最大化、关闭行为，通过DWM设置`#111827`标题栏与白色标题文字；系统不支持相关属性时允许自然降级。
- .NET窗口关闭时先立即隐藏，再异步停止自身启动的Node子进程；清理完成后直接结束当前.NET宿主，不等待WebView2异常缓慢的窗口销毁路径。不得在UI线程同步释放WebView2或等待子进程退出；退出流程另设3秒进程级兜底，防止空白窗口长期残留。
- .NET桌面版继续使用项目根目录的`data/`、`download/`、`export/`，迁移阶段保留Electron作为回退，不得擅自改变已有数据格式。

- EXE 由 `.gitignore` 排除，Windows 分发文件统一由 electron-builder 生成 `CanvasFlow-Setup.exe`。
- GitHub Release 仅上传一个手工资产 `CanvasFlow-Setup.exe`；GitHub 自动生成的 Source code 条目无法关闭。
- 更新只下载并校验安装程序；用户确认后保存项目、启动安装程序并退出，不静默复制或覆盖正在运行的 EXE。
- 端口冲突时自动尝试后续端口，不得结束占用端口的其他进程。
- 新安装且图文素材库完全为空时初始化“图片转线稿”和“多视角参考”两条默认文字；已有素材库不得覆盖或追加。
- 2.4.x 及更早版本把用户数据存储在 `%USERPROFILE%\Documents\CanvasFlow\`；2.5.0 首次启动时只复制这些旧数据到新位置，旧目录继续保留为备份。
- `config.json` 存储在数据目录中，保存应用级设置（如自动打开浏览器），不参与项目数据（localStorage）序列化。
- 节点连线支持平滑贝塞尔曲线模式（`smoothEdges` 设置）。开启后 SVG 路径使用 `C` 三次贝塞尔曲线替代 L 形折线。设置存储在页面数据中，默认开启。
- 2.5.0 起桌面发行版改用 Electron：控制中心和画板由同一主进程管理，不再运行 CMD，也不再通过 PowerShell、`taskkill` 或额外服务进程启动。
- Electron 正式版的数据根目录固定为 `path.dirname(process.execPath)`，源码模式使用项目根目录；`data/`、`download/`、`export/` 由 NSIS 更新和卸载流程临时移出后恢复，默认不删除用户数据。
 
- API Key 不再写入项目状态或浏览器持久化数据；桌面版使用 Electron `safeStorage` 加密到 `data/secrets.json`，安全存储不可用时只保留在当前进程内。
- AI 绘图请求通过以下 4 个代理地址依次尝试，第一个可用即停止，全不可用时报错：`api.apib.ai` → `api.aiuxu.com` → `api.aishuch.com` → `api.apimart.ai`。定义在 `server.js:95-100` 的 `API_BASE_URLS`。
