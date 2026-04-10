# Design Iteration Notes — Watson Chat UI

## Goal
Watson UI 达到 Notion 风格：对话像真正的对话，设计质量超越 Paw

## Iteration Summary

### Iteration 2 (design-2.md)
- Proposed typography & spacing foundation
- Developer failed (API 500) — changes not implemented

### Iteration 3 (design-3.md) ✅ COMPLETE
- Re-proposed iteration 2 fixes + user message differentiation
- All 7 CSS changes implemented successfully
- Gap score dropped from 30.2 → 14 (threshold: 20)

**Key wins:**
- Body text 1rem (16px) — WCAG AA compliant
- Line-height 1.6 — Notion-like density
- Tool text 0.875rem (14px) — readable secondary text
- All spacing on 8px grid (tool container, status bar)
- User messages visually distinct via `--msg-user-bg` / `--msg-user-border`

### Iteration 4 (design-4.md) ✅ COMPLETE
- Semantic color variables (replace 15+ hardcoded rgba/hex in MessageCard)
- Typography scale consolidation (9+ sizes → 5 named tokens)
- Border-radius standardization (5+ values → 3 tiers)
- Gap score dropped from 17.4 → 13.6
- All 3 changes verified implemented in theme.css + MessageCard.vue

**Key wins:**
- Semantic status colors (error/warning/success/tool-accent) in both themes
- 5-step typography scale (xs/sm/base/md/lg) replaces 9+ arbitrary sizes
- 3-tier border-radius (sm/md/full) replaces 5+ arbitrary values
- 85%+ of hardcoded values replaced with tokens

### Iteration 5 (design-5.md) ✅ COMPLETE
- Complete tool-call hover/running color migration (4 remaining hardcoded values)
- Error background → var(--error-bg) for dark mode correctness
- Transition duration tokens (2 tiers: fast 0.15s, normal 0.3s)
- Image hover shadow → var(--tool-accent-border)
- Gap score dropped from 13.6 → 10.4
- All 4 changes verified implemented

**Key wins:**
- Zero hardcoded accent colors remaining in MessageCard.vue
- Zero raw transition durations remaining in MessageCard.vue
- Theme-aware error backgrounds in dark mode
- Complete design token coverage for the core conversation component

## Final Status: DESIGN COMPLETE ✅

Gap score: 10.4 (threshold: 20). Average quality: 89.6/100.
Total improvement: +19.8 points across 4 iterations (30.2 → 10.4).

The design token system is comprehensive:
- Semantic colors (error/warning/success/tool-accent + hover variants)
- Typography scale (5 steps: xs/sm/base/md/lg)
- Border-radius tiers (sm/md/full)
- Transition timing (fast/normal)
- Interactive state variants (hover/running)

MessageCard.vue — the primary conversation component — is fully tokenized.

## Remaining Polish (Deferred)

These are items beyond CSS scope or intentionally separate:

1. **Timestamps** (medium): Messages lack temporal context. Requires adding `timestamp` to data model — not a CSS-only fix.
2. **Code block syntax highlighting**: hljs theme colors are intentionally separate from the design system (they follow GitHub's syntax theme).
3. **Font unit consistency**: Avatar uses `13px`, rest uses `rem`. Minor — avatar is isolated.

## Design Principles Applied
- Accessibility first (WCAG AA typography)
- 8px grid for all spacing
- Sender differentiation (user vs assistant)
- CSS-only changes — minimal blast radius
- Existing theme variables activated (not invented)
