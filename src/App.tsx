import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { convertFileSrc } from '@tauri-apps/api/core'
import { AppConfig, NetworkInterface } from './types'
import Slider from 'rc-slider'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import 'rc-slider/assets/index.css'
import './App.css'

function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [networkInterfaces, setNetworkInterfaces] = useState<NetworkInterface[]>([])
  const [activeSection, setActiveSection] = useState<'dmx' | 'config' | 'layout' | 'preview'>('dmx')

  useEffect(() => {
    loadConfig()
    loadNetworkInterfaces()
  }, [])

  const loadConfig = async () => {
    const cfg = await invoke<AppConfig>('get_config')
    setConfig(cfg)
  }

  const loadNetworkInterfaces = async () => {
    const interfaces = await invoke<NetworkInterface[]>('get_network_interfaces')
    setNetworkInterfaces(interfaces)
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
        <h1>MediaPlayer</h1>
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
          <ConfigSection config={config} saveConfig={saveConfig} />
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
          <option value="">Select network interface</option>
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
    </div>
  )
}

// Configuration Section Component
function ConfigSection({ config, saveConfig }: { config: AppConfig, saveConfig: (cfg: AppConfig) => void }) {
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
        <p className="info">
          Clip: {config.monitor1.start_channel}, Dimmer: {config.monitor1.start_channel + 1}, Playtype: {config.monitor1.start_channel + 2}
        </p>
        
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
        <p className="info">
          Clip: {config.monitor2.start_channel}, Dimmer: {config.monitor2.start_channel + 1}, Playtype: {config.monitor2.start_channel + 2}
        </p>
        
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
              <div className={`monitor-box ${config.monitor1.orientation}`}>
                <span>Monitor 1</span>
                <span className="orientation">{config.monitor1.orientation}</span>
              </div>
              <div className={`monitor-box ${config.monitor2.orientation}`}>
                <span>Monitor 2</span>
                <span className="orientation">{config.monitor2.orientation}</span>
              </div>
            </div>
          )}
          {config.layout === 'HorizontalStacked' && (
            <div className="layout-horizontal-stacked">
              <div className={`monitor-box ${config.monitor1.orientation}`}>
                <span>Monitor 1</span>
                <span className="orientation">{config.monitor1.orientation}</span>
              </div>
              <div className={`monitor-box ${config.monitor2.orientation}`}>
                <span>Monitor 2</span>
                <span className="orientation">{config.monitor2.orientation}</span>
              </div>
            </div>
          )}
          {config.layout === 'VerticalSideBySide' && (
            <div className="layout-vertical-side">
              <div className={`monitor-box ${config.monitor1.orientation}`}>
                <span>Monitor 1</span>
                <span className="orientation">{config.monitor1.orientation}</span>
              </div>
              <div className={`monitor-box ${config.monitor2.orientation}`}>
                <span>Monitor 2</span>
                <span className="orientation">{config.monitor2.orientation}</span>
              </div>
            </div>
          )}
          {config.layout === 'VerticalStacked' && (
            <div className="layout-vertical-stacked">
              <div className={`monitor-box ${config.monitor1.orientation}`}>
                <span>Monitor 1</span>
                <span className="orientation">{config.monitor1.orientation}</span>
              </div>
              <div className={`monitor-box ${config.monitor2.orientation}`}>
                <span>Monitor 2</span>
                <span className="orientation">{config.monitor2.orientation}</span>
              </div>
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

  useEffect(() => {
    if (config.monitor1.media_folder) {
      loadMediaFiles(config.monitor1.media_folder, setMonitor1Files)
    }
    if (config.monitor2.media_folder) {
      loadMediaFiles(config.monitor2.media_folder, setMonitor2Files)
    }
  }, [config.monitor1.media_folder, config.monitor2.media_folder])

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
            console.log('Monitor 1 video ended - restarting')
            if (monitor1PlayerRef.current) {
              monitor1PlayerRef.current.currentTime(0)
              monitor1PlayerRef.current.play()
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
      if (isVideo === false) {
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
            console.log('Monitor 2 video ended - restarting')
            if (monitor2PlayerRef.current) {
              monitor2PlayerRef.current.currentTime(0)
              monitor2PlayerRef.current.play()
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
      if (isVideo === false) {
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
          </div>
        )}
      </div>

      <div className="card">
        <h3>Preview Output</h3>
        <div className={`preview-monitors ${config.layout.toLowerCase()}`}>
          <div className="preview-monitor">
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
            </div>
          </div>

          <div className="preview-monitor">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
