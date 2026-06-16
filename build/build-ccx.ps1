# build/build-ccx.ps1
# ===================
# WARNING — this produces a PLAIN ZIP, which the Unified Plugin Installer
# Agent (UPIA) does NOT accept: double-click / UPIA install fails with errors
# like -267 / -4. A real .ccx must be produced by Adobe's official tooling.
# Use ONE of these instead:
#   * UXP Developer Tool (GUI): plugin -> "..." Actions menu -> Package
#   * UXP devtools CLI: `uxp plugin package --manifest manifest.json --outputPath dist`
#   * The GitHub Action (.github/workflows/build-ccx.yml), which now uses the CLI
#
# This script is kept only for quick inspection of the file set that ships;
# its output is fine for loading an UNPACKED folder in UDT, but not for UPIA.
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
