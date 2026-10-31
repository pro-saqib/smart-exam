import type { MCQ, Subject, AttemptLog, PaperLockStatus } from "@/lib/types";

// Canonical subject keywords — ordered per display preference
export const SUBJECT_KEYWORDS: { key: string; label: string; patterns: RegExp[]; parentId?: string; namedPapers?: boolean }[] = [
  { key: "english",       label: "English",          patterns: [], parentId: "top_english", namedPapers: true },
  { key: "islamic",       label: "Islamiat",         patterns: [], parentId: "top_islamic", namedPapers: true },
  { key: "gk",            label: "G.K",              patterns: [], parentId: "top_gk",      namedPapers: true },
  { key: "computer",      label: "Computer",         patterns: [], parentId: "top_computer", namedPapers: true },
  { key: "pakistan-study", label: "P.St",            patterns: [], parentId: "top_pakistan_study", namedPapers: true },
  { key: "everyday-science", label: "E.D.S",         patterns: [], parentId: "top_everyday_science", namedPapers: true },
  { key: "urdu",          label: "Urdu",             patterns: [], parentId: "top_urdu",    namedPapers: true },
  { key: "pak-affairs",   label: "Pak Affairs",      patterns: [], parentId: "top_pak_affairs", namedPapers: true },
  { key: "international-affairs", label: "Int. Affairs", patterns: [], parentId: "top_international_affairs", namedPapers: true },
  { key: "is-english",          label: "IS English",   patterns: [], parentId: "is_english" },
  { key: "is-gk",               label: "IS G.K",       patterns: [], parentId: "is_gk" },
  { key: "is-pakistan-study",   label: "IS P.St",      patterns: [], parentId: "is_pakistan_study" },
  { key: "is-everyday-science", label: "IS E.D.S",     patterns: [], parentId: "is_everyday_science" },
  { key: "is-islamic-study",    label: "IS Islamiat",  patterns: [], parentId: "is_islamic_study" },
  { key: "is-computer",         label: "IS Computer",  patterns: [], parentId: "is_computer" },
  { key: "is-geography",        label: "IS Geography", patterns: [], parentId: "is_geography" },
  { key: "is-current-affairs",  label: "IS C.A",       patterns: [], parentId: "is_current_affairs" },
  { key: "is-urdu",             label: "IS Urdu",      patterns: [/\burdu\b/i], parentId: "is_urdu" },
  { key: "is-mathematics",       label: "IS Maths",     patterns: [/math/i], parentId: "is_mathematics" },
  { key: "basic-mathematics", label: "Maths",            patterns: [/basic.math/i] },
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
  /** For named-papers mode: local page index within the subtopic (1-based). Used for correct offset calculation. */
  subtopicPage?: number;
}

export function getSubjectGroup(subtopicName: string, subtopicParentId?: string): { key: string; label: string } | null {
  for (const subject of SUBJECT_KEYWORDS) {
    // Match by parentId first (exact group membership)
    if (subject.parentId && subtopicParentId && subject.parentId === subtopicParentId) {
      return { key: subject.key, label: subject.label };
    }
    // Match by name pattern
    if (subject.patterns.length > 0 && subject.patterns.some((p) => p.test(subtopicName))) {
      return { key: subject.key, label: subject.label };
    }
  }
  return null;
}

let lastSubtopicsRef: Subject[] | null = null;
let lastMcqsLength = -1;
let lastGroupsCache: SubjectGroup[] = [];

/** Group subjects by canonical subject name. Returns groups in canonical order (memoized). */
export function buildSubjectGroups(subjects: Subject[], mcqs?: MCQ[]): SubjectGroup[] {
  const groupMap = new Map<string, SubjectGroup>();

  for (const s of subjects) {
    // Determine the canonical group for this subject.
    // IS subjects now have no subtopics (they are the subject).
    // The previous logic assumed only subjects with parentId should be grouped.

    // Updated logic:
    // 1. If s.parentId is set, the group is parentId.
    // 2. If s.parentId is null, the group is s.id itself (for IS parents).
    const group = getSubjectGroup(s.name, s.parentId);
    if (!group) continue;

    if (!groupMap.has(group.key)) {
      groupMap.set(group.key, { key: group.key, label: group.label, subtopicIds: [], totalMcqs: 0 });
    }
    const current = groupMap.get(group.key)!;

    // Add this subject ID as a source of MCQs
    current.subtopicIds.push(s.id);
    current.totalMcqs += s.totalMcqs || 0;
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
      const g = getSubjectGroup(s.name, s.parentId);
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

  const canonicalConfig = SUBJECT_KEYWORDS.find((sk) => sk.key === groupKey);
  const useNamedPapers = canonicalConfig?.namedPapers === true;

  const groupSubtopics = subtopics
    .filter((s) => {
      const g = getSubjectGroup(s.name, s.parentId);
      return g?.key === groupKey;
    })
    .sort((a, b) => a.name.localeCompare(b.name)); // Alphabetical sorting matching quiz route

  const groupSubtopicIds = groupSubtopics.map((s) => s.id);
  const groupSubtopicSet = new Set(groupSubtopicIds);
  const relevantAttempts = attempts.filter((a) => groupSubtopicSet.has(a.subjectId));
  const overallAccuracy = relevantAttempts.length > 0
    ? Math.round((relevantAttempts.filter((a) => a.correct).length / relevantAttempts.length) * 100)
    : 0;

  if (useNamedPapers) {
    // Generate per-subtopic named papers: "Antonyms 1", "Antonyms 2", etc.
    const papers: ModelPaper[] = [];

    for (const sub of groupSubtopics) {
      const subTotal = sub.totalMcqs || 0;
      if (subTotal === 0) continue;
      const subPapers = Math.ceil(subTotal / batchSize);
      const subAttempts = relevantAttempts.filter((a) => a.subjectId === sub.id);
      const subAccuracy = subAttempts.length > 0
        ? Math.round((subAttempts.filter((a) => a.correct).length / subAttempts.length) * 100)
        : 0;

      for (let i = 0; i < subPapers; i++) {
        const isLast = i === subPapers - 1;
        const paperMcqsCount = isLast ? subTotal - i * batchSize : batchSize;
        const label = subPapers === 1 ? sub.name : `${sub.name} — ${i + 1}`;
        papers.push({
          paperNumber: i + 1,
          name: label,
          mcqs: [],
          totalMcqs: paperMcqsCount,
          attemptedCount: 0,
          accuracy: subAccuracy,
          subtopicIds: [sub.id],
          subtopicPage: i + 1,
          subtopicId: sub.id,
        });
      }
    }

    return papers;
  }

  // Default: flat pool chunked into "1, 2, ..." or "Subject Label — 1, Subject Label — 2" for IS
  const papers: ModelPaper[] = [];
  const totalPapers = Math.ceil(totalMcqsCount / batchSize);
  const isImtiazShahid = groupKey.startsWith("is-");

  for (let i = 0; i < totalPapers; i++) {
    const isLast = i === totalPapers - 1;
    const paperMcqsCount = isLast ? totalMcqsCount - i * batchSize : batchSize;
    const paperName = isImtiazShahid && canonicalConfig
      ? `${canonicalConfig.label} — ${i + 1}`
      : `${i + 1}`;

    papers.push({
      paperNumber: i + 1,
      name: paperName,
      mcqs: [],
      totalMcqs: paperMcqsCount,
      attemptedCount: 0,
      accuracy: overallAccuracy,
      subtopicIds: groupSubtopicIds,
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

  const canonicalConfig = SUBJECT_KEYWORDS.find((sk) => sk.key === groupKey);
  const isImtiazShahid = groupKey.startsWith("is-");
  const paperName = isImtiazShahid && canonicalConfig
    ? `${canonicalConfig.label} — ${safePaperNumber}`
    : `${safePaperNumber}`;

  const start = (safePaperNumber - 1) * batchSize;
  const chunk = subjectMcqs.slice(start, start + batchSize);

  return {
    name: paperName,
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

/** Map every MCQ ID belonging to a subject group to its 1-indexed model paper number */
export function getSubjectModelPaperMapping(
  groupKey: string,
  subtopics: Subject[],
  mcqIndex: { id: string; subjectId: string }[],
  batchSize = 100
): Map<string, number> {
  const canonicalConfig = SUBJECT_KEYWORDS.find((sk) => sk.key === groupKey);
  const useNamedPapers = canonicalConfig?.namedPapers === true;

  const groupSubtopics = subtopics
    .filter((s) => {
      const g = getSubjectGroup(s.name, s.parentId);
      return g?.key === groupKey;
    })
    .sort((a, b) => a.name.localeCompare(b.name)); // Must match getSubjectModelPapers alphabetical sort

  const mcqIdToPaperNumber = new Map<string, number>();

  if (useNamedPapers) {
    let globalPaperNumber = 1;
    for (const sub of groupSubtopics) {
      const subMcqs = mcqIndex.filter((m) => m.subjectId === sub.id).sort((a, b) => a.id.localeCompare(b.id));
      const subPapers = Math.ceil(subMcqs.length / batchSize) || (sub.totalMcqs > 0 ? Math.ceil(sub.totalMcqs / batchSize) : 0);

      for (let i = 0; i < subPapers; i++) {
        const start = i * batchSize;
        const end = start + batchSize;
        const chunk = subMcqs.slice(start, end);
        for (const m of chunk) {
          mcqIdToPaperNumber.set(m.id, globalPaperNumber);
        }
        globalPaperNumber++;
      }
    }
  } else {
    const groupSubtopicIds = new Set(groupSubtopics.map((s) => s.id));
    const groupMcqs = mcqIndex.filter((m) => groupSubtopicIds.has(m.subjectId));
    for (let i = 0; i < groupMcqs.length; i += batchSize) {
      const paperNum = Math.floor(i / batchSize) + 1;
      const chunk = groupMcqs.slice(i, i + batchSize);
      for (const m of chunk) {
        mcqIdToPaperNumber.set(m.id, paperNum);
      }
    }
  }

  return mcqIdToPaperNumber;
}


