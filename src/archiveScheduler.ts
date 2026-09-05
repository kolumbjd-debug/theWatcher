import { runArchive } from "./archiveRunner";
import { readLastArchiveCheck, writeLastArchiveCheck } from "./archiveCheckpoint";

/**
 * Runs the archive logic on a timer inside the watcher process, so
 * Supabase storage doesn't quietly fill up during unattended runs.
 *
 * Also runs once immediately on startup, not just on the interval. This
 * matters because the periodic restart (restartScheduler.ts) can fire
 * more often than a long archive interval elapses — the process resets
 * before setInterval ever gets a chance to fire, so a fresh process
 * always checking for old rows right away is what actually guarantees
 * archiving happens, not the interval itself. index.ts also keeps
 * ARCHIVE_INTERVAL_MS comfortably shorter than the restart interval, so
 * the interval still fires at least once per uptime cycle as a backup.
 *
 * A failed run is caught and logged here rather than crashing the
 * watcher — runArchive() already guarantees rows are only deleted after
 * a successful write, so a failure just means retrying next tick.
 */
export function startArchiveScheduler(intervalMs: number): NodeJS.Timeout {
  const lastCheck = readLastArchiveCheck();
  if (lastCheck) {
    const ageMs = Date.now() - lastCheck.getTime();
    console.log(
      `Archive scheduler: last check was at ${lastCheck.toISOString()} ` +
        `(${(ageMs / (60 * 1000)).toFixed(1)} minutes ago).`
    );
  } else {
    console.log("Archive scheduler: no previous checkpoint found (first run, or a fresh volume).");
  }

  console.log(
    `Archive scheduler started: running immediately, then every ${intervalMs / 1000}s.`
  );
  void runScheduledArchive();

  return setInterval(() => {
    void runScheduledArchive();
  }, intervalMs);
}

async function runScheduledArchive(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Automatic archive run starting...`);
  try {
    const { totalArchived, filePath } = await runArchive();
    writeLastArchiveCheck();
    console.log(
      `[${new Date().toISOString()}] Automatic archive run finished: ` +
        `archived ${totalArchived} rows to ${filePath}.`
    );
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Automatic archive run failed:`, err);
  }
}
