Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path (Get-Location) 'assets/icons'
New-Item -ItemType Directory -Force -Path $iconDirectory | Out-Null
foreach ($iconSize in @(180, 192, 256, 512)) {
    $bitmap = [System.Drawing.Bitmap]::new($iconSize, $iconSize)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform($iconSize / 512.0, $iconSize / 512.0)
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#16a34a'))
    $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $green = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#166534'))
    $light = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#bbf7d0'))
    $graphics.FillRectangle($white, 146, 130, 220, 274)
    $graphics.FillRectangle($green, 179, 302, 130, 12)
    $graphics.FillRectangle($green, 179, 335, 154, 12)
    $graphics.FillRectangle($green, 179, 368, 94, 12)
    $leaf = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $leaf.AddBezier(218, 268, 199, 190, 258, 148, 320, 160)
    $leaf.AddBezier(320, 160, 325, 225, 288, 272, 218, 268)
    $graphics.FillPath($green, $leaf)
    $pen = [System.Drawing.Pen]::new($light.Color, 8)
    $graphics.DrawLine($pen, 229, 254, 298, 181)
    $fileName = "app-$iconSize.png"
    if ($iconSize -eq 180) { $fileName = 'apple-touch-icon.png' }
    $bitmap.Save((Join-Path $iconDirectory $fileName), [System.Drawing.Imaging.ImageFormat]::Png)
    $pen.Dispose(); $leaf.Dispose(); $white.Dispose(); $green.Dispose(); $light.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
