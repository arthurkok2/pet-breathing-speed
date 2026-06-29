import { useRef, useEffect } from "react";
import type { CalibrationState } from "../audio/BreathDetector";
import "./SpectrumVisualizer.css";

interface SpectrumVisualizerProps {
  frequencyData: Uint8Array;
  energy: number;
  calibration: CalibrationState;
}

const LOW_BINS = 5;

export function SpectrumVisualizer({
  frequencyData,
  energy,
  calibration,
}: SpectrumVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || frequencyData.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const binCount = frequencyData.length;
    const barGap = 1;
    const barWidth = (w - barGap * (binCount - 1)) / binCount;

    for (let i = 0; i < binCount; i++) {
      const amplitude = frequencyData[i] / 255;
      const barHeight = amplitude * h;
      const x = i * (barWidth + barGap);
      const y = h - barHeight;

      const isLowBin = i < LOW_BINS;
      ctx.fillStyle = isLowBin
        ? `rgba(79, 195, 247, ${0.5 + amplitude * 0.5})`
        : `rgba(79, 195, 247, ${amplitude * 0.6})`;

      ctx.fillRect(x, y, barWidth, barHeight);
    }

    if (calibration.initialized) {
      const thresholdY = h - (calibration.threshold / 255) * h;
      const noiseFloorY = h - (calibration.noiseFloor / 255) * h;

      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(255, 152, 0, 0.7)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, thresholdY);
      ctx.lineTo(w, thresholdY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(255, 152, 0, 0.9)";
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      ctx.fillText("threshold", w - 4, thresholdY - 3);

      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, noiseFloorY);
      ctx.lineTo(w, noiseFloorY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const energyY = h - (energy / 255) * h;
    ctx.strokeStyle = energy > calibration.threshold ? "#4ade80" : "rgba(79, 195, 247, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, energyY);
    ctx.lineTo(w, energyY);
    ctx.stroke();
    ctx.fillStyle = energy > calibration.threshold ? "#4ade80" : "rgba(79, 195, 247, 0.6)";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`energy ${Math.round(energy)}`, 4, energyY - 3);
  }, [frequencyData, energy, calibration]);

  return (
    <div className="spectrum-container">
      <canvas ref={canvasRef} className="spectrum-canvas" />
      <div className="spectrum-labels">
        <span>0Hz</span>
        <span>150Hz</span>
      </div>
      <div className="calibration-stats">
        <span className={`cal-status ${calibration.initialized ? "ready" : "calibrating"}`}>
          {calibration.initialized ? "calibrated" : "calibrating..."}
        </span>
        <span className="cal-value">
          thresh <strong>{Math.round(calibration.threshold)}</strong>
        </span>
        <span className="cal-value">
          floor <strong>{Math.round(calibration.noiseFloor)}</strong>
        </span>
        <span className="cal-value">
          debounce <strong>{(calibration.debounceMs / 1000).toFixed(1)}s</strong>
        </span>
      </div>
    </div>
  );
}
