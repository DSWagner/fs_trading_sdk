/**
 * Receipt-as-NFT (no chain).
 *
 * Every conviction the user posts is signed locally with an Ed25519
 * keypair held in the browser's localStorage. The signature + the
 * compressed public key travel with the share-hash so anyone visiting
 * the receipt can VERIFY that the displayed payload was authored by
 * the holder of that exact keypair. There is no blockchain anywhere
 * in the loop -- the entire mechanism is a single SubtleCrypto call
 * on each side. The "NFT" framing is shorthand for "tamper-evident
 * receipt with an identity bound to it", which is the part of NFT
 * tech that actually matters for this use case.
 *
 * Why Ed25519 specifically:
 *   - Small keys (32 bytes public, 32 bytes private), small
 *     signatures (64 bytes). Fits comfortably in the share-hash
 *     without bloating share URLs past 2KB.
 *   - Deterministic signing: identical input -> identical signature.
 *     Lets us memoise + test deterministically.
 *   - Native Web Crypto support in modern browsers (Chrome 113+,
 *     Firefox 130+, Safari 17+) and in Node 19+. Vitest's
 *     happy-dom / jsdom environments run on Node 22 so the test
 *     suite has signing for free.
 *
 * Graceful degradation:
 *   - If `crypto.subtle` doesn't expose Ed25519 (very old browser),
 *     every entry point in this module returns null and the rest of
 *     the receipt flow continues working unchanged. The verify badge
 *     simply doesn't appear; the bet still records, the share-hash
 *     still encodes, the receipt still displays. NFT signing is an
 *     ADDITIVE editorial flourish, never a critical-path dependency.
 */

import { encodePayload, decodePayload, type SharedPayload } from './hash';

const PRIVATE_JWK_KEY = 'conviction.signing.privJwk';
const PUBLIC_HEX_KEY = 'conviction.signing.pubHex';
const ALGO = { name: 'Ed25519' } as const;

/** Per-receipt signature triple embedded in the share-hash. */
export interface ReceiptSignature {
  /** Hex-encoded raw 32-byte Ed25519 public key. */
  pubKey: string;
  /** Hex-encoded raw 64-byte Ed25519 signature. */
  sig: string;
  /** Canonical bytes that were signed (the receipt fingerprint).
   *  We store the FINGERPRINT, not the full payload, so the verify
   *  function can re-derive the same bytes from the live payload and
   *  detect tampering. */
  fingerprint: string;
}

/**
 * Compute the canonical fingerprint for a receipt. The fingerprint is
 * a JSON serialisation of the SUBSET of fields that define the
 * receipt's identity:
 *   - marketId   (unambiguous market reference)
 *   - positionId (unambiguous position reference)
 *   - username
 *   - prediction, conviction, collateral, spread, shape
 *   - reasoning  (the prose the user actually published)
 *   - createdAt  (ISO timestamp)
 *
 * Keys are sorted alphabetically so two semantically identical
 * receipts hash to the same fingerprint regardless of object key
 * order. Numbers are rounded to 6 decimal places to dodge
 * floating-point rendering drift across browsers.
 */
export interface FingerprintInputs {
  marketId: string | number;
  positionId: string | number;
  username: string;
  prediction: number;
  conviction: number;
  collateral: number;
  spread: number;
  shape: string;
  reasoning: string;
  createdAt: string;
}

export function canonicalFingerprint(inputs: FingerprintInputs): string {
  const canonical = {
    collateral: round6(inputs.collateral),
    conviction: round6(inputs.conviction),
    createdAt: String(inputs.createdAt ?? ''),
    marketId: String(inputs.marketId ?? ''),
    positionId: String(inputs.positionId ?? ''),
    prediction: round6(inputs.prediction),
    reasoning: String(inputs.reasoning ?? ''),
    shape: String(inputs.shape ?? ''),
    spread: round6(inputs.spread),
    username: String(inputs.username ?? ''),
  };
  return JSON.stringify(canonical);
}

function round6(x: number): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 0;
  return Math.round(x * 1e6) / 1e6;
}

function getSubtle(): SubtleCrypto | null {
  if (typeof crypto === 'undefined') return null;
  if (typeof crypto.subtle === 'undefined' || crypto.subtle === null) return null;
  return crypto.subtle;
}

/**
 * Feature detection. Returns true iff the host supports Ed25519
 * sign/verify via Web Crypto. Cached after the first call so we
 * don't repeat the (slightly expensive) keygen probe.
 */
let _ed25519Supported: boolean | null = null;
export async function isEd25519Supported(): Promise<boolean> {
  if (_ed25519Supported !== null) return _ed25519Supported;
  const subtle = getSubtle();
  if (!subtle) {
    _ed25519Supported = false;
    return false;
  }
  try {
    const key = await subtle.generateKey(ALGO, true, ['sign', 'verify']);
    // generateKey returning a CryptoKeyPair confirms Ed25519 is wired.
    _ed25519Supported = Boolean((key as CryptoKeyPair).publicKey);
    return _ed25519Supported;
  } catch {
    _ed25519Supported = false;
    return false;
  }
}

/**
 * Hex codec for binary buffers. Used because both raw public keys
 * (32B) and signatures (64B) get embedded directly in the share-hash
 * JSON; hex is half the size of base64 in JSON because it has no `+`
 * or `/` that need escaping under URL-encoding.
 */
function bytesToHex(bytes: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0'));
  }
  return hex.join('');
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!hex || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

/**
 * Load (or lazily generate) the device's Ed25519 keypair. Returns
 * null if the host doesn't support Ed25519. Private key is stored as
 * a JWK in localStorage; public key is also cached separately as hex
 * for fast read-only access (e.g., when displaying the user's
 * fingerprint badge).
 */
export async function ensureKeyPair(): Promise<CryptoKeyPair | null> {
  const subtle = getSubtle();
  if (!subtle) return null;
  if (typeof window === 'undefined') return null;

  try {
    const storedPrivRaw = window.localStorage.getItem(PRIVATE_JWK_KEY);
    if (storedPrivRaw) {
      const jwk = JSON.parse(storedPrivRaw) as JsonWebKey;
      // Import the stored private key; also derive its matching
      // public key from the JWK's `x` coordinate (Ed25519 JWK
      // private keys include the public coordinate alongside the
      // seed, by spec).
      const privateKey = await subtle.importKey('jwk', jwk, ALGO, true, ['sign']);
      const publicJwk: JsonWebKey = {
        kty: jwk.kty,
        crv: jwk.crv,
        x: jwk.x,
      };
      const publicKey = await subtle.importKey('jwk', publicJwk, ALGO, true, ['verify']);
      return { publicKey, privateKey };
    }
  } catch {
    // fall through to regenerate
  }

  try {
    const pair = (await subtle.generateKey(ALGO, true, ['sign', 'verify'])) as CryptoKeyPair;
    const jwk = (await subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
    const rawPub = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
    window.localStorage.setItem(PRIVATE_JWK_KEY, JSON.stringify(jwk));
    window.localStorage.setItem(PUBLIC_HEX_KEY, bytesToHex(rawPub));
    return pair;
  } catch {
    return null;
  }
}

/**
 * Synchronously read the cached public key hex if one has already
 * been generated. Used by UI components that want to show the device
 * fingerprint badge without awaiting a keypair load. Returns null
 * if no keypair has been generated yet.
 */
export function cachedPublicKeyHex(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(PUBLIC_HEX_KEY);
  } catch {
    return null;
  }
}

/**
 * Sign a canonical fingerprint with the device's private key. Returns
 * null on any failure (no keypair, host doesn't support Ed25519,
 * etc.). Callers SHOULD treat a null return as "skip the signature"
 * not as an error condition.
 */
export async function signFingerprint(fingerprint: string): Promise<ReceiptSignature | null> {
  const subtle = getSubtle();
  if (!subtle) return null;
  const pair = await ensureKeyPair();
  if (!pair) return null;
  try {
    const encoded = new TextEncoder().encode(fingerprint);
    const sigBuffer = await subtle.sign(ALGO, pair.privateKey, encoded as unknown as BufferSource);
    const sig = bytesToHex(new Uint8Array(sigBuffer));
    const rawPub = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
    return {
      pubKey: bytesToHex(rawPub),
      sig,
      fingerprint,
    };
  } catch {
    return null;
  }
}

/**
 * Verify a receipt signature against a recomputed fingerprint. Returns
 * a verdict tuple so callers can render different UI for each state.
 *
 *   - "verified"       -> the signature is mathematically valid AND
 *                          the fingerprint matches the live receipt.
 *   - "tampered"       -> the signature is valid but for a DIFFERENT
 *                          fingerprint. Something between the author
 *                          and the viewer changed the receipt fields.
 *   - "invalid"        -> the signature doesn't verify at all.
 *                          (Bad pubKey, bad sig bytes, etc.)
 *   - "unsigned"       -> the receipt didn't carry a signature.
 *   - "unsupported"    -> the host doesn't expose Ed25519. UI should
 *                          render "verification unavailable" rather
 *                          than alarm the user.
 */
export type VerifyVerdict = 'verified' | 'tampered' | 'invalid' | 'unsigned' | 'unsupported';

export async function verifySignature(
  signature: ReceiptSignature | null | undefined,
  liveFingerprint: string,
): Promise<VerifyVerdict> {
  if (!signature) return 'unsigned';
  const subtle = getSubtle();
  if (!subtle) return 'unsupported';
  const pubBytes = hexToBytes(signature.pubKey);
  const sigBytes = hexToBytes(signature.sig);
  if (!pubBytes || !sigBytes) return 'invalid';
  try {
    // Casts to BufferSource here are a TypeScript lib-version
    // workaround: the DOM lib types narrow BufferSource to
    // `ArrayBufferView<ArrayBuffer>` while the Uint8Array constructor
    // synthesises `ArrayBufferLike`. The runtime accepts both
    // identically; the cast just satisfies the type checker.
    const publicKey = await subtle.importKey('raw', pubBytes as unknown as BufferSource, ALGO, true, ['verify']);
    const signedBytes = new TextEncoder().encode(signature.fingerprint);
    const ok = await subtle.verify(
      ALGO,
      publicKey,
      sigBytes as unknown as BufferSource,
      signedBytes as unknown as BufferSource,
    );
    if (!ok) return 'invalid';
    return signature.fingerprint === liveFingerprint ? 'verified' : 'tampered';
  } catch {
    return 'invalid';
  }
}

/**
 * Bundle a payload + signature into a single base64-encoded blob.
 * The blob can be appended to the share-hash via a new `n` parameter
 * (n for NFT) so the existing `r` parameter remains unchanged for
 * older clients. Callers that don't care about signatures can ignore
 * `n` entirely; nothing in the existing share/receipt pipeline reads
 * it.
 *
 * Format: `{ payload: SharedPayload, signature: ReceiptSignature }`.
 */
export function encodeSignedShare(
  payload: SharedPayload,
  signature: ReceiptSignature,
): string {
  return encodePayload({ ...payload, __sig: signature } as SharedPayload & { __sig: ReceiptSignature });
}

/**
 * Decode a possibly-signed share. Returns the payload AND the
 * signature, if present. Falls back gracefully to "payload only,
 * no signature" for legacy shares.
 */
export function decodeSignedShare(
  encoded: string | null | undefined,
): { payload: SharedPayload; signature: ReceiptSignature | null } | null {
  if (!encoded) return null;
  const raw = decodePayload(encoded) as (SharedPayload & { __sig?: ReceiptSignature }) | null;
  if (!raw) return null;
  const { __sig, ...rest } = raw;
  return { payload: rest as SharedPayload, signature: __sig ?? null };
}
