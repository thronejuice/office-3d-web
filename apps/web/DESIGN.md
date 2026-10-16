---
name: Office3D
description: Soft, friendly 2D chrome floating over an isometric 3D office; Thai-first, touch-first, light and dark.
colors:
  sky-ink: "#1d2433"
  slate-muted: "#586474"
  cloud-bg: "#f3f5f9"
  paper-surface: "#ffffff"
  hairline: "#dde2ea"
  signal-blue: "#3b6cf6"
  signal-blue-soft: "#eef2ff"
  coral-danger: "#c9354e"
  presence-green: "#2fbf71"
  busy-amber: "#f2a93b"
  dnd-red: "#e5484d"
  away-gray: "#98a1b0"
  banner-cream: "#fff4e5"
  warn-blush: "#ffe9ec"
  warn-text: "#b31b37"
  night-bg: "#12161f"
  night-surface: "#1b212d"
  night-ink: "#f0f3f8"
  night-muted: "#9faec2"
  night-accent: "#4d7cf8"
typography:
  body:
    fontFamily: "Noto Sans Thai, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  headline:
    fontFamily: "Noto Sans Thai, system-ui, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 600
  title:
    fontFamily: "Noto Sans Thai, system-ui, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 600
  label:
    fontFamily: "Noto Sans Thai, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 600
  tag:
    fontFamily: "Noto Sans Thai, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
rounded:
  sm: "10px"
  md: "14px"
  lg: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "24px"
components:
  button:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.sky-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
    height: "44px"
  pill:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.sky-ink}"
    rounded: "{rounded.pill}"
    height: "44px"
  pill-alert:
    backgroundColor: "{colors.busy-amber}"
    textColor: "{colors.sky-ink}"
    rounded: "{rounded.pill}"
  input:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.sky-ink}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
    height: "44px"
  panel:
    backgroundColor: "{colors.paper-surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
  card:
    backgroundColor: "{colors.paper-surface}"
    rounded: "{rounded.md}"
    padding: "12px"
    width: "220px"
---

# Design System: Office3D

## Overview

**Creative North Star: "ประตูกระจกสู่ออฟฟิศ" (The Glass Door to the Office)**

The 3D isometric office is the content; everything in 2D is a light, rounded layer floating in front of it. Controls are soft, friendly and easy to hit with a thumb. They stay out of the way of the scene and never compete with avatars for attention. Nothing is decorative: every pill, drawer and card exists because someone needs to reach another person, change status, or fix their avatar.

The system is deliberately quiet. One blue accent carries every selected state and primary action; the four status colors are reserved for presence and are never reused as decoration. It is Thai-first, so line heights and padding leave room for tone marks. Light and dark follow the OS (`prefers-color-scheme`).

Surfaces are opaque; there is no `backdrop-filter`. The "glass" is a matter of lightness, rounding and soft shadow, not blur.

**Key Characteristics:**
- Soft rounded rectangles (10–18px) and full pills for the persistent controls.
- One accent (Signal Blue), four presence colors, everything else neutral.
- Every interactive element is at least 44×44px.
- Soft layered shadows only; borders are one-pixel hairlines.
- Status is always shape + color + text, never color alone.

## Colors

A cool, near-neutral palette with a single blue voice. All values are CSS custom properties on `:root` in `src/styles.css`, with dark overrides under `prefers-color-scheme: dark`.

### Primary
- **Signal Blue** (#3b6cf6; dark #4d7cf8): primary buttons, selected chips/tools/segments (with Signal Blue Soft fill), focus outline, hover border on buttons. White text on it is 4.5:1.

### Secondary
- **Busy Amber** (#f2a93b): the "busy" status dot and the missed-knock alert pill (dark ink text, 7.8:1).

### Tertiary
- **Presence Green** (#2fbf71): available status.
- **DND Red** (#e5484d): do-not-disturb status, warn border.
- **Away Gray** (#98a1b0): away status ring.

### Neutral
- **Cloud Background** (#f3f5f9; dark #12161f): page behind panels.
- **Paper Surface** (#ffffff; dark #1b212d): all panels, drawers, menus, cards, pills, inputs.
- **Sky Ink** (#1d2433; dark #f0f3f8): body text. Toasts always use Sky Ink as a dark surface with white text.
- **Slate Muted** (#586474; dark #9faec2): secondary text and labels (5.5:1 on Cloud).
- **Hairline** (#dde2ea; dark #2b3546): borders and row dividers.
- **Signal Blue Soft** (#eef2ff; dark #1e2a44): selected-state fill.
- **Coral Danger** (#c9354e; dark #f2556d): error text. **Warn Text** (#b31b37) on **Warn Blush** (#ffe9ec) for the reconnecting banner; **Banner Cream** (#fff4e5) for mic notices.

### Named Rules
**The One Voice Rule.** Signal Blue is the only accent. Selected, primary and focus all use it; a second accent is never introduced.
**The Presence Colors Are Not Decoration Rule.** Green, amber, red and gray mean status only (amber also marks missed knocks). Never use them for generic emphasis.
**The Token Rule.** Colors come from tokens. New surfaces use `--surface`, `--ink`, `--muted`, `--line`, `--accent`, `--accent-soft`; no new literal hex in component CSS.

## Typography

**Display Font:** none; the UI has no display face.
**Body Font:** Noto Sans Thai (self-hosted via `@fontsource`, weights 400 and 600, with system-ui fallback)

**Character:** One humane Thai-capable family, two weights. Hierarchy comes from size and weight steps, not from additional families.

### Hierarchy
- **Headline** (600, 1.4rem): panel and page titles (`h1`).
- **Title** (600, 1.1rem): drawer section titles (`h2`).
- **Label** (600, 0.85rem, muted): section captions (`h3`), table headers.
- **Body** (400, 15px): everything else; form labels 0.9rem muted; secondary lines `.small` 0.8rem.
- **Tag** (400, 13px): in-world name tags and hover cards (13px).

### Named Rules
**The Offline Font Rule.** Fonts ship in the build. Nothing loads from a CDN or Google Fonts.
**The Tone-Mark Rule.** Never set Thai text tighter than normal line height or clip it with tight fixed heights.

## Layout

The office fills the viewport (`position: fixed; inset: 0`); all chrome is pinned to its edges with `env(safe-area-inset-*)`. The top bar (status pill, missed alert, menu) sits top-left/right; the mute and emote buttons sit bottom-right; the joystick (touch devices only) bottom-left. Pages outside the office (login, admin) are centered panels (`min(420px, 100%)`) or a 1000px-max column.

Spacing is a loose 4/8/12/24px rhythm with gaps of 6–10px in rows. Responsive breakpoints are 720px (customizer, admin forms and map editor stack; emotes collapse behind a button) and 600px (the right drawer becomes a floating sheet with a 144px bottom clearance so it never covers the joystick or bottom buttons).

## Elevation & Depth

Floating layers over a flat scene. Depth is expressed by soft diffuse shadows; the page itself is flat. Drawers, menus, cards and modals rise above the scene, and in-world labels sit between scene and chrome.

### Shadow Vocabulary
- **Small** (`0 1px 4px rgba(0,0,0,.15)`): name tags, emote bubbles, joystick knob.
- **Pill** (`0 2px 10px rgba(0,0,0,.12)`): top-bar pills, round buttons.
- **Medium** (`0 4px 16px rgba(0,0,0,.18)`): toasts.
- **Large** (`0 8px 30px rgba(0,0,0,.2)`): menu, hover card, desk editor, mobile drawer.
- **Panel** (`0 8px 30px rgba(29,36,51,.14)`): login/customizer panels.
- **Drawer** (`-6px 0 24px rgba(0,0,0,.14)`): the right-hand drawer.

Dark mode raises opacity (0.35–0.5) rather than changing structure.

### Named Rules
**The Float, Don't Stack Rule.** Only one layer sits over the scene at a time per region; panels do not nest shadows inside shadows.

## Shapes

Rounded and friendly. Inputs and buttons are 10px; cards 14px; panels and drawers 18px; persistent controls (status pill, menu, mute, emotes, name tags) are full pills or circles. Borders are 1px Hairline; selected states swap the border to Signal Blue and fill with Signal Blue Soft. Status dots are shape-coded (circle = available, square = busy, diamond = DND, hollow ring = away).

## Components

### Buttons
- **Shape:** 10px radius, 1px hairline border, 44px minimum height.
- **Default:** Paper Surface with Sky Ink text; hover changes the border to Signal Blue.
- **Primary:** Signal Blue fill, white text.
- **Ghost:** transparent, muted text, no border (close, cancel).
- **Round:** 52px circle for mute and emotes; muted state uses Warn Blush, active uses Signal Blue Soft.
- **Disabled:** 50% opacity.

### Pills (top bar)
- Full radius, Paper Surface, pill shadow. The alert pill is Busy Amber with Sky Ink text, weight 600.

### Chips / Segments / Tools
- 44px high, default button look; selected = Signal Blue border + Signal Blue Soft fill. Used for hair/clothing options, status segments, map tools.

### Inputs / Fields
- 10px radius, hairline border, 44px high, Paper Surface; label above in muted 0.9rem. Native focus outline is kept; selectable rows add a 2px Signal Blue `:focus-visible` outline.

### Drawers / Modals / Menu
- Right drawer (max 340px) on desktop, floating sheet on phones. Modals use a 40% black scrim and a centered 18px panel. The menu is an 8px-padded floating list of 44px items.

### Hover Card (signature)
- 220px, 14px radius, large shadow, projected above the avatar's name tag; holds name, role, status and two 44px buttons (walk to, knock).

### Name Tag (signature)
- Full-pill, Paper Surface, 13px text with a shape-coded status dot, and a muted-mic glyph when muted.

### Toasts
- Dark Sky Ink surface with white text, 12px radius, 44px action buttons; announced via `aria-live`.

### Game Surfaces

The table panels (`.gamepanel`) keep the app's soft panel look, but the things inside them use fixed, domain colours that are deliberately outside the UI palette, because they stand for real objects:

- **Felt** (#1f6b4a) behind poker, Uno and Pok Deng tables, with white text (6.4:1). **Chess board** squares #efe4cf / #9b7b57 with a #5b4630 frame, pieces drawn light (#f5f0e6) or dark (#2b3245) with a strong outline so they read on either square.
- **Playing cards** are always white with ink (#1d2433) and red (#c9354e) suits. **Uno** colours are #c9354e, #f2b01e (with dark ink), #1f7d4e and #3b6cf6, and every colour also has its own shape (circle, triangle, square, diamond) so a card never relies on colour. **Bingo** uses Signal Blue for called/marked squares plus a check mark.
- Game panels follow the same rules as the rest of the UI: 44px touch targets, status never by colour alone (turn outline + `aria-current`, `+`/`−` on money, a check mark on marked squares), a roving single tab stop on the chess board with arrow-key movement, Escape closes the panel, and motion respects `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** use `var(--surface)`, `--ink`, `--muted`, `--line`, `--accent` and `--accent-soft` for any new UI, and add dark values for any new token.
- **Do** keep every touch target at least 44×44px.
- **Do** pair every status color with its shape and a text/aria label.
- **Do** keep all copy in `src/strings.th.ts`.
- **Do** keep mobile panels clear of the joystick (144px bottom clearance).

### Don't:
- **Don't** introduce a second accent color or reuse presence colors decoratively.
- **Don't** load fonts, icons or images from the internet.
- **Don't** add `backdrop-filter` or blur to chrome; the 3D scene is the performance budget.
- **Don't** nest shadowed cards inside shadowed panels.
- **Don't** convey state by color alone, and don't disable pinch zoom.
