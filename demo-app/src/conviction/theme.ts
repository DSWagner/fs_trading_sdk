import type { FSThemeInput } from '@functionspace/react';

/**
 * Editorial / scrapbook theme for Conviction.
 * Warm cream paper, deep ink, sepia accents — feels like a publication, not a trading terminal.
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

export const palette = {
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
};

export const fonts = {
  display: '"Fraunces", "Playfair Display", Georgia, "Times New Roman", serif',
  body: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"JetBrains Mono", "Fira Code", ui-monospace, "Cascadia Code", monospace',
};
