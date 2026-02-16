use crate::config::{DmxUpdate, SacnConfig, SacnMode};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::net::{SocketAddr, IpAddr};
use sacn::packet::ACN_SDT_MULTICAST_PORT;
use sacn::receive::SacnReceiver;

pub struct SacnListener {
    config: SacnConfig,
    running: Arc<Mutex<bool>>,
}

impl SacnListener {
    pub fn new(config: SacnConfig) -> Self {
        Self {
            config,
            running: Arc::new(Mutex::new(false)),
        }
    }
    
    pub fn start(&mut self, callback: impl Fn(DmxUpdate) + Send + 'static) -> Result<(), String> {
        if *self.running.lock().unwrap() {
            return Err("Listener already running".to_string());
        }
        
        let universe = self.config.universe;
        let mode = self.config.mode.clone();
        let unicast_ip = self.config.unicast_ip.clone();
        
        // Create receiver
        let mut receiver = SacnReceiver::with_ip(
            SocketAddr::from(([0, 0, 0, 0], ACN_SDT_MULTICAST_PORT)),
            None
        ).map_err(|e| format!("Failed to create receiver: {}", e))?;
        
        // Configure based on mode
        match mode {
            SacnMode::Multicast => {
                receiver.listen_universes(&[universe])
                    .map_err(|e| format!("Failed to listen multicast: {}", e))?;
            }
            SacnMode::Unicast => {
                if !unicast_ip.is_empty() {
                    let ip: IpAddr = unicast_ip.parse()
                        .map_err(|e| format!("Invalid IP address: {}", e))?;
                    let addr = SocketAddr::new(ip, ACN_SDT_MULTICAST_PORT);
                    receiver = SacnReceiver::with_ip(addr, None)
                        .map_err(|e| format!("Failed to create unicast receiver: {}", e))?;
                    receiver.listen_universes(&[universe])
                        .map_err(|e| format!("Failed to listen unicast: {}", e))?;
                } else {
                    return Err("Unicast mode requires IP address".to_string());
                }
            }
        }
        
        let running = Arc::clone(&self.running);
        *running.lock().unwrap() = true;
        
        let running_clone = Arc::clone(&running);
        
        // Spawn listening thread
        std::thread::spawn(move || {
            while *running_clone.lock().unwrap() {
                // CRITICAL FIX: Use timeout instead of blocking forever
                match receiver.recv(Some(Duration::from_millis(100))) {
                    Ok(packets) => {
                        // Process all received DMX packets
                        for packet in packets {
                            if packet.universe == universe {
                                // Process each DMX channel that changed
                                for (channel, &value) in packet.values.iter().enumerate() {
                                    if value > 0 {
                                        let update = DmxUpdate {
                                            universe,
                                            channel: (channel + 1) as u16,
                                            value,
                                        };
                                        callback(update);
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        // Ignore timeout errors, just continue
                        match e {
                            sacn::error::errors::SacnError::Io(io_err) => {
                                if io_err.kind() != std::io::ErrorKind::WouldBlock &&
                                   io_err.kind() != std::io::ErrorKind::TimedOut {
                                    eprintln!("sACN IO error: {}", io_err);
                                }
                            }
                            _ => {
                                // Log other errors except timeouts
                                eprintln!("sACN error: {:?}", e);
                            }
                        }
                    }
                }
            }
        });
        
        Ok(())
    }
    
    pub fn stop(&mut self) {
        *self.running.lock().unwrap() = false;
    }
    
    pub fn is_running(&self) -> bool {
        *self.running.lock().unwrap()
    }
}

impl Drop for SacnListener {
    fn drop(&mut self) {
        self.stop();
    }
}
