const test = require("node:test");
const assert = require("node:assert/strict");
const { detectWorkflowMapping, detectWorkflowType, normalizeServerUrl, fitWorkflowModels, videoFrameLength, sdImageSize } = require("../modules/comfyui-server");
const { TEMPLATES } = require("../modules/sd-workflow-templates");

function baseWorkflow() {
  return {
    "1": { class_type: "CLIPTextEncode", inputs: { text: "prompt" }, _meta: { title: "Positive Prompt" } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "bad" }, _meta: { title: "Negative Prompt" } },
    "3": { class_type: "KSampler", inputs: { seed: 1, denoise: 0.7 } },
    "9": { class_type: "SaveImage", inputs: { images: ["3", 0] } },
  };
}

test("txt2img detects prompt, negative, sampler and output", () => {
  const mapping = detectWorkflowMapping("txt2img", baseWorkflow());
  assert.equal(mapping.positiveNodeId, "1");
  assert.equal(mapping.negativeNodeId, "2");
  assert.equal(mapping.samplerNodeId, "3");
  assert.deepEqual(mapping.outputNodeIds, ["9"]);
});

test("image modes require LoadImage", () => {
  assert.throws(() => detectWorkflowMapping("img2img", baseWorkflow()), /LoadImage/);
  const workflow = baseWorkflow();
  workflow["4"] = { class_type: "LoadImage", inputs: { image: "input.png" }, _meta: { title: "Source Image" } };
  assert.equal(detectWorkflowMapping("img2img", workflow).imageNodeId, "4");
});

test("inpaint requires an explicitly titled mask LoadImage", () => {
  const workflow = baseWorkflow();
  workflow["4"] = { class_type: "LoadImage", inputs: { image: "input.png" }, _meta: { title: "Source Image" } };
  assert.throws(() => detectWorkflowMapping("inpaint", workflow), /mask/);
  workflow["5"] = { class_type: "LoadImage", inputs: { image: "mask.png" }, _meta: { title: "Inpaint Mask" } };
  const mapping = detectWorkflowMapping("inpaint", workflow);
  assert.equal(mapping.imageNodeId, "4");
  assert.equal(mapping.maskNodeId, "5");
});

test("upscale requires a known upscale class", () => {
  const workflow = baseWorkflow();
  workflow["4"] = { class_type: "LoadImage", inputs: { image: "input.png" } };
  assert.throws(() => detectWorkflowMapping("upscale", workflow), /Upscale/);
  workflow["6"] = { class_type: "ImageUpscaleWithModel", inputs: { image: ["4", 0] } };
  assert.equal(detectWorkflowMapping("upscale", workflow).imageNodeId, "4");
});

test("server URL rejects credentials and non-http schemes", () => {
  assert.equal(normalizeServerUrl("http://127.0.0.1:8188/"), "http://127.0.0.1:8188");
  assert.throws(() => normalizeServerUrl("file:///tmp/comfy"), /HTTP/);
  assert.throws(() => normalizeServerUrl("http://user:pass@127.0.0.1:8188"), /HTTP/);
});

test("built-in templates cover all five workflow types and pass mapping detection", () => {
  const byType = new Set();
  for (const template of TEMPLATES) {
    const workflow = JSON.parse(JSON.stringify(template.workflow));
    const mapping = detectWorkflowMapping(template.type, workflow);
    byType.add(template.type);
    assert.ok(mapping.outputNodeIds.length, `${template.id} 应有输出节点映射`);
    if (template.type === "txt2img") assert.ok(mapping.positiveNodeId && mapping.negativeNodeId && mapping.samplerNodeId && mapping.seedField === "seed", `${template.id} 应映射正负提示词与采样器`);
    if (template.type === "inpaint") assert.ok(mapping.imageNodeId && mapping.maskNodeId, `${template.id} 应同时映射原图与蒙版`);
    if (["img2img", "matting", "upscale", "video-i2v"].includes(template.type)) assert.ok(mapping.imageNodeId, `${template.id} 应映射原图`);
    if (template.type === "video-i2v") assert.ok(mapping.promptNodeId && mapping.promptField === "prompt" && mapping.durationField === "length" && mapping.samplerNodeId && mapping.seedField === "seed", `${template.id} 应映射 H3 提示词/时长/采样器`);
    if (template.type === "video-t2v") assert.ok(!mapping.imageNodeId && mapping.promptNodeId && mapping.durationNodeId, `${template.id} 不应映射原图且应映射 H3 提示词/时长`);
    if (["txt2img", "video-i2v", "video-t2v"].includes(template.type)) {
      assert.ok(Array.isArray(mapping.params) && mapping.params.length === 2, `${template.id} 应映射尺寸传导接口`);
      assert.ok(mapping.params.every(entry => entry.nodeId && (entry.param === "width" || entry.param === "height")), `${template.id} 尺寸传导应指向宽高字段`);
    } else {
      assert.ok(!mapping.params, `${template.id} 不应有尺寸传导`);
    }
    if (template.id === "builtin-sdmatte-matting") assert.equal(template.workflow["4"].inputs.images[1], 1, "抠图应取 SDMatteApply 的 matted_image 输出口");
    if (template.id === "builtin-rmbg-matting" || template.id === "builtin-birefnet-matting") assert.equal(template.workflow["3"].inputs.images[1], 0, "RMBG/BiRefNet 应取透明 IMAGE 输出口");
  }
  for (const type of ["txt2img", "img2img", "upscale", "matting", "inpaint", "video-i2v", "video-t2v"]) assert.ok(byType.has(type), `缺少 ${type} 类型的内置模板`);
  const mattingCount = TEMPLATES.filter(template => template.type === "matting").length;
  assert.ok(mattingCount >= 3, `抠图至少要覆盖 RMBG/BiRefNet/SDMatte 三个模型，当前 ${mattingCount} 个`);
});

test("videoFrameLength snaps seconds onto the 17k+5 grid at 24fps", () => {
  assert.equal(videoFrameLength(5), 124);
  assert.equal(videoFrameLength(2), 39);
  assert.equal(videoFrameLength(3), 73);
  assert.equal(videoFrameLength(10), 243);
  assert.equal(videoFrameLength(15), 362);
  assert.equal(videoFrameLength(0), 39);   // 下限 2 秒
  assert.equal(videoFrameLength(99), 362); // 上限 15 秒
  assert.equal(videoFrameLength(), 124);   // 默认 5 秒
});

test("sdImageSize maps resolution( long edge ) and ratio onto 32-aligned pixels", () => {  assert.deepEqual(sdImageSize("1K", "1:1"), { width: 1024, height: 1024 });
  assert.deepEqual(sdImageSize("1K", "16:9"), { width: 1024, height: 576 });
  assert.deepEqual(sdImageSize("1K", "4:3"), { width: 1024, height: 768 });
  assert.deepEqual(sdImageSize("1K", "9:16"), { width: 576, height: 1024 });
  assert.deepEqual(sdImageSize("2K", "4:3"), { width: 2048, height: 1536 });
  assert.deepEqual(sdImageSize("0.5K", "3:2"), { width: 512, height: 352 });
  assert.deepEqual(sdImageSize(undefined, undefined), { width: 1024, height: 1024 }); // 默认 1K/1:1
  assert.deepEqual(sdImageSize("8K", "乱码"), { width: 1024, height: 1024 }); // 未知档位回退
});

test("detectWorkflowType auto-recognizes every built-in template's declared type", () => {
  for (const template of TEMPLATES) {
    const detected = detectWorkflowType(JSON.parse(JSON.stringify(template.workflow)));
    assert.equal(detected, template.type, `${template.id} 应自动识别为 ${template.type}`);
  }
});

test("detectWorkflowType handles edge cases", () => {
  const txt2img = { "1": { class_type: "CLIPTextEncode", inputs: { text: "" } }, "2": { class_type: "KSampler", inputs: { seed: 0 } }, "3": { class_type: "SaveImage", inputs: { images: ["2", 0] } } };
  assert.equal(detectWorkflowType(txt2img), "txt2img");
  const i2vWithLastFrame = { "1": { class_type: "LoadImage", inputs: { image: "a.png" } }, "2": { class_type: "SaveVideo", inputs: { video: ["3", 0] } } };
  assert.equal(detectWorkflowType(i2vWithLastFrame), "video-i2v");
});

test("fitWorkflowModels rewrites stale model names by prefer patterns", () => {
  const template = TEMPLATES.find(item => item.id === "builtin-klein-txt2img");
  const workflow = JSON.parse(JSON.stringify(template.workflow));
  const objectInfo = { UNETLoader: { input: { required: { unet_name: [["Flux2-Klein-9B-True-V3-fp8mixed.safetensors", "krea2_turbo_fp8.safetensors"]] } } } };
  fitWorkflowModels(workflow, template.hints, objectInfo);
  assert.equal(workflow["1"].inputs.unet_name, "Flux2-Klein-9B-True-V3-fp8mixed.safetensors");
});

test("fitWorkflowModels keeps values already present on this machine", () => {
  const template = TEMPLATES.find(item => item.id === "builtin-sdmatte-matting");
  const workflow = JSON.parse(JSON.stringify(template.workflow));
  const objectInfo = { SDMatteApply: { input: { required: { ckpt_name: [["SDMatte_plus.safetensors", "SDMatte.safetensors"]] } } } };
  fitWorkflowModels(workflow, template.hints, objectInfo);
  assert.equal(workflow["3"].inputs.ckpt_name, "SDMatte_plus.safetensors");
});

test("fitWorkflowModels reports missing models instead of failing silently", () => {
  const template = TEMPLATES.find(item => item.id === "builtin-omnisr-upscale");
  const workflow = JSON.parse(JSON.stringify(template.workflow));
  const objectInfo = { UpscaleModelLoader: { input: { required: { model_name: [["RealESRGAN_x4plus.pth"]] } } } };
  assert.throws(() => fitWorkflowModels(workflow, template.hints, objectInfo), /缺少工作流需要的模型/);
});
