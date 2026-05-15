import { useEffect, useState } from 'react';
import { palette, fonts } from '../theme';
import {
  canonicalFingerprint,
  verifySignature,
  type FingerprintInputs,
  type ReceiptSignature,
  type VerifyVerdict,
} from '../receiptNft';

/**
 * VerifiedReceiptBadge — surfaces the Ed25519 signature state of a
 * receipt. The component owns the verify lifecycle:
 *
 *   1. On mount, recompute the canonical fingerprint from the
 *      currently displayed receipt fields. If the receipt has been
 *      tampered with (any field changed between sign-time and
 *      view-time), the recomputed fingerprint will mismatch the
 *      signed one and the verdict flips to `tampered`.
 *   2. Call `verifySignature`, await the verdict.
 *   3. Render one of five visual states keyed off the verdict:
 *      verified / tampered / invalid / unsigned / unsupported.
 *
 * Visual layout is intentionally compact — a single horizontal pill
 * sized to sit under the polaroid header without competing with the
 * polaroid frame. Each state uses a different accent so the verdict
 * is parseable from across the room:
 *   - verified  -> jade pill, "Verified · @device-fp"
 *   - tampered  -> rose pill, "Tampered — fields changed since sign"
 *   - invalid   -> rose pill, "Signature invalid"
 *   - unsigned  -> muted pill, "No on-device signature"
 *   - unsupported -> muted pill, "Verification unavailable here"
 *
 * The component is fully self-contained: no parent state coordination
 * is needed, no global store reads, and it tolerates the signature
 * being null (renders the `unsigned` pill).
 */
export function VerifiedReceiptBadge({
  signature,
  inputs,
  compact = false,
}: {
  signature: ReceiptSignature | null | undefined;
  inputs: FingerprintInputs;
  compact?: boolean;
}) {
  const [verdict, setVerdict] = useState<VerifyVerdict | 'pending'>('pending');

  useEffect(() => {
    let cancelled = false;
    const live = canonicalFingerprint(inputs);
    verifySignature(signature ?? null, live)
      .then((v) => {
        if (!cancelled) setVerdict(v);
      })
      .catch(() => {
        if (!cancelled) setVerdict('invalid');
      });
    return () => {
      cancelled = true;
    };
    // We DEPEND on every input field individually so an in-page edit
    // (e.g. swapping prediction with a slider) re-triggers the
    // verify. Memoising `inputs` upstream would be neater but adds
    // a useMemo at every caller — easier to spell it out here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    signature?.pubKey,
    signature?.sig,
    signature?.fingerprint,
    inputs.marketId,
    inputs.positionId,
    inputs.username,
    inputs.prediction,
    inputs.conviction,
    inputs.collateral,
    inputs.spread,
    inputs.shape,
    inputs.reasoning,
    inputs.createdAt,
  ]);

  if (verdict === 'pending') return null;

  const config = getBadgeConfig(verdict);
  const shortFingerprint = signature?.pubKey?.slice(0, 8);

  return (
    <span
      data-testid="receipt-verify-badge"
      data-verify-verdict={verdict}
      title={config.tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: compact ? '4px 10px' : '6px 12px',
        background: config.bg,
        color: config.fg,
        border: `1px solid ${config.border}`,
        borderRadius: 999,
        fontFamily: fonts.mono,
        fontSize: compact ? 10 : 11,
        letterSpacing: 0.8,
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
        fontWeight: 600,
      }}
    >
      <span aria-hidden="true">{config.glyph}</span>
      <span>{config.label}</span>
      {shortFingerprint && verdict === 'verified' && (
        <span style={{ color: palette.inkMute, fontWeight: 500 }}>· {shortFingerprint}</span>
      )}
    </span>
  );
}

function getBadgeConfig(verdict: VerifyVerdict): {
  glyph: string;
  label: string;
  bg: string;
  fg: string;
  border: string;
  tooltip: string;
} {
  switch (verdict) {
    case 'verified':
      return {
        glyph: '\u2713',
        label: 'Verified',
        bg: palette.card,
        fg: palette.jade,
        border: palette.jade,
        tooltip:
          'Receipt fields match the on-device Ed25519 signature signed at bet time. Untampered.',
      };
    case 'tampered':
      return {
        glyph: '\u26A0',
        label: 'Tampered',
        bg: palette.card,
        fg: palette.rose,
        border: palette.rose,
        tooltip:
          'Signature is mathematically valid but the fingerprint no longer matches the live fields. Someone edited the receipt after the author signed it.',
      };
    case 'invalid':
      return {
        glyph: '\u00D7',
        label: 'Signature invalid',
        bg: palette.card,
        fg: palette.rose,
        border: palette.rose,
        tooltip: 'The signature failed Ed25519 verification entirely.',
      };
    case 'unsigned':
      return {
        glyph: '\u2014',
        label: 'No on-device signature',
        bg: palette.paperDeep,
        fg: palette.inkMute,
        border: palette.rule,
        tooltip:
          'This receipt was not signed at bet time (possibly an older receipt or a host without Ed25519 support).',
      };
    case 'unsupported':
    default:
      return {
        glyph: '\u00B7',
        label: 'Verification unavailable',
        bg: palette.paperDeep,
        fg: palette.inkMute,
        border: palette.rule,
        tooltip:
          'Your browser does not expose Ed25519 in Web Crypto, so the signature cannot be verified here.',
      };
  }
}
