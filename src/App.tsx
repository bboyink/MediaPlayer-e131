import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { 
  AppConfig, 
  MonitorConfig, 
  DmxUpdate, 
  ClipChange, 
  DimmerChange,
  PreviewLayout 
} from "./types";
import { createDefaultAppConfig } from "./types";
import MonitorConfigPanel from "./components/MonitorConfigPanel";
import DmxMonitor from "./components/DmxMonitor";
import PreviewPanel from "./components/PreviewPanel";
import "./App.css";

function App() {
  const [config, setConfig] = useState<AppConfig>(createDefaultAppConfig());
  const [dmxValues, setDmxValues] = useState<Map<number, number>>(new Map());
  const [currentClips, setCurrentClips] = useState<{ monitor1: string; monitor2: string }>({
    monitor1: "",
    monitor2: "",
  });
  const [dimmerLevels, setDimmerLevels] = useState<{ monitor1: number; monitor2: number }>({
    monitor1: 1.0,
    monitor2: 1.0,
  });

  // Load configuration on mount
  useEffect(() => {
    loadConfig();
  }, []);

  // Listen for DMX updates
  useEffect(() => {
    const unsubscribeDmx = listen<DmxUpdate>("dmx-update", (event) => {
      const update = event.payload;
      setDmxValues(prev => new Map(prev).set(update.channel, update.value));
    });

    const unsubscribeClip = listen<ClipChange>("clip-change", (event) => {
      const change = event.payload;
      if (change.monitor === 1) {
        setCurrentClips(prev => ({ ...prev, monitor1: change.filename }));
      } else {
        setCurrentClips(prev => ({ ...prev, monitor2: change.filename }));
      }
    });

    const unsubscribeDimmer = listen<DimmerChange>("dimmer-change", (event) => {
      const change = event.payload;
      if (change.monitor === 1) {
        setDimmerLevels(prev => ({ ...prev, monitor1: change.level }));
      } else {
        setDimmerLevels(prev => ({ ...prev, monitor2: change.level }));
      }
    });

    return () => {
      unsubscribeDmx.then(fn => fn());
      unsubscribeClip.then(fn => fn());
      unsubscribeDimmer.then(fn => fn());
    };
  }, []);

  const loadConfig = async () => {
    try {
      const cfg = await invoke<AppConfig>("get_config");
      setConfig(cfg);
    } catch (error) {
      console.error("Failed to load config:", error);
    }
  };

  const updateMonitor1 = async (monitor: MonitorConfig) => {
    try {
      await invoke("update_monitor1_config", { monitor });
      setConfig(prev => ({ ...prev, monitor1: monitor }));
    } catch (error) {
      console.error("Failed to update monitor 1:", error);
    }
  };

  const updateMonitor2 = async (monitor: MonitorConfig) => {
    try {
      await invoke("update_monitor2_config", { monitor });
      setConfig(prev => ({ ...prev, monitor2: monitor }));
    } catch (error) {
      console.error("Failed to update monitor 2:", error);
    }
  };

  const toggleProductionMode = async () => {
    const newMode = !config.production_mode;
    try {
      await invoke("set_production_mode", { enabled: newMode });
      setConfig(prev => ({ ...prev, production_mode: newMode }));
    } catch (error) {
      console.error("Failed to toggle production mode:", error);
    }
  };

  const setPreviewLayout = async (layout: PreviewLayout) => {
    try {
      await invoke("set_preview_layout", { layout });
      setConfig(prev => ({ ...prev, preview_layout: layout }));
    } catch (error) {
      console.error("Failed to set preview layout:", error);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>MediaPlayer E1.31 Control</h1>
        <div className="header-controls">
          <button 
            className={config.production_mode ? "btn-primary active" : "btn-primary"}
            onClick={toggleProductionMode}
          >
            {config.production_mode ? "Production Mode: ON" : "Production Mode: OFF"}
          </button>
        </div>
      </header>

      <div className="app-content">
        <div className="left-panel">
          <section className="section">
            <h2>sACN Configuration</h2>
            <div className="config-row">
              <label>Universe:</label>
              <input 
                type="number" 
                value={config.sacn.universe}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  sacn: { ...prev.sacn, universe: parseInt(e.target.value) || 1 }
                }))}
                min="1"
                max="63999"
              />
            </div>
          </section>

          <section className="section">
            <MonitorConfigPanel
              title="Monitor 1"
              config={config.monitor1}
              onChange={updateMonitor1}
              currentClip={currentClips.monitor1}
              dimmerLevel={dimmerLevels.monitor1}
            />
          </section>

          <section className="section">
            <MonitorConfigPanel
              title="Monitor 2"
              config={config.monitor2}
              onChange={updateMonitor2}
              currentClip={currentClips.monitor2}
              dimmerLevel={dimmerLevels.monitor2}
            />
          </section>

          <section className="section">
            <DmxMonitor 
              monitor1Config={config.monitor1}
              monitor2Config={config.monitor2}
              dmxValues={dmxValues}
            />
          </section>
        </div>

        <div className="right-panel">
          <PreviewPanel
            config={config}
            currentClips={currentClips}
            dimmerLevels={dimmerLevels}
            onLayoutChange={setPreviewLayout}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
