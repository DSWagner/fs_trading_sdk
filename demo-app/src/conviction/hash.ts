/**
 * URL-hash-based reasoning portability.
 *
 * When a user shares a receipt link, the reasoning is encoded into the URL
 * fragment (`#r=<base64>`). Browsers never send fragments to servers, so
 * this is a serverless way to make reasoning travel with the link.
 */

export interface SharedPayload {
  reasoning: string;
  conviction?: number;
  username?: string;
  prediction?: number;
  spread?: number;
  shape?: string;
  collateral?: number;
  createdAt?: string;
  marketTitle?: string;
  preset?: 'auto' | 'sunset' | 'twilight' | 'aurora' | 'botanical' | 'rosegold' | 'noir';
}

const PARAM_KEY = 'r';

export function encodePayload(payload: SharedPayload): string {
  const json = JSON.stringify(payload);
  const utf8 = unescape(encodeURIComponent(json));
  if (typeof btoa === 'function') {
    return btoa(utf8).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
  return Buffer.from(utf8, 'binary').toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function decodePayload(input: string): SharedPayload | null {
  if (!input) return null;
  try {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const utf8 =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('binary');
    const json = decodeURIComponent(escape(utf8));
    return JSON.parse(json) as SharedPayload;
  } catch {
    return null;
  }
}

export function readShareFromHash(): SharedPayload | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const encoded = params.get(PARAM_KEY);
  if (!encoded) return null;
  return decodePayload(encoded);
}

export function buildShareHash(payload: SharedPayload): string {
  return `#${PARAM_KEY}=${encodePayload(payload)}`;
}

export function buildShareUrl(path: string, payload: SharedPayload): string {
  if (typeof window === 'undefined') return path + buildShareHash(payload);
  const url = new URL(path, window.location.origin);
  return url.toString() + buildShareHash(payload);
}

export function buildEmbedUrl(
  marketId: string | number,
  positionId: string | number,
  payload: SharedPayload,
): string {
  const path = `/embed/r/${encodeURIComponent(String(marketId))}/${encodeURIComponent(
    String(positionId),
  )}`;
  return buildShareUrl(path, payload);
}
