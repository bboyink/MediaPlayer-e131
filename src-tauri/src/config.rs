use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use std::io::{Read, Write};

/// Resolution options for monitors
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum Resolution {
    HD { width: u32, height: u32 },
    FourK { width: u32, height: u32 },
    Custom { width: u32, height: u32 },
}

impl Default for Resolution {
    fn default() -> Self {
        Resolution::HD { width: 1920, height: 1080 }
    }
}

/// Monitor orientation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Orientation {
    Horizontal,
    Vertical,
}

impl Default for Orientation {
    fn default() -> Self {
        Orientation::Horizontal
    }
}

/// sACN reception mode
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SacnMode {
    Multicast,
    Unicast,
}

impl Default for SacnMode {
    fn default() -> Self {
        SacnMode::Multicast
    }
}

/// sACN configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SacnConfig {
    pub universe: u16,
    pub mode: SacnMode,
    pub ip_address: String,
    pub unicast_ip: String,
    pub network_interface: String,
}

impl Default for SacnConfig {
    fn default() -> Self {
        SacnConfig {
            universe: 1,
            mode: SacnMode::Multicast,
            ip_address: "0.0.0.0".to_string(),
            unicast_ip: String::new(),
            network_interface: String::new(),
        }
    }
}

/// Monitor configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorConfig {
    pub enabled: bool,
    pub name: String,
    pub start_channel: u16,
    pub media_folder: PathBuf,
    pub resolution: Resolution,
    pub orientation: Orientation,
    pub display_index: usize,
    pub window_x: Option<i32>,
    pub window_y: Option<i32>,
}

impl Default for MonitorConfig {
    fn default() -> Self {
        MonitorConfig {
            enabled: true,
            name: "Monitor".to_string(),
            start_channel: 1,
            media_folder: PathBuf::new(),
            resolution: Resolution::default(),
            orientation: Orientation::default(),
            display_index: 0,
            window_x: None,
            window_y: None,
        }
    }
}

impl MonitorConfig {
    pub fn clip_channel(&self) -> u16 {
        self.start_channel
    }
    
    pub fn dimmer_channel(&self) -> u16 {
        self.start_channel + 1
    }
    
    pub fn playtype_channel(&self) -> u16 {
        self.start_channel + 2
    }
}

/// Layout configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum LayoutMode {
    HorizontalSideBySide,
    HorizontalStacked,
    VerticalSideBySide,
    VerticalStacked,
}

impl Default for LayoutMode {
    fn default() -> Self {
        LayoutMode::HorizontalSideBySide
    }
}

/// Preview mode
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PreviewMode {
    Listen,
    Test,
}

impl Default for PreviewMode {
    fn default() -> Self {
        PreviewMode::Listen
    }
}

/// Main application configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub sacn: SacnConfig,
    pub monitor1: MonitorConfig,
    pub monitor2: MonitorConfig,
    pub layout: LayoutMode,
    pub preview: PreviewMode,
    pub production_mode: bool,
    pub presentation_folder: PathBuf,
    #[serde(default)]
    pub convert_folder: PathBuf,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            sacn: SacnConfig::default(),
            monitor1: MonitorConfig {
                name: "Monitor 1".to_string(),
                start_channel: 1,
                ..Default::default()
            },
            monitor2: MonitorConfig {
                name: "Monitor 2".to_string(),
                start_channel: 10,
                ..Default::default()
            },
            layout: LayoutMode::default(),
            preview: PreviewMode::default(),
            production_mode: false,
            presentation_folder: PathBuf::new(),
            convert_folder: PathBuf::new(),
        }
    }
}

/// Media file information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaFile {
    pub dmx_value: u8,
    pub filename: String,
    pub path: PathBuf,
    pub media_type: MediaType,
}

/// Media file type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MediaType {
    Video,
    Image,
}

/// DMX update event
#[derive(Debug, Clone, Serialize)]
pub struct DmxUpdate {
    pub universe: u16,
    pub channel: u16,
    pub value: u8,
}

/// Network interface information
#[derive(Debug, Clone, Serialize)]
pub struct NetworkInterface {
    pub name: String,
    pub ip_address: String,
}

impl AppConfig {
    /// Get the path to the configuration file (%APPDATA%\StagePlayer DMX\configuration.json)
    pub fn get_config_path() -> Result<PathBuf, String> {
        let appdata = std::env::var("APPDATA")
            .map_err(|_| "APPDATA environment variable not set".to_string())?;
        let dir = PathBuf::from(appdata).join("StagePlayer DMX");
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
        Ok(dir.join("configuration.json"))
    }
    
    /// Load configuration from JSON file, or create default if it doesn't exist
    pub fn load() -> Result<Self, String> {
        let config_path = Self::get_config_path()?;
        
        if !config_path.exists() {
            // Create default configuration and save it
            let default_config = AppConfig::default();
            default_config.save()?;
            return Ok(default_config);
        }
        
        let mut file = fs::File::open(&config_path)
            .map_err(|e| format!("Failed to open config file: {}", e))?;
        
        let mut contents = String::new();
        file.read_to_string(&mut contents)
            .map_err(|e| format!("Failed to read config file: {}", e))?;
        
        serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse config file: {}", e))
    }
    
    /// Save configuration to JSON file
    pub fn save(&self) -> Result<(), String> {
        let config_path = Self::get_config_path()?;
        
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        
        let mut file = fs::File::create(&config_path)
            .map_err(|e| format!("Failed to create config file: {}", e))?;
        
        file.write_all(json.as_bytes())
            .map_err(|e| format!("Failed to write config file: {}", e))?;
        
        Ok(())
    }
}
