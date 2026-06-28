import { useRef, useState, useCallback } from "react";
import { AudioManager, BreathDetector } from "../audio";

export function useBreathMonitor() {
  const [bpm, setBpm] = useState<number | null>(null);
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

      if (state.pulseDetected) {
        console.log("Pulse detected");
      }
    });
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.stop();
    detectorRef.current?.reset();
    audioRef.current = null;
    detectorRef.current = null;
    setBpm(null);
  }, []);

  return { bpm, start, stop };
}
