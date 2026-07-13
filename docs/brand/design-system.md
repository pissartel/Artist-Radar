# NextStage — Design System

## 1. Color Tokens

### Core neutrals
```
--color-bg:            #0B0A10;   /* app background */
--color-surface:       #16151D;   /* card / panel */
--color-surface-raised:#1D1B26;   /* active / selected panel */
--color-border:        rgba(255,255,255,0.06);   /* default hairline */
--color-border-strong: rgba(255,255,255,0.10);   /* input / button border */
--color-border-subtle: rgba(255,255,255,0.14);   /* ghost button border */
```

### Text
```
--color-text-primary:   #F5F5F7;
--color-text-secondary: #B4B2BF;
--color-text-tertiary:  #9997A6;
--color-text-muted:     #6E6C7A;
--color-text-disabled:  #5C5A66;
--color-text-inverse:   #12101F;   /* on light surfaces */
--color-text-light-bg:  #FAFAFC;  /* wordmark on dark */
```

### Accent (brand violet, matches logo)
```
--color-accent:         #9333EA;  /* solid CTAs, active states */
--color-accent-onDark:  #C084FC;  /* accent text/icons on dark bg */
--color-accent-tint:    rgba(147,51,234,0.14);  /* tinted backgrounds */
--color-accent-tint-strong: rgba(147,51,234,0.4); /* avatar rings */
```

### Brand gradient (logo + primary CTA only)
```
--gradient-brand: linear-gradient(135deg, #4B4DF7 0%, #9333EA 50%, #F43F5E 100%);
--gradient-brand-onDark: linear-gradient(135deg, #6D6BFF 0%, #A855F7 50%, #FB5B76 100%); /* icon on dark surfaces */
```

### Semantic / status
```
--color-success:      #22C55E;
--color-success-text: #4ADE80;
--color-success-tint: rgba(34,197,94,0.12);

--color-warning:      #F97316;
--color-warning-text: #FB923C;
--color-warning-tint: rgba(249,115,22,0.14);

--color-info:      #3B82F6;
--color-info-text: #60A5FA;
--color-info-tint: rgba(59,130,246,0.14);
```

## 2. Semantic Color Roles

| Token | Role |
|---|---|
| `--color-bg` | Page/app root background |
| `--color-surface` | Cards, panels, inputs' container |
| `--color-surface-raised` | Selected sidebar item, hovered card |
| `--color-accent` | Primary buttons (solid), active nav dot, active tab bg |
| `--color-accent-onDark` | Accent-colored text/icons, badges, links on dark bg |
| `--gradient-brand` | Logo icon, primary CTA button only |
| `--color-success` / `-text` / `-tint` | Positive metrics, "Opening Slot" badges, growth % |
| `--color-warning` / `-text` / `-tint` | Festival/event category tags |
| `--color-info` / `-text` / `-tint` | Venue category tags, secondary data points |

## 3. Typography

**Family:** `'Manrope', sans-serif` (headings, UI, body). Monospace label font: `'JetBrains Mono', monospace` (eyebrows/section labels only).

| Style | Size | Weight | Line-height | Letter-spacing | Use |
|---|---|---|---|---|---|
| Display / Hero | 60px | 800 | 1.05 | -0.03em | Landing hero headline |
| H1 | 44px–60px | 800 | 1.05–1.1 | -0.03em | Page-level hero headings |
| H2 | 30px | 800 | 1.2 | -0.02em | Section/step headings |
| H3 | 26px | 800 | 1.2 | -0.02em | Card headline (artist name, panel title) |
| H4 | 22px–24px | 800 | 1.2 | -0.02em | Sub-section headings |
| Body Large | 18px | 500 | 1.5 | 0 | Hero subhead |
| Body | 15px–16px | 500 | 1.5 | 0 | Default UI/body text |
| Body Small | 14px | 500–600 | 1.4 | 0 | Secondary copy, nav links |
| Caption | 13px | 600 | 1.4 | 0 | Field labels, tab labels |
| Micro / Eyebrow | 11px–13px | 700 | 1.3 | 0.06em–0.1em | Uppercase labels, badges |
| Mono label | 11px–13px | 500 | 1.3 | 0.08em | Section eyebrows (JetBrains Mono) |

**Wordmark specifically:** Manrope 800, letter-spacing -0.02em to -0.03em, never restyled.

## 4. Spacing Scale

Base unit: 2px. Use the following scale (px):
```
--space-1: 2px;
--space-2: 4px;
--space-3: 6px;
--space-4: 8px;
--space-5: 10px;
--space-6: 12px;
--space-7: 14px;
--space-8: 16px;
--space-9: 18px;
--space-10: 20px;
--space-12: 24px;
--space-14: 28px;
--space-16: 32px;
--space-20: 40px;
--space-24: 48px;
--space-28: 56px;
--space-32: 64px;
--space-40: 80px;
--space-48: 96px;
```
Common applications: card padding 20–32px, sidebar item padding 12px 14px, section gaps 16–24px, page padding (desktop) 32–56px.

## 5. Border-Radius Scale

```
--radius-sm: 8px;    /* inputs, small buttons, stat icon tiles */
--radius-md: 10px;   /* buttons, badges (pill uses 999px) */
--radius-lg: 12px;   /* primary buttons, sidebar active item */
--radius-xl: 14px;   /* cards, panels */
--radius-2xl: 16px;  /* large cards, feature cards */
--radius-3xl: 20px;  /* app frame / screen container */
--radius-full: 999px; /* pills, badges, tags */
--radius-circle: 50%; /* avatars, status dots, spinner */
```

## 6. Shadows

```
--shadow-card: 0 1px 3px rgba(18,16,31,0.08);        /* logo cards, light surfaces */
--shadow-frame: 0 20px 60px rgba(0,0,0,0.25);         /* app/browser frame elevation */
```
No shadows on inline UI elements (buttons, inputs, badges) — flat surfaces + 1px borders only. Reserve shadows for whole-screen frames/containers.

## 7. Borders

```
--border-hairline: 1px solid rgba(255,255,255,0.06);   /* card edges, dividers */
--border-input:    1px solid rgba(255,255,255,0.10);   /* inputs, secondary buttons */
--border-ghost:    1px solid rgba(255,255,255,0.14);   /* ghost button */
--border-accent:   2px solid rgba(147,51,234,0.4);     /* avatar accent ring */
```

## 8. Layout Widths

```
--container-app-frame: 1440px;   /* dashboard/landing screen frame */
--container-form: 560px;         /* centered form column */
--container-pipeline: 560px;     /* centered pipeline column */
--sidebar-width: 248px;          /* dashboard left nav */
```
Content grids: 3-column (landing features), 4-column (dashboard stat cards / artist cards), `gap: 16px–20px`.

## 9. Responsive Breakpoints

```
--bp-sm:  480px;   /* mobile */
--bp-md:  768px;   /* tablet portrait */
--bp-lg:  1024px;  /* tablet landscape / small desktop */
--bp-xl:  1440px;  /* desktop (design reference width) */
--bp-2xl: 1920px;  /* large desktop */
```
- **< 768px:** sidebar collapses to a bottom tab bar or slide-over drawer; single-column stat/artist grids; form and pipeline columns go full-width with 20px side padding.
- **768–1023px:** 2-column stat/artist grids; sidebar becomes icon-only rail (collapsed width 72px) or overlay drawer.
- **≥ 1024px:** full sidebar (248px) + 4-column grids as designed.

## 10. Buttons

**Primary (gradient CTA)**
```
background: linear-gradient(135deg,#4B4DF7,#9333EA,#F43F5E);
color: #FFFFFF; font-weight: 700; font-size: 15–16px;
padding: 14–16px 26–30px; border-radius: 12px;
```
Hover: brightness(1.08). Active: brightness(0.95), scale(0.99). Focus: 2px solid #C084FC outline, 2px offset. Disabled: opacity 0.4, no pointer events.

**Secondary (solid violet)**
```
background: #9333EA; color: #FFFFFF; font-weight: 700; font-size: 14–15px;
padding: 13–14px 26px; border-radius: 12px;
```
Hover: background #7E22CE. Active: background #6B21A8. Focus: 2px solid #C084FC outline. Disabled: background #3A2E4D, color #6E6C7A.

**Tertiary (surface)**
```
background: #1D1B26; border: 1px solid rgba(255,255,255,0.10);
color: #F5F5F7; font-weight: 700; font-size: 14–15px; padding: 13–14px 26px; border-radius: 12px;
```
Hover: background #24222F. Active: background #16151D.

**Ghost**
```
background: transparent; border: 1px solid rgba(255,255,255,0.14);
color: #B4B2BF; font-weight: 700; font-size: 14–16px; padding: 12–15px 24–30px; border-radius: 12px;
```
Hover: border-color rgba(255,255,255,0.24), color #F5F5F7.

**Text link ("Back", nav)**
```
color: #9997A6; font-weight: 600; font-size: 14px; background: transparent;
```
Hover: color #F5F5F7.

## 11. Inputs

```
background: #0B0A10;
border: 1px solid rgba(255,255,255,0.10);
border-radius: 10px;
padding: 13px 16px;
color: #F5F5F7; font-size: 15px;
placeholder-color: #6E6C7A;
```
Hover: border-color rgba(255,255,255,0.18).
Focus: border-color #9333EA, box-shadow 0 0 0 3px rgba(147,51,234,0.25).
Disabled: background #16151D, color #5C5A66, border rgba(255,255,255,0.06).
Error state: border-color #F97316, helper text color #FB923C.

## 12. Cards

```
background: #16151D;
border: 1px solid rgba(255,255,255,0.06);
border-radius: 14–16px;
padding: 20–32px;
```
Hover (interactive cards, e.g. artist/opportunity cards): border-color rgba(255,255,255,0.12), background #1A1922.
Active/selected: background #1D1B26, border-color rgba(147,51,234,0.3).

## 13. Badges

**Pill badge (default)**
```
padding: 3–5px 10–16px; border-radius: 999px; font-size: 11–13px; font-weight: 700;
```
- Accent: `background: rgba(147,51,234,0.14); color: #C084FC;` (e.g. match %, "All genres" active filter uses solid `#9333EA` bg / `#FFFFFF` text)
- Success: `background: rgba(34,197,94,0.12); color: #4ADE80;` (e.g. "Opening Slot")
- Warning: `background: rgba(249,115,22,0.14); color: #FB923C;` (e.g. "Concert")
- Info: `background: rgba(59,130,246,0.14); color: #60A5FA;` (e.g. "Venue")
- Count badge: `background: rgba(147,51,234,0.14); color: #C084FC;` small numeral, e.g. next to section titles

## 14. Navigation

**Sidebar (desktop, 248px)**
```
background: transparent (inherits app bg);
border-right: 1px solid rgba(255,255,255,0.06);
padding: 28px 20px;
```
Item: `padding: 12px 14px; border-radius: 10px; gap: 10px;` with a 6px status dot.
- Default: dot `#4A4855`, label `#9997A6` weight 600.
- Active: background `#1D1B26`, dot `#C084FC`, label `#F5F5F7` weight 700.
- Hover (inactive): background `rgba(255,255,255,0.03)`.

**Top nav (landing, full width)**
```
padding: 24px 56px; border-bottom: 1px solid rgba(255,255,255,0.06);
links: font-size 14px; font-weight 600; color #B4B2BF; hover color #F5F5F7.
```

**Tabs (booking page category filter)**
```
padding: 8px 16px; border-radius: 10px; font-size: 13px; font-weight: 700 (active) / 600 (inactive);
active: background rgba(147,51,234,0.14); color #C084FC;
inactive: color #9997A6; background transparent;
```

## 15. Interactive States (global)

- **Hover:** lighten background one step (surface → surface-raised), or brightness(1.05–1.1) on solid/gradient fills; border opacity +0.04–0.08.
- **Active/pressed:** darken background one step, scale(0.98–0.99), transition 100ms ease-out.
- **Focus-visible:** `box-shadow: 0 0 0 3px rgba(147,51,234,0.35)` or `outline: 2px solid #C084FC; outline-offset: 2px` — always visible, never removed.
- **Disabled:** `opacity: 0.4; pointer-events: none;` text drops to `#5C5A66`.
- Transition default: `transition: all 150ms ease-out;` on interactive elements (buttons, inputs, cards, nav items).

## 16. Desktop & Mobile Behavior

**Desktop (≥1024px):**
- Fixed 248px sidebar, persistent, full labels + status dots.
- 4-column grids for stat cards and artist/opportunity cards.
- Two-column forms allowed for grouped fields (e.g. name + location side by side) though current form uses single column at 560px max-width.

**Tablet (768–1023px):**
- Sidebar collapses to icon-only rail (72px) with tooltips on hover/tap; label appears in a slide-over on tap.
- Grids reflow to 2 columns.
- Top nav collapses secondary links into a menu icon; CTA button remains visible.

**Mobile (<768px):**
- Sidebar becomes a bottom tab bar (4 icons: Overview, Similar Artists, Booking, Settings) or a full-screen drawer triggered by a menu icon in a top bar.
- All grids go to 1 column.
- Forms and pipeline screens go full-width with 20px side padding, sticky primary CTA pinned to the bottom of the viewport.
- Hero type scales down (60px → 34–38px), CTA buttons stack vertically and go full-width.
- Minimum tap target: 44×44px for all interactive elements.
