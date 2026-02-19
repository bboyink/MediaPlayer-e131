#!/usr/bin/env pwsh
# sACN Test Script for MediaPlayer
# This script helps you test the sACN functionality with a loopback sender

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "MediaPlayer sACN Test Script" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script provides test commands for sACN loopback testing." -ForegroundColor Yellow
Write-Host "Make sure the MediaPlayer app is running before using these commands." -ForegroundColor Yellow
Write-Host ""

# Test configuration
$UNIVERSE = 1
$START_CHANNEL = 1  # Starting at channel 1

Write-Host "Configuration:" -ForegroundColor Green
Write-Host "  Universe: $UNIVERSE"
Write-Host "  Test Channels: $START_CHANNEL, $($START_CHANNEL + 1), $($START_CHANNEL + 2)"
Write-Host ""

# Instructions for using the test commands via browser console
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Test Instructions" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Make sure the app is running (npm run tauri:dev)" -ForegroundColor White
Write-Host ""
Write-Host "2. Start the sACN listener in the app first" -ForegroundColor White
Write-Host ""
Write-Host "3. Open the browser DevTools Console (F12) in the app" -ForegroundColor White
Write-Host ""
Write-Host "4. Use these JavaScript commands to test:" -ForegroundColor White
Write-Host ""

Write-Host "// Create test sender (run once)" -ForegroundColor Gray
Write-Host "await window.__TAURI__.core.invoke('create_test_sender', { universe: $UNIVERSE });" -ForegroundColor Yellow
Write-Host ""

Write-Host "// Send test to 3 channels starting at channel $START_CHANNEL" -ForegroundColor Gray
Write-Host "// (clip=100, dimmer=255, playtype=1)" -ForegroundColor Gray
Write-Host "await window.__TAURI__.core.invoke('send_test_three_channels', {" -ForegroundColor Yellow
Write-Host "  startChannel: $START_CHANNEL," -ForegroundColor Yellow
Write-Host "  clipValue: 100," -ForegroundColor Yellow
Write-Host "  dimmerValue: 255," -ForegroundColor Yellow
Write-Host "  playtypeValue: 1" -ForegroundColor Yellow
Write-Host "});" -ForegroundColor Yellow
Write-Host ""

Write-Host "// Send test to a single channel" -ForegroundColor Gray
Write-Host "await window.__TAURI__.core.invoke('send_test_dmx', {" -ForegroundColor Yellow
Write-Host "  channel: $START_CHANNEL," -ForegroundColor Yellow
Write-Host "  value: 128" -ForegroundColor Yellow
Write-Host "});" -ForegroundColor Yellow
Write-Host ""

Write-Host "// Send a sequence of values (e.g., ramp up clip channel)" -ForegroundColor Gray
Write-Host "await window.__TAURI__.core.invoke('send_test_sequence', {" -ForegroundColor Yellow
Write-Host "  startChannel: $START_CHANNEL," -ForegroundColor Yellow
Write-Host "  values: [0, 50, 100, 150, 200, 250]," -ForegroundColor Yellow
Write-Host "  delayMs: 500" -ForegroundColor Yellow
Write-Host "});" -ForegroundColor Yellow
Write-Host ""

Write-Host "// Stop test sender when done" -ForegroundColor Gray
Write-Host "await window.__TAURI__.core.invoke('stop_test_sender', {});" -ForegroundColor Yellow
Write-Host ""

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Quick Test Examples" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Test 1: Basic 3-channel test (clip=50, dimmer=255, playtype=1)" -ForegroundColor Green
Write-Host "await window.__TAURI__.core.invoke('create_test_sender', { universe: $UNIVERSE });" -ForegroundColor Yellow
Write-Host "await window.__TAURI__.core.invoke('send_test_three_channels', { startChannel: $START_CHANNEL, clipValue: 50, dimmerValue: 255, playtypeValue: 1 });" -ForegroundColor Yellow
Write-Host ""

Write-Host "Test 2: Change clip value" -ForegroundColor Green
Write-Host "await window.__TAURI__.core.invoke('send_test_three_channels', { startChannel: $START_CHANNEL, clipValue: 100, dimmerValue: 255, playtypeValue: 1 });" -ForegroundColor Yellow
Write-Host ""

Write-Host "Test 3: Test dimmer fade (keeps clip at 100)" -ForegroundColor Green
Write-Host "for(let d = 0; d <= 255; d += 25) {" -ForegroundColor Yellow
Write-Host "  await window.__TAURI__.core.invoke('send_test_three_channels', {" -ForegroundColor Yellow
Write-Host "    startChannel: $START_CHANNEL, clipValue: 100, dimmerValue: d, playtypeValue: 1" -ForegroundColor Yellow
Write-Host "  });" -ForegroundColor Yellow
Write-Host "  await new Promise(r => setTimeout(r, 200));" -ForegroundColor Yellow
Write-Host "}" -ForegroundColor Yellow
Write-Host ""

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Advanced: Use fetch API (alternative)" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can also test from any browser or curl:" -ForegroundColor White
Write-Host ""
Write-Host "Note: Tauri uses IPC, not HTTP, so external testing" -ForegroundColor Yellow
Write-Host "requires the app's DevTools console as shown above." -ForegroundColor Yellow
Write-Host ""

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Ready to test!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Remember:" -ForegroundColor Yellow
Write-Host "  1. Start the app: npm run tauri:dev" -ForegroundColor White
Write-Host "  2. Start the sACN listener in the app UI" -ForegroundColor White
Write-Host "  3. Open DevTools (F12) and use the commands above" -ForegroundColor White
Write-Host "  4. Watch the console for DMX updates!" -ForegroundColor White
Write-Host ""
