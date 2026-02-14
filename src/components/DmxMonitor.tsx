import type { MonitorConfig } from "../types";

interface DmxMonitorProps {
  monitor1Config: MonitorConfig;
  monitor2Config: MonitorConfig;
  dmxValues: Map<number, number>;
}

export default function DmxMonitor({ 
  monitor1Config, 
  monitor2Config, 
  dmxValues 
}: DmxMonitorProps) {
  const getChannelValue = (channel: number): number => {
    return dmxValues.get(channel) || 0;
  };

  const getChannelClass = (value: number): string => {
    if (value === 0) return "channel-zero";
    if (value < 85) return "channel-low";
    if (value < 170) return "channel-mid";
    return "channel-high";
  };

  const monitor1ClipChannel = monitor1Config.start_channel + monitor1Config.clip_channel_offset;
  const monitor1DimmerChannel = monitor1Config.start_channel + monitor1Config.dimmer_channel_offset;
  const monitor2ClipChannel = monitor2Config.start_channel + monitor2Config.clip_channel_offset;
  const monitor2DimmerChannel = monitor2Config.start_channel + monitor2Config.dimmer_channel_offset;

  return (
    <div className="dmx-monitor">
      <h3>DMX Monitor</h3>
      
      <div className="dmx-section">
        <h4>Monitor 1</h4>
        <div className="dmx-channels">
          <div className="dmx-channel">
            <span className="channel-label">Ch {monitor1ClipChannel} (Clip):</span>
            <span className={`channel-value ${getChannelClass(getChannelValue(monitor1ClipChannel))}`}>
              {getChannelValue(monitor1ClipChannel)}
            </span>
          </div>
          <div className="dmx-channel">
            <span className="channel-label">Ch {monitor1DimmerChannel} (Dimmer):</span>
            <span className={`channel-value ${getChannelClass(getChannelValue(monitor1DimmerChannel))}`}>
              {getChannelValue(monitor1DimmerChannel)}
            </span>
          </div>
        </div>
      </div>

      <div className="dmx-section">
        <h4>Monitor 2</h4>
        <div className="dmx-channels">
          <div className="dmx-channel">
            <span className="channel-label">Ch {monitor2ClipChannel} (Clip):</span>
            <span className={`channel-value ${getChannelClass(getChannelValue(monitor2ClipChannel))}`}>
              {getChannelValue(monitor2ClipChannel)}
            </span>
          </div>
          <div className="dmx-channel">
            <span className="channel-label">Ch {monitor2DimmerChannel} (Dimmer):</span>
            <span className={`channel-value ${getChannelClass(getChannelValue(monitor2DimmerChannel))}`}>
              {getChannelValue(monitor2DimmerChannel)}
            </span>
          </div>
        </div>
      </div>

      <div className="dmx-legend">
        <span className="legend-item">
          <span className="legend-color channel-zero"></span> 0
        </span>
        <span className="legend-item">
          <span className="legend-color channel-low"></span> 1-84
        </span>
        <span className="legend-item">
          <span className="legend-color channel-mid"></span> 85-169
        </span>
        <span className="legend-item">
          <span className="legend-color channel-high"></span> 170-255
        </span>
      </div>
    </div>
  );
}
