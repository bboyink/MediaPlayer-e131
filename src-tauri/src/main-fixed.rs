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
        println!("Closing existing window '{}'", window_label);
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
    // For video output, position at monitor coordinates (above macOS menu bar)
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
    .transparent(false)
    .build()
    .map_err(|e| format!("Failed to build window: {}", e))?;
    
    // Set window to appear above macOS menu bar
    #[cfg(target_os = "macos")]
    {
        // Force exact positioning and ensure above menu bar on macOS
        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: pos_x,
            y: pos_y,
        })).map_err(|e| e.to_string())?;
        
        println!("macOS: Positioned output window at exact coordinates ({}, {})", pos_x, pos_y);
        println!("macOS: Window set to always-on-top for above-menu-bar display");
    }
    
    println!("Output window '{}' created successfully", window_label);
    
    // Ensure window is visible
    window.show().map_err(|e| format!("Failed to show window: {}", e))?;
    
    println!("Output window '{}' shown and ready", window_label);
    
    Ok(())
}