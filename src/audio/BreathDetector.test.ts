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
