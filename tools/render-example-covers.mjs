#!/usr/bin/env node
// 旧的近似 Canvas 绘制入口已停用，防止覆盖真实节点截图。
// 运行真实截图前必须取得用户的浏览器截图授权（参见 AGENTS.md）。
console.error('旧仿画封面工具已停用。经用户授权后请运行 node tools/capture-real-example-covers.mjs（需要 playwright-core）。');
process.exitCode = 1;
