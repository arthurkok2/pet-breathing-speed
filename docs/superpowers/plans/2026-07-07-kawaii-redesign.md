# Kawaii UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Willow respiratory monitor UI from dark monospace minimal to a kawaii-style pastel interface with system light/dark mode, rounded shapes, pet-themed avatar upload, and pill-shaped stats cards.

**Architecture:** CSS custom properties on `:root` drive both light and dark themes via `prefers-color-scheme`. Canvas code reads theme colors via `getComputedStyle` at draw time. No new React components — all structural changes happen inline in existing files. No algorithm or audio changes.

**Tech Stack:** React 19, TypeScript, Vite 6, Quicksand (Google Fonts), CSS custom properties, localStorage for avatar

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `index.html` | Modify | Replace Vite favicon with inline paw SVG |
| `src/index.css` | Rewrite | Quicksand import, `:root` custom properties, dark mode override, body reset |
| `src/App.css` | Rewrite | All component styles using custom properties |
| `src/App.tsx` | Modify | Avatar header JSX, pill stats, avatar upload logic |
| `src/components/EnvelopeVisualizer.tsx` | Modify | Canvas colors read from CSS custom properties |
| `src/components/EnvelopeVisualizer.css` | Modify | Remove stats bar styles (moved to App.css) |

---

### Task 1: CSS Theme System

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Replace src/index.css**

Replace the contents of `src/index.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap');

:root {
  --color-bg: #fef5f0;
  --color-surface: #fae8dd;
  --color-text: #5a4a5e;
  --color-text-secondary: #a88ab0;
  --color-text-muted: #b0a0b8;
  --color-accent: #9b7ec4;
  --color-success: #7ec89a;
  --color-warning: #f0a08c;
  --color-danger: #c9445a;
  --color-border: #e8d5d0;
  --radius-container: 14px;
  --radius-card: 12px;
  --radius-button: 20px;
  --avatar-gradient-from: #d4b8e8;
  --avatar-gradient-to: #f0c4a6;
  --shadow-avatar: 0 2px 8px rgba(155, 126, 196, 0.2);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1a1a2e;
    --color-surface: #232340;
    --color-text: #e8d5f5;
    --color-text-secondary: #b8a0cc;
    --color-text-muted: #8a7a9e;
    --color-accent: #c4a6f7;
    --color-success: #a6f0c4;
    --color-warning: #f0c4a6;
    --color-danger: #e0556a;
    --color-border: #2e2e4a;
    --avatar-gradient-from: #c4a6f7;
    --avatar-gradient-to: #f0c4a6;
    --shadow-avatar: 0 2px 8px rgba(196, 166, 247, 0.2);
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body,
#root {
  height: 100%;
  width: 100%;
}

body {
  font-family: "Quicksand", system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  background: var(--color-bg);
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: no errors. The custom properties won't be consumed yet but they must parse correctly.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: add CSS custom properties and Quicksand font for kawaii theme"
```

---

### Task 2: App.css Rewrite

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Replace src/App.css**

Replace the entire contents of `src/App.css`:

```css
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  gap: 1.25rem;
}

.header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.avatar-wrapper {
  width: 48px;
  height: 48px;
  min-width: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--avatar-gradient-from), var(--avatar-gradient-to));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  cursor: pointer;
  box-shadow: var(--shadow-avatar);
  overflow: hidden;
  position: relative;
  transition: transform 0.2s ease;
}

.avatar-wrapper:hover {
  transform: scale(1.05);
}

.avatar-wrapper.has-photo {
  font-size: 0;
}

.avatar-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-input {
  display: none;
}

.header-text {
  text-align: left;
}

.header-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text);
}

.header-breed {
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--color-text-muted);
}

.bpm-display {
  display: flex;
  align-items: baseline;
  gap: 1rem;
}

.bpm-value {
  font-size: 8rem;
  font-weight: 700;
  color: var(--color-accent);
  line-height: 1;
}

.bpm-label {
  font-size: 2rem;
  color: var(--color-text-muted);
  font-weight: 500;
}

.waveform-container {
  width: 100%;
  max-width: 420px;
  background: var(--color-surface);
  border-radius: var(--radius-container);
  overflow: hidden;
}

.envelope-canvas {
  display: block;
  width: 100%;
  height: 140px;
}

.stats-pills {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  width: 100%;
  max-width: 420px;
}

.stat-pill {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: 0.5rem 0.7rem;
  text-align: center;
  min-width: 55px;
  flex: 1;
}

.stat-pill .pill-value {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--color-text);
}

.stat-pill .pill-label {
  font-size: 0.6rem;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: lowercase;
}

.state-label {
  font-size: 0.8rem;
  color: var(--color-text-secondary);
  min-height: 1.2em;
  font-weight: 500;
}

.recording-bar {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
}

.toggle-btn {
  padding: 0.6rem 2.5rem;
  font-size: 0.9rem;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-button);
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
}

.toggle-btn:hover:not(:disabled) {
  border-color: var(--color-accent);
  color: var(--color-accent);
  transform: scale(1.03);
}

.toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-btn.active {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: #fff;
}

.toggle-btn.active:hover {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: #fff;
  transform: scale(1.03);
}

.record-btn {
  padding: 0.5rem 1.25rem;
  font-size: 0.85rem;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-text);
  background: transparent;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-button);
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
}

.record-btn:hover {
  border-color: var(--color-warning);
  color: var(--color-warning);
  transform: scale(1.03);
}

.record-btn.recording {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: #fff;
  animation: pulse-rec 1.5s ease-in-out infinite;
}

.record-btn.recording:hover {
  background: var(--color-danger);
  border-color: var(--color-danger);
  color: #fff;
  transform: scale(1.03);
}

@keyframes pulse-rec {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.download-btn {
  padding: 0.5rem 1.25rem;
  font-size: 0.85rem;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-text-muted);
  background: transparent;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-button);
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.download-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
  transform: scale(1.03);
}

.assess-btn {
  padding: 0.5rem 1.25rem;
  font-size: 0.85rem;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-success);
  background: transparent;
  border: 2px solid var(--color-success);
  border-radius: var(--radius-button);
  cursor: pointer;
  transition: transform 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.assess-btn:hover {
  background: var(--color-success);
  color: var(--color-bg);
  transform: scale(1.03);
}

.assess-btn.cancel {
  color: var(--color-warning);
  border-color: var(--color-warning);
}

.assess-btn.cancel:hover {
  background: var(--color-warning);
  color: var(--color-bg);
}

.audio-toggles {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: 100%;
  max-width: 320px;
}

.audio-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  cursor: pointer;
  font-weight: 500;
}

.audio-toggle input[type="checkbox"] {
  appearance: none;
  width: 32px;
  height: 18px;
  background: var(--color-border);
  border-radius: 9px;
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
}

.audio-toggle input[type="checkbox"]::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: var(--color-text-muted);
  border-radius: 50%;
  transition: all 0.2s;
}

.audio-toggle input[type="checkbox"]:checked {
  background: var(--color-accent);
}

.audio-toggle input[type="checkbox"]:checked::after {
  left: 16px;
  background: var(--color-bg);
}

.audio-toggle span {
  user-select: none;
}

.report-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.report-card {
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-container);
  padding: 2rem;
  text-align: center;
  min-width: 320px;
  max-width: 420px;
  width: 90vw;
}

.report-card h2 {
  font-size: 1rem;
  font-weight: 500;
  color: var(--color-success);
  text-transform: uppercase;
  letter-spacing: 0.15em;
  margin: 0 0 1.5rem;
}

.report-stat {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.report-value {
  font-size: 4rem;
  font-weight: 700;
  color: var(--color-accent);
  line-height: 1;
}

.report-label {
  font-size: 1.25rem;
  color: var(--color-text-muted);
  font-weight: 500;
}

.report-details {
  border-top: 1px solid var(--color-border);
  padding-top: 1rem;
  margin-bottom: 1.5rem;
}

.report-row {
  display: flex;
  justify-content: space-between;
  padding: 0.4rem 0;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.report-row strong {
  color: var(--color-text);
  font-weight: 600;
}

.report-canvas {
  display: block;
  width: 100%;
  height: 140px;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.report-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  flex-wrap: wrap;
}

.report-actions .toggle-btn {
  padding: 0.5rem 1.25rem;
  font-size: 0.85rem;
}

.report-actions .download-btn {
  padding: 0.5rem 1.25rem;
  font-size: 0.85rem;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-text-muted);
  background: transparent;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-button);
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.report-actions .download-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
  transform: scale(1.03);
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: no errors. Styles won't be visually correct yet because the JSX hasn't been updated, but the build should pass.

- [ ] **Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat: rewrite App.css with kawaii pill shapes and theme variables"
```

---

### Task 3: Favicon Update

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Read current index.html**

Read `index.html` to find the current favicon line.

- [ ] **Step 2: Replace favicon link with inline paw SVG**

Replace the existing `<link rel="icon" ...>` line with:

```html
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='10' cy='9' r='3.5' fill='%239b7ec4'/><circle cx='22' cy='9' r='3.5' fill='%239b7ec4'/><circle cx='7' cy='19' r='3.5' fill='%239b7ec4'/><circle cx='25' cy='19' r='3.5' fill='%239b7ec4'/><ellipse cx='16' cy='21' rx='7' ry='6' fill='%239b7ec4'/></svg>">
```

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: replace favicon with paw SVG"
```

---

### Task 4: Canvas Colors (EnvelopeVisualizer)

**Files:**
- Modify: `src/components/EnvelopeVisualizer.tsx`

- [ ] **Step 1: Update canvas draw colors**

In the `draw` function inside the `useEffect`, replace all hardcoded color values. The current lines and their replacements:

**Line 71** — canvas background
```typescript
// Replace:
ctx.fillStyle = "#121212";
// With:
const style = getComputedStyle(document.documentElement);
ctx.fillStyle = style.getPropertyValue("--color-surface").trim() || "#fae8dd";
```

**Line 105** — breath span fill
```typescript
// Replace:
ctx.fillStyle = "rgba(74, 222, 128, 0.07)";
// With:
const successColor = style.getPropertyValue("--color-success").trim() || "#7ec89a";
ctx.fillStyle = `${successColor}12`; // ~7% alpha
```

**Line 108** — breath span stroke
```typescript
// Replace:
ctx.strokeStyle = "rgba(74, 222, 128, 0.25)";
// With:
ctx.strokeStyle = `${successColor}40`;
```

**Line 121** — grid lines
```typescript
// Replace:
ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
// With:
const accentColor = style.getPropertyValue("--color-accent").trim() || "#9b7ec4";
ctx.strokeStyle = `${accentColor}0D`;
```

**Line 134** — floor threshold line
```typescript
// Replace:
ctx.strokeStyle = "rgba(255, 152, 0, 0.4)";
// With:
const warningColor = style.getPropertyValue("--color-warning").trim() || "#f0a08c";
ctx.strokeStyle = `${warningColor}66`;
```

**Line 145** — waveform stroke
```typescript
// Replace:
ctx.strokeStyle = "#4fc3f7";
// With:
ctx.strokeStyle = accentColor;
```

Move the `const style = getComputedStyle(document.documentElement);` line to the top of the `draw` function (after the `if (!ctx) return;` guard) so all color reads share one call.

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/EnvelopeVisualizer.tsx
git commit -m "feat: use CSS custom properties for canvas colors in EnvelopeVisualizer"
```

---

### Task 5: EnvelopeVisualizer.css Cleanup

**Files:**
- Modify: `src/components/EnvelopeVisualizer.css`

- [ ] **Step 1: Remove stats bar styles, keep container**

Replace the contents of `src/components/EnvelopeVisualizer.css`:

```css
.envelope-container {
  width: 100%;
  max-width: 420px;
}

.envelope-canvas {
  display: block;
  width: 100%;
  height: 140px;
}
```

The stats bar styles (`.envelope-stats`, `.stat`, `.stat strong`) are removed since pill cards in App.tsx replace them.

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/EnvelopeVisualizer.css
git commit -m "feat: strip stats bar styles from EnvelopeVisualizer, move to App"
```

---

### Task 6: App.tsx Avatar Upload + JSX Restructure

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports and state for avatar upload**

Add `useRef` to the existing React import (it's already imported). Add a new state variable and ref for the avatar:

```typescript
// After the existing useState declarations (after line 177):
const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(() => {
  return localStorage.getItem("willow-avatar");
});
const fileInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 2: Add avatar click and file change handlers**

Add these functions before the `handleToggle` function (before line 218):

```typescript
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
```

- [ ] **Step 3: Replace title with avatar header**

Replace:
```tsx
<h1 className="title">Willow</h1>
```
With:
```tsx
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
```

- [ ] **Step 4: Wrap canvas in waveform container and remove stats from EnvelopeVisualizer**

The current `EnvelopeVisualizer` renders both canvas and stats. Stats are moving to App. Wrap the `EnvelopeVisualizer` in a div and remove the stats props that are no longer rendered:

Replace:
```tsx
<EnvelopeVisualizer
  rmsEnergy={rmsEnergy}
  floor={floor}
  calibration={calibration}
  breathCount={breathCount}
  breathFrameCounter={breathFrameCounter}
  active={state === "monitoring"}
/>
```
With:
```tsx
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
```

- [ ] **Step 5: Add pill stats cards after the waveform**

After the closing `</div>` of the waveform container, add:

```tsx
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
```

- [ ] **Step 6: Update AssessmentWaveform canvas colors**

In the `AssessmentWaveform` component, update hardcoded colors to use `getComputedStyle`:

Add at the top of the `useEffect` body (after `if (!ctx) return;`):
```typescript
const style = getComputedStyle(document.documentElement);
const accentColor = style.getPropertyValue("--color-accent").trim() || "#9b7ec4";
const successColor = style.getPropertyValue("--color-success").trim() || "#7ec89a";
const surfaceColor = style.getPropertyValue("--color-surface").trim() || "#fae8dd";
```

Then replace color values:
- Line 32: `ctx.fillStyle = "#0a0a0a"` → `ctx.fillStyle = surfaceColor`
- Line 43: `ctx.fillStyle = "rgba(74, 222, 128, 0.06)"` → `ctx.fillStyle = \`${successColor}0F\``
- Line 45: `ctx.strokeStyle = "rgba(74, 222, 128, 0.15)"` → `ctx.strokeStyle = \`${successColor}26\``
- Line 53: `ctx.strokeStyle = "rgba(255, 255, 255, 0.04)"` → `ctx.strokeStyle = \`${accentColor}0A\``
- Line 64: `ctx.strokeStyle = "#4fc3f7"` → `ctx.strokeStyle = accentColor`
- Line 79: `ctx.fillStyle = "#4ade80"` → `ctx.fillStyle = successColor`

- [ ] **Step 7: Build to verify**

```bash
npm run build
```

Expected: no TypeScript errors, no missing imports, JSX well-formed.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add avatar upload, pill stats, and restructured header"
```

---

### Task 7: Final Verification

**Files:** none new

- [ ] **Step 1: Full typecheck + build**

```bash
npm run build
```

Expected: `tsc -b` passes with no errors, `vite build` produces output in `dist/`.

- [ ] **Step 2: Lint check**

```bash
npm run lint
```

Expected: no lint errors.

- [ ] **Step 3: Run unit tests**

```bash
npm run test:unit
```

Expected: all existing `BreathDetector` tests pass.

- [ ] **Step 4: Final commit if lint needed fixes**

```bash
git add -A
git commit -m "chore: final lint and build pass for kawaii redesign"
```
