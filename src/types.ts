// TypeScript types matching Rust config.rs structures

export type Resolution = 
  | { type: 'HD' }
  | { type: 'FourK' }
  | { type: 'Custom', width: number, height: number };

export type Orientation = 'Horizontal' | 'Vertical';

export type SacnMode = 'Multicast' | 'Unicast';

export interface SacnConfig {
  universe: number;
  mode: SacnMode;
  ip_address: string;
  unicast_ip: string;
  network_interface: string;
}

export interface MonitorConfig {
  enabled: boolean;
  start_channel: number;
  media_folder: string;
  resolution: Resolution;
  orientation: Orientation;
}

export type LayoutMode = 
  | 'HorizontalSideBySide'
  | 'HorizontalStacked'
  | 'VerticalSideBySide'
  | 'VerticalStacked';

export type PreviewMode = 'Listen' | 'Test';

export interface AppConfig {
  sacn: SacnConfig;
  monitor1: MonitorConfig;
  monitor2: MonitorConfig;
  layout: LayoutMode;
  preview: PreviewMode;
  production_mode: boolean;
}

export type MediaType = 'Video' | 'Image';

export interface MediaFile {
  dmx_value: number;
  filename: string;
  path: string;
  media_type: MediaType;
}

export interface DmxUpdate {
  universe: number;
  data: number[];
}

export interface NetworkInterface {
  name: string;
  ip_address: string;
}

// Helper functions for MonitorConfig
export function getClipChannel(monitor: MonitorConfig): number {
  return monitor.start_channel;
}

export function getDimmerChannel(monitor: MonitorConfig): number {
  return monitor.start_channel + 1;
}

export function getPlaytypeChannel(monitor: MonitorConfig): number {
  return monitor.start_channel + 2;
}
