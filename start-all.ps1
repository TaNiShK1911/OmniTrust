# Cleanup old processes on ports 8000, 5001, 5173, 5174
Write-Host "Freeing ports 8000, 5001, 5173, 5174..." -ForegroundColor Yellow
foreach ($port in @(8000, 5001, 5173, 5174)) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conns) {
        $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($p in $pids) {
            if ($p -ne 0) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
        }
    }
}

$Root = $PSScriptRoot

Write-Host "Starting OmniTrust Backend on port 8000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\backend'; .\.venv\Scripts\uvicorn app.main:app --reload --port 8000"

Write-Host "Starting Mock Logistics Backend on port 5001..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\mock-logistics\backend'; .\.venv\Scripts\python main.py"

Write-Host "Starting OmniTrust Frontend on port 5173..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\frontend'; npm run dev"

Write-Host "Starting Mock Logistics Frontend on port 5174..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$Root\mock-logistics\frontend'; npm run dev -- --port 5174"

Write-Host "`nAll 4 services launched in separate windows!" -ForegroundColor Green
Write-Host "- OmniTrust Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "- OmniTrust Backend: http://localhost:8000/docs" -ForegroundColor White
Write-Host "- Mock Logistics Frontend: http://localhost:5174" -ForegroundColor White
Write-Host "- Mock Logistics Backend: http://localhost:5001/docs" -ForegroundColor White
