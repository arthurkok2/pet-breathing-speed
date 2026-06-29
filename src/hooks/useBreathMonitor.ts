import { useRef, useState, useCallback } from "react";
import { AudioManager, BreathDetector } from "../audio";
import type { CalibrationState } from "../audio/BreathDetector";

export function useBreathMonitor() {
  const [bpm, setBpm] = useState<number | null>(null);
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(0));
  const [pulseDetected, setPulseDetected] = useState(false);
  const [energy, setEnergy] = useState(0);
  const [calibration, setCalibration] = useState<CalibrationState>({
    noiseFloor: 0,
    threshold: 180,
    debounceMs: 1500,
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
      const data = audio.getFrequencyData();
      const state = detector.update(data, performance.now());
      setBpm(state.bpm);
      setFrequencyData(new Uint8Array(data));
      setEnergy(state.energy);
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
    setFrequencyData(new Uint8Array(0));
    setPulseDetected(false);
    setEnergy(0);
    setCalibration({ noiseFloor: 0, threshold: 180, debounceMs: 1500, initialized: false });
  }, []);

  const clearPulse = useCallback(() => {
    setPulseDetected(false);
  }, []);

  return { bpm, frequencyData, pulseDetected, energy, calibration, start, stop, clearPulse };
}
