import { useState, useEffect } from "react";
import { useBreathMonitor } from "./hooks/useBreathMonitor";
import { EnvelopeVisualizer } from "./components/EnvelopeVisualizer";
import "./App.css";

type AppState = "idle" | "requesting" | "monitoring" | "error";

function App() {
  const [state, setState] = useState<AppState>("idle");
  const [echoOff, setEchoOff] = useState(true);
  const [noiseOff, setNoiseOff] = useState(true);
  const [gainOff, setGainOff] = useState(true);
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
    assessmentActive,
    assessmentElapsed,
    assessmentResult,
    start,
    stop,
    clearPulse,
    startRecording,
    stopRecording,
    downloadSession,
    downloadAudio,
    startAssessment,
    stopAssessment,
    dismissAssessment,
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
      await start({
        echoCancellation: echoOff ? false : true,
        noiseSuppression: noiseOff ? false : true,
        autoGainControl: gainOff ? false : true,
      });
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
        {state === "monitoring" && assessmentActive
          ? `Assessing... ${assessmentElapsed}s / 60s`
          : state === "monitoring" && pulseDetected
            ? "Breath detected"
            : isRecording
              ? "Recording..."
              : stateLabels[state]}
      </p>
      {state === "monitoring" && (
        <div className="recording-bar">
          {!assessmentActive && (
            <button className="assess-btn" onClick={startAssessment}>
              Assess 1 min
            </button>
          )}
          {assessmentActive && (
            <button className="assess-btn cancel" onClick={stopAssessment}>
              Cancel
            </button>
          )}
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
      {state === "idle" && (
        <div className="audio-toggles">
          <label className="audio-toggle">
            <input
              type="checkbox"
              checked={echoOff}
              onChange={(e) => setEchoOff(e.target.checked)}
            />
            <span>Disable echo cancellation</span>
          </label>
          <label className="audio-toggle">
            <input
              type="checkbox"
              checked={noiseOff}
              onChange={(e) => setNoiseOff(e.target.checked)}
            />
            <span>Disable noise suppression</span>
          </label>
          <label className="audio-toggle">
            <input
              type="checkbox"
              checked={gainOff}
              onChange={(e) => setGainOff(e.target.checked)}
            />
            <span>Disable auto gain control</span>
          </label>
        </div>
      )}
      {state === "error" && (
        <button className="toggle-btn" onClick={() => setState("idle")}>
          Dismiss
        </button>
      )}
      {assessmentResult && (
        <div className="report-overlay">
          <div className="report-card">
            <h2>Assessment Complete</h2>
            <div className="report-stat">
              <span className="report-value">{assessmentResult.avgBpm}</span>
              <span className="report-label">Average BPM</span>
            </div>
            <div className="report-details">
              <div className="report-row">
                <span>Range</span>
                <strong>{assessmentResult.minBpm} – {assessmentResult.maxBpm} BPM</strong>
              </div>
              <div className="report-row">
                <span>Total breaths</span>
                <strong>{assessmentResult.breaths}</strong>
              </div>
              <div className="report-row">
                <span>Duration</span>
                <strong>{assessmentResult.durationSec}s</strong>
              </div>
            </div>
            <button className="toggle-btn" onClick={dismissAssessment}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
