import { readFileSync } from "fs";
import { join } from "path";

const TO_REMOTE = false; // Set to true when ready
const DATASETS = [
  "top-pakistan-study",
  "top-everyday-science",
  "top-urdu",
  "top-pak-affairs",
  "top-international-affairs",
];

async function main() {
  console.log("Preparing remaining datasets for D1 batch insert...");

  for (const ds of DATASETS) {
    const sqlPath = join(process.cwd(), "data", ds, `${ds}-import.sql`);
    const content = readFileSync(sqlPath, "utf-8");
    const statements = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("--"));

    console.log(`\n${ds}: ${statements.length} statements`);
    console.log(`Sample: ${statements.slice(0, 2).join("\n  ")}`);

    if (TO_REMOTE) {
      console.log(`  Would push ${statements.length} statements to D1...`);
      // Use wrangler d1 execute prepmind-db --remote --command "BATCH INSERT..."
    } else {
      console.log(`  Preview mode - set TO_REMOTE=true to actually push`);
    }
  }

  console.log("\n=== MANUAL STEPS ===");
  console.log("1. Log into Cloudflare Dashboard");
  console.log("2. Go to Workers & Pages > prepmind > D1 > prepmind-db");
  console.log("3. Use 'Execute SQL' tab to run these batches");
  console.log("4. Or use: wrangler d1 execute prepmind-db --remote --command='BATCH ...'");
}

main().catch(console.error);