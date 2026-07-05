import { useState, useEffect } from "react";
import { useBreathMonitor } from "./hooks/useBreathMonitor";
import { EnvelopeVisualizer } from "./components/EnvelopeVisualizer";
import "./App.css";

type AppState = "idle" | "requesting" | "monitoring" | "error";

function App() {
  const [state, setState] = useState<AppState>("idle");
  const {
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
  } = useBreathMonitor();

  useEffect(() => {
    if (!pulseDetected) return;
    const timer = setTimeout(() => {
      clearPulse();
    }, 500);
    return () => clearTimeout(timer);
  }, [pulseDetected, clearPulse]);

  const handleToggle = async () => {
    if (state === "monitoring") {
      stop();
      setState("idle");
      return;
    }

    setState("requesting");
    try {
      await start();
      setState("monitoring");
    } catch (err) {
      const message =
        err instanceof DOMException
          ? "Microphone access denied. Please allow microphone access to monitor breathing."
          : "Could not start monitoring. Please check your microphone.";
      setState("error");
      console.error(message, err);
    }
  };

  const stateLabels: Record<AppState, string> = {
    idle: "Ready",
    requesting: "Requesting microphone access...",
    monitoring: "Monitoring audio stream...",
    error:
      "Microphone access denied. Please allow microphone access and try again.",
  };

  return (
    <div className="container">
      <h1 className="title">Willow</h1>
      <div className="bpm-display">
        <span className="bpm-value">{bpm ?? "--"}</span>
        <span className="bpm-label">BPM</span>
      </div>
      <EnvelopeVisualizer
        rmsEnergy={rmsEnergy}
        floor={floor}
        calibration={calibration}
        breathCount={breathCount}
        breathFrameCounter={breathFrameCounter}
        active={state === "monitoring"}
      />
      <p className="state-label">
        {state === "monitoring" && pulseDetected
          ? "Breath detected"
          : isRecording
            ? "Recording..."
            : stateLabels[state]}
      </p>
      {state === "monitoring" && (
        <div className="recording-bar">
          {!isRecording ? (
            <button className="record-btn" onClick={startRecording}>
              Record Session
            </button>
          ) : (
            <button className="record-btn recording" onClick={stopRecording}>
              Stop Recording
            </button>
          )}
          {hasRecording && (
            <>
              <button className="download-btn" onClick={downloadSession}>
                Download Log (JSON)
              </button>
              <button className="download-btn" onClick={downloadAudio}>
                Download Audio (WebM)
              </button>
            </>
          )}
        </div>
      )}
      <button
        className={`toggle-btn ${state === "monitoring" ? "active" : ""}`}
        onClick={handleToggle}
        disabled={state === "requesting"}
      >
        {state === "monitoring" ? "Stop Monitoring" : "Start Monitoring"}
      </button>
      {state === "error" && (
        <button className="toggle-btn" onClick={() => setState("idle")}>
          Dismiss
        </button>
      )}
    </div>
  );
}

export default App;
