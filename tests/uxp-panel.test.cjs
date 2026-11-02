const { test } = require("node:test");
const assert = require("node:assert/strict");
const { localBase, parseBridge, createTransport } = require("../uxp-panel/CanvasFlowPanel/transport");
const { base64, createExporter, selectionProblem } = require("../uxp-panel/CanvasFlowPanel/photoshop");

test("UXP network permissions cover every discovery port and stay on loopback", () => {
  const { domains } = require("../uxp-panel/CanvasFlowPanel/manifest.json").requiredPermissions.network;
  for (const domain of domains) assert.ok(["localhost", "127.0.0.1"].includes(new URL(domain).hostname));
  for (let port = 5173; port <= 5192; port++) {
    assert.ok(domains.includes(`http://localhost:${port}`));
  }
});

function panelFixture(exporter = async () => ({ name: "ps_test.png", data: "data:image/png;base64,AAAA" })) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const listeners = {};
      elements.set(id, {
        textContent: "", value: "", className: "", disabled: false, listeners,
        addEventListener(type, handler) { listeners[type] = handler; },
      });
    }
    return elements.get(id);
  };
  const calls = { connections: 0, sends: 0 };
  let panels;
  require("node:vm").runInNewContext(
    require("node:fs").readFileSync(require.resolve("../uxp-panel/CanvasFlowPanel/main.js"), "utf8"),
    {
      window: {},
      document: { getElementById: element },
      localStorage: { getItem: () => null, setItem() {} },
      require: name => ({
        photoshop: { app: { activeDocument: { name: "test.psd", width: 100, height: 80 } } },
        uxp: { storage: {}, entrypoints: { setup: value => { panels = value.panels; } } },
        "./transport.js": { createTransport: () => ({
          connect: async () => { calls.connections++; return { base: "http://127.0.0.1:5173", token: "a".repeat(32) }; },
          send: async () => { calls.sends++; },
        }) },
        "./photoshop.js": { createExporter: () => exporter },
        "./manifest.json": { version: "1.0.0" },
      })[name],
    },
  );
  panels.canvasflowTransfer.show();
  return { element, calls, panels };
}

test("panel initializes and reconnects in UXP without browser matchMedia", async () => {
  const { element, calls, panels } = panelFixture();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(element("docInfo").textContent, "test.psd · 100 × 80");
  assert.equal(element("connection").textContent, "已连接：http://127.0.0.1:5173");
  panels.canvasflowTransfer.show();
  assert.equal(calls.connections, 1);
});

test("a failed export reports a readable reason and never posts an image", async () => {
  const cases = [
    [new Error("请只选中一个图层后再回传（当前选中 2 个）"), /当前选中 2 个/],
    // executeAsModal can drop the callback message; the panel must not print "undefined".
    [{ number: 8007, message: undefined }, /未知错误/],
    [{}, /未知错误/],
    [new Error("   "), /未知错误/],
  ];
  for (const [thrown, expected] of cases) {
    const { element, calls } = panelFixture(async () => { throw thrown; });
    await new Promise(resolve => setImmediate(resolve));
    await element("sendMerged").listeners.click();
    const log = element("log").textContent;
    assert.doesNotMatch(log, /undefined/, "panel printed undefined: " + log);
    assert.match(log, /^回传失败：/);
    assert.match(log, expected);
    assert.equal(element("log").className, "error");
    assert.equal(element("sendMerged").disabled, false, "busy state must be released");
    assert.equal(calls.sends, 0, "a failed export must not reach the canvas");
  }
});

function transportFixture(values = {}, request = async () => ({ app: "CanvasFlow" })) {
  const state = { source: "desktop", port: 12345, token: "a".repeat(32) };
  const store = { get: key => values[key] || "", set: (key, value) => { values[key] = value; } };
  const file = { name: "bridge.json", read: async () => JSON.stringify(state) };
  const fs = {
    getEntryForPersistentToken: async () => file,
    getFileForOpening: async () => file,
    createPersistentToken: async () => "selected-file",
  };
  return { state, values, fs, transport: createTransport({ fs, store, request }) };
}

test("addresses and discovery metadata cannot send bridge credentials to remote hosts", () => {
  assert.equal(localBase(" http://LOCALHOST:5173/ "), "http://localhost:5173");
  assert.equal(localBase("http://127.0.0.1:5173"), "http://localhost:5173");
  for (const url of ["https://example.com", "http://localhost.evil:5173", "http://localhost:0", "http://127.0.0.1:65536", "http://user@localhost:5173", "http://localhost:5173/path"]) {
    assert.throws(() => localBase(url));
  }
  assert.throws(() => parseBridge('{"port":123,"source":"desktop"}'), /令牌/);
  assert.throws(() => parseBridge('{"port":123.5,"source":"server"}'));
  assert.equal(parseBridge('\uFEFF{"port":5173,"source":"server"}').base, "http://localhost:5173");
});

test("bridge port and token are reread after desktop restarts", async () => {
  const calls = [];
  const fixture = transportFixture({ bridgeFileToken: "selected-file" }, async (url, options) => {
    calls.push({ url, options });
    return { app: "CanvasFlow" };
  });
  const first = await fixture.transport.connect();
  assert.equal(first.token, "a".repeat(32));
  fixture.state.port = 23456;
  fixture.state.token = "b".repeat(32);
  const second = await fixture.transport.connect();
  assert.equal(second.base, "http://localhost:23456");
  assert.equal(second.token, "b".repeat(32));
  assert.ok(calls.every(call => call.url.endsWith("/api/ps/status")));
});

test("revoked file permission does not silently redirect images to another canvas", async () => {
  let requests = 0;
  const fixture = transportFixture({ bridgeFileToken: "expired" }, async () => { requests++; });
  fixture.fs.getEntryForPersistentToken = async () => { throw new Error("revoked"); };
  await assert.rejects(fixture.transport.connect(), /授权失效/);
  assert.equal(requests, 0);
});

test("choosing the bridge persists only its file token and clears a manual server", async () => {
  const fixture = transportFixture({ serverUrl: "http://127.0.0.1:5173" });
  assert.equal(await fixture.transport.chooseBridge(), true);
  assert.deepEqual(fixture.values, { bridgeFileToken: "selected-file", serverUrl: "" });
  fixture.fs.getFileForOpening = async () => null;
  assert.equal(await fixture.transport.chooseBridge(), false);
});

test("old authenticated hosts use a read-only fallback, never drain pending images", async () => {
  const calls = [];
  const fixture = transportFixture({ bridgeFileToken: "ok" }, async (url, options) => {
    calls.push(url);
    assert.equal(options.token, "a".repeat(32));
    if (url.endsWith("/api/ps/status")) throw Object.assign(new Error("old host"), { status: 404 });
    return { sourceExists: true };
  });
  await fixture.transport.connect();
  assert.ok(calls[1].endsWith("/api/cep/status"));
  assert.ok(calls.every(url => !url.includes("/pending")));
});

test("automatic server discovery includes port 5192 and rejects unrelated services", async () => {
  const calls = [];
  const fixture = transportFixture({}, async url => {
    calls.push(url);
    return url.startsWith("http://localhost:5192/") ? { app: "CanvasFlow" } : { data: [] };
  });
  assert.equal((await fixture.transport.connect()).base, "http://localhost:5192");
  assert.equal(calls.length, 20);
  assert.ok(calls.every(url => url.endsWith("/api/ps/status")));
});

test("return-image submits once and does not retry after an ambiguous timeout", async () => {
  let sends = 0;
  const fixture = transportFixture({}, async (url, options) => {
    sends++;
    assert.equal(options.token, "secret");
    assert.equal(options.body.name, "test.png");
    throw new Error("timeout");
  });
  await assert.rejects(fixture.transport.send({ base: "http://localhost:12345", token: "secret" }, { name: "test.png", data: "data:image/png;base64,AAAA" }), /timeout/);
  assert.equal(sends, 1);
});

test("base64 preserves binary PNG data and padding across chunk boundaries", () => {
  for (const length of [0, 1, 2, 3, 255, 32767, 65537]) {
    const bytes = Uint8Array.from({ length }, (_, index) => index % 256);
    assert.equal(base64(bytes.buffer), Buffer.from(bytes).toString("base64"));
  }
});

function exportFixture({ saveError = false, layerError = false, cancelled = false } = {}) {
  const events = [];
  const file = { read: async () => new Uint8Array([137, 80, 78, 71]).buffer, delete: async () => events.push("delete-file") };
  const copy = {
    id: 2, mode: "cmyk", bitsPerChannel: 16,
    flatten: async () => events.push("flatten-copy"),
    changeMode: async mode => events.push("convert-copy:" + mode),
    saveAs: { png: async () => { events.push("save-copy"); if (saveError) throw new Error("disk full"); } },
    closeWithoutSaving: async () => events.push("close-copy"),
  };
  const layer = { kind: "pixel", duplicate: async target => {
    assert.equal(target, copy);
    events.push("duplicate-layer");
    if (layerError) throw new Error("duplicate failed");
    return { set visible(value) { events.push("copy-visible:" + value); } };
  } };
  const source = { id: 1, name: "原图.psd", width: 800, height: 600, resolution: 72, activeLayers: [layer],
    duplicate: async () => { events.push("duplicate-doc"); return copy; } };
  const app = { activeDocument: source, documents: { add: async options => {
    assert.equal(options.fill, "transparent");
    assert.equal(options.width, source.width);
    events.push("create-transparent-copy");
    return copy;
  } } };
  const ps = {
    app,
    constants: { LayerKind: { GROUP: "group" }, NewDocumentMode: { RGB: "rgb" }, DocumentMode: { RGB: "rgb" }, ChangeMode: { RGB: "rgb" }, DocumentFill: { TRANSPARENT: "transparent" }, BitsPerChannelType: { EIGHT: 8 } },
    core: { executeAsModal: async callback => {
      events.push("modal");
      if (cancelled) throw new Error("cancelled");
      await callback({ hostControl: { registerAutoCloseDocument: id => {
        assert.equal(id, copy.id); events.push("auto-close");
      } } });
    } },
  };
  const storage = { formats: { binary: "binary" }, localFileSystem: { getTemporaryFolder: async () => ({ createFile: async () => {
    events.push("create-file");
    return file;
  } }) } };
  return { events, app, source, copy, exporter: createExporter(ps, storage) };
}

test("merged export modifies only the duplicate, closes it and deletes the temporary PNG", async () => {
  const fixture = exportFixture();
  const payload = await fixture.exporter("merged");
  assert.match(payload.name, /^ps_原图_\d+\.png$/);
  assert.equal(payload.data, "data:image/png;base64,iVBORw==");
  assert.equal(fixture.app.activeDocument, fixture.source);
  assert.ok(fixture.events.includes("flatten-copy"));
  assert.ok(fixture.events.includes("convert-copy:rgb"));
  assert.deepEqual(fixture.events.slice(-2), ["close-copy", "delete-file"]);
});

test("single-layer export uses a transparent same-size document and never flattens", async () => {
  const fixture = exportFixture();
  await fixture.exporter("layer");
  assert.ok(fixture.events.includes("create-transparent-copy"));
  assert.ok(fixture.events.includes("copy-visible:true"));
  assert.ok(!fixture.events.includes("flatten-copy"));
  assert.ok(!fixture.events.includes("duplicate-doc"));
});

test("save and layer-copy failures close the disposable document, not the original", async () => {
  for (const options of [{ saveError: true }, { layerError: true }]) {
    const fixture = exportFixture(options);
    await assert.rejects(fixture.exporter(options.layerError ? "layer" : "merged"));
    assert.deepEqual(fixture.events.slice(-2), ["close-copy", "delete-file"]);
    assert.equal(fixture.app.activeDocument, fixture.source);
  }
});

test("no document, multi-selection and group selection fail before any export work", async () => {
  const expected = { none: /没有打开的文档/, multiple: /只选中一个图层/, group: /不能是图层组/ };
  for (const scenario of ["none", "multiple", "group"]) {
    const fixture = exportFixture();
    if (scenario === "none") fixture.app.activeDocument = null;
    if (scenario === "multiple") fixture.source.activeLayers.push({ kind: "pixel" });
    if (scenario === "group") fixture.source.activeLayers[0].kind = "group";
    // The message must survive to the caller: it is raised before the modal.
    await assert.rejects(fixture.exporter("layer"), expected[scenario]);
    // Nothing is created, opened or flattened, so no temporary file has to be cleaned up.
    assert.deepEqual(fixture.events, []);
  }
});

test("hosts that refuse layer descriptors outside a modal still export normally", async () => {
  const fixture = exportFixture();
  const real = fixture.source.activeLayers;
  let reads = 0;
  Object.defineProperty(fixture.source, "activeLayers", {
    configurable: true,
    get() {
      if (++reads === 1) throw new Error("modal required");
      return real;
    },
  });
  // The pre-check degrades to the in-modal guard instead of failing the whole export.
  await fixture.exporter("layer");
  assert.ok(fixture.events.includes("create-transparent-copy"));
  assert.ok(reads > 1);
});

test("modal cancellation after the pre-check still cleans the temporary file", async () => {
  const fixture = exportFixture({ cancelled: true });
  await assert.rejects(fixture.exporter("layer"), /cancelled/);
  assert.deepEqual(fixture.events, ["create-file", "modal", "delete-file"]);
  assert.ok(!fixture.events.includes("close-copy"));
});

test("multi-selection messages name the real problem instead of undefined", () => {
  const LayerKind = { GROUP: "group" };
  assert.equal(selectionProblem("merged", null, LayerKind), null);
  assert.match(selectionProblem("layer", { activeLayers: [] }, LayerKind), /先在 PS 中选中一个图层/);
  assert.match(selectionProblem("layer", null, LayerKind), /先在 PS 中选中一个图层/);
  assert.match(selectionProblem("layer", { activeLayers: [{ kind: "pixel" }, { kind: "pixel" }] }, LayerKind), /当前选中 2 个/);
  assert.match(selectionProblem("layer", { activeLayers: [{ kind: "group" }] }, LayerKind), /不能是图层组/);
  assert.equal(selectionProblem("layer", { activeLayers: [{ kind: "pixel" }] }, LayerKind), null);
});
