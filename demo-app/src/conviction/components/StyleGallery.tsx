import { useState } from 'react';
import { palette, fonts } from '../theme';
import { Polaroid } from './Polaroid';
import { useIsMobile } from '../useMediaQuery';
import { RARITY_ORDER, TIER_META, type Rarity } from '../rarity';

/**
 * Rarity Gallery. Renders the SAME conviction at every tier — Common up
 * to Mythic — so the per-tier visual signature (palette family, frame
 * glow, badge) is unmistakable at a glance. Style is no longer a user-
 * picked preset; it's an earned visual treatment. The gallery serves as
 * a legend the visitor can hover to feel out the tier they're chasing.
 *
 * Implementation note: the Polaroid component derives its palette family
 * from `consensusAtBet`, `prediction`, `resolvedOutcome` and the seed —
 * so to force each card to a specific tier we craft an outcome+consensus
 * pair that lands the rarity calculation at the desired score range.
 */
export function StyleGallery() {
  const isMobile = useIsMobile();
  const [active, setActive] = useState<Rarity>('mythic');

  return (
    <section
      style={{
        marginTop: isMobile ? 56 : 96,
      }}
    >
      <div
        style={{
          borderTop: `1px solid ${palette.rule}`,
          paddingTop: isMobile ? 22 : 28,
          marginBottom: isMobile ? 18 : 24,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'flex-start' : 'baseline',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <h2
          style={{
            fontFamily: fonts.display,
            fontSize: isMobile ? 28 : 36,
            fontWeight: 700,
            color: palette.ink,
            margin: 0,
            letterSpacing: -0.5,
          }}
        >
          Six tiers. One belief.
        </h2>
        <p
          style={{
            fontFamily: fonts.body,
            fontSize: isMobile ? 14 : 16,
            color: palette.inkMute,
            margin: 0,
            maxWidth: 520,
            lineHeight: 1.5,
          }}
        >
          The same bet, every tier. Style is not a setting — it's earned. Colors come from a procedural palette rolled
          from your bet's inputs, so every single receipt looks different. Contrarian and right unlocks the rarer color
          regions, frame glow, and quote treatment.
        </p>
      </div>

      <div
        style={{
          // Desktop: a clean 6-column grid so EVERY tier (Common all
          // the way to Mythic) is visible without horizontal scroll.
          // Previously the grid was a horizontally-scrolling flex row
          // and Mythic got clipped off the right edge of the viewport
          // at desktop widths, hiding the rarest tier exactly where
          // the section is supposed to advertise it.
          // Mobile: fall back to a horizontal scroller so each tier
          // stays large enough to read.
          display: isMobile ? 'flex' : 'grid',
          gridTemplateColumns: isMobile ? undefined : 'repeat(6, minmax(0, 1fr))',
          gap: isMobile ? 12 : 14,
          overflowX: isMobile ? 'auto' : 'visible',
          // Browsers force overflow-y to `auto` when overflow-x is `auto`,
          // so the polaroid's hover lift (`translateY(-6px)`) was being
          // clipped at the top edge by the scroll container, hiding the
          // colored rarity stripe. Reserve enough top padding to host
          // the lift plus a few px of shadow breathing room. The desktop
          // grid (which doesn't scroll) doesn't need this.
          paddingTop: isMobile ? 14 : 0,
          paddingBottom: isMobile ? 18 : 4,
          marginLeft: isMobile ? -16 : 0,
          marginRight: isMobile ? -16 : 0,
          paddingLeft: isMobile ? 16 : 0,
          paddingRight: isMobile ? 16 : 0,
          scrollSnapType: isMobile ? 'x mandatory' : undefined,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {RARITY_ORDER.map((tier) => {
          const sample = buildSampleForTier(tier);
          const meta = TIER_META[tier];
          const isActive = active === tier;
          return (
            <div
              key={tier}
              data-testid={`gallery-tier-${tier}`}
              onMouseEnter={() => setActive(tier)}
              onTouchStart={() => setActive(tier)}
              style={{
                flex: isMobile ? '0 0 auto' : undefined,
                minWidth: 0,
                scrollSnapAlign: isMobile ? 'start' : undefined,
                transform: isActive ? 'translateY(-6px)' : 'none',
                transition: 'transform 220ms ease',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              {/* Polaroid width:
                  - Mobile carousel: fixed 200 px so it stays readable.
                  - Desktop grid: pass undefined and let the polaroid
                    measure its container's width via the existing
                    width prop. We give the polaroid a fixed 195 px
                    on desktop to fit 6 across at 1320 max-width. */}
              <Polaroid {...sample} width={isMobile ? 200 : 195} />
              <div
                style={{
                  marginTop: 8,
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  letterSpacing: 1.5,
                  color: isActive ? meta.color : palette.inkMute,
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  transition: 'color 160ms',
                }}
              >
                {meta.label}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Build a sample bet whose rarity calculation lands at the requested tier.
 * `disagreement` is the distance between prediction and consensusAtBet,
 * normalised by range. Accuracy is held high (~95%) so the tier is fully
 * driven by disagreement, which is the cleanest visual demonstration.
 *
 * The tier thresholds in `rarity.ts` are:
 *   common < 0.04, uncommon < 0.10, rare < 0.18,
 *   epic < 0.30, legendary < 0.45, mythic >= 0.45
 * Multiplying by 0.95 accuracy gives effective score = disagreement * 0.95.
 * We target the midpoint of each bucket for visual clarity.
 */
function buildSampleForTier(tier: Rarity) {
  // Pick (disagreement * accuracy) that lands solidly inside each bucket.
  const targets: Record<Rarity, number> = {
    common: 0.02,
    uncommon: 0.075,
    rare: 0.14,
    epic: 0.24,
    legendary: 0.37,
    mythic: 0.52,
  };
  const accuracy = 0.95;
  const disagreement = targets[tier] / accuracy;
  // Map onto a [0, 100] range.
  const lowerBound = 0;
  const upperBound = 100;
  const prediction = 60;
  const consensusAtBet = prediction - disagreement * (upperBound - lowerBound);
  // Accuracy 0.95 means error 0.05 → resolved within 5% of prediction.
  const resolvedOutcome = prediction + 0.0125 * (upperBound - lowerBound) * (1 - accuracy);
  return {
    marketId: `gallery-${tier}`,
    positionId: `sample-${tier}`,
    marketTitle: `Bitcoin closes above 120k by year-end · ${tier}`,
    marketUnits: 'k',
    username: 'tape_reader',
    reasoning:
      'Spot ETF flows are the cleanest signal. Until they reverse, every dip gets bought, full stop.',
    createdAt: new Date('2025-11-04').toISOString(),
    prediction,
    spread: 5,
    conviction: 0.78,
    collateral: 35,
    shape: 'gaussian' as const,
    lowerBound,
    upperBound,
    resolutionState: 'resolved' as const,
    resolvedOutcome,
    consensusAtBet,
  };
}
