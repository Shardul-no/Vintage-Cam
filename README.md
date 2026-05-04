# Vintage Cam

A mobile-first PWA camera app with real-time vintage filters for photos and videos.

## Features

- **48 filters across 3 categories** — Effects, Digicam, Film
- **Live preview** — filters applied in real-time via canvas compositing
- **Photo & video capture** — JPEG photos and MP4/WebM video
- **Favourites** — star any filter to save it; appears in a persistent FAV tab
- **Exposure control** — ±2 EV slider for manual brightness adjustment
- **Flash toggle** — torch API on supported devices
- **Camera flip** — switch between front and rear cameras
- **Mirror mode** — horizontal flip on top of camera flip
- **Date stamp** — amber Courier date overlay on the viewfinder
- **Save & Share** — native Web Share API or direct file download
- **PWA** — installable on iOS and Android as a home screen app

## Filter Categories

### Effects (20)
Mood-based and artistic looks: Natural, Golden Hour, Tezza Classic, Fujifilm Sim, Velvia, Bleach Bypass, Night Chrome, Y2K, Faded 90s, Warm Flash, Cool Flash, Colour Leak Red, Colour Leak Pink, Fade, Disposable, Cinematic Teal, Flash, Night Flash, VHS, Noir

### Digicam (15)
Simulations of real early-2000s digital cameras: Canon G7, Canon G9, Canon SD1000, Canon SD750, Sony W1, Sony WX1, Sony T70, Sony P200, Nikon 4500, Nikon S210, Nikon L3, Fuji F30, Fuji Z5fd, Olympus 710, Olympus µ-7000

### Film (13)
Film stock simulations: Kodak Gold, Portra 400, Fuji Superia, CineStill 800T, Ilford HP5, Polaroid, Stylus Epic, Contax T2, Yashica T4, Sure Shot, QuickSnap, FunSaver, Lomo

## How It Works

### Filter System

Filters are defined in `filters.json`. Each filter uses a `css` object for standard CSS filter operations, plus optional top-level compositing properties applied directly to the canvas.

**Filter format:**
```json
{
  "name": "Example",
  "category": "effects",
  "ev": 0.3,
  "css": {
    "brightness": 1.05,
    "contrast": 1.1,
    "saturate": 1.2,
    "sepia": 0.1,
    "grayscale": 0,
    "hueRotate": -10,
    "blur": 0
  },
  "lift": "rgba(40, 20, 0, 0.15)",
  "overlay": "rgba(255, 140, 0, 0.2)",
  "multiply": "rgba(0, 0, 50, 0.1)",
  "halation": { "blur": 15, "opacity": 0.4 },
  "colorLeak": { "x1": 0, "y1": 0, "x2": 0.6, "y2": 0.6, "color1": "rgba(255,50,0,0.5)", "color2": "rgba(255,50,0,0)" },
  "vignette": { "size": 0.7, "intensity": 0.4 },
  "flashWash": "rgba(255, 245, 230, 0.25)",
  "grain": 0.2,
  "scanlines": true,
  "letterbox": true
}
```

**Property reference:**

| Property | Type | Description |
|---|---|---|
| `css.brightness` | float | Brightness multiplier (1.0 = normal) |
| `css.contrast` | float | Contrast multiplier |
| `css.saturate` | float | Saturation multiplier |
| `css.sepia` | 0–1 | Sepia tone intensity |
| `css.grayscale` | 0–1 | Desaturation (1 = full black & white) |
| `css.hueRotate` | degrees | Hue shift (negative = warmer, positive = cooler) |
| `css.blur` | px | Gaussian blur |
| `ev` | float | Exposure compensation applied on top of `css.brightness` |
| `lift` | rgba string | Lifts shadows (screen blend) — creates faded/matte look |
| `overlay` | rgba string | Color tint via overlay blend |
| `multiply` | rgba string | Darkening tint via multiply blend |
| `halation` | object | Glow/bloom effect — `blur` (px) and `opacity` (0–1) |
| `colorLeak` | object | Edge light leak gradient |
| `vignette` | object | Dark-edge darkening — `size` (0–1) and `intensity` (0–1) |
| `flashWash` | rgba string | Uniform overexposed wash via screen blend |
| `grain` | 0–1 | Film grain opacity |
| `scanlines` | bool | VHS-style horizontal scanline overlay |
| `letterbox` | bool | Cinematic black bars (top and bottom 12%) |

### Live Preview Loop

`requestAnimationFrame` drives a continuous draw loop:
1. Draw the video frame to canvas with CSS filter applied
2. Apply compositing effects (lift, overlay, multiply, halation, colorLeak, vignette, flashWash, grain, scanlines, letterbox) in sequence

### Capture & Recording

- **Photos** — canvas drawn to an offscreen canvas, exported as JPEG blob
- **Videos** — `canvas.captureStream(30)` piped into `MediaRecorder` with audio from the camera stream

## File Structure

```
├── index.html      # App shell and UI
├── app.js          # Camera, filters, recording, favourites
├── style.css       # Styling and layout
├── filters.json    # Filter definitions (48 filters)
├── manifest.json   # PWA manifest
└── sw.js           # Service worker for offline support
```

## Usage

1. Open in a modern mobile browser (HTTPS required)
2. Allow camera and microphone permissions
3. Browse filters by category tab — EFFECTS, DIGICAM, or FILM
4. Star (☆) any filter to add it to the FAV tab
5. Tap the shutter to take a photo, or switch to VIDEO mode and tap to record
6. Tap the gallery thumbnail to re-open the save prompt
7. Save to device or share via the system share sheet

## Suggested Future Features

- **Swipe to change filter** — drag left/right on the viewfinder
- **Self-timer** — 3s/10s countdown before capture
- **Rule-of-thirds grid** — overlay toggle
- **Pinch-to-zoom** — two-finger zoom using `applyConstraints({zoom})`
- **Shutter sound** — short click via Web Audio API
- **Aspect ratio selector** — 1:1, 4:3, 9:16 crop on capture
- **Haptic feedback** — `navigator.vibrate(20)` on shutter press

## Browser Requirements

- HTTPS (required for camera access)
- `getUserMedia` for camera/microphone
- `Canvas` and `MediaRecorder` APIs
- Web Share API (optional — falls back to download)
