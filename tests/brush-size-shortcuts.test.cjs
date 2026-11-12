const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("all canvas brush editors support bracket size shortcuts", () => {
  const app = read("app.js");
  const manual = read("modules/manual-matting.js");
  const localSd = read("modules/local-sd.js");

  assert.match(app, /function adjustRangeByBracketKey[\s\S]*BracketLeft[\s\S]*BracketRight/);
  assert.match(app, /lightboxPainting[\s\S]*adjustRangeByBracketKey\(ev, els\.lightboxPaintSize\)/);
  assert.match(app, /dialog\.addEventListener\("keydown", event => adjustRangeByBracketKey\(event, dialog\.querySelector\("\[data-mask-size\]"\)\)\)/);
  assert.match(manual, /BracketLeft[\s\S]*BracketRight[\s\S]*querySelector\("\.mm-size"\)/);
  assert.match(localSd, /addEventListener\("keydown"[\s\S]*BracketLeft[\s\S]*BracketRight[\s\S]*querySelector\("\.mm-size"\)/);
});
