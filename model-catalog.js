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
  //   id          模型 ID（提交给上游视频接口的 model 值）
  //   apiType     网关归属（key 分槽）：agtoken（settings.agtokenApiKey 槽，统一视频接口
  //               /v1/video/generations）/ apimart（settings.apiKey 槽，统一视频接口
  //               /v1/videos/generations + 任务查询 /v1/tasks/{task_id}），两家格式互不转换
  //   resolutions 可选分辨率档（首项为该模型默认档；字面值原样透传上游，大小写按各家文档）
  //   ratios      可选画面比例（adaptive = 跟随参考图；空数组 = 模型不支持指定比例，如
  //               Hailuo-2.3 图生视频比例恒由首帧图决定）
  //   durations   可选时长（秒；-1 = 由模型决定智能时长；首项为默认档）
  //   durationLimitsByResolution 可选：某分辨率档下的时长白名单（如 Hailuo 1080p 仅支持 6 秒）
  //   audio       是否显示"声音"开关（generate_audio）；H3 系/wan3.0 自带音轨无开关，保持 false
  //   maxImages   参考图上限（agtoken images[] / apimart image_urls 的取图上限）
  //   imageMode   apimart 图片传法："reference" = image_urls 参考图（H3 系/seedance 系/wan3.0），
  //               "first_frame" = first_frame_image 首帧图（Hailuo-2.3 系图生视频，必须有图）；
  //               agtoken 恒走 images[]，不需要此字段
  //   note        计费说明（展示在节点参数区，用户要求接入时必须带计费情况）
  //   priceTag    短价签（最低价位档，拼接在下拉选项文字后面，如 "¥0.195/秒起"）
  //   tips        能力说明（各模型支持的生成模式/图片用法/时长比例差异，展示在计费下方）
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
        priceTag: "¥0.49-0.56/秒",
        note: "Seedance 2.0 Pro，官方参考区间 ¥0.49-0.56/秒（实际按生成时长结算）",
        tips: "文生/图生视频；参考图 ≤9 张按画布顺序发送；可开声音",
        pricingUrl: "https://agtoken.vip/pricing",
      },
      {
        id: "seedance2.5",
        label: "Seedance 2.5 官转版（国内）",
        apiType: "agtoken",
        resolutions: ["480p", "720p", "1080p"],
        ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"],
        durations: [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        audio: true,
        maxImages: 9,
        priceTag: "¥0.72-2.82/秒",
        note: "官方参考区间 ¥0.72-2.82/秒（实际按生成时长结算）",
        tips: "文生/图生视频；参考图 ≤9 张；可开声音",
        pricingUrl: "https://agtoken.vip/pricing",
      },
      {
        id: "wan3.0-video-prime（国内）",
        label: "Wan 3.0 Prime 极速版（国内）",
        apiType: "agtoken",
        resolutions: ["480p", "720p", "1080p"],
        ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
        durations: [-1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        audio: false,
        maxImages: 9,
        priceTag: "¥0.2925/秒起",
        note: "按秒计费：480p ¥0.2925 / 720p ¥0.585 / 1080p ¥1.170（参考视频也计秒）",
        tips: "文生/图生视频；参考图 ≤9 张按画布顺序发送；自带音轨",
        pricingUrl: "https://agtoken.vip/pricing",
      },
      {
        id: "wan3.0-video（国内）",
        label: "Wan 3.0（国内）",
        apiType: "agtoken",
        resolutions: ["480p", "720p", "1080p"],
        ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
        durations: [-1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        audio: false,
        maxImages: 9,
        priceTag: "¥0.195/秒起",
        note: "按秒计费：480p ¥0.195 / 720p ¥0.390 / 1080p ¥0.780（参考视频也计秒）",
        tips: "文生/图生视频；参考图 ≤9 张按画布顺序发送；自带音轨",
        pricingUrl: "https://agtoken.vip/pricing",
      },
      {
        id: "MiniMax-H3",
        label: "MiniMax H3（APIMart）",
        apiType: "apimart",
        resolutions: ["2K", "768P"],
        ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
        durations: [5, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        audio: false,
        maxImages: 9,
        imageMode: "reference",
        priceTag: "≈$0.0914/秒",
        note: "约 $0.0914 / 秒（0.9144 Credits/秒），自带音轨",
        tips: "文生/参考图生视频（≤9 张参考图）；比例必须具体值；时长 4-15 秒",
        pricingUrl: "https://apimart.ai/",
      },
      {
        id: "MiniMax-H3-Max",
        label: "MiniMax H3 Max（APIMart·极速）",
        apiType: "apimart",
        resolutions: ["768P", "480P", "1080P"],
        ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
        durations: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        audio: false,
        maxImages: 9,
        imageMode: "reference",
        priceTag: "≈$0.0571/秒",
        note: "约 $0.0571 / 秒（0.5712 Credits/秒），自带音轨",
        tips: "H3 极速版：文生/参考图生视频（≤9 张参考图）；最高 1080P（无 2K）；时长 5-15 秒",
        pricingUrl: "https://apimart.ai/",
      },
      {
        id: "MiniMax-Hailuo-2.3-Fast",
        label: "MiniMax Hailuo 2.3 Fast（APIMart）",
        apiType: "apimart",
        resolutions: ["768p", "1080p"],
        ratios: [],
        durations: [6, 10],
        durationLimitsByResolution: { "1080p": [6] },
        audio: false,
        maxImages: 1,
        imageMode: "first_frame",
        priceTag: "≈$0.0248/秒",
        note: "约 $0.0248 / 秒（0.248 Credits/秒，带音频 +20%）",
        tips: "仅图生视频：第 1 张参考图作首帧（必须有图，比例跟随首帧）；1080p 仅支持 6 秒",
        pricingUrl: "https://apimart.ai/",
      },
      {
        id: "seedance-2.5",
        label: "Seedance 2.5（APIMart）",
        apiType: "apimart",
        resolutions: ["720p", "480p", "1080p"],
        ratios: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
        durations: [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
        audio: true,
        maxImages: 9,
        imageMode: "reference",
        priceTag: "≈$0.216/秒",
        note: "约 $0.216 / 秒（2.16 Credits/秒）",
        tips: "文生/图生视频（≤9 张参考图）；时长最长 30 秒，智能时长 -1 按 30 秒预扣多退少补；可开声音",
        pricingUrl: "https://apimart.ai/",
      },
      {
        id: "seedance-2.0",
        label: "Seedance 2.0（APIMart）",
        apiType: "apimart",
        resolutions: ["720p", "480p", "1080p"],
        ratios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"],
        durations: [5, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        audio: true,
        maxImages: 9,
        imageMode: "reference",
        priceTag: "≈$0.066/秒",
        note: "约 $0.066 / 秒（0.66 Credits/秒）",
        tips: "文生/图生视频（≤9 张参考图）；时长 4-15 秒；可开声音",
        pricingUrl: "https://apimart.ai/",
      },
      {
        id: "seedance-2.0-fast",
        label: "Seedance 2.0 Fast（APIMart）",
        apiType: "apimart",
        resolutions: ["720p", "480p", "1080p"],
        ratios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"],
        durations: [5, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        audio: true,
        maxImages: 9,
        imageMode: "reference",
        priceTag: "≈$0.0398/秒",
        note: "约 $0.0398 / 秒（0.3984 Credits/秒，带音频 +20%）",
        tips: "2.0 快速版，参数同标准版（≤9 张参考图，时长 4-15 秒）；可开声音",
        pricingUrl: "https://apimart.ai/",
      },
      {
        id: "seedance-2.0-mini",
        label: "Seedance 2.0 Mini（APIMart）",
        apiType: "apimart",
        resolutions: ["720p", "480p", "1080p"],
        ratios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"],
        durations: [5, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        audio: true,
        maxImages: 9,
        imageMode: "reference",
        priceTag: "≈$0.0182/秒",
        note: "约 $0.0182 / 秒（0.18151 Credits/秒，带音频 +20%）",
        tips: "2.0 迷你版（最便宜），参数同标准版（≤9 张参考图，时长 4-15 秒）；可开声音",
        pricingUrl: "https://apimart.ai/",
      },
      {
        id: "wan3.0-video",
        label: "Wan 3.0（APIMart）",
        apiType: "apimart",
        resolutions: ["1080P", "720P", "480P"],
        ratios: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"],
        durations: [-1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
        audio: false,
        maxImages: 2,
        imageMode: "reference",
        priceTag: "¥0.30/秒起",
        note: "按秒×分辨率计费：480P ¥0.30 / 720P ¥0.60 / 1080P ¥1.20 每秒（不传档默认按 1080P）",
        tips: "参考图第 1 张作首帧、第 2 张作尾帧（最多 2 张）；时长 2-30 秒；自带音轨（默认开）",
        pricingUrl: "https://apimart.ai/",
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
    // 分站点默认对话模型：只填一家的 key 时新建对话节点取该站默认（chatDefaultModelForSite）；
    // 两家都填或都没填、以及站点列表里没有该默认模型时，落回全局 defaultModel。
    // settings.chatDefaultModel（用户显式设置）优先级最高。
    siteDefaults: { apimart: "gpt-6-luna", agtoken: "gemini-3.8-flash" },
    models: [
      { id: "gpt-5.2-chat-latest", label: "GPT-5.2 Chat（多模态·APIMart）", hidden: true, apiType: "apimart", multimodal: true, pricingUrl: "https://apib.ai/zh/model/llm/gpt" },
      // APIMart 官网公开价格，单位 Credits / 百万 Token；优惠可能随平台调整。
      // 暂按纯文本接入，未确认视觉能力前不发送参考图。
      { id: "gpt-6-luna", label: "GPT-6 Luna（APIMart）", note: "便宜", apiType: "apimart", multimodal: false, pricingUrl: "https://apib.ai/zh/model/llm/gpt" },
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol（APIMart）", apiType: "apimart", multimodal: false, pricingUrl: "https://apib.ai/zh/model/llm/gpt" },
      { id: "gemini-4-argon", label: "Gemini 4 Argon（APIMart）", note: "文笔好", apiType: "apimart", multimodal: false, pricingUrl: "https://apib.ai/zh/model/llm/gemini" },
      { id: "claude-opus-5-5", label: "Claude Opus 5.5（APIMart）", note: "美术及性能好", apiType: "apimart", multimodal: false, pricingUrl: "https://apib.ai/zh/model/llm/claude?id=claude-opus-5-5" },
      { id: "deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash（APIMart）", apiType: "apimart", multimodal: false, pricingUrl: "https://apib.ai/zh/model/llm/deepseek" },
      { id: "gpt-6-sol", label: "GPT-6 Sol（AGToken）", apiType: "agtoken", multimodal: false },
      { id: "gpt-6-astra", label: "GPT-6 Astra（AGToken）", note: "便宜", apiType: "agtoken", multimodal: false },
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash（AGToken）", apiType: "agtoken", multimodal: false },
    ],
  };
})();
