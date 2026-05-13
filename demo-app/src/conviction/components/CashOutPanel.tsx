import { useCallback, useEffect, useState } from 'react';
import { useSell, usePreviewSell } from '@functionspace/react';
import { palette, fonts } from '../theme';
import { recordCashOut, type CashOutRecord } from '../storage';

/**
 * Cash-out panel for an open conviction.
 *
 * Exercises two SDK hooks that Conviction previously did not use:
 *   - `usePreviewSell(marketId)` to fetch the engine's current sell-side
 *     payout for the position without executing the trade.
 *   - `useSell(marketId)` to actually close the position when the user
 *     confirms.
 *
 * Lifecycle:
 *   1. Component mounts, kicks off a preview-sell to compute mark-to-
 *      market (refreshed on a 10s poll while the panel is mounted).
 *   2. Shows live unrealized P&L (returned - collateral) with a verdict
 *      color (jade = gain, rose = loss).
 *   3. User clicks "Cash out now". A two-step confirm guards against
 *      accidental fat-fingers (the confirm button replaces the primary
 *      button for ~5 seconds).
 *   4. On confirm: calls `useSell(marketId).execute(positionId)`. On
 *      success, writes a CashOutRecord to localStorage (so the receipt
 *      remembers the cashed-out state even before the SDK cache
 *      invalidation surfaces position.status === 'sold') and fires
 *      `onCashedOut`, which the parent uses to overlay a "CASHED OUT"
 *      stamp on the polaroid.
 *
 * The panel intentionally does NOT decide whether to render itself.
 * The parent Receipt page is responsible for that, because it knows
 * whether the viewer is the bet author and whether the bet has already
 * been cashed out / resolved.
 */
export interface CashOutPanelProps {
  marketId: string | number;
  positionId: string | number;
  /** Original collateral the user staked. Used to compute P&L. */
  originalCollateral: number;
  /** Called after a successful cash-out so the parent can stamp the polaroid. */
  onCashedOut?: (record: CashOutRecord) => void;
}

const PREVIEW_POLL_MS = 10_000;

export function CashOutPanel({
  marketId,
  positionId,
  originalCollateral,
  onCashedOut,
}: CashOutPanelProps) {
  const { execute: previewExecute, loading: previewLoading, error: previewError } =
    usePreviewSell(marketId);
  const { execute: sellExecute, loading: sellLoading, error: sellError } =
    useSell(marketId);

  const [currentValue, setCurrentValue] = useState<number | null>(null);
  const [lastPreviewAt, setLastPreviewAt] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cashedOut, setCashedOut] = useState<CashOutRecord | null>(null);

  // Polled preview-sell so the unrealized P&L stays live. Each tick
  // races against an AbortController so an in-flight request from a
  // previous tick is cancelled before a new one starts.
  useEffect(() => {
    if (cashedOut) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let abort: AbortController | null = null;
    async function tick() {
      abort = new AbortController();
      try {
        const result = await previewExecute(positionId, { signal: abort.signal });
        if (!cancelled) {
          setCurrentValue(result.collateralReturned);
          setLastPreviewAt(Date.now());
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Other errors are surfaced through the hook's `error` state, no
        // need to do anything here.
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, PREVIEW_POLL_MS);
        }
      }
    }
    tick();
    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
      if (abort) abort.abort();
    };
  }, [previewExecute, positionId, cashedOut]);

  // Auto-clear the confirming flag after 5 seconds so a stale prompt
  // doesn't sit there indefinitely.
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 5_000);
    return () => clearTimeout(t);
  }, [confirming]);

  const handleConfirm = useCallback(async () => {
    try {
      const numericPositionId = Number(positionId);
      const result = await sellExecute(
        Number.isNaN(numericPositionId) ? (positionId as any) : numericPositionId,
      );
      const record: CashOutRecord = {
        marketId,
        positionId,
        cashedOutAt: new Date().toISOString(),
        originalCollateral,
        collateralReturned: result.collateralReturned,
        realizedPnl: result.collateralReturned - originalCollateral,
      };
      recordCashOut(record);
      setCashedOut(record);
      setConfirming(false);
      if (onCashedOut) onCashedOut(record);
    } catch {
      // Hook surfaces the error via `sellError`; no further handling.
      setConfirming(false);
    }
  }, [sellExecute, positionId, marketId, originalCollateral, onCashedOut]);

  // Already cashed out -> show the realized result, no more buttons.
  if (cashedOut) {
    const positive = cashedOut.realizedPnl > 0;
    const flat = Math.abs(cashedOut.realizedPnl) < 0.005;
    const color = flat ? palette.inkSoft : positive ? palette.jade : palette.rose;
    return (
      <Shell testId="cashout-panel-cashed">
        <Eyebrow color={color}>CASHED OUT</Eyebrow>
        <Row>
          <Label>Received</Label>
          <Value>{`$${cashedOut.collateralReturned.toFixed(2)}`}</Value>
        </Row>
        <Row>
          <Label>Staked</Label>
          <Value muted>{`$${cashedOut.originalCollateral.toFixed(2)}`}</Value>
        </Row>
        <Row>
          <Label>Realized P&amp;L</Label>
          <Value color={color}>{formatSignedDollars(cashedOut.realizedPnl)}</Value>
        </Row>
      </Shell>
    );
  }

  const unrealizedPnl =
    currentValue != null ? currentValue - originalCollateral : null;
  const pnlColor =
    unrealizedPnl == null || Math.abs(unrealizedPnl) < 0.005
      ? palette.inkSoft
      : unrealizedPnl > 0
        ? palette.jade
        : palette.rose;

  return (
    <Shell testId="cashout-panel-live">
      <Eyebrow color={palette.ember}>CASH OUT</Eyebrow>
      <Row>
        <Label>Current sell value</Label>
        <Value>
          {currentValue == null
            ? previewLoading
              ? 'Pulling…'
              : '—'
            : `$${currentValue.toFixed(2)}`}
        </Value>
      </Row>
      <Row>
        <Label>Original stake</Label>
        <Value muted>{`$${originalCollateral.toFixed(2)}`}</Value>
      </Row>
      <Row>
        <Label>Unrealized P&amp;L</Label>
        <Value color={pnlColor}>
          {unrealizedPnl == null ? '—' : formatSignedDollars(unrealizedPnl)}
        </Value>
      </Row>
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={currentValue == null || sellLoading}
            data-testid="cashout-trigger"
            style={primaryButton(currentValue != null && !sellLoading)}
          >
            Cash out now
          </button>
        )}
        {confirming && (
          <>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={sellLoading}
              data-testid="cashout-confirm"
              style={dangerButton(!sellLoading)}
            >
              {sellLoading ? 'Cashing out…' : `Confirm · close for $${(currentValue ?? 0).toFixed(2)}`}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={sellLoading}
              data-testid="cashout-cancel"
              style={ghostButton}
            >
              Nevermind
            </button>
          </>
        )}
      </div>
      {(previewError || sellError) && (
        <div
          style={{
            marginTop: 8,
            fontFamily: fonts.body,
            fontSize: 12,
            color: palette.rose,
          }}
        >
          {sellError?.message ?? previewError?.message}
        </div>
      )}
      {lastPreviewAt != null && (
        <div
          style={{
            marginTop: 8,
            fontFamily: fonts.mono,
            fontSize: 10,
            letterSpacing: 1,
            color: palette.inkFade,
          }}
        >
          Sell value refreshes every 10s
        </div>
      )}
    </Shell>
  );
}

function Shell({
  children,
  testId,
}: {
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        background: palette.card,
        border: `1px solid ${palette.rule}`,
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        fontFamily: fonts.mono,
        fontSize: 10.5,
        letterSpacing: 1.4,
        color,
        fontWeight: 600,
        marginBottom: 4,
      }}
    >
      {children}
    </span>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 4,
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: fonts.body, fontSize: 12.5, color: palette.inkMute }}>
      {children}
    </span>
  );
}

function Value({
  children,
  color,
  muted,
}: {
  children: React.ReactNode;
  color?: string;
  muted?: boolean;
}) {
  return (
    <span
      style={{
        fontFamily: fonts.mono,
        fontSize: 13,
        color: color ?? (muted ? palette.inkMute : palette.ink),
        fontWeight: 600,
        letterSpacing: 0.3,
      }}
    >
      {children}
    </span>
  );
}

function primaryButton(enabled: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    background: enabled ? palette.ember : palette.rule,
    color: enabled ? palette.card : palette.inkMute,
    border: 'none',
    borderRadius: 6,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
    letterSpacing: 0.3,
  };
}

function dangerButton(enabled: boolean): React.CSSProperties {
  return {
    padding: '8px 14px',
    background: enabled ? palette.rose : palette.rule,
    color: enabled ? palette.card : palette.inkMute,
    border: 'none',
    borderRadius: 6,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: 700,
    cursor: enabled ? 'pointer' : 'not-allowed',
    letterSpacing: 0.3,
  };
}

const ghostButton: React.CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  color: palette.inkSoft,
  border: `1px solid ${palette.rule}`,
  borderRadius: 6,
  fontFamily: fonts.body,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  letterSpacing: 0.3,
};

/**
 * Format a signed dollar amount as `+$X.XX`, `-$X.XX`, or `$0.00`.
 * Specifically NOT `$-7.00`, which is what naive `+ $ + .toFixed()`
 * concatenation produces and reads like a typo.
 */
function formatSignedDollars(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < 0.005) return '$0.00';
  const sign = value > 0 ? '+' : '-';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}
