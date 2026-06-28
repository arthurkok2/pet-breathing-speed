import { useRef, useEffect } from "react";
import "./SpectrumVisualizer.css";

interface SpectrumVisualizerProps {
  frequencyData: Uint8Array;
}

const LOW_BINS = 5;

export function SpectrumVisualizer({ frequencyData }: SpectrumVisualizerProps) {
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
  }, [frequencyData]);

  return (
    <div className="spectrum-container">
      <canvas ref={canvasRef} className="spectrum-canvas" />
      <div className="spectrum-labels">
        <span>0Hz</span>
        <span>150Hz</span>
      </div>
    </div>
  );
}
