# CanvasFlow × Photoshop CEP 面板

把 Photoshop 里打开的文档（含选区）发给 AI 做提示词改图，结果作为**新图层**贴回原文档。
PS 脚本只负责三件事：导出文档/选区、回贴结果；生成请求由面板 JS 编排。

## 生成通道（v0.2）

| 通道 | 说明 | 支持的 API |
| --- | --- | --- |
| 画布（默认优先） | 画布开着时自动走本机画布；桌面版复用已保存的 key，**面板可以不填 key** | agtoken + APIMart 两套 |
| 直连 | 画布没开时直连 agtoken.vip | 仅 agtoken |

- 桌面版画布：内置 `DesktopBridge`（127.0.0.1 随机端口 + 随机令牌），启动时写发现文件 `%APPDATA%\CanvasFlowBridge\bridge.json`，面板自动读取并连接。`node server.js` 服务器模式也会写同一文件。
- 通道选择：自动（画布优先）/ 仅画布 / 直连；画布地址可手动指定（默认探测 `http://127.0.0.1:5173`）。
- 模型列表是两套目录的并集（`model-catalog.js` 同款）：Nano Banana 仅 agtoken；「Nano Banana Pro（APIMart）」仅 APIMart；flare/sunburst 在 APIMart 走 `gpt-image-2.5-ext + version` 映射。APIMart 是提交+轮询接口，面板轮询时展示**真实进度百分比**。

## 上传压缩与选区

- **上传压缩**默认「快（JPEG · 长边 1536）」：整份原图 PNG base64 直传是此前响应极慢的主因（家庭宽带上行 10MB+ 要几十秒）。可选更快（1024）或高清（PNG 原图）。蒙版始终 PNG 并与上传图同尺寸。
- **选区标记方式**（v0.2.2 起默认红色标记）：
  - **红色标记（推荐）**：导出图上把选区涂 50% 红色半透明，发送时在提示词末尾**追加一条隐藏指令**（"重新生成图片中的红色半透明标记区域，其余部分保持原样，最终图中不要残留红色标记"，不显示在输入框）。不依赖上游 mask 字段，指令跟随类模型（gpt-image / nano-banana 系）效果稳定。
  - **蒙版**：走 `mask` 字段（需上游支持，agtoken 是否支持仍待实测）。
  - 两种模式下，**回贴都按选区本地剪裁**：选区外保持原图像素，区域与对齐由本地保证。
- 选区状态存于文档的临时 Alpha 通道 `CF_mask_tmp`，回贴后自动删除；异常中断后残留时，下次导出会自动清理（也可在通道面板手动删）。

## 安装

### 方式 A：从 CanvasFlow 桌面版一键安装（推荐）

设置 → 拓展 → 「Photoshop 联动面板（demo）」→ 安装 / 更新面板。
桌面端会：拷贝面板到 `%APPDATA%\Adobe\CEP\extensions\CanvasFlowPanel` + 写 HKCU 注册表 `CSXS.9~12` 的 `PlayerDebugMode=1`。
卸载按钮只删面板目录，不动调试开关（用户可能有其他未签名扩展）。

### 方式 B：手动（源码调试）

双击 `cep-panel/install-for-testing.bat`，或手动做同样两步（拷目录 + `reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f`）。

安装后**重启 Photoshop**，菜单：窗口 → 扩展（功能）→ CanvasFlow 面板。

## 使用

1. 通道选「自动」；桌面版画布开着时可完全不填 key（服务器模式需在面板或画布里填一次 key）
2. PS 里打开文档；要局部重绘就先画选区（不画 = 整图修改）
3. 输入提示词，点「生成并回贴到 PS」，进度条分阶段推进（APIMart 通道有真实百分比，最长 600 秒）

## 已知边界 / 待实测

- **agtoken 的 `mask` 字段是否被上游接受仍待实测**（画布主程序从不发送 mask）；即使上游忽略，本地剪裁也保证改动区域正确。
- 桌面端 `DesktopBridge` 为 v0.2 新增：HttpListener 仅绑定 localhost、请求须带随机令牌，退出时清理发现文件。杀毒软件对监听端口的提示需在 360 环境复验。
- 画布与面板同时用同一个 key 并发生成时，上游限流策略与画布单独使用时一致。
- CEP 已被 Adobe 宣布弃用（新栈 UXP），但 PS 2021~2025 完全可用；manifest 限定 Host 22.0+。
- 未签名面板依赖 `PlayerDebugMode=1`；正式分发需用 ZXPSignCmd 签名。
- 面板 UI 不走 docs/UI-SPEC.md（那是画布自身样式规范），面板自带深色样式。

## 调试

`.debug` 已开启 8098 端口：PS 里 帮助 → 开发者工具（或浏览器开 `http://localhost:8098`）可远程调试面板页面。

## 文件

```
cep-panel/
├── CanvasFlowPanel/            ← CEP 扩展本体（整目录安装）
│   ├── CSXS/manifest.xml       ← CEP manifest，版本号改这里触发“可更新”提示
│   ├── index.html / js/main.js ← 面板 UI 与流程编排（通道路由、轮询、进度）
│   ├── js/csinterface-lite.js  ← 精简版 CSInterface（可换官方完整版）
│   ├── jsx/host.jsx            ← ExtendScript：导出文档/蒙版、本地剪裁、回贴（纯 ASCII、ES3）
│   └── .debug                  ← 远程调试端口
└── install-for-testing.bat     ← 手动安装脚本（ASCII，避免中文 BAT 编码坑）
```
