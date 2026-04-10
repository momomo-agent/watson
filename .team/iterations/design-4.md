# Design Iteration 4: Semantic Colors & Typography Scale Consolidation

## Context
- Previous gap score: 17.4 (below 20 threshold — no blockers)
- Average quality: 82.6
- This iteration targets the top 3 remaining medium-severity gaps from review-3

---

## Change 1: Add Semantic Color Variables to theme.css

**What:** Add `--error`, `--error-bg`, `--warning`, `--warning-bg`, `--success`, `--success-bg`, `--tool-accent`, `--tool-accent-bg` variables to `:root` and `[data-theme="dark"]`.

**Why:** MessageCard.vue has 15+ hardcoded `rgba(255, 107, 107, ...)`, `rgba(74, 158, 255, ...)`, `rgba(255, 165, 0, ...)`, and `rgba(74, 200, 120, ...)` values. These break dark mode consistency and make theming impossible. Notion centralizes all colors in its theme — we should too.

**How — in theme.css `:root`:**
```css
/* Semantic status colors */
--error: #e03e3e;
--error-bg: rgba(227, 62, 62, 0.08);
--warning: #d9730d;
--warning-bg: rgba(217, 115, 13, 0.08);
--success: #0f7b6c;
--success-bg: rgba(15, 123, 108, 0.08);
--tool-accent: var(--accent-color);
--tool-accent-bg: rgba(35, 131, 226, 0.08);
--tool-accent-border: rgba(35, 131, 226, 0.2);
```

**How — in theme.css `[data-theme="dark"]`:**
```css
--error: #ff6b6b;
--error-bg: rgba(255, 107, 107, 0.12);
--warning: #ffa344;
--warning-bg: rgba(255, 163, 68, 0.12);
--success: #4ac078;
--success-bg: rgba(74, 192, 120, 0.12);
--tool-accent: var(--accent-color);
--tool-accent-bg: rgba(96, 165, 250, 0.1);
--tool-accent-border: rgba(96, 165, 250, 0.25);
```

**Then in MessageCard.vue, replace hardcoded colors:**

| Selector | Old | New |
|----------|-----|-----|
| `.tool-call` background | `rgba(74, 158, 255, 0.1)` | `var(--tool-accent-bg)` |
| `.tool-call` border | `rgba(74, 158, 255, 0.2)` | `var(--tool-accent-border)` |
| `.tool-call:hover` background | `rgba(74, 158, 255, 0.18)` | increase opacity variant or keep as-is |
| `.tool-call.complete` border | `rgba(74, 200, 120, 0.3)` | `var(--success)` at 0.3 opacity → or `var(--success-bg)` |
| `.tool-call.error` border/bg | `rgba(255, 107, 107, ...)` | `var(--error)` / `var(--error-bg)` |
| `.tool-call.blocked` border/bg | `rgba(255, 165, 0, ...)` | `var(--warning)` / `var(--warning-bg)` |
| `.tool-error` color | `#ff6b6b` | `var(--error)` |
| `.tool-blocked` color | `#ffa500` | `var(--warning)` |
| `.status.error` color | `#ff6b6b` | `var(--error)` |
| `.status.cancelled` color | `#ffa500` | `var(--warning)` |
| `.btn-cancel:hover` border/color | `#ff6b6b` | `var(--error)` |
| `.btn-cancel:hover` background | `rgba(255, 107, 107, 0.1)` | `var(--error-bg)` |
| `.btn-retry:hover` background | `rgba(74, 158, 255, 0.1)` | `var(--tool-accent-bg)` |

**Expected outcome:** All status colors respond to theme changes. Light mode gets Notion-appropriate muted tones (not neon). Dark mode keeps vibrant colors. Single source of truth for the palette.

---

## Change 2: Consolidate Typography to a 5-Step Scale

**What:** Reduce 9+ arbitrary font sizes to a clean 5-step scale aligned with Notion's approach.

**Why:** Current sizes include 0.7rem, 0.75rem, 0.8rem, 0.8125rem, 0.85rem, 0.875rem, 1rem — too many steps with no clear hierarchy. Notion uses ~4-5 distinct sizes. A clean scale improves scannability and reduces cognitive load.

**How — define scale in theme.css `:root`:**
```css
/* Typography scale (5 steps) */
--text-xs: 0.75rem;    /* 12px — badges, captions only */
--text-sm: 0.8125rem;  /* 13px — secondary UI (status bar, buttons) */
--text-base: 0.875rem; /* 14px — tool calls, secondary content */
--text-md: 1rem;       /* 16px — body text, primary content */
--text-lg: 1.125rem;   /* 18px — headings within messages */
```

**Apply to MessageCard.vue:**

| Element | Current | New Variable |
|---------|---------|-------------|
| `.content` | `1rem` | `var(--text-md)` — no visual change |
| `.tool-call` | `0.875rem` | `var(--text-base)` — no visual change |
| `.tool-loop-summary` | `0.8rem` | `var(--text-sm)` — bumps 12.8px → 13px |
| `.tool-loop-icon` | `0.7rem` | `var(--text-xs)` — bumps 11.2px → 12px |
| `.tool-round-badge` | `0.7rem` | `var(--text-xs)` — no visual change |
| `.tool-error`, `.tool-blocked` | `0.75rem` | `var(--text-xs)` — no visual change |
| `.status-bar` | `0.75rem` | `var(--text-sm)` — bumps 12px → 13px (more readable) |
| `button` | `0.75rem` | `var(--text-sm)` — bumps 12px → 13px |

**Expected outcome:** Cleaner visual rhythm. Status bar and buttons become slightly more readable (12px → 13px). All sizes traceable to named tokens. Future components just pick from the scale.

---

## Change 3: Standardize Border-Radius to 3 Tiers

**What:** Replace 5+ radius values with 3 named tiers.

**Why:** Current code uses 0, 4px, 6px, 8px, 50% with no pattern. Notion uses ~3 tiers (small for badges, medium for cards, full for avatars). Named tokens prevent drift.

**How — in theme.css `:root`:**
```css
/* Border radius tiers */
--radius-sm: 4px;   /* badges, small elements */
--radius-md: 8px;   /* cards, containers, images */
--radius-full: 50%; /* avatars, dots */
```

**Apply to MessageCard.vue:**

| Element | Current | New |
|---------|---------|-----|
| `.message-card` | `8px` | `var(--radius-md)` |
| `.tool-loop-container` | `8px` | `var(--radius-md)` |
| `.tool-call` | `6px` | `var(--radius-sm)` |
| `.tool-round-badge` | `4px` | `var(--radius-sm)` |
| `button` | `6px` | `var(--radius-sm)` |
| `.markdown-image` | `8px` | `var(--radius-md)` |
| `.dot-pulse` | `50%` | `var(--radius-full)` |

**Expected outcome:** Visual consistency. Buttons and tool calls share the same radius (4px — tighter, more Notion-like). Cards and containers share 8px. No more arbitrary 6px.

---

## Summary

| # | Change | Severity Addressed | Impact |
|---|--------|--------------------|--------|
| 1 | Semantic color variables | Medium (colors) | Themeable status colors, dark mode correctness |
| 2 | Typography scale tokens | Medium (typography) | Clean hierarchy, improved readability for small text |
| 3 | Border-radius tiers | Minor (consistency) | Visual consistency, design system maturity |

**Estimated score improvement:** Colors 78→85, Typography 83→88, Consistency 80→87. Projected gap score: ~12.
