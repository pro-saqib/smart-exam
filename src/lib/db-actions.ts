import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { createDb } from "@/db";
import { getEnv } from "@/lib/env";
import { subject, mcq, attempt } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { INITIAL_SUBJECTS } from "@/store/app-store";

async function getDb() {
  const env = await getEnv();
  return createDb(env.DB);
}

// ─── bootstrap ───────────────────────────────────────────────────────────────
// Called once on first login — seeds the 10 default subjects for new users.

export const bootstrapUser = createServerFn({ method: "POST" }).handler(async () => {
  const session = await requireSession();
  const db = await getDb();
  const userId = session.user.id;

  const existing = await db
    .select({ id: subject.id })
    .from(subject)
    .where(eq(subject.userId, userId))
    .limit(1);

  if (existing.length > 0) return { seeded: false };

  await db.insert(subject).values(
    INITIAL_SUBJECTS.map((s) => ({
      id: s.id,
      userId,
      name: s.name,
      parentId: null,
      createdAt: new Date(0),
    })),
  );

  return { seeded: true };
});

// ─── load all user data ───────────────────────────────────────────────────────

export const loadUserData = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  const db = await getDb();
  const userId = session.user.id;

  const [subjects, mcqs, attempts] = await Promise.all([
    db.select().from(subject).where(eq(subject.userId, userId)),
    db.select().from(mcq).where(eq(mcq.userId, userId)),
    db.select().from(attempt).where(eq(attempt.userId, userId)),
  ]);

  return {
    subjects: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      parentId: s.parentId ?? undefined,
      createdAt: s.createdAt.getTime(),
    })),
    mcqs: mcqs.map((m) => ({
      id: m.id,
      subjectId: m.subjectId,
      question: m.question,
      options: JSON.parse(m.options) as { A: string; B: string; C: string; D: string; E?: string },
      correct: (m.correct ?? undefined) as "A" | "B" | "C" | "D" | "E" | undefined,
      explanation: m.explanation ?? undefined,
      solveLater: m.solveLater,
      attemptCount: m.attemptCount,
      wrongCount: m.wrongCount,
      lastAttemptCorrect: m.lastAttemptCorrect ?? undefined,
      createdAt: m.createdAt.getTime(),
    })),
    attempts: attempts.map((a) => ({
      id: a.id,
      mcqId: a.mcqId,
      subjectId: a.subjectId,
      selected: a.selected as "A" | "B" | "C" | "D" | "E",
      correct: a.correct,
      at: a.at.getTime(),
    })),
  };
});

// ─── subjects ─────────────────────────────────────────────────────────────────

export const dbAddSubject = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), name: z.string(), parentId: z.string().optional() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const db = await getDb();
    await db.insert(subject).values({
      id: data.id,
      userId: session.user.id,
      name: data.name,
      parentId: data.parentId ?? null,
      createdAt: new Date(),
    });
    return { id: data.id };
  });

export const dbRenameSubject = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), name: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const db = await getDb();
    await db
      .update(subject)
      .set({ name: data.name })
      .where(and(eq(subject.id, data.id), eq(subject.userId, session.user.id)));
  });

export const dbDeleteSubject = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const db = await getDb();
    const userId = session.user.id;

    // Find children
    const children = await db
      .select({ id: subject.id })
      .from(subject)
      .where(and(eq(subject.parentId, data.id), eq(subject.userId, userId)));

    const idsToDelete = [data.id, ...children.map((c) => c.id)];

    // D1 doesn't support cascades in batches — delete manually
    if (idsToDelete.length > 0) {
      await db.delete(attempt).where(and(inArray(attempt.subjectId, idsToDelete), eq(attempt.userId, userId)));
      await db.delete(mcq).where(and(inArray(mcq.subjectId, idsToDelete), eq(mcq.userId, userId)));
      await db.delete(subject).where(and(inArray(subject.id, idsToDelete), eq(subject.userId, userId)));
    }
  });

// ─── MCQs ─────────────────────────────────────────────────────────────────────

const MCQInputSchema = z.object({
  subjectId: z.string(),
  items: z.array(z.object({
    id: z.string(),
    question: z.string(),
    options: z.object({ A: z.string(), B: z.string(), C: z.string(), D: z.string(), E: z.string().optional() }),
    correct: z.enum(["A", "B", "C", "D", "E"]).optional(),
    explanation: z.string().optional(),
  })),
});

export const dbAddMCQs = createServerFn({ method: "POST" })
  .inputValidator(MCQInputSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const db = await getDb();
    const userId = session.user.id;

    if (!data.items.length) return { added: 0 };

    await db.insert(mcq).values(
      data.items.map((item) => ({
        id: item.id,
        userId,
        subjectId: data.subjectId,
        question: item.question,
        options: JSON.stringify(item.options),
        correct: item.correct ?? null,
        explanation: item.explanation ?? null,
        solveLater: false,
        attemptCount: 0,
        wrongCount: 0,
        createdAt: new Date(),
      })),
    ).onConflictDoNothing();

    return { added: data.items.length };
  });

export const dbToggleSolveLater = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), value: z.boolean() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const db = await getDb();
    await db
      .update(mcq)
      .set({ solveLater: data.value })
      .where(and(eq(mcq.id, data.id), eq(mcq.userId, session.user.id)));
  });

export const dbDeleteMCQ = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const db = await getDb();
    const userId = session.user.id;
    await db.delete(attempt).where(and(eq(attempt.mcqId, data.id), eq(attempt.userId, userId)));
    await db.delete(mcq).where(and(eq(mcq.id, data.id), eq(mcq.userId, userId)));
  });

// ─── attempts ─────────────────────────────────────────────────────────────────

export const dbRecordAttempt = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    id: z.string(),
    mcqId: z.string(),
    subjectId: z.string(),
    selected: z.enum(["A", "B", "C", "D", "E"]),
    correct: z.boolean(),
    at: z.number(),
    attemptCount: z.number(),
    wrongCount: z.number(),
    lastAttemptCorrect: z.boolean(),
  }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const db = await getDb();
    const userId = session.user.id;

    await db.insert(attempt).values({
      id: data.id,
      userId,
      mcqId: data.mcqId,
      subjectId: data.subjectId,
      selected: data.selected,
      correct: data.correct,
      at: new Date(data.at),
    });

    await db
      .update(mcq)
      .set({
        attemptCount: data.attemptCount,
        wrongCount: data.wrongCount,
        lastAttemptCorrect: data.lastAttemptCorrect,
      })
      .where(and(eq(mcq.id, data.mcqId), eq(mcq.userId, userId)));
  });

export const dbClearAttempts = createServerFn({ method: "POST" }).handler(async () => {
  const session = await requireSession();
  const db = await getDb();
  await db.delete(attempt).where(eq(attempt.userId, session.user.id));
  // Reset attempt counts on MCQs
  await db
    .update(mcq)
    .set({ attemptCount: 0, wrongCount: 0, lastAttemptCorrect: null })
    .where(eq(mcq.userId, session.user.id));
});
