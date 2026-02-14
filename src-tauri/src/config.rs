use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Resolution presets available for each monitor
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum Resolution {
    HD { width: u32, height: u32 },           // 1920x1080
    FourK { width: u32, height: u32 },        // 3840x2160
    Custom { width: u32, height: u32 },
}

impl Default for Resolution {
    fn default() -> Self {
        Resolution::HD { width: 1920, height: 1080 }
    }
}

impl Resolution {
    pub fn hd() -> Self {
        Resolution::HD { width: 1920, height: 1080 }
    }
    
    pub fn four_k() -> Self {
        Resolution::FourK { width: 3840, height: 2160 }
    }
    
    pub fn width(&self) -> u32 {
        match self {
            Resolution::HD { width, .. } => *width,
            Resolution::FourK { width, .. } => *width,
            Resolution::Custom { width, .. } => *width,
        }
    }
    
    pub fn height(&self) -> u32 {
        match self {
            Resolution::HD { height, .. } => *height,
            Resolution::FourK { height, .. } => *height,
            Resolution::Custom { height, .. } => *height,
        }
    }
}

/// Orientation for monitor output
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum Orientation {
    Horizontal,
    Vertical,
}

impl Default for Orientation {
    fn default() -> Self {
        Orientation::Horizontal
    }
}

/// Configuration for a single monitor output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorConfig {
    pub name: String,
    pub enabled: bool,
    pub start_channel: u16,      // DMX start channel (1-512)
    pub clip_channel_offset: u8, // Offset from start (usually 0)
    pub dimmer_channel_offset: u8, // Offset from start (usually 1)
    pub media_folder: PathBuf,
    pub resolution: Resolution,
    pub orientation: Orientation,
}

impl Default for MonitorConfig {
    fn default() -> Self {
        MonitorConfig {
            name: String::from("Monitor"),
            enabled: true,
            start_channel: 1,
            clip_channel_offset: 0,
            dimmer_channel_offset: 1,
            media_folder: PathBuf::from(""),
            resolution: Resolution::default(),
            orientation: Orientation::default(),
        }
    }
}

impl MonitorConfig {
    pub fn clip_channel(&self) -> u16 {
        self.start_channel + self.clip_channel_offset as u16
    }
    
    pub fn dimmer_channel(&self) -> u16 {
        self.start_channel + self.dimmer_channel_offset as u16
    }
}

/// sACN / E1.31 network configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SacnConfig {
    pub universe: u16,
    pub listen_address: String, // e.g., "0.0.0.0:5568"
}

impl Default for SacnConfig {
    fn default() -> Self {
        SacnConfig {
            universe: 1,
            listen_address: String::from("0.0.0.0:5568"),
        }
    }
}

/// Preview mode layout options
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum PreviewLayout {
    SideBySide,  // Horizontal arrangement
    Stacked,     // Vertical arrangement
}

impl Default for PreviewLayout {
    fn default() -> Self {
        PreviewLayout::SideBySide
    }
}

/// Application-wide configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub sacn: SacnConfig,
    pub monitor1: MonitorConfig,
    pub monitor2: MonitorConfig,
    pub preview_layout: PreviewLayout,
    pub production_mode: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            sacn: SacnConfig::default(),
            monitor1: MonitorConfig {
                name: String::from("Monitor 1"),
                start_channel: 1,
                clip_channel_offset: 0,
                dimmer_channel_offset: 1,
                ..Default::default()
            },
            monitor2: MonitorConfig {
                name: String::from("Monitor 2"),
                start_channel: 10,
                clip_channel_offset: 0,
                dimmer_channel_offset: 1,
                ..Default::default()
            },
            preview_layout: PreviewLayout::default(),
            production_mode: false,
        }
    }
}

/// DMX value update event
#[derive(Debug, Clone, Serialize)]
pub struct DmxUpdate {
    pub universe: u16,
    pub channel: u16,
    pub value: u8,
}

/// Media clip change event
#[derive(Debug, Clone, Serialize)]
pub struct ClipChange {
    pub monitor: u8, // 1 or 2
    pub filename: String,
    pub dmx_value: u8,
}

/// Dimmer level change event
#[derive(Debug, Clone, Serialize)]
pub struct DimmerChange {
    pub monitor: u8, // 1 or 2
    pub level: f32,  // 0.0 to 1.0 (derived from DMX 0-255)
}
