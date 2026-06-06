@echo off
setlocal
cd /d "%~dp0"
set OUT=backlink-outreach-deploy.zip
if exist "%OUT%" del "%OUT%"
powershell -NoProfile -Command ^
  "Compress-Archive -Path 'src','public','package.json','package-lock.json','README.md' -DestinationPath '%OUT%' -Force"
echo Created %OUT% — upload this in hPanel Node.js Web App
