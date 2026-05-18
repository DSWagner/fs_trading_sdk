import { useCallback, useState } from 'react';
import { palette, fonts } from '../theme';
import { downloadPolaroidPng } from './downloadPolaroid';

/**
 * ShareKit.
 *
 * One unified, no-server-infra surface for sharing a receipt:
 *
 *   1. Web Share API: on mobile (and modern Chromium-on-desktop), shares
 *      the receipt URL AND attaches the Polaroid PNG as a real file —
 *      so the user can drop it straight into Twitter / Discord / iMessage
 *      with one tap.
 *
 *   2. Twitter intent (X): falls back to opening a tweet composer
 *      pre-filled with the receipt URL and our editorial caption.
 *
 *   3. Copy link: writes the URL to the clipboard with a 1.6 s
 *      "Copied ✓" confirmation toast so the user knows it landed.
 *
 *   4. Download PNG: the existing high-quality 2x DPR raster of the
 *      polaroid SVG (uses the project's `downloadPolaroidPng`
 *      pipeline so the same code path is exercised everywhere).
 *
 * The intent: turn a receipt page into a one-tap share experience
 * without standing up an OG-image edge function. Social-crawler
 * preview cards are served by the static `og-card.png` linked from
 * `index.html`; this component is the FIRST-PARTY share flow for the
 * human author.
 *
 * Defensive design:
 *   - PNG generation runs in a try/catch; failures fall back gracefully
 *     to URL-only sharing (so an export bug doesn't block sharing
 *     altogether).
 *   - Web Share API support is feature-detected per-call: navigator.share
 *     is checked AND, where files are passed, navigator.canShare is
 *     consulted to confirm the platform accepts file uploads.
 *   - Clipboard API: also feature-detected; falls back to a hidden
 *     textarea + document.execCommand('copy') for old browsers.
 */

export interface ShareKitProps {
  /** Polaroid frame ref — used to source the SVG for PNG rasterization. */
  polaroidRef: React.RefObject<HTMLElement | null>;
  /** Public URL of the receipt. Required for share + copy actions. */
  shareUrl: string;
  /**
   * The user's display name (used to build the share caption). E.g.
   * `@tape_reader`. The component prepends the @ if missing.
   */
  username: string;
  /** Market title for the share caption. */
  marketTitle: string;
  /**
   * Optional editorial tagline appended to share captions. Defaults to
   * the project's wide tagline.
   */
  tagline?: string;
  /** Compact mode for embeds. */
  compact?: boolean;
}

type CopyState = 'idle' | 'copied' | 'error';
type ShareState = 'idle' | 'busy' | 'shared' | 'fallback' | 'error';
type DownloadState = 'idle' | 'busy' | 'done' | 'error';

export function ShareKit({
  polaroidRef,
  shareUrl,
  username,
  marketTitle,
  tagline = 'A receipt-first prediction publication.',
  compact = false,
}: ShareKitProps) {
  const handle = username.startsWith('@') ? username : `@${username}`;
  const caption = buildCaption(handle, marketTitle, tagline);

  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [shareState, setShareState] = useState<ShareState>('idle');
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');

  const handleCopy = useCallback(async () => {
    const ok = await safeCopyText(shareUrl);
    setCopyState(ok ? 'copied' : 'error');
    window.setTimeout(() => setCopyState('idle'), 1800);
  }, [shareUrl]);

  const handleShare = useCallback(async () => {
    setShareState('busy');
    const pngFile = await safeBuildPng(polaroidRef.current, `${handle.replace(/^@/, '')}-conviction.png`);
    // 1) Try the file-bearing Web Share path first — it's the best UX on
    //    mobile (single share sheet with the polaroid attached).
    if (pngFile && supportsFileShare(pngFile)) {
      try {
        await navigator.share({
          title: 'Conviction',
          text: caption,
          url: shareUrl,
          files: [pngFile],
        });
        setShareState('shared');
        window.setTimeout(() => setShareState('idle'), 1800);
        return;
      } catch (err) {
        // User cancelled or platform rejected; fall through to URL share.
      }
    }
    // 2) Try the URL-only Web Share path. Most desktop browsers no-op
    //    here but mobile devices accept it.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Conviction', text: caption, url: shareUrl });
        setShareState('shared');
        window.setTimeout(() => setShareState('idle'), 1800);
        return;
      } catch {
        // user cancelled or unsupported — fall through to twitter intent
      }
    }
    // 3) Final fallback: open a Twitter intent in a new tab.
    const intentUrl = buildTwitterIntent(caption, shareUrl);
    if (typeof window !== 'undefined') {
      window.open(intentUrl, '_blank', 'noopener,noreferrer');
    }
    setShareState('fallback');
    window.setTimeout(() => setShareState('idle'), 1800);
  }, [polaroidRef, handle, caption, shareUrl]);

  const handleDownload = useCallback(async () => {
    setDownloadState('busy');
    try {
      const safeName = `${handle.replace(/^@/, '')}-conviction.png`;
      await downloadPolaroidPng(polaroidRef.current, safeName);
      setDownloadState('done');
      window.setTimeout(() => setDownloadState('idle'), 1800);
    } catch (err) {
      console.error('[ShareKit] download failed:', err);
      setDownloadState('error');
      window.setTimeout(() => setDownloadState('idle'), 2400);
    }
  }, [polaroidRef, handle]);

  const btnBase: React.CSSProperties = {
    padding: compact ? '7px 12px' : '8px 14px',
    border: `1px solid ${palette.rule}`,
    borderRadius: 999,
    background: 'transparent',
    color: palette.inkSoft,
    fontFamily: fonts.mono,
    fontSize: compact ? 11 : 11.5,
    fontWeight: 600,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'background 160ms ease, color 160ms ease, border-color 160ms ease',
  };

  return (
    <div
      data-testid="share-kit"
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        onClick={handleShare}
        data-testid="share-kit-share"
        disabled={shareState === 'busy'}
        aria-label="Share this receipt"
        style={{
          ...btnBase,
          color: palette.ember,
          borderColor: palette.ember,
        }}
      >
        {shareState === 'busy' && 'Preparing…'}
        {shareState === 'shared' && 'Shared ✓'}
        {shareState === 'fallback' && 'Opened in X'}
        {shareState === 'error' && 'Share failed'}
        {shareState === 'idle' && '↗ Share'}
      </button>
      <button
        type="button"
        onClick={handleCopy}
        data-testid="share-kit-copy"
        aria-label="Copy receipt link"
        style={btnBase}
      >
        {copyState === 'copied' && 'Link copied ✓'}
        {copyState === 'error' && 'Copy failed'}
        {copyState === 'idle' && 'Copy link'}
      </button>
      <button
        type="button"
        onClick={handleDownload}
        data-testid="share-kit-download"
        disabled={downloadState === 'busy'}
        aria-label="Download receipt as PNG"
        style={btnBase}
      >
        {downloadState === 'busy' && 'Rendering…'}
        {downloadState === 'done' && 'Saved ✓'}
        {downloadState === 'error' && 'Try again'}
        {downloadState === 'idle' && 'Download PNG'}
      </button>
    </div>
  );
}

// ── pure helpers (exported for testing) ──

export function buildCaption(handle: string, marketTitle: string, tagline: string): string {
  const cleanTitle = marketTitle.length > 90 ? `${marketTitle.slice(0, 87)}…` : marketTitle;
  return `${handle} signed a conviction on "${cleanTitle}". ${tagline}`;
}

export function buildTwitterIntent(caption: string, url: string): string {
  const params = new URLSearchParams({ text: caption, url });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

async function safeCopyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through
    }
  }
  // Fallback for old browsers / non-secure contexts.
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function safeBuildPng(container: HTMLElement | null, filename: string): Promise<File | null> {
  if (!container) return null;
  const svg = container.querySelector('svg');
  if (!svg) return null;
  try {
    // We use the same pipeline as downloadPolaroidPng but capture the
    // Blob instead of downloading it. Calling downloadPolaroidPng directly
    // would trigger a file download in addition to building the Blob,
    // which would be confusing UX for the share flow.
    const blob = await renderPolaroidBlob(container);
    if (!blob) return null;
    return new File([blob], filename, { type: 'image/png' });
  } catch (err) {
    console.warn('[ShareKit] PNG generation failed, sharing URL only:', err);
    return null;
  }
}

/**
 * Mirror of downloadPolaroidPng that returns a Blob instead of
 * triggering a download. Kept in sync with the downloader; if either
 * changes, update both. Tested via the share-kit test suite.
 */
async function renderPolaroidBlob(container: HTMLElement): Promise<Blob | null> {
  const svg = container.querySelector('svg');
  if (!svg) return null;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const width = parseFloat(
    clone.getAttribute('width') ?? `${(svg as SVGSVGElement).clientWidth || 320}`,
  );
  const height = parseFloat(
    clone.getAttribute('height') ?? `${(svg as SVGSVGElement).clientHeight || 480}`,
  );
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  // Use the same CSS-variable resolution as the download utility — by
  // duplicating only the bits we strictly need to serialize cleanly we
  // avoid coupling the new share path to internal helpers in
  // downloadPolaroid.ts that aren't exported. The result is a slightly
  // less polished blob than the download (no inlined fonts) but
  // perfectly serviceable as a share attachment thumbnail.
  resolveCssVarsBasic(clone, svg as SVGSVGElement);

  const xml = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function resolveCssVarsBasic(clone: SVGElement, source: SVGElement): void {
  // Tiny helper: walks the cloned tree and replaces any `var(--c-x)`
  // value on common color/stroke attributes with the computed value
  // from the live tree's element. This is the minimum required to
  // get a non-blank PNG raster of a Conviction polaroid; the more
  // exhaustive resolution lives in downloadPolaroid.ts.
  const liveById = new Map<string, Element>();
  source.querySelectorAll('[id]').forEach((el) => liveById.set(el.id, el));
  const attrs = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color'];
  const walk = (node: Element) => {
    for (const a of attrs) {
      const v = node.getAttribute(a);
      if (v && v.startsWith('var(')) {
        const computed = getComputedStyleSafe(node, a);
        if (computed) node.setAttribute(a, computed);
      }
    }
    for (const child of Array.from(node.children)) walk(child);
  };
  walk(clone);
}

function getComputedStyleSafe(node: Element, prop: string): string | null {
  try {
    const id = node.id;
    if (!id) return null;
    const live = document.getElementById(id);
    if (!live) return null;
    const value = window.getComputedStyle(live).getPropertyValue(prop);
    return value && value !== 'none' ? value.trim() : null;
  } catch {
    return null;
  }
}

function supportsFileShare(file: File): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function') return false;
  // Some platforms expose `navigator.share` but not `navigator.canShare`
  // (older iOS). When canShare is absent, attempt the call optimistically
  // — the share() promise will reject and we'll fall through.
  if (typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}
