# -*- coding: utf-8 -*-
"""自动抠图（快速）入口：把任务转发给拓展自带的离线运行环境。

桌面端（DesktopApi.ResolvePython）与扩展服务都会用系统 Python 拉起本文件；
本脚本只用标准库，找到 runtime\\python.exe 后以它重跑真正的抠图脚本并透传退出码。
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    runtime = HERE / "runtime" / "python.exe"
    worker = HERE / "抠图Worker.py"
    if not runtime.is_file() or not worker.is_file():
        print("离线运行环境不完整：缺少 runtime\\python.exe 或 抠图Worker.py，请重新解压完整拓展包")
        return 1
    result = subprocess.run([str(runtime), str(worker)])
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
