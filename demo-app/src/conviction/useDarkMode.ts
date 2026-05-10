import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'conviction.theme';

export type ThemeMode = 'light' | 'dark';

/**
 * Read the user's persisted preference, falling back to their OS-level
 * `prefers-color-scheme` if they haven't explicitly chosen yet.
 */
function detectInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — fall through.
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * Apply the mode to the root element. Idempotent — calling with the same
 * mode twice is a no-op. CSS handles the visual flip via `:root[data-theme]`.
 */
function applyMode(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  if (mode === 'dark') {
    document.documentElement.dataset.theme = 'dark';
  } else {
    delete document.documentElement.dataset.theme;
  }
}

/**
 * Bootstrap dark mode AS EARLY AS POSSIBLE. Called from the app's entry
 * before React mounts. Without this, the page would paint once in light
 * mode and then flicker to dark on the first render.
 */
export function bootstrapTheme(): void {
  applyMode(detectInitialMode());
}

/**
 * Hook to read and toggle the active theme. The mode is stored in
 * localStorage and applied to `document.documentElement.dataset.theme`.
 * Multiple instances of the hook stay in sync via the `storage` event
 * (e.g. open the same page in two tabs and toggle one — the other follows).
 */
export function useDarkMode(): {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (next: ThemeMode) => void;
} {
  const [mode, setModeState] = useState<ThemeMode>(() => detectInitialMode());

  useEffect(() => {
    applyMode(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === 'light' || e.newValue === 'dark') {
        setModeState(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback(() => {
    setModeState((m) => (m === 'dark' ? 'light' : 'dark'));
  }, []);

  return { mode, toggle, setMode: setModeState };
}
