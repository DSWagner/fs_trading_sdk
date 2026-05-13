import React from 'react';
import { palette, fonts } from '../theme';

/**
 * Route-level ErrorBoundary.
 *
 * React's default behaviour when a child throws during render is to
 * tear down the whole tree and paint a blank page. For an editorial
 * receipts product that lives by its share links, a blank page is the
 * worst possible failure mode — every external embed, every Tweet
 * with a /r/... URL, every iframe on someone else's Substack would
 * silently white-screen.
 *
 * This boundary wraps every route and replaces the blank page with an
 * editorial fallback that stays on-brand (paper palette, mono eyebrow,
 * Bricolage headline), explains what happened, and offers a "Back to
 * the front page" link. The crash itself is reported to
 * `console.error` so it shows up in the browser devtools and any
 * downstream telemetry the host page wires up; we do NOT send the
 * stack anywhere by default (no server, no exfiltration, no PII risk).
 *
 * The boundary's `resetKeys` prop lets the caller flip the boundary
 * back to its happy path when a navigation occurs — the React Router
 * `pathname` is a good key because every route change should give the
 * crashed boundary a fresh chance.
 *
 * Because React class components are still the only way to install an
 * error boundary (functional components and hooks cannot), this file
 * intentionally uses a class. The implementation is small and pure;
 * the only side effects are `console.error` and an internal state
 * transition.
 */

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * Optional label used in the fallback eyebrow ("RECEIPT", "DISCOVER",
   * "PROFILE", etc.). Defaults to "PAGE". Reads as
   * "PAGE COULD NOT LOAD" in the fallback header.
   */
  label?: string;
  /**
   * When any element in this array changes between renders, the
   * boundary resets — useful for clearing a crashed state on navigation.
   */
  resetKeys?: ReadonlyArray<unknown>;
  /**
   * Optional render override for custom fallback UI per consumer.
   * Receives the captured error and a reset callback.
   */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface the crash to devtools / any host page telemetry. We
    // deliberately do not send the stack to a server; the demo is a
    // static SPA, and exfiltrating user reasoning would be hostile.
    try {
      console.error('[Conviction] Route render crashed:', error, info.componentStack);
    } catch {
      // console may be stubbed in restrictive embeds; swallow.
    }
  }

  componentDidUpdate(prevProps: Readonly<ErrorBoundaryProps>): void {
    if (this.state.error == null) return;
    const prev = prevProps.resetKeys ?? [];
    const next = this.props.resetKeys ?? [];
    const changed = prev.length !== next.length || prev.some((k, i) => k !== next[i]);
    if (changed) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (error == null) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return <DefaultFallback error={error} reset={this.reset} label={this.props.label ?? 'PAGE'} />;
  }
}

interface DefaultFallbackProps {
  error: Error;
  reset: () => void;
  label: string;
}

function DefaultFallback({ error, reset, label }: DefaultFallbackProps) {
  const message = (error?.message ?? '').slice(0, 240);
  return (
    <div
      role="alert"
      data-testid="error-boundary-fallback"
      style={{
        maxWidth: 720,
        margin: '60px auto',
        padding: '32px 24px',
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 10,
        textAlign: 'center',
        boxShadow: `0 8px 24px ${palette.shadow}`,
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          letterSpacing: 1.6,
          color: palette.rose,
          marginBottom: 12,
        }}
      >
        {label.toUpperCase()} · COULD NOT LOAD
      </div>
      <h1
        style={{
          fontFamily: fonts.display,
          fontSize: 32,
          fontWeight: 700,
          color: palette.ink,
          margin: '0 0 12px 0',
          letterSpacing: -0.5,
        }}
      >
        Something on this page tripped.
      </h1>
      <p
        style={{
          fontFamily: fonts.body,
          fontSize: 15,
          color: palette.inkSoft,
          margin: '0 auto 18px',
          maxWidth: 540,
          lineHeight: 1.5,
        }}
      >
        The rest of Conviction still works — receipts, the front page, and the
        market wall are all fine. Try again, or head back to the front.
      </p>
      {message && (
        <details
          style={{
            margin: '0 auto 18px',
            maxWidth: 540,
            textAlign: 'left',
            fontFamily: fonts.mono,
            fontSize: 11.5,
            color: palette.inkMute,
            background: palette.paperDeep,
            border: `1px solid ${palette.rule}`,
            borderRadius: 6,
            padding: '10px 12px',
          }}
        >
          <summary style={{ cursor: 'pointer', color: palette.inkSoft }}>Details</summary>
          <div style={{ marginTop: 8, wordBreak: 'break-word' }}>{message}</div>
        </details>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={reset}
          style={{
            fontFamily: fonts.mono,
            fontSize: 12,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            fontWeight: 600,
            padding: '10px 16px',
            border: `1px solid ${palette.ember}`,
            color: palette.ember,
            background: 'transparent',
            borderRadius: 999,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            fontFamily: fonts.mono,
            fontSize: 12,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            fontWeight: 600,
            padding: '10px 16px',
            border: `1px solid ${palette.rule}`,
            color: palette.inkSoft,
            background: 'transparent',
            borderRadius: 999,
            cursor: 'pointer',
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          Back to the front
        </a>
      </div>
    </div>
  );
}
