@echo off
powershell -NoLogo -NonInteractive -ExecutionPolicy Bypass -File scripts/audit_deep.ps1
echo.
echo ==== Готово. Откройте папку audit ====
exit /b 0
