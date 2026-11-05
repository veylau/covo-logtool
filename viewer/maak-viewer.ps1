# Stelt viewer/covo-viewer.html samen: index.html met de CSS en alle JavaScript ingebakken,
# in alleen-lezen-modus. Opnieuw uitvoeren na elke wijziging aan de tool.
# Gebruik (in PowerShell, vanuit de map covo-logtool):  .\viewer\maak-viewer.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$utf8 = New-Object System.Text.UTF8Encoding $false
$lees = { param($pad) [IO.File]::ReadAllText((Join-Path $root $pad), $utf8) }

$html = & $lees 'index.html'
$html = $html.Replace('<title>COVO-logtool</title>', '<title>COVO-log (alleen-lezen)</title>')
$html = $html.Replace('<link rel="stylesheet" href="css/style.css">', "<style>`n" + (& $lees 'css/style.css') + "`n</style>")

$scripts = [regex]::Matches($html, '<script src="(js/[^"]+)"></script>')
if ($scripts.Count -eq 0) { throw 'Geen scripts gevonden in index.html.' }
$eerste = $true
foreach ($m in $scripts) {
  $code = & $lees $m.Groups[1].Value
  $vooraf = if ($eerste) { "<script>window.COVO_VIEWER = true;</script>`n  " } else { '' }
  $html = $html.Replace($m.Value, "$vooraf<script>/* $($m.Groups[1].Value) */`n$code`n</script>")
  $eerste = $false
}

$uit = Join-Path $PSScriptRoot 'covo-viewer.html'
[IO.File]::WriteAllText($uit, $html, $utf8)
"Gemaakt: $uit ($([math]::Round((Get-Item $uit).Length / 1KB)) KB, $($scripts.Count) scripts ingebakken)"
