import { join } from "path";
import { execSync } from "child_process";

const datasets = [
  "ghq",
  "top-computer",
  "top-english",
  "top-everyday-science",
  "top-gk",
  "top-international-affairs",
  "top-islamic",
  "top-pak-affairs",
  "top-pakistan-study",
  "top-urdu"
];

async function main() {
  console.log("Pushing individual SQL import files to remote D1...");

  for (const ds of datasets) {
    const filePath = join(process.cwd(), "data", ds, `${ds === "ghq" ? "ghq" : ds}-import.sql`);
    console.log(`\n→ Pushing ${ds}...`);

    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        execSync(
          `bun x wrangler d1 execute prepmind-db --remote --file="${filePath}"`,
          { stdio: 'inherit', timeout: 120000 }
        );
        success = true;
        console.log(`  ✓ ${ds} pushed successfully.`);
        break;
      } catch (err: any) {
        console.warn(`  Attempt ${attempt} failed for ${ds}: ${err.message}`);
        if (attempt < 3) {
          execSync(`sleep ${attempt * 3}`);
        }
      }
    }

    if (!success) {
      console.error(`  ❌ Failed to push ${ds} after 3 attempts.`);
    }
  }

  console.log("\n✅ All SQL files push process complete!");
}

main().catch(console.error);
