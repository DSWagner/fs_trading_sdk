import type { FSThemeInput } from '@functionspace/react';

/**
 * Conviction theme.
 *
 * Two modes — light (editorial cream) and dark (developing-room red-amber on
 * graphite). Both are exposed as CSS custom properties in `index.css`;
 * the JS `palette` object below maps each semantic role to a CSS variable
 * reference. Components consume `palette.x` exactly as before — the value
 * happens to be `var(--c-x)` so the active theme is picked up automatically.
 *
 * Switching mode is just `document.documentElement.dataset.theme = 'dark'`
 * (or removing the attribute). No React context, no component re-renders,
 * no per-component theme prop. See `useDarkMode` in `useDarkMode.ts`.
 */
export const convictionTheme: FSThemeInput = {
  preset: 'fs-light',
  primary: '#C2410C',
  accent: '#0E7490',
  positive: '#15803D',
  negative: '#9F1239',
  background: '#FBF6EE',
  surface: '#FFFCF6',
  text: '#1A1814',
  textSecondary: '#6B5E50',
  border: '#E5DCCB',
};

/**
 * Semantic palette. Every value is a `var(--c-*)` reference; the underlying
 * color is defined in `index.css` and flips with `data-theme="dark"`. This
 * keeps all existing call sites — `style={{ background: palette.paper }}` —
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
  paper: '#FBF6EE',
  paperDeep: '#F3EADA',
  card: '#FFFCF6',
  ink: '#1A1814',
  inkSoft: '#3F3A33',
  inkMute: '#6B5E50',
  inkFade: '#9C8E7E',
  rule: '#E5DCCB',
  rulesoft: '#EFE6D6',
  ember: '#C2410C',
  emberDeep: '#7C2D12',
  teal: '#0E7490',
  jade: '#15803D',
  rose: '#9F1239',
  shadow: 'rgba(60, 40, 20, 0.12)',
  shadowDeep: 'rgba(60, 40, 20, 0.22)',
} as const;

/**
 * Raw dark-mode hex values. The aesthetic intent is "developing room" — a
 * graphite paper with warm amber highlights, evoking a darkroom lit by a
 * safelight rather than just "the same UI but inverted." Ember and jade
 * are shifted slightly toward warmer luminance so they read on the darker
 * background.
 */
export const DARK_RAW = {
  paper: '#13110E',
  paperDeep: '#0B0A08',
  card: '#1B1814',
  ink: '#F5EFE3',
  inkSoft: '#D0C8B8',
  inkMute: '#9A917F',
  inkFade: '#5F584C',
  rule: '#2A2520',
  rulesoft: '#231F1B',
  ember: '#F26B1F',
  emberDeep: '#C2410C',
  teal: '#2DA8B8',
  jade: '#5DC18A',
  rose: '#E04668',
  shadow: 'rgba(0, 0, 0, 0.50)',
  shadowDeep: 'rgba(0, 0, 0, 0.70)',
} as const;

export const fonts = {
  display: '"Fraunces", "Playfair Display", Georgia, "Times New Roman", serif',
  body: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"JetBrains Mono", "Fira Code", ui-monospace, "Cascadia Code", monospace',
};

/**
 * Inline the active theme's raw hex values into a plain object — used by
 * the PNG downloader to resolve CSS-variable references on the SVG clone
 * (without doing this, the canvas paints `var(--c-ink)` as transparent
 * because canvas2d doesn't honor CSS variables on serialized SVG).
 */
export function readActiveRawPalette(): Record<string, string> {
  if (typeof document === 'undefined') return LIGHT_RAW;
  const isDark = document.documentElement.dataset.theme === 'dark';
  return isDark ? { ...DARK_RAW } : { ...LIGHT_RAW };
}
