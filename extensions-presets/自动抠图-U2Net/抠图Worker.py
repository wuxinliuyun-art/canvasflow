# -*- coding: utf-8 -*-
"""自动抠图（快速）Worker：rembg + u2netp 离线推理，input/ → output/。

模型 u2netp.onnx 随包自带（models/），运行全程不联网；
OMP_NUM_THREADS 固定线程数，避免推理打满机器全部核心。
"""
import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent

# 离线模型目录必须在 import rembg 之前指定（rembg 经 U2NET_HOME 查找模型）
os.environ["U2NET_HOME"] = str(HERE / "models")
os.environ.setdefault("OMP_NUM_THREADS", "4")

from PIL import Image  # noqa: E402
from rembg import new_session, remove  # noqa: E402

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
BACKGROUNDS = {"透明": None, "白色": (255, 255, 255, 255), "黑色": (0, 0, 0, 255)}


def main():
    workspace = Path.cwd()
    input_dir, output_dir = workspace / "input", workspace / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in input_dir.iterdir() if p.suffix.lower() in EXTS) if input_dir.is_dir() else []
    if not files:
        print("input 文件夹中没有图片")
        sys.exit(1)

    params = {}
    if (workspace / "params.json").is_file():
        try:
            params = json.loads((workspace / "params.json").read_text(encoding="utf-8"))
        except Exception:
            params = {}
    label = params.get("background", "透明")
    bg = BACKGROUNDS.get(label, None)
    print(f"模型 u2netp（离线）· 背景 {label} · 线程 {os.environ['OMP_NUM_THREADS']}")

    session = new_session("u2netp")
    stamp = time.strftime("%y%m%d-%H%M")
    for i, src in enumerate(files, start=1):
        t0 = time.time()
        with Image.open(src) as im:
            im.load()
            cut = remove(im, session=session)
            if bg is not None:
                base = Image.new("RGBA", cut.size, bg)
                base.alpha_composite(cut)
                cut = base
            out = output_dir / f"{stamp}-{i}.png"
            cut.save(out)
        print(f"已抠图 {src.name} → {out.name}（{time.time() - t0:.1f}s）")


if __name__ == "__main__":
    main()
