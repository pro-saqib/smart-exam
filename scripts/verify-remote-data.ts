import { getPlatformProxy } from "wrangler";
import { createDb } from "../src/db";
import { subject, mcq } from "../src/db/schema";
import { eq, sql, count } from "drizzle-orm";

async function main() {
  console.log("Checking remote D1 database...");
  const proxy = await getPlatformProxy({ configPath: "./wrangler.jsonc" });
  const remoteDb = createDb(proxy.env.DB);

  // Check total subjects count
  const totalSubjects = await remoteDb.select({ count: count() }).from(subject);
  console.log(`Total subjects in remote D1: ${totalSubjects[0].count}`);

  // Check Top subjects
  const topSubjects = await remoteDb.select().from(subject).where(sql`id LIKE 'top_%' OR name LIKE 'Top %'`);
  console.log(`\nTop Subjects found (${topSubjects.length}):`);
  for (const s of topSubjects) {
    const mcqCount = await remoteDb.select({ count: count() }).from(mcq).where(eq(mcq.subjectId, s.id));
    console.log(`  - ${s.name} (${s.id}): ${mcqCount[0].count} MCQs, parent: ${s.parentId || '(none)'}`);
  }

  // Check some sample MCQs
  console.log(`\nSample MCQs from Top English subtopics:`);
  const engSubtopics = await remoteDb.select().from(subject).where(sql`parent_id = 'top_english' LIMIT 2`);
  for (const sub of engSubtopics) {
    const sampleMcqs = await remoteDb.select().from(mcq).where(eq(mcq.subjectId, sub.id)).limit(1);
    console.log(`  ${sub.name}: ${sampleMcqs.length > 0 ? '✓' : '✗'}`);
  }

  await proxy.dispose();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});