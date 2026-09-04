import { Connection } from "@solana/web3.js";
import { POOLS } from "./pools";
import { getPairCache, DexId } from "./priceCache";
import { startWatcher } from "./watcher";

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
 * within STALE_RECONNECT_MS, it tears down and recreates the connection
 * and every subscription from scratch.
 *
 * Connection has no public close() method, so the old connection's socket
 * is cleaned up best-effort via its internal client — wrapped in try/catch
 * so a future @solana/web3.js version can't break reconnection even if
 * that cleanup silently stops working.
 */
export function startStalenessWatchdog(
  createConnection: () => Connection,
  initialConnection: Connection
): void {
  let connection = initialConnection;
  let recovering = false;
  const staleSince = new Map<string, number>();

  setInterval(() => {
    void checkAndRecover();
  }, CHECK_INTERVAL_MS);

  async function checkAndRecover(): Promise<void> {
    if (recovering) {
      return;
    }

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

    recovering = true;
    console.error(
      `[${new Date(now).toISOString()}] Stale subscription detected (no update for over ` +
        `${STALE_RECONNECT_MS / 1000}s) — reconnecting and resubscribing all pools.`
    );

    try {
      const oldConnection = connection;
      connection = createConnection();
      await startWatcher(connection);
      tryCloseConnection(oldConnection);
      staleSince.clear();
      console.log(`[${new Date().toISOString()}] Reconnected and resubscribed successfully.`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Reconnect attempt failed:`, err);
    } finally {
      recovering = false;
    }
  }
}

function tryCloseConnection(connection: Connection): void {
  try {
    const internal = connection as unknown as { _rpcWebSocket?: { close?: () => void } };
    internal._rpcWebSocket?.close?.();
  } catch {
    // best-effort only — @solana/web3.js doesn't expose a public close method
  }
}
