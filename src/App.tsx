import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { convertFileSrc } from '@tauri-apps/api/core'
import { AppConfig, NetworkInterface, DisplayInfo, DmxUpdate } from './types'
import Slider from 'rc-slider'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import 'rc-slider/assets/index.css'
import './App.css'

function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [networkInterfaces, setNetworkInterfaces] = useState<NetworkInterface[]>([])
  const [availableDisplays, setAvailableDisplays] = useState<DisplayInfo[]>([])
  const [activeSection, setActiveSection] = useState<'dmx' | 'config' | 'layout' | 'preview'>('dmx')

  useEffect(() => {
    loadConfig()
    loadNetworkInterfaces()
    loadAvailableDisplays()
  }, [])

  const loadConfig = async () => {
    const cfg = await invoke<AppConfig>('get_config')
    setConfig(cfg)
  }

  const loadNetworkInterfaces = async () => {
    const interfaces = await invoke<NetworkInterface[]>('get_network_interfaces')
    setNetworkInterfaces(interfaces)
  }

  const loadAvailableDisplays = async () => {
    try {
      const displays = await invoke<DisplayInfo[]>('get_available_displays')
      console.log('Available displays:', displays)
      setAvailableDisplays(displays)
    } catch (err) {
      console.error('Failed to load displays:', err)
      // Fallback to single display
      setAvailableDisplays([{
        index: 0,
        name: 'Primary Display',
        is_primary: true,
        width: 1920,
        height: 1080
      }])
    }
  }

  const saveConfig = async (newConfig: AppConfig) => {
    try {
      await invoke('update_config', { config: newConfig })
      setConfig(newConfig)
    } catch (err) {
      console.error('Failed to save configuration:', err)
      alert('Failed to save configuration: ' + err)
    }
  }

  if (!config) {
    return <div className="loading">Loading...</div>
  }

  return (
    <div className="app">
      <nav className="left-nav">
        <h1>StagePlayer 1.0</h1>
        <button
          className={activeSection === 'dmx' ? 'active' : ''}
          onClick={() => setActiveSection('dmx')}
        >
          DMX
        </button>
        <button
          className={activeSection === 'config' ? 'active' : ''}
          onClick={() => setActiveSection('config')}
        >
          Configuration
        </button>
        <button
          className={activeSection === 'layout' ? 'active' : ''}
          onClick={() => setActiveSection('layout')}
        >
          Layout
        </button>
        <button
          className={activeSection === 'preview' ? 'active' : ''}
          onClick={() => setActiveSection('preview')}
        >
          Preview
        </button>
        
        <div className="production-section">
          <button 
            className={config.production_mode ? 'production-active' : 'production-inactive'}
            onClick={() => saveConfig({ ...config, production_mode: !config.production_mode })}
          >
            {config.production_mode ? 'Stop Production' : 'Start Production'}
          </button>
        </div>
      </nav>

      <main className="content">
        {activeSection === 'dmx' && (
          <DmxSection 
            config={config} 
            saveConfig={saveConfig}
            networkInterfaces={networkInterfaces}
          />
        )}
        {activeSection === 'config' && (
          <ConfigSection config={config} saveConfig={saveConfig} availableDisplays={availableDisplays} />
        )}
        {activeSection === 'layout' && (
          <LayoutSection config={config} saveConfig={saveConfig} />
        )}
        {activeSection === 'preview' && (
          <PreviewSection config={config} saveConfig={saveConfig} />
        )}
      </main>
    </div>
  )
}

// sACN Test Panel Component
function SacnTestPanel({ universe, isListening }: { universe: number; isListening: boolean }) {
  const [testSenderActive, setTestSenderActive] = useState(false)
  const [channel1, setChannel1] = useState(100)  // Clip
  const [channel2, setChannel2] = useState(255)  // Dimmer
  const [channel3, setChannel3] = useState(1)    // Playtype
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(true)  // Start collapsed

  const createTestSender = async () => {
    try {
      setError(null)
      // Try to stop any existing sender first (in case of state mismatch)
      try {
        await invoke('stop_test_sender')
      } catch {
        // Ignore error if no sender exists
      }
      
      await invoke('create_test_sender', { universe })
      setTestSenderActive(true)
      setSuccess('Test sender created!')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError(String(err))
      setTestSenderActive(false)
    }
  }

  const stopTestSender = async () => {
    try {
      setError(null)
      await invoke('stop_test_sender')
      setTestSenderActive(false)
      setSuccess('Test sender stopped')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError(String(err))
    }
  }

  const sendTestData = async () => {
    console.log('sendTestData clicked, testSenderActive:', testSenderActive)
    
    if (!testSenderActive) {
      setError('Create test sender first!')
      setTimeout(() => setError(null), 3000)
      return
    }
    
    try {
      setError(null)
      console.log('Sending test data:', { channel1, channel2, channel3 })
      await invoke('send_test_three_channels', {
        startChannel: 1,
        clipValue: channel1,
        dimmerValue: channel2,
        playtypeValue: channel3
      })
      setSuccess(`Sent: Ch1=${channel1}, Ch2=${channel2}, Ch3=${channel3}`)
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      console.error('Failed to send test data:', err)
      setError(String(err))
    }
  }

  const sendQuickTest = async (clip: number, dimmer: number, playtype: number) => {
    if (!testSenderActive) {
      await createTestSender()
      // Wait a moment for sender to be ready
      await new Promise(r => setTimeout(r, 100))
    }
    
    setChannel1(clip)
    setChannel2(dimmer)
    setChannel3(playtype)
    
    try {
      setError(null)
      await invoke('send_test_three_channels', {
        startChannel: 1,
        clipValue: clip,
        dimmerValue: dimmer,
        playtypeValue: playtype
      })
      setSuccess(`Quick test: Ch1=${clip}, Ch2=${dimmer}, Ch3=${playtype}`)
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <div className="sacn-test-panel">
      <div 
        className="test-panel-header" 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ 
          cursor: 'pointer', 
          padding: '12px', 
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '6px',
          marginBottom: isCollapsed ? '0' : '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        <span style={{ fontWeight: 500, color: '#e0e0e0' }}>
          {isCollapsed ? '▶' : '▼'} Loopback Test Controls
        </span>
        <span style={{ fontSize: '12px', color: '#888' }}>
          {testSenderActive ? '🟢 Active' : '⚫ Inactive'}
        </span>
      </div>
      
      {!isCollapsed && (
        <>
          {!isListening && (
            <div className="warning-message" style={{ marginBottom: '12px' }}>
              ⚠️ Start the DMX Monitor above to see the test data you send
            </div>
          )}
          
          <div style={{ marginBottom: '16px' }}>
        {!testSenderActive ? (
          <button onClick={createTestSender} className="btn-primary">
            Create Test Sender
          </button>
        ) : (
          <button onClick={stopTestSender} className="btn-secondary">
            Stop Test Sender
          </button>
        )}
        {!testSenderActive && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#888' }}>
            Having issues? <a 
              onClick={async () => {
                try {
                  await invoke('stop_test_sender')
                  setTestSenderActive(false)
                  setSuccess('Forced stop completed')
                  setTimeout(() => setSuccess(null), 2000)
                } catch (err) {
                  setError(String(err))
                }
              }}
              style={{ color: '#4a9eff', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Force stop backend sender
            </a>
          </div>
        )}
      </div>

      {error && (
        <div className="error-message" style={{ marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {success && (
        <div className="success-message" style={{ marginBottom: '12px' }}>
          ✓ {success}
        </div>
      )}

      <div className="test-controls">
        <div className="test-channel-group">
          <label>
            <strong>Channel 1 - Clip</strong>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="number"
                min="0"
                max="255"
                value={channel1}
                onChange={(e) => setChannel1(parseInt(e.target.value) || 0)}
                style={{ width: '80px' }}
              />
              <input
                type="range"
                min="0"
                max="255"
                value={channel1}
                onChange={(e) => setChannel1(parseInt(e.target.value))}
                style={{ flex: 1 }}
              />
            </div>
          </label>
        </div>

        <div className="test-channel-group">
          <label>
            <strong>Channel 2 - Dimmer</strong>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="number"
                min="0"
                max="255"
                value={channel2}
                onChange={(e) => setChannel2(parseInt(e.target.value) || 0)}
                style={{ width: '80px' }}
              />
              <input
                type="range"
                min="0"
                max="255"
                value={channel2}
                onChange={(e) => setChannel2(parseInt(e.target.value))}
                style={{ flex: 1 }}
              />
            </div>
          </label>
        </div>

        <div className="test-channel-group">
          <label>
            <strong>Channel 3 - Play Type</strong>
            <select 
              value={channel3} 
              onChange={(e) => setChannel3(parseInt(e.target.value))}
              style={{ width: '100%', padding: '8px' }}
            >
              <option value="0">0 - Stop</option>
              <option value="1">1 - Play Once</option>
              <option value="2">2 - Loop</option>
            </select>
          </label>
        </div>

        <button 
          onClick={sendTestData} 
          className="btn-primary"
          style={{ 
            marginTop: '12px', 
            width: '100%',
            opacity: testSenderActive ? 1 : 0.6,
            cursor: testSenderActive ? 'pointer' : 'not-allowed'
          }}
        >
          Send Test Data {!testSenderActive && '(Create sender first)'}
        </button>
      </div>

      <div className="quick-tests" style={{ marginTop: '16px' }}>
        <h4>Quick Tests:</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button 
            onClick={() => sendQuickTest(1, 255, 1)}
            className="btn-secondary"
            style={{ fontSize: '12px' }}
          >
            Clip 1 Full Bright
          </button>
          <button 
            onClick={() => sendQuickTest(10, 255, 1)}
            className="btn-secondary"
            style={{ fontSize: '12px' }}
          >
            Clip 10 Full Bright
          </button>
          <button 
            onClick={() => sendQuickTest(50, 128, 1)}
            className="btn-secondary"
            style={{ fontSize: '12px' }}
          >
            Clip 50 Half Dim
          </button>
          <button 
            onClick={() => sendQuickTest(100, 255, 2)}
            className="btn-secondary"
            style={{ fontSize: '12px' }}
          >
            Clip 100 Loop
          </button>
        </div>
      </div>
        </>
      )}
    </div>
  )
}

// DMX Section Component
function DmxSection({ 
  config, 
  saveConfig, 
  networkInterfaces 
}: { 
  config: AppConfig
  saveConfig: (cfg: AppConfig) => void
  networkInterfaces: NetworkInterface[]
}) {
  const [dmxValues, setDmxValues] = useState<Map<number, number>>(new Map())
  const [isListening, setIsListening] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [listenerError, setListenerError] = useState<string | null>(null)

  // DMX listener for debugging
  useEffect(() => {
    if (!isListening) return

    let unlistenFn: (() => void) | null = null

    const setup = async () => {
      try {
        setListenerError(null)
        await invoke('start_sacn_listener')
        console.log('DMX debug listener started - check terminal for detailed logs')
        setLastUpdate(new Date())
      } catch (err) {
        const errorMsg = String(err)
        console.error('Failed to start DMX listener:', errorMsg)
        setListenerError(errorMsg)
        setIsListening(false)
        return
      }

      unlistenFn = await listen('dmx-update', (event: any) => {
        const update = event.payload as DmxUpdate
        setDmxValues(prev => {
          const next = new Map(prev)
          next.set(update.channel, update.value)
          return next
        })
        setLastUpdate(new Date())
      })
    }

    setup()

    return () => {
      if (unlistenFn) {
        unlistenFn()
      }
      invoke('stop_sacn_listener')
        .then(() => console.log('DMX debug listener stopped'))
        .catch(err => console.error('Failed to stop listener:', err))
    }
  }, [isListening])

  const startListener = () => {
    setListenerError(null)
    setIsListening(true)
  }
  const stopListener = () => {
    setIsListening(false)
    setDmxValues(new Map())
    setLastUpdate(null)
    setListenerError(null)
  }

  // Get channels with non-zero values
  const activeChannels = Array.from(dmxValues.entries())
    .filter(([_, value]) => value > 0)
    .sort((a, b) => a[0] - b[0])

  return (
    <div className="section">
      <h2>DMX Configuration</h2>
      
      <div className="card">
        <h3>Network Interface</h3>
        <select
          value={config.sacn.network_interface || ''}
          onChange={(e) => {
            const selectedInterface = networkInterfaces.find(i => i.name === e.target.value)
            saveConfig({
              ...config,
              sacn: {
                ...config.sacn,
                network_interface: e.target.value,
                ip_address: selectedInterface?.ip_address || ''
              }
            })
          }}
        >
          <option value="">All Interfaces</option>
          {networkInterfaces.map(iface => (
            <option key={iface.name} value={iface.name}>
              {iface.name} ({iface.ip_address})
            </option>
          ))}
        </select>
        {config.sacn.network_interface && (
          <p className="info">IP: {config.sacn.ip_address}</p>
        )}
      </div>

      <div className="card">
        <h3>sACN Settings</h3>
        <label>
          Universe:
          <input
            type="number"
            min="1"
            max="63999"
            value={config.sacn.universe}
            onChange={(e) => saveConfig({
              ...config,
              sacn: { ...config.sacn, universe: parseInt(e.target.value) }
            })}
          />
        </label>
        
        <label>
          Mode:
          <select
            value={config.sacn.mode}
            onChange={(e) => saveConfig({
              ...config,
              sacn: { ...config.sacn, mode: e.target.value as 'Multicast' | 'Unicast' }
            })}
          >
            <option value="Multicast">Multicast</option>
            <option value="Unicast">Unicast</option>
          </select>
        </label>

        {config.sacn.mode === 'Unicast' && (
          <label>
            Unicast IP:
            <input
              type="text"
              placeholder="192.168.1.100"
              value={config.sacn.unicast_ip || ''}
              onChange={(e) => saveConfig({
                ...config,
                sacn: { ...config.sacn, unicast_ip: e.target.value }
              })}
            />
          </label>
        )}
      </div>

      <div className="card">
        <h3>DMX Monitor</h3>
        <p className="info">Debug incoming DMX data on Universe {config.sacn.universe}</p>
        
        <div className="troubleshooting-tips">
          <h4>Troubleshooting Tips:</h4>
          <ul>
            <li><strong>Firewall:</strong> Ensure UDP port 5568 is allowed. Run <code>setup-firewall.ps1</code> as Administrator.</li>
            <li><strong>Universe:</strong> Verify your lighting console is sending to Universe {config.sacn.universe}</li>
            {config.sacn.mode === 'Multicast' ? (
              <>
                <li><strong>Multicast IP:</strong> Universe {config.sacn.universe} = 239.255.{Math.floor(config.sacn.universe / 256)}.{config.sacn.universe % 256}</li>
                <li><strong>Network:</strong> Ensure your switch supports IGMP multicast routing</li>
              </>
            ) : (
              <>
                <li><strong>Unicast Mode:</strong> Console must send directly to this computer's IP address</li>
                <li><strong>IP Address:</strong> {config.sacn.ip_address || 'Configure network interface first'}</li>
              </>
            )}
            <li><strong>Test Tool:</strong> Run <code>.\test-sacn.ps1</code> for testing instructions</li>
            <li><strong>Check Logs:</strong> Look at the terminal/console for detailed packet reception logs</li>
          </ul>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          {!isListening ? (
            <button onClick={startListener} className="btn-primary">
              Start Monitoring
            </button>
          ) : (
            <button onClick={stopListener} className="btn-secondary">
              Stop Monitoring
            </button>
          )}
        </div>

        {listenerError && (
          <div className="error-message">
            <strong>Error:</strong> {listenerError}
          </div>
        )}

        {isListening && (
          <>
            <div className="dmx-monitor-status">
              <span>Status: <strong style={{ color: '#0f0' }}>Listening</strong></span>
              {lastUpdate && (
                <span>Last Update: {lastUpdate.toLocaleTimeString()}</span>
              )}
              <span>Active Channels: {activeChannels.length}</span>
            </div>

            <div className="dmx-channel-grid">
              {activeChannels.length === 0 ? (
                <div className="dmx-no-data">
                  <div>No DMX data received</div>
                  <div style={{ fontSize: '12px', marginTop: '8px', color: '#888' }}>
                    Check the terminal output for detailed logs
                  </div>
                </div>
              ) : (
                activeChannels.map(([channel, value]) => (
                  <div key={channel} className="dmx-channel-item">
                    <span className="dmx-channel-num">Ch {channel}</span>
                    <span className="dmx-channel-value">{value}</span>
                    <div className="dmx-channel-bar">
                      <div 
                        className="dmx-channel-bar-fill"
                        style={{ width: `${(value / 255) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Test Sender Panel */}
      <div className="card">
        <h3>🧪 sACN Loopback Test</h3>
        <p className="info">Send test DMX data to channels 1, 2, 3 for testing without external hardware</p>
        
        <SacnTestPanel universe={config.sacn.universe} isListening={isListening} />
      </div>
    </div>
  )
}

// Configuration Section Component
function ConfigSection({ 
  config, 
  saveConfig, 
  availableDisplays 
}: { 
  config: AppConfig
  saveConfig: (cfg: AppConfig) => void
  availableDisplays: DisplayInfo[]
}) {
  const browseFolderMonitor1 = async () => {
    try {
      const selected = await invoke<string | null>('select_folder')
      console.log('Selected folder:', selected)
      if (selected) {
        saveConfig({
          ...config,
          monitor1: { ...config.monitor1, media_folder: selected }
        })
      }
    } catch (error) {
      console.error('Error opening folder dialog:', error)
    }
  }

  const browseFolderMonitor2 = async () => {
    try {
      const selected = await invoke<string | null>('select_folder')
      console.log('Selected folder:', selected)
      if (selected) {
        saveConfig({
          ...config,
          monitor2: { ...config.monitor2, media_folder: selected }
        })
      }
    } catch (error) {
      console.error('Error opening folder dialog:', error)
    }
  }

  return (
    <div className="section">
      <h2>Monitor Configuration</h2>
      
      <div className="card">
        <h3>Monitor 1</h3>
        <label>
          <input
            type="checkbox"
            checked={config.monitor1.enabled}
            onChange={(e) => saveConfig({
              ...config,
              monitor1: { ...config.monitor1, enabled: e.target.checked }
            })}
          />
          Enabled
        </label>
        
        <label>
          Start Channel:
          <input
            type="number"
            min="1"
            max="510"
            value={config.monitor1.start_channel}
            onChange={(e) => saveConfig({
              ...config,
              monitor1: { ...config.monitor1, start_channel: parseInt(e.target.value) }
            })}
          />
        </label>
        
        <label>
          Output Display:
          <select
            className="display-select"
            value={config.monitor1.display_index}
            onChange={(e) => saveConfig({
              ...config,
              monitor1: { 
                ...config.monitor1, 
                display_index: parseInt(e.target.value),
                window_x: null,
                window_y: null
              }
            })}
          >
            {availableDisplays.map((display) => (
              <option key={display.index} value={display.index}>
                {display.name} ({display.width}×{display.height}){display.is_primary ? ' - Primary' : ''}
              </option>
            ))}
          </select>
        </label>
        
        <label>
          Media Folder:
          <div className="folder-input-group">
            <input
              type="text"
              value={config.monitor1.media_folder}
              onChange={(e) => saveConfig({
                ...config,
                monitor1: { ...config.monitor1, media_folder: e.target.value }
              })}
            />
            <button type="button" className="browse-button" onClick={browseFolderMonitor1}>
              Browse
            </button>
          </div>
        </label>
        
        <label>
          Resolution:
          <select
            value={config.monitor1.resolution.type}
            onChange={(e) => {
              const type = e.target.value as 'HD' | 'FourK' | 'Custom'
              let newResolution: typeof config.monitor1.resolution
              if (type === 'HD') {
                newResolution = { type: 'HD', width: 1920, height: 1080 }
              } else if (type === 'FourK') {
                newResolution = { type: 'FourK', width: 3840, height: 2160 }
              } else {
                // Keep existing custom values or default to HD resolution
                const currentWidth = config.monitor1.resolution.width || 1920
                const currentHeight = config.monitor1.resolution.height || 1080
                newResolution = { type: 'Custom', width: currentWidth, height: currentHeight }
              }
              saveConfig({
                ...config,
                monitor1: { ...config.monitor1, resolution: newResolution }
              })
            }}
          >
            <option value="HD">HD (1920×1080)</option>
            <option value="FourK">4K (3840×2160)</option>
            <option value="Custom">Custom</option>
          </select>
        </label>
        
        {config.monitor1.resolution.type === 'Custom' && (
          <>
            <label>
              Width:
              <input
                type="number"
                min="1"
                max="7680"
                value={config.monitor1.resolution.width}
                onChange={(e) => saveConfig({
                  ...config,
                  monitor1: {
                    ...config.monitor1,
                    resolution: {
                      type: 'Custom',
                      width: parseInt(e.target.value) || 1920,
                      height: config.monitor1.resolution.height
                    }
                  }
                })}
              />
            </label>
            <label>
              Height:
              <input
                type="number"
                min="1"
                max="4320"
                value={config.monitor1.resolution.height}
                onChange={(e) => saveConfig({
                  ...config,
                  monitor1: {
                    ...config.monitor1,
                    resolution: {
                      type: 'Custom',
                      width: config.monitor1.resolution.width,
                      height: parseInt(e.target.value) || 1080
                    }
                  }
                })}
              />
            </label>
          </>
        )}
        
        <label>
          Orientation:
          <select
            value={config.monitor1.orientation}
            onChange={(e) => saveConfig({
              ...config,
              monitor1: { ...config.monitor1, orientation: e.target.value as 'Horizontal' | 'Vertical' }
            })}
          >
            <option value="Horizontal">Horizontal</option>
            <option value="Vertical">Vertical</option>
          </select>
        </label>
      </div>

      <div className="card">
        <h3>Monitor 2</h3>
        <label>
          <input
            type="checkbox"
            checked={config.monitor2.enabled}
            onChange={(e) => saveConfig({
              ...config,
              monitor2: { ...config.monitor2, enabled: e.target.checked }
            })}
          />
          Enabled
        </label>
        
        <label>
          Start Channel:
          <input
            type="number"
            min="1"
            max="510"
            value={config.monitor2.start_channel}
            onChange={(e) => saveConfig({
              ...config,
              monitor2: { ...config.monitor2, start_channel: parseInt(e.target.value) }
            })}
          />
        </label>
        
        <label>
          Output Display:
          <select
            className="display-select"
            value={config.monitor2.display_index}
            onChange={(e) => saveConfig({
              ...config,
              monitor2: { 
                ...config.monitor2, 
                display_index: parseInt(e.target.value),
                window_x: null,
                window_y: null
              }
            })}
          >
            {availableDisplays.map((display) => (
              <option key={display.index} value={display.index}>
                {display.name} ({display.width}×{display.height}){display.is_primary ? ' - Primary' : ''}
              </option>
            ))}
          </select>
        </label>
        
        <label>
          Media Folder:
          <div className="folder-input-group">
            <input
              type="text"
              value={config.monitor2.media_folder}
              onChange={(e) => saveConfig({
                ...config,
                monitor2: { ...config.monitor2, media_folder: e.target.value }
              })}
            />
            <button type="button" className="browse-button" onClick={browseFolderMonitor2}>
              Browse
            </button>
          </div>
        </label>
        
        <label>
          Resolution:
          <select
            value={config.monitor2.resolution.type}
            onChange={(e) => {
              const type = e.target.value as 'HD' | 'FourK' | 'Custom'
              let newResolution: typeof config.monitor2.resolution
              if (type === 'HD') {
                newResolution = { type: 'HD', width: 1920, height: 1080 }
              } else if (type === 'FourK') {
                newResolution = { type: 'FourK', width: 3840, height: 2160 }
              } else {
                // Keep existing custom values or default to HD resolution
                const currentWidth = config.monitor2.resolution.width || 1920
                const currentHeight = config.monitor2.resolution.height || 1080
                newResolution = { type: 'Custom', width: currentWidth, height: currentHeight }
              }
              saveConfig({
                ...config,
                monitor2: { ...config.monitor2, resolution: newResolution }
              })
            }}
          >
            <option value="HD">HD (1920×1080)</option>
            <option value="FourK">4K (3840×2160)</option>
            <option value="Custom">Custom</option>
          </select>
        </label>
        
        {config.monitor2.resolution.type === 'Custom' && (
          <>
            <label>
              Width:
              <input
                type="number"
                min="1"
                max="7680"
                value={config.monitor2.resolution.width}
                onChange={(e) => saveConfig({
                  ...config,
                  monitor2: {
                    ...config.monitor2,
                    resolution: {
                      type: 'Custom',
                      width: parseInt(e.target.value) || 1920,
                      height: config.monitor2.resolution.height
                    }
                  }
                })}
              />
            </label>
            <label>
              Height:
              <input
                type="number"
                min="1"
                max="4320"
                value={config.monitor2.resolution.height}
                onChange={(e) => saveConfig({
                  ...config,
                  monitor2: {
                    ...config.monitor2,
                    resolution: {
                      type: 'Custom',
                      width: config.monitor2.resolution.width,
                      height: parseInt(e.target.value) || 1080
                    }
                  }
                })}
              />
            </label>
          </>
        )}
        
        <label>
          Orientation:
          <select
            value={config.monitor2.orientation}
            onChange={(e) => saveConfig({
              ...config,
              monitor2: { ...config.monitor2, orientation: e.target.value as 'Horizontal' | 'Vertical' }
            })}
          >
            <option value="Horizontal">Horizontal</option>
            <option value="Vertical">Vertical</option>
          </select>
        </label>
      </div>
    </div>
  )
}

// Layout Section Component
function LayoutSection({ config, saveConfig }: { config: AppConfig, saveConfig: (cfg: AppConfig) => void }) {
  const isStacked = config.layout === 'HorizontalStacked' || config.layout === 'VerticalStacked';
  
  const handleLayoutChange = (stacked: boolean) => {
    const isVertical = config.monitor1.orientation === 'Vertical';
    let newLayout: typeof config.layout;
    
    if (stacked) {
      newLayout = isVertical ? 'VerticalStacked' : 'HorizontalStacked';
    } else {
      newLayout = isVertical ? 'VerticalSideBySide' : 'HorizontalSideBySide';
    }
    
    saveConfig({ ...config, layout: newLayout });
  };
  
  return (
    <div className="section">
      <h2>Layout Configuration</h2>
      
      <div className="card">
        <label>
          Monitor Arrangement:
          <select
            value={isStacked ? 'stacked' : 'sidebyside'}
            onChange={(e) => handleLayoutChange(e.target.value === 'stacked')}
          >
            <option value="sidebyside">Side by Side</option>
            <option value="stacked">Stacked</option>
          </select>
        </label>
      </div>

      <div className="card">
        <h3>Monitor Arrangement</h3>
        <div className="monitor-visualization">
          {config.layout === 'HorizontalSideBySide' && (
            <div className="layout-horizontal-side">
              {config.monitor1.enabled && (
                <div className={`monitor-box ${config.monitor1.orientation}`}>
                  <span>Monitor 1</span>
                  <span className="orientation">{config.monitor1.orientation}</span>
                </div>
              )}
              {config.monitor2.enabled && (
                <div className={`monitor-box ${config.monitor2.orientation}`}>
                  <span>Monitor 2</span>
                  <span className="orientation">{config.monitor2.orientation}</span>
                </div>
              )}
            </div>
          )}
          {config.layout === 'HorizontalStacked' && (
            <div className="layout-horizontal-stacked">
              {config.monitor1.enabled && (
                <div className={`monitor-box ${config.monitor1.orientation}`}>
                  <span>Monitor 1</span>
                  <span className="orientation">{config.monitor1.orientation}</span>
                </div>
              )}
              {config.monitor2.enabled && (
                <div className={`monitor-box ${config.monitor2.orientation}`}>
                  <span>Monitor 2</span>
                  <span className="orientation">{config.monitor2.orientation}</span>
                </div>
              )}
            </div>
          )}
          {config.layout === 'VerticalSideBySide' && (
            <div className="layout-vertical-side">
              {config.monitor1.enabled && (
                <div className={`monitor-box ${config.monitor1.orientation}`}>
                  <span>Monitor 1</span>
                  <span className="orientation">{config.monitor1.orientation}</span>
                </div>
              )}
              {config.monitor2.enabled && (
                <div className={`monitor-box ${config.monitor2.orientation}`}>
                  <span>Monitor 2</span>
                  <span className="orientation">{config.monitor2.orientation}</span>
                </div>
              )}
            </div>
          )}
          {config.layout === 'VerticalStacked' && (
            <div className="layout-vertical-stacked">
              {config.monitor1.enabled && (
                <div className={`monitor-box ${config.monitor1.orientation}`}>
                  <span>Monitor 1</span>
                  <span className="orientation">{config.monitor1.orientation}</span>
                </div>
              )}
              {config.monitor2.enabled && (
                <div className={`monitor-box ${config.monitor2.orientation}`}>
                  <span>Monitor 2</span>
                  <span className="orientation">{config.monitor2.orientation}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Preview Section Component
function PreviewSection({ config, saveConfig }: { config: AppConfig, saveConfig: (cfg: AppConfig) => void }) {
  // Monitor 1 channels
  const [monitor1Video, setMonitor1Video] = useState(0)
  const [monitor1Dimmer, setMonitor1Dimmer] = useState(255)
  const [monitor1Mode, setMonitor1Mode] = useState(0)
  
  // Monitor 2 channels
  const [monitor2Video, setMonitor2Video] = useState(0)
  const [monitor2Dimmer, setMonitor2Dimmer] = useState(255)
  const [monitor2Mode, setMonitor2Mode] = useState(0)
  
  const [monitor1Files, setMonitor1Files] = useState<string[]>([])
  const [monitor2Files, setMonitor2Files] = useState<string[]>([])
  
  // Output window states
  const [monitor1OutputEnabled, setMonitor1OutputEnabled] = useState(false)
  const [monitor2OutputEnabled, setMonitor2OutputEnabled] = useState(false)
  const [activeMonitor, setActiveMonitor] = useState<'monitor1' | 'monitor2' | null>(null)

  // Video refs for video.js players
  const monitor1VideoRef = useRef<HTMLVideoElement>(null)
  const monitor2VideoRef = useRef<HTMLVideoElement>(null)
  const monitor1PlayerRef = useRef<any>(null)
  const monitor2PlayerRef = useRef<any>(null)
  const monitor1CurrentSrcRef = useRef<string>('')
  const monitor2CurrentSrcRef = useRef<string>('')

  // Clean up video.js players on unmount
  useEffect(() => {
    return () => {
      if (monitor1PlayerRef.current) {
        try {
          monitor1PlayerRef.current.dispose()
        } catch (error) {
          console.error('Error cleaning up Monitor 1 player:', error)
        }
        monitor1PlayerRef.current = null
      }
      if (monitor2PlayerRef.current) {
        try {
          monitor2PlayerRef.current.dispose()
        } catch (error) {
          console.error('Error cleaning up Monitor 2 player:', error)
        }
        monitor2PlayerRef.current = null
      }
    }
  }, [])

  // Keyboard navigation for output window positioning
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (!activeMonitor || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        return
      }
      
      // Don't handle arrow keys if user is interacting with form controls or sliders
      const target = e.target as HTMLElement
      const tagName = target.tagName.toLowerCase()
      const isFormControl = ['input', 'select', 'textarea', 'button'].includes(tagName)
      const isSlider = target.closest('.rc-slider') !== null || 
                       target.classList.contains('rc-slider') ||
                       target.getAttribute('role') === 'slider'
      const isContentEditable = target.isContentEditable
      
      if (isFormControl || isSlider || isContentEditable) {
        return
      }
      
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      
      let deltaX = 0
      let deltaY = 0
      
      switch(e.key) {
        case 'ArrowUp':
          deltaY = -step
          break
        case 'ArrowDown':
          deltaY = step
          break
        case 'ArrowLeft':
          deltaX = -step
          break
        case 'ArrowRight':
          deltaX = step
          break
      }
      
      try {
        // Move the window and get the new position
        const [newX, newY] = await invoke<[number, number]>('move_output_window', {
          monitorId: activeMonitor,
          deltaX,
          deltaY
        })
        
        // Update config with the actual new position from the backend
        const monitorKey = activeMonitor as 'monitor1' | 'monitor2'
        const newConfig = {
          ...config,
          [monitorKey]: {
            ...config[monitorKey],
            window_x: newX,
            window_y: newY
          }
        }
        
        // Save to backend and update state
        await saveConfig(newConfig)
      } catch (err) {
        console.error('Failed to move output window:', err)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeMonitor, config])

  useEffect(() => {
    if (config.monitor1.media_folder) {
      loadMediaFiles(config.monitor1.media_folder, setMonitor1Files)
    }
    if (config.monitor2.media_folder) {
      loadMediaFiles(config.monitor2.media_folder, setMonitor2Files)
    }
  }, [config.monitor1.media_folder, config.monitor2.media_folder])
  
  // Handle Monitor 1 output window
  useEffect(() => {
    if (!config) return
    
    const handleOutputWindow = async () => {
      console.log('Monitor 1 output effect triggered:', {
        preview: config.preview,
        outputEnabled: monitor1OutputEnabled,
        monitorEnabled: config.monitor1.enabled,
        displayIndex: config.monitor1.display_index,
        resolution: config.monitor1.resolution
      })
      
      if ((config.preview === 'Test' || config.preview === 'Listen') && monitor1OutputEnabled && config.monitor1.enabled) {
        console.log('Opening Monitor 1 output window...')
        console.log('Monitor 1 config:', {
          displayIndex: config.monitor1.display_index,
          width: config.monitor1.resolution.width,
          height: config.monitor1.resolution.height,
          windowX: config.monitor1.window_x,
          windowY: config.monitor1.window_y
        })
        try {
          // Always close existing window first to handle monitor changes
          await invoke('close_output_window', { monitorId: 'monitor1' }).catch(() => {})
          
          const result = await invoke('open_output_window', {
            monitorId: 'monitor1',
            displayIndex: config.monitor1.display_index,
            width: config.monitor1.resolution.width,
            height: config.monitor1.resolution.height,
            windowX: config.monitor1.window_x,
            windowY: config.monitor1.window_y
          })
          console.log('Monitor 1 output window opened successfully:', result)
        } catch (err) {
          console.error('Failed to open output window for Monitor 1:', err)
        }
      } else {
        console.log('Closing Monitor 1 output window (if exists)')
        try {
          await invoke('close_output_window', { monitorId: 'monitor1' })
          console.log('Monitor 1 output window closed successfully')
        } catch (err) {
          console.error('Failed to close Monitor 1 output window:', err)
        }
      }
    }
    handleOutputWindow()
  }, [config.preview, monitor1OutputEnabled, config.monitor1.enabled, config.monitor1.display_index, config.monitor1.resolution])
  
  // Handle Monitor 2 output window
  useEffect(() => {
    if (!config) return
    
    const handleOutputWindow = async () => {
      console.log('Monitor 2 output effect triggered:', {
        preview: config.preview,
        outputEnabled: monitor2OutputEnabled,
        monitorEnabled: config.monitor2.enabled,
        displayIndex: config.monitor2.display_index,
        resolution: config.monitor2.resolution
      })
      
      if ((config.preview === 'Test' || config.preview === 'Listen') && monitor2OutputEnabled && config.monitor2.enabled) {
        console.log('Opening Monitor 2 output window...')
        try {
          // Always close existing window first to handle monitor changes
          await invoke('close_output_window', { monitorId: 'monitor2' }).catch(() => {})
          
          await invoke('open_output_window', {
            monitorId: 'monitor2',
            displayIndex: config.monitor2.display_index,
            width: config.monitor2.resolution.width,
            height: config.monitor2.resolution.height,
            windowX: config.monitor2.window_x,
            windowY: config.monitor2.window_y
          })
          console.log('Monitor 2 output window opened successfully')
        } catch (err) {
          console.error('Failed to open output window for Monitor 2:', err)
        }
      } else {
        console.log('Closing Monitor 2 output window (if exists)')
        try {
          await invoke('close_output_window', { monitorId: 'monitor2' })
          console.log('Monitor 2 output window closed successfully')
        } catch (err) {
          console.error('Failed to close Monitor 2 output window:', err)
        }
      }
    }
    handleOutputWindow()
  }, [config.preview, monitor2OutputEnabled, config.monitor2.enabled, config.monitor2.display_index, config.monitor2.resolution])
  
  // Cleanup output windows on unmount
  useEffect(() => {
    return () => {
      invoke('close_output_window', { monitorId: 'monitor1' }).catch(() => {})
      invoke('close_output_window', { monitorId: 'monitor2' }).catch(() => {})
    }
  }, [])

  const loadMediaFiles = async (folder: string, setter: (files: string[]) => void) => {
    try {
      const files = await invoke<string[]>('get_media_files', { folder })
      console.log('Loaded media files from', folder, ':', files)
      setter(files)
    } catch (err) {
      console.error('Failed to load media files:', err)
      setter([])
    }
  }

  const getMediaFileForDmx = (dmxValue: number, files: string[]): string | null => {
    const paddedValue = dmxValue.toString().padStart(3, '0')
    const matchingFile = files.find(f => f.startsWith(paddedValue + '_'))
    console.log(`DMX ${dmxValue} (${paddedValue}) -> ${matchingFile || 'null'}`)
    return matchingFile || null
  }

  const handleValueChange = (setter: (val: number) => void, value: string) => {
    const num = parseInt(value)
    if (!isNaN(num) && num >= 0 && num <= 255) {
      setter(num)
    }
  }

  const monitor1File = getMediaFileForDmx(monitor1Video, monitor1Files)
  const monitor2File = getMediaFileForDmx(monitor2Video, monitor2Files)
  
  // Update Monitor 1 output window when media or dimmer changes
  useEffect(() => {
    if (monitor1OutputEnabled && (config.preview === 'Test' || config.preview === 'Listen') && config.monitor1.enabled) {
      const mediaUrl = monitor1File && monitor1Video > 0
        ? convertFileSrc(`${config.monitor1.media_folder}/${monitor1File}`)
        : null
      
      console.log('Updating Monitor 1 output window:', { mediaUrl, dimmer: monitor1Dimmer, playtype: monitor1Mode, orientation: config.monitor1.orientation })
      
      invoke('update_output_window', {
        monitorId: 'monitor1',
        mediaUrl,
        dimmer: monitor1Dimmer,
        playtype: monitor1Mode,
        orientation: config.monitor1.orientation
      }).catch(err => console.error('Failed to update Monitor 1 output:', err))
    }
  }, [monitor1File, monitor1Video, monitor1Dimmer, monitor1Mode, monitor1OutputEnabled, config.preview, config.monitor1.enabled, config.monitor1.media_folder, config.monitor1.orientation])
  
  // Update Monitor 2 output window when media or dimmer changes
  useEffect(() => {
    if (monitor2OutputEnabled && (config.preview === 'Test' || config.preview === 'Listen') && config.monitor2.enabled) {
      const mediaUrl = monitor2File && monitor2Video > 0
        ? convertFileSrc(`${config.monitor2.media_folder}/${monitor2File}`)
        : null
      
      invoke('update_output_window', {
        monitorId: 'monitor2',
        mediaUrl,
        dimmer: monitor2Dimmer,
        playtype: monitor2Mode,
        orientation: config.monitor2.orientation
      }).catch(err => console.error('Failed to update Monitor 2 output:', err))
    }
  }, [monitor2File, monitor2Video, monitor2Dimmer, monitor2Mode, monitor2OutputEnabled, config.preview, config.monitor2.enabled, config.monitor2.media_folder, config.monitor2.orientation])

  // Initialize and update Monitor 1 video player
  useEffect(() => {
    const isVideo = monitor1File && monitor1File.match(/\.(mp4|mov|avi|mkv)$/i)
    
    if (isVideo && monitor1VideoRef.current) {
      // Initialize player if not already initialized
      if (!monitor1PlayerRef.current) {
        console.log('Initializing video.js player for Monitor 1')
        try {
          monitor1PlayerRef.current = videojs(monitor1VideoRef.current, {
            controls: false,
            autoplay: true,
            loop: false,  // We'll handle loop manually for reliability
            muted: true,
            preload: 'auto',
            fluid: false,
            fill: true,
            html5: {
              vhs: {
                overrideNative: true
              },
              nativeVideoTracks: false,
              nativeAudioTracks: false,
              nativeTextTracks: false
            }
          })

          // Manual loop handling for seamless playback
          monitor1PlayerRef.current.on('ended', () => {
            console.log('Monitor 1 video ended')
            // Mode: 0-127 = loop, 128-255 = no loop
            if (monitor1Mode < 128 && monitor1PlayerRef.current) {
              console.log('Looping Monitor 1 video (mode < 128)')
              monitor1PlayerRef.current.currentTime(0)
              monitor1PlayerRef.current.play()
            } else {
              console.log('Not looping Monitor 1 video (mode >= 128)')
            }
          })

          // Debug events
          monitor1PlayerRef.current.on('loadeddata', () => {
            console.log('Monitor 1 video loaded, duration:', monitor1PlayerRef.current?.duration())
          })

          monitor1PlayerRef.current.on('error', (e: any) => {
            console.error('Monitor 1 video error:', e, monitor1PlayerRef.current?.error())
          })

          monitor1PlayerRef.current.on('stalled', () => {
            console.warn('Monitor 1 video stalled')
          })

          monitor1PlayerRef.current.on('waiting', () => {
            console.warn('Monitor 1 video waiting')
          })
        } catch (error) {
          console.error('Failed to initialize video.js player for Monitor 1:', error)
          monitor1PlayerRef.current = null
        }
      }
      
      // Load the video source
      if (monitor1PlayerRef.current) {
        const videoSrc = convertFileSrc(`${config.monitor1.media_folder}/${monitor1File}`)
        console.log('Loading video for Monitor 1:', monitor1File, videoSrc)
        try {
          // Check if this is a new source or resuming current
          if (monitor1CurrentSrcRef.current !== videoSrc) {
            // New source - load it
            console.log('New source for Monitor 1, loading...')
            monitor1PlayerRef.current.src({
              type: 'video/mp4',
              src: videoSrc
            })
            monitor1PlayerRef.current.load()
            monitor1CurrentSrcRef.current = videoSrc
            // Play after load starts
            monitor1PlayerRef.current.ready(() => {
              monitor1PlayerRef.current.play().catch((e: any) => console.error('Play failed:', e))
            })
          } else {
            // Same source - just ensure it's playing
            console.log('Same source for Monitor 1, resuming...')
            if (monitor1PlayerRef.current.paused()) {
              monitor1PlayerRef.current.play().catch((e: any) => console.error('Resume failed:', e))
            }
          }
        } catch (error) {
          console.error('Failed to load video source for Monitor 1:', error)
        }
      }
    } else {
      // Clear current source when not showing video
      if (!isVideo) {
        monitor1CurrentSrcRef.current = ''
      }
    }
    if (!isVideo && monitor1PlayerRef.current) {
      // Pause player when showing image or no media
      console.log('Pausing video.js player for Monitor 1 (showing', monitor1File ? 'image' : 'no media', ')')
      try {
        if (!monitor1PlayerRef.current.paused()) {
          monitor1PlayerRef.current.pause()
        }
      } catch (error) {
        console.error('Error pausing video.js player for Monitor 1:', error)
      }
    }
  }, [monitor1File, monitor1Video, config.monitor1.media_folder])

  // Initialize and update Monitor 2 video player
  useEffect(() => {
    const isVideo = monitor2File && monitor2File.match(/\.(mp4|mov|avi|mkv)$/i)
    
    if (isVideo && monitor2VideoRef.current) {
      // Initialize player if not already initialized
      if (!monitor2PlayerRef.current) {
        console.log('Initializing video.js player for Monitor 2')
        try {
          monitor2PlayerRef.current = videojs(monitor2VideoRef.current, {
            controls: false,
            autoplay: true,
            loop: false,  // We'll handle loop manually for reliability
            muted: true,
            preload: 'auto',
            fluid: false,
            fill: true,
            html5: {
              vhs: {
                overrideNative: true
              },
              nativeVideoTracks: false,
              nativeAudioTracks: false,
              nativeTextTracks: false
            }
          })

          // Manual loop handling for seamless playback
          monitor2PlayerRef.current.on('ended', () => {
            console.log('Monitor 2 video ended')
            // Mode: 0-127 = loop, 128-255 = no loop
            if (monitor2Mode < 128 && monitor2PlayerRef.current) {
              console.log('Looping Monitor 2 video (mode < 128)')
              monitor2PlayerRef.current.currentTime(0)
              monitor2PlayerRef.current.play()
            } else {
              console.log('Not looping Monitor 2 video (mode >= 128)')
            }
          })

          // Debug events
          monitor2PlayerRef.current.on('loadeddata', () => {
            console.log('Monitor 2 video loaded, duration:', monitor2PlayerRef.current?.duration())
          })

          monitor2PlayerRef.current.on('error', (e: any) => {
            console.error('Monitor 2 video error:', e, monitor2PlayerRef.current?.error())
          })

          monitor2PlayerRef.current.on('stalled', () => {
            console.warn('Monitor 2 video stalled')
          })

          monitor2PlayerRef.current.on('waiting', () => {
            console.warn('Monitor 2 video waiting')
          })
        } catch (error) {
          console.error('Failed to initialize video.js player for Monitor 2:', error)
          monitor2PlayerRef.current = null
        }
      }
      
      // Load the video source
      if (monitor2PlayerRef.current) {
        const videoSrc = convertFileSrc(`${config.monitor2.media_folder}/${monitor2File}`)
        console.log('Loading video for Monitor 2:', monitor2File, videoSrc)
        try {
          // Check if this is a new source or resuming current
          if (monitor2CurrentSrcRef.current !== videoSrc) {
            // New source - load it
            console.log('New source for Monitor 2, loading...')
            monitor2PlayerRef.current.src({
              type: 'video/mp4',
              src: videoSrc
            })
            monitor2PlayerRef.current.load()
            monitor2CurrentSrcRef.current = videoSrc
            // Play after load starts
            monitor2PlayerRef.current.ready(() => {
              monitor2PlayerRef.current.play().catch((e: any) => console.error('Play failed:', e))
            })
          } else {
            // Same source - just ensure it's playing
            console.log('Same source for Monitor 2, resuming...')
            if (monitor2PlayerRef.current.paused()) {
              monitor2PlayerRef.current.play().catch((e: any) => console.error('Resume failed:', e))
            }
          }
        } catch (error) {
          console.error('Failed to load video source for Monitor 2:', error)
        }
      }
    } else {
      // Clear current source when not showing video
      if (!isVideo) {
        monitor2CurrentSrcRef.current = ''
      }
    }
    if (!isVideo && monitor2PlayerRef.current) {
      // Pause player when showing image or no media
      console.log('Pausing video.js player for Monitor 2 (showing', monitor2File ? 'image' : 'no media', ')')
      try {
        if (!monitor2PlayerRef.current.paused()) {
          monitor2PlayerRef.current.pause()
        }
      } catch (error) {
        console.error('Error pausing video.js player for Monitor 2:', error)
      }
    }
  }, [monitor2File, monitor2Video, config.monitor2.media_folder])

  // Listen for DMX updates in Listen mode
  useEffect(() => {
    if (config.preview !== 'Listen') return

    let unlistenFn: (() => void) | null = null

    const setup = async () => {
      // Start sACN listener
      try {
        await invoke('start_sacn_listener')
        console.log('sACN listener started successfully')
      } catch (err) {
        console.error('Failed to start sACN listener:', err)
        return
      }

      // Listen for DMX update events
      unlistenFn = await listen('dmx-update', (event: any) => {
        const update = event.payload as DmxUpdate
        console.log('DMX Update - Ch:', update.channel, 'Val:', update.value)

        // Check Monitor 1 channels
        const m1ClipCh = config.monitor1.start_channel
        const m1DimmerCh = config.monitor1.start_channel + 1
        const m1ModeCh = config.monitor1.start_channel + 2

        // Check Monitor 2 channels
        const m2ClipCh = config.monitor2.start_channel
        const m2DimmerCh = config.monitor2.start_channel + 1
        const m2ModeCh = config.monitor2.start_channel + 2

        // Update Monitor 1
        if (config.monitor1.enabled) {
          if (update.channel === m1ClipCh) {
            console.log('Monitor 1 Video:', update.value)
            setMonitor1Video(update.value)
          } else if (update.channel === m1DimmerCh) {
            console.log('Monitor 1 Dimmer:', update.value)
            setMonitor1Dimmer(update.value)
          } else if (update.channel === m1ModeCh) {
            console.log('Monitor 1 Mode:', update.value)
            setMonitor1Mode(update.value)
          }
        }

        // Update Monitor 2
        if (config.monitor2.enabled) {
          if (update.channel === m2ClipCh) {
            console.log('Monitor 2 Video:', update.value)
            setMonitor2Video(update.value)
          } else if (update.channel === m2DimmerCh) {
            console.log('Monitor 2 Dimmer:', update.value)
            setMonitor2Dimmer(update.value)
          } else if (update.channel === m2ModeCh) {
            console.log('Monitor 2 Mode:', update.value)
            setMonitor2Mode(update.value)
          }
        }
      })
      console.log('DMX event listener registered')
    }

    setup()

    // Cleanup on unmount or mode change
    return () => {
      if (unlistenFn) {
        unlistenFn()
        console.log('DMX event listener removed')
      }
      invoke('stop_sacn_listener')
        .then(() => console.log('sACN listener stopped'))
        .catch(err => console.error('Failed to stop sACN listener:', err))
    }
  }, [config.preview, config.monitor1.enabled, config.monitor1.start_channel, 
      config.monitor2.enabled, config.monitor2.start_channel])

  return (
    <div className="section">
      <h2>Preview</h2>
      
      <div className="card">
        <h3>Preview Mode</h3>
        <div className="mode-toggle">
          <button
            className={config.preview === 'Listen' ? 'active' : ''}
            onClick={() => saveConfig({ ...config, preview: 'Listen' })}
          >
            Listen
          </button>
          <button
            className={config.preview === 'Test' ? 'active' : ''}
            onClick={() => saveConfig({ ...config, preview: 'Test' })}
          >
            Test
          </button>
        </div>

        {config.preview === 'Test' && (
          <div className="test-controls">
            {config.monitor1.enabled && (
              <div className="monitor-controls">
                <h4>Monitor 1 (Ch {config.monitor1.start_channel})</h4>
                <div className="sliders-group">
                <div className="vertical-slider-control">
                  <label>Video</label>
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={monitor1Video}
                    onChange={(e) => handleValueChange(setMonitor1Video, e.target.value)}
                    className="slider-value-input"
                    aria-label="Monitor 1 Video Value"
                  />
                  <div className="slider-wrapper">
                    <Slider
                      vertical
                      min={0}
                      max={255}
                      step={1}
                      value={monitor1Video}
                      onChange={(value) => setMonitor1Video(value as number)}
                      trackStyle={{ backgroundColor: '#0066ff', width: 8 }}
                      railStyle={{ backgroundColor: '#3a3a3a', width: 8 }}
                      handleStyle={{
                        backgroundColor: '#0066ff',
                        borderColor: '#0066ff',
                        width: 24,
                        height: 24,
                        marginLeft: -8,
                        boxShadow: '0 2px 10px rgba(0, 102, 255, 0.6)'
                      }}
                    />
                  </div>
                  <span className="channel-label">Ch {config.monitor1.start_channel}</span>
                </div>
                
                <div className="vertical-slider-control">
                  <label>Dimmer</label>
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={monitor1Dimmer}
                    onChange={(e) => handleValueChange(setMonitor1Dimmer, e.target.value)}
                    className="slider-value-input"
                    aria-label="Monitor 1 Dimmer Value"
                  />
                  <div className="slider-wrapper">
                    <Slider
                      vertical
                      min={0}
                      max={255}
                      step={1}
                      value={monitor1Dimmer}
                      onChange={(value) => setMonitor1Dimmer(value as number)}
                      trackStyle={{ backgroundColor: '#0066ff', width: 8 }}
                      railStyle={{ backgroundColor: '#3a3a3a', width: 8 }}
                      handleStyle={{
                        backgroundColor: '#0066ff',
                        borderColor: '#0066ff',
                        width: 24,
                        height: 24,
                        marginLeft: -8,
                        boxShadow: '0 2px 10px rgba(0, 102, 255, 0.6)'
                      }}
                    />
                  </div>
                  <span className="channel-label">Ch {config.monitor1.start_channel + 1}</span>
                </div>
                
                <div className="vertical-slider-control">
                  <label>Mode</label>
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={monitor1Mode}
                    onChange={(e) => handleValueChange(setMonitor1Mode, e.target.value)}
                    className="slider-value-input"
                    aria-label="Monitor 1 Mode Value"
                  />
                  <div className="slider-wrapper">
                    <Slider
                      vertical
                      min={0}
                      max={255}
                      step={1}
                      value={monitor1Mode}
                      onChange={(value) => setMonitor1Mode(value as number)}
                      trackStyle={{ backgroundColor: '#0066ff', width: 8 }}
                      railStyle={{ backgroundColor: '#3a3a3a', width: 8 }}
                      handleStyle={{
                        backgroundColor: '#0066ff',
                        borderColor: '#0066ff',
                        width: 24,
                        height: 24,
                        marginLeft: -8,
                        boxShadow: '0 2px 10px rgba(0, 102, 255, 0.6)'
                      }}
                    />
                  </div>
                  <span className="channel-label">Ch {config.monitor1.start_channel + 2}</span>
                </div>
              </div>
            </div>
            )}

            {config.monitor2.enabled && (
              <div className="monitor-controls">
                <h4>Monitor 2 (Ch {config.monitor2.start_channel})</h4>
                <div className="sliders-group">
                <div className="vertical-slider-control">
                  <label>Video</label>
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={monitor2Video}
                    onChange={(e) => handleValueChange(setMonitor2Video, e.target.value)}
                    className="slider-value-input"
                    aria-label="Monitor 2 Video Value"
                  />
                  <div className="slider-wrapper">
                    <Slider
                      vertical
                      min={0}
                      max={255}
                      step={1}
                      value={monitor2Video}
                      onChange={(value) => setMonitor2Video(value as number)}
                      trackStyle={{ backgroundColor: '#0066ff', width: 8 }}
                      railStyle={{ backgroundColor: '#3a3a3a', width: 8 }}
                      handleStyle={{
                        backgroundColor: '#0066ff',
                        borderColor: '#0066ff',
                        width: 24,
                        height: 24,
                        marginLeft: -8,
                        boxShadow: '0 2px 10px rgba(0, 102, 255, 0.6)'
                      }}
                    />
                  </div>
                  <span className="channel-label">Ch {config.monitor2.start_channel}</span>
                </div>
                
                <div className="vertical-slider-control">
                  <label>Dimmer</label>
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={monitor2Dimmer}
                    onChange={(e) => handleValueChange(setMonitor2Dimmer, e.target.value)}
                    className="slider-value-input"
                    aria-label="Monitor 2 Dimmer Value"
                  />
                  <div className="slider-wrapper">
                    <Slider
                      vertical
                      min={0}
                      max={255}
                      step={1}
                      value={monitor2Dimmer}
                      onChange={(value) => setMonitor2Dimmer(value as number)}
                      trackStyle={{ backgroundColor: '#0066ff', width: 8 }}
                      railStyle={{ backgroundColor: '#3a3a3a', width: 8 }}
                      handleStyle={{
                        backgroundColor: '#0066ff',
                        borderColor: '#0066ff',
                        width: 24,
                        height: 24,
                        marginLeft: -8,
                        boxShadow: '0 2px 10px rgba(0, 102, 255, 0.6)'
                      }}
                    />
                  </div>
                  <span className="channel-label">Ch {config.monitor2.start_channel + 1}</span>
                </div>
                
                <div className="vertical-slider-control">
                  <label>Mode</label>
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={monitor2Mode}
                    onChange={(e) => handleValueChange(setMonitor2Mode, e.target.value)}
                    className="slider-value-input"
                    aria-label="Monitor 2 Mode Value"
                  />
                  <div className="slider-wrapper">
                    <Slider
                      vertical
                      min={0}
                      max={255}
                      step={1}
                      value={monitor2Mode}
                      onChange={(value) => setMonitor2Mode(value as number)}
                      trackStyle={{ backgroundColor: '#0066ff', width: 8 }}
                      railStyle={{ backgroundColor: '#3a3a3a', width: 8 }}
                      handleStyle={{
                        backgroundColor: '#0066ff',
                        borderColor: '#0066ff',
                        width: 24,
                        height: 24,
                        marginLeft: -8,
                        boxShadow: '0 2px 10px rgba(0, 102, 255, 0.6)'
                      }}
                    />
                  </div>
                  <span className="channel-label">Ch {config.monitor2.start_channel + 2}</span>
                </div>
              </div>
            </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Preview Output</h3>
        <div className={`preview-monitors ${config.layout.toLowerCase()}`}>
          {config.monitor1.enabled && (
            <div 
              className="preview-monitor"
              onClick={() => setActiveMonitor('monitor1')}
              tabIndex={0}
              style={{ cursor: 'pointer' }}
            >
              <div className={`preview-screen ${config.monitor1.orientation.toLowerCase()}`}>
                {/* Video element always rendered for video.js stability */}
                <video
                  ref={monitor1VideoRef}
                  className="video-js vjs-default-skin"
                  style={{ 
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%', 
                    height: '100%',
                    visibility: (monitor1Video > 0 && monitor1File && monitor1File.match(/\.(mp4|mov|avi|mkv)$/i)) ? 'visible' : 'hidden',
                    opacity: monitor1Dimmer / 255,
                    zIndex: (monitor1Video > 0 && monitor1File && monitor1File.match(/\.(mp4|mov|avi|mkv)$/i)) ? 10 : 0
                  }}
                />
                
                {/* Image container */}
                {monitor1Video > 0 && monitor1File && monitor1File.match(/\.(jpg|jpeg|png|gif|bmp)$/i) && (
                  <div className="preview-content" style={{ opacity: monitor1Dimmer / 255, zIndex: 20 }}>
                    <img
                      key={monitor1File}
                      src={convertFileSrc(`${config.monitor1.media_folder}/${monitor1File}`)}
                      alt={monitor1File}
                      onLoad={() => console.log('Image loaded:', monitor1File)}
                      onError={(e) => console.error('Image failed to load:', monitor1File, e)}
                    />
                  </div>
                )}
              </div>
              <div className="preview-label">
                <strong>Monitor 1</strong>
                <span className="preview-filename">
                  {monitor1Video > 0 && monitor1File ? monitor1File : 'No media'}
                </span>
                {config.preview === 'Listen' && (
                  <>
                    <div className="dmx-values">
                      <span>Ch {config.monitor1.start_channel}: {monitor1Video}</span>
                      <span>Ch {config.monitor1.start_channel + 1}: {monitor1Dimmer}</span>
                      <span>Ch {config.monitor1.start_channel + 2}: {monitor1Mode}</span>
                    </div>
                    <label className="output-checkbox">
                      <input
                        type="checkbox"
                        checked={monitor1OutputEnabled}
                        onChange={(e) => {
                          console.log('[Monitor 1 Listen] Output checkbox changed to:', e.target.checked)
                          setMonitor1OutputEnabled(e.target.checked)
                        }}
                      />
                      Output to Display
                    </label>
                  </>
                )}
                {config.preview === 'Test' && (
                  <>
                    <label className="output-checkbox">
                      <input
                        type="checkbox"
                        checked={monitor1OutputEnabled}
                        onChange={(e) => {
                          console.log('[Monitor 1 Test] Output checkbox changed to:', e.target.checked)
                          setMonitor1OutputEnabled(e.target.checked)
                        }}
                      />
                      Output to Display
                    </label>
                  </>
                )}
              </div>
            </div>
          )}

          {config.monitor2.enabled && (
            <div 
              className="preview-monitor"
              onClick={() => setActiveMonitor('monitor2')}
              tabIndex={0}
              style={{ cursor: 'pointer' }}
            >
              <div className={`preview-screen ${config.monitor2.orientation.toLowerCase()}`}>
                {/* Video element always rendered for video.js stability */}
                <video
                  ref={monitor2VideoRef}
                  className="video-js vjs-default-skin"
                  style={{ 
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%', 
                    height: '100%',
                    visibility: (monitor2Video > 0 && monitor2File && monitor2File.match(/\.(mp4|mov|avi|mkv)$/i)) ? 'visible' : 'hidden',
                    opacity: monitor2Dimmer / 255,
                    zIndex: (monitor2Video > 0 && monitor2File && monitor2File.match(/\.(mp4|mov|avi|mkv)$/i)) ? 10 : 0
                  }}
                />
                
                {/* Image container */}
                {monitor2Video > 0 && monitor2File && monitor2File.match(/\.(jpg|jpeg|png|gif|bmp)$/i) && (
                  <div className="preview-content" style={{ opacity: monitor2Dimmer / 255, zIndex: 20 }}>
                    <img
                      key={monitor2File}
                      src={convertFileSrc(`${config.monitor2.media_folder}/${monitor2File}`)}
                      alt={monitor2File}
                      onLoad={() => console.log('Image loaded:', monitor2File)}
                      onError={(e) => console.error('Image failed to load:', monitor2File, e)}
                    />
                  </div>
                )}
              </div>
              <div className="preview-label">
                <strong>Monitor 2</strong>
                <span className="preview-filename">
                  {monitor2Video > 0 && monitor2File ? monitor2File : 'No media'}
                </span>
                {config.preview === 'Listen' && (
                  <>
                    <div className="dmx-values">
                      <span>Ch {config.monitor2.start_channel}: {monitor2Video}</span>
                      <span>Ch {config.monitor2.start_channel + 1}: {monitor2Dimmer}</span>
                      <span>Ch {config.monitor2.start_channel + 2}: {monitor2Mode}</span>
                    </div>
                    <label className="output-checkbox">
                      <input
                        type="checkbox"
                        checked={monitor2OutputEnabled}
                        onChange={(e) => setMonitor2OutputEnabled(e.target.checked)}
                      />
                      Output to Display
                    </label>
                  </>
                )}
                {config.preview === 'Test' && (
                  <>
                    <label className="output-checkbox">
                      <input
                        type="checkbox"
                        checked={monitor2OutputEnabled}
                        onChange={(e) => setMonitor2OutputEnabled(e.target.checked)}
                      />
                      Output to Display
                    </label>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* sACN Test Sender Panel for Preview/Listen Mode */}
      {config.preview === 'Listen' && (
        <div className="card">
          <h3>🧪 sACN Loopback Test</h3>
          <p className="info">Send test DMX data to channels 1, 2, 3 for testing your preview</p>
          
          <SacnTestPanel universe={config.sacn.universe} isListening={false} />
        </div>
      )}
    </div>
  )
}

export default App
