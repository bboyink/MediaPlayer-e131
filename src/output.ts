import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface ClipChange {
  monitor: number;
  filename: string;
  dmx_value: number;
}

interface DimmerChange {
  monitor: number;
  level: number;
}

// Get monitor number from URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const monitorNum = parseInt(urlParams.get("monitor") || "1");

const videoElement = document.getElementById("media-video") as HTMLVideoElement;
const imageElement = document.getElementById("media-image") as HTMLImageElement;

let currentMediaFolder = "";
let currentOrientation = "Horizontal";
let currentDimmer = 1.0;

// Listen for clip changes
listen<ClipChange>("clip-change", async (event) => {
  const change = event.payload;
  
  if (change.monitor !== monitorNum) {
    return; // Not for this monitor
  }
  
  console.log(`Monitor ${monitorNum}: Loading ${change.filename}`);
  
  // Determine if video or image
  const filename = change.filename.toLowerCase();
  if (filename.endsWith(".mp4")) {
    await loadVideo(change.filename);
  } else if (filename.endsWith(".jpg") || filename.endsWith(".jpeg") || filename.endsWith(".png")) {
    await loadImage(change.filename);
  }
});

// Listen for dimmer changes
listen<DimmerChange>("dimmer-change", (event) => {
  const change = event.payload;
  
  if (change.monitor !== monitorNum) {
    return;
  }
  
  currentDimmer = change.level;
  applyDimmer();
});

// Listen for configuration changes
listen("config-update", (event: any) => {
  const config = event.payload;
  const monitorConfig = monitorNum === 1 ? config.monitor1 : config.monitor2;
  
  if (monitorConfig) {
    currentMediaFolder = monitorConfig.media_folder;
    currentOrientation = monitorConfig.orientation;
    applyOrientation();
  }
});

async function loadVideo(filename: string) {
  // Hide image, show video
  imageElement.classList.add("hidden");
  videoElement.classList.remove("hidden");
  
  // Convert file path - Tauri uses the asset protocol
  const fullPath = `${currentMediaFolder}/${filename}`;
  
  try {
    // For local files, use the convertFileSrc utility
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const assetUrl = convertFileSrc(fullPath);
    
    videoElement.src = assetUrl;
    videoElement.load();
    
    await videoElement.play();
    applyOrientation();
    applyDimmer();
  } catch (error) {
    console.error(`Failed to load video: ${filename}`, error);
  }
}

async function loadImage(filename: string) {
  // Hide video, show image
  videoElement.classList.add("hidden");
  imageElement.classList.remove("hidden");
  
  const fullPath = `${currentMediaFolder}/${filename}`;
  
  try {
    const { convertFileSrc } = await import("@tauri-apps/api/core");
    const assetUrl = convertFileSrc(fullPath);
    
    imageElement.src = assetUrl;
    applyOrientation();
    applyDimmer();
  } catch (error) {
    console.error(`Failed to load image: ${filename}`, error);
  }
}

function applyOrientation() {
  const activeElement = videoElement.classList.contains("hidden") ? imageElement : videoElement;
  
  activeElement.classList.remove("horizontal", "vertical");
  activeElement.classList.add(currentOrientation.toLowerCase());
}

function applyDimmer() {
  const activeElement = videoElement.classList.contains("hidden") ? imageElement : videoElement;
  activeElement.style.opacity = currentDimmer.toString();
}

console.log(`Output window initialized for Monitor ${monitorNum}`);
