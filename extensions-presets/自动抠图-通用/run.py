# -*- coding: utf-8 -*-
"""Independent BiRefNet-general cutout tool. Input/output are relative to this file."""
import importlib.util
import os
from pathlib import Path
import shutil
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
    bootstrap_python = Path(sys.executable)
    if config.exists() and not os.environ.get("CANVASFLOW_MATTING_CHILD"):
        python = Path(config.read_text(encoding="utf-8-sig").strip())
        if python.is_file():
            bootstrap_python = python
        else:
            print("python-path.txt 指定的 Python 已不存在，改用当前系统 Python 创建独立环境。", flush=True)
    if runtime_ready():
        return
    if os.environ.get("CANVASFLOW_MATTING_CHILD"):
        raise RuntimeError("拓展独立环境缺少 rembg、onnxruntime 或 Pillow，请删除 .venv 后重试")
    version_text = subprocess.check_output([str(bootstrap_python), "-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"], text=True).strip()
    version = tuple(int(part) for part in version_text.split(".")[:2])
    if version < (3, 11) or version >= (3, 14):
        raise RuntimeError("自动抠图需要 Python 3.11–3.13；请在 python-path.txt 指定兼容的 python.exe")
    python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if python.exists():
        private_version = subprocess.check_output([str(python), "-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"], text=True).strip()
        if private_version != version_text:
            print(f"独立环境版本 {private_version} 与指定 Python {version_text} 不一致，正在重建…", flush=True)
            shutil.rmtree(ROOT / ".venv")
    if not python.exists():
        print("首次运行：创建独立 Python 环境…", flush=True)
        subprocess.check_call([str(bootstrap_python), "-m", "venv", str(ROOT / ".venv")])
    probe = subprocess.run([str(python), "-c", "import rembg, onnxruntime, PIL"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if probe.returncode:
        print("首次运行：安装抠图依赖（需要联网，后续可离线运行）…", flush=True)
        install = [str(python), "-m", "pip", "install", "-r", str(ROOT / "requirements.txt")]
        mirror = subprocess.run([*install, "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"])
        if mirror.returncode:
            print("镜像源缺少所需版本，改用官方 PyPI…", flush=True)
            subprocess.check_call([*install, "-i", "https://pypi.org/simple"])
    env = dict(os.environ, CANVASFLOW_MATTING_CHILD="1")
    raise SystemExit(subprocess.call([str(python), str(Path(__file__).resolve()), *sys.argv[1:]], cwd=ROOT, env=env))


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


def prepare_runtime():
    if not (ROOT / "models" / f"{MODEL}.onnx").is_file():
        raise RuntimeError("缺少 models/birefnet-general.onnx，请解压完整的自动抠图拓展包。")
    os.environ["U2NET_HOME"] = str(ROOT / "models")
    os.environ["NUMBA_CACHE_DIR"] = str(ROOT / ".cache" / "numba")
    os.environ["PYTHONIOENCODING"] = "utf-8"
    ensure_runtime()


def create_session():
    register_gpu_dlls()
    import onnxruntime as ort
    from rembg import new_session
    providers = ["CPUExecutionProvider"]
    if "CUDAExecutionProvider" in ort.get_available_providers():
        providers.insert(0, ("CUDAExecutionProvider", {"cudnn_conv_algo_search": "HEURISTIC",
                        "cudnn_conv_use_max_workspace": "0", "arena_extend_strategy": "kSameAsRequested"}))
    session = new_session(MODEL, providers=providers)
    print(f"推理后端：{session.inner_session.get_providers()}", flush=True)
    return session


def remove_background(image, session):
    from PIL import ImageChops
    from rembg import remove
    original = image.convert("RGBA")
    # alpha matting:蒙版过渡带交给 pymatting 精确重估。浅色主体(白纱/金发)的边缘
    # 低 alpha 白色像素叠深底会显白晕,单纯颜色去污染救不了,必须重估 alpha 本身。
    try:
        result = remove(original.convert("RGB"), session=session,
                        alpha_matting=True,
                        alpha_matting_foreground_threshold=240,
                        alpha_matting_background_threshold=10,
                        alpha_matting_erode_size=10).convert("RGBA")
    except Exception:
        # pymatting 求解失败(极端图)回退直出蒙版
        result = remove(original.convert("RGB"), session=session).convert("RGBA")
    result.putalpha(ImageChops.multiply(result.getchannel("A"), original.getchannel("A")))
    return result


def detect_background_color(image, border=3, color_tol=40):
    """检测纯色底背景色；边框颜色波动过大（照片/渐变底）返回 None，不做去污染。"""
    import numpy as np
    rgba = np.asarray(image)
    h, w = rgba.shape[:2]
    b = min(border, h // 4, w // 4)
    if b <= 0:
        return None
    border_pixels = np.concatenate([
        rgba[:b].reshape(-1, 4), rgba[-b:].reshape(-1, 4),
        rgba[:, :b].reshape(-1, 4), rgba[:, -b:].reshape(-1, 4),
    ])[:, :3]
    if float(np.std(border_pixels, axis=0).mean()) > color_tol:
        return None
    return np.median(border_pixels, axis=0)


def decontaminate_edges(image):
    """消除纯色底抠图的白边/底色晕。

    边缘半透明像素的 RGB 是「前景×a + 背景×(1-a)」的混色，alpha 半透明时直接叠到深色
    底上就显示为白边。按检测到的背景色做逆合成还原前景色：
        fg = (observed - bg×(1-a)) / a
    不透明像素数学上等于原值，a=0 像素不可见，均无副作用。非纯色底自动跳过。
    """
    import numpy as np
    from PIL import Image as PILImage
    bg = detect_background_color(image)
    if bg is None:
        return image, False
    rgba = np.asarray(image).astype(np.float64)
    alpha = rgba[..., 3:4] / 255.0
    safe_alpha = np.clip(alpha, 1e-4, 1.0)
    fg = (rgba[..., :3] - bg[None, None, :] * (1.0 - alpha)) / safe_alpha
    rgba[..., :3] = np.clip(fg, 0, 255)
    return PILImage.fromarray(rgba.astype("uint8"), "RGBA"), True


def main():
    for name in ("input", "output"):
        (ROOT / name).mkdir(exist_ok=True)
    files = sorted(p for p in (ROOT / "input").iterdir() if p.is_file() and p.suffix.lower() in EXTENSIONS)
    if not files:
        print("input/ 里没有图片：请放入图片，或在画布中连接图片后执行。", file=sys.stderr)
        return 1
    prepare_runtime()
    from PIL import Image, ImageOps
    print(f"加载唯一模型 {MODEL}，共 {len(files)} 张图片…", flush=True)
    session = create_session()
    succeeded = 0
    for index, path in enumerate(files, 1):
        try:
            with Image.open(path) as image:
                original = ImageOps.exif_transpose(image).convert("RGBA")
            # Preserve existing alpha, including manual erasures in upstream images.
            result = remove_background(original, session)
            result, decontaminated = decontaminate_edges(result)
            output = ROOT / "output" / f"{index:03d}-{path.stem}-透明.png"
            result.save(output, "PNG")
            succeeded += 1
            print(f"[{index}/{len(files)}] 完成：{path.name}" + ("（已去白边）" if decontaminated else "（非纯色底，跳过去白边）"), flush=True)
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
