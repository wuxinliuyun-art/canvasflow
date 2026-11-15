// 开发专用开关（2026-11-14）：此文件只存在于源码工作区，任何发布清单都不得携带它
// （csproj 显式 Content / build-mac.ps1 appFiles / build-web-update.ps1 清单均未收录），
// 因此 window.CANVASFLOW_DEV 在发布版恒为 undefined——用它门控仅开发时需要的 UI，
// 例如编组外框的「运行」按钮（发布版隐藏、本地源码显示）。fail-closed：忘了任何
// 打包步骤都不会把开发专用 UI 带进发布版；新增开发开关往这里挂，不要另起炉灶。
window.CANVASFLOW_DEV = true;
