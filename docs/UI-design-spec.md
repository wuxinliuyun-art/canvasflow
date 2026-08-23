# CanvasFlow UI 设计规范

> 本文件定义 CanvasFlow 界面设计的统一标准。新增或修改 UI 前，请先对照本规范，
> 确保颜色、圆角、间距、字体、组件形态与现有体系一致。
>
> 现状说明：项目当前为 **HarmonyOS Sans / 中性灰阶 + 毛玻璃胶囊** 设计语言，
> 以"中性、克制、层级清晰"为目标，避免强色彩与大面积高饱和。

---

## 1. 设计令牌（Design Tokens）

所有 UI 变量集中在 `styles.css` 的两处 `:root` / `.theme-dark` 中定义。
下方为当前**最终生效**的值（后定义覆盖前定义）。

### 1.1 颜色（Color）

**浅色主题（light）**
| Token | 值 | 用途 |
|-------|-----|------|
| `--bg` | `#f4f5f6` | 画布背景 |
| `--panel` | `#ffffff` | 浮层/面板背景 |
| `--panel-solid` | `#ffffff` | 面板实底 |
| `--panel-2` | `#e0e2e5` | 边框/分隔线/浅填充 |
| `--text` | `#202226` | 主文字 |
| `--muted` | `#7d828a` | 次要文字 |
| `--line` | `#a7abb2` | 连线 |
| `--accent` | `#27292d` | 强调色（近黑） |
| `--accent-soft` | `rgba(39,41,45,.08)` | 强调浅底 |
| `--selected` | `#858a92` | 选中态 |
| `--danger` | `#ff3b30` | 危险/删除 |
| `--canvas-grid` | `rgba(50,55,62,.055)` | 画布网格 |

**深色主题（dark，`.theme-dark`）**
| Token | 值 |
|-------|-----|
| `--bg` | `#1b1c1e` |
| `--panel` | `#202123` |
| `--panel-solid` | `#202123` |
| `--panel-2` | `#34363a` |
| `--text` | `#f0f1f3` |
| `--muted` | `#94979e` |
| `--selected` | `#85888f` |
| `--danger` | 沿用 `#ff3b30` |

> 原则：**全站以中性灰阶为主**。彩色仅用于：危险操作（红）、选中/运行态（蓝 `#4f7cff`）、
> 成功完成（绿 `#22c55e`）、AI 生成背景（紫）。其余一律用灰阶。

### 1.2 字体层级（Typography）

| 层级 | 大小 | 字重 | 用途 |
|------|------|------|------|
| 标题/节点头 | 13px | 500 | 节点标题、设置 Tab |
| 正文/表单 | 12px | 400 | 节点正文、下拉框、按钮文字 |
| 辅助说明 | 11px~12px | 400 | 次要/提示文字 |
| 大标题 | 20px~24px | 500 | 设置面板标题、弹窗标题 |

字体族：`"HarmonyOS Sans SC", "HarmonyOS Sans", "鸿蒙黑体", "PingFang SC", "Microsoft YaHei"`（第1977行附近）。

> 所有组件文字不得随意使用 13px+ 的正文。节点头 13px、正文 12px、辅助 11px。
> 变量节点等特殊节点必须与普通节点一致（已统一：节点头 13px，正文/下拉/按钮 12px）。

### 1.3 圆角（Border Radius）

| 层级 | 值 | 适用 |
|------|-----|------|
| 小圆角 | 6px | 输入框内部元素、小控件 |
| 中圆角 | 9px~11px | 节点预览、按钮、下拉框 |
| 大圆角 | 14px~17px | 节点卡片、面板、对话框面板 |
| 特大圆角 | 18px~20px | 变量节点、设置面板、弹窗 |
| 胶囊 | 999px | 按钮、工具轨道、Toast |

> **关键约定**：节点的"深色背景正文区"（`.node-body`）**顶部无圆角**（`0 0 X X`），
> 只有底部有圆角；**节点头标题不加分割线**（`border-bottom: 0`），下缘自然平直。
> 变量节点外层 `border-radius: 20px`，其 `.node-body` 用 `border-radius: 0 0 20px 20px`（顶部不倒角）。

### 1.4 间距（Spacing）

| Token | 值 | 用途 |
|-------|-----|------|
| 紧凑 | 4px~6px | 行内小间距、变量行距（6px） |
| 常规 | 8px~12px | 元素内边距、列表间距 |
| 宽松 | 14px~20px | 面板留白、节点 body padding |
| 区块 | 20px~30px | 面板/弹窗边缘 |

> 示例基准：节点 body padding `12px`；变量节点 body `6px 12px 20px`
> （顶部 6、左右 12、底部 20）；隐藏标题后顶部统一 `12px`。

### 1.5 阴影（Shadows）

| Token | 值 | 用途 |
|-------|-----|------|
| `--soft-shadow` | `0 14px 28px rgba(29,34,41,.1)` | 节点、卡片（浅底） |
| `--shadow` | `0 22px 52px rgba(29,34,41,.13)` | 浮层、面板、菜单 |

深色主题阴影自动加深（见变量表）。浮层统一 `backdrop-filter: blur(...) saturate(...)`（毛玻璃）。

### 1.6 图标（Icons）

- 全部使用 **SVG 内联**（`stroke-currentColor`），统一 `stroke-width: 1.5~1.8`、
  `stroke-linecap: round`、`stroke-linejoin: round`、`fill: none`。
- 禁止使用 Unicode 文本符号（如 `×`、`＋`、`⋮`、`⌄`）充当图标——易错位、依赖字体。
- 图标色彩由 `currentColor` 继承，跟随 `--text` / `--muted`，明暗自适应。

---

## 2. 组件规范

### 2.1 按钮（Button）

| 形态 | 用途 | 规格 |
|------|------|------|
| `button.primary` | 主要操作 | 近黑 `#27292d` 底、白字、无边框 |
| `button`（默认） | 次要操作 | 透明底、`1px var(--panel-2)` 边框、`border-radius: 11px` |
| `.icon-btn` | 图标按钮 | `width: 38px`、居中、`border-radius: 11px` |
| `.track-icon-btn` | 工具轨道按钮 | `width: 42px`、圆形、`opacity .76`→悬停 1 |
| `.task-queue-btn` | 队列入口 | `42px` 圆形 +
 有活动时带脉冲光圈 |

- 按钮统一 `min-height: 38px`（图标类除外）。
- 长而窄的胶囊入口（如"添加一行"）：`min-height: 26px`、`padding: 0 14px`、`border-radius: 999px`。
- **禁止**把图标按钮做成方形高块（违背"长窄胶囊"设定）。

### 2.2 下拉框（Select）

- 还原为原生 `<select>` + 自定义箭头（SVG chevron）。
- 无默认值时**不显示占位文字**（如"选择变量/选择值"），允许默认选第一项；变量节点已明确去掉空白占位项。
- `height: 36px`、`border-radius: 6px`、字号 12px。

### 2.3 节点（Node）

- 统一 `border-radius` 与 `--panel-solid` 背景。
- 节点头 `.node-head`：`height: 40px`、`padding: 0 13px`、`border-bottom: 0`（标题无分割线，下缘自然平直）。
- 正文 `.node-body`：`padding: 12px`、字号 12px。
- 端口 `.port`：`in`/`out` 圆形，定位于节点边缘（`left:-7px`/`right:-7px`），需保持 `overflow: visible`。
- **禁止**在节点或 body 上使用 `overflow: hidden` 裁掉端口；内部裁剪用 `overflow: clip`。

### 2.4 变量组合节点（Variable Node）

- 节点头 `.variable-node-head`：`height: 56px`、`padding: 0 20px`，标题字号 13px。
- 行间距 `gap: 6px`。
- 每行：变量下拉 + 值下拉 + 删除按钮（无排序拖拽）。
- 图标均用 SVG（下拉 chevron、删除 ×、添加 +、更多 ⋮）。
- 文字大小与普通节点一致（节点头 13px，正文/下拉/按钮 12px）。
- 隐藏标题后顶部留白与普通节点一致（`padding: 12px 12px 20px`）。
- 边框四角需完整：外层 20px 圆角，内层 body 底部随圆角、顶部不倒角。

### 2.5 面板 / 对话框（Panel / Dialog）

- 统一 `--panel-solid` 背景 + `--shadow` + `backdrop-filter` 毛玻璃。
- `border-radius: 18px`。
- 标题 20~24px、副文案 12px（`--muted`）、正文 12px。

### 2.6 菜单（Menu / Context-menu / Project-menu）

- 统一风格：`--panel-solid` 背景、`1px var(--panel-2)` 边框、`border-radius: 8px`、
  `shadcn-in` 淡入动画。
- 菜单项：`min-height: 32px`、`padding: 0 8px`、`border-radius: 6px`、hover 用 `--accent-soft`。
- 下拉/右键菜单与项目菜单使用同一套基础样式，不得各自为政。

---

## 3. 布局与响应式

### 3.1 主区域
- 顶部栏：项目名 + 右上工具轨（保存/打开/主题/快捷键/设置）。
- 底部：输入创作区（composer）+ 工作流工具（一键连接/批量执行/队列）。
- 画布：网格 + 节点 + 连线 + 小地图。

### 3.2 响应式断点
| 断点 | 行为 |
|------|------|
| `max-width: 820px` | composer 收窄 |
| `max-width: 680px` | 设置侧边收窄、队列/设置互斥、抽屉全宽 |
| `max-width: 540px` | 顶栏压缩、图标按钮缩小 |

---

## 4. 禁止 / 避免（Anti-patterns）

1. **不要用 Unicode 文本当图标**（`×`、`＋`、`⋮`、`⌄`）——会错位、依赖字体、粗细不一。
2. **不要给节点加 `overflow: hidden` 或 `overflow: clip` 在 `.node` 层**——会裁掉端口。
   （内部裁剪放 `.node-body`。）
3. **节点头部下缘必须是平直的**，不要用圆角把深色正文区顶部做成倒角。
4. **变量节点文字大小必须与普通节点一致**，不得单独放大。
5. **按钮统一胶囊/中圆角**，图标按钮禁止方形高块。
6. **颜色以中性灰阶为主**，彩色仅限危险/选中/成功/AI 状态。
7. **新增分组若与既有模式冲突**（如 `mind-group.subgraph` 与 AI 多任务 `group`），属性与交互不得混用。

---

## 5. 修改流程指引

修改 UI 前：
1. 判断改动属于哪个**令牌类别**（颜色/圆角/间距/字体），先改对应的变量，再应用到组件。
2. 不要只针对单个节点零散调值——先在规范里确定统一标准，再一次性套用。
3. 涉及图标，改前确认是 SVG（而非文本符号）。
4. 改完核对是否违反第 4 节"禁止"清单。
