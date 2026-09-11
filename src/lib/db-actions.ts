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

// Module-level in-memory cache for static curriculum counts
let cachedMcqCounts: Map<string, number> | null = null;
let cachedSubjects: any[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const loadUserData = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  const db = await getDb();
  const userId = session.user.id;

  const now = Date.now();
  let subjects = cachedSubjects;
  let countMap = cachedMcqCounts;

  if (!subjects || !countMap || now - lastCacheTime > CACHE_TTL) {
    const [fetchedSubjects, mcqCounts] = await Promise.all([
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
    ]);

    subjects = fetchedSubjects;
    countMap = new Map<string, number>();
    for (const row of mcqCounts) {
      countMap.set(row.subjectId, Number(row.count) || 0);
    }

    cachedSubjects = subjects;
    cachedMcqCounts = countMap;
    lastCacheTime = now;
  }

  const [attempts, userSolveLater] = await Promise.all([
    db.select({
      id: attempt.id,
      mcqId: attempt.mcqId,
      subjectId: attempt.subjectId,
      selected: attempt.selected,
      correct: attempt.correct,
      at: attempt.at,
    }).from(attempt).where(eq(attempt.userId, userId)),
    db
      .select({
        mcqId: solveLater.mcqId,
        subjectId: mcq.subjectId,
      })
      .from(solveLater)
      .innerJoin(mcq, eq(solveLater.mcqId, mcq.id))
      .where(eq(solveLater.userId, userId)),
  ]);

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
    solveLaterItems: userSolveLater.map((s) => ({ mcqId: s.mcqId, subjectId: s.subjectId })),
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

export const getPracticeModelPaperCounts = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      mode: z.enum(["weak", "wrong", "solve_later"]),
      subjectKey: z.string(),
      subtopicIds: z.array(z.string()),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    const db = await getDb();
    const userId = session.user.id;

    if (!data.subtopicIds || data.subtopicIds.length === 0) {
      return {};
    }

    const subjectMcqs = await db
      .select({ id: mcq.id })
      .from(mcq)
      .where(inArray(mcq.subjectId, data.subtopicIds))
      .orderBy(mcq.id);

    if (subjectMcqs.length === 0) return {};

    const mcqIdToPaperNumber = new Map<string, number>();
    subjectMcqs.forEach((m, idx) => {
      const paperNum = Math.floor(idx / 100) + 1;
      mcqIdToPaperNumber.set(m.id, paperNum);
    });

    let matchingIds = new Set<string>();

    if (data.mode === "wrong") {
      const rows = await db
        .select({ mcqId: attempt.mcqId, correct: attempt.correct, at: attempt.at })
        .from(attempt)
        .where(eq(attempt.userId, userId))
        .orderBy(desc(attempt.at));
      const latestAttemptByMcq = new Map<string, boolean>();
      for (const r of rows) {
        if (!latestAttemptByMcq.has(r.mcqId)) {
          latestAttemptByMcq.set(r.mcqId, r.correct);
        }
      }
      for (const [mcqId, isCorrect] of latestAttemptByMcq.entries()) {
        if (!isCorrect) {
          matchingIds.add(mcqId);
        }
      }
    } else if (data.mode === "solve_later") {
      const rows = await db
        .select({ mcqId: solveLater.mcqId })
        .from(solveLater)
        .where(eq(solveLater.userId, userId));
      rows.forEach((r) => matchingIds.add(r.mcqId));
    } else if (data.mode === "weak") {
      const rows = await db
        .select({ mcqId: attempt.mcqId, correct: attempt.correct })
        .from(attempt)
        .where(eq(attempt.userId, userId));

      const stats: Record<string, { total: number; wrong: number }> = {};
      for (const r of rows) {
        if (!stats[r.mcqId]) stats[r.mcqId] = { total: 0, wrong: 0 };
        stats[r.mcqId].total += 1;
        if (!r.correct) stats[r.mcqId].wrong += 1;
      }

      for (const [id, st] of Object.entries(stats)) {
        if (st.wrong >= Math.max(1, Math.floor(st.total / 2))) {
          matchingIds.add(id);
        }
      }
    }

    const counts: Record<number, number> = {};
    for (const m of subjectMcqs) {
      if (matchingIds.has(m.id)) {
        const paperNum = mcqIdToPaperNumber.get(m.id)!;
        counts[paperNum] = (counts[paperNum] || 0) + 1;
      }
    }

    return counts;
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

    const hasSubjectFilter = Boolean(data.subjectKey && data.subtopicIds && data.subtopicIds.length > 0);
    const filterSubjectIds = hasSubjectFilter ? data.subtopicIds! : [];
    const paperNum = data.paperNumber !== "all" ? parseInt(data.paperNumber, 10) : null;

    let selectedMcqs: any[] = [];

    if (data.mode === "random") {
      // Random mode disabled per requirements, fallback to weak/wrong/solve_later
      selectedMcqs = [];
    } else {
      const subjectMcqs = await db
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
        .where(hasSubjectFilter ? inArray(mcq.subjectId, filterSubjectIds) : sql`1=0`)
        .orderBy(mcq.id);

      const mcqIdToPaperNumber = new Map<string, number>();
      subjectMcqs.forEach((m, idx) => {
        const paperNum = Math.floor(idx / 100) + 1;
        mcqIdToPaperNumber.set(m.id, paperNum);
      });

      let matchingIds = new Set<string>();

      if (data.mode === "wrong") {
        const rows = await db
          .select({ mcqId: attempt.mcqId, correct: attempt.correct, at: attempt.at })
          .from(attempt)
          .where(eq(attempt.userId, userId))
          .orderBy(desc(attempt.at));
        const latestAttemptByMcq = new Map<string, boolean>();
        for (const r of rows) {
          if (!latestAttemptByMcq.has(r.mcqId)) {
            latestAttemptByMcq.set(r.mcqId, r.correct);
          }
        }
        for (const [mcqId, isCorrect] of latestAttemptByMcq.entries()) {
          if (!isCorrect) {
            matchingIds.add(mcqId);
          }
        }
      } else if (data.mode === "solve_later") {
        const rows = await db
          .select({ mcqId: solveLater.mcqId })
          .from(solveLater)
          .where(eq(solveLater.userId, userId));
        rows.forEach((r) => matchingIds.add(r.mcqId));
      } else if (data.mode === "weak") {
        const rows = await db
          .select({ mcqId: attempt.mcqId, correct: attempt.correct })
          .from(attempt)
          .where(eq(attempt.userId, userId));

        const stats: Record<string, { total: number; wrong: number }> = {};
        for (const r of rows) {
          if (!stats[r.mcqId]) stats[r.mcqId] = { total: 0, wrong: 0 };
          stats[r.mcqId].total += 1;
          if (!r.correct) stats[r.mcqId].wrong += 1;
        }

        for (const [id, st] of Object.entries(stats)) {
          if (st.wrong >= Math.max(1, Math.floor(st.total / 2))) {
            matchingIds.add(id);
          }
        }
      }

      const matchingIdArray = Array.from(matchingIds);
      if (matchingIdArray.length === 0) return [];

      const queryBuilder = db
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
            ? and(inArray(mcq.subjectId, filterSubjectIds), inArray(mcq.id, matchingIdArray))
            : inArray(mcq.id, matchingIdArray)
        );

      const filteredMatchingMcqs = await queryBuilder;

      if (paperNum !== null && !isNaN(paperNum)) {
        selectedMcqs = filteredMatchingMcqs.filter((m) => mcqIdToPaperNumber.get(m.id) === paperNum);
      } else {
        selectedMcqs = filteredMatchingMcqs.slice(0, data.count);
      }
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

export const getSubjectModelPaperStats = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      subtopicIds: z.array(z.string()),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    const db = await getDb();
    const userId = session.user.id;

    if (!data.subtopicIds || data.subtopicIds.length === 0) {
      return {};
    }

    const subjectMcqs = await db
      .select({ id: mcq.id })
      .from(mcq)
      .where(inArray(mcq.subjectId, data.subtopicIds))
      .orderBy(mcq.id);

    if (subjectMcqs.length === 0) return {};

    const mcqIdToPaperNumber = new Map<string, number>();
    subjectMcqs.forEach((m, idx) => {
      const paperNum = Math.floor(idx / 100) + 1;
      mcqIdToPaperNumber.set(m.id, paperNum);
    });

    const userAttempts = await db
      .select({
        mcqId: attempt.mcqId,
        correct: attempt.correct,
      })
      .from(attempt)
      .where(eq(attempt.userId, userId));

    const paperStats: Record<number, { attemptedMcqIds: Set<string>; correctAttempts: number; totalAttempts: number }> = {};

    for (const a of userAttempts) {
      const paperNum = mcqIdToPaperNumber.get(a.mcqId);
      if (paperNum !== undefined) {
        if (!paperStats[paperNum]) {
          paperStats[paperNum] = { attemptedMcqIds: new Set(), correctAttempts: 0, totalAttempts: 0 };
        }
        paperStats[paperNum].attemptedMcqIds.add(a.mcqId);
        paperStats[paperNum].totalAttempts += 1;
        if (a.correct) {
          paperStats[paperNum].correctAttempts += 1;
        }
      }
    }

    const result: Record<number, { attemptedCount: number; accuracy: number }> = {};
    for (const [paperNumStr, stat] of Object.entries(paperStats)) {
      const paperNum = Number(paperNumStr);
      const accuracy = stat.totalAttempts > 0 ? Math.round((stat.correctAttempts / stat.totalAttempts) * 100) : 0;
      result[paperNum] = {
        attemptedCount: stat.attemptedMcqIds.size,
        accuracy,
      };
    }

    return result;
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

