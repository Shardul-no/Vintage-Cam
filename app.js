const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let filters = [];
let currentFilter = null;
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

// Start camera
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    video.srcObject = stream;
    setupRecorder(stream);
    startLivePreview();
  });

// Load filters
fetch("filters.json")
  .then(res => res.json())
  .then(data => {
    filters = data;
    renderFilters();
    currentFilter = filters[0];
  });

// Render filter buttons
function renderFilters() {
  const container = document.getElementById("filters");
  container.innerHTML = "";

  filters.forEach(f => {
    const btn = document.createElement("button");
    btn.innerText = f.name;
    btn.onclick = () => currentFilter = f;
    container.appendChild(btn);
  });
}

// 🎥 LIVE PREVIEW LOOP
function startLivePreview() {
  function draw() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0);

    if (currentFilter) applyFilter(currentFilter);

    requestAnimationFrame(draw);
  }
  draw();
}

// 🎨 APPLY FILTER
function applyFilter(filter) {
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // sepia
    let sr = (0.393*r + 0.769*g + 0.189*b);
    let sg = (0.349*r + 0.686*g + 0.168*b);
    let sb = (0.272*r + 0.534*g + 0.131*b);

    data[i]     = r + (sr - r) * filter.sepia;
    data[i + 1] = g + (sg - g) * filter.sepia;
    data[i + 2] = b + (sb - b) * filter.sepia;

    // contrast
    data[i] *= filter.contrast;
    data[i+1] *= filter.contrast;
    data[i+2] *= filter.contrast;

    // brightness
    data[i] *= filter.brightness;
    data[i+1] *= filter.brightness;
    data[i+2] *= filter.brightness;

    // grain
    let noise = (Math.random() - 0.5) * filter.grain;
    data[i] += noise;
    data[i+1] += noise;
    data[i+2] += noise;
  }

  ctx.putImageData(imageData, 0, 0);

  if (filter.date) {
    ctx.fillStyle = "white";
    ctx.font = "20px monospace";
    ctx.fillText(new Date().toLocaleDateString(), 20, canvas.height - 20);
  }
}

// 📸 PHOTO
function capturePhoto() {
  canvas.toBlob(blob => {
    window.currentBlob = blob;
    alert("Photo captured!");
  });
}

// 🎬 VIDEO RECORDING
function setupRecorder(stream) {
  const canvasStream = canvas.captureStream(30);
  mediaRecorder = new MediaRecorder(canvasStream);

  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "video/mp4" });
    window.currentBlob = blob;
    recordedChunks = [];
    alert("Video recorded!");
  };
}

function toggleRecording() {
  if (!isRecording) {
    mediaRecorder.start();
    isRecording = true;
    alert("Recording started");
  } else {
    mediaRecorder.stop();
    isRecording = false;
  }
}

// 💾 SHARE
async function shareMedia() {
  if (!window.currentBlob) {
    alert("Capture something first!");
    return;
  }

  const file = new File([window.currentBlob], "media", {
    type: window.currentBlob.type
  });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: "Vintage Cam"
    });
  } else {
    alert("Sharing not supported");
  }
}