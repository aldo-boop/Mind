@echo off
rem Repara Mind sin ZIP guardado: baja de nuevo la copia oficial firmada y restaura solo lo oficial.
rem Con MIND_PEDIDO (pedido reparar-local) usa esta carpeta como copia oficial, sin red.
setlocal
if defined MIND_PEDIDO goto local
set "MIND_DESTINO=%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -Command "irm https://raw.githubusercontent.com/byaldodaniel/Mind/main/instalar.ps1 | iex"
exit /b %errorlevel%
:local
call "%~dp0Mind.cmd"
exit /b %errorlevel%
