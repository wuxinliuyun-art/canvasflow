# -*- coding: utf-8 -*-
"""Independent BiRefNet-general cutout tool. Input/output are relative to this file."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
MODEL = "birefnet-general"
EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def runtime_ready():
    return all(importlib.util.find_spec(name) is not None for name in ("rembg", "onnxruntime", "PIL"))


def ensure_runtime():
    """Use an optional existing Python, otherwise install into a private venv."""
    config = ROOT / "python-path.txt"
    if config.exists() and not os.environ.get("CANVASFLOW_MATTING_CHILD"):
        python = Path(config.read_text(encoding="utf-8-sig").strip())
        if not python.is_file():
            raise RuntimeError("python-path.txt 指定的 Python 不存在，请修正路径或删除该文件")
        env = dict(os.environ, CANVASFLOW_MATTING_CHILD="1")
        raise SystemExit(subprocess.call([str(python), str(Path(__file__).resolve())], cwd=ROOT, env=env))
    if runtime_ready():
        return
    if os.environ.get("CANVASFLOW_MATTING_CHILD"):
        raise RuntimeError("所选 Python 缺少 rembg、onnxruntime 或 Pillow，请安装依赖或删除 python-path.txt")
    if sys.version_info < (3, 11):
        raise RuntimeError("自动抠图需要 Python 3.11 或更新版本，也可在 python-path.txt 指定已有环境")
    python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.exists():
        print("首次运行：创建独立 Python 环境…", flush=True)
        subprocess.check_call([sys.executable, "-m", "venv", str(ROOT / ".venv")])
    probe = subprocess.run([str(python), "-c", "import rembg, onnxruntime, PIL"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if probe.returncode:
        print("首次运行：安装抠图依赖（需要联网，后续可离线运行）…", flush=True)
        subprocess.check_call([str(python), "-m", "pip", "install", "-r", str(ROOT / "requirements.txt"),
                               "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"])
    env = dict(os.environ, CANVASFLOW_MATTING_CHILD="1")
    raise SystemExit(subprocess.call([str(python), str(Path(__file__).resolve())], cwd=ROOT, env=env))


def register_gpu_dlls():
    """Reuse NVIDIA pip DLLs when an existing GPU environment is selected."""
    if os.name != "nt":
        return
    import ctypes
    try:
        import nvidia
        directories = sorted(Path(next(iter(nvidia.__path__))).glob("*/bin"))
    except (ImportError, StopIteration):
        directories = []
    cuda = os.environ.get("CUDA_PATH")
    if cuda:
        directories.append(Path(cuda) / "bin")
    handles = []
    for directory in directories:
        if not directory.is_dir():
            continue
        handles.append(os.add_dll_directory(str(directory)))
        for dll in sorted(directory.glob("*.dll")):
            try:
                ctypes.WinDLL(str(dll))
            except OSError:
                pass
    return handles


def main():
    for name in ("input", "output"):
        (ROOT / name).mkdir(exist_ok=True)
    files = sorted(p for p in (ROOT / "input").iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS)
    if not files:
        print("input/ 里没有图片：请放入图片，或在画布中连接图片后执行。", file=sys.stderr)
        return 1
    if not (ROOT / "models" / f"{MODEL}.onnx").is_file():
        print("缺少 models/birefnet-general.onnx，请解压完整的自动抠图拓展包。", file=sys.stderr)
        return 1
    # Keep all caches local; the bundled weight prevents rembg from downloading other models.
    os.environ["U2NET_HOME"] = str(ROOT / "models")
    os.environ["NUMBA_CACHE_DIR"] = str(ROOT / ".cache" / "numba")
    os.environ["PYTHONIOENCODING"] = "utf-8"
    ensure_runtime()
    handles = register_gpu_dlls()
    from PIL import Image, ImageChops, ImageOps
    import onnxruntime as ort
    from rembg import new_session, remove
    providers = ["CPUExecutionProvider"]
    if "CUDAExecutionProvider" in ort.get_available_providers():
        providers.insert(0, ("CUDAExecutionProvider", {"cudnn_conv_algo_search": "HEURISTIC",
                        "cudnn_conv_use_max_workspace": "0", "arena_extend_strategy": "kSameAsRequested"}))
    print(f"加载唯一模型 {MODEL}，共 {len(files)} 张图片…", flush=True)
    session = new_session(MODEL, providers=providers)
    print(f"推理后端：{session.inner_session.get_providers()}", flush=True)
    succeeded = 0
    for index, path in enumerate(files, 1):
        try:
            with Image.open(path) as image:
                original = ImageOps.exif_transpose(image).convert("RGBA")
            # Preserve existing alpha, including manual erasures in upstream images.
            result = remove(original.convert("RGB"), session=session).convert("RGBA")
            result.putalpha(ImageChops.multiply(result.getchannel("A"), original.getchannel("A")))
            output = ROOT / "output" / f"{index:03d}-{path.stem}-透明.png"
            result.save(output, "PNG")
            succeeded += 1
            print(f"[{index}/{len(files)}] 完成：{path.name}", flush=True)
        except Exception as error:
            print(f"[{index}/{len(files)}] 失败：{path.name}：{error}", file=sys.stderr, flush=True)
    print(f"完成 {succeeded}/{len(files)} 张，结果位于 output/", flush=True)
    return 0 if succeeded else 1


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"自动抠图失败：{error}", file=sys.stderr, flush=True)
        raise SystemExit(1)
