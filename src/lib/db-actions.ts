import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSession, requireAdmin } from "@/lib/session";
import { createDb } from "@/db";
import { getEnv } from "@/lib/env";
import { user, subject, mcq, attempt, solveLater } from "@/db/schema";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { INITIAL_SUBJECTS } from "@/store/app-store";

async function getDb() {
  const env = await getEnv();
  return createDb(env.DB);
}

// ─── bootstrap ───────────────────────────────────────────────────────────────
// Seeds default global subjects if none exist and updates designated admin role.

export const bootstrapUser = createServerFn({ method: "POST" }).handler(async () => {
  const session = await requireSession();
  const db = await getDb();
  const userId = session.user.id;

  // Auto-elevate admin in database if designated email
  if (session.user.role === "admin") {
    await db
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.id, userId));
  }

  const existing = await db
    .select({ id: subject.id })
    .from(subject)
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

// ─── load all user data (Lightweight Metadata) ─────────────────────────────
// Loads shared subjects with counts + user attempts & solve-later flags (<50KB).

export const loadUserData = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  const db = await getDb();
  const userId = session.user.id;

  const [subjects, mcqCounts, attempts, userSolveLater] = await Promise.all([
    db.select({
      id: subject.id,
      name: subject.name,
      parentId: subject.parentId,
      createdAt: subject.createdAt,
    }).from(subject),
    db
      .select({
        subjectId: mcq.subjectId,
        count: sql<number>`count(${mcq.id})`,
      })
      .from(mcq)
      .groupBy(mcq.subjectId),
    db.select({
      id: attempt.id,
      mcqId: attempt.mcqId,
      subjectId: attempt.subjectId,
      selected: attempt.selected,
      correct: attempt.correct,
      at: attempt.at,
    }).from(attempt).where(eq(attempt.userId, userId)),
    db.select({
      mcqId: solveLater.mcqId,
    }).from(solveLater).where(eq(solveLater.userId, userId)),
  ]);

  const countMap = new Map<string, number>();
  for (const row of mcqCounts) {
    countMap.set(row.subjectId, Number(row.count) || 0);
  }

  return {
    subjects: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      parentId: s.parentId ?? undefined,
      totalMcqs: countMap.get(s.id) || 0,
      createdAt: s.createdAt.getTime(),
    })),
    mcqs: [],
    attempts: attempts.map((a) => ({
      id: a.id,
      mcqId: a.mcqId,
      subjectId: a.subjectId,
      selected: a.selected as "A" | "B" | "C" | "D" | "E",
      correct: a.correct,
      at: a.at.getTime(),
    })),
    solveLaterIds: userSolveLater.map((s) => s.mcqId),
    userId,
  };
});

// ─── On-Demand MCQ Fetchers ───────────────────────────────────────────────────

export const getSubjectModelPaperMcqs = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      subjectKey: z.string(),
      subtopicIds: z.array(z.string()).optional(),
      paperNumber: z.number().default(1),
      pageSize: z.number().default(100),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    const db = await getDb();
    const userId = session.user.id;

    const allowedSubjectIds = (data.subtopicIds && data.subtopicIds.length > 0)
      ? data.subtopicIds
      : [data.subjectKey];

    const offset = Math.max(0, (data.paperNumber - 1) * data.pageSize);

    const [rows, userAttempts, userSolveLater] = await Promise.all([
      db
        .select({
          id: mcq.id,
          subjectId: mcq.subjectId,
          question: mcq.question,
          options: mcq.options,
          correct: mcq.correct,
          explanation: mcq.explanation,
          createdAt: mcq.createdAt,
        })
        .from(mcq)
        .where(inArray(mcq.subjectId, allowedSubjectIds))
        .orderBy(mcq.id)
        .limit(data.pageSize)
        .offset(offset),
      db
        .select({
          mcqId: attempt.mcqId,
          correct: attempt.correct,
          at: attempt.at,
        })
        .from(attempt)
        .where(eq(attempt.userId, userId)),
      db
        .select({ mcqId: solveLater.mcqId })
        .from(solveLater)
        .where(eq(solveLater.userId, userId)),
    ]);

    const solveLaterSet = new Set(userSolveLater.map((s) => s.mcqId));
    const attemptsByMcq: Record<string, { total: number; wrong: number; lastCorrect?: boolean; lastAt: number }> = {};

    for (const a of userAttempts) {
      if (!attemptsByMcq[a.mcqId]) {
        attemptsByMcq[a.mcqId] = { total: 0, wrong: 0, lastAt: 0 };
      }
      const stat = attemptsByMcq[a.mcqId];
      stat.total += 1;
      if (!a.correct) stat.wrong += 1;
      const atTime = a.at.getTime();
      if (atTime >= stat.lastAt) {
        stat.lastAt = atTime;
        stat.lastCorrect = a.correct;
      }
    }

    return rows.map((m) => {
      const userStat = attemptsByMcq[m.id];
      return {
        id: m.id,
        subjectId: m.subjectId,
        question: m.question,
        options: JSON.parse(m.options) as { A: string; B: string; C: string; D: string; E?: string },
        correct: (m.correct ?? undefined) as "A" | "B" | "C" | "D" | "E" | undefined,
        explanation: m.explanation ?? undefined,
        solveLater: solveLaterSet.has(m.id),
        attemptCount: userStat ? userStat.total : 0,
        wrongCount: userStat ? userStat.wrong : 0,
        lastAttemptCorrect: userStat ? userStat.lastCorrect : undefined,
        createdAt: m.createdAt.getTime(),
      };
    });
  });

export const getPracticeQuizMcqs = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      mode: z.enum(["random", "weak", "wrong", "solve_later"]),
      subjectKey: z.string().default("all"),
      subtopicIds: z.array(z.string()).optional(),
      paperNumber: z.string().default("all"),
      count: z.number().default(50),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    const db = await getDb();
    const userId = session.user.id;

    const hasSubjectFilter = data.subjectKey !== "all" && data.subtopicIds && data.subtopicIds.length > 0;
    const filterSubjectIds = hasSubjectFilter ? data.subtopicIds! : [];

    let selectedMcqs: {
      id: string;
      subjectId: string;
      question: string;
      options: string;
      correct: string | null;
      explanation: string | null;
      createdAt: Date;
    }[] = [];

    if (data.mode === "random") {
      if (hasSubjectFilter) {
        selectedMcqs = await db
          .select({
            id: mcq.id,
            subjectId: mcq.subjectId,
            question: mcq.question,
            options: mcq.options,
            correct: mcq.correct,
            explanation: mcq.explanation,
            createdAt: mcq.createdAt,
          })
          .from(mcq)
          .where(inArray(mcq.subjectId, filterSubjectIds))
          .orderBy(sql`RANDOM()`)
          .limit(data.count);
      } else {
        selectedMcqs = await db
          .select({
            id: mcq.id,
            subjectId: mcq.subjectId,
            question: mcq.question,
            options: mcq.options,
            correct: mcq.correct,
            explanation: mcq.explanation,
            createdAt: mcq.createdAt,
          })
          .from(mcq)
          .orderBy(sql`RANDOM()`)
          .limit(data.count);
      }
    } else if (data.mode === "wrong") {
      const wrongMcqIdsQuery = db
        .select({ mcqId: attempt.mcqId })
        .from(attempt)
        .where(and(eq(attempt.userId, userId), eq(attempt.correct, false)));

      const query = db
        .select({
          id: mcq.id,
          subjectId: mcq.subjectId,
          question: mcq.question,
          options: mcq.options,
          correct: mcq.correct,
          explanation: mcq.explanation,
          createdAt: mcq.createdAt,
        })
        .from(mcq)
        .where(
          hasSubjectFilter
            ? and(inArray(mcq.id, wrongMcqIdsQuery), inArray(mcq.subjectId, filterSubjectIds))
            : inArray(mcq.id, wrongMcqIdsQuery)
        )
        .orderBy(sql`RANDOM()`)
        .limit(data.count);

      selectedMcqs = await query;
    } else if (data.mode === "solve_later") {
      const bookmarkedMcqIds = db
        .select({ mcqId: solveLater.mcqId })
        .from(solveLater)
        .where(eq(solveLater.userId, userId));

      const query = db
        .select({
          id: mcq.id,
          subjectId: mcq.subjectId,
          question: mcq.question,
          options: mcq.options,
          correct: mcq.correct,
          explanation: mcq.explanation,
          createdAt: mcq.createdAt,
        })
        .from(mcq)
        .where(
          hasSubjectFilter
            ? and(inArray(mcq.id, bookmarkedMcqIds), inArray(mcq.subjectId, filterSubjectIds))
            : inArray(mcq.id, bookmarkedMcqIds)
        )
        .orderBy(mcq.id)
        .limit(data.count);

      selectedMcqs = await query;
    } else if (data.mode === "weak") {
      const weakMcqIds = db
        .select({ mcqId: attempt.mcqId })
        .from(attempt)
        .where(eq(attempt.userId, userId))
        .groupBy(attempt.mcqId)
        .having(sql`SUM(CASE WHEN ${attempt.correct} = 0 THEN 1 ELSE 0 END) >= MAX(1, COUNT(*) / 2)`);

      const query = db
        .select({
          id: mcq.id,
          subjectId: mcq.subjectId,
          question: mcq.question,
          options: mcq.options,
          correct: mcq.correct,
          explanation: mcq.explanation,
          createdAt: mcq.createdAt,
        })
        .from(mcq)
        .where(
          hasSubjectFilter
            ? and(inArray(mcq.id, weakMcqIds), inArray(mcq.subjectId, filterSubjectIds))
            : inArray(mcq.id, weakMcqIds)
        )
        .orderBy(sql`RANDOM()`)
        .limit(data.count);

      selectedMcqs = await query;
    }

    if (selectedMcqs.length === 0) return [];

    const mcqIds = selectedMcqs.map((m) => m.id);
    const [userAttempts, userSolveLater] = await Promise.all([
      db
        .select({
          mcqId: attempt.mcqId,
          correct: attempt.correct,
          at: attempt.at,
        })
        .from(attempt)
        .where(and(eq(attempt.userId, userId), inArray(attempt.mcqId, mcqIds))),
      db
        .select({ mcqId: solveLater.mcqId })
        .from(solveLater)
        .where(and(eq(solveLater.userId, userId), inArray(solveLater.mcqId, mcqIds))),
    ]);

    const solveLaterSet = new Set(userSolveLater.map((s) => s.mcqId));
    const attemptsByMcq: Record<string, { total: number; wrong: number; lastCorrect?: boolean; lastAt: number }> = {};

    for (const a of userAttempts) {
      if (!attemptsByMcq[a.mcqId]) {
        attemptsByMcq[a.mcqId] = { total: 0, wrong: 0, lastAt: 0 };
      }
      const stat = attemptsByMcq[a.mcqId];
      stat.total += 1;
      if (!a.correct) stat.wrong += 1;
      const atTime = a.at.getTime();
      if (atTime >= stat.lastAt) {
        stat.lastAt = atTime;
        stat.lastCorrect = a.correct;
      }
    }

    return selectedMcqs.map((m) => {
      const userStat = attemptsByMcq[m.id];
      return {
        id: m.id,
        subjectId: m.subjectId,
        question: m.question,
        options: JSON.parse(m.options) as { A: string; B: string; C: string; D: string; E?: string },
        correct: (m.correct ?? undefined) as "A" | "B" | "C" | "D" | "E" | undefined,
        explanation: m.explanation ?? undefined,
        solveLater: solveLaterSet.has(m.id),
        attemptCount: userStat ? userStat.total : 0,
        wrongCount: userStat ? userStat.wrong : 0,
        lastAttemptCorrect: userStat ? userStat.lastCorrect : undefined,
        createdAt: m.createdAt.getTime(),
      };
    });
  });

// ─── subjects (Admin Only) ───────────────────────────────────────────────────

export const dbAddSubject = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), name: z.string(), parentId: z.string().optional() }))
  .handler(async ({ data }) => {
    const session = await requireAdmin();
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
    await requireAdmin();
    const db = await getDb();
    await db
      .update(subject)
      .set({ name: data.name })
      .where(eq(subject.id, data.id));
  });

export const dbDeleteSubject = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const db = await getDb();

    // Find children
    const children = await db
      .select({ id: subject.id })
      .from(subject)
      .where(eq(subject.parentId, data.id));

    const idsToDelete = [data.id, ...children.map((c) => c.id)];

    if (idsToDelete.length > 0) {
      await db.delete(attempt).where(inArray(attempt.subjectId, idsToDelete));
      await db.delete(solveLater).where(
        inArray(
          solveLater.mcqId,
          db.select({ id: mcq.id }).from(mcq).where(inArray(mcq.subjectId, idsToDelete)),
        ),
      );
      await db.delete(mcq).where(inArray(mcq.subjectId, idsToDelete));
      await db.delete(subject).where(inArray(subject.id, idsToDelete));
    }
  });

// ─── MCQs (Admin Only) ───────────────────────────────────────────────────────

const MCQInputSchema = z.object({
  subjectId: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      options: z.object({
        A: z.string(),
        B: z.string(),
        C: z.string(),
        D: z.string(),
        E: z.string().optional(),
      }),
      correct: z.enum(["A", "B", "C", "D", "E"]).optional(),
      explanation: z.string().optional(),
    }),
  ),
});

export const dbAddMCQs = createServerFn({ method: "POST" })
  .inputValidator(MCQInputSchema)
  .handler(async ({ data }) => {
    const session = await requireAdmin();
    const db = await getDb();
    const userId = session.user.id;

    if (!data.items.length) return { added: 0 };

    await db
      .insert(mcq)
      .values(
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
      )
      .onConflictDoNothing();

    return { added: data.items.length };
  });

export const dbDeleteMCQ = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const db = await getDb();
    await db.delete(solveLater).where(eq(solveLater.mcqId, data.id));
    await db.delete(attempt).where(eq(attempt.mcqId, data.id));
    await db.delete(mcq).where(eq(mcq.id, data.id));
  });

// ─── User Bookmarks & Attempts (User Scoped) ─────────────────────────────────

export const dbToggleSolveLater = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), value: z.boolean() }))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const db = await getDb();
    const userId = session.user.id;

    if (data.value) {
      await db
        .insert(solveLater)
        .values({
          id: `${userId}_${data.id}`,
          userId,
          mcqId: data.id,
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    } else {
      await db
        .delete(solveLater)
        .where(and(eq(solveLater.userId, userId), eq(solveLater.mcqId, data.id)));
    }
  });

export const dbRecordAttempt = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
      mcqId: z.string(),
      subjectId: z.string(),
      selected: z.enum(["A", "B", "C", "D", "E"]),
      correct: z.boolean(),
      at: z.number(),
    }),
  )
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
  });

export const dbClearAttempts = createServerFn({ method: "POST" }).handler(async () => {
  const session = await requireSession();
  const db = await getDb();
  await db.delete(attempt).where(eq(attempt.userId, session.user.id));
});

// ─── Admin User Management ───────────────────────────────────────────────────

export const adminListUsers = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const db = await getDb();

  const [usersList, allAttempts] = await Promise.all([
    db.select().from(user).orderBy(desc(user.createdAt)),
    db.select({ userId: attempt.userId }).from(attempt),
  ]);

  const attemptsCountByUser: Record<string, number> = {};
  for (const a of allAttempts) {
    attemptsCountByUser[a.userId] = (attemptsCountByUser[a.userId] || 0) + 1;
  }

  return usersList.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    role: u.role as "admin" | "user",
    createdAt: u.createdAt.getTime(),
    totalAttempts: attemptsCountByUser[u.id] || 0,
  }));
});

export const adminUpdateUserRole = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string(),
      role: z.enum(["admin", "user"]),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireAdmin();
    const db = await getDb();

    // Prevent admin from demoting themselves
    if (data.userId === session.user.id && data.role !== "admin") {
      throw new Error("You cannot remove your own admin privileges.");
    }

    await db
      .update(user)
      .set({ role: data.role })
      .where(eq(user.id, data.userId));

    return { success: true };
  });

