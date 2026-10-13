# CanvasFlow 项目备忘

## UI 规范

- 所有界面样式改动必须遵守 [docs/UI-SPEC.md](docs/UI-SPEC.md)：颜色只引用 `:root` 语义变量（禁裸色值）、4px 间距网格、最小字号 12px、z-index 六档刻度、动效只用 opacity/transform、图标按钮必带 aria-label。新增令牌必须浅色 `:root` 与深色 `.theme-dark` 成对添加。

## 浏览器测试规范

- 用浏览器验证界面时,**先关闭所有旧标签页,只新开一个标签**;测试全程只使用这一个标签,测试结束保留或关闭均可,但下次测试仍从新标签开始。
- 原因:旧标签页里跑着旧版前端脚本(HTML/CSS/JS 更新后不会自动到达已打开的页面),在旧标签上验证会得出"改了没生效/时好时坏"的错误结论;多个标签并存还会互相覆盖 localStorage 里的项目设置。
- 服务器侧配套:`server.js` 对前端文件按 mtime 实时读盘(不做启动快照),`index.html` 响应头 `Cache-Control: no-store`;桌面版 WebView2 对 index.html 强制不缓存。三者任一被改回旧模式,本规范的前提即失效。

## 已知问题 / 踩坑记录

### 中文 BAT 使用 UTF-8 时被 CMD 错误解析

- 现象：批处理中的 `@echo off` 失效，括号内命令被逐行显示，中文提示截断并被当成命令执行。
- 原因：Windows CMD 对 UTF-8 BOM、无 BOM UTF-8 和 LF 换行的解析不稳定；即使脚本内执行 `chcp 65001`，首行和预解析的括号代码块仍可能损坏。
- 解决：中文 BAT 使用无 BOM 的 GBK（代码页 936）与 CRLF，首行保持纯 ASCII `@echo off`，第二行执行 `chcp 936 >nul`。
- 避免：发布前必须从 `cmd.exe` 实际调用 BAT，验证中文路径、括号分支、命令回显和退出码；不要只在编辑器中检查文本。

### SVG 图标在按钮内视觉不居中

- 现象：快捷键、上传等 SVG 图标看起来偏向按钮一侧，不同按钮重复出现类似问题。
- 原因：只依赖按钮的默认行高或局部 `grid` 布局，没有统一校验按钮中心、SVG `viewBox` 和图形视觉重心。
- 解决：图标按钮统一使用无内边距的居中容器；SVG 以按钮 50%/50% 几何中心定位，并保持明确的宽高和 `display: block`。
- 避免：新增或修改图标按钮时，必须在真实浏览器中测量按钮与 SVG 的中心坐标，并同时检查明暗主题和常用缩放比例。

### 桌面发布缺少静态界面文件

- 现象：启动 EXE 后提示 `index.html`、`app.js`、`styles.css` 未包含在可执行文件中，页面只能依赖源码目录回退加载。
- 原因：只复制了桌面EXE，没有把`index.html`、`app.js`和`styles.css`放入发布目录。
- 解决：由`CanvasFlow.Desktop.csproj`将界面资源复制到publish目录，再由Inno Setup整体打包。
- 避免：发布前检查 publish 目录中 `index.html`、`app.js`、`styles.css` 存在且与源码一致（比对字节数），即可确认安装包内容完整，不需要再安装验证——安装包内容完全来自 publish 目录，目录对了安装包就对。
- 不要用"静默安装到隔离目录再卸载"来验证安装包（2026-10 踩坑）：安装包与用户已装的正式版共用同一 AppId，装/卸循环会覆盖并删除正式版的注册表卸载条目；`/SILENT` 在 `DisableDirPage=no` 时还会弹目录选择页；安装后自启动的实例会顶掉用户正开着的正式版。若确需安装验证，装完不要卸载，且不得使用 D:\CanvasFlow（见下条）。
- D:\CanvasFlow 是用户保留的正式安装版，专用于更新测试（2026-10 用户明确要求）：发布、验证、调试一律不得写入、覆盖安装或修改该目录及其 `data` 数据；更新测试由用户自己在该版本上发起，会话不得代做"帮用户升级正式版"的操作。

### 发布包中的 export 目录必须为空

- 规则：所有发布形式均须保留空的 `export` 目录，但不得打包该目录中已有的任何图片或其他导出文件。
- 避免：生成完整安装包、便携包、界面热更新包或其他发布产物前，必须排除 `export` 目录内容，并检查最终产物中该目录存在且为空。

### 360 重复拦截“打开导出文件夹”

- 现象：程序调用资源管理器时，360反复提示进程创建；即使允许，资源管理器窗口也可能没有打开。
- 原因：未签名的单文件 EXE启动 `explorer.exe`、PowerShell 或 Shell COM 会触发行为防护；安全软件放行当前行为不等于重新执行已经失败的请求。
- 解决：设置中不提供常驻“打开导出文件夹”按钮，始终显示完整路径；仅在有明确 `outputPath` 的生成图片右键菜单中提供“打开所在文件夹”，由 .NET `UseShellExecute` 直接打开目录，不使用 PowerShell，失败时自动复制完整文件路径。
- 避免：不得恢复启动 PowerShell、Shell COM 或反复探测资源管理器的实现；右键入口属于用户主动触发的可选操作，仍需保留复制路径兜底，并在360环境中完成重复启动验证。

### 未签名 EXE 被杀毒软件误报

- 现象：Windows 或第三方杀毒软件将分发版 EXE 标记为可疑程序或木马。
- 原因：未签名单文件 EXE 曾同时包含 PowerShell `EncodedCommand`、强制结束端口进程、复制并覆盖自身更新、启动资源管理器等高敏感行为。
- 解决：移除 PowerShell、资源管理器调用、强制结束进程和自动覆盖 EXE；端口冲突时安全换端口；界面更新只切换经过双重校验的静态资源版本。
- 避免：新增功能不得通过编码脚本、Shell COM、`taskkill`、复制自身或覆盖当前 EXE 实现；确需系统集成时先评估签名和杀毒软件影响。

### GitHub Release API 检查更新被限流

- 现象：连续检查更新后 `/api/update/check` 返回 HTTP 502，服务端记录 GitHub HTTP 403。
- 原因：GitHub 未登录 REST API 有请求频率限制，同一公网出口下多台电脑会共用额度。
- 解决：成功结果缓存 10 分钟；API 不可用时只能通过公开的 `/releases/latest` 判断版本，未取得 SHA-256 digest 时不得自动安装。
- 避免：Release 的完整安装资产固定命名为 `CanvasFlow-Setup.exe`，可选界面热更新资产固定命名为 `CanvasFlow-Web.zip`；热更新必须同时校验 GitHub API digest 与清单内逐文件 SHA-256。

### 拖动节点图片时意外复制图片节点

- 现象：从图片节点中央预览图开始拖动时，浏览器把它识别为原生图片拖放，松开后又创建一个图片节点。
- 原因：仅设置 `draggable="false"` 和 `user-drag: none` 仍可能让图片元素参与原生拖动命中。
- 解决：画布节点内的图片统一设置 `pointer-events: none`，鼠标操作交给预览容器和节点；同时保留捕获阶段的原生拖动保护。
- 避免：新增节点预览图片时必须放在可处理双击的容器内，不要给图片元素单独绑定拖放行为。

### 截图窗口预览导致桌面程序闪退

- 现象：点击“打开截图窗口”后界面短暂卡住，随后整个 CanvasFlow 退出；Windows 事件记录为未处理的 `.NET` 异常。
- 原因：WPF `BitmapImage` 使用文件流加载时同时设置了 `BitmapCreateOptions.IgnoreImageCache`，内部缓存尝试使用空 URI 作为键并抛出 `ArgumentNullException`。
- 解决：固定名称截图继续使用文件流与 `BitmapCacheOption.OnLoad` 强制读取新内容，但不得同时设置 `IgnoreImageCache`；预览加载必须通过异常隔离方法更新。
- 避免：所有 WPF 图片预览统一使用“文件流 + OnLoad + Freeze”方式；预览失败只能清空当前图片并提示，不得将异常传播到桌面消息循环。

### 扇入按支线拆任务（图片线与文字/变量线）

- 规则:`collectUpstreamForAI` 返回分支列表,每个分支是 `{ texts, images }`——上游任一节点同时接多条线(扇入)时按线拆成多个任务:图片线携带该支线路径上的图片(含汇聚节点自身图片,按画布 x 排序),文字/变量线携带该线文字;每个任务 = 一条线的内容 + 汇聚节点自身图片。两条并列文字线 + 一张参考图 = 两个任务(各自带该图),并列线之间不交叉组合;AI/角度节点截断(取其生成图);组节点维持"每组图一任务"批量语义,组内文字进 `groupTexts` 共享到全部任务;多支线任务结果各自生成图片节点(image-node 模式)。分支文字仅在单条文字线时等于"全部文字";跨线文字不再互串。
- 文字/变量节点串联组合(2026-10):文字/变量节点不是截断点,`visit` 沿所在支线继续向上游收集,线内文字按路径顺序合并(最上游在前、自身文字排最下游),故 文字A→文字B→AI 的提示词为"A，B";文字→变量→文字→AI 三段同线全合并。唯一的语义边界是 AI/角度节点(截断取其生成图):文字A→AI1→文字B→AI2 时,AI2 只读文字B,AI1 成图降级为参考图。空文字/空变量节点不产生分支也不阻断透传;支线经过文字/变量节点时,该线上的图片照常随分支携带。截图线(`directScreenshotNodeInputs`)本就不截断文字,行为不变。
- 避免:`keepCombinedInputs` 的合并打平必须作用在顶层汇总处(文字并集 + 图片按节点去重),不能只写在递归中间节点层,否则 AI 节点多条直连入线仍会被拆开;单支线画布的行为必须与拆分逻辑上线前完全一致(分支数恒为 1);分支形状变化时所有消费方(`enqueueAiNode` 传分支文字、tool-node 收集 `.images`、"执行全部"预估 `branch.images.length`)必须同步适配,`result.texts` 始终是全部分支文字并集供显示与输入存在性判断;AI 节点多条直连入线仍先经 `splitMultiInputAiNode` 拆节点,本规则管辖经汇聚节点(如图片节点)的扇入;串联合并必须写在 `visit` 的分支层(每条线独立合并),不得只在顶层 union 处打平,否则多支线任务的文字会跨线互串。

### 文字节点拆分与重合合并（2026-10 已实现）

- 规则：多行文字节点（≥2 个非空行）右键菜单出现「按换行拆分为文字节点」——每个非空行一个节点，首行留在原节点，其余在右侧一列落位（`splitTextNodeByLines`，防重叠避让生效）。拖动一个**有内容的文字节点**叠到另一个文字节点上（重合 ≥ 小节点面积 20%，与图片叠放同阈值）触发**文案合并**（`mergeTextNodeTexts`）：两段文案按画布位置从左到右（同列从上到下）以换行拼接并入**被叠节点**，删除拖动节点；拖动节点的连线原样转到被叠节点并清理自环，变量词选择按变量名合并（冲突保留被叠节点的选择）。两个重合行为各自独立开关：`editOnOverlap`（图片重叠打开编辑，原有）与 `textMergeOnOverlap`（文字重叠合并文案，默认开），都在设置 → 常规 → 界面与画布。
- 避免：`updateCompositeHover` 的模式判定按**拖动源**类型分流（文字且有内容 → 合并模式；有图片引用 → 编辑模式），两开关互不牵制——`editOnOverlap` 关闭时文字合并仍可用；设置 → 保存 页签现含「生成图片保存」（projectExportFolderToggle，2026-10 从常规页挪入）与「导出方式」「项目文件夹」，`projectExportFolderToggle` 按 id 绑定、挪动 DOM 不影响接线，勿在常规页重复添加同名卡片。

### 浏览器生图节点（browser-image + Chrome 扩展，2026-10 已实现）

- 规则：画布 `browser-image` 节点（站点下拉 Gemini/ChatGPT/自定义站点+网址输入、提示词框留空取上游扇入文字、生成按钮）把 `{site, prompt, images[≤4 dataURL], nodeId}` POST 到 `/api/browser-task`，前端每 2.5s 轮询 `/api/browser-task/status/:id`（超时 360s）；完成后首图进节点预览、多余图各自生成图片节点（同 AI 多图语义），下游消费 `generatedImage` 截断（并入 ai-image/angle-image 边界）。任务队列是**内存态、双实现必须同步**：server.js 与 DesktopApi.cs 各一套（push / next?origin= / result / status/:id，任务与结果 10 分钟过期；`site` 为内置 id 时按 `BROWSER_SITE_ORIGINS` 映射 origin 匹配领取方，自定义站点按规整化 origin 精确匹配）。扩展在 `browser-extension/`（MV3）：content.js 轮询领任务并在站点页模拟人工操作（选择器顺序 = 手动校准记录 > SITE_PRESETS 内置 > 通用兜底；填词用 execCommand insertText、参考图先合成 paste 事件再 fallback input[type=file]、完成后轮询"新出现的大图"连续 2 轮稳定即抓取）；background.js 中继全部本地服务访问（content 脚本受页面 CORS 限制，不能直连 127.0.0.1）；popup 提供端口设置、连接测试和"校准此页面"（两步点选输入框/发送按钮，选择器按 origin 存 chrome.storage.local，自定义站点经 `ensureContentScript` 动态注册内容脚本）。
- 避免：所有对本地服务的 fetch 必须经 background 中继，不得在 content.js 直连（跨源 403）；`canvas-runtime.js` 的 desktopApiPaths 需包含 browser-task 各路径（status 是前缀匹配）；节点等待可取消（`_browserRequestId` 序号丢弃迟到结果，同 chat 模式）；存档加载 walkNodes 必须重置 `generating`；生成按钮在 generating 期间不渲染、提示词/网址输入只 markDirty 不 render（防焦点丢失）；扩展完成判定只认"发送前快照之外的新出现大图"，不要试图解析站点私有 DOM 结构（改版只影响选择器，校准即可恢复）。
- 服务自动发现（2026-10，面向"用户不懂端口"）：扩展 background.js 自动扫描 `127.0.0.1` 的 5173..5192，以 `/api/browser-task/status/ping` 回 `{"status":"expired"}` 为 CanvasFlow 指纹（旧版/无关服务回 404 会被跳过）；扫描范围上限必须与 server.js `tryListen` 的端口顺延次数（20）保持一致，改任一侧要同步另一侧。手动指定端口优先但失效后自动退回扫描；多实例并存时 browserPoll 逐端口问询、任务在哪个实例就在哪个端口领取，taskId→端口 记录在 chrome.storage.local（browserResult 回传同一实例，15 分钟过期）。popup 不再展示"端口一致"类术语，端口输入降级为高级覆盖项（留空保存=纯自动）。
- server.js 是长驻进程：路由在启动时载入内存，前端文件却按 mtime 实时读盘——**改了 server.js 不重启进程时，页面看起来是新的、新 API 却 404**（2026-10 实踩：两个旧进程常驻 5173/5174，界面 ?v= 全对、扩展 ping 全 404）。排查"扩展未连接"先 curl ping 端点比对响应形状，再怀疑端口；确认常驻进程的服务目录可用"只在工作区存在的文件能否被 URL 访问"来判定（如 /browser-extension/manifest.json）。
- 注入幂等（2026-10 实踩）：manifest 自动注入与"校准此页面"的手动 executeScript 会叠加到同一页面，content.js 顶层 const 二次声明直接 SyntaxError（"POLL_INTERVAL_MS has already been declared"），扩展错误页反复报红。content.js 整体包在 `if (!window.__canvasflowBridgeActive) {}` 块里（同扩展的内容脚本共享隔离世界的 window，二次注入直接跳过）；`ensureContentScript` 注册前先检查 URL 是否已被 manifest matches 覆盖，Service Worker 启动时清理"全部 matches 都被 manifest 覆盖"的历史冗余注册（自定义站点的注册保留）。

### AI 对话节点（chat，2026-10 已实现）

- 规则：画布 `chat` 节点形态 = 标题行 + 模型条 + **整块可输入文本框**（无气泡/输入行/发送按钮，节点可拖拽缩放，最小 280×220、新建 380×380）。框内分两区：**关键词区**（用户指令，长期保留可编辑）+ **结果区**（`CHAT_RESULT_DIVIDER` 长横线 `────────` 之后，每次生成整体替换为最新回复，**不逐步累加**）。发送内容 = `chatComposeSendText`：关键词区 + 结果区中用户新写的话（与最近一条 assistant 回复相同的结果本体不重发；结果区被改写过则整段并入提问；无分隔线时整框照发——老画布兼容）；回车发送（Shift+Enter 换行，IME `isComposing`/`keyCode 229` 守卫）；对话历史 `node.chatMessages` 仅作 LLM 上下文（上限 20 条，界面不可见），顶部 × 按钮只清历史、保留框内文字。模型条从左到右 = 模型下拉 + **批量提示词开关** + 清空(×) + **发送按钮**(chat-send，忙碌时整组换成停止按钮；与回车发送等效)（`chat-enumerate-toggle`，勾选态存 `node._chatEnumerated`，发送前勾选、无需先有内容）：勾选后本轮提问末尾追加 `CHAT_ENUMERATED_INSTRUCTION`（要求模型按 a. b. c. 序号每行一条输出多条方案），回复成功后 `parseNumberedChatItems` 按行解析——剥除 markdown 标记后匹配 `字母 + [.、．)）：]` 序号，无序号续行并入上一条，**序号条目 ≥2 条时自动在节点右侧排成一列文字节点**（`createChatPromptTextNodes`，与 pushHistory 同批提交），不足 2 条或无序号的回复按普通回复处理不拆分（序号拆分按回复内容判定，与开关无关，手动要求编号的普通发送同样会拆）；toast 提示拆分数量。模型目录 `window.CANVASFLOW_CHAT_CATALOG`（model-catalog.js）声明式驱动，每项带 `apiType` 与 `multimodal`：gpt-5.2-chat-latest（APIMart·多模态）、gemini-3.8-flash（APIMart·文本）、gpt-6-sol / gpt-6-astra（AGToken）。代理端点 `/api/chat/completions` 按 `apiType` 分槽透传：apimart 走 OpenAI 兼容 `/api/v1/chat/completions` 前缀（带镜像 failover，响应是 `{code,data}` 包装——前端按 `data.choices` 形状自适应解包），agtoken 走标准 `/v1/chat/completions`（单上游无镜像）；两套格式不做转换。**模型下拉按已填 key 分站点过滤**（`chatCatalogModels`：只填一家只出该站点模型，两家都填全显，都没填全显；站点 key 被清后已存模型在 `normalizeChatNode` 自动切到第一个可见模型）。服务端 404（旧进程无此路由）时前端提示重启服务，勿当作上游错误排查。**桌面版排查铁律：新前端 + 旧 EXE 会以「裸 fetch → 虚拟主机 404」的形式表现，与旧 server.js 进程的 404 症状相同**——用户自称「不是桌面版」不可信，看窗口标题栏（有最小化/关闭按钮就是桌面 WebView2 窗口）；`启动CanvasFlow-NET.bat` 启动的就是桌面版（dotnet build + start exe，前端从项目根实时加载），桌面版实例必须在接口代码合入后重新跑一次 BAT 才会带上新路由；服务模式启动用 `启动CanvasFlow服务.bat`（纯 ASCII 内容，规避中文 BAT 编码坑）。key 分槽：apimart 用 `settings.apiKey`、agtoken 用 `settings.agtokenApiKey`（服务器/浏览器模式随请求体 `_apiKey` 携带，桌面模式走 secrets）。多模态仅 gpt-5.2-chat-latest 把上游参考图以 `image_url` 内容部分随消息发送（上限 12 张），文本模型忽略图片。上游文字取扇入并集与发送内容合并为本轮 user 消息。
- 语义边界：对话节点向下游是文字产物边界——`collectUpstreamForAI`/`directScreenshotNodeInputs` 截断不穿透；生成期间（`_chatBusy`）下游读最近一条 assistant 回复，其余时候读**最新结果**（`chatResultPortion`：最后一条分隔线之后；无分隔线时整框 `chatText`，生成中框内是提问草稿）。分隔线为纯程序写入（U+2500 长横线 ≥6 条成行，`CHAT_RESULT_DIVIDER_LINE_RE`），下游输出/发送拆分/分区均以此线为界，模型正文里偶发的 `---`/表格线不会误判。
- 避免：对话是同步长请求（推理模型可达数分钟），桌面端统一走 600 秒 HttpClient（`ProxyApiAsync` 的 `httpClient` 参数），服务器端 300 秒；`normalizeChatNode` 不得重置 `_chatBusy`——模板每次渲染都会调用，运行时状态只能在存档加载的 walkNodes 里清；停止/迟到结果用请求序列号（`chatRequestSeq`）丢弃，桌面桥无法中断在途请求；输入期间推迟全量渲染的保护（`activeNodeTextEditor`）已扩展到 `chat-text`，且文本框失焦时若焦点移向节点内部控件必须跳过强制重建——否则按钮元素在命中与派发之间被整体替换，吞掉这次点击（本条在开发中实际踩过：发送后焦点回文本框，再点清空按钮第一次必落空）；chat 节点正文高度用 `calc(100% - 46px)`（生效的 node-head 高度在样式表后块的 46px，不是前块的 38px）。

### AI 队列并发任务错峰提交

- 规则:`pumpAiTaskQueue` 以"最近一次任务启动时间"为基准,保证任意两次任务启动至少间隔 `AI_TASK_SUBMIT_STAGGER_MS`(500ms)——同步接口(如 agtoken)对同一密钥的瞬时并发提交可能被上游拒绝且不留任务记录。补位(任务完成后 refill)、入队、定时器三种触发来源共用同一时间基准,瞬时完成的任务不得绕过间隔。
- 避免:错峰逻辑不能写成"启动后 break 等定时器"的简单形态——任务秒完成/秒失败时其补位 pump 会清掉定时器立即启动下一个任务,错峰失效;验证错峰时页面必须换新标签页(?v= 未变的 reload 会继续用缓存脚本);改 app.js 必须同步递增 index.html 的 ?v=。

### AI 节点“生成张数”按模型分两条路径

- 规则:所有 AI 绘图模型都显示"生成张数"1-4。gpt-image-2.5 系(flare/sunburst,即 `isImage25ExtModel`)上游支持单任务 `n>1`,仍走"一个任务带 n=张数";其余模型在 `buildAiQueueTasks` 拆成 N 个独立任务(每任务 n=1),复用现有队列/并发(上限 5)/单任务取消机制。落位:预览模式下第一张进节点预览、其余各自生成图片节点(image-node),与扇入多支线"多任务各自生成图片节点"的语义一致;"执行全部"对话框的任务数预估必须乘以 `taskCountFactor`(非 ext 模型 = 张数)。
- 避免:拆分不得改成改 `submitGeneration` 内部循环(那会串起截图任务等所有调用方);预览模式下多图任务的图片节点必须从 baseOrder 起紧凑排布(第一张占预览,不占网格 0 号位),不得恢复"网格空 0 号位"的旧布局;组图/多支线场景全部走 image-node 模式,不适用"首张进预览"调整;新模型若原生支持 n>1,需在 `isImage25ExtModel`/提交流程中显式接入,不能默认拆任务。

### 覆盖安装新版后不得继续使用旧版界面热更新

- 现象：用户把新版安装包装到旧版同一路径时，`data\web-updates` 会保留旧版下载过的界面热更新包；若启动时无条件优先加载该目录，新 EXE 会继续运行旧 app.js，新功能（如 agtoken 设置入口）不可见。
- 解决：`WebUpdateManager.ResolveContentRoot` 只启用“版本号严格高于宿主 EXE”的热更新界面，否则清空指针、回退随包界面；Inno 脚本 `[InstallDelete]` 在安装前清理 `{app}\app` 下旧版残留的 js/html/css/modules。
- 避免：不得无条件信任 `active.json` 指针；发布纯界面热更新时版本号必须高于所有在役宿主 EXE 版本，否则用户装了也不会生效；`build-web-update.ps1` 的 `MinimumHostVersion` 默认取"最新已发布 release"——一旦新 release 已发布、随后再重打同版本热更新包（如补漏），默认值会变成当前版本而挡住更早的在役宿主，必须显式传 `-MinimumHostVersion`（ Setup.exe 沿用旧版时尤其如此）。

### Release 必须双资产齐全，版本号以 package.json 为唯一来源

- 规则：每个已发布 Release 必须同时包含且只包含一个 `CanvasFlow-Setup.exe` 和（带界面更新时）一个 `CanvasFlow-Web.zip`。在役宿主（Windows `DesktopApi.CheckForUpdatesAsync`、mac `web-update.js`、server.js）的更新检查第一步就强制"最新 Release 应包含且只包含一个 CanvasFlow-Setup.exe"，缺失时直接抛异常转降级路径（`canHotUpdate=false`），所有旧宿主的"安装界面更新"按钮都会消失——纯界面热更新 release 也不例外（2.7.4 首发实踩：只传了 Web.zip，2.7.3 全线无法热更新，最终回退重建）。
- 最低宿主：`build-web-update.ps1` 必须显式传 `-MinimumHostVersion`（取最老在役宿主，当前 2.7.1）。清单里的 `minimumHostVersion` 高于某台宿主时，该宿主会在下载校验的最后一步被拒（"此界面需要宿主 X，当前宿主 Y"），前功尽弃。
- 版本号：`package.json` 是唯一来源——csproj `<Version>` 用 MSBuild 属性函数从它读取，`build-dotnet.cmd` 读它并经 `/DAppVersion=` 传给 ISCC（.iss 用 `#ifndef AppVersion` 兜底）。升版本只改 package.json；csproj 内已无字面版本号，不得再用 findstr 从 csproj 提取版本。
- 避免：发布前核验 Release 形状（1 个 Setup.exe + 1 个 Web.zip、都带 GitHub digest）；publish 目录与 Web.zip 清单逐文件比对 SHA-256；`export` 目录存在且为空（build-dotnet.cmd 已内置）；改动版本链路后必须实际跑 `build-dotnet.cmd` 验证 exe ProductVersion 与版本化副本文件名。

### agtoken 与 APIMart 是两套彼此独立的请求格式

- 规则：APIMart 走“提交任务 + 轮询”（`/api/generate` → `/api/task/:id`），agtoken（https://agtoken.vip，OpenAI 兼容）走同步直连（`/api/agtoken/generate|edits`，响应直接含图片，600 秒超时）。两套格式不做归一化转换；APIMart 特有的 flare/sunburst → `gpt-image-2.5-ext` + `version` 映射只允许在 apimart 分支生效。
- 实现：绘图模型列表、画质档、分辨率档统一由 `model-catalog.js` 声明式目录驱动；增删模型只改该文件并发布 `CanvasFlow-Web.zip` 界面热更新，不需要重发 EXE。API Key 按 `apiType` 分槽保存（`settings.apiKey` / `settings.agtokenApiKey`，桌面端 secrets.json v2 双槽），所有落盘路径（localStorage、/api/app-state、自动备份）必须同时剥离两个 key。
- 避免：不得在 agtoken 分支复用 APIMart 的 ext 映射、任务轮询或 apimart 的 key；节点模型切换 API 类型后不属于当前目录时必须回退当前类型默认模型；静态资源响应必须带 `Cache-Control: no-cache`，且改动前端文件时同步递增 index.html 中的 `?v=` 版本号，否则界面热更新会被浏览器启发式缓存吞掉。

### 覆盖安装后启动报 WebView2 0x80070003

- 现象：覆盖安装 2.7.0 后每次启动弹“WebView2初始化失败……系统找不到指定的路径。(0x80070003)”；WebView2 Runtime 与用户数据目录都正常，反常点是 msedgewebview2 浏览器进程已随启动创建且存活。
- 原因：`EnsureCoreWebView2Async` 成功之后的 `SetVirtualHostNameToFolderMapping("canvasflow-data.local", {数据根}\download\images, …)` 在目标目录不存在时抛 `ERROR_PATH_NOT_FOUND (0x80070003)`；该目录只在用户存过图片后才生成，全新/覆盖安装后不存在，导致安装版必然启动失败，浏览器进程变成孤儿残留。
- 解决：映射虚拟主机前必须 `Directory.CreateDirectory` 目标目录（初始化建目录清单中加入 `download\images`）；对已安装机器补建 `{安装目录}\app\download\images` 即可原地恢复，无需重装。
- 避免：所有 `SetVirtualHostNameToFolderMapping` 的目标目录一律先创建再映射；启动失败的错误提示应包含实际失败的步骤与路径，不能笼统归因于“Runtime缺失/目录无权限”；判断 WebView2 初始化失败点时，先查浏览器进程树是否已创建（`Get-CimInstance` 查 msedgewebview2 命令行里的 `--user-data-dir`），进程已存在说明失败在 `EnsureCoreWebView2Async` 之后的步骤。

### 异步全量重渲染吞掉节点按钮的第一次点击

- 现象：AI 绘图节点“生成/重新生成”偶发第一次点击无反应，第二次才触发；任务运行期间或刚生成完成后的 1.8 秒内更明显。
- 原因：`renderNodes()` 曾整体清空重建节点 DOM，进度轮询（约每秒一次）、任务完成后的进度条清理、图片加载适配都会在随机时机触发；按压期间按钮元素被替换后，浏览器把 click 派发到父容器，委托处理器按 `data-role` 匹配不到按钮而静默返回。全局 `button:active { transform: scale(.98) }` 还会让贴近边缘的点击在松开时落到缩小后的按钮外。
- 解决：`renderNodes()` 按节点复用未变化的 DOM 元素（className 与模板标记都一致时仅更新几何样式）；进度条完成清理改为就地移除元素与状态类；`:active` 按压反馈改为透明度；`enqueueAiNode` 在单节点点击路径上对空上游给出提示。
- 避免：新增异步渲染路径时不得整体清空 `#nodes` 重建；进度、状态类等局部变化必须就地更新；按钮按压反馈不得使用改变命中区域的 transform；委托点击处理统一用 `closest("[data-role]")` 解析动作。

### 拓展服务的“先启动才能找到文件夹”死循环

- 现象：2.7.0 安装版里拓展功能不可用——设置面板提示“到拓展文件夹双击 扩展服务.bat 启动”，但“打开拓展文件夹”按钮在服务上线前拿不到目录位置（app.js 的 `baseDir` 来自服务响应），形成死循环；且安装包只打包了拓展工具子目录，不含 扩展服务.bat 和服务端脚本。
- 原因：扩展服务被设计成独立进程由用户手动启动；桌面端把“定位拓展文件夹”的职责也交给了服务，而打包流程没有把服务本体带进安装包。
- 解决：桌面端把扩展服务内置到 `DesktopApi`（扫描 `{程序目录旁}\拓展` 下的 扩展.json；列表/刷新/按 id 运行三个接口；`input/` 写图 → 以拓展目录为工作目录运行入口脚本 → 收集 `output/` 返回），前端在桌面模式经 `apiFetch` 走内置服务，外部 `127.0.0.1:8788` 服务仅保留给服务器运行模式。
- 避免：凡 UI 提示“去某文件夹手动操作”的功能，应用本身必须知道该文件夹的确定路径或提供一键定位/启动入口；打包清单必须与运行时依赖对齐（新增服务进程时同步更新 build 脚本与 Inno [Files]）；拓展脚本继续遵守“input/ 输入、output/ 输出、CWD=拓展目录”的约定，不要引入额外的服务端私有协议。

### 误粘进项目面板的代码碎片让分组管理器整体失效

- 现象：2.7.0 项目管理器只显示标题行和“新建分组”按钮，分组与项目全部不渲染，点击“新建分组”无反应；控制台 `ReferenceError: pasted is not defined`。
- 原因：c8e969c 开发期间把粘贴节点的源节点重映射循环误复制进了 `projectPanelPageRow`，该函数没有 `pasted`/`map` 上下文，渲染第一个项目行即抛异常，面板渲染整体中断，症状看起来是“按钮无响应”。
- 解决：确认重映射逻辑在粘贴函数内完好后，删除误粘的三行碎片；`node --check` 查不出这类错误（语法合法、运行期才炸），必须实际打开相关面板验证。
- 避免：面板/列表类渲染一旦中断就是整块空白，排查“点击没反应”先开 DevTools Console 看渲染异常，再怀疑事件绑定；合并功能分支时警惕出现在函数中段的孤立代码块，合入前点开受影响的面板实测一遍。

### 桌面端虚拟主机映射的启发式缓存吞掉界面更新

- 现象：更新 app.js/index.html 后重启应用，界面仍是旧版；安装目录里文件时间戳确认已是新文件，进程启动时间也晚于修改时间。
- 原因：WebView2 虚拟主机映射（SetVirtualHostNameToFolderMapping）的响应不带 Cache-Control，浏览器按启发式缓存（约 Last-Modified 时长的 10%）判断新鲜度；而画布导航 URL 固定为 `index.html?web=`，缓存期内不回源，旧 index.html 连带旧 ？v= 子资源一起被使用。
- 解决：导航 URL 追加 index.html 的 `LastWriteTimeUtc` 时间戳（`?t=`，文件一变 URL 即变），并用 `WebResourceRequested` 拦截 index.html 强制 `Cache-Control: no-cache`；`?v=` 递增只对 app.js/styles.css 等子资源有效，管不住入口页自身。
- 避免：排查“更新没生效”先比对进程启动时间与文件修改时间，再看 WebView2 缓存；服务器模式的 no-cache 头规则（见 agtoken 条目）不覆盖桌面虚拟主机映射，两条链路要分别保障。

### 文字节点内嵌变量（替代独立变量节点）

- 规则：画布右键菜单不再提供“添加变量节点”入口，旧变量节点在存量画布中保持兼容（渲染与收集逻辑原样保留）。文字节点内容里出现变量库变量名时，节点正文下方自动出现变量词下拉条（chip = 变量名 + 可选值 select，data-role=`text-variable-choice`）；所选值存 `node.variableChoices`（按变量名为 key，存 optionId + label 快照），用户文本本身不改写；收集文字时（`collectUpstreamForAI` / `directScreenshotNodeInputs`）经 `expandTextNodeVariables` 把已选变量名展开为“值+变量名”（如 发色 → 红色发色），与旧变量节点输出格式一致，未选择的保持原文。
- 避免：下拉条必须随文字就地同步（输入后 250ms 防抖替换 + focusout 立即冲刷，输入期间禁止全量 renderNodes，会打断输入与 IME）；检测用名称长度降序占用区间匹配，防止互为子串的变量名误伤；改 app.js 必须同步递增 index.html 的 `?v=`——实测再次确认 `?v=` 未变时 reload 会继续跑缓存旧脚本，得出“改动没生效”的假结论（本次开发中就因此误判过一次）。



## 外部 API 文档（常用，开发前先查）

### agtoken 文档：https://agtoken.vip/docs

- 页面为 JS 渲染，WebFetch 抓不到正文，须用 web_reader 或浏览器打开。
- OpenAI 兼容网关，基础地址 `https://agtoken.vip/v1`，`Authorization: Bearer sk-...` 认证；兼容 OpenAI SDK 与 ChatBox/CherryStudio 等客户端。
- 对话：`POST /v1/chat/completions`（model、messages[{role,content}]、stream、tools/tool_choice）；另有 `/v1/completions`、`/v1/responses`（支持 reasoning，默认 medium）、`/v1/embeddings`、`/v1/rerank`。
- 绘图（CanvasFlow 现用）：`POST /v1/images/generations`（model、prompt、n、quality、size/aspect_ratio、background、moderation、output_format、stream 等）、`POST /v1/images/edits`（参考图/垫图：image[] + prompt + 可选 mask，gpt-image 系专用）。结果在 `data[].b64_json`（默认）或 `data[].url`（`response_format: "url"`）。
- 模型可用性以 `GET /v1/models` 为准（Beta 功能加 `?beta=true`）；计费按"类型+质量档"而非文本 token；接口列表页可查任务余量。
- 绘图为同步直连，单次可能 60-180 秒且默认无超时，客户端必须自设足够长的超时（CanvasFlow 现为 600 秒）。

### APIMart 文档（中文）：https://docs.apib.ai/cn

- docs.apib.ai 是 APIMart 官方文档站（与 docs.apimart.ai 同源，含 `llms.txt` 索引：https://docs.apimart.ai/llms.txt，具体接口页可直接抓取 `.md`）。
- OpenAI 兼容入口：`https://api.apimart.ai/v1`，Bearer 认证（key 从 https://apimart.ai/keys 获取）。
- 对话：`POST /v1/chat/completions`（model、messages、stream、temperature、top_p、max_tokens、stop、n）；文档标注 stream 默认 true（SSE）、响应为 `{ code: 200, data: {...} }` 包装（data 内为标准 OpenAI 结构）——实现时以实测为准。
- 注意区分：CanvasFlow 现有 APIMart 绘图接入走"提交任务+轮询"（`/api/generate` → `/api/task/:id`）私有格式；OpenAI 兼容 `/v1` 是同一平台的另一套入口，chat 类需求走 `/v1/chat/completions`。
- 对话模型：gpt-5/5.1、claude-opus-4-8 / sonnet-4-6、gemini-3.x / 2.5、deepseek-v4/v3.2 等；另有 GPT-4o Image、Sora2、VEO3、Whisper/TTS。

### mac 版壳源码与跨平台界面热更新（2.7.3 起）

- 规则：mac 版（Electron 壳）主进程源码以 `desktop-mac/` 为唯一真源——2.7.2 及更早的 mac 包是仓库外手工构建的，禁止再从 `release/mac/*.zip` 反向提取后直接改动；改壳源码只改 `desktop-mac/`，再由 `build-mac.ps1` 重新打包。mac 版与 Windows 版共用**同一份** Release 界面热更新资产 `CanvasFlow-Web.zip`：`desktop-mac/web-update.js` 与 `desktop-dotnet/WebUpdateManager.cs` 语义逐项对齐（GitHub digest + 清单逐文件 SHA-256 双重校验、版本严格高于宿主才启用、`active.json` 指针、启动确认与回退），任何一侧改动校验/清单/版本规则必须同步另一侧。
- 实现：mac 壳启动时先 `resolveContentRoot()` 再把 `contentRoot` 传给 `startCanvasFlowServer`（server.js 新增可选参数，默认 `__dirname`，浏览器/服务器模式不受影响）；热更新应用后重启 server 换内容根并 `loadURL` 新端口。`build-mac.ps1` 对 Electron 官方 darwin zip 做 zip→zip 流式转写——**不得解压后再打包**（zip 里有符号链接与 unix 权限位，Windows 解压即损坏；权限位 0100644/0100755/040755 与符号链接条目原样保留）；条目改名映射（Electron.app→CanvasFlow.app、Helper 全套、electron.icns→icon.icns）与 plist 字段集中在脚本内，产物必须与上一版原包逐条目对照验证。产物 ZipArchive 的条目名编码参数必须传 `$null`（2026-10 修复）：显式传 `UTF8Encoding` 时 .NET 不写 UTF-8 语言标志位（EFS），中文名字节虽是 UTF-8，macOS 解压仍按非 UTF-8 解码出乱码名（曾误判为"GBK 编码"）；脚本内置自检——源包符号链接逐条保留（mode 0o120755 与链接目标一致，Electron 44 为 14 条）、所有非 ASCII 条目名必须带 0x800 标志，不满足即构建失败。
- 避免：`build-mac.ps1` 含中文注释，必须保存为 UTF-8 with BOM（PowerShell 5.1 对无 BOM UTF-8 按 ANSI 解析，中文注释字节会破坏语法——与中文 BAT 用 GBK 是同一类坑）；PowerShell 双引号字符串里 `${Var}.zip` 要加大括号，`$Var.zip` 会被解析为属性访问；Electron 官方 zip 的条目带 `Electron.app/` 前缀且 helper plist 缺 CFBundleDisplayName/Executable/Version 字段，改名/新增字段逻辑要按官方结构写，不能按 electron-builder 产物结构假设；`Release/mac/.electron-cache/` 是运行时缓存，不入 Release 资产。mac 真机行为（热更新下载/切换/回退/CEP 面板源）在 Windows 上无法自动化，发版前按 `desktop-mac/README.md` 清单人工验证。Mac 端解压整包必须用 Finder 双击、`unzip` 或 `ditto -x -k`，**不得用 Python `zipfile` 解压**——它不读 unix mode 位，会把 Electron 框架的符号链接落成"内容为链接目标"的纯文本文件，启动报 "Electron Framework is not a valid Mach-O file"（2026-10 实踩，14 条链接需按 zip 内符号链接条目逐个 `ln -s` 重建；Python 解压时 zip 本身的符号链接是完好的，锅在解压侧）。

## 中长期规划 / TODO

### 思维导图自定义属性卡（后续版本，第一版不实现）

- 属性卡只用于思维导图模式；每张卡代表一个产品或对象，按模板填写功能、风格、材质等信息。
- 设置的素材库新增全局“属性模板”：模板包含名称、用户可调整的彩色标记、版本号和可增删排序的属性；属性类型支持自由文本、下拉单选和多项勾选，选项可以任意增删。
- 模板列表支持新建、编辑、复制和删除；复制后生成独立模板、独立编号和不同的默认标记颜色。
- 属性卡平时紧凑显示产品名称、模板标记和属性摘要；鼠标悬浮时必须在原节点内部向下展开完整编辑区，输入控件获得焦点期间不得意外收起。
- 属性卡创建后可选择绑定模板、关闭同步或安全改绑其他模板。安全改绑按不区分大小写的属性名称继承值；未匹配的旧属性保留为本地属性，新属性为空。
- 修改模板时只检查当前项目中开启同步的属性卡，并弹出应用内确认：可同步当前项目、暂不同步或取消保存。同步只更新属性结构、顺序、类型和选项，不覆盖用户填写的值；被模板删除的属性保留为本地属性。
- 其他项目不得被后台自动修改；切换到含旧模板版本属性卡的项目时再提示用户同步。删除模板时，已有属性卡转为独立状态并保留全部结构、颜色和值。
- 属性卡数据需保存模板编号、模板快照、模板版本、同步状态、颜色、字段结构和值；文本值为字符串，单选值为字符串，多选值为字符串数组。
