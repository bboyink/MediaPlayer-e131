// TypeScript types matching Rust configuration structures

export type ResolutionType = 
  | { type: "HD"; width: number; height: number }
  | { type: "FourK"; width: number; height: number }
  | { type: "Custom"; width: number; height: number };

export type Orientation = "Horizontal" | "Vertical";

export interface MonitorConfig {
  name: string;
  enabled: boolean;
  start_channel: number;
  clip_channel_offset: number;
  dimmer_channel_offset: number;
  media_folder: string;
  resolution: ResolutionType;
  orientation: Orientation;
}

export interface SacnConfig {
  universe: number;
  listen_address: string;
}

export type PreviewLayout = "SideBySide" | "Stacked";

export interface AppConfig {
  sacn: SacnConfig;
  monitor1: MonitorConfig;
  monitor2: MonitorConfig;
  preview_layout: PreviewLayout;
  production_mode: boolean;
}

export interface DmxUpdate {
  universe: number;
  channel: number;
  value: number;
}

export interface ClipChange {
  monitor: number;
  filename: string;
  dmx_value: number;
}

export interface DimmerChange {
  monitor: number;
  level: number;
}

export interface MonitorInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export const createDefaultResolution = (): ResolutionType => ({
  type: "HD",
  width: 1920,
  height: 1080,
});

export const createDefaultMonitorConfig = (name: string, startChannel: number): MonitorConfig => ({
  name,
  enabled: true,
  start_channel: startChannel,
  clip_channel_offset: 0,
  dimmer_channel_offset: 1,
  media_folder: "",
  resolution: createDefaultResolution(),
  orientation: "Horizontal",
});

export const createDefaultAppConfig = (): AppConfig => ({
  sacn: {
    universe: 1,
    listen_address: "0.0.0.0:5568",
  },
  monitor1: createDefaultMonitorConfig("Monitor 1", 1),
  monitor2: createDefaultMonitorConfig("Monitor 2", 10),
  preview_layout: "SideBySide",
  production_mode: false,
});
