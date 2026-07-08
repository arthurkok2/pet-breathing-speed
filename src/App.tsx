import { useState, useEffect, useRef } from "react";
import { useBreathMonitor } from "./hooks/useBreathMonitor";
import type { AssessmentResult } from "./hooks/useBreathMonitor";
import { EnvelopeVisualizer } from "./components/EnvelopeVisualizer";
import "./App.css";

type AppState = "idle" | "requesting" | "monitoring" | "error";

const BREATH_SPAN = 30;

function AssessmentWaveform({ result, canvasRef }: { result: AssessmentResult; canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  const internalRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = internalRef.current;
    if (!canvas) return;

    if (canvasRef) (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = canvas;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const style = getComputedStyle(document.documentElement);
    const accentColor = style.getPropertyValue("--color-accent").trim() || "#9b7ec4";
    const successColor = style.getPropertyValue("--color-success").trim() || "#7ec89a";
    const surfaceColor = style.getPropertyValue("--color-surface").trim() || "#fae8dd";
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const log = result.rmsLog;

    ctx.fillStyle = surfaceColor;
    ctx.fillRect(0, 0, w, h);

    let peak = 1;
    for (const v of log) if (v > peak) peak = v;

    for (const frame of result.breathFrames) {
      const s = Math.max(0, frame - BREATH_SPAN);
      const e = Math.min(log.length - 1, frame);
      const x1 = (s / log.length) * w;
      const x2 = (e / log.length) * w;
      ctx.fillStyle = `${successColor}0F`;
      ctx.fillRect(x1, 0, x2 - x1, h);
      ctx.strokeStyle = `${successColor}26`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, h);
      ctx.stroke();
    }

    ctx.strokeStyle = `${accentColor}0A`;
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (log.length > 1) {
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < log.length; i++) {
        const x = (i / (log.length - 1)) * w;
        const y = h - (log[i] / peak) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    for (const frame of result.breathFrames) {
      const x = (frame / (log.length - 1)) * w;
      const y = h - (log[frame] / peak) * h;
      ctx.fillStyle = successColor;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [result, canvasRef]);

  return <canvas ref={internalRef} className="report-canvas" />;
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadAssessmentJson(result: AssessmentResult) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  downloadJson({
    avgBpm: result.avgBpm,
    minBpm: result.minBpm,
    maxBpm: result.maxBpm,
    breaths: result.breaths,
    durationSec: result.durationSec,
    rmsLog: result.rmsLog,
    breathFrames: result.breathFrames,
  }, `willow-assessment-${ts}.json`);
}

function downloadAssessmentCsv(result: AssessmentResult) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  let csv = "frame,rms,breath\n";
  const breathSet = new Set(result.breathFrames);
  for (let i = 0; i < result.rmsLog.length; i++) {
    csv += `${i},${result.rmsLog[i]},${breathSet.has(i) ? 1 : 0}\n`;
  }
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `willow-assessment-${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadAssessmentHtml(result: AssessmentResult, canvas: HTMLCanvasElement | null) {
  const imgData = canvas?.toDataURL("image/png") ?? "";
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Willow Respiratory Assessment</title>
<style>
  body { background:#121212; color:#e0e0e0; font-family:monospace; max-width:500px; margin:2rem auto; padding:1rem; }
  h1 { color:#888; text-transform:uppercase; letter-spacing:.3em; font-size:1.2rem; font-weight:400; text-align:center; }
  .bpm { text-align:center; margin:1.5rem 0; }
  .bpm .value { font-size:4rem; font-weight:700; color:#4fc3f7; }
  .bpm .label { font-size:1.2rem; color:#666; }
  img { display:block; width:100%; border-radius:4px; margin:1rem 0; }
  .stats { border-top:1px solid #333; padding-top:1rem; }
  .stat { display:flex; justify-content:space-between; padding:.3rem 0; color:#888; }
  .stat strong { color:#aaa; }
</style>
</head>
<body>
<h1>Willow Respiratory Assessment</h1>
<div class="bpm">
  <div class="value">${result.avgBpm}</div>
  <div class="label">Average BPM</div>
</div>
${imgData ? `<img src="${imgData}" alt="Breathing waveform">` : ""}
<div class="stats">
  <div class="stat"><span>Range</span><strong>${result.minBpm} – ${result.maxBpm} BPM</strong></div>
  <div class="stat"><span>Total breaths</span><strong>${result.breaths}</strong></div>
  <div class="stat"><span>Duration</span><strong>${result.durationSec}s</strong></div>
</div>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `willow-assessment-${ts}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [state, setState] = useState<AppState>("idle");
  const [echoOff, setEchoOff] = useState(true);
  const [noiseOff, setNoiseOff] = useState(true);
  const [gainOff, setGainOff] = useState(true);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(() => {
    return localStorage.getItem("willow-avatar");
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
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

  useEffect(() => {
    if (assessmentResult && state === "monitoring") {
      stop();
      setState("idle");
    }
  }, [assessmentResult, state, stop]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      localStorage.setItem("willow-avatar", dataUrl);
      setAvatarDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarReset = () => {
    localStorage.removeItem("willow-avatar");
    setAvatarDataUrl(null);
  };

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
      <div className="header">
        <div
          className={`avatar-wrapper${avatarDataUrl ? " has-photo" : ""}`}
          onClick={handleAvatarClick}
          onContextMenu={(e) => { e.preventDefault(); handleAvatarReset(); }}
          title="Click to upload photo, right-click to reset"
        >
          {avatarDataUrl ? (
            <img src={avatarDataUrl} alt="Willow" className="avatar-photo" />
          ) : (
            "\uD83D\uDC36"
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="avatar-input"
            onChange={handleAvatarFile}
          />
        </div>
        <div className="header-text">
          <div className="header-name">Willow</div>
          <div className="header-breed">senior pom &middot; resting</div>
        </div>
      </div>
      <div className="bpm-display">
        <span className="bpm-value">{bpm ?? "--"}</span>
        <span className="bpm-label">BPM</span>
      </div>
      <div className="waveform-container">
        <EnvelopeVisualizer
          rmsEnergy={rmsEnergy}
          floor={floor}
          calibration={calibration}
          breathCount={breathCount}
          breathFrameCounter={breathFrameCounter}
          active={state === "monitoring"}
        />
      </div>
      <div className="stats-pills">
        <div className="stat-pill">
          <div className="pill-value" style={{ color: "var(--color-text-muted)" }}>{Math.round(calibration.floor)}</div>
          <div className="pill-label">floor</div>
        </div>
        {calibration.initialized && (
          <div className="stat-pill">
            <div className="pill-value" style={{ color: "var(--color-warning)" }}>{Math.round(calibration.calibratedMagnitude)}</div>
            <div className="pill-label">mag</div>
          </div>
        )}
        <div className="stat-pill">
          <div className="pill-value" style={{ color: "var(--color-accent)" }}>{calibration.peakCount}</div>
          <div className="pill-label">peaks</div>
        </div>
        <div className="stat-pill">
          <div className="pill-value" style={{ color: "var(--color-success)" }}>{breathCount}</div>
          <div className="pill-label">breaths</div>
        </div>
      </div>
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
            <AssessmentWaveform result={assessmentResult} canvasRef={waveformCanvasRef} />
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
            <div className="report-actions">
              <button className="download-btn" onClick={() => downloadAssessmentJson(assessmentResult)}>
                JSON
              </button>
              <button className="download-btn" onClick={() => downloadAssessmentCsv(assessmentResult)}>
                CSV
              </button>
              <button className="download-btn" onClick={() => downloadAssessmentHtml(assessmentResult, waveformCanvasRef.current)}>
                HTML
              </button>
              <button className="toggle-btn" onClick={dismissAssessment}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
