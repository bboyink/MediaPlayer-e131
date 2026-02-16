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
            select_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
