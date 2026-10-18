# Midjourney 绘图

在 APIMart 的 AI 绘图节点选择 Midjourney。使用 APIMart API Key，支持文字提示词及上游参考图垫图，结果沿用画布预览、图片节点和导出保存流程。

- 默认 v8.2、Relax；可选 v8.1、v7、v6.1、v5.2、v5.1，以及 Fast、Turbo。
- 「任务次数」1–4 表示独立提交的次数，不保证对应单图数量。一次任务可能返回拼图或多图；返回多图时全部接收。
- 不提供 1K/2K/4K 分辨率参数；比例使用节点选择，更多 MJ 原生参数可写在提示词中。提示词覆盖速度等参数时，显示的参考价格可能与实际扣费不同。
- 官网黄金会员参考价（2026-10-17）：Relax 0.4504、Fast 0.5504、Turbo 1 Credits/次；实际以账户等级和账单为准。
- 提交通过本地 `/api/midjourney/generate` 转到上游 `/v1/midjourney/generations`，查询复用 `/v1/tasks/{id}`。排队轮询最长约 30 分钟。
- Windows 桌面宿主与 Node 服务均已适配。旧桌面程序需重新构建或安装包含新接口的宿主；仅替换前端不足以接入。Node 模式修改后需重启服务。

本次范围为 Imagine 文生图/垫图；不包含 Midjourney 的变体、放大选图、局部重绘与视频等二次操作。

验证：`node --test tests/midjourney.test.cjs`；Windows 宿主编译；浏览器检查模型、版本、速度、任务次数及价格联动。未使用真实 Key 提交付费任务。

参考：[提交文档](https://docs.apimart.ai/cn/api-reference/images/midjourney/imagine)、[任务查询](https://docs.apimart.ai/cn/api-reference/images/midjourney/query)、[价格](https://apib.ai/zh/model/midjourney)。
