# CanvasFlow 源码运行说明

本页面向需要修改或自行构建 CanvasFlow 的开发者；普通用户只需下载 GitHub Release 中的 `CanvasFlow-Setup.exe`。

## 环境

- Windows 10/11 x64
- Node.js 22 LTS（推荐）
- npm（随 Node.js 安装）
- 首次安装依赖和检查更新时需要联网

项目不依赖 Python、PowerShell 脚本或全局安装的 Electron。

## 桌面版源码运行

```powershell
npm install
npm start
```

启动后会显示 CanvasFlow 控制中心。源码模式下，`data`、`download` 和 `export` 位于项目根目录，并已被 Git 忽略。

## 浏览器兼容模式

```powershell
npm install
npm run start:server
```

然后打开终端中显示的本地地址。浏览器模式保留主画板功能。

## 构建 Windows 安装包

```powershell
npm run build:windows
```

默认输出为 `dist/CanvasFlow-Setup.exe`。安装包为 Windows x64 当前用户安装，不需要管理员权限；当前没有商业代码签名。

构建前请确认没有正在运行 `dist/win-unpacked/CanvasFlow.exe`，否则 Windows 可能锁定旧的 `app.asar`。

## 数据与发布

- 不要提交 `data/`、`download/`、`export/`、`dist/` 或任何 EXE。
- GitHub Release 只手工上传 `CanvasFlow-Setup.exe`。
- 发布前检查 `app.asar` 包含画板和控制中心资源。
- 安装和更新测试必须确认 `data`、`download`、`export` 不被覆盖或删除。
