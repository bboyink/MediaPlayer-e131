// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod sacn_listener;

use config::{AppConfig, MonitorConfig, Resolution, Orientation, PreviewLayout};
use sacn_listener::SacnListener;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State, Window};
use log::info;

/// Application state
struct AppState {
    config: Arc<Mutex<AppConfig>>,
}

/// Tauri command to get current configuration
#[tauri::command]
fn get_config(state: State<AppState>) -> Result<AppConfig, String> {
    state.config.lock()
        .map(|config| config.clone())
        .map_err(|e| format!("Failed to get config: {}", e))
}

/// Tauri command to update configuration
#[tauri::command]
fn update_config(config: AppConfig, state: State<AppState>) -> Result<(), String> {
    state.config.lock()
        .map(|mut current_config| {
            *current_config = config;
        })
        .map_err(|e| format!("Failed to update config: {}", e))
}

/// Tauri command to update monitor 1 configuration
#[tauri::command]
fn update_monitor1_config(monitor: MonitorConfig, state: State<AppState>) -> Result<(), String> {
    state.config.lock()
        .map(|mut config| {
            config.monitor1 = monitor;
        })
        .map_err(|e| format!("Failed to update monitor 1: {}", e))
}

/// Tauri command to update monitor 2 configuration
#[tauri::command]
fn update_monitor2_config(monitor: MonitorConfig, state: State<AppState>) -> Result<(), String> {
    state.config.lock()
        .map(|mut config| {
            config.monitor2 = monitor;
        })
        .map_err(|e| format!("Failed to update monitor 2: {}", e))
}

/// Tauri command to toggle production mode
#[tauri::command]
fn set_production_mode(enabled: bool, state: State<AppState>, app: AppHandle) -> Result<(), String> {
    state.config.lock()
        .map(|mut config| {
            config.production_mode = enabled;
            info!("Production mode: {}", enabled);
        })
        .map_err(|e| format!("Failed to set production mode: {}", e))?;
    
    // Emit event to frontend
    app.emit("production-mode-changed", enabled)
        .map_err(|e| format!("Failed to emit event: {}", e))
}

/// Tauri command to set preview layout
#[tauri::command]
fn set_preview_layout(layout: PreviewLayout, state: State<AppState>) -> Result<(), String> {
    state.config.lock()
        .map(|mut config| {
            config.preview_layout = layout;
        })
        .map_err(|e| format!("Failed to set preview layout: {}", e))
}

/// Tauri command to get available monitors (displays)
#[tauri::command]
async fn get_available_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let monitors = app.available_monitors()
        .map_err(|e| format!("Failed to get monitors: {}", e))?;
    
    let monitor_infos: Vec<MonitorInfo> = monitors
        .into_iter()
        .enumerate()
        .map(|(idx, monitor)| {
            let size = monitor.size();
            let position = monitor.position();
            MonitorInfo {
                id: idx,
                name: monitor.name().unwrap_or_else(|| format!("Monitor {}", idx + 1)),
                width: size.width,
                height: size.height,
                x: position.x,
                y: position.y,
            }
        })
        .collect();
    
    Ok(monitor_infos)
}

/// Monitor information for display enumeration
#[derive(serde::Serialize)]
struct MonitorInfo {
    id: usize,
    name: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
}

/// Tauri command to create output window for a monitor
#[tauri::command]
async fn create_output_window(
    monitor_num: u8,
    app: AppHandle,
    state: State<'_, AppState>
) -> Result<(), String> {
    let config = state.config.lock()
        .map_err(|e| format!("Failed to get config: {}", e))?;
    
    let monitor_config = if monitor_num == 1 {
        &config.monitor1
    } else {
        &config.monitor2
    };

    if !monitor_config.enabled {
        return Err("Monitor is not enabled".to_string());
    }

    let window_label = format!("output-{}", monitor_num);
    let window_title = format!("Output - {}", monitor_config.name);
    
    // Check if window already exists
    if app.get_webview_window(&window_label).is_some() {
        return Ok(());
    }

    use tauri::WebviewWindowBuilder;
    
    WebviewWindowBuilder::new(
        &app,
        window_label,
        tauri::WebviewUrl::App(format!("output.html?monitor={}", monitor_num).into())
    )
    .title(window_title)
    .inner_size(monitor_config.resolution.width() as f64, monitor_config.resolution.height() as f64)
    .fullscreen(config.production_mode)
    .decorations(!config.production_mode)
    .resizable(!config.production_mode)
    .build()
    .map_err(|e| format!("Failed to create window: {}", e))?;

    Ok(())
}

/// Tauri command to close output window
#[tauri::command]
async fn close_output_window(monitor_num: u8, app: AppHandle) -> Result<(), String> {
    let window_label = format!("output-{}", monitor_num);
    
    if let Some(window) = app.get_webview_window(&window_label) {
        window.close()
            .map_err(|e| format!("Failed to close window: {}", e))?;
    }
    
    Ok(())
}

fn main() {
    env_logger::init();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            info!("Starting MediaPlayer E1.31");
            
            // Initialize configuration
            let config = Arc::new(Mutex::new(AppConfig::default()));
            
            // Store config in app state
            app.manage(AppState {
                config: config.clone(),
            });
            
            // Start sACN listener
            let listener = SacnListener::new(config.clone(), app.handle().clone());
            listener.start().expect("Failed to start sACN listener");
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            update_config,
            update_monitor1_config,
            update_monitor2_config,
            set_production_mode,
            set_preview_layout,
            get_available_monitors,
            create_output_window,
            close_output_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
