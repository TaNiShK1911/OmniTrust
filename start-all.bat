@echo off
echo Cleaning up any old processes on ports 8000, 5001, 5173, 5174...
powershell -Command "foreach ($port in @(8000, 5001, 5173, 5174)) { $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue; if ($conns) { $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($p in $pids) { if ($p -ne 0) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } } } }"

echo Starting OmniTrust and Mock Logistics services in dedicated windows...

start "OmniTrust Backend (8000)" cmd /k "cd /d %~dp0backend && .\.venv\Scripts\uvicorn app.main:app --reload --port 8000"
start "Mock Logistics Backend (5001)" cmd /k "cd /d %~dp0mock-logistics\backend && .\.venv\Scripts\python main.py"
start "OmniTrust Frontend (5173)" cmd /k "cd /d %~dp0frontend && npm run dev"
start "Mock Logistics Frontend (5174)" cmd /k "cd /d %~dp0mock-logistics\frontend && npm run dev -- --port 5174"

echo.
echo All 4 services started in separate windows!
echo - OmniTrust Frontend: http://localhost:5173
echo - OmniTrust Backend (Swagger API): http://localhost:8000/docs
echo - Mock Logistics Frontend: http://localhost:5174
echo - Mock Logistics Backend (Swagger API): http://localhost:5001/docs
echo.
