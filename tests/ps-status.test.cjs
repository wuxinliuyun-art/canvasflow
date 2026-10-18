const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startCanvasFlowServer } = require("../server");

test("UXP probes leave queued images intact and return-image remains compatible", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "canvasflow-uxp-test-"));
  const previousAppData = process.env.APPDATA;
  process.env.APPDATA = temporaryRoot; // Never overwrite the running desktop's discovery file.
  let instance;
  try {
    instance = await startCanvasFlowServer({ dataRoot: temporaryRoot, port: "0" });
    const payload = { name: "uxp-test.png", data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNUcAAAAASUVORK5CYII=" };
    const response = await fetch(instance.url + "api/ps/return-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    for (let i = 0; i < 3; i++) {
      const status = await fetch(instance.url + "api/ps/status");
      assert.equal(status.headers.get("cache-control"), "no-store");
      assert.equal((await status.json()).app, "CanvasFlow");
    }
    const pending = await (await fetch(instance.url + "api/ps/pending")).json();
    assert.equal(pending.data.length, 1);
    assert.equal(pending.data[0].name, payload.name);
    assert.equal(pending.data[0].data, payload.data);
    assert.equal((await (await fetch(instance.url + "api/ps/pending")).json()).data.length, 0);
  } finally {
    if (instance) await instance.close();
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
    // Only remove the unique directory made by this test, inside the OS temp root.
    const parent = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(path.resolve(temporaryRoot).startsWith(parent));
    assert.ok(path.basename(temporaryRoot).startsWith("canvasflow-uxp-test-"));
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
