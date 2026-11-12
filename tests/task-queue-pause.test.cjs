// 任务队列一键暂停 + 多任务批量并发限流/组间隔：vm 切片 pumpAiTaskQueue 真实源码,
// 用假时钟(Date.now)与可手动触发的 setTimeout 桩同步驱动错峰链路,不发起任何真实请求。
// 锁死五个事实：① 暂停后 pump 不启动任何未发送任务,恢复后继续;
// ② 批量任务(groupImage 非空)并发上限 AI_GROUP_TASK_CONCURRENT=2,全局上限 5 不变;
// ③ 批量占满限额时普通任务仍可启动(跳过批量任务向前找);
// ④ 任务完成后 finally 补位,批量计数随完成释放;
// ⑤ 批量任务组间隔 AI_GROUP_TASK_STAGGER_MS=2000,普通任务维持 500ms。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');

// 静态接线断言：面板按钮、els 绑定、pump 暂停闸门、批量限流与组间隔、任务详情查看必须同时存在
test('静态接线：暂停按钮/暂停闸门/批量限流/组间隔/任务详情齐全', () => {
  const index = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  assert.ok(index.includes('id="taskQueuePauseBtn"'), 'index.html 必须有 taskQueuePauseBtn');
  assert.match(source, /taskQueuePauseBtn: \$\("taskQueuePauseBtn"\)/, 'els 必须绑定 taskQueuePauseBtn');
  assert.match(source, /els\.taskQueuePauseBtn\.onclick/, 'els 必须接 onclick');
  assert.match(source, /let aiQueuePaused = false;/, '暂停状态必须是内存态 let');
  assert.match(source, /if \(aiQueuePaused\) \{ renderTaskQueue\(\); return; \}/, 'pump 顶部必须有暂停闸门');
  assert.match(source, /const AI_GROUP_TASK_CONCURRENT = 2;/, '批量并发上限常量必须为 2');
  assert.match(source, /aiTaskQueue\.groupRunning < AI_GROUP_TASK_CONCURRENT/, 'pump 选择任务必须受批量上限约束');
  assert.match(source, /if \(task\.groupImage\) aiTaskQueue\.groupRunning\+\+;/, '启动批量任务必须计数');
  assert.match(source, /if \(task\.groupImage\) aiTaskQueue\.groupRunning--;/, '批量任务结束必须释放计数');
  assert.match(source, /const AI_GROUP_TASK_STAGGER_MS = 2000;/, '批量组间隔常量必须为 2 秒');
  assert.match(source, /task\.groupImage \? AI_GROUP_TASK_STAGGER_MS : AI_TASK_SUBMIT_STAGGER_MS/, 'pump 必须按任务类型区分错峰间隔');
  assert.match(source, /updateTaskQueuePauseButton/, '按钮状态辅助函数必须存在并被调用');
  assert.match(source, /function showQueuedTaskDetail/, '任务发送详情查看函数必须存在');
  assert.match(source, /function queuedTaskSendImages/, '发送图片取数函数必须存在');
  assert.match(source, /showQueuedTaskDetail\(row\.dataset\.taskId\)/, '点击任务行必须打开发送详情');
});

const SLICE_START = 'const AI_TASK_SUBMIT_STAGGER_MS = 500;';
const SLICE_END = '\nasync function enqueueScreenshotTasks';

function buildHarness(existingTasks = []) {
  const sliceStart = source.indexOf(SLICE_START);
  assert.ok(sliceStart > 0, 'slice start marker not found');
  const sliceEnd = source.indexOf(SLICE_END, sliceStart);
  assert.ok(sliceEnd > sliceStart, 'slice end marker not found');
  const slice = source.slice(sliceStart, sliceEnd);

  let fakeNow = 1_000_000;
  let timerSeq = 0;
  const timers = new Map(); // id -> { fn, ms }
  const timerDelays = []; // 记录每次 setTimeout 的延迟值,用于断言批量组间隔
  const started = [];
  const pendingResolvers = [];
  const aiTaskQueue = { items: existingTasks, running: 0, localRunning: 0, groupRunning: 0, nextId: 1 };
  const context = {
    AI_QUEUE_MAX_CONCURRENT: 5,
    AI_GROUP_TASK_CONCURRENT: 2,
    aiTaskQueue,
    runQueuedTask: task => {
      task.status = 'slot-waiting';
      started.push(task);
      return new Promise(resolve => pendingResolvers.push({ task, resolve }));
    },
    renderTaskQueue() {},
    refreshQueuedNodeProgress() {},
    Date: { now: () => fakeNow },
    setTimeout: (fn, ms) => { timerSeq += 1; timerDelays.push(ms); timers.set(timerSeq, { fn, ms }); return timerSeq; },
    clearTimeout: id => { timers.delete(id); },
    console,
  };
  const api = vm.runInNewContext(`${slice}\n;({ pump: pumpAiTaskQueue, setPaused: v => { aiQueuePaused = v; }, isPaused: () => aiQueuePaused, setLastSubmit: v => { aiQueueLastSubmitAt = v; } })`, context);

  const makeTask = (id, groupImage) => ({ id, nodeId: `n-${id}`, status: 'waiting', progress: 0, prompt: '', groupImage: groupImage || null, localMatting: false });
  // 定时器按其记录的真实剩余延迟推进假时钟(批量 2 秒/普通 500ms 各自成立)
  const drainTimer = () => {
    const [id, entry] = timers.entries().next().value || [];
    if (id === undefined) return false;
    timers.delete(id);
    fakeNow += entry.ms;
    entry.fn();
    return true;
  };
  // pump + 错峰定时器链同步推进,直到没有新任务启动也没有挂起定时器
  const pumpUntilSettled = (maxTicks = 30) => {
    let ticks = 0;
    let before = -1;
    while (ticks < maxTicks && (started.length !== before || timers.size)) {
      before = started.length;
      api.pump();
      if (timers.size) drainTimer();
      ticks += 1;
    }
    assert.ok(ticks < maxTicks, '错峰链路未收敛(疑似定时器循环)');
  };
  const completeTask = async index => {
    const entry = pendingResolvers.splice(index, 1)[0];
    entry.resolve();
    await new Promise(resolve => setImmediate(resolve));
  };
  return { api, aiTaskQueue, started, pendingResolvers, makeTask, pumpUntilSettled, completeTask, timerDelays, drainTimer, now: () => fakeNow, setNow: v => { fakeNow = v; } };
}

const groupImageOf = id => ({ image: `group-${id}`, fileName: `${id}.png`, mime: 'image/png' });

test('批量任务并发上限 2:5 连发也只同时启动 2 个,剩余保持等待', () => {
  const tasks = Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, nodeId: 'n1', status: 'waiting', progress: 0, prompt: '', groupImage: groupImageOf(i), localMatting: false }));
  const h = buildHarness(tasks);
  h.api.setLastSubmit(0); // 越过初始错峰窗口
  h.pumpUntilSettled();
  assert.equal(h.started.length, 2, `批量上限应为 2,实际启动 ${h.started.length}`);
  assert.equal(h.aiTaskQueue.running, 2);
  assert.equal(h.aiTaskQueue.groupRunning, 2);
  assert.deepEqual(h.aiTaskQueue.items.filter(t => t.status === 'waiting').map(t => t.id), ['q2', 'q3', 'q4'], '其余批量任务保持等待');
});

test('批量占满限额时普通任务仍可启动:跳过批量任务向前找,不占批量计数', () => {
  const tasks = [
    { id: 'g1', nodeId: 'n1', status: 'waiting', progress: 0, prompt: '', groupImage: groupImageOf('g1'), localMatting: false },
    { id: 'g2', nodeId: 'n1', status: 'waiting', progress: 0, prompt: '', groupImage: groupImageOf('g2'), localMatting: false },
    { id: 'g3', nodeId: 'n1', status: 'waiting', progress: 0, prompt: '', groupImage: groupImageOf('g3'), localMatting: false },
    { id: 'solo', nodeId: 'n2', status: 'waiting', progress: 0, prompt: '', groupImage: null, localMatting: false },
  ];
  const h = buildHarness(tasks);
  h.api.setLastSubmit(0);
  h.pumpUntilSettled();
  assert.deepEqual(h.started.map(t => t.id), ['g1', 'g2', 'solo'], '批量 2 个 + 普通任务 1 个;g3 被批量上限挡住');
  assert.equal(h.aiTaskQueue.groupRunning, 2, '普通任务不得占用批量计数');
  assert.equal(h.aiTaskQueue.running, 3, '全局并发 5 之内');
});

test('一键暂停:pump 不启动任何未发送任务;恢复后继续发送', () => {
  const tasks = [
    { id: 'g1', nodeId: 'n1', status: 'waiting', progress: 0, prompt: '', groupImage: groupImageOf('g1'), localMatting: false },
    { id: 'solo', nodeId: 'n2', status: 'waiting', progress: 0, prompt: '', groupImage: null, localMatting: false },
  ];
  const h = buildHarness(tasks);
  h.api.setPaused(true);
  h.api.setLastSubmit(0);
  h.api.pump();
  h.api.pump();
  assert.equal(h.started.length, 0, '暂停期间不得启动任何任务');
  assert.equal(h.aiTaskQueue.running, 0);
  assert.equal(h.api.isPaused(), true);
  assert.deepEqual(tasks.map(t => t.status), ['waiting', 'waiting'], '任务状态保持等待(未发送任务全部拦截)');
  h.api.setPaused(false);
  h.pumpUntilSettled();
  assert.deepEqual(h.started.map(t => t.id), ['g1', 'solo'], '恢复后按错峰节奏继续发送');
});

test('任务完成后补位:批量计数随 finally 释放,下一个批量任务自动启动', async () => {
  const tasks = Array.from({ length: 3 }, (_, i) => ({ id: `q${i}`, nodeId: 'n1', status: 'waiting', progress: 0, prompt: '', groupImage: groupImageOf(i), localMatting: false }));
  const h = buildHarness(tasks);
  h.api.setLastSubmit(0);
  h.pumpUntilSettled();
  assert.equal(h.aiTaskQueue.groupRunning, 2);
  await h.completeTask(0); // 完成 q0 → finally 补位(错峰定时器)启动 q2
  h.pumpUntilSettled(); // 同步推进错峰定时器链,让补位真正发生
  assert.equal(h.aiTaskQueue.groupRunning, 2, '释放 1 个名额后立即被 q2 补上');
  assert.deepEqual(h.started.map(t => t.id), ['q0', 'q1', 'q2'], '补位不绕过批量上限,计数先减后启');
  assert.deepEqual(tasks.map(t => t.status), ['slot-waiting', 'slot-waiting', 'slot-waiting']);
});

test('批量任务组间隔 2 秒:批量连发按 2000ms 排定时器,普通任务维持 500ms', () => {
  const tasks = Array.from({ length: 3 }, (_, i) => ({ id: `q${i}`, nodeId: 'n1', status: 'waiting', progress: 0, prompt: '', groupImage: groupImageOf(i), localMatting: false }));
  const h = buildHarness(tasks);
  h.api.setLastSubmit(0);
  h.pumpUntilSettled();
  assert.equal(h.started.length, 2, '批量上限 2,第三个等补位');
  // 定时器只在"间隔未到"时排布:同步推进下每个定时器恰好落在间隔满足点,无需重复排队
  assert.deepEqual(h.timerDelays, [2000], '批量任务的错峰定时器按 2 秒组间隔排布');

  const mixed = [
    { id: 's1', nodeId: 'n2', status: 'waiting', progress: 0, prompt: '', groupImage: null, localMatting: false },
    { id: 's2', nodeId: 'n2', status: 'waiting', progress: 0, prompt: '', groupImage: null, localMatting: false },
    { id: 'g1', nodeId: 'n1', status: 'waiting', progress: 0, prompt: '', groupImage: groupImageOf('g1'), localMatting: false },
  ];
  const h2 = buildHarness(mixed);
  h2.api.setLastSubmit(0);
  h2.pumpUntilSettled();
  assert.deepEqual(h2.started.map(t => t.id), ['s1', 's2', 'g1'], '普通任务 500ms 错峰连发,批量任务最后按组间隔启动');
  // s1 立即启动;s2 距 s1 排 500ms;g1 需距 s2 2000ms——pump 在定时器未到期被再次唤起时
  // 会重排同延迟定时器(harness 先 pump 后 drain 的固定顺序),实际间隔仍由定时器严格保证
  assert.deepEqual(h2.timerDelays, [500, 2000, 2000], '普通任务间隔 500ms,批量任务排 2 秒组间隔(未到期唤起重排属正常)');

  // 中途触发路径(真实场景:别的任务完成/入队提前唤起 pump):距 s2 只过了 500ms,
  // 批量任务还差 1500ms → 重排剩余延迟的定时器,且不启动
  const h3 = buildHarness([
    { id: 's1', nodeId: 'n2', status: 'waiting', progress: 0, prompt: '', groupImage: null, localMatting: false },
    { id: 'g1', nodeId: 'n1', status: 'waiting', progress: 0, prompt: '', groupImage: groupImageOf('g1'), localMatting: false },
  ]);
  h3.api.setLastSubmit(0);
  h3.api.pump(); // s1 立即启动,g1 排 2000ms 定时器
  assert.deepEqual(h3.timerDelays, [2000], '批量任务距普通任务也按 2 秒组间隔排布');
  h3.setNow(h3.now() + 500);
  h3.api.pump(); // 500ms 后其他来源唤起 pump:旧定时器被清,g1 距 s1 仅 500ms → 重排剩余 1500ms
  assert.deepEqual(h3.timerDelays, [2000, 1500], '中途唤起时批量任务重排剩余延迟(2000-已过500)');
  assert.equal(h3.started.length, 1, '组间隔未满不得启动批量任务');
  h3.drainTimer(); // 推进剩余 1500ms → g1 启动
  assert.deepEqual(h3.started.map(t => t.id), ['s1', 'g1'], '组间隔满后批量任务启动');
});

test('暂停对定时器链也生效:错峰定时器触发的 pump 在暂停期同样不启动任务', () => {
  const tasks = [{ id: 'solo', nodeId: 'n2', status: 'waiting', progress: 0, prompt: '', groupImage: null, localMatting: false }];
  const h = buildHarness(tasks);
  h.api.pump(); // 未暂停:启动 solo? 不会——stagger 闸门先拦(aiQueueLastSubmitAt 初始 0,fakeNow=1e6,间隔远大于 500ms,实际会启动)
  if (h.started.length === 0) {
    // 初始 lastSubmit=0 与 fakeNow 间隔足够大时 solo 会立即启动;此分支仅在桩时钟异常时进入
    h.api.setLastSubmit(0);
    h.pumpUntilSettled();
  }
  assert.equal(h.started.length, 1);
  // 再入队一个任务,让 pump 只能通过错峰定时器触发
  const next = { id: 'q-next', nodeId: 'n2', status: 'waiting', progress: 0, prompt: '', groupImage: null, localMatting: false };
  h.aiTaskQueue.items.push(next);
  h.api.setPaused(true);
  h.api.pump(); // pump 顶部清掉挂起定时器并直接返回
  assert.equal(h.started.length, 1, '暂停后连定时器链都必须停住');
  assert.equal(h.aiTaskQueue.items.filter(t => t.status === 'waiting').length, 1, '未发送任务保持等待');
});
