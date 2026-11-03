"""扩展服务：扫描拓展文件夹中的工具，通过本地 HTTP 暴露给 CanvasFlow 画布节点。

约定见同目录《拓展脚本规范.md》。仅监听 127.0.0.1，标准库实现，无第三方依赖。
双击 扩展服务.bat 启动后，请保持窗口开启（或使用 pythonw 常驻）；关闭窗口即停止服务。
"""
from __future__ import annotations

import base64
import json
import logging
import re
import shlex
import shutil
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
WORK_DIR = BASE_DIR / "_work"
LOG_FILE = BASE_DIR / "扩展服务.log"
# 服务从同目录扫描拓展清单。
MANIFEST_NAME = "扩展.json"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
DEFAULT_PORT = 8788
DEFAULT_TIMEOUT = 600
MAX_BODY_BYTES = 300 * 1024 * 1024
MAX_LOG_CHARS = 4000
REQUIRED_FIELDS = ("id", "name", "version", "entry", "output")

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    encoding="utf-8",
)

_meta_lock = threading.Lock()
_extensions: dict[str, dict] = {}       # id -> {meta, folder}
_invalid: list[dict] = []               # 扫描到但清单不合法的文件夹
_ext_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _safe_name(name: str, fallback: str) -> str:
    name = re.sub(r'[\\/:*?"<>|\r\n]+', "_", (name or "").strip())
    return name[:120] or fallback


def scan_extensions() -> None:
    """重新检索拓展文件夹。坏的清单跳过并记录，不影响其他拓展。"""
    global _invalid
    found: dict[str, dict] = {}
    invalid: list[dict] = []
    if BASE_DIR.is_dir():
        for folder in sorted(BASE_DIR.iterdir(), key=lambda p: p.name.lower()):
            if not folder.is_dir() or folder.name.startswith(("_", ".")) or folder.name == "node_modules":
                continue
            manifest = folder / MANIFEST_NAME
            if not manifest.is_file():
                continue
            try:
                meta = json.loads(manifest.read_text(encoding="utf-8"))
                for field in REQUIRED_FIELDS:
                    if not str(meta.get(field, "")).strip():
                        raise ValueError(f"扩展.json 缺少字段 {field}")
                ext_id = str(meta["id"]).strip()
                if not re.fullmatch(r"[A-Za-z0-9-]+", ext_id):
                    raise ValueError(f"id 只允许字母数字连字符：{ext_id!r}")
                if ext_id in found:
                    raise ValueError(f"id 与其他拓展重复：{ext_id}")
                params = meta.get("params") or []
                if not isinstance(params, list):
                    raise ValueError("params 必须是数组")
                if meta.get("input") not in (None, "images"):
                    raise ValueError(f"暂不支持的 input 类型：{meta.get('input')}")
                if meta["output"] not in ("images", "files", "images+files"):
                    raise ValueError(f"output 只支持 images/files/images+files：{meta['output']}")
                entry = str(meta["entry"]).strip()
                script = entry.split()[0] if entry.split() else ""
                if script.lower().endswith(".py") and not (folder / script).is_file():
                    raise ValueError(f"入口脚本不存在：{script}")
                found[ext_id] = {
                    "meta": {**meta, "id": ext_id, "params": params},
                    "folder": folder,
                }
            except Exception as exc:  # 坏清单不影响服务与其余拓展
                invalid.append({"folder": folder.name, "error": str(exc)})
                logging.warning("无效拓展 %s: %s", folder.name, exc)
    with _meta_lock:
        stale = set(_extensions) - set(found)
        _extensions.clear()
        _extensions.update(found)
        _invalid = invalid
        with _locks_guard:
            for ext_id in stale:
                _ext_locks.pop(ext_id, None)
    logging.info("扫描完成：%d 个有效拓展，%d 个无效", len(found), len(invalid))
    _cleanup_workspaces()


def _cleanup_workspaces() -> None:
    """清理超过 24 小时的残留工作区（异常退出可能留下）。"""
    if not WORK_DIR.is_dir():
        return
    now = time.time()
    for folder in WORK_DIR.iterdir():
        try:
            if now - folder.stat().st_mtime > 24 * 3600:
                shutil.rmtree(folder, ignore_errors=True)
        except OSError:
            pass


def _extension_lock(ext_id: str) -> threading.Lock:
    with _locks_guard:
        if ext_id not in _ext_locks:
            _ext_locks[ext_id] = threading.Lock()
        return _ext_locks[ext_id]


def _build_command(entry: str, folder: Path) -> tuple[list[str], str | None]:
    """entry -> 实际命令行。py 入口用当前解释器运行；路径基于拓展文件夹。"""
    tokens = shlex.split(entry, posix=False)
    tokens = [t.strip('"') for t in tokens if t.strip()]
    if not tokens:
        return [], "entry 为空"
    head = tokens[0]
    if head.lower() in {"python", "python3", "py", "python.exe", "python3.exe"}:
        return [sys.executable, *tokens[1:]], None
    if head.lower().endswith(".py"):
        script = folder / head
        if not script.is_file():
            return [], f"入口脚本不存在：{head}"
        return [sys.executable, str(script), *tokens[1:]], None
    exe = folder / head
    if exe.is_file():
        return [str(exe), *tokens[1:]], None
    return [head, *tokens[1:]], None  # 交给 PATH 解析


def run_extension(ext_id: str, images: list[dict], params: dict) -> dict:
    ext = _extensions.get(ext_id)
    if ext is None:
        return {"status": 404, "payload": {"ok": False, "error": f"未找到拓展：{ext_id}（可尝试刷新拓展列表）"}}
    meta, folder = ext["meta"], ext["folder"]

    lock = _extension_lock(ext_id)
    if not lock.acquire(blocking=False):
        return {"status": 409, "payload": {"ok": False, "error": f"「{meta['name']}」上一次任务仍在执行，请稍后再试"}}
    workspace = WORK_DIR / f"{ext_id}-{uuid.uuid4().hex[:8]}"
    try:
        input_dir = workspace / "input"
        output_dir = workspace / "output"
        input_dir.mkdir(parents=True)
        output_dir.mkdir(parents=True)
        if not images:
            return {"status": 400, "payload": {"ok": False, "error": "请求中没有图片"}}
        for index, item in enumerate(images):
            try:
                data = base64.b64decode(str(item.get("data", "")), validate=False)
            except Exception:
                return {"status": 400, "payload": {"ok": False, "error": f"第 {index + 1} 张图片 base64 解码失败"}}
            name = _safe_name(item.get("name") or "", f"image-{index + 1}.png")
            if not Path(name).suffix:
                name += ".png"
            (input_dir / name).write_bytes(data)
        (workspace / "params.json").write_text(
            json.dumps(params or {}, ensure_ascii=False, indent=2), encoding="utf-8")

        command, error = _build_command(meta["entry"], folder)
        if error:
            return {"status": 500, "payload": {"ok": False, "error": error}}
        timeout = int(meta.get("timeout") or DEFAULT_TIMEOUT)
        logging.info("运行拓展 %s：files=%d params=%s", ext_id, len(images), params)
        started = time.time()
        try:
            proc = subprocess.run(
                command,
                cwd=str(workspace),
                capture_output=True,
                text=True,
                errors="replace",
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            return {"status": 500, "payload": {"ok": False,
                    "error": f"运行超时（超过 {timeout} 秒），已终止。可在扩展.json 的 timeout 字段调大"}}
        except OSError as exc:
            return {"status": 500, "payload": {"ok": False, "error": f"无法启动入口：{exc}"}}

        tail = "\n".join((proc.stdout or "").strip().splitlines()[-12:])
        if proc.returncode != 0:
            err_tail = "\n".join((proc.stderr or "").strip().splitlines()[-12:])
            detail = err_tail or tail or "(无输出)"
            return {"status": 500, "payload": {"ok": False,
                    "error": f"拓展「{meta['name']}」运行失败（退出码 {proc.returncode}）：\n{detail}"}}

        images_out, files_out = [], []
        if output_dir.is_dir():
            for path in sorted(output_dir.rglob("*")):
                if not path.is_file():
                    continue
                rel = path.relative_to(output_dir).as_posix()
                data = base64.b64encode(path.read_bytes()).decode("ascii")
                if path.suffix.lower() in IMAGE_SUFFIXES:
                    images_out.append({"name": _safe_name(rel, f"output-{len(images_out) + 1}.png"), "data": data})
                else:
                    files_out.append({"name": _safe_name(rel, f"output-{len(files_out) + 1}.bin"), "data": data})
        if not images_out and not files_out:
            return {"status": 500, "payload": {"ok": False,
                    "error": f"拓展「{meta['name']}」没有产生输出文件。\n{tail}"}}
        logging.info("拓展 %s 完成：%.1fs，图片 %d，文件 %d",
                     ext_id, time.time() - started, len(images_out), len(files_out))
        return {"status": 200, "payload": {
            "ok": True, "images": images_out, "files": files_out,
            "log": tail[-MAX_LOG_CHARS:], "duration": round(time.time() - started, 1),
        }}
    except Exception as exc:
        logging.exception("拓展 %s 执行异常", ext_id)
        return {"status": 500, "payload": {"ok": False, "error": f"服务内部错误：{exc}"}}
    finally:
        shutil.rmtree(workspace, ignore_errors=True)
        lock.release()


def _extensions_payload() -> dict:
    with _meta_lock:
        items = [
            {
                "id": ext_id,
                "name": ext["meta"].get("name", ext_id),
                "version": ext["meta"].get("version", ""),
                "description": ext["meta"].get("description", ""),
                "output": ext["meta"].get("output", "images"),
                "params": ext["meta"].get("params", []),
                "timeout": ext["meta"].get("timeout") or DEFAULT_TIMEOUT,
            }
            for ext_id, ext in _extensions.items()
        ]
        invalid = list(_invalid)
    return {"ok": True, "extensions": items, "invalid": invalid,
            "baseDir": str(BASE_DIR)}


class Handler(BaseHTTPRequestHandler):
    server_version = "CanvasFlowExtensionService/1.0"

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict | None:
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY_BYTES:
            self._send(413, {"ok": False, "error": "请求体超过 300MB 限制"})
            return None
        raw = self.rfile.read(length) if length else b""
        try:
            return json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            self._send(400, {"ok": False, "error": "请求不是合法 JSON"})
            return None

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path == "/api/health":
            self._send(200, {"ok": True, "service": "canvasflow-extensions",
                             "version": "1.0.0", "baseDir": str(BASE_DIR)})
        elif path == "/api/extensions":
            self._send(200, _extensions_payload())
        else:
            self._send(404, {"ok": False, "error": f"未知路径 {path}"})

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.split("?", 1)[0]
        if path == "/api/extensions/refresh":
            scan_extensions()
            self._send(200, _extensions_payload())
        elif path.startswith("/api/extensions/") and path.endswith("/run"):
            ext_id = path[len("/api/extensions/"):-len("/run")]
            payload = self._read_json()
            if payload is None:
                return
            images = payload.get("images") or []
            result = run_extension(ext_id, images, payload.get("params") or {})
            self._send(result["status"], result["payload"])
        else:
            self._send(404, {"ok": False, "error": f"未知路径 {path}"})

    def log_message(self, fmt: str, *args) -> None:  # 静默默认 stderr 日志
        logging.info("%s - %s", self.address_string(), fmt % args)


def main() -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    scan_extensions()
    port = DEFAULT_PORT
    server = None
    for _ in range(10):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            break
        except OSError:
            logging.info("端口 %d 被占用，尝试下一个", port)
            port += 1
    if server is None:
        logging.error("8788-8797 端口均不可用，服务退出")
        sys.exit(1)
    logging.info("扩展服务启动：http://127.0.0.1:%d/ （拓展文件夹：%s）", port, BASE_DIR)
    print(f"CanvasFlow 扩展服务已启动：http://127.0.0.1:{port}/")
    print(f"拓展文件夹：{BASE_DIR}")
    print("保持本窗口开启即可在 CanvasFlow 中使用拓展节点；关闭窗口即停止服务。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
