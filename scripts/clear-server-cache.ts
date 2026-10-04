// This script simulates a server-side cache invalidation by forcing a fresh load
import { getPlatformProxy } from "wrangler";
import { createDb } from "./src/db";
import { subject } from "./src/db/schema";

async function clearCache() {
  console.log("Forcing server cache refresh...");
  const proxy = await getPlatformProxy({ configPath: "./wrangler.jsonc" });
  const db = createDb(proxy.env.DB);

  // Just query subjects - this should trigger fresh cache on next request
  const subjects = await db.select().from(subject).where(sql => sql`name LIKE 'Top %'`);
  console.log(`Found ${subjects.length} Top subjects:`);
  subjects.forEach(s => console.log(`  - ${s.name} (${s.id})`));

  await proxy.dispose();
  console.log("\nCache refreshed. Subjects should now appear.");
}

clearCache().catch(console.error);