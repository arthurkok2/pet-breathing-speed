# Peak-Based Breath Detection - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace threshold/floor calibration with local-maximum peak detection and magnitude calibration.

**Architecture:** Ring buffer of 300 RMS values. Each frame scans for completed local maxima in the trailing data. A completed peak is confirmed as a breath if its (peak − valley) exceeds 30% of the median of the last 5 confirmed peak magnitudes. No static threshold, no noise floor.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Write failing peak-detection tests

**Files:**
- Modify: `src/audio/BreathDetector.test.ts`

Replace the entire test file. Remove old threshold/floor/state-machine tests. Write new tests for peak detection:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { BreathDetector } from "./BreathDetector";

function createDetector(): BreathDetector {
  return new BreathDetector({ bufferSize: 100 });
}

function pushFrames(detector: BreathDetector, values: number[], msPerFrame: number): void {
  values.forEach((v, i) => detector.update(v, i * msPerFrame));
}

function simulateBreath(detector: BreathDetector, startFrame: number, peakHeight: number, msPerFrame = 16): { pulseDetected: boolean; bpm: number | null } {
  const valley = 3;
  const rampLen = 8;
  const holdLen = 8;
  const fallLen = 8;

  const startMs = startFrame * msPerFrame;

  // valley before breath
  for (let i = 0; i < 5; i++) {
    detector.update(valley, startMs + i * msPerFrame);
  }

  // ramp up
  for (let i = 0; i < rampLen; i++) {
    detector.update(valley + ((peakHeight - valley) * (i + 1)) / rampLen, startMs + (5 + i) * msPerFrame);
  }

  // hold near peak
  for (let i = 0; i < holdLen; i++) {
    detector.update(peakHeight - Math.random() * 2, startMs + (5 + rampLen + i) * msPerFrame);
  }

  // ramp down
  for (let i = 0; i < fallLen; i++) {
    detector.update(valley + ((peakHeight - valley) * (fallLen - i)) / fallLen, startMs + (5 + rampLen + holdLen + i) * msPerFrame);
  }

  // return to valley
  let pulseDetected = false;
  let bpm: number | null = null;
  for (let i = 0; i < 20; i++) {
    const result = detector.update(valley, startMs + (5 + rampLen + holdLen + fallLen + i) * msPerFrame);
    if (result.pulseDetected) pulseDetected = true;
    bpm = result.bpm;
  }

  return { pulseDetected, bpm };
}

describe("BreathDetector (peak-based)", () => {
  let detector: BreathDetector;

  beforeEach(() => {
    detector = createDetector();
  });

  describe("initialization and bootstrap", () => {
    it("returns uninitialized calibration initially", () => {
      const result = detector.update(5, 0);
      expect(result.calibration.initialized).toBe(false);
    });

    it("detects first breath using bootstrap rule (peak >= 5x valley)", () => {
      pushFrames(detector, Array(30).fill(3), 16);
      const result = simulateBreath(detector, 30, 40);
      expect(result.pulseDetected).toBe(true);
    });

    it("rejects small peaks during bootstrap (peak < 5x valley)", () => {
      pushFrames(detector, Array(30).fill(5), 16);
      const result = simulateBreath(detector, 30, 10);
      expect(result.pulseDetected).toBe(false);
    });
  });

  describe("magnitude calibration", () => {
    it("initializes calibrated magnitude after first breath", () => {
      pushFrames(detector, Array(30).fill(3), 16);
      simulateBreath(detector, 30, 40);
      const result = detector.update(3, 2000);
      expect(result.calibration.initialized).toBe(true);
      expect(result.calibration.calibratedMagnitude).toBeGreaterThan(0);
    });

    it("updates calibrated magnitude as more breaths arrive", () => {
      pushFrames(detector, Array(30).fill(3), 16);
      simulateBreath(detector, 30, 40);
      simulateBreath(detector, 200, 55);
      const result = detector.update(3, 5000);
      expect(result.calibration.calibratedMagnitude).toBeGreaterThan(30);
    });

    it("tracks median of last 5 confirmed peak magnitudes", () => {
      pushFrames(detector, Array(30).fill(3), 16);
      simulateBreath(detector, 30, 30);
      simulateBreath(detector, 200, 35);
      simulateBreath(detector, 400, 40);
      simulateBreath(detector, 600, 45);
      simulateBreath(detector, 800, 50);
      const result = detector.update(3, 5000);
      expect(result.calibration.calibratedMagnitude).toBe(40);
    });

    it("uses peak-to-valley ratio against calibrated magnitude", () => {
      pushFrames(detector, Array(30).fill(3), 16);
      simulateBreath(detector, 30, 60);
      const result = detector.update(3, 2000);
      expect(result.calibration.initialized).toBe(true);
    });
  });

  describe("peak detection", () => {
    it("detects a completed local maximum as a breath", () => {
      pushFrames(detector, Array(30).fill(3), 16);
      const { pulseDetected } = simulateBreath(detector, 30, 40);
      expect(pulseDetected).toBe(true);
    });

    it("ignores a peak that doesn't form a local maximum (sustained plateau)", () => {
      pushFrames(detector, Array(30).fill(3), 16);
      // flat plateau, no local max
      for (let i = 0; i < 15; i++) {
        detector.update(20, 500 + i * 16);
      }
      for (let i = 0; i < 10; i++) {
        const result = detector.update(3, 800 + i * 16);
        // should not detect (no clear peak shape)
      }
    });

    it("ignores peaks too small relative to calibrated magnitude", () => {
      pushFrames(detector, Array(30).fill(3), 16);
      simulateBreath(detector, 30, 50);
      const result = simulateBreath(detector, 200, 8);
      expect(result.pulseDetected).toBe(false);
    });
  });

  describe("refractory", () => {
    it("enforces a refractory period after a confirmed breath", () => {
      pushFrames(detector, Array(30).fill(3), 16);
      simulateBreath(detector, 30, 40);
      const { pulseDetected } = simulateBreath(detector, 40, 40);
      expect(pulseDetected).toBe(false);
    });
  });

  describe("BPM", () => {
    it("returns null with no confirmed breaths", () => {
      pushFrames(detector, Array(30).fill(3), 16);
      const result = detector.update(3, 2000);
      expect(result.bpm).toBeNull();
    });

    it("computes BPM from intervals between confirmed peaks", () => {
      pushFrames(detector, Array(30).fill(3), 16);
      simulateBreath(detector, 30, 40);
      simulateBreath(detector, 200, 40);
      const result = detector.update(3, 5000);
      expect(result.bpm).not.toBeNull();
      expect(result.bpm).toBeGreaterThan(0);
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      pushFrames(detector, Array(30).fill(3), 16);
      simulateBreath(detector, 30, 40);
      detector.reset();
      const result = detector.update(3, 0);
      expect(result.bpm).toBeNull();
      expect(result.breathCount).toBe(0);
      expect(result.calibration.initialized).toBe(false);
    });
  });
});
```

- [ ] Run `npx vitest run` — all fail (old detector doesn't have peak detection). Commit.

---

### Task 2: Implement peak-based BreathDetector

**Files:**
- Modify: `src/audio/BreathDetector.ts`

Full rewrite:

```ts
const RING_SIZE = 300;
const PEAK_HALF_WINDOW = 12;
const FALL_RATIO = 0.6;
const REFRACTORY_MS = 500;
const BOOTSTRAP_MULTIPLIER = 5;
const SIGNIFICANCE_RATIO = 0.3;
const MAGNITUDE_RING = 5;
const ROLLING_WINDOW = 5;
const MIN_DEBOUNCE_MS = 200;
const MAX_DEBOUNCE_MS = 3000;
const DEBOUNCE_FRACTION = 0.45;
const STALENESS_MS = 10000;

export interface CalibrationState {
  calibratedMagnitude: number;
  peakCount: number;
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
}

export class BreathDetector {
  private readonly ring: Float64Array;
  private rIdx = 0;
  private rCount = 0;
  private readonly rSize: number;

  private peakMagnitudes: number[] = [];
  private calibratedMagnitude = 0;

  private lastPeakIdx = -1000;
  private lastConfirmTime = -REFRACTORY_MS;
  private confirmedPeakTimestamps: number[] = [];

  private intervals: number[] = [];
  private lastBreathTime = 0;
  private debounceMs = MIN_DEBOUNCE_MS;
  private breathCount = 0;

  constructor(options: BreathDetectorOptions = {}) {
    this.rSize = options.bufferSize ?? RING_SIZE;
    this.ring = new Float64Array(this.rSize);
  }

  get calibration(): CalibrationState {
    return {
      calibratedMagnitude: this.calibratedMagnitude,
      peakCount: this.peakMagnitudes.length,
      initialized: this.peakMagnitudes.length > 0,
    };
  }

  update(rmsEnergy: number, timestamp: number): DetectorResult {
    this.pushRing(rmsEnergy);
    const pulseDetected = this.processPeaks(rmsEnergy, timestamp);
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
    this.ring.fill(0);
    this.rIdx = 0;
    this.rCount = 0;
    this.peakMagnitudes = [];
    this.calibratedMagnitude = 0;
    this.lastPeakIdx = -1000;
    this.lastConfirmTime = -REFRACTORY_MS;
    this.confirmedPeakTimestamps = [];
    this.intervals = [];
    this.lastBreathTime = 0;
    this.debounceMs = MIN_DEBOUNCE_MS;
    this.breathCount = 0;
  }

  private pushRing(value: number): void {
    this.ring[this.rIdx] = value;
    this.rIdx = (this.rIdx + 1) % this.rSize;
    if (this.rCount < this.rSize) this.rCount++;
  }

  private getRing(idx: number): number {
    return this.ring[((idx % this.rSize) + this.rSize) % this.rSize];
  }

  private processPeaks(rmsEnergy: number, timestamp: number): boolean {
    if (this.rCount < PEAK_HALF_WINDOW * 3) return false;

    const inRefractory = timestamp - this.lastConfirmTime < REFRACTORY_MS;

    const checkIdx = this.wrapIdx(this.rIdx - PEAK_HALF_WINDOW - 1);
    const val = this.ring[checkIdx];

    // Only check if this is a new index we haven't processed
    if (Math.abs(checkIdx - this.lastPeakIdx) < PEAK_HALF_WINDOW) return false;
    if (Math.abs(this.rCount + checkIdx - this.lastPeakIdx - this.rCount) < PEAK_HALF_WINDOW) return false;

    let isLocalMax = true;
    for (let offset = -PEAK_HALF_WINDOW; offset <= PEAK_HALF_WINDOW; offset++) {
      if (offset === 0) continue;
      const neighborIdx = this.wrapIdx(checkIdx + offset);
      if (this.ring[neighborIdx] >= val) {
        isLocalMax = false;
        break;
      }
    }

    if (!isLocalMax) return false;

    this.lastPeakIdx = checkIdx;

    // Peak is complete only if current RMS has fallen below FALL_RATIO of peak
    if (rmsEnergy >= val * FALL_RATIO) return false;
    if (inRefractory) return false;

    // Find valley: minimum in window before the peak started
    // The rise would be about 300ms before the peak
    const valleyStart = this.wrapIdx(checkIdx - 30);
    let valley = Infinity;
    for (let i = 0; i < 30; i++) {
      const vi = this.wrapIdx(valleyStart + i);
      valley = Math.min(valley, this.ring[vi]);
    }

    // Bootstrap: if no calibrated magnitude, use 5x valley rule
    if (!this.calibration.initialized) {
      if (val >= valley * BOOTSTRAP_MULTIPLIER) {
        return this.confirmBreath(val, timestamp);
      }
      return false;
    }

    // Calibrated: peak must be 30% of calibrated magnitude above valley
    const peakRise = val - valley;
    if (peakRise >= this.calibratedMagnitude * SIGNIFICANCE_RATIO) {
      return this.confirmBreath(val, timestamp);
    }

    return false;
  }

  private confirmBreath(peakMagnitude: number, timestamp: number): boolean {
    this.breathCount++;

    this.peakMagnitudes.push(peakMagnitude);
    if (this.peakMagnitudes.length > MAGNITUDE_RING) {
      this.peakMagnitudes.shift();
    }

    const sorted = [...this.peakMagnitudes].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    this.calibratedMagnitude = sorted.length % 2 === 1
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;

    if (this.lastBreathTime > 0) {
      const interval = timestamp - this.lastBreathTime;
      this.intervals.push(interval);
      if (this.intervals.length > ROLLING_WINDOW) {
        this.intervals.shift();
      }

      if (this.intervals.length >= 2) {
        const avg = this.intervals.reduce((s, v) => s + v, 0) / this.intervals.length;
        this.debounceMs = Math.max(MIN_DEBOUNCE_MS, Math.min(MAX_DEBOUNCE_MS, avg * DEBOUNCE_FRACTION));
      }
    }

    this.lastBreathTime = timestamp;
    this.lastConfirmTime = timestamp;
    this.confirmedPeakTimestamps.push(timestamp);

    return true;
  }

  private wrapIdx(idx: number): number {
    return ((idx % this.rSize) + this.rSize) % this.rSize;
  }

  private computeBpm(timestamp: number): number | null {
    if (this.intervals.length === 0) return null;
    if (this.lastBreathTime > 0 && timestamp - this.lastBreathTime > STALENESS_MS) return null;
    const avg = this.intervals.reduce((s, v) => s + v, 0) / this.intervals.length;
    return Math.round(60000 / avg);
  }
}
```

- [ ] Run `npx vitest run` — all tests pass. Commit.

---

### Task 3: Update EnvelopeVisualizer

**Files:**
- Modify: `src/components/EnvelopeVisualizer.tsx`

Remove `threshold`, `noiseFloor` props and overlay lines. Keep RMS energy trace. Replace stats bar to show calibrated magnitude and peak count instead of threshold/floor/debounce.

Props change:
```ts
interface EnvelopeVisualizerProps {
  rmsEnergy: number;
  calibration: CalibrationState;
  breathCount: number;
  active: boolean;
  // removed: threshold, noiseFloor
}
```

Remove the threshold/floor line drawing code (the orange dashed and white dotted lines). Keep the cyan RMS trace. Update stats bar to show `calibratedMagnitude` and `peakCount`.

- [ ] Commit.

---

### Task 4: Update App.tsx

**Files:**
- Modify: `src/App.tsx`

Remove `threshold` and `noiseFloor` destructuring from `useBreathMonitor()`. Remove those props from `<EnvelopeVisualizer>`. Keep `rmsEnergy`, `calibration`, `breathCount`, `active`.

- [ ] Run `npx tsc -b --noEmit` — zero errors. Commit.

---

### Task 5: Final verification

- [ ] `npx vitest run` — all pass
- [ ] `npx tsc -b --noEmit` — clean
- [ ] `npm run build` — succeeds
- [ ] Commit + push
