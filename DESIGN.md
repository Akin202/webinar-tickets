---
name: FlagIQ AI Summit '26
description: Dark conference ticketing pages for a 100-seat, one-day AI summit in Lagos.
colors:
  signal-red: "#E3173E"
  signal-red-deep: "#C8102F"
  focus-rose: "#FF5C7A"
  summit-navy: "#081028"
  navy-panel: "#0E1833"
  navy-card: "#111B38"
  navy-card-hover: "#16213F"
  navy-subtle: "#0C1530"
  navy-line: "#1D2A4B"
  navy-line-strong: "#3A4A70"
  agenda-rule: "#253B64"
  snow-text: "#F5F7FA"
  mist-muted: "#B8C1D4"
  slate-dim: "#8F9FBC"
  time-grey: "#D7DCE6"
  topbar-paper: "#F6F7F8"
  logo-chip: "#E9EDF2"
  status-urgent: "#FF8A8A"
  status-urgent-bg: "#2A1224"
  status-success: "#5EE0A0"
  status-success-bg: "#0D2A2A"
  status-warning: "#F7C35C"
  status-warning-bg: "#2A2314"
typography:
  display:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "clamp(52.5px, 9vw + 18.5px, 96px)"
    fontWeight: 800
    lineHeight: 0.94
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "clamp(30px, 4.2vw + 14px, 54px)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  row:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 600
    lineHeight: 1.4
  label:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.135em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  tag: "4px"
  button: "8px"
  control: "10px"
  field: "12px"
  panel: "16px"
  pill: "999px"
spacing:
  gutter: "clamp(17px, 4.5vw, 32px)"
  container: "1180px"
  band: "clamp(56px, 7vw, 104px)"
  control-min: "48px"
components:
  button-primary:
    backgroundColor: "{colors.signal-red}"
    textColor: "#FFFFFF"
    rounded: "{rounded.button}"
    padding: "0 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.signal-red-deep}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "#FFFFFF"
    rounded: "{rounded.button}"
    padding: "0 20px"
    height: "48px"
  pill-date:
    backgroundColor: "#0B1733"
    textColor: "#E6EAF0"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "25px"
  chip-meta:
    backgroundColor: "transparent"
    textColor: "{colors.mist-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "24px"
  panel-seat:
    backgroundColor: "{colors.navy-panel}"
    textColor: "{colors.snow-text}"
    rounded: "{rounded.panel}"
    padding: "22px 20px"
  input-field:
    backgroundColor: "{colors.navy-subtle}"
    textColor: "{colors.snow-text}"
    rounded: "{rounded.field}"
    padding: "0 16px"
    height: "48px"
  top-bar:
    backgroundColor: "{colors.topbar-paper}"
    textColor: "{colors.summit-navy}"
    height: "63px"
---

# Design System: FlagIQ AI Summit '26

## Overview

**Creative North Star: "The Programme Board"**

The public pages are a dark conference board: deep navy end to end, white bold geometric headlines, and a real agenda set in rows with mono times. It is the category-standard conference look (the Vercel Ship / AI Engineer Summit / TechCabal Moonshot register), chosen for this event's build only; it is not a standing FlagIQ brand preference. Its craft sits in the details, not in novelty: tight headline tracking, tabular times and money, hairline rules, one red action.

Density is phone-first. The first 390px viewport carries what, when, where, how much, both ways in and the day at a glance. Sections below are hairline-ruled bands rather than cards, with one raised navy panel for the seat purchase. Depth is quiet: a navy step, a single soft drop under the seat panel, and wave linework blended into the hero and closer.

Scope: every public page (event, checkout, ticket, unsubscribe, cookies, not-found, error, OG image). `/admin` and `/scan` are excluded; they keep their own `--tool-*` and `--scan-*` systems and must not be restyled toward this one.

**Key Characteristics:**
- Navy ground, one light top strip, white headlines.
- Signal red only for the primary action, the seat meter fill and the launch marker.
- Figtree for every public line; JetBrains Mono only for times, codes and money.
- Hairline-ruled rows instead of card grids.
- 48px minimum touch targets everywhere.

## Colors

A single deep navy family with white text and one hot signal red.

### Primary
- **Signal Red** (signal-red): the Get a seat / Continue to checkout button, the seat meter fill, the LAUNCH tag and the launch-row side bar. Hover darkens to **Signal Red Deep**. White on it measures 4.7:1.

### Secondary
- **Focus Rose** (focus-rose): focus outlines and field focus borders on the navy ground. Never a fill. (The light top bar uses Signal Red for its focus ring instead.)

### Neutral
- **Summit Navy** (summit-navy): the page ground on every public surface, injected from `brand.surface` in config.
- **Navy Panel / Card / Card Hover / Subtle**: one-step raises for the seat panel, checkout and ticket cards, hovers and input wells.
- **Navy Line** and **Navy Line Strong**: band dividers and card borders; strong for steppers and outline controls.
- **Agenda Rule** (agenda-rule): the rules between programme rows, a touch bluer than Navy Line.
- **Snow Text** (snow-text): body text, from `brand.ink` in config (ink is the text colour here, not a ground). Headlines go to pure white.
- **Mist Muted** (mist-muted, 10.6:1) and **Slate Dim** (slate-dim, 6.9:1): supporting copy and fine print.
- **Time Grey** (time-grey): mono times in agenda and speaker rows.
- **Topbar Paper** and **Logo Chip**: the one light strip and the rounded chip that holds the FlagIQ logo raster.
- **Status** (urgent, success, warning, each with a dark tinted background and border): checkout and ticket state panels and badges only.

### Named Rules
**The One Red Rule.** Signal Red marks the thing to do and the moment to see: the primary action, seats sold, the launch. It never tints headings, links or decoration.

**The Config Is The Palette Rule.** Brand base colours come from `brand` in `config/event.config.ts` through `lib/theme.tsx` into `--brand-*`. Components read tokens, never hardcode event colours.

## Typography

**Display Font:** Figtree (variable, 400 to 800), falling back to system-ui
**Body Font:** Figtree
**Label/Mono Font:** JetBrains Mono (500, 700) for times, ticket codes, quantities and totals

**Character:** One confident geometric sans carries headlines and prose; mono appears only where a number must line up or be read back.

### Hierarchy
- **Display** (800, clamp to 96px, 0.94): the hero title and the closer, max 11 to 12ch, pure white.
- **Headline** (800, clamp 30 to 54px, 1.04): section heads, balanced wrap. Checkout and ticket headings use 800 at 24 to 48px.
- **Title** (700, 19 to 22px): speaker names, ticket-type names, audience items.
- **Row** (600, 15 to 18px, 1.4): agenda and programme titles, FAQ questions (17px).
- **Body** (400 to 500, 16 to 17px, 1.55 to 1.6): section intros and answers in Mist Muted, capped near 58 to 62ch.
- **Label** (600, 11px, 0.135em tracking, uppercase): the date pill, the section rule label and meta chips.
- **Mono** (400, 12.5 to 15px, tabular): agenda times and durations; 700 for the quantity output.

### Named Rules
**The Mono Means Numbers Rule.** JetBrains Mono is for times, codes, quantities and money only; never for headings or labels.

**The Naira Fallback Rule.** Figtree has no ₦ glyph. Pages let the system font render it; the OG image loads Noto Sans (from `assets/fonts`) as a named fallback. Do not swap the display face to fix one glyph.

## Layout

A single column inside a 1180px shell with a fluid gutter (17 to 32px). Sections are full-width bands separated by a Navy Line hairline with fluid vertical padding (56 to 104px). The hero stays left-aligned: pill, title, two-line subline, then two equal buttons side by side (max 460px, 500px on desktop), with the day preview directly beneath.

At 880px the ticket options become a 1.15fr / 0.85fr pair, speakers go two columns, the audience three columns, and programme and FAQ split into a sticky head (0.8fr) beside the list (1.2fr). At 1024px the hero opens up (72px top, 150px bottom) and agenda rows grow to 56px with 110px time columns. Below 360px the date pill may wrap.

## Elevation & Depth

Mostly flat, layered by navy steps. The only shadow on the event page lifts the seat panel; the waves image (screen-blended, 60 to 80% opacity, desaturated) gives the hero and closer atmosphere without adding surfaces.

### Shadow Vocabulary
- **Seat lift** (`box-shadow: 0 28px 60px -32px rgba(0,0,0,0.7)`): the in-person seat panel only.

### Named Rules
**The Navy Step Rule.** Depth comes from moving one step up the navy scale plus a hairline border, not from glows or stacked shadows.

## Shapes

Soft, small radii that grow with the size of the thing: 4px tags, 8px standard buttons, 10px hero buttons and the stepper, 12px form fields and checkout buttons, 16px panels and cards, fully round pills, chips, meter track and avatars. Borders are 1px hairlines; dashed borders mean "to be announced" (the TBA speaker avatar). The launch row carries a 4px solid red bar on its left edge.

## Components

### Buttons
- **Shape:** gently rounded (8px; 10px in the hero pair; 12px on checkout).
- **Primary:** Signal Red with white text at 600 to 700 weight, 48px tall (52 to 56px on checkout and desktop hero), 20px side padding.
- **Hover / Focus:** background darkens to Signal Red Deep over 180ms on an expo-out ease; press nudges down 1px; focus is a 2px Focus Rose outline offset 3px.
- **Outline:** transparent with a near-white 1px border and white text; hover adds an 8% white wash. Used for Livestream and Help on WhatsApp.
- **Disabled:** 55% opacity, not-allowed cursor.

### Chips
- **Date pill:** 25px round pill on a slightly lighter navy, 11px tracked caps, a single line of real date and time.
- **Meta chip:** outlined 24px pill in Mist Muted (IN PERSON · LAGOS, ONLINE · FREE).
- **Status badges** (ticket page): round pills on the matching status background and border, uppercase bold.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Navy Panel for the seat option; transparent with a Navy Line border for the free option; Navy Card for checkout and ticket panels.
- **Shadow Strategy:** only the seat panel lifts (see Elevation).
- **Internal Padding:** 22px / 20px on phones, 30px / 28px from 880px; checkout panels 32 to 48px.

### Inputs / Fields
- **Style:** 48px tall, 12px radius, Navy Subtle well, 1px border, Snow Text, Slate Dim placeholder.
- **Focus:** border shifts to Focus Rose.
- **Error:** Status Urgent border and a 12px Status Urgent message beneath.

### Navigation
- **Top bar:** sticky light strip (63px, 72px on desktop) with a hairline bottom border. The FlagIQ logo raster sits on a 12px-radius Logo Chip at left. Phones get a 48px menu button that opens a list of 48px rows; from 880px, inline 600-weight links with underline on hover.

### Agenda Row (signature)
A two- or three-column row: mono time, 600-weight title, optional mono duration, separated by Agenda Rule hairlines. Breaks and TBA slots drop to 500 weight in Mist Muted. The launch row takes a 4px Signal Red left bar, a red LAUNCH tag above the title, and on the full programme a red-to-transparent wash at 12%.

### Seat Meter
A 6px round track in dark navy with a Signal Red fill that grows by `scaleX` (transform, never width) over 1.1s; the sold count and status sit above it in white tabular figures.

## Do's and Don'ts

### Do:
- **Do** keep every public page on Summit Navy with the light top bar and the logo chip.
- **Do** set times, codes, quantities and money in JetBrains Mono with tabular figures.
- **Do** keep touch targets at least 48px and text contrast at least 4.5:1 on the navy.
- **Do** animate only transform and opacity, on the expo-out ease `cubic-bezier(0.16, 1, 0.3, 1)`, and let reduced motion kill it.
- **Do** use the FlagIQ logo as the supplied raster (`public/assets/flagiq-logo-trim.png`), never redrawn or recoloured.
- **Do** mark the launch slot with the red left bar and tag wherever the programme appears.

### Don't:
- **Don't** use Signal Red for headings, links, borders or decoration.
- **Don't** apply this system to `/admin` or `/scan`; their `--tool-*` and `--scan-*` colours are separate, and scanner colours are fixed safety signals.
- **Don't** hardcode event colours in components; read `--brand-*` tokens fed by config.
- **Don't** replace hairline-ruled rows with card grids.
- **Don't** set tag text below 10px (the LAUNCH tag is 10px).
