import { getPlatformProxy } from "wrangler";
import { createDb } from "../src/db";
import { subject, mcq } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { buildSubjectGroups, getSubjectModelPapers, SUBJECT_KEYWORDS } from "../src/lib/model-papers";

async function verify() {
  console.log("=== Verifying GHQ Past Papers Integration ===");
  const proxy = await getPlatformProxy<CloudflareEnv>({ configPath: "./wrangler.jsonc" });
  const db = createDb(proxy.env.DB);

  // 1. Check Subject & Subtopic rows
  const subjects = await db.select().from(subject);
  const ghqParent = subjects.find((s) => s.id === "ghq_past_papers");
  const ghqChild = subjects.find((s) => s.id === "ghq_all_mcqs");

  console.log("GHQ Parent:", ghqParent ? `${ghqParent.name} (Total: ${ghqParent.totalMcqs})` : "MISSING");
  console.log("GHQ Child Subtopic:", ghqChild ? `${ghqChild.name} (Total: ${ghqChild.totalMcqs})` : "MISSING");

  if (!ghqParent || !ghqChild) {
    throw new Error("Subject or subtopic missing in D1");
  }

  // 2. Check MCQ count in database
  const countRes = await db
    .select({ count: sql<number>`count(*)` })
    .from(mcq)
    .where(eq(mcq.subjectId, "ghq_all_mcqs"));

  const totalCount = Number(countRes[0]?.count || 0);
  console.log(`Total GHQ MCQs in D1 'mcq' table: ${totalCount}`);
  if (totalCount !== 2272) {
    throw new Error(`Expected 2272 MCQs, found ${totalCount}`);
  }

  // 3. Verify Model Papers generation
  const subtopics = subjects.filter((s) => !!s.parentId);
  const groups = buildSubjectGroups(subtopics);
  const ghqGroup = groups.find((g) => g.key === "ghq-past-papers");

  console.log("Canonical Groups Count:", groups.length);
  console.log("GHQ Group Found:", ghqGroup ? `${ghqGroup.label} (${ghqGroup.key}) with ${ghqGroup.totalMcqs} MCQs` : "MISSING");

  if (!ghqGroup) {
    throw new Error("GHQ group not found in buildSubjectGroups");
  }

  const modelPapers = getSubjectModelPapers("ghq-past-papers", subtopics, ghqGroup.totalMcqs, [], 100);
  console.log(`Total Model Papers generated for GHQ Past: ${modelPapers.length}`);
  console.log(`First Paper: ${modelPapers[0].name} with ${modelPapers[0].totalMcqs} MCQs`);
  console.log(`Last Paper: ${modelPapers[modelPapers.length - 1].name} with ${modelPapers[modelPapers.length - 1].totalMcqs} MCQs`);

  if (modelPapers.length !== 23) {
    throw new Error(`Expected 23 Model Papers, got ${modelPapers.length}`);
  }

  if (modelPapers[0].totalMcqs !== 100) {
    throw new Error(`Expected Paper 1 to have 100 MCQs, got ${modelPapers[0].totalMcqs}`);
  }

  if (modelPapers[22].totalMcqs !== 72) {
    throw new Error(`Expected Paper 23 to have 72 MCQs, got ${modelPapers[22].totalMcqs}`);
  }

  // 4. Sample check MCQ data integrity (verify options and absence of explanation)
  const sampleMcqs = await db
    .select()
    .from(mcq)
    .where(eq(mcq.subjectId, "ghq_all_mcqs"))
    .limit(3);

  console.log("\nSample MCQ Verification:");
  for (const m of sampleMcqs) {
    console.log(`- ID: ${m.id}`);
    console.log(`  Question: ${m.question}`);
    console.log(`  Options: ${m.options}`);
    console.log(`  Correct: ${m.correct}`);
    console.log(`  Explanation: ${m.explanation === null ? "null (properly skipped)" : m.explanation}`);
  }

  console.log("\n[✓] All GHQ integration assertions PASSED successfully!\n");
  await proxy.dispose();
  process.exit(0);
}

verify().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
