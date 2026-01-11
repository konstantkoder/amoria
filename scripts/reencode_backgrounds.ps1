Add-Type -AssemblyName System.Drawing

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$targetWidth = 1080
$targetHeight = 1920

function Get-JpegEncoder {
  return [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq "image/jpeg" } |
    Select-Object -First 1
}

$encoder = Get-JpegEncoder

$jobs = @(
  @{
    Name = "hearts"
    Input = Join-Path $root "src/assets/backgrounds/hearts.png"
    Output = Join-Path $root "src/assets/backgrounds/hearts_fixed.jpg"
  },
  @{
    Name = "smoke"
    Input = Join-Path $root "src/assets/backgrounds/smoke.png"
    Output = Join-Path $root "src/assets/backgrounds/smoke_fixed.jpg"
  }
)

foreach ($job in $jobs) {
  if (-not (Test-Path $job.Input)) {
    Write-Error "Missing file: $($job.Input)"
    continue
  }

  $img = [System.Drawing.Image]::FromFile($job.Input)
  try {
    $oldW = $img.Width
    $oldH = $img.Height

    $bmp = New-Object System.Drawing.Bitmap $targetWidth, $targetHeight
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.Clear([System.Drawing.Color]::Black)
        $graphics.DrawImage($img, 0, 0, $targetWidth, $targetHeight)
      } finally {
        $graphics.Dispose()
      }

      $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters 1
      $qualityEncoder = [System.Drawing.Imaging.Encoder]::Quality
      $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter $qualityEncoder, 90L

      if (Test-Path $job.Output) {
        Remove-Item -Force $job.Output
      }

      $bmp.Save($job.Output, $encoder, $encoderParams)
    } finally {
      $bmp.Dispose()
    }

    Write-Host "$($job.Input): ${oldW}x${oldH} -> ${targetWidth}x${targetHeight} => $($job.Output)"
  } finally {
    $img.Dispose()
  }
}
