param(
    [string]$Version = "",
    [string]$MinimumHostVersion = "",
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Version)) {
    $package = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json
    $Version = [string]$package.version
}
if ([string]::IsNullOrWhiteSpace($MinimumHostVersion)) {
    [xml]$project = Get-Content -LiteralPath (Join-Path $projectRoot "desktop-dotnet\CanvasFlow.Desktop.csproj") -Raw
    $MinimumHostVersion = [string]$project.Project.PropertyGroup.Version
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $projectRoot "release\CanvasFlow-Web.zip"
}

$files = @(
    "index.html",
    "app.js",
    "styles.css",
    "canvas-runtime.js",
    "modules/mindmap-module.js"
)
$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("canvasflow-web-" + [Guid]::NewGuid().ToString("N"))
try {
    New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
    $hashes = [ordered]@{}
    foreach ($relative in $files) {
        $source = Join-Path $projectRoot $relative
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing web update file: $relative" }
        $target = Join-Path $stageRoot $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $target -Force
        $hashes[$relative.Replace("\", "/")] = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $manifest = [ordered]@{
        version = $Version.TrimStart("v", "V")
        minimumHostVersion = $MinimumHostVersion.TrimStart("v", "V")
        entry = "index.html"
        files = $hashes
    }
    $manifestJson = $manifest | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText((Join-Path $stageRoot "manifest.json"), $manifestJson, [System.Text.UTF8Encoding]::new($false))

    $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
    New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedOutput) -Force | Out-Null
    if (Test-Path -LiteralPath $resolvedOutput) { Remove-Item -LiteralPath $resolvedOutput -Force }
    Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $resolvedOutput -CompressionLevel Optimal
    $zipHash = (Get-FileHash -LiteralPath $resolvedOutput -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host "[Done] Web update package: $resolvedOutput"
    Write-Host "[Verify] SHA-256: $zipHash"
    Write-Host "[Release] Upload with CanvasFlow-Setup.exe. Keep the asset name CanvasFlow-Web.zip."
}
finally {
    if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
}
