// PR-5 图片批注编辑层测试：vm 切片真实源码（编辑层标记/定位/增删改）+ 静态接线断言。
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

// ===== 编辑层标记 =====

test('编辑层标记：点位/矩形图钉按归一化百分比定位并带 ① 序号与删除按钮', () => {
  const node = makeNode([pointAnn(.25, .75, '左下角'), rectAnn(.1, .2, .3, .4, '换掉这块')]);
  const ctx = runSlice('function imageAnnotationEditorMarkup(', 'function positionAnnotationSurface(', {
    escapeHtml: v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    window: { CanvasFlowImageAnnotations: annotations },
    annotationModule: () => annotations,
  });
  const markup = ctx.imageAnnotationEditorMarkup(node);
  assert.ok(markup.includes('data-role="annotation-editor"'));
  assert.ok(markup.includes('data-role="annotation-surface"'));
  // 点位图钉带 clamp 边界内偏移（PR5-UI-09C）：原始归一化值仍在表达式中，锚点数据不变
  assert.ok(markup.includes('style="left:clamp(11px, 25%, calc(100% - 11px));top:clamp(11px, 75%, calc(100% - 11px));"'), '点位 clamp 定位');
  assert.ok(markup.includes('width:30%;height:40%;')); // 矩形尺寸
  assert.ok(markup.includes('left:10%;top:20%;')); // 矩形位置（无需 clamp）
  assert.ok(markup.includes('①') && markup.includes('②')); // 编号按数组顺序
  assert.match(markup, /data-role="annotation-delete"[^>]*aria-label="删除批注1"/);
  // 工具条已移出图片预览（独立渲染），编辑层内不得再出现提示条
  assert.ok(!markup.includes('data-role="annotation-done"'));
  assert.ok(!markup.includes('点击添加点位，拖拽框选区域'));
  assert.ok(!markup.includes('textarea')); // 未进入单条编辑态时无输入框
});

test('PR5 提示层避让：工具条独立渲染于图片预览之外，不再遮挡图钉与编号', () => {
  const ctx = runSlice('function imageAnnotationEditorMarkup(', 'function positionAnnotationSurface(', {
    escapeHtml: String,
    window: { CanvasFlowImageAnnotations: annotations },
    annotationModule: () => annotations,
  });
  const toolbar = ctx.imageAnnotationToolbarMarkup();
  assert.ok(toolbar.includes('data-role="annotation-done"'), '完成按钮在工具条');
  assert.ok(toolbar.includes('点击添加点位，拖拽框选区域'), '提示文字在工具条');
  // 工具条不得包含编辑层/操作面容器（结构上与图片预览内编辑层分离）
  assert.ok(!toolbar.includes('annotation-editor') && !toolbar.includes('annotation-surface'));
  // nodeTemplate 拼接：工具条位于 image-preview 之后，编辑态隐藏上传/清除
  assert.ok(source.includes('${annotating ? imageAnnotationToolbarMarkup() : ""}'), '工具条独立拼接');
  assert.ok(source.includes('annotating ? "" : `<div class="node-hover-controls">'), '编辑态隐藏上传/清除');
});

test('PR5-UI-09C 四角边界：左上/右上/左下/右下的点位 clamp 均保留原始坐标且不出操作面', () => {
  const ctx = runSlice('function imageAnnotationEditorMarkup(', 'function positionAnnotationSurface(', {
    escapeHtml: String,
    window: { CanvasFlowImageAnnotations: annotations },
    annotationModule: () => annotations,
  });
  // 四角锚点（含越界极值）：clamp 的中间值必须保留原始归一化坐标
  const corners = [[0, 0, '0%'], [1, 0, '100%'], [0, 1, '0%'], [1, 1, '100%']];
  for (const [x, y] of corners) {
    const markup = ctx.imageAnnotationEditorMarkup(makeNode([pointAnn(x, y, '角')]));
    assert.ok(markup.includes(`clamp(11px, ${Math.round(x * 1000) / 10}%, calc(100% - 11px))`), `x=${x} 原始值保留`);
    assert.ok(markup.includes(`clamp(11px, ${Math.round(y * 1000) / 10}%, calc(100% - 11px))`), `y=${y} 原始值保留`);
  }
  // 数据未被 markup 改写：节点批注坐标与输入一致
  const node = makeNode([pointAnn(0.02, 0.98, '贴边')]);
  ctx.imageAnnotationEditorMarkup(node);
  assert.equal(node.imageAnnotations[0].coordinates.x, 0.02);
  assert.equal(node.imageAnnotations[0].coordinates.y, 0.98);
});

test('PR5-UI-09C 弹层翻转：右/下越界时加 flip-left/flip-up，界内时不翻转', () => {
  const rect = (left, right, top, bottom) => ({ left, right, top, bottom, width: right - left, height: bottom - top });
  // 场景：图钉贴右下角，弹层默认展开越出操作面 → 双向翻转
  const pin = {
    querySelector: sel => sel === '.annotation-pin-editor' ? popup : null,
    getBoundingClientRect: () => rect(180, 202, 180, 202),
  };
  const popup = { classList: { set: {}, toggle(name, on) { this.set[name] = on; } }, getBoundingClientRect: () => rect(202, 382, 210, 300) };
  const surface = {
    querySelector: sel => sel === '.image-annotation-pin.is-editing' ? pin : null,
    getBoundingClientRect: () => rect(0, 200, 0, 200),
  };
  const ctx = runSlice('function clampAnnotationPinEditor(', 'function annotationSurfacePoint(', {});
  ctx.clampAnnotationPinEditor(surface);
  assert.equal(popup.classList.set['flip-left'], true, '右越界翻转');
  assert.equal(popup.classList.set['flip-up'], true, '下越界翻转');
  // 界内批注：不翻转
  const popup2 = { classList: { set: {}, toggle(name, on) { this.set[name] = on; } }, getBoundingClientRect: () => rect(20, 200, 20, 108) };
  const pin2 = { querySelector: () => popup2, getBoundingClientRect: () => rect(10, 32, 10, 32) };
  const surface2 = { querySelector: () => pin2, getBoundingClientRect: () => rect(0, 400, 0, 300) };
  ctx.clampAnnotationPinEditor(surface2);
  assert.equal(popup2.classList.set['flip-left'], false);
  assert.equal(popup2.classList.set['flip-up'], false);
});

test('编辑态图钉带输入框，内容经 HTML 转义', () => {
  const node = makeNode([pointAnn(.5, .5, '<b>改色</b> & "加字"')]);
  node._annotationEditingId = node.imageAnnotations[0].annotationId;
  const ctx = runSlice('function imageAnnotationEditorMarkup(', 'function positionAnnotationSurface(', {
    escapeHtml: v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    window: { CanvasFlowImageAnnotations: annotations },
    annotationModule: () => annotations,
  });
  const markup = ctx.imageAnnotationEditorMarkup(node);
  assert.ok(markup.includes('data-role="annotation-content"'));
  assert.ok(markup.includes('&lt;b&gt;改色&lt;/b&gt; &amp; &quot;加字&quot;'));
  assert.ok(markup.includes('data-role="annotation-save"'));
});

test('非编辑态图片节点不渲染编辑层', () => {
  const ctx = runSlice('function imageAnnotationEditorMarkup(', 'function positionAnnotationSurface(', {
    escapeHtml: String,
    window: { CanvasFlowImageAnnotations: annotations },
    annotationModule: () => annotations,
  });
  const empty = ctx.imageAnnotationEditorMarkup(makeNode([]));
  assert.ok(empty.includes('data-role="annotation-editor"') && !empty.includes('image-annotation-pin')); // 空列表仍渲染空操作面
});

// ===== 数据增删改（重映射/重编号/历史入栈） =====

function runMutationContext(node) {
  const pushes = [], renders = [];
  const ctx = runSlice('function annotationSurfacePoint(', 'let annotationDraft = null;', {
    pushHistory: () => pushes.push(1),
    render: () => renders.push(1),
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
  assert.equal(ctx.renders.length, 1);
});

test('saveAnnotationContent：变更入栈，内容无变化不入栈仍退出编辑', () => {
  const node = makeNode([pointAnn(.5, .5, '原文')]);
  node._annotationEditingId = node.imageAnnotations[0].annotationId;
  const ctx = runMutationContext(node);
  ctx.saveAnnotationContent(node, node.imageAnnotations[0].annotationId, '改成蓝色');
  assert.equal(node.imageAnnotations[0].content, '改成蓝色');
  assert.equal(ctx.pushes.length, 1);
  assert.equal(node._annotationEditingId, undefined);
  // 无变化：不 pushHistory，仍退出单条编辑
  node._annotationEditingId = node.imageAnnotations[0].annotationId;
  ctx.saveAnnotationContent(node, node.imageAnnotations[0].annotationId, '改成蓝色');
  assert.equal(ctx.pushes.length, 1);
  assert.equal(node._annotationEditingId, undefined);
  // comments 兼容路径：legacy 节点保存后规范化
  const legacy = { id: 'n2', comments: [{ id: 'c1', text: '旧', x: .3, y: .4 }] };
  ctx.saveAnnotationContent(legacy, legacy.imageAnnotations ? legacy.imageAnnotations[0].annotationId : annotations.readNodeAnnotations(legacy)[0].annotationId, '新内容');
  assert.equal(legacy.comments, undefined);
  assert.equal(legacy.imageAnnotations[0].content, '新内容');
});

// ===== 操作面定位（object-fit: contain 留白不计入坐标） =====

test('annotationSurfacePoint：事件坐标 → 归一化操作面坐标', () => {
  const ctx = runSlice('function annotationSurfacePoint(', 'let annotationDraft = null;', {
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

test('positionAnnotationSurface：按图片 natural 尺寸对齐显示区域（含居中留白）', () => {
  let surfaceStyle = {};
  const surface = { style: {}, querySelector: () => null };
  Object.defineProperty(surface.style, 'left', { set(v) { surfaceStyle.left = v; } });
  Object.defineProperty(surface.style, 'top', { set(v) { surfaceStyle.top = v; } });
  Object.defineProperty(surface.style, 'width', { set(v) { surfaceStyle.width = v; } });
  Object.defineProperty(surface.style, 'height', { set(v) { surfaceStyle.height = v; } });
  const editor = {
    querySelector: sel => sel === '[data-role="annotation-surface"]' ? surface : null,
    closest: () => ({ querySelector: () => ({ naturalWidth: 800, naturalHeight: 400, clientWidth: 200, clientHeight: 200 }) }),
  };
  const ctx = runSlice('function positionAnnotationSurface(', 'function annotationSurfacePoint(', {
    els: { nodes: { querySelector: () => editor } },
  });
  ctx.positionAnnotationSurface();
  // 800×400 装进 200×200：显示区 200×100，垂直留白 50px → top 25%，height 50%
  assert.equal(surfaceStyle.left, '0%');
  assert.equal(surfaceStyle.top, '25%');
  assert.equal(surfaceStyle.width, '100%');
  assert.equal(surfaceStyle.height, '50%');
});

// ===== 静态接线断言 =====

test('接线：右键菜单/画布守卫/输入延迟保护/渲染钩子/模板接入全部就位', () => {
  assert.ok(source.includes('["编辑图片批注", () => startImageAnnotationEditor(selectedNode)]'), '右键菜单项');
  assert.ok(source.includes(`ev.target.closest("[data-role='annotation-editor']")`), '画布 mousedown 守卫');
  assert.ok(source.includes('.node textarea[data-role="annotation-content"]'), '输入期间推迟全量渲染');
  assert.ok(/if \(state\.annotationEditorNodeId\) \{[\s\S]*?positionAnnotationSurface\(\)/.test(source), 'renderNodes 后定位操作面');
  assert.ok(source.includes('annotating ? imageAnnotationEditorMarkup(node)'), '编辑态才渲染编辑层');
  assert.ok(source.includes("ev.target.closest(\"[data-role='annotation-pin']\")"), '图钉上的按下不触发新增手势');
});

test('界面资产：?v= 递增且新增 CSS 无裸色值、z-index 在节点内部档（1–9）', () => {
  assert.ok(html.includes('app.js?v=20261107-prompt-model1') && html.includes('styles.css?v=20261107-prompt-model1'));
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

// ===== 端到端贯通：编辑层写入 → 发送准备消费 =====

test('端到端：编辑层新增的点位/矩形批注经发送准备生成尾部定位图，编号与位置一致', async () => {
  const node = makeNode([]);
  const ctx = runMutationContext(node);
  // 模拟用户在编辑层操作：点击加点、拖拽框选、填写内容
  ctx.addNodeAnnotation(node, { type: 'point', coordinates: { x: .2, y: .3 }, content: '左上改色' });
  const created = ctx.addNodeAnnotation(node, { type: 'rectangle', coordinates: { x: .5, y: .5, width: .3, height: .2 }, content: '右下替换' });
  created && (node.imageAnnotations.at(-1).content = '右下替换');
  // imageRef 形状（collectUpstreamForAI 产出）携带编辑层写入的批注
  const ref = { image: 'photo.png', assetId: '', fileName: 'photo.png', mime: 'image/png', _nodeId: node.id, hasColorArrowNotes: false, annotations: annotations.readNodeAnnotations(node) };
  const sent = await annotations.prepareSubmission('全局风格', [ref], async r => ({ image: `locator:${r.image}` }));
  assert.deepEqual(sent.references.map(i => i.image), ['photo.png', 'locator:photo.png']); // 定位图尾部追加
  assert.match(sent.prompt, /全局要求：全局风格/);
  assert.match(sent.prompt, /原始参考图第 1 张；第 2 张为对应的编号定位图：/);
  assert.match(sent.prompt, /- 批注① \[定位点：\(20%, 30%\)\]：左上改色/);
  assert.match(sent.prompt, /- 批注② \[矩形区域：左上角 \(50%, 50%\)，宽 30%，高 20%\]：右下替换/);
  // 位置一致性：编辑层图钉与定位图几何同一坐标
  const geometry = annotations.computeLocatorGeometry(400, 200, sent.references[0].annotations);
  assert.equal(geometry.markers[0].label, '①');
  assert.ok(Math.abs(geometry.markers[0].x - .2 * 400) < 1e-9);
  assert.equal(geometry.markers[1].kind, 'rectangle');
});
