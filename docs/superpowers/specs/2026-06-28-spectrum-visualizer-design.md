# Spectrum Visualizer — Design

## Goal
Add a real-time frequency spectrum visualization (animated FFT bar chart) to the breathing monitor UI, showing live audio energy across frequency bins so the user can see breath activity and verify the 150Hz lowpass filter is correctly isolating breath rumbles from ambient noise.

## Approach
- **`SpectrumVisualizer`** component renders a `<canvas>` bar chart driven by the `Uint8Array` from `AnalyserNode.getByteFrequencyData()`.
- The same `requestAnimationFrame` loop that feeds the `BreathDetector` also pushes the raw frequency buffer to React state, which `SpectrumVisualizer` reads to paint the canvas each frame.
- Bars use `#4fc3f7` (cyan) on `#121212` background to match the existing dark theme.
- X-axis labels mark `0Hz` and `150Hz` (the lowpass cutoff); the first 5 bins (used by the detection algorithm) get a subtle brightness boost.
- Placed between the BPM display and status label, max-width constrained to 600px.

## Data flow changes
- `useBreathMonitor` already reads `getFrequencyData()` internally. Expose `frequencyData` in the return value alongside `bpm`, `start`, `stop`.
- `App` passes `frequencyData` to `<SpectrumVisualizer>` as a prop.

## Visual spec
- Canvas height: 120px, width: 100% of container (max 600px)
- Horizontal grid lines at `y=0`, `y=height/4`, `y=height/2`, `y=height*3/4`, `y=height` in `#333`
- Bar width: dynamically calculated based on bin count and canvas width, with 1px gap
- Low bins (0–4) rendered at full opacity; higher bins rendered at 60% opacity to draw attention to the breathing band
