import "dotenv/config";
import { runArchive } from "./archiveRunner";

async function main() {
  console.log("Archiving price_gaps rows older than 24h...");
  const { totalArchived, filePath } = await runArchive();
  console.log(`Done. Archived ${totalArchived} rows to ${filePath}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
