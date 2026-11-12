const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

test("keyword reverse uses the confirmed model for each built-in site", () => {
  assert.match(source, /apiType === "apimart" \? "gpt-6-luna" : "gemini-3-flash"/);
  assert.match(source, /data-role="reverse-image-keywords"/);
  assert.match(source, /type: "image_url", image_url: \{ url: image \}/);
  assert.match(source, /from: \{ node: textNode\.id, port: "out" \}, to: \{ node: node\.id, port: "in" \}/);
});

test("fill mode detection defaults line art to sketch and colorful images to material", () => {
  const start = source.indexOf("function detectLightboxDefaultFillMode");
  const end = source.indexOf("\nfunction cancelLightboxPaint", start);
  assert.ok(start >= 0 && end > start);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source.slice(start, end)}\nthis.detect = detectLightboxDefaultFillMode;`, context);

  const pixels = values => ({ data: Uint8ClampedArray.from(values.flatMap(([r, g, b, a = 255]) => [r, g, b, a])) });
  const lineArt = pixels([...Array(80).fill([255, 255, 255]), ...Array(20).fill([24, 24, 24])]);
  const colorful = pixels([...Array(40).fill([180, 45, 30]), ...Array(30).fill([35, 130, 210]), ...Array(30).fill([220, 180, 50])]);
  const grayscalePhoto = pixels([...Array(20).fill([235, 235, 235]), ...Array(40).fill([140, 140, 140]), ...Array(40).fill([45, 45, 45])]);

  assert.equal(context.detect(lineArt), "sketch");
  assert.equal(context.detect(colorful), "material");
  assert.equal(context.detect(grayscalePhoto), "material");
});
