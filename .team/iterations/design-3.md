# Design Iteration 3: Typography, Spacing & Message Differentiation

## Context

Review-2 gap score: 30.2 (threshold: 20). Developer for iteration 2 failed (API 500), so design-2 proposals for body text, tool text, line-height, tool container margin, and status bar margin were never implemented. This iteration re-proposes those critical fixes plus adds user message differentiation.

## Proposed Changes

### 1. Body Text Size (HIGH — Accessibility)

**What:** `.content` font-size `0.9375rem` → `1rem`
**Where:** `MessageCard.vue:303`
**Why:** 15px is below WCAG AA minimum of 16px. This is the single most impactful readability fix.
**How:**
```css
.content {
  font-size: 1rem;        /* was 0.9375rem (15px) → now 16px */
  line-height: 1.6;       /* was 1.65 → tighter, Notion-like density */
}
```
**Expected outcome:** Body text meets accessibility standard and feels denser/more professional.

---

### 2. Tool Text Size (MEDIUM — Readability)

**What:** `.tool-call` font-size `0.85rem` → `0.875rem`
**Where:** `MessageCard.vue:526`
**Why:** 13.6px is below the 14px target for secondary UI elements. Tool names should be comfortably readable.
**How:**
```css
.tool-call {
  font-size: 0.875rem;    /* was 0.85rem (13.6px) → now 14px */
}
```
**Expected outcome:** Tool call text is slightly larger, easier to scan without competing with body text.

---

### 3. Spacing on 8px Grid (MEDIUM — Consistency)

**What:** Align tool container and status bar to 8px grid
**Where:** `MessageCard.vue:441` (tool-loop-container), `MessageCard.vue:584-585` (status-bar)
**Why:** Both use `0.75rem` (12px) which breaks the 8px grid rhythm. All spacing should use multiples of 8px (0.5rem, 1rem, 1.5rem, 2rem).
**How:**
```css
.tool-loop-container {
  margin-top: 1rem;       /* was 0.75rem (12px) → now 16px, on 8px grid */
}

.status-bar {
  margin-top: 1rem;       /* was 0.75rem (12px) → now 16px */
  padding-top: 1rem;      /* was 0.75rem (12px) → now 16px */
}
```
**Expected outcome:** Vertical rhythm is consistent throughout the message card. Elements feel intentionally placed.

---

### 4. User Message Background (MEDIUM — Visual Hierarchy)

**What:** Give user messages a subtle background tint to differentiate from assistant messages
**Where:** `MessageCard.vue:226-229` (`.message-card.user`)
**Why:** Currently both user and assistant messages have identical transparent backgrounds. Notion and all modern chat UIs differentiate the sender visually. This is the #1 visual hierarchy gap.
**How:**
```css
/* Light mode */
.message-card.user {
  background: var(--msg-user-bg);   /* #e8f3ff — already defined in theme.css:16 */
  border-bottom-color: var(--msg-user-border);  /* #d0e7ff — already defined in theme.css:17 */
}

/* Dark mode uses [data-theme="dark"] overrides already in theme.css:39-40 */
/* --msg-user-bg: #1e293b, --msg-user-border: #334155 */
```
Note: The CSS variables `--msg-user-bg` and `--msg-user-border` already exist in `theme.css` (lines 16-17 light, 39-40 dark) but are NOT used anywhere in the current code. This change activates them.

**Expected outcome:** User messages are instantly distinguishable from assistant messages. Conversation flow is immediately clear at a glance, like a real chat.

---

## Changes NOT Included (Deferred)

- **Timestamps on messages**: Requires data model changes (adding `timestamp` field), deferred to iteration 4+
- **Code block theme-awareness**: Minor issue, light-mode code blocks already use `--code-bg: #f7f6f3` from theme.css
- **Transition standardization**: Minor consistency issue, low impact on UX
- **Mixed font units**: Minor, avatar `font-size: 13px` is fine in isolation

## Design Principles Applied

- **Accessibility First**: Body text to 16px WCAG AA minimum
- **8px Grid**: All spacing uses multiples of 8 (8, 16, 24)
- **Sender Differentiation**: User vs assistant visually distinct
- **Minimal Changes**: Only 4 targeted CSS changes, no structural/template modifications

## Implementation Notes

All changes are CSS-only in `MessageCard.vue`. No template or script changes needed. The `--msg-user-bg` and `--msg-user-border` variables are already defined in both light and dark themes.

### Exact lines to change:
1. `MessageCard.vue:303` — `.content` font-size: `0.9375rem` → `1rem`
2. `MessageCard.vue:301` — `.content` line-height: `1.65` → `1.6`
3. `MessageCard.vue:526` — `.tool-call` font-size: `0.85rem` → `0.875rem`
4. `MessageCard.vue:441` — `.tool-loop-container` margin-top: `0.75rem` → `1rem`
5. `MessageCard.vue:584` — `.status-bar` margin-top: `0.75rem` → `1rem`
6. `MessageCard.vue:585` — `.status-bar` padding-top: `0.75rem` → `1rem`
7. `MessageCard.vue:227` — `.message-card.user` background: `transparent` → `var(--msg-user-bg)`
8. `MessageCard.vue:228` — `.message-card.user` add `border-bottom-color: var(--msg-user-border)`

## Success Metrics

- [ ] Body text ≥ 16px (1rem)
- [ ] Tool text ≥ 14px (0.875rem)
- [ ] Line-height 1.6 (tighter than 1.65)
- [ ] All vertical spacing on 8px grid
- [ ] User messages visually distinct from assistant messages
