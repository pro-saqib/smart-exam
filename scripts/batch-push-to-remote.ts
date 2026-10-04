import { readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

async function main() {
  console.log("Reading complete SQL file...");
  const content = readFileSync(join(process.cwd(), "data", "complete-top-import.sql"), "utf-8");
  
  const statements = content
    .split(";\n")
    .map(s => s.trim())
    .filter(s => s && !s.startsWith("--"));

  console.log(`Total statements: ${statements.length}`);

  const BATCH_SIZE = 50;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const batch = statements.slice(i, i + BATCH_SIZE);
    const batchSql = batch.join(";\n") + (batch.length > 0 ? ";" : "");
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(statements.length / BATCH_SIZE);

    console.log(`[Batch ${batchNum}/${totalBatches}] Executing ${batch.length} statements...`);

    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        execSync(
          `bun x wrangler d1 execute prepmind-db --remote --command="${batchSql.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
          { stdio: 'pipe', timeout: 60000 }
        );
        success = true;
        successCount++;
        break;
      } catch (err: any) {
        console.warn(`  Attempt ${attempt} failed: ${err.message?.slice(0, 100)}`);
        if (attempt < 3) {
          execSync(`sleep ${attempt * 2}`);
        }
      }
    }

    if (!success) {
      console.error(`  ❌ Batch ${batchNum} failed after 3 attempts.`);
      failCount++;
    }

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < statements.length) {
      execSync("sleep 0.5");
    }
  }

  console.log(`\n✅ Push complete! Successful batches: ${successCount}, Failed batches: ${failCount}`);
}

main().catch(console.error);
