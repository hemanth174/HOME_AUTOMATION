---
name: VicarTech Cyber-Industrial
colors:
  surface: '#111317'
  surface-dim: '#111317'
  surface-bright: '#37393e'
  surface-container-lowest: '#0c0e12'
  surface-container-low: '#1a1c20'
  surface-container: '#1e2024'
  surface-container-high: '#282a2e'
  surface-container-highest: '#333539'
  on-surface: '#e2e2e8'
  on-surface-variant: '#b9ccb2'
  inverse-surface: '#e2e2e8'
  inverse-on-surface: '#2f3035'
  outline: '#84967e'
  outline-variant: '#3b4b37'
  surface-tint: '#00e639'
  primary: '#ebffe2'
  on-primary: '#003907'
  primary-container: '#00ff41'
  on-primary-container: '#007117'
  inverse-primary: '#006e16'
  secondary: '#bdf4ff'
  on-secondary: '#00363d'
  secondary-container: '#00e3fd'
  on-secondary-container: '#00616d'
  tertiary: '#f8f8ff'
  on-tertiary: '#2b303b'
  tertiary-container: '#d8dcea'
  on-tertiary-container: '#5c616c'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#72ff70'
  primary-fixed-dim: '#00e639'
  on-primary-fixed: '#002203'
  on-primary-fixed-variant: '#00530e'
  secondary-fixed: '#9cf0ff'
  secondary-fixed-dim: '#00daf3'
  on-secondary-fixed: '#001f24'
  on-secondary-fixed-variant: '#004f58'
  tertiary-fixed: '#dee2f0'
  tertiary-fixed-dim: '#c2c6d4'
  on-tertiary-fixed: '#171c25'
  on-tertiary-fixed-variant: '#424752'
  background: '#111317'
  on-background: '#e2e2e8'
  surface-variant: '#333539'
  electric-green: '#00ff41'
  cyber-cyan: '#00e5ff'
  surface-slate: '#242933'
  warning-amber: '#FFB800'
  status-critical: '#FF4B4B'
  outline-muted: '#3b4b37'
typography:
  display-lg:
    fontFamily: Sora
    fontSize: 64px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  display-lg-mobile:
    fontFamily: Sora
    fontSize: 36px
    fontWeight: '800'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Sora
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.3'
  body-lg:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  data-point:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '500'
    lineHeight: '1'
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.15em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  grid-gutter: 1.5rem
  container-padding-desktop: 6rem
  container-padding-mobile: 1.5rem
  section-gap: 8rem
---

## Brand & Style
VicarTech System Monitoring embodies a "Cyber-Industrial" aesthetic—a fusion of high-tech precision and rugged utility. The brand personality is authoritative, technical, and vigilant, designed for high-stakes monitoring environments where clarity and speed are paramount.

The design style leverages **Glassmorphism** and **High-Contrast Bold** elements. It utilizes translucent dark panels with sharp, vibrant "Electric Green" accents to simulate a command-center interface. Visual interest is driven by atmospheric glows, monospaced data points, and a strict adherence to a technical grid, evoking the feeling of a futuristic terminal or a high-end hardware diagnostic tool.

## Colors
The palette is rooted in a deep "Obsidian" neutral base (#111317) to maximize contrast for luminous data. 

- **Primary (Electric Green):** Used for critical success states, "Live" indicators, and primary calls to action. It carries a subtle glow effect to simulate hardware LEDs.
- **Secondary (Cyber Cyan):** Reserved for interactive data points, links, and system identifiers (e.g., Order IDs).
- **Surface Slate:** A mid-tone grey used for secondary containers, input backgrounds, and table row hovering to provide structural depth without breaking the dark mode immersion.
- **Outline Muted:** A specialized dark olive-drab border color that maintains structure without the harshness of pure white or grey borders, reinforcing the industrial/military tech feel.

## Typography
The system uses a dual-font strategy:
- **Sora** handles the "Display" and "Headline" roles. Its geometric, wide stance provides a modern, high-tech look for high-level information.
- **JetBrains Mono** is the workhorse for all "Body," "Data," and "Label" roles. As a monospaced font, it ensures that numerical data aligns perfectly and reinforces the diagnostic, developer-centric nature of the application.

All labels should be rendered in uppercase with increased letter spacing (`0.15em`) to differentiate metadata from active content.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy for the main content area (max-width 1440px) to ensure information density remains readable. 

- **Desktop:** Uses a multi-column approach with a primary diagnostic area (left) and a secondary action sidebar (right). 
- **Mobile:** Elements reflow into a single-column stack with reduced container padding.
- **Rhythm:** Spacing is built on a 4px base unit. Section gaps are generous (128px) to provide visual breathing room between major functional modules, while internal component spacing (gutter) is tight (24px) to maintain a dense, "pro-tool" feel.

## Elevation & Depth
Elevation is communicated through **Tonal Layers** and **Glassmorphism** rather than traditional shadows.

1.  **Base Layer:** The darkest surface (#111317).
2.  **Panel Layer (Glass-Panel):** A translucent overlay (80% opacity) with a 12px backdrop blur. This creates a "heads-up display" effect.
3.  **Active State (Glow):** Interactive elements do not rise on the Z-axis; instead, they "power on." Active or hovered cards should receive a subtle `0 0 15px` green outer glow and border color transition.
4.  **Borders:** All panels use a 1px solid border (`outline-muted`) to define edges in the dark environment.

## Shapes
The shape language is "Soft-Industrial." Corners are predominantly tight (4px / `rounded`) to maintain a sense of precision and hardware-like rigidity. 

- **Containers/Cards:** 4px or 8px (`rounded-lg`) corner radius.
- **Buttons:** 4px radius for a standard rectangular look.
- **Status Badges/Pills:** Full rounded (`rounded-full`) to differentiate "Status" metadata from "Action" components.

## Components
- **Buttons:** 
    - *Primary:* Solid Electric Green background with bold black text. No shadow by default; 15px green glow on hover.
    - *Ghost:* Outlined with `outline-muted`. Text color uses the accent (Cyan or Green).
- **Data Tables:** Sticky headers with a lower-tier surface color. Rows feature a subtle hover state (`surface-slate/50`) and use Cyber Cyan for primary IDs to indicate interactivity.
- **Metrics Cards:** Feature a "Status LED" (a 6px circle) in the top-right corner. Large headlines use the primary green with a `text-shadow` glow effect.
- **Input Fields:** Dark, recessed look using `surface-slate`. Borders are `outline-muted`, turning `electric-green` on focus.
- **Badges:** Small, uppercase labels with a 10% opacity background of their respective status color and a 50% opacity border.
- **Scrollbars:** Custom thin (6px) scrollbars using `outline-muted` for the thumb, turning `electric-green` on hover to match the active system theme.