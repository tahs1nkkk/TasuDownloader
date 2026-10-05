param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
    [string]$SpotifyProject,
    [string]$PythonPath
)
$ErrorActionPreference = 'Stop'
$tasuRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$tasuData = Join-Path $env:LOCALAPPDATA 'TasuApps\Music'
New-Item -ItemType Directory -Path $tasuData -Force | Out-Null
if (-not $SpotifyProject) { $SpotifyProject = Join-Path (Split-Path (Split-Path $tasuRoot -Parent) -Parent) 'spotify-downloader' }
if ($SpotifyProject -and -not (Test-Path -LiteralPath (Join-Path $SpotifyProject 'backend\config.py'))) {
    throw 'SpotifyProject geçerli eski spotify-downloader klasörü olmalı.'
}
if (-not $PythonPath) {
    $tasuLegacyPython = Join-Path $SpotifyProject '.venv\Scripts\python.exe'
    if (Test-Path -LiteralPath $tasuLegacyPython) { $PythonPath = $tasuLegacyPython }
    else { $PythonPath = (Get-Command python -ErrorAction Stop).Source }
}
$tasuPython = (Resolve-Path -LiteralPath $PythonPath).Path
& $tasuPython -c 'import flask, yt_dlp, spotipy, mutagen, dotenv, requests, imageio_ffmpeg'
if ($LASTEXITCODE -ne 0) { throw 'Python bağımlılıkları eksik. vendor/requirements.txt dosyasındaki paketleri seçtiğin Python ortamına kur.' }
$tasuOrigin = "chrome-extension://$ExtensionId/"
$tasuLauncher = Join-Path $tasuData 'launcher.cmd'
$tasuRuntimeFiles = @('host.py','engine.py','runtime.py','protocol.py','journal.py','backend_adapter.py','options.py')
foreach ($tasuRuntimeFile in $tasuRuntimeFiles) {
    Copy-Item -LiteralPath (Join-Path $tasuRoot $tasuRuntimeFile) -Destination (Join-Path $tasuData $tasuRuntimeFile) -Force
}
Copy-Item -LiteralPath (Join-Path $tasuRoot 'vendor') -Destination $tasuData -Recurse -Force
$tasuHost = Join-Path $tasuData 'host.py'
foreach ($tasuValue in @($tasuPython,$tasuHost)) {
    if ($tasuValue -match '[%\r\n]') { throw 'Kurulum yolunda desteklenmeyen karakter var.' }
}
$tasuCmd = "@echo off`r`n`"$tasuPython`" `"$tasuHost`" %*`r`n"
[IO.File]::WriteAllText($tasuLauncher,$tasuCmd,[Text.UTF8Encoding]::new($false))
$tasuManifest = Join-Path $tasuData 'com.tasuapps.music.json'
$tasuConfig = @{ name='com.tasuapps.music'; description='Tasu Apps local music bridge'; path=$tasuLauncher; type='stdio'; allowed_origins=@($tasuOrigin) } | ConvertTo-Json
[IO.File]::WriteAllText($tasuManifest,$tasuConfig,[Text.UTF8Encoding]::new($false))
$tasuInstall = @{ source_project=([IO.Path]::GetFullPath($SpotifyProject)); version=1 } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $tasuData 'installation.json'),$tasuInstall,[Text.UTF8Encoding]::new($false))
$tasuRegistry = 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.tasuapps.music'
New-Item -Path $tasuRegistry -Force | Out-Null
Set-Item -LiteralPath $tasuRegistry -Value $tasuManifest
# Keep the source-side descriptor in sync for existing brokers and diagnostics.
[IO.File]::WriteAllText((Join-Path $tasuRoot 'com.tasuapps.music.json'),$tasuConfig,[Text.UTF8Encoding]::new($false))
if ((Get-Item -LiteralPath $tasuRegistry).GetValue('') -ne $tasuManifest -or -not (Test-Path -LiteralPath $tasuLauncher)) {
    throw 'Windows yardımcı kaydı doğrulanamadı.'
}
Write-Output 'Tasu Apps müzik yardımcısı bu Windows kullanıcısı için kuruldu. Yönetici yetkisi gerekmez.'
Write-Output 'Eklentide Müzik ekranını tekrar aç. Python ortamını veya eski Spotify proje klasörünü taşımamalısın.'
