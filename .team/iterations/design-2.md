# Design Iteration 2: Typography & Spacing Foundation

## Analysis

Current issues identified in MessageCard.vue and ChatView.vue:

1. **Typography below readability standards**: Body text at 15px, tool text at 13.6px (WCAG recommends 16px minimum)
2. **Inconsistent spacing rhythm**: Using 0.5rem (8px), 0.75rem (12px), 1.25rem (20px) - not following 8px grid cleanly
3. **Weak visual hierarchy**: Messages blend together, role labels too small (12px uppercase)
4. **Asymmetric padding**: Message cards use 8px vertical / 20px horizontal (unbalanced)

## Proposed Changes

### 1. Typography Scale (Readability)

**What to change:**
- MessageCard content: `0.9375rem` → `1rem` (16px)
- Tool text: `0.85rem` → `0.875rem` (14px)
- Role label: `0.75rem` → `0.8125rem` (13px)
- Line height: `1.65` → `1.6` (tighter, more Notion-like)

**Why:**
- 16px is WCAG AA minimum for body text
- 14px acceptable for secondary UI elements
- Tighter line-height creates denser, more professional feel

**Where:**
- MessageCard.vue lines 303, 526, 292

**Expected outcome:**
Text is easier to read, feels more polished and professional.

---

### 2. Spacing Rhythm (8px Grid)

**What to change:**
- Message card padding: `0.5rem 1.25rem` → `1rem 1.5rem` (16px / 24px)
- Message gap: `0.75rem` → `1rem` (16px)
- Tool container margin-top: `0.75rem` → `1rem` (16px)
- Status bar margin/padding: `0.75rem` → `1rem` (16px)

**Why:**
- 8px grid creates visual rhythm and consistency
- 16px/24px are clean multiples that feel balanced
- Notion uses similar spacing scale

**Where:**
- MessageCard.vue lines 214, 223, 441, 584

**Expected outcome:**
Consistent breathing room, elements feel organized and intentional.

---

### 3. Message Separation (Visual Hierarchy)

**What to change:**
- Add `margin-bottom: 0.5rem` (8px) to `.message-card`
- Reduce hover background intensity: `var(--bg-tertiary)` → `rgba(0, 0, 0, 0.02)`
- Add subtle border-bottom: `1px solid rgba(0, 0, 0, 0.04)` to each message

**Why:**
- Messages currently have no separation (margin-bottom: 0)
- Hover is too prominent, distracts from content
- Subtle borders create clear boundaries without heaviness

**Where:**
- MessageCard.vue lines 215, 244

**Expected outcome:**
Each message feels distinct, easier to scan conversation history.

---

### 4. Role Label Prominence

**What to change:**
- Font size: `0.75rem` → `0.8125rem` (13px)
- Font weight: `600` → `500` (medium instead of semibold)
- Letter spacing: `0.05em` → `0.03em` (less aggressive)
- Remove `text-transform: uppercase`

**Why:**
- Current uppercase + small size + heavy weight = hard to read
- Notion uses sentence case for labels
- Medium weight at slightly larger size is more readable

**Where:**
- MessageCard.vue lines 290-295

**Expected outcome:**
Role labels are readable but don't compete with message content.

---

### 5. Avatar Consistency

**What to change:**
- User avatar font-size: `11px` → `13px`
- Keep assistant avatar at `13px` (currently 13px via font-size: 13px)
- Ensure both use same size: `28px` diameter

**Why:**
- User avatar text is currently too small (11px)
- Inconsistent sizing creates visual imbalance
- Both should be equally prominent

**Where:**
- MessageCard.vue lines 287-288

**Expected outcome:**
Avatars feel balanced, neither user nor assistant dominates visually.

---

## Design Principles Applied

- **Readability First**: 16px body text, WCAG AA compliant
- **Consistent Rhythm**: 8px grid system (8, 16, 24, 32)
- **Clear Hierarchy**: Size, weight, and spacing create natural scanning order
- **Subtle Separation**: Borders and margins without visual noise
- **Balance**: Symmetric padding, consistent avatar sizes

## Implementation Priority

1. Typography (biggest readability impact)
2. Spacing rhythm (foundation for all other changes)
3. Message separation (improves scannability)
4. Role labels (polish)
5. Avatar consistency (final touch)

## Success Metrics

- Body text meets WCAG AA (16px minimum) ✓
- All spacing uses 8px multiples ✓
- Messages have clear visual separation ✓
- Role labels readable without uppercase ✓
- Avatars consistent size ✓
