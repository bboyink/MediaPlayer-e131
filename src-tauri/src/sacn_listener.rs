use crate::config::{AppConfig, ClipChange, DimmerChange, DmxUpdate, MonitorConfig};
use log::{error, info, warn};
use sacn::receive::SacnReceiver;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::task;

/// sACN Listener state
pub struct SacnListener {
    config: Arc<Mutex<AppConfig>>,
    app_handle: AppHandle,
    last_values: Arc<Mutex<HashMap<u16, u8>>>,
}

impl SacnListener {
    pub fn new(config: Arc<Mutex<AppConfig>>, app_handle: AppHandle) -> Self {
        SacnListener {
            config,
            app_handle,
            last_values: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start the sACN listener on a background task
    pub fn start(self) -> Result<(), Box<dyn std::error::Error>> {
        let config = self.config.lock().unwrap().clone();
        let universe = config.sacn.universe;
        
        info!("Starting sACN listener on universe {}", universe);

        task::spawn(async move {
            if let Err(e) = self.run_listener(universe).await {
                error!("sACN listener error: {}", e);
            }
        });

        Ok(())
    }

    async fn run_listener(self, universe: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Create sACN receiver
        let mut receiver = SacnReceiver::with_ip(
            SocketAddr::from(([0, 0, 0, 0], 5568)),
            None
        )?;

        // Listen to the configured universe
        receiver.listen_universes(&[universe])?;
        
        info!("sACN receiver listening on universe {}", universe);

        loop {
            match receiver.recv(None) {
                Ok(packet) => {
                    self.process_packet(packet).await;
                }
                Err(e) => {
                    warn!("Error receiving sACN packet: {}", e);
                }
            }
        }
    }

    async fn process_packet(&self, packet: sacn::packet::SacnPacket) {
        use sacn::packet::SacnPacket;
        
        match packet {
            SacnPacket::DataPacket(data) => {
                let universe = data.universe;
                let values = data.values;

                // Get current config
                let config = self.config.lock().unwrap().clone();
                
                if universe != config.sacn.universe {
                    return;
                }

                // Process DMX values for both monitors
                self.process_monitor_dmx(&config.monitor1, 1, &values).await;
                self.process_monitor_dmx(&config.monitor2, 2, &values).await;
            }
            _ => {
                // Ignore non-data packets
            }
        }
    }

    async fn process_monitor_dmx(&self, monitor_config: &MonitorConfig, monitor_num: u8, values: &[u8]) {
        if !monitor_config.enabled {
            return;
        }

        let clip_channel = monitor_config.clip_channel() as usize;
        let dimmer_channel = monitor_config.dimmer_channel() as usize;

        // Check clip selection channel
        if clip_channel > 0 && clip_channel <= values.len() {
            let clip_value = values[clip_channel - 1]; // DMX is 1-indexed
            
            // Only emit if value changed
            let mut last_values = self.last_values.lock().unwrap();
            let key = (monitor_num as u16) * 1000 + clip_channel as u16;
            
            if last_values.get(&key) != Some(&clip_value) {
                last_values.insert(key, clip_value);
                drop(last_values); // Release lock before emitting

                // Emit DMX update
                let _ = self.app_handle.emit("dmx-update", DmxUpdate {
                    universe: 1,
                    channel: clip_channel as u16,
                    value: clip_value,
                });

                // Map DMX value to filename
                if clip_value > 0 {
                    let filename = self.resolve_media_file(monitor_config, clip_value);
                    
                    let _ = self.app_handle.emit("clip-change", ClipChange {
                        monitor: monitor_num,
                        filename,
                        dmx_value: clip_value,
                    });
                }
            }
        }

        // Check dimmer channel
        if dimmer_channel > 0 && dimmer_channel <= values.len() {
            let dimmer_value = values[dimmer_channel - 1];
            
            let mut last_values = self.last_values.lock().unwrap();
            let key = (monitor_num as u16) * 1000 + dimmer_channel as u16;
            
            if last_values.get(&key) != Some(&dimmer_value) {
                last_values.insert(key, dimmer_value);
                drop(last_values);

                // Convert DMX 0-255 to 0.0-1.0
                let level = dimmer_value as f32 / 255.0;
                
                let _ = self.app_handle.emit("dimmer-change", DimmerChange {
                    monitor: monitor_num,
                    level,
                });
            }
        }
    }

    /// Resolve DMX value to media filename
    /// Format: 001.mp4, 001.jpg, 001.png (checks in that order)
    fn resolve_media_file(&self, monitor_config: &MonitorConfig, dmx_value: u8) -> String {
        let base_filename = format!("{:03}", dmx_value);
        let extensions = ["mp4", "jpg", "png"];
        
        for ext in &extensions {
            let filename = format!("{}.{}", base_filename, ext);
            let full_path = monitor_config.media_folder.join(&filename);
            
            if full_path.exists() {
                return filename;
            }
        }

        // Return the mp4 version even if it doesn't exist (UI will handle error)
        format!("{}.mp4", base_filename)
    }
}
