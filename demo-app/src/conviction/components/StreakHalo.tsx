import { useMemo } from 'react';
import { useMarkets } from '@functionspace/react';
import { palette, fonts } from '../theme';
import { getBetsByUser } from '../storage';
import { calculateRarity } from '../rarity';
import { computeStreak, haloTreatmentForStreak, type HaloTier } from '../streak';

/**
 * StreakHalo — concentric SVG rings around the NavBar handle, sized to
 * a 4-step visual tier driven by `computeStreak` over the viewer's
 * local rarity ledger.
 *
 * Why this lives in the NavBar:
 *   - The halo is a global status badge: it should follow the user
 *     across every page, including pages where their profile isn't
 *     mounted. Anchoring it on the navbar is the only place that
 *     guarantees it stays visible everywhere.
 *   - It is purely derivative — no engine call, no SDK hook beyond
 *     `useMarkets` (which the navbar would care about anyway for the
 *     live wallet value).
 *
 * Render layers (outer to inner, all `aria-hidden="true"` because the
 * accessible label sits on the wrapping `<span>`):
 *   - tier 4 only: an orbiting comet glyph (`<circle>` + a tiny trail)
 *     anchored at 60deg, with a CSS keyframe spinning it around.
 *   - tier 3+:   a second concentric ring 4px outside the inner one.
 *   - tier 2+:   the inner ring gains a 12% opacity outer glow.
 *   - tier 1+:   the inner ring is drawn at all.
 *
 * Color: ember at high streaks, teal at low. We lean ember for tier 3+
 * so the halo unmistakably reads as "achievement" rather than "ambient
 * border treatment." Tier 1..2 uses teal because two hits in a row is
 * a warm-up, not yet hot. The transition between the two is a single
 * CSS `transition` so the halo's color flips smoothly the moment the
 * 3rd resolution comes in.
 *
 * Performance: the SVG is 36×36, lives inside an `<span style="display:
 * inline-block">`, and is never re-keyed on scroll. The comet's spin
 * animation is a CSS keyframe so it does not retrigger on every render.
 */
export function StreakHalo({ username }: { username: string }) {
  const { markets } = useMarkets();
  const treatment = useStreakTreatment(username, markets);
  if (treatment.tier === 0) return null;
  return (
    <span
      data-testid="streak-halo"
      data-streak-tier={treatment.tier}
      aria-label={treatment.label}
      title={treatment.label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        position: 'relative',
      }}
    >
      <HaloSvg tier={treatment.tier} />
    </span>
  );
}

/**
 * Hook isolated so the surrounding `StreakHalo` component never
 * recomputes the rarity table on a re-render that doesn't touch
 * markets/username. The `getBetsByUser` localStorage read is cheap
 * (<1 ms for hundreds of records) but still worth memoising because
 * the navbar re-renders on every route change.
 */
function useStreakTreatment(username: string, markets: ReadonlyArray<any> | undefined) {
  return useMemo(() => {
    if (!username) return haloTreatmentForStreak(0);
    const bets = getBetsByUser(username);
    if (bets.length === 0) return haloTreatmentForStreak(0);

    const marketMap = new Map<string, { resolutionState: string; resolvedOutcome: number | null; resolvedAt?: string }>();
    for (const m of markets ?? []) {
      marketMap.set(String((m as any).marketId), {
        resolutionState: (m as any).resolutionState ?? 'open',
        resolvedOutcome: (m as any).resolvedOutcome ?? null,
        resolvedAt: (m as any).resolvedAt,
      });
    }

    const records = bets.map((bet) => {
      const m = marketMap.get(String(bet.marketId));
      // Demo bets ship a baked outcome so we can compute their
      // accuracy without hitting the engine. Mirrors the same trick
      // Profile uses to populate the rarity ledger from demo data.
      const demoOutcome = (bet as any).__demoOutcome as number | undefined;
      const resolutionState = m?.resolutionState ?? (demoOutcome != null ? 'resolved' : 'open');
      const resolvedOutcome = m?.resolvedOutcome ?? demoOutcome ?? null;
      let accuracy: number | null = null;
      if (
        resolutionState === 'resolved' &&
        resolvedOutcome != null &&
        bet.consensusAtBet != null &&
        bet.lowerBound != null &&
        bet.upperBound != null
      ) {
        accuracy = calculateRarity({
          prediction: bet.prediction,
          resolvedOutcome,
          consensusMean: bet.consensusAtBet,
          lowerBound: bet.lowerBound,
          upperBound: bet.upperBound,
        }).accuracy;
      }
      return {
        resolvedAt: m?.resolvedAt ?? bet.createdAt,
        accuracy,
        resolutionState,
      };
    });

    const streak = computeStreak(records);
    return haloTreatmentForStreak(streak.current);
  }, [username, markets]);
}

function HaloSvg({ tier }: { tier: HaloTier }) {
  // Ember from tier 3 up so the halo reads as "achievement". Teal
  // for tiers 1-2 because two-in-a-row is a warm-up, not a flex.
  const accent = tier >= 3 ? palette.ember : palette.teal;
  const ringStroke = tier >= 3 ? 1.8 : 1.2;
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 28 28"
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <radialGradient id="streak-halo-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="0" />
          <stop offset="70%" stopColor={accent} stopOpacity="0" />
          <stop offset="100%" stopColor={accent} stopOpacity={tier >= 2 ? 0.22 : 0.1} />
        </radialGradient>
      </defs>
      {tier >= 2 && (
        <circle cx={14} cy={14} r={13} fill="url(#streak-halo-glow)" />
      )}
      <circle
        cx={14}
        cy={14}
        r={11}
        fill="none"
        stroke={accent}
        strokeWidth={ringStroke}
        opacity={0.9}
      />
      {tier >= 3 && (
        <circle
          cx={14}
          cy={14}
          r={13.5}
          fill="none"
          stroke={accent}
          strokeWidth={0.9}
          opacity={0.5}
        />
      )}
      {tier === 4 && (
        <g
          style={{
            transformOrigin: '14px 14px',
            animation: 'conviction-streak-orbit 5200ms linear infinite',
          }}
        >
          <circle cx={14} cy={2} r={1.6} fill={palette.ember} />
          <circle cx={12.4} cy={3.1} r={0.8} fill={palette.ember} opacity={0.55} />
          <circle cx={11.0} cy={4.1} r={0.5} fill={palette.ember} opacity={0.3} />
        </g>
      )}
    </svg>
  );
}

/**
 * Returns the keyframe stylesheet for the comet orbit. The NavBar
 * mounts this once next to the halo so the keyframe is registered
 * regardless of which route is active. Externalised so tests can
 * inspect it without rendering the NavBar.
 */
export const STREAK_HALO_KEYFRAMES = `
@keyframes conviction-streak-orbit {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
`;

/** Re-export for callers (NavBar) that want to render a one-line
 *  streak caption next to the halo without re-running the math. */
export function StreakCaption({
  username,
  isMobile,
}: {
  username: string;
  isMobile: boolean;
}) {
  const { markets } = useMarkets();
  const treatment = useStreakTreatment(username, markets);
  if (treatment.tier === 0 || isMobile) return null;
  return (
    <span
      data-testid="streak-caption"
      style={{
        fontFamily: fonts.mono,
        fontSize: 10,
        letterSpacing: 1.2,
        color: palette.ember,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {treatment.label}
    </span>
  );
}
