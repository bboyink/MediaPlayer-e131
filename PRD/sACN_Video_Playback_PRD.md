# sACN Video Playback Engine
## Tech Stack Product Requirements Document

| | |
|---|---|
| **Author** | Brad Boyink |
| **Version** | 1.0 — Draft |
| **Date** | February 14, 2025 |
| **Status** | In Review |
| **Platform** | Windows (primary), macOS / Linux (secondary) |

---

## 1. Overview

This document defines the recommended technology stack for building a cross-platform sACN-driven video playback engine. The application receives streaming ACN (E1.31) data over the network, maps DMX channel values to video clip selections, and outputs full-motion video at 1920×1080 resolution across up to two independent monitor outputs.

The stack was chosen to minimize UI friction (a recurring cost in prior projects), maximize hardware-accelerated video performance on Windows, and leverage existing team familiarity with Tauri-based development workflows.

---

## 2. Goals & Non-Goals

### 2.1 Goals

- Receive sACN / E1.31 multicast or unicast DMX data in real time
- Map one or more DMX channel values to a library of video clips
- Play back video at 1920×1080 with hardware-accelerated decoding
- Support simultaneous output to two monitors (primary control UI + fullscreen playback)
- Ship a signed, notarized installer for Windows; support macOS as a secondary target
- Iterate quickly using AI-assisted development with Copilot inside VS Code

### 2.2 Non-Goals

- Real-time video compositing or generative graphics (use a dedicated tool for that)
- Audio mixing or multi-channel audio routing
- Acting as a full DMX lighting controller — this is video-only
- Support for streaming video sources (files only in v1)

---

## 3. Recommended Tech Stack

### 3.1 Stack at a Glance

| Layer | Technology | Rationale |
|---|---|---|
| Application shell | Tauri 2 | Lightweight native wrapper; Rust backend; multi-window support |
| Frontend UI | React + TypeScript | Component model ideal for control surfaces; Copilot-friendly |
| Build tooling | Vite | Fast HMR; first-class Tauri integration |
| Video playback | HTML5 `<video>` / WebGL | Hardware-accelerated; no codec installation on Win10+ |
| sACN reception | `sacn` crate (Rust) | Purpose-built E1.31 listener; async-ready |
| IPC | Tauri Events / Commands | Low-latency Rust-to-frontend messaging |
| Packaging | Tauri bundler (NSIS / DMG) | Signed installers for Windows & macOS |

### 3.2 Tauri 2 — Application Shell

Tauri 2 serves as the native application container. It provides OS-level window management, file system access, system tray integration, and code-signed packaging — all without the memory overhead of Electron's bundled Chromium. Tauri renders UI through the platform's native WebView (WebView2 on Windows), which on Windows 10/11 supports H.264, HEVC, and VP9 natively without additional codec installation.

Multi-monitor support is achieved by enumerating available displays via Tauri's monitor API and creating a second `WebviewWindow` positioned at the target display's origin with fullscreen presentation. The primary window hosts the operator control interface; the secondary window is a minimal fullscreen video surface.

**Key Tauri APIs used:**

- `window.availableMonitors()` — enumerate connected displays
- `WebviewWindowBuilder` — create and position secondary output window
- `app.emit()` / `listen()` — send DMX events from Rust to frontend
- `tauri::command` — expose Rust functions to TypeScript

### 3.3 React + TypeScript — Frontend UI

React is chosen for the operator control interface. Component-based architecture maps well to the discrete UI concerns of this application (clip library, DMX monitor, output preview, configuration). TypeScript provides type safety for DMX value ranges and clip metadata, which reduces runtime errors in a live performance context.

Copilot performs well with React + TypeScript due to the large training corpus, making the 80%+ first-try success rate achievable across UI components. Vite provides sub-second hot module replacement during development, keeping iteration tight.

### 3.4 Video Playback — HTML5 `<video>` Element

The browser's native `<video>` element, rendered inside Tauri's WebView2 on Windows, uses the OS hardware decoder pipeline directly. This avoids the need for bundled FFmpeg binaries and codec licensing concerns. On Windows 10 and later, H.264 (MP4) decodes via DXVA2/D3D11VA on any GPU with hardware video decode support.

**Recommended primary format:**

- Container: MP4 (`.mp4`)
- Video codec: H.264 Baseline or Main profile
- Resolution: 1920×1080 at 30 or 60 fps
- Audio: AAC (or no audio track for silent clips)

**Fallback / advanced options:**

- HEVC (H.265): Supported on Win10 with hardware decode; smaller files for 4K future-proofing
- VP9 / AV1: Supported in WebView2; royalty-free alternative if needed
- WebGL / Canvas API: Available for frame-accurate overlay compositing if required in v2

### 3.5 sACN Reception — `sacn` Crate

The `sacn` Rust crate implements the ANSI E1.31 streaming ACN protocol, handling both unicast and multicast reception. It runs on a dedicated async Tokio task, decoding incoming DMX universes and publishing value changes through Tauri's event system to the React frontend at sub-10ms latency.

**DMX-to-clip mapping model:**

A configurable mapping table (stored as JSON) associates DMX channel + value ranges with clip file references. On a DMX value change event, the Rust backend emits a clip-change command to the active output window, which swaps the `<video>` src and calls `play()`.

```json
{
  "universe": 1,
  "channel": 1,
  "ranges": [
    { "min": 0,   "max": 0,   "clip": null },
    { "min": 1,   "max": 85,  "clip": "clips/loop_a.mp4" },
    { "min": 86,  "max": 170, "clip": "clips/loop_b.mp4" },
    { "min": 171, "max": 255, "clip": "clips/loop_c.mp4" }
  ]
}
```

---

## 4. High-Level Architecture

| Component | Process | Responsibility |
|---|---|---|
| sACN Listener | Rust (async Tokio) | Bind UDP socket, parse E1.31 packets, emit DMX events |
| Clip Mapper | Rust | Evaluate DMX values against mapping config, resolve clip path |
| Event Bus | Tauri IPC | Deliver clip-change and DMX-monitor events to frontend |
| Control UI | React (primary window) | Clip library, DMX monitor, config editor, output preview |
| Video Output | HTML5 `<video>` (secondary window) | Fullscreen 1080p clip playback on output monitor |
| Config Store | JSON files via Tauri FS API | Persist clip mappings, monitor assignments, preferences |

---

## 5. Multi-Monitor Output Strategy

At startup, the application enumerates connected monitors using Tauri's monitor API. The operator selects which physical display is the "output" display in the configuration UI. The application then creates a borderless, fullscreen `WebviewWindow` at the output monitor's screen coordinates.

Both windows share the same Tauri app process, communicating exclusively through the event bus. No inter-process communication or shared memory is required. The output window contains only the `<video>` element and minimal JavaScript to respond to clip-change events — keeping its render footprint minimal for smooth playback.

**Spike validation checklist** (go/no-go gate before full implementation):

- [ ] Create bare Tauri 2 app with two `WebviewWindow` instances
- [ ] Position second window on second monitor using monitor API coordinates
- [ ] Play an H.264 MP4 in each window simultaneously
- [ ] Verify smooth 1080p60 playback with no frame drops on target hardware
- [ ] Confirm clip-swap latency is acceptable (target: <2 frames / ~33ms)

---

## 6. Development Environment

| Tool | Purpose |
|---|---|
| VS Code | Primary IDE with GitHub Copilot for AI-assisted development |
| Rust toolchain (stable) | Backend compilation via `rustup` |
| Node.js 20 LTS | Frontend build tooling (Vite, npm) |
| Tauri CLI v2 | App scaffolding, dev server, bundler |
| WebView2 Runtime | Pre-installed on Windows 10/11; required for local testing |
| Parallels (Mac) | Windows VM for cross-platform installer testing |

---

## 7. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| WebView2 codec unavailability on older Windows | Low | Require Windows 10 1903+; document minimum system requirements |
| Clip-swap latency visible during fast DMX transitions | Medium | Pre-load next clip using hidden `<video>` element; validate with spike |
| sACN packet loss on busy network | Low–Med | Implement last-value hold in Rust; add network priority guidance to docs |
| Multi-monitor API differences on macOS | Medium | Treat macOS as secondary; test early with Parallels reverse scenario |
| Tauri 2 API stability (still relatively new) | Low | Pin to a specific Tauri 2 release; review changelog before updates |

---

## 8. Alternatives Considered

| Alternative | Rejected Because |
|---|---|
| Electron | Larger runtime; otherwise viable — acceptable fallback if WebView2 issues arise |
| SDL2 + Rust video (GStreamer/FFmpeg) | High plumbing cost; same UI pain as egui; no benefit over HTML5 video pipeline |
| Qt / QML | Commercial licensing complexity; new heavy ecosystem to learn |
| Pure Rust GUI (egui, iced) | Proven 80% time sink on UI polish in prior project; rejected |
| Unity / Unreal | Overkill; no clean sACN integration path; large runtime overhead |

---

## 9. Key Dependencies

| Package | Ecosystem | Version Strategy |
|---|---|---|
| `tauri` | Rust / npm | Pin to latest Tauri 2 stable at project start |
| `sacn` | Rust (crates.io) | Pin to latest stable; review for E1.31-2009 compliance |
| `tokio` | Rust | Async runtime for sACN listener; use full feature set |
| `serde` / `serde_json` | Rust | Config serialization; very stable |
| `react` | npm | 18.x LTS |
| `typescript` | npm | 5.x |
| `vite` | npm | Latest stable; first-class Tauri plugin available |
| `@tauri-apps/api` | npm | Match Tauri Rust crate version exactly |

---

## 10. Recommended Next Steps

1. **Run the multi-monitor + video playback spike** (Section 5 checklist) — this is the go/no-go gate for the stack
2. Scaffold Tauri 2 project with React + TypeScript using `create-tauri-app`
3. Add the `sacn` crate and implement a minimal sACN listener that logs DMX values to console
4. Wire Tauri events from Rust listener to a React DMX monitor component
5. Implement clip mapping config editor and JSON persistence
6. Build video output window with pre-load strategy for seamless clip transitions
7. Set up Windows code signing workflow (reuse existing cert setup from prior projects)
8. Author installer with NSIS via Tauri bundler; test on clean Windows 10 VM

---

*End of Document*
