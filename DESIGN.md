---
name: Vianova Health
description: All-in-one CCM/RPM/billing care-coordination platform for small practices
colors:
  clinical-teal: "#0e7490"
  clinical-teal-deep: "#0c5f78"
  clinical-teal-tint: "#e0f2fe"
  clinical-teal-wash: "rgba(14,116,144,.08)"
  sky-accent: "#0284c7"
  success: "#059669"
  success-tint: "#d1fae5"
  warning: "#d97706"
  warning-tint: "#fef3c7"
  danger: "#dc2626"
  danger-tint: "#fee2e2"
  ink: "#0f172a"
  ink-muted: "#475569"
  ink-faint: "#94a3b8"
  surface: "#ffffff"
  surface-sunken: "#f8fafc"
  canvas: "#f0f4f8"
  border: "#e2e8f0"
  border-strong: "#cbd5e1"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  label-heading:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.06em"
rounded:
  sm: "8px"
  md: "9px"
  lg: "12px"
  xl: "14px"
  pill: "99px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.clinical-teal}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "9px 18px"
  button-primary-hover:
    backgroundColor: "{colors.clinical-teal-deep}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "9px 18px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 18px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  badge-success:
    backgroundColor: "{colors.success-tint}"
    textColor: "#065f46"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  badge-danger:
    backgroundColor: "{colors.danger-tint}"
    textColor: "#991b1b"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 13px"
---

# Design System: Vianova Health

## Overview

**Creative North Star: "The Clinical Command Console"**

Vianova reads as an instrument panel for people who live in it all day, not a marketing surface: a fixed sidebar, a sticky topbar, and a scroll area of cards, tables, and stat tiles built for fast scanning under real clinical load. Clinical Teal (#0e7490) is the single signal color — reserved for primary actions, active navigation, focus rings, and the handful of data points that matter most — set against a mostly-neutral canvas of white surfaces, slate borders, and a barely-there blue-gray page background. Status is carried almost entirely through the badge/pill vocabulary (success green, warning amber, danger red, info sky, neutral slate) rather than through decoration, so a care manager scanning a roster reads state at a glance.

The console idiom also carries the "multi-role coordination" half of the brief: badges, stat cards, and table rows are built to represent live operational status (open care gaps, pending cases, active CCM/RPM enrollment) rather than static content, and the layout scales from a 4-role desktop dashboard down to a mobile bottom-tab app without changing its visual language — because a doctor, a care manager, and an admin all need the same trustworthy, low-noise reading of the same data. Confirmed visual rejection: this system does not use decorative illustration, marketing-style hero imagery, or heavy color for its own sake; teal's rarity is what makes it legible as "this is the important one."

**Key Characteristics:**
- One accent (Clinical Teal), used sparingly, against a neutral slate/white palette
- Soft, layered shadows and small hover-lift motion — never flat/brutalist, never heavy/skeuomorphic
- Rounded-but-restrained geometry: 8–14px radii on containers, pill (99px) radii on badges/tabs/search
- Status communicated through a consistent badge vocabulary, not through varying card chrome
- Dense, scanable information layout (tables, stat grids, list+detail panels) over generous whitespace-led layout
- Fully responsive: sidebar+topbar (desktop) → collapsible drawer (tablet) → bottom tab bar (mobile), same components throughout

## Colors

A near-monochrome slate/white base with exactly one warm-adjacent accent (teal) and a small, consistent semantic set for status.

### Primary
- **Clinical Teal** (#0e7490): the system's only recurring accent. Primary buttons (as a `#0e7490 → #0c6580` gradient), active sidebar/tab state, input focus rings (`rgba(14,116,144,.12)` glow), links, and the handful of stat icons/values that represent the page's main metric.

### Secondary
- **Sky Accent** (#0284c7): a cooler, slightly brighter blue used only for the "info" badge role and occasional secondary data emphasis — never competes with Clinical Teal for primary-action attention.

### Neutral
- **Ink** (#0f172a): primary text.
- **Ink Muted** (#475569): secondary text — labels, descriptions, table body copy.
- **Ink Faint** (#94a3b8): tertiary text — placeholders, captions, table headers, timestamps.
- **Surface** (#ffffff): cards, sidebar, inputs, topbar.
- **Surface Sunken** (#f8fafc): table header rows, search fields, hover backgrounds — one step recessed from Surface.
- **Canvas** (#f0f4f8, gradient to #e8f0f7): the page background behind all cards, fixed-attachment so it doesn't scroll with content.
- **Border** (#e2e8f0) / **Border Strong** (#cbd5e1): default and emphasized (hover/focus-adjacent) dividers.

### Semantic status
- **Success** (#059669 / tint #d1fae5): completed, resolved, done states.
- **Warning** (#d97706 / tint #fef3c7): needs-attention, pending states.
- **Danger** (#dc2626 / tint #fee2e2): critical, overdue, destructive-action states.

### Named Rules
**The One Signal Rule.** Clinical Teal is the only color allowed to mean "primary action" or "currently active." Never introduce a second accent hue for emphasis — reach for the semantic status colors (success/warning/danger/sky) instead, which already carry their own fixed meaning.

## Typography

**Body Font:** Inter (with system-ui, sans-serif fallback)

**Character:** A single, highly legible grotesque carrying the entire system — display numbers, page titles, and dense table body copy all read as the same disciplined voice. Weight (not size) does most of the hierarchy work: body copy stays at 13–14px throughout, and importance is signaled by jumping to 700–800 weight rather than dramatically larger type.

### Hierarchy
- **Display** (800, 34px, 1.1 line-height, -0.02em): stat-card values — the single number a care manager scans for first on any dashboard.
- **Title** (700, 22px, 1.2, -0.01em): page-header `h1` — one per page.
- **Label-Heading** (700, 17px, 1.2, -0.01em): topbar title, card-level emphasis headings.
- **Body** (400, 14px, 1.5): default running text and form copy; table body sits slightly tighter at 13px for density.
- **Label** (700, 11px, 1.3, 0.06em uppercase): table column headers, stat-card labels, section eyebrows — always uppercase, always wide-tracked, always Ink Faint or Ink Muted, never full Ink.

### Named Rules
**The Weight-Over-Size Rule.** Hierarchy is built primarily through font-weight jumps (400 → 600 → 700 → 800) at a narrow size range (11–22px, with 34px reserved only for headline stat values), not through a wide type scale. This is what keeps dense dashboard screens calm instead of shouty.

## Layout

Fixed 248px sidebar + sticky 62px topbar desktop shell, with a `.container` max-width of 1100px for narrower content-style pages. Page content areas use a consistent `24–32px` outer padding (`.page-header`, `.stats-grid`, `.review-layout`) that steps down at each breakpoint rather than reflowing structure unpredictably.

Two recurring multi-column patterns carry almost all page types: a 4-up `.stats-grid` for KPI rows, and paired layouts (`.review-layout`: content + 360px sticky sidebar; `.list-detail-layout`: 300px list + flexible detail pane) for anything that's "pick an item, see its detail."

**Responsive behavior** (three breakpoints, each a real structural change, not just scaling):
- **≤900px (tablet):** sidebar and global topbar hidden; stat/paired-layout grids collapse to fewer columns; hardcoded `repeat(N, 1fr)` inline grids get forced to 2 columns via an attribute selector safety net.
- **≤640px (mobile):** dedicated mobile chrome takes over — fixed 56px mobile header, slide-down drawer nav, fixed bottom tab bar (with safe-area padding) — desktop topbar and sidebar fully removed from flow, not just hidden. Grids drop to 1 column; tables scroll horizontally instead of reflowing.
- **≤380px (extra small):** stat grid drops to single column; bottom-tab labels hide, icon-only.

### Named Rules
**The Structural Breakpoint Rule.** Each breakpoint changes which chrome exists (sidebar↔drawer↔bottom-tabs), not just how big things are. Never simulate a breakpoint with scale/zoom alone.

## Elevation & Depth

Soft and layered, never flat-by-default and never skeuomorphic. Every resting card carries a faint ambient shadow; interactive elements (cards, stat tiles, buttons) add a second, slightly larger shadow plus a small upward translate on hover — depth is a response to attention, both static (resting cards) and dynamic (hover).

### Shadow Vocabulary
- **shadow** (`0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)`): default resting elevation for cards, mobile header.
- **shadow-md** (`0 4px 12px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.04)`): raised state — dropdowns, mobile drawer, hovered secondary buttons.
- **shadow-lg** (`0 10px 30px rgba(0,0,0,.10), 0 4px 8px rgba(0,0,0,.06)`): highest layer — bottom nav bar, topmost overlays.
- **Colored glow** (e.g. `0 2px 8px rgba(14,116,144,.3)` on the primary button, `0 4px 16px rgba(220,38,38,.3)` on the emergency banner): reserved for the single most important actionable/urgent element on a screen — a tinted shadow that matches the element's own color, not a generic gray.

### Named Rules
**The Earned Glow Rule.** A colored (non-gray) shadow is reserved for exactly one thing per screen — the primary CTA or an active emergency/critical banner. Everything else, however elevated, uses the neutral gray shadow scale.

## Shapes

Rounded-but-restrained: 8–14px radii on rectangular containers (inputs 9px, cards 12px, stat cards 14px), scaling up slightly with the size/importance of the container. Anything meant to read as a "chip" — badges, tabs' active underline aside, the search field, tag pills, the dropdown pill — goes fully pill-shaped (99px). Circles are reserved for status/step indicators (step-circle, avatar). Borders are hairline (1–1.5px, `--border`/`--border-strong`) and always paired with a soft shadow rather than relied on alone to separate a card from the canvas.

### Named Rules
**The Pill-Means-Status Rule.** Full pill radius (99px) is reserved for small, discrete status/filter/search elements (badges, tags, dropdown pills, tab-adjacent search). Larger content containers (cards, panels, modals) stay in the 8–14px range and never go full-pill — that would read as a button, not a container.

## Components

### Buttons
- **Shape:** 9px radius standard, 7px for `.btn-sm`.
- **Primary:** Clinical Teal gradient (`#0e7490 → #0c6580`) background, white text, 700 weight, colored ambient shadow (`0 2px 8px rgba(14,116,144,.3)`).
- **Hover / Focus:** primary darkens one step, shadow grows and gains blur, button lifts 1px (`translateY(-1px)`); active state removes the lift.
- **Secondary / Ghost:** white background, 1.5px border, plain gray ambient shadow; hover moves to Surface Sunken background with a strengthened border, no color shift.
- **Danger / Success variants:** flat semantic-color fill (`--danger` / `--success`), same shape and motion contract as primary, reserved for genuinely destructive or confirming actions.
- **Disabled:** 45% opacity, no shadow, no hover motion.

### Badges
- **Style:** pill radius, tinted background + saturated text in the matching hue (never white-on-color), 11px/700-weight uppercase-adjacent label sizing, no border.
- **State:** five fixed roles only — success, warning, danger, info (sky), neutral (slate). Never introduce a sixth ad hoc color.

### Cards / Containers
- **Corner Style:** 12px radius (14px for stat cards).
- **Background:** Surface (white), always against the Canvas page background — cards never sit directly on another card's surface color.
- **Shadow Strategy:** resting `shadow`, hover (if interactive/`.hoverable`) steps up to a larger neutral shadow plus a 2–3px lift.
- **Border:** hairline `--border`, always present alongside the shadow (never shadow-only).
- **Internal Padding:** header 18–20px, body 20px (steps down to 12–14px on mobile).

### Inputs / Fields
- **Style:** 1.5px border, 9px radius, Surface background, 13.5px text.
- **Focus:** border shifts to Clinical Teal plus a 3.5px soft teal glow ring (`rgba(14,116,144,.12)`) — the same focus contract on inputs, textareas, selects, and the tag-input container.
- **Error / Disabled:** not yet a distinct visual state in the incumbent system — currently unstyled beyond browser default; flagged as a gap in Do's and Don'ts.

### Navigation
- **Sidebar (desktop):** icon + label items, 9px radius, Ink Muted default text; hover nudges 2px right with a Surface Sunken background; active state uses the Clinical Teal tint background with full teal text and 600 weight — no border or shadow on active, color alone carries it.
- **Tabs:** underline style — transparent by default, Clinical Teal 2px bottom border + teal text when active; no background change.
- **Mobile bottom tab bar:** icon + micro-label, Ink Faint default, Clinical Teal + icon drop-shadow glow when active.

### Stat Cards (signature component)
The primary "read this first" component: large 800-weight number, uppercase wide-tracked label beneath it, a colored icon chip above, staggered fade-up entrance animation per card (0.02s–0.2s delay), hover lift with icon micro-rotation (`scale(1.08) rotate(-4deg)`). This is where the console's personality lives — everywhere else stays deliberately quiet so these numbers read as the headline.

## Do's and Don'ts

### Do:
- **Do** keep Clinical Teal reserved for primary actions and active/selected state — if something new needs emphasis, reach for a semantic status color first.
- **Do** pair every card/panel border with a soft neutral shadow; never rely on border-only separation from the canvas.
- **Do** build hierarchy with font-weight jumps within the existing 11–22px range before reaching for a new type size.
- **Do** give every breakpoint a real structural change (which chrome exists), matching the existing sidebar → drawer → bottom-tabs pattern, rather than only scaling elements down.
- **Do** use the pill radius exclusively for small status/filter elements (badges, tags, search, dropdown pills).

### Don't:
- **Don't** introduce a second accent hue for "another important thing" — it dilutes the One Signal Rule and makes teal stop meaning "primary."
- **Don't** add decorative illustration, stock photography, or marketing-style hero imagery — this is an Operate-mode tool, not a persuade-mode surface.
- **Don't** give large containers (cards, modals, panels) a full pill radius — that reads as a button/chip, not a container.
- **Don't** rely on a gray shadow for the single most important actionable element on a screen when a colored, tinted shadow (matching the element's own hue) is available and unclaimed.
- **Don't** ship a new form input without the established focus contract (teal border + 3.5px soft glow ring) — an input with a different focus treatment reads as broken, not distinctive.
