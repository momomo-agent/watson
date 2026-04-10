# Design Iteration 5: Final Polish — Hardcoded Color Cleanup & Transition Tokens

## Context
- Previous gap score: 13.6 (well below 20 threshold)
- Average quality: 86.4
- Reviewer recommended "complete" — this is a polish pass to close remaining gaps
- All scores 84-88; targeting Colors (84) and Consistency (86) for final push

---

## Change 1: Replace Remaining Hardcoded Tool-Call Hover/Running Colors

**What:** Replace the 4 remaining hardcoded `rgba(74, 158, 255, ...)` values in `.tool-call:hover` and `.tool-call.running` selectors with semantic variables.

**Why:** These are the last holdouts from the iteration 4 semantic color migration. They use the old blue accent directly instead of `var(--tool-accent-bg)` / `var(--tool-accent-border)`, which means hover/running states won't adapt to theme changes. Notion never has hardcoded colors in interactive states.

**How — add two new interactive-state variables to theme.css `:root`:**
```css
/* Interactive state variants (higher opacity for hover/active) */
--tool-accent-bg-hover: rgba(35, 131, 226, 0.16);
--tool-accent-border-hover: rgba(35, 131, 226, 0.35);
```

**And in `[data-theme="dark"]`:**
```css
--tool-accent-bg-hover: rgba(96, 165, 250, 0.18);
--tool-accent-border-hover: rgba(96, 165, 250, 0.4);
```

**Then in MessageCard.vue, replace:**

| Selector | Old | New |
|----------|-----|-----|
| `.tool-call:hover` background | `rgba(74, 158, 255, 0.18)` | `var(--tool-accent-bg-hover)` |
| `.tool-call:hover` border-color | `rgba(74, 158, 255, 0.4)` | `var(--tool-accent-border-hover)` |
| `.tool-call.running` border-color | `rgba(74, 158, 255, 0.5)` | `var(--tool-accent-border-hover)` |
| `.tool-call.running` background | `rgba(74, 158, 255, 0.15)` | `var(--tool-accent-bg-hover)` |

**Expected outcome:** 100% of tool-call colors now flow from theme variables. Hover and running states adapt correctly in both light and dark modes. Zero hardcoded accent colors remain in interactive states.

---

## Change 2: Replace Hardcoded Error Background in MessageCard

**What:** Replace the hardcoded `#fef2f2` error background on `.message-card` error state with `var(--error-bg)`.

**Why:** This is a light-mode-only color that doesn't adapt to dark mode. The `--error-bg` variable already exists in both themes and was defined in iteration 4 specifically for this purpose.

**How — in MessageCard.vue:**

| Selector | Old | New |
|----------|-----|-----|
| `.message-card` error state background | `#fef2f2` | `var(--error-bg)` |

**Expected outcome:** Error state backgrounds are theme-aware. Dark mode gets the correct `rgba(255, 107, 107, 0.12)` instead of a jarring white-pink.

---

## Change 3: Add Transition Duration Tokens

**What:** Standardize the 3 inconsistent transition durations (0.15s, 0.2s, 0.3s) into 2 named tokens.

**Why:** Notion uses consistent motion timing — fast for micro-interactions (hover, focus), moderate for layout transitions (expand/collapse, theme switch). Three arbitrary durations create subtle inconsistency. Two named tokens create a clear motion language.

**How — add to theme.css `:root`:**
```css
/* Transition timing */
--duration-fast: 0.15s;   /* hover, focus, color changes */
--duration-normal: 0.3s;  /* expand/collapse, theme transitions */
```

**Apply to MessageCard.vue:**

| Current Duration | Context | New Token |
|-----------------|---------|-----------|
| `0.15s` | hover states, small interactions | `var(--duration-fast)` |
| `0.2s` | mixed usage (collapse, hover) | `var(--duration-fast)` for hover, `var(--duration-normal)` for layout |
| `0.3s` | theme transitions, expand/collapse | `var(--duration-normal)` |

**Expected outcome:** Predictable motion rhythm. Hover states feel snappy (0.15s). Layout changes feel smooth (0.3s). No more ambiguous 0.2s middle ground.

---

## Change 4: Replace Image Hover Shadow Hardcoded Color

**What:** Replace the hardcoded `rgba(74, 158, 255, 0.2)` in `.markdown-image:hover` box-shadow with `var(--tool-accent-border)`.

**Why:** This is the same accent blue used elsewhere, already tokenized as `--tool-accent-border` (which is `rgba(35, 131, 226, 0.2)` in light / `rgba(96, 165, 250, 0.25)` in dark). Using the variable ensures image hover shadows match the rest of the accent system.

**How — in MessageCard.vue:**

| Selector | Old | New |
|----------|-----|-----|
| `.markdown-image:hover` box-shadow color | `rgba(74, 158, 255, 0.2)` | `var(--tool-accent-border)` |

**Expected outcome:** Image hover glow matches the accent system. One fewer hardcoded color.

---

## Summary

| # | Change | Severity | Impact |
|---|--------|----------|--------|
| 1 | Tool-call hover/running → semantic vars | Medium | Completes the semantic color migration |
| 2 | Error background → var(--error-bg) | Minor | Dark mode correctness |
| 3 | Transition duration tokens | Minor | Motion consistency |
| 4 | Image hover shadow → var | Minor | Single source of truth |

**Projected improvement:** Colors 84→90, Consistency 86→91. Projected gap score: ~9.

This iteration completes the design token migration. After this, the only remaining gaps are:
- Code block syntax highlighting colors (hljs theme — intentionally separate)
- Message timestamps (requires data model changes — out of CSS scope)
- Avatar font-size `13px` → `var(--text-sm)` (trivial, can be done inline)
