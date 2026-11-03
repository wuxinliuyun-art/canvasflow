from __future__ import annotations

import base64
import io
import logging
import queue
import re
import shutil
import subprocess
import tempfile
import threading
import tkinter as tk
from collections import Counter
from pathlib import Path
from tkinter import messagebox, ttk

from PIL import Image, ImageOps, ImageTk

APP_DIR = Path(__file__).resolve().parent
INPUT_DIR = APP_DIR / "input"
OUTPUT_DIR = APP_DIR / "output"
UPSCALE_TMP = APP_DIR / "_upscale_tmp"
EXE = APP_DIR / "realesrgan-ncnn-vulkan.exe"
LOG_FILE = APP_DIR / "处理日志.log"
SUPPORTED = {".jpg", ".jpeg", ".png", ".webp"}

MODELS = [
    ("照片 x4", "realesrgan-x4plus", 4),
    ("动漫/插图 x4", "realesrgan-x4plus-anime", 4),
    ("动漫视频 x2", "realesr-animevideov3-x2", 2),
    ("动漫视频 x3", "realesr-animevideov3-x3", 3),
    ("动漫视频 x4", "realesr-animevideov3-x4", 4),
]

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    encoding="utf-8",
)


def source_images() -> list[Path]:
    """Only return images directly inside input/ (never recurse)."""
    return sorted(
        (p for p in INPUT_DIR.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED),
        key=lambda p: p.name.lower(),
    ) if INPUT_DIR.is_dir() else []


# ---------------------------------------------------------------------------
# 白场矫正
# ---------------------------------------------------------------------------

def estimate_white_point(image: Image.Image) -> tuple[int, int, int]:
    """Estimate the dominant flat background color from bright, low-chroma border pixels.

    Uses the mode (most common color) instead of the brightest pixels' median:
    the median lands on 255 whenever even a few border pixels are pure white,
    which makes the whole correction a no-op while the real background sits a
    few levels lower (e.g. 254) with gray anti-aliasing fog around the lines.
    """
    rgb = image.convert("RGB")
    rgb.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    width, height = rgb.size
    band = max(2, min(width, height) // 20)
    counts: Counter[tuple[int, int, int]] = Counter()
    for y in range(height):
        for x in range(width):
            if x < band or x >= width - band or y < band or y >= height - band:
                r, g, b = rgb.getpixel((x, y))
                brightness = (r + g + b) / 3
                chroma = max(r, g, b) - min(r, g, b)
                if brightness >= 150 and chroma <= 65:
                    counts[(r, g, b)] += 1

    if not counts:
        raise ValueError("未能在图片边缘找到足够明亮的背景。")

    return counts.most_common(1)[0][0]


def effective_white_point(white: tuple[int, int, int], strength: int) -> tuple[int, int, int]:
    """Background color -> LUT white point; pushes a few levels below the
    background so the gray anti-aliasing fog around lines goes white too."""
    factor = max(0.0, min(1.5, strength / 100.0))
    allowance = round(5 * factor)
    return tuple(max(1, value - allowance) for value in white)


def apply_white_point(rgb: Image.Image, effective: tuple[int, int, int]) -> Image.Image:
    channels = []
    for channel, point in zip(rgb.split(), effective):
        table = [min(255, round(value * 255.0 / point)) for value in range(256)]
        channels.append(channel.point(table))
    return Image.merge("RGB", channels)


def correct_white_point(
    image: Image.Image, strength: int, cached_white: tuple[int, int, int] | None = None
) -> tuple[Image.Image, tuple[int, int, int], tuple[int, int, int]]:
    original_mode = image.mode
    alpha = image.getchannel("A") if "A" in image.getbands() else None
    rgb = image.convert("RGB")
    white = cached_white if cached_white is not None else estimate_white_point(rgb)
    effective = effective_white_point(white, strength)
    result = apply_white_point(rgb, effective)
    if alpha is not None:
        result.putalpha(alpha)
    elif original_mode == "L":
        result = result.convert("L")
    return result, white, effective


def save_result(image: Image.Image, source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    suffix = source.suffix.lower()
    options = {}
    if suffix in {".jpg", ".jpeg"}:
        if image.mode not in {"RGB", "L"}:
            image = image.convert("RGB")
        options = {"quality": 95, "subsampling": 0, "optimize": True}
    elif suffix == ".png":
        options = {"optimize": True}
    elif suffix == ".webp":
        options = {"quality": 95, "method": 6}
    image.save(destination, **options)


# ---------------------------------------------------------------------------
# 处理管线（供 UI 和测试共用）
# ---------------------------------------------------------------------------

def upscale_files(
    files: list[Path],
    model: str,
    scale: int,
    tmp_dir: Path,
    progress_cb=None,
    cancel_event: threading.Event | None = None,
) -> list[tuple[Path, Path | None, str | None]]:
    """Upscale files one by one into tmp_dir as <序号>.png.

    文件夹模式的输出命名规则不可靠（输入名 + ".png"，且 jpg/png 行为不一致），
    所以逐文件显式指定 -o；中文文件名先拷贝成 ASCII 序号名，避开 exe 的编码问题。
    Returns [(original_path, upscaled_path_or_None, error_or_None), ...]
    """
    tmp_dir.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix="_staging_", dir=APP_DIR))
    results: list[tuple[Path, Path | None, str | None]] = []
    total = max(1, len(files))
    try:
        for index, path in enumerate(files):
            if cancel_event is not None and cancel_event.is_set():
                results.extend((p, None, "已取消") for p in files[index:])
                break
            staged = staging / f"{index:04d}{path.suffix.lower()}"
            shutil.copy2(path, staged)
            upscaled = tmp_dir / f"{index:04d}.png"
            proc = subprocess.Popen(
                [str(EXE), "-i", f"{staging.name}/{staged.name}", "-o", f"{tmp_dir.name}/{upscaled.name}",
                 "-n", model, "-s", str(scale), "-f", "png"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                errors="replace",
                cwd=str(APP_DIR),
            )
            tail: list[str] = []
            assert proc.stdout is not None
            for line in proc.stdout:
                line = line.strip()
                if not line:
                    continue
                tail.append(line)
                if len(tail) > 8:
                    tail.pop(0)
                if cancel_event is not None and cancel_event.is_set():
                    proc.terminate()
                    break
                if progress_cb is not None:
                    match = re.search(r"(\d+(?:\.\d+)?)\s*%", line)
                    if match:
                        overall = (index + min(100.0, float(match.group(1))) / 100.0) / total * 100.0
                        progress_cb(overall, f"{path.name} {float(match.group(1)):.0f}%")
            returncode = proc.wait()
            if cancel_event is not None and cancel_event.is_set():
                results.extend((p, None, "已取消") for p in files[index:])
                break
            if returncode != 0 or not upscaled.is_file():
                detail = "\n".join(tail[-4:])
                results.append((path, None, f"放大失败（退出码 {returncode}）{detail}"))
            else:
                results.append((path, upscaled, None))
            staged.unlink(missing_ok=True)
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    return results


def finish_file(
    upscaled: Path, source: Path, output_dir: Path, correct: bool, strength: int
) -> Path:
    """Post-process one upscaled file into output_dir, returns the written path."""
    if not correct:
        target = output_dir / (source.stem + ".png")
        output_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(upscaled, target)
        return target
    with Image.open(upscaled) as opened:
        image = ImageOps.exif_transpose(opened)
        result, _white, _effective = correct_white_point(image, strength)
    save_result(result, source, output_dir / source.name)
    return output_dir / source.name


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("图片放大 + 白场矫正")
        self.geometry("980x760")
        self.minsize(820, 620)
        self.files: list[Path] = []
        self.preview_photo = None
        self._orig_base = None
        self._region_name = None
        self._canvas_size = (0, 0)
        self.events: queue.Queue = queue.Queue()
        self.running = False
        self.cancel_event = threading.Event()
        self._white_cache: dict[str, tuple[int, int, int]] = {}
        self._preview_job = None
        self._build_ui()
        self.refresh_files()
        self.after(100, self._poll_events)

    def _build_ui(self) -> None:
        top = ttk.Frame(self, padding=12)
        top.pack(fill="x")
        ttk.Label(top, text=f"生效文件夹：{INPUT_DIR}").pack(anchor="w")
        ttk.Label(top, text="把图片放进 input 文件夹；结果输出到 output 文件夹（原图不会被覆盖）").pack(
            anchor="w", pady=(4, 0)
        )

        settings = ttk.LabelFrame(self, text="参数", padding=(12, 6, 12, 8))
        settings.pack(fill="x", padx=12, pady=(8, 0))

        ttk.Label(settings, text="放大模型").grid(row=0, column=0, sticky="w")
        self.model_box = ttk.Combobox(settings, state="readonly", width=16, values=[m[0] for m in MODELS])
        self.model_box.current(
            next(i for i, m in enumerate(MODELS) if m[1] == "realesrgan-x4plus-anime")
        )
        self.model_box.grid(row=0, column=1, sticky="w", padx=(6, 24))

        self.correct_var = tk.BooleanVar(value=True)
        self.correct_check = ttk.Checkbutton(
            settings, text="白场矫正（背景推成纯白并清除灰雾）", variable=self.correct_var,
            command=self._correct_toggled,
        )
        self.correct_check.grid(row=0, column=2, sticky="w")

        ttk.Label(settings, text="矫正强度").grid(row=1, column=0, sticky="w", pady=(6, 0))
        self.strength = tk.IntVar(value=100)
        self.strength_scale = ttk.Scale(
            settings, from_=0, to=150, variable=self.strength, command=self._strength_changed
        )
        self.strength_scale.grid(row=1, column=1, sticky="we", padx=(6, 24), pady=(6, 0))
        self.strength_label = ttk.Label(settings, text="100%", width=6)
        self.strength_label.grid(row=1, column=2, sticky="w", pady=(6, 0))
        settings.columnconfigure(1, weight=1)

        self.clear_input_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            settings,
            text="处理完成后清除 input 中的原图（只删成功处理的，失败的保留）",
            variable=self.clear_input_var,
        ).grid(row=2, column=0, columnspan=3, sticky="w", pady=(6, 0))

        # 执行行：紧跟参数区，进度条 + 状态 + 开始/停止
        action = ttk.Frame(self, padding=(12, 10, 12, 0))
        action.pack(fill="x")
        self.progress = ttk.Progressbar(action, mode="determinate")
        self.progress.pack(fill="x")
        action_row = ttk.Frame(action)
        action_row.pack(fill="x", pady=(8, 0))
        self.status = ttk.Label(action_row, text="就绪")
        self.status.pack(side="left")
        self.start_button = ttk.Button(action_row, text="开始批量处理", command=self.start_batch)
        self.start_button.pack(side="right")
        self.stop_button = ttk.Button(action_row, text="停止", command=self.stop_batch, state="disabled")
        self.stop_button.pack(side="right", padx=8)

        controls = ttk.Frame(self, padding=(12, 8, 12, 0))
        controls.pack(fill="x")
        ttk.Label(controls, text="拖动滑杆对比：左侧 = 矫正后（贴纯白底），右侧 = 原图").pack(side="left")
        ttk.Button(controls, text="刷新图片", command=self.refresh_files).pack(side="right")
        ttk.Button(controls, text="预览", command=self.preview_selected).pack(side="right", padx=(0, 8))

        body = ttk.Panedwindow(self, orient="horizontal")
        body.pack(fill="both", expand=True, padx=12, pady=8)
        left = ttk.Frame(body)
        right = ttk.Frame(body)
        body.add(left, weight=1)
        body.add(right, weight=3)

        self.listbox = tk.Listbox(left, exportselection=False)
        self.listbox.pack(fill="both", expand=True)
        self.listbox.bind("<<ListboxSelect>>", lambda _event: self.preview_selected())

        split_row = ttk.Frame(right)
        split_row.pack(fill="x", pady=(0, 4))
        ttk.Label(split_row, text="矫正后 ◀").pack(side="left")
        self.split_var = tk.DoubleVar(value=0.5)
        self.split_scale = ttk.Scale(
            split_row, from_=0.0, to=1.0, variable=self.split_var, command=self._split_changed
        )
        self.split_scale.pack(side="left", fill="x", expand=True, padx=6)
        ttk.Label(split_row, text="▶ 原图").pack(side="right")

        self.canvas = tk.Canvas(right, highlightthickness=0, background="#f0f0f0")
        self.canvas.pack(fill="both", expand=True)
        self.canvas.bind("<Button-1>", self._canvas_split_drag)
        self.canvas.bind("<B1-Motion>", self._canvas_split_drag)
        self.info_label = ttk.Label(right, text="", anchor="center")
        self.info_label.pack(fill="x", pady=4)

    def _correct_toggled(self) -> None:
        self.strength_scale.configure(state="disabled" if not self.correct_var.get() else "normal")
        self.preview_selected()

    def _strength_changed(self, _value=None) -> None:
        self.strength_label.config(text=f"{self.strength.get()}%")
        if self._preview_job is not None:
            self.after_cancel(self._preview_job)
        self._preview_job = self.after(180, self._debounced_preview)

    def _debounced_preview(self) -> None:
        self._preview_job = None
        self.preview_selected()

    def refresh_files(self) -> None:
        self.files = source_images()
        self.listbox.delete(0, "end")
        for path in self.files:
            self.listbox.insert("end", path.name)
        if self.files:
            self.listbox.selection_set(0)
            self.preview_selected()
        self.status.config(text=f"发现 {len(self.files)} 张图片")

    def _cached_white(self, path: Path, image: Image.Image) -> tuple[int, int, int]:
        key = f"{path}|{path.stat().st_mtime_ns}"
        if key not in self._white_cache:
            self._white_cache[key] = estimate_white_point(image)
            if len(self._white_cache) > 30:
                self._white_cache.pop(next(iter(self._white_cache)))
        return self._white_cache[key]

    def preview_selected(self) -> None:
        if self.running:
            return
        selection = self.listbox.curselection()
        if not selection:
            return
        path = self.files[selection[0]]
        try:
            with Image.open(path) as opened:
                image = ImageOps.exif_transpose(opened)
                rgb = image.convert("RGB")
                if self.correct_var.get():
                    white = self._cached_white(path, image)
                    effective = effective_white_point(white, self.strength.get())
                    processed = apply_white_point(rgb, effective)
                    note = f"背景色 {white} → 白点 {effective}"
                else:
                    processed = rgb.copy()
                    note = "未勾选白场矫正，左右两侧相同"
        except Exception as exc:
            logging.exception("Preview failed: %s", path)
            messagebox.showerror("预览失败", f"无法预览 {path.name}\n{exc}")
            return

        processed.thumbnail((440, 300), Image.Resampling.LANCZOS)
        orig_small = rgb.resize(processed.size, Image.Resampling.LANCZOS)
        # 左右两半共用同一几何：都贴到带留白的纯白画布上，矫到位则无缝
        margin_x = max(50, processed.width // 3)
        margin_y = max(40, processed.height // 3)
        W, H = processed.width + margin_x * 2, processed.height + margin_y * 2
        if W > 700:
            margin_x = max(20, (700 - processed.width) // 2)
            W = processed.width + margin_x * 2
        if H > 500:
            margin_y = max(16, (500 - processed.height) // 2)
            H = processed.height + margin_y * 2

        def on_white(img: Image.Image) -> Image.Image:
            canvas = Image.new("RGB", (W, H), (255, 255, 255))
            canvas.paste(img, (margin_x, margin_y))
            return canvas

        proc_canvas = on_white(processed)
        orig_canvas = on_white(orig_small)

        self.preview_photo = ImageTk.PhotoImage(proc_canvas)
        buf = io.BytesIO()
        orig_canvas.save(buf, format="PNG")
        self._orig_base = tk.PhotoImage(data=base64.b64encode(buf.getvalue()).decode("ascii"))
        self._canvas_size = (W, H)
        self.canvas.configure(width=W, height=H)
        self._apply_split()
        self.info_label.config(text=note + "　｜　白底上无缝 = 矫正到位")

    def _split_changed(self, _value=None) -> None:
        self._apply_split()

    def _canvas_split_drag(self, event) -> None:
        W = self._canvas_size[0]
        if not W:
            return
        self.split_var.set(min(1.0, max(0.0, event.x / W)))
        self._apply_split()

    def _apply_split(self) -> None:
        """左半显示矫正后（贴白底），右半显示原图；滑杆位置即分界线。"""
        if self.preview_photo is None or self._orig_base is None:
            return
        W, H = self._canvas_size
        sx = int(round(self.split_var.get() * W))
        tkc = self.canvas.tk
        if self._region_name is not None:
            try:
                tkc.call("image", "delete", self._region_name)
            except tk.TclError:
                pass
            self._region_name = None
        self.canvas.delete("all")
        self.canvas.create_image(0, 0, image=self.preview_photo, anchor="nw")
        if 0 < sx < W:
            region = tkc.call("image", "create", "photo", "-width", W - sx, "-height", H)
            tkc.call(region, "copy", str(self._orig_base), "-from", sx, 0, W, H)
            self._region_name = region
            self.canvas.create_image(sx, 0, image=region, anchor="nw")
        self.canvas.create_line(sx, 0, sx, H, fill="#e0443a", width=2)
        self.canvas.create_text(8, 6, text="◀ 矫正后", anchor="nw", fill="#8a8a8a")
        self.canvas.create_text(W - 8, 6, text="原图 ▶", anchor="ne", fill="#8a8a8a")

    def start_batch(self) -> None:
        if self.running:
            return
        if not EXE.is_file():
            messagebox.showerror("缺少程序", f"未找到 {EXE.name}，请确认它在脚本同目录。")
            return
        self.files = source_images()
        if not self.files:
            messagebox.showinfo("没有图片", "input 文件夹中没有 JPG / PNG / WEBP 图片。")
            return
        self.running = True
        self.cancel_event.clear()
        self.progress.configure(maximum=100 + len(self.files), value=0)
        self.start_button.config(state="disabled")
        self.stop_button.config(state="normal")
        model, scale = MODELS[self.model_box.current()][1], MODELS[self.model_box.current()][2]
        strength = self.strength.get()
        correct = self.correct_var.get()
        clear_input = self.clear_input_var.get()
        threading.Thread(
            target=self._batch_worker,
            args=(self.files.copy(), model, scale, correct, strength, clear_input),
            daemon=True,
        ).start()

    def stop_batch(self) -> None:
        self.cancel_event.set()
        self.status.config(text="正在停止……")

    def _batch_worker(
        self, files: list[Path], model: str, scale: int, correct: bool, strength: int, clear_input: bool
    ) -> None:
        success = 0
        failures: list[str] = []
        succeeded: list[Path] = []
        cleared = 0
        cancelled = False
        logging.info(
            "Batch started: files=%d model=%s scale=%d correct=%s strength=%d clear_input=%s",
            len(files), model, scale, correct, strength, clear_input,
        )
        try:
            def progress(pct: float, line: str) -> None:
                self.events.put(("upscale_progress", pct, line))

            results = upscale_files(files, model, scale, UPSCALE_TMP, progress, self.cancel_event)
            cancelled = any(err == "已取消" for _p, _u, err in results)
            if cancelled:
                return

            self.events.put(("phase", "白场矫正"))
            for index, (path, upscaled, error) in enumerate(results, 1):
                try:
                    if error is not None:
                        failures.append(f"{path.name}: {error}")
                        continue
                    written = finish_file(upscaled, path, OUTPUT_DIR, correct, strength)
                    success += 1
                    succeeded.append(path)
                    logging.info("Processed %s -> %s", path.name, written.name)
                except Exception as exc:
                    failures.append(f"{path.name}: {exc}")
                    logging.exception("Failed: %s", path)
                self.events.put(("file_done", index, path.name))

            cleared = 0
            if clear_input and succeeded and not cancelled:
                self.events.put(("phase", "清除原图"))
                for path in succeeded:
                    try:
                        path.unlink(missing_ok=True)
                        cleared += 1
                    except OSError as exc:
                        failures.append(f"{path.name}: 清除原图失败 {exc}")
                logging.info("Cleared %d input originals", cleared)
        finally:
            shutil.rmtree(UPSCALE_TMP, ignore_errors=True)
            self.events.put(("done", success, failures, cancelled, cleared))

    def _poll_events(self) -> None:
        try:
            while True:
                event = self.events.get_nowait()
                if event[0] == "upscale_progress":
                    pct, line = event[1], event[2]
                    self.progress.configure(value=min(100, pct))
                    self.status.config(text=f"放大中…… {line}")
                elif event[0] == "phase":
                    self.status.config(text="放大完成，白场矫正中……")
                elif event[0] == "file_done":
                    _, index, name = event
                    self.progress.configure(value=100 + index)
                    self.status.config(text=f"白场矫正：{name}（{index} 张）")
                elif event[0] == "done":
                    _, success, failures, cancelled, cleared = event
                    self.running = False
                    self.start_button.config(state="normal")
                    self.stop_button.config(state="disabled")
                    state = "已停止" if cancelled else "处理完成"
                    self.status.config(text=f"{state}：成功 {success}，失败 {len(failures)}")
                    summary = f"成功：{success}\n失败：{len(failures)}"
                    if cleared:
                        summary += f"\n已清除 input 原图：{cleared} 张"
                    detail = "\n".join(failures[:8])
                    if len(failures) > 8:
                        detail += f"\n另有 {len(failures) - 8} 个错误，请查看日志。"
                    messagebox.showinfo(
                        state,
                        summary + f"\n输出：{OUTPUT_DIR}"
                        + (f"\n\n{detail}" if detail else ""),
                    )
        except queue.Empty:
            pass
        self.after(100, self._poll_events)


if __name__ == "__main__":
    try:
        App().mainloop()
    except Exception:
        logging.exception("Fatal application error")
        raise
