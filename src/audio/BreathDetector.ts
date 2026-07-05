const RING_SIZE = 300;
const REFRACTORY_MS = 1500;
const MIN_BREATH_FRAMES = 25;
const OFF_FRAMES = 15;
const THRESHOLD_MULTIPLIER = 1.5;
const ROLLING_WINDOW = 5;
const STALENESS_MS = 10000;
const REFRACTORY_FRAMES = Math.ceil(REFRACTORY_MS / 16.67);

export interface CalibrationState {
  calibratedMagnitude: number;
  floor: number;
  peakCount: number;
  initialized: boolean;
}

export interface DetectorResult {
  bpm: number | null;
  rmsEnergy: number;
  pulseDetected: boolean;
  calibration: CalibrationState;
  breathCount: number;
  floor: number;
}

export interface BreathDetectorOptions {
  bufferSize?: number;
}

export class BreathDetector {
  private readonly ring: Float64Array;
  private rIdx = 0;
  private readonly rSize: number;

  private floor = 0;
  private floorInitialized = false;

  private sustainedCount = 0;
  private belowCount = 0;
  private breathActive = false;
  private onsetPeakRms = 0;
  private calibratedMagnitude = 0;
  private peakCount = 0;

  private lastConfirmedFrame = -1000;

  private intervals: number[] = [];
  private lastBreathTime = 0;
  private breathCount = 0;

  constructor(options: BreathDetectorOptions = {}) {
    this.rSize = options.bufferSize ?? RING_SIZE;
    this.ring = new Float64Array(this.rSize);
  }

  get calibration(): CalibrationState {
    return {
      calibratedMagnitude: this.calibratedMagnitude,
      floor: this.floor,
      peakCount: this.peakCount,
      initialized: this.peakCount > 0,
    };
  }

  update(rmsEnergy: number, timestamp: number): DetectorResult {
    this.pushRing(rmsEnergy);
    this.updateFloor(rmsEnergy);
    const pulseDetected = this.processFrame(rmsEnergy, timestamp);
    const bpm = this.computeBpm(timestamp);

    return {
      bpm,
      rmsEnergy,
      pulseDetected,
      calibration: this.calibration,
      breathCount: this.breathCount,
      floor: this.floor,
    };
  }

  reset(): void {
    this.ring.fill(0);
    this.rIdx = 0;
    this.floor = 0;
    this.floorInitialized = false;
    this.sustainedCount = 0;
    this.belowCount = 0;
    this.breathActive = false;
    this.onsetPeakRms = 0;
    this.calibratedMagnitude = 0;
    this.peakCount = 0;
    this.lastConfirmedFrame = -1000;
    this.intervals = [];
    this.lastBreathTime = 0;
    this.breathCount = 0;
  }

  private pushRing(value: number): void {
    this.ring[this.rIdx % this.rSize] = value;
    this.rIdx++;
  }

  private updateFloor(rmsEnergy: number): void {
    if (!this.floorInitialized) {
      this.floor = Math.max(rmsEnergy, 0.01);
      this.floorInitialized = true;
      return;
    }
    if (rmsEnergy < this.floor * 1.5) {
      this.floor = this.floor * 0.999 + rmsEnergy * 0.001;
    }
    if ((this.floor < 0.01 || this.floor > 100) && this.rIdx > 120) {
      this.floor = rmsEnergy;
    }
  }

  private processFrame(rmsEnergy: number, timestamp: number): boolean {
    if (this.rIdx < 20) return false;

    const inRefractory =
      this.lastConfirmedFrame >= 0 &&
      this.rIdx - this.lastConfirmedFrame < REFRACTORY_FRAMES;

    const threshold = this.floorInitialized
      ? Math.max(this.floor * THRESHOLD_MULTIPLIER, this.floor + 0.3)
      : 1.0;

    const above = rmsEnergy > threshold;

    if (inRefractory) {
      if (!above) {
        this.belowCount++;
      } else {
        this.belowCount = 0;
      }
      if (this.belowCount >= OFF_FRAMES) {
        this.breathActive = false;
        this.belowCount = 0;
        this.sustainedCount = 0;
      }
      return false;
    }

    if (above) {
      this.sustainedCount++;
      this.belowCount = 0;
      if (rmsEnergy > this.onsetPeakRms) {
        this.onsetPeakRms = rmsEnergy;
      }
    } else {
      this.belowCount++;
      if (!this.breathActive) {
        this.sustainedCount = 0;
        this.onsetPeakRms = 0;
      }
    }

    if (this.breathActive && this.belowCount >= OFF_FRAMES) {
      this.breathActive = false;
      this.belowCount = 0;
      this.sustainedCount = 0;
      this.onsetPeakRms = 0;
    }

    if (!this.breathActive && this.sustainedCount >= MIN_BREATH_FRAMES) {
      return this.confirmBreath(this.onsetPeakRms, timestamp);
    }

    return false;
  }

  private confirmBreath(peakMagnitude: number, timestamp: number): boolean {
    this.breathActive = true;
    this.peakCount++;
    this.calibratedMagnitude = peakMagnitude > 0 ? peakMagnitude : this.calibratedMagnitude;

    this.breathCount++;
    this.lastConfirmedFrame = this.rIdx;
    this.belowCount = 0;
    this.sustainedCount = 0;
    this.onsetPeakRms = 0;

    if (this.lastBreathTime > 0) {
      const interval = timestamp - this.lastBreathTime;
      if (interval >= REFRACTORY_MS) {
        this.intervals.push(interval);
        if (this.intervals.length > ROLLING_WINDOW) {
          this.intervals.shift();
        }
      }
    }

    this.lastBreathTime = timestamp;
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
