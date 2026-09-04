import { PoolPairConfig } from "./pools";

/**
 * Raydium AMM v4 pool accounts store config and vault pointers, not live
 * reserves — the reserves live in the two SPL vault token accounts. Price
 * requires both the base and quote vault balances, but they update
 * independently over the websocket, so we keep the latest raw amount for
 * each side per pair and recompute price whenever either one changes.
 */

interface VaultAmounts {
  base?: bigint;
  quote?: bigint;
}

const vaultAmounts = new Map<string, VaultAmounts>();

export interface RaydiumPriceResult {
  price: number;
  liquidity: number;
}

export function onRaydiumVaultUpdate(
  pool: PoolPairConfig,
  vault: "base" | "quote",
  rawAmount: bigint
): RaydiumPriceResult | null {
  const entry = vaultAmounts.get(pool.pairName) ?? {};
  entry[vault] = rawAmount;
  vaultAmounts.set(pool.pairName, entry);

  if (entry.base === undefined || entry.quote === undefined) {
    return null;
  }

  const base = Number(entry.base) / 10 ** pool.baseDecimals;
  const quote = Number(entry.quote) / 10 ** pool.quoteDecimals;
  if (base === 0) {
    return null;
  }

  return { price: quote / base, liquidity: quote };
}
