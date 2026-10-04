import { readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

async function pushToRemote(sqlPath: string, datasetName: string) {
  console.log(`\n→ ${datasetName}`);

  const content = readFileSync(sqlPath, "utf-8");
  const statements = content
    .split(";\n")
    .map(s => s.trim())
    .filter(s => s && !s.startsWith("--"));

  console.log(`  ${statements.length} statements to insert`);

  // Batch in groups of 100 to avoid timeout
  for (let i = 0; i < statements.length; i += 100) {
    const batch = statements.slice(i, i + 100);
    const batchSql = batch.join(";\n") + (batch.length > 0 ? ";" : "");

    if (batchSql.trim()) {
      console.log(`  Batch ${Math.floor(i/100) + 1}/${Math.ceil(statements.length/100)}`);

      try {
        execSync(
          `bun x wrangler d1 execute prepmind-db --remote --command="${batchSql.replace(/"/g, '\\"')}"`,
          { stdio: 'inherit', timeout: 30000 }
        );
      } catch (err) {
        console.error(`  Error in batch ${Math.floor(i/100) + 1}:`, err.message);
        // Continue with next batch
      }

      // Small delay between batches
      if (i + 100 < statements.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  console.log(`  ✓ ${datasetName} complete`);
}

async function main() {
  console.log("Pushing to remote D1 via wrangler CLI...");

  const datasets = [
    { name: "Top English", path: join(process.cwd(), "data", "top-english", "top-english-import.sql") },
    { name: "Top Islamic Studies", path: join(process.cwd(), "data", "top-islamic", "top-islamic-import.sql") },
    { name: "Top GK", path: join(process.cwd(), "data", "top-gk", "top-gk-import.sql") },
    { name: "Top Computer", path: join(process.cwd(), "data", "top-computer", "top-computer-import.sql") },
    { name: "Top Pakistan Study", path: join(process.cwd(), "data", "top-pakistan-study", "top-pakistan-study-import.sql") },
    { name: "Top Everyday Science", path: join(process.cwd(), "data", "top-everyday-science", "top-everyday-science-import.sql") },
    { name: "Top Urdu", path: join(process.cwd(), "data", "top-urdu", "top-urdu-import.sql") },
    { name: "Top Pak Affairs", path: join(process.cwd(), "data", "top-pak-affairs", "top-pak-affairs-import.sql") },
    { name: "Top International Affairs", path: join(process.cwd(), "data", "top-international-affairs", "top-international-affairs-import.sql") },
  ];

  for (const ds of datasets) {
    await pushToRemote(ds.path, ds.name);
  }

  console.log("\n✅ All datasets pushed to remote D1!");
}

main().catch(console.error);