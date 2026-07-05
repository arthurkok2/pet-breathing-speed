import { useRef, useState, useCallback } from "react";
import { AudioManager, BreathDetector } from "../audio";
import type { CalibrationState } from "../audio/BreathDetector";

interface RmsLogEntry {
  t: number;
  rms: number;
  floor: number;
  breath: boolean;
}

interface BreathEvent {
  t: number;
  peakMag: number;
  bpm: number | null;
}

interface SessionData {
  version: 1;
  recordedAt: string;
  durationSec: number;
  rmsLog: RmsLogEntry[];
  breaths: BreathEvent[];
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function useBreathMonitor() {
  const [bpm, setBpm] = useState<number | null>(null);
  const [rmsEnergy, setRmsEnergy] = useState(0);
  const [pulseDetected, setPulseDetected] = useState(false);
  const [breathCount, setBreathCount] = useState(0);
  const [breathFrameCounter, setBreathFrameCounter] = useState(0);
  const [floor, setFloor] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationState>({
    calibratedMagnitude: 0,
    floor: 0,
    peakCount: 0,
    initialized: false,
  });
  const audioRef = useRef<AudioManager | null>(null);
  const detectorRef = useRef<BreathDetector | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const rmsLogRef = useRef<RmsLogEntry[]>([]);
  const breathsRef = useRef<BreathEvent[]>([]);
  const startTimeRef = useRef(0);
  const audioBlobRef = useRef<Blob | null>(null);
  const recordingRef = useRef(false);

  const start = useCallback(async () => {
    const audio = new AudioManager();
    const detector = new BreathDetector();

    await audio.start();

    audioRef.current = audio;
    detectorRef.current = detector;
    startTimeRef.current = performance.now();
    rmsLogRef.current = [];
    breathsRef.current = [];

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
      setFloor(state.floor);
      setCalibration({ ...detector.calibration });

      if (recordingRef.current) {
        rmsLogRef.current.push({
          t: performance.now() - startTimeRef.current,
          rms: state.rmsEnergy,
          floor: state.floor,
          breath: state.pulseDetected,
        });
        if (state.pulseDetected) {
          breathsRef.current.push({
            t: performance.now() - startTimeRef.current,
            peakMag: state.calibration.calibratedMagnitude,
            bpm: state.bpm,
          });
        }
      }

      if (state.pulseDetected) {
        setPulseDetected(true);
        setBreathFrameCounter((c) => c + 1);
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
    setBreathFrameCounter(0);
    setFloor(0);
    setCalibration({
      calibratedMagnitude: 0,
      floor: 0,
      peakCount: 0,
      initialized: false,
    });
  }, []);

  const clearPulse = useCallback(() => {
    setPulseDetected(false);
  }, []);

  const startRecording = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const stream = audio.getStream();
    if (!stream) return;

    rmsLogRef.current = [];
    breathsRef.current = [];
    audioChunksRef.current = [];
    audioBlobRef.current = null;

    const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      audioBlobRef.current = blob;
      setHasRecording(true);
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    recordingRef.current = true;
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.stop();
    recorderRef.current = null;
    recordingRef.current = false;
    setIsRecording(false);
  }, []);

  const downloadSession = useCallback(() => {
    const data: SessionData = {
      version: 1,
      recordedAt: new Date().toISOString(),
      durationSec: rmsLogRef.current.length > 0
        ? Math.round(rmsLogRef.current[rmsLogRef.current.length - 1].t / 100) / 10
        : 0,
      rmsLog: rmsLogRef.current,
      breaths: breathsRef.current,
    };
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadJson(`willow-session-${ts}.json`, data);
  }, []);

  const downloadAudio = useCallback(() => {
    const blob = audioBlobRef.current;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.download = `willow-audio-${ts}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    bpm,
    rmsEnergy,
    floor,
    pulseDetected,
    breathCount,
    breathFrameCounter,
    calibration,
    isRecording,
    hasRecording,
    start,
    stop,
    clearPulse,
    startRecording,
    stopRecording,
    downloadSession,
    downloadAudio,
  };
}
