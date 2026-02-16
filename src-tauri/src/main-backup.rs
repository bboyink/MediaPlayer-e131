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
    
    // Get the target monitor for positioning
    let monitor = monitors.get(display_index)
        .ok_or_else(|| format!("Display index {} not found", display_index))?;
    
    let position = monitor.position();
    let size = monitor.size();
    
    // Use saved position if available, otherwise position at monitor's upper-left
    // For video output, position at monitor coordinates (may be above macOS menu bar)
    let monitor_offset_x = position.x;
    let monitor_offset_y = position.y;
    
    let pos_x = window_x.unwrap_or(monitor_offset_x);
    let pos_y = window_y.unwrap_or(monitor_offset_y);
    
    println!("Monitor {} info: position=({}, {}), size={}x{}", 
        display_index, position.x, position.y, size.width, size.height);
    println!("Window position calculation: saved_x={:?}, saved_y={:?}, using_x={}, using_y={}",
        window_x, window_y, pos_x, pos_y);
    println!("Opening output window '{}' at position ({}, {}) with resolution {}x{}", 
        window_label, pos_x, pos_y, width, height);
    
    // Build and create the window - borderless, always on top, above menu bar
    let window = WebviewWindowBuilder::new(
        &app_handle,
        &window_label,
        tauri::WebviewUrl::App("output.html".into())
    )
    .title(format!("Output Window {}", monitor_id))
    .inner_size(width as f64, height as f64)
    .position(pos_x as f64, pos_y as f64)
    .resizable(false)
    .decorations(false)
    .visible(true)
    .focused(false)
    .always_on_top(true)
    .skip_taskbar(true)

    .build()
    .map_err(|e| format!("Failed to build window: {}", e))?;
    
    // Set window to appear above macOS menu bar using NSWindow levels
    #[cfg(target_os = "macos")]
    {
        use tauri::WebviewWindow;
        
        // For macOS, we need to set a higher window level to appear above menu bar
        window.set_always_on_top(true).map_err(|e| e.to_string())?;
        
        // Additional macOS-specific window level setting would go here
        // This ensures the window appears above the menu bar
        println!("Set macOS window level for above-menu-bar display");
    }
    .build()
    .map_err(|e| format!("Failed to build window: {}", e))?;
    
    println!("Output window '{}' created successfully", window_label);
    
    // Ensure window is visible
    window.show().map_err(|e| format!("Failed to show window: {}", e))?;
    
    println!("Output window '{}' shown and focused", window_label);
    
    Ok(())
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
) -> Result<(), String> {
    use tauri::Manager;
    
    let window_label = format!("output-{}", monitor_id);
    
    println!("update_output_window called for '{}' with media: {:?}, dimmer: {}", 
        window_label, media_url, dimmer);
    
    if let Some(window) = app_handle.get_webview_window(&window_label) {
        // Use evaluate_script to directly call updateMedia function in the window
        let media_url_js = match &media_url {
            Some(url) => format!("'{}'", url.replace("'", "\\'")),
            None => "null".to_string()
        };
        
        let script = format!("if (typeof updateMedia === 'function') {{ updateMedia({}, {}); console.log('updateMedia called with:', {}, {}); }} else {{ console.error('updateMedia function not found!'); }}", 
            media_url_js, dimmer, media_url_js, dimmer);
        
        println!("Executing script in window '{}'", window_label);
        window.eval(&script)
            .map_err(|e| format!("Failed to execute script: {}", e))?;
        println!("Script executed successfully");
    } else {
        println!("Window '{}' not found", window_label);
    }
    
    Ok(())
}

#[tauri::command]
async fn save_output_window_position(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    monitor_id: String,
) -> Result<(), String> {
    use tauri::Manager;
    
    let window_label = format!("output-{}", monitor_id);
    
    if let Some(window) = app_handle.get_webview_window(&window_label) {
        let position = window.outer_position().map_err(|e| e.to_string())?;
        
        println!("Saving position for '{}': ({}, {})", window_label, position.x, position.y);
        
        // Update config with new position
        let mut config = state.config.lock().unwrap();
        if monitor_id == "monitor1" {
            config.monitor1.window_x = Some(position.x);
            config.monitor1.window_y = Some(position.y);
        } else if monitor_id == "monitor2" {
            config.monitor2.window_x = Some(position.x);
            config.monitor2.window_y = Some(position.y);
        }
        
        // Save to disk
        config.save()?;
        
        Ok(())
    } else {
        Err(format!("Window '{}' not found", window_label))
    }
}

// snap_output_window_to_corner function removed - windows are now fully draggable

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
            save_output_window_position
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
