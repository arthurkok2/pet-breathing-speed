const RING_SIZE = 300;
const REFRACTORY_MS = 500;
const BOOTSTRAP_MULTIPLIER = 5;
const SIGNIFICANCE_RATIO = 0.3;
const MAGNITUDE_RING = 5;
const ROLLING_WINDOW = 5;
const STALENESS_MS = 10000;
const FALL_RATIO = 0.6;
const REFRACTORY_FRAMES = Math.ceil(REFRACTORY_MS / 16.67);

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
  private readonly rSize: number;

  private peakMagnitudes: number[] = [];
  private calibratedMagnitude = 0;

  private lastConfirmedFrame = -1000;

  private intervals: number[] = [];
  private lastBreathTime = 0;
  private breathCount = 0;

  private currentMax = 0;
  private maxCompleted = false;

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
    this.peakMagnitudes = [];
    this.calibratedMagnitude = 0;
    this.lastConfirmedFrame = -1000;
    this.intervals = [];
    this.lastBreathTime = 0;
    this.breathCount = 0;
    this.currentMax = 0;
    this.maxCompleted = false;
  }

  private pushRing(value: number): void {
    this.ring[this.rIdx % this.rSize] = value;
    this.rIdx++;
  }

  private ringAt(offset: number): number {
    return this.ring[((this.rIdx - 1 - offset) % this.rSize + this.rSize) % this.rSize];
  }

  private processPeaks(rmsEnergy: number, timestamp: number): boolean {
    if (this.rIdx < 20) return false;

    const inRefractory =
      this.lastConfirmedFrame >= 0 &&
      this.rIdx - this.lastConfirmedFrame < REFRACTORY_FRAMES;
    if (inRefractory) return false;

    if (rmsEnergy > this.currentMax) {
      this.currentMax = rmsEnergy;
      this.maxCompleted = false;
    } else if (
      !this.maxCompleted &&
      this.currentMax > 0 &&
      rmsEnergy < this.currentMax * FALL_RATIO
    ) {
      this.maxCompleted = true;

      let valley = Infinity;
      for (let i = 0; i < 30; i++) {
        valley = Math.min(valley, this.ringAt(i));
      }

      const peakVal = this.currentMax;
      this.currentMax = 0;

      if (this.peakMagnitudes.length === 0) {
        if (peakVal >= valley * BOOTSTRAP_MULTIPLIER) {
          return this.confirmBreath(peakVal, timestamp);
        }
      } else {
        const rise = peakVal - valley;
        if (rise >= this.calibratedMagnitude * SIGNIFICANCE_RATIO) {
          return this.confirmBreath(peakVal, timestamp);
        }
      }
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
    this.calibratedMagnitude =
      sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;

    if (this.lastBreathTime > 0) {
      const interval = timestamp - this.lastBreathTime;
       this.intervals.push(interval);
      if (this.intervals.length > ROLLING_WINDOW) {
        this.intervals.shift();
      }
    }

    this.lastBreathTime = timestamp;
    this.lastConfirmedFrame = this.rIdx;

    return true;
  }

  private computeBpm(timestamp: number): number | null {
    if (this.intervals.length === 0) return null;
    if (
      this.lastBreathTime > 0 &&
      timestamp - this.lastBreathTime > STALENESS_MS
    )
      return null;
    const avg =
      this.intervals.reduce((s, v) => s + v, 0) / this.intervals.length;
    return Math.round(60000 / avg);
  }
}
