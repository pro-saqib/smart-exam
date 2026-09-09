import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { getPlatformProxy } from "wrangler";
import { createDb } from "../src/db";
import { user, subject, mcq } from "../src/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

async function main() {
  console.log("Connecting to local D1 database via Wrangler platform proxy...");
  const proxy = await getPlatformProxy<CloudflareEnv>({ configPath: "./wrangler.jsonc" });
  const db = createDb(proxy.env.DB);

  // Find an existing user or create a designated system admin user
  let adminUserId = "";
  const existingUsers = await db.select({ id: user.id }).from(user).limit(1);

  if (existingUsers.length > 0) {
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

  const fallbackUserId = adminUserId;

  const dataDir = join(process.cwd(), "data", "ppsc");
  const AGGREGATE_PATTERNS = [
    /^ppsc-all-mcqs-\d+\.json$/,           // ppsc-all-mcqs-2021.json etc.
    /^ppsc-mcqs-from-2004-to-2020\.json$/, // aggregate 2004-2020 file
  ];
  const files = readdirSync(dataDir).filter(
    (f) =>
      f.endsWith(".json") &&
      f !== "manifest.json" &&
      !AGGREGATE_PATTERNS.some((re) => re.test(f)),
  );

  console.log(`Found ${files.length} PPSC paper files to process.`);

  // 1. Ensure PPSC Parent Subject exists
  const ppscParentId = "ppsc_past_papers";
  await db
    .insert(subject)
    .values({
      id: ppscParentId,
      userId: fallbackUserId,
      name: "PPSC Past Papers",
      parentId: null,
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  let totalImportedMcqs = 0;
  let totalSubtopicsCreated = 0;

  for (const file of files) {
    const filePath = join(dataDir, file);
    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    const rawName = content.name || file.replace(".json", "");
    const mcqsList = content.mcqs || [];

    if (!mcqsList.length) continue;

    // Subtopic ID derived deterministically or uniquely
    const subtopicId = `ppsc_${crypto.createHash("md5").update(rawName).digest("hex").slice(0, 16)}`;

    // Upsert subtopic
    await db
      .insert(subject)
      .values({
        id: subtopicId,
        userId: fallbackUserId,
        name: rawName,
        parentId: ppscParentId,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    totalSubtopicsCreated++;

    // Prepare MCQs in small chunks to avoid SQLite parameter limit (D1 supports up to 100 parameters)
    const CHUNK_SIZE = 8;
    for (let i = 0; i < mcqsList.length; i += CHUNK_SIZE) {
      const chunk = mcqsList.slice(i, i + CHUNK_SIZE);
      const rows = chunk.map((m: any, idx: number) => {
        const mcqId = `mcq_${crypto.createHash("md5").update(`${subtopicId}_${i + idx}_${m.question}`).digest("hex").slice(0, 20)}`;
        return {
          id: mcqId,
          userId: fallbackUserId,
          subjectId: subtopicId,
          question: m.question,
          options: JSON.stringify(m.options || {}),
          correct: m.correct || null,
          explanation: m.explanation || null,
          solveLater: false,
          attemptCount: 0,
          wrongCount: 0,
          createdAt: new Date(),
        };
      });

      await db.insert(mcq).values(rows).onConflictDoNothing();
      totalImportedMcqs += rows.length;
    }

    console.log(`[✓] Imported ${mcqsList.length} MCQs for: ${rawName}`);
  }

  console.log("\n=================================");
  console.log(`PPSC Import Complete!`);
  console.log(`Total Subtopics: ${totalSubtopicsCreated}`);
  console.log(`Total MCQs Loaded: ${totalImportedMcqs}`);
  console.log("=================================\n");

  await proxy.dispose();
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
