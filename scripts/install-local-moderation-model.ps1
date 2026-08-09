param(
  [string]$InstallRoot = "F:\Dev\Amoria-Models\opennsfw-onnx-0.1.0",
  [string]$PersonInstallRoot = "F:\Dev\Amoria-Models\person-presence-v1",
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

New-Item -ItemType Directory -Force -Path $PersonInstallRoot | Out-Null

function Install-VerifiedModel {
  param(
    [string]$Uri,
    [string]$Destination,
    [string]$ExpectedSha256
  )

  if (Test-Path -LiteralPath $Destination) {
    $installedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash.ToLowerInvariant()
    if ($installedHash -eq $ExpectedSha256) {
      return
    }
  }

  $downloadPath = "$Destination.download"
  Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $downloadPath
  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $downloadPath).Hash.ToLowerInvariant()
  if ($actualHash -ne $ExpectedSha256) {
    Remove-Item -LiteralPath $downloadPath -Force
    throw "Model checksum mismatch for $Destination`: $actualHash"
  }
  Move-Item -LiteralPath $downloadPath -Destination $Destination -Force
}

$yoloxPath = Join-Path $PersonInstallRoot "yolox_nano.onnx"
$yunetPath = Join-Path $PersonInstallRoot "face_detection_yunet_2023mar.onnx"
Install-VerifiedModel `
  -Uri "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx" `
  -Destination $yoloxPath `
  -ExpectedSha256 "c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d"
Install-VerifiedModel `
  -Uri "https://media.githubusercontent.com/media/opencv/opencv_zoo/f12e12798e8314f7c074a6656816c048dcc95b7a/models/face_detection_yunet/face_detection_yunet_2023mar.onnx" `
  -Destination $yunetPath `
  -ExpectedSha256 "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"

Get-Item -LiteralPath $yoloxPath, $yunetPath | ForEach-Object {
  $sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
  Write-Output "person_model=$($_.FullName)"
  Write-Output "size_bytes=$($_.Length)"
  Write-Output "sha256=$sha256"
}
