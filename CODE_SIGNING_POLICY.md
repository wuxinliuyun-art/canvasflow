# CanvasFlow Code Signing Policy

Free code signing provided by SignPath.io, certificate by SignPath Foundation.

## Purpose

CanvasFlow uses code signing to let users verify that Windows release artifacts were built from this public repository and were not modified after signing.

## Source and releases

- Source repository: <https://github.com/wuxinliuyun-art/canvasflow>
- Official releases: <https://github.com/wuxinliuyun-art/canvasflow/releases>
- Only artifacts built from this repository's reviewed source and build scripts may be submitted for release signing.
- Development builds and locally built packages are not official signed releases.

## Team roles

CanvasFlow is currently maintained by a single developer.

- Committer and reviewer: `wuxinliuyun-art`
- Signing approver: `wuxinliuyun-art`

Changes from external contributors must be submitted through a pull request and reviewed before they are merged. A release signing request requires a separate manual approval after the automated build has completed.

## Build and signing controls

- Release artifacts must be produced by the repository's trusted GitHub Actions workflow.
- The workflow must build from a tagged commit in this repository.
- Signing credentials are not stored in the repository or distributed to contributors.
- Signed artifacts must use the CanvasFlow product name and the version associated with the release tag.
- A signed artifact must not be modified after signing.

## Privacy and user control

CanvasFlow's data handling is described in [PRIVACY.md](PRIVACY.md). CanvasFlow does not transfer information to networked systems unless the user explicitly requests an online operation, such as generating an image or checking for an update.

## Security reports

Please report suspected malicious releases, signature misuse, or compromised build infrastructure through the repository's security reporting channel or, if that channel is unavailable, by opening a GitHub issue without including secrets or personal data.

---

# CanvasFlow 代码签名政策

CanvasFlow 使用代码签名，帮助用户确认 Windows 发布文件来自本公开仓库的构建流程，并且签名后没有被修改。

- 只有由本仓库已审核源码和构建脚本生成的文件才可申请正式签名。
- 正式发布包必须由受信任的 GitHub Actions 工作流从版本标签构建。
- 本地构建和开发构建不是官方签名版本。
- 当前提交审核人与签名批准人均为项目维护者 `wuxinliuyun-art`。
- 外部贡献必须通过 Pull Request 审核；正式签名还需要在自动构建完成后单独人工批准。
- 签名凭据不得保存在仓库中，也不得分发给贡献者。
- 软件的数据处理方式参见 [PRIVACY.md](PRIVACY.md)。
