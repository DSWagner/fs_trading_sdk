import { useEffect, useState } from 'react';
import { palette, fonts } from '../theme';
import { Polaroid } from './Polaroid';
import { useIsMobile } from '../useMediaQuery';

/**
 * A self-contained marketing widget that shows a single Polaroid toggling
 * between its 'developing' and 'developed' visual states. The whole product
 * pitch hinges on this transformation, so it deserves to be visible without
 * having to wait for a live market to resolve.
 *
 * Auto-cycles every 4 seconds, but the user can click the Polaroid (or the
 * toggle pills) to take manual control.
 */
export function DevelopDemo() {
  const [developed, setDeveloped] = useState(false);
  const [auto, setAuto] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => setDeveloped((d) => !d), 4000);
    return () => window.clearInterval(id);
  }, [auto]);

  // Calibration note: the rarity tier of a polaroid is the product of
  // contrarian-ness (disagreement with consensus) AND accuracy. The
  // "open" palette uses `potentialRarity` (which assumes ~88% accuracy)
  // and the "resolved" palette uses `calculateRarity` (which uses the
  // actual outcome). For the marketing demo we deliberately keep the
  // tier SAME in both states — otherwise the toggle reads as "the
  // colour changed" instead of "the polaroid developed", which
  // distracts from the message of this section.
  //
  // With these inputs the math lands cleanly in EPIC for both states:
  //   range = 3.0
  //   disagreement = |4.0 - 4.9| / 3.0 = 0.30
  //   potential score = 0.30 * 0.88 = 0.264 -> epic (>= 0.18)
  //   actual accuracy = 1 - (|4.0 - 4.25| / 3.0) * 4 = 0.667 -> "CLOSE"
  //   actual score    = 0.30 * 0.667 = 0.200 -> epic (>= 0.18)
  const sample = {
    marketId: 'demo-develop',
    positionId: 'sample-final-fed',
    marketTitle: 'Fed Funds rate at end of 2025',
    marketUnits: '%',
    username: 'macro_lurker',
    reasoning:
      'Two cuts before October. Inflation is sticky, employment data is breaking faster than expected.',
    createdAt: new Date('2025-08-12').toISOString(),
    prediction: 4.0,
    spread: 0.35,
    conviction: 0.78,
    collateral: 35,
    shape: 'gaussian' as const,
    lowerBound: 2.5,
    upperBound: 5.5,
    consensusAtBet: 4.9,
  };

  const handleClick = () => {
    setAuto(false);
    setDeveloped((d) => !d);
  };

  return (
    <section
      style={{
        marginTop: isMobile ? 56 : 96,
        marginLeft: isMobile ? -16 : -24,
        marginRight: isMobile ? -16 : -24,
        paddingTop: isMobile ? 36 : 56,
        paddingBottom: isMobile ? 36 : 48,
        paddingLeft: isMobile ? 16 : 24,
        paddingRight: isMobile ? 16 : 24,
        borderTop: `1px solid ${palette.rule}`,
        borderBottom: `1px solid ${palette.rule}`,
        background: palette.paperDeep,
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1.1fr',
            gap: isMobile ? 28 : 56,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={handleClick}
              aria-label="Toggle resolution state"
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                transition: 'transform 200ms ease',
                transform: developed ? 'rotate(-1deg)' : 'rotate(2deg)',
              }}
            >
              <Polaroid
                {...sample}
                resolutionState={developed ? 'resolved' : 'open'}
                resolvedOutcome={developed ? 4.25 : null}
                width={isMobile ? 280 : 360}
                animateDevelop
              />
            </button>
          </div>

          <div>
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 11,
                color: palette.ember,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              The receipt develops
            </span>
            <h2
              style={{
                fontFamily: fonts.display,
                fontSize: isMobile ? 28 : 38,
                fontWeight: 700,
                color: palette.ink,
                margin: '8px 0 16px',
                letterSpacing: -0.5,
                lineHeight: 1.05,
              }}
            >
              Every receipt is provisional, until reality catches up.
            </h2>
            <p
              style={{
                fontFamily: fonts.body,
                fontSize: isMobile ? 15 : 17,
                color: palette.inkSoft,
                lineHeight: 1.6,
                margin: 0,
                marginBottom: 22,
                maxWidth: 520,
              }}
            >
              Before the market resolves, the Polaroid is faint and monochrome, like a print still in the
              tray. When the answer is known, it sharpens, color appears, and a thin thread shows where
              the truth landed. The reasoning never changes. The verdict does.
            </p>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <TogglePill
                active={!developed}
                label="Before resolution"
                onClick={() => {
                  setAuto(false);
                  setDeveloped(false);
                }}
              />
              <TogglePill
                active={developed}
                label="After resolution"
                onClick={() => {
                  setAuto(false);
                  setDeveloped(true);
                }}
              />
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: palette.inkFade,
                  letterSpacing: 1.2,
                  marginLeft: 4,
                }}
              >
                {auto ? 'AUTO ·' : ''} CLICK THE POLAROID
              </span>
            </div>

            <DiffList developed={developed} />
          </div>
        </div>
      </div>
    </section>
  );
}

function DiffList({ developed }: { developed: boolean }) {
  const items = [
    {
      key: 'image',
      open: 'Faint, soft, monochromatic film.',
      resolved: 'Sharp focus, full color sky and ground.',
    },
    {
      key: 'thread',
      open: 'No outcome line.',
      resolved: 'Dashed thread marks where reality landed.',
    },
    {
      key: 'badge',
      open: 'Caption reads DEVELOPING.',
      resolved: 'Caption shows accuracy: CALLED IT, CLOSE, or MISSED.',
    },
  ];
  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: '24px 0 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: fonts.body,
        fontSize: 14,
        color: palette.inkSoft,
        lineHeight: 1.5,
      }}
    >
      {items.map((it) => (
        <li
          key={it.key}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            transition: 'opacity 200ms ease',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              flex: '0 0 auto',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: developed ? palette.jade : palette.inkFade,
              marginTop: 7,
              transition: 'background 200ms ease',
            }}
          />
          <span>{developed ? it.resolved : it.open}</span>
        </li>
      ))}
    </ul>
  );
}

function TogglePill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 14px',
        borderRadius: 999,
        border: `1px solid ${active ? palette.ember : palette.rule}`,
        background: active ? palette.ember : palette.card,
        color: active ? palette.card : palette.inkSoft,
        fontFamily: fonts.body,
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: 0.3,
        cursor: 'pointer',
        transition: 'background 160ms, color 160ms, border-color 160ms',
      }}
    >
      {label}
    </button>
  );
}
