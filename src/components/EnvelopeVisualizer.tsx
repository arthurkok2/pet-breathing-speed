import { useRef, useEffect } from "react";
import type { CalibrationState } from "../audio/BreathDetector";
import "./EnvelopeVisualizer.css";

interface EnvelopeVisualizerProps {
  rmsEnergy: number;
  floor: number;
  calibration: CalibrationState;
  breathCount: number;
  breathFrameCounter: number;
  active: boolean;
}

const HISTORY_LENGTH = 600;
const Y_MIN_CEILING = 1.0;
const BREATH_SPAN_BACKTRACK = 30;

interface BreathSpan {
  start: number;
  end: number;
}

export function EnvelopeVisualizer({
  rmsEnergy,
  floor,
  breathFrameCounter,
  active,
}: EnvelopeVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<Float64Array>(new Float64Array(HISTORY_LENGTH));
  const historyIndexRef = useRef(0);
  const historyCountRef = useRef(0);
  const absoluteFrameRef = useRef(0);
  const rmsRef = useRef(0);
  const floorRef = useRef(0);
  const yMaxRef = useRef(Y_MIN_CEILING);
  const breathSpansRef = useRef<BreathSpan[]>([]);
  const lastCounterRef = useRef(0);
  const accentRef = useRef("#9b7ec4");
  const successRef = useRef("#7ec89a");
  const warningRef = useRef("#f0a08c");
  const surfaceRef = useRef("#fae8dd");

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    accentRef.current = style.getPropertyValue("--color-accent").trim() || "#9b7ec4";
    successRef.current = style.getPropertyValue("--color-success").trim() || "#7ec89a";
    warningRef.current = style.getPropertyValue("--color-warning").trim() || "#f0a08c";
    surfaceRef.current = style.getPropertyValue("--color-surface").trim() || "#fae8dd";
  });

  useEffect(() => {
    if (!active) return;

    let rafId: number;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const arr = historyRef.current;
      arr[historyIndexRef.current] = rmsRef.current;
      historyIndexRef.current = (historyIndexRef.current + 1) % HISTORY_LENGTH;
      absoluteFrameRef.current++;
      if (historyCountRef.current < HISTORY_LENGTH) {
        historyCountRef.current++;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const accentColor = accentRef.current;
      const successColor = successRef.current;
      const warningColor = warningRef.current;
      const surfaceColor = surfaceRef.current;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;

      ctx.fillStyle = surfaceColor;
      ctx.fillRect(0, 0, w, h);

      const history = historyRef.current;
      const count = historyCountRef.current;
      const startIdx = historyIndexRef.current;

      let peak = Y_MIN_CEILING;
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const idx = (startIdx - count + i + HISTORY_LENGTH) % HISTORY_LENGTH;
          if (history[idx] > peak) peak = history[idx];
        }
      }
      const yMax = yMaxRef.current * 0.3 + peak * 0.7;

      if (Math.abs(yMax - yMaxRef.current) > 0.01 || yMaxRef.current === Y_MIN_CEILING) {
        yMaxRef.current = yMax;
      }

      const scale = yMaxRef.current;

      if (count > 1) {
        const visibleEnd = absoluteFrameRef.current - 1;
        const visibleStart = visibleEnd - count + 1;

        for (const span of breathSpansRef.current) {
          if (span.end < visibleStart || span.start > visibleEnd) continue;

          const s = Math.max(span.start, visibleStart);
          const e = Math.min(span.end, visibleEnd);
          const x1 = ((s - visibleStart) / (count - 1)) * w;
          const x2 = ((e - visibleStart) / (count - 1)) * w;

          ctx.fillStyle = `${successColor}12`;
          ctx.fillRect(x1, 0, x2 - x1, h);

          ctx.strokeStyle = `${successColor}40`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x1, 0);
          ctx.lineTo(x1, h);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x2, 0);
          ctx.lineTo(x2, h);
          ctx.stroke();
        }
      }

      ctx.strokeStyle = `${accentColor}0D`;
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = h - (scale * (i / 4)) / scale * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const f = floorRef.current;
      if (f > 0) {
        const fy = h - (f / scale) * h;
        ctx.strokeStyle = `${warningColor}66`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.moveTo(0, fy);
        ctx.lineTo(w, fy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (count > 1) {
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();

        for (let i = 0; i < count; i++) {
          const idx = (startIdx - count + i + HISTORY_LENGTH) % HISTORY_LENGTH;
          const x = (i / (count - 1)) * w;
          const y = h - (history[idx] / scale) * h;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  useEffect(() => {
    rmsRef.current = rmsEnergy;
  });

  useEffect(() => {
    floorRef.current = floor;
  }, [floor]);

  useEffect(() => {
    if (breathFrameCounter !== lastCounterRef.current) {
      lastCounterRef.current = breathFrameCounter;
      const spans = breathSpansRef.current;
      const end = absoluteFrameRef.current;
      spans.push({ start: end - BREATH_SPAN_BACKTRACK, end });
      if (spans.length > 50) spans.shift();
    }
  }, [breathFrameCounter]);

  useEffect(() => {
    if (!active) {
      breathSpansRef.current = [];
      lastCounterRef.current = 0;
    }
  }, [active]);

  return (
    <div className="envelope-container">
      <canvas ref={canvasRef} className="envelope-canvas" />
    </div>
  );
}
