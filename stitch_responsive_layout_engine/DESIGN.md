---
name: Electric Warriors V4
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
  status-critical: '#FF4B4B'
  warning-amber: '#FFB800'
  electric-green-glow: rgba(0, 255, 65, 0.15)
  cyan-glow: rgba(0, 229, 255, 0.15)
  grid-line: rgba(0, 255, 65, 0.05)
typography:
  display-lg:
    fontFamily: Sora
    fontSize: 64px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Sora
    fontSize: 32px
    fontWeight: '800'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Sora
    fontSize: 36px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-sm:
    fontFamily: Sora
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
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
    letterSpacing: 0.1em
  data-point:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '500'
    lineHeight: '1'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  container-max: 1280px
  section-padding-desktop: 120px
  section-padding-mobile: 64px
  gutter: 24px
  margin-page: 24px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
The brand personality is **technical, high-precision, and industrial**. It targets enterprise IoT operators and tech-forward homeowners, evoking a sense of reliability and cutting-edge performance. 

The visual style is a fusion of **Dark Minimalism** and **Cyber-Industrialism**. It uses high-contrast "electric" accents against deep charcoal surfaces, combined with structural grid patterns and glassmorphism. The aesthetic emphasizes "visibility in the dark," using light as a functional indicator of system status.

## Colors
The palette is rooted in a deep-space **Dark Mode** logic. 
- **Primary (Electric Green):** Used for actionable items, success states, and the primary "on" status. It represents energy and connectivity.
- **Secondary (Cyan):** Used for technical data, secondary categories, and commercial-specific contexts.
- **Neutral/Background:** A spectrum of dark slates and charcoals (#111317 to #242933) to provide depth without pure black.
- **Functional Accents:** Status-specific colors (Red/Amber) are reserved for system alerts and critical monitoring.

## Typography
The system uses a two-font strategy:
1. **Sora** for Headlines: Geometric and modern, providing a bold "tech-forward" brand voice.
2. **JetBrains Mono** for Body and UI: Reinforces the developer-centric, industrial hardware nature of the product. 

Letter spacing is tightened for display headers and significantly tracked out for small caps labels to maintain legibility and a "blueprint" aesthetic.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy for content containers within a fluid viewport. 
- **Desktop:** 12-column grid with a 1280px max-width.
- **Spacing Rhythm:** Based on an 8px base unit. Section vertical spacing is generous (120px) to allow the "dark" aesthetic to breathe.
- **Patterning:** A 32px grid-line background pattern is used as a decorative layer in hero sections to emphasize the "engineering blueprint" theme.

## Elevation & Depth
Depth is achieved through **Tonal Layering** and **Glassmorphism**, rather than traditional shadows.
- **Level 0 (Background):** #111317.
- **Level 1 (Cards/Containers):** #1A1C1F with a subtle #3B4B37 border.
- **Level 2 (Active/Floating):** Use of `backdrop-filter: blur(10px)` and 80% opacity on surfaces like the Top Navigation Bar.
- **Glows:** Instead of drop shadows, "Electric Green" or "Cyan" outer glows (`box-shadow: 0 0 15px`) are used to indicate active status or focus.

## Shapes
Shapes are **sharp and architectural**. 
- Standard components (buttons, input fields, cards) use a small 2px (0.125rem) radius to feel "machined" rather than "organic."
- Interactive container groups (like dashboard mockups) use larger 12px-16px radii to distinguish between "system modules" and "brand elements."
- Pills (full rounding) are reserved strictly for small status badges and labels.

## Components
- **Buttons:** 
    - *Primary:* Solid Electric Green (#00FF41) background with black text. Sharp corners. Scale-down animation on click.
    - *Secondary:* Outlined with Primary color or white, no fill.
- **Cards:** Defined by a 1px border (#3B4B37) and subtle background variations. Feature cards use a "pulse" status indicator dot in the corner.
- **Navigation:** Top-fixed, glass-blurred with a bottom border-variant. Active links use a bottom border of 2px in the Primary color.
- **Timeline Nodes:** Vertical dotted lines using repeating-linear-gradients, connecting circular phase indicators.
- **Data Visualizations:** Minimalist line or bar charts using Primary/Secondary tints with gradient fills toward the baseline.