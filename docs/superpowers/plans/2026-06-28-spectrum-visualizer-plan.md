# Spectrum Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-time frequency spectrum bar chart visualization to the breathing monitor UI.

**Architecture:** A new `SpectrumVisualizer` React component renders a `<canvas>` bar chart from `Uint8Array` frequency data. The `useBreathMonitor` hook is extended to expose the raw frequency buffer alongside BPM. App wires it between the BPM display and status label.

**Tech Stack:** React, TypeScript, Canvas 2D API, Web Audio API (data already captured)

---

### Task 1: Expose frequency data from useBreathMonitor

**Files:**
- Modify: `src/hooks/useBreathMonitor.ts`

- [ ] **Step 1: Add frequencyData state and expose it**

Change `useBreathMonitor` to also track and expose the raw `Uint8Array` from the analyser.

In `src/hooks/useBreathMonitor.ts`, add a second state:

```typescript
import { useRef, useState, useCallback } from "react";
import { AudioManager, BreathDetector } from "../audio";

export function useBreathMonitor() {
  const [bpm, setBpm] = useState<number | null>(null);
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(0));
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
      setFrequencyData(new Uint8Array(data));

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
    setFrequencyData(new Uint8Array(0));
  }, []);

  return { bpm, frequencyData, start, stop };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc -b`
Expected: No errors.

---

### Task 2: Create SpectrumVisualizer component

**Files:**
- Create: `src/components/SpectrumVisualizer.tsx`
- Create: `src/components/SpectrumVisualizer.css`

- [ ] **Step 1: Create SpectrumVisualizer.css**

```css
.spectrum-container {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

.spectrum-canvas {
  display: block;
  width: 100%;
  height: 120px;
  border-radius: 4px;
}

.spectrum-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  color: #666;
  padding: 0.25rem 0;
}
```

- [ ] **Step 2: Create SpectrumVisualizer.tsx**

```tsx
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
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc -b`
Expected: No errors.

---

### Task 3: Wire SpectrumVisualizer into App

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import and render SpectrumVisualizer between BPM and status label**

In `src/App.tsx`, add the import and render the component:

```tsx
import { useState } from "react";
import { useBreathMonitor } from "./hooks/useBreathMonitor";
import { SpectrumVisualizer } from "./components/SpectrumVisualizer";
import "./App.css";
```

And in the JSX, between the `.bpm-display` div and the `.state-label`:

```tsx
      <SpectrumVisualizer frequencyData={frequencyData} />
```

Full updated `App.tsx`:

```tsx
import { useState } from "react";
import { useBreathMonitor } from "./hooks/useBreathMonitor";
import { SpectrumVisualizer } from "./components/SpectrumVisualizer";
import "./App.css";

type AppState =
  | "idle"
  | "requesting"
  | "monitoring"
  | "error";

function App() {
  const [state, setState] = useState<AppState>("idle");
  const { bpm, frequencyData, start, stop } = useBreathMonitor();

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
    error: "Microphone access denied. Please allow microphone access and try again.",
  };

  return (
    <div className="container">
      <h1 className="title">Willow</h1>
      <div className="bpm-display">
        <span className="bpm-value">{bpm ?? "--"}</span>
        <span className="bpm-label">BPM</span>
      </div>
      <SpectrumVisualizer frequencyData={frequencyData} />
      <p className="state-label">{stateLabels[state]}</p>
      <button
        className={`toggle-btn ${state === "monitoring" ? "active" : ""}`}
        onClick={handleToggle}
        disabled={state === "requesting"}
      >
        {state === "monitoring" ? "Stop Monitoring" : "Start Monitoring"}
      </button>
      {state === "error" && (
        <button
          className="toggle-btn"
          onClick={() => setState("idle")}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc -b`
Expected: No errors.

- [ ] **Step 3: Run production build**

Run: `npx vite build`
Expected: Build completes successfully.

---

### Task 4: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add src/hooks/useBreathMonitor.ts src/components/SpectrumVisualizer.tsx src/components/SpectrumVisualizer.css src/App.tsx
git commit -m "feat: add real-time frequency spectrum visualization"
```
