# Electron 回退实现

此目录保存 CanvasFlow 2.5.0 迁移前的 Electron 主进程、preload、`package.json` 和锁文件，仅用于历史回退与问题对照。

当前桌面发行版使用 `.NET 8 WPF + WebView2`，不要从此目录构建正式 Release。浏览器源码兼容模式仍使用项目根目录的 `server.js`。
