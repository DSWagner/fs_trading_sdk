import type { FSThemeInput } from '@functionspace/react';

/**
 * Conviction theme.
 *
 * Two modes - light and dark. Both are exposed as CSS custom properties in
 * `index.css`; the JS `palette` object below maps each semantic role to a
 * CSS variable reference. Components consume `palette.x` exactly as before;
 * the value happens to be `var(--c-x)` so the active theme is picked up
 * automatically.
 *
 * Palette: pastel orange + pastel purple.
 *
 * The user explicitly asked for "a combination of pastelle purple and
 * pastelle orange. The app should have a rare feeling, hence the purple
 * and orange as if depicting epic and mythic rarity." Concretely:
 *
 *   - `ember` = pastel orange. Primary CTA color, slider thumb, eyebrow
 *     text. Maps to "mythic" energy.
 *   - `teal`  = pastel purple. Secondary accent. Maps to "epic" energy.
 *     The variable name is preserved for backwards compatibility with
 *     all the call sites that read `palette.teal`; the underlying hex
 *     is now lavender.
 *   - Neutrals are faintly purple-tinted so the whole UI reads as
 *     belonging to the same family - a pale lavender cream in light
 *     mode, a deep aubergine in dark mode. NOT a Claude-default cream.
 *   - `jade` and `rose` keep their semantic roles (positive / negative)
 *     but are softened toward sage and dusty rose so they sit calmly
 *     alongside the pastel pair without screaming.
 *
 * Switching mode is just `document.documentElement.dataset.theme = 'dark'`
 * (or removing the attribute). No React context, no component re-renders,
 * no per-component theme prop. See `useDarkMode` in `useDarkMode.ts`.
 */
export const convictionTheme: FSThemeInput = {
  preset: 'fs-light',
  primary: '#E68A4F',
  accent: '#8467BB',
  positive: '#7BAA76',
  negative: '#C45A6E',
  background: '#F0E7F5',
  surface: '#FBF6FE',
  text: '#2A1B3D',
  textSecondary: '#7B6E8E',
  border: '#D8C3E5',
};

/**
 * Semantic palette. Every value is a `var(--c-*)` reference; the underlying
 * color is defined in `index.css` and flips with `data-theme="dark"`. This
 * keeps all existing call sites - `style={{ background: palette.paper }}` -
 * working without rewriting them.
 */
export const palette = {
  paper: 'var(--c-paper)',
  paperDeep: 'var(--c-paper-deep)',
  card: 'var(--c-card)',
  ink: 'var(--c-ink)',
  inkSoft: 'var(--c-ink-soft)',
  inkMute: 'var(--c-ink-mute)',
  inkFade: 'var(--c-ink-fade)',
  rule: 'var(--c-rule)',
  rulesoft: 'var(--c-rule-soft)',
  ember: 'var(--c-ember)',
  emberDeep: 'var(--c-ember-deep)',
  teal: 'var(--c-teal)',
  jade: 'var(--c-jade)',
  rose: 'var(--c-rose)',
  shadow: 'var(--c-shadow)',
  shadowDeep: 'var(--c-shadow-deep)',
};

/**
 * Raw light-mode hex values. The SDK still wants concrete hex strings for
 * its theme config (the chart library reads them at construction time and
 * doesn't honor CSS variables). Polaroid procedural color math also reads
 * these to mix hex values. Keeping the raw colors here as a single source
 * of truth.
 */
export const LIGHT_RAW = {
  paper: '#F0E7F5',
  paperDeep: '#E5D6EE',
  card: '#FBF6FE',
  ink: '#2A1B3D',
  inkSoft: '#4D3D63',
  inkMute: '#7B6E8E',
  inkFade: '#B0A4C0',
  rule: '#D8C3E5',
  rulesoft: '#E5D6EE',
  ember: '#E68A4F',
  emberDeep: '#B5571A',
  teal: '#8467BB',
  jade: '#7BAA76',
  rose: '#C45A6E',
  shadow: 'rgba(45, 25, 70, 0.10)',
  shadowDeep: 'rgba(45, 25, 70, 0.20)',
} as const;

/**
 * Raw dark-mode hex values. The aesthetic intent is "rare night" - a
 * deep aubergine paper with luminous pastel orange highlights and lavender
 * accents, evoking late-night developing-room vibes shifted toward
 * purple+gold rather than the previous warm sepia. Pastel orange is
 * pushed slightly brighter so it reads as luminous against the dark
 * aubergine; lavender accent stays soft so the eye is drawn to ember
 * actions, not the ambient palette.
 */
export const DARK_RAW = {
  paper: '#161122',
  paperDeep: '#0E0A18',
  card: '#1E1830',
  ink: '#F0E8F5',
  inkSoft: '#C9BCD8',
  inkMute: '#9388AB',
  inkFade: '#5C4F73',
  rule: '#2D2440',
  rulesoft: '#211B33',
  ember: '#F4A572',
  emberDeep: '#E68A4F',
  teal: '#C5A3F0',
  jade: '#95C68A',
  rose: '#E07F94',
  shadow: 'rgba(0, 0, 0, 0.45)',
  shadowDeep: 'rgba(0, 0, 0, 0.65)',
} as const;

/**
 * Font stack. Picked deliberately to feel modern and futuristic and to
 * step well away from any combination that ships as a default in
 * AI-coding-agent starter kits (Inter, Fraunces, Playfair, JetBrains
 * Mono, DM Mono, Geist).
 *
 *   - Display: "Bricolage Grotesque". A sculptural variable typeface
 *     by Mathieu Triay (2023). Two variation axes - optical size and
 *     wonk - give it a deliberately modern, slightly off-center feel
 *     that no mainstream design system has copied yet. Reads as
 *     confident, contemporary, distinctive.
 *   - Body: "Sora". Geometric sans by Soumitra Roy Choudhury. Reads
 *     as cleanly futuristic without being a sci-fi caricature; the
 *     letterforms have just enough geometric precision to feel
 *     forward-leaning.
 *   - Mono: "Space Mono". Designed by Colophon Foundry. Carries a
 *     retro-futurist NASA-display vibe that pairs well with the
 *     receipts/polaroid theme and reads as deliberate rather than
 *     defaulted-to.
 */
export const fonts = {
  display: '"Bricolage Grotesque", "Funnel Display", "Outfit", system-ui, sans-serif',
  body: '"Sora", "Outfit", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"Space Mono", "IBM Plex Mono", ui-monospace, "Cascadia Code", monospace',
};

/**
 * Inline the active theme's raw hex values into a plain object - used by
 * the PNG downloader to resolve CSS-variable references on the SVG clone
 * (without doing this, the canvas paints `var(--c-ink)` as transparent
 * because canvas2d doesn't honor CSS variables on serialized SVG).
 */
export function readActiveRawPalette(): Record<string, string> {
  if (typeof document === 'undefined') return LIGHT_RAW;
  const isDark = document.documentElement.dataset.theme === 'dark';
  return isDark ? { ...DARK_RAW } : { ...LIGHT_RAW };
}
