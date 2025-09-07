@echo off
cd /d "C:\Users\Petra\Desktop\AmoriaReady\AMORIA"

echo === Init repo ===
git init
git branch -M main

echo === Adding files ===
git add .

echo === Commit ===
git commit -m "Initial commit"

echo === Add remote ===
git remote add origin https://github.com/KostiantynDemidets/AmoriaApp.git

echo === Push to GitHub ===
git push -u origin main

pause
