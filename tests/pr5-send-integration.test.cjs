// PR-5 发送链路集成模拟测试：vm 切片 runQueuedAiTask 的真实发送准备区，
// mock submitGeneration / materializeReferenceImage / createLocatorImage，绝不发起真实生图请求。
// 覆盖计划 P3 的 22 个必须场景（编号见各 test 名称）。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const annotations = require('../modules/image-annotations.js');

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

const SLICE_START = 'const taskImages = task.orderedImages';
const SLICE_END = 'task.status = "generating";';

function buildHarness(task, { locatorOk = true, materializeOk = true, warnings = [], modelLimit = 16 } = {}) {
  const start = source.indexOf(SLICE_START);
  assert.ok(start > 0, 'slice start marker not found');
  const end = source.indexOf(SLICE_END, start);
  assert.ok(end > start, 'slice end marker not found');
  const slice = source.slice(start, end);
  const submitted = [];
  const moduleInstance = { ...annotations };
  // mock 定位图绘制（真实几何已被数据层单测覆盖；此处只测接线）
  moduleInstance.createLocatorImage = async (dataUrl, refs) => {
    if (!locatorOk) throw new Error('定位图绘制失败');
    return `locator-png:${dataUrl}:${refs.length}`;
  };
  const context = {
    task,
    console: {
      debug() {},
      warn: (...args) => warnings.push(args.join(' ')),
      log() {},
    },
    window: { CanvasFlowImageAnnotations: moduleInstance },
    // mock 模型上限解析：真实现由 model-catalog 声明驱动（见 static 断言测试与数据层测试）
    annotationModelImageLimit: () => modelLimit,
    materializeReferenceImage: async reference => {
      if (!materializeOk) throw new Error('素材读取失败');
      return `materialized:${reference.image}`;
    },
    runLocalRegionMatting: async () => { context.localMattingRan = true; return ['matting']; },
    submitGeneration: async (prompt, images, settings) => {
      submitted.push({ prompt, images, settings });
      return 'mock-task-id';
    },
    refreshQueuedNodeProgress() {}, renderTaskQueue() {}, notifyScreenshotTask() {},
  };
  // 切片止于 "task.status" 之前，此时 else 分支尚未闭合，包装器补一个 '}'
  const runner = vm.runInNewContext(`(async () => {\nlet imageUrls;\n${slice}\n} /* 补闭 else 分支 */\nreturn { imageUrls };\n})()`, context);
  return { runner, submitted, context };
}

// 构造带批注的 imageRef 形状（与 collectUpstreamForAI.imageRef 输出一致）
function annotatedRef(image, anns, extra = {}) {
  return { image, assetId: '', fileName: image, mime: 'image/png', _x: 0, _y: 0, _nodeId: image, hasColorArrowNotes: false, annotations: anns, ...extra };
}
function plainRef(image, extra = {}) {
  return { image, assetId: '', fileName: image, mime: 'image/png', _x: 0, _y: 0, _nodeId: image, hasColorArrowNotes: false, ...extra };
}
const ann = content => ({ annotationId: `a-${content}`, imageId: '', type: 'point', coordinates: { x: .2, y: .3 }, content, index: 1, created: 0 });

function makeTask({ orderedImages, prompt = '', groupImage = null, regularImages = null, localMatting = false, generationSettings } = {}) {
  return {
    id: 't1', nodeId: 'n1', status: 'submitting', progress: 0,
    prompt, generationSettings: generationSettings ?? { _model: 'gpt-image-2.5-flare' },
    orderedImages: orderedImages ?? (groupImage ? null : []),
    regularImages: regularImages ?? [],
    groupImage, localMatting,
  };
}

async function run(task, options) {
  const h = buildHarness(task, options);
  h.result = await h.runner;
  return h;
}

// ===== 1. 无批注：请求完全不变 =====

test('01 无批注时 submitGeneration 收到原数组引用且 prompt 不变', async () => {
  const refs = [plainRef('img-1'), plainRef('img-2')];
  const task = makeTask({ orderedImages: refs, prompt: '原图风格' });
  const { submitted } = await run(task);
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].images, refs); // 原数组引用
  assert.equal(submitted[0].prompt, '原图风格');
  assert.equal(task._annotationPromptApplied, undefined);
});

// ===== 2-3. 单图单/多批注 =====

test('02 单图单批注：定位图追加尾部，prompt 含局部修改与编号', async () => {
  const refs = [annotatedRef('img-1', [ann('把天空换成晚霞')])];
  const task = makeTask({ orderedImages: refs, prompt: '整体更明亮' });
  const { submitted } = await run(task);
  assert.deepEqual(submitted[0].images.map(i => i.image), ['img-1', 'locator-png:materialized:img-1:1']);
  assert.match(submitted[0].prompt, /^全局要求：整体更明亮\n局部修改：\n原始参考图第 1 张；第 2 张为对应的编号定位图：\n- 批注① \[定位点：\(20%, 30%\)\]：把天空换成晚霞\n保留要求：/);
  assert.ok(submitted[0].prompt.includes('不要将编号、图钉或框线画入最终图片'));
});

test('03 单图多批注：批注①②依序出现', async () => {
  const refs = [annotatedRef('img-1', [ann('加一只猫'), ann('左下角加水印')])];
  const task = makeTask({ orderedImages: refs, prompt: '' });
  const { submitted } = await run(task);
  const prompt = submitted[0].prompt;
  assert.match(prompt, /- 批注① \[定位点：\(20%, 30%\)\]：加一只猫/);
  assert.match(prompt, /- 批注② \[定位点：\(20%, 30%\)\]：左下角加水印/);
  assert.ok(!prompt.startsWith('全局要求')); // 空 prompt 时不产生全局要求段
  assert.match(prompt, /^局部修改：/);
});

// ===== 4-6. 多原图多定位图、顺序保持、尾部追加 =====

test('04-06 多原图多定位图：原图原序在前索引不变，定位图按对应原图顺序追加尾部', async () => {
  const refs = [
    annotatedRef('img-1', [ann('甲')]),
    plainRef('img-2'),
    annotatedRef('img-3', [ann('丙1'), ann('丙2')]),
    plainRef('img-4'),
  ];
  const task = makeTask({ orderedImages: refs, prompt: 'p' });
  const { submitted } = await run(task);
  const images = submitted[0].images;
  assert.deepEqual(images.map(i => i.image), ['img-1', 'img-2', 'img-3', 'img-4', 'locator-png:materialized:img-1:1', 'locator-png:materialized:img-3:2']);
  // 原对象引用与顺序不变
  assert.equal(images[0], refs[0]);
  assert.equal(images[3], refs[3]);
  // 定位图明确关联原图（fileName 继承原图名 + 批注定位图后缀）
  assert.equal(images[4].fileName, 'img-1-批注定位图.png');
  assert.equal(images[5].fileName, 'img-3-批注定位图.png');
  // prompt 编号：第 1/3 张原图，第 5/6 张定位图
  assert.match(submitted[0].prompt, /原始参考图第 1 张；第 5 张为对应的编号定位图：\n- 批注①/);
  assert.match(submitted[0].prompt, /原始参考图第 3 张；第 6 张为对应的编号定位图：\n- 批注①/);
});

// ===== 8. 手写序号风险缓解 =====

test('08 提示词固定包含“以原始参考图为编辑依据”的保留要求', async () => {
  const refs = [annotatedRef('img-1', [ann('x')])];
  const task = makeTask({ orderedImages: refs, prompt: 'p' });
  const { submitted } = await run(task);
  assert.match(submitted[0].prompt, /以原始参考图为编辑依据/);
  assert.match(submitted[0].prompt, /不要将编号、图钉或框线画入最终图片/);
});

// ===== 9. 多分支扇入任务互不串联（共享 annotations 只读） =====

test('09 两个任务共享同一 imageRef.annotations 时互不污染', async () => {
  const sharedAnns = [ann('共享批注')];
  const sharedRef = annotatedRef('img-shared', sharedAnns);
  // 模拟 collectUpstreamForAI 把同一 imageRef 分给两个分支任务（浅克隆共享 annotations 引用）
  const taskA = makeTask({ orderedImages: [{ ...sharedRef }], prompt: 'A' });
  const taskB = makeTask({ orderedImages: [{ ...sharedRef }], prompt: 'B' });
  await run(taskA);
  assert.deepEqual(sharedAnns, [ann('共享批注')]); // 原数组未被修改（imageId 等字段保持原样）
  const { submitted } = await run(taskB);
  assert.equal(submitted[0].images.length, 2); // 任务 B 仍有自己的批注与定位图
  assert.match(submitted[0].prompt, /共享批注/);
  assert.match(submitted[0].prompt, /全局要求：B/);
  assert.ok(!submitted[0].prompt.includes('全局要求：A')); // 无跨任务串联
});

// ===== 10. 组图任务顺序 =====

test('10 组图任务：regularImages + groupImage 顺序保持，定位图尾部', async () => {
  const regular = [annotatedRef('r-1', [ann('r1批注')]), plainRef('r-2')];
  const groupImage = annotatedRef('group-1', [ann('组图批注')]);
  const task = makeTask({ regularImages: regular, groupImage, prompt: 'p' });
  const { submitted } = await run(task);
  // 组图路径的 [...regularImages, groupImage] 在 vm 切片内展开，数组带 vm realm——先复制回测试 realm 再比较
  assert.deepEqual(Array.from(submitted[0].images).map(i => i.image), ['r-1', 'r-2', 'group-1', 'locator-png:materialized:r-1:1', 'locator-png:materialized:group-1:1']);
});

// ===== 11. 颜色箭头子句基于最终数组 =====

test('11 颜色箭头子句按最终数组编号，且只追加一次', async () => {
  const refs = [
    annotatedRef('img-1', [ann('甲')], { hasColorArrowNotes: true }),
    plainRef('img-2'),
    annotatedRef('img-3', [ann('丙')], { hasColorArrowNotes: true }),
  ];
  const task = makeTask({ orderedImages: refs, prompt: 'p' });
  const { submitted } = await run(task);
  // 尾部追加：原图序号不变 → 颜色子句报第 1、3 张
  assert.match(submitted[0].prompt, /根据第1、3张图标注要求进行颜色修改/);
  // 定位图在第 4、5 位，不带 hasColorArrowNotes，不会进入颜色子句
  assert.ok(!submitted[0].prompt.includes('第4、') && !submitted[0].prompt.includes('第1、3、4'));
  // prompt 结构：批注合成在前、颜色子句在后
  const prompt = submitted[0].prompt;
  assert.ok(prompt.indexOf('局部修改') < prompt.indexOf('根据第1、3张图'));
});

// ===== 12-13. 模型上限与保守降级（上限由模型目录声明驱动） =====

test('12 已声明上限被超出：定位图整体跳过、原图全数保留、给出诊断', async () => {
  const refs = Array.from({ length: 10 }, (_, i) => annotatedRef(`img-${i}`, [ann(`批注${i}`)]));
  const task = makeTask({ orderedImages: refs, prompt: 'p' });
  const warnings = [];
  const { submitted } = await run(task, { warnings, modelLimit: 16 });
  assert.equal(submitted[0].images.length, 10); // 原图不删不减
  assert.equal(submitted[0].images, task.orderedImages); // 原数组引用
  assert.match(submitted[0].prompt, /原始参考图第 1 张：\n- 批注①/); // 坐标说明仍在
  assert.ok(!submitted[0].prompt.includes('编号定位图：')); // 无定位图序号声明
  assert.ok(warnings.some(w => w.includes('超出模型上限 16') && w.includes('不删原图')));
});

test('13 恰好在已声明上限内：定位图正常插入（边界 15+1=16）', async () => {
  const refs = [annotatedRef('img-1', [ann('x')]), ...Array.from({ length: 14 }, (_, i) => plainRef(`fill-${i}`))];
  assert.equal(refs.length + 1, 16);
  const task = makeTask({ orderedImages: refs, prompt: 'p' });
  const { submitted } = await run(task, { modelLimit: 16 });
  assert.equal(submitted[0].images.length, 16);
  assert.equal(submitted[0].images.at(-1).image, 'locator-png:materialized:img-1:1');
});

test('13b 模型未声明上限：保守降级为纯坐标说明，不臆造数字', async () => {
  const refs = [annotatedRef('img-1', [ann('x')])];
  const task = makeTask({ orderedImages: refs, prompt: 'p', generationSettings: { _model: '未声明的模型' } });
  const warnings = [];
  const { submitted } = await run(task, { warnings, modelLimit: 0 });
  assert.equal(submitted[0].images, task.orderedImages); // 原数组引用，无定位图
  assert.match(submitted[0].prompt, /原始参考图第 1 张：\n- 批注①/); // 坐标说明仍在
  assert.ok(!submitted[0].prompt.includes('编号定位图：'));
  assert.ok(warnings.some(w => w.includes('未声明参考图上限') && w.includes('保守跳过定位图')));
});

// ===== 14-15. 定位图/素材失败降级 =====

test('14 定位图绘制失败：坐标说明降级、原数组引用不变', async () => {
  const refs = [annotatedRef('img-1', [ann('x')]), plainRef('img-2')];
  const task = makeTask({ orderedImages: refs, prompt: 'p' });
  const { submitted } = await run(task, { locatorOk: false });
  assert.equal(submitted[0].images, refs);
  assert.match(submitted[0].prompt, /原始参考图第 1 张：\n- 批注① \[定位点：\(20%, 30%\)\]：x/);
});

test('15 素材读取失败：与定位图失败同样安全降级', async () => {
  const refs = [annotatedRef('img-1', [ann('x')])];
  const task = makeTask({ orderedImages: refs, prompt: 'p' });
  const { submitted } = await run(task, { materializeOk: false });
  assert.equal(submitted[0].images, refs);
  assert.match(submitted[0].prompt, /批注①/);
});

// ===== 16-17. 重试幂等性与逐次一致性 =====

test('16-17 同一任务重试：提示词不重复追加、定位图不重复插入、原始来源可恢复', async () => {
  const refs = [annotatedRef('img-1', [ann('甲')], { hasColorArrowNotes: true }), plainRef('img-2')];
  const task = makeTask({ orderedImages: refs, prompt: '原始提示词' });
  const first = await run(task);
  const firstPrompt = first.submitted[0].prompt;
  const firstImages = first.submitted[0].images;
  assert.equal(firstImages.length, 3); // 2 原图 + 1 定位图
  assert.equal(first.submitted[0].images[0], refs[0]);

  // 第二次运行（重试同一任务对象）
  const second = await run(task);
  assert.equal(second.submitted[0].prompt, firstPrompt); // 幂等：不重复追加
  assert.equal((second.submitted[0].prompt.match(/局部修改/g) || []).length, 1);
  assert.equal((second.submitted[0].prompt.match(/根据第/g) || []).length, 1); // 颜色子句也不重复
  assert.equal(second.submitted[0].images.length, 3); // 定位图不重复
  assert.deepEqual(second.submitted[0].images.map(i => i.image), firstImages.map(i => i.image));
  // 原始 prompt 可恢复、原始参考图未被替换
  assert.equal(task._annotationPromptSource, '原始提示词');
  assert.equal(task.orderedImages, refs);
  assert.deepEqual(task.orderedImages.map(i => i.image), ['img-1', 'img-2']);
});

test('16b 首次定位图失败、重试成功：每次发送的提示词与数组严格一致（修复点）', async () => {
  const refs = [annotatedRef('img-1', [ann('甲')])];
  const task = makeTask({ orderedImages: refs, prompt: 'p' });
  // 第一次：定位图失败 → 纯坐标说明 + 原数组
  const first = await run(task, { locatorOk: false });
  assert.ok(first.submitted[0].prompt.includes('局部修改：') && !first.submitted[0].prompt.includes('编号定位图：'), '首次失败应为纯坐标说明版');
  assert.equal(first.submitted[0].images, task.orderedImages);
  // 第二次：定位图成功 → 提示词如实升级为“原图+定位图”编号，且数组含定位图——两者一致
  const second = await run(task);
  assert.match(second.submitted[0].prompt, /原始参考图第 1 张；第 2 张为对应的编号定位图/);
  assert.equal(second.submitted[0].images.length, 2);
  assert.equal(second.submitted[0].images[1].image, 'locator-png:materialized:img-1:1');
  assert.ok(second.submitted[0].prompt.includes('编号定位图')); // 定位声明已如实出现
  assert.equal((second.submitted[0].prompt.match(/局部修改/g) || []).length, 1); // 不重复追加
});

test('16c 首次成功、重试失败：提示词与数组同步降级，不再引用缺席的定位图', async () => {
  const refs = [annotatedRef('img-1', [ann('甲')])];
  const task = makeTask({ orderedImages: refs, prompt: 'p' });
  const first = await run(task);
  assert.match(first.submitted[0].prompt, /第 2 张为对应的编号定位图/);
  assert.equal(first.submitted[0].images.length, 2);
  // 第二次定位图失败 → 提示词回到坐标版且不含定位图声明，与原数组一致
  const second = await run(task, { locatorOk: false });
  assert.ok(second.submitted[0].prompt.includes('局部修改：') && !second.submitted[0].prompt.includes('编号定位图：'));
  assert.equal(second.submitted[0].images, task.orderedImages);
  assert.equal((second.submitted[0].prompt.match(/局部修改/g) || []).length, 1);
  // 原始来源始终未被改写
  assert.equal(task._annotationPromptSource, 'p');
});

// ===== 18. 本地抠图任务不受影响 =====

test('18 localMatting 任务不运行批注变换、不调用 submitGeneration', async () => {
  const refs = [annotatedRef('img-1', [ann('x')])];
  const task = makeTask({ orderedImages: refs, prompt: 'p', localMatting: true });
  const { submitted, context, result } = await run(task);
  assert.equal(context.localMattingRan, true);
  assert.equal(submitted.length, 0);
  assert.equal(result.imageUrls[0], 'matting');
  assert.equal(task.prompt, 'p'); // prompt 未被批注逻辑改写
  assert.equal(task._annotationPromptApplied, undefined);
});

// ===== 19. 旧工程 comments 兼容 =====

test('19 旧 comments 字段经 readNodeAnnotations 后可正常参与发送准备', async () => {
  const legacyNode = { id: 'n-old', comments: [{ id: 'c1', text: '旧批注：换成蓝色', x: .5, y: .5 }] };
  const refs = [{ ...plainRef('img-1'), annotations: annotations.readNodeAnnotations(legacyNode) }];
  const task = makeTask({ orderedImages: refs, prompt: 'p' });
  const { submitted } = await run(task);
  assert.match(submitted[0].prompt, /- 批注① \[定位点：\(50%, 50%\)\]：旧批注：换成蓝色/);
  assert.equal(submitted[0].images.length, 2);
});

// ===== 20. 复制粘贴批注 ID 独立（模块级 + 静态接线断言） =====

test('20 粘贴重映射接线存在于 pasteNodes，模块重映射保证 ID 独立与深拷贝', () => {
  const pasteStart = source.indexOf('function pasteNodes(data, anchor = null) {');
  const pasteBlock = source.slice(pasteStart, source.indexOf('\nfunction ', pasteStart + 10));
  assert.ok(pasteBlock.includes('remapAnnotationIds'), 'pasteNodes must remap annotation ids');
  assert.ok(pasteBlock.includes('readNodeAnnotations'), 'pasteNodes must normalize legacy comments');
  // 模块级行为：ID 全新、互不相同、坐标深拷贝、imageId 指向新节点
  const source_node = { id: 'n-src', imageAnnotations: [{ annotationId: 'a1', type: 'rectangle', coordinates: { x: .1, y: .2, width: .3, height: .4 }, content: '一块' }] };
  const cloneNode = JSON.parse(JSON.stringify(source_node));
  cloneNode.id = 'n-new';
  annotations.writeNodeAnnotations(cloneNode, annotations.remapAnnotationIds(annotations.readNodeAnnotations(cloneNode)));
  assert.notEqual(cloneNode.imageAnnotations[0].annotationId, 'a1');
  assert.equal(cloneNode.imageAnnotations[0].imageId, 'n-new');
  assert.deepEqual(cloneNode.imageAnnotations[0].coordinates, { x: .1, y: .2, width: .3, height: .4 });
  // 原节点不受影响
  assert.equal(source_node.imageAnnotations[0].annotationId, 'a1');
  assert.equal(source_node.comments, undefined);
});

// ===== 21. 不误持久化 =====

test('21 定位图对象只进入 submit 入参，任务原始参考图与画布数据不被改写', async () => {
  const refs = [annotatedRef('img-1', [ann('x')])];
  const snapshot = JSON.stringify(refs);
  const task = makeTask({ orderedImages: refs, prompt: 'p' });
  const { submitted } = await run(task);
  assert.equal(JSON.stringify(task.orderedImages), snapshot); // orderedImages 未被写入定位图
  assert.ok(submitted[0].images.at(-1)._annotationLocator === true); // 定位图带标记，仅存在于发送数组
  assert.ok(!JSON.stringify(task).includes('locator-png')); // 任务对象不含定位图数据
});

// ===== 12c. 模型上限声明来源（静态断言：只采信目录中已验证的数值） =====

test('12c 模型目录仅对已验证模型声明 maxImages，未知模型保守降级', () => {
  const catalog = fs.readFileSync(require.resolve('../model-catalog.js'), 'utf8');
  // gpt-image-2.5 ext/standard：APIMart 文档 image_urls ≤16（2026-11-07 核实）
  assert.match(catalog, /"gpt-image-2\.5-flare"[^\n]*maxImages: 16/);
  assert.match(catalog, /"gpt-image-2\.5-sunburst"[^\n]*maxImages: 16/);
  assert.match(catalog, /"gpt-image-2\.5"[^\n]*maxImages: 16/);
  // Nano Banana Pro：上游注释已验证 ≤14
  assert.match(catalog, /"gemini-3-pro-image-preview"[^\n]*maxImages: 14/);
  // 未验证模型不得声明（Nano Banana 2 / gpt-image-2 / midjourney / agtoken 全系）
  for (const id of ['gpt-image-2-official', '"gpt-image-2"', '"midjourney"', 'gemini-3.1-flash-image-preview', '"nano-banana-2"', '"nano-banana-pro"']) {
    const line = catalog.split('\n').find(l => l.includes(id));
    assert.ok(line, `catalog entry ${id} must exist`);
    assert.ok(!line.includes('maxImages'), `未验证模型 ${id} 不得声明 maxImages`);
  }
  // app.js：上限解析只信目录声明，未知返回 0；不再存在全局 9 张常量
  assert.ok(source.includes('function annotationModelImageLimit('));
  assert.ok(!source.includes('ANNOTATION_LOCATOR_MAX_IMAGES'));
});

// ===== 22. 任务数量与分支语义不变（静态结构断言） =====

test('22 批注逻辑不触碰任务拆分与分支语义', () => {
  const collectStart = source.indexOf('function collectUpstreamForAI');
  const collectBlock = source.slice(collectStart, source.indexOf('\nfunction ', collectStart + 10));
  // visit 分支逻辑只在 imageRef 一处附加 annotations，不改变分支结构
  assert.equal((collectBlock.match(/annotations \? \{ annotations \}/g) || []).length, 1);
  assert.ok(collectBlock.includes('branches: []'));
  const buildStart = source.indexOf('function buildAiQueueTasks');
  const buildBlock = source.slice(buildStart, source.indexOf('\nfunction ', buildStart + 10));
  assert.ok(!buildBlock.includes('CanvasFlowImageAnnotations'), 'buildAiQueueTasks must not run annotation logic');
  // 发送变换只存在于 runQueuedAiTask
  const runStart = source.indexOf('async function runQueuedAiTask');
  const runBlock = source.slice(runStart, source.indexOf('\nasync function ', runStart + 10));
  assert.equal((runBlock.match(/prepareSubmission/g) || []).length, 1);
  // ARROW_NOTE_ENABLED 保持隐藏
  assert.match(source, /const ARROW_NOTE_ENABLED = false;/);
});

// ===== 最终发送数组与 prompt 样例留存（供报告引用） =====

test('样例留存：3 原图 2 批注的最终发送数组与合成 prompt', async () => {
  const refs = [
    annotatedRef('photo-a.png', [ann('替换左侧人物衣服'), ann('背景改为黄昏')]),
    plainRef('photo-b.png'),
    annotatedRef('photo-c.png', [ann('右下角去除水印')], { hasColorArrowNotes: true }),
  ];
  const task = makeTask({ orderedImages: refs, prompt: '保持原图风格，整体提亮' });
  const { submitted } = await run(task);
  const sample = {
    sendArray: submitted[0].images.map(i => i.fileName || i.image),
    prompt: submitted[0].prompt,
  };
  assert.deepEqual(sample.sendArray, ['photo-a.png', 'photo-b.png', 'photo-c.png', 'photo-a.png-批注定位图.png', 'photo-c.png-批注定位图.png']);
  const expected = [
    '全局要求：保持原图风格，整体提亮',
    '局部修改：',
    '原始参考图第 1 张；第 4 张为对应的编号定位图：',
    '- 批注① [定位点：(20%, 30%)]：替换左侧人物衣服',
    '- 批注② [定位点：(20%, 30%)]：背景改为黄昏',
    '原始参考图第 3 张；第 5 张为对应的编号定位图：',
    '- 批注① [定位点：(20%, 30%)]：右下角去除水印',
    '保留要求：除非全局要求另有指示，尽量保持未标记区域不变。编号定位图仅用于识别区域，不要将编号、图钉或框线画入最终图片；以原始参考图为编辑依据。',
  ].join('\n') + '，根据第3张图标注要求进行颜色修改，未标注部分不要改动，生成结果中不要带选框、箭头、标注';
  assert.equal(sample.prompt, expected);
});
