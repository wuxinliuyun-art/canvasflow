# 智能抠图插件第三方说明

本插件使用 BiRefNet General Lite 模型进行前景分割和透明背景生成。

## 原始项目

- 项目：BiRefNet
- 官方仓库：https://github.com/ZhengPeng7/BiRefNet
- 许可证：MIT

BiRefNet 是模型和算法的原始来源。

## 实际下载的 ONNX 文件

- 提供方：rembg
- 项目：https://github.com/danielgatis/rembg
- Release：https://github.com/danielgatis/rembg/releases/tag/v0.0.0
- 文件：`BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx`
- 下载地址：https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx
- 文件大小：224,005,088 字节（约 213.6 MB）
- MD5：`4fab47adc4ff364be1713e97b7e66334`

该 ONNX 文件由 rembg Release 提供，并非从 BiRefNet 官方仓库直接下载。CanvasFlow 安装时必须校验上述文件大小和 MD5；校验不一致时不得加载。
