# AGENTS.md

Instructions for AI coding agents working on this repository.

## Build / Lint / Test

```bash
npm run build          # tsc -b && vite build
npm run dev            # vite dev server
npm run lint           # eslint .
npm run test:unit      # vitest run
npm test               # playwright test (E2E)
```

Always run `npm run build` before declaring work complete. It runs `tsc -b` (strict typecheck) then `vite build`.

## Architecture

```
Microphone → AudioManager (Web Audio API, highpass 100Hz, fftSize 2048)
           → BreathDetector (sustained-energy RMS algorithm)
           → useBreathMonitor hook (React state bridge)
           → App + EnvelopeVisualizer (canvas + controls)
```

## Key files

| File | Purpose |
|---|---|
| `src/audio/AudioManager.ts` | Web Audio graph setup, rAF loop, stream access |
| `src/audio/BreathDetector.ts` | Sustained-above-threshold breath detection |
| `src/audio/index.ts` | Barrel export |
| `src/hooks/useBreathMonitor.ts` | React hook: wires audio → detector → state, recording, assessment |
| `src/components/EnvelopeVisualizer.tsx` | Canvas waveform, floor line, breath span highlights |
| `src/App.tsx` | Top-level UI: BPM display, controls, recording, assessment report |
| `RespiratoryRateMonitor_spec.md` | Full specification document |

## Detection algorithm

Sustained-above-threshold (NOT peak-based). Key parameters in `BreathDetector.ts`:

- **Floor**: slow EMA (α=0.001) tracking ambient noise; only updates when RMS < floor × 1.5
- **Threshold**: `max(floor × 1.5, floor + 0.3)`
- **Onset**: RMS must stay above threshold for 25 consecutive frames (~400ms)
- **Offset**: breath ends after RMS below threshold for 15 frames (~250ms)
- **Refractory**: 1500ms cooldown after confirmation
- **BPM**: rolling average of last 5 breath intervals; null if >10s stale

## Coding conventions

- No comments unless explaining non-obvious behavior
- React 19 with hooks, functional components only
- TypeScript strict mode enabled via `tsc -b`
- Refs for time-critical values accessed in rAF loops (avoid stale closures)
- State for UI-reactive values
- Dark theme: `#121212` bg, `#1e1e1e` cards, `#4fc3f7` accent, `#4ade80` success

## Testing

- Unit tests (`BreathDetector.test.ts`) use Vitest. Test all detection states: floor init, sustained detection, spike rejection, refractory, BPM, reset.
- E2E tests use Playwright with `permissions: ['microphone']` fixture.
