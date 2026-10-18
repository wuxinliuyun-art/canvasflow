# CanvasFlow HTML 生成规范（Demo）

生成 CanvasFlow 可编辑 HTML 演示稿，返回完整单文件 HTML：
1. 每页用 body 的直接子元素 section[data-slide] 表示；页内按阅读顺序排列，全部内容静态写入源码，不用 JavaScript 动态生成正文。
2. 需要入场的标题、段落、卡片加 data-animate="title" 或 data-animate="item"；嵌套元素不要同时标记，避免重复动画。
3. 主题颜色仅使用 var(--bg)、var(--panel)、var(--text)、var(--muted)、var(--accent)、var(--primary)、var(--line)。卡片圆角用 var(--cf-radius)，阴影用 var(--cf-shadow)。可使用 cf-kicker / cf-cards / cf-card / cf-highlight 样式类。
4. 不自行实现翻页、全局键盘监听、入场动画或固定导航，这些由软件统一注入。不要给页面设 display:none、绝对定位舞台或固定画布尺寸。
5. 内联 CSS 只负责自定义布局，避免 !important 和写死主题颜色；文字使用普通 HTML 元素，可单独编辑；每个业务元素建议有稳定 id。
6. 图片尽量使用内嵌 data URL；页面不依赖外部库，不发起网络请求。保留视口 meta、中文 UTF-8 编码。浏览方式可选翻页或滚动；一页一个清晰主题，不自动把长文章随意拆页。
7. 若修改已有文件，请保留 cf-preset-style 和 cf-preset-runtime 及 html 上的 data-cf-* 配置，不要把运行时导航和 data-cf-active / data-cf-enter 标记抄入正文。

本规范用于约束生成结构，软件应用预设时内嵌样式及运行脚本。参考 presets.js 与三页示例。
