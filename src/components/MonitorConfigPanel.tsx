import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { MonitorConfig, ResolutionType, Orientation } from "../types";

interface MonitorConfigPanelProps {
  title: string;
  config: MonitorConfig;
  onChange: (config: MonitorConfig) => void;
  currentClip: string;
  dimmerLevel: number;
}

export default function MonitorConfigPanel({ 
  title, 
  config, 
  onChange,
  currentClip,
  dimmerLevel 
}: MonitorConfigPanelProps) {
  const [localConfig, setLocalConfig] = useState(config);

  const handleChange = (updates: Partial<MonitorConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    onChange(newConfig);
  };

  const selectMediaFolder = async () => {
    const result = await open({
      directory: true,
      multiple: false,
      title: `Select Media Folder for ${title}`,
    });
    
    if (result) {
      handleChange({ media_folder: result });
    }
  };

  const setResolution = (type: "HD" | "FourK" | "Custom", width?: number, height?: number) => {
    let resolution: ResolutionType;
    if (type === "HD") {
      resolution = { type: "HD", width: 1920, height: 1080 };
    } else if (type === "FourK") {
      resolution = { type: "FourK", width: 3840, height: 2160 };
    } else {
      resolution = { 
        type: "Custom", 
        width: width || 1920, 
        height: height || 1080 
      };
    }
    handleChange({ resolution });
  };

  const getResolutionDisplay = () => {
    const res = localConfig.resolution;
    return `${res.width} × ${res.height}`;
  };

  return (
    <div className="monitor-config">
      <h3>{title}</h3>
      
      <div className="config-row">
        <label>
          <input
            type="checkbox"
            checked={localConfig.enabled}
            onChange={(e) => handleChange({ enabled: e.target.checked })}
          />
          <span>Enabled</span>
        </label>
      </div>

      <div className="config-row">
        <label>Name:</label>
        <input
          type="text"
          value={localConfig.name}
          onChange={(e) => handleChange({ name: e.target.value })}
        />
      </div>

      <div className="config-row">
        <label>Start Channel:</label>
        <input
          type="number"
          value={localConfig.start_channel}
          onChange={(e) => handleChange({ start_channel: parseInt(e.target.value) || 1 })}
          min="1"
          max="512"
        />
      </div>

      <div className="config-row">
        <label>Clip Channel Offset:</label>
        <input
          type="number"
          value={localConfig.clip_channel_offset}
          onChange={(e) => handleChange({ clip_channel_offset: parseInt(e.target.value) || 0 })}
          min="0"
          max="10"
        />
      </div>

      <div className="config-row">
        <label>Dimmer Channel Offset:</label>
        <input
          type="number"
          value={localConfig.dimmer_channel_offset}
          onChange={(e) => handleChange({ dimmer_channel_offset: parseInt(e.target.value) || 1 })}
          min="0"
          max="10"
        />
      </div>

      <div className="config-row">
        <label>Media Folder:</label>
        <div className="folder-selector">
          <input
            type="text"
            value={localConfig.media_folder}
            readOnly
            placeholder="No folder selected"
          />
          <button onClick={selectMediaFolder} className="btn-secondary">
            Browse...
          </button>
        </div>
      </div>

      <div className="config-row">
        <label>Resolution:</label>
        <div className="resolution-selector">
          <select
            value={localConfig.resolution.type}
            onChange={(e) => {
              const type = e.target.value as "HD" | "FourK" | "Custom";
              setResolution(type);
            }}
          >
            <option value="HD">HD (1920×1080)</option>
            <option value="FourK">4K (3840×2160)</option>
            <option value="Custom">Custom</option>
          </select>
          {localConfig.resolution.type === "Custom" && (
            <div className="custom-resolution">
              <input
                type="number"
                value={localConfig.resolution.width}
                onChange={(e) => setResolution("Custom", parseInt(e.target.value), localConfig.resolution.height)}
                placeholder="Width"
              />
              <span>×</span>
              <input
                type="number"
                value={localConfig.resolution.height}
                onChange={(e) => setResolution("Custom", localConfig.resolution.width, parseInt(e.target.value))}
                placeholder="Height"
              />
            </div>
          )}
        </div>
      </div>

      <div className="config-row">
        <label>Orientation:</label>
        <select
          value={localConfig.orientation}
          onChange={(e) => handleChange({ orientation: e.target.value as Orientation })}
        >
          <option value="Horizontal">Horizontal</option>
          <option value="Vertical">Vertical</option>
        </select>
      </div>

      <div className="status-display">
        <div className="status-row">
          <span className="status-label">Current Clip:</span>
          <span className="status-value">{currentClip || "None"}</span>
        </div>
        <div className="status-row">
          <span className="status-label">Dimmer:</span>
          <span className="status-value">{Math.round(dimmerLevel * 100)}%</span>
        </div>
        <div className="status-row">
          <span className="status-label">Channels:</span>
          <span className="status-value">
            Clip: {localConfig.start_channel + localConfig.clip_channel_offset} | 
            Dimmer: {localConfig.start_channel + localConfig.dimmer_channel_offset}
          </span>
        </div>
      </div>
    </div>
  );
}
