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
        
        println!("=== sACN Listener Starting ===");
        println!("Universe: {}", universe);
        println!("Mode: {:?}", mode);
        println!("Port: {}", ACN_SDT_MULTICAST_PORT);
        
        // Create receiver - bind to all interfaces 0.0.0.0:5568
        let bind_addr = SocketAddr::from(([0, 0, 0, 0], ACN_SDT_MULTICAST_PORT));
        println!("Binding to: {}", bind_addr);
        
        let mut receiver = SacnReceiver::with_ip(bind_addr, None)
            .map_err(|e| {
                let err_msg = format!("Failed to bind to {}: {}. Is another application using port 5568?", bind_addr, e);
                eprintln!("{}", err_msg);
                err_msg
            })?;
        
        println!("Socket created successfully on port {}", ACN_SDT_MULTICAST_PORT);
        
        // Configure based on mode
        match mode {
            SacnMode::Multicast => {
                println!("Joining multicast group for universe {}", universe);
                receiver.listen_universes(&[universe])
                    .map_err(|e| {
                        let err_msg = format!("Failed to join multicast for universe {}: {}", universe, e);
                        eprintln!("{}", err_msg);
                        err_msg
                    })?;
                println!("Successfully joined multicast group for universe {}", universe);
            }
            SacnMode::Unicast => {
                if !unicast_ip.is_empty() {
                    println!("Configuring unicast mode for IP: {}", unicast_ip);
                    let ip: IpAddr = unicast_ip.parse()
                        .map_err(|e| format!("Invalid IP address '{}': {}", unicast_ip, e))?;
                    let addr = SocketAddr::new(ip, ACN_SDT_MULTICAST_PORT);
                    receiver = SacnReceiver::with_ip(addr, None)
                        .map_err(|e| format!("Failed to create unicast receiver on {}: {}", addr, e))?;
                    receiver.listen_universes(&[universe])
                        .map_err(|e| format!("Failed to listen unicast on universe {}: {}", universe, e))?;
                    println!("Successfully configured unicast listener on {}", addr);
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
            println!("Listener thread started, entering receive loop...");
            let mut packet_count = 0;
            let mut last_log_time = std::time::Instant::now();
            
            while *running_clone.lock().unwrap() {
                // CRITICAL FIX: Use timeout instead of blocking forever
                match receiver.recv(Some(Duration::from_millis(100))) {
                    Ok(packets) => {
                        packet_count += packets.len();
                        
                        // Log every 5 seconds if no packets, or immediately if we get packets
                        let now = std::time::Instant::now();
                        if !packets.is_empty() || now.duration_since(last_log_time).as_secs() >= 5 {
                            if !packets.is_empty() {
                                println!("Received {} sACN packet(s). Total so far: {}", packets.len(), packet_count);
                            } else {
                                println!("Still listening... No packets received yet (total: {})", packet_count);
                            }
                            last_log_time = now;
                        }
                        
                        // Process all received DMX packets
                        for packet in packets {
                            println!("Packet received: Universe {} (looking for {}), {} channels", 
                                packet.universe, universe, packet.values.len());
                            
                            if packet.universe == universe {
                                println!("sACN packet MATCHED on universe {}, {} channels", universe, packet.values.len());
                                // Only process channels that are actually used (skip trailing zeros)
                                // Find the highest non-zero channel to avoid processing all 512 channels
                                let mut max_channel = 0;
                                for (i, &val) in packet.values.iter().enumerate() {
                                    if val > 0 {
                                        max_channel = i + 1;
                                    }
                                }
                                
                                // If no channels have data, process at least first 50 channels (to catch zeros)
                                let channels_to_process = if max_channel == 0 { 50 } else { max_channel.max(50) };
                                
                                println!("Processing {} channels (highest non-zero: {})", channels_to_process, max_channel);
                                
                                // Process only relevant DMX channels
                                for channel in 1..=channels_to_process {
                                    let value = packet.values.get(channel - 1).copied().unwrap_or(0);
                                    let update = DmxUpdate {
                                        universe,
                                        channel: channel as u16,
                                        value,
                                    };
                                    callback(update);
                                }
                            } else {
                                println!("Packet universe {} does NOT match target universe {}, ignoring", 
                                    packet.universe, universe);
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
