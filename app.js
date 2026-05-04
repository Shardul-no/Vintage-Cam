/* ============================================
   VINTAGE CAM — App Logic
   ============================================ */

// ---- DOM Elements ----
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const flash = document.getElementById("flash");
const dateStamp = document.getElementById("date-stamp");
const recordingIndicator = document.getElementById("recording-indicator");
const recTimer = document.getElementById("rec-timer");
const message = document.getElementById("message");
const filtersContainer = document.getElementById("filters");
const shutterBtn = document.getElementById("shutter-btn");
const flashBtn = document.getElementById("flash-btn");
const flipBtn = document.getElementById("flip-btn");
const exposureBtn = document.getElementById("exposure-btn");
const exposureSlider = document.getElementById("exposure-slider");
const exposureRange = document.getElementById("exposure-range");
const galleryBtn = document.getElementById("gallery-btn");
const galleryThumb = document.getElementById("gallery-thumb");
const savePrompt = document.getElementById("save-prompt");
const savePreviewImg = document.getElementById("save-preview-img");
const savePreviewVideo = document.getElementById("save-preview-video");
const saveDownload = document.getElementById("save-download");
const saveShare = document.getElementById("save-share");
const saveDismiss = document.getElementById("save-dismiss");
const modeBtns = document.querySelectorAll(".mode-btn");
const catTabs = document.querySelectorAll(".cat-tab");

// ---- State ----
let allFilters = [];
let filters = []; // filtered by category
let currentFilter = null;
let currentFilterIndex = 0;
let currentCategory = "effects";
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordStartTime = 0;
let recordTimerInterval = null;
let currentBlob = null;
let stream = null;
let facingMode = "environment";
let flashMode = "off";
let exposureValue = 0;
let currentMode = "photo";
let isMirrored = false;
let exposureVisible = false;
let messageTimeout = null;
let animFrameId = null;

// ---- S-Curve LUT Cache ----
// ---- Variables for Filters ----
let offscreenCanvas = null;
let octx = null;
let grainCanvas = null;

function generateGrain() {
  grainCanvas = document.createElement('canvas');
  grainCanvas.width = 512;
  grainCanvas.height = 512;
  const gctx = grainCanvas.getContext('2d', { willReadFrequently: false });
  const imgData = gctx.createImageData(512, 512);
  const d = imgData.data;
  for(let i = 0; i < d.length; i += 4) {
    const v = Math.random() * 255;
    d[i] = v;
    d[i+1] = v;
    d[i+2] = v;
    d[i+3] = 255;
  }
  gctx.putImageData(imgData, 0, 0);
}

// ---- Initialize ----
async function init() {
  try {
    initPWA();
    await startCamera();
    await loadFilters();
    startLivePreview();
    setupEventListeners();
    updateDateStamp();
    setInterval(updateDateStamp, 1000);
  } catch (error) {
    showMessage("Camera access needed");
    console.error("Init error:", error);
  }
}

function initPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW failed', err));
  }

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  
  if (isIos && isSafari && !isStandalone && !localStorage.getItem('pwa-dismissed')) {
    const banner = document.getElementById('pwa-banner');
    if (banner) {
      banner.classList.remove('hidden');
      document.getElementById('pwa-close').addEventListener('click', () => {
        banner.classList.add('hidden');
        localStorage.setItem('pwa-dismissed', 'true');
      });
    }
  }
}

// ---- Camera ----
async function startCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
  }

  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: facingMode,
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: true
  });

  video.srcObject = stream;
  video.muted = true;
  await video.play();
  setupRecorder();
}

async function flipCamera() {
  const viewfinder = document.querySelector(".viewfinder");
  viewfinder.classList.add("flipping");
  facingMode = facingMode === "environment" ? "user" : "environment";
  try {
    await startCamera();
  } catch (e) {
    facingMode = facingMode === "environment" ? "user" : "environment";
    showMessage("Camera not available");
  }
  setTimeout(() => viewfinder.classList.remove("flipping"), 500);
}

function toggleFlash() {
  flashMode = flashMode === "off" ? "on" : "off";
  flashBtn.classList.toggle("flash-on", flashMode === "on");
  const track = stream?.getVideoTracks()[0];
  if (track) {
    const capabilities = track.getCapabilities?.();
    if (capabilities?.torch) {
      track.applyConstraints({ advanced: [{ torch: flashMode === "on" }] });
    }
  }
}

// ---- Filters ----
async function loadFilters() {
  try {
    const response = await fetch("filters.json");
    allFilters = await response.json();
  } catch (error) {
    console.error("Error loading filters:", error);
    allFilters = [
      { name: "Natural", category: "effects", sepia: 0, contrast: 1, brightness: 1, grain: 0 }
    ];
  }
  switchCategory("effects");
}

function switchCategory(cat) {
  currentCategory = cat;
  catTabs.forEach(tab => tab.classList.toggle("active", tab.dataset.cat === cat));
  filters = allFilters.filter(f => f.category === cat);
  renderFilters();
  if (filters.length > 0) {
    selectFilter(0);
    // Scroll to first filter after render
    setTimeout(() => scrollToFilter(0), 50);
  }
}

function renderFilters() {
  filtersContainer.innerHTML = "";

  const padStart = document.createElement("div");
  padStart.style.minWidth = "calc(50vw - 45px)";
  padStart.style.flexShrink = "0";
  filtersContainer.appendChild(padStart);

  filters.forEach((filter, index) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn";
    btn.textContent = filter.name;
    btn.addEventListener("click", () => selectFilter(index));
    filtersContainer.appendChild(btn);
  });

  const padEnd = document.createElement("div");
  padEnd.style.minWidth = "calc(50vw - 45px)";
  padEnd.style.flexShrink = "0";
  filtersContainer.appendChild(padEnd);
}

function selectFilter(index) {
  currentFilterIndex = index;
  currentFilter = filters[index];
  updateActiveFilter();
  scrollToFilter(index);
}

function updateActiveFilter() {
  const btns = filtersContainer.querySelectorAll(".filter-btn");
  btns.forEach((btn, i) => btn.classList.toggle("active", i === currentFilterIndex));
}

function scrollToFilter(index) {
  const btn = filtersContainer.querySelectorAll(".filter-btn")[index];
  if (btn) btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}

// ---- Event Listeners ----
function setupEventListeners() {
  shutterBtn.addEventListener("click", handleShutter);
  flashBtn.addEventListener("click", toggleFlash);
  flipBtn.addEventListener("click", flipCamera);
  
  const mirrorBtn = document.getElementById("mirror-btn");
  if (mirrorBtn) {
    mirrorBtn.addEventListener("click", () => {
      isMirrored = !isMirrored;
      mirrorBtn.classList.toggle("mirror-on", isMirrored);
    });
  }

  exposureBtn.addEventListener("click", toggleExposure);

  exposureRange.addEventListener("input", (e) => {
    exposureValue = parseFloat(e.target.value);
  });

  modeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (mode) switchMode(mode);
    });
  });

  // Category tabs
  catTabs.forEach(tab => {
    tab.addEventListener("click", () => switchCategory(tab.dataset.cat));
  });

  saveDownload.addEventListener("click", downloadMedia);
  saveShare.addEventListener("click", shareMedia);
  saveDismiss.addEventListener("click", dismissSave);

  galleryBtn.addEventListener("click", () => {
    if (currentBlob) showSavePrompt();
  });

  canvas.addEventListener("click", () => {
    if (exposureVisible) toggleExposure();
  });

  let scrollTimeout;
  filtersContainer.addEventListener("scroll", () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => snapToNearestFilter(), 80);
  });
}

function snapToNearestFilter() {
  const btns = filtersContainer.querySelectorAll(".filter-btn");
  const containerRect = filtersContainer.getBoundingClientRect();
  const center = containerRect.left + containerRect.width / 2;
  let closestIndex = 0;
  let closestDist = Infinity;

  btns.forEach((btn, i) => {
    const btnRect = btn.getBoundingClientRect();
    const btnCenter = btnRect.left + btnRect.width / 2;
    const dist = Math.abs(btnCenter - center);
    if (dist < closestDist) {
      closestDist = dist;
      closestIndex = i;
    }
  });

  if (closestIndex !== currentFilterIndex) {
    currentFilterIndex = closestIndex;
    currentFilter = filters[closestIndex];
    updateActiveFilter();
  }
}

// ---- Mode Switching ----
function switchMode(mode) {
  currentMode = mode;
  modeBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.mode === mode));
  shutterBtn.classList.toggle("video-mode", mode === "video");
  if (isRecording) stopRecording();
}

// ---- Shutter ----
function handleShutter() {
  if (currentMode === "photo") capturePhoto();
  else toggleRecording();
}

// ---- Photo Capture ----
function capturePhoto() {
  triggerFlash();
  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = canvas.width;
  captureCanvas.height = canvas.height;
  const captureCtx = captureCanvas.getContext("2d");
  captureCtx.drawImage(canvas, 0, 0);

  captureCanvas.toBlob((blob) => {
    currentBlob = blob;
    updateGalleryThumb(blob);
    showMessage("Photo captured");
    setTimeout(() => showSavePrompt(), 400);
  }, "image/jpeg", 0.92);
}

function triggerFlash() {
  flash.classList.add("active");
  setTimeout(() => flash.classList.remove("active"), 250);
}

function updateGalleryThumb(blob) {
  const url = URL.createObjectURL(blob);
  galleryThumb.style.backgroundImage = `url(${url})`;
}

// ---- Recording ----
function setupRecorder() {
  try {
    const canvasStream = canvas.captureStream(30);
    if (stream) {
      stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
    }

    const mimeTypes = [
      "video/mp4;codecs=avc1,mp4a.40.2",
      "video/mp4;codecs=avc1",
      "video/mp4",
      "video/webm;codecs=h264,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];

    let selectedMime = "video/webm";
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }

    mediaRecorder = new MediaRecorder(canvasStream, { mimeType: selectedMime });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: selectedMime });
      currentBlob = blob;
      recordedChunks = [];
      showMessage("Video recorded");
    };
  } catch (error) {
    console.error("Recorder setup error:", error);
  }
}

function toggleRecording() {
  if (!mediaRecorder) { showMessage("Recorder not ready"); return; }
  if (!isRecording) startRecording();
  else stopRecording();
}

function startRecording() {
  recordedChunks = [];
  mediaRecorder.start();
  isRecording = true;
  recordStartTime = Date.now();
  shutterBtn.classList.add("recording");
  recordingIndicator.classList.remove("hidden");
  recordTimerInterval = setInterval(updateRecordTimer, 1000);
  updateRecordTimer();
}

function stopRecording() {
  mediaRecorder.stop();
  isRecording = false;
  shutterBtn.classList.remove("recording");
  recordingIndicator.classList.add("hidden");
  clearInterval(recordTimerInterval);
  recTimer.textContent = "00:00";
}

function updateRecordTimer() {
  const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
  const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const secs = String(elapsed % 60).padStart(2, "0");
  recTimer.textContent = `${mins}:${secs}`;
}

// ---- Exposure ----
function toggleExposure() {
  exposureVisible = !exposureVisible;
  exposureSlider.classList.toggle("hidden", !exposureVisible);
  exposureBtn.classList.toggle("active", exposureVisible);
}

// ---- Live Preview ----
function startLivePreview() {
  function draw() {
    if (video.videoWidth === 0) {
      animFrameId = requestAnimationFrame(draw);
      return;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    if (currentFilter) {
      ctx.filter = buildCSSFilter(currentFilter);
    }

    let mirrorScale = 1;
    if (facingMode === "user") mirrorScale *= -1;
    if (isMirrored) mirrorScale *= -1;

    if (mirrorScale === -1) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -w, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0);
    }

    ctx.filter = "none";

    if (currentFilter) {
      applyEffects(currentFilter, w, h);
    }

    animFrameId = requestAnimationFrame(draw);
  }
  draw();
}

function buildCSSFilter(filter) {
  const parts = [];
  const css = filter.css || {};
  
  if (css.sepia > 0) parts.push(`sepia(${css.sepia})`);
  if (css.contrast && css.contrast !== 1) parts.push(`contrast(${css.contrast})`);
  
  const evOffset = filter.ev || 0;
  const exposureMultiplier = Math.pow(2, evOffset + exposureValue);
  const totalBrightness = (css.brightness || 1) * exposureMultiplier;
  if (totalBrightness !== 1) parts.push(`brightness(${totalBrightness})`);
  
  if (css.saturate && css.saturate !== 1) parts.push(`saturate(${css.saturate})`);
  if (css.blur > 0) parts.push(`blur(${css.blur}px)`);
  if (css.hueRotate) parts.push(`hue-rotate(${css.hueRotate}deg)`);
  if (css.invert > 0) parts.push(`invert(${css.invert})`);
  if (css.grayscale > 0) parts.push(`grayscale(${css.grayscale})`);

  return parts.length > 0 ? parts.join(" ") : "none";
}

// ===========================================================
// EFFECTS PIPELINE (Compositing)
// ===========================================================
function applyEffects(filter, w, h) {
  // Lifted Blacks / Faded Shadows
  if (filter.lift) {
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = filter.lift;
    ctx.fillRect(0, 0, w, h);
  }

  // Color Tints & Overlays
  if (filter.overlay) {
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = filter.overlay;
    ctx.fillRect(0, 0, w, h);
  }

  if (filter.multiply) {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = filter.multiply;
    ctx.fillRect(0, 0, w, h);
  }

  // Halation / Bloom
  if (filter.halation) {
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = filter.halation.opacity || 0.3;
    ctx.filter = `blur(${filter.halation.blur || 10}px)`;
    
    if (!offscreenCanvas) {
      offscreenCanvas = document.createElement("canvas");
      octx = offscreenCanvas.getContext("2d", { willReadFrequently: false });
    }
    if (offscreenCanvas.width !== w || offscreenCanvas.height !== h) {
      offscreenCanvas.width = w;
      offscreenCanvas.height = h;
    }
    octx.clearRect(0, 0, w, h);
    octx.drawImage(canvas, 0, 0);
    
    ctx.drawImage(offscreenCanvas, 0, 0);
    ctx.filter = "none";
    ctx.globalAlpha = 1.0;
  }

  // Color Leaks (Edges/Corners only)
  if (filter.colorLeak) {
    ctx.globalCompositeOperation = "screen";
    const gradient = ctx.createLinearGradient(
      filter.colorLeak.x1 * w, filter.colorLeak.y1 * h, 
      filter.colorLeak.x2 * w, filter.colorLeak.y2 * h
    );
    gradient.addColorStop(0, filter.colorLeak.color1);
    gradient.addColorStop(1, filter.colorLeak.color2);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  // Vignette (Dark edges ONLY, NEVER brighten center)
  if (filter.vignette) {
    ctx.globalCompositeOperation = "multiply";
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.max(w, h) * (filter.vignette.size || 0.7);
    const intensity = filter.vignette.intensity || 0.5;
    const gradient = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
    const edgeColor = Math.floor(255 * (1 - intensity));
    gradient.addColorStop(0, "rgb(255,255,255)");
    gradient.addColorStop(1, `rgb(${edgeColor},${edgeColor},${edgeColor})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  // Flash Wash (Uniform overexposed wash)
  if (filter.flashWash) {
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = filter.flashWash;
    ctx.fillRect(0, 0, w, h);
  }

  // Organic Film Grain
  if (filter.grain) {
    if (!grainCanvas) generateGrain();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = filter.grain;
    
    const dx = Math.floor(Math.random() * 512);
    const dy = Math.floor(Math.random() * 512);
    
    ctx.fillStyle = ctx.createPattern(grainCanvas, 'repeat');
    ctx.save();
    ctx.translate(-dx, -dy);
    ctx.fillRect(dx, dy, w + dx, h + dy);
    ctx.restore();
    
    ctx.globalAlpha = 1.0;
  }

  // Cinematic Letterbox
  if (filter.letterbox) {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    const barHeight = h * 0.12;
    ctx.fillRect(0, 0, w, barHeight);
    ctx.fillRect(0, h - barHeight, w, barHeight);
  }

  ctx.globalCompositeOperation = "source-over";
}

// ---- Save / Share ----
function showSavePrompt() {
  if (!currentBlob) return;
  const url = URL.createObjectURL(currentBlob);
  const isVideo = currentBlob.type.startsWith("video/");
  if (isVideo) {
    savePreviewVideo.src = url;
    savePreviewVideo.style.display = "block";
    savePreviewImg.style.display = "none";
  } else {
    savePreviewImg.src = url;
    savePreviewImg.style.display = "block";
    savePreviewVideo.style.display = "none";
  }
  savePrompt.classList.remove("hidden");
}

function dismissSave() {
  savePrompt.classList.add("hidden");
  savePreviewVideo.pause();
}

async function downloadMedia() {
  if (!currentBlob) return;
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const ext = currentBlob.type.includes("mp4") ? "mp4"
            : currentBlob.type.startsWith("video/") ? "webm" : "jpg";
  const fileName = `vintage-cam-${ts}.${ext}`;
  try {
    const url = URL.createObjectURL(currentBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showMessage("Saved");
    dismissSave();
  } catch (e) {
    console.error("Download failed:", e);
    showMessage("Save failed");
  }
}

async function shareMedia() {
  if (!currentBlob) return;
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const ext = currentBlob.type.includes("mp4") ? "mp4"
            : currentBlob.type.startsWith("video/") ? "webm" : "jpg";
  const fileName = `vintage-cam-${ts}.${ext}`;
  const file = new File([currentBlob], fileName, { type: currentBlob.type });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Vintage Cam" });
      dismissSave();
    } catch (e) { console.log("Share cancelled"); }
  } else {
    showMessage("Sharing not supported — use Save");
  }
}

// ---- Date Stamp ----
function updateDateStamp() {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  dateStamp.textContent = `${y} ${m} ${day}`;
}

// ---- Toast ----
function showMessage(text) {
  if (messageTimeout) clearTimeout(messageTimeout);
  message.textContent = text;
  message.classList.remove("hidden");
  messageTimeout = setTimeout(() => message.classList.add("hidden"), 1800);
}

// ---- Start ----
init();
