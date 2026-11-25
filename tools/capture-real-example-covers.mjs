#!/usr/bin/env node
// 经用户授权后使用：隔离浏览器截图真实节点 DOM；不启动服务，不读项目数据。
// 依赖 playwright-core（可通过 CANVASFLOW_PLAYWRIGHT 指定模块绝对路径）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CANVASFLOW_PLAYWRIGHT || 'playwright-core');
const root = path.resolve(import.meta.dirname, '..');
const modulePath = path.join(root, 'modules/canvas-examples.js');
const source = fs.readFileSync(modulePath, 'utf8');
const match = source.match(/window\.CANVASFLOW_EXAMPLES\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
const examples = JSON.parse(match[1]);
const language = process.argv.includes('--en') ? 'en' : 'zh-CN';
const ids = new Set(process.argv.slice(2).filter(arg => arg !== '--en'));
const selected = examples.filter(e => !ids.size || ids.has(e.id));
if (!selected.length) throw new Error('没有匹配的案例');
const executablePath = [process.env.CANVASFLOW_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => p && fs.existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
const requests = [];
const errors = [];
// 所有请求由文件白名单应答：无监听端口、无外网、无用户数据目录、无 API 写入。
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== 'http://127.0.0.1:19997' || url.pathname.startsWith('/api/')) {
    requests.push(url.pathname);
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  }
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).slice(1);
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !/^(index\.html|app\.js|styles\.css|model-catalog\.js|canvas-runtime\.js|dev-flag\.js|modules\/[^/]+\.js|assets\/.*\.(woff2?|ttf|png|webp|svg))$/.test(relative)) return route.fulfill({ status: 404, body: '' });
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
  let body = fs.readFileSync(file);
  if (relative === 'app.js') {
    let js = body.toString('utf8');
    const initCall = 'init().catch(e => { console.error("[初始化] 启动失败", e); toast("启动失败：" + e.message); });';
    if (!js.includes(initCall)) throw new Error('初始化入口变化，拒绝运行');
    js = js.replace(initCall, '// 隔离截图：不恢复项目、不启动后台初始化');
    js = js.replace('setInterval(pollBrowserImageTransfers, 2500);', '').replace(/^pollBrowserImageTransfers\(\);/m, '');
    body = Buffer.from(js);
  }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  return route.fulfill({ status: 200, contentType: types[path.extname(file)] || 'application/octet-stream', body });
});
try {
  const page = await context.newPage(); // 临时上下文只有这一个新标签
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:19997/', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof renderNodes === 'function' && window.CANVASFLOW_EXAMPLES?.length);
  await page.addStyleTag({ content: '#viewport{position:fixed;inset:0;width:100vw;height:100vh} #app > :not(#viewport), #viewport > :not(#world){visibility:hidden} #world{transform-origin:0 0}' });
  const report = [];
  for (const example of selected) {
    const bounds = await page.evaluate(async ({ id, language }) => {
      const example = window.CANVASFLOW_EXAMPLES.find(e => e.id === id);
      uiLanguage = language;
      state.nodes = structuredClone(example.nodes);
      state.edges = structuredClone(example.edges);
      state.canvasGroupFrames = {};
      state.canvasGroupNames = structuredClone(example.groupNames);
      state.canvasGroupCollapsed = {};
      state.selected = new Set();
      state.pages = [];
      state.view = { x: 0, y: 0, scale: 1 };
      document.getElementById('app').classList.add('theme-dark');
      normalizeNodeSizes();
      renderNodes({ force: true });
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('#nodes img')].map(img => img.decode().catch(() => {})));
      renderNodes({ force: true });
      await Promise.all([...document.querySelectorAll('#nodes img')].map(img => img.decode().catch(() => {})));
      renderNodes({ force: true });
      const bounds = canvasGroupBounds(state.nodes);
      const scale = Math.min(1, 1600 / bounds.w, 1050 / bounds.h);
      state.view = { x: 20 - bounds.x * scale, y: 20 - bounds.y * scale, scale };
      applyView();
      renderNodes({ force: true });
      renderEdges();
      translateUiTree(document.getElementById("nodes"));
      return { x: 19, y: 19, width: Math.ceil(bounds.w * scale) + 2, height: Math.ceil(bounds.h * scale) + 2, nodes: state.nodes.length, edges: state.edges.length };
    }, { id: example.id, language });
    await page.evaluate(async () => { await Promise.all([...document.querySelectorAll('#nodes img')].map(img => img.decode().catch(() => {}))); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    const output = path.join(root, 'assets/examples', `${example.id}${language === "en" ? ".en" : ""}.png`);
    const { nodes, edges, ...clip } = bounds;
    await page.screenshot({ path: output, clip });
    const hash = crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex').slice(0, 12);
    const coverField = language === "en" ? "coverEn" : "cover";
    example[coverField] = `assets/examples/${path.basename(output)}?v=${hash}`;
    report.push({ id: example.id, title: example.title, nodes, edges, cover: example[coverField], width: clip.width * 2, height: clip.height * 2 });
    console.log(`已截图：${example.title} (${clip.width * 2}×${clip.height * 2})`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  fs.writeFileSync(modulePath, source.slice(0, match.index) + `window.CANVASFLOW_EXAMPLES = ${JSON.stringify(examples)};\n`);
  fs.writeFileSync(path.join(root, language === 'en' ? 'tools/real-covers-report.en.json' : 'tools/real-covers-report.json'), JSON.stringify({ renderer: '真实 app.js DOM + styles.css / Chromium screenshot', blockedRequests: [...new Set(requests)], errors, covers: report }, null, 2) + '\n');
} finally { await browser.close(); }

