import { fonts, palette } from '../theme';

/**
 * "CASHED OUT" stamp overlay.
 *
 * Renders an angled red-ink rubber-stamp graphic that the Receipt page
 * positions absolutely over the polaroid once a position has been
 * sold via the SDK `useSell` hook. The stamp is a pure presentational
 * element - it knows nothing about market state - so the parent decides
 * when to show it.
 *
 * Design intent: read like a real Polaroid that's been stamped after
 * the fact. Slight rotation, faded-ink texture (achieved via opacity +
 * letter-spacing rather than an image asset, so it scales cleanly with
 * the polaroid size and never blocks the underlying photo entirely).
 */
export interface CashedOutStampProps {
  /** Diameter of the polaroid the stamp overlays, in CSS pixels. Drives sizing. */
  polaroidWidth: number;
  /** Realized P&L from the cash-out. Drives the secondary line color. */
  realizedPnl: number;
  /** Whether to animate the stamp landing (true on first mount post-sell). */
  animateLanding?: boolean;
}

export function CashedOutStamp({
  polaroidWidth,
  realizedPnl,
  animateLanding = false,
}: CashedOutStampProps) {
  // Sized so a 420 px receipt polaroid lands the stamp at ~210 px wide,
  // ~85 px tall - dominant enough to be unmissable, small enough to keep
  // the polaroid's framing visible.
  const stampWidth = Math.round(polaroidWidth * 0.55);
  const stampHeight = Math.round(stampWidth * 0.42);
  const fontSize = Math.round(stampWidth * 0.16);
  const subFontSize = Math.round(stampWidth * 0.07);
  const positive = realizedPnl > 0;
  const flat = Math.abs(realizedPnl) < 0.005;
  const subColor = flat
    ? palette.inkMute
    : positive
      ? '#2F8C5D' // a green that reads as ink even on red stamp background
      : palette.rose;

  return (
    <div
      aria-hidden
      data-testid="cashed-out-stamp"
      style={{
        position: 'absolute',
        top: '38%',
        left: '50%',
        transform: 'translate(-50%, -50%) rotate(-9deg)',
        width: stampWidth,
        height: stampHeight,
        pointerEvents: 'none',
        // Slight inset shadow to evoke a paper imprint behind the ink.
        background: 'transparent',
        animation: animateLanding ? 'conviction-stamp-land 380ms cubic-bezier(0.2, 1.4, 0.4, 1) both' : undefined,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: `3px solid ${palette.rose}`,
          borderRadius: 6,
          opacity: 0.78,
          // Two outline shadows simulate a real rubber stamp's slightly
          // unsteady print without needing a raster texture.
          boxShadow: `inset 0 0 0 2px rgba(255,255,255,0), 0 0 0 1px rgba(0,0,0,0.05)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: fonts.mono,
            fontWeight: 700,
            color: palette.rose,
            fontSize,
            letterSpacing: Math.max(2, fontSize * 0.12),
            lineHeight: 1,
            opacity: 0.86,
          }}
        >
          CASHED OUT
        </span>
        <span
          style={{
            fontFamily: fonts.mono,
            fontWeight: 600,
            color: subColor,
            fontSize: subFontSize,
            letterSpacing: Math.max(1, subFontSize * 0.18),
            marginTop: 4,
            opacity: 0.78,
          }}
        >
          {flat
            ? 'BREAK EVEN'
            : positive
              ? `+$${realizedPnl.toFixed(2)} REALIZED`
              : `-$${Math.abs(realizedPnl).toFixed(2)} REALIZED`}
        </span>
      </div>
      <style>{`
        @keyframes conviction-stamp-land {
          0%   { transform: translate(-50%, -50%) rotate(-9deg) scale(1.9); opacity: 0; }
          55%  { transform: translate(-50%, -50%) rotate(-9deg) scale(0.92); opacity: 1; }
          100% { transform: translate(-50%, -50%) rotate(-9deg) scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
