const ROLLING_WINDOW_SIZE = 5;
const LOW_BINS_COUNT = 5;

const FLOOR_ALPHA_FAST = 0.1;
const FLOOR_ALPHA_SLOW = 0.0005;
const THRESHOLD_MULTIPLIER = 2.5;
const DEBOUNCE_FRACTION = 0.45;
const MIN_THRESHOLD = 25;
const MAX_THRESHOLD = 230;
const MIN_DEBOUNCE_MS = 200;
const MAX_DEBOUNCE_MS = 3000;

export interface BreathDetectorState {
  bpm: number | null;
  pulseDetected: boolean;
  energy: number;
}

export interface CalibrationState {
  noiseFloor: number;
  threshold: number;
  debounceMs: number;
  initialized: boolean;
}

export class BreathDetector {
  private lastBreathTime: number | null = null;
  private intervals: number[] = [];
  private lastPulseTime = 0;

  private noiseFloor = 0;
  private initialized = false;

  private adaptiveThreshold = 180;
  private adaptiveDebounceMs = 1500;

  get calibration(): CalibrationState {
    return {
      noiseFloor: this.noiseFloor,
      threshold: this.adaptiveThreshold,
      debounceMs: this.adaptiveDebounceMs,
      initialized: this.initialized,
    };
  }

  update(frequencyData: Uint8Array, timestamp: number): BreathDetectorState {
    let energySum = 0;
    for (let i = 0; i < LOW_BINS_COUNT && i < frequencyData.length; i++) {
      energySum += frequencyData[i];
    }
    const avgAmplitude = energySum / LOW_BINS_COUNT;

    this.calibrateNoiseFloor(avgAmplitude);
    this.calibrateDebounce();

    let bpm: number | null = null;
    let pulseDetected = false;

    if (avgAmplitude > this.adaptiveThreshold) {
      if (this.lastBreathTime !== null) {
        const timeSinceLastPulse = timestamp - this.lastPulseTime;
        if (timeSinceLastPulse >= this.adaptiveDebounceMs) {
          const interval = timestamp - this.lastBreathTime;
          this.intervals.push(interval);
          if (this.intervals.length > ROLLING_WINDOW_SIZE) {
            this.intervals.shift();
          }
          this.lastBreathTime = timestamp;
          pulseDetected = true;
        }
      } else {
        this.lastBreathTime = timestamp;
        pulseDetected = true;
      }
      this.lastPulseTime = timestamp;
    }

    if (this.intervals.length > 0) {
      const avgInterval =
        this.intervals.reduce((s, v) => s + v, 0) / this.intervals.length;
      bpm = Math.round(60000 / avgInterval);
    }

    return { bpm, pulseDetected, energy: avgAmplitude };
  }

  private calibrateNoiseFloor(avgAmplitude: number): void {
    if (!this.initialized) {
      this.noiseFloor = avgAmplitude;
      this.initialized = true;
    } else {
      const alpha =
        avgAmplitude < this.noiseFloor ? FLOOR_ALPHA_FAST : FLOOR_ALPHA_SLOW;
      this.noiseFloor += (avgAmplitude - this.noiseFloor) * alpha;
    }

    this.adaptiveThreshold = Math.min(
      MAX_THRESHOLD,
      Math.max(MIN_THRESHOLD, this.noiseFloor * THRESHOLD_MULTIPLIER)
    );
  }

  private calibrateDebounce(): void {
    if (this.intervals.length >= 2) {
      const avgIntervalMs =
        this.intervals.reduce((s, v) => s + v, 0) / this.intervals.length;
      this.adaptiveDebounceMs = Math.min(
        MAX_DEBOUNCE_MS,
        Math.max(MIN_DEBOUNCE_MS, avgIntervalMs * DEBOUNCE_FRACTION)
      );
    }
  }

  reset(): void {
    this.lastBreathTime = null;
    this.intervals = [];
    this.lastPulseTime = 0;
    this.noiseFloor = 0;
    this.initialized = false;
    this.adaptiveThreshold = 180;
    this.adaptiveDebounceMs = 1500;
  }
}
