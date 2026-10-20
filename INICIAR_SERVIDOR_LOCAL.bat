@echo off
cd /d "%~dp0"
echo A iniciar servidor local em http://localhost:8000/
echo.
echo Se aparecer erro de porta ocupada, feche esta janela e altere a porta no comando.
echo.
python -m http.server 8000
pause
