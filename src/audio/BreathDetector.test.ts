import { describe, it, expect, beforeEach } from "vitest";
import { BreathDetector } from "./BreathDetector";

function createDetector(): BreathDetector {
  return new BreathDetector({ bufferSize: 100 });
}

function pushFrames(detector: BreathDetector, values: number[], msPerFrame: number): void {
  values.forEach((v, i) => detector.update(v, i * msPerFrame));
}

function pushSustained(
  detector: BreathDetector,
  rmsValue: number,
  count: number,
  startFrame: number,
  msPerFrame = 16,
): { pulseDetected: boolean; bpm: number | null } {
  let pulseDetected = false;
  let bpm: number | null = null;
  for (let i = 0; i < count; i++) {
    const r = detector.update(rmsValue, (startFrame + i) * msPerFrame);
    if (r.pulseDetected) pulseDetected = true;
    bpm = r.bpm;
  }
  return { pulseDetected, bpm };
}

describe("BreathDetector (sustained-energy)", () => {
  let detector: BreathDetector;

  beforeEach(() => {
    detector = createDetector();
  });

  describe("floor initialization", () => {
    it("establishes a floor from ambient noise", () => {
      detector.update(0.5, 0);
      const r = detector.update(0.5, 16);
      expect(r.floor).toBeGreaterThan(0.4);
      expect(r.floor).toBeLessThan(0.6);
    });
  });

  describe("sustained detection", () => {
    it("detects a sustained elevation above threshold", () => {
      pushFrames(detector, Array(30).fill(0.5), 16);
      const result = pushSustained(detector, 2.5, 30, 30);
      expect(result.pulseDetected).toBe(true);
    });

    it("ignores brief spikes shorter than minimum duration", () => {
      pushFrames(detector, Array(30).fill(0.5), 16);
      const result = pushSustained(detector, 5.0, 15, 30);
      expect(result.pulseDetected).toBe(false);
    });

    it("ignores baseline noise below threshold", () => {
      pushFrames(detector, Array(60).fill(0.5), 16);
      const r = detector.update(0.5, 61 * 16);
      expect(r.pulseDetected).toBe(false);
      expect(r.breathCount).toBe(0);
    });
  });

  describe("refractory period", () => {
    it("prevents re-detection during a single breath", () => {
      pushFrames(detector, Array(30).fill(0.5), 16);
      pushSustained(detector, 2.5, 30, 30);
      const r = detector.update(0.5, 61 * 16);
      expect(r.breathCount).toBe(1);
    });

    it("honors refractory cooldown between separate breaths", () => {
      pushFrames(detector, Array(30).fill(0.5), 16);

      // First breath: sustained elevation
      pushSustained(detector, 2.5, 30, 30);
      // Return to baseline, allow OFF_FRAMES to pass
      pushFrames(detector, Array(20).fill(0.5), 60);

      // Second breath attempt within refractory (1500ms ~= 94 frames)
      // Frame 80 is only 50 frames after detection at ~frame 55
      const r = pushSustained(detector, 2.5, 30, 80);
      expect(r.pulseDetected).toBe(false);
    });

    it("detects second breath after refractory expires", () => {
      pushFrames(detector, Array(30).fill(0.5), 16);

      pushSustained(detector, 2.5, 30, 30);
      // Return to baseline and wait past refractory
      pushFrames(detector, Array(120).fill(0.5), 60);

      const r = pushSustained(detector, 2.5, 30, 180);
      expect(r.pulseDetected).toBe(true);
    });
  });

  describe("BPM calculation", () => {
    it("returns null with no confirmed breaths", () => {
      pushFrames(detector, Array(30).fill(0.5), 16);
      const r = detector.update(0.5, 31 * 16);
      expect(r.bpm).toBeNull();
    });

    it("computes BPM from intervals between confirmed breaths", () => {
      pushFrames(detector, Array(30).fill(0.5), 16);

      // First breath at ~frame 55
      pushSustained(detector, 2.5, 30, 30);
      pushFrames(detector, Array(20).fill(0.5), 60);

      // Wait past refractory and trigger second breath
      pushFrames(detector, Array(120).fill(0.5), 80);
      pushSustained(detector, 2.5, 30, 200);

      const r = detector.update(0.5, 230 * 16);
      expect(r.bpm).not.toBeNull();
      expect(r.bpm).toBeGreaterThan(0);
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      pushFrames(detector, Array(30).fill(0.5), 16);
      pushSustained(detector, 2.5, 30, 30);
      detector.reset();

      const r = detector.update(0.5, 0);
      expect(r.bpm).toBeNull();
      expect(r.breathCount).toBe(0);
      expect(r.pulseDetected).toBe(false);
    });
  });
});
