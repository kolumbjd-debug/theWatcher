import { Connection } from "@solana/web3.js";
import { startWatcher } from "./watcher";

const INITIAL_BACKOFF_MS = 1500;
const MAX_BACKOFF_MS = 60 * 1000;
const BACKOFF_MULTIPLIER = 2;
const MAX_ATTEMPTS_PER_WINDOW = 8;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const WS_OPEN_TIMEOUT_MS = 10 * 1000;

export interface ConnectionManager {
  getConnection(): Connection;
  /** Safe to call from multiple triggers (raw WS events, the staleness watchdog) — a reconnect already in flight is never duplicated. */
  requestReconnect(reason: string): void;
}

/**
 * Owns the single live Connection and all reconnect logic.
 *
 * @solana/web3.js's Connection creates its internal WebSocket client with
 * { max_reconnects: Infinity } and never sets a reconnect_interval, so the
 * underlying rpc-websockets library's own default takes over on any WS
 * drop: a FIXED 1-second retry, forever, with no backoff at all. That is
 * what produced an hours-long flood of "ws error: ... 429" against Helius
 * in production — Helius rate-limiting was a symptom, the uncontrolled
 * retry loop was the cause.
 *
 * The fix: disable the library's own auto-reconnect on every connection
 * we create (best-effort, via its internal client — the same non-public
 * access pattern already used for closing old connections, wrapped in
 * try/catch so a future library version can't break this), and drive
 * reconnection ourselves with exponential backoff and a hard cap on
 * attempts per time window. Both the raw WS error/close handlers and the
 * staleness watchdog (watchdog.ts) funnel through requestReconnect(), so
 * there is only ever one reconnect attempt in flight at a time.
 */
export function createConnectionManager(
  createConnection: () => Connection,
  initialConnection: Connection
): ConnectionManager {
  let connection = initialConnection;
  let backoffMs = INITIAL_BACKOFF_MS;
  let reconnecting = false;
  const attemptTimestamps: number[] = [];

  attachRawSocketHandlers(connection);

  function attachRawSocketHandlers(conn: Connection): void {
    try {
      const internal = conn as unknown as {
        _rpcWebSocket?: {
          setAutoReconnect?: (enabled: boolean) => void;
          on?: (event: string, cb: (...args: unknown[]) => void) => void;
        };
      };
      internal._rpcWebSocket?.setAutoReconnect?.(false);
      internal._rpcWebSocket?.on?.("error", () => requestReconnect("ws error"));
      internal._rpcWebSocket?.on?.("close", () => requestReconnect("ws close"));
    } catch {
      // best-effort only — @solana/web3.js doesn't expose this publicly
    }
  }

  function tryCloseConnection(conn: Connection): void {
    try {
      const internal = conn as unknown as { _rpcWebSocket?: { close?: () => void } };
      internal._rpcWebSocket?.close?.();
    } catch {
      // best-effort only
    }
  }

  /**
   * startWatcher() resolves as soon as its HTTP priming calls succeed and
   * subscriptions are registered — it does NOT wait for the underlying
   * WebSocket to actually open (confirmed: it resolves even against a
   * completely unreachable WS host). Treating that resolution alone as
   * "reconnected" would falsely reset the backoff to its initial value on
   * every attempt even when the WS keeps failing (e.g. Helius still
   * rate-limiting new connections) — exactly the case this backoff exists
   * to handle. So a reconnect only counts as a genuine success once the
   * new connection's WebSocket actually reports "open".
   */
  function waitForWsOpen(conn: Connection, timeoutMs: number): Promise<boolean> {
    const internal = conn as unknown as {
      _rpcWebSocketConnected?: boolean;
      _rpcWebSocket?: { on?: (event: string, cb: () => void) => void };
    };
    if (internal._rpcWebSocketConnected) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, timeoutMs);
      try {
        internal._rpcWebSocket?.on?.("open", () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(true);
          }
        });
      } catch {
        // best-effort only; if we can't observe "open" at all, fall through
        // to the timeout above rather than falsely reporting success
      }
    });
  }

  function withinAttemptWindow(): boolean {
    const now = Date.now();
    while (attemptTimestamps.length > 0 && now - attemptTimestamps[0] >= ATTEMPT_WINDOW_MS) {
      attemptTimestamps.shift();
    }
    return attemptTimestamps.length < MAX_ATTEMPTS_PER_WINDOW;
  }

  function scheduleAttempt(reason: string): void {
    if (!withinAttemptWindow()) {
      const waitMs = ATTEMPT_WINDOW_MS - (Date.now() - attemptTimestamps[0]) + 1000;
      console.error(
        `[${new Date().toISOString()}] Reconnect attempts exceeded ${MAX_ATTEMPTS_PER_WINDOW} within ` +
          `${ATTEMPT_WINDOW_MS / 1000}s — pausing all reconnect attempts for ${Math.ceil(waitMs / 1000)}s.`
      );
      setTimeout(() => scheduleAttempt(reason), waitMs);
      return;
    }

    console.warn(
      `[${new Date().toISOString()}] Connection lost (${reason}) — backing off ` +
        `${(backoffMs / 1000).toFixed(1)}s before reconnecting.`
    );
    setTimeout(() => {
      void attemptReconnect(reason);
    }, backoffMs);
  }

  async function attemptReconnect(reason: string): Promise<void> {
    attemptTimestamps.push(Date.now());
    const oldConnection = connection;
    let newConnection: Connection | undefined;

    try {
      newConnection = createConnection();
      attachRawSocketHandlers(newConnection);
      const wsOpenPromise = waitForWsOpen(newConnection, WS_OPEN_TIMEOUT_MS);

      await startWatcher(newConnection);
      const opened = await wsOpenPromise;

      if (!opened) {
        throw new Error(`WebSocket did not open within ${WS_OPEN_TIMEOUT_MS / 1000}s`);
      }

      tryCloseConnection(oldConnection);
      connection = newConnection;

      backoffMs = INITIAL_BACKOFF_MS;
      reconnecting = false;
      console.log(
        `[${new Date().toISOString()}] Reconnected and resubscribed successfully (trigger: ${reason}).`
      );
    } catch (err) {
      if (newConnection) {
        tryCloseConnection(newConnection);
      }
      console.error(`[${new Date().toISOString()}] Reconnect attempt failed (trigger: ${reason}):`, err);
      backoffMs = Math.min(backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
      scheduleAttempt(reason);
    }
  }

  function requestReconnect(reason: string): void {
    if (reconnecting) {
      return;
    }
    reconnecting = true;
    scheduleAttempt(reason);
  }

  return {
    getConnection: () => connection,
    requestReconnect,
  };
}
