// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod media_scanner;
mod sacn_listener;

use config::{AppConfig, NetworkInterface};
use std::sync::{Arc, Mutex};
use tauri::State;

struct AppState {
    config: Arc<Mutex<AppConfig>>,
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

fn main() {
    // Load configuration from file or create default
    let config = AppConfig::load().unwrap_or_else(|e| {
        eprintln!("Failed to load config: {}. Using defaults.", e);
        AppConfig::default()
    });
    
    let state = AppState {
        config: Arc::new(Mutex::new(config)),
    };
    
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(state)
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
            move_output_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
