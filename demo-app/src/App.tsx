import type { FSThemeInput } from '@functionspace/react';

export const config = {
  baseUrl: import.meta.env.VITE_FS_BASE_URL,
  username: import.meta.env.VITE_FS_USERNAME,
  password: import.meta.env.VITE_FS_PASSWORD,
  autoAuthenticate: import.meta.env.VITE_FS_AUTO_AUTH !== 'false',
};

// Fallback to market id 1 when no env var is set, so the legacy starter kits
// (App_*.tsx) keep building. Conviction does not depend on this constant.
export const MARKET_ID: string | number = import.meta.env.VITE_FS_MARKET_ID ?? 1;

// ── Theme Options ──
export const widgetTheme: FSThemeInput = "fs-dark";
// export const widgetTheme: FSThemeInput = {
//   preset: 'fs-dark',           // Start from a preset base
//   primary: '#ff00ff',          // Magenta - main accent color
//   accent: '#00ffff',           // Cyan - secondary accent
//   positive: '#39ff14',         // Neon green - profit/success
//   negative: '#ff073a',         // Neon red - loss/error
//   background: '#1a0a2e',       // Deep purple - widget background
//   surface: '#2d1b4e',          // Lighter purple - cards/panels
//   text: '#ffffff',             // White - primary text
//   textSecondary: '#b794f6',    // Lavender - secondary text
//   border: '#6b21a8',           // Purple - borders
// };
