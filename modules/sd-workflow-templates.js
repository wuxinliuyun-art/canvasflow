// 本地 SD 节点的内置工作流模板（唯一真源）。
// 全部为 ComfyUI API 格式（对象键为节点 id），节点参数按 ComfyUI v0.30.2 源码逐项核对：
// - Klein 走 UNETLoader + CLIPLoader(type="flux2", qwen3 文本编码器) + flux2-vae。
// - SDMatteApply 的 trimap 必须关闭 mask_refine：开启时源码用 trimap 布尔索引原图尺寸的
//   alpha 张量，trimap 尺寸≠原图尺寸会直接报错；关闭后 trimap 在节点内部缩放到推理尺寸，
//   全灰(0.5) trimap = 全图视为未知区域 = 全自动抠图。
// - 节点标题受 detectWorkflowMapping 约束：负面提示词标题含 负面/negative，局部重绘蒙版
//   LoadImage 标题含 蒙版/mask，原图 LoadImage 标题含 原图/source。
// hints 供服务端在载入时按本机 ComfyUI /object_info 的实际文件列表自动改写模型文件名：
// prefer 是按优先级排列的 token 组合，全部 token 命中（不区分大小写包含）即选用。
(() => {
  const kleinTextEncoders = [
    { nodeId: "2", field: "clip_name", prefer: [["qwen", "8b"], ["qwen", "3"], ["qwen"]] }
  ];
  const kleinUnet = { nodeId: "1", field: "unet_name", prefer: [["klein", "9b", "true"], ["klein", "9b"]] };
  const kleinVae = { nodeId: "7", field: "vae_name", prefer: [["flux2"]] };

  const TEMPLATES = [
    {
      id: "builtin-klein-txt2img",
      name: "内置 · Flux2 Klein 文生图",
      type: "txt2img",
      desc: "Klein 9B fp8，1024×1024，20 步",
      hints: [kleinUnet, ...kleinTextEncoders, kleinVae],
      workflow: {
        "1": { class_type: "UNETLoader", inputs: { unet_name: "Flux2-Klein-9B-True-v2-fp8mixed.safetensors", weight_dtype: "default" }, _meta: { title: "Klein 9B 模型" } },
        "2": { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_8b_fp8mixed.safetensors", type: "flux2" }, _meta: { title: "文本编码器" } },
        "3": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] }, _meta: { title: "Positive 正面提示词" } },
        "4": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] }, _meta: { title: "Negative 负面提示词" } },
        "5": { class_type: "EmptyFlux2LatentImage", inputs: { width: 1024, height: 1024, batch_size: 1 }, _meta: { title: "空白画布" } },
        "6": { class_type: "KSampler", inputs: { model: ["1", 0], seed: 0, steps: 20, cfg: 1, sampler_name: "euler", scheduler: "beta", denoise: 1, positive: ["3", 0], negative: ["4", 0], latent_image: ["5", 0] }, _meta: { title: "采样" } },
        "7": { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" }, _meta: { title: "VAE" } },
        "8": { class_type: "VAEDecode", inputs: { samples: ["6", 0], vae: ["7", 0] }, _meta: { title: "解码" } },
        "9": { class_type: "SaveImage", inputs: { images: ["8", 0], filename_prefix: "CanvasFlow" }, _meta: { title: "输出" } },
      },
    },
    {
      id: "builtin-klein-img2img",
      name: "内置 · Flux2 Klein 图生图",
      type: "img2img",
      desc: "Klein 9B 重绘，降噪由节点控制",
      hints: [kleinUnet, ...kleinTextEncoders, kleinVae],
      workflow: {
        "1": { class_type: "UNETLoader", inputs: { unet_name: "Flux2-Klein-9B-True-v2-fp8mixed.safetensors", weight_dtype: "default" }, _meta: { title: "Klein 9B 模型" } },
        "2": { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_8b_fp8mixed.safetensors", type: "flux2" }, _meta: { title: "文本编码器" } },
        "3": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] }, _meta: { title: "Positive 正面提示词" } },
        "4": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] }, _meta: { title: "Negative 负面提示词" } },
        "5": { class_type: "LoadImage", inputs: { image: "canvasflow_source.png" }, _meta: { title: "Source 原图" } },
        "6": { class_type: "VAEEncode", inputs: { pixels: ["5", 0], vae: ["7", 0] }, _meta: { title: "编码" } },
        "7": { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" }, _meta: { title: "VAE" } },
        "8": { class_type: "KSampler", inputs: { model: ["1", 0], seed: 0, steps: 20, cfg: 1, sampler_name: "euler", scheduler: "beta", denoise: 0.7, positive: ["3", 0], negative: ["4", 0], latent_image: ["6", 0] }, _meta: { title: "采样" } },
        "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["7", 0] }, _meta: { title: "解码" } },
        "10": { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: "CanvasFlow" }, _meta: { title: "输出" } },
      },
    },
    {
      id: "builtin-sdmatte-matting",
      name: "内置 · SDMatte 抠透明",
      type: "matting",
      desc: "SDMatte_plus 精细透明抠图（毛发级 alpha）",
      hints: [{ nodeId: "3", field: "ckpt_name", prefer: [["plus"], ["sdmatte"]] }],
      workflow: {
        "1": { class_type: "LoadImage", inputs: { image: "canvasflow_source.png" }, _meta: { title: "Source 原图" } },
        "2": { class_type: "SolidMask", inputs: { value: 0.5, width: 1024, height: 1024 }, _meta: { title: "全图 trimap" } },
        "3": { class_type: "SDMatteApply", inputs: { ckpt_name: "SDMatte_plus.safetensors", image: ["1", 0], trimap: ["2", 0], inference_size: 1024, is_transparent: false, output_mode: "matted_rgba", mask_refine: false, trimap_constraint: 0.8 }, _meta: { title: "SDMatte 抠图" } },
        "4": { class_type: "SaveImage", inputs: { images: ["3", 1], filename_prefix: "CanvasFlowMatte" }, _meta: { title: "输出" } },
      },
    },
    // RMBG / BiRefNet-general：ComfyUI-RMBG 插件（AILab）的常规主体抠图节点，
    // 返回 (IMAGE, MASK, MASK_IMAGE)，background:"Alpha" 直接出透明 PNG；
    // model 字段是插件内的变体名（不是文件名），权重缺失时节点首次运行自动从 HF 下载。
    {
      id: "builtin-rmbg-matting",
      name: "内置 · RMBG 抠图",
      type: "matting",
      desc: "RMBG-2.0 常规主体抠图，透明背景",
      hints: [{ nodeId: "2", field: "model", prefer: [["rmbg", "2"], ["rmbg"]] }],
      workflow: {
        "1": { class_type: "LoadImage", inputs: { image: "canvasflow_source.png" }, _meta: { title: "Source 原图" } },
        // 可选输入必须带全：AILab 节点用 params["mask_blur"] 直接下标读取，缺了会 KeyError
        "2": { class_type: "RMBG", inputs: { image: ["1", 0], model: "RMBG-2.0", sensitivity: 1, process_res: 1024, mask_blur: 0, mask_offset: 0, invert_output: false, refine_foreground: false, background: "Alpha", background_color: "#222222" }, _meta: { title: "RMBG 抠图" } },
        "3": { class_type: "SaveImage", inputs: { images: ["2", 0], filename_prefix: "CanvasFlowMatte" }, _meta: { title: "输出" } },
      },
    },
    {
      id: "builtin-birefnet-matting",
      name: "内置 · BiRefNet 抠图",
      type: "matting",
      desc: "BiRefNet-general 常规主体抠图，边缘更精细",
      hints: [{ nodeId: "2", field: "model", prefer: [["birefnet", "general"], ["birefnet"]] }],
      workflow: {
        "1": { class_type: "LoadImage", inputs: { image: "canvasflow_source.png" }, _meta: { title: "Source 原图" } },
        "2": { class_type: "BiRefNetRMBG", inputs: { image: ["1", 0], model: "BiRefNet-general", sensitivity: 1, mask_blur: 0, mask_offset: 0, invert_output: false, refine_foreground: false, background: "Alpha", background_color: "#222222" }, _meta: { title: "BiRefNet 抠图" } },
        "3": { class_type: "SaveImage", inputs: { images: ["2", 0], filename_prefix: "CanvasFlowMatte" }, _meta: { title: "输出" } },
      },
    },
    {
      id: "builtin-klein-inpaint",
      name: "内置 · Flux2 Klein 局部重绘",
      type: "inpaint",
      desc: "Klein 9B 蒙版重绘，白=重绘",
      hints: [kleinUnet, ...kleinTextEncoders, kleinVae],
      workflow: {
        "1": { class_type: "UNETLoader", inputs: { unet_name: "Flux2-Klein-9B-True-v2-fp8mixed.safetensors", weight_dtype: "default" }, _meta: { title: "Klein 9B 模型" } },
        "2": { class_type: "CLIPLoader", inputs: { clip_name: "qwen_3_8b_fp8mixed.safetensors", type: "flux2" }, _meta: { title: "文本编码器" } },
        "3": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] }, _meta: { title: "Positive 正面提示词" } },
        "4": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] }, _meta: { title: "Negative 负面提示词" } },
        "5": { class_type: "LoadImage", inputs: { image: "canvasflow_source.png" }, _meta: { title: "Source 原图" } },
        "6": { class_type: "LoadImage", inputs: { image: "canvasflow_mask.png" }, _meta: { title: "Mask 蒙版" } },
        "7": { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" }, _meta: { title: "VAE" } },
        "8": { class_type: "VAEEncode", inputs: { pixels: ["5", 0], vae: ["7", 0] }, _meta: { title: "编码" } },
        "9": { class_type: "ImageToMask", inputs: { image: ["6", 0], channel: "red" }, _meta: { title: "蒙版转MASK" } },
        "10": { class_type: "SetLatentNoiseMask", inputs: { samples: ["8", 0], mask: ["9", 0] }, _meta: { title: "限定重绘区域" } },
        "11": { class_type: "KSampler", inputs: { model: ["1", 0], seed: 0, steps: 20, cfg: 1, sampler_name: "euler", scheduler: "beta", denoise: 1, positive: ["3", 0], negative: ["4", 0], latent_image: ["10", 0] }, _meta: { title: "采样" } },
        "12": { class_type: "VAEDecode", inputs: { samples: ["11", 0], vae: ["7", 0] }, _meta: { title: "解码" } },
        "13": { class_type: "SaveImage", inputs: { images: ["12", 0], filename_prefix: "CanvasFlow" }, _meta: { title: "输出" } },
      },
    },
    {
      id: "builtin-omnisr-upscale",
      name: "内置 · OmniSR 2倍放大",
      type: "upscale",
      desc: "本机 OmniSR_X2 超分模型",
      hints: [{ nodeId: "2", field: "model_name", prefer: [["omnisr"]] }],
      workflow: {
        "1": { class_type: "LoadImage", inputs: { image: "canvasflow_source.png" }, _meta: { title: "Source 原图" } },
        "2": { class_type: "UpscaleModelLoader", inputs: { model_name: "OmniSR_X2_DIV2K.safetensors" }, _meta: { title: "放大模型" } },
        "3": { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["2", 0], image: ["1", 0] }, _meta: { title: "执行放大" } },
        "4": { class_type: "SaveImage", inputs: { images: ["3", 0], filename_prefix: "CanvasFlowUpscale" }, _meta: { title: "输出" } },
      },
    },
    // MiniMax H3 动画（ComfyUI v0.30.2 核心节点）：prompt 直接进 MiniMaxH3ImageToVideo（qwen3vl TE，
    // 不走 CLIPTextEncode），length 为 17k+5 帧网格（124≈5s，24fps）；采样链用经典 KSampler 等价
    // 替代官方的 RandomNoise/BasicGuider/SamplerCustomAdvanced（cfg=1 时 negative 不评估），这样
    // detectWorkflowMapping 能拿到 seed。原生音频经 VAEDecodeAudio → CreateVideo → SaveVideo 出 mp4。
    {
      id: "builtin-h3-i2v",
      name: "内置 · MiniMax H3 图生视频",
      type: "video-i2v",
      desc: "上游图作首帧，带原生音频，默认 5 秒",
      hints: [
        { nodeId: "1", field: "unet_name", prefer: [["minimax", "h3"]] },
        { nodeId: "2", field: "clip_name", prefer: [["qwen3vl", "32b"], ["qwen3vl"]] },
        { nodeId: "4", field: "vae_name", prefer: [["minimax_h3_video"], ["minimax", "video"]] },
        { nodeId: "5", field: "vae_name", prefer: [["minimax_h3_audio"], ["minimax", "audio"]] },
      ],
      workflow: {
        "1": { class_type: "UNETLoader", inputs: { unet_name: "minimax_h3_fl2va_pruned_int8_convrot.safetensors", weight_dtype: "default" }, _meta: { title: "H3 模型" } },
        "2": { class_type: "CLIPLoader", inputs: { clip_name: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", type: "minimax" }, _meta: { title: "文本编码器" } },
        "3": { class_type: "MiniMaxH3ImageToVideo", inputs: { clip: ["2", 0], vae: ["4", 0], prompt: "", width: 1344, height: 768, length: 124, first_frame: ["6", 0] }, _meta: { title: "H3 动画" } },
        "4": { class_type: "VAELoader", inputs: { vae_name: "minimax_h3_video_vae_fp16.safetensors" }, _meta: { title: "视频VAE" } },
        "5": { class_type: "VAELoader", inputs: { vae_name: "minimax_h3_audio_vae_fp32.safetensors" }, _meta: { title: "音频VAE" } },
        "6": { class_type: "LoadImage", inputs: { image: "canvasflow_source.png" }, _meta: { title: "Source 原图" } },
        "7": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] }, _meta: { title: "Negative 负面" } },
        "8": { class_type: "KSampler", inputs: { model: ["1", 0], seed: 0, steps: 20, cfg: 1, sampler_name: "res_multistep", scheduler: "simple", denoise: 1, positive: ["3", 0], negative: ["7", 0], latent_image: ["3", 1] }, _meta: { title: "采样" } },
        "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["4", 0] }, _meta: { title: "解码" } },
        "10": { class_type: "VAEDecodeAudio", inputs: { samples: ["8", 0], vae: ["5", 0] }, _meta: { title: "解码音频" } },
        "11": { class_type: "CreateVideo", inputs: { images: ["9", 0], fps: 24, audio: ["10", 0], bit_depth: 8 }, _meta: { title: "合成视频" } },
        "12": { class_type: "SaveVideo", inputs: { video: ["11", 0], filename_prefix: "CanvasFlowVideo", format: "auto", codec: "auto" }, _meta: { title: "输出" } },
      },
    },
    {
      id: "builtin-h3-t2v",
      name: "内置 · MiniMax H3 文生视频",
      type: "video-t2v",
      desc: "纯提示词生成动画，带原生音频，默认 5 秒",
      hints: [
        { nodeId: "1", field: "unet_name", prefer: [["minimax", "h3"]] },
        { nodeId: "2", field: "clip_name", prefer: [["qwen3vl", "32b"], ["qwen3vl"]] },
        { nodeId: "4", field: "vae_name", prefer: [["minimax_h3_video"], ["minimax", "video"]] },
        { nodeId: "5", field: "vae_name", prefer: [["minimax_h3_audio"], ["minimax", "audio"]] },
      ],
      workflow: {
        "1": { class_type: "UNETLoader", inputs: { unet_name: "minimax_h3_fl2va_pruned_int8_convrot.safetensors", weight_dtype: "default" }, _meta: { title: "H3 模型" } },
        "2": { class_type: "CLIPLoader", inputs: { clip_name: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", type: "minimax" }, _meta: { title: "文本编码器" } },
        "3": { class_type: "MiniMaxH3ImageToVideo", inputs: { clip: ["2", 0], vae: ["4", 0], prompt: "", width: 1344, height: 768, length: 124 }, _meta: { title: "H3 动画" } },
        "4": { class_type: "VAELoader", inputs: { vae_name: "minimax_h3_video_vae_fp16.safetensors" }, _meta: { title: "视频VAE" } },
        "5": { class_type: "VAELoader", inputs: { vae_name: "minimax_h3_audio_vae_fp32.safetensors" }, _meta: { title: "音频VAE" } },
        "7": { class_type: "CLIPTextEncode", inputs: { text: "", clip: ["2", 0] }, _meta: { title: "Negative 负面" } },
        "8": { class_type: "KSampler", inputs: { model: ["1", 0], seed: 0, steps: 20, cfg: 1, sampler_name: "res_multistep", scheduler: "simple", denoise: 1, positive: ["3", 0], negative: ["7", 0], latent_image: ["3", 1] }, _meta: { title: "采样" } },
        "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["4", 0] }, _meta: { title: "解码" } },
        "10": { class_type: "VAEDecodeAudio", inputs: { samples: ["8", 0], vae: ["5", 0] }, _meta: { title: "解码音频" } },
        "11": { class_type: "CreateVideo", inputs: { images: ["9", 0], fps: 24, audio: ["10", 0], bit_depth: 8 }, _meta: { title: "合成视频" } },
        "12": { class_type: "SaveVideo", inputs: { video: ["11", 0], filename_prefix: "CanvasFlowVideo", format: "auto", codec: "auto" }, _meta: { title: "输出" } },
      },
    },
  ];

  if (typeof window !== "undefined") window.CANVASFLOW_SD_TEMPLATES = TEMPLATES;
  if (typeof module !== "undefined" && module.exports) module.exports = { TEMPLATES };
})();
