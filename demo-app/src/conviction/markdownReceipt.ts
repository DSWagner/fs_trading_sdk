/**
 * Convert a Conviction receipt into a Markdown snippet that paste-renders well
 * in Substack, GitHub, Notion, Discord, Slack, and most blog editors.
 *
 * Format goal: read like an editorial pull-quote, link back to the live
 * receipt, and survive sanitizers that strip iframes / images. We deliberately
 * avoid `![alt](url.png)` because we have no image hosting; the SVG receipt
 * lives at the share URL itself.
 */

export type MarkdownReceiptInput = {
  username: string;
  reasoning: string;
  marketTitle: string;
  marketUnits?: string;
  prediction: number;
  collateral: number;
  conviction: number;
  shape: 'gaussian' | 'range' | 'bimodal';
  createdAt: string;
  shareUrl: string;
  embedUrl?: string;
  resolutionState?: string;
  resolvedOutcome?: number | null;
};

const SHAPE_LABELS: Record<MarkdownReceiptInput['shape'], string> = {
  gaussian: 'gaussian',
  range: 'range',
  bimodal: 'bimodal',
};

/**
 * Builds a multiline Markdown string. Stable output: the same inputs always
 * produce the same snippet, character for character. This lets us snapshot it
 * in tests without flake.
 */
export function buildMarkdownReceipt(input: MarkdownReceiptInput): string {
  const reasoning = (input.reasoning || '').trim();
  const reasoningLine = reasoning.length > 0
    ? `> *"${escapeQuotedReasoning(reasoning)}"*`
    : `> *"(No reasoning provided.)"*`;

  const date = formatDate(input.createdAt);
  const units = (input.marketUnits ?? '').trim();
  const predicted = formatNumber(input.prediction);
  const predictionPhrase = units ? `${predicted}${needsSpace(units) ? ' ' : ''}${units}` : predicted;

  const conviction10 = Math.max(0, Math.min(10, Math.round(input.conviction * 10)));
  const stake = `$${Math.round(input.collateral)}`;
  const shape = SHAPE_LABELS[input.shape] ?? input.shape;

  const metaLine = `> **@${input.username}** \u00b7 predicted **${predictionPhrase}** \u00b7 stake ${stake} \u00b7 conviction ${conviction10}/10 \u00b7 ${shape} \u00b7 signed ${date}`;

  const outcomeLine = buildOutcomeLine(input);

  const titleLine = `> _on [${escapeMarkdownInline(input.marketTitle)}](${input.shareUrl})_`;

  const lines: string[] = [
    reasoningLine,
    '>',
    metaLine,
  ];
  if (outcomeLine) {
    lines.push('>', outcomeLine);
  }
  lines.push('>', titleLine);

  let block = lines.join('\n');

  if (input.embedUrl) {
    block += `\n\n[Embed this Conviction receipt](${input.embedUrl})`;
  }

  return block;
}

function buildOutcomeLine(input: MarkdownReceiptInput): string | null {
  if (input.resolutionState !== 'resolved') return null;
  if (input.resolvedOutcome == null || !Number.isFinite(input.resolvedOutcome)) return null;

  const units = (input.marketUnits ?? '').trim();
  const actual = formatNumber(input.resolvedOutcome);
  const actualPhrase = units ? `${actual}${needsSpace(units) ? ' ' : ''}${units}` : actual;

  const predicted = input.prediction;
  const range = Math.max(1e-9, Math.abs(predicted));
  const gap = Math.abs(input.resolvedOutcome - predicted);
  const offByPct = Math.round((gap / range) * 100);
  const verdict = offByPct <= 5
    ? '\u2014 **called it.**'
    : offByPct <= 25
      ? '\u2014 close.'
      : '\u2014 missed by a wide margin.';

  return `> _Settled at_ **${actualPhrase}** _(off by ${offByPct}%)_ ${verdict}`;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (abs >= 100) return n.toFixed(0);
  if (abs >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Editorial: "Aug 12, 2025" reads more naturally than "2025-08-12" inline.
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function needsSpace(units: string): boolean {
  return /^[A-Za-z]/.test(units);
}

function escapeQuotedReasoning(s: string): string {
  // Inside a Markdown blockquote with `> *"..."*`, the only character that
  // breaks the structure is a literal newline (collapses the blockquote) or a
  // bare backslash before the closing `"`. Replace newlines with spaces and
  // strip trailing escapes.
  return s.replace(/\s+/g, ' ').replace(/\\$/, '\\\\');
}

function escapeMarkdownInline(s: string): string {
  // Conservative escape: link text shouldn't contain `]` or `[`. Replace with
  // close-equivalent characters rather than escape sequences (which render
  // ugly in some sanitizers).
  return s.replace(/\[/g, '(').replace(/\]/g, ')');
}
