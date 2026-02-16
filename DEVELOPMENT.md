# Development Setup Guide

**Target Platform**: Windows 10/11 (64-bit)

## Prerequisites

Before starting development, ensure you have:

1. **Visual Studio Build Tools 2022** or later with C++ desktop development workload
2. **Rust** (latest stable) - [rustup-init.exe](https://rustup.rs/)
3. **Node.js** 20 LTS or later
4. **WebView2 Runtime** (pre-installed on Windows 10/11)

Verify installations:
```powershell
rustc --version
node --version
npm --version
```

## Quick Start

### 1. Install Dependencies

```powershell
npm install
```

This will install all Node.js dependencies including React, TypeScript, Vite, and Tauri.

### 2. Install Rust Dependencies

The Rust dependencies will be automatically downloaded when you first run the dev server. The main dependencies are:

- `tauri` - Application framework
- `sacn` - E1.31/sACN protocol implementation
- `tokio` - Async runtime for network processing
- `serde` - JSON serialization

### 3. Run Development Server

```powershell
npm run tauri:dev
```

This starts:
- Vite development server on port 1420 (React frontend with hot reload)
- Tauri application window with the control interface

### 4. Development Workflow

The application will open with the control interface. In development mode:

1. **Configure Monitor 1**:
   - Set start channel (e.g., 1)
   - Browse to a test media folder
   - Set resolution to HD
   - Keep orientation as Horizontal

2. **Configure Monitor 2**:
   - Set start channel (e.g., 10)
   - Browse to a different test media folder
   - Set resolution to HD
   - Keep orientation as Horizontal

3. **Test Media Files**:
   Create test files in your media folders:
   ```
   001.mp4
   002.jpg
   003.png
   etc.
   ```

4. **Test with sACN**:
   - Use a lighting console or sACN testing tool
   - Send universe 1 (configurable)
   - Set channel values to trigger media

## Testing Without sACN Hardware

For development without a physical lighting console:

### Option 1: Use sACN View (Recommended for Windows)

**[sACN View](https://www.sacnview.org/)** - Free sACN sender/viewer
- Download and install for Windows
- Configure Universe 1
- Use the transmit tab to send test DMX values
- Monitor channel 1 for clip selection, channel 2 for dimmer

### Option 2: ETC Nomad

**[ETC Nomad](https://www.etcconnect.com/Products/Consoles/Eos-Family/ETCnomad-ETCnomad-Puck.aspx)** - Professional lighting control
- Full Eos console software for Windows
- Requires USB key (Nomad Puck) or demo mode

### Option 3: Node.js Test Script

Create a quick test with sACN library:

```bash
npm install sacn
```

Then create `test-sender.js`:

```javascript
const sacn = require('sacn');
const sender = sacn.sender();

sender.add_universe(1);

// Send test values
setInterval(() => {
  const values = new Array(512).fill(0);
  values[0] = Math.floor(Math.random() * 10) + 1; // Monitor 1 clip
  values[1] = 255; // Monitor 1 dimmer (full)
  values[9] = Math.floor(Math.random() * 10) + 1; // Monitor 2 clip
  values[10] = 255; // Monitor 2 dimmer (full)
  
  sender.send(1, values);
}, 2000);
```

Run with: `node test-sender.js`

## Project Structure Details

### Backend (`src-tauri/src/`)

- **`main.rs`**: 
  - Tauri setup and command handlers
  - Exposes configuration commands to frontend
  - Manages application lifecycle

- **`config.rs`**: 
  - Data structures for configuration
  - Monitor, resolution, orientation types
  - Event payload definitions

- **`sacn_listener.rs`**: 
  - sACN packet reception using `sacn` crate
  - DMX value processing
  - Event emission to frontend

### Frontend (`src/`)

- **`App.tsx`**: Main control interface
- **`types.ts`**: TypeScript definitions matching Rust types
- **`output.ts`**: Output window controller for video/image display

### Components (`src/components/`)

- **`MonitorConfigPanel.tsx`**: Configuration UI for each monitor
- **`DmxMonitor.tsx`**: Real-time DMX value display
- **`PreviewPanel.tsx`**: Preview of both monitor outputs

## Building for Production

### Create Release Builds

```powershell
# Build both MSI and NSIS installers
npm run tauri:build

# Or build specific installer types:
npm run tauri:build:msi   # Windows Installer (MSI)
npm run tauri:build:nsis  # Nullsoft Scriptable Install System
```

This will:
1. Build the React frontend for production (optimized, minified)
2. Compile Rust backend with maximum optimizations
3. Create Windows installers

### Output Locations

- **MSI Installer**: `src-tauri\target\release\bundle\msi\`
- **NSIS Installer**: `src-tauri\target\release\bundle\nsis\`
- **Executable**: `src-tauri\target\release\mediaplayer-e131.exe`

### Installer Comparison

| Feature | MSI | NSIS |
|---------|-----|------|
| Size | Larger | Smaller |
| Enterprise Deployment | ✅ Better | ❌ Limited |
| Group Policy Support | ✅ Yes | ❌ No |
| Custom UI | ❌ Limited | ✅ Flexible |
| Recommended For | Enterprise, IT departments | End users, quick distribution |

### Build Optimization Notes

The project includes several Windows-specific optimizations:
- Static C runtime linking (no external dependencies)
- Link-time optimization (LTO)
- Size optimization (`opt-level = "z"`)
- Stripped symbols
- Windows subsystem (no console window in release)

These optimizations result in smaller binaries (~5-8 MB) but increase build time (5-10 minutes).

### First Build Note

The first build will take significantly longer (10-15 minutes) as Rust downloads and compiles all dependencies. Subsequent builds are much faster (2-5 minutes).

## Debugging

### Rust Backend Logs

The backend uses `env_logger`. To see detailed logs:

```powershell
$env:RUST_LOG="debug"; npm run tauri:dev
```

Log levels: `error`, `warn`, `info`, `debug`, `trace`

### Frontend Console

Open DevTools in the Tauri window:
- **Windows**: `Ctrl + Shift + I` or `F12`

### Common Issues

**sACN Not Receiving:**
- Check firewall settings (UDP port 5568)
- Verify universe number matches
- Try unicast instead of multicast
- Check network interface (may need to bind to specific IP)

**Video Not Playing:**
- Verify media folder path is absolute
- Check file permissions
- Ensure codec is H.264 (not HEVC on older systems)
- Check browser console for asset loading errors

**Build Errors:**
- Clear `node_modules` and reinstall: `Remove-Item -Recurse -Force node_modules; npm install`
- Clean Rust build: `cd src-tauri; cargo clean; cd ..`
- Update Rust: `rustup update`
- Ensure Visual Studio Build Tools are installed with C++ desktop development

**Windows Firewall:**
- Allow UDP port 5568 for sACN reception
- Run PowerShell as Administrator:
  ```powershell
  New-NetFirewallRule -DisplayName "MediaPlayer sACN" -Direction Inbound -Protocol UDP -LocalPort 5568 -Action Allow
  ```

## Next Steps

1. **Test with Real Hardware**: Connect to a lighting console
2. **Optimize Media**: Ensure videos are H.264 1080p
3. **Create Icon Pack**: Replace placeholder icons in `src-tauri/icons/`
4. **Configure Signing**: Set up code signing for distribution
5. **Add Persistence**: Implement save/load for configuration

## Resources

- [Tauri Documentation](https://v2.tauri.app/)
- [React Documentation](https://react.dev/)
- [sACN (E1.31) Specification](https://tsp.esta.org/tsp/documents/docs/ANSI_E1-31-2018.pdf)
- [sacn Rust Crate](https://docs.rs/sacn/)

---

Happy coding! 🚀
