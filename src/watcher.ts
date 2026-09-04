import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { POOLS, PoolPairConfig } from "./pools";
import { updateCache, getPairCache } from "./priceCache";
import { onRaydiumVaultUpdate } from "./raydium";
import { decodeWhirlpoolPrice } from "./orca";
import { decodeVaultAmount, toHuman } from "./splVault";
import { insertPriceGap } from "./priceGapWriter";

export async function startWatcher(connection: Connection): Promise<void> {
  for (const pool of POOLS) {
    await primePool(connection, pool);
    subscribePool(connection, pool);
  }
}

/** Fetch each account's current state once so we don't sit idle waiting for the next swap. */
async function primePool(connection: Connection, pool: PoolPairConfig): Promise<void> {
  const baseVault = new PublicKey(pool.raydium.baseVault);
  const quoteVault = new PublicKey(pool.raydium.quoteVault);
  const whirlpool = new PublicKey(pool.orca.whirlpoolAddress);
  const orcaQuoteVault = new PublicKey(pool.orca.quoteVault);

  const [baseInfo, quoteInfo, whirlpoolInfo, orcaQuoteInfo] = await connection.getMultipleAccountsInfo([
    baseVault,
    quoteVault,
    whirlpool,
    orcaQuoteVault,
  ]);

  if (baseInfo) handleRaydiumVaultUpdate(pool, "base", baseInfo);
  if (quoteInfo) handleRaydiumVaultUpdate(pool, "quote", quoteInfo);
  if (whirlpoolInfo) handleOrcaWhirlpoolUpdate(pool, whirlpool, whirlpoolInfo);
  if (orcaQuoteInfo) handleOrcaVaultUpdate(pool, orcaQuoteInfo);
}

function subscribePool(connection: Connection, pool: PoolPairConfig): void {
  const baseVault = new PublicKey(pool.raydium.baseVault);
  const quoteVault = new PublicKey(pool.raydium.quoteVault);
  const whirlpool = new PublicKey(pool.orca.whirlpoolAddress);
  const orcaQuoteVault = new PublicKey(pool.orca.quoteVault);

  connection.onAccountChange(baseVault, (info) => handleRaydiumVaultUpdate(pool, "base", info));
  connection.onAccountChange(quoteVault, (info) => handleRaydiumVaultUpdate(pool, "quote", info));
  connection.onAccountChange(whirlpool, (info) => handleOrcaWhirlpoolUpdate(pool, whirlpool, info));
  connection.onAccountChange(orcaQuoteVault, (info) => handleOrcaVaultUpdate(pool, info));
}

function handleRaydiumVaultUpdate(
  pool: PoolPairConfig,
  vault: "base" | "quote",
  info: AccountInfo<Buffer>
): void {
  const raw = decodeVaultAmount(info.data);
  const result = onRaydiumVaultUpdate(pool, vault, raw);
  if (!result) return;

  updateCache(pool.pairName, "raydium", {
    price: result.price,
    liquidity: result.liquidity,
    timestamp: Date.now(),
  });
  void handleUpdate(pool);
}

function handleOrcaWhirlpoolUpdate(pool: PoolPairConfig, address: PublicKey, info: AccountInfo<Buffer>): void {
  const price = decodeWhirlpoolPrice(address, info, pool);
  if (price === null) return;

  updateCache(pool.pairName, "orca", { price, timestamp: Date.now() });
  void handleUpdate(pool);
}

function handleOrcaVaultUpdate(pool: PoolPairConfig, info: AccountInfo<Buffer>): void {
  const raw = decodeVaultAmount(info.data);
  const liquidity = toHuman(raw, pool.quoteDecimals);

  updateCache(pool.pairName, "orca", { liquidity, timestamp: Date.now() });
  void handleUpdate(pool);
}

async function handleUpdate(pool: PoolPairConfig): Promise<void> {
  const cache = getPairCache(pool.pairName);
  const raydium = cache?.raydium;
  const orca = cache?.orca;

  if (!raydium || !orca || !Number.isFinite(raydium.price) || !Number.isFinite(orca.price)) {
    return;
  }

  const gapPercent = ((raydium.price - orca.price) / orca.price) * 100;

  await insertPriceGap({
    pairName: pool.pairName,
    dexA: "raydium",
    dexB: "orca",
    priceA: raydium.price,
    priceB: orca.price,
    gapPercent,
    poolLiquidityA: raydium.liquidity,
    poolLiquidityB: orca.liquidity,
  });
}
