import * as fs from "fs";
import * as path from "path";
import { config } from "./config";

const CHECKPOINT_FILE = path.join(config.archiveDir, ".last-archive-check.json");

interface Checkpoint {
  lastCheckAt: string;
}

/**
 * A small durable marker recording when the archive logic last actually
 * ran, written to the same persistent volume as the archive CSVs
 * (config.archiveDir survives restarts; the rest of the container's
 * filesystem doesn't). This exists purely for observability — so a
 * future scheduling mismatch between the archive interval and the
 * periodic restart (like the one that motivated this file: the restart
 * was firing more often than the archive interval, so the scheduler
 * could go a full uptime cycle without ever actually running) is visible
 * in logs immediately on startup, rather than silently starving again.
 */
export function readLastArchiveCheck(): Date | null {
  try {
    const raw = fs.readFileSync(CHECKPOINT_FILE, "utf8");
    const parsed = JSON.parse(raw) as Checkpoint;
    const date = new Date(parsed.lastCheckAt);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

export function writeLastArchiveCheck(): void {
  try {
    fs.mkdirSync(config.archiveDir, { recursive: true });
    const checkpoint: Checkpoint = { lastCheckAt: new Date().toISOString() };
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint));
  } catch (err) {
    console.error(`Failed to write archive checkpoint file:`, err);
  }
}
