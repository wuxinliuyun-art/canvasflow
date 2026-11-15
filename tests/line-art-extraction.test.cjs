const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = source.indexOf("let builtinLineArtSessionPromise");
const end = source.indexOf("async function prepareLightboxLineArtSource", start);
// 切片含多个顶层声明，不能用 (${slice}) 括号包裹，直接 runInNewContext
const context = {};
vm.runInNewContext(`${source.slice(start, end)}\nthis.tensorFrom = lineArtTensorFromImageData;\nthis.pixelsFrom = lineArtPixelsFromOutput;`, context);

function imageData(width, height, pixelAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4;
    const [r, g, b, a] = pixelAt(x, y);
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = a;
  }
  return { data };
}

test("tensor builder normalizes RGB to 0-1 in NCHW layout and ignores alpha", () => {
  const width = 2, height = 2;
  const image = imageData(width, height, (x, y) => {
    if (x === 0 && y === 0) return [0, 128, 255, 7];
    if (x === 1 && y === 1) return [255, 0, 0, 255];
    return [255, 255, 255, 255];
  });
  const tensor = context.tensorFrom(image, width, height);
  assert.equal(tensor.length, 3 * width * height);
  // (0,0) 像素 [0,128,255,7]:R 平面 = 0,G 平面 = 128/255,B 平面 = 1,alpha 7 不参与
  assert.equal(tensor[0], 0);
  assert.ok(Math.abs(tensor[4] - 128 / 255) < 1e-6);
  assert.ok(Math.abs(tensor[8] - 1) < 1e-6);
  // (1,1) 像素 [255,0,0]:R 平面 index 3 = 1,G/B 平面 = 0
  assert.equal(tensor[3], 1);
  assert.equal(tensor[7], 0);
  assert.equal(tensor[11], 0);
});

test("output pixels map to white-background dark lines with both ends clamped", () => {
  const output = Float32Array.from([-0.2, 0.25, 1.4]);
  const pixels = new Uint8ClampedArray(output.length * 4);
  context.pixelsFrom(output, pixels);
  assert.deepEqual([...pixels.slice(0, 4)], [0, 0, 0, 255]);
  assert.deepEqual([...pixels.slice(4, 8)], [64, 64, 64, 255]);
  assert.deepEqual([...pixels.slice(8, 12)], [255, 255, 255, 255]);
});

test("dialog uses the local informative-drawings ONNX with session singleton and 512 fallback", () => {
  const dialogSource = source.slice(source.indexOf('document.getElementById("lightboxLineArtBtn")'), source.indexOf("function buildLightboxFillLayer"));
  assert.match(source, /assets\/models\/informative-drawings-lineart\.onnx/);
  assert.match(source, /builtinLineArtSessionPromise/);
  assert.match(source, /runLineArtInference\(source, width, height, 1024\)/);
  assert.match(source, /runLineArtInference\(source, width, height, 512\)/);
  // 旧像素算法已整体移除
  assert.ok(!source.includes("blurLightboxLuma"));
  assert.ok(!source.includes("extractLightboxLinePixels"));
  // 对话框不再有滑杆，也不再走 Real-ESRGAN 预放大（该助手保留给矢量化）
  assert.ok(!dialogSource.includes("prepareLightboxLineArtSource"));
  assert.ok(!dialogSource.includes("线条强度"));
  assert.ok(!dialogSource.includes("去杂纹"));
  // 陈旧请求守卫与应用回原尺寸语义保留（line-art-upscale 基线依赖）
  assert.match(dialogSource, /sequence !== requestSequence \|\| !sessionValid\(\)/);
  assert.match(dialogSource, /drawImage\(currentLines, 0, 0, width, height\)/);
});

test("inference input keeps the demo behavior: no white backdrop under transparency", () => {
  // 2026-11-15 实测:透明 PNG 铺白底会把半透明抠图噪点(平均 alpha≈24)稀释成近白灰雾,
  // 模型对灰雾强烈响应产生条纹涂抹;demo 丢弃 alpha(透明区 RGB=0)则干净。白底禁入。
  const start = source.indexOf("async function runLineArtInference");
  const end = source.indexOf("async function makeLightboxLineArt", start);
  const inference = source.slice(start, end);
  assert.ok(!inference.includes('fillStyle = "#fff"'), "runLineArtInference must not paint a white backdrop");
  assert.ok(!inference.includes("fillRect"), "runLineArtInference must not fill a backdrop");
});

test("inference restores pixels with the model output dimensions instead of the input row width", () => {
  const start = source.indexOf("async function runLineArtInference");
  const end = source.indexOf("async function makeLightboxLineArt", start);
  const inference = source.slice(start, end);
  assert.match(inference, /outputTensor\.dims\?\.\[3\]/);
  assert.match(inference, /outputTensor\.dims\?\.\[2\]/);
  assert.match(inference, /createImageData\(outputWidth, outputHeight\)/);
  assert.match(inference, /result\.width = outputWidth/);
  assert.match(inference, /result\.height = outputHeight/);
  assert.match(inference, /new ort\.Tensor\("float32", tensor, \[1, 3, inputHeight, inputWidth\]\)/);
  assert.ok(!inference.includes('[1, 3, inputWidth, inputHeight]'));
  assert.ok(!inference.includes("createImageData(inputWidth, inputHeight)"));
});

test("wasmPaths keeps the absolute-URL form shared with matting", () => {
  assert.match(source, /ort\.env\.wasm\.wasmPaths = new URL\("\.\/assets\/vendor\/onnxruntime\/", location\.href\)\.href/);
});

test("informative-drawings model runs real inference via ort-web in Node", async t => {
  let ort;
  try {
    ort = require("onnxruntime-web");
  } catch {
    t.skip("onnxruntime-web 不可用，跳过真实模型推理验证");
    return;
  }
  const session = await ort.InferenceSession.create(path.join(__dirname, "..", "assets", "models", "informative-drawings-lineart.onnx"), { executionProviders: ["wasm"] });
  const size = 96;
  const tensorData = new Float32Array(3 * size * size).fill(0.5);
  // 中间画一条竖直暗线，给模型一个可响应的结构
  for (let y = 0; y < size; y++) for (let c = 0; c < 3; c++) tensorData[c * size * size + y * size + 48] = 0.1;
  const feeds = {};
  feeds[session.inputNames[0]] = new ort.Tensor("float32", tensorData, [1, 3, size, size]);
  const output = (await session.run(feeds))[session.outputNames[0]];
  assert.deepEqual(output.dims, [1, 1, size, size]);
  let min = Infinity, max = -Infinity, sum = 0;
  for (const value of output.data) {
    min = Math.min(min, value); max = Math.max(max, value); sum += value;
  }
  assert.ok(min >= 0 && max <= 1.0001, `输出应落在 0-1，实际 [${min.toFixed(3)}, ${max.toFixed(3)}]`);
  const mean = sum / output.data.length;
  assert.ok(mean > 0.5, `均匀底色应以白为主（均值 ${mean.toFixed(3)} 应大于 0.5）`);

  // 用用户异常图同类的非 8 倍数尺寸锁定根因：输出形状会缩小，不能用输入行宽还原。
  const oddWidth = 101, oddHeight = 97;
  const oddFeeds = {};
  oddFeeds[session.inputNames[0]] = new ort.Tensor("float32", new Float32Array(3 * oddWidth * oddHeight).fill(0.5), [1, 3, oddHeight, oddWidth]);
  const oddOutput = (await session.run(oddFeeds))[session.outputNames[0]];
  assert.deepEqual(oddOutput.dims, [1, 1, 100, 104]);
  assert.equal(oddOutput.data.length, oddOutput.dims[2] * oddOutput.dims[3]);
});
