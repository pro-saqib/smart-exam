import { Database } from "bun:sqlite";
import { execSync } from "child_process";
import { join } from "path";

const DB_PATH = join(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/162b09b8c67e3fafda77330427d4549c676383a88b8302c1c67b4028ca2ddb1e.sqlite");
const db = new Database(DB_PATH);

async function main() {
  // Find questions related to our recent updates
  const terms = [
    "%President of Syria%",
    "%Current President of Syria%",
    "%amendments to the 1973 Constitution%",
    "%Permanent Representative of Pakistan to the United Nations%",
    "%President of the International Court of Justice%",
    "%Chief Justice of Pakistan%",
    "%Secretary General of the OIC%",
    "%Vice President of the United States%"
  ];

  const updatedMcqs: any[] = [];
  for (const t of terms) {
    const rows = db.query("SELECT id, question, options, correct, explanation FROM mcq WHERE question LIKE ?").all(t);
    updatedMcqs.push(...rows);
  }

  // Also manually grab any mcq with id matching our known updated list
  const specificIds = [
    "mcq_tg_cc171564c418208b",
    "mcq_tia_24e88f017185299c",
    "is_6d926bd435ea3344",
    "is_b5a70329eb783957"
  ];
  for (const id of specificIds) {
    const r = db.query("SELECT id, question, options, correct, explanation FROM mcq WHERE id = ?").get(id);
    if (r && !updatedMcqs.some((m: any) => m.id === r.id)) {
      updatedMcqs.push(r);
    }
  }

  console.log(`Found ${updatedMcqs.length} updated MCQs to push to remote.`);

  let sql = "PRAGMA foreign_keys = OFF;\n";
  for (const m of updatedMcqs) {
    const q = m.question.replace(/'/g, "''");
    const opt = m.options.replace(/'/g, "''");
    const corr = (m.correct || "A").replace(/'/g, "''");
    const exp = (m.explanation || "").replace(/'/g, "''");
    sql += `UPDATE mcq SET question = '${q}', options = '${opt}', correct = '${corr}', explanation = '${exp}' WHERE id = '${m.id}';\n`;
  }
  sql += "PRAGMA foreign_keys = ON;\n";

  const sqlFile = join(process.cwd(), ".fixes.sql");
  await Bun.write(sqlFile, sql);

  console.log("Executing fixes on remote D1...");
  try {
    execSync(`bun x wrangler d1 execute prepmind-db --remote --file="${sqlFile}"`, { stdio: "inherit" });
    console.log("✅ Remote fixes applied successfully!");
  } catch (e) {
    console.error("❌ Failed to apply remote fixes:", e);
  } finally {
    execSync(`rm -f "${sqlFile}"`);
  }
}

main().catch(console.error);
