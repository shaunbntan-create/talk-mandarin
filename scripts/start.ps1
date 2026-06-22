# Boot the full Huaban local stack on Windows. Each piece opens in its own window;
# close a window to stop that piece. Paths are derived from this script's location.
#
# The NVIDIA speech server (window 4) needs WSL + an NVIDIA GPU + the ~/nemo-asr venv
# (see asr_server/server.py). If you don't have that, just close window 4 - the app
# falls back to in-browser speech recognition ("browser ears") automatically.

$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent $PSScriptRoot
Write-Host "Huaban: $repo"

# repo as a WSL mount path:  D:\Projects\x  ->  /mnt/d/Projects/x
$drive = $repo.Substring(0, 1).ToLower()
$wslRepo = "/mnt/$drive" + ($repo.Substring(2) -replace '\\', '/')

# 1) OpenCode gateway, in a clean empty dir (keeps its context small)
$ocDir = Join-Path $env:TEMP "oc-clean-root"
New-Item -ItemType Directory -Force -Path $ocDir | Out-Null
Start-Process powershell -ArgumentList '-NoExit', '-Command',
  "`$env:Path = `"$env:APPDATA\npm;`$env:Path`"; Set-Location '$ocDir'; opencode serve --port 4097 --hostname 127.0.0.1"
Start-Sleep -Seconds 2

# 2) OpenAI -> OpenCode bridge
Start-Process powershell -ArgumentList '-NoExit', '-Command',
  "Set-Location '$repo'; `$env:OC_URL='http://127.0.0.1:4097'; `$env:BRIDGE_PORT='8788'; node server/opencode-bridge.mjs"

# 3) The app (web :5180 + api :8787)
Start-Process powershell -ArgumentList '-NoExit', '-Command',
  "Set-Location '$repo'; npm run dev"

# 4) NVIDIA speech server (WSL + GPU). Optional - close this window for browser ears.
Start-Process powershell -ArgumentList '-NoExit', '-Command',
  "wsl -e bash -lc `"cd ~/nemo-asr && . .venv/bin/activate && ASR_PORT=8799 python $wslRepo/asr_server/server.py`""

Start-Sleep -Seconds 3
Write-Host "Opening http://localhost:5180 ..."
Start-Process "http://localhost:5180"
