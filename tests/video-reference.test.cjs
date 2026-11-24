// 视频引用节点（video-ref）：vm 切片真实源码 + 静态接线断言。
// ① 目录事实：apimart seedance-2.0 三兄弟（≤3）+ agtoken Seedance 两模型（2.0 ≤3 / 2.5 ≤10）声明 maxVideos；
//    H3/Hailuo/agtoken Wan 系不声明（Wan 参考视频按输入+输出时长合计计秒，不开）；
// ② 引用工具函数：normalize 补缺省 / 过期判定（10 分钟余量）/ 50MB 上限 / 扩展名白名单；
// ③ uploadVideoRef：有 path 走 filePath、无 path 走 base64，响应 {url,expiresAt,bytes} 写回节点，_videoRefUploading 复位；
// ④ ensureVideoRefUrl：未过期直接复用（不调上传），过期且有 path 重传，既无 url 又无 path 报错；
// ⑤ enqueueVideoNode：maxVideos 截取 + 超限提示 / 不支持的模型拒绝 / 全空拒绝；
// ⑥ submitVideoGeneration：apimart 顶层 video_urls 与 image_urls 并存；first_frame 模型互斥拒绝；
//    agtoken Seedance 带参考视频走兼容接口 /api/agtoken/seedance-task（content[] 多模态素材 + compatModel 全名映射 +
//    task.videoChannel 通道标记）；Wan 系（maxVideos 缺省）带参考视频尽早拒绝；无视频回归统一接口；
//    pollVideoTask 按通道分流查询路径。多顶层声明切片不能括号包裹（vm 铁坑）。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const catalogSource = fs.readFileSync(require.resolve('../model-catalog.js'), 'utf8');
const serverSource = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const runtimeSource = fs.readFileSync(require.resolve('../canvas-runtime.js'), 'utf8');
const desktopApiSource = fs.readFileSync(require.resolve('../desktop-dotnet/DesktopApi.cs'), 'utf8');
const mainWindowSource = fs.readFileSync(require.resolve('../desktop-dotnet/MainWindow.xaml.cs'), 'utf8');
const macMainSource = fs.readFileSync(require.resolve('../desktop-mac/main.js'), 'utf8');
const macPreloadSource = fs.readFileSync(require.resolve('../desktop-mac/preload.js'), 'utf8');
const stylesSource = fs.readFileSync(require.resolve('../styles.css'), 'utf8');
const indexSource = fs.readFileSync(require.resolve('../index.html'), 'utf8');

function runSlice(slice, context) {
  // 切片含多个顶层声明时不能用括号包裹（多声明不是合法表达式）
  vm.createContext(context);
  vm.runInContext(catalogSource, context);
  vm.runInContext(slice, context);
  return context;
}

function buildCatalogHarness() {
  const start = source.indexOf('function videoCatalog(');
  const end = source.indexOf('function videoUpstreamSummary(', start);
  assert.ok(start > 0 && end > start, 'catalog slice markers not found');
  return runSlice(source.slice(start, end), {
    window: {},
    state: { settings: { apiKey: 'sk-a', agtokenApiKey: 'sk-g' } },
    console,
  });
}

// video-ref 工具函数区：function normalizeVideoRefNode( → function angleNodeInput( 之前
function buildVideoRefHarness(contextExtra = {}) {
  const start = source.indexOf('function normalizeVideoRefNode(');
  const end = source.indexOf('function angleNodeInput(', start);
  assert.ok(start > 0 && end > start, 'video-ref slice markers not found');
  const calls = [];
  const context = {
    console,
    window: {},
    desktop: null,
    state: {},
    VIDEO_REF_MAX_BYTES: 50 * 1024 * 1024,
    VIDEO_REF_EXPIRY_MARGIN_MS: 10 * 60 * 1000,
    escapeHtml: value => String(value ?? ''),
    markDirty: () => {},
    renderNodes: () => {},
    render: () => {},
    pushHistory: () => {},
    toast: message => calls.push({ toast: message }),
    findNode: () => null,
    fileToDataUrl: async () => 'data:video/mp4;base64,QUJD',
    apiFetch: async (route, options) => {
      calls.push({ route, body: options.body ? JSON.parse(options.body) : null });
      return { ok: true, status: 200, json: async () => ({ url: 'https://cdn.example/ref.mp4', expiresAt: Date.now() + 3 * 86400000, bytes: 1234 }) };
    },
    ...contextExtra,
  };
  runSlice(source.slice(start, end), context);
  return { context, calls };
}

const videoRefNode = extra => ({ id: 'n_ref1', type: 'video-ref', fileName: 'ref.mp4', videoPath: '', videoUrl: '', videoUrlExpiresAt: 0, videoBytes: 1024, _videoRefUploading: false, ...extra });

// ---------- 目录事实 ----------

test('目录：apimart seedance-2.0 三兄弟（≤3）+ agtoken Seedance 两模型声明 maxVideos，Wan/H3/Hailuo 不声明', () => {
  const ctx = buildCatalogHarness();
  const models = ctx.window.CANVASFLOW_VIDEO_CATALOG.models;
  const withVideos = models.filter(model => model.maxVideos);
  // vm 跨 realm 数组原型与主 realm 不同，deepEqual/deepStrictEqual 会误判，用 JSON.stringify 比较
  assert.equal(
    JSON.stringify(withVideos.map(model => model.id).sort()),
    JSON.stringify(['doubao-seedance-2-0-260128（国内）', 'seedance-2.0', 'seedance-2.0-fast', 'seedance-2.0-mini', 'seedance2.5']),
    'apimart 三兄弟 + agtoken Seedance 两模型带 maxVideos'
  );
  const entryById = id => models.find(model => model.id === id);
  // apimart 三兄弟：顶层 video_urls[]，上限 3
  for (const id of ['seedance-2.0', 'seedance-2.0-fast', 'seedance-2.0-mini']) {
    const model = entryById(id);
    assert.equal(model.maxVideos, 3, 'apimart 上限 3 个（上游文档）');
    assert.equal(model.apiType, 'apimart');
    assert.ok(/参考视频/.test(model.tips), 'tips 必须说明参考视频能力');
  }
  // agtoken Seedance 系：Seedance 兼容接口 content[] reference_video；2.5 需要 compatModel 全名映射
  const agtokenPro = entryById('doubao-seedance-2-0-260128（国内）');
  assert.equal(agtokenPro.maxVideos, 3, 'agtoken 2.0 上限 3 个（兼容接口模型限制表）');
  assert.equal(agtokenPro.apiType, 'agtoken');
  assert.equal(agtokenPro.compatModel, undefined, '2.0 目录 id 就是兼容接口全名，无需映射');
  const agtoken25 = entryById('seedance2.5');
  assert.equal(agtoken25.maxVideos, 10, 'agtoken 2.5 上限 10 个（兼容接口模型限制表）');
  assert.equal(agtoken25.compatModel, 'doubao-seedance-2-5-260628（国内）', '2.5 目录 id 是别名，兼容接口只认全名');
  for (const model of [agtokenPro, agtoken25]) {
    assert.ok(/参考视频/.test(model.tips), 'tips 必须说明参考视频能力');
  }
  // agtoken Wan 系 + H3/Hailuo 均无 maxVideos（Wan 参考视频按输入+输出时长合计计秒，不开）
  for (const id of ['wan3.0-video（国内）', 'wan3.0-video-prime（国内）', 'MiniMax-H3', 'MiniMax-Hailuo-2.3-Fast']) {
    assert.equal(entryById(id)?.maxVideos || 0, 0, `${id} 不声明 maxVideos`);
  }
});

// ---------- 工具函数 ----------

test('normalizeVideoRefNode 补齐缺省字段，运行态归位', () => {
  const { context } = buildVideoRefHarness();
  const node = context.normalizeVideoRefNode({ type: 'video-ref' });
  assert.equal(node.videoPath, '');
  assert.equal(node.videoUrl, '');
  assert.equal(node.videoUrlExpiresAt, 0);
  assert.equal(node.videoBytes, 0);
  assert.equal(node._videoRefUploading, false);
  // 非法数值归零
  const bad = context.normalizeVideoRefNode({ type: 'video-ref', videoBytes: 'abc', videoUrlExpiresAt: null });
  assert.equal(bad.videoBytes, 0);
  assert.equal(bad.videoUrlExpiresAt, 0);
});

test('扩展名白名单与字节格式化、过期判定（含 10 分钟余量）', () => {
  const { context } = buildVideoRefHarness();
  assert.equal(context.videoRefExtensionOk('a.MP4'), true);
  assert.equal(context.videoRefExtensionOk('b.mov'), true);
  assert.equal(context.videoRefExtensionOk('c.webm'), true);
  assert.equal(context.videoRefExtensionOk('d.avi'), false);
  assert.equal(context.videoRefExtensionOk('e.mkv'), false);
  assert.equal(context.formatVideoRefBytes(52 * 1024 * 1024), '52.0 MB');
  assert.equal(context.formatVideoRefBytes(800 * 1024), '800 KB');
  // 未过期（余量外）：2 天后到期 → 可复用
  const fresh = videoRefNode({ videoUrl: 'https://cdn.example/a.mp4', videoUrlExpiresAt: Date.now() + 2 * 86400000 });
  assert.equal(context.videoRefExpired(fresh), false);
  // 临界：5 分钟后到期（< 10 分钟余量）→ 视为过期
  const critical = videoRefNode({ videoUrl: 'https://cdn.example/a.mp4', videoUrlExpiresAt: Date.now() + 5 * 60 * 1000 });
  assert.equal(context.videoRefExpired(critical), true);
  // 无 url / 无 expiresAt → 过期
  assert.equal(context.videoRefExpired(videoRefNode({})), true);
  assert.equal(context.videoRefExpired(videoRefNode({ videoUrl: 'https://x', videoUrlExpiresAt: 0 })), true);
});

test('uploadVideoRef：有 path 走 filePath，写回 url/expiresAt，_videoRefUploading 复位', async () => {
  const { context, calls } = buildVideoRefHarness();
  const node = videoRefNode({ videoPath: 'D:\\videos\\ref.mp4' });
  const url = await context.uploadVideoRef(node);
  assert.equal(url, 'https://cdn.example/ref.mp4');
  assert.equal(calls[0].route, '/api/apimart/video-upload');
  assert.equal(calls[0].body.filePath, 'D:\\videos\\ref.mp4');
  assert.equal(calls[0].body.base64, undefined, '有 path 不送 base64');
  assert.equal(node.videoUrl, 'https://cdn.example/ref.mp4');
  assert.ok(node.videoUrlExpiresAt > Date.now(), 'expiresAt 写回');
  assert.equal(node._videoRefUploading, false, 'finally 复位');
});

test('uploadVideoRef：无 path 走暂存 base64；扩展名不符与超 50MB 前置拒绝', async () => {
  const { context, calls } = buildVideoRefHarness();
  const node = videoRefNode({ _pendingVideoBase64: 'QUJD' });
  await context.uploadVideoRef(node);
  assert.equal(calls[0].body.base64, 'QUJD');
  assert.equal(calls[0].body.filePath, undefined);

  const badExt = videoRefNode({ fileName: 'ref.avi', _pendingVideoBase64: 'QUJD' });
  await assert.rejects(() => context.uploadVideoRef(badExt), /MP4 \/ MOV \/ WebM/);
  assert.equal(calls.length, 1, '前置拒绝不发起上传');

  const tooBig = videoRefNode({ videoBytes: 51 * 1024 * 1024, _pendingVideoBase64: 'QUJD' });
  await assert.rejects(() => context.uploadVideoRef(tooBig), /50MB/);
  assert.equal(calls.length, 1, '前置拒绝不发起上传');
});

test('ensureVideoRefUrl：未过期复用不重传；过期有 path 重传；无 url 无 path 报错', async () => {
  const { context, calls } = buildVideoRefHarness();
  const fresh = videoRefNode({ videoUrl: 'https://cdn.example/live.mp4', videoUrlExpiresAt: Date.now() + 2 * 86400000 });
  assert.equal(await context.ensureVideoRefUrl(fresh), 'https://cdn.example/live.mp4');
  assert.equal(calls.length, 0, '未过期不调上传接口');

  const stale = videoRefNode({ videoPath: 'D:\\v\\a.mp4', videoUrl: 'https://cdn.example/old.mp4', videoUrlExpiresAt: Date.now() - 1000 });
  const renewed = await context.ensureVideoRefUrl(stale);
  assert.equal(renewed, 'https://cdn.example/ref.mp4');
  assert.equal(calls.length, 1, '过期且有 path → 重传一次');

  const orphan = videoRefNode({ videoUrl: 'https://cdn.example/dead.mp4', videoUrlExpiresAt: Date.now() - 1000 });
  await assert.rejects(() => context.ensureVideoRefUrl(orphan), /重新选择文件/);
});

// ---------- 入队 ----------

function buildEnqueueHarness({ refs = [], model = 'seedance-2.0', prompt = '', images = [] } = {}) {
  const start = source.indexOf('function enqueueVideoNode(');
  const end = source.indexOf('async function generateAiVideo(', start);
  assert.ok(start > 0 && end > start, 'enqueue slice markers not found');
  const toasts = [];
  const node = { id: 'n_video', type: 'ai-video', disabled: false, seq: 1, _model: model };
  const context = {
    console,
    window: {},
    desktop: null,
    state: { activePageId: 'p1', settings: { apiKey: 'sk-a', agtokenApiKey: 'sk-g', exportFolderLabel: 'export' } },
    findNode: id => (id === node.id ? node : null),
    taskQueueForNode: () => [],
    queueTaskIsSettled: () => true,
    collectUpstreamForAI: () => ({ texts: prompt ? [prompt] : [], orderedRefs: images }),
    collectVideoRefInputs: () => refs,
    videoCatalogEntry: modelId => context.window.CANVASFLOW_VIDEO_CATALOG.models.find(entry => entry.id === modelId) || null,
    videoGenerationSettings: () => ({ type: 'ai-video', _model: model, _videoDuration: 5 }),
    refreshAiVideoPrompt: () => {},
    refreshQueuedNodeProgress: () => {},
    currentPage: () => ({ name: '测试项目' }),
    uid: () => 'uid1',
    aiTaskQueue: { items: [], nextId: 1 },
    render: () => {},
    renderTaskQueue: () => {},
    pumpAiTaskQueue: () => {},
    toast: message => toasts.push(message),
    VIDEO_TASK_MAX_IMAGES: 9,
  };
  runSlice(source.slice(start, end), context);
  return { context, toasts, node };
}

const ref = (id, x) => ({ id, type: 'video-ref', x, fileName: `${id}.mp4`, videoPath: `D:\\v\\${id}.mp4`, videoUrl: '', videoUrlExpiresAt: 0, videoBytes: 1000, _videoRefUploading: false });

test('enqueueVideoNode：参考视频进任务并按 maxVideos 截取，超限提示', () => {
  const two = buildEnqueueHarness({ refs: [ref('r1', 0), ref('r2', 100)] });
  assert.equal(two.context.enqueueVideoNode('n_video'), 1);
  assert.equal(two.context.aiTaskQueue.items.length, 1);
  assert.equal(two.context.aiTaskQueue.items[0].referenceVideos.length, 2);
  assert.deepEqual(
    two.context.aiTaskQueue.items[0].referenceVideos.map(item => item.nodeId),
    ['r1', 'r2']
  );

  const four = buildEnqueueHarness({ refs: [ref('r1', 0), ref('r2', 1), ref('r3', 2), ref('r4', 3)] });
  assert.equal(four.context.enqueueVideoNode('n_video'), 1);
  const task = four.context.aiTaskQueue.items[0];
  assert.equal(task.referenceVideos.length, 3, '最多 3 个（上游文档上限）');
  assert.deepEqual(task.referenceVideos.map(item => item.nodeId), ['r1', 'r2', 'r3']);
  assert.ok(four.toasts.some(message => message.includes('超出当前模型上限')), '有超限提示');
});

test('enqueueVideoNode：不支持的模型带参考视频 → 拒绝入队', () => {
  const harness = buildEnqueueHarness({ refs: [ref('r1', 0)], model: 'MiniMax-Hailuo-2.3-Fast' });
  assert.equal(harness.context.enqueueVideoNode('n_video'), 0);
  assert.equal(harness.context.aiTaskQueue.items.length, 0);
  assert.ok(harness.toasts.some(message => message.includes('不支持参考视频')), '提示不支持并指路 seedance');
  // agtoken Wan 系同样拒绝（maxVideos 缺省），文案指向 Seedance 系（两家均可）
  const wan = buildEnqueueHarness({ refs: [ref('r1', 0)], model: 'wan3.0-video（国内）' });
  assert.equal(wan.context.enqueueVideoNode('n_video'), 0);
  assert.ok(wan.toasts.some(message => message.includes('Seedance 系模型')), 'wan 拒绝文案指向 Seedance 系');
});

test('enqueueVideoNode：文字/参考图/参考视频全空 → 拒绝入队', () => {
  const harness = buildEnqueueHarness({ refs: [], prompt: '', images: [] });
  assert.equal(harness.context.enqueueVideoNode('n_video'), 0);
  assert.ok(harness.toasts.some(message => message.includes('文字、参考图或参考视频')));
  // 参考视频单独也能撑起任务（无文字无图）
  const videoOnly = buildEnqueueHarness({ refs: [ref('r1', 0)], prompt: '', images: [] });
  assert.equal(videoOnly.context.enqueueVideoNode('n_video'), 1);
});

// ---------- 提交 payload ----------

function buildSubmitHarness({ refs = [], model = 'seedance-2.0', images = [], ensureUrl } = {}) {
  const start = source.indexOf('async function generateAiVideo(');
  const end = source.indexOf('async function runQueuedTask(');
  const fallbackEnd = source.indexOf('async function runQueuedVideoTask(', start);
  const end2 = end > start ? end : fallbackEnd;
  assert.ok(start > 0 && end2 > start, 'submit slice markers not found');
  const calls = [];
  const task = {
    prompt: '风格迁移',
    orderedImages: images,
    referenceVideos: refs,
    generationSettings: { _model: model, _videoDuration: 5, _videoResolution: '720p', _videoRatio: '16:9', _videoAudio: true },
  };
  const context = {
    window: {},
    console,
    desktop: null,
    state: { settings: { apiKey: 'sk-a', agtokenApiKey: 'sk-g' } },
    VIDEO_TASK_MAX_IMAGES: 9,
    VIDEO_TASK_MAX_ATTEMPTS: 360,
    VIDEO_TASK_POLL_MS: 1,
    videoCatalogEntry: modelId => context.window.CANVASFLOW_VIDEO_CATALOG.models.find(entry => entry.id === modelId) || null,
    activeApiKey: apiType => (apiType === 'agtoken' ? 'sk-g' : 'sk-a'),
    materializeReferenceImage: async value => `data:image/png;base64,${value}`,
    findNode: () => null,
    ensureVideoRefUrl: ensureUrl || (async node => node.videoUrl || `https://cdn.example/${node.nodeId}.mp4`),
    apiFetch: async (route, options) => {
      calls.push({ route, body: options.body ? JSON.parse(options.body) : null });
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 200, data: [{ status: 'submitted', task_id: 'task_01ABC' }] }),
      };
    },
  };
  runSlice(source.slice(start, end2), context);
  return { context, calls, task };
}

test('submitVideoGeneration：apimart 顶层 video_urls 与 image_urls 并存', async () => {
  const harness = buildSubmitHarness({
    refs: [{ nodeId: 'r1', videoUrl: 'https://cdn.example/r1.mp4', videoUrlExpiresAt: Date.now() + 86400000 }],
    images: ['imgA', 'imgB'],
  });
  const taskId = await harness.context.submitVideoGeneration(harness.task);
  assert.equal(taskId, 'task_01ABC');
  assert.equal(harness.calls[0].route, '/api/apimart/video-generate');
  assert.deepEqual(harness.calls[0].body.video_urls, ['https://cdn.example/r1.mp4']);
  assert.deepEqual(harness.calls[0].body.image_urls, ['data:image/png;base64,imgA', 'data:image/png;base64,imgB']);
  assert.equal(harness.calls[0].body._apiKey, 'sk-a');
});

test('submitVideoGeneration：first_frame 模型带参考视频 → 互斥拒绝', async () => {
  const harness = buildSubmitHarness({
    refs: [{ nodeId: 'r1', videoUrl: 'https://cdn.example/r1.mp4', videoUrlExpiresAt: Date.now() + 86400000 }],
    model: 'MiniMax-Hailuo-2.3-Fast',
    images: ['imgA'],
  });
  await assert.rejects(() => harness.context.submitVideoGeneration(harness.task), /互斥|不支持参考视频/);
});

test('submitVideoGeneration：agtoken Wan（maxVideos 缺省）带参考视频 → 尽早拒绝', async () => {
  const harness = buildSubmitHarness({
    refs: [{ nodeId: 'r1', videoUrl: 'https://cdn.example/r1.mp4' }],
    model: 'wan3.0-video（国内）',
  });
  await assert.rejects(() => harness.context.submitVideoGeneration(harness.task), /Seedance 系/);
  assert.equal(harness.calls.length, 0, '拒绝发生在发请求之前');
});

test('submitVideoGeneration：agtoken Seedance + 参考视频 → 兼容接口 content[] 形状 + 通道标记', async () => {
  const harness = buildSubmitHarness({
    refs: [
      { nodeId: 'r1', videoUrl: 'https://cdn.example/r1.mp4', videoUrlExpiresAt: Date.now() + 86400000 },
      { nodeId: 'r2', videoUrl: 'https://cdn.example/r2.mp4', videoUrlExpiresAt: Date.now() + 86400000 },
    ],
    model: 'doubao-seedance-2-0-260128（国内）',
    images: ['imgA', 'imgB'],
  });
  const taskId = await harness.context.submitVideoGeneration(harness.task);
  assert.equal(taskId, 'task_01ABC', '兼容接口提交响应能取到任务号');
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].route, '/api/agtoken/seedance-task', '带参考视频改走 Seedance 兼容接口路由');
  const body = harness.calls[0].body;
  assert.equal(body.model, 'doubao-seedance-2-0-260128（国内）', '2.0 目录 id 即全名');
  assert.equal(body._apiKey, 'sk-g', 'agtoken key 随请求体');
  // content[] 多模态素材：text 在前，图片按 reference_image、视频按 reference_video 依序入列
  assert.equal(body.content.length, 5);
  assert.deepEqual(body.content[0], { type: 'text', text: '风格迁移' });
  assert.deepEqual(body.content[1], { type: 'image_url', image_url: { url: 'data:image/png;base64,imgA' }, role: 'reference_image' });
  assert.deepEqual(body.content[2], { type: 'image_url', image_url: { url: 'data:image/png;base64,imgB' }, role: 'reference_image' });
  assert.deepEqual(body.content[3], { type: 'video_url', video_url: { url: 'https://cdn.example/r1.mp4' }, role: 'reference_video' });
  assert.deepEqual(body.content[4], { type: 'video_url', video_url: { url: 'https://cdn.example/r2.mp4' }, role: 'reference_video' });
  // 兼容接口顶层平铺：不带 metadata/seconds（那是统一接口的形状）
  assert.equal(body.metadata, undefined);
  assert.equal(body.seconds, undefined);
  assert.equal(body.duration, 5);
  assert.equal(body.resolution, '720p');
  assert.equal(body.ratio, '16:9');
  assert.equal(body.generate_audio, true);
  assert.equal(body.watermark, false);
  assert.equal(harness.task.videoChannel, 'agtoken-seedance', '通道标记供轮询分流');
});

test('submitVideoGeneration：seedance2.5 带参考视频 → compatModel 全名映射', async () => {
  const harness = buildSubmitHarness({
    refs: [{ nodeId: 'r1', videoUrl: 'https://cdn.example/r1.mp4', videoUrlExpiresAt: Date.now() + 86400000 }],
    model: 'seedance2.5',
  });
  await harness.context.submitVideoGeneration(harness.task);
  assert.equal(harness.calls[0].route, '/api/agtoken/seedance-task');
  assert.equal(harness.calls[0].body.model, 'doubao-seedance-2-5-260628（国内）', '目录 id 是别名，提交用兼容接口全名');
  assert.equal(harness.task.videoChannel, 'agtoken-seedance');
});

test('submitVideoGeneration：agtoken 无参考视频 → 仍走统一接口（回归）', async () => {
  const harness = buildSubmitHarness({
    model: 'doubao-seedance-2-0-260128（国内）',
    images: ['imgA'],
  });
  await harness.context.submitVideoGeneration(harness.task);
  assert.equal(harness.calls[0].route, '/api/agtoken/video-generate', '无视频维持统一接口');
  assert.equal(harness.calls[0].body.metadata?.ratio, '16:9');
  assert.equal(harness.calls[0].body.duration, 5);
  assert.equal(harness.calls[0].body.seconds, 5, '统一接口 duration 与 seconds 同时携带');
  assert.equal(harness.calls[0].body.content, undefined, '不带兼容接口 content[]');
  assert.equal(harness.task.videoChannel, undefined, '不标记兼容通道');
});

test('pollVideoTask：按通道分流查询路径', async () => {
  const harness = buildSubmitHarness({});
  const stubSucceeded = async (route, options) => {
    harness.calls.push({ route, method: options.method || 'GET' });
    return { ok: true, status: 200, json: async () => ({ id: 'task_x', status: 'succeeded', content: { video_url: 'https://up.example/out.mp4' } }) };
  };
  harness.context.apiFetch = stubSucceeded;
  assert.equal(await harness.context.pollVideoTask('task_01AbC', null, 'agtoken-seedance'), 'https://up.example/out.mp4');
  assert.equal(harness.calls[0].route, '/api/agtoken/seedance-task/task_01AbC', '兼容通道走 seedance-task 查询（含 _ 任务号原样）');
  assert.equal(await harness.context.pollVideoTask('vid9', null, 'apimart'), 'https://up.example/out.mp4');
  assert.equal(harness.calls[1].route, '/api/apimart/video-task/vid9', 'apimart 通道不变');
  assert.equal(await harness.context.pollVideoTask('vid8', null, 'agtoken'), 'https://up.example/out.mp4');
  assert.equal(harness.calls[2].route, '/api/agtoken/video-task/vid8', '默认通道走统一接口查询');
});

test('submitVideoGeneration：无参考视频时 payload 不带 video_urls（回归）', async () => {
  const harness = buildSubmitHarness({ images: ['imgA'] });
  await harness.context.submitVideoGeneration(harness.task);
  assert.equal(harness.calls[0].body.video_urls, undefined);
  assert.ok(harness.calls[0].body.image_urls.length === 1);
});

// ---------- 静态接线断言 ----------

test('app.js 静态接线：节点注册/拖拽/菜单/收集器齐全', () => {
  for (const marker of [
    'function normalizeVideoRefNode(',
    'function collectVideoRefInputs(',
    'function videoRefNodeBody(',
    'function adoptVideoRefFile(',
    'function ensureVideoRefUrl(',
    'function addVideoRefNode(',
    'function refreshDownstreamVideoPrompts(',
    'droppedVideoFile',
    'adoptDroppedVideoRef',
    '"添加参考视频节点"',
    'video-ref-choose',
    'video-ref-upload',
    'node.type === "video-ref" ? "参考视频"',
    'body = videoRefNodeBody(node)',
    // app.js 为 CRLF 行尾，多行标记不要内嵌 \n；walkNodes 归一化块用单行标记
    'if (node.type !== "video-ref") return;',
    'referenceVideos: videoRefs.map',
    'payload.video_urls = videoUrls;',
    // agtoken Seedance 兼容接口分流：content[] 构造 + 通道标记 + 轮询按通道选路
    'task.videoChannel = "agtoken-seedance"',
    'role: "reference_video"',
    'task.videoChannel || videoApiType',
    'type === "video-ref" ? VIDEO_REF_NODE_HEIGHT',
    'videoPath: type === "video-ref" ? "" : undefined',
  ]) {
    assert.ok(source.includes(marker), `app.js 缺少标记: ${marker}`);
  }
  // video-ref 不进编组运行清单（纯引用源）
  const groupTypes = source.match(/const CANVAS_GROUP_RUNNABLE_TYPES = new Set\(\[([^\]]*)\]\)/);
  assert.ok(groupTypes && !groupTypes[1].includes('"video-ref"'), 'video-ref 不应加入 CANVAS_GROUP_RUNNABLE_TYPES');
});

test('上传路由三处注册 + 桌面桥齐全（JS/C#/mac 双实现）', () => {
  assert.ok(serverSource.includes('"/api/apimart/video-upload"'), 'server.js 路由');
  assert.ok(serverSource.includes('retention_days=3'), 'server.js 固定 3 天档');
  assert.ok(serverSource.includes('delete payload._apiKey'), 'server.js 剥 _apiKey');
  assert.ok(runtimeSource.includes('"/api/apimart/video-upload"'), 'canvas-runtime desktopApiPaths');
  assert.ok(desktopApiSource.includes('"/api/apimart/video-upload"'), 'DesktopApi IsNetworkRoute');
  assert.ok(desktopApiSource.includes('UploadVideoReferenceAsync'), 'DesktopApi handler');
  assert.ok(desktopApiSource.includes('retention_days=3'), 'DesktopApi 固定 3 天档');
  assert.ok(desktopApiSource.includes('payload.Remove("_apiKey")'), 'DesktopApi 剥 _apiKey');
  assert.ok(mainWindowSource.includes('desktop:choose-video-file'), 'Windows 桥 RPC');
  assert.ok(mainWindowSource.includes('chooseVideoFile:'), 'Windows 桥注入');
  assert.ok(macMainSource.includes('desktop:choose-video-file'), 'mac ipc 注册');
  assert.ok(macMainSource.includes('async function chooseVideoFile('), 'mac handler');
  assert.ok(macPreloadSource.includes('chooseVideoFile:'), 'mac preload 注入');
});

test('agtoken Seedance 兼容接口路由四处注册（server/runtime/C# 精确+前缀）', () => {
  // server.js：提交 + 查询，上游路径 /api/v3/contents/generations/tasks（与 agtoken 统一接口并存）
  assert.ok(serverSource.includes('"/api/agtoken/seedance-task"'), 'server.js 提交路由');
  assert.ok(serverSource.includes('startsWith("/api/agtoken/seedance-task/")'), 'server.js 查询前缀');
  assert.ok(serverSource.includes('"/api/v3/contents/generations/tasks"'), 'server.js 上游路径');
  assert.ok(serverSource.includes('"/api/v3/contents/generations/tasks/"'), 'server.js 查询上游路径');
  // 兼容接口任务号形如 task_xxx（含下划线），正则必须多放行 _
  assert.ok(serverSource.includes('[A-Za-z0-9._:\\-_]'), 'server.js 任务号正则含 _');
  assert.ok(runtimeSource.includes('"/api/agtoken/seedance-task"'), 'canvas-runtime 精确条目');
  assert.ok(runtimeSource.includes('startsWith("/api/agtoken/seedance-task/")'), 'canvas-runtime 前缀');
  assert.ok(desktopApiSource.includes('"/api/agtoken/seedance-task"'), 'DesktopApi IsNetworkRoute 精确');
  assert.ok(desktopApiSource.includes('StartsWith("/api/agtoken/seedance-task/", StringComparison.Ordinal)'), 'DesktopApi IsNetworkRoute 前缀');
  assert.ok(desktopApiSource.includes('"/api/v3/contents/generations/tasks"'), 'DesktopApi 上游路径');
  assert.ok(desktopApiSource.includes('seedanceTaskId, @"^[A-Za-z0-9._:\\-_]{1,200}$"'), 'DesktopApi 任务号正则含 _');
});

test('界面样式与 ?v= 基线', () => {
  for (const marker of ['.video-card-body', '.video-ref-badge', '.video-card-actions button']) {
    assert.ok(stylesSource.includes(marker), `styles.css 缺少 ${marker}`);
  }
  // 版本线归活跃会话所有（app/styles 的标签随时会被并行会话继续推进），这里只锁本轮改动引入的不变量：
  // model-catalog 与 canvas-runtime 必须同版本成对递增（本轮把两者从 20261114-videoapimart4 一起 bump），且不再是旧值
  const catalogVersion = (indexSource.match(/model-catalog\.js\?v=([^"]+)/) || [])[1];
  const runtimeVersion = (indexSource.match(/canvas-runtime\.js\?v=([^"]+)/) || [])[1];
  assert.ok(catalogVersion, 'index.html 缺 model-catalog 版本参数');
  assert.equal(runtimeVersion, catalogVersion, 'model-catalog 与 canvas-runtime 必须同版本');
  assert.notEqual(catalogVersion, '20261114-videoapimart4', '本轮改动后必须已递增');
  assert.ok(/styles\.css\?v=/.test(indexSource) && /app\.js\?v=/.test(indexSource), 'index.html 的 app/styles 版本参数仍在');
});
