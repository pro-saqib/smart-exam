import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getPlatformProxy } from "wrangler";
import { createDb } from "../src/db";
import { user, subject, mcq } from "../src/db/schema";
import crypto from "crypto";

interface ScrapedMCQ {
  question: string;
  options: { A: string; B: string; C?: string; D?: string; E?: string };
  correct?: "A" | "B" | "C" | "D" | "E";
  explanation?: string;
  subtopic: string;
  sourceUrl: string;
}

const SUBTOPICS: { key: string; id: string; name: string }[] = [
  { key: "Government & Federal Ministers",   id: "top_pa_gov",        name: "Government & Federal Ministers" },
  { key: "Provincial Leadership & Governors",id: "top_pa_provincial", name: "Provincial Leadership & Governors" },
  { key: "Judiciary & Constitutional Posts", id: "top_pa_judiciary",  name: "Judiciary & Constitutional Posts" },
  { key: "Parliament, Senate & Politics",    id: "top_pa_parliament", name: "Parliament, Senate & Politics" },
  { key: "Defense & Armed Forces",           id: "top_pa_defense",    name: "Defense & Armed Forces" },
  { key: "Economy, Energy & CPEC",           id: "top_pa_economy",    name: "Economy, Energy & CPEC" },
  { key: "Foreign Affairs & Diplomacy",      id: "top_pa_foreign",    name: "Foreign Affairs & Diplomacy" },
  { key: "Sports, Awards & Personalities",   id: "top_pa_sports",     name: "Sports, Awards & Personalities" },
  { key: "General Pakistan Affairs",         id: "top_pa_general",    name: "General Pakistan Affairs" },
];

const PARENT_ID   = "top_pak_affairs";
const PARENT_NAME = "Top Pak Affairs";
const CHUNK_SIZE  = 8;

const escapeSql = (s: string | null | undefined) =>
  s === null || s === undefined ? "NULL" : `'${s.replace(/'/g, "''")}'`;

async function main() {
  console.log("Connecting to local D1...");
  const proxy = await getPlatformProxy<CloudflareEnv>({ configPath: "./wrangler.jsonc" });
  const db = createDb(proxy.env.DB);

  const users = await db.select({ id: user.id, email: user.email }).from(user);
  const admin = users.find((u) => u.email === "saqib.logic@gmail.com") ?? users[0];
  if (!admin) throw new Error("No admin user found");
  const adminId = admin.id;
  console.log(`Admin: ${admin.email}`);

  const dataPath = join(process.cwd(), "data", "top-pak-affairs", "top-pak-affairs-mcqs.json");
  const rawData: ScrapedMCQ[] = JSON.parse(readFileSync(dataPath, "utf-8"));
  console.log(`Loaded ${rawData.length} MCQs`);

  const bySubtopic: Record<string, ScrapedMCQ[]> = {};
  for (const m of rawData) (bySubtopic[m.subtopic] ??= []).push(m);

  const totalMcqs = rawData.length;
  const sqlStatements: string[] = [`-- Top Pak Affairs Import`];

  // Upsert parent
  await db.insert(subject).values({
    id: PARENT_ID, userId: adminId, name: PARENT_NAME,
    parentId: null, totalMcqs, createdAt: new Date(),
  }).onConflictDoUpdate({ target: subject.id, set: { totalMcqs, name: PARENT_NAME } });
  sqlStatements.push(`INSERT INTO subject (id, user_id, name, parent_id, total_mcqs, created_at) VALUES (${escapeSql(PARENT_ID)}, ${escapeSql(adminId)}, ${escapeSql(PARENT_NAME)}, NULL, ${totalMcqs}, ${Date.now()}) ON CONFLICT(id) DO UPDATE SET total_mcqs = ${totalMcqs};`);
  console.log(`[✓] Parent: ${PARENT_NAME} (${PARENT_ID})`);

  let grandTotal = 0;

  for (const sub of SUBTOPICS) {
    const mcqs = bySubtopic[sub.key] ?? [];
    if (mcqs.length === 0) { console.log(`  [skip] ${sub.name}`); continue; }

    await db.insert(subject).values({
      id: sub.id, userId: adminId, name: sub.name,
      parentId: PARENT_ID, totalMcqs: mcqs.length, createdAt: new Date(),
    }).onConflictDoUpdate({ target: subject.id, set: { totalMcqs: mcqs.length, name: sub.name } });
    sqlStatements.push(`INSERT INTO subject (id, user_id, name, parent_id, total_mcqs, created_at) VALUES (${escapeSql(sub.id)}, ${escapeSql(adminId)}, ${escapeSql(sub.name)}, ${escapeSql(PARENT_ID)}, ${mcqs.length}, ${Date.now()}) ON CONFLICT(id) DO UPDATE SET total_mcqs = ${mcqs.length};`);
    console.log(`  → ${sub.name}: ${mcqs.length} MCQs`);

    for (let i = 0; i < mcqs.length; i += CHUNK_SIZE) {
      const chunk = mcqs.slice(i, i + CHUNK_SIZE);
      const rows = chunk.map((m, idx) => {
        const hash = crypto.createHash("md5")
          .update(`${sub.id}_${i + idx}_${m.question}`).digest("hex").slice(0, 16);
        return {
          id: `mcq_tpa_${hash}`,
          userId: adminId,
          subjectId: sub.id,
          question: m.question,
          options: JSON.stringify(m.options ?? {}),
          correct: m.correct ?? null,
          explanation: m.explanation ?? null,
          solveLater: false,
          attemptCount: 0,
          wrongCount: 0,
          createdAt: new Date(),
        };
      });

      await db.insert(mcq).values(rows).onConflictDoNothing();
      for (const r of rows) {
        sqlStatements.push(`INSERT INTO mcq (id, user_id, subject_id, question, options, correct, explanation, solve_later, attempt_count, wrong_count, created_at) VALUES (${escapeSql(r.id)}, ${escapeSql(r.userId)}, ${escapeSql(r.subjectId)}, ${escapeSql(r.question)}, ${escapeSql(r.options)}, ${escapeSql(r.correct)}, ${escapeSql(r.explanation)}, 0, 0, 0, ${Date.now()}) ON CONFLICT(id) DO NOTHING;`);
      }
      grandTotal += rows.length;
      process.stdout.write(`\r    Inserted ${grandTotal}/${totalMcqs} MCQs`);
    }
    console.log();
  }

  const sqlPath = join(process.cwd(), "data", "top-pak-affairs", "top-pak-affairs-import.sql");
  writeFileSync(sqlPath, sqlStatements.join("\n"), "utf8");

  console.log(`\n=================================`);
  console.log(`Top Pak Affairs Import Done!`);
  console.log(`Total MCQs: ${grandTotal}`);
  console.log(`SQL dump: ${sqlPath}`);
  console.log(`=================================\n`);

  await proxy.dispose();
  process.exit(0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
