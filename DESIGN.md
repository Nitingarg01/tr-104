# Design System: Podcast Insight Studio
**Project ID:** Not available (Stitch MCP auth failed)

## 1. Visual Theme & Atmosphere
Dark-first, cinematic interface with high-contrast text, soft neon accents, and a calm, technical mood. The aesthetic is sleek and focused, with subtle depth and glow to guide attention without visual noise. Light mode is crisp, clean, and editorial.

## 2. Color Palette & Roles
**Dark mode foundation**
- Ink Black Background (#0f1117) — primary app background
- Charcoal Panel (#1a1d27) — card and surface base
- Deep Slate Panel (#242836) — tertiary surfaces and subtle fills
- Elevated Slate (#2a2e3d) — hover/raised surfaces
- Snow Text (#f0f2f5) — primary text
- Mist Text (#a0a5b5) — secondary text
- Ash Text (#6b7185) — muted text and hints
- Graphite Border (#2d3148) — default borders
- Graphite Hover Border (#3d4260) — hover borders

**Accent & status colors**
- Electric Indigo (#6366f1) — primary actions, focus, progress
- Indigo Hover (#4f46e5) — primary hover state
- Emerald Signal (#10b981) — success/active state
- Emerald Hover (#059669) — success hover state
- Crimson Alert (#ef4444) — danger/error state
- Crimson Hover (#dc2626) — danger hover state
- Amber Warning (#f59e0b) — warning state

**Light mode foundation**
- Porcelain Background (#f8f9fc) — primary app background
- Paper Panel (#ffffff) — card and surface base
- Soft Cloud (#f0f2f5) — tertiary surfaces
- Ink Text (#1a1d27) — primary text
- Slate Text (#4a5068) — secondary text
- Mist Gray (#8b91a5) — muted text
- Pale Border (#e2e5ef) — default borders
- Pale Hover Border (#c8ccd8) — hover borders

**Legacy UI (Flask static) palette for compatibility**
- Frosted Blue Background (#f4f6fb) — base surface
- Accent Blue (#2563eb) — primary action
- Accent Strong (#1d4ed8) — pressed/active
- Rose Danger (#e11d48) — error states
- Spring Success (#16a34a) — success states

## 3. Typography Rules
- **Primary font:** Inter for UI body and labels (clean, modern, readable)
- **Headings:** Bold (600–700) with tight tracking for clarity and hierarchy
- **Micro labels:** Uppercase with widened letter spacing for metadata (e.g., modal labels)

## 4. Component Stylings
* **Buttons:**
  - Primary: Solid Electric Indigo with white text, small rounded corners, slight lift on hover.
  - Secondary: Subtle dark surface with border, gentle hover elevation.
  - Ghost: Transparent background with muted text, soft hover fill.
  - Shape: Compact, slightly rounded (radius ~6–10px).

* **Cards/Containers:**
  - Dark panels on Charcoal/Slate surfaces, thin borders, soft drop shadows.
  - Rounded corners: medium (~14px), with hover shadow deepening.

* **Inputs/Forms:**
  - Dark fills with muted borders; focus state is Indigo border + soft glow.
  - Rounded corners: small (~6px).

* **Badges/Tags:**
  - Pill-shaped (full rounding) with soft translucent fills and color-coded text.

* **Video Captions:**
  - Centered pill with semi-transparent black background and strong white text; subtle shadow for legibility.

## 5. Layout Principles
- **Card-based panels** with consistent spacing (12–20px padding) and clear vertical rhythm.
- **Grid-driven layout**: columns and panels with evenly spaced gutters.
- **Soft depth cues**: light shadows and subtle hover transitions guide attention without heavy borders.
- **Focus-first hierarchy**: strong contrast for primary actions, muted supporting text, and clearly grouped controls.
