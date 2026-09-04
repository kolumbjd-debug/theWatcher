/**
 * Pool registry for the price-gap scanner.
 *
 * Addresses are resolved from Raydium's and Orca's public pool-list APIs
 * (not hand-guessed), picking the highest-TVL pool per DEX for each pair:
 *   - Raydium: https://api-v3.raydium.io/pools/info/mint (poolType=Standard,
 *     i.e. classic AMM v4, program 675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8)
 *     then https://api-v3.raydium.io/pools/key/ids for vault addresses.
 *   - Orca: https://api.orca.so/v2/solana/pools, filtered to the pair's
 *     mints and sorted by tvlUsdc.
 *
 * A Raydium AMM v4 pool account stores config and vault pointers, not live
 * reserves — the actual reserves live in the two SPL vault token accounts,
 * so those are what the watcher subscribes to and decodes.
 * An Orca whirlpool account stores live price directly (sqrtPrice), so the
 * watcher subscribes to the whirlpool account itself for price, plus the
 * quote vault for a liquidity proxy (kept consistent with the Raydium side).
 *
 * To add a new pair: resolve its addresses the same way and append one
 * entry below — the watcher iterates this array and needs no changes.
 */

export interface PoolPairConfig {
  pairName: string;
  baseMint: string;
  quoteMint: string;
  baseDecimals: number;
  quoteDecimals: number;
  raydium: {
    ammId: string;
    baseVault: string;
    quoteVault: string;
  };
  orca: {
    whirlpoolAddress: string;
    quoteVault: string;
  };
}

export const POOLS: PoolPairConfig[] = [
  {
    // Resolved 2026-09-04. Raydium TVL ~$14.4M, Orca TVL ~$25.7M.
    pairName: "SOL/USDC",
    baseMint: "So11111111111111111111111111111111111111112",
    quoteMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    baseDecimals: 9,
    quoteDecimals: 6,
    raydium: {
      ammId: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
      baseVault: "DQyrAcCrDXQ7NeoqGgDCZwBvWDcYmFCjSb9JtteuvPpz",
      quoteVault: "HLmqeL62xR1QoZ1HKKbXRrdN1p3phKpxRMb2VVopvBBz",
    },
    orca: {
      whirlpoolAddress: "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE",
      quoteVault: "2WLWEuKDgkDUccTpbwYp1GToYktiSB1cXvreHUwiSUVP",
    },
  },
  {
    // Resolved 2026-09-05. Raydium TVL ~$729k, Orca TVL ~$583k.
    pairName: "SOL/USDT",
    baseMint: "So11111111111111111111111111111111111111112",
    quoteMint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    baseDecimals: 9,
    quoteDecimals: 6,
    raydium: {
      ammId: "7XawhbbxtsRcQA8KTkHT9f9nc6d69UwqCDh6U5EEbEmX",
      baseVault: "876Z9waBygfzUrwwKFfnRcc7cfY4EQf6Kz1w7GRgbVYW",
      quoteVault: "CB86HtaqpXbNWbq67L18y5x2RhqoJ6smb7xHUcyWdQAQ",
    },
    orca: {
      whirlpoolAddress: "FwewVm8u6tFPGewAyHmWAqad9hmF7mvqxK4mJ7iNqqGC",
      quoteVault: "B1qD7GDsKN4kz2ehks71eEpVhUzqaTVXaWfCxXykRAA9",
    },
  },
  {
    // Resolved 2026-09-05. Raydium TVL ~$18.3k, Orca TVL ~$217k.
    // Raydium liquidity here is thin relative to Orca's — expect noisier,
    // less-arbitrageable gaps for this pair; that's what pool_liquidity_a
    // is for when filtering during analysis.
    pairName: "BONK/SOL",
    baseMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    quoteMint: "So11111111111111111111111111111111111111112",
    baseDecimals: 5,
    quoteDecimals: 9,
    raydium: {
      ammId: "HVNwzt7Pxfu76KHCMQPTLuTCLTm6WnQ1esLv4eizseSv",
      baseVault: "7KFdXKA5WkZBspxwqd9kSrDGTg9WhiX5TptUB3yRwEaE",
      quoteVault: "GehmCo7EgzkB4xxyviW6xdUhm1Ed2nN98QcfcRWQCfA9",
    },
    orca: {
      whirlpoolAddress: "5zpyutJu9ee6jFymDGoK7F6S5Kczqtc9FomP3ueKuyA9",
      quoteVault: "ES7yhSrYeFo4U1PfJHNRkbfCWxCwPLk2DjrEbmN8bg58",
    },
  },
  {
    // Resolved 2026-09-05. Raydium TVL ~$115k, Orca TVL ~$197.5k.
    // Picked as the 4th pair over the suggested JUP/USDC and JTO/USDC,
    // which had negligible Raydium liquidity (<$2.5k and <$60 TVL) at
    // resolution time, and over RAY/USDC, whose Orca side ($11.5k) was
    // too thin relative to its Raydium side ($4.24M) for a fair
    // cross-DEX comparison. mSOL/SOL had comparable depth on both.
    pairName: "mSOL/SOL",
    baseMint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    quoteMint: "So11111111111111111111111111111111111111112",
    baseDecimals: 9,
    quoteDecimals: 9,
    raydium: {
      ammId: "EGyhb2uLAsRUbRx9dNFBjMVYnFaASWMvD6RE1aEf2LxL",
      baseVault: "85SxT7AdDQvJg6pZLoDf7vPiuXLj5UYZLVVNWD1NjnFK",
      quoteVault: "BtGUR6y7uwJ6UGXNMcY3gCLm7dM3WaBdmgtKVgGnE1TJ",
    },
    orca: {
      whirlpoolAddress: "HQcY5n2zP6rW74fyFEhWeBd3LnJpBcZechkvJpmdb8cx",
      quoteVault: "2gG2nqzdqDnFRio8ttYyCkesTbfqDcbQLrv19n4weuK6",
    },
  },
];
