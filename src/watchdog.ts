import { POOLS } from "./pools";
import { getPairCache, DexId } from "./priceCache";

const CHECK_INTERVAL_MS = 30 * 1000;
const STALE_WARNING_MS = 2 * 60 * 1000;
const STALE_RECONNECT_MS = 5 * 60 * 1000;

const DEX_IDS: readonly DexId[] = ["raydium", "orca"];

/**
 * @solana/web3.js's Connection can silently stop delivering onAccountChange
 * callbacks after its underlying WebSocket drops and reconnects — no error
 * is thrown, the account just goes quiet. This watchdog uses each pair's
 * per-DEX cache timestamp (set on every real account-change callback, see
 * priceCache.ts) as a liveness signal: if either side hasn't updated
 * within STALE_RECONNECT_MS, it asks the connection manager
 * (connectionManager.ts) to reconnect.
 *
 * This module no longer owns any Connection or reconnect logic itself —
 * it just detects staleness and delegates via requestReconnect, so there's
 * a single, shared, backoff-guarded reconnect path regardless of whether
 * the trigger is a raw WebSocket error or detected staleness.
 */
export function startStalenessWatchdog(requestReconnect: (reason: string) => void): void {
  const staleSince = new Map<string, number>();

  setInterval(() => {
    checkStaleness();
  }, CHECK_INTERVAL_MS);

  function checkStaleness(): void {
    const now = Date.now();
    let needsReconnect = false;

    for (const pool of POOLS) {
      const cache = getPairCache(pool.pairName);
      for (const dex of DEX_IDS) {
        const state = cache?.[dex];
        const key = `${pool.pairName}:${dex}`;
        if (!state) {
          continue; // never primed yet
        }

        const age = now - state.timestamp;
        if (age > STALE_RECONNECT_MS) {
          needsReconnect = true;
        } else if (age > STALE_WARNING_MS) {
          if (!staleSince.has(key)) {
            staleSince.set(key, now);
            console.warn(
              `[${new Date(now).toISOString()}] WARNING: ${key} hasn't updated in ` +
                `${Math.round(age / 1000)}s — subscription may be going stale.`
            );
          }
        } else {
          staleSince.delete(key);
        }
      }
    }

    if (!needsReconnect) {
      return;
    }

    staleSince.clear();
    console.error(
      `[${new Date(now).toISOString()}] Stale subscription detected (no update for over ` +
        `${STALE_RECONNECT_MS / 1000}s) — requesting reconnect.`
    );
    requestReconnect("staleness detected");
  }
}
