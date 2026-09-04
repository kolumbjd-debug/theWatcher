import { Connection } from "@solana/web3.js";
import { config } from "./config";
import { supabase } from "./supabaseClient";
import { startWatcher } from "./watcher";
import { startArchiveScheduler } from "./archiveScheduler";

const ARCHIVE_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

async function main() {
  console.log("Checking setup...");

  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${config.heliusApiKey}`;
  const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${config.heliusApiKey}`;
  const connection = new Connection(rpcUrl, { commitment: "confirmed", wsEndpoint: wsUrl });

  const version = await connection.getVersion();
  console.log("Helius RPC reachable, solana-core version:", version["solana-core"]);

  const { error } = await supabase.from("price_gaps").select("id", { count: "exact", head: true });
  if (error) {
    throw new Error(`Supabase query failed: ${error.message}`);
  }
  console.log("Supabase reachable.");

  console.log("Starting pool watcher...");
  await startWatcher(connection);
  console.log("Watcher running, logging price gaps as they come in.");

  startArchiveScheduler(ARCHIVE_INTERVAL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
