@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Virtuelle Umgebung fehlt. Bitte zuerst ausfuehren:
  echo   python -m venv .venv
  echo   .venv\Scripts\pip install -r requirements.txt
  exit /b 1
)
".venv\Scripts\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port 8080 %*
