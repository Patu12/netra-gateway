# Netra Gateway - WireGuard Setup Script
# Run as Administrator

$WG_PATH = "C:\Program Files\WireGuard"
$WG_EXE = "$WG_PATH\wg.exe"
$CONFIG_DIR = "$PSScriptRoot\..\config"
$CONFIG_FILE = "$CONFIG_DIR\wg0.conf"

Write-Host "=== Netra Gateway WireGuard Setup ===" -ForegroundColor Cyan

# Check if WireGuard is installed
if (-not (Test-Path $WG_EXE)) {
    Write-Host "ERROR: WireGuard not found at $WG_EXE" -ForegroundColor Red
    Write-Host "Please install WireGuard from https://wireguard.com/install" -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/3] WireGuard CLI found..." -ForegroundColor Green

# Copy config to WireGuard folder
$WINDOWS_CONFIG_PATH = "$env:USERPROFILE\AppData\Local\WireGuard\Configurations"
if (-not (Test-Path $WINDOWS_CONFIG_PATH)) {
    New-Item -ItemType Directory -Path $WINDOWS_CONFIG_PATH -Force | Out-Null
}

# Create unique name based on timestamp
$TUNNEL_NAME = "NetraGateway"
$TARGET_CONFIG = "$WINDOWS_CONFIG_PATH\$TUNNEL_NAME.conf"

Write-Host "[2/3] Copying configuration..."
Copy-Item -Path $CONFIG_FILE -Destination $TARGET_CONFIG -Force

Write-Host "[3/3] Activating WireGuard tunnel..."
& $WG_EXE show

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host "Tunnel Name: $TUNNEL_NAME"
Write-Host "Config Location: $TARGET_CONFIG"
Write-Host ""
Write-Host "To activate the tunnel manually, run:" -ForegroundColor Yellow
Write-Host "  & '$WG_EXE' setconf wg0 $TARGET_CONFIG"
Write-Host ""
Write-Host "Or open the WireGuard GUI and activate 'NetraGateway' tunnel"
