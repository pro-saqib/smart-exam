import { Database } from "bun:sqlite";
import { execSync } from "child_process";
import { join } from "path";

const DB_PATH = join(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/162b09b8c67e3fafda77330427d4549c676383a88b8302c1c67b4028ca2ddb1e.sqlite");
const db = new Database(DB_PATH);

async function main() {
  console.log("Reading subjects from local SQLite...");
  const subjects = db.query("SELECT id, user_id, name, parent_id, total_mcqs, created_at FROM subject").all() as any[];
  console.log(`Found ${subjects.length} subjects.`);

  console.log("Reading MCQs from local SQLite...");
  const mcqs = db.query("SELECT id, user_id, subject_id, question, options, correct, explanation, created_at FROM mcq").all() as any[];
  console.log(`Found ${mcqs.length} MCQs.`);

  // 1. Insert subjects in batches using INSERT OR REPLACE
  console.log("Pushing subjects to remote D1...");
  const subjectBatches: string[] = [];
  let currentBatch = "PRAGMA foreign_keys = OFF;\n";
  for (const s of subjects) {
    const parentIdSql = s.parent_id ? `'${s.parent_id.replace(/'/g, "''")}'` : "NULL";
    const nameSql = s.name.replace(/'/g, "''");
    const userId = s.user_id || "MwTB4GiNpIU33f2LJwseFripYqrDHSc0";
    const createdAt = s.created_at || Date.now();
    const stmt = `INSERT OR REPLACE INTO subject (id, user_id, name, parent_id, total_mcqs, created_at) VALUES ('${s.id}', '${userId}', '${nameSql}', ${parentIdSql}, ${s.total_mcqs || 0}, ${createdAt});\n`;
    if ((currentBatch + stmt).length > 30000) {
      currentBatch += "PRAGMA foreign_keys = ON;\n";
      subjectBatches.push(currentBatch);
      currentBatch = "PRAGMA foreign_keys = OFF;\n" + stmt;
    } else {
      currentBatch += stmt;
    }
  }
  if (currentBatch) {
    currentBatch += "PRAGMA foreign_keys = ON;\n";
    subjectBatches.push(currentBatch);
  }

  for (let i = 0; i < subjectBatches.length; i++) {
    console.log(`Executing subject batch ${i + 1}/${subjectBatches.length}...`);
    const sqlFile = join(process.cwd(), `.subject_batch_${i}_${Date.now()}.sql`);
    await Bun.write(sqlFile, subjectBatches[i]);
    try {
      execSync(`bun x wrangler d1 execute prepmind-db --remote --file="${sqlFile}"`, { stdio: "inherit" });
    } catch (e) {
      console.error(`Failed subject batch ${i + 1}:`, e);
    }
    execSync(`rm -f "${sqlFile}"`);
  }

  // 2. Insert MCQs in batches of 2000 using INSERT OR REPLACE
  console.log("Pushing MCQs to remote D1 in batches of 2000...");
  const BATCH_SIZE = 2000;
  for (let i = 0; i < mcqs.length; i += BATCH_SIZE) {
    const chunk = mcqs.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(mcqs.length / BATCH_SIZE);

    let sql = "PRAGMA foreign_keys = OFF;\n";
    for (const m of chunk) {
      const q = (m.question || "").replace(/'/g, "''");
      const opt = (m.options || "{}").replace(/'/g, "''");
      const corr = (m.correct || "A").replace(/'/g, "''");
      const exp = (m.explanation || "").replace(/'/g, "''");
      const userId = m.user_id || "MwTB4GiNpIU33f2LJwseFripYqrDHSc0";
      const createdAt = m.created_at ? Number(m.created_at) : Date.now();
      sql += `INSERT OR REPLACE INTO mcq (id, user_id, subject_id, question, options, correct, explanation, created_at) VALUES ('${m.id}', '${userId}', '${m.subject_id}', '${q}', '${opt}', '${corr}', '${exp}', ${createdAt});\n`;
    }
    sql += "PRAGMA foreign_keys = ON;\n";

    const sqlFile = join(process.cwd(), `.mcq_batch_${Date.now()}.sql`);
    await Bun.write(sqlFile, sql);

    console.log(`[MCQ Batch ${batchNum}/${totalBatches}] Executing ${chunk.length} MCQs...`);
    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        execSync(`bun x wrangler d1 execute prepmind-db --remote --file="${sqlFile}"`, { stdio: "inherit" });
        success = true;
        break;
      } catch (e: any) {
        console.warn(`  Attempt ${attempt} failed: ${e.message?.slice(0, 100)}`);
        execSync(`sleep ${attempt * 2}`);
      }
    }
    execSync(`rm -f "${sqlFile}"`);
    if (!success) {
      console.error(`❌ MCQ Batch ${batchNum} failed.`);
    }
  }

  console.log("✅ Full sync complete!");
}

main().catch(console.error);
