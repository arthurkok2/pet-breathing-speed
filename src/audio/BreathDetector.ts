const ENERGY_THRESHOLD = 180;
const DEBOUNCE_MS = 1500;
const ROLLING_WINDOW_SIZE = 5;
const LOW_BINS_COUNT = 5;

export interface BreathDetectorState {
  bpm: number | null;
  pulseDetected: boolean;
}

export class BreathDetector {
  private lastBreathTime: number | null = null;
  private intervals: number[] = [];
  private lastPulseTime = 0;

  update(frequencyData: Uint8Array, timestamp: number): BreathDetectorState {
    let energySum = 0;
    for (let i = 0; i < LOW_BINS_COUNT && i < frequencyData.length; i++) {
      energySum += frequencyData[i];
    }
    const avgAmplitude = energySum / LOW_BINS_COUNT;

    let bpm: number | null = null;
    let pulseDetected = false;

    if (avgAmplitude > ENERGY_THRESHOLD) {
      if (this.lastBreathTime !== null) {
        const timeSinceLastPulse = timestamp - this.lastPulseTime;
        if (timeSinceLastPulse >= DEBOUNCE_MS) {
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
      bpm = Math.round((60 / avgInterval) * 1000);
    }

    return { bpm, pulseDetected };
  }

  reset(): void {
    this.lastBreathTime = null;
    this.intervals = [];
    this.lastPulseTime = 0;
  }
}
