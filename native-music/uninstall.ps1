$ErrorActionPreference = 'Stop'
$tasuRegistry = 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.tasuapps.music'
if (Test-Path -LiteralPath $tasuRegistry) { Remove-Item -LiteralPath $tasuRegistry }
Write-Output 'Yalnızca Tasu Apps Native Messaging kaydı kaldırıldı. İndirilenler, hesap ayarları ve iş geçmişi korundu.'
