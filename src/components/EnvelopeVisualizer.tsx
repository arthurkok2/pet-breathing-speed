import { useRef, useEffect, useCallback } from "react";
import type { CalibrationState } from "../audio/BreathDetector";
import "./EnvelopeVisualizer.css";

interface EnvelopeVisualizerProps {
  rmsEnergy: number;
  threshold: number;
  noiseFloor: number;
  calibration: CalibrationState;
  breathCount: number;
  active: boolean;
}

const HISTORY_LENGTH = 600;

export function EnvelopeVisualizer({
  rmsEnergy,
  threshold,
  noiseFloor,
  calibration,
  breathCount,
  active,
}: EnvelopeVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<Float64Array>(new Float64Array(HISTORY_LENGTH));
  const historyIndexRef = useRef(0);
  const historyCountRef = useRef(0);

  const thresholdRef = useRef(threshold);
  const noiseFloorRef = useRef(noiseFloor);

  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  useEffect(() => {
    noiseFloorRef.current = noiseFloor;
  }, [noiseFloor]);

  const pushValue = useCallback((value: number) => {
    const arr = historyRef.current;
    arr[historyIndexRef.current] = value;
    historyIndexRef.current = (historyIndexRef.current + 1) % HISTORY_LENGTH;
    if (historyCountRef.current < HISTORY_LENGTH) {
      historyCountRef.current++;
    }
  }, []);

  useEffect(() => {
    if (!active) return;

    let rafId: number;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

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

      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = (h / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const history = historyRef.current;
      const count = historyCountRef.current;
      const startIdx = historyIndexRef.current;

      if (count > 1) {
        ctx.strokeStyle = "#4fc3f7";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();

        for (let i = 0; i < count; i++) {
          const idx = (startIdx - count + i + HISTORY_LENGTH) % HISTORY_LENGTH;
          const x = (i / (count - 1)) * w;
          const y = h - (history[idx] / 128) * h;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      const t = thresholdRef.current;
      const nf = noiseFloorRef.current;

      if (t > 0) {
        const threshY = h - (t / 128) * h;
        ctx.strokeStyle = "rgba(255, 167, 38, 0.7)";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, threshY);
        ctx.lineTo(w, threshY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "rgba(255, 167, 38, 0.9)";
        ctx.font = "9px monospace";
        ctx.textAlign = "right";
        ctx.fillText("threshold", w - 4, threshY - 3);
      }

      if (nf > 0) {
        const floorY = h - (nf / 128) * h;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 0.5;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(0, floorY);
        ctx.lineTo(w, floorY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.font = "9px monospace";
        ctx.textAlign = "right";
        ctx.fillText("floor", w - 4, floorY - 3);
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  useEffect(() => {
    pushValue(rmsEnergy);
  }, [rmsEnergy, pushValue]);

  return (
    <div className="envelope-container">
      <canvas ref={canvasRef} className="envelope-canvas" />
      <div className="envelope-stats">
        <span
          className={`status ${calibration.initialized ? "calibrated" : "calibrating"}`}
        >
          {calibration.initialized ? "calibrated" : "calibrating..."}
        </span>
        <span className="stat">
          thresh <strong>{Math.round(calibration.threshold)}</strong>
        </span>
        <span className="stat">
          floor <strong>{Math.round(calibration.noiseFloor)}</strong>
        </span>
        <span className="stat">
          debounce{" "}
          <strong>{(calibration.debounceMs / 1000).toFixed(1)}s</strong>
        </span>
        <span className="stat">
          breaths <strong>{breathCount}</strong>
        </span>
      </div>
    </div>
  );
}
