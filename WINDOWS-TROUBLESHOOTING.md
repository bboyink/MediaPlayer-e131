# Windows Troubleshooting Guide

## Installation Issues

### Visual C++ Build Tools Not Found

**Error:** `error: linker 'link.exe' not found`

**Solution:**
1. Install [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
2. During installation, select "Desktop development with C++"
3. Restart your terminal/PowerShell
4. Verify: Run `cl` in PowerShell (should show Microsoft C++ Compiler)

### WebView2 Runtime Missing

**Error:** Application fails to start or shows blank window

**Solution:**
1. Download [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
2. Install the Evergreen Standalone Installer
3. Restart the application

## Network Issues

### sACN Not Receiving Data

**Symptoms:**
- DMX monitor shows no values
- No media playing despite console sending data

**Solutions:**

#### 1. Check Windows Firewall
```powershell
# Run as Administrator
.\setup-firewall.ps1
```

Or manually:
- Open Windows Defender Firewall
- Click "Allow an app through firewall"
- Add exception for StagePlayer DMX
- Allow both Private and Public networks

#### 2. Verify Network Adapter
```powershell
# List network adapters with IPv4 addresses
Get-NetAdapter | Where-Object {$_.Status -eq "Up"} | Get-NetIPAddress -AddressFamily IPv4
```

Make sure you're connected to the same network as your lighting console.

#### 3. Check Multicast Support

Some network adapters or switches don't support multicast. Try:
- Use a direct Ethernet connection
- Enable IGMP snooping on your switch
- Use unicast sACN instead of multicast

#### 4. Disable Other Firewall Software

Third-party antivirus/firewall (Norton, McAfee, etc.) may block UDP:
- Add exception for UDP port 5568
- Temporarily disable to test

### Network Performance Issues

**Symptom:** Choppy or delayed video playback

**Solutions:**
- Use dedicated network adapter for sACN
- Disable WiFi power saving:
  ```powershell
  # Run as Administrator
  powercfg /change standby-timeout-ac 0
  powercfg /setactive scheme_min
  ```
- Use wired Ethernet instead of WiFi
- Reduce network traffic on the interface

## Display Issues

### Output Window Not Appearing

**Solutions:**

1. **Check Display Settings:**
   - Right-click Desktop → Display Settings
   - Ensure displays are in "Extend" mode (not "Duplicate")
   - Note the monitor position/arrangement

2. **Try Primary Monitor:**
   - Configure output to use Monitor 1 (primary)
   - Verify it works before trying secondary monitors

3. **Check Taskbar Settings:**
   - Taskbar might be hiding the window
   - Press `Alt + Tab` to switch to output window
   - Set "skip_taskbar" to false temporarily for debugging

### Wrong Monitor or Position

**Solutions:**
1. Check Windows Display Settings for correct monitor numbering
2. In the app, try different display indices
3. Adjust monitor arrangement in Windows settings
4. Use preview mode first to verify before going to production mode

### Video Scaling Issues

**Symptom:** Video appears stretched or cropped

**Solutions:**
1. Set Windows display scaling to 100%:
   - Display Settings → Scale and layout → 100%
2. Match resolution in app to physical monitor resolution
3. Use native resolution of target display

### Black Screen on Output

**Causes & Solutions:**

1. **Codec Issue:**
   - Ensure videos are H.264 encoded
   - Convert with HandBrake or FFmpeg:
     ```powershell
     ffmpeg -i input.mp4 -c:v libx264 -preset fast -crf 23 output.mp4
     ```

2. **File Path Issue:**
   - Use absolute paths (e.g., `C:\Media\Clips\`)
   - Avoid special characters in folder/file names
   - Ensure folder has read permissions

3. **WebView2 Issue:**
   - Update WebView2 Runtime
   - Clear WebView2 cache:
     ```powershell
     Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Service Worker"
     ```

## Performance Issues

### High CPU Usage

**Solutions:**
1. **Update GPU Drivers:**
   - NVIDIA: GeForce Experience
   - AMD: Radeon Software
   - Intel: Intel Driver Support Assistant

2. **Enable Hardware Acceleration:**
   - Enabled by default in WebView2
   - Verify in Task Manager → Performance tab → GPU activity

3. **Optimize Video Files:**
   - Use H.264 (not H.265/HEVC for better compatibility)
   - Reduce bitrate: 8-10 Mbps for 1080p is sufficient
   - Use progressive (not interlaced) encoding

### High Memory Usage

**Solutions:**
1. Reduce number of loaded media files
2. Use smaller resolution images (1920×1080 max)
3. Close other applications
4. Add more RAM (min. 8GB recommended, 16GB ideal)

## Build Issues

### Build Fails with "Out of Memory"

**Solution:**
```powershell
# Increase Node.js heap size
$env:NODE_OPTIONS="--max-old-space-size=4096"
npm run tauri:build
```

### Slow Build Times

**Normal Behavior:**
- First build: 10-15 minutes (downloads and compiles all Rust dependencies)
- Subsequent builds: 2-5 minutes (incremental compilation)

**To Speed Up:**
1. Use SSD for project folder
2. Exclude project folder from antivirus scans
3. Close other applications during build

### "error: cannot find -lwindows"

**Solution:**
```powershell
# Update Rust and dependencies
rustup update
cd src-tauri
cargo clean
cargo update
cd ..
npm run tauri:build
```

## Runtime Errors

### Application Crashes on Startup

1. **Check Event Viewer:**
   ```
   Windows Logs → Application
   ```
   Look for errors from "mediaplayer-e131"

2. **Run from Command Line:**
   ```powershell
   cd src-tauri\target\release
   .\mediaplayer-e131.exe
   ```
   See if any error messages appear

3. **Enable Debug Logging:**
   ```powershell
   $env:RUST_LOG="debug"
   npm run tauri:dev
   ```

### "Failed to Load Config" Error

**Solution:**
Delete corrupted config file:
```powershell
Remove-Item "$env:APPDATA\com.bboyink.mediaplayer-e131\config.json"
```
Application will create a new default config on next start.

## Development Issues

### Hot Reload Not Working

**Solutions:**
1. Restart dev server: `Ctrl+C`, then `npm run tauri:dev`
2. Clear Vite cache:
   ```powershell
   Remove-Item -Recurse -Force node_modules\.vite
   ```
3. Check if port 1420 is in use:
   ```powershell
   Get-NetTCPConnection -LocalPort 1420
   ```

### TypeScript Errors in VS Code

**Solution:**
```powershell
# Reload TypeScript server
# In VS Code: Ctrl+Shift+P → "TypeScript: Restart TS Server"

# Or rebuild TypeScript
npm run build
```

## Getting More Help

### Enable Detailed Logging

```powershell
# Backend (Rust) logs
$env:RUST_LOG="trace"

# Frontend DevTools
# Press F12 in the application window
```

### Collect Diagnostic Information

```powershell
# System info
systeminfo | Select-String "OS Name","OS Version","System Type"

# Network adapters
Get-NetAdapter | Format-Table Name,Status,LinkSpeed

# Firewall rules
Get-NetFirewallRule -DisplayName "*MediaPlayer*" | Format-List

# Rust version
rustc --version
cargo --version

# Node version
node --version
npm --version
```

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `Address already in use` | Port 1420 in use | Close other Vite instances |
| `Failed to build window` | Invalid display index | Check display configuration |
| `Permission denied` | Firewall blocking | Run setup-firewall.ps1 |
| `Video format not supported` | Wrong codec | Convert to H.264 |
| `Failed to load config` | Corrupted config file | Delete config.json in AppData |

## Still Having Issues?

1. Check the [GitHub Issues](https://github.com/bboyink/mediaplayer-e131/issues)
2. Provide the following information:
   - Windows version (`winver`)
   - Error messages
   - Steps to reproduce
   - Output from diagnostic commands above
