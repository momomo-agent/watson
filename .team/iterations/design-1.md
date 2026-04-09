# Design Iteration 1: Typography & Spacing Foundation

## Goal
Establish consistent typography hierarchy and spacing rhythm to match Notion's clarity and readability.

## Problems Identified

### 1. Typography Hierarchy Lacks Clarity
- **Sidebar header**: 0.75rem (12px) - too small for a section header
- **Session title**: 0.875rem (14px) - not prominent enough for primary content
- **Message role label**: 0.7rem (11.2px) - below readable minimum, hard to scan
- **Body text**: Inconsistent line-height and sizing across components

**Why this matters**: Notion's strength is instant visual scanning. Users should immediately distinguish headers from content from metadata without effort.

### 2. Spacing Not Following 8px Grid
- Current: 0.5rem (8px), 0.75rem (12px), 1rem (16px) - mixing grid and off-grid values
- Sidebar padding: 0.75rem (12px) - off-grid
- Session item margin: 0.375rem (6px) - off-grid
- Message card margin: 1rem (16px) - on-grid ✓

**Why this matters**: Consistent spacing creates visual rhythm. Notion uses strict 4px/8px grid for predictable, harmonious layouts.

### 3. Border Radius Proliferation
- Currently using: 3px, 4px, 6px, 8px, 10px, 12px (6 different values!)
- Notion uses 3 values: 3px (small), 6px (medium), 12px (large)

**Why this matters**: Too many radius values creates visual noise. Consistent radii feel intentional and polished.

## Proposed Changes

### Change 1: Fix Typography Scale
**File**: `src/renderer/components/Sidebar.vue`

```css
/* Line 144-149: Sidebar header */
.sidebar-header h2 {
  font-size: 0.8125rem;  /* 13px - more readable */
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* Line 224-231: Session title */
.session-title {
  font-weight: 500;
  color: var(--text-primary);
  font-size: 0.9375rem;  /* 15px - more prominent */
  line-height: 1.4;
}

/* Line 248-252: Session time */
.session-time {
  font-size: 0.8125rem;  /* 13px - more readable */
  color: var(--text-secondary);
}

/* Line 271-279: Session subtitle */
.session-subtitle {
  font-size: 0.8125rem;  /* 13px - more readable */
  color: var(--text-secondary);
  line-height: 1.5;
}
```

**File**: `src/renderer/components/MessageCard.vue`

```css
/* Line 257-263: Role label */
.role-label {
  font-size: 0.75rem;  /* 12px minimum readable size */
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;  /* Reduce from 0.8px for better readability */
}
```

### Change 2: Enforce 8px Grid Spacing
**File**: `src/renderer/components/Sidebar.vue`

```css
/* Line 139: Sidebar header padding */
padding: 1rem 1rem;  /* 16px - on grid */

/* Line 178: Session list padding */
padding: 1rem;
padding-bottom: 2rem;

/* Line 189: Session item margin */
margin-bottom: 0.5rem;  /* 8px - on grid */

/* Line 220: Session row margin */
margin-bottom: 0.5rem;  /* 8px - on grid */
```

**File**: `src/renderer/components/ChatView.vue`

```css
/* Line 128: Messages padding */
padding: 1rem;  /* 16px - on grid */
```

**File**: `src/renderer/components/ChatInput.vue`

```css
/* Line 126: Chat input gap and padding */
gap: 0.5rem;  /* 8px - on grid */
padding: 1rem;  /* 16px - on grid */
```

### Change 3: Standardize Border Radius
Apply 3-tier system across all components:
- **Small elements** (badges, inputs, small buttons): 6px
- **Medium elements** (cards, buttons, panels): 8px
- **Large containers** (modals, major sections): 12px

**Files to update**:
- `Sidebar.vue`: session items 10px → 8px, add-btn 10px → 6px
- `ChatInput.vue`: textarea 10px → 8px, buttons 10px → 8px
- `MessageCard.vue`: message-card 12px → 8px, code blocks 8px → 6px

## Expected Outcome

**User will see/feel**:
1. **Clearer hierarchy**: Headers, titles, and metadata are instantly distinguishable
2. **Visual rhythm**: Consistent spacing creates calm, organized feeling (like Notion)
3. **Polish**: Unified border radii feel intentional, not random
4. **Better readability**: No text below 12px (0.75rem), meeting accessibility baseline

**Metrics**:
- Typography: 4 sizes (12px, 13px, 15px, 16px) instead of 7+
- Spacing: 3 values (8px, 16px, 24px) instead of 6+
- Border radius: 3 values (6px, 8px, 12px) instead of 6

## Design Principles Applied
- **Visual hierarchy**: Size and weight differences create clear information structure
- **Spacing rhythm**: 8px grid creates predictable, harmonious layout
- **Consistency**: Fewer values used more consistently beats many values used randomly
- **Readability**: 12px minimum text size ensures accessibility (WCAG AA guideline)
