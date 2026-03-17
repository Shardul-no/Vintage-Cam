// DOM Elements
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const flash = document.getElementById("flash");
const timestamp = document.getElementById("timestamp");
const recordingIndicator = document.getElementById("recording-indicator");
const message = document.getElementById("message");
const filtersContainer = document.getElementById("filters");
const captureBtn = document.getElementById("capture-btn");
const recordBtn = document.getElementById("record-btn");
const saveBtn = document.getElementById("save-btn");
const exposureBtn = document.getElementById("exposure-btn");

// State
let filters = [];
let currentFilter = null;
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let currentBlob = null;
let stream = null;
let exposureValue = 1.0;

// Cycle through exposure values
function cycleExposure() {
  const exposureLevels = [0.5, 0.75, 1.0, 1.25, 1.5];
  const currentIndex = exposureLevels.indexOf(exposureValue);
  const nextIndex = (currentIndex + 1) % exposureLevels.length;
  exposureValue = exposureLevels[nextIndex];
  
  // Update button visual feedback
  const exposureIcons = ["🌑", "🌘", "☀️", "🌤️", "🌞"];
  exposureBtn.textContent = exposureIcons[nextIndex];
  
  // Show exposure level
  const exposureNames = ["Dark", "Dim", "Normal", "Bright", "Very Bright"];
  showMessage(`Exposure: ${exposureNames[nextIndex]}`);
  
  // Haptic feedback simulation
  exposureBtn.style.transform = "scale(0.9)";
  setTimeout(() => {
    exposureBtn.style.transform = "";
  }, 100);
}

// Initialize
async function init() {
  try {
    // Start camera
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }, 
      audio: true 
    });
    video.srcObject = stream;
    
    // Setup recorder
    setupRecorder();
    
    // Load filters
    await loadFilters();
    
    // Start live preview
    startLivePreview();
    
    // Setup event listeners
    setupEventListeners();
    
    // Update timestamp
    updateTimestamp();
    setInterval(updateTimestamp, 1000);
    
  } catch (error) {
    showMessage("Camera access denied. Please allow camera access.");
    console.error("Init error:", error);
  }
}

// Load filters
async function loadFilters() {
  try {
    const response = await fetch("filters.json");
    filters = await response.json();
    renderFilters();
    if (filters.length > 0) {
      currentFilter = filters[0];
      updateFilterButtons();
    }
  } catch (error) {
    console.error("Error loading filters:", error);
    // Fallback filters
    filters = [
      { name: "Vintage", sepia: 0.8, contrast: 1.2, brightness: 1.1, grain: 20, date: true },
      { name: "B&W", sepia: 0, contrast: 1.3, brightness: 0.9, grain: 10, date: false }
    ];
    renderFilters();
    currentFilter = filters[0];
    updateFilterButtons();
  }
}

// Render filter buttons
function renderFilters() {
  filtersContainer.innerHTML = "";
  
  filters.forEach((filter, index) => {
    const btn = document.createElement("button");
    btn.innerText = filter.name;
    btn.onclick = () => selectFilter(filter, btn);
    if (index === 0) btn.classList.add("active");
    filtersContainer.appendChild(btn);
  });
}

// Select filter
function selectFilter(filter, button) {
  currentFilter = filter;
  updateFilterButtons();
}

// Update filter buttons
function updateFilterButtons() {
  const buttons = filtersContainer.querySelectorAll("button");
  buttons.forEach((btn, index) => {
    btn.classList.toggle("active", filters[index] === currentFilter);
  });
}

// Setup event listeners
function setupEventListeners() {
  captureBtn.addEventListener("click", capturePhoto);
  recordBtn.addEventListener("click", toggleRecording);
  saveBtn.addEventListener("click", saveMedia);
  exposureBtn.addEventListener("click", cycleExposure);
}

// Live preview with optimized performance
function startLivePreview() {
  function draw() {
    if (video.videoWidth === 0) {
      requestAnimationFrame(draw);
      return;
    }
    
    // Set canvas size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply CSS filters for performance
    if (currentFilter) {
      const cssFilter = buildCSSFilter(currentFilter);
      ctx.filter = cssFilter;
    }
    
    // Draw video
    ctx.drawImage(video, 0, 0);
    
    // Reset filter for additional effects
    ctx.filter = "none";
    
    // Apply additional effects that can't be done with CSS
    if (currentFilter) {
      applyAdditionalEffects(currentFilter);
    }
    
    requestAnimationFrame(draw);
  }
  draw();
}

// Build CSS filter string
function buildCSSFilter(filter) {
  const filters = [];
  
  if (filter.sepia > 0) {
    filters.push(`sepia(${filter.sepia})`);
  }
  
  if (filter.contrast !== 1) {
    filters.push(`contrast(${filter.contrast})`);
  }
  
  // Combine filter brightness with exposure
  const totalBrightness = filter.brightness * exposureValue;
  if (totalBrightness !== 1) {
    filters.push(`brightness(${totalBrightness})`);
  }
  
  if (filter.blur > 0) {
    filters.push(`blur(${filter.blur}px)`);
  }
  
  return filters.join(" ");
}

// Apply additional effects (grain, vignette, etc.)
function applyAdditionalEffects(filter) {
  // RGB Shift (Chromatic Aberration)
  if (filter.rgbShift && filter.rgbShift > 0) {
    applyRGBShift(filter.rgbShift);
  }
  
  // Film grain (optimized - lower resolution)
  if (filter.grain > 0) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const grainAmount = filter.grain;
    
    // Sample every 4th pixel for performance
    for (let i = 0; i < data.length; i += 16) {
      const noise = (Math.random() - 0.5) * grainAmount;
      data[i] += noise;     // R
      data[i + 1] += noise; // G
      data[i + 2] += noise; // B
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
  
  // Vignette effect
  if (filter.vignette) {
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.7, "rgba(0,0,0,0.1)");
    gradient.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  
  // Light leak effect (randomized position)
  if (filter.lightLeak) {
    applyLightLeak();
  }
  
  // Fade effect (washed film look)
  if (filter.fade && filter.fade > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${filter.fade})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  
  // Black & White conversion
  if (filter.blackWhite) {
    applyBlackWhite();
  }
  
  // VHS effects
  if (filter.vhs) {
    applyVHSEffects(filter);
  }
}

// RGB Shift (Chromatic Aberration) effect
function applyRGBShift(shiftAmount) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;
  const newData = new Uint8ClampedArray(data);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Red channel shifted left
      const redX = Math.max(0, x - shiftAmount);
      const redIdx = (y * width + redX) * 4;
      newData[idx] = data[redIdx];
      
      // Green channel normal
      newData[idx + 1] = data[idx + 1];
      
      // Blue channel shifted right
      const blueX = Math.min(width - 1, x + shiftAmount);
      const blueIdx = (y * width + blueX) * 4;
      newData[idx + 2] = data[blueIdx + 2];
      
      // Alpha unchanged
      newData[idx + 3] = data[idx + 3];
    }
  }
  
  const newImageData = new ImageData(newData, width, height);
  ctx.putImageData(newImageData, 0, 0);
}

// Light Leak effect with random position
function applyLightLeak() {
  // Use a seed based on time for consistent positioning during preview
  const seed = Math.floor(Date.now() / 1000) % 5;
  const positions = [
    { x1: 0, y1: 0, x2: canvas.width, y2: canvas.height * 0.6 },
    { x1: canvas.width * 0.4, y1: 0, x2: canvas.width, y2: canvas.height },
    { x1: 0, y1: canvas.height * 0.3, x2: canvas.width * 0.7, y2: canvas.height },
    { x1: canvas.width * 0.2, y1: 0, x2: canvas.width * 0.8, y2: canvas.height * 0.8 },
    { x1: 0, y1: canvas.height * 0.2, x2: canvas.width * 0.6, y2: canvas.height }
  ];
  
  const pos = positions[seed];
  const gradient = ctx.createLinearGradient(pos.x1, pos.y1, pos.x2, pos.y2);
  gradient.addColorStop(0, "rgba(255, 100, 50, 0.15)");
  gradient.addColorStop(0.3, "rgba(255, 200, 100, 0.1)");
  gradient.addColorStop(0.6, "rgba(255, 150, 50, 0.08)");
  gradient.addColorStop(1, "rgba(200, 100, 50, 0.05)");
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Black & White conversion using luminance formula
function applyBlackWhite() {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    // Luminance formula: 0.299*R + 0.587*G + 0.114*B
    const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = luminance;     // R
    data[i + 1] = luminance; // G
    data[i + 2] = luminance; // B
    // Alpha unchanged
  }
  
  ctx.putImageData(imageData, 0, 0);
}

// VHS effects pipeline
function applyVHSEffects(filter) {
  // Night Vision mode
  if (filter.nightVision) {
    applyNightVision();
  }
  
  // Scanlines effect
  if (filter.scanlines) {
    applyScanlines();
  }
  
  // Glitch effect
  if (filter.glitch) {
    applyGlitch();
  }
  
  // Bloom effect
  if (filter.bloom) {
    applyBloom();
  }
}

// Night Vision green tint
function applyNightVision() {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    // Create green night vision look
    const green = (data[i] * 0.2) + (data[i + 1] * 0.8) + (data[i + 2] * 0.1);
    data[i] = green * 0.3;     // R - reduced
    data[i + 1] = green;      // G - enhanced
    data[i + 2] = green * 0.2; // B - reduced
  }
  
  ctx.putImageData(imageData, 0, 0);
}

// Scanlines effect
function applyScanlines() {
  const lineHeight = 2;
  const opacity = 0.1;
  
  ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
  for (let y = 0; y < canvas.height; y += lineHeight * 2) {
    ctx.fillRect(0, y, canvas.width, lineHeight);
  }
}

// Glitch effect
function applyGlitch() {
  // Random horizontal displacement
  if (Math.random() > 0.95) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const glitchHeight = Math.floor(Math.random() * 20) + 5;
    const glitchY = Math.floor(Math.random() * canvas.height);
    const shiftAmount = Math.floor(Math.random() * 20) - 10;
    
    for (let y = glitchY; y < Math.min(glitchY + glitchHeight, canvas.height); y++) {
      for (let x = 0; x < canvas.width; x++) {
        const sourceX = (x + shiftAmount + canvas.width) % canvas.width;
        const sourceIdx = (y * canvas.width + sourceX) * 4;
        const targetIdx = (y * canvas.width + x) * 4;
        
        // Only shift color channels, not alpha
        data[targetIdx] = data[sourceIdx];
        data[targetIdx + 1] = data[sourceIdx + 1];
        data[targetIdx + 2] = data[sourceIdx + 2];
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
}

// Bloom effect (simple bright areas enhancement)
function applyBloom() {
  // Create a bright pass and blur it slightly
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const brightData = new Uint8ClampedArray(data);
  
  // Extract bright areas
  const threshold = 180;
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (brightness > threshold) {
      const factor = (brightness - threshold) / (255 - threshold);
      brightData[i] = Math.min(255, data[i] + factor * 50);
      brightData[i + 1] = Math.min(255, data[i + 1] + factor * 50);
      brightData[i + 2] = Math.min(255, data[i + 2] + factor * 50);
    } else {
      brightData[i] = 0;
      brightData[i + 1] = 0;
      brightData[i + 2] = 0;
    }
  }
  
  const brightImageData = new ImageData(brightData, canvas.width, canvas.height);
  ctx.putImageData(brightImageData, 0, 0);
  
  // Apply slight blur to bright areas
  ctx.filter = "blur(2px)";
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-over";
}

// Capture photo
function capturePhoto() {
  // Flash effect
  triggerFlash();
  
  // Capture current frame
  canvas.toBlob((blob) => {
    currentBlob = blob;
    showMessage("Photo captured!");
    
    // Haptic feedback simulation
    captureBtn.style.transform = "scale(0.9)";
    setTimeout(() => {
      captureBtn.style.transform = "";
    }, 100);
  }, "image/jpeg", 0.9);
}

// Trigger flash animation
function triggerFlash() {
  flash.classList.add("active");
  setTimeout(() => {
    flash.classList.remove("active");
  }, 300);
}

// Setup video recorder
function setupRecorder() {
  try {
    const canvasStream = canvas.captureStream(30);
    
    // Try different MIME types
    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8', 
      'video/webm',
      'video/mp4'
    ];
    
    let selectedMimeType = mimeTypes[0];
    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType;
        break;
      }
    }
    
    mediaRecorder = new MediaRecorder(canvasStream, { mimeType: selectedMimeType });
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: selectedMimeType });
      currentBlob = blob;
      recordedChunks = [];
      showMessage("Video recorded!");
    };
    
  } catch (error) {
    console.error("Recorder setup error:", error);
    showMessage("Video recording not supported");
  }
}

// Toggle recording
function toggleRecording() {
  if (!mediaRecorder) {
    showMessage("Recorder not ready");
    return;
  }
  
  if (!isRecording) {
    mediaRecorder.start();
    isRecording = true;
    recordBtn.classList.add("recording");
    recordingIndicator.classList.remove("hidden");
    showMessage("Recording started");
  } else {
    mediaRecorder.stop();
    isRecording = false;
    recordBtn.classList.remove("recording");
    recordingIndicator.classList.add("hidden");
  }
}

// Save/share media with fallbacks
async function saveMedia() {
  if (!currentBlob) {
    showMessage("Capture something first!");
    return;
  }
  
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const isVideo = currentBlob.type.startsWith("video/");
  const fileName = `vintage-cam-${timestamp}.${isVideo ? "webm" : "jpg"}`;
  const file = new File([currentBlob], fileName, { type: currentBlob.type });
  
  // Try Web Share API first
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "Vintage Cam",
        text: `Captured with Vintage Cam - ${fileName}`
      });
      return;
    } catch (error) {
      console.log("Share failed, trying download:", error);
    }
  }
  
  // Fallback: Download using object URL
  try {
    const url = URL.createObjectURL(currentBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showMessage("Downloaded!");
  } catch (error) {
    console.error("Download failed:", error);
    showMessage("Save failed. Try again.");
  }
}

// Update timestamp display
function updateTimestamp() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  timestamp.textContent = `${year} ${month} ${day}`;
}

// Show message
function showMessage(text) {
  message.textContent = text;
  message.classList.remove("hidden");
  setTimeout(() => {
    message.classList.add("hidden");
  }, 2000);
}

// Start the app
init();