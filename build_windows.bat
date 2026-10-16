@echo off
REM Gera a pasta dist\FlightPlotter com FlightPlotter.exe (arranque rapido)
REM Requisitos: Python 3.11+ instalado (com "Add to PATH")
cd /d "%~dp0"
echo [1/3] A instalar dependencias...
python -m pip install --upgrade pip >nul
python -m pip install -r requirements.txt
if errorlevel 1 goto :erro
echo [2/3] A gerar executavel...
python -m PyInstaller --noconfirm --clean --onedir --windowed --name FlightPlotter ^
  --add-data "ui;ui" --add-data "data;data" --collect-all duckdb --collect-all webview --hidden-import openpyxl app.py
if errorlevel 1 goto :erro
echo [3/3] Concluido: pasta dist\FlightPlotter (correr FlightPlotter.exe la dentro)
pause
exit /b 0
:erro
echo.
echo *** Ocorreu um erro. Copia o texto acima e envia ao Claude. ***
pause
exit /b 1
