import { useEffect, useState, type MouseEvent } from 'react';
import { palette, fonts } from '../theme';

/**
 * Editorial loading / empty / error states. The default UX habit is "Loading…"
 * on a grey background — useful to nobody. Conviction's voice is editorial, so
 * the same surfaces get magazine-style copy and a thin animated rule that
 * reads "we are alive, this is worth your wait."
 *
 * - <EditorialLoading> — used while a fetch is in flight. Rotates through
 *   contextual lines ("Pulling consensus from the wire…") so the wait feels
 *   intentional. Falls back to a single line if `lines.length === 1`.
 * - <EditorialEmpty> — used when a list resolves to zero. Headline + body +
 *   optional call to action.
 * - <EditorialError> — used when the SDK throws.
 */

type LoadingProps = {
  eyebrow?: string;
  lines: string[];
  /** Milliseconds between rotating lines. Defaults to 1600. */
  interval?: number;
  /** Compact variant (single inline line, no chrome). */
  inline?: boolean;
};

export function EditorialLoading({ eyebrow, lines, interval = 1600, inline }: LoadingProps) {
  const safeLines = lines.length > 0 ? lines : ['One moment.'];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (safeLines.length <= 1) return;
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % safeLines.length);
    }, interval);
    return () => window.clearInterval(id);
  }, [safeLines.length, interval]);

  const line = safeLines[idx];

  if (inline) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: fonts.mono,
          fontSize: 11,
          letterSpacing: 1.5,
          color: palette.inkMute,
        }}
      >
        <PulseDot />
        {line.toUpperCase()}
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: '48px 0',
        maxWidth: 540,
      }}
    >
      {eyebrow && (
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            letterSpacing: 1.6,
            color: palette.ember,
            textTransform: 'uppercase',
          }}
        >
          {eyebrow}
        </div>
      )}
      <div
        key={line}
        style={{
          fontFamily: fonts.display,
          fontSize: 26,
          lineHeight: 1.2,
          color: palette.ink,
          letterSpacing: -0.4,
          minHeight: 32,
          animation: 'conviction-fade-in 320ms ease-out',
        }}
      >
        {line}
      </div>
      <ProgressRule />
    </div>
  );
}

type EmptyProps = {
  eyebrow?: string;
  headline: string;
  body?: string;
  action?: { label: string; href: string };
  onActionClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
};

export function EditorialEmpty({ eyebrow, headline, body, action, onActionClick }: EmptyProps) {
  return (
    <div
      style={{
        padding: '52px 28px',
        background: palette.card,
        border: `1px dashed ${palette.rule}`,
        borderRadius: 12,
        textAlign: 'center',
      }}
    >
      {eyebrow && (
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            letterSpacing: 1.6,
            color: palette.ember,
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          {eyebrow}
        </div>
      )}
      <h2
        style={{
          fontFamily: fonts.display,
          fontSize: 26,
          fontWeight: 700,
          color: palette.ink,
          margin: 0,
          letterSpacing: -0.4,
          lineHeight: 1.15,
        }}
      >
        {headline}
      </h2>
      {body && (
        <p
          style={{
            fontFamily: fonts.body,
            color: palette.inkSoft,
            fontSize: 16,
            marginTop: 12,
            marginBottom: action ? 22 : 0,
            lineHeight: 1.55,
            maxWidth: 520,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {body}
        </p>
      )}
      {action && (
        <a
          href={action.href}
          onClick={onActionClick}
          style={{
            padding: '12px 22px',
            background: palette.ember,
            color: palette.card,
            textDecoration: 'none',
            fontFamily: fonts.body,
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 6,
            display: 'inline-block',
            letterSpacing: 0.3,
          }}
        >
          {action.label}
        </a>
      )}
    </div>
  );
}

export function EditorialError({ message, hint }: { message: string; hint?: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: '24px 22px',
        border: `1px solid ${palette.rose}`,
        borderRadius: 8,
        background: palette.card,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          letterSpacing: 1.6,
          color: palette.rose,
          marginBottom: 6,
        }}
      >
        SOMETHING WENT SIDEWAYS
      </div>
      <div style={{ fontFamily: fonts.body, color: palette.ink, fontSize: 15, lineHeight: 1.5 }}>
        {message}
      </div>
      {hint && (
        <div
          style={{
            fontFamily: fonts.body,
            color: palette.inkMute,
            fontSize: 13,
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function PulseDot() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: palette.ember,
        animation: 'conviction-pulse 1200ms ease-in-out infinite',
      }}
    />
  );
}

function ProgressRule() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'relative',
        height: 2,
        width: '100%',
        maxWidth: 320,
        background: palette.rule,
        borderRadius: 2,
        overflow: 'hidden',
        marginTop: 6,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: '40%',
          background: palette.ember,
          borderRadius: 2,
          animation: 'conviction-rule-slide 1700ms cubic-bezier(0.45, 0, 0.55, 1) infinite',
        }}
      />
    </div>
  );
}
