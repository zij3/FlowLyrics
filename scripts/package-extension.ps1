$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$srcDir = Join-Path $repoRoot "src"
$manifestPath = Join-Path $srcDir "manifest.json"

if (-not (Test-Path $manifestPath)) {
  throw "Could not find manifest.json at $manifestPath"
}

$version = (Get-Content -Raw $manifestPath | ConvertFrom-Json).version
$zipPath = Join-Path $repoRoot "youtube-music-animated-lyrics-$version.zip"

Compress-Archive -Path (Join-Path $srcDir "*"), (Join-Path $repoRoot "README.md") -DestinationPath $zipPath -Force

Write-Host "Created $zipPath"
