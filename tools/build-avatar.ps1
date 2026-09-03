# Rebuild the skinned avatar: rig schema -> Blender -> GLB -> structural test.
# Usage: .\tools\build-avatar.ps1   (from the repo root)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$blender = 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe'
if (-not (Test-Path $blender)) { throw "Blender not found at $blender" }

node tools/dump-rig.mjs
if ($LASTEXITCODE -ne 0) { throw 'dump-rig failed' }

& $blender -b -noaudio -P tools/build-avatar.py | Select-String -Pattern 'wrote|Error|Traceback'
if ($LASTEXITCODE -ne 0) { throw 'Blender build failed' }

node --import ./tests/three-resolver.mjs --test tests/glb.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'GLB structural test failed' }
Write-Host 'karateka.glb rebuilt and verified.'
