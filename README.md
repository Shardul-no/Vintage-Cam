# Vintage Cam

A web-based vintage camera app with real-time filters for photos and videos.

## Features

- **Live Camera Preview**: Real-time video feed from device camera
- **Vintage Filters**: Three pre-configured filters (Vintage Warm, Cold Film, VHS)
- **Photo Capture**: Take photos with applied filters
- **Video Recording**: Record videos with real-time filter effects
- **Media Sharing**: Save and share captured media via Web Share API

## How It Works

### Camera Setup
- Requests camera and microphone permissions using `getUserMedia()`
- Sets up video stream for live preview and MediaRecorder for video capture

### Filter System
- Filters loaded from `filters.json` with adjustable parameters:
  - **sepia**: Sepia tone intensity (0-1)
  - **contrast**: Image contrast multiplier
  - **brightness**: Image brightness multiplier  
  - **grain**: Film grain noise level
  - **date**: Whether to show current date overlay

### Live Preview Loop
- Uses `requestAnimationFrame()` to continuously draw video frames to canvas
- Applies selected filter in real-time using pixel manipulation
- Processes RGBA values for sepia, contrast, brightness, and grain effects

### Capture & Recording
- **Photos**: Canvas converted to blob and stored in `window.currentBlob`
- **Videos**: Canvas stream captured at 30fps, encoded as MP4 chunks
- **Sharing**: Uses Web Share API to download or share captured media

## File Structure

```
├── index.html      # Main HTML structure
├── app.js          # Core application logic
├── style.css       # Styling and layout
└── filters.json    # Filter configuration
```

## Usage

1. Open `index.html` in a modern browser
2. Allow camera/microphone permissions
3. Select a filter from the filter buttons
4. Click "📸 Photo" to capture or "🎥 Record" to start/stop recording
5. Click "💾 Save" to download or share the captured media

## Browser Requirements

- HTTPS required for camera access
- Web Share API support for sharing functionality
- Canvas and MediaRecorder API support
