# Kawaii UI Redesign

**Date:** 2026-07-07
**Status:** Approved

## Overview

Redesign the Willow respiratory rate monitor with a kawaii aesthetic — pastel colors, rounded shapes, pet-themed decorative elements, and system light/dark mode. The detection algorithm, recording infrastructure, and assessment mode are unchanged. This is purely a visual uplift.

## Color Palette

Two themes toggled via `prefers-color-scheme` media query using CSS custom properties.

### Light Mode

| Role | Color | Notes |
|---|---|---|
| Background | `#fef5f0` | warm cream |
| Surface / card | `#fae8dd` | peach cream |
| Text primary | `#5a4a5e` | muted plum |
| Text secondary | `#a88ab0` | soft lavender |
| Text muted | `#b0a0b8` | light lavender |
| Accent (BPM, waveform) | `#9b7ec4` | soft purple |
| Success (breath, assess) | `#7ec89a` | soft mint |
| Warning (floor line, recording) | `#f0a08c` | peach coral |
| Danger (stop, error) | `#c9445a` | deep rose-red |

### Dark Mode

| Role | Color | Notes |
|---|---|---|
| Background | `#1a1a2e` | deep navy-purple |
| Surface / card | `#232340` | navy |
| Text primary | `#e8d5f5` | light lavender |
| Text secondary | `#b8a0cc` | muted lavender |
| Text muted | `#8a7a9e` | dim purple |
| Accent (BPM, waveform) | `#c4a6f7` | soft purple |
| Success (breath, assess) | `#a6f0c4` | soft mint |
| Warning (floor line, recording) | `#f0c4a6` | warm peach |
| Danger (stop, error) | `#e0556a` | vivid coral-red |

### Canvas Colors

Canvas rendering in `EnvelopeVisualizer.tsx` and `App.tsx` (assessment waveform) uses hardcoded color values. These must be updated to the new palette:

| Element | Light | Dark |
|---|---|---|
| Canvas background | `#fae8dd` | `#232340` |
| Waveform stroke | `#9b7ec4` | `#c4a6f7` |
| Floor line | `rgba(240,160,140,0.4)` | `rgba(240,196,166,0.4)` |
| Breath span fill | `rgba(126,200,154,0.07)` | `rgba(166,240,196,0.07)` |
| Breath span stroke | `rgba(126,200,154,0.25)` | `rgba(166,240,196,0.25)` |
| Grid lines | `rgba(155,126,196,0.05)` | `rgba(196,166,247,0.08)` |
| Detection dots | `#7ec89a` | `#a6f0c4` |

Canvas code reads CSS custom properties at draw time via `getComputedStyle(document.documentElement).getPropertyValue('--color-accent')` etc. This ensures the canvas always matches the current theme, even if the user changes system preference while monitoring.

## Typography

- **Font:** Quicksand (Google Fonts, weights 400–700)
- **Fallback:** `system-ui, sans-serif`
- **BPM value:** weight 700 — `8rem` (main), `4rem` (report card)
- **Title:** weight 600, `1.1rem`, uppercase, letter-spacing `0.2em`
- **Breed tag:** weight 400, `0.7rem`
- **Body/buttons:** weight 500
- **Stats pills:** weight 500 — value `1rem`, label `0.6rem`
- **Status label:** weight 500, `0.8rem`

## Layout Changes

Current monospace minimal layout → rounded, card-based kawaii layout. Structural changes only; no new React components.

### Header: Avatar + Name

Replaces bare `<h1>Willow</h1>` title.

- **Avatar:** 48×48px circle, gradient background (`#d4b8e8` → `#f0c4a6`), default 🐶 emoji placeholder
- **Photo upload:** Click avatar → file input for image upload → stored as data URL in `localStorage` → displayed as `background-image` on the avatar div
- **Name:** "Willow" with breed subtitle "senior pom · resting" below
- **Layout:** flex row, avatar left, text right

### Stats: Pill Cards

Replaces the flat `envelope-stats` bar with 4 pill-shaped cards stacked horizontally.

- Each card: `background: surface`, `border-radius: 12px`, `padding: 0.5rem 0.7rem`
- Cards: floor, mag (shown after initialization), peaks, breaths
- Value color matches semantic role (floor=muted, mag=warning, peaks=accent, breaths=success)

### Buttons: Pill Shape

All buttons become fully rounded pills: `border-radius: 20px`.

- Hover effect: `transform: scale(1.03)` with color transition
- `toggle-btn.active`: `background: danger` (solid, no border)
- `record-btn.recording`: `background: danger` with pulse animation
- `assess-btn`: `border: 2px solid success`, text `success`; hover fills solid
- `download-btn`: `border: 2px solid surface-border`, text muted; hover border accent

### Canvas Container

Rounded: `border-radius: 14px`, `overflow: hidden`, surface background.

### Decorative Elements

- **Favicon:** SVG paw print, replace default Vite favicon in `index.html`
- **Avatar:** default 🐶 emoji, click to upload photo (stored in localStorage)
- **Box-shadow:** soft shadow on avatar circle
- **No paw emoji** in title text — just clean typography
- **No animations** on breath detection (stays calm)

## Implementation Strategy

### Files to Modify

| File | Changes |
|---|---|
| `index.html` | Replace favicon with paw SVG |
| `src/index.css` | Quicksand import, CSS custom properties for both themes, base styles |
| `src/App.css` | Complete rewrite: pill cards, pill buttons, avatar layout, theme vars usage |
| `src/App.tsx` | Avatar upload UI (file input, localStorage read/write), minor JSX restructuring |
| `src/components/EnvelopeVisualizer.tsx` | Update hardcoded canvas colors to new palette |
| `src/components/EnvelopeVisualizer.css` | Minor: stats bar replaced by pill cards in App.css |

### Files NOT Modified

| File | Reason |
|---|---|
| `src/audio/AudioManager.ts` | No changes |
| `src/audio/BreathDetector.ts` | No changes |
| `src/audio/index.ts` | No changes |
| `src/hooks/useBreathMonitor.ts` | No changes |
| `src/__tests__/BreathDetector.test.ts` | No changes |
| `vite.config.ts` | No changes needed |

## CSS Custom Properties Architecture

Define all colors as custom properties on `:root`, then override in `@media (prefers-color-scheme: dark)`.

```css
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
  }
}
```

## Avatar Upload Flow

1. On mount, check `localStorage` for `"willow-avatar"` key
2. If found, display as avatar `background-image`
3. If not found, show default 🐶 emoji on gradient background
4. Click avatar → trigger hidden `<input type="file" accept="image/*">`
5. On file select, read as data URL via `FileReader`
6. Save to `localStorage.setItem("willow-avatar", dataUrl)`
7. Update displayed avatar immediately
8. Long-press or right-click avatar → reset to default emoji (remove key from localStorage)
