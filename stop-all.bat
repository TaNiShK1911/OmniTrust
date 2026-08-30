@echo off
echo Stopping any running OmniTrust & Mock Logistics processes on ports 8000, 5001, 5173, 5174...

powershell -Command "foreach ($port in @(8000, 5001, 5173, 5174)) { $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue; if ($conns) { $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($p in $pids) { if ($p -ne 0) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Write-Host \"Killed PID $p on port $port\" } } } }"

echo Done! All ports cleared.
