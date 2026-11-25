// PR-5 图片批注编辑层测试（2026-11-14 编辑现场移入灯箱后重写）：
// vm 切片真实源码（图钉/面板行标记、操作面定位、增删改）+ 静态接线断言。
// 交互侧（指针手势/焦点管理）依赖真实 DOM，属人工 GUI 验收范围；此处覆盖可自动验证的数据与标记逻辑。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const annotations = require('../modules/image-annotations.js');

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
const css = fs.readFileSync(require.resolve('../styles.css'), 'utf8');

function runSlice(startMarker, endMarker, context = {}) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `marker not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `end marker not found: ${endMarker}`);
  vm.runInNewContext(source.slice(start, end), context);
  return context;
}

function makeNode(annotationsList, id = 'n1') {
  const node = { id, type: 'image', image: 'data:image/png;base64,AAA' };
  annotations.writeNodeAnnotations(node, annotationsList);
  return node;
}
const pointAnn = (x, y, content, id) => ({ annotationId: id, type: 'point', coordinates: { x, y }, content, created: 0 });
const rectAnn = (x, y, w, h, content, id) => ({ annotationId: id, type: 'rectangle', coordinates: { x, y, width: w, height: h }, content, created: 0 });

// ===== 图钉 / 面板行标记 =====

test('图钉标记：点位/矩形按归一化百分比定位，带 ① 序号与删除按钮，无内嵌输入框', () => {
  const ctx = runSlice('function lightboxAnnotationPinMarkup(', 'function renderLightboxAnnotation(', {
    escapeHtml: v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    annotationModule: () => annotations,
  });
  const point = ctx.lightboxAnnotationPinMarkup(makeNode([pointAnn(.25, .75, '左下角')]).imageAnnotations[0]);
  assert.ok(point.includes('data-role="annotation-pin"'));
  // 点位图钉带 clamp 边界内偏移：原始归一化值仍在表达式中，锚点数据不变
  assert.ok(point.includes('style="left:clamp(11px, 25%, calc(100% - 11px));top:clamp(11px, 75%, calc(100% - 11px));"'), '点位 clamp 定位');
  assert.ok(point.includes('①'));
  assert.match(point, /data-role="annotation-delete"[^>]*aria-label="删除批注1"/);
  assert.ok(!point.includes('textarea')); // 内容改在右侧面板填写
  const rect = ctx.lightboxAnnotationPinMarkup(rectAnn(.1, .2, .3, .4, '换掉这块', 'r1'));
  assert.ok(rect.includes('width:30%;height:40%;')); // 矩形尺寸
  assert.ok(rect.includes('left:10%;top:20%;')); // 矩形位置（无需 clamp）
});

test('四角边界：贴边点位 clamp 均保留原始坐标且不出操作面', () => {
  const ctx = runSlice('function lightboxAnnotationPinMarkup(', 'function renderLightboxAnnotation(', {
    escapeHtml: String,
    annotationModule: () => annotations,
  });
  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (const [x, y] of corners) {
    const markup = ctx.lightboxAnnotationPinMarkup(makeNode([pointAnn(x, y, '角')]).imageAnnotations[0]);
    assert.ok(markup.includes(`clamp(11px, ${Math.round(x * 1000) / 10}%, calc(100% - 11px))`), `x=${x} 原始值保留`);
    assert.ok(markup.includes(`clamp(11px, ${Math.round(y * 1000) / 10}%, calc(100% - 11px))`), `y=${y} 原始值保留`);
  }
  // 数据未被 markup 改写：节点批注坐标与输入一致
  const node = makeNode([pointAnn(0.02, 0.98, '贴边')]);
  ctx.lightboxAnnotationPinMarkup(node.imageAnnotations[0]);
  assert.equal(node.imageAnnotations[0].coordinates.x, 0.02);
  assert.equal(node.imageAnnotations[0].coordinates.y, 0.98);
});

test('面板行标记：序号 + 内容输入框 + 删除，内容经 HTML 转义', () => {
  const ctx = runSlice('function lightboxAnnotationPinMarkup(', 'function renderLightboxAnnotation(', {
    escapeHtml: v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    annotationModule: () => annotations,
  });
  const row = ctx.lightboxAnnotationRowMarkup(makeNode([pointAnn(.5, .5, '<b>改色</b> & "加字"')]).imageAnnotations[0]);
  assert.ok(row.includes('data-role="annotation-content"'));
  assert.ok(row.includes('&lt;b&gt;改色&lt;/b&gt; &amp; &quot;加字&quot;'));
  assert.match(row, /data-role="annotation-delete"[^>]*aria-label="删除批注1"/);
  assert.ok(row.includes('placeholder="批注内容（可留空）"'));
});

// ===== 渲染（图钉进操作面 / 内容进面板） =====

test('renderLightboxAnnotation：图钉进操作面、内容进右侧列表，空列表显示占位提示', () => {
  const node = makeNode([pointAnn(.25, .75, '左下角'), rectAnn(.1, .2, .3, .4, '换掉这块')]);
  let surfaceHtml = '', listHtml = '';
  const els = {
    lightboxAnnotationSurface: { set innerHTML(v) { surfaceHtml = v; } },
    lightboxAnnotationList: { set innerHTML(v) { listHtml = v; } },
    lightboxImg: { naturalWidth: 0 }, // 未加载：定位函数提前返回
  };
  const ctx = runSlice('function lightboxAnnotationPinMarkup(', 'function renderLightboxAnnotation(', {
    escapeHtml: String,
    annotationModule: () => annotations,
  });
  // 第二个切片复用同一上下文对象（含图钉/面板行标记），下游函数引用才可解析
  runSlice('function renderLightboxAnnotation(', 'let annotationDraft = null;', Object.assign(ctx, {
    els,
    findNode: () => node,
    lightboxAnnotationNodeId: 'n1',
    pushHistory: () => {},
  }));
  ctx.lightboxAnnotationNode = () => ctx.findNode('n1'); // 定义在切片上游，测试注入桩
  ctx.renderLightboxAnnotation();
  assert.ok(surfaceHtml.includes('data-role="annotation-pin"'));
  assert.ok(surfaceHtml.includes('image-annotation-pin rectangle'));
  assert.ok(listHtml.includes('data-role="annotation-content"'));
  assert.ok(listHtml.includes('左下角'));
  // 空列表：面板显示占位提示
  const empty = makeNode([]);
  ctx.findNode = () => empty;
  ctx.renderLightboxAnnotation();
  assert.ok(!surfaceHtml.includes('image-annotation-pin'));
  assert.ok(listHtml.includes('暂无批注'));
});

test('positionLightboxAnnotationSurface：按灯箱图片元素框定位操作面', () => {
  const surface = { style: {} };
  const els = {
    lightbox: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    lightboxImg: { naturalWidth: 800, getBoundingClientRect: () => ({ left: 40, top: 25, width: 320, height: 160 }) },
    lightboxAnnotationSurface: surface,
  };
  const ctx = runSlice('function positionLightboxAnnotationSurface(', 'function annotationSurfacePoint(', {
    els,
    lightboxAnnotationNodeId: 'n1',
  });
  ctx.positionLightboxAnnotationSurface();
  assert.equal(surface.style.left, '40px');
  assert.equal(surface.style.top, '25px');
  assert.equal(surface.style.width, '320px');
  assert.equal(surface.style.height, '160px');
  // 图片未加载完成（naturalWidth 0）不定位
  const els2 = {
    lightbox: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    lightboxImg: { naturalWidth: 0, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) },
    lightboxAnnotationSurface: { style: {} },
  };
  const ctx2 = runSlice('function positionLightboxAnnotationSurface(', 'function annotationSurfacePoint(', {
    els: els2,
    lightboxAnnotationNodeId: 'n1',
  });
  ctx2.positionLightboxAnnotationSurface();
  assert.equal(els2.lightboxAnnotationSurface.style.left, undefined);
});

// ===== 数据增删改（重编号/历史入栈） =====

function runMutationContext(node) {
  const pushes = [], renders = [];
  const ctx = runSlice('function annotationSurfacePoint(', 'let annotationDraft = null;', {
    pushHistory: () => pushes.push(1),
    renderLightboxAnnotation: () => renders.push(1),
    annotationModule: () => annotations,
  });
  ctx.node = node;
  ctx.pushes = pushes;
  ctx.renders = renders;
  return ctx;
}

test('addNodeAnnotation：点位追加，返回带新生成 ID 的规范化条目', () => {
  const node = makeNode([pointAnn(.1, .1, '一')]);
  const ctx = runMutationContext(node);
  const created = ctx.addNodeAnnotation(node, { type: 'point', coordinates: { x: 1.7, y: -.3 }, content: '' });
  assert.equal(node.imageAnnotations.length, 2);
  assert.equal(created.coordinates.x, 1); // 写入时归一化钳制
  assert.equal(created.coordinates.y, 0);
  assert.ok(created.annotationId && created.annotationId.startsWith('ann-'));
  assert.deepEqual(node.imageAnnotations.map(i => i.index), [1, 2]);
});

test('deleteNodeAnnotation：删除后重新编号且坐标保持', () => {
  const node = makeNode([pointAnn(.1, .1, '一'), rectAnn(.2, .2, .3, .3, '二'), pointAnn(.5, .5, '三')]);
  const ctx = runMutationContext(node);
  const victim = node.imageAnnotations[1].annotationId;
  ctx.deleteNodeAnnotation(node, victim);
  assert.deepEqual(node.imageAnnotations.map(i => i.content), ['一', '三']);
  assert.deepEqual(node.imageAnnotations.map(i => i.index), [1, 2]); // 删除后重新编号
  assert.equal(ctx.pushes.length, 1);
  assert.equal(ctx.renders.length, 1); // 面板刷新
});

test('saveAnnotationContent：变更入栈返回 true，无变化不入栈返回 false', () => {
  const node = makeNode([pointAnn(.5, .5, '原文')]);
  const ctx = runMutationContext(node);
  assert.equal(ctx.saveAnnotationContent(node, node.imageAnnotations[0].annotationId, '改成蓝色'), true);
  assert.equal(node.imageAnnotations[0].content, '改成蓝色');
  assert.equal(ctx.pushes.length, 1);
  // 无变化：不 pushHistory
  assert.equal(ctx.saveAnnotationContent(node, node.imageAnnotations[0].annotationId, '改成蓝色'), false);
  assert.equal(ctx.pushes.length, 1);
  // comments 兼容路径：legacy 节点保存后规范化
  const legacy = { id: 'n2', comments: [{ id: 'c1', text: '旧', x: .3, y: .4 }] };
  const legacyId = annotations.readNodeAnnotations(legacy)[0].annotationId;
  assert.equal(ctx.saveAnnotationContent(legacy, legacyId, '新内容'), true);
  assert.equal(legacy.comments, undefined);
  assert.equal(legacy.imageAnnotations[0].content, '新内容');
});

// ===== 操作面几何 =====

test('annotationSurfacePoint：事件坐标 → 归一化操作面坐标', () => {
  const ctx = runSlice('function annotationSurfacePoint(', 'function addNodeAnnotation(', {
    annotationModule: () => annotations,
  });
  const surface = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 200, height: 100 }) };
  const center = ctx.annotationSurfacePoint(surface, 200, 100); // vm realm 对象：逐字段比较
  assert.equal(center.x, .5);
  assert.equal(center.y, .5);
  const origin = ctx.annotationSurfacePoint(surface, 100, 50);
  assert.equal(origin.x, 0); assert.equal(origin.y, 0);
  const corner = ctx.annotationSurfacePoint(surface, 300, 150);
  assert.equal(corner.x, 1); assert.equal(corner.y, 1);
});

// ===== 灯箱模式开关与草稿冲刷 =====

test('flushLightboxAnnotationDraft：正在输入的批注在关闭灯箱前保存', () => {
  const node = makeNode([pointAnn(.5, .5, '原文', 'p1')]);
  const saved = [];
  const ctx = runSlice('async function startImageAnnotationEditor(', 'function lightboxAnnotationPinMarkup(', {
    lightboxAnnotationNodeId: 'n1',
    findNode: () => node,
    saveAnnotationContent: (n, id, v) => { saved.push([id, v]); },
    els: { lightboxAnnotationList: { contains: () => true } },
    document: { activeElement: { dataset: { role: 'annotation-content', annotationId: node.imageAnnotations[0].annotationId }, value: '改成红色' } },
  });
  ctx.flushLightboxAnnotationDraft();
  assert.deepEqual(saved, [[node.imageAnnotations[0].annotationId, '改成红色']]);
  // 非批注输入框不冲刷；非批注模式直接跳过
  ctx.document = { activeElement: { dataset: { role: 'text' }, value: 'x' } };
  ctx.flushLightboxAnnotationDraft();
  assert.equal(saved.length, 1);
  const ctx2 = runSlice('async function startImageAnnotationEditor(', 'function lightboxAnnotationPinMarkup(', {
    lightboxAnnotationNodeId: '',
    document: { activeElement: null },
  });
  ctx2.flushLightboxAnnotationDraft(); // 不抛错即通过
});

// ===== 静态接线断言 =====

test('接线：右键菜单/灯箱模式开关/面板事件/关闭冲刷全部就位，旧节点覆盖层已移除', () => {
  assert.ok(source.includes('["编辑图片批注", () => startImageAnnotationEditor(selectedNode)]'), '右键菜单项');
  assert.ok(source.includes('els.lightbox.classList.add("is-annotating")'), '灯箱批注模式开关');
  assert.ok(source.includes('els.lightboxAnnotationSurface.addEventListener("pointerdown"'), '操作面手势接线');
  assert.ok(source.includes('els.lightboxAnnotationList.addEventListener("focusout"'), '面板失焦提交');
  assert.ok(source.includes('function flushLightboxAnnotationDraft(') && /hideLightbox\(\) \{[\s\S]*?flushLightboxAnnotationDraft\(\)/.test(source), '关闭灯箱前冲刷草稿');
  assert.ok(/hideLightbox\(\) \{[\s\S]*?exitLightboxAnnotation\(\)/.test(source), '灯箱关闭退出批注模式');
  assert.ok(source.includes('els.lightboxImg.addEventListener("load", () => positionLightboxAnnotationSurface())'), '图片加载重对齐操作面');
  assert.ok(source.includes('window.addEventListener("resize", () => positionLightboxAnnotationSurface())'), '窗口缩放重对齐操作面');
  assert.ok(!source.includes('annotationEditorNodeId'), '旧节点覆盖层状态已移除');
  assert.ok(!source.includes('imageAnnotationEditorMarkup') && !source.includes('imageAnnotationToolbarMarkup'), '旧标记函数已移除');
  assert.ok(!source.includes('data-annotating'), '节点预览不再挂编辑层属性');
});

test('界面资产：灯箱批注 DOM 就位，?v= 递增，CSS 无裸色值、z-index 在节点内部档（1–9）', () => {
  assert.ok(html.includes('app.js?v=20261124-videocard5') && html.includes('styles.css?v=20261124-videocard5'));
  for (const id of ['lightboxAnnotationSurface', 'lightboxAnnotationPanel', 'lightboxAnnotationList', 'lightboxAnnotationDone']) {
    assert.ok(html.includes(`id="${id}"`), `index.html 缺少 #${id}`);
  }
  const start = css.indexOf('/* ===== PR-5 图片批注编辑层');
  assert.ok(start > 0, '批注编辑层 CSS 必须存在');
  const block = css.slice(start);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), '无裸色值');
  assert.ok(!/rgba?\(/.test(block), '无裸 rgba');
  const z = [...block.matchAll(/z-index:\s*(\d+)/g)].map(m => Number(m[1]));
  for (const v of z) assert.ok(v >= 1 && v <= 9, `z-index ${v} 必须在节点内部档`);
  for (const token of ['var(--primary)', 'var(--danger)', 'var(--inverse-text)', 'var(--panel)', 'var(--muted)']) {
    assert.ok(block.includes(token), `使用语义令牌 ${token}`);
  }
});

// ===== 端到端贯通：灯箱编辑写入 → 发送准备消费 =====

test('端到端：灯箱编辑新增的点位/矩形批注经发送准备生成尾部定位图，编号与位置一致', async () => {
  const node = makeNode([]);
  const ctx = runMutationContext(node);
  // 模拟用户在大图上操作：点击加点、拖拽框选、面板填写内容
  ctx.addNodeAnnotation(node, { type: 'point', coordinates: { x: .2, y: .3 }, content: '左上改色' });
  const created = ctx.addNodeAnnotation(node, { type: 'rectangle', coordinates: { x: .5, y: .5, width: .3, height: .2 }, content: '右下替换' });
  created && (node.imageAnnotations.at(-1).content = '右下替换');
  // imageRef 形状（collectUpstreamForAI 产出）携带批注
  const ref = { image: 'photo.png', assetId: '', fileName: 'photo.png', mime: 'image/png', _nodeId: node.id, hasColorArrowNotes: false, annotations: annotations.readNodeAnnotations(node) };
  const sent = await annotations.prepareSubmission('全局风格', [ref], async r => ({ image: `locator:${r.image}` }));
  assert.deepEqual(sent.references.map(i => i.image), ['photo.png', 'locator:photo.png']); // 定位图尾部追加
  assert.match(sent.prompt, /全局要求：全局风格/);
  assert.match(sent.prompt, /原始参考图第 1 张；第 2 张为对应的编号定位图：/);
  assert.match(sent.prompt, /- 批注① \[定位点：\(20%, 30%\)\]：左上改色/);
  assert.match(sent.prompt, /- 批注② \[矩形区域：左上角 \(50%, 50%\)，宽 30%，高 20%\]：右下替换/);
  // 位置一致性：操作面图钉与定位图几何同一坐标
  const geometry = annotations.computeLocatorGeometry(400, 200, sent.references[0].annotations);
  assert.equal(geometry.markers[0].label, '①');
  assert.ok(Math.abs(geometry.markers[0].x - .2 * 400) < 1e-9);
  assert.equal(geometry.markers[1].kind, 'rectangle');
});
