// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod media_scanner;
mod sacn_listener;
mod sacn_test_sender;

use config::{AppConfig, NetworkInterface, DmxUpdate};
use sacn_listener::SacnListener;
use sacn_test_sender::SacnTestSender;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{State, Emitter, Manager};

struct AppState {
    config: Arc<Mutex<AppConfig>>,
    sacn_listener: Arc<Mutex<Option<SacnListener>>>,
    test_sender: Arc<Mutex<Option<SacnTestSender>>>,
}

#[tauri::command]
fn get_config(state: State<AppState>) -> AppConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
fn update_config(state: State<AppState>, config: AppConfig) -> Result<(), String> {
    // Save to file first
    config.save()?;
    
    // Then update in-memory state
    *state.config.lock().unwrap() = config;
    
    Ok(())
}

#[tauri::command]
fn get_network_interfaces() -> Vec<NetworkInterface> {
    let mut interfaces = Vec::new();
    
    if let Ok(addrs) = get_if_addrs::get_if_addrs() {
        for iface in addrs {
            if !iface.is_loopback() {
                if let get_if_addrs::IfAddr::V4(addr) = iface.addr {
                    interfaces.push(NetworkInterface {
                        name: iface.name,
                        ip_address: addr.ip.to_string(),
                    });
                }
            }
        }
    }
    
    interfaces
}

#[tauri::command]
fn scan_media_folder(path: String) -> Result<Vec<config::MediaFile>, String> {
    let folder = std::path::Path::new(&path);
    media_scanner::scan_media_folder(folder)
        .map(|map| map.into_values().collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_media_files(folder: String) -> Result<Vec<String>, String> {
    let path = std::path::Path::new(&folder);
    
    if !path.exists() || !path.is_dir() {
        return Ok(Vec::new());
    }
    
    let mut files = Vec::new();
    
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    if let Some(filename) = entry.file_name().to_str() {
                        // Only include files matching ###_*.ext pattern
                        if filename.len() >= 5 {
                            let chars: Vec<char> = filename.chars().collect();
                            if chars[0].is_ascii_digit() && 
                               chars[1].is_ascii_digit() && 
                               chars[2].is_ascii_digit() && 
                               chars[3] == '_' {
                                files.push(filename.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    
    files.sort();
    Ok(files)
}

#[tauri::command]
async fn select_folder(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let folder = app_handle.dialog()
        .file()
        .set_title("Select Media Folder")
        .blocking_pick_folder();
    
    Ok(folder.map(|p| p.to_string()))
}

#[derive(serde::Serialize)]
struct DisplayInfo {
    index: usize,
    name: String,
    is_primary: bool,
    width: u32,
    height: u32,
}

#[tauri::command]
fn get_available_displays(app_handle: tauri::AppHandle) -> Result<Vec<DisplayInfo>, String> {
    use tauri::Manager;
    
    // Try to get monitors from the main window
    let monitors = if let Some(window) = app_handle.get_webview_window("main") {
        window.available_monitors().map_err(|e| e.to_string())?
    } else {
        // Fallback: try to get from app
        match app_handle.available_monitors() {
            Ok(m) => m,
            Err(_) => {
                // Return default display if we can't enumerate
                return Ok(vec![DisplayInfo {
                    index: 0,
                    name: "Primary Display".to_string(),
                    is_primary: true,
                    width: 1920,
                    height: 1080,
                }]);
            }
        }
    };
    
    let mut displays = Vec::new();
    for (index, monitor) in monitors.iter().enumerate() {
        let size = monitor.size();
        let name = monitor.name()
            .map(|n| n.to_string())
            .unwrap_or_else(|| format!("Display {}", index + 1));
        displays.push(DisplayInfo {
            index,
            name,
            is_primary: index == 0, // First monitor is typically primary
            width: size.width,
            height: size.height,
        });
    }
    
    if displays.is_empty() {
        // Fallback if no monitors detected
        displays.push(DisplayInfo {
            index: 0,
            name: "Primary Display".to_string(),
            is_primary: true,
            width: 1920,
            height: 1080,
        });
    }
    
    Ok(displays)
}

#[tauri::command]
async fn open_output_window(
    app_handle: tauri::AppHandle,
    monitor_id: String,
    display_index: usize,
    width: u32,
    height: u32,
    window_x: Option<i32>,
    window_y: Option<i32>,
) -> Result<(), String> {
    use tauri::Manager;
    use tauri::webview::WebviewWindowBuilder;
    
    let window_label = format!("output-{}", monitor_id);
    
    // Close existing window if it exists
    if let Some(existing) = app_handle.get_webview_window(&window_label) {
        let _ = existing.close();
    }
    
    // Get available monitors
    let monitors = app_handle.available_monitors().map_err(|e| e.to_string())?;
    
    // Debug: print all available monitors
    println!("Available monitors:");
    for (i, mon) in monitors.iter().enumerate() {
        println!("  Monitor {}: position=({}, {}), size={}x{}", 
            i, mon.position().x, mon.position().y, mon.size().width, mon.size().height);
    }
    
    // Validate display_index is within bounds
    let actual_display_index = if display_index >= monitors.len() {
        println!("Display index {} out of bounds (have {} monitors), using primary monitor (0)", display_index, monitors.len());
        0
    } else {
        display_index
    };
    
    // Get the target monitor for positioning
    let monitor = monitors.get(actual_display_index)
        .ok_or_else(|| format!("Display index {} not found", actual_display_index))?;
    
    let position = monitor.position();
    let size = monitor.size();
    
    // Use saved window position if available, otherwise use monitor default position
    // Note: Frontend clears window_x/window_y when display_index changes, so saved positions
    // are always for the currently selected monitor
    let (final_x, final_y) = if let (Some(saved_x), Some(saved_y)) = (window_x, window_y) {
        println!("Using saved window position: ({}, {})", saved_x, saved_y);
        (saved_x, saved_y)
    } else {
        // Position window at exact top-left of the monitor
        // Offset by -10 to compensate for Windows positioning quirk
        let default_x = position.x - 10;
        let default_y = position.y - 10;
        println!("No saved position, using default monitor position: ({}, {})", default_x, default_y);
        (default_x, default_y)
    };
    
    println!("Monitor {} info: position=({}, {}), size={}x{}", 
        actual_display_index, position.x, position.y, size.width, size.height);
    println!("Window position: using=({}, {})",
         final_x, final_y);
    println!("Opening output window '{}' on display {} at position ({}, {}) with resolution {}x{}", 
        window_label, actual_display_index, final_x, final_y, width, height);
    
    // Build and create the window - borderless, positioned at exact monitor top-left
    let window = WebviewWindowBuilder::new(
        &app_handle,
        &window_label,
        tauri::WebviewUrl::App("output.html".into())
    )
    .title(format!("Output Window {}", monitor_id))
    .inner_size(width as f64, height as f64)
    .position(final_x as f64, final_y as f64)
    .resizable(false)
    .decorations(false)
    .visible(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .build()
    .map_err(|e| format!("Failed to build window: {}", e))?;
    
    println!("Output window '{}' created successfully", window_label);
    
    // Set exact position again after creation to ensure correctness
    window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { 
        x: final_x, 
        y: final_y 
    })).map_err(|e| format!("Failed to set position: {}", e))?;
    
    // Force window to front
    window.show().map_err(|e| format!("Failed to show window: {}", e))?;
    window.set_focus().map_err(|e| format!("Failed to focus window: {}", e))?;
    
    println!("Output window '{}' shown and focused", window_label);
    
    Ok(())
}

#[tauri::command]
async fn move_output_window(
    app_handle: tauri::AppHandle,
    monitor_id: String,
    delta_x: i32,
    delta_y: i32,
) -> Result<(i32, i32), String> {
    use tauri::Manager;
    
    let window_label = format!("output-{}", monitor_id);
    
    if let Some(window) = app_handle.get_webview_window(&window_label) {
        let current_pos = window.outer_position().map_err(|e| e.to_string())?;
        let new_x = current_pos.x + delta_x;
        let new_y = current_pos.y + delta_y;
        
        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { 
            x: new_x, 
            y: new_y 
        })).map_err(|e| format!("Failed to move window: {}", e))?;
        
        println!("Moved window '{}' to ({}, {})", window_label, new_x, new_y);
        Ok((new_x, new_y))
    } else {
        Err(format!("Window '{}' not found", window_label))
    }
}

#[tauri::command]
async fn close_output_window(
    app_handle: tauri::AppHandle,
    monitor_id: String,
) -> Result<(), String> {
    use tauri::Manager;
    
    let window_label = format!("output-{}", monitor_id);
    
    println!("close_output_window called for '{}'", window_label);
    
    if let Some(window) = app_handle.get_webview_window(&window_label) {
        println!("Found window '{}', closing it", window_label);
        window.close().map_err(|e| {
            println!("Failed to close window '{}': {}", window_label, e);
            e.to_string()
        })?;
        println!("Window '{}' closed successfully", window_label);
    } else {
        println!("Window '{}' not found (already closed?)", window_label);
    }
    
    Ok(())
}

#[tauri::command]
fn start_sacn_listener(
    app_handle: tauri::AppHandle,
    state: State<AppState>,
) -> Result<(), String> {
    let config = state.config.lock().unwrap().clone();
    let sacn_config = config.sacn.clone();
    
    println!("Starting sACN listener:");
    println!("  Universe: {}", sacn_config.universe);
    println!("  Mode: {:?}", sacn_config.mode);
    println!("  Network Interface: {}", if sacn_config.network_interface.is_empty() { 
        "All interfaces".to_string() 
    } else { 
        sacn_config.network_interface.clone() 
    });
    
    let mut listener_guard = state.sacn_listener.lock().unwrap();
    
    // Take any existing listener out so we can stop it OUTSIDE the mutex.
    // Calling join() while holding the mutex can deadlock if the listener
    // thread is blocked in app_handle.emit() which may re-enter Tauri internals.
    let old_listener = listener_guard.take();
    drop(listener_guard); // release mutex before stopping old listener
    
    if let Some(mut old) = old_listener {
        println!("Stopping existing listener before restarting...");
        old.stop();
    }
    
    // Create new listener
    let mut listener = SacnListener::new(sacn_config);
    
    // Consecutive emit-failure counter.  Emit can fail transiently during
    // webview initialisation, but once the webview is destroyed every emit
    // fails permanently.  After 3 consecutive failures we treat the webview
    // as gone and signal the thread to stop so the terminal isn't flooded.
    let consec_failures = Arc::new(AtomicU32::new(0));
    let consec_failures_cb = Arc::clone(&consec_failures);
    let app_handle_cb = app_handle.clone();
    // Share the sacn_listener Arc directly with the callback so it can call
    // signal_stop() without going through app_handle.state() (which has
    // lifetime issues inside a 'static move closure).
    let sacn_arc_cb: Arc<Mutex<Option<SacnListener>>> = Arc::clone(&state.sacn_listener);

    listener.start(move |update: DmxUpdate| {
        if let Err(_) = app_handle_cb.emit("dmx-update", &update) {
            let n = consec_failures_cb.fetch_add(1, Ordering::Relaxed) + 1;
            if n >= 3 {
                // Webview is gone — stop the listener to end the flood.
                if let Some(ref mut l) = *sacn_arc_cb.lock().unwrap() {
                    l.signal_stop();
                }
            }
        } else {
            consec_failures_cb.store(0, Ordering::Relaxed);
        }
    })?;

    *state.sacn_listener.lock().unwrap() = Some(listener);

    println!("sACN listener started successfully and listening for packets");
    Ok(())
}

#[tauri::command]
fn stop_sacn_listener(state: State<AppState>) -> Result<(), String> {
    // Signal the thread to stop but do NOT join here.
    //
    // React cleanup functions are fire-and-forget (they cannot be async), so
    // stop_sacn_listener can be in-flight at the same moment that a subsequent
    // start_sacn_listener arrives.  If we joined here we would hold the socket
    // open while start tries to rebind it, causing "address already in use".
    //
    // Instead we just set running=false and leave the SacnListener in the
    // AppState.  start_sacn_listener always takes the old listener and calls
    // stop() (which joins) before creating a new one, guaranteeing the port is
    // free before it tries to bind.
    let mut guard = state.sacn_listener.lock().unwrap();
    if let Some(ref mut listener) = *guard {
        listener.signal_stop();
        println!("sACN listener stop signalled");
        Ok(())
    } else {
        Err("sACN listener is not running".to_string())
    }
}

// ========== TEST SENDER COMMANDS ==========

#[tauri::command]
fn create_test_sender(state: State<AppState>, universe: u16) -> Result<(), String> {
    let mut sender_guard = state.test_sender.lock().unwrap();
    
    if sender_guard.is_some() {
        return Err("Test sender already exists. Stop it first.".to_string());
    }
    
    let sender = SacnTestSender::new(universe, "MediaPlayer Test")?;
    *sender_guard = Some(sender);
    
    println!("Test sACN sender created for universe {}", universe);
    Ok(())
}

#[tauri::command]
fn stop_test_sender(state: State<AppState>) -> Result<(), String> {
    let mut sender_guard = state.test_sender.lock().unwrap();
    
    if sender_guard.is_none() {
        return Err("Test sender is not running".to_string());
    }
    
    *sender_guard = None;
    println!("Test sACN sender stopped");
    Ok(())
}

#[tauri::command]
fn send_test_dmx(
    state: State<AppState>,
    channel: u16,
    value: u8,
) -> Result<(), String> {
    let mut sender_guard = state.test_sender.lock().unwrap();
    
    let sender = sender_guard.as_mut()
        .ok_or_else(|| "Test sender not created. Call create_test_sender first.".to_string())?;
    
    sender.send_test_data(vec![(channel, value)])
}

#[tauri::command]
fn send_test_three_channels(
    state: State<AppState>,
    start_channel: u16,
    clip_value: u8,
    dimmer_value: u8,
    playtype_value: u8,
) -> Result<(), String> {
    let mut sender_guard = state.test_sender.lock().unwrap();
    
    let sender = sender_guard.as_mut()
        .ok_or_else(|| "Test sender not created. Call create_test_sender first.".to_string())?;
    
    sender.send_three_channel_test(start_channel, clip_value, dimmer_value, playtype_value)
}

#[tauri::command]
fn send_test_sequence(
    state: State<AppState>,
    start_channel: u16,
    values: Vec<u8>,
    delay_ms: u64,
) -> Result<(), String> {
    let mut sender_guard = state.test_sender.lock().unwrap();
    
    let sender = sender_guard.as_mut()
        .ok_or_else(|| "Test sender not created. Call create_test_sender first.".to_string())?;
    
    sender.send_test_sequence(start_channel, values, delay_ms)
}

#[tauri::command]
async fn update_output_window(
    app_handle: tauri::AppHandle,
    monitor_id: String,
    media_url: Option<String>,
    dimmer: u8,
    playtype: u8,
    orientation: String,
) -> Result<(), String> {
    use tauri::Manager;
    
    let window_label = format!("output-{}", monitor_id);
    
    println!("update_output_window called for '{}' with media: {:?}, dimmer: {}, playtype: {}, orientation: {}", 
        window_label, media_url, dimmer, playtype, orientation);
    
    if let Some(window) = app_handle.get_webview_window(&window_label) {
        // Use evaluate_script to directly call updateMedia function in the window
        let media_url_js = match &media_url {
            Some(url) => format!("'{}'", url.replace("'", "\\'")),
            None => "null".to_string()
        };
        
        let script = format!("if (typeof updateMedia === 'function') {{ updateMedia({}, {}, {}, '{}'); console.log('updateMedia called with:', {}, {}, {}, '{}'); }} else {{ console.error('updateMedia function not found!'); }}", 
            media_url_js, dimmer, playtype, orientation, media_url_js, dimmer, playtype, orientation);
        
        println!("Executing script in window '{}'", window_label);
        window.eval(&script)
            .map_err(|e| format!("Failed to execute script: {}", e))?;
        println!("Script executed successfully");
    } else {
        println!("Window '{}' not found", window_label);
    }
    
    Ok(())
}

// ── FFmpeg helpers ────────────────────────────────────────────────────────────

fn find_ffmpeg() -> Option<String> {
    if std::process::Command::new("ffmpeg").arg("-version").output().is_ok() {
        return Some("ffmpeg".to_string());
    }
    let mut candidates = vec![
        r"C:\ffmpeg\bin\ffmpeg.exe".to_string(),
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe".to_string(),
        r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe".to_string(),
        r"C:\ProgramData\chocolatey\bin\ffmpeg.exe".to_string(),
        r"C:\tools\ffmpeg\bin\ffmpeg.exe".to_string(),
    ];
    if let Ok(profile) = std::env::var("USERPROFILE") {
        candidates.push(format!(r"{}\scoop\apps\ffmpeg\current\bin\ffmpeg.exe", profile));
    }
    for c in &candidates {
        if std::path::Path::new(c.as_str()).exists() {
            return Some(c.clone());
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let winget_base = std::path::Path::new(&local)
            .join("Microsoft").join("WinGet").join("Packages");
        if let Ok(entries) = std::fs::read_dir(&winget_base) {
            for entry in entries.flatten() {
                if entry.file_name().to_string_lossy().starts_with("Gyan.FFmpeg") {
                    if let Ok(inner) = std::fs::read_dir(entry.path()) {
                        for ie in inner.flatten() {
                            let bin = ie.path().join("bin").join("ffmpeg.exe");
                            if bin.exists() { return Some(bin.to_string_lossy().into_owned()); }
                        }
                    }
                }
            }
        }
    }
    None
}

fn find_ffprobe() -> Option<String> {
    if std::process::Command::new("ffprobe").arg("-version").output().is_ok() {
        return Some("ffprobe".to_string());
    }
    let mut candidates = vec![
        r"C:\ffmpeg\bin\ffprobe.exe".to_string(),
        r"C:\Program Files\ffmpeg\bin\ffprobe.exe".to_string(),
        r"C:\Program Files (x86)\ffmpeg\bin\ffprobe.exe".to_string(),
        r"C:\ProgramData\chocolatey\bin\ffprobe.exe".to_string(),
        r"C:\tools\ffmpeg\bin\ffprobe.exe".to_string(),
    ];
    if let Ok(profile) = std::env::var("USERPROFILE") {
        candidates.push(format!(r"{}\scoop\apps\ffmpeg\current\bin\ffprobe.exe", profile));
    }
    for c in &candidates {
        if std::path::Path::new(c.as_str()).exists() {
            return Some(c.clone());
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let winget_base = std::path::Path::new(&local)
            .join("Microsoft").join("WinGet").join("Packages");
        if let Ok(entries) = std::fs::read_dir(&winget_base) {
            for entry in entries.flatten() {
                if entry.file_name().to_string_lossy().starts_with("Gyan.FFmpeg") {
                    if let Ok(inner) = std::fs::read_dir(entry.path()) {
                        for ie in inner.flatten() {
                            let bin = ie.path().join("bin").join("ffprobe.exe");
                            if bin.exists() { return Some(bin.to_string_lossy().into_owned()); }
                        }
                    }
                }
            }
        }
    }
    None
}

#[tauri::command]
fn check_ffmpeg() -> Result<String, String> {
    match (find_ffmpeg(), find_ffprobe()) {
        (Some(_), Some(_)) => Ok("FFmpeg found".to_string()),
        (None, _) => Err("FFmpeg (ffmpeg.exe) was not found on this system.".to_string()),
        (_, None) => Err("FFprobe (ffprobe.exe) was not found on this system.".to_string()),
    }
}

#[tauri::command]
fn list_convert_files(folder: String) -> Result<Vec<String>, String> {
    let path = std::path::Path::new(&folder);
    if !path.exists() || !path.is_dir() {
        return Ok(Vec::new());
    }
    let mut files: Vec<String> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                if let Some(name) = entry.file_name().to_str() {
                    let ext = std::path::Path::new(name)
                        .extension().and_then(|e| e.to_str())
                        .unwrap_or("").to_lowercase();
                    if matches!(ext.as_str(), "mp4" | "jpg" | "jpeg" | "png") {
                        files.push(name.to_string());
                    }
                }
            }
        }
    }
    files.sort();
    Ok(files)
}

#[tauri::command]
fn probe_media(source_path: String) -> Result<(u32, u32), String> {
    let ffprobe = find_ffprobe()
        .ok_or_else(|| "FFprobe not found. Install FFmpeg from https://ffmpeg.org".to_string())?;
    let output = std::process::Command::new(&ffprobe)
        .args(["-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height",
               "-of", "csv=p=0", &source_path])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = stdout.trim().split(',').collect();
    if parts.len() < 2 {
        return Err(format!("Could not read dimensions from file. (ffprobe output: '{}')", stdout.trim()));
    }
    let w = parts[0].trim().parse::<u32>().map_err(|_| format!("Bad width value: '{}'", parts[0]))?;
    let h = parts[1].trim().parse::<u32>().map_err(|_| format!("Bad height value: '{}'", parts[1]))?;
    Ok((w, h))
}

#[tauri::command]
async fn split_media(source_path: String, top_folder: String, bottom_folder: String) -> Result<(String, String), String> {
    let ffmpeg = find_ffmpeg()
        .ok_or_else(|| "FFmpeg not found. Install from https://ffmpeg.org".to_string())?;

    let (w, h) = probe_media(source_path.clone())?;
    if w != 1080 || h != 3840 {
        return Err(format!("File dimensions are {}×{} — only 1080×3840 is supported.", w, h));
    }

    let src = std::path::Path::new(&source_path);
    let stem = src.file_stem().and_then(|s| s.to_str())
        .ok_or_else(|| "Cannot determine file name".to_string())?;
    let ext = src.extension().and_then(|e| e.to_str())
        .unwrap_or("mp4").to_lowercase();

    let top_path    = std::path::Path::new(&top_folder)
        .join(format!("{}_top.{}", stem, ext)).to_string_lossy().into_owned();
    let bottom_path = std::path::Path::new(&bottom_folder)
        .join(format!("{}_bottom.{}", stem, ext)).to_string_lossy().into_owned();

    let is_video = matches!(ext.as_str(), "mp4" | "mov" | "avi" | "mkv" | "webm");

    for (offset_y, out_path) in [("0", &top_path), ("1920", &bottom_path)] {
        let crop = format!("crop=1080:1920:0:{}", offset_y);
        let mut args: Vec<&str> = vec!["-y", "-i", &source_path];
        if is_video {
            args.extend(["-filter:v", &crop, "-c:a", "copy"]);
        } else {
            args.extend(["-vf", &crop]);
        }
        args.push(out_path.as_str());

        let result = std::process::Command::new(&ffmpeg)
            .args(&args)
            .output()
            .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

        if !result.status.success() {
            let stderr = String::from_utf8_lossy(&result.stderr);
            return Err(format!("FFmpeg error: {}", &stderr[stderr.len().saturating_sub(500)..].trim()));
        }
    }

    Ok((top_path, bottom_path))
}

fn main() {
    // Load configuration from file or create default
    let config = AppConfig::load().unwrap_or_else(|e| {
        eprintln!("Failed to load config: {}. Using defaults.", e);
        AppConfig::default()
    });
    
    let state = AppState {
        config: Arc::new(Mutex::new(config)),
        sacn_listener: Arc::new(Mutex::new(None)),
        test_sender: Arc::new(Mutex::new(None)),
    };
    
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(state)
        .setup(|app| {
            // Stop the sACN listener automatically when the main window is
            // destroyed (e.g. user closes the app).  React cleanup may not
            // fire in that case, so without this the listener thread runs
            // forever and floods the terminal with emit errors.
            let sacn_arc: Arc<Mutex<Option<SacnListener>>> = Arc::clone(&app.state::<AppState>().sacn_listener);
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Destroyed = event {
                        if let Some(ref mut l) = *sacn_arc.lock().unwrap() {
                            l.signal_stop();
                            println!("Window destroyed: sACN listener stop signalled");
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            update_config,
            get_network_interfaces,
            scan_media_folder,
            get_media_files,
            select_folder,
            get_available_displays,
            open_output_window,
            close_output_window,
            update_output_window,
            move_output_window,
            start_sacn_listener,
            stop_sacn_listener,
            create_test_sender,
            stop_test_sender,
            send_test_dmx,
            send_test_three_channels,
            send_test_sequence,
            check_ffmpeg,
            list_convert_files,
            probe_media,
            split_media
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
