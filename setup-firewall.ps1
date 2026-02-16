# MediaPlayer E1.31 - Windows Firewall Configuration
# This script configures Windows Firewall to allow sACN (E1.31) traffic
# 
# Usage: Run as Administrator
#   Right-click -> Run with PowerShell (as Administrator)
#   Or from elevated PowerShell: .\setup-firewall.ps1

# Requires administrative privileges
#Requires -RunAsAdministrator

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MediaPlayer E1.31 - Firewall Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ruleName = "MediaPlayer E1.31 - sACN Listener"
$port = 5568
$protocol = "UDP"

# Check if rule already exists
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if ($existingRule) {
    Write-Host "Firewall rule already exists. Removing old rule..." -ForegroundColor Yellow
    Remove-NetFirewallRule -DisplayName $ruleName
}

# Create new firewall rule for inbound sACN traffic
Write-Host "Creating firewall rule..." -ForegroundColor Green
Write-Host "  Rule Name: $ruleName"
Write-Host "  Protocol: $protocol"
Write-Host "  Port: $port"
Write-Host "  Direction: Inbound"
Write-Host ""

try {
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Description "Allows MediaPlayer E1.31 to receive sACN (E1.31) DMX data over UDP port 5568" `
        -Direction Inbound `
        -Protocol $protocol `
        -LocalPort $port `
        -Action Allow `
        -Profile Any `
        -Enabled True | Out-Null
    
    Write-Host "SUCCESS: Firewall rule created successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "MediaPlayer E1.31 can now receive sACN traffic on UDP port $port" -ForegroundColor Cyan
} catch {
    Write-Host "ERROR: Failed to create firewall rule!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Configuration Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
