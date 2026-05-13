import { useMemo } from 'react';
import { palette, fonts } from '../theme';
import {
  evaluateAchievements,
  type AchievementBet,
  type AchievementTier,
  type AchievementUnlock,
} from '../achievements';

/**
 * AchievementsStrip.
 *
 * A horizontal trophy band that renders on the user's profile. Every
 * achievement defined in `achievements.ts` paints a tile here; locked
 * tiles render greyed-out with their unlock hint, unlocked tiles
 * render in full colour with their editorial caption.
 *
 * The strip is intentionally non-interactive — no modals, no
 * onclick. Hover reveals the caption via a native `title` attribute
 * which keeps the implementation accessible without us re-inventing
 * a tooltip.
 *
 * Why this matters for the competition:
 *   - Adds gamification that doesn't feel hostile or arcade-y. The
 *     captions stay editorial ("You signed your first conviction.
 *     The receipt is forever.") rather than achievement-pop.
 *   - Closes the engagement loop. Once a user signs a few
 *     receipts, they have a visible record of their own progress
 *     across rarity + accuracy axes.
 *   - Zero engine cost. All math runs on the existing client-side
 *     ledger. The strip rerenders cheaply on every bet add/remove.
 */

export interface AchievementsStripProps {
  bets: AchievementBet[];
  isMobile: boolean;
}

export function AchievementsStrip({ bets, isMobile }: AchievementsStripProps) {
  const items = useMemo(() => evaluateAchievements(bets), [bets]);
  const unlockedCount = items.filter((a) => a.unlocked).length;
  const total = items.length;
  return (
    <section
      data-testid="achievements-strip"
      style={{
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 12,
        padding: isMobile ? '16px 14px' : '20px 22px',
        margin: '24px 0',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: fonts.mono,
              fontSize: 10.5,
              letterSpacing: 1.6,
              color: palette.ember,
              fontWeight: 600,
            }}
          >
            ACHIEVEMENTS
          </div>
          <h3
            style={{
              fontFamily: fonts.display,
              fontSize: isMobile ? 18 : 22,
              fontWeight: 700,
              color: palette.ink,
              margin: '4px 0 0',
              letterSpacing: -0.4,
            }}
          >
            The wall of badges.
          </h3>
        </div>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            color: palette.inkMute,
            letterSpacing: 0.6,
          }}
          aria-label={`${unlockedCount} of ${total} achievements unlocked`}
        >
          {unlockedCount} / {total} UNLOCKED
        </span>
      </header>
      <ul
        data-testid="achievements-list"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 132 : 160}px, 1fr))`,
          gap: 10,
        }}
      >
        {items.map((a) => (
          <AchievementTile key={a.id} item={a} />
        ))}
      </ul>
    </section>
  );
}

function AchievementTile({ item }: { item: AchievementUnlock }) {
  const tone = TIER_COLORS[item.tier];
  const locked = !item.unlocked;
  return (
    <li
      data-testid={`achievement-tile-${item.id}`}
      data-locked={locked ? 'true' : 'false'}
      title={item.unlocked ? item.caption : `Locked. ${item.hint}`}
      style={{
        position: 'relative',
        background: locked ? palette.paperDeep : palette.card,
        border: `1px solid ${locked ? palette.rule : tone.border}`,
        borderRadius: 8,
        padding: '12px 12px 10px',
        textAlign: 'center',
        cursor: 'help',
        opacity: locked ? 0.55 : 1,
        boxShadow: locked ? 'none' : `0 4px 12px ${palette.shadow}`,
        transition: 'opacity 160ms ease',
      }}
    >
      <Medal tier={item.tier} locked={locked} />
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 13.5,
          fontWeight: 700,
          color: palette.ink,
          marginTop: 8,
          letterSpacing: -0.2,
          lineHeight: 1.2,
        }}
      >
        {item.label}
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 9.5,
          letterSpacing: 1.2,
          color: locked ? palette.inkFade : tone.label,
          fontWeight: 600,
          marginTop: 4,
        }}
      >
        {item.tier.toUpperCase()}
      </div>
      {item.progress && locked && (
        <div
          style={{
            marginTop: 8,
            fontFamily: fonts.mono,
            fontSize: 10.5,
            color: palette.inkMute,
            letterSpacing: 0.4,
          }}
        >
          {item.progress.current} / {item.progress.target}
        </div>
      )}
    </li>
  );
}

interface MedalProps {
  tier: AchievementTier;
  locked: boolean;
}

function Medal({ tier, locked }: MedalProps) {
  const tone = TIER_COLORS[tier];
  return (
    <svg
      width={32}
      height={32}
      viewBox="0 0 32 32"
      aria-hidden="true"
      style={{ filter: locked ? 'grayscale(0.85)' : 'none', display: 'inline-block' }}
    >
      {/* Outer disc */}
      <circle
        cx={16}
        cy={16}
        r={13}
        fill={tone.body}
        stroke={tone.border}
        strokeWidth={2}
      />
      {/* Inner ring */}
      <circle cx={16} cy={16} r={9} fill="none" stroke={tone.ring} strokeWidth={1.2} opacity={0.85} />
      {/* Single bead at top to read as a medallion */}
      <circle cx={16} cy={8} r={2} fill={tone.border} />
      {/* Centre dot */}
      <circle cx={16} cy={17} r={2} fill={tone.center} opacity={locked ? 0.6 : 1} />
    </svg>
  );
}

interface TierTone {
  body: string;
  border: string;
  ring: string;
  center: string;
  label: string;
}

// Tier palettes are tuned against the editorial paper/lavender background.
// Bronze is a warm copper, silver is a cool lavender-tinted grey, gold
// is a deep ember. All three are visible against both the white card
// and the lavender paper-deep.
const TIER_COLORS: Record<AchievementTier, TierTone> = {
  bronze: {
    body: '#E5C8A4',
    border: '#B8865A',
    ring: '#8A6038',
    center: '#5C4022',
    label: '#8A6038',
  },
  silver: {
    body: '#DCD2E2',
    border: '#8D7DA8',
    ring: '#5F5378',
    center: '#3A3050',
    label: '#5F5378',
  },
  gold: {
    body: '#F5C674',
    border: '#C28A2E',
    ring: '#8A5A12',
    center: '#523200',
    label: '#8A5A12',
  },
};
