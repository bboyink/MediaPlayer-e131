# MediaPlayer E1.31

sACN (E1.31) driven dual-monitor video playback system built with Tauri 2, React, and Rust.

**Platform**: Windows 10/11 (64-bit)

## Features

- **Dual Monitor Support**: Independent control of two monitor outputs
- **sACN/E1.31 Protocol**: Receive DMX data over standard sACN multicast or unicast
- **Flexible Channel Mapping**: Configure start channel and offsets for each monitor
- **DMX Value-Based Media Selection**: Files named `001.mp4`, `002.jpg`, etc. map directly to DMX values
- **Dimmer Control**: Dedicated dimmer channel for each monitor (0-255 → 0-100%)
- **Multi-Format Support**: MP4 video, JPEG, and PNG images
- **Configurable Resolutions**: HD (1920×1080), 4K (3840×2160), or custom resolutions per monitor
- **Orientation Control**: Horizontal or vertical display orientation
- **Preview Mode**: View both monitor outputs side-by-side or stacked in control UI
- **Production Mode**: Full-screen output to physical monitors

## Architecture

Following the tech stack defined in [PRD/sACN_Video_Playback_PRD.md](PRD/sACN_Video_Playback_PRD.md):

- **Backend**: Rust with Tauri 2 framework
  - `sacn` crate for E1.31 packet reception
  - Tokio async runtime for network processing
- **Frontend**: React 18 + TypeScript
  - Vite for fast development and build
  - Component-based UI for control surface
- **Video Playback**: HTML5 `<video>` element with hardware-accelerated decoding
- **IPC**: Tauri event system for Rust ↔ React communication

## Project Structure

```
MediaPlayer/
├── src-tauri/           # Rust backend
│   ├── src/
│   │   ├── main.rs      # Application entry, Tauri commands
│   │   ├── config.rs    # Configuration structures
│   │   └── sacn_listener.rs  # sACN packet processor
│   ├── Cargo.toml       # Rust dependencies
│   └── tauri.conf.json  # Tauri configuration
├── src/                 # React frontend
│   ├── components/      # UI components
│   │   ├── MonitorConfigPanel.tsx
│   │   ├── DmxMonitor.tsx
│   │   └── PreviewPanel.tsx
│   ├── App.tsx          # Main application
│   ├── types.ts         # TypeScript type definitions
│   ├── main.tsx         # React entry point
│   └── output.ts        # Output window media controller
├── public/
│   └── output.html      # Output window HTML
└── PRD/                 # Product requirements document
```

## Setup & Development

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (stable channel)
- [Node.js](https://nodejs.org/) 20 LTS or later
- [Microsoft Visual C++ Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
- [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (typically pre-installed on Windows 10/11)

### Installation

```powershell
# Install Node dependencies
npm install

# Run in development mode
npm run tauri:dev
```

### Building for Production

```powershell
# Build both MSI and NSIS installers
npm run tauri:build

# Build MSI installer only (recommended for enterprise)
npm run tauri:build:msi

# Build NSIS installer only (smaller download, more flexible)
npm run tauri:build:nsis
```

Installers will be created in:
- MSI: `src-tauri/target/release/bundle/msi/`
- NSIS: `src-tauri/target/release/bundle/nsis/`

**MSI** is recommended for enterprise deployments and supports Windows Installer features.
**NSIS** creates a smaller installer with more customization options.

## Configuration

### Monitor Setup

Each monitor requires:

1. **Name**: Friendly identifier
2. **Start Channel**: Base DMX channel (1-512)
3. **Clip Channel Offset**: Offset from start channel for media selection (typically 0)
4. **Dimmer Channel Offset**: Offset from start channel for dimmer control (typically 1)
5. **Media Folder**: Path to folder containing media files
6. **Resolution**: HD, 4K, or custom
7. **Orientation**: Horizontal or Vertical

**Example**: 
- Monitor 1 Start Channel: 1
  - Clip selection: Channel 1 (offset 0)
  - Dimmer control: Channel 2 (offset 1)
- Monitor 2 Start Channel: 10
  - Clip selection: Channel 10
  - Dimmer control: Channel 11

### Media Files

Files must be named with 3-digit zero-padded numbers matching DMX values:

```
001.mp4  → DMX value 1
002.jpg  → DMX value 2
003.png  → DMX value 3
...
255.mp4  → DMX value 255
```

Supported formats:
- **Video**: MP4 (H.264 codec recommended)
- **Images**: JPEG, PNG

### sACN Configuration

- **Universe**: E1.31 universe number (1-63999, typically 1)
- **Listen Address**: UDP bind address (default: `0.0.0.0:5568`)

## Usage

1. **Configure Monitors**: Set start channels, media folders, and resolutions
2. **Add Media Files**: Place numbered media files in each monitor's folder
3. **Preview Mode**: View both outputs in the control interface
4. **Production Mode**: Click "Production Mode: ON" to output to physical monitors
5. **Send DMX**: Use your lighting console to send E1.31 data
   - Change clip channel value to select media
   - Change dimmer channel value to control opacity

## DMX Value Mapping

| DMX Value | Behavior |
|-----------|----------|
| 0 | No media displayed |
| 1-255 | Displays corresponding file (001-255.mp4/jpg/png) |

Dimmer channel: 0 = fully transparent, 255 = fully opaque

## Troubleshooting

### Video Won't Play

- Ensure MP4 uses H.264 codec (not HEVC on older systems)
- Check media folder path is correct and accessible
- Verify file permissions

### sACN Not Receiving

- Check universe number matches your console output
- Verify network firewall allows UDP port 5568
- Ensure multicast is enabled on network interface
- Try unicast mode if multicast doesn't work

### Window Output Issues

- Verify correct monitor is selected in Windows Display Settings
- Ensure monitors are set to "Extend these displays" mode
- Check that display scaling is set appropriately (recommended: 100%)
- Try toggling between preview and production mode
- If output window doesn't appear, check Windows taskbar settings

## Development Roadmap

- [x] Basic sACN reception and DMX processing
- [x] Dual monitor configuration
- [x] Video and image playback
- [x] Dimmer control
- [x] Orientation support
- [x] Preview mode
- [ ] Configuration persistence (save/load)
- [ ] Media library thumbnail preview
- [ ] Advanced DMX mapping (multi-channel clip selection)
- [ ] Transition effects between clips
- [ ] Audio output routing
- [ ] Performance metrics and monitoring

## License

Copyright © 2025 Brad Boyink

---

**Note**: This is a specialized tool for live event production. Ensure your network and hardware meet the requirements outlined in the PRD before deployment.
