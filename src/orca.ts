import { AccountInfo, PublicKey } from "@solana/web3.js";
import { ParsableWhirlpool } from "@orca-so/whirlpools-sdk";
import Decimal from "decimal.js";
import { PoolPairConfig } from "./pools";

const Q64 = new Decimal(2).pow(64);

/**
 * An Orca whirlpool account stores the live price directly as sqrtPriceX64
 * (unlike Raydium AMM v4, whose account holds no live reserve data), so a
 * single account decode is enough to derive price. sqrtPrice is expressed
 * as (token B raw units) per (token A raw unit) — token A/B are whichever
 * of the pair's mints sorts first, which may or may not match this
 * project's base/quote convention, so we check and invert if needed.
 */
export function decodeWhirlpoolPrice(
  address: PublicKey,
  accountInfo: AccountInfo<Buffer>,
  pool: PoolPairConfig
): number | null {
  const parsed = ParsableWhirlpool.parse(address, accountInfo);
  if (!parsed) {
    return null;
  }

  const mintA = parsed.tokenMintA.toBase58();
  const mintB = parsed.tokenMintB.toBase58();

  const sqrtPrice = new Decimal(parsed.sqrtPrice.toString()).div(Q64);
  const decimalsAdjustment = new Decimal(10).pow(pool.baseDecimals - pool.quoteDecimals);

  if (mintA === pool.baseMint && mintB === pool.quoteMint) {
    // sqrtPrice^2 = quote raw per base raw
    return sqrtPrice.pow(2).mul(decimalsAdjustment).toNumber();
  }

  if (mintA === pool.quoteMint && mintB === pool.baseMint) {
    // sqrtPrice^2 = base raw per quote raw; invert to get quote per base
    return new Decimal(1).div(sqrtPrice.pow(2)).mul(decimalsAdjustment).toNumber();
  }

  throw new Error(
    `Whirlpool ${address.toBase58()} mints (${mintA}, ${mintB}) do not match ` +
      `pool config for ${pool.pairName} (${pool.baseMint}, ${pool.quoteMint})`
  );
}
