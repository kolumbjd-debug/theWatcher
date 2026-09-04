const HOUR_MS = 60 * 60 * 1000;

/**
 * Defense-in-depth alongside the staleness watchdog (watchdog.ts): forces
 * a full process exit on a fixed schedule regardless of subscription
 * health, relying on the deployment platform's auto-restart (Railway) to
 * bring up a completely fresh process, connection, and every subscription.
 * The watchdog's in-process reconnect stays the fast path for actual
 * detected staleness; this just bounds the worst case if something the
 * watchdog can't see (a slow leak, a hung account, an undetected failure
 * mode) accumulates over many hours.
 *
 * Exits with a non-zero code, not 0 — a "restart on failure" policy (the
 * common default, and what our own crash-loop logs already showed Railway
 * doing) only restarts on a non-zero exit; a clean exit(0) reads as "job
 * finished" and may not restart at all.
 */
export function startPeriodicRestart(intervalMs: number): void {
  console.log(
    `Periodic restart scheduled: process will exit every ${(intervalMs / HOUR_MS).toFixed(1)}h for a clean restart.`
  );
  setTimeout(() => {
    console.log(
      `[${new Date().toISOString()}] Scheduled restart: exiting intentionally (not a crash) after ` +
        `${(intervalMs / HOUR_MS).toFixed(1)}h uptime — expecting the platform to restart the process.`
    );
    process.exit(1);
  }, intervalMs);
}
