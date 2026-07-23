@echo off
rem TasuDownloader medya sunucusunu baslatir. Otomatik baslatma icin bu
rem dosyanin kisayolunu shell:startup klasorune koy (Win+R -> shell:startup).
cd /d "%~dp0"
node server.js
pause
