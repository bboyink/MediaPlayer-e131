import { useState, useEffect } from "react";
import type { AppConfig, PreviewLayout } from "../types";

interface PreviewPanelProps {
  config: AppConfig;
  currentClips: { monitor1: string; monitor2: string };
  dimmerLevels: { monitor1: number; monitor2: number };
  onLayoutChange: (layout: PreviewLayout) => void;
}

export default function PreviewPanel({
  config,
  currentClips,
  dimmerLevels,
  onLayoutChange,
}: PreviewPanelProps) {
  const [mediaUrls, setMediaUrls] = useState<{ monitor1: string; monitor2: string }>({
    monitor1: "",
    monitor2: "",
  });

  useEffect(() => {
    // Update media URLs when clips change
    if (currentClips.monitor1 && config.monitor1.media_folder) {
      const url1 = `${config.monitor1.media_folder}/${currentClips.monitor1}`;
      setMediaUrls(prev => ({ ...prev, monitor1: url1 }));
    }
    if (currentClips.monitor2 && config.monitor2.media_folder) {
      const url2 = `${config.monitor2.media_folder}/${currentClips.monitor2}`;
      setMediaUrls(prev => ({ ...prev, monitor2: url2 }));
    }
  }, [currentClips, config.monitor1.media_folder, config.monitor2.media_folder]);

  const isVideo = (filename: string): boolean => {
    return filename.toLowerCase().endsWith(".mp4");
  };

  const isImage = (filename: string): boolean => {
    const lower = filename.toLowerCase();
    return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png");
  };

  const renderMedia = (
    monitorNum: 1 | 2,
    url: string,
    filename: string,
    dimmer: number,
    orientation: string
  ) => {
    if (!filename) {
      return (
        <div className="preview-placeholder">
          <p>No media selected</p>
          <p className="preview-hint">Monitor {monitorNum}</p>
        </div>
      );
    }

    const style = {
      opacity: dimmer,
      transform: orientation === "Vertical" ? "rotate(90deg)" : "none",
    };

    if (isVideo(filename)) {
      return (
        <video
          key={url}
          src={url}
          controls
          loop
          autoPlay
          muted
          style={style}
          className="preview-media"
        >
          Video not supported
        </video>
      );
    } else if (isImage(filename)) {
      return (
        <img
          key={url}
          src={url}
          alt={`Monitor ${monitorNum} output`}
          style={style}
          className="preview-media"
        />
      );
    }

    return (
      <div className="preview-placeholder">
        <p>Unsupported format</p>
        <p className="preview-hint">{filename}</p>
      </div>
    );
  };

  const containerClass = config.preview_layout === "SideBySide" 
    ? "preview-container side-by-side" 
    : "preview-container stacked";

  return (
    <div className="preview-panel">
      <div className="preview-header">
        <h2>Preview</h2>
        <div className="layout-controls">
          <button
            className={config.preview_layout === "SideBySide" ? "active" : ""}
            onClick={() => onLayoutChange("SideBySide")}
            title="Side by Side"
          >
            ◫
          </button>
          <button
            className={config.preview_layout === "Stacked" ? "active" : ""}
            onClick={() => onLayoutChange("Stacked")}
            title="Stacked"
          >
            ⬒
          </button>
        </div>
      </div>

      <div className={containerClass}>
        <div className="preview-monitor">
          <div className="preview-label">Monitor 1</div>
          <div className="preview-frame">
            {renderMedia(
              1,
              mediaUrls.monitor1,
              currentClips.monitor1,
              dimmerLevels.monitor1,
              config.monitor1.orientation
            )}
          </div>
          <div className="preview-info">
            {currentClips.monitor1 || "No clip"}
            {" • "}
            {Math.round(dimmerLevels.monitor1 * 100)}%
          </div>
        </div>

        <div className="preview-monitor">
          <div className="preview-label">Monitor 2</div>
          <div className="preview-frame">
            {renderMedia(
              2,
              mediaUrls.monitor2,
              currentClips.monitor2,
              dimmerLevels.monitor2,
              config.monitor2.orientation
            )}
          </div>
          <div className="preview-info">
            {currentClips.monitor2 || "No clip"}
            {" • "}
            {Math.round(dimmerLevels.monitor2 * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}
