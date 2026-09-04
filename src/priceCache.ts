export type DexId = "raydium" | "orca";

export interface DexPriceState {
  price: number;
  liquidity: number;
  timestamp: number;
}

type PairCache = Partial<Record<DexId, DexPriceState>>;

const cache = new Map<string, PairCache>();

export function updateCache(
  pairName: string,
  dex: DexId,
  partial: Partial<DexPriceState>
): PairCache {
  const entry = cache.get(pairName) ?? {};
  const previous = entry[dex];
  entry[dex] = {
    price: partial.price ?? previous?.price ?? NaN,
    liquidity: partial.liquidity ?? previous?.liquidity ?? NaN,
    timestamp: partial.timestamp ?? Date.now(),
  };
  cache.set(pairName, entry);
  return entry;
}

export function getPairCache(pairName: string): PairCache | undefined {
  return cache.get(pairName);
}
