import type { MCQ, Subject, AttemptLog } from "@/lib/types";

// Canonical subject keywords — ordered per display preference
export const SUBJECT_KEYWORDS: { key: string; label: string; patterns: RegExp[] }[] = [
  { key: "english",           label: "English",            patterns: [/\benglish\b/i] },
  { key: "general-knowledge",label: "General Knowledge", patterns: [/general.knowledge/i] },
  { key: "geography",        label: "Geography",          patterns: [/geography/i] },
  { key: "pakistan-study",   label: "Pakistan Study",     patterns: [/pak.stud/i, /pakistan.stud/i] },
  { key: "computer",          label: "Computer",          patterns: [/computer/i] },
  { key: "everyday-science", label: "Everyday Science",  patterns: [/everyday.science/i] },
  { key: "current-affairs",  label: "Current Affairs",   patterns: [/current.affairs/i] },
  { key: "basic-mathematics", label: "Basic Mathematics", patterns: [/basic.math/i] },
  { key: "islamic-study",    label: "Islamic Study",      patterns: [/islamic/i] },
  { key: "urdu",             label: "Urdu",               patterns: [/\burdu\b/i] },
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

/** Group child subtopics by canonical subject name. Returns groups in canonical order. */
export function buildSubjectGroups(subtopics: Subject[], mcqs: MCQ[]): SubjectGroup[] {
  const groupMap = new Map<string, SubjectGroup>();

  for (const sub of subtopics) {
    const group = getSubjectGroup(sub.name);
    if (!group) continue;
    if (!groupMap.has(group.key)) {
      groupMap.set(group.key, { key: group.key, label: group.label, subtopicIds: [], totalMcqs: 0 });
    }
    groupMap.get(group.key)!.subtopicIds.push(sub.id);
  }

  for (const group of groupMap.values()) {
    group.totalMcqs = mcqs.filter((m) => group.subtopicIds.includes(m.subjectId)).length;
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
  allMcqs: MCQ[],
  attempts: AttemptLog[],
  batchSize = 100
): ModelPaper[] {
  const subjectMcqs = getSubjectAllMcqs(groupKey, subtopics, allMcqs);
  if (!subjectMcqs.length) return [];

  const groupSubtopics = subtopics
    .filter((s) => {
      const g = getSubjectGroup(s.name);
      return g?.key === groupKey;
    })
    .map((s) => s.id);

  const papers: ModelPaper[] = [];
  const totalPapers = Math.ceil(subjectMcqs.length / batchSize);

  for (let i = 0; i < totalPapers; i++) {
    const start = i * batchSize;
    const chunk = subjectMcqs.slice(start, start + batchSize);
    const chunkIds = new Set(chunk.map((m) => m.id));

    // Calculate attempt metrics for this specific batch
    const chunkAttempts = attempts.filter((a) => chunkIds.has(a.mcqId));
    const attemptedCount = new Set(chunkAttempts.map((a) => a.mcqId)).size;
    const accuracy = chunkAttempts.length > 0
      ? Math.round((chunkAttempts.filter((a) => a.correct).length / chunkAttempts.length) * 100)
      : 0;

    papers.push({
      paperNumber: i + 1,
      name: `Model Paper ${i + 1}`,
      mcqs: chunk,
      totalMcqs: chunk.length,
      attemptedCount,
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
    name: `Model Paper ${safePaperNumber}`,
    mcqs: chunk,
    paperNumber: safePaperNumber,
    totalPapers,
  };
}
