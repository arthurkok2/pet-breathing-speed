# RMS-Based Breath Detection Redesign

**Date:** 2026-06-29
**Status:** Approved

## Overview

Redesign the detection pipeline from a lowpass/FFT-bin approach to a highpass/RMS-energy approach with a self-calibrating threshold and formal state machine. The core motivation: the original spec called for isolating low-frequency breath rumble via a 150Hz lowpass, but in practice the acoustic environment has a persistent 88Hz mechanical drone that passes through the lowpass. Willow's breath registers as broadband turbulence concentrated above 500Hz. The new approach highpass-filters to remove the drone, then tracks RMS energy in the time domain with an adaptive noise floor.

---

## 1. Audio Pipeline

**Current graph:**
```
Mic -> Source -> BiquadFilter(lowpass 150Hz) -> AnalyserNode(fftSize=2048)
                                                      |
                                              getByteFrequencyData()
                                              (2048 FFT bins, uint8)
```

**New graph:**
```
Mic -> Source -> BiquadFilter(highpass 250Hz) -> AnalyserNode(fftSize=2048)
                                                       |
                                               getByteTimeDomainData()
                                               (2048 samples, uint8)
```

Changes to `AudioManager.ts`:
- Filter type: `"lowpass"` -> `"highpass"`
- Filter frequency: `150` -> `250` Hz
- Data method: `getByteFrequencyData()` -> `getByteTimeDomainData()` (renamed to `getTimeDomainData()`)
- Removed: `minDecibels`, `maxDecibels`, `smoothingTimeConstant` (only affect frequency-domain output)
- `fftSize=2048` stays — yields ~46ms of waveform at 44.1kHz sample rate, close to the 50ms target window

**RMS formula** (computed in TypeScript each frame):
```
RMS = sqrt( (1/N) * sum( (sample[i] - 128)^2 ) )
```
Uint8 samples are centered at 128 (zero crossing). Subtract 128 to get signed float amplitudes, square, average, square root.

**Loop:** `requestAnimationFrame` drives the cycle. The `AnalyserNode` buffers between frames automatically.

---

## 2. Noise Floor & Self-Calibrating Threshold

### Ring Buffer

A circular buffer holds the last **600 RMS values** (~10 seconds at ~60fps rAF).

### Noise Floor Extraction

Every 250ms (measured by timestamps passed into `update()`, approx 15 frames at 60fps), sort the buffer and take the **bottom 20th percentile** — the values representing silence background. Compute:

```
mu_floor = mean(lowest 20%)
sigma_floor = stddev(lowest 20%)
```

### Dynamic Threshold

```
Threshold = mu_floor + alpha * sigma_floor
```

Where `alpha` is a tunable sensitivity multiplier, starting at **3.0**.

### Admission Rule (Contamination Prevention)

Only push the current RMS value into the ring buffer if it falls **below the current threshold**. Values above threshold (breath in progress) are discarded to prevent the signal from inflating the baseline.

### Ambient Adaptation

Values naturally age out of the ring buffer as new ones arrive. If the room gets louder (fan on), old quiet values expire, the bottom 20th percentile rises, and the threshold adapts within ~10 seconds. No special decay logic.

### Clamps

- Minimum threshold: `5`
- Maximum threshold: `200`

---

## 3. Detection State Machine

Three states:

```
                 RMS > threshold
    WAITING ----------------------> INHALING
       ^                               |     |
       |                               |     | RMS drops < 200ms
       |   500ms elapsed               |     | -> impulse noise, discarded
       |                               |     v
       +------- REFRACTORY <-----------+
                  valid breath (>= 200ms)
```

| State | Trigger | Exit Condition |
|-------|---------|----------------|
| **WAITING** | RMS < threshold | RMS crosses above threshold -> INHALING |
| **INHALING** | RMS > threshold | RMS stays above for >= 200ms -> valid breath -> REFRACTORY |
| | | RMS drops before 200ms -> impulse noise -> WAITING |
| **REFRACTORY** | Valid breath completed | 500ms elapsed -> WAITING |

The "INHALING" state name is approximate — in practice the detector fires on the acoustic phase of the exhale (turbulence).

### Secondary Gate: Adaptive Debounce

After the state machine confirms a breath, an additional debounce gate is checked:

```
Debounce = clamp(avgInterval * 0.45, 200ms, 3000ms)
```

If less than `Debounce` ms have passed since the last confirmed breath's threshold crossing, the detection is suppressed. The 500ms refractory period is the absolute minimum; the adaptive debounce provides a physiologically-informed lockout that scales with breathing rate.

---

## 4. BPM Calculation

When a breath is confirmed (INHALING -> REFRACTORY transition), record the timestamp of the **threshold crossing** (WAITING -> INHALING transition), not the end of the breath.

### Rolling Interval Array

Last **5 inter-breath intervals** in milliseconds.

### BPM Formula

```
BPM = Math.round(60000 / avgInterval)
```

### Staleness

BPM resets to `null` if **no breath detected for 10 seconds** (data too stale).

---

## 5. Visualization: Envelope Trace

Replace `SpectrumVisualizer` with `EnvelopeVisualizer`.

### Canvas Layout

- **Dimensions:** 600px x 200px, dark background (`#121212`)
- **X-axis:** Time (last 10 seconds), scrolling right to left
- **Y-axis:** RMS energy amplitude (0-255 range, auto-scaled)

### Traces

| Trace | Color | Style | Source |
|-------|-------|-------|--------|
| RMS energy line | `#4fc3f7` cyan | 1.5px solid | Per-frame RMS values |
| Dynamic threshold | `rgba(255, 167, 38, 0.7)` orange | 1px dashed | `mu_floor + alpha * sigma_floor` |
| Noise floor | `rgba(255, 255, 255, 0.3)` white | 1px dotted | `mu_floor` |

### Rendering

Maintain a 600-point ring buffer of recent RMS values (one per rAF frame). Redraw full chart each frame via `requestAnimationFrame`.

### Stats Bar (below canvas)

Calibrated/Calibrating status, noise floor value, threshold value, debounce ms, breath count.

---

## 6. File Changes

### Modified

| File | Changes |
|------|---------|
| `src/audio/AudioManager.ts` | Highpass filter, time-domain data, remove dB config |
| `src/audio/BreathDetector.ts` | Full rewrite: RMS, ring buffer, state machine, adaptive debounce |
| `src/hooks/useBreathMonitor.ts` | Updated interface, time-domain data pass-through |
| `src/App.tsx` | SpectrumVisualizer -> EnvelopeVisualizer |
| `src/App.css` | Visualizer class name update |

### Created

| File | Purpose |
|------|---------|
| `src/components/EnvelopeVisualizer.tsx` | Canvas: energy trace, threshold, noise floor, stats |
| `src/components/EnvelopeVisualizer.css` | Container styles |

### Removed

| File |
|------|
| `src/components/SpectrumVisualizer.tsx` |
| `src/components/SpectrumVisualizer.css` |

### Unchanged

`src/main.tsx`, `src/index.css`, `src/audio/index.ts`, `vite.config.ts`, `index.html`, `package.json`, CI workflow.

---

## 7. Data Flow

```
AudioManager.getTimeDomainData() -> Uint8Array (2048 samples)
        |
        v
BreathDetector.update(data, timestamp)
        |
        +-- Computes RMS
        +-- Updates ring buffer (admission rule)
        +-- Runs state machine
        +-- Calculates BPM
        |
        v
Returns { bpm, rmsEnergy, pulseDetected, calibration }
        |
        v
useBreathMonitor hook -> App -> EnvelopeVisualizer
                                    |
                        RMS values buffered for canvas
```

---

## 8. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Mic permission denied | Error state with dismiss button (preserved) |
| AudioContext creation failure | Error state (preserved) |
| Browser lacks getUserMedia | Handled (preserved) |
| No breaths detected | BPM shows `--`; envelope trace renders ambient noise |
| Sudden loud noise (bark, drop) | 200ms min-duration gate rejects it |
| Room gets permanently louder | Ring buffer ages out quiet values in ~10s; threshold rises |
| Room gets permanently quieter | Threshold drops as buffer adapts |
| Mic unplugged / stream ends | `MediaStreamTrack.onended` -> auto-stop -> idle state with error |

### Non-Goals (YAGNI)

- Inhale vs. exhale discrimination
- Apnea alerts or duration tracking
- Audio recording or persistence
