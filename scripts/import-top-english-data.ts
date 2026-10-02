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

// Subtopic definitions — id, display name
const SUBTOPICS: { key: string; id: string; name: string }[] = [
  { key: "Synonyms",                       id: "top_eng_synonyms",      name: "Synonyms" },
  { key: "Antonyms",                       id: "top_eng_antonyms",      name: "Antonyms" },
  { key: "Idioms & Proverbs",              id: "top_eng_idioms",        name: "Idioms & Proverbs" },
  { key: "One Word Substitution",          id: "top_eng_one_word",      name: "One Word Substitution" },
  { key: "Active & Passive Voice",         id: "top_eng_voice",         name: "Active & Passive Voice" },
  { key: "Direct & Indirect Speech",       id: "top_eng_narration",     name: "Direct & Indirect Speech" },
  { key: "Tenses",                         id: "top_eng_tenses",        name: "Tenses" },
  { key: "Prepositions & Fill in the Blanks", id: "top_eng_prepositions", name: "Prepositions & Fill in the Blanks" },
  { key: "Articles",                       id: "top_eng_articles",      name: "Articles" },
  { key: "Spelling",                       id: "top_eng_spelling",      name: "Spelling" },
  { key: "Grammar & Sentence Correction",  id: "top_eng_grammar",       name: "Grammar & Sentence Correction" },
  { key: "General English",               id: "top_eng_general",       name: "General English" },
];

const PARENT_ID   = "top_english";
const PARENT_NAME = "Top English";
const CHUNK_SIZE  = 8;

async function main() {
  console.log("Connecting to local D1 via Wrangler platform proxy...");
  const proxy = await getPlatformProxy<CloudflareEnv>({ configPath: "./wrangler.jsonc" });
  const db = createDb(proxy.env.DB);

  // 1. Resolve admin user
  const users = await db.select({ id: user.id, email: user.email }).from(user);
  const admin = users.find((u) => u.email === "saqib.logic@gmail.com") ?? users[0];
  if (!admin) throw new Error("No admin user found in DB");
  const adminId = admin.id;
  console.log(`Using admin: ${admin.email} (${adminId})`);

  // 2. Load scraped data
  const dataPath = join(process.cwd(), "data", "top-english", "top-english-mcqs.json");
  const rawData: ScrapedMCQ[] = JSON.parse(readFileSync(dataPath, "utf-8"));
  console.log(`Loaded ${rawData.length} unique MCQs from dataset`);

  // Group by subtopic
  const bySubtopic: Record<string, ScrapedMCQ[]> = {};
  for (const m of rawData) {
    (bySubtopic[m.subtopic] ??= []).push(m);
  }

  const totalMcqs = rawData.length;

  // 3. Upsert parent subject
  await db
    .insert(subject)
    .values({
      id: PARENT_ID,
      userId: adminId,
      name: PARENT_NAME,
      parentId: null,
      totalMcqs,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({ target: subject.id, set: { totalMcqs, name: PARENT_NAME } });

  console.log(`[✓] Upserted parent subject: ${PARENT_NAME} (${PARENT_ID})`);

  const sqlStatements: string[] = [];
  const escapeSql = (s: string | null | undefined) =>
    s === null || s === undefined ? "NULL" : `'${s.replace(/'/g, "''")}'`;

  sqlStatements.push(`-- Top English Import`);
  sqlStatements.push(
    `INSERT INTO subject (id, user_id, name, parent_id, total_mcqs, created_at) VALUES (${escapeSql(PARENT_ID)}, ${escapeSql(adminId)}, ${escapeSql(PARENT_NAME)}, NULL, ${totalMcqs}, ${Date.now()}) ON CONFLICT(id) DO UPDATE SET total_mcqs = ${totalMcqs}, name = ${escapeSql(PARENT_NAME)};`
  );

  let grandTotal = 0;

  // 4. For each subtopic — upsert subject + insert MCQs
  for (const sub of SUBTOPICS) {
    const mcqs = bySubtopic[sub.key] ?? [];
    if (mcqs.length === 0) {
      console.log(`  [skip] ${sub.name} — 0 MCQs`);
      continue;
    }

    await db
      .insert(subject)
      .values({
        id: sub.id,
        userId: adminId,
        name: sub.name,
        parentId: PARENT_ID,
        totalMcqs: mcqs.length,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({ target: subject.id, set: { totalMcqs: mcqs.length, name: sub.name } });

    sqlStatements.push(
      `INSERT INTO subject (id, user_id, name, parent_id, total_mcqs, created_at) VALUES (${escapeSql(sub.id)}, ${escapeSql(adminId)}, ${escapeSql(sub.name)}, ${escapeSql(PARENT_ID)}, ${mcqs.length}, ${Date.now()}) ON CONFLICT(id) DO UPDATE SET total_mcqs = ${mcqs.length};`
    );

    console.log(`  → ${sub.name}: ${mcqs.length} MCQs`);

    // Insert MCQs in chunks
    for (let i = 0; i < mcqs.length; i += CHUNK_SIZE) {
      const chunk = mcqs.slice(i, i + CHUNK_SIZE);
      const rows = chunk.map((m, idx) => {
        const hash = crypto
          .createHash("md5")
          .update(`${sub.id}_${i + idx}_${m.question}`)
          .digest("hex")
          .slice(0, 16);
        const mcqId = `mcq_te_${hash}`;
        return {
          id: mcqId,
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
        sqlStatements.push(
          `INSERT INTO mcq (id, user_id, subject_id, question, options, correct, explanation, solve_later, attempt_count, wrong_count, created_at) VALUES (${escapeSql(r.id)}, ${escapeSql(r.userId)}, ${escapeSql(r.subjectId)}, ${escapeSql(r.question)}, ${escapeSql(r.options)}, ${escapeSql(r.correct)}, ${escapeSql(r.explanation)}, 0, 0, 0, ${Date.now()}) ON CONFLICT(id) DO NOTHING;`
        );
      }

      grandTotal += rows.length;
      process.stdout.write(`\r    Inserted ${grandTotal}/${totalMcqs} MCQs`);
    }
    console.log();
  }

  // 5. Save SQL dump
  const sqlPath = join(process.cwd(), "data", "top-english", "top-english-import.sql");
  writeFileSync(sqlPath, sqlStatements.join("\n"), "utf8");

  console.log(`\n=================================`);
  console.log(`Top English Import Complete!`);
  console.log(`Total MCQs Inserted: ${grandTotal}`);
  console.log(`SQL dump saved to: ${sqlPath}`);
  console.log(`=================================\n`);

  await proxy.dispose();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
