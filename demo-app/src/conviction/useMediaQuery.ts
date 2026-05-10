import { useEffect, useState } from 'react';

/**
 * SSR-safe media query hook. Returns true if the given media query currently matches.
 * Updates reactively when the viewport changes.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mq.matches);
    if ('addEventListener' in mq) {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    (mq as any).addListener(handler);
    return () => (mq as any).removeListener(handler);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 900px)');
}

export function useIsNarrow(): boolean {
  return useMediaQuery('(max-width: 560px)');
}
