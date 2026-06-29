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
