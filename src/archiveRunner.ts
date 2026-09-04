import * as fs from "fs";
import * as path from "path";
import { supabase } from "./supabaseClient";

const BATCH_SIZE = 1000;
const ARCHIVE_DIR = path.join(__dirname, "..", "archive");
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const COLUMNS = [
  "id",
  "pair_name",
  "dex_a",
  "dex_b",
  "price_a",
  "price_b",
  "gap_percent",
  "pool_liquidity_a",
  "pool_liquidity_b",
  "detected_at",
] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsvLine(row: Record<string, unknown>): string {
  return COLUMNS.map((col) => csvEscape(row[col])).join(",");
}

export interface ArchiveResult {
  totalArchived: number;
  filePath: string;
}

/**
 * Archives price_gaps rows older than 24h to a local CSV, deleting each
 * batch from Supabase only after it's been written to disk. Shared by the
 * manual `npm run archive` script and the watcher's in-process scheduler.
 *
 * A failure (select or delete error) throws, leaving any not-yet-deleted
 * batch in Supabase — batches already fully written and deleted before
 * the failure stay archived, but nothing is ever removed without a
 * confirmed successful write first.
 */
export async function runArchive(): Promise<ArchiveResult> {
  const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString();
  const dateStr = new Date().toISOString().slice(0, 10);

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const filePath = path.join(ARCHIVE_DIR, `price_gaps_${dateStr}.csv`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, COLUMNS.join(",") + "\n");
  }

  let totalArchived = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("price_gaps")
      .select(COLUMNS.join(","))
      .lt("detected_at", cutoff)
      .order("detected_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      throw new Error(`Select failed: ${error.message}`);
    }
    if (!data || data.length === 0) {
      break;
    }

    const rows = data as unknown as Record<string, unknown>[];
    const lines = rows.map(rowToCsvLine);
    fs.appendFileSync(filePath, lines.join("\n") + "\n");

    const ids = rows.map((row) => row.id as string);
    const { error: deleteError } = await supabase.from("price_gaps").delete().in("id", ids);
    if (deleteError) {
      throw new Error(
        `Wrote ${ids.length} rows to ${filePath} but failed to delete them from Supabase: ` +
          `${deleteError.message}. Re-running now would re-archive these rows as duplicates — ` +
          `check the CSV before retrying.`
      );
    }

    totalArchived += rows.length;
    console.log(`Archived batch of ${rows.length} rows (total so far: ${totalArchived})`);
  }

  return { totalArchived, filePath };
}
