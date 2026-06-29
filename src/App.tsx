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
    pulseDetected,
    breathCount,
    calibration,
    start,
    stop,
    clearPulse,
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
        threshold={calibration.threshold}
        noiseFloor={calibration.noiseFloor}
        calibration={calibration}
        breathCount={breathCount}
        active={state === "monitoring"}
      />
      <p className="state-label">
        {state === "monitoring" && pulseDetected
          ? "Pulse detected"
          : stateLabels[state]}
      </p>
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
