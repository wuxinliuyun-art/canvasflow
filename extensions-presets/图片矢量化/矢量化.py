# -*- coding: utf-8 -*-
"""图片矢量化SVG拓展：压色 + 点彩保护 + vtracer 描线（最初版本）。

input/ 里每张图片 → output/ 按日期时间与序号命名的 .svg（落 CanvasFlow export）+ _preview .png（回画布预览）。
使用扁平插画配置，其他选项由 params.json 传入。
"""
import importlib.util
import json
import re
import tempfile
import xml.etree.ElementTree as ET
import subprocess
import sys
import time
from pathlib import Path

MAX_SIDE = 4096        # 描线前统一长边
DIST_THRESHOLD = 48    # 与调色板的最小色距，超过视为"离群色"
MAX_EXTRA = 8          # 点彩保护最多补进调色板的颜色数


def ensure_deps():
    missing = []
    for mod, pkg in (("PIL", "pillow"), ("numpy", "numpy"), ("vtracer", "vtracer")):
        try:
            __import__(mod)
        except ModuleNotFoundError:
            missing.append(pkg)
    if missing:
        print("正在安装依赖：" + "、".join(missing))
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", *missing,
                                   "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"])
        except subprocess.CalledProcessError:
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])
            except subprocess.CalledProcessError:
                print("依赖安装失败：请手动执行 pip install " + " ".join(missing) + " 后重试")
                sys.exit(1)


ensure_deps()
import numpy as np  # noqa: E402
from PIL import Image, ImageFilter  # noqa: E402
import vtracer  # noqa: E402

ILLUSTRATION_SETTINGS = {
    "filter_speckle": 4,
    "layer_difference": 16,
    "corner_threshold": 60,
    "length_threshold": 6.0,
}


def load_rgb(path, max_side):
    with Image.open(path) as im:
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        im = bg.convert("RGB")
        w, h = im.size
        scale = max(w, h) / max_side
        if scale > 1:
            im = im.resize((max(1, round(w / scale)), max(1, round(h / scale))), Image.LANCZOS)
        return im.copy()


def quantize_palette(im, n):
    q = im.quantize(colors=n, method=Image.MEDIANCUT)
    pal = np.array(q.getpalette()[: n * 3], dtype=np.float64).reshape(-1, 3)
    return q, pal


def flat_illustration_palette(im, max_colors):
    """Recognize artwork whose pixels are concentrated in a few solid colors."""
    pixels = np.asarray(im, dtype=np.uint8)[::2, ::2].reshape(-1, 3)
    bins = (pixels >> 4).astype(np.int32) @ np.array([256, 16, 1], dtype=np.int32)
    counts = np.bincount(bins, minlength=4096)
    dominant = np.flatnonzero(counts >= max(1, pixels.shape[0] * 0.0015))
    if counts[dominant].sum() < pixels.shape[0] * 0.96:
        return None

    palette = []
    for index in dominant[np.argsort(-counts[dominant])]:
        color = pixels[bins == index].mean(axis=0)
        if all(np.linalg.norm(color - existing) > 32 for existing in palette):
            palette.append(color)
            if len(palette) > max_colors:
                return None
    return np.array(palette) if len(palette) >= 2 else None


def nearest_assign(flat, palf):
    """每个像素取最近调色板色（分块 + 点积距离，避免大图内存爆）。"""
    pp = (flat * flat).sum(axis=1)
    qq = (palf * palf).sum(axis=1)
    out = np.empty(flat.shape[0], dtype=np.int32)
    chunk = 250000
    for s in range(0, flat.shape[0], chunk):
        block = flat[s:s + chunk]
        d = pp[s:s + chunk, None] - 2 * (block @ palf.T) + qq[None, :]
        out[s:s + chunk] = d.argmin(axis=1)
    return out


def rescue_colors(flat, pal, min_spots):
    """点彩保护：找离调色板都远、数量达阈值的离群色补进调色板。"""
    if min_spots <= 0 or pal.shape[0] >= 72:
        return pal
    palf = pal.astype(np.float32)
    pp = (flat * flat).sum(axis=1)
    qq = (palf * palf).sum(axis=1)
    far_mask = np.zeros(flat.shape[0], dtype=bool)
    chunk = 250000
    for s in range(0, flat.shape[0], chunk):
        block = flat[s:s + chunk]
        d = pp[s:s + chunk, None] - 2 * (block @ palf.T) + qq[None, :]
        far_mask[s:s + chunk] = d.min(axis=1) > DIST_THRESHOLD ** 2
    if not far_mask.any():
        return pal
    far = flat[far_mask]
    # 按 24 步长粗聚类，取数量达阈值的簇（一簇≈一种颜色）
    keys = (far // 24).astype(np.int32)
    uniq, counts = np.unique(keys, axis=0, return_counts=True)
    order = np.argsort(-counts)
    added = []
    taken = np.zeros(far.shape[0], dtype=bool)
    for idx in order:
        if counts[idx] < min_spots or len(added) >= MAX_EXTRA:
            break
        key = uniq[idx]
        sel = ~taken & np.all(keys == key, axis=1)
        if int(sel.sum()) < min_spots:
            continue
        color = far[sel].mean(axis=0)
        # 与已有调色板色距太近的不补
        if float(np.min(((palf - color) ** 2).sum(axis=1))) > 32 ** 2:
            added.append(color)
        taken |= sel
    if not added:
        return pal
    print(f"点彩保护：补进 {len(added)} 个离群色")
    return np.vstack([pal, np.array(added, dtype=np.float64)])


def merge_rare_near_colors(assign, palette, max_share, max_distance):
    counts = np.bincount(assign, minlength=len(palette))
    mapping = np.arange(len(palette))
    for index in np.flatnonzero((counts > 0) & (counts <= assign.size * max_share)):
        distances = np.sum((palette - palette[index]) ** 2, axis=1)
        candidates = np.flatnonzero((counts >= counts[index] * 8) & (distances <= max_distance ** 2))
        if candidates.size:
            mapping[index] = candidates[distances[candidates].argmin()]
    return mapping[assign]


def reconstruct_vertical_panels(labels, palette_size):
    """Infer continuous vertical panels from the dominant color in each column."""
    height, width = labels.shape
    background = labels[0, 0]
    foreground = labels != background
    left = foreground.argmax(axis=1)
    right = width - foreground[:, ::-1].argmax(axis=1)
    columns = np.arange(width)
    inside = foreground.any(axis=1)[:, None] & (columns >= left[:, None]) & (columns < right[:, None])
    counts = np.array([np.count_nonzero(inside & (labels == color), axis=0)
                       for color in range(palette_size)])
    dominant = counts.argmax(axis=0)
    supported = counts.max(axis=0) >= np.maximum(height * 0.25, inside.sum(axis=0) * 0.55)
    dominant[~supported] = -1
    splits = np.r_[0, np.flatnonzero(np.diff(dominant)) + 1, width]
    panels = [(start, end, dominant[start]) for start, end in zip(splits[:-1], splits[1:])
              if end - start >= width * 0.08 and dominant[start] >= 0]
    if len({color for _, _, color in panels}) < 2:
        return None

    base = np.full(labels.shape, -1, dtype=np.int32)
    rows = np.arange(height)[:, None]
    for start, end, color in panels:
        matching = inside[:, start:end] & (labels[:, start:end] == color)
        top = matching.argmax(axis=0)
        bottom = height - matching[::-1].argmax(axis=0)
        # Complete the spans behind foreground artwork, within the observed silhouette.
        region = inside[:, start:end] & (rows >= top) & (rows < bottom)
        base[:, start:end][region] = color
    return base


def fit_short_curve_run(start, segments, tolerance):
    """Fit a cubic to a short run, keeping its endpoints and bounding sample error."""
    samples = [start]
    t = np.linspace(0, 1, 5)[1:, None]
    for c1, c2, end in segments:
        origin = samples[-1]
        samples.extend((1 - t) ** 3 * origin + 3 * (1 - t) ** 2 * t * c1
                       + 3 * (1 - t) * t ** 2 * c2 + t ** 3 * end)
    points = np.asarray(samples)
    distance = np.r_[0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
    if distance[-1] < 12 or np.linalg.norm(points[-1] - start) < 0.8 * distance[-1]:
        return None
    t = (distance / distance[-1])[:, None]
    basis = np.hstack((3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2))
    ends = (1 - t) ** 3 * start + t ** 3 * points[-1]
    controls = np.linalg.lstsq(basis, points - ends, rcond=None)[0]
    if np.linalg.norm(basis @ controls + ends - points, axis=1).max() <= tolerance:
        return np.vstack((controls, points[-1]))
    return None


def straighten_path(data, tolerance, smooth_curves=False):
    commands = re.findall(r"([MLCZ])([^MLCZ]*)", data)
    if not commands or "".join(command + values for command, values in commands) != data:
        return data
    parsed = []
    for command, values in commands:
        try:
            numbers = list(map(float, values.replace(",", " ").split()))
        except ValueError:
            return data
        if len(numbers) != {"M": 2, "L": 2, "C": 6, "Z": 0}[command]:
            return data
        parsed.append(np.array(numbers).reshape(-1, 2))

    if smooth_curves:
        for index in range(len(commands) - 1):
            if commands[index][0] != "C" or commands[index + 1][0] != "C":
                continue
            left, right = parsed[index:index + 2]
            joint = left[2]
            incoming, outgoing = joint - left[1], right[0] - joint
            lengths = np.linalg.norm([incoming, outgoing], axis=1)
            if lengths.min() < 1:
                continue
            incoming, outgoing = incoming / lengths[0], outgoing / lengths[1]
            if incoming @ outgoing < 0.90:
                continue
            tangent = incoming + outgoing
            tangent /= np.linalg.norm(tangent)
            before, after = joint - tangent * lengths[0], joint + tangent * lengths[1]
            if max(np.linalg.norm(before - left[1]), np.linalg.norm(after - right[0])) <= tolerance:
                left[1], right[0] = before, after
                for part in (index, index + 1):
                    commands[part] = ("C", " ".join(f"{value:.12g}" for value in parsed[part].flat) + " ")

    result = []
    start = None
    index = 0
    while index < len(commands):
        command, values = commands[index]
        if command == "M":
            start = parsed[index][-1]
        elif command == "Z":
            start = None
        elif start is not None:
            points = []
            best = index - 1
            for end in range(index, min(index + 24, len(commands))):
                if commands[end][0] not in ("L", "C"):
                    break
                points.extend(parsed[end])
                delta = points[-1] - start
                length = np.linalg.norm(delta)
                if length < 24:
                    continue
                offsets = np.asarray(points) - start
                projection = offsets @ (delta / length)
                deviation = np.abs(offsets[:, 0] * delta[1] - offsets[:, 1] * delta[0]) / length
                if deviation.max() <= tolerance and np.all(np.diff(np.r_[0, projection]) >= 0):
                    best = end
            if best >= index and (best > index or command == "C"):
                start = parsed[best][-1]
                result.append(f"L{start[0]:.12g} {start[1]:.12g} ")
                index = best + 1
                continue
            if smooth_curves and command == "C":
                end = index
                previous = start
                while end < min(index + 6, len(commands)) and commands[end][0] == "C":
                    endpoint = parsed[end][-1]
                    if np.linalg.norm(endpoint - previous) > 16:
                        break
                    previous = endpoint
                    end += 1
                for stop in range(end, index + 2, -1):
                    curve = fit_short_curve_run(start, parsed[index:stop], tolerance)
                    if curve is not None:
                        result.append("C" + " ".join(f"{value:.12g}" for value in curve.flat) + " ")
                        start = curve[-1]
                        index = stop
                        break
                else:
                    curve = None
                if curve is not None:
                    continue
            start = parsed[index][-1]
        result.append(command + values)
        index += 1
    return "".join(result)


def vectorize(im, pal, out_svg, settings):
    if settings.get("binary_lineart"):
        ink = im.convert("L").point(lambda value: 0 if value < 145 else 255)
        with tempfile.TemporaryDirectory(dir=out_svg.parent) as temp:
            mask = Path(temp) / "ink.png"
            ink.save(mask)
            vtracer.convert_image_to_svg_py(str(mask), str(out_svg), colormode="binary",
                                            mode="spline", filter_speckle=0, length_threshold=3.0)
        svg = out_svg.read_text(encoding="utf-8")
        svg = re.sub(r"(<svg\b[^>]*>)", r'\1\n<rect width="100%" height="100%" fill="#FFFFFF"/>', svg, count=1)
        out_svg.write_text(svg, encoding="utf-8")
        return ink.convert("RGB")
    if settings.get("smooth_outline"):
        im = im.filter(ImageFilter.MedianFilter(size=settings.get("median_size", 5)))
    arr = np.asarray(im, dtype=np.uint8)
    palf = pal.astype(np.float32)
    assign = nearest_assign(arr.reshape(-1, 3).astype(np.float32), palf)
    if settings.get("near_color_merge"):
        assign = merge_rare_near_colors(assign, palf, *settings["near_color_merge"])
    quant = Image.fromarray(palf[assign].reshape(arr.shape).astype(np.uint8))
    def trace(image, tmp, target):
        image.save(tmp)
        vtracer.convert_image_to_svg_py(
            str(tmp), str(target),
            colormode="color", hierarchical="cutout", mode="spline",
            filter_speckle=settings["filter_speckle"],
            color_precision=8,
            layer_difference=settings["layer_difference"],
            corner_threshold=settings["corner_threshold"],
            length_threshold=settings["length_threshold"],
            splice_threshold=45,
        )

    base = reconstruct_vertical_panels(assign.reshape(arr.shape[:2]), len(pal)) if settings.get("editable_layers") else None
    with tempfile.TemporaryDirectory(dir=out_svg.parent) as temp:
        tmp = Path(temp) / "trace.png"
        if base is None:
            trace(quant, tmp, out_svg)
        else:
            rgb = np.asarray(quant)
            underlay = Image.fromarray(palf[np.maximum(base, 0)].astype(np.uint8)).convert("RGBA")
            underlay.putalpha(Image.fromarray(np.where(base >= 0, 255, 0).astype(np.uint8)))
            overlay = Image.fromarray(rgb).convert("RGBA")
            overlay.putalpha(Image.fromarray(np.where(base == assign.reshape(base.shape), 0, 255).astype(np.uint8)))
            base_svg = Path(temp) / "base.svg"
            trace(underlay, tmp, base_svg)
            trace(overlay, tmp, out_svg)
            svg = ET.parse(out_svg)
            root = svg.getroot()
            root[:0] = list(ET.parse(base_svg).getroot())
            ET.register_namespace("", "http://www.w3.org/2000/svg")
            svg.write(out_svg, encoding="utf-8", xml_declaration=True)
    if settings.get("smooth_outline"):
        svg = out_svg.read_text(encoding="utf-8")
        tolerance = settings.get("straight_tolerance", 1.25)
        svg = re.sub(r'(<path\b[^>]*?\sd=")([^"]+)"',
                     lambda match: match[1] + straighten_path(match[2], tolerance, settings.get("smooth_curves")) + '"', svg)
        out_svg.write_text(svg, encoding="utf-8")
    return quant


def load_upscaled_rgb(src):
    with Image.open(src) as source:
        already_large = max(source.size) >= MAX_SIDE
    if already_large:
        return load_rgb(src, MAX_SIDE)

    shared = Path(__file__).resolve().parent.parent / "图片放大白场"
    if not shared.is_dir():
        shared = shared.with_name("高清放大")
    worker = shared / "放大Worker.py"
    if not worker.is_file():
        image = load_rgb(src, MAX_SIDE)
        scale = MAX_SIDE / max(image.size)
        size = tuple(max(1, round(side * scale)) for side in image.size)
        return image.resize(size, Image.Resampling.LANCZOS)
    spec = importlib.util.spec_from_file_location("canvasflow_upscale_worker", worker)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    pipeline = module.load_pipeline()
    with tempfile.TemporaryDirectory(prefix="_vector_", dir=shared) as temp:
        _, output, error = pipeline.upscale_files(
            [src], "realesrgan-x4plus-anime", 4, Path(temp)
        )[0]
        if error:
            raise RuntimeError(error)
        image = load_rgb(output, MAX_SIDE)
        scale = MAX_SIDE / max(image.size)
        if scale > 1:
            size = tuple(max(1, round(side * scale)) for side in image.size)
            image = image.resize(size, Image.LANCZOS)
        return image


def main():
    cwd = Path.cwd()
    input_dir, output_dir = cwd / "input", cwd / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    files = []
    if input_dir.is_dir():
        files = sorted(p for p in input_dir.iterdir()
                       if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".bmp"})
    if not files:
        print("input 文件夹中没有图片")
        sys.exit(1)

    params = {}
    if (cwd / "params.json").is_file():
        try:
            params = json.loads((cwd / "params.json").read_text(encoding="utf-8"))
        except Exception:
            params = {}
    colors, min_spots = 12, 321
    settings = ILLUSTRATION_SETTINGS
    if params.get("editableLayers") is True:
        settings = {**settings, "editable_layers": True}
    preserve_detail = params.get("fitStrength") == "保留细节"
    if preserve_detail:
        settings = {**settings, "filter_speckle": 0, "layer_difference": 0,
                    "length_threshold": min(settings["length_threshold"], 3.0)}
    elif params.get("fitOutline") is True:
        multiplier, tolerance = (2.0, 2.0) if params.get("fitStrength") == "更平滑" else (1.5, 1.25)
        settings = {**settings, "smooth_outline": True, "straight_tolerance": tolerance,
                    "smooth_curves": params.get("fitStrength") == "更平滑",
                    "length_threshold": settings["length_threshold"] * multiplier}
    merge_mode = params.get("mergeStrength", "随拟合")
    merge_limits = {"轻度": (0.005, 32), "加强": (0.02, 48)}.get(merge_mode)
    if merge_mode == "随拟合" and settings.get("smooth_outline"):
        merge_limits = (0.005, 32)
    if merge_limits:
        settings = {**settings, "near_color_merge": merge_limits}
    print(f"参数：压色 {colors} · 点彩保护 {min_spots}px · 扁平插画")

    stamp = time.strftime("%y%m%d-%H%M")
    for i, src in enumerate(files, start=1):
        stem = f"{stamp}-{i}"
        t0 = time.time()
        im = load_upscaled_rgb(src)
        pal = flat_illustration_palette(im, colors) if not preserve_detail else None
        trace_settings = settings
        if preserve_detail:
            sample = np.asarray(im)[::4, ::4]
            if np.max(np.ptp(sample, axis=2)) <= 16 and np.mean(sample.min(axis=2) >= 235) >= 0.9:
                trace_settings = {**settings, "binary_lineart": True}
                pal = np.array([[0, 0, 0], [255, 255, 255]])
        if pal is not None and settings.get("smooth_outline"):
            trace_settings = {**settings, "corner_threshold": 75, "median_size": 3}
        if pal is None:
            _, pal = quantize_palette(im, colors)
            pal = rescue_colors(np.asarray(im, dtype=np.uint8).reshape(-1, 3).astype(np.float32), pal, min_spots)
        out_svg = output_dir / f"{stem}.svg"
        quant = vectorize(im, pal, out_svg, trace_settings)
        out_png = output_dir / f"{stem}_preview.png"
        quant.save(out_png)
        kb = out_svg.stat().st_size // 1024
        print(f"已矢量化 {src.name} → {out_svg.name}（{kb} KB，调色板 {pal.shape[0]} 色，{time.time() - t0:.1f}s）")


if __name__ == "__main__":
    main()
