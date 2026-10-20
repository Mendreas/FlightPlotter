@echo off
cd /d "%~dp0"
echo A iniciar FlightPlotter em servidor local...
echo.
echo Nao abra o index.html por duplo clique. Use este ficheiro.
echo.
start "" cmd /c "timeout /t 1 >nul & start "" "http://localhost:8000/index.html""
python -m http.server 8000
pause
