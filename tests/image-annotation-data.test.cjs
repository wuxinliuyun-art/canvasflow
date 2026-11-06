const { test } = require('node:test');
const assert = require('node:assert/strict');
const annotations = require('../modules/image-annotations.js');

// ===== 数据规范化 =====

test('point annotations clamp coordinates into 0-1 and default sensibly', () => {
  const a = annotations.normalizeAnnotation({ x: 1.7, y: -.4, content: '偏右' }, 'img-1', 0);
  assert.equal(a.type, 'point');
  assert.equal(a.coordinates.x, 1);
  assert.equal(a.coordinates.y, 0);
  assert.equal(a.index, 1);
  assert.equal(a.imageId, 'img-1');
  assert.ok(a.annotationId.length > 0);
  const b = annotations.normalizeAnnotation({ text: '旧字段' }, 'img-1', 2);
  assert.equal(b.content, '旧字段');
  assert.equal(b.coordinates.x, .12); // 默认 x
  assert.equal(b.coordinates.y, .39); // 默认 y = .15 + 2*.12
});

test('rectangle annotations clamp into bounds and reject empty size', () => {
  const valid = annotations.normalizeAnnotation({ type: 'rectangle', coordinates: { x: .8, y: .9, width: .9, height: .9 }, content: '越界矩形' }, 'img', 0);
  assert.ok(Math.abs(valid.coordinates.width - .2) < 1e-9); // 钳制到 1 - x
  assert.ok(Math.abs(valid.coordinates.height - .1) < 1e-9);
  const empty = annotations.normalizeAnnotation({ type: 'rectangle', coordinates: { x: .3, y: .3 }, content: '无尺寸' }, 'img', 0);
  assert.equal(empty, null);
  const legacyW = annotations.normalizeAnnotation({ type: 'rectangle', x: .1, y: .1, w: .2, h: .3, content: '旧字段尺寸' }, 'img', 0);
  assert.ok(Math.abs(legacyW.coordinates.width - .2) < 1e-9);
  assert.ok(Math.abs(legacyW.coordinates.height - .3) < 1e-9);
});

test('normalize keeps explicit annotationId and created timestamp', () => {
  const a = annotations.normalizeAnnotation({ annotationId: 'fixed-id', created: 1234, content: 'x' }, 'img', 0);
  assert.equal(a.annotationId, 'fixed-id');
  assert.equal(a.created, 1234);
});

// ===== 节点读写与兼容 =====

test('read prefers imageAnnotations and falls back to legacy comments', () => {
  const newNode = { id: 'n1', imageAnnotations: [{ annotationId: 'a', type: 'point', coordinates: { x: .5, y: .5 }, content: '新' }] };
  assert.equal(annotations.readNodeAnnotations(newNode).length, 1);
  const oldNode = { id: 'n2', comments: [{ id: 'old', text: '旧批注', x: .25, y: .5 }, { id: 'bad', text: '  ' }] };
  const read = annotations.readNodeAnnotations(oldNode);
  // 空内容批注仍保留（界面上是已放置的图钉），只有提示词/定位图阶段才过滤
  assert.equal(read.length, 2);
  assert.equal(read[0].content, '旧批注');
  assert.equal(read[0].coordinates.x, .25);
  assert.equal(read[0].index, 1);
  assert.equal(read[0].imageId, 'n2');
  assert.equal(read[1].content, '  ');
  assert.deepEqual(annotations.readNodeAnnotations(null), []);
  assert.deepEqual(annotations.readNodeAnnotations({}), []);
});

test('read reindexes annotations to 1..n in array order', () => {
  const node = { id: 'n', imageAnnotations: [
    { annotationId: 'a', type: 'point', coordinates: { x: .1, y: .1 }, content: '一' },
    null,
    { annotationId: 'c', type: 'point', coordinates: { x: .3, y: .3 }, content: '三' },
  ] };
  const read = annotations.readNodeAnnotations(node);
  assert.deepEqual(read.map(item => item.index), [1, 2]);
  assert.equal(read[1].annotationId, 'c');
});

test('write normalizes, stamps imageId and removes legacy comments field', () => {
  const node = { id: 'n9', comments: [{ id: 'old', text: '旧', x: .2, y: .2 }] };
  const written = annotations.writeNodeAnnotations(node, annotations.readNodeAnnotations(node));
  assert.equal(written.length, 1);
  assert.equal(written[0].imageId, 'n9');
  assert.equal(written[0].content, '旧');
  assert.equal(node.comments, undefined);
  assert.equal(node.imageAnnotations, written);
  // 写入非法条目被过滤
  node.imageAnnotations = annotations.writeNodeAnnotations(node, [{ type: 'rectangle', coordinates: { x: .5, y: .5 }, content: '无尺寸' }, { type: 'point', coordinates: { x: 2, y: -1 }, content: '越界' }]);
  assert.equal(node.imageAnnotations.length, 1);
  assert.equal(node.imageAnnotations[0].coordinates.x, 1);
});

test('legacy project roundtrip: comments -> read -> write keeps data and clears comments', () => {
  const node = { id: 'legacy-node', comments: [
    { id: 'c1', text: '左上角加 logo', x: .15, y: .2 },
    { id: 'c2', text: '右下替换文字', x: .8, y: .85 },
  ] };
  annotations.writeNodeAnnotations(node, annotations.readNodeAnnotations(node));
  assert.equal(node.comments, undefined);
  const reread = annotations.readNodeAnnotations(node);
  assert.deepEqual(reread.map(item => item.content), ['左上角加 logo', '右下替换文字']);
  assert.deepEqual(reread.map(item => item.index), [1, 2]);
});

test('rectangleFromPoints normalizes drag direction and clamps to image', () => {
  const approx = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-9, `${value} ≈ ${expected}`);
  const r1 = annotations.rectangleFromPoints({ x: .7, y: .8 }, { x: .2, y: .3 });
  approx(r1.x, .2); approx(r1.y, .3); approx(r1.width, .5); approx(r1.height, .5);
  const r2 = annotations.rectangleFromPoints({ x: -.5, y: 1.5 }, { x: .4, y: .6 });
  assert.equal(r2.x, 0);
  approx(r2.y, .6); approx(r2.width, .4); approx(r2.height, .4);
});

// ===== 内容判定与复制重映射 =====

test('hasMeaningfulContent ignores whitespace-only annotations', () => {
  assert.equal(annotations.hasMeaningfulContent([{ content: '  ' }, { content: '' }]), false);
  assert.equal(annotations.hasMeaningfulContent([{ content: '改成蓝色' }]), true);
  assert.equal(annotations.hasMeaningfulContent(null), false);
  assert.equal(annotations.hasAnnotatedReference([{ image: 'a' }, { image: 'b', annotations: [{ content: 'x' }] }]), true);
  assert.equal(annotations.hasAnnotatedReference([{ image: 'a' }]), false);
});

test('remapAnnotationIds assigns fresh unique ids and deep-copies coordinates', () => {
  const source = [
    { annotationId: 'a', type: 'point', coordinates: { x: .1, y: .2 }, content: '一', index: 1 },
    { annotationId: 'b', type: 'rectangle', coordinates: { x: .3, y: .4, width: .2, height: .1 }, content: '二', index: 2 },
  ];
  const mapped = annotations.remapAnnotationIds(source);
  assert.notEqual(mapped[0].annotationId, 'a');
  assert.notEqual(mapped[1].annotationId, 'b');
  assert.notEqual(mapped[0].annotationId, mapped[1].annotationId);
  assert.deepEqual(mapped[0].coordinates, { x: .1, y: .2 });
  assert.deepEqual(mapped[1].coordinates, { width: .2, height: .1, x: .3, y: .4 });
  // 深拷贝：改新对象的坐标不影响旧对象
  mapped[0].coordinates.x = .9;
  assert.equal(source[0].coordinates.x, .1);
  // index 重排、顺序保留
  assert.deepEqual(mapped.map(item => item.index), [1, 2]);
  assert.equal(annotations.remapAnnotationIds(undefined).length, 0);
});

// ===== 定位图几何（纯函数） =====

test('computeLocatorGeometry produces positive metrics and clamps labels inside the canvas', () => {
  const ann = [
    { type: 'point', coordinates: { x: 0, y: 0 }, content: '左上角' },
    { type: 'point', coordinates: { x: 1, y: 1 }, content: '右下角' },
    { type: 'rectangle', coordinates: { x: .2, y: .3, width: .5, height: .4 }, content: '矩形' },
  ];
  const g = annotations.computeLocatorGeometry(800, 600, ann);
  assert.ok(g.line >= 3);
  assert.ok(g.font >= 16);
  assert.equal(g.width, 800);
  assert.equal(g.height, 600);
  assert.equal(g.markers.length, 3);
  assert.equal(g.markers[0].label, '①');
  assert.equal(g.markers[2].kind, 'rectangle');
  assert.ok(Math.abs(g.markers[2].width - 400) < 1e-9);
  for (const marker of g.markers) {
    assert.ok(marker.labelX >= g.font && marker.labelX <= g.width - g.font, `labelX inside: ${marker.labelX}`);
    assert.ok(marker.labelY >= g.font && marker.labelY <= g.height - g.font, `labelY inside: ${marker.labelY}`);
    assert.ok(marker.labelRadius > 0);
  }
  // 角落批注的标签被钳制在画布内而不是跟随坐标出界
  assert.equal(g.markers[0].labelX, g.font);
  assert.equal(g.markers[1].labelY, g.height - g.font);
});

test('computeLocatorGeometry stays finite on degenerate 1x1 canvas', () => {
  const g = annotations.computeLocatorGeometry(1, 1, [{ type: 'point', coordinates: { x: .5, y: .5 }, content: 'x' }]);
  for (const value of [g.line, g.font, g.markers[0].x, g.markers[0].y, g.markers[0].radius]) {
    assert.ok(Number.isFinite(value) && value > 0);
  }
});

test('PR5-UI-09C 四角边界：定位图圆点标记在左上/右上/左下/右下均内收到画布内，锚点不回写', () => {
  const size = 800;
  const radius = Math.max(3, Math.round(size / 350)) * 2.5; // line*2.5，与实现一致
  const corners = [
    ['左上', 0, 0], ['右上', 1, 0], ['左下', 0, 1], ['右下', 1, 1],
    ['近贴边', 0.005, 0.995],
  ];
  for (const [name, x, y] of corners) {
    const input = [{ type: 'point', coordinates: { x, y }, content: name }];
    const g = annotations.computeLocatorGeometry(size, size, input);
    const m = g.markers[0];
    assert.ok(m.x >= radius && m.x <= size - radius, `${name} 圆点 x 内收: ${m.x}`);
    assert.ok(m.y >= radius && m.y <= size - radius, `${name} 圆点 y 内收: ${m.y}`);
    assert.ok(m.labelX >= g.font && m.labelX <= size - g.font, `${name} 编号 x 在画布内`);
    assert.ok(m.labelY >= g.font && m.labelY <= size - g.font, `${name} 编号 y 在画布内`);
    // 锚点数据不被几何计算改写
    assert.equal(input[0].coordinates.x, x);
    assert.equal(input[0].coordinates.y, y);
  }
  // 界内锚点不动（只有贴边才内收）
  const g = annotations.computeLocatorGeometry(size, size, [{ type: 'point', coordinates: { x: .5, y: .5 }, content: '中' }]);
  assert.equal(g.markers[0].x, size * .5);
  assert.equal(g.markers[0].y, size * .5);
});

// ===== 发送规划（纯函数） =====

test('planning without annotations produces no slots and leaves the array unchanged', () => {
  const refs = [{ image: 'a' }, { image: 'b', annotations: [{ content: '  ' }] }];
  const plan = annotations.planLocatorPlacement(refs, 9);
  assert.deepEqual(plan.slots, []);
  assert.equal(plan.locatorAllowed, true);
  assert.equal(plan.annotatedCount, 0);
});

test('planning slots follow annotated references and respect the max image cap', () => {
  const refs = [
    { image: 'a', annotations: [{ content: '甲' }] },
    { image: 'b' },
    { image: 'c', annotations: [{ content: '丙' }] },
  ];
  const plan = annotations.planLocatorPlacement(refs, 9);
  assert.deepEqual(plan.slots.map(slot => slot.refIndex), [0, 2]);
  assert.equal(plan.locatorAllowed, true);
  // 3 原图 + 2 定位图 = 5 ≤ 9；上限收紧到 4 张时不允许插定位图（整体降级，不部分插入）
  const capped = annotations.planLocatorPlacement(refs, 4);
  assert.equal(capped.locatorAllowed, false);
  assert.deepEqual(capped.slots, []);
  // 空内容批注不产生槽位
  const noise = annotations.planLocatorPlacement([{ image: 'x', annotations: [{ content: '' }, { content: ' ' }] }], 9);
  assert.deepEqual(noise.slots, []);
});

test('planning normalizes raw annotation shapes inside slots', () => {
  const plan = annotations.planLocatorPlacement([
    { image: 'a', annotations: [{ text: '旧格式', x: 1.5, y: .2 }] },
  ], 9);
  assert.equal(plan.slots.length, 1);
  const [item] = plan.slots[0].annotations;
  assert.equal(item.content, '旧格式');
  assert.equal(item.coordinates.x, 1);
  assert.equal(item.index, 1);
});

// ===== 发送执行（异步，工厂注入） =====

test('locators are appended after all originals, keeping original indexes unchanged', async () => {
  const refs = [
    { image: 'a', annotations: [{ content: '甲' }] },
    { image: 'b' },
    { image: 'c', annotations: [{ content: '丙' }] },
  ];
  const plan = annotations.planLocatorPlacement(refs, 9);
  const seen = [];
  const applied = await annotations.applyLocatorImages(refs, plan.slots, async (reference, anns) => {
    seen.push([reference.image, anns.map(item => item.content)]);
    return { image: `locator-${reference.image}`, _annotationLocator: true };
  });
  // 原图保持原顺序在前（1..3 不变），定位图按对应原图顺序追加尾部
  assert.deepEqual(applied.references.map(item => item.image), ['a', 'b', 'c', 'locator-a', 'locator-c']);
  assert.deepEqual(applied.positions.map(p => p.original), [1, 2, 3]);
  assert.deepEqual(applied.positions.map(p => p.locator), [4, 0, 5]);
  // 工厂按原图顺序调用且收到带内容批注
  assert.deepEqual(seen, [['a', ['甲']], ['c', ['丙']]]);
  // 原对象引用不被替换
  assert.equal(applied.references[0], refs[0]);
  assert.equal(applied.references[1], refs[1]);
});

test('failed locator is skipped and later locators renumber correctly at the tail', async () => {
  const refs = [
    { image: 'a', annotations: [{ content: '甲' }] },
    { image: 'b', annotations: [{ content: '乙' }] },
    { image: 'c', annotations: [{ content: '丙' }] },
  ];
  const plan = annotations.planLocatorPlacement(refs, 9);
  const applied = await annotations.applyLocatorImages(refs, plan.slots, async reference => {
    if (reference.image === 'b') throw new Error('定位图创建失败');
    return { image: `locator-${reference.image}` };
  });
  // b 的定位图失败被跳过：原图序不变，c 的定位图前移一位且位置表一致
  assert.deepEqual(applied.references.map(item => item.image), ['a', 'b', 'c', 'locator-a', 'locator-c']);
  assert.deepEqual(applied.positions, [
    { original: 1, locator: 4 },
    { original: 2, locator: 0 },
    { original: 3, locator: 5 },
  ]);
});

test('prepareSubmission composes prompt, interleaved references and consistent positions', async () => {
  const annotated = {
    image: 'original-b',
    annotations: annotations.readNodeAnnotations({ id: 'nb', imageAnnotations: [{ annotationId: 'r', type: 'rectangle', coordinates: { x: .2, y: .3, width: .4, height: .2 }, content: '改为蓝色' }] }),
  };
  const refs = [{ image: 'original-a' }, annotated];
  const sent = await annotations.prepareSubmission('整体更明亮', refs, async reference => ({ image: `locator-${reference.image}` }));
  assert.deepEqual(sent.references.map(item => item.image), ['original-a', 'original-b', 'locator-original-b']);
  assert.match(sent.prompt, /全局要求：整体更明亮/);
  assert.match(sent.prompt, /原始参考图第 2 张；第 3 张为对应的编号定位图/);
  assert.match(sent.prompt, /批注① \[矩形区域：左上角 \(20%, 30%\)，宽 40%，高 20%\]：改为蓝色/);
  assert.match(sent.prompt, /不要将编号、图钉或框线画入最终图片/);
  assert.match(sent.prompt, /以原始参考图为编辑依据/);
  // 位置表与最终数组严格对应：第 2 张原图、第 3 张定位图
  assert.deepEqual(sent.positions, [{ original: 1, locator: 0 }, { original: 2, locator: 3 }]);
  // 未带批注的参考数组：原样透传（返回同一引用），提示词保持原文
  const plain = [{ image: 'p1' }, { image: 'p2' }];
  const passthrough = await annotations.prepareSubmission('只有全局', plain, async () => { throw new Error('不应被调用'); });
  assert.equal(passthrough.references, plain);
  assert.equal(passthrough.prompt, '只有全局');
  assert.deepEqual(passthrough.positions, [{ original: 1, locator: 0 }, { original: 2, locator: 0 }]);
});

// ===== 提示词合成 =====

test('promptForReferences returns the global prompt untouched when nothing is annotated', () => {
  const refs = [{ image: 'a', annotations: [{ content: ' ' }] }];
  assert.equal(annotations.promptForReferences('全局要求文本', refs, [{ original: 1, locator: 0 }]), '全局要求文本');
  assert.equal(annotations.promptForReferences('', refs, []), '');
});

test('promptForReferences lists annotations with circled numbering and region text', () => {
  const refs = [
    { image: 'a', annotations: [
      { type: 'point', coordinates: { x: .123, y: .456 }, content: '点这里' },
      { type: 'rectangle', coordinates: { x: .1, y: .2, width: .3, height: .4 }, content: '换掉这块' },
    ] },
    { image: 'b', annotations: [{ type: 'point', coordinates: { x: .5, y: .5 }, content: '  ' }] }, // 全空批注：整张跳过
  ];
  const prompt = annotations.promptForReferences('整体风格', refs, [
    { original: 1, locator: 2 }, { original: 3, locator: 0 },
  ]);
  assert.match(prompt, /^全局要求：整体风格\n/);
  assert.match(prompt, /原始参考图第 1 张；第 2 张为对应的编号定位图：\n- 批注① \[定位点：\(12%, 46%\)\]：点这里\n- 批注② \[矩形区域：左上角 \(10%, 20%\)，宽 30%，高 40%\]：换掉这块/);
  assert.ok(!prompt.includes('第 3 张')); // 无有效批注的第二张不进入局部修改
  assert.ok(!prompt.includes('批注③'));
  // 无定位图时只报原图序号（保留要求行固定提到“编号定位图”，只断言逐图行）
  const noLocator = annotations.promptForReferences('', [refs[0]], [{ original: 1, locator: 0 }]);
  assert.match(noLocator, /^局部修改：\n原始参考图第 1 张：\n- 批注①/);
  assert.ok(!noLocator.includes('为对应的编号定位图'));
});

// ===== 与上游颜色箭头序号逻辑的模拟验证（ARROW_NOTE_ENABLED 语义隔离） =====

test('simulation: color-arrow indexes stay correct when computed from the planned send array', async () => {
  // 模拟上游 runQueuedAiTask 的消费方式：hasColorArrowNotes 序号 = 最终发送数组下标 + 1。
  // 集成铁律：定位图插入必须发生在该计算之前，序号即在最终数组上重新成立。
  const refs = [
    { image: 'a', hasColorArrowNotes: true, annotations: [{ content: '甲' }] },
    { image: 'b', hasColorArrowNotes: false },
    { image: 'c', hasColorArrowNotes: true, annotations: [{ content: '丙' }] },
  ];
  const plan = annotations.planLocatorPlacement(refs, 9);
  const applied = await annotations.applyLocatorImages(refs, plan.slots, async reference => ({ image: `locator-${reference.image}` }));
  assert.deepEqual(applied.references.map(item => item.image), ['a', 'b', 'c', 'locator-a', 'locator-c']);
  const colorArrowIndexes = applied.references.map((image, index) => image?.hasColorArrowNotes ? index + 1 : 0).filter(Boolean);
  assert.deepEqual(colorArrowIndexes, [1, 3]); // 尾部追加后原图序号不变：a=第1张、c=第3张
  // 定位图本身不带 hasColorArrowNotes，不会污染颜色修改子句
  assert.ok(applied.references.every(item => !item.image.startsWith('locator-') || !item.hasColorArrowNotes));
});

// ===== 序号字形 =====

test('number renders circled numerals 1-20 with a parenthesized fallback', () => {
  assert.equal(annotations.number(1), '①');
  assert.equal(annotations.number(9), '⑨');
  assert.equal(annotations.number(20), '⑳');
  assert.equal(annotations.number(21), '(21)');
  assert.equal(annotations.number(0), '(0)');
});
