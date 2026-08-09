param(
  [string]$InstallRoot = "F:\Dev\Amoria-Models\opennsfw-onnx-0.1.0",
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$requirements = Join-Path $repoRoot "moderation-worker\requirements.lock"
$venvPython = Join-Path $InstallRoot "Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
  & $Python -m venv $InstallRoot
}

& $venvPython -m pip install --disable-pip-version-check -r $requirements
& $venvPython -c "import hashlib,pathlib,opennsfw_onnx; p=next(pathlib.Path(opennsfw_onnx.__file__).parent.glob('*.onnx')); actual=hashlib.sha256(p.read_bytes()).hexdigest(); expected='864bb37bf8863564b87eb330ab8c785a79a773f4e7c43cb96db52ed8611305fa'; assert actual==expected, f'model checksum mismatch: {actual}'; print(f'model={p}'); print(f'size_bytes={p.stat().st_size}'); print(f'sha256={actual}')"
