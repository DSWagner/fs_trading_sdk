import { useState } from 'react';
import { palette, fonts } from '../theme';
import { Polaroid, POLAROID_PRESETS, type PolaroidPreset } from './Polaroid';
import { useIsMobile } from '../useMediaQuery';

/**
 * A horizontal gallery of the same Polaroid rendered in every preset.
 * Lets visitors see the visual variety of the receipt format at a glance.
 * Picks one preset at random to hover-feature in the lead position.
 */
export function StyleGallery() {
  const isMobile = useIsMobile();
  const [active, setActive] = useState<PolaroidPreset>(POLAROID_PRESETS[0].id);

  const sample = {
    marketId: 'gallery',
    positionId: 'sample',
    marketTitle: 'Bitcoin closes above 120k by year-end',
    marketUnits: 'k',
    username: 'tape_reader',
    reasoning: 'Spot ETF flows are the cleanest signal. Until they reverse, every dip gets bought.',
    createdAt: new Date('2025-11-04').toISOString(),
    prediction: 132,
    spread: 6,
    conviction: 0.74,
    collateral: 28,
    shape: 'gaussian' as const,
    lowerBound: 80,
    upperBound: 180,
    developed: true,
    resolvedOutcome: 128,
  };

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
          Seven palettes. One belief.
        </h2>
        <p
          style={{
            fontFamily: fonts.body,
            fontSize: isMobile ? 14 : 16,
            color: palette.inkMute,
            margin: 0,
            maxWidth: 480,
            lineHeight: 1.5,
          }}
        >
          Shown after development, so the color shows. Pre-resolution receipts are deliberately monochrome. Auto picks for you from the prediction; the rest let you set the mood.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          gap: isMobile ? 12 : 18,
          overflowX: 'auto',
          paddingBottom: 18,
          marginLeft: isMobile ? -16 : -8,
          marginRight: isMobile ? -16 : -8,
          paddingLeft: isMobile ? 16 : 8,
          paddingRight: isMobile ? 16 : 8,
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {POLAROID_PRESETS.map((p) => (
          <div
            key={p.id}
            onMouseEnter={() => setActive(p.id)}
            onTouchStart={() => setActive(p.id)}
            style={{
              flex: '0 0 auto',
              scrollSnapAlign: 'start',
              transform: active === p.id ? 'translateY(-4px)' : 'none',
              transition: 'transform 220ms ease',
              cursor: 'pointer',
            }}
          >
            <Polaroid {...sample} preset={p.id} width={isMobile ? 200 : 220} />
            <div
              style={{
                marginTop: 8,
                fontFamily: fonts.mono,
                fontSize: 10,
                letterSpacing: 1.5,
                color: active === p.id ? palette.ember : palette.inkMute,
                textAlign: 'center',
                textTransform: 'uppercase',
                transition: 'color 160ms',
              }}
            >
              {p.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
