import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getPlatformProxy } from "wrangler";
import { createDb } from "../src/db";
import { user, subject, mcq } from "../src/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

interface ScrapedMCQ {
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
    E?: string;
  };
  correct?: "A" | "B" | "C" | "D" | "E";
  explanation?: string;
}

async function main() {
  console.log("Connecting to local D1 database via Wrangler platform proxy...");
  const proxy = await getPlatformProxy<CloudflareEnv>({ configPath: "./wrangler.jsonc" });
  const db = createDb(proxy.env.DB);

  // 1. Resolve Admin User ID
  let adminUserId = "";
  const existingUsers = await db.select({ id: user.id, email: user.email }).from(user);

  const designatedAdmin = existingUsers.find((u) => u.email === "saqib.logic@gmail.com");
  if (designatedAdmin) {
    adminUserId = designatedAdmin.id;
  } else if (existingUsers.length > 0) {
    adminUserId = existingUsers[0].id;
  } else {
    adminUserId = "system_admin";
    await db
      .insert(user)
      .values({
        id: adminUserId,
        name: "PrepMind Admin",
        email: "saqib.logic@gmail.com",
        emailVerified: true,
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  console.log(`Using admin userId: ${adminUserId}`);

  // 2. Load scraped GHQ dataset
  const dataPath = join(process.cwd(), "data", "ghq", "ghq-past-papers.json");
  const rawData: ScrapedMCQ[] = JSON.parse(readFileSync(dataPath, "utf-8"));
  console.log(`Loaded ${rawData.length} MCQs from ${dataPath}`);

  const parentSubjectId = "ghq_past_papers";
  const subtopicId = "ghq_all_mcqs";
  const parentSubjectName = "GHQ Past Papers";
  const subtopicName = "GHQ Past Papers MCQs";

  // 3. Upsert Parent Subject
  await db
    .insert(subject)
    .values({
      id: parentSubjectId,
      userId: adminUserId,
      name: parentSubjectName,
      parentId: null,
      totalMcqs: rawData.length,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subject.id,
      set: {
        totalMcqs: rawData.length,
      },
    });

  // 4. Upsert Child Subtopic
  await db
    .insert(subject)
    .values({
      id: subtopicId,
      userId: adminUserId,
      name: subtopicName,
      parentId: parentSubjectId,
      totalMcqs: rawData.length,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subject.id,
      set: {
        totalMcqs: rawData.length,
      },
    });

  console.log(`[✓] Created/Updated parent subject (${parentSubjectId}) and subtopic (${subtopicId})`);

  // 5. Insert MCQs in chunks (8 rows = 88 SQL variables, safely under D1 SQLite 100 variable limit)
  const CHUNK_SIZE = 8;
  let totalInserted = 0;
  const sqlStatements: string[] = [];

  // SQL export setup
  const escapeSql = (str: string | null | undefined) => {
    if (str === null || str === undefined) return "NULL";
    return `'${str.replace(/'/g, "''")}'`;
  };

  sqlStatements.push(`-- GHQ Past Papers Import`);
  sqlStatements.push(`INSERT INTO subject (id, user_id, name, parent_id, total_mcqs, created_at) VALUES ('${parentSubjectId}', '${adminUserId}', '${parentSubjectName}', NULL, ${rawData.length}, ${Date.now()}) ON CONFLICT(id) DO UPDATE SET total_mcqs = ${rawData.length};`);
  sqlStatements.push(`INSERT INTO subject (id, user_id, name, parent_id, total_mcqs, created_at) VALUES ('${subtopicId}', '${adminUserId}', '${subtopicName}', '${parentSubjectId}', ${rawData.length}, ${Date.now()}) ON CONFLICT(id) DO UPDATE SET total_mcqs = ${rawData.length};`);

  for (let i = 0; i < rawData.length; i += CHUNK_SIZE) {
    const chunk = rawData.slice(i, i + CHUNK_SIZE);
    const rows = chunk.map((m, idx) => {
      const hash = crypto.createHash("md5").update(`${subtopicId}_${i + idx}_${m.question}`).digest("hex").slice(0, 16);
      const mcqId = `mcq_ghq_${hash}`;
      return {
        id: mcqId,
        userId: adminUserId,
        subjectId: subtopicId,
        question: m.question,
        options: JSON.stringify(m.options || {}),
        correct: m.correct || null,
        explanation: null, // skipped per user request
        solveLater: false,
        attemptCount: 0,
        wrongCount: 0,
        createdAt: new Date(),
      };
    });

    await db.insert(mcq).values(rows).onConflictDoNothing();
    totalInserted += rows.length;

    // Generate batch SQL statements for remote deployment
    for (const r of rows) {
      sqlStatements.push(
        `INSERT INTO mcq (id, user_id, subject_id, question, options, correct, explanation, solve_later, attempt_count, wrong_count, created_at) VALUES (${escapeSql(r.id)}, ${escapeSql(r.userId)}, ${escapeSql(r.subjectId)}, ${escapeSql(r.question)}, ${escapeSql(r.options)}, ${escapeSql(r.correct)}, NULL, 0, 0, 0, ${Date.now()}) ON CONFLICT(id) DO NOTHING;`
      );
    }

    const percent = ((totalInserted / rawData.length) * 100).toFixed(1);
    process.stdout.write(`\r[${percent}%] Inserted ${totalInserted}/${rawData.length} MCQs into D1`);
  }

  // Save SQL dump for remote execution
  const sqlPath = join(process.cwd(), "data", "ghq", "ghq-import.sql");
  writeFileSync(sqlPath, sqlStatements.join("\n"), "utf8");

  console.log(`\n\n=================================`);
  console.log(`GHQ Past Papers Import Complete!`);
  console.log(`Total MCQs Inserted: ${totalInserted}`);
  console.log(`Saved remote SQL migration file: ${sqlPath}`);
  console.log(`=================================\n`);

  await proxy.dispose();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error during import:", err);
  process.exit(1);
});
