param(
  [string]$InstallRoot = "F:\Dev\Amoria-Models\text-moderation-v1",
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$requirements = Join-Path $repoRoot "moderation-worker\text-requirements.lock"
$venvPython = Join-Path $InstallRoot "Scripts\python.exe"
$modelRoot = Join-Path $InstallRoot "model"
$revision = "87059f2f26f113930e3c840b4bf7d5de0a4a1944"

if (-not (Test-Path -LiteralPath $venvPython)) {
  & $Python -m venv $InstallRoot
}
& $venvPython -m pip install --disable-pip-version-check -r $requirements
New-Item -ItemType Directory -Force -Path $modelRoot | Out-Null

function Install-VerifiedTextModelFile {
  param(
    [string]$Name,
    [string]$ExpectedSha256
  )
  $destination = Join-Path $modelRoot $Name
  if (Test-Path -LiteralPath $destination) {
    $installedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash.ToLowerInvariant()
    if ($installedHash -eq $ExpectedSha256) { return }
  }
  $downloadPath = "$destination.download"
  $uri = "https://huggingface.co/hoan/multilingual-toxic-xlm-roberta-dynamic-quantized/resolve/$revision/$Name"
  Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $downloadPath
  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $downloadPath).Hash.ToLowerInvariant()
  if ($actualHash -ne $ExpectedSha256) {
    Remove-Item -LiteralPath $downloadPath -Force
    throw "Model checksum mismatch for $Name`: $actualHash"
  }
  Move-Item -LiteralPath $downloadPath -Destination $destination -Force
}

Install-VerifiedTextModelFile -Name "model_quantized.onnx" -ExpectedSha256 "783cfd05a5986af42c70923789b206afd5a9c9f3cc1220fabd1e4d8cb183e875"
Install-VerifiedTextModelFile -Name "sentencepiece.bpe.model" -ExpectedSha256 "cfc8146abe2a0488e9e2a0c56de7952f7c11ab059eca145a0a727afce0db2865"

Get-Item -LiteralPath (Join-Path $modelRoot "model_quantized.onnx"), (Join-Path $modelRoot "sentencepiece.bpe.model") | ForEach-Object {
  $sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()
  Write-Output "text_model_file=$($_.FullName)"
  Write-Output "size_bytes=$($_.Length)"
  Write-Output "sha256=$sha256"
}
