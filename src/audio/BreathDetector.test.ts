import { describe, it, expect, beforeEach } from "vitest";
import { BreathDetector } from "./BreathDetector";

function createDetector(): BreathDetector {
  return new BreathDetector({ bufferSize: 100 });
}

function pushFrames(detector: BreathDetector, values: number[], msPerFrame: number): void {
  values.forEach((v, i) => detector.update(v, i * msPerFrame));
}

function simulateBreath(
  detector: BreathDetector,
  startFrame: number,
  peakHeight: number,
  msPerFrame = 16,
): { pulseDetected: boolean; bpm: number | null } {
  const valley = 3;
  const rampLen = 10;
  const fallLen = 10;
  const startMs = startFrame * msPerFrame;
  let pulseDetected = false;
  let bpm: number | null = null;

  const push = (v: number, t: number) => {
    const r = detector.update(v, t);
    if (r.pulseDetected) pulseDetected = true;
    bpm = r.bpm;
  };

  for (let i = 0; i < 5; i++) push(valley, startMs + i * msPerFrame);
  for (let i = 0; i < rampLen; i++)
    push(valley + ((peakHeight - valley) * (i + 1)) / (rampLen + 1), startMs + (5 + i) * msPerFrame);
  push(peakHeight, startMs + (5 + rampLen) * msPerFrame);
  for (let i = 0; i < fallLen; i++)
    push(peakHeight - ((peakHeight - valley) * (i + 1)) / (fallLen + 1), startMs + (6 + rampLen + i) * msPerFrame);
  for (let i = 0; i < 25; i++)
    push(valley, startMs + (6 + rampLen + fallLen + i) * msPerFrame);

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

    it("ignores peaks too small relative to calibrated magnitude", () => {
      pushFrames(detector, Array(30).fill(3), 16);
      simulateBreath(detector, 30, 50);
      const { pulseDetected } = simulateBreath(detector, 180, 8);
      expect(pulseDetected).toBe(false);
    });
  });

  describe("refractory", () => {
    it("prevents re-detection during a single peak cycle", () => {
      pushFrames(detector, Array(30).fill(3), 16);
      simulateBreath(detector, 30, 40);
      // After first breath, breathCount should be exactly 1
      expect(detector.update(3, 2000).breathCount).toBe(1);
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
