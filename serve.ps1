# Serve the kata viewer locally on http://localhost:8420
$root = Join-Path $PSScriptRoot 'kata-viewer'
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    python -m http.server 8420 --directory $root
} else {
    npx --yes serve -l 8420 $root
}
