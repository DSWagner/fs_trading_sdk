/**
 * Local persistence layer for Conviction.
 *
 * The FunctionSpace engine stores positions (the bets). It does NOT store
 * reasoning text — that's our novel layer. We keep reasoning in localStorage,
 * keyed by `${marketId}:${positionId}`, plus the user's own bet ledger.
 *
 * For cross-device share-portability, the receipt URL also embeds the
 * reasoning in a `#r=<base64>` hash fragment (see hash.ts). That way, when
 * someone opens a shared receipt link, the reasoning travels with the URL —
 * even though the original author's localStorage is on another device.
 */

const STORE_KEY = 'conviction.v1';
const USERNAME_KEY = 'conviction.username';

export interface BetRecord {
  marketId: string | number;
  positionId: string | number;
  username: string;
  reasoning: string;
  conviction: number;
  prediction: number;
  spread: number;
  collateral: number;
  shape: 'gaussian' | 'range' | 'bimodal';
  createdAt: string;
  marketTitle?: string;
  marketUnits?: string;
  lowerBound?: number;
  upperBound?: number;
  preset?: 'auto' | 'sunset' | 'twilight' | 'aurora' | 'botanical' | 'rosegold' | 'noir';
}

interface Store {
  bets: BetRecord[];
}

function load(): Store {
  if (typeof window === 'undefined') return { bets: [] };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return { bets: [] };
    const parsed = JSON.parse(raw);
    return { bets: Array.isArray(parsed?.bets) ? parsed.bets : [] };
  } catch {
    return { bets: [] };
  }
}

function save(store: Store): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // ignore — likely quota or private mode
  }
}

export function recordBet(record: BetRecord): void {
  const store = load();
  const key = receiptKey(record.marketId, record.positionId);
  const existing = store.bets.findIndex(
    (b) => receiptKey(b.marketId, b.positionId) === key,
  );
  if (existing >= 0) {
    store.bets[existing] = record;
  } else {
    store.bets.unshift(record);
  }
  save(store);
}

export function getAllBets(): BetRecord[] {
  return load().bets;
}

export function getBetsByUser(username: string): BetRecord[] {
  return load().bets.filter((b) => b.username === username);
}

export function getBet(
  marketId: string | number,
  positionId: string | number,
): BetRecord | null {
  const key = receiptKey(marketId, positionId);
  return load().bets.find((b) => receiptKey(b.marketId, b.positionId) === key) ?? null;
}

export function receiptKey(
  marketId: string | number,
  positionId: string | number,
): string {
  return `${marketId}:${positionId}`;
}

export function rememberUsername(username: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USERNAME_KEY, username);
}

export function recallUsername(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(USERNAME_KEY);
}

export function forgetUsername(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(USERNAME_KEY);
}
