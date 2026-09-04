import { AccountLayout } from "@solana/spl-token";

export function decodeVaultAmount(data: Buffer): bigint {
  return AccountLayout.decode(data).amount;
}

export function toHuman(rawAmount: bigint, decimals: number): number {
  return Number(rawAmount) / 10 ** decimals;
}
