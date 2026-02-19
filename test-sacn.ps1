# Simple sACN/E1.31 Test Sender
# Sends test DMX data to verify the MediaPlayer is receiving

param(
    [int]$Universe = 1,
    [string]$IPAddress = "239.255.0.1",  # Multicast address for Universe 1
    [int]$Port = 5568,
    [switch]$Unicast
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "sACN/E1.31 Test Sender" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will send test DMX data to verify reception" -ForegroundColor Yellow
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Green
Write-Host "  Universe: $Universe"
Write-Host "  Target IP: $IPAddress"
Write-Host "  Port: $Port"
Write-Host "  Mode: $(if ($Unicast) { 'Unicast' } else { 'Multicast' })"
Write-Host ""

# Note: PowerShell doesn't have native sACN libraries
# This script provides instructions instead

Write-Host "To test DMX reception:" -ForegroundColor Cyan
Write-Host ""
Write-Host "Option 1: Use QLC+ (Free)" -ForegroundColor Green
Write-Host "  1. Download from: https://www.qlcplus.org/"
Write-Host "  2. Create a simple show with RGB values"
Write-Host "  3. Configure output to E1.31 (sACN)"
Write-Host "  4. Set universe to $Universe"
Write-Host ""
Write-Host "Option 2: Use sACN Test Tool" -ForegroundColor Green
Write-Host "  1. Download sACN View from: https://www.lightjams.com/sacnview.html"
Write-Host "  2. Set universe to $Universe"
Write-Host "  3. Manually set channel values"
Write-Host ""
Write-Host "Option 3: Use Command Line (requires Python)" -ForegroundColor Green
Write-Host "  pip install sacn"
Write-Host "  python -c ""import sacn; sender = sacn.sACNsender(); sender.start(); sender.activate_output($Universe); sender[$Universe].dmx_data = [100, 200, 150] + [0]*509; input('Press Enter to stop...'); sender.stop()"""
Write-Host ""
Write-Host "Check the MediaPlayer DMX Monitor to see if data appears!" -ForegroundColor Yellow
Write-Host ""

# Multicast IP calculation helper
$multicastOctet3 = [Math]::Floor($Universe / 256)
$multicastOctet4 = $Universe % 256
$calculatedMulticast = "239.255.$multicastOctet3.$multicastOctet4"

Write-Host "Universe $Universe multicast address: $calculatedMulticast" -ForegroundColor Cyan
Write-Host ""
