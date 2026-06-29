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
        if (rmsEnergy <= this.threshold) {
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

    const bpm = this.state === "REFRACTORY" ? null : this.computeBpm(timestamp);

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
    if (this.lastBreathTime <= 0) return null;
    const lastInterval = timestamp - this.lastBreathTime;
    if (lastInterval > STALENESS_MS) return null;
    const avg =
      this.intervals.length > 0
        ? this.intervals.reduce((s, v) => s + v, 0) / this.intervals.length
        : lastInterval;
    return Math.round(60000 / avg);
  }
}
