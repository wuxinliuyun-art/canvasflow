# 自动抠图（U²-Net 快速）拓展

基于 **U²-Net** 项目开源的 u2netp 预训练模型与 **rembg** 推理框架实现本地自动去背景：离线推理、秒级出图、批量透明 PNG。定位是"快速预览"，发丝等精细边缘请用自动抠图（通用模型，BiRefNet）。

## 署名 / 致谢

- **模型：U²-Net（u2netp）** —— Qin Xuebin, Colin Decourt, Alla Betina 等，《U^2-Net: Going Deeper with Nested U-Structure for Salient Object Detection》（Pattern Recognition 2020），项目主页：https://github.com/xuebinqin/U-2-Net 。本拓展所用 `u2netp.onnx` 为 rembg 发行版附带的 U²-Net 轻量版预训练权重。
- **推理框架：rembg** —— https://github.com/danielgatis/rembg （MIT License，见 `licenses/rembg-LICENSE.txt`）。

CanvasFlow 的拓展壳与任务对接代码为本项目自有部分；上述模型与框架的权利归属原作者，分发本拓展即视为用户已同意其开源许可证。

## 使用

把整个 `自动抠图-U2Net/` 文件夹放进画布的拓展目录（桌面版为程序旁 `拓展/`，安装版在设置 → 拓展里查看），刷新拓展列表即可出现「自动抠图（U²-Net 快速）」。桌面端只需要机器上有任意系统 Python（入口启动器用，标准库即可），真正的推理跑在拓展自带的离线环境里，**运行全程不联网**。

- 输入：画布选中的图片（写入 `input/`）
- 参数：背景处理（透明 / 白色 / 黑色）
- 输出：`output/` 下与原图等尺寸的 PNG（按 `%y%m%d-%H%M-序号` 命名）

## 结构

```
自动抠图-U2Net/
├── 扩展.json          # 拓展清单（id: auto-matting-u2net）
├── 轻量抠图.py        # 入口启动器（纯标准库）：转发给 runtime\python.exe
├── 抠图Worker.py      # 真正的推理脚本（rembg + u2netp）
├── models/
│   └── u2netp.onnx    # U²-Net 官方模型（rembg 发行版），md5 8e83ca70e441ab06c318d82300c84806
├── runtime/           # 离线 Python 3.12 运行环境（.gitignore，随 zip 分发）
├── licenses/          # 全部开源组件的许可证文本（MIT 合规）
└── README.md
```

## 打包分发

`runtime/`（约 400MB，压缩后约 150–200MB）与 `models/` 一起打进 zip 后经网盘分发；本拓展**不进主程序安装包**，与自动抠图（通用模型）同属独立分发拓展。给用户发 zip 即可用，无需 Python 环境、无需 pip、无需联网。

## 重建 runtime（换机器/换版本时）

1. 下载 [python-3.12.10-embed-amd64.zip](https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip)，解压到 `runtime/`；
2. `runtime/python312._pth` 改为：`python312.zip`、`.`、`Lib\site-packages`、`import site`；
3. `runtime\python.exe get-pip.py` 装 pip；
4. `runtime\python.exe -m pip install "rembg[cpu]"`；
5. **把新版 VC++ 运行库复制进 `runtime/`（关键，缺了会段错误）**：`msvcp140.dll`、`msvcp140_codecvt_ids.dll`、`vcruntime140.dll`、`vcruntime140_1.dll`、`concrt140.dll`——任何较新（≥14.4x）的 VS2022 运行库拷贝均可（来源示例：新版 Edge 安装目录）。系统 System32 里若只有 14.0x 老版本 msvcp140，onnxruntime 导入即段错误；
6. 下载 [u2netp.onnx](https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx) 放入 `models/`（md5 与 rembg 内置校验一致时不会联网）。

## 开源组件（licenses/ 目录有完整许可证文本）

rembg（MIT）、onnxruntime（MIT）、PyMatting（MIT）、numpy/scipy/scikit-image/numba/llvmlite/pooch 等（BSD 家族）、pillow（MIT-CMU）、Python 3.12（PSF）。全部为宽松许可，可随拓展分发；分发时保留 `licenses/` 目录即可。
