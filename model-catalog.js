// CanvasFlow 绘图模型目录（声明式配置）。
// 新增/调整绘图模型只需修改本文件并发布界面热更新包（CanvasFlow-Web.zip），
// 无需改动桌面端 EXE。app.js 通过 window.CANVASFLOW_MODEL_CATALOG 读取。
//
// 字段说明：
//   id          模型 ID（提交给上游 API 的 model 值）
//   label       界面显示名
//   quality     是否支持画质（quality）参数
//   qualities   可选画质档
//   resolutions 可选分辨率档
//   sizes       可选画面比例
//   hidden      true 时不出现在模型下拉，仅为旧存档节点保留兼容
(() => {
  const RATIOS_FULL = ["1:1", "auto", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"];
  const RATIOS_EXT = ["1:1", "auto", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "21:9"];

  window.CANVASFLOW_MODEL_CATALOG = {
    apimart: {
      label: "APIMart",
      defaultModel: "gpt-image-2.5-flare",
      models: [
        { id: "gpt-image-2-official", label: "GPT Image 2（官方）", hidden: true, quality: true, qualities: ["auto", "low", "medium", "high"], resolutions: ["1k", "2k", "4k"], sizes: RATIOS_FULL, pricingUrl: "https://apib.ai/zh/model/gpt-image-2" },
        { id: "midjourney", label: "Midjourney", quality: false, qualities: [], resolutions: ["auto"], sizes: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"], versions: ["8.2", "8.1", "7", "6.1", "5.2", "5.1"], speeds: ["relax", "fast", "turbo"], pricingUrl: "https://apib.ai/zh/model/midjourney" },
        { id: "gpt-image-2", label: "GPT Image 2（ext · 便宜）", quality: false, qualities: [], resolutions: ["1k", "2k", "4k"], sizes: RATIOS_FULL, pricingUrl: "https://apib.ai/zh/model/gpt-image-2" },
        // maxImages = 已验证的参考图上限（仅采信来源明确的数值；未声明的模型视为未知，功能侧保守降级）
        // gpt-image-2.5-ext / gpt-image-2.5：APIMart 官方文档 image_urls 最多 16 张（2026-11-07 核实）
        { id: "gpt-image-2.5-flare", label: "GPT Image 2.5 Flare（快速）", quality: false, qualities: [], resolutions: ["1k", "2k", "4k"], sizes: RATIOS_EXT, maxImages: 16, pricingUrl: "https://apib.ai/zh/model/gpt-image-2-5-flare" },
        { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst（质量）", quality: false, qualities: [], resolutions: ["1k", "2k", "4k"], sizes: RATIOS_EXT, maxImages: 16, pricingUrl: "https://apib.ai/zh/model/gpt-image-2-5-sunburst" },
        { id: "gpt-image-2.5", label: "GPT Image 2.5", hidden: true, quality: true, qualities: ["auto", "low", "medium", "high"], resolutions: ["1k"], sizes: RATIOS_FULL, maxImages: 16, pricingUrl: "https://apib.ai/zh/model/gpt-image-2-5-flare" },
        { id: "gemini-3.1-flash-image-preview", label: "Nano Banana 2", quality: false, qualities: [], resolutions: ["1k", "2k", "4k"], sizes: RATIOS_FULL, pricingUrl: "https://apib.ai/zh/model/nano-banana-3-api" },
        // Nano Banana Pro（Gemini 3 Pro Image）：比例仅接受 RATIOS_EXT 档，分辨率 1K/2K/4K，n 仅支持 1，不支持 quality；参考图最多 14 张
        { id: "gemini-3-pro-image-preview", label: "Nano Banana Pro", quality: false, qualities: [], resolutions: ["1k", "2k", "4k"], sizes: RATIOS_EXT, maxImages: 14, pricingUrl: "https://apib.ai/zh/model/nano-banana-2-api" },
      ],
    },
    agtoken: {
      label: "AGToken",
      defaultModel: "gpt-image-2.5-flare",
      models: [
        { id: "gpt-image-2.5", label: "GPT Image 2.5", hidden: true, quality: true, qualities: ["low", "medium", "high"], resolutions: ["1k", "2k", "4k"], sizes: RATIOS_FULL },
        { id: "gpt-image-2.5-flare", label: "GPT Image 2.5 Flare（快速）", quality: true, qualities: ["low", "medium", "high", "xhigh", "max"], resolutions: ["1k", "2k", "4k"], sizes: RATIOS_EXT },
        { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst（质量）", quality: true, qualities: ["low", "medium", "high", "xhigh", "max"], resolutions: ["1k", "2k", "4k"], sizes: RATIOS_EXT },
        // AGToken currently has no distributor channel for the derived gpt-image-2-4k model.
        // Keep 4K available on models whose upstream channels support it instead of submitting a known-invalid combination.
        { id: "gpt-image-2", label: "GPT Image 2", quality: true, qualities: ["low", "medium", "high"], resolutions: ["1k", "2k"], sizes: RATIOS_FULL },
        // gpt-image-2官渠：官方直连满血版，原生 1K/2K/4K 各档同价（约 ¥0.15/张），支持 image-edits；
        // 同时承担两件事（见 app.js）：gpt-image-2 的 2K 档固定路由到官渠提交（agtokenSubmitModelId），
        // 以及 gpt-image-2 派生渠道不可用（No available channel）时的自动兜底（agtokenChannelFallbackModelId）
        { id: "gpt-image-2官渠", label: "GPT Image 2 官渠（满血）", quality: false, qualities: [], resolutions: ["1k", "2k", "4k"], sizes: RATIOS_FULL },
        // nano-banana-2 / nano-banana-pro：size 传 1k/2k/4k 档，比例仅接受标准档（任意宽高比会被上游 400 拒绝）；不支持 quality
        { id: "nano-banana-2", label: "Nano Banana 2", quality: false, qualities: [], resolutions: ["1k", "2k", "4k"], sizes: ["1:1", "2:3", "3:2", "4:3", "3:4", "16:9", "9:16"] },
        { id: "nano-banana-pro", label: "Nano Banana Pro", quality: false, qualities: [], resolutions: ["1k", "2k", "4k"], sizes: ["1:1", "2:3", "3:2", "4:3", "3:4", "16:9", "9:16"] },
      ],
    },
  };

  // AI 视频（ai-video）模型目录：与绘图/对话目录相互独立。
  //   id          模型 ID（提交给上游统一视频接口 /v1/video/generations 的 model 值）
  //   apiType     网关归属（key 分槽），当前仅 agtoken（settings.agtokenApiKey 槽）
  //   resolutions 可选分辨率档（seedance 2.0 国内：480p/720p/1080p/4k）
  //   ratios      可选画面比例（adaptive = 跟随参考图）
  //   durations   可选时长（秒；-1 = 由模型决定智能时长）
  //   audio       是否支持有声视频（generate_audio 开关）
  //   maxImages   参考图上限（seedance 2.0 国内 ≤9 张）
  //   pricingUrl  网关价格页
  window.CANVASFLOW_VIDEO_CATALOG = {
    defaultModel: "doubao-seedance-2-0-260128（国内）",
    models: [
      {
        id: "doubao-seedance-2-0-260128（国内）",
        label: "豆包 Seedance 2.0（国内）",
        apiType: "agtoken",
        resolutions: ["480p", "720p", "1080p", "4k"],
        ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"],
        durations: [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        audio: true,
        maxImages: 9,
        pricingUrl: "https://agtoken.vip/pricing",
      },
    ],
  };

  // AI 对话（chat）模型目录：与绘图目录相互独立。
  //   id         模型 ID（提交给上游 chat/completions 的 model 值）
  //   apiType    网关归属：apimart（settings.apiKey 槽）/ agtoken（settings.agtokenApiKey 槽），
  //              两家走各自的 OpenAI 兼容 chat/completions，请求格式互不转换
  //   multimodal true 时把上游参考图以 image_url 内容部分随消息发送；false 时忽略上游图片
  window.CANVASFLOW_CHAT_CATALOG = {
    defaultModel: "gpt-6-astra",
    models: [
      { id: "gpt-5.2-chat-latest", label: "GPT-5.2 Chat（多模态·APIMart）", hidden: true, apiType: "apimart", multimodal: true, pricingUrl: "https://apib.ai/zh/model/llm/gpt" },
      // APIMart 官网公开价格，单位 Credits / 百万 Token；优惠可能随平台调整。
      // 暂按纯文本接入，未确认视觉能力前不发送参考图。
      { id: "gpt-6-luna", label: "GPT-6 Luna（APIMart）", note: "便宜", apiType: "apimart", multimodal: false, pricingUrl: "https://apib.ai/zh/model/llm/gpt" },
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol（APIMart）", apiType: "apimart", multimodal: false, pricingUrl: "https://apib.ai/zh/model/llm/gpt" },
      { id: "gemini-4-argon", label: "Gemini 4 Argon（APIMart）", note: "文笔好", apiType: "apimart", multimodal: false, pricingUrl: "https://apib.ai/zh/model/llm/gemini" },
      { id: "claude-opus-5-5", label: "Claude Opus 5.5（APIMart）", note: "美术及性能好", apiType: "apimart", multimodal: false, pricingUrl: "https://apib.ai/zh/model/llm/claude?id=claude-opus-5-5" },
      { id: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash（APIMart）", apiType: "apimart", multimodal: false, pricingUrl: "https://apib.ai/zh/model/llm/deepseek" },
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash（APIMart）", hidden: true, apiType: "apimart", multimodal: false, pricingUrl: "https://apib.ai/zh/model/llm/gemini" },
      { id: "gpt-6-sol", label: "GPT-6 Sol（AGToken）", apiType: "agtoken", multimodal: false },
      { id: "gpt-6-astra", label: "GPT-6 Astra（AGToken）", note: "便宜", apiType: "agtoken", multimodal: false },
    ],
  };
})();
