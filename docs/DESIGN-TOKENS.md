# Design Tokens

All design tokens are defined as CSS custom properties in `src/app.css` `:root`.
Components consume tokens via `var(--token-name)` in scoped `<style>` blocks.

## Color Palette

### Backgrounds

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0d1117` | Page / app background |
| `--bg-raised` | `#161b22` | Cards, inputs, elevated surfaces |
| `--bg-overlay` | `#1c2128` | Overlay panels, modals, tooltips |

### Foreground (Text)

All text colors pass **WCAG AA 4.5:1** on every background.

| Token | Value | Min Ratio | Usage |
|-------|-------|-----------|-------|
| `--fg` | `#e6edf3` | 13.70:1 | Primary text |
| `--fg-muted` | `#9ca3af` | 6.37:1 | Secondary text, labels |
| `--fg-dim` | `#848d97` | 4.81:1 | Tertiary text, timestamps, hints |

### Accent Colors

All accent colors pass **WCAG AA 4.5:1** for text on every background.

| Token | Value | Min Ratio | Usage |
|-------|-------|-----------|-------|
| `--purple` | `#d2a8ff` | 8.31:1 | Brand accent, copilot mode |
| `--green` | `#3fb950` | 6.37:1 | Success, autopilot mode |
| `--red` | `#f85149` | 4.83:1 | Error, destructive actions |
| `--yellow` | `#e3b341` | 8.32:1 | Warning, caution states |
| `--blue` | `#58a6ff` | 6.41:1 | Info, plan mode |
| `--cyan` | `#56d4dd` | 10.69:1 | Highlights, special emphasis |
| `--orange` | `#f0883e` | 6.39:1 | Attention, secondary warning |

### Dim Variants

Used for backgrounds, borders, and UI elements. Pass **WCAG AA 3:1** for non-text contrast.

| Token | Value | Min Ratio | Usage |
|-------|-------|-----------|-------|
| `--purple-dim` | `#8957e5` | 3.51:1 | Active state bg, accent borders |
| `--green-dim` | `#2ea043` | 4.80:1 | Success bg, active state |

### Borders & Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--border` | `#3d444d` | Decorative borders, separators, card edges |
| `--border-accent` | `#7c5cb5` | Mode-aware accent borders (3.13:1 min) |
| `--shadow` | `rgba(0,0,0,0.4)` | Base shadow color |

### Semantic Aliases

Prefer semantic tokens in new code — they abstract intent from implementation:

| Semantic Token | Maps To | Usage |
|----------------|---------|-------|
| `--color-accent` | `--purple` | Primary brand accent |
| `--color-accent-dim` | `--purple-dim` | Accent background/border |
| `--color-success` | `--green` | Success states |
| `--color-success-dim` | `--green-dim` | Success background |
| `--color-error` | `--red` | Error states |
| `--color-warning` | `--yellow` | Warning states |
| `--color-info` | `--blue` | Informational states |

---

## Typography

| Token | Value | Usage |
|-------|-------|-------|
| `--font-mono` | SF Mono, Fira Code, Cascadia Code, JetBrains Mono, Menlo, Consolas, monospace | App font stack |
| `--font-size` | `clamp(14px, 3.8vw, 16px)` | Base fluid font size |
| `--line-height` | `1.6` | Base line height |

### Type Scale

| Token | Value | Approx px | Usage |
|-------|-------|-----------|-------|
| `--text-xs` | `0.75rem` | 12px | Badges, fine print |
| `--text-sm` | `0.8125rem` | 13px | Captions, metadata |
| `--text-base` | `var(--font-size)` | 14–16px | Body text |
| `--text-lg` | `1.125rem` | 18px | Subheadings |
| `--text-xl` | `1.25rem` | 20px | Headings |

### Line Heights

| Token | Value | Usage |
|-------|-------|-------|
| `--leading-tight` | `1.3` | Headings, compact UI |
| `--leading-normal` | `var(--line-height)` = `1.6` | Body text |
| `--leading-relaxed` | `1.75` | Long-form content |

---

## Spacing

4px base unit, linear scale:

| Token | Value | Usage |
|-------|-------|-------|
| `--sp-1` | `4px` | Tight padding, inline gaps |
| `--sp-2` | `8px` | Default gap, small padding |
| `--sp-3` | `12px` | Medium padding |
| `--sp-4` | `16px` | Standard padding |
| `--sp-5` | `20px` | Large padding |
| `--sp-6` | `24px` | Section spacing |
| `--indent` | `16px` | Text/content indentation |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `6px` | Buttons, inputs, badges |
| `--radius-md` | `10px` | Cards, panels |
| `--radius-lg` | `14px` | Modals, large containers |

---

## Elevation / Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` | Subtle depth (buttons, cards) |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` | Raised panels, dropdowns |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.5)` | Modals, overlays |

---

## Motion / Transitions

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-fast` | `0.1s` | Micro-interactions (hover, focus) |
| `--duration-normal` | `0.2s` | State changes, expand/collapse |
| `--duration-slow` | `0.3s` | Panels, larger transitions |
| `--ease-default` | `ease` | General purpose easing |
| `--ease-spring` | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | Bouncy/playful motion |

### Reduced Motion

All animations and transitions are disabled when the user has `prefers-reduced-motion: reduce` enabled — via a global media query in `app.css`.

---

## Safe Area Insets (PWA)

| Token | Value | Usage |
|-------|-------|-------|
| `--safe-top` | `env(safe-area-inset-top, 0px)` | Notch/status bar |
| `--safe-bottom` | `env(safe-area-inset-bottom, 0px)` | Home indicator |
| `--safe-left` | `env(safe-area-inset-left, 0px)` | Landscape left |
| `--safe-right` | `env(safe-area-inset-right, 0px)` | Landscape right |

---

## Mode Colors (Dynamic)

Session mode sets dynamic CSS custom properties via inline `style` on the chat container in `+page.svelte`:

| Token | Copilot (default) | Plan | Autopilot |
|-------|-------------------|------|-----------|
| `--mode-color` | `#d2a8ff` (purple) | `#58a6ff` (blue) | `#3fb950` (green) |
| `--mode-border` | `#7c5cb5` | `rgba(88,166,255,0.45)` | `rgba(63,185,80,0.45)` |
| `--mode-user-bg` | `rgba(137,87,229,0.12)` | `rgba(88,166,255,0.10)` | `rgba(63,185,80,0.10)` |
| `--mode-user-border` | `rgba(137,87,229,0.20)` | `rgba(88,166,255,0.22)` | `rgba(63,185,80,0.22)` |
| `--mode-banner-bg` | `rgba(137,87,229,0.08)` | `rgba(88,166,255,0.07)` | `rgba(63,185,80,0.07)` |

---

## Usage Guidelines

1. **Always use tokens** — never hardcode hex values in component styles
2. **Prefer semantic tokens** (`--color-success`) over raw palette (`--green`) for state-driven colors
3. **Use the type scale** for font sizes instead of arbitrary `em`/`px` values
4. **Use transition tokens** for consistent animation timing
5. **Test contrast** when introducing new color combinations — maintain WCAG AA minimums
