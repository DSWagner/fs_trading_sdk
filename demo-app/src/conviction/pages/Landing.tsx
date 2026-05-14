import { Link } from 'react-router-dom';
import { palette, fonts } from '../theme';
import { Polaroid, type PolaroidProps } from '../components/Polaroid';
import { DevelopDemo } from '../components/DevelopDemo';
import { StyleGallery } from '../components/StyleGallery';
import { useIsMobile, useIsNarrow } from '../useMediaQuery';
import { RARITY_ORDER, TIER_META } from '../rarity';

/**
 * Hero polaroids on the landing page. Curated to demonstrate the rarity
 * system end-to-end at first glance: a Mythic, a Legendary, and a Rare
 * receipt — each with the consensus the user was disagreeing with at bet
 * time and the actual outcome — so the badge appears on every card and
 * visitors immediately understand the gamification mechanic without
 * reading any copy.
 */
const SAMPLE_RECEIPTS: PolaroidProps[] = [
  {
    marketId: 'demo-1',
    positionId: 'sample-a',
    marketTitle: 'Best Picture at the Oscars',
    marketUnits: 'votes',
    username: 'critic_at_large',
    reasoning:
      'Anora has the indie distributor energy nobody saw coming. Voters reward audacity in odd years.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    prediction: 78,
    spread: 4,
    conviction: 0.85,
    collateral: 25,
    shape: 'gaussian',
    lowerBound: 0,
    upperBound: 100,
    resolutionState: 'resolved',
    resolvedOutcome: 78,
    consensusAtBet: 28,
  },
  {
    marketId: 'demo-2',
    positionId: 'sample-b',
    marketTitle: 'GPT-5 release date',
    marketUnits: 'days',
    username: 'lab_lurker',
    reasoning:
      "If they wanted to reset the narrative they would ship before WWDC. Otherwise it is a fall thing.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
    prediction: 180,
    spread: 30,
    conviction: 0.55,
    collateral: 12,
    shape: 'gaussian',
    lowerBound: 0,
    upperBound: 365,
    resolutionState: 'resolved',
    resolvedOutcome: 180,
    consensusAtBet: 70,
  },
  {
    marketId: 'demo-3',
    positionId: 'sample-c',
    marketTitle: 'Taylor Swift announces tour leg 4',
    marketUnits: 'weeks',
    username: 'swiftie_prime',
    reasoning: 'Ticket re-sale supply collapse means a refresh is coming. Late spring announcement.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    prediction: 8,
    spread: 1.4,
    conviction: 0.92,
    collateral: 40,
    shape: 'gaussian',
    lowerBound: 0,
    upperBound: 24,
    resolutionState: 'resolved',
    resolvedOutcome: 8,
    consensusAtBet: 5,
  },
];

export function LandingPage() {
  const isMobile = useIsMobile();
  const isNarrow = useIsNarrow();
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: isMobile ? '24px 16px 56px' : '40px 24px 80px' }}>
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr',
          gap: isMobile ? 32 : 64,
          alignItems: 'center',
          minHeight: isMobile ? 'auto' : 560,
        }}
      >
        <div>
          {/* The "Vol. I · Issue 1" masthead-style eyebrow used to live
              here as a typographic accent. The user asked for it to be
              removed because it was decorative without communicating
              anything actionable; the hero already carries the
              editorial voice through its headline and Times-style
              capsule rule below. */}
          <h1
            style={{
              fontFamily: fonts.display,
              fontSize: isNarrow ? 40 : 'clamp(44px, 6vw, 80px)',
              fontWeight: 700,
              color: palette.ink,
              lineHeight: 0.98,
              letterSpacing: -1.5,
              margin: 0,
              marginBottom: isMobile ? 18 : 24,
            }}
          >
            Stop betting <em style={{ fontStyle: 'italic', color: palette.ember }}>in private.</em>
          </h1>
          <p
            style={{
              fontFamily: fonts.body,
              fontSize: isMobile ? 17 : 22,
              color: palette.inkSoft,
              lineHeight: 1.5,
              maxWidth: 540,
              margin: 0,
              marginBottom: isMobile ? 24 : 36,
            }}
          >
            Conviction turns prediction markets into a publication. Every belief becomes a Polaroid you can sign,
            share, and one day prove right. The reasoning travels with the receipt.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link
              to="/discover"
              style={{
                padding: isMobile ? '12px 20px' : '14px 24px',
                background: palette.ember,
                color: palette.card,
                textDecoration: 'none',
                fontFamily: fonts.body,
                fontSize: isMobile ? 15 : 16,
                fontWeight: 600,
                letterSpacing: 0.4,
                borderRadius: 6,
                boxShadow: `0 4px 14px ${palette.shadow}`,
              }}
            >
              Start your conviction record →
            </Link>
            <Link
              to="/about"
              style={{
                padding: isMobile ? '12px 14px' : '14px 18px',
                color: palette.inkSoft,
                textDecoration: 'none',
                fontFamily: fonts.body,
                fontSize: isMobile ? 15 : 16,
                fontWeight: 500,
                borderBottom: `1px solid ${palette.rule}`,
              }}
            >
              How it works
            </Link>
          </div>
          <div
            style={{
              marginTop: isMobile ? 36 : 56,
              borderTop: `1px solid ${palette.rule}`,
              paddingTop: 20,
              display: isNarrow ? 'grid' : 'flex',
              gridTemplateColumns: isNarrow ? '1fr' : undefined,
              gap: isNarrow ? 16 : 32,
            }}
          >
            <Stat label="Get credit" sub="Every accurate call is on record." />
            <Stat label="Embed anywhere" sub="One-line iframes for any post." />
            <Stat label="Reasoning preserved" sub="The why outlives the bet." />
          </div>
        </div>
        {isMobile ? (
          <MobilePolaroidStack receipts={SAMPLE_RECEIPTS} narrow={isNarrow} />
        ) : (
          <div style={{ position: 'relative', height: 540 }}>
            <FloatingPolaroid props={SAMPLE_RECEIPTS[0]} top={20} left={120} rotate={-7} z={3} width={280} />
            <FloatingPolaroid props={SAMPLE_RECEIPTS[1]} top={140} left={-20} rotate={5} z={2} width={250} />
            <FloatingPolaroid props={SAMPLE_RECEIPTS[2]} top={260} left={170} rotate={-3} z={1} width={240} />
          </div>
        )}
      </section>

      <DevelopDemo />

      <RarityIntro isMobile={isMobile} />

      <StyleGallery />

      <section style={{ marginTop: isMobile ? 56 : 96 }}>
        <div style={{ borderTop: `1px solid ${palette.rule}`, paddingTop: isMobile ? 22 : 28, marginBottom: isMobile ? 24 : 32 }}>
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
            How a Conviction is made.
          </h2>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: isMobile ? 24 : 32,
          }}
        >
          <Step
            n="01"
            title="Pick a market."
            body="Browse Discover. Skip the obvious ones, pick something you actually have a take on."
          />
          <Step
            n="02"
            title="Write the why."
            body="Before you bet, write the reasoning. One paragraph. The why is the asset that outlives the call."
          />
          <Step
            n="03"
            title="Share the Polaroid."
            body="Copy the link or paste the embed code anywhere. The receipt develops as the market settles."
          />
        </div>
      </section>
    </div>
  );
}

/**
 * Visual primer for the rarity system. Sits between the develop animation
 * and the style gallery so visitors see, in order:
 *   1. Their receipt develops over time.
 *   2. The rarer their contrarian + correct calls, the rarer the receipt.
 *   3. The receipt can be styled with multiple palettes.
 *
 * Every tier is labelled with its color treatment so the badge palette on
 * the hero polaroids reads as intentional, not decoration.
 */
function RarityIntro({ isMobile }: { isMobile: boolean }) {
  return (
    <section
      style={{
        marginTop: isMobile ? 48 : 80,
        padding: isMobile ? '24px 18px' : '36px 32px',
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 12,
      }}
      data-testid="rarity-intro"
    >
      <div
        style={{
          fontFamily: fonts.mono,
          color: palette.ember,
          fontSize: 11,
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        Earn the rarity
      </div>
      <h2
        style={{
          fontFamily: fonts.display,
          fontSize: isMobile ? 26 : 36,
          fontWeight: 700,
          color: palette.ink,
          margin: 0,
          marginBottom: 12,
          letterSpacing: -0.5,
          lineHeight: 1.1,
        }}
      >
        Contrarian and right earns a rarer receipt.
      </h2>
      <p
        style={{
          fontFamily: fonts.body,
          fontSize: isMobile ? 15 : 17,
          color: palette.inkSoft,
          lineHeight: 1.55,
          margin: 0,
          marginBottom: 24,
          maxWidth: 720,
        }}
      >
        When your bet resolves we compare two things: how far you strayed from the crowd, and how close
        you ended up to the truth. Multiply them together and you get a tier — from Common to Mythic.
        Receipts are stamped with what you earned.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)',
          gap: 10,
        }}
      >
        {RARITY_ORDER.map((tier) => {
          const meta = TIER_META[tier];
          return (
            <div
              key={tier}
              data-testid={`landing-tier-${tier}`}
              style={{
                padding: '12px 8px',
                background: meta.badgeFill,
                border: `1px solid ${meta.badgeStroke}`,
                borderRadius: 6,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 9.5,
                  letterSpacing: 1.4,
                  color: meta.badgeText,
                  marginBottom: 6,
                }}
              >
                {meta.label.toUpperCase()}
              </div>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: meta.color,
                  margin: '0 auto',
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MobilePolaroidStack({ receipts, narrow }: { receipts: PolaroidProps[]; narrow: boolean }) {
  const width = narrow ? 220 : 260;
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        overflowX: 'auto',
        // Browsers force `overflow-y: auto` when `overflow-x` is `auto`,
        // so the rotated polaroids (which poke 18-20 px above their
        // bounding box at a 3-4 deg tilt on a ~520 px-tall polaroid)
        // were being clipped at the top - the rarity-coloured top
        // border disappeared on tilt. Reserve 28 px of vertical padding
        // on both sides so every tilt + the polaroid's drop shadow has
        // room to breathe without painting outside the scroll viewport.
        padding: '28px 16px 32px',
        margin: '0 -16px',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {receipts.map((r, i) => (
        <div
          key={`${r.marketId}:${r.positionId}`}
          style={{
            flex: '0 0 auto',
            transform: `rotate(${i % 2 === 0 ? -3 : 4}deg)`,
            scrollSnapAlign: 'center',
          }}
        >
          <Polaroid {...r} width={width} />
        </div>
      ))}
    </div>
  );
}

function Stat({ label, sub }: { label: string; sub: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 18,
          fontWeight: 700,
          color: palette.ink,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: fonts.body, fontSize: 13, color: palette.inkMute, lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 12,
          color: palette.ember,
          letterSpacing: 2,
          marginBottom: 12,
        }}
      >
        {n}
      </div>
      <h3
        style={{
          fontFamily: fonts.display,
          fontSize: 24,
          fontWeight: 700,
          color: palette.ink,
          margin: 0,
          marginBottom: 10,
          letterSpacing: -0.3,
        }}
      >
        {title}
      </h3>
      <p style={{ fontFamily: fonts.body, fontSize: 16, color: palette.inkSoft, lineHeight: 1.55, margin: 0 }}>{body}</p>
    </div>
  );
}

function FloatingPolaroid({
  props,
  top,
  left,
  rotate,
  z,
  width,
}: {
  props: PolaroidProps;
  top: number;
  left: number;
  rotate: number;
  z: number;
  width: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: `rotate(${rotate}deg)`,
        zIndex: z,
        transition: 'transform 220ms ease',
      }}
    >
      <Polaroid {...props} width={width} />
    </div>
  );
}
