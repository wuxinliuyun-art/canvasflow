const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function planner(nodes, edges) {
  const start = source.indexOf("function canvasGroupExecutionPlan");
  const end = source.indexOf("\nfunction waitForGroupQueueTasks", start);
  const context = {
    state: { nodes, edges },
    CANVAS_GROUP_RUNNABLE_TYPES: new Set(["ai-image", "ai-video", "angle-image", "browser-image", "chat", "local-sd", "tool-node"]),
    canvasGroupMembers: id => nodes.filter(node => node.canvasGroupId === id),
    findNode: id => nodes.find(node => node.id === id),
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nthis.plan = canvasGroupExecutionPlan;`, context);
  return context.plan("g");
}

test("group execution follows dependencies and uses position only for independent nodes", () => {
  const nodes = [
    { id: "right", type: "ai-image", canvasGroupId: "g", x: 300, y: 0 },
    { id: "left", type: "chat", canvasGroupId: "g", x: 0, y: 0 },
    { id: "last", type: "tool-node", canvasGroupId: "g", x: 20, y: 200 },
    { id: "input", type: "text", canvasGroupId: "g", x: -100, y: 0 },
  ];
  const edges = [
    { from: { node: "left" }, to: { node: "last" } },
    { from: { node: "right" }, to: { node: "last" } },
  ];
  assert.deepEqual(Array.from(planner(nodes, edges).ordered, node => node.id), ["left", "right", "last"]);
});

test("group execution rejects cycles", () => {
  const nodes = [
    { id: "a", type: "ai-image", canvasGroupId: "g", x: 0, y: 0 },
    { id: "b", type: "chat", canvasGroupId: "g", x: 100, y: 0 },
  ];
  const edges = [
    { from: { node: "a" }, to: { node: "b" } },
    { from: { node: "b" }, to: { node: "a" } },
  ];
  assert.throws(() => planner(nodes, edges), /循环连线/);
});

test("group stop cancels unsent tasks and AI image execution clears old output", () => {
  assert.match(source, /node\.generatedImage = null; delete node\.generatedAssetId; node\.outputPath = "";[\s\S]*enqueueAiNode\(node\.id, "node-preview"\)/);
  assert.match(source, /task\.groupRunId === run\.id && task\.status === "waiting"[\s\S]*task\.status = "cancelled"/);
  assert.match(source, /task\.groupRunId[\s\S]*\.stopped[\s\S]*task\.status = "cancelled"/);
});

test("group frame exposes run and stop controls", () => {
  assert.match(source, /data-group-action="\$\{groupRun \? "stop" : "run"\}"/);
  assert.match(source, /runCanvasGroup\(groupFrame\.dataset\.groupId\)/);
  assert.match(source, /stopCanvasGroup\(groupFrame\.dataset\.groupId\)/);
});
