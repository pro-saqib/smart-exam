import type { MCQ, Subject, AttemptLog, PaperLockStatus } from "@/lib/types";

// Canonical subject keywords — ordered per display preference
export const SUBJECT_KEYWORDS: { key: string; label: string; patterns: RegExp[] }[] = [
  { key: "english",           label: "English",            patterns: [/\benglish\b/i] },
  { key: "general-knowledge",label: "G.K",                patterns: [/general.knowledge/i] },
  { key: "geography",        label: "Geography",          patterns: [/geography/i] },
  { key: "pakistan-study",   label: "Pakistan Study",     patterns: [/pak.stud/i, /pakistan.stud/i] },
  { key: "computer",          label: "Computer",          patterns: [/computer/i] },
  { key: "everyday-science", label: "Everyday Science",  patterns: [/everyday.science/i] },
  { key: "current-affairs",  label: "Current Affairs",   patterns: [/current.affairs/i] },
  { key: "basic-mathematics", label: "Maths",              patterns: [/basic.math/i] },
  { key: "islamic-study",    label: "Islamic Study",      patterns: [/islamic/i] },
  { key: "urdu",             label: "Urdu",               patterns: [/\burdu\b/i] },
  { key: "ghq-past-papers",  label: "GHQ Past",           patterns: [/\bghq\b/i, /army.headquarters/i] },
];

export interface SubjectGroup {
  key: string;
  label: string;
  subtopicIds: string[];
  totalMcqs: number;
}

export interface ModelPaper {
  paperNumber: number;
  name: string; // e.g. "Model Paper 1"
  mcqs: MCQ[];
  totalMcqs: number;
  filteredCount?: number;
  attemptedCount: number;
  accuracy: number;
  subtopicIds: string[];
}

export function getSubjectGroup(subtopicName: string): { key: string; label: string } | null {
  for (const subject of SUBJECT_KEYWORDS) {
    if (subject.patterns.some((p) => p.test(subtopicName))) {
      return { key: subject.key, label: subject.label };
    }
  }
  return null;
}

let lastSubtopicsRef: Subject[] | null = null;
let lastMcqsLength = -1;
let lastGroupsCache: SubjectGroup[] = [];

/** Group child subtopics by canonical subject name. Returns groups in canonical order (memoized). */
export function buildSubjectGroups(subtopics: Subject[], mcqs?: MCQ[]): SubjectGroup[] {
  const groupMap = new Map<string, SubjectGroup>();

  for (const sub of subtopics) {
    const group = getSubjectGroup(sub.name);
    if (!group) continue;
    if (!groupMap.has(group.key)) {
      groupMap.set(group.key, { key: group.key, label: group.label, subtopicIds: [], totalMcqs: 0 });
    }
    const current = groupMap.get(group.key)!;
    current.subtopicIds.push(sub.id);
    current.totalMcqs += sub.totalMcqs || 0;
  }

  if (mcqs && mcqs.length > 0) {
    for (const group of groupMap.values()) {
      const actualCount = mcqs.filter((m) => group.subtopicIds.includes(m.subjectId)).length;
      if (actualCount > 0) group.totalMcqs = actualCount;
    }
  }

  return SUBJECT_KEYWORDS
    .map((sk) => groupMap.get(sk.key))
    .filter((g): g is SubjectGroup => !!g && g.totalMcqs > 0);
}

/** Get all MCQs belonging to a subject group in consistent order */
export function getSubjectAllMcqs(
  groupKey: string,
  subtopics: Subject[],
  allMcqs: MCQ[]
): MCQ[] {
  const groupSubtopics = subtopics
    .filter((s) => {
      const g = getSubjectGroup(s.name);
      return g?.key === groupKey;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const subtopicIds = groupSubtopics.map((s) => s.id);
  // Also include direct subjectId match if any
  return allMcqs.filter((m) => subtopicIds.includes(m.subjectId) || m.subjectId === groupKey);
}

/** Chunk a subject group's MCQs into batches of 100 as "Model Paper 1, Model Paper 2, etc." */
export function getSubjectModelPapers(
  groupKey: string,
  subtopics: Subject[],
  totalMcqsCount: number,
  attempts: AttemptLog[],
  batchSize = 100
): ModelPaper[] {
  if (totalMcqsCount <= 0) return [];

  const groupSubtopics = subtopics
    .filter((s) => {
      const g = getSubjectGroup(s.name);
      return g?.key === groupKey;
    })
    .map((s) => s.id);

  const papers: ModelPaper[] = [];
  const totalPapers = Math.ceil(totalMcqsCount / batchSize);

  // Filter attempts belonging to this group's subtopics
  const groupSubtopicSet = new Set(groupSubtopics);
  const relevantAttempts = attempts.filter((a) => groupSubtopicSet.has(a.subjectId));
  const accuracy = relevantAttempts.length > 0
    ? Math.round((relevantAttempts.filter((a) => a.correct).length / relevantAttempts.length) * 100)
    : 0;

  for (let i = 0; i < totalPapers; i++) {
    const isLast = i === totalPapers - 1;
    const paperMcqsCount = isLast ? totalMcqsCount - i * batchSize : batchSize;

    papers.push({
      paperNumber: i + 1,
      name: `Paper ${i + 1}`,
      mcqs: [],
      totalMcqs: paperMcqsCount,
      attemptedCount: 0,
      accuracy,
      subtopicIds: groupSubtopics,
    });
  }

  return papers;
}

/** Get the MCQs slice for a specific Model Paper number (1-indexed) */
export function getModelPaperMcqs(
  groupKey: string,
  subtopics: Subject[],
  allMcqs: MCQ[],
  paperNumber: number,
  batchSize = 100
): { name: string; mcqs: MCQ[]; paperNumber: number; totalPapers: number } {
  const subjectMcqs = getSubjectAllMcqs(groupKey, subtopics, allMcqs);
  const totalPapers = Math.max(1, Math.ceil(subjectMcqs.length / batchSize));
  const safePaperNumber = Math.max(1, Math.min(paperNumber, totalPapers));

  const start = (safePaperNumber - 1) * batchSize;
  const chunk = subjectMcqs.slice(start, start + batchSize);

  return {
    name: `Paper ${safePaperNumber}`,
    mcqs: chunk,
    paperNumber: safePaperNumber,
    totalPapers,
  };
}

/**
 * Deterministically computes whether a model paper is unlocked.
 * Paper 1 is unlocked by default for all subjects.
 * Paper N (N >= 2) is unlocked only if Paper N-1 is completed or attempted.
 * Admins have all papers unlocked.
 */
export function getPaperLockStatus({
  subjectKey,
  paperNumber,
  isAdmin = false,
  completedPaperNumbers = new Set<number>(),
  attemptedPaperNumbers = new Set<number>(),
}: {
  subjectKey: string;
  paperNumber: number;
  isAdmin?: boolean;
  completedPaperNumbers?: Set<number>;
  attemptedPaperNumbers?: Set<number>;
}): PaperLockStatus {
  if (isAdmin) {
    return {
      isUnlocked: true,
      isCompleted: completedPaperNumbers.has(paperNumber),
      previousPaperNumber: paperNumber > 1 ? paperNumber - 1 : null,
      reason: "admin",
    };
  }

  // Paper 1 is always unlocked
  if (paperNumber <= 1) {
    return {
      isUnlocked: true,
      isCompleted: completedPaperNumbers.has(1),
      previousPaperNumber: null,
      reason: "first_paper",
    };
  }

  const prevPaper = paperNumber - 1;
  const isPrevCompleted = completedPaperNumbers.has(prevPaper);
  const isPrevAttempted = attemptedPaperNumbers.has(prevPaper);

  if (isPrevCompleted || isPrevAttempted) {
    return {
      isUnlocked: true,
      isCompleted: completedPaperNumbers.has(paperNumber),
      previousPaperNumber: prevPaper,
      reason: isPrevCompleted ? "previous_completed" : "previous_attempted",
    };
  }

  return {
    isUnlocked: false,
    isCompleted: false,
    previousPaperNumber: prevPaper,
    reason: "locked",
  };
}

