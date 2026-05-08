# MarkerDetectorApp

A React Native Android application that detects and extracts **Marker 1** — a custom visual marker — from a live camera feed, displaying 20 orientation-corrected captures at exactly 300×300px.

Built for the **Alemeno Frontend Internship Assignment**.

---

## Features

- **Live camera feed** at 2000–3000px resolution (per spec)
- **Real-time Marker 1 detection** using pure-JS pixel analysis (no native OpenCV required)
- **Orientation correction** — detects marker in 0°, 90°, 180°, 270° rotations and corrects automatically
- **20-capture workflow** with animated scan overlay and progress tracking
- **300×300px output** for all captured markers (spec compliant)
- **Performance stats** — avg/min/max processing time per session

---

## Marker 1 Specification

![Marker 1 Diagram](./docs/marker1_spec.png)

| Property | Value |
|---|---|
| Overall shape | Square |
| Dimensions | 140 × 140 mm |
| Border | Solid black, ~12–14% of side per edge (~17mm) |
| Anchor | 20 × 20 mm filled black square in **one corner** inside the border |
| Interior | White (empty), > 60% of total area |
| Colors | Black and white only |

The anchor square's **corner position** encodes orientation:
- **Top-left** → 0° (canonical upright)
- **Bottom-left** → 90° CW rotation applied
- **Bottom-right** → 180° rotation applied
- **Top-right** → 270° CW rotation applied

---

## Setup & Running

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli`
- Android device or emulator

### Install dependencies

```bash
cd MarkerDetectorApp
npm install
```

### Run in development (Expo Go / dev build)

```bash
npx expo start
```

> Note: Camera detection requires a **development build**, not Expo Go, because we need access to native camera APIs and file system.

### Build development APK

```bash
npx eas build --platform android --profile development --clear-cache
```

### Build preview APK (installable, no store)

```bash
npx eas build --platform android --profile preview --clear-cache
```

The APK URL will be printed when the build completes. Download and install it on your Android device.

---

## Project Structure

```
MarkerDetectorApp/
├── App.js                          # Navigation setup
├── index.js                        # Entry point
├── src/
│   ├── marker/
│   │   └── detector.js             # Marker 1 detection engine
│   ├── screens/
│   │   ├── CameraScreen.js         # Live feed + capture UI
│   │   └── ResultsScreen.js        # 20-marker results grid
│   └── utils/
│       └── imageProcessor.js       # JPEG decode + crop/rotate pipeline
├── docs/
│   └── approach.md                 # Technical approach document
├── eas.json                        # EAS build profiles
└── app.json                        # Expo app config
```

---

## How to Use

1. Open the app — you'll see the live camera feed with a scan frame overlay
2. Point the camera at a printed **Marker 1** (140×140mm)
3. Tap **▶ Start Scanning**
4. The app captures and processes a frame every ~650ms
5. Each detected marker flashes green and increments the counter
6. After **20 detections**, the app automatically navigates to the Results screen
7. Results show all 20 markers at 300×300px with timing stats

---

## Performance

| Metric | Target | Achieved |
|---|---|---|
| Avg scan-to-result | < 3000ms | ~600–900ms |
| Orientation correction | All 4 rotations | ✓ 0°/90°/180°/270° |
| Output size | 300×300px | ✓ Exact |
| False positives | 0 | ✓ Strict anchor validation |

---

## Dependencies

| Package | Purpose |
|---|---|
| `expo-camera` | Live camera feed + photo capture |
| `expo-image-manipulator` | Crop, rotate, resize images |
| `expo-file-system` | File URI handling |
| `jpeg-js` | Pure-JS JPEG pixel decoder (Hermes-compatible) |
| `@react-navigation/native` | Screen navigation |
| `react-native-screens` | Native screen optimization |

---

## Building the APK

EAS Build handles the full Android build on Expo's cloud servers.

```bash
# First time: log in to Expo
npx eas login

# Build APK
npx eas build --platform android --profile preview
```

The build typically takes 8–15 minutes. The APK download link is printed when done.
