import { readFileSync } from "fs";
import { join } from "path";
import { getPlatformProxy } from "wrangler";
import { createDb } from "../src/db";
import { user, subject, mcq } from "../src/db/schema";

interface SQLImportRow {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  total_mcqs: number;
  question: string;
  options: string;
  correct: string | null;
  explanation: string | null;
  subject_id: string;
}

async function readSqlFile(path: string): Promise<string[]> {
  const content = readFileSync(path, "utf-8");
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("--") && !l.startsWith("INSERT INTO subject") && l.startsWith("INSERT INTO"));
}

async function extractAdminId(db: any) {
  const users = await db.select({ id: user.id, email: user.email }).from(user);
  const admin = users.find((u) => u.email === "saqib.logic@gmail.com") ?? users[0];
  if (!admin) throw new Error("No admin user found");
  return admin.id;
}

async function pushSubject(name: string, sqlPath: string) {
  console.log(`\n→ ${name}`);
  const proxy = await getPlatformProxy({ configPath: "./wrangler.jsonc" });
  const remoteDb = createDb(proxy.env.DB);

  const adminId = await extractAdminId(remoteDb);
  console.log(`  Admin: ${adminId}`);

  const statements = await readSqlFile(sqlPath);
  console.log(`  ${statements.length} SQL statements`);

  let success = 0;
  let skipped = 0;

  for (const stmt of statements) {
    try {
      await remoteDb.run(stmt);
      success++;
      if (success % 50 === 0) process.stdout.write(`\r  ${success}/${statements.length}`);
    } catch (err) {
      if ((err as any).message?.includes("UNIQUE constraint failed") || (err as any).message?.includes("already exists")) {
        skipped++;
      } else {
        console.error(`\n  Error: ${(err as any).message}`);
        console.error(`  Statement: ${stmt.slice(0, 200)}...`);
      }
    }
  }

  console.log(`\n  ✓ ${success} inserted, ${skipped} skipped`);
  await proxy.dispose();
}

async function main() {
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

  console.log("Pushing all Top Subjects to Remote D1...");
  console.log("========================================");

  for (const ds of datasets) {
    try {
      await pushSubject(ds.name, ds.path);
    } catch (err) {
      console.error(`  ✗ ${ds.name}: ${err}`);
    }
  }

  console.log("\n========================================");
  console.log("All datasets pushed to remote D1!");
  console.log("Visit: https://prepmind.saqib-logic.workers.dev");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});