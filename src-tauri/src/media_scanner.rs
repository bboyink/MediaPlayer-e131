use crate::config::{MediaFile, MediaType};
use std::collections::HashMap;
use std::path::Path;

/// Scans a directory for media files in format: 001_filename.ext
pub fn scan_media_folder(folder: &Path) -> Result<HashMap<u8, MediaFile>, std::io::Error> {
    let mut media_map = HashMap::new();
    
    if !folder.exists() || !folder.is_dir() {
        return Ok(media_map);
    }
    
    for entry in std::fs::read_dir(folder)? {
        let entry = entry?;
        let path = entry.path();
        
        if path.is_file() {
            if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                if let Some(media_file) = parse_media_filename(filename, path.clone()) {
                    media_map.insert(media_file.dmx_value, media_file);
                }
            }
        }
    }
    
    Ok(media_map)
}

/// Parse filename: 001_clipname.mp4
fn parse_media_filename(filename: &str, full_path: std::path::PathBuf) -> Option<MediaFile> {
    // Must be at least 5 chars: 000_x.ext
    if filename.len() < 5 {
        return None;
    }
    
    let chars: Vec<char> = filename.chars().collect();
    
    // First 3 must be digits
    if !chars[0].is_ascii_digit() || !chars[1].is_ascii_digit() || !chars[2].is_ascii_digit() {
        return None;
    }
    
    // Fourth must be underscore
    if chars[3] != '_' {
        return None;
    }
    
    // Parse DMX value
    let dmx_str: String = chars[0..3].iter().collect();
    let dmx_value = dmx_str.parse::<u8>().ok()?;
    
    // Must be 1-255
    if dmx_value == 0 {
        return None;
    }
    
    // Get extension
    let ext = full_path.extension()?.to_str()?.to_lowercase();
    
    let media_type = match ext.as_str() {
        "mp4" => MediaType::Video,
        "jpg" | "jpeg" | "png" => MediaType::Image,
        _ => return None,
    };
    
    Some(MediaFile {
        dmx_value,
        filename: filename.to_string(),
        path: full_path,
        media_type,
    })
}
