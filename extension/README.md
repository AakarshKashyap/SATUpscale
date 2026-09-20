# SATUpscale Companion — Chrome Extension (Manifest V3)

A lightweight browser companion extension that allows users to capture, crop, and enhance satellite imagery directly from any webpage (including Google Maps, Sentinel Hub EO Browser, USGS EarthExplorer, and OpenStreetMap).

---

## Key Capabilities

- **Context Menu Upscaling**: Right-click any satellite raster tile or image on any webpage and select **"Upscale Image with SATUpscale"** for instant super-resolution.
- **Interactive Crop Tool**: Visually select a bounding box crop directly on the viewport to enhance specific regions of interest.
- **Zero-Friction Authentication**: Automatically synchronizes the Cognito `IdToken` (`satup_id_token`) from your active web session on `localhost:5173` or `satupscale.com` without needing a separate extension login.
- **Popup Control Center**: View recent processing jobs, select scaling factor (`2x`, `4x`, `8x`, `16x`, `32x`), check API status, and open results directly in the split-screen comparison viewer.
- **Manifest V3 Native**: Built strictly using Manifest V3 standards with a background service worker (`background.js`) and isolated content scripts.

---

## Installation Guide (Developer Mode)

You can load the extension directly into Google Chrome, Microsoft Edge, Brave, or any Chromium-compatible browser:

1. Open your browser and navigate to the Extensions management page:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
2. Toggle on **"Developer mode"** in the top-right corner.
3. Click the **"Load unpacked"** button in the top-left corner.
4. Select the `extension/` folder from this repository:
   ```text
   SATUpscale/extension/
   ```
5. The **SATUpscale Companion** icon will now appear in your browser's extension toolbar. Pin it for quick access.

---

## How It Works

### Workflow 1: Right-Click Tile Capture
1. Navigate to any mapping platform (e.g., [Sentinel Hub](https://apps.sentinel-hub.com/eo-browser/) or Google Maps).
2. Right-click on any satellite image tile.
3. Select **"Upscale Image with SATUpscale"**.
4. The background service worker sends the image to the SATUpscale AWS API Gateway, runs EDSR super-resolution, and displays a browser notification when finished with a direct link to the result.

### Workflow 2: Area Crop & Capture
1. Click the SATUpscale Companion extension icon in your toolbar.
2. Click **"Capture Area on Page"**.
3. Drag a box over any region on the screen.
4. The cropped region is converted to PNG, transmitted to the backend, and opens automatically in the SATUpscale web application.

---

## Extension Architecture

```text
extension/
├── manifest.json       # Manifest V3 configuration, permissions, and host scopes
├── background.js       # Background service worker (API requests, context menu, notifications)
├── content.js          # Injected content script for DOM tile inspection & area crop tool
├── content.css         # Styling for the crop overlay and interactive capture box
├── popup.html          # Extension popup UI (status, scale options, recent tasks)
├── popup.js            # Popup logic, token sync, and action handlers
├── popup.css           # Glassmorphic dark theme for the extension popup
└── icons/              # Extension iconography (16x16, 48x48, 128x128)
```

---

## Configuration & Environment

The extension communicates with the SATUpscale backend API Gateway. The endpoint is configured in `manifest.json` under `host_permissions` and referenced in `background.js` and `popup.js`:

```javascript
const API_BASE = "https://<API_GATEWAY_ID>.execute-api.us-east-1.amazonaws.com/prod";
```

Authentication tokens are retrieved automatically from the frontend domain via the `storage` and `tabs` APIs.
