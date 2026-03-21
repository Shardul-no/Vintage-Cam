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
let exposureVisible = false;
let messageTimeout = null;
let animFrameId = null;

// ---- S-Curve LUT Cache ----
let cachedCurveLUT = null;
let cachedCurveStrength = null;

function buildSCurveLUT(strength) {
  const lut = new Uint8Array(256);
  const k = strength * 6;
  // Precompute sigmoid bounds for normalization
  const low = 1 / (1 + Math.exp(k * 0.5));
  const high = 1 / (1 + Math.exp(-k * 0.5));
  const range = high - low;
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    const s = 1 / (1 + Math.exp(-k * (x - 0.5)));
    lut[i] = Math.round(((s - low) / range) * 255);
  }
  return lut;
}

function getSCurveLUT(strength) {
  if (strength === cachedCurveStrength && cachedCurveLUT) return cachedCurveLUT;
  cachedCurveStrength = strength;
  cachedCurveLUT = buildSCurveLUT(strength);
  return cachedCurveLUT;
}

// ---- Initialize ----
async function init() {
  try {
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
  // Invalidate curve cache when filter changes
  cachedCurveStrength = null;
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
    cachedCurveStrength = null;
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

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentFilter) {
      ctx.filter = buildCSSFilter(currentFilter);
    }

    if (facingMode === "user") {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      ctx.drawImage(video, 0, 0);
    }

    ctx.filter = "none";

    if (currentFilter) {
      applyEffects(currentFilter);
    }

    animFrameId = requestAnimationFrame(draw);
  }
  draw();
}

function buildCSSFilter(filter) {
  const parts = [];
  if (filter.sepia > 0) parts.push(`sepia(${filter.sepia})`);
  if (filter.contrast && filter.contrast !== 1) parts.push(`contrast(${filter.contrast})`);

  // Combine filter EV + brightness + user exposure
  const evOffset = filter.ev || 0;
  const exposureMultiplier = Math.pow(2, evOffset + exposureValue);
  const totalBrightness = (filter.brightness || 1) * exposureMultiplier;
  if (totalBrightness !== 1) parts.push(`brightness(${totalBrightness})`);

  if (filter.saturate && filter.saturate !== 1) parts.push(`saturate(${filter.saturate})`);
  if (filter.blur > 0) parts.push(`blur(${filter.blur}px)`);

  return parts.length > 0 ? parts.join(" ") : "none";
}

// ===========================================================
// EFFECTS PIPELINE
// ===========================================================
function applyEffects(filter) {
  // Phase 1: Canvas compositing overlays (warmth, cool tint)
  if (filter.warmth > 0) applyOverlayTint(255, 180, 50, filter.warmth);
  if (filter.coolTint > 0) applyOverlayTint(40, 80, 200, filter.coolTint);

  // Phase 2: Combined pixel processing (colorGain, S-curve, flash, B&W, grain)
  // — single getImageData/putImageData for performance
  const needsPixels = filter.colorGain || filter.scurve || filter.flash ||
                      filter.blackWhite || filter.grain > 0;
  if (needsPixels) applyPixelEffects(filter);

  // Phase 3: RGB shift (spatial displacement, needs own pass)
  if (filter.rgbShift > 0) applyRGBShift(filter.rgbShift);

  // Phase 4: Canvas compositing (gradients & fills)
  if (filter.vignette) applyVignette(filter.vignette);
  if (filter.lightLeak) applyLightLeak();
  if (filter.fade > 0) {
    ctx.fillStyle = `rgba(255,255,255,${filter.fade})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Phase 5: Special effects
  if (filter.scanlines) applyScanlines();
  if (filter.glitch) applyGlitch();
  if (filter.bloom) applyBloom();
}

function applyOverlayTint(r, g, b, alpha) {
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";
}

// ---- Combined Pixel Processing ----
function applyPixelEffects(filter) {
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  // Pre-compute constants
  const curveLUT = filter.scurve ? getSCurveLUT(filter.scurve) : null;
  const rGain = filter.colorGain?.r ?? 1;
  const gGain = filter.colorGain?.g ?? 1;
  const bGain = filter.colorGain?.b ?? 1;
  const hasGain = rGain !== 1 || gGain !== 1 || bGain !== 1;
  const doBW = !!filter.blackWhite;
  const grainAmt = filter.grain || 0;

  // Flash pre-compute
  const doFlash = !!filter.flash;
  let fCx, fCy, fMaxR, fRadius, fInt, fBgD, fHot, fTint;
  if (doFlash) {
    const fl = filter.flash;
    fInt = fl.intensity || 0.7;
    fTint = fl.tint || [0, 8, 15];
    fBgD = fl.bgDarken || 0.3;
    fHot = fl.hotspot || 210;
    fCx = w * 0.5;
    fCy = h * 0.38;
    fMaxR = Math.sqrt(fCx * fCx + fCy * fCy);
    fRadius = fMaxR * (fl.falloff || 0.45);
  }

  // Process in 2x2 blocks (grain clumping + performance)
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      // Grain noise per 2x2 block
      let baseNoise = 0, rBias = 0, bBias = 0;
      if (grainAmt > 0) {
        baseNoise = (Math.random() - 0.5) * grainAmt;
        rBias = (Math.random() - 0.5) * grainAmt * 0.15;
        bBias = (Math.random() - 0.5) * grainAmt * 0.15;
      }

      for (let dy = 0; dy < 2 && y + dy < h; dy++) {
        for (let dx = 0; dx < 2 && x + dx < w; dx++) {
          const px = x + dx;
          const py = y + dy;
          const i = (py * w + px) * 4;
          let r = d[i], g = d[i + 1], b = d[i + 2];

          // 1. Color gain (per-channel white balance / tint)
          if (hasGain) {
            r *= rGain;
            g *= gGain;
            b *= bGain;
          }

          // 2. S-curve tone mapping via LUT
          if (curveLUT) {
            r = curveLUT[r > 255 ? 255 : r < 0 ? 0 : r | 0];
            g = curveLUT[g > 255 ? 255 : g < 0 ? 0 : g | 0];
            b = curveLUT[b > 255 ? 255 : b < 0 ? 0 : b | 0];
          }

          // 3. Flash lighting
          if (doFlash) {
            const fdx = px - fCx;
            const fdy = py - fCy;
            const dist = Math.sqrt(fdx * fdx + fdy * fdy);
            let ff;
            if (dist < fRadius) {
              const t = dist / fRadius;
              ff = fInt * (1.0 - t * t);
            } else {
              const t = Math.min((dist - fRadius) / (fMaxR - fRadius), 1.0);
              ff = -fBgD * t;
            }

            const lum = (r + g + b) / 3;
            r += ff * 180;
            g += ff * 180;
            b += ff * 180;

            // Specular hotspots
            if (ff > 0 && lum > fHot) {
              const hot = ((lum - fHot) / (255 - fHot)) * fInt * 80;
              r += hot; g += hot; b += hot;
            }

            // Background desaturation
            if (ff < 0) {
              const avg = (r + g + b) / 3;
              const ds = Math.min(Math.abs(ff) * 0.6, 0.4);
              r += (avg - r) * ds;
              g += (avg - g) * ds;
              b += (avg - b) * ds;
            }

            r += fTint[0]; g += fTint[1]; b += fTint[2];
          }

          // 4. Black & white
          if (doBW) {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            r = g = b = lum;
          }

          // 5. Grain (midtone-weighted, clumped)
          if (grainAmt > 0) {
            const lum = (r + g + b) / 3;
            const midF = 1.0 - Math.abs(lum - 128) / 128 * 0.5;
            const n = baseNoise * midF;
            r += n + rBias;
            g += n;
            b += n + bBias;
          }

          // Clamp
          d[i] = r > 255 ? 255 : r < 0 ? 0 : r;
          d[i + 1] = g > 255 ? 255 : g < 0 ? 0 : g;
          d[i + 2] = b > 255 ? 255 : b < 0 ? 0 : b;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// ---- RGB Shift ----
function applyRGBShift(amount) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const src = imageData.data;
  const w = canvas.width;
  const h = canvas.height;
  const out = new Uint8ClampedArray(src);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const redX = Math.max(0, x - amount);
      out[idx] = src[(y * w + redX) * 4];
      const blueX = Math.min(w - 1, x + amount);
      out[idx + 2] = src[(y * w + blueX) * 4 + 2];
    }
  }
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
}

// ---- Vignette (parameterized) ----
function applyVignette(opts) {
  const radius = (typeof opts === "object" ? opts.radius : null) || 0.6;
  const intensity = (typeof opts === "object" ? opts.intensity : null) || 0.35;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = Math.max(canvas.width, canvas.height) / 2;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(radius, "rgba(0,0,0,0)");
  gradient.addColorStop(Math.min(radius + 0.2, 0.95), `rgba(0,0,0,${intensity * 0.5})`);
  gradient.addColorStop(1, `rgba(0,0,0,${intensity})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ---- Light Leak ----
function applyLightLeak() {
  const seed = Math.floor(Date.now() / 2000) % 4;
  const positions = [
    { x1: 0, y1: 0, x2: canvas.width * 0.7, y2: canvas.height * 0.6 },
    { x1: canvas.width * 0.3, y1: 0, x2: canvas.width, y2: canvas.height * 0.8 },
    { x1: 0, y1: canvas.height * 0.4, x2: canvas.width * 0.6, y2: canvas.height },
    { x1: canvas.width * 0.5, y1: 0, x2: canvas.width, y2: canvas.height * 0.7 }
  ];
  const pos = positions[seed];
  const gradient = ctx.createLinearGradient(pos.x1, pos.y1, pos.x2, pos.y2);
  gradient.addColorStop(0, "rgba(255, 120, 50, 0.18)");
  gradient.addColorStop(0.4, "rgba(255, 200, 80, 0.1)");
  gradient.addColorStop(0.7, "rgba(255, 150, 50, 0.06)");
  gradient.addColorStop(1, "rgba(200, 80, 40, 0.03)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ---- Scanlines ----
function applyScanlines() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
  for (let y = 0; y < canvas.height; y += 4) {
    ctx.fillRect(0, y, canvas.width, 2);
  }
}

// ---- Glitch ----
function applyGlitch() {
  if (Math.random() > 0.94) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    const w = canvas.width;
    const glitchH = Math.floor(Math.random() * 20) + 5;
    const glitchY = Math.floor(Math.random() * canvas.height);
    const shift = Math.floor(Math.random() * 30) - 15;
    for (let y = glitchY; y < Math.min(glitchY + glitchH, canvas.height); y++) {
      for (let x = 0; x < w; x++) {
        const sx = (x + shift + w) % w;
        const si = (y * w + sx) * 4;
        const ti = (y * w + x) * 4;
        d[ti] = d[si]; d[ti + 1] = d[si + 1]; d[ti + 2] = d[si + 2];
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }
}

// ---- Bloom ----
function applyBloom() {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  const bright = new Uint8ClampedArray(d);
  const threshold = 200;
  for (let i = 0; i < d.length; i += 4) {
    const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (avg > threshold) {
      const f = (avg - threshold) / (255 - threshold);
      bright[i] = Math.min(255, d[i] + f * 40);
      bright[i + 1] = Math.min(255, d[i + 1] + f * 40);
      bright[i + 2] = Math.min(255, d[i + 2] + f * 40);
    } else {
      bright[i] = bright[i + 1] = bright[i + 2] = 0;
    }
  }
  ctx.putImageData(new ImageData(bright, canvas.width, canvas.height), 0, 0);
  ctx.filter = "blur(3px)";
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";
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
