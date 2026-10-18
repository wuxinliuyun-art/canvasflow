# CanvasFlow Photoshop UXP 面板

独立于 CEP 的 UXP 实现。最低 Photoshop **23.3（2022）**，Windows/macOS 使用同一份插件源文件。保留 CEP 版本，安装 UXP 不会修改或移除旧面板。

## 加载开发版

1. 在 Creative Cloud 安装 Adobe **UXP Developer Tool（UDT）**。
2. Photoshop → 首选项 → 增效工具 → 开启开发人员模式，重启 Photoshop。
3. UDT → Add Plugin → 选择 `CanvasFlowPanel/manifest.json` → Load。
4. Photoshop → 增效工具 → **CanvasFlow 互传 UXP** 打开面板。更新源文件后在 UDT 中 Reload。

源码目录为项目根目录的 `uxp-panel/CanvasFlowPanel`；Windows 安装包、mac 便携包中位于 `app/uxp-panel/CanvasFlowPanel`。界面热更新包也携带完整插件源文件，开发加载应选择当前生效的资源版本。

## 连接画布

### Windows 桌面版

先启动 CanvasFlow，在 UXP 面板点 **连接桌面版…**。文件选择框地址栏输入 `%APPDATA%\CanvasFlowBridge`，选择 `bridge.json`。

插件只请求用户选定文件的权限，保存 UXP persistent token，**不申请全盘文件权限**。每次回传重新读取文件中的端口和随机令牌，CanvasFlow 重启后不用重新配置。文件被移走或权限失效时重新选择即可。桥接令牌仅发送到该文件指定的 localhost 端口，不展示在界面中。

### macOS 桌面版 / Node 服务器模式

启动最新版 CanvasFlow。默认扫描本机 `127.0.0.1:5173` 至 `5192`，也可填写明确的本机 HTTP 地址。mac 桌面壳使用内置 Node 服务，因此不需要 Windows 桥接文件。

明确填写的服务器地址优先；选择桥接文件会清空服务器地址。已授权桥接文件失效时会提示修复，不会擅自改连其他实例。多实例时填写需要接收图片的那个服务器地址；Windows 桥接文件沿用现有逻辑，指向最近登记的实例。

UXP 使用不消费队列的 `/api/ps/status` 探测接口；旧 Windows 宿主通过已存在的、带令牌的 `/api/cep/status` 兼容探测。旧 Node 服务需更新并重启。插件不探测 `/api/ps/pending`，避免取走等待画布领取的图片。

## 功能

- **画布 → PS**：沿用图片右键「在 PS 中编辑」，无需 UXP 接管启动 Photoshop。
- **合并图层 → 画布**：复制合成文档，在副本中扁平化并转换为 RGB 8 位 PNG，保持 CEP 的不透明背景语义。
- **当前图层 → 画布**：单选一个非组图层，复制到原画布尺寸的透明 RGB 8 位临时文档。隐藏图层也可导出；保留图层本身的不透明度与蒙版语义。依赖其他图层的混合、剪贴、调整效果请用合并导出。
- 原文档不作像素、模式或图层修改；成功、保存失败或取消均清理临时文档/文件，并尝试恢复原文档焦点。
- 回传始终新建图片节点，不覆盖已有节点或 PS 文档。服务器模式须打开画布页面才会消费回传队列。
- 单张 PNG 上限 64MB；请求超时后先检查画布再重试，避免重复回传。

## 发布

源文件已加入 Windows publish、mac 便携包、界面热更新打包清单。插件版本唯一写在 `CanvasFlowPanel/manifest.json`，面板自动读取。

**UDT 开发加载与正式安装是两条流程。** 不要把 UXP 文件复制到 CEP extensions 目录，也不要用修改 CSXS 注册表代替 UXP 安装。正式 `.ccx` 安装包应在 UDT 的 Actions → Package 生成，再交由 Creative Cloud 安装。当前仓库不伪造或自动安装 `.ccx`，不把源码加载宣称为正式安装。

插件 ID `com.canvasflow.photoshop.uxp` 为独立渠道的稳定 ID；上架 Adobe Marketplace 时按 Adobe 分发平台要求使用单独的登记 ID。参考 [Adobe 打包指南](https://developer.adobe.com/uxp/guides/how-to/distribution/package/)。

## 验证

`node --test tests/uxp-panel.test.cjs` 覆盖临时文档隔离与失败清理、透明图层导出路径、桥接轮换/授权失效、仅访问本机地址、探测不消费回传队列、回传不自动重试。

真实 Photoshop 中仍需用 UDT 加载插件，分别测试合并/图层回传、透明图层、CMYK/16 位文档、保存失败、CanvasFlow 重启和 PS 明暗主题。浏览器预览不能替代 UXP 宿主验证。
