# sACN Testing Guide

This guide explains how to test the sACN (E1.31) functionality using the built-in loopback test sender.

## Overview

The MediaPlayer now includes a built-in sACN test sender that allows you to send test DMX data to yourself for testing without external hardware. This is perfect for:

- Testing your setup without sACN lighting equipment
- Debugging DMX channel mappings
- Developing and testing new features
- Verifying your configuration

## Test Channels

By default, the test system uses **3 channels starting at channel 1**:

- **Channel 1**: Clip selection (DMX value selects which media file to play)
- **Channel 2**: Dimmer (0-255, controls brightness/opacity)
- **Channel 3**: Play type (0=stop, 1=play once, 2=loop)

You can configure these channels to match your setup in the app configuration.

## Quick Start

### 1. Start the Application

```powershell
npm run tauri:dev
```

### 2. Start the sACN Listener

In the MediaPlayer UI:
- Go to the sACN configuration section
- Set your universe (default: 1)
- Click "Start Listening"

### 3. Open DevTools Console

Press `F12` in the app window to open the DevTools Console.

### 4. Create Test Sender

In the DevTools Console, run:

```javascript
await window.__TAURI__.core.invoke('create_test_sender', { universe: 1 });
```

### 5. Send Test Data

#### Test 3 Channels at Once

```javascript
// Clip=100, Dimmer=255 (full), Playtype=1 (play once)
await window.__TAURI__.core.invoke('send_test_three_channels', {
  startChannel: 1,
  clipValue: 100,
  dimmerValue: 255,
  playtypeValue: 1
});
```

#### Test Single Channel

```javascript
await window.__TAURI__.core.invoke('send_test_dmx', {
  channel: 1,
  value: 50
});
```

#### Test Sequence (Animated)

```javascript
// Ramp up the clip channel
await window.__TAURI__.core.invoke('send_test_sequence', {
  startChannel: 1,
  values: [0, 25, 50, 75, 100, 125, 150],
  delayMs: 300
});
```

## Available Commands

### `create_test_sender`

Creates a test sACN sender for the specified universe.

**Parameters:**
- `universe` (number): The sACN universe to send to (1-63999)

**Example:**
```javascript
await window.__TAURI__.core.invoke('create_test_sender', { universe: 1 });
```

### `send_test_dmx`

Sends a test value to a single DMX channel.

**Parameters:**
- `channel` (number): DMX channel (1-512)
- `value` (number): DMX value (0-255)

**Example:**
```javascript
await window.__TAURI__.core.invoke('send_test_dmx', {
  channel: 1,
  value: 128
});
```

### `send_test_three_channels`

Sends test values to three consecutive channels (clip, dimmer, playtype).

**Parameters:**
- `startChannel` (number): First channel number (1-510)
- `clipValue` (number): Clip selection value (0-255)
- `dimmerValue` (number): Dimmer value (0-255)
- `playtypeValue` (number): Play type (0=stop, 1=play, 2=loop)

**Example:**
```javascript
await window.__TAURI__.core.invoke('send_test_three_channels', {
  startChannel: 1,
  clipValue: 100,
  dimmerValue: 255,
  playtypeValue: 1
});
```

### `send_test_sequence`

Sends a sequence of values to consecutive channels with delays.

**Parameters:**
- `startChannel` (number): First channel number
- `values` (array of numbers): Array of DMX values to send
- `delayMs` (number): Delay in milliseconds between each value

**Example:**
```javascript
// Fade dimmer from 0 to 255
await window.__TAURI__.core.invoke('send_test_sequence', {
  startChannel: 2,
  values: [0, 50, 100, 150, 200, 250, 255],
  delayMs: 200
});
```

### `stop_test_sender`

Stops the test sender and frees resources.

**Example:**
```javascript
await window.__TAURI__.core.invoke('stop_test_sender', {});
```

## Example Test Scenarios

### Scenario 1: Test Media Clip Selection

```javascript
// Create sender
await window.__TAURI__.core.invoke('create_test_sender', { universe: 1 });

// Play clip 001
await window.__TAURI__.core.invoke('send_test_three_channels', {
  startChannel: 1,
  clipValue: 1,
  dimmerValue: 255,
  playtypeValue: 1
});

// Wait 3 seconds
await new Promise(r => setTimeout(r, 3000));

// Switch to clip 002
await window.__TAURI__.core.invoke('send_test_three_channels', {
  startChannel: 1,
  clipValue: 2,
  dimmerValue: 255,
  playtypeValue: 1
});
```

### Scenario 2: Test Dimmer Fade

```javascript
await window.__TAURI__.core.invoke('create_test_sender', { universe: 1 });

// Start with clip 50 visible
await window.__TAURI__.core.invoke('send_test_three_channels', {
  startChannel: 1,
  clipValue: 50,
  dimmerValue: 255,
  playtypeValue: 1
});

// Fade out over 2 seconds
for(let d = 255; d >= 0; d -= 15) {
  await window.__TAURI__.core.invoke('send_test_three_channels', {
    startChannel: 1,
    clipValue: 50,
    dimmerValue: d,
    playtypeValue: 1
  });
  await new Promise(r => setTimeout(r, 80));
}
```

### Scenario 3: Test Loop Mode

```javascript
await window.__TAURI__.core.invoke('create_test_sender', { universe: 1 });

// Play clip in loop mode (playtype=2)
await window.__TAURI__.core.invoke('send_test_three_channels', {
  startChannel: 1,
  clipValue: 100,
  dimmerValue: 255,
  playtypeValue: 2
});

// Wait 10 seconds to see it loop
await new Promise(r => setTimeout(r, 10000));

// Stop playback
await window.__TAURI__.core.invoke('send_test_three_channels', {
  startChannel: 1,
  clipValue: 100,
  dimmerValue: 255,
  playtypeValue: 0
});
```

## Helper Script

Run the helper script for quick reference:

```powershell
.\test-sacn-loopback.ps1
```

This will display all available commands and examples in your terminal.

## Troubleshooting

### "Test sender not created" error

Make sure you've called `create_test_sender` first:

```javascript
await window.__TAURI__.core.invoke('create_test_sender', { universe: 1 });
```

### Not receiving DMX updates

1. Verify the sACN listener is started in the UI
2. Check that you're using the same universe number (default: 1)
3. Open the DevTools Console to see debug logs
4. Make sure Windows Firewall isn't blocking port 5568

### Channel numbers seem wrong

Remember: DMX channels are 1-indexed (1-512), not 0-indexed.

## Network Testing

If you want to test with real network traffic:

1. Set up the listener on one computer
2. Use QLC+, LightKey, or another sACN sender on another computer
3. Point it to your computer's IP address
4. Send DMX data on universe 1, channels 1-3

## Next Steps

- Configure your media files (001_filename.mp4, 002_filename.mp4, etc.)
- Test with different clip values to verify media switching
- Experiment with dimmer values for smooth fades
- Try loop mode vs. single-play mode

Enjoy testing! 🎬💡
