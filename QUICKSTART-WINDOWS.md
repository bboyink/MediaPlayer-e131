# StagePlayer DMX - Windows Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Prerequisites Check

Open PowerShell and verify:

```powershell
# Check Node.js (need 20+)
node --version

# Check Rust
rustc --version

# Check npm
npm --version
```

**Missing something?**
- Node.js: https://nodejs.org/ (Download LTS)
- Rust: https://rustup.rs/ (Download rustup-init.exe)
- Visual Studio Build Tools: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022

### Step 2: Quick Setup

```powershell
# Run the setup script
.\setup-dev.bat
```

Or manually:
```powershell
npm install
```

### Step 3: Configure Firewall (Important!)

Right-click `setup-firewall.ps1` → **Run with PowerShell as Administrator**

Or manually allow UDP port 5568 in Windows Firewall.

### Step 4: Start Development

```powershell
npm run tauri:dev
```

This opens the control interface. Wait 1-2 minutes for the first compilation.

### Step 5: Basic Configuration

1. **Set Universe**: Default is 1 (matches most lighting consoles)

2. **Configure Monitor 1**:
   - Start Channel: `1`
   - Clip Offset: `0` (clips will be on channel 1)
   - Dimmer Offset: `1` (dimmer will be on channel 2)
   - Click "Browse" → Select folder with media files
   - Resolution: Choose your monitor resolution (HD/4K)

3. **Prepare Media Files**:
   ```
   Your Media Folder/
   ├── 001.mp4  ← Will play when DMX channel 1 = value 1
   ├── 002.jpg  ← Will display when DMX channel 1 = value 2
   ├── 003.mp4
   └── ...
   ```

### Step 6: Test

**Option A: Use sACN View (Recommended)**
1. Download [sACN View](https://www.sacnview.org/)
2. Set Universe to 1
3. In Transmit tab, set Channel 1 to different values (1-10)
4. Set Channel 2 to 255 (full brightness)

**Option B: Watch in Preview Mode**
1. Click "Preview Mode: ON" in the app
2. Send sACN from your lighting console
3. See output in the preview panel

**Option C: Production Mode (Full Screen Output)**
1. Connect second monitor
2. Click "Production Mode: ON"
3. Output window appears full-screen on selected monitor

## 📦 Building an Installer

```powershell
# Build both MSI and NSIS installers
npm run tauri:build

# Takes 5-10 minutes first time
# Output: src-tauri\target\release\bundle\
```

**Installers:**
- `msi\StagePlayer DMX_0.1.0_x64_en-US.msi` - For enterprise deployment
- `nsis\StagePlayer DMX_0.1.0_x64-setup.exe` - For end users

## 🎯 Common First-Time Issues

### ❌ "sACN not receiving"
- Run `setup-firewall.ps1` as Administrator
- Check that you're on the same network as your console
- Verify universe number matches

### ❌ "Video won't play"
- Convert videos to H.264 format:
  ```powershell
  ffmpeg -i input.mp4 -c:v libx264 -preset fast -crf 23 output.mp4
  ```
- Name files with 3 digits: `001.mp4` not `1.mp4`

### ❌ "Output window not showing"
- Check Windows Display Settings → monitors are in "Extend" mode
- Try selecting a different display in the app
- Use Preview Mode first to verify setup

### ❌ "Build fails"
- Install Visual Studio Build Tools with C++ desktop development
- Restart PowerShell after installing Rust/Node
- Run `cargo clean` in src-tauri folder

## 📚 Next Steps

- **Full Documentation**: See [README.md](README.md)
- **Development Guide**: See [DEVELOPMENT.md](DEVELOPMENT.md)
- **Troubleshooting**: See [WINDOWS-TROUBLESHOOTING.md](WINDOWS-TROUBLESHOOTING.md)
- **Product Requirements**: See [PRD/sACN_Video_Playback_PRD.md](PRD/sACN_Video_Playback_PRD.md)

## 💡 Pro Tips

1. **Test with low DMX values first** (1-10) before filling entire range
2. **Use H.264 1080p videos** at 8-10 Mbps for best performance
3. **Wired Ethernet > WiFi** for reliable sACN reception
4. **Name files sequentially** - Leave gaps for future additions (001, 005, 010...)
5. **Keep media files local** - Network drives can cause playback issues

## 🎬 Typical Show Workflow

1. **Preparation** (Before show):
   ```powershell
   # Test the build
   npm run tauri:dev
   
   # Configure monitors
   # Add media files
   # Test with console
   ```

2. **Load-in** (At venue):
   - Connect to venue network
   - Verify sACN reception with console
   - Test each output monitor
   - Set correct resolutions for venue displays

3. **During Show**:
   - Run in Production Mode
   - Control via lighting console
   - Monitor DMX values in control interface

4. **After Show**:
   - Export configuration (future feature)
   - Back up media files
   - Document any issues

---

**Having issues?** Check [WINDOWS-TROUBLESHOOTING.md](WINDOWS-TROUBLESHOOTING.md) for detailed solutions.
