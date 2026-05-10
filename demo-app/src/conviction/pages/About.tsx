import { Link } from 'react-router-dom';
import { palette, fonts } from '../theme';
import { useIsMobile } from '../useMediaQuery';

export function AboutPage() {
  const isMobile = useIsMobile();
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: isMobile ? '28px 16px 56px' : '48px 24px 80px' }}>
      <span style={{ fontFamily: fonts.mono, fontSize: 11, color: palette.ember, letterSpacing: 1.6 }}>
        FROM THE EDITORS
      </span>
      <h1
        style={{
          fontFamily: fonts.display,
          fontSize: isMobile ? 34 : 48,
          fontWeight: 700,
          color: palette.ink,
          margin: '8px 0 24px',
          letterSpacing: -1,
          lineHeight: 1.05,
        }}
      >
        Why Conviction exists.
      </h1>
      <Body>
        <p>
          Prediction markets are accuracy machines. They are not memory machines. The reasoning that leads to a
          calibrated call is the most valuable artifact a forecaster produces — and almost every existing platform
          throws it away the moment a position is opened.
        </p>
        <p>
          Conviction is built on the FunctionSpace SDK, which lets traders express beliefs as <em>shapes</em> over
          a numerical range — not yes/no contracts. That difference is what makes a Polaroid possible: the curve
          becomes a horizon, the conviction becomes a sun, the reasoning becomes the caption.
        </p>
        <p>
          Every receipt has a permanent URL. Every reasoning travels with the link, even when the original device is
          gone. Every embed becomes a one-line iframe that any blog, Substack, Notion page, or thread can drop in.
          When the market resolves, the Polaroid develops, and the receipt updates everywhere it has been shared —
          automatically.
        </p>
        <p>
          The thesis is small but stubborn: forecasters deserve a public ledger of <em>why</em>, not just <em>what</em>.
          This is that ledger.
        </p>
      </Body>

      <hr style={{ border: 'none', borderTop: `1px solid ${palette.rule}`, margin: '40px 0' }} />

      <Body>
        <h3 style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 700, color: palette.ink, margin: 0, marginBottom: 12, letterSpacing: -0.3 }}>
          Editorial principles.
        </h3>
        <ol style={{ paddingLeft: 22, lineHeight: 1.7, color: palette.inkSoft }}>
          <li>Reasoning is not optional. Every receipt requires a why.</li>
          <li>The why is the asset. It outlives the bet.</li>
          <li>Aesthetics are a feature, not a finish. Receipts beg to be shared.</li>
          <li>Technical complexity is the enemy. Conviction works without an account, without a wallet, without a backend.</li>
        </ol>
      </Body>

      <div style={{ marginTop: 48 }}>
        <Link
          to="/discover"
          style={{
            padding: '14px 22px',
            background: palette.ember,
            color: palette.card,
            textDecoration: 'none',
            fontFamily: fonts.body,
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: 0.3,
            borderRadius: 6,
            display: 'inline-block',
          }}
        >
          Sign your first conviction →
        </Link>
      </div>
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: fonts.body,
        color: palette.inkSoft,
        fontSize: 18,
        lineHeight: 1.65,
      }}
    >
      {children}
    </div>
  );
}
