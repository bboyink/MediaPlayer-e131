use crate::config::{DmxUpdate, SacnConfig, SacnMode};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::net::{SocketAddr, IpAddr};
use sacn::packet::ACN_SDT_MULTICAST_PORT;
use sacn::receive::SacnReceiver;

pub struct SacnListener {
    config: SacnConfig,
    running: Arc<Mutex<bool>>,
    thread_handle: Option<std::thread::JoinHandle<()>>,
}

impl SacnListener {
    pub fn new(config: SacnConfig) -> Self {
        Self {
            config,
            running: Arc::new(Mutex::new(false)),
            thread_handle: None,
        }
    }
    
    pub fn start(&mut self, callback: impl Fn(DmxUpdate) + Send + 'static) -> Result<(), String> {
        if *self.running.lock().unwrap() {
            return Err("Listener already running".to_string());
        }
        
        let universe = self.config.universe;
        let mode = self.config.mode.clone();
        let unicast_ip = self.config.unicast_ip.clone();
        let ip_address = self.config.ip_address.clone();
        
        println!("=== sACN Listener Starting ===");
        println!("Universe: {}", universe);
        println!("Mode: {:?}", mode);
        println!("Port: {}", ACN_SDT_MULTICAST_PORT);
        
        // Create and configure receiver based on mode
        let mut receiver = match mode {
            SacnMode::Multicast => {
                // Use the configured IP address for the bind/multicast-join interface.
                // Binding to a specific interface IP (e.g. 192.168.0.175) is required on
                // Windows when there are multiple NICs so the OS joins the right multicast group.
                // Fall back to 0.0.0.0 if none is configured.
                let bind_ip: IpAddr = if !ip_address.is_empty() && ip_address != "0.0.0.0" {
                    ip_address.parse()
                        .map_err(|e| format!("Invalid ip_address '{}': {}", ip_address, e))?
                } else {
                    IpAddr::from([0, 0, 0, 0])
                };
                let bind_addr = SocketAddr::new(bind_ip, ACN_SDT_MULTICAST_PORT);
                println!("Multicast: binding to {}", bind_addr);
                
                let mut rcv = SacnReceiver::with_ip(bind_addr, None)
                    .map_err(|e| {
                        let msg = format!("Failed to bind to {}: {}. Is another application using port 5568?", bind_addr, e);
                        eprintln!("{}", msg);
                        msg
                    })?;
                
                println!("Joining multicast group for universe {}", universe);
                rcv.listen_universes(&[universe])
                    .map_err(|e| {
                        let msg = format!("Failed to join multicast for universe {}: {}", universe, e);
                        eprintln!("{}", msg);
                        msg
                    })?;
                println!("Successfully joined multicast group for universe {} on {}", universe, bind_addr);
                rcv
            }
            SacnMode::Unicast => {
                if unicast_ip.is_empty() {
                    return Err("Unicast mode requires an IP address".to_string());
                }
                // For unicast, bind to 0.0.0.0 so we receive data sent to our IP on any interface.
                // The sACN controller just sends a normal UDP packet directly to our IP:5568.
                let bind_addr = SocketAddr::from(([0, 0, 0, 0], ACN_SDT_MULTICAST_PORT));
                println!("Unicast: binding to {} (receiving unicast from {})", bind_addr, unicast_ip);
                
                let mut rcv = SacnReceiver::with_ip(bind_addr, None)
                    .map_err(|e| {
                        let msg = format!("Failed to bind to {}: {}. Is another application using port 5568?", bind_addr, e);
                        eprintln!("{}", msg);
                        msg
                    })?;
                
                // Disable multicast (we don't need it for unicast) to avoid errors on
                // machines where multicast isn't available.
                let _ = rcv.set_is_multicast_enabled(false);
                
                // Still need to register the universe so the receiver knows to process it
                rcv.listen_universes(&[universe])
                    .map_err(|e| format!("Failed to register universe {}: {}", universe, e))?;
                println!("Unicast listener ready on port {}", ACN_SDT_MULTICAST_PORT);
                rcv
            }
        };
        
        let running = Arc::clone(&self.running);
        *running.lock().unwrap() = true;
        
        let running_clone = Arc::clone(&running);
        
        // Spawn listening thread
        let handle = std::thread::spawn(move || {
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
                                // packet.values[0] is the DMX start code; channel N is at index N
                                let mut max_channel = 0;
                                for (i, &val) in packet.values.iter().enumerate().skip(1) {
                                    if val > 0 {
                                        max_channel = i; // index == channel number
                                    }
                                }
                                
                                // If no channels have data, process at least first 50 channels (to catch zeros)
                                let channels_to_process = if max_channel == 0 { 50 } else { max_channel.max(50) };
                                
                                println!("Processing {} channels (highest non-zero: {})", channels_to_process, max_channel);
                                
                                // Process only relevant DMX channels
                                // Skip index 0 (start code); channel N lives at packet.values[N]
                                for channel in 1..=channels_to_process {
                                    let value = packet.values.get(channel).copied().unwrap_or(0);
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
        
        // Store handle so stop() can join it
        self.thread_handle = Some(handle);
        
        Ok(())
    }
    
    /// Signal the listener thread to stop, then wait for it to exit so the
    /// socket is fully released before the caller proceeds (e.g. to rebind).
    /// Do NOT call this while holding any mutex the listener thread also needs.
    pub fn stop(&mut self) {
        *self.running.lock().unwrap() = false;
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
    }

    /// Set the stop flag without waiting for the thread to exit.
    /// The thread will notice the flag within one recv-timeout (≤100 ms) and
    /// exit on its own.  Use this when you cannot afford to block (e.g. from a
    /// React cleanup that is not async).  A subsequent call to `stop()` or
    /// `start_sacn_listener` will join the thread before rebinding the port.
    pub fn signal_stop(&mut self) {
        *self.running.lock().unwrap() = false;
    }
}

impl Drop for SacnListener {
    fn drop(&mut self) {
        self.stop();
    }
}
