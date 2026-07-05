# Project Specification: Respiratory Rate Monitor

## 1. Executive Summary
A lightweight, browser-based application that continuously monitors and calculates the resting respiratory rate (BPM) of a senior Pomeranian mix named Willow. Using local microphone input and the Web Audio API, the application isolates breath patterns via time-domain RMS energy analysis with a sustained-above-threshold detection algorithm, filtering out transient noise while capturing continuous broadband breath signals.

## 2. Technical Stack
*   **Frontend Framework:** React 19
*   **Language:** TypeScript
*   **Build Tool:** Vite 6
*   **Audio Processing:** Web Audio API (`AudioContext`, `AnalyserNode`, `BiquadFilterNode`)
*   **Testing:** Vitest (unit), Playwright (E2E, browser permission fixtures)
*   **CI/CD & Deployment:** GitHub Actions integrated with Vercel

## 3. Core Architecture

### 3.1 Audio Processing Pipeline
```
Microphone → getUserMedia → MediaStreamAudioSourceNode
  → BiquadFilterNode (highpass, 100Hz)
  → AnalyserNode (fftSize: 2048)
  → getByteTimeDomainData → Uint8Array → RMS calculation
```
*   **Capture:** `navigator.mediaDevices.getUserMedia({ audio: true })` for real-time audio.
*   **Filtering:** `BiquadFilterNode` configured as `highpass` at 100Hz to reject low-frequency rumble and DC offset while passing breath acoustic signatures.
*   **Analysis:** `AnalyserNode` with `fftSize` of 2048. Time-domain data extracted via `getByteTimeDomainData` into `Uint8Array`.
*   **RMS Calculation:** Per-frame RMS computed as `sqrt(mean((sample[i] - 128)^2))`.

### 3.2 Detection Algorithm (Sustained-Energy)

The detector uses a **sustained-above-threshold** approach rather than peak detection, treating a breath as a continuous broadband energy elevation lasting several hundred milliseconds.

#### 3.2.1 Floor Tracking
A rolling noise-floor EMA tracks the ambient baseline:
```
α = 0.001 (0.1% per frame)
floor(0) = first RMS value
floor(t) = floor(t-1) * 0.999 + rms(t) * 0.001   [when rms < floor * 1.5]
```
The tight 1.5x guard prevents breath energy from leaking into the baseline. Safety fallback reinitializes floor if it drops below 0.01 or exceeds 100 after 120 frames.

#### 3.2.2 Threshold
```
threshold = max(floor * 1.5, floor + 0.3)
```
The absolute 0.3 minimum ensures threshold remains meaningful when floor is very low.

#### 3.2.3 Breath Onset
Requires RMS to stay **above threshold for 25 consecutive frames** (~400ms at 60fps) before confirming a breath. Brief spikes shorter than this duration are rejected.

#### 3.2.4 Breath Offset
Once a breath is confirmed (`breathActive = true`), it remains active until RMS stays **below threshold for 15 consecutive frames** (~250ms), signaling the breath has ended.

#### 3.2.5 Refractory Period
A **1500ms cooldown** after confirmation prevents re-detection during a single breath's energy envelope. During refractory, the below-threshold exit counter still runs so the breath can end properly.

#### 3.2.6 BPM Calculation
Maintains a rolling array of the **last 5 breath intervals**. Average interval is divided into 60,000ms: `BPM = 60000 / avgInterval`. BPM returns `null` if no breaths detected, or if more than 10 seconds have elapsed since the last breath.

#### 3.2.7 Constants
| Constant | Value | Purpose |
|---|---|---|
| `RING_SIZE` | 300 | Internal ring buffer size |
| `REFRACTORY_MS` | 1500 | Cooldown between breaths |
| `MIN_BREATH_FRAMES` | 25 | Minimum sustained frames for onset |
| `OFF_FRAMES` | 15 | Below-threshold frames to end breath |
| `THRESHOLD_MULTIPLIER` | 1.5 | RMS must exceed floor × multiplier |
| `ROLLING_WINDOW` | 5 | Number of intervals for BPM average |
| `STALENESS_MS` | 10000 | Max gap before BPM returns null |

### 3.3 Component Hierarchy
```
App
├── EnvelopeVisualizer (canvas + stats bar)
│   └── Real-time RMS waveform, floor threshold line, breath span highlights
└── Recording controls (Record/Stop, Download JSON, Download WebM)
```

### 3.4 Data Flow
```
AudioManager          BreathDetector           useBreathMonitor          App / EnvelopeVisualizer
  │                        │                        │                        │
  │  Uint8Array            │  rmsEnergy             │  bpm, rmsEnergy,       │  bpm display
  ├───────────────────────►├───────────────────────►│  floor, pulseDetected, ├► floor threshold
  │  getTimeDomainData()   │  update(rms, t)        │  breathCount,          │  waveform
  │  getStream()           │  returns DetectorResult│  calibration,          │  breath spans
  │                        │                        │  isRecording,          │  recording UI
  │                        │                        │  breathFrameCounter    │
```

### 3.5 State Types
```typescript
interface DetectorResult {
  bpm: number | null;
  rmsEnergy: number;
  pulseDetected: boolean;
  calibration: CalibrationState;
  breathCount: number;
  floor: number;
}

interface CalibrationState {
  calibratedMagnitude: number;   // peak RMS of last confirmed breath
  floor: number;                 // current ambient noise floor
  peakCount: number;             // total breaths confirmed this session
  initialized: boolean;          // true after first breath
}
```

## 4. User Interface Requirements

### 4.1 Visual Design
*   Dark theme: `#121212` background, `#1e1e1e` UI elements
*   Tabular-numeric typography for all numeric displays
*   Breath detected label: `#888` normal, high-contrast on event

### 4.2 BPM Display
*   Large `8rem` value in `#4fc3f7` with `2rem` "BPM" label
*   Shows `--` when no data available

### 4.3 Envelope Visualizer (Canvas)
*   **Waveform:** Real-time RMS trace rendered as a `#4fc3f7` stroke on dark canvas
*   **Auto-scaling Y-axis:** Ceiling tracks visible peak with 70% EMA, minimum ceiling 1.0
*   **Floor threshold line:** Orange (`#ff9800`) dashed line at `floor / scale` height
*   **Breath span highlights:** Translucent green (`rgba(74, 222, 128, 0.07)`) bands spanning ~30 frames back from each detection point, with border strokes at edges
*   **Grid lines:** 4 horizontal guide lines at quarter divisions, `rgba(255, 255, 255, 0.05)`
*   **Stats bar:** `floor`, `mag` (peak RMS, shown after first breath), `peaks`, `breaths` counts

### 4.4 Application States
| State | Label |
|---|---|
| `idle` | Ready |
| `requesting` | Requesting microphone access... |
| `monitoring` | Monitoring audio stream... |
| `monitoring` + `pulseDetected` | Breath detected |
| `monitoring` + `isRecording` | Recording... |
| `error` | Microphone access denied. Please allow microphone access and try again. |

### 4.5 Controls
*   **Start/Stop Monitoring:** Single toggle button. Red background when active.
*   **Record Session:** Starts MediaRecorder + RMS log capture. Pulses red while recording.
*   **Stop Recording:** Ends recording, enables download buttons.
*   **Download Log (JSON):** Exports frame-level RMS data and breath events.
*   **Download Audio (WebM):** Exports raw microphone audio.

## 5. Session Recording

### 5.1 Raw Audio
*   `MediaRecorder` captures the microphone stream in WebM format with 1-second chunks
*   Stream sourced from `AudioManager.getStream()` (same stream feeding the audio graph)

### 5.2 RMS Log (JSON)
```json
{
  "version": 1,
  "recordedAt": "ISO-8601 timestamp",
  "durationSec": 43.5,
  "rmsLog": [
    { "t": 0, "rms": 0.68, "floor": 0.69, "breath": false },
    ...
  ],
  "breaths": [
    { "t": 16268, "peakMag": 9.4, "bpm": 48 },
    ...
  ]
}
```
*   `t`: milliseconds since recording started
*   `rms`: current RMS energy
*   `floor`: current noise floor
*   `breath`: true if this frame triggered a breath detection
*   Breath events recorded at the frame of detection with peak magnitude and current BPM

## 6. Testing

### 6.1 Unit Tests (Vitest)
`BreathDetector.test.ts` — 10 tests covering:
*   Floor initialization from ambient noise
*   Sustained elevation detection (≥25 frames)
*   Brief spike rejection (<25 frames)
*   Baseline noise rejection (below threshold)
*   Single-breath refractory (no double-counting)
*   Refractory cooldown between separate breaths
*   Post-refractory detection
*   BPM null before first breath
*   BPM computation from breath intervals
*   Reset clearing all state

### 6.2 E2E Tests (Playwright)
*   Browser permission fixtures for microphone access
*   Full user flow: load → request permission → start monitoring → detect breaths → stop

## 7. Deployment
*   Build: `tsc -b && vite build` produces static bundle in `dist/`
*   Output: `dist/index.html`, `dist/assets/index-*.js` (~207KB), `dist/assets/index-*.css` (~2.4KB)
*   Deploy target: Vercel (static site)
*   CI/CD: GitHub Actions
