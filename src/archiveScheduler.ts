import { runArchive } from "./archiveRunner";

/**
 * Runs the archive logic on a timer inside the watcher process, so
 * Supabase storage doesn't quietly fill up during unattended runs.
 * A failed run is caught and logged here rather than crashing the
 * watcher — runArchive() already guarantees rows are only deleted after
 * a successful write, so a failure just means retrying next tick.
 */
export function startArchiveScheduler(intervalMs: number): NodeJS.Timeout {
  console.log(`Archive scheduler started: running every ${intervalMs / 1000}s.`);
  return setInterval(() => {
    void runScheduledArchive();
  }, intervalMs);
}

async function runScheduledArchive(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Automatic archive run starting...`);
  try {
    const { totalArchived, filePath } = await runArchive();
    console.log(
      `[${new Date().toISOString()}] Automatic archive run finished: ` +
        `archived ${totalArchived} rows to ${filePath}.`
    );
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Automatic archive run failed:`, err);
  }
}
