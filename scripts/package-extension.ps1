$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$srcDir = Join-Path $repoRoot "src"
$distDir = Join-Path $repoRoot "dist"
$manifestPath = Join-Path $srcDir "manifest.json"

if (-not (Test-Path $manifestPath)) {
  throw "Could not find manifest.json at $manifestPath"
}

$version = (Get-Content -Raw $manifestPath | ConvertFrom-Json).version
$zipPath = Join-Path $distDir "youtube-music-animated-lyrics-$version.zip"

New-Item -ItemType Directory -Force $distDir | Out-Null
Compress-Archive -Path (Join-Path $srcDir "*"), (Join-Path $repoRoot "README.md") -DestinationPath $zipPath -Force

Write-Host "Created $zipPath"
