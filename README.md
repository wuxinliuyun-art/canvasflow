# WEBIMAGE 节点式图片文字画布

## 项目结构

```
├── app.js              # 前端主逻辑
├── index.html          # 页面骨架
├── styles.css          # 样式
├── server.js           # Node.js HTTP 服务器（静态文件 + 文件写入 + 旧代理）
├── webimage-server.exe # pkg 编译的独立可执行文件（免装 Node.js）
├── package.json        # pkg 打包配置
├── start.bat           # 开发启动脚本（node server.js）
└── download/images/    # 本地图片资源（模特图等）
```

## API 请求架构

```
浏览器 app.js ──fetch──▶ localhost:5173 （/api/* 代理）──▶ api.apib.ai / api.aiuxu.com / api.aishuch.com / api.apimart.ai（自动故障转移）
```

**关键点：**
- 所有 AI 生图相关的 API 请求（生成、轮询、验证、查余额）都通过 **server.js 后端代理**转发，不再由浏览器直接请求外网
- `server.js` 内置多域名故障转移：优先尝试 `api.apib.ai` → `api.aiuxu.com` → `api.aishuch.com` → `api.apimart.ai`，一个不可达自动切换下一个
- 这样避免了浏览器跨域 / VPN 失效问题，所有流量走本地 Node.js 代理

## 编译 exe

```bash
npm install -g pkg
pkg server.js --targets node18-win-x64 --output webimage-server.exe
```

`server.js` 中的 `dataRoot` 变量在 pkg 编译后自动指向 exe 所在目录（用于写文件/导出），`root` 保持为内嵌虚拟路径（用于读取打包的静态文件）。

## 启动方式

- **开发**：`node server.js` 或双击 `start.bat`
- **分发**：将 `webimage-server.exe` 单独发给对方即可（无需 Node.js，无需其他文件）
