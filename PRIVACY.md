# CanvasFlow Privacy Policy

Last updated: 2026-09-17

CanvasFlow is a local-first desktop application. Projects, custom materials, generated images, exports, and automatic backups are stored on the user's computer.

## Information stored locally

- Project files and automatic backups
- Custom text and image materials
- Generated images and exported files
- Application preferences
- API credentials configured by the user

API credentials are protected with Windows data protection facilities when available. They are not included in project files or automatic backups. If secure storage is unavailable, CanvasFlow keeps the credential only for the current session and informs the user.

## Network transfers initiated by the user

CanvasFlow transfers data only when required for an online operation initiated or enabled by the user:

- When the user starts an AI generation task, the entered text, selected reference images, requested generation settings, and the configured API credential are sent to the API service selected or configured by the user.
- When update checking is enabled or manually requested, CanvasFlow contacts GitHub Releases to obtain public version and release metadata.
- When a web-interface update is installed, CanvasFlow downloads the published update package and verifies its release digest and file manifest before activation.

The destination API service processes submitted data under its own terms and privacy policy. Users should not submit confidential, private, or unlawfully obtained material.

## Data sharing and analytics

CanvasFlow does not include advertising or its own telemetry/analytics service. The project maintainer does not receive local projects, custom materials, API credentials, or generated images unless the user deliberately provides them, for example in a support report.

## Data removal

Users can remove saved projects, materials, generated files, and exports from the corresponding local folders. Uninstalling CanvasFlow removes application files. User-created data directories may be preserved to prevent accidental data loss and can be deleted manually after confirming that their contents are no longer needed.

## Contact

Questions and privacy reports can be submitted through <https://github.com/wuxinliuyun-art/canvasflow/issues>. Do not include API credentials, private images, or other sensitive information in a public issue.

---

# CanvasFlow 隐私政策

更新日期：2026-09-17

CanvasFlow 是一款本地优先的桌面应用。项目、自定义素材、生成图片、导出文件和自动备份均保存在用户电脑中。

## 本地保存的信息

- 项目文件和自动备份
- 自定义文字与图片素材
- 生成图片和导出文件
- 应用设置
- 用户配置的 API 凭据

在系统支持时，API 凭据通过 Windows 数据保护能力加密，不会写入项目文件或自动备份。如果安全存储不可用，CanvasFlow 会提示用户，并且只在当前运行期间保留凭据。

## 用户触发的网络传输

CanvasFlow 仅在用户主动发起或启用在线操作时传输所需数据：

- 用户开始 AI 生成任务时，输入文字、所选参考图片、生成参数和已配置的 API 凭据会发送到用户选择或配置的 API 服务。
- 启用或手动执行更新检查时，CanvasFlow 会访问 GitHub Releases 获取公开版本及发布信息。
- 安装界面热更新时，CanvasFlow 会下载公开发布的更新包，并在启用前校验 Release 摘要和文件清单。

第三方 API 服务会按照其自己的条款和隐私政策处理所提交的数据。请勿提交机密、隐私或无权使用的内容。

## 数据共享与统计

CanvasFlow 不包含广告，也不包含项目自己的遥测或统计服务。除非用户主动提供，例如随问题报告提交，否则项目维护者不会收到本地项目、自定义素材、API 凭据或生成图片。

## 删除数据

用户可以从相应的本地目录删除项目、素材、生成文件和导出文件。卸载 CanvasFlow 会移除应用文件。为避免误删，用户创建的数据目录可能被保留；确认不再需要后可手动删除。

## 联系方式

隐私问题可通过 <https://github.com/wuxinliuyun-art/canvasflow/issues> 提交。请勿在公开 Issue 中包含 API 凭据、私人图片或其他敏感信息。
