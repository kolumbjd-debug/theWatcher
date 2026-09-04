import { supabase } from "./supabaseClient";

export interface PriceGapRow {
  pairName: string;
  dexA: string;
  dexB: string;
  priceA: number;
  priceB: number;
  gapPercent: number;
  poolLiquidityA: number;
  poolLiquidityB: number;
}

interface LastInserted {
  priceA: number;
  priceB: number;
}

/** Below this, the gap is noise relative to swap fees/slippage on either DEX — not worth a row. */
const MIN_GAP_PERCENT = 0.02;

/**
 * Rounding to a fixed number of decimal places breaks down for pairs whose
 * price is naturally tiny (e.g. BONK/SOL ~3e-8) — every update rounds to
 * 0.0000, so dedup would treat all real movement as unchanged and the pair
 * would silently stop logging after its first row. Rounding to a fixed
 * number of significant figures instead behaves consistently regardless of
 * the pair's price magnitude.
 */
function roundSigFigs(n: number, sigFigs: number): number {
  if (n === 0 || !Number.isFinite(n)) {
    return n;
  }
  const magnitude = Math.floor(Math.log10(Math.abs(n))) + 1;
  const factor = Math.pow(10, sigFigs - magnitude);
  return Math.round(n * factor) / factor;
}

/**
 * Base/quote vault updates for the same swap often land as separate
 * account-change notifications in the same slot, each recomputing a
 * price/gap that differs only in noise-level digits. Compare price_a and
 * price_b rounded to 6 significant figures (gap_percent is derived from
 * them, so it's redundant to compare separately) and skip the insert if
 * neither moved meaningfully. The row itself still stores the raw,
 * unrounded values.
 *
 * The last-inserted value is recorded synchronously, before the await on
 * the Supabase insert — two account-change handlers can fire back to back
 * (still both synchronous up to their first await), and if the record were
 * written only after the insert resolved, both could read a stale "last"
 * value and both insert. Recording it eagerly closes that race.
 */
const lastInsertedByPair = new Map<string, LastInserted>();

export async function insertPriceGap(row: PriceGapRow): Promise<void> {
  if (Math.abs(row.gapPercent) < MIN_GAP_PERCENT) {
    return;
  }

  const roundedPriceA = roundSigFigs(row.priceA, 6);
  const roundedPriceB = roundSigFigs(row.priceB, 6);

  const last = lastInsertedByPair.get(row.pairName);
  if (last && last.priceA === roundedPriceA && last.priceB === roundedPriceB) {
    return;
  }
  lastInsertedByPair.set(row.pairName, { priceA: roundedPriceA, priceB: roundedPriceB });

  const detectedAt = new Date().toISOString();

  const { error } = await supabase.from("price_gaps").insert({
    pair_name: row.pairName,
    dex_a: row.dexA,
    dex_b: row.dexB,
    price_a: row.priceA,
    price_b: row.priceB,
    gap_percent: row.gapPercent,
    pool_liquidity_a: Number.isFinite(row.poolLiquidityA) ? row.poolLiquidityA : null,
    pool_liquidity_b: Number.isFinite(row.poolLiquidityB) ? row.poolLiquidityB : null,
    detected_at: detectedAt,
  });

  if (error) {
    console.error(`[${detectedAt}] insert failed for ${row.pairName}:`, error.message);
    return;
  }

  console.log(
    `[${detectedAt}] ${row.pairName} | ${row.dexA}=${row.priceA.toPrecision(6)} ` +
      `${row.dexB}=${row.priceB.toPrecision(6)} | gap=${row.gapPercent.toFixed(4)}%`
  );
}
