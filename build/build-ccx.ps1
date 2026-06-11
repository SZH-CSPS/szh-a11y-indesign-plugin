# build/build-ccx.ps1
# ===================
# Packages the plugin into dist/szh-a11y-indesign-plugin_<version>.ccx.
#
# A .ccx is a plain ZIP of the plugin files (manifest.json at the archive
# root). Entries are written with forward slashes so the archive installs
# correctly on both Windows and macOS. No Adobe tooling required — the
# GitHub Action (.github/workflows/build-ccx.yml) builds the same package.
#
# Usage:  powershell -ExecutionPolicy Bypass -File .\build\build-ccx.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot  # repo root (script lives in build/)

$manifest = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$version = $manifest.version

$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force $dist | Out-Null
$ccx = Join-Path $dist ("szh-a11y-indesign-plugin_" + $version + ".ccx")
if (Test-Path $ccx) { [System.IO.File]::Delete($ccx) }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($ccx, 'Create')

# Files shipped to end users — sources only, no docs/git/build artifacts.
$rootFiles = @("manifest.json", "index.html", "styles.css", "main.js")
foreach ($f in $rootFiles) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, (Join-Path $root $f), $f) | Out-Null
}
Get-ChildItem (Join-Path $root "src") -Filter *.js | ForEach-Object {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, $_.FullName, ("src/" + $_.Name)) | Out-Null
}

$zip.Dispose()
Write-Output "Package created: $ccx"
