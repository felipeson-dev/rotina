# OCR do próprio Windows (Windows.Media.Ocr): lê o texto de uma imagem e devolve as linhas com a posição (y, altura).
# Uso: powershell -File ocr.ps1 <pasta_com_imagens> <saida.json>    (processa todos os .gif/.png/.jpg da pasta)
param([string]$pasta, [string]$saida)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$tipo) { $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$lang = [Windows.Globalization.Language]::new('pt-BR')
$motor = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
if (-not $motor) { $motor = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
if (-not $motor) { Write-Error 'OCR indisponível'; exit 1 }
$res = @{}
$arquivos = Get-ChildItem $pasta -File | ? { $_.Extension -in '.gif', '.png', '.jpg' }
foreach ($a in $arquivos) {
  try {
    $f = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($a.FullName)) ([Windows.Storage.StorageFile])
    $s = Await ($f.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($s)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $r = Await ($motor.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
    $linhas = foreach ($l in $r.Lines) { $w0 = @($l.Words)[0]; if ($w0) { $b = $w0.BoundingRect; @{ t = $l.Text; y = [int]$b.Y; x = [int]$b.X; h = [int]$b.Height } } }
    $res[$a.Name] = @{ w = $dec.PixelWidth; h = $dec.PixelHeight; linhas = @($linhas) }
    $s.Dispose()
  } catch { $res[$a.Name] = @{ erro = $_.Exception.Message } }
}
$res | ConvertTo-Json -Depth 6 -Compress | Out-File $saida -Encoding utf8
