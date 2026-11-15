// AI 视频节点 apimart 网关接入：vm 切片真实源码，锁死分流与目录事实。
// ① 视频目录按已填 key 分站点过滤（只填一家只出该站，都填/都没填全显）；
// ② submitVideoGeneration 按 apiType 分流：apimart 走 /api/apimart/video-generate +
//    顶层平铺参数（image_urls / first_frame_image），agtoken 保持 images[]+metadata 原样；
// ③ 提交响应任务号兼容 apimart 的 {data:[{task_id}]} 数组形状；
// ④ Hailuo-2.3-Fast（first_frame 模式）无参考图时拒绝提交；1080p 时长钳 6 秒；
// ⑤ pollVideoTask 按站点选查询路由；extractVideoTaskInfo 兼容 apimart 查询响应。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const catalogSource = fs.readFileSync(require.resolve('../model-catalog.js'), 'utf8');

// 目录工具 + normalize：function videoCatalog( → function videoUpstreamSummary( 之前
function buildCatalogHarness(settings) {
  const start = source.indexOf('function videoCatalog(');
  const end = source.indexOf('function videoUpstreamSummary(', start);
  assert.ok(start > 0 && end > start, 'catalog slice markers not found');
  const slice = source.slice(start, end);
  const context = {
    window: {},
    state: { settings: { apiKey: '', agtokenApiKey: '', ...settings } },
    console,
  };
  vm.createContext(context);
  vm.runInContext(catalogSource, context);
  vm.runInContext(slice, context);
  return context;
}

// 提交/轮询切片：async function generateAiVideo( → async function runQueuedVideoTask( 之前
function buildSubmitHarness({ settings, apiResponses, images = [], desktop = null } = {}) {
  const start = source.indexOf('async function generateAiVideo(');
  const end = source.indexOf('async function runQueuedVideoTask(', start);
  assert.ok(start > 0 && end > start, 'submit slice markers not found');
  const slice = source.slice(start, end);
  const calls = [];
  const context = {
    window: {},
    console,
    setTimeout,
    desktop,
    state: { settings: { apiKey: '', agtokenApiKey: '', ...settings } },
    VIDEO_TASK_MAX_IMAGES: 9,
    VIDEO_TASK_MAX_ATTEMPTS: 3,
    VIDEO_TASK_POLL_MS: 1,
    videoCatalogEntry: modelId => context.window.CANVASFLOW_VIDEO_CATALOG.models.find(model => model.id === modelId) || null,
    activeApiKey: apiType => (apiType === 'agtoken' ? context.state.settings.agtokenApiKey : context.state.settings.apiKey) || '',
    materializeReferenceImage: async ref => `data:image/png;base64,${ref}`,
    enqueueVideoNode: () => {},
    toast: () => {},
    normalizeVideoNode: () => {},
    apiFetch: async (route, options) => {
      calls.push({ route, options: options.body ? JSON.parse(options.body) : null });
      const response = apiResponses[calls.length - 1] || {};
      return {
        ok: response.ok !== false,
        status: response.status || 200,
        json: async () => response.body || {},
      };
    },
  };
  vm.createContext(context);
  vm.runInContext(catalogSource, context);
  vm.runInContext(slice, context);
  return { context, calls };
}

const task = (model, extra = {}) => ({
  prompt: '一只猫在草地上奔跑',
  orderedImages: [],
  generationSettings: { _model: model, _videoDuration: 6, _videoResolution: '768p', _videoRatio: '16:9', _videoAudio: true, ...extra },
});

test('视频目录按已填 key 分站点过滤：只填一家只出该站,都填或都没填全显', () => {
  const both = buildCatalogHarness({ apiKey: 'sk-a', agtokenApiKey: 'sk-g' });
  assert.equal(both.videoCatalogModels().length, 12, '两家 key 都填 → 12 个模型全显');

  const onlyApimart = buildCatalogHarness({ apiKey: 'sk-a', agtokenApiKey: '' });
  assert.ok(onlyApimart.videoCatalogModels().every(model => model.apiType === 'apimart'), '只填 apimart → 只出 apimart 模型');
  assert.equal(onlyApimart.videoCatalogModels().length, 8);

  const onlyAgtoken = buildCatalogHarness({ apiKey: '', agtokenApiKey: 'sk-g' });
  assert.ok(onlyAgtoken.videoCatalogModels().every(model => model.apiType === 'agtoken'), '只填 agtoken → 只出 agtoken 模型');
  assert.equal(onlyAgtoken.videoCatalogModels().length, 4);

  const none = buildCatalogHarness({});
  assert.equal(none.videoCatalogModels().length, 12, '都没填 → 全显（与对话目录同语义）');
});

test('apimart 目录条目必须带计费 note 与能力 tips（用户要求接入时说明差异）', () => {
  const ctx = buildCatalogHarness({});
  const catalog = ctx.window.CANVASFLOW_VIDEO_CATALOG;
  for (const model of catalog.models) {
    assert.ok(String(model.note || '').trim(), `${model.id} 缺计费说明 note`);
    assert.ok(String(model.tips || '').trim(), `${model.id} 缺能力说明 tips`);
    assert.ok(String(model.priceTag || '').trim(), `${model.id} 缺下拉短价签 priceTag`);
    assert.ok(Array.isArray(model.resolutions) && model.resolutions.length, `${model.id} 缺分辨率档`);
  }
  // wan3.0 参考图语义：裸 image_urls 无参考族输入时上游按首尾帧族路由（第 1 张首帧、第 2 张尾帧）
  const wan = catalog.models.find(model => model.id === 'wan3.0-video');
  assert.equal(wan.maxImages, 2, 'wan3.0 参考图上限 2（首尾帧族语义）');
  // Hailuo-Fast 仅图生视频
  const hailuo = catalog.models.find(model => model.id === 'MiniMax-Hailuo-2.3-Fast');
  assert.equal(hailuo.imageMode, 'first_frame');
});

test('apimart H3（reference 模式）提交:顶层平铺参数 + image_urls,路由与 key 走 apimart 槽', async () => {
  const { context, calls } = buildSubmitHarness({
    settings: { apiKey: 'sk-apimart', agtokenApiKey: 'sk-agtoken' },
    apiResponses: [{ body: { code: 200, data: [{ status: 'submitted', task_id: 'task_01J9HA7JPQ9A0Z6JZ3V8M9W6PZ' }] } }],
  });
  const t = task('MiniMax-H3', { _videoResolution: '2K', _videoDuration: 5 });
  t.orderedImages = ['img1', 'img2'];
  const taskId = await context.submitVideoGeneration(t);
  assert.equal(taskId, 'task_01J9HA7JPQ9A0Z6JZ3V8M9W6PZ', '任务号取自 data[0].task_id 数组形状');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].route, '/api/apimart/video-generate');
  const payload = calls[0].options;
  assert.equal(payload.model, 'MiniMax-H3');
  assert.equal(payload.duration, 5);
  assert.equal(payload.resolution, '2K', '分辨率字面值原样透传（不强制小写）');
  assert.equal(payload.aspect_ratio, '16:9');
  assert.deepEqual(payload.image_urls, ['data:image/png;base64,img1', 'data:image/png;base64,img2'], '参考图走 image_urls');
  assert.equal(payload.first_frame_image, undefined);
  assert.equal(payload.metadata, undefined, 'apimart 不带 agtoken 的 metadata 包装');
  assert.equal(payload._apiKey, 'sk-apimart', '非桌面模式随 body 携带 apimart 槽 key');
});

test('apimart Hailuo-2.3-Fast(first_frame 模式):首帧取第一张参考图,无比例字段;无图拒绝提交', async () => {
  const { context, calls } = buildSubmitHarness({
    settings: { apiKey: 'sk-apimart' },
    apiResponses: [{ body: { code: 200, data: [{ task_id: 'task_02' }] } }],
  });
  const t = task('MiniMax-Hailuo-2.3-Fast', { _videoDuration: 6, _videoResolution: '768p', _videoRatio: '16:9' });
  t.orderedImages = ['imgA', 'imgB'];
  await context.submitVideoGeneration(t);
  const payload = calls[0].options;
  assert.equal(payload.first_frame_image, 'data:image/png;base64,imgA', '首帧图取第一张');
  assert.equal(payload.image_urls, undefined);
  assert.equal(payload.aspect_ratio, undefined, '图生视频比例由首帧决定,不下发');

  await assert.rejects(
    () => context.submitVideoGeneration({ ...task('MiniMax-Hailuo-2.3-Fast'), orderedImages: [] }),
    /需要至少一张参考图作为首帧/,
    'first_frame 模式无图必须报错'
  );
});

test('agtoken 提交保持原形状(images[]+metadata),响应任务号兼容对象形状', async () => {
  const { context, calls } = buildSubmitHarness({
    settings: { agtokenApiKey: 'sk-agtoken' },
    apiResponses: [{ body: { data: { task_id: 'agt-1' } } }],
  });
  const t = task('doubao-seedance-2-0-260128（国内）', { _videoResolution: '1080p', _videoDuration: 5 });
  t.orderedImages = ['img1'];
  const taskId = await context.submitVideoGeneration(t);
  assert.equal(taskId, 'agt-1');
  assert.equal(calls[0].route, '/api/agtoken/video-generate');
  const payload = calls[0].options;
  assert.deepEqual(payload.images, ['data:image/png;base64,img1']);
  assert.equal(payload.seconds, 5, 'agtoken 保持 duration/seconds 双字段');
  assert.equal(payload.metadata.resolution, '1080p');
  assert.equal(payload.metadata.generate_audio, true);
  assert.equal(payload._apiKey, 'sk-agtoken');
});

test('apimart seedance 系提交:声音开关走 generate_audio,wan3.0 最多取 2 张图', async () => {
  const { context, calls } = buildSubmitHarness({
    settings: { apiKey: 'sk-apimart' },
    apiResponses: [{ body: { code: 200, data: [{ task_id: 'task_sd25' }] } }],
  });
  const t = task('seedance-2.5', { _videoResolution: '720p', _videoDuration: 20, _videoRatio: 'adaptive', _videoAudio: true });
  t.orderedImages = ['img1'];
  await context.submitVideoGeneration(t);
  const payload = calls[0].options;
  assert.equal(payload.generate_audio, true, 'seedance 系声音开关随 payload 下发');
  assert.equal(payload.duration, 20, '长时长（20 秒）透传');
  assert.equal(payload.resolution, '720p');
  assert.equal(payload.aspect_ratio, 'adaptive');
  assert.deepEqual(payload.image_urls, ['data:image/png;base64,img1']);

  // wan3.0 目录 maxImages=2： orderedImages 有 3 张也只发 2 张（首尾帧族语义）
  const ctx2 = buildSubmitHarness({
    settings: { apiKey: 'sk-apimart' },
    apiResponses: [{ body: { code: 200, data: [{ task_id: 'task_wan' }] } }],
  });
  const wan = task('wan3.0-video', { _videoResolution: '1080P', _videoDuration: 10, _videoRatio: 'adaptive', _videoAudio: false });
  wan.orderedImages = ['img1', 'img2', 'img3'];
  await ctx2.context.submitVideoGeneration(wan);
  assert.equal(ctx2.calls[0].options.image_urls.length, 2, 'wan3.0 只发前 2 张（首帧+尾帧）');
  assert.equal(ctx2.calls[0].options.generate_audio, undefined, 'wan3.0 自带音轨无开关,不发字段');
});

test('normalizeVideoNode:Hailuo 1080p 时长钳 6 秒;空 ratios 不崩;不可见模型回退当前站点默认', () => {
  const ctx = buildCatalogHarness({ apiKey: 'sk-a', agtokenApiKey: 'sk-g' });

  const hailuo = { type: 'ai-video', _model: 'MiniMax-Hailuo-2.3-Fast', _videoResolution: '1080p', _videoDuration: 10, _videoRatio: '9:16' };
  ctx.normalizeVideoNode(hailuo);
  assert.equal(hailuo._videoDuration, 6, '1080p 白名单 [6] 把 10 秒钳回 6 秒');

  const hailuo2 = { type: 'ai-video', _model: 'MiniMax-Hailuo-2.3-Fast', _videoResolution: '768p', _videoDuration: 6, _videoRatio: '16:9' };
  ctx.normalizeVideoNode(hailuo2);
  assert.equal(hailuo2._videoDuration, 6, '合法组合保持不变');
  assert.equal(hailuo2._videoRatio, '16:9', '空 ratios 档不重置旧值,也不报错');

  // 只填 apimart key:agtoken 存档模型切到可见集合默认（apimart 首个模型）
  const apimartOnly = buildCatalogHarness({ apiKey: 'sk-a' });
  const stale = { type: 'ai-video', _model: 'doubao-seedance-2-0-260128（国内）', _videoResolution: '4k', _videoDuration: 5, _videoRatio: '16:9' };
  apimartOnly.normalizeVideoNode(stale);
  assert.equal(stale._model, 'MiniMax-H3', 'agtoken 存档模型在 apimart-only 环境回退到该站首模型');
  assert.equal(stale._videoResolution, '2K', '分辨率回退到新模型默认档');
});

test('pollVideoTask 按站点选查询路由;extractVideoTaskInfo 兼容 apimart 查询响应', async () => {
  const { context, calls } = buildSubmitHarness({
    settings: { apiKey: 'sk-apimart' },
    apiResponses: [
      { body: { id: 'task_01J9', status: 'processing', progress: '45%' } },
      { body: { id: 'task_01J9', status: 'completed', video_url: 'https://cdn.example.com/v.mp4' } },
    ],
  });
  const url = await context.pollVideoTask('task_01J9', null, 'apimart');
  assert.equal(url, 'https://cdn.example.com/v.mp4');
  assert.equal(calls[0].route, '/api/apimart/video-task/task_01J9');
  assert.match(calls[1].route, /\/api\/apimart\/video-task\//, '轮询全程走 apimart 查询路由');

  // agtoken 缺省分支不受影响
  const { context: agCtx, calls: agCalls } = buildSubmitHarness({
    settings: { agtokenApiKey: 'sk-g' },
    apiResponses: [{ body: { data: { status: 'succeeded', url: 'https://x/v.mp4' } } }],
  });
  const agUrl = await agCtx.pollVideoTask('agt-1', null, 'agtoken');
  assert.equal(agUrl, 'https://x/v.mp4');
  assert.match(agCalls[0].route, /\/api\/agtoken\/video-task\//);
});

test('generateAiVideo 按 API 类型校验 key:apimart 模型不再要求 AGToken key', () => {
  // 静态断言：key 守卫必须基于 videoCatalogEntry 的 apiType，而非硬编码 agtoken
  const start = source.indexOf('async function generateAiVideo(');
  const slice = source.slice(start, source.indexOf('enqueueVideoNode(nodeId);', start));
  assert.match(slice, /videoCatalogEntry\(node\._model\)\?\.apiType/, 'key 守卫按当前模型站点分流');
  assert.doesNotMatch(slice, /!activeApiKey\("agtoken"\)/, '不得退回硬编码 agtoken 校验');
});
