# Project Specification: Respiratory Rate Monitor

## 1. Executive Summary
This project is a lightweight, browser-based application designed to continuously monitor and calculate the resting respiratory rate (BPM) of a senior Pomeranian mix named Willow. By utilizing local microphone input and the browser's native Web Audio API, the application filters ambient noise to isolate low-frequency breath patterns and automatically calculates the rolling average of breaths per minute.

## 2. Technical Stack
*   **Frontend Framework:** React
*   **Language:** TypeScript
*   **Build Tool:** Vite
*   **Audio Processing:** Web Audio API (`AudioContext`, `AnalyserNode`, `BiquadFilterNode`)
*   **Testing:** Playwright (utilizing browser permission fixtures)
*   **CI/CD & Deployment:** GitHub Actions integrated with Vercel

## 3. Core Architecture
### 3.1 Audio Processing Pipeline
*   **Capture:** `navigator.mediaDevices.getUserMedia` for real-time audio buffer access.
*   **Filtering:** `BiquadFilterNode` configured as a `lowpass` filter at 150Hz to isolate the specific acoustic signature of the subject's resting breath rumble while rejecting high-frequency ambient noise.
*   **Analysis:** `AnalyserNode` with an `fftSize` of 2048 to extract frequency data into a `Uint8Array`.

### 3.2 Detection Algorithm
*   **Thresholding:** Continuously sample the lowest 5 frequency bins. Trigger an event when the average amplitude crosses a predefined energy threshold (e.g., > 180).
*   **Debouncing:** Implement a strict 1.5-second cooldown after a positive detection to prevent a single, prolonged breath from registering as multiple events.
*   **Calculation:** Maintain a rolling array of the last 5 breath intervals. Calculate the average interval in seconds, then convert to BPM using the formula `60 / Average Interval`.

## 4. User Interface Requirements
*   **Visual Design:** High-contrast, dark-themed UI (#121212 background) to minimize ambient screen glare during low-light/nighttime monitoring.
*   **Typography:** Large, easily readable tabular numerals for the BPM display.
*   **State Management:** Clear indicators for application states: "Ready", "Requesting microphone access...", "Monitoring audio stream...", and "Pulse detected".
*   **Controls:** A single, prominent toggle button for starting and stopping the monitoring session.

## 5. Development Phases
### Phase 1: Scaffold & Permissions
*   Initialize Vite React-TS project.
*   Implement microphone access requests and handle denial states gracefully.

### Phase 2: Audio Graph & DSP
*   Construct the Web Audio API graph (`Source -> Filter -> Analyser`).
*   Implement the `requestAnimationFrame` loop for continuous spectral analysis.

### Phase 3: Algorithm & UI Integration
*   Tune the low-pass filter and amplitude thresholds against live acoustic tests.
*   Implement the debouncing and rolling average math.
*   Connect the state to the React UI components.

### Phase 4: Deployment
*   Write Playwright E2E spec files utilizing `{ permissions: ['microphone'] }`.
*   Configure GitHub Actions workflow.
*   Deploy static bundle to Vercel.
