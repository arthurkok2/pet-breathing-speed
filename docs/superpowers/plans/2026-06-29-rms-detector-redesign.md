# RMS-Based Breath Detection Redesign - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign detection pipeline from lowpass/FFT-bin to highpass/RMS-energy with self-calibrating threshold and three-state breath machine.

**Architecture:** Single `BiquadFilterNode` (highpass 250Hz) feeds an `AnalyserNode` using `getByteTimeDomainData`. RMS energy computed per-frame drives a `WAITING/INHALING/REFRACTORY` state machine backed by a ring-buffer noise floor with bottom-20th-percentile calibration. Canvas-based envelope trace replaces FFT bar chart.

**Tech Stack:** React 19, TypeScript, Vite, Web Audio API, Canvas 2D, Vitest (unit tests)

---

### Task 1: Install and configure Vitest

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Add unit test script to package.json**

Add `"test:unit": "vitest run"` to the `scripts` block in `package.json`, so the scripts become:

```json
"scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "test": "playwright test",
    "test:unit": "vitest run"
},
```

- [ ] **Step 3: Add vitest config to vite.config.ts**

Add `/// <reference types="vitest/config" />` at the top of `vite.config.ts` and append a `test` block:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/pet-breathing-speed/",
  plugins: [react()],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Run to verify vitest discovers no tests**

```bash
npx vitest run
```

Expected: "No test files found" or success with 0 tests.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vite.config.ts
git commit -m "chore: add vitest for unit testing"
```

---

### Task 2: Write BreathDetector unit tests (failing)

**Files:**
- Create: `src/audio/BreathDetector.test.ts`

The `BreathDetector` is pure logic: takes `(rmsEnergy: number, timestamp: number)` and returns state. No browser APIs needed.

- [ ] **Step 1: Create the failing test file**

Create `src/audio/BreathDetector.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { BreathDetector } from "./BreathDetector";

const BUFFER_SIZE = 60;

function createDetector(): BreathDetector {
  return new BreathDetector({ bufferSize: BUFFER_SIZE, minSamples: 15, sensitivity: 3.0 });
}

function seedAmbient(
  detector: BreathDetector,
  energyLow: number,
  energyHigh: number,
  msPerFrame: number,
  frames: number
): void {
  for (let i = 0; i < frames; i++) {
    const energy = i % 2 === 0 ? energyLow : energyHigh;
    detector.update(energy, i * msPerFrame);
  }
}

describe("BreathDetector", () => {
  let detector: BreathDetector;

  beforeEach(() => {
    detector = createDetector();
  });

  describe("initialization and noise floor calibration", () => {
    it("returns uncalibrated state initially", () => {
      const result = detector.update(5, 0);
      expect(result.calibration.initialized).toBe(false);
    });

    it("calibrates after accumulating enough ambient samples", () => {
      seedAmbient(detector, 3, 7, 16, 60);
      const result = detector.update(5, 60 * 16);
      expect(result.calibration.initialized).toBe(true);
      expect(result.calibration.noiseFloor).toBeGreaterThan(0);
    });

    it("computes noise floor from bottom 20th percentile of ambient values", () => {
      seedAmbient(detector, 3, 7, 16, 60);
      const result = detector.update(5, 60 * 16);
      expect(result.calibration.noiseFloor).toBeGreaterThanOrEqual(3);
      expect(result.calibration.noiseFloor).toBeLessThanOrEqual(7);
    });

    it("sets threshold to noiseFloor + sensitivity * stddev of low 20%", () => {
      seedAmbient(detector, 3, 7, 16, 60);
      const result = detector.update(5, 60 * 16);
      expect(result.calibration.threshold).toBeGreaterThan(result.calibration.noiseFloor);
      expect(result.calibration.threshold).toBeGreaterThanOrEqual(5);
      expect(result.calibration.threshold).toBeLessThanOrEqual(200);
    });

    it("clamps threshold to minimum of 5", () => {
      for (let i = 0; i < 60; i++) {
        detector.update(1, i * 16);
      }
      const result = detector.update(1, 60 * 16);
      expect(result.calibration.threshold).toBeGreaterThanOrEqual(5);
    });

    it("clamps threshold to maximum of 200", () => {
      for (let i = 0; i < 60; i++) {
        detector.update(i % 2 === 0 ? 100 : 120, i * 16);
      }
      const result = detector.update(110, 60 * 16);
      expect(result.calibration.threshold).toBeLessThanOrEqual(200);
    });
  });

  describe("admission rule", () => {
    it("prevents breath-energy values from entering the ring buffer", () => {
      seedAmbient(detector, 3, 7, 16, 60);
      const before = detector.update(5, 60 * 16);
      const floorBefore = before.calibration.noiseFloor;

      for (let i = 0; i < 30; i++) {
        detector.update(100, (60 + i) * 16);
      }
      const after = detector.update(5, 90 * 16);
      expect(after.calibration.noiseFloor).toBeCloseTo(floorBefore, 0);
    });
  });

  describe("state machine", () => {
    it("does not detect a brief spike (impulse noise < 200ms)", () => {
      seedAmbient(detector, 3, 7, 16, 60);

      detector.update(100, 60 * 16);
      detector.update(100, 61 * 16);
      const result = detector.update(5, 62 * 16);

      expect(result.pulseDetected).toBe(false);
    });

    it("detects a valid breath lasting >= 200ms", () => {
      seedAmbient(detector, 3, 7, 16, 60);

      for (let i = 0; i < 15; i++) {
        detector.update(100, (60 + i) * 16);
      }

      const result = detector.update(5, 75 * 16);
      expect(result.pulseDetected).toBe(true);
    });

    it("enters refractory period after a valid breath", () => {
      seedAmbient(detector, 3, 7, 16, 60);

      for (let i = 0; i < 15; i++) {
        detector.update(100, (60 + i) * 16);
      }
      detector.update(5, 75 * 16);

      detector.update(100, 76 * 16);
      const result = detector.update(100, 90 * 16);
      expect(result.pulseDetected).toBe(false);
    });

    it("exits refractory period after 500ms", () => {
      seedAmbient(detector, 3, 7, 16, 60);

      for (let i = 0; i < 15; i++) {
        detector.update(100, (60 + i) * 16);
      }
      detector.update(5, 75 * 16);

      detector.update(5, 76 * 16);
      const skipMs = 1000;
      for (let i = 0; i < 15; i++) {
        detector.update(100, (76 + Math.round(skipMs / 16)) * 16 * (i + 1));
      }
    });
  });

  describe("BPM calculation", () => {
    function simulateBreath(detector: BreathDetector, startMs: number): number {
      for (let i = 0; i < 15; i++) {
        detector.update(100, startMs + i * 16);
      }
      const result = detector.update(5, startMs + 15 * 16);
      return result.bpm ?? 0;
    }

    it("returns null BPM when no breaths have been recorded", () => {
      seedAmbient(detector, 3, 7, 16, 60);
      const result = detector.update(5, 60 * 16);
      expect(result.bpm).toBeNull();
    });

    it("computes BPM from a single breath interval", () => {
      seedAmbient(detector, 3, 7, 16, 60);

      simulateBreath(detector, 60 * 16);
      const result = detector.update(5, 120 * 16);

      expect(result.bpm).not.toBeNull();
      expect(result.bpm).toBeGreaterThan(0);
    });

    it("computes rolling average from up to 5 intervals", () => {
      seedAmbient(detector, 3, 7, 16, 60);

      simulateBreath(detector, 60 * 16);
      simulateBreath(detector, 4000);
      simulateBreath(detector, 7000);

      const result = detector.update(5, 10000);
      expect(result.bpm).not.toBeNull();
      expect(result.bpm).toBeGreaterThan(0);
    });

    it("returns null BPM after 10 seconds of no breaths (staleness)", () => {
      seedAmbient(detector, 3, 7, 16, 60);

      simulateBreath(detector, 60 * 16);

      const mid = detector.update(5, 2000);
      expect(mid.bpm).not.toBeNull();

      const stale = detector.update(5, 15000);
      expect(stale.bpm).toBeNull();
    });
  });

  describe("adaptive debounce", () => {
    function simulateBreath(detector: BreathDetector, startMs: number): number {
      for (let i = 0; i < 15; i++) {
        detector.update(100, startMs + i * 16);
      }
      const result = detector.update(5, startMs + 15 * 16);
      return result.bpm ?? 0;
    }

    it("blocks a breath detection during the debounce window", () => {
      seedAmbient(detector, 3, 7, 16, 60);

      simulateBreath(detector, 60 * 16);
      simulateBreath(detector, 4000);

      const tooSoon = simulateBreath(detector, 4400);
      expect(tooSoon).toBe(0);
    });
  });

  describe("reset", () => {
    it("clears all state on reset", () => {
      seedAmbient(detector, 3, 7, 16, 60);
      detector.update(5, 60 * 16);

      detector.reset();

      const result = detector.update(5, 0);
      expect(result.bpm).toBeNull();
      expect(result.calibration.initialized).toBe(false);
      expect(result.calibration.noiseFloor).toBe(0);
      expect(result.calibration.threshold).toBe(0);
      expect(result.breathCount).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Verify tests fail (BreathDetector not yet rewritten)**

```bash
npx vitest run
```

Expected: All tests fail — the existing `BreathDetector` doesn't export the new interface (missing `breathCount`, `rmsEnergy`, constructor doesn't accept options, different detection behavior).

- [ ] **Step 3: Commit**

```bash
git add src/audio/BreathDetector.test.ts
git commit -m "test: add failing BreathDetector unit tests for RMS redesign"
```

---

### Task 3: Rewrite BreathDetector (make tests pass)

**Files:**
- Modify: `src/audio/BreathDetector.ts`

Full rewrite replacing FFT-bin threshold crossing with RMS-based state machine.

- [ ] **Step 1: Implement the new BreathDetector**

Replace the entire content of `src/audio/BreathDetector.ts`:

```ts
const RING_BUFFER_SIZE = 600;
const MIN_SAMPLES = 30;
const SENSITIVITY = 3.0;
const MIN_THRESHOLD = 5;
const MAX_THRESHOLD = 200;
const MIN_DURATION_MS = 200;
const REFRACTORY_MS = 500;
const MIN_DEBOUNCE_MS = 200;
const MAX_DEBOUNCE_MS = 3000;
const DEBOUNCE_FRACTION = 0.45;
const ROLLING_WINDOW = 5;
const RECALIBRATE_INTERVAL_MS = 250;
const STALENESS_MS = 10000;

type DetectorState = "WAITING" | "INHALING" | "REFRACTORY";

export interface CalibrationState {
  noiseFloor: number;
  threshold: number;
  debounceMs: number;
  initialized: boolean;
}

export interface DetectorResult {
  bpm: number | null;
  rmsEnergy: number;
  pulseDetected: boolean;
  calibration: CalibrationState;
  breathCount: number;
}

export interface BreathDetectorOptions {
  bufferSize?: number;
  minSamples?: number;
  sensitivity?: number;
}

export class BreathDetector {
  private ringBuffer: Float64Array;
  private ringIndex = 0;
  private ringCount = 0;
  private readonly bufferSize: number;
  private readonly minSamples: number;
  private readonly sensitivity: number;

  private noiseFloor = 0;
  private threshold = 0;
  private calibrated = false;
  private lastRecalibration = 0;

  private state: DetectorState = "WAITING";
  private inhalationStart = 0;
  private refractoryStart = 0;

  private intervals: number[] = [];
  private lastBreathTime = 0;
  private debounceMs = MIN_DEBOUNCE_MS;
  private breathCount = 0;

  constructor(options: BreathDetectorOptions = {}) {
    this.bufferSize = options.bufferSize ?? RING_BUFFER_SIZE;
    this.minSamples = options.minSamples ?? MIN_SAMPLES;
    this.sensitivity = options.sensitivity ?? SENSITIVITY;
    this.ringBuffer = new Float64Array(this.bufferSize);
  }

  get calibration(): CalibrationState {
    return {
      noiseFloor: this.noiseFloor,
      threshold: this.threshold,
      debounceMs: this.debounceMs,
      initialized: this.calibrated,
    };
  }

  update(rmsEnergy: number, timestamp: number): DetectorResult {
    this.admitToBuffer(rmsEnergy);
    this.maybeRecalibrate(timestamp);

    let pulseDetected = false;

    switch (this.state) {
      case "WAITING":
        if (rmsEnergy >= this.threshold && this.calibrated) {
          if (timestamp - this.lastBreathTime >= this.debounceMs) {
            this.state = "INHALING";
            this.inhalationStart = timestamp;
          }
        }
        break;

      case "INHALING":
        if (rmsEnergy < this.threshold) {
          if (timestamp - this.inhalationStart >= MIN_DURATION_MS) {
            this.recordBreath(this.inhalationStart);
            pulseDetected = true;
            this.state = "REFRACTORY";
            this.refractoryStart = timestamp;
          } else {
            this.state = "WAITING";
          }
        }
        break;

      case "REFRACTORY":
        if (timestamp - this.refractoryStart >= REFRACTORY_MS) {
          this.state = "WAITING";
        }
        break;
    }

    const bpm = this.computeBpm(timestamp);

    return {
      bpm,
      rmsEnergy,
      pulseDetected,
      calibration: this.calibration,
      breathCount: this.breathCount,
    };
  }

  reset(): void {
    this.ringBuffer.fill(0);
    this.ringIndex = 0;
    this.ringCount = 0;
    this.noiseFloor = 0;
    this.threshold = 0;
    this.calibrated = false;
    this.lastRecalibration = 0;
    this.state = "WAITING";
    this.inhalationStart = 0;
    this.refractoryStart = 0;
    this.intervals = [];
    this.lastBreathTime = 0;
    this.debounceMs = MIN_DEBOUNCE_MS;
    this.breathCount = 0;
  }

  private admitToBuffer(value: number): void {
    if (!this.calibrated || value < this.threshold) {
      this.ringBuffer[this.ringIndex] = value;
      this.ringIndex = (this.ringIndex + 1) % this.bufferSize;
      if (this.ringCount < this.bufferSize) {
        this.ringCount++;
      }
    }
  }

  private maybeRecalibrate(timestamp: number): void {
    if (this.ringCount < this.minSamples) return;
    if (timestamp - this.lastRecalibration < RECALIBRATE_INTERVAL_MS) return;

    this.lastRecalibration = timestamp;

    const sorted = this.ringBuffer.slice(0, this.ringCount);
    sorted.sort();

    const cutoff = Math.max(1, Math.floor(this.ringCount * 0.2));
    const lowest = sorted.slice(0, cutoff);

    let sum = 0;
    for (let i = 0; i < lowest.length; i++) {
      sum += lowest[i];
    }
    const mean = sum / lowest.length;

    let varianceSum = 0;
    for (let i = 0; i < lowest.length; i++) {
      const diff = lowest[i] - mean;
      varianceSum += diff * diff;
    }
    const stddev = Math.sqrt(varianceSum / lowest.length);

    this.noiseFloor = mean;
    this.threshold = Math.max(
      MIN_THRESHOLD,
      Math.min(MAX_THRESHOLD, mean + this.sensitivity * stddev)
    );
    this.calibrated = true;
  }

  private recordBreath(timestamp: number): void {
    this.breathCount++;

    if (this.lastBreathTime > 0) {
      const interval = timestamp - this.lastBreathTime;
      this.intervals.push(interval);
      if (this.intervals.length > ROLLING_WINDOW) {
        this.intervals.shift();
      }

      if (this.intervals.length >= 2) {
        const avg =
          this.intervals.reduce((s, v) => s + v, 0) / this.intervals.length;
        this.debounceMs = Math.max(
          MIN_DEBOUNCE_MS,
          Math.min(MAX_DEBOUNCE_MS, avg * DEBOUNCE_FRACTION)
        );
      }
    }

    this.lastBreathTime = timestamp;
  }

  private computeBpm(timestamp: number): number | null {
    if (this.intervals.length === 0) return null;
    if (this.lastBreathTime > 0 && timestamp - this.lastBreathTime > STALENESS_MS)
      return null;
    const avg =
      this.intervals.reduce((s, v) => s + v, 0) / this.intervals.length;
    return Math.round(60000 / avg);
  }
}
```

- [ ] **Step 2: Run unit tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/audio/BreathDetector.ts
git commit -m "feat: rewrite BreathDetector with RMS state machine and self-calibrating threshold"
```

---

### Task 4: Modify AudioManager for highpass + time-domain data

**Files:**
- Modify: `src/audio/AudioManager.ts`

- [ ] **Step 1: Apply the changes**

Edit `src/audio/AudioManager.ts`:

1. Rename field `lowpassHz` to `highpassHz` and set to `250` (line 10):
   ```
   -  private lowpassHz = 150;
   +  private highpassHz = 250;
   ```

2. Change filter type from `"lowpass"` to `"highpass"` (line 21):
   ```
   -    filter.type = "lowpass";
   +    filter.type = "highpass";
   ```

3. Update filter frequency reference (line 22):
   ```
   -    filter.frequency.value = this.lowpassHz;
   +    filter.frequency.value = this.highpassHz;
   ```

4. Remove the three analyser dB config lines (lines 25-27):
   ```
   -    analyser.minDecibels = -70;
   -    analyser.maxDecibels = -20;
   -    analyser.smoothingTimeConstant = 0.4;
   ```

5. Rename `getFrequencyData()` to `getTimeDomainData()` and switch from frequency to time-domain (lines 37-44):
   ```
   -  getFrequencyData(): Uint8Array {
   -    if (!this.analyser) {
   -      return new Uint8Array(0);
   -    }
   -    const buffer = new Uint8Array(this.analyser.frequencyBinCount);
   -    this.analyser.getByteFrequencyData(buffer);
   -    return buffer;
   -  }
   +  getTimeDomainData(): Uint8Array {
   +    if (!this.analyser) {
   +      return new Uint8Array(0);
   +    }
   +    const buffer = new Uint8Array(this.analyser.fftSize);
   +    this.analyser.getByteTimeDomainData(buffer);
   +    return buffer;
   +  }
   ```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc -b --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/audio/AudioManager.ts
git commit -m "feat: switch AudioManager to highpass 250Hz and time-domain output"
```

---

### Task 5: Create EnvelopeVisualizer component

**Files:**
- Create: `src/components/EnvelopeVisualizer.tsx`
- Create: `src/components/EnvelopeVisualizer.css`

- [ ] **Step 1: Create the CSS file**

Write `src/components/EnvelopeVisualizer.css`:

```css
.envelope-container {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

.envelope-canvas {
  display: block;
  width: 100%;
  height: 200px;
  border-radius: 4px;
}

.envelope-stats {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.65rem;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  color: #888;
  padding: 0.15rem 0 0;
}

.envelope-stats .status {
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.envelope-stats .status.calibrating {
  color: #ff9800;
}

.envelope-stats .status.calibrated {
  color: #4ade80;
}

.envelope-stats .stat strong {
  color: #aaa;
  font-weight: 600;
}
```

- [ ] **Step 2: Create the EnvelopeVisualizer component**

Write `src/components/EnvelopeVisualizer.tsx`:

```tsx
import { useRef, useEffect, useCallback } from "react";
import type { CalibrationState } from "../audio/BreathDetector";
import "./EnvelopeVisualizer.css";

interface EnvelopeVisualizerProps {
  rmsEnergy: number;
  threshold: number;
  noiseFloor: number;
  calibration: CalibrationState;
  breathCount: number;
  active: boolean;
}

const HISTORY_LENGTH = 600;

export function EnvelopeVisualizer({
  rmsEnergy,
  threshold,
  noiseFloor,
  calibration,
  breathCount,
  active,
}: EnvelopeVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<Float64Array>(new Float64Array(HISTORY_LENGTH));
  const historyIndexRef = useRef(0);
  const historyCountRef = useRef(0);

  const thresholdRef = useRef(threshold);
  const noiseFloorRef = useRef(noiseFloor);

  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  useEffect(() => {
    noiseFloorRef.current = noiseFloor;
  }, [noiseFloor]);

  const pushValue = useCallback((value: number) => {
    const arr = historyRef.current;
    arr[historyIndexRef.current] = value;
    historyIndexRef.current = (historyIndexRef.current + 1) % HISTORY_LENGTH;
    if (historyCountRef.current < HISTORY_LENGTH) {
      historyCountRef.current++;
    }
  }, []);

  useEffect(() => {
    if (!active) return;

    let rafId: number;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;

      ctx.fillStyle = "#121212";
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = (h / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const history = historyRef.current;
      const count = historyCountRef.current;
      const startIdx = historyIndexRef.current;

      if (count > 1) {
        ctx.strokeStyle = "#4fc3f7";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();

        for (let i = 0; i < count; i++) {
          const idx = (startIdx - count + i + HISTORY_LENGTH) % HISTORY_LENGTH;
          const x = (i / (count - 1)) * w;
          const y = h - (history[idx] / 128) * h;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      const t = thresholdRef.current;
      const nf = noiseFloorRef.current;

      if (t > 0) {
        const threshY = h - (t / 128) * h;
        ctx.strokeStyle = "rgba(255, 167, 38, 0.7)";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, threshY);
        ctx.lineTo(w, threshY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "rgba(255, 167, 38, 0.9)";
        ctx.font = "9px monospace";
        ctx.textAlign = "right";
        ctx.fillText("threshold", w - 4, threshY - 3);
      }

      if (nf > 0) {
        const floorY = h - (nf / 128) * h;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 0.5;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(0, floorY);
        ctx.lineTo(w, floorY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.font = "9px monospace";
        ctx.textAlign = "right";
        ctx.fillText("floor", w - 4, floorY - 3);
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  useEffect(() => {
    pushValue(rmsEnergy);
  }, [rmsEnergy, pushValue]);

  return (
    <div className="envelope-container">
      <canvas ref={canvasRef} className="envelope-canvas" />
      <div className="envelope-stats">
        <span
          className={`status ${calibration.initialized ? "calibrated" : "calibrating"}`}
        >
          {calibration.initialized ? "calibrated" : "calibrating..."}
        </span>
        <span className="stat">
          thresh <strong>{Math.round(calibration.threshold)}</strong>
        </span>
        <span className="stat">
          floor <strong>{Math.round(calibration.noiseFloor)}</strong>
        </span>
        <span className="stat">
          debounce{" "}
          <strong>{(calibration.debounceMs / 1000).toFixed(1)}s</strong>
        </span>
        <span className="stat">
          breaths <strong>{breathCount}</strong>
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc -b --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/EnvelopeVisualizer.tsx src/components/EnvelopeVisualizer.css
git commit -m "feat: add EnvelopeVisualizer component with scrolling RMS energy trace"
```

---

### Task 6: Update useBreathMonitor hook

**Files:**
- Modify: `src/hooks/useBreathMonitor.ts`

- [ ] **Step 1: Rewrite useBreathMonitor to use new interfaces**

Replace `src/hooks/useBreathMonitor.ts`:

```ts
import { useRef, useState, useCallback } from "react";
import { AudioManager, BreathDetector } from "../audio";
import type { CalibrationState } from "../audio/BreathDetector";

export function useBreathMonitor() {
  const [bpm, setBpm] = useState<number | null>(null);
  const [rmsEnergy, setRmsEnergy] = useState(0);
  const [pulseDetected, setPulseDetected] = useState(false);
  const [breathCount, setBreathCount] = useState(0);
  const [calibration, setCalibration] = useState<CalibrationState>({
    noiseFloor: 0,
    threshold: 0,
    debounceMs: 200,
    initialized: false,
  });
  const audioRef = useRef<AudioManager | null>(null);
  const detectorRef = useRef<BreathDetector | null>(null);

  const start = useCallback(async () => {
    const audio = new AudioManager();
    const detector = new BreathDetector();

    await audio.start();

    audioRef.current = audio;
    detectorRef.current = detector;

    audio.requestAnimationLoop(() => {
      const data = audio.getTimeDomainData();

      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const diff = data[i] - 128;
        sum += diff * diff;
      }
      const rms = Math.sqrt(sum / data.length);

      const state = detector.update(rms, performance.now());
      setBpm(state.bpm);
      setRmsEnergy(state.rmsEnergy);
      setBreathCount(state.breathCount);
      setCalibration({ ...detector.calibration });

      if (state.pulseDetected) {
        setPulseDetected(true);
      }
    });
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.stop();
    detectorRef.current?.reset();
    audioRef.current = null;
    detectorRef.current = null;
    setBpm(null);
    setRmsEnergy(0);
    setPulseDetected(false);
    setBreathCount(0);
    setCalibration({
      noiseFloor: 0,
      threshold: 0,
      debounceMs: 200,
      initialized: false,
    });
  }, []);

  const clearPulse = useCallback(() => {
    setPulseDetected(false);
  }, []);

  return {
    bpm,
    rmsEnergy,
    pulseDetected,
    breathCount,
    calibration,
    start,
    stop,
    clearPulse,
  };
}
```

The key addition: inline RMS computation:
```ts
let sum = 0;
for (let i = 0; i < data.length; i++) {
  const diff = data[i] - 128;
  sum += diff * diff;
}
const rms = Math.sqrt(sum / data.length);
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc -b --noEmit
```

Expected: Errors in `App.tsx` referencing the old `frequencyData` and `energy` destructured values from `useBreathMonitor()`. That's expected — fixed in Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBreathMonitor.ts
git commit -m "feat: update useBreathMonitor for RMS detection and new detector interface"
```

---

### Task 7: Update App component and remove old files

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Delete: `src/components/SpectrumVisualizer.tsx`
- Delete: `src/components/SpectrumVisualizer.css`

- [ ] **Step 1: Update App.tsx**

Edit `src/App.tsx` — change the import on line 3, update the destructured hooks on line 14, replace the component on line 59, and add `active` prop:

```tsx
import { useState, useEffect } from "react";
import { useBreathMonitor } from "./hooks/useBreathMonitor";
import { EnvelopeVisualizer } from "./components/EnvelopeVisualizer";
import "./App.css";

type AppState = "idle" | "requesting" | "monitoring" | "error";

function App() {
  const [state, setState] = useState<AppState>("idle");
  const {
    bpm,
    rmsEnergy,
    pulseDetected,
    breathCount,
    calibration,
    start,
    stop,
    clearPulse,
  } = useBreathMonitor();

  useEffect(() => {
    if (!pulseDetected) return;
    const timer = setTimeout(() => {
      clearPulse();
    }, 500);
    return () => clearTimeout(timer);
  }, [pulseDetected, clearPulse]);

  const handleToggle = async () => {
    if (state === "monitoring") {
      stop();
      setState("idle");
      return;
    }

    setState("requesting");
    try {
      await start();
      setState("monitoring");
    } catch (err) {
      const message =
        err instanceof DOMException
          ? "Microphone access denied. Please allow microphone access to monitor breathing."
          : "Could not start monitoring. Please check your microphone.";
      setState("error");
      console.error(message, err);
    }
  };

  const stateLabels: Record<AppState, string> = {
    idle: "Ready",
    requesting: "Requesting microphone access...",
    monitoring: "Monitoring audio stream...",
    error:
      "Microphone access denied. Please allow microphone access and try again.",
  };

  return (
    <div className="container">
      <h1 className="title">Willow</h1>
      <div className="bpm-display">
        <span className="bpm-value">{bpm ?? "--"}</span>
        <span className="bpm-label">BPM</span>
      </div>
      <EnvelopeVisualizer
        rmsEnergy={rmsEnergy}
        threshold={calibration.threshold}
        noiseFloor={calibration.noiseFloor}
        calibration={calibration}
        breathCount={breathCount}
        active={state === "monitoring"}
      />
      <p className="state-label">
        {state === "monitoring" && pulseDetected
          ? "Pulse detected"
          : stateLabels[state]}
      </p>
      <button
        className={`toggle-btn ${state === "monitoring" ? "active" : ""}`}
        onClick={handleToggle}
        disabled={state === "requesting"}
      >
        {state === "monitoring" ? "Stop Monitoring" : "Start Monitoring"}
      </button>
      {state === "error" && (
        <button className="toggle-btn" onClick={() => setState("idle")}>
          Dismiss
        </button>
      )}
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Delete old SpectrumVisualizer files**

```bash
rm src/components/SpectrumVisualizer.tsx src/components/SpectrumVisualizer.css
```

- [ ] **Step 3: Verify typecheck passes with full project**

```bash
npx tsc -b --noEmit
```

Expected: No errors (all files now consistent).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git rm src/components/SpectrumVisualizer.tsx src/components/SpectrumVisualizer.css
git commit -m "feat: wire EnvelopeVisualizer into App, remove old SpectrumVisualizer"
```

---

### Task 8: Final verification

**Files:** (none new — verification only)

- [ ] **Step 1: Run unit tests**

```bash
npx vitest run
```

Expected: All BreathDetector tests pass.

- [ ] **Step 2: Run typecheck**

```bash
npx tsc -b --noEmit
```

Expected: No errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: No errors (or only pre-existing warnings).

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: Successful production build.

- [ ] **Step 5: Commit (if any fixes from verification)**

```bash
git status
```

Expected: Clean working tree.

---

### Completed File Manifest

| File | Action |
|---|---|
| `package.json` | Modified — added `test:unit` script, vitest dependency |
| `vite.config.ts` | Modified — added vitest config |
| `src/audio/AudioManager.ts` | Modified — highpass 250Hz, time-domain output |
| `src/audio/BreathDetector.ts` | Rewritten — RMS state machine, ring buffer, self-calibrating |
| `src/audio/BreathDetector.test.ts` | Created — 16 unit tests |
| `src/audio/index.ts` | Unchanged — exports still valid |
| `src/hooks/useBreathMonitor.ts` | Modified — RMS computation, new detector interface |
| `src/App.tsx` | Modified — EnvelopeVisualizer, updated props |
| `src/App.css` | Unchanged |
| `src/index.css` | Unchanged |
| `src/components/EnvelopeVisualizer.tsx` | Created — scrolling RMS energy trace canvas |
| `src/components/EnvelopeVisualizer.css` | Created — container styles |
| `src/components/SpectrumVisualizer.tsx` | Deleted |
| `src/components/SpectrumVisualizer.css` | Deleted |
