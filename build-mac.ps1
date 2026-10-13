# CanvasFlow macOS 安装包构建（Windows 上运行）。
# 原理：不解压 Electron 官方 darwin zip（其含符号链接与 unix 权限位，Windows 解压即损坏），
# 而是 zip→zip 流式转写：改条目名（Electron.app→CanvasFlow.app、Helper 全套改名、icns 替换）、
# 修改 Info.plist、替换 Resources/app 为仓库前端与 desktop-mac 壳源码，权限位原样保留。
# 产物：release/mac/CanvasFlow-<版本>-mac.zip（x64）与 CanvasFlow-<版本>-arm64-mac.zip。
# 用法：powershell -File build-mac.ps1 [-Arch both|x64|arm64] [-Mirror npmmirror] [-Version 2.7.3]
param(
    [string]$Version = "",
    [string]$ElectronVersion = "44.7.0",
    [ValidateSet("both", "x64", "arm64")]
    [string]$Arch = "both",
    [string]$Mirror = "",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Version)) {
    $package = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json
    $Version = [string]$package.version
}
if ([string]::IsNullOrWhiteSpace($OutputDir)) { $OutputDir = Join-Path $projectRoot "release\mac" }
$cacheDir = Join-Path $OutputDir ".electron-cache"
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# ---------- 组装 Resources/app 的文件清单（与 2.7.2 原包对齐，模板图取仓库当前全集） ----------
$macShellDir = Join-Path $projectRoot "desktop-mac"
$appFiles = @(
    @{ src = Join-Path $macShellDir "main.js";                entry = "app/main.js" },
    @{ src = Join-Path $macShellDir "preload.js";             entry = "app/preload.js" },
    @{ src = Join-Path $macShellDir "web-update.js";          entry = "app/web-update.js" },
    @{ src = Join-Path $macShellDir "extension-service.js";   entry = "app/extension-service.js" },
    @{ src = Join-Path $macShellDir "asset-store.js";         entry = "app/asset-store.js" },
    @{ src = Join-Path $macShellDir "ps-interop.js";          entry = "app/ps-interop.js" },
    @{ src = Join-Path $projectRoot "server.js";              entry = "app/server.js" },
    @{ src = Join-Path $projectRoot "index.html";             entry = "app/index.html" },
    @{ src = Join-Path $projectRoot "app.js";                 entry = "app/app.js" },
    @{ src = Join-Path $projectRoot "styles.css";             entry = "app/styles.css" },
    @{ src = Join-Path $projectRoot "canvas-runtime.js";      entry = "app/canvas-runtime.js" },
    @{ src = Join-Path $projectRoot "model-catalog.js";       entry = "app/model-catalog.js" },
    @{ src = Join-Path $projectRoot "LICENSE";                entry = "app/LICENSE" },
    @{ src = Join-Path $projectRoot "PRIVACY.md";             entry = "app/PRIVACY.md" },
    @{ src = Join-Path $projectRoot "拓展脚本规范.md";         entry = "app/拓展脚本规范.md" },
    @{ src = Join-Path $projectRoot "modules\mindmap-module.js"; entry = "app/modules/mindmap-module.js" },
    @{ src = Join-Path $projectRoot "assets\canvasflow-app-icon.png"; entry = "app/assets/canvasflow-app-icon.png" },
    @{ src = Join-Path $projectRoot "assets\canvasflow-app-icon.svg"; entry = "app/assets/canvasflow-app-icon.svg" },
    @{ src = Join-Path $projectRoot "assets\canvasflow-logo.png";     entry = "app/assets/canvasflow-logo.png" },
    @{ src = Join-Path $projectRoot "assets\canvasflow-logo.svg";     entry = "app/assets/canvasflow-logo.svg" },
    @{ src = Join-Path $projectRoot "builtin-templates\rerender-style.jpg";    entry = "app/builtin-templates/rerender-style.jpg" },
    @{ src = Join-Path $projectRoot "builtin-templates\rerender-product.png";  entry = "app/builtin-templates/rerender-product.png" },
    @{ src = Join-Path $projectRoot "builtin-templates\builtin-marker-style.png";  entry = "app/builtin-templates/builtin-marker-style.png" },
    @{ src = Join-Path $projectRoot "builtin-templates\builtin-marker-lineart.png"; entry = "app/builtin-templates/builtin-marker-lineart.png" },
    @{ src = Join-Path $projectRoot "cep-panel\CanvasFlowPanel\CSXS\manifest.xml";  entry = "app/cep-panel/CanvasFlowPanel/CSXS/manifest.xml" },
    @{ src = Join-Path $projectRoot "cep-panel\CanvasFlowPanel\index.html";         entry = "app/cep-panel/CanvasFlowPanel/index.html" },
    @{ src = Join-Path $projectRoot "cep-panel\CanvasFlowPanel\js\csinterface-lite.js"; entry = "app/cep-panel/CanvasFlowPanel/js/csinterface-lite.js" },
    @{ src = Join-Path $projectRoot "cep-panel\CanvasFlowPanel\js\main.js";             entry = "app/cep-panel/CanvasFlowPanel/js/main.js" },
    @{ src = Join-Path $projectRoot "cep-panel\CanvasFlowPanel\jsx\host.jsx";           entry = "app/cep-panel/CanvasFlowPanel/jsx/host.jsx" },
    @{ src = Join-Path $projectRoot "cep-panel\CanvasFlowPanel\.debug";                 entry = "app/cep-panel/CanvasFlowPanel/.debug" },
    @{ src = Join-Path $projectRoot "cep-panel\README.md";                entry = "app/cep-panel/README.md" },
    @{ src = Join-Path $projectRoot "cep-panel\install-for-testing.bat";  entry = "app/cep-panel/install-for-testing.bat" }
)

foreach ($file in $appFiles) {
    if (-not (Test-Path -LiteralPath $file.src -PathType Leaf)) { throw "缺少构建输入文件：$($file.src)" }
}

# ---------- Info.plist：修改已存在的 key，缺失的新增（对齐 electron-builder 产物字段） ----------
function Set-PlistValues {
    param([string]$Xml, [hashtable]$Values)
    foreach ($key in $Values.Keys) {
        $pattern = "(<key>$key</key>\s*<string>)[^<]*(</string>)"
        if ($Xml -match $pattern) {
            $Xml = [regex]::Replace($Xml, $pattern, ('${1}' + $Values[$key] + '${2}'))
        } else {
            $index = $Xml.IndexOf("<dict>")
            if ($index -lt 0) { throw "plist 无 dict 结构，无法新增字段 $key" }
            $inserted = "<dict>`n`t<key>$key</key>`n`t<string>" + $Values[$key] + "</string>"
            $Xml = $Xml.Substring(0, $index) + $inserted + $Xml.Substring($index + "<dict>".Length)
        }
    }
    return $Xml
}

$helperRenames = @(
    @{ suffix = "";            idPart = "helper" },
    @{ suffix = " (GPU)";      idPart = "helper.GPU" },
    @{ suffix = " (Plugin)";   idPart = "helper.Plugin" },
    @{ suffix = " (Renderer)"; idPart = "helper.Renderer" }
)

function Convert-EntryName {
    param([string]$Name)
    if ($Name -eq "Electron.app/Contents/MacOS/Electron") { return "CanvasFlow.app/Contents/MacOS/CanvasFlow" }
    if ($Name -eq "Electron.app/Contents/Resources/electron.icns") { return "CanvasFlow.app/Contents/Resources/icon.icns" }
    $result = $Name
    foreach ($helper in $helperRenames) {
        $suffix = $helper.suffix
        $result = $result.Replace("Frameworks/Electron Helper$suffix.app/", "Frameworks/CanvasFlow Helper$suffix.app/")
        $result = $result.Replace("/MacOS/Electron Helper$suffix", "/MacOS/CanvasFlow Helper$suffix")
    }
    if ($result.StartsWith("Electron.app/")) { $result = "CanvasFlow.app/" + $result.Substring("Electron.app/".Length) }
    return $result
}

function Copy-Entry {
    param($SourceEntry, [System.IO.Compression.ZipArchive]$Target, [string]$EntryName)
    $mode = ($SourceEntry.ExternalAttributes -shr 16) -band 0xF000
    $newEntry = $Target.CreateEntry($EntryName)
    $newEntry.ExternalAttributes = $SourceEntry.ExternalAttributes
    $stream = $newEntry.Open()
    try {
        $source = $SourceEntry.Open()
        try { $source.CopyTo($stream) } finally { $source.Dispose() }
    } finally { $stream.Dispose() }
    return $newEntry
}

# 产物自检：解析中心目录检查所有非 ASCII 条目名都带 UTF-8 标志（EFS）。
# .NET ZipArchiveEntry 不暴露通用标志位，只能读原始字节；缺该标志时 macOS 解压会按非 UTF-8 解码出乱码名。
function Test-ZipUtf8NameFlags {
    param([string]$ZipPath)
    $fs = [System.IO.File]::OpenRead($ZipPath)
    try {
        $tailLen = [int][math]::Min(70000, $fs.Length)
        $fs.Seek(-$tailLen, [System.IO.SeekOrigin]::End) | Out-Null
        $tail = New-Object byte[] $tailLen
        $read = 0
        while ($read -lt $tailLen) { $n = $fs.Read($tail, $read, $tailLen - $read); if ($n -le 0) { break }; $read += $n }
        $eocd = -1
        for ($i = $tailLen - 22; $i -ge 0; $i--) {
            if ($tail[$i] -eq 0x50 -and $tail[$i+1] -eq 0x4B -and $tail[$i+2] -eq 0x05 -and $tail[$i+3] -eq 0x06) { $eocd = $i; break }
        }
        if ($eocd -lt 0) { throw "自检失败：找不到 ZIP EOCD" }
        $cdOffset = [BitConverter]::ToInt32($tail, $eocd + 16)
        $cdSize = [BitConverter]::ToInt32($tail, $eocd + 12)
        $fs.Seek($cdOffset, [System.IO.SeekOrigin]::Begin) | Out-Null
        $cd = New-Object byte[] $cdSize
        $read = 0
        while ($read -lt $cdSize) { $n = $fs.Read($cd, $read, $cdSize - $read); if ($n -le 0) { break }; $read += $n }
        $nonAscii = 0
        $i = 0
        while ($i -lt $cdSize - 46) {
            if (-not ($cd[$i] -eq 0x50 -and $cd[$i+1] -eq 0x4B -and $cd[$i+2] -eq 0x01 -and $cd[$i+3] -eq 0x02)) { throw "自检失败：中心目录损坏（偏移 $i）" }
            $flags = [BitConverter]::ToUInt16($cd, $i + 8)
            $nameLen = [BitConverter]::ToUInt16($cd, $i + 28)
            $extraLen = [BitConverter]::ToUInt16($cd, $i + 30)
            $commentLen = [BitConverter]::ToUInt16($cd, $i + 32)
            $name = [System.Text.Encoding]::UTF8.GetString($cd, $i + 46, $nameLen)
            if ($name -match '[^\x00-\x7F]') {
                $nonAscii++
                if (($flags -band 0x800) -eq 0) { throw "自检失败：条目名非 ASCII 且未置 UTF-8 标志（macOS 解压会出乱码名）：$name" }
            }
            $i += 46 + $nameLen + $extraLen + $commentLen
        }
        return $nonAscii
    } finally { $fs.Dispose() }
}

# ---------- 下载 Electron（带缓存） ----------
function Get-ElectronZip {
    param([string]$ArchName)
    $zipPath = Join-Path $cacheDir "electron-v$ElectronVersion-darwin-$ArchName.zip"
    if (Test-Path -LiteralPath $zipPath -PathType Leaf) {
        Write-Host "[Cache] $zipPath"
        return $zipPath
    }
    if ($Mirror -eq "npmmirror") {
        $url = "https://npmmirror.com/mirrors/electron/$ElectronVersion/electron-v$ElectronVersion-darwin-$ArchName.zip"
    } else {
        $url = "https://github.com/electron/electron/releases/download/v$ElectronVersion/electron-v$ElectronVersion-darwin-$ArchName.zip"
    }
    Write-Host "[Download] $url"
    & curl.exe -L --fail --connect-timeout 20 -o $zipPath $url
    if ($LASTEXITCODE -ne 0) { throw "Electron 运行时下载失败（$ArchName）。可重试，或加 -Mirror npmmirror 换镜像。" }
    return $zipPath
}

# ---------- 单架构构建：zip→zip 转写 + 追加 app/ ----------
function Build-Arch {
    param([string]$ArchName)
    $sourceZipPath = Get-ElectronZip -ArchName $ArchName
    $suffix = if ($ArchName -eq "arm64") { "-arm64-mac.zip" } else { "-mac.zip" }
    $outputZip = Join-Path $OutputDir "CanvasFlow-$Version$suffix"
    if (Test-Path -LiteralPath $outputZip) { Remove-Item -LiteralPath $outputZip -Force }
    $utf8 = New-Object System.Text.UTF8Encoding($false)

    $appPackage = [ordered]@{
        name = "canvasflow"; productName = "CanvasFlow"; version = $Version
        description = "CanvasFlow visual AI image workflow (macOS desktop)"
        author = "wuxinliuyun-art"; license = "MIT"
        repository = "https://github.com/wuxinliuyun-art/canvasflow"; main = "main.js"
    }
    $packageJson = $appPackage | ConvertTo-Json
    $mainPlist = $null
    $helperPlists = @{}
    $pendingEntries = New-Object System.Collections.Generic.List[object]

    $source = [System.IO.Compression.ZipFile]::OpenRead($sourceZipPath)
    $targetStream = [System.IO.File]::Open($outputZip, [System.IO.FileMode]::CreateNew)
    # 条目名编码必须传 $null：显式传 UTF8Encoding 时 .NET 不写 UTF-8 语言标志位（EFS），
    # 中文名字节虽是 UTF-8，macOS 解压仍会按非 UTF-8 解码出乱码名；$null 时 .NET 对非 ASCII 名自动置位。
    $target = New-Object System.IO.Compression.ZipArchive($targetStream, [System.IO.Compression.ZipArchiveMode]::Create, $false, $null)
    try {
        foreach ($entry in $source.Entries) {
            $name = $entry.FullName
            # 跳过：发行版根目录杂项与 default_app（app/ 目录优先于 default_app，留着反而误导）
            if ($name -in @("LICENSE", "LICENSES.chromium.html", "version")) { continue }
            if ($name -eq "Electron.app/Contents/Resources/default_app.asar") { continue }
            if ($name -eq "Electron.app/Contents/Resources/electron.icns") { continue }  # 图标统一改用仓库 icon.icns 新建
            $newName = Convert-EntryName -Name $name
            if ($name -eq "Electron.app/Contents/Info.plist") {
                $xml = (New-Object System.IO.StreamReader($entry.Open(), $utf8)).ReadToEnd()
                $mainPlist = Set-PlistValues -Xml $xml -Values @{
                    CFBundleDisplayName = "CanvasFlow"; CFBundleName = "CanvasFlow"; CFBundleExecutable = "CanvasFlow"
                    CFBundleIdentifier = "com.canvasflow.desktop"
                    CFBundleShortVersionString = $Version; CFBundleVersion = $Version
                    LSMinimumSystemVersion = "13.0"
                }
                continue
            }
            $helperMatch = [regex]::Match($name, '^Electron\.app/Contents/Frameworks/Electron Helper( \((GPU|Plugin|Renderer)\))?\.app/Contents/Info\.plist$')
            if ($helperMatch.Success) {
                $suffix = $helperMatch.Groups[1].Value
                $xml = (New-Object System.IO.StreamReader($entry.Open(), $utf8)).ReadToEnd()
                $helperPlists[$suffix] = Set-PlistValues -Xml $xml -Values @{
                    CFBundleDisplayName = "CanvasFlow Helper$suffix"
                    CFBundleExecutable = "CanvasFlow Helper$suffix"
                    CFBundleIdentifier = "com.canvasflow.desktop." + ($helperRenames | Where-Object { $_.suffix -eq $suffix }).idPart
                    CFBundleVersion = $Version
                }
                continue
            }
            $pendingEntries.Add(@{ source = $entry; name = $newName })
        }
        foreach ($item in $pendingEntries) {
            Copy-Entry -SourceEntry $item.source -Target $target -EntryName $item.name | Out-Null
        }
        # 主 plist / helper plist 写回（修改后的内容）
        foreach ($pair in @(@{ xml = $mainPlist; name = "CanvasFlow.app/Contents/Info.plist" }) +
                           @($helperPlists.GetEnumerator() | ForEach-Object { @{ xml = $_.Value; name = "CanvasFlow.app/Contents/Frameworks/CanvasFlow Helper$($_.Key).app/Contents/Info.plist" } })) {
            $newEntry = $target.CreateEntry($pair.name)
            $newEntry.ExternalAttributes = (33188 -shl 16)  # 0100644
            $stream = $newEntry.Open()
            $writer = New-Object System.IO.StreamWriter($stream, $utf8)
            $writer.Write($pair.xml); $writer.Dispose(); $stream.Dispose()
        }
        # icon.icns：用仓库内 CanvasFlow 图标新建（electron.icns 条目已跳过）
        $iconEntry = $target.CreateEntry("CanvasFlow.app/Contents/Resources/icon.icns")
        $iconEntry.ExternalAttributes = (33188 -shl 16)  # 0100644 常规文件
        $iconStream = $iconEntry.Open()
        $fs = [System.IO.File]::OpenRead((Join-Path $macShellDir "icon.icns"))
        try { $fs.CopyTo($iconStream) } finally { $fs.Dispose(); $iconStream.Dispose() }

        # Resources/app：目录条目 + 文件
        $dirEntries = New-Object System.Collections.Generic.List[string]
        foreach ($file in $appFiles) {
            $parts = ("CanvasFlow.app/Contents/Resources/" + $file.entry).Split("/")
            for ($i = 1; $i -lt $parts.Count; $i++) {
                $dir = ($parts[0..($i - 1)] -join "/") + "/"
                if (-not $dirEntries.Contains($dir)) { $dirEntries.Add($dir) }
            }
            $newEntry = $target.CreateEntry("CanvasFlow.app/Contents/Resources/" + $file.entry)
            $newEntry.ExternalAttributes = (33188 -shl 16)  # 0100644 常规文件
            $stream = $newEntry.Open()
            $fs = [System.IO.File]::OpenRead($file.src)
            try { $fs.CopyTo($stream) } finally { $fs.Dispose(); $stream.Dispose() }
        }
        $appPackageEntry = $target.CreateEntry("CanvasFlow.app/Contents/Resources/app/package.json")
        $appPackageEntry.ExternalAttributes = (33188 -shl 16)
        $stream = $appPackageEntry.Open()
        $writer = New-Object System.IO.StreamWriter($stream, $utf8)
        $writer.Write($packageJson); $writer.Dispose(); $stream.Dispose()
        foreach ($dir in $dirEntries) {
            $newEntry = $target.CreateEntry($dir)
            $newEntry.ExternalAttributes = (16877 -shl 16)  # 040755
            $stream = $newEntry.Open(); $stream.Dispose()
        }
    } finally {
        $target.Dispose(); $targetStream.Dispose(); $source.Dispose()
    }

    # ---------- 产物自检：符号链接逐条保留（mode 与链接目标一致）+ 非 ASCII 条目名带 UTF-8 标志 ----------
    $sourceSymlinks = @{}
    $srcArchive = [System.IO.Compression.ZipFile]::OpenRead($sourceZipPath)
    try {
        foreach ($entry in $srcArchive.Entries) {
            if ((($entry.ExternalAttributes -shr 16) -band 0xF000) -ne 0xA000) { continue }
            $sr = New-Object System.IO.StreamReader($entry.Open())
            try { $linkTarget = $sr.ReadToEnd() } finally { $sr.Dispose() }
            $sourceSymlinks[(Convert-EntryName -Name $entry.FullName)] = $linkTarget
        }
    } finally { $srcArchive.Dispose() }
    $outputSymlinks = @{}
    $outArchive = [System.IO.Compression.ZipFile]::OpenRead($outputZip)
    try {
        foreach ($entry in $outArchive.Entries) {
            if ((($entry.ExternalAttributes -shr 16) -band 0xF000) -ne 0xA000) { continue }
            $sr = New-Object System.IO.StreamReader($entry.Open())
            try { $linkTarget = $sr.ReadToEnd() } finally { $sr.Dispose() }
            $outputSymlinks[$entry.FullName] = $linkTarget
        }
    } finally { $outArchive.Dispose() }
    if ($outputSymlinks.Count -eq 0) { throw "自检失败：产物中没有任何符号链接条目（可能被写成了普通文件，Mac 上将报不是有效的 Mach-O）" }
    if ($outputSymlinks.Count -ne $sourceSymlinks.Count) { throw "自检失败：符号链接数量不一致 源=$($sourceSymlinks.Count) 产物=$($outputSymlinks.Count)" }
    foreach ($key in $sourceSymlinks.Keys) {
        if (-not $outputSymlinks.ContainsKey($key)) { throw "自检失败：产物缺少符号链接条目 $key" }
        if ($outputSymlinks[$key] -ne $sourceSymlinks[$key]) { throw "自检失败：符号链接目标不一致 $key -> $($sourceSymlinks[$key])" }
    }
    $nonAsciiCount = Test-ZipUtf8NameFlags -ZipPath $outputZip
    Write-Host "[Verify] 符号链接 $($outputSymlinks.Count) 条全部保留；非 ASCII 条目名 $nonAsciiCount 个均带 UTF-8 标志"

    $zipHash = (Get-FileHash -LiteralPath $outputZip -Algorithm SHA256).Hash.ToLowerInvariant()
    $size = (Get-Item -LiteralPath $outputZip).Length
    Write-Host "[Done] $outputZip ($([math]::Round($size / 1MB, 1)) MB)"
    Write-Host "[Verify] SHA-256: $zipHash"
}

if ($Arch -in @("x64", "both")) { Build-Arch -ArchName "x64" }
if ($Arch -in @("arm64", "both")) { Build-Arch -ArchName "arm64" }
Write-Host "[Release] 产物与 CanvasFlow-Setup.exe / CanvasFlow-Web.zip 同 Release 上传，资产名保持默认。"
