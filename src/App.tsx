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
  const [activeSection, setActiveSection] = useState<'dmx' | 'config' | 'layout' | 'preview' | 'presentation' | 'tools'>('dmx')
  const [productionActive, setProductionActive] = useState(false)

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

  const startProduction = async (cfg: AppConfig) => {
    if (cfg.monitor1.enabled) {
      await invoke('close_output_window', { monitorId: 'monitor1' }).catch(() => {})
      await invoke('open_output_window', {
        monitorId: 'monitor1',
        displayIndex: cfg.monitor1.display_index,
        width: cfg.monitor1.resolution.width,
        height: cfg.monitor1.resolution.height,
        windowX: cfg.monitor1.window_x,
        windowY: cfg.monitor1.window_y
      }).catch(err => console.error('Failed to open Monitor 1:', err))
    }
    if (cfg.monitor2.enabled) {
      await invoke('close_output_window', { monitorId: 'monitor2' }).catch(() => {})
      await invoke('open_output_window', {
        monitorId: 'monitor2',
        displayIndex: cfg.monitor2.display_index,
        width: cfg.monitor2.resolution.width,
        height: cfg.monitor2.resolution.height,
        windowX: cfg.monitor2.window_x,
        windowY: cfg.monitor2.window_y
      }).catch(err => console.error('Failed to open Monitor 2:', err))
    }
    setProductionActive(true)
  }

  const stopProduction = async () => {
    setProductionActive(false)
    await invoke('stop_sacn_listener').catch(() => {})
    await invoke('close_output_window', { monitorId: 'monitor1' }).catch(() => {})
    await invoke('close_output_window', { monitorId: 'monitor2' }).catch(() => {})
  }

  // Production DMX state
  const [prodMonitor1Video, setProdMonitor1Video] = useState(0)
  const [prodMonitor2Video, setProdMonitor2Video] = useState(0)
  const [prodMonitor1Dimmer, setProdMonitor1Dimmer] = useState(255)
  const [prodMonitor2Dimmer, setProdMonitor2Dimmer] = useState(255)
  const [prodMonitor1Mode, setProdMonitor1Mode] = useState(0)
  const [prodMonitor2Mode, setProdMonitor2Mode] = useState(0)
  const [prodMonitor1Files, setProdMonitor1Files] = useState<string[]>([])
  const [prodMonitor2Files, setProdMonitor2Files] = useState<string[]>([])

  // Load production media file lists
  useEffect(() => {
    if (!config) return
    if (config.monitor1.media_folder) {
      invoke<string[]>('get_media_files', { folder: config.monitor1.media_folder })
        .then(files => setProdMonitor1Files(files)).catch(() => {})
    }
    if (config.monitor2.media_folder) {
      invoke<string[]>('get_media_files', { folder: config.monitor2.media_folder })
        .then(files => setProdMonitor2Files(files)).catch(() => {})
    }
  }, [config?.monitor1.media_folder, config?.monitor2.media_folder])

  // sACN listener for production mode
  useEffect(() => {
    if (!productionActive || !config) return
    setProdMonitor1Video(0); setProdMonitor2Video(0)
    setProdMonitor1Dimmer(255); setProdMonitor2Dimmer(255)
    setProdMonitor1Mode(0); setProdMonitor2Mode(0)
    let unlistenFn: (() => void) | null = null
    const setup = async () => {
      try { await invoke('start_sacn_listener') } catch (err) { console.error('Failed to start sACN listener:', err); return }
      unlistenFn = await listen('dmx-update', (event: any) => {
        const update = event.payload as DmxUpdate
        if (config.monitor1.enabled) {
          if (update.channel === config.monitor1.start_channel) setProdMonitor1Video(update.value)
          else if (update.channel === config.monitor1.start_channel + 1) setProdMonitor1Dimmer(update.value)
          else if (update.channel === config.monitor1.start_channel + 2) setProdMonitor1Mode(update.value)
        }
        if (config.monitor2.enabled) {
          if (update.channel === config.monitor2.start_channel) setProdMonitor2Video(update.value)
          else if (update.channel === config.monitor2.start_channel + 1) setProdMonitor2Dimmer(update.value)
          else if (update.channel === config.monitor2.start_channel + 2) setProdMonitor2Mode(update.value)
        }
      })
    }
    setup()
    return () => { unlistenFn?.(); invoke('stop_sacn_listener').catch(() => {}) }
  }, [productionActive])

  const getProdMediaFile = (dmxValue: number, files: string[]): string | null => {
    if (dmxValue === 0) return null
    const padded = dmxValue.toString().padStart(3, '0')
    return files.find(f => f.startsWith(padded + '_')) || null
  }

  // Update output windows when DMX values change during production
  useEffect(() => {
    if (!productionActive || !config?.monitor1.enabled) return
    if (prodMonitor1Video === 255) return // handled by close_output_window effect below
    const file = getProdMediaFile(prodMonitor1Video, prodMonitor1Files)
    const mediaUrl = file ? convertFileSrc(`${config.monitor1.media_folder}/${file}`) : null
    invoke('update_output_window', { monitorId: 'monitor1', mediaUrl, dimmer: prodMonitor1Dimmer, playtype: prodMonitor1Mode, orientation: config.monitor1.orientation }).catch(() => {})
  }, [prodMonitor1Video, prodMonitor1Dimmer, prodMonitor1Mode, productionActive])

  useEffect(() => {
    if (!productionActive || !config?.monitor2.enabled) return
    if (prodMonitor2Video === 255) return // handled by close_output_window effect below
    const file = getProdMediaFile(prodMonitor2Video, prodMonitor2Files)
    const mediaUrl = file ? convertFileSrc(`${config.monitor2.media_folder}/${file}`) : null
    invoke('update_output_window', { monitorId: 'monitor2', mediaUrl, dimmer: prodMonitor2Dimmer, playtype: prodMonitor2Mode, orientation: config.monitor2.orientation }).catch(() => {})
  }, [prodMonitor2Video, prodMonitor2Dimmer, prodMonitor2Mode, productionActive])

  // ESC to stop production
  useEffect(() => {
    if (!productionActive) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stopProduction() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [productionActive])

  // Video channel 255 = close that monitor's output window
  useEffect(() => {
    if (!productionActive) return
    if (prodMonitor1Video === 255) invoke('close_output_window', { monitorId: 'monitor1' }).catch(() => {})
  }, [prodMonitor1Video, productionActive])

  useEffect(() => {
    if (!productionActive) return
    if (prodMonitor2Video === 255) invoke('close_output_window', { monitorId: 'monitor2' }).catch(() => {})
  }, [prodMonitor2Video, productionActive])

  if (!config) {
    return <div className="loading">Loading...</div>
  }

  return (
    <div className="app">
      <nav className="left-nav">
        <img src="/logo.png" alt="StagePlayer DMX" style={{ width: 'calc(100% + 10px)', marginLeft: '-5px', marginRight: '-5px', marginTop: '15px', marginBottom: '15px', display: 'block' }} />
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
        <button
          className={activeSection === 'presentation' ? 'active' : ''}
          onClick={() => setActiveSection('presentation')}
        >
          Presentation
        </button>
        <button
          className={activeSection === 'tools' ? 'active' : ''}
          onClick={() => setActiveSection('tools')}
        >
          Tools
        </button>
        
        <div className="production-section">
          <button 
            className={productionActive ? 'production-active' : 'production-inactive'}
            onClick={() => productionActive ? stopProduction() : startProduction(config)}
          >
            {productionActive ? 'Stop Production' : 'Start Production'}
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
        {activeSection === 'presentation' && (
          <PresentationSection config={config} />
        )}
        {activeSection === 'tools' && (
          <ToolsSection config={config} />
        )}
      </main>
    </div>
  )
}

// DMX Channel Indicator Component
function DmxChannelIndicator({ channel, value }: { channel: number; value: number }) {
  const percentage = (value / 255) * 100
  
  return (
    <div className="dmx-channel-indicator">
      <div className="dmx-channel-header">
        <span className="dmx-channel-name">Ch {channel}</span>
      </div>
      <div className="dmx-channel-value">{value}</div>
      <div className="dmx-channel-bar-container">
        <div 
          className="dmx-channel-bar-fill" 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

// Inline Editable Name Component
function EditableName({ 
  name, 
  onSave 
}: { 
  name: string
  onSave: (newName: string) => void 
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSave = () => {
    if (editValue.trim()) {
      onSave(editValue.trim())
    } else {
      setEditValue(name)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setEditValue(name)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        style={{
          fontSize: '14px',
          fontWeight: 'bold',
          padding: '2px 4px',
          border: '1px solid #0066ff',
          borderRadius: '3px',
          background: '#1a1a1a',
          color: '#fff',
          outline: 'none',
          minWidth: '100px'
        }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <strong>{name}</strong>
      <button
        onClick={() => {
          setEditValue(name)
          setIsEditing(true)
        }}
        style={{
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '4px',
          cursor: 'pointer',
          padding: '4px 6px',
          color: '#aaa',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.2s',
          lineHeight: '1'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0, 102, 255, 0.2)'
          e.currentTarget.style.color = '#0066ff'
          e.currentTarget.style.borderColor = '#0066ff'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
          e.currentTarget.style.color = '#aaa'
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
        }}
        title="Edit name"
      >
        ✏️
      </button>
    </div>
  )
}

// Preview Test Panel Component with support for both monitors
function PreviewTestPanel({ 
  universe, 
  monitor1Start,
  monitor1Name,
  monitor2Start,
  monitor2Name,
  onValuesChange 
}: { 
  universe: number
  monitor1Start: number
  monitor1Name: string
  monitor2Start: number
  monitor2Name: string
  onValuesChange: (monitor1Video: number, monitor1Dimmer: number, monitor1Mode: number, monitor2Video: number, monitor2Dimmer: number, monitor2Mode: number) => void
}) {
  const [testSenderActive, setTestSenderActive] = useState(false)
  const [m1Video, setM1Video] = useState(100)
  const [m1Dimmer, setM1Dimmer] = useState(255)
  const [m1Mode, setM1Mode] = useState(1)
  const [m2Video, setM2Video] = useState(100)
  const [m2Dimmer, setM2Dimmer] = useState(255)
  const [m2Mode, setM2Mode] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(true)

  const createTestSender = async () => {
    try {
      setError(null)
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
    if (!testSenderActive) {
      setError('Create test sender first!')
      setTimeout(() => setError(null), 3000)
      return
    }
    
    try {
      setError(null)
      // Send data for monitor 1
      await invoke('send_test_three_channels', {
        startChannel: monitor1Start,
        clipValue: m1Video,
        dimmerValue: m1Dimmer,
        playtypeValue: m1Mode
      })
      // Send data for monitor 2
      await invoke('send_test_three_channels', {
        startChannel: monitor2Start,
        clipValue: m2Video,
        dimmerValue: m2Dimmer,
        playtypeValue: m2Mode
      })
      // Update the preview values
      onValuesChange(m1Video, m1Dimmer, m1Mode, m2Video, m2Dimmer, m2Mode)
      setSuccess(`Sent all channels`)
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontWeight: 500, color: '#e0e0e0' }}>
            {isCollapsed ? '▶' : '▼'} 🧪 sACN Loopback Test
          </span>
          <span style={{ fontSize: '11px', color: '#888' }}>
            Send test DMX data for both monitors
          </span>
        </div>
        <span style={{ fontSize: '12px', color: '#888', whiteSpace: 'nowrap', marginLeft: '12px' }}>
          {testSenderActive ? '🟢 Active' : '⚫ Inactive'}
        </span>
      </div>
      
      {!isCollapsed && (
        <>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Monitor 1 Controls */}
            <div>
              <h4 style={{ marginBottom: '12px', color: '#4a9eff' }}>{monitor1Name} (Ch {monitor1Start}-{monitor1Start + 2})</h4>
              <div className="test-channel-group">
                <label>
                  <strong>Clip</strong>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="number"
                      min="0"
                      max="255"
                      value={m1Video}
                      onChange={(e) => setM1Video(parseInt(e.target.value) || 0)}
                      style={{ width: '80px' }}
                    />
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={m1Video}
                      onChange={(e) => setM1Video(parseInt(e.target.value))}
                      style={{ flex: 1 }}
                    />
                  </div>
                </label>
              </div>

              <div className="test-channel-group">
                <label>
                  <strong>Dimmer</strong>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="number"
                      min="0"
                      max="255"
                      value={m1Dimmer}
                      onChange={(e) => setM1Dimmer(parseInt(e.target.value) || 0)}
                      style={{ width: '80px' }}
                    />
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={m1Dimmer}
                      onChange={(e) => setM1Dimmer(parseInt(e.target.value))}
                      style={{ flex: 1 }}
                    />
                  </div>
                </label>
              </div>

              <div className="test-channel-group">
                <label>
                  <strong>Play Type</strong>
                  <select 
                    value={m1Mode} 
                    onChange={(e) => setM1Mode(parseInt(e.target.value))}
                    style={{ width: '100%', padding: '8px' }}
                  >
                    <option value="0">0 - Stop</option>
                    <option value="1">1 - Loop</option>
                    <option value="128">128 - Play Once</option>
                  </select>
                </label>
              </div>
            </div>

            {/* Monitor 2 Controls */}
            <div>
              <h4 style={{ marginBottom: '12px', color: '#4a9eff' }}>{monitor2Name} (Ch {monitor2Start}-{monitor2Start + 2})</h4>
              <div className="test-channel-group">
                <label>
                  <strong>Clip</strong>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="number"
                      min="0"
                      max="255"
                      value={m2Video}
                      onChange={(e) => setM2Video(parseInt(e.target.value) || 0)}
                      style={{ width: '80px' }}
                    />
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={m2Video}
                      onChange={(e) => setM2Video(parseInt(e.target.value))}
                      style={{ flex: 1 }}
                    />
                  </div>
                </label>
              </div>

              <div className="test-channel-group">
                <label>
                  <strong>Dimmer</strong>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="number"
                      min="0"
                      max="255"
                      value={m2Dimmer}
                      onChange={(e) => setM2Dimmer(parseInt(e.target.value) || 0)}
                      style={{ width: '80px' }}
                    />
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={m2Dimmer}
                      onChange={(e) => setM2Dimmer(parseInt(e.target.value))}
                      style={{ flex: 1 }}
                    />
                  </div>
                </label>
              </div>

              <div className="test-channel-group">
                <label>
                  <strong>Play Type</strong>
                  <select 
                    value={m2Mode} 
                    onChange={(e) => setM2Mode(parseInt(e.target.value))}
                    style={{ width: '100%', padding: '8px' }}
                  >
                    <option value="0">0 - Stop</option>
                    <option value="1">1 - Loop</option>
                    <option value="128">128 - Play Once</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <button 
            onClick={sendTestData} 
            className="btn-primary"
            style={{ 
              marginTop: '16px', 
              width: '100%',
              opacity: testSenderActive ? 1 : 0.6,
              cursor: testSenderActive ? 'pointer' : 'not-allowed'
            }}
          >
            Send Test Data {!testSenderActive && '(Create sender first)'}
          </button>
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
  const [showAbout, setShowAbout] = useState(false)

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
        
        <div style={{ marginTop: '20px', marginBottom: '16px' }}>
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

      <div className="card" style={{ marginTop: '8px' }}>
        <button
          onClick={() => setShowAbout(true)}
          style={{ width: '100%', padding: '8px 16px', background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: '6px', color: '#666', cursor: 'pointer', fontSize: '12px' }}
        >
          About StagePlayer DMX
        </button>
      </div>

      {showAbout && (
        <div
          onClick={() => setShowAbout(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px',
              padding: '32px 40px', maxWidth: '380px', width: '90%', textAlign: 'center'
            }}
          >
            <img src="/logo.png" alt="StagePlayer DMX" style={{ width: '80%', maxWidth: '280px', marginBottom: '16px' }} />
            <p style={{ color: '#ccc', fontSize: '14px', lineHeight: '1.7', margin: 0 }}>
              © 2026 Brad Boyink. All rights reserved.<br />
              Free for use in schools and community theaters.
            </p>
            <button
              onClick={() => setShowAbout(false)}
              className="btn-secondary"
              style={{ marginTop: '24px', padding: '8px 32px' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
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

  const browseFolderPresentation = async () => {
    try {
      const selected = await invoke<string | null>('select_folder')
      if (selected) {
        saveConfig({ ...config, presentation_folder: selected })
      }
    } catch (error) {
      console.error('Error opening folder dialog:', error)
    }
  }

  const browseFolderConvert = async () => {
    try {
      const selected = await invoke<string | null>('select_folder')
      if (selected) {
        saveConfig({ ...config, convert_folder: selected })
      }
    } catch (error) {
      console.error('Error opening folder dialog:', error)
    }
  }

  return (
    <div className="section">
      <h2>Monitor Configuration</h2>
      
      <div className="card">
        <h3>
          <EditableName 
            name={config.monitor1.name}
            onSave={(newName) => saveConfig({
              ...config,
              monitor1: { ...config.monitor1, name: newName }
            })}
          />
        </h3>
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
        <h3>
          <EditableName 
            name={config.monitor2.name}
            onSave={(newName) => saveConfig({
              ...config,
              monitor2: { ...config.monitor2, name: newName }
            })}
          />
        </h3>
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

      <div className="card">
        <h3>Presentation Folder</h3>
        <label>
          Media Folder:
          <div className="folder-input-group">
            <input
              type="text"
              value={config.presentation_folder}
              onChange={(e) => saveConfig({ ...config, presentation_folder: e.target.value })}
              placeholder="Select a folder for presentation files..."
            />
            <button type="button" className="browse-button" onClick={browseFolderPresentation}>
              Browse
            </button>
          </div>
        </label>
        <p className="info">Files in this folder will appear in the Presentation panel for drag-and-drop playback.</p>
      </div>

      <div className="card">
        <h3>Convert Folder</h3>
        <label>
          Folder:
          <div className="folder-input-group">
            <input
              type="text"
              value={config.convert_folder}
              onChange={(e) => saveConfig({ ...config, convert_folder: e.target.value })}
              placeholder="Select a folder for converted output files..."
            />
            <button type="button" className="browse-button" onClick={browseFolderConvert}>
              Browse
            </button>
          </div>
        </label>
        <p className="info">Converted video clips will be saved to this folder.</p>
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
                  <span>{config.monitor1.name}</span>
                  <span className="orientation">{config.monitor1.orientation}</span>
                </div>
              )}
              {config.monitor2.enabled && (
                <div className={`monitor-box ${config.monitor2.orientation}`}>
                  <span>{config.monitor2.name}</span>
                  <span className="orientation">{config.monitor2.orientation}</span>
                </div>
              )}
            </div>
          )}
          {config.layout === 'HorizontalStacked' && (
            <div className="layout-horizontal-stacked">
              {config.monitor1.enabled && (
                <div className={`monitor-box ${config.monitor1.orientation}`}>
                  <span>{config.monitor1.name}</span>
                  <span className="orientation">{config.monitor1.orientation}</span>
                </div>
              )}
              {config.monitor2.enabled && (
                <div className={`monitor-box ${config.monitor2.orientation}`}>
                  <span>{config.monitor2.name}</span>
                  <span className="orientation">{config.monitor2.orientation}</span>
                </div>
              )}
            </div>
          )}
          {config.layout === 'VerticalSideBySide' && (
            <div className="layout-vertical-side">
              {config.monitor1.enabled && (
                <div className={`monitor-box ${config.monitor1.orientation}`}>
                  <span>{config.monitor1.name}</span>
                  <span className="orientation">{config.monitor1.orientation}</span>
                </div>
              )}
              {config.monitor2.enabled && (
                <div className={`monitor-box ${config.monitor2.orientation}`}>
                  <span>{config.monitor2.name}</span>
                  <span className="orientation">{config.monitor2.orientation}</span>
                </div>
              )}
            </div>
          )}
          {config.layout === 'VerticalStacked' && (
            <div className="layout-vertical-stacked">
              {config.monitor1.enabled && (
                <div className={`monitor-box ${config.monitor1.orientation}`}>
                  <span>{config.monitor1.name}</span>
                  <span className="orientation">{config.monitor1.orientation}</span>
                </div>
              )}
              {config.monitor2.enabled && (
                <div className={`monitor-box ${config.monitor2.orientation}`}>
                  <span>{config.monitor2.name}</span>
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

  // Link video channels together
  const [linkedChannels, setLinkedChannels] = useState(false)
  const setM1Video = (v: number) => { setMonitor1Video(v); if (linkedChannels) setMonitor2Video(v) }
  const setM2Video = (v: number) => { setMonitor2Video(v); if (linkedChannels) setMonitor1Video(v) }
  
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
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px', fontSize: '13px', color: '#ccc', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={linkedChannels} onChange={e => setLinkedChannels(e.target.checked)} />
            Link
          </label>
        </div>

        {config.preview === 'Test' && (
          <div className="test-controls">
            {config.monitor1.enabled && (
              <div className="monitor-controls">
                <h4>{config.monitor1.name} (Ch {config.monitor1.start_channel})</h4>
                <div className="sliders-group">
                <div className="vertical-slider-control">
                  <label>Video</label>
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={monitor1Video}
                    onChange={(e) => handleValueChange(setM1Video, e.target.value)}
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
                      onChange={(value) => setM1Video(value as number)}
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
                <h4>{config.monitor2.name} (Ch {config.monitor2.start_channel})</h4>
                <div className="sliders-group">
                <div className="vertical-slider-control">
                  <label>Video</label>
                  <input
                    type="number"
                    min="0"
                    max="255"
                    value={monitor2Video}
                    onChange={(e) => handleValueChange(setM2Video, e.target.value)}
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
                      onChange={(value) => setM2Video(value as number)}
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
                <strong>{config.monitor1.name}</strong>
                <span className="preview-filename">
                  {monitor1Video > 0 && monitor1File ? monitor1File : 'No media'}
                </span>
                {config.preview === 'Listen' && (
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
                <strong>{config.monitor2.name}</strong>
                <span className="preview-filename">
                  {monitor2Video > 0 && monitor2File ? monitor2File : 'No media'}
                </span>
                {config.preview === 'Listen' && (
                  <label className="output-checkbox">
                    <input
                      type="checkbox"
                      checked={monitor2OutputEnabled}
                      onChange={(e) => setMonitor2OutputEnabled(e.target.checked)}
                    />
                    Output to Display
                  </label>
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
        
        {/* DMX Channel Display */}
        <div className="dmx-channel-display">
          <DmxChannelIndicator 
            channel={config.monitor1.start_channel} 
            value={monitor1Video}
          />
          <DmxChannelIndicator 
            channel={config.monitor1.start_channel + 1} 
            value={monitor1Dimmer}
          />
          <DmxChannelIndicator 
            channel={config.monitor1.start_channel + 2} 
            value={monitor1Mode}
          />
          <DmxChannelIndicator 
            channel={config.monitor2.start_channel} 
            value={monitor2Video}
          />
          <DmxChannelIndicator 
            channel={config.monitor2.start_channel + 1} 
            value={monitor2Dimmer}
          />
          <DmxChannelIndicator 
            channel={config.monitor2.start_channel + 2} 
            value={monitor2Mode}
          />
        </div>
      </div>

      {/* sACN Test Sender Panel for Preview/Listen Mode */}
      {config.preview === 'Listen' && (
        <div className="card">
          <PreviewTestPanel 
            universe={config.sacn.universe} 
            monitor1Start={config.monitor1.start_channel}
            monitor1Name={config.monitor1.name}
            monitor2Start={config.monitor2.start_channel}
            monitor2Name={config.monitor2.name}
            onValuesChange={(m1Video, m1Dimmer, m1Mode, m2Video, m2Dimmer, m2Mode) => {
              setMonitor1Video(m1Video)
              setMonitor1Dimmer(m1Dimmer)
              setMonitor1Mode(m1Mode)
              setMonitor2Video(m2Video)
              setMonitor2Dimmer(m2Dimmer)
              setMonitor2Mode(m2Mode)
            }}
          />
        </div>
      )}
    </div>
  )
}

// Presentation Section Component
function PresentationSection({ config }: { config: AppConfig }) {
  const [mediaFiles, setMediaFiles] = useState<string[]>([])
  const [monitor1Media, setMonitor1Media] = useState<string | null>(null)
  const [monitor2Media, setMonitor2Media] = useState<string | null>(null)
  const [monitor1OutputEnabled, setMonitor1OutputEnabled] = useState(false)
  const [monitor2OutputEnabled, setMonitor2OutputEnabled] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [monitor1MediaReady, setMonitor1MediaReady] = useState<string | null>(null)
  const [monitor2MediaReady, setMonitor2MediaReady] = useState<string | null>(null)

  // Delay preview video 500ms to stay in sync with output window init
  useEffect(() => {
    if (!monitor1Media) { setMonitor1MediaReady(null); return }
    const t = setTimeout(() => setMonitor1MediaReady(monitor1Media), 500)
    return () => clearTimeout(t)
  }, [monitor1Media])

  useEffect(() => {
    if (!monitor2Media) { setMonitor2MediaReady(null); return }
    const t = setTimeout(() => setMonitor2MediaReady(monitor2Media), 500)
    return () => clearTimeout(t)
  }, [monitor2Media])

  // Load media files when folder changes
  useEffect(() => {
    if (config.presentation_folder) {
      invoke<string[]>('get_media_files', { folder: config.presentation_folder })
        .then(files => setMediaFiles(files))
        .catch(() => setMediaFiles([]))
    } else {
      setMediaFiles([])
    }
  }, [config.presentation_folder])

  // Handle Monitor 1 output window
  useEffect(() => {
    const run = async () => {
      if (monitor1OutputEnabled && monitor1Media && config.monitor1.enabled) {
        await invoke('close_output_window', { monitorId: 'monitor1' }).catch(() => {})
        await invoke('open_output_window', {
          monitorId: 'monitor1',
          displayIndex: config.monitor1.display_index,
          width: config.monitor1.resolution.width,
          height: config.monitor1.resolution.height,
          windowX: config.monitor1.window_x,
          windowY: config.monitor1.window_y
        }).catch(err => console.error('Failed to open Monitor 1:', err))
        // Give the window a moment to initialize before sending media
        await new Promise(r => setTimeout(r, 500))
        const mediaUrl = convertFileSrc(`${config.presentation_folder}/${monitor1Media}`)
        await invoke('update_output_window', {
          monitorId: 'monitor1',
          mediaUrl,
          dimmer: 255,
          playtype: 1,
          orientation: config.monitor1.orientation
        }).catch(err => console.error('Failed to update Monitor 1:', err))
      } else {
        await invoke('close_output_window', { monitorId: 'monitor1' }).catch(() => {})
      }
    }
    run()
  }, [monitor1OutputEnabled, monitor1Media, config.monitor1.enabled, config.monitor1.display_index])

  // Handle Monitor 2 output window
  useEffect(() => {
    const run = async () => {
      if (monitor2OutputEnabled && monitor2Media && config.monitor2.enabled) {
        await invoke('close_output_window', { monitorId: 'monitor2' }).catch(() => {})
        await invoke('open_output_window', {
          monitorId: 'monitor2',
          displayIndex: config.monitor2.display_index,
          width: config.monitor2.resolution.width,
          height: config.monitor2.resolution.height,
          windowX: config.monitor2.window_x,
          windowY: config.monitor2.window_y
        }).catch(err => console.error('Failed to open Monitor 2:', err))
        // Give the window a moment to initialize before sending media
        await new Promise(r => setTimeout(r, 500))
        const mediaUrl = convertFileSrc(`${config.presentation_folder}/${monitor2Media}`)
        await invoke('update_output_window', {
          monitorId: 'monitor2',
          mediaUrl,
          dimmer: 255,
          playtype: 1,
          orientation: config.monitor2.orientation
        }).catch(err => console.error('Failed to update Monitor 2:', err))
      } else {
        await invoke('close_output_window', { monitorId: 'monitor2' }).catch(() => {})
      }
    }
    run()
  }, [monitor2OutputEnabled, monitor2Media, config.monitor2.enabled, config.monitor2.display_index])

  // Clean up output windows on unmount
  useEffect(() => {
    return () => {
      invoke('close_output_window', { monitorId: 'monitor1' }).catch(() => {})
      invoke('close_output_window', { monitorId: 'monitor2' }).catch(() => {})
    }
  }, [])

  const handleMonitor1Click = () => {
    if (selectedFile) {
      setMonitor1Media(selectedFile)
      setMonitor1OutputEnabled(true)
      setSelectedFile(null)
    }
  }

  const handleMonitor2Click = () => {
    if (selectedFile) {
      setMonitor2Media(selectedFile)
      setMonitor2OutputEnabled(true)
      setSelectedFile(null)
    }
  }

  const isVideo = (filename: string) => /\.(mp4|mov|avi|mkv|webm)$/i.test(filename)

  const getMediaUrl = (filename: string) =>
    convertFileSrc(`${config.presentation_folder}/${filename}`)

  return (
    <div className="section">
      <h2>Presentation</h2>

      {!config.presentation_folder ? (
        <div className="card">
          <p className="info" style={{ fontSize: '14px', color: '#888' }}>
            No presentation folder configured. Go to <strong>Configuration</strong> and set a Presentation Folder.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

          {/* File List */}
          <div className="card" style={{ minWidth: '240px', maxWidth: '280px', flex: '0 0 auto' }}>
            <h3>Media Files</h3>
            <p className="info">{config.presentation_folder.split(/[\\/]/).pop()}</p>
            {mediaFiles.length === 0 ? (
              <p style={{ color: '#666', fontSize: '13px', marginTop: '12px' }}>No media files found</p>
            ) : (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '480px', overflowY: 'auto' }}>
                {mediaFiles.map(file => (
                  <div
                    key={file}
                    onClick={() => setSelectedFile(selectedFile === file ? null : file)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: selectedFile === file ? '#fff' : '#ccc',
                      background: selectedFile === file
                        ? 'rgba(0, 102, 255, 0.3)'
                        : 'rgba(255,255,255,0.04)',
                      border: selectedFile === file
                        ? '1px solid #0066ff'
                        : '1px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      userSelect: 'none',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      if (selectedFile !== file)
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'
                    }}
                    onMouseLeave={e => {
                      if (selectedFile !== file) 
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'
                    }}
                  >
                    <span>{isVideo(file) ? '🎬' : '🖼️'}</span>
                    <span style={{ wordBreak: 'break-all', lineHeight: '1.3' }}>{file}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Monitor Preview Boxes */}
          <div style={{ flex: 1 }}>
            {selectedFile && (
              <p className="info" style={{ marginBottom: '16px' }}>
                File selected: <strong style={{ color: '#fff' }}>{selectedFile}</strong> — click a monitor box below to assign it.
              </p>
            )}
            <div className="card">
              <h3>Presentation Output</h3>
            <div className={`preview-monitors ${config.layout.toLowerCase()}`}>

              {/* Monitor 1 */}
              {config.monitor1.enabled && (
                <div className="preview-monitor">
                  <div
                    className={`preview-screen ${config.monitor1.orientation.toLowerCase()}`}
                    onClick={handleMonitor1Click}
                    style={{
                      border: selectedFile
                        ? '2px solid #00cc44'
                        : monitor1Media ? '2px solid #0066ff' : '2px dashed #555',
                      background: selectedFile ? 'rgba(0, 200, 68, 0.07)' : '#000',
                      transition: 'all 0.15s ease',
                      cursor: selectedFile ? 'pointer' : 'default'
                    }}
                  >
                    {monitor1Media ? (
                      <div className="preview-content">
                        {isVideo(monitor1Media) ? (
                          monitor1MediaReady === monitor1Media ? (
                            <video
                              key={monitor1Media}
                              src={getMediaUrl(monitor1Media)}
                              autoPlay
                              loop
                              style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', top: 0, left: 0 }}
                            />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555', fontSize: '13px' }}>Loading...</div>
                          )
                        ) : (
                          <img
                            src={getMediaUrl(monitor1Media)}
                            alt="Preview"
                            style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', top: 0, left: 0 }}
                          />
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: selectedFile ? '#00cc44' : '#555', fontSize: '13px', gap: '8px' }}>
                        <span style={{ fontSize: '28px' }}>{selectedFile ? '✓' : '🎬'}</span>
                        <span>{selectedFile ? 'Click to assign' : 'No file assigned'}</span>
                      </div>
                    )}
                  </div>
                  <div className="preview-label">
                    <strong>{config.monitor1.name}</strong>
                    <span className="preview-filename" style={{ minHeight: '18px' }}>
                      {monitor1Media ?? 'No file'}
                    </span>
                    <button
                      onClick={() => setMonitor1OutputEnabled(v => !v)}
                      disabled={!monitor1Media}
                      style={{
                        marginTop: '10px',
                        padding: '6px 14px',
                        background: monitor1OutputEnabled ? '#00aa44' : '#333',
                        border: monitor1OutputEnabled ? '1px solid #00cc55' : '1px solid #555',
                        borderRadius: '5px',
                        color: monitor1OutputEnabled ? '#fff' : '#aaa',
                        cursor: monitor1Media ? 'pointer' : 'not-allowed',
                        fontSize: '12px',
                        fontWeight: 600,
                        width: '100%',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {monitor1OutputEnabled ? '● Output Active' : 'Output to Display'}
                    </button>
                    {monitor1Media && (
                      <button onClick={() => { setMonitor1Media(null); setMonitor1OutputEnabled(false) }}
                        style={{ marginTop: '6px', padding: '4px 12px', background: '#cc2222', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '12px', width: '100%' }}>
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Monitor 2 */}
              {config.monitor2.enabled && (
                <div className="preview-monitor">
                  <div
                    className={`preview-screen ${config.monitor2.orientation.toLowerCase()}`}
                    onClick={handleMonitor2Click}
                    style={{
                      border: selectedFile
                        ? '2px solid #00cc44'
                        : monitor2Media ? '2px solid #0066ff' : '2px dashed #555',
                      background: selectedFile ? 'rgba(0, 200, 68, 0.07)' : '#000',
                      transition: 'all 0.15s ease',
                      cursor: selectedFile ? 'pointer' : 'default'
                    }}
                  >
                    {monitor2Media ? (
                      <div className="preview-content">
                        {isVideo(monitor2Media) ? (
                          monitor2MediaReady === monitor2Media ? (
                            <video
                              key={monitor2Media}
                              src={getMediaUrl(monitor2Media)}
                              autoPlay
                              loop
                              style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', top: 0, left: 0 }}
                            />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555', fontSize: '13px' }}>Loading...</div>
                          )
                        ) : (
                          <img
                            src={getMediaUrl(monitor2Media)}
                            alt="Preview"
                            style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', top: 0, left: 0 }}
                          />
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: selectedFile ? '#00cc44' : '#555', fontSize: '13px', gap: '8px' }}>
                        <span style={{ fontSize: '28px' }}>{selectedFile ? '✓' : '🎬'}</span>
                        <span>{selectedFile ? 'Click to assign' : 'No file assigned'}</span>
                      </div>
                    )}
                  </div>
                  <div className="preview-label">
                    <strong>{config.monitor2.name}</strong>
                    <span className="preview-filename" style={{ minHeight: '18px' }}>
                      {monitor2Media ?? 'No file'}
                    </span>
                    <button
                      onClick={() => setMonitor2OutputEnabled(v => !v)}
                      disabled={!monitor2Media}
                      style={{
                        marginTop: '10px',
                        padding: '6px 14px',
                        background: monitor2OutputEnabled ? '#00aa44' : '#333',
                        border: monitor2OutputEnabled ? '1px solid #00cc55' : '1px solid #555',
                        borderRadius: '5px',
                        color: monitor2OutputEnabled ? '#fff' : '#aaa',
                        cursor: monitor2Media ? 'pointer' : 'not-allowed',
                        fontSize: '12px',
                        fontWeight: 600,
                        width: '100%',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {monitor2OutputEnabled ? '● Output Active' : 'Output to Display'}
                    </button>
                    {monitor2Media && (
                      <button onClick={() => { setMonitor2Media(null); setMonitor2OutputEnabled(false) }}
                        style={{ marginTop: '6px', padding: '4px 12px', background: '#cc2222', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '12px', width: '100%' }}>
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

// ── Tools Section ─────────────────────────────────────────────────────────────
function ToolsSection({ config }: { config: AppConfig }) {
  const [files, setFiles] = useState<string[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [probe, setProbe] = useState<{ w: number; h: number } | null>(null)
  const [probeError, setProbeError] = useState('')
  const [ffmpegOk, setFfmpegOk] = useState<boolean | null>(null)
  const [ffmpegMsg, setFfmpegMsg] = useState('')
  const [converting, setConverting] = useState(false)
  const [convertResult, setConvertResult] = useState<{ top: string; bottom: string } | null>(null)
  const [convertError, setConvertError] = useState('')

  // Check FFmpeg on mount
  useEffect(() => {
    invoke<string>('check_ffmpeg')
      .then(msg => { setFfmpegOk(true); setFfmpegMsg(msg) })
      .catch(err => { setFfmpegOk(false); setFfmpegMsg(String(err)) })
  }, [])

  // Load file list whenever convert_folder changes
  useEffect(() => {
    if (!config.convert_folder) { setFiles([]); return }
    invoke<string[]>('list_convert_files', { folder: config.convert_folder })
      .then(setFiles)
      .catch(() => setFiles([]))
  }, [config.convert_folder])

  async function selectFile(name: string) {
    setSelectedFile(name)
    setProbe(null)
    setProbeError('')
    setConvertResult(null)
    setConvertError('')
    const fullPath = `${config.convert_folder}\\${name}`
    try {
      const [w, h] = await invoke<[number, number]>('probe_media', { sourcePath: fullPath })
      setProbe({ w, h })
    } catch (err: any) {
      setProbeError(String(err))
    }
  }

  async function doConvert() {
    if (!selectedFile || !config.convert_folder) return
    const fullPath = `${config.convert_folder}\\${selectedFile}`
    setConverting(true)
    setConvertResult(null)
    setConvertError('')
    try {
      const [top, bottom] = await invoke<[string, string]>('split_media', {
        sourcePath: fullPath,
        topFolder: config.monitor1.media_folder,
        bottomFolder: config.monitor2.media_folder
      })
      setConvertResult({ top, bottom })
      // Refresh file list
      const updated = await invoke<string[]>('list_convert_files', { folder: config.convert_folder })
      setFiles(updated)
    } catch (err: any) {
      setConvertError(String(err))
    } finally {
      setConverting(false)
    }
  }

  const isSupported = probe?.w === 1080 && probe?.h === 3840
  const ext = selectedFile?.match(/\.([^.]+)$/)?.[1]?.toUpperCase() ?? ''

  function fileIcon(name: string) {
    const e = name.match(/\.([^.]+)$/)?.[1]?.toLowerCase()
    if (e === 'mp4' || e === 'mov' || e === 'avi' || e === 'mkv') return '🎬'
    if (e === 'jpg' || e === 'jpeg') return '🖼️'
    if (e === 'png') return '🖼️'
    return '📄'
  }

  return (
    <div className="section">
      <h2>Tools</h2>

      {/* FFmpeg status banner */}
      {ffmpegOk === false && (
        <div className="card" style={{ background: '#2a1111', border: '1px solid #552222', marginBottom: '16px' }}>
          <strong style={{ color: '#f88' }}>⚠ FFmpeg not found</strong>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#ccc' }}>{ffmpegMsg}</p>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#ccc' }}>
            Install via: <code style={{ color: '#7cf' }}>winget install ffmpeg</code>
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* ── File list ── */}
        <div className="card" style={{ minWidth: '260px', flex: '0 0 260px' }}>
          <h3>Convert Folder</h3>
          {!config.convert_folder ? (
            <p className="info">Set a Convert Folder in Configuration first.</p>
          ) : files.length === 0 ? (
            <p className="info">No MP4 / JPG / PNG files found in:<br /><code style={{ fontSize: '11px', wordBreak: 'break-all' }}>{config.convert_folder}</code></p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '480px', overflowY: 'auto' }}>
              {files.map(f => {
                const isSelected = f === selectedFile
                return (
                  <button
                    key={f}
                    onClick={() => selectFile(f)}
                    style={{
                      textAlign: 'left',
                      padding: '7px 10px',
                      borderRadius: '5px',
                      border: isSelected ? '1px solid #3a6abf' : '1px solid transparent',
                      background: isSelected ? '#1a2a4a' : 'transparent',
                      color: isSelected ? '#fff' : '#ccc',
                      cursor: 'pointer',
                      fontSize: '13px',
                      wordBreak: 'break-all',
                    }}
                  >
                    <span style={{ marginRight: '6px' }}>{fileIcon(f)}</span>{f}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Detail / convert panel ── */}
        <div style={{ flex: 1 }}>
          {!selectedFile ? (
            <div className="card">
              <p className="info">Select a file from the list to inspect and convert.</p>
            </div>
          ) : (
            <div className="card">
              <h3 style={{ wordBreak: 'break-all', marginBottom: '12px' }}>{selectedFile}</h3>

              {/* Dimensions */}
              {probe ? (
                <div style={{ marginBottom: '14px' }}>
                  <span style={{ fontSize: '14px' }}>Dimensions: <strong>{probe.w} × {probe.h}</strong></span>
                  {isSupported
                    ? <span style={{ marginLeft: '10px', color: '#5f5', fontSize: '13px' }}>✓ 1080×3840 — ready to split</span>
                    : <span style={{ marginLeft: '10px', color: '#f88', fontSize: '13px' }}>✗ Must be 1080×3840 to split</span>}
                </div>
              ) : probeError ? (
                <p style={{ color: '#f88', fontSize: '13px', marginBottom: '14px' }}>{probeError}</p>
              ) : (
                <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '14px' }}>Reading dimensions…</p>
              )}

              {/* What will be created */}
              {isSupported && (
                <div style={{ marginBottom: '16px', fontSize: '13px', color: '#aaa', lineHeight: '1.8' }}>
                  <div style={{ marginBottom: '4px' }}>Will create two 1080×1920 {ext} files:</div>
                  <div>
                    <span style={{ color: '#888' }}>→ {config.monitor1.name} folder: </span>
                    <code style={{ color: '#7cf' }}>{selectedFile.replace(/\.[^.]+$/, '')}_top.{selectedFile.match(/\.([^.]+)$/)?.[1]}</code>
                  </div>
                  <div>
                    <span style={{ color: '#888' }}>→ {config.monitor2.name} folder: </span>
                    <code style={{ color: '#7cf' }}>{selectedFile.replace(/\.[^.]+$/, '')}_bottom.{selectedFile.match(/\.([^.]+)$/)?.[1]}</code>
                  </div>
                  {(!config.monitor1.media_folder || !config.monitor2.media_folder) && (
                    <div style={{ color: '#f88', marginTop: '6px' }}>
                      ⚠ Set media folders for both monitors in Configuration first.
                    </div>
                  )}
                </div>
              )}

              {/* Convert button */}
              <button
                onClick={doConvert}
                disabled={!isSupported || converting || !ffmpegOk || !config.monitor1.media_folder || !config.monitor2.media_folder}
                style={{
                  padding: '9px 24px',
                  background: (!isSupported || converting || !ffmpegOk || !config.monitor1.media_folder || !config.monitor2.media_folder) ? '#333' : '#2a7a2a',
                  border: 'none',
                  borderRadius: '5px',
                  color: (!isSupported || converting || !ffmpegOk || !config.monitor1.media_folder || !config.monitor2.media_folder) ? '#666' : '#fff',
                  cursor: (!isSupported || converting || !ffmpegOk || !config.monitor1.media_folder || !config.monitor2.media_folder) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '14px',
                }}
              >
                {converting ? 'Converting…' : 'Convert'}
              </button>

              {/* Result */}
              {convertResult && (
                <div style={{ color: '#5f5', fontSize: '13px', lineHeight: '1.7' }}>
                  ✓ Done!<br />
                  <code style={{ color: '#7cf' }}>{convertResult.top.split(/[\\/]/).pop()}</code><br />
                  <code style={{ color: '#7cf' }}>{convertResult.bottom.split(/[\\/]/).pop()}</code>
                </div>
              )}
              {convertError && (
                <div style={{ color: '#f88', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {convertError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
