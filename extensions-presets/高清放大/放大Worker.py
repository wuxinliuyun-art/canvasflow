"""图片放大 + 白场矫正 · 无头运行入口（CanvasFlow 扩展接入用）。

运行语义见上级目录《拓展脚本规范.md》：从当前工作目录的 input/ 读取图片，
结果写入 output/；参数来自工作区的 params.json（可选）。
模型、exe 等资源用脚本自身位置定位，因此本文件夹需包含 realesrgan-ncnn-vulkan.exe
与 models/（与 GUI 版 一键放大+白场.bat 共用同一套文件）。
"""
from __future__ import annotations

import importlib.util
import json
import shutil
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
GUI_MODULE = HERE / "放大+白场矫正.py"
SUPPORTED = {".jpg", ".jpeg", ".png", ".webp"}

# 与 GUI 版 MODELS 列表保持一致：显示名 -> (模型名, 倍数)
MODEL_MAP = {
    "照片 x4": ("realesrgan-x4plus", 4),
    "动漫/插图 x4": ("realesrgan-x4plus-anime", 4),
    "动漫视频 x2": ("realesr-animevideov3-x2", 2),
    "动漫视频 x3": ("realesr-animevideov3-x3", 3),
    "动漫视频 x4": ("realesr-animevideov3-x4", 4),
}
DEFAULT_MODEL = "动漫/插图 x4"


def load_pipeline():
    """复用 GUI 版里已写好的纯函数（upscale_files / finish_file 等）。"""
    spec = importlib.util.spec_from_file_location("upscale_pipeline", GUI_MODULE)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载管线模块：{GUI_MODULE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    if not GUI_MODULE.is_file():
        print(f"缺少管线模块：{GUI_MODULE.name}（请把它和本脚本放在同一文件夹）")
        sys.exit(1)
    if not (HERE / "realesrgan-ncnn-vulkan.exe").is_file():
        print("本文件夹缺少 realesrgan-ncnn-vulkan.exe，请从 GUI 版工具目录复制")
        sys.exit(1)

    pipeline = load_pipeline()

    cwd = Path.cwd()
    input_dir, output_dir = cwd / "input", cwd / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    params: dict = {}
    if (cwd / "params.json").is_file():
        try:
            params = json.loads((cwd / "params.json").read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"params.json 解析失败，按默认参数运行：{exc}")

    model_label = str(params.get("model") or DEFAULT_MODEL)
    model, scale = MODEL_MAP.get(model_label, MODEL_MAP[DEFAULT_MODEL])
    strength = max(0, min(150, int(params.get("strength", 100))))
    white_point = bool(params.get("whitePoint", False))

    files = sorted(
        (p for p in input_dir.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED),
        key=lambda p: p.name.lower(),
    ) if input_dir.is_dir() else []
    if not files:
        print("input 文件夹中没有图片（支持 jpg/png/webp）")
        sys.exit(1)

    print(f"共 {len(files)} 张图片：模型 {model_label}，白场矫正 {'开' if white_point else '关'}，强度 {strength}%")
    tmp_dir = Path(tempfile.mkdtemp(prefix="_upscale_tmp_", dir=HERE))
    failures: list[str] = []
    started = time.time()
    try:
        results = pipeline.upscale_files(files, model, scale, tmp_dir)
        for index, (path, upscaled, error) in enumerate(results, 1):
            if error is not None:
                failures.append(f"{path.name}: {error}")
                print(f"[{index}/{len(files)}] {path.name} 放大失败：{error}")
                continue
            try:
                written = pipeline.finish_file(upscaled, path, output_dir, white_point, strength)
                print(f"[{index}/{len(files)}] {path.name} -> {written.name}")
            except Exception as exc:
                failures.append(f"{path.name}: {exc}")
                print(f"[{index}/{len(files)}] {path.name} 处理失败：{exc}")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    if failures:
        print(f"完成，但有 {len(failures)} 张失败（耗时 {time.time() - started:.0f} 秒）")
        sys.exit(1)
    print(f"全部完成：{len(files)} 张，耗时 {time.time() - started:.0f} 秒")


if __name__ == "__main__":
    main()
