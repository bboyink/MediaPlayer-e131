use sacn::source::SacnSource;
use std::net::SocketAddr;
use std::time::Duration;

/// Test sACN sender for loopback testing
pub struct SacnTestSender {
    source: SacnSource,
    universe: u16,
}

impl SacnTestSender {
    /// Create a new test sender
    pub fn new(universe: u16, source_name: &str) -> Result<Self, String> {
        let source = SacnSource::with_ip(source_name, SocketAddr::from(([0, 0, 0, 0], 0)))
            .map_err(|e| format!("Failed to create sACN source: {}", e))?;
        
        println!("Created test sACN sender for universe {}", universe);
        
        Ok(Self {
            source,
            universe,
        })
    }
    
    /// Send test DMX data on specific channels
    /// Channels is a vector of (channel, value) tuples
    pub fn send_test_data(&mut self, channels: Vec<(u16, u8)>) -> Result<(), String> {
        // Create DMX data buffer: 1 byte DMX start code (0x00) + 512 channel bytes = 513 bytes
        // As per ANSI E1.31, property_values[0] is always the DMX start code.
        let mut dmx_data = [0u8; 513];
        // dmx_data[0] = 0x00 start code (already zero)
        
        // Set the specified channel values (channel N lives at index N)
        for (channel, value) in channels {
            if channel > 0 && channel <= 512 {
                dmx_data[channel as usize] = value;
                println!("Setting channel {} to value {}", channel, value);
            } else {
                return Err(format!("Invalid channel number: {}. Must be 1-512", channel));
            }
        }
        
        // Register universe if not already registered
        self.source.register_universe(self.universe)
            .map_err(|e| format!("Failed to register universe: {}", e))?;
        
        // Send the data - sacn 0.11 API: send(universes, data, priority, dst_ip, sync_uni)
        self.source.send(&[self.universe], &dmx_data, None, None, None)
            .map_err(|e| format!("Failed to send DMX data: {}", e))?;
        
        println!("Sent test DMX data to universe {}", self.universe);
        Ok(())
    }
    
    /// Send a sequence of test values to simulate channel changes
    pub fn send_test_sequence(
        &mut self, 
        start_channel: u16, 
        values: Vec<u8>,
        delay_ms: u64,
    ) -> Result<(), String> {
        for (i, value) in values.iter().enumerate() {
            let channel = start_channel + i as u16;
            self.send_test_data(vec![(channel, *value)])?;
            std::thread::sleep(Duration::from_millis(delay_ms));
        }
        Ok(())
    }
    
    /// Send test data to 3 channels at once (useful for clip, dimmer, playtype)
    pub fn send_three_channel_test(
        &mut self,
        start_channel: u16,
        clip_value: u8,
        dimmer_value: u8,
        playtype_value: u8,
    ) -> Result<(), String> {
        let channels = vec![
            (start_channel, clip_value),       // Clip channel
            (start_channel + 1, dimmer_value), // Dimmer channel
            (start_channel + 2, playtype_value), // Playtype channel
        ];
        
        println!("Sending 3-channel test: Clip={}@ch{}, Dimmer={}@ch{}, Playtype={}@ch{}",
            clip_value, start_channel,
            dimmer_value, start_channel + 1,
            playtype_value, start_channel + 2);
        
        self.send_test_data(channels)
    }
}

impl Drop for SacnTestSender {
    fn drop(&mut self) {
        // Cleanup: terminate universe with start code 0 (DMX)
        let _ = self.source.terminate_stream(self.universe, 0);
        println!("Test sACN sender terminated for universe {}", self.universe);
    }
}
