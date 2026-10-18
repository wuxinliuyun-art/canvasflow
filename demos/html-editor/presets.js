/* Independent demo runtime; exported pages receive this runtime inline. */
(() => {
  'use strict';
  const themes = {business:'极简商务',paper:'纸张贴纸',tech:'暗色科技'};
  const animations = {fade:'淡入',rise:'上滑',zoom:'缩放',stagger:'逐条出现'};
  const modes = {slides:'翻页演示',scroll:'长页滚动'};
  const css = `
:root[data-cf-theme="business"]{--bg:#f4f6fa;--panel:#ffffff;--text:#1c2637;--muted:#586477;--accent:#dce8ff;--primary:#2458be;--line:#c9d2e1;--cf-radius:8px;--cf-shadow:none}
.theme-dark[data-cf-theme="business"]{--bg:#161c27;--panel:#222c3b;--text:#f0f4fb;--muted:#b0bfd4;--accent:#304977;--primary:#a5c6ff;--line:#4f6079;--cf-radius:8px;--cf-shadow:none}
:root[data-cf-theme="paper"]{--bg:#f3f0e6;--panel:#fffdf6;--text:#24271d;--muted:#5d6251;--accent:#d1ed89;--primary:#47631e;--line:#b7bda7;--cf-radius:16px;--cf-shadow:4px 4px 0 var(--line)}
.theme-dark[data-cf-theme="paper"]{--bg:#20251b;--panel:#2c3424;--text:#f4f4e6;--muted:#c1c8b0;--accent:#455c2c;--primary:#c6e58f;--line:#626e50;--cf-radius:16px;--cf-shadow:4px 4px 0 var(--line)}
:root[data-cf-theme="tech"]{--bg:#101725;--panel:#1b283b;--text:#f0f5ff;--muted:#afbed4;--accent:#243e61;--primary:#8fcaff;--line:#49617f;--cf-radius:12px;--cf-shadow:none}
.theme-dark[data-cf-theme="tech"]{--bg:#0b111d;--panel:#152237;--text:#f0f5ff;--muted:#afbed4;--accent:#203b60;--primary:#8fcaff;--line:#49617f;--cf-radius:12px;--cf-shadow:none}
html[data-cf-theme]{background:var(--bg);color:var(--text);font:16px/1.6 Inter,"HarmonyOS Sans SC","Microsoft YaHei",sans-serif}
html[data-cf-theme] body{margin:0;padding:0;background:var(--bg);color:var(--text)}
html[data-cf-theme] *{box-sizing:border-box}
[data-slide]{padding:48px;min-height:100vh;background:var(--bg);color:var(--text)}
[data-slide] h1{font-size:clamp(32px,5vw,64px);line-height:1.2;max-width:800px;margin:24px 0}
[data-slide] h2{font-size:24px;margin:16px 0}
[data-slide] p{max-width:720px;color:var(--muted)}
[data-slide] small{font-size:12px;color:var(--muted)}
[data-slide] .cf-kicker{color:var(--primary);font-weight:700;letter-spacing:2px}
[data-slide] .cf-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin:32px 0}
[data-slide] .cf-card{padding:24px;background:var(--panel);border:1px solid var(--line);border-radius:var(--cf-radius);box-shadow:var(--cf-shadow)}
[data-slide] .cf-highlight{background:var(--accent);padding:16px 24px;border-radius:var(--cf-radius)}
[data-slide] button,[data-cf-controls] button{font:inherit;font-size:14px;padding:8px 16px;min-height:40px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--text);cursor:pointer}
[data-slide] button:focus-visible,[data-cf-controls] button:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
[data-slide] button:active,[data-cf-controls] button:active{opacity:.7}
html[data-cf-mode="slides"] [data-slide]{display:none;padding-bottom:112px}
html[data-cf-mode="slides"] [data-slide][data-cf-active]{display:block}
html[data-cf-mode="scroll"] [data-slide]{display:block;border-bottom:1px solid var(--line)}
[data-cf-controls]{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:30;display:flex;gap:12px;align-items:center;padding:8px 12px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--text);font-size:12px}
[data-cf-controls] button:disabled{opacity:.4;cursor:default}
[data-cf-counter]{min-width:48px;text-align:center}
[data-cf-enter] [data-animate]{animation:cf-fade .4s ease-out both}
html[data-cf-animation="rise"] [data-cf-enter] [data-animate]{animation-name:cf-rise}
html[data-cf-animation="zoom"] [data-cf-enter] [data-animate]{animation-name:cf-zoom}
html[data-cf-animation="stagger"] [data-cf-enter] [data-animate]{animation-name:cf-rise;animation-delay:calc(var(--cf-order,0)*100ms)}
@keyframes cf-fade{from{opacity:0}to{opacity:1}}
@keyframes cf-rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes cf-zoom{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
@media(prefers-reduced-motion:reduce){[data-cf-enter] [data-animate]{animation:none!important}}
@media(max-width:760px){[data-slide]{padding:24px}[data-slide] .cf-cards{grid-template-columns:1fr}}
`;
  function runtime() {
    const root = document.documentElement;
    const slides = [...document.querySelectorAll('[data-slide]')];
    if (!slides.length) return;
    let index = 0;
    const controls = document.createElement('nav'); controls.setAttribute('data-cf-controls',''); controls.setAttribute('aria-label','演示文稿翻页');
    const previous = document.createElement('button'); previous.textContent = '上一页';
    const counter = document.createElement('span'); counter.setAttribute('data-cf-counter',''); counter.setAttribute('aria-live','polite');
    const next = document.createElement('button'); next.textContent = '下一页';
    controls.append(previous,counter,next); document.body.append(controls);
    function enter(slide) {
      slide.removeAttribute('data-cf-enter');
      void slide.offsetWidth;
      slide.querySelectorAll('[data-animate]').forEach((el,i) => el.style.setProperty('--cf-order',i));
      slide.setAttribute('data-cf-enter','');
    }
    function show(number) {
      index = Math.max(0,Math.min(slides.length-1,number));
      slides.forEach((el,i) => el.toggleAttribute('data-cf-active',i === index));
      counter.textContent = (index+1)+' / '+slides.length;
      previous.disabled = index === 0; next.disabled = index === slides.length-1;
      if (root.dataset.cfMode === 'slides') { enter(slides[index]); window.scrollTo(0,0); }
    }
    previous.onclick = () => show(index-1); next.onclick = () => show(index+1);
    controls.hidden = root.dataset.cfMode !== 'slides';
    // hidden attribute must beat the controls' display:flex rule.
    if (controls.hidden) controls.style.display = 'none';
    document.addEventListener('keydown', e => {
      if (root.dataset.cfMode !== 'slides' || e.target.closest('input,textarea,select,button,[contenteditable]')) return;
      if (['ArrowRight','PageDown'].includes(e.key)) { e.preventDefault(); show(index+1); }
      if (['ArrowLeft','PageUp'].includes(e.key)) { e.preventDefault(); show(index-1); }
    });
    document.addEventListener('cf-show-page', e => { if (slides.includes(e.detail)) show(slides.indexOf(e.detail)); });
    show(0);
    if (root.dataset.cfMode === 'scroll') {
      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { enter(entry.target); observer.unobserve(entry.target); } }),{threshold:.15});
        slides.forEach(slide => observer.observe(slide));
      } else slides.forEach(enter);
    }
  }
  function apply(doc, config) {
    if (!doc.querySelector('[data-slide]')) throw new Error('此文件尚未采用预设规范。请加载三页示例，或复制生成规范交给 AI 转换。');
    for (const [key,values] of [['theme',themes],['animation',animations],['mode',modes]]) {
      if (!Object.hasOwn(values,config[key])) throw new Error('未知预设：'+key);
      doc.documentElement.dataset['cf'+key[0].toUpperCase()+key.slice(1)] = config[key];
    }
    let style = doc.getElementById('cf-preset-style');
    if (!style) { style = doc.createElement('style'); style.id = 'cf-preset-style'; doc.head.append(style); }
    style.textContent = css;
    let script = doc.getElementById('cf-preset-runtime');
    if (!script) { script = doc.createElement('script'); script.id = 'cf-preset-runtime'; doc.body.append(script); }
    script.textContent = '('+runtime.toString()+')();';
    return doc;
  }
  const contract = `生成 CanvasFlow 可编辑 HTML 演示稿，返回完整单文件 HTML：
1. 每页用 body 的直接子元素 section[data-slide] 表示；页内按阅读顺序排列，全部内容静态写入源码，不用 JavaScript 动态生成正文。
2. 需要入场的标题、段落、卡片加 data-animate="title" 或 data-animate="item"；嵌套元素不要同时标记，避免重复动画。
3. 主题颜色仅使用 var(--bg)、var(--panel)、var(--text)、var(--muted)、var(--accent)、var(--primary)、var(--line)。卡片圆角用 var(--cf-radius)，阴影用 var(--cf-shadow)。可使用 cf-kicker / cf-cards / cf-card / cf-highlight 样式类。
4. 不自行实现翻页、全局键盘监听、入场动画或固定导航，这些由软件统一注入。不要给页面设 display:none、绝对定位舞台或固定画布尺寸。
5. 内联 CSS 只负责自定义布局，避免 !important 和写死主题颜色；文字使用普通 HTML 元素，可单独编辑；每个业务元素建议有稳定 id。
6. 图片尽量使用内嵌 data URL；页面不依赖外部库，不发起网络请求。保留视口 meta、中文 UTF-8 编码。浏览方式可选翻页或滚动；一页一个清晰主题，不自动把长文章随意拆页。
7. 若修改已有文件，请保留 cf-preset-style 和 cf-preset-runtime 及 html 上的 data-cf-* 配置，不要把运行时导航和 data-cf-active / data-cf-enter 标记抄入正文。`;
  function example() {
    const doc = new DOMParser().parseFromString(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>从想法到作品 · 预设体验</title></head><body>
<section data-slide id="cover"><small class="cf-kicker" data-animate="item">CANVASFLOW / PRESET LAB / 01</small><h1 data-animate="title" id="cover-title">把想法变成<br>可以分享的作品。</h1><p data-animate="item">同一份内容，切换视觉主题、入场动画和浏览方式。进入「交互演示」体验动画与翻页。</p><p class="cf-highlight" data-animate="item">AI 负责内容，软件管理效果，你决定细节。</p></section>
<section data-slide id="workflow"><small class="cf-kicker" data-animate="item">02 / WORKFLOW</small><h1 data-animate="title">从生成到分享。</h1><div class="cf-cards"><article class="cf-card" data-animate="item"><small>01 / CREATE</small><h2>与 AI 一起创作</h2><p>先约定页面结构，再生成第一版。</p></article><article class="cf-card" data-animate="item"><small>02 / REFINE</small><h2>细节由你决定</h2><p>局部修改文字和样式，源码同步保存。</p></article><article class="cf-card" data-animate="item"><small>03 / SHARE</small><h2>带走完整作品</h2><p>动画和翻页逻辑随 HTML 一起导出。</p></article></div></section>
<section data-slide id="finish"><small class="cf-kicker" data-animate="item">03 / TRY IT</small><h1 data-animate="title">让内容有自己的节奏。</h1><p data-animate="item">试试纸张贴纸配合逐条出现，或暗色科技配合缩放。</p><div class="cf-card" data-animate="item"><h2>预设可切换，内容保持不变。</h2><p>手动设置的局部样式会优先保留；导出后的文件无需安装任何插件。</p></div></section>
</body></html>`,'text/html');
    return apply(doc,{theme:'business',animation:'fade',mode:'slides'});
  }
  window.CanvasFlowHtmlPresets = {themes,animations,modes,apply,example,contract};
})();
