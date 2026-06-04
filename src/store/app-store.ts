import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MCQ, Subject, AttemptLog } from "@/lib/types";

interface State {
  subjects: Subject[];
  mcqs: MCQ[];
  attempts: AttemptLog[];
  addSubject: (name: string) => Subject;
  renameSubject: (id: string, name: string) => void;
  deleteSubject: (id: string) => void;
  addMCQs: (subjectId: string, items: Omit<MCQ, "id" | "subjectId" | "attemptCount" | "wrongCount" | "solveLater" | "createdAt">[]) => number;
  toggleSolveLater: (id: string) => void;
  recordAttempt: (mcqId: string, selected: "A" | "B" | "C" | "D") => boolean;
  deleteMCQ: (id: string) => void;
  clearAttempts: () => void;
}

const uid = () => Math.random().toString(36).slice(2, 11);

function normalize(q: string) {
  return q.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}

export const useApp = create<State>()(
  persist(
    (set, get) => ({
      subjects: [],
      mcqs: [],
      attempts: [],
      addSubject: (name) => {
        const s: Subject = { id: uid(), name: name.trim(), createdAt: Date.now() };
        set((st) => ({ subjects: [...st.subjects, s] }));
        return s;
      },
      renameSubject: (id, name) =>
        set((st) => ({ subjects: st.subjects.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)) })),
      deleteSubject: (id) =>
        set((st) => ({
          subjects: st.subjects.filter((s) => s.id !== id),
          mcqs: st.mcqs.filter((m) => m.subjectId !== id),
          attempts: st.attempts.filter((a) => a.subjectId !== id),
        })),
      addMCQs: (subjectId, items) => {
        const existing = new Set(get().mcqs.filter((m) => m.subjectId === subjectId).map((m) => normalize(m.question)));
        const fresh: MCQ[] = [];
        for (const it of items) {
          const key = normalize(it.question);
          if (!key || existing.has(key)) continue;
          existing.add(key);
          fresh.push({
            id: uid(),
            subjectId,
            attemptCount: 0,
            wrongCount: 0,
            solveLater: false,
            createdAt: Date.now(),
            ...it,
          });
        }
        if (fresh.length) set((st) => ({ mcqs: [...st.mcqs, ...fresh] }));
        return fresh.length;
      },
      toggleSolveLater: (id) =>
        set((st) => ({ mcqs: st.mcqs.map((m) => (m.id === id ? { ...m, solveLater: !m.solveLater } : m)) })),
      recordAttempt: (mcqId, selected) => {
        const m = get().mcqs.find((x) => x.id === mcqId);
        if (!m) return false;
        const correct = m.correct === selected;
        set((st) => ({
          mcqs: st.mcqs.map((x) =>
            x.id === mcqId
              ? { ...x, attemptCount: x.attemptCount + 1, wrongCount: x.wrongCount + (correct ? 0 : 1), lastAttemptCorrect: correct }
              : x,
          ),
          attempts: [
            ...st.attempts,
            { id: uid(), mcqId, subjectId: m.subjectId, selected, correct, at: Date.now() },
          ],
        }));
        return correct;
      },
      deleteMCQ: (id) =>
        set((st) => ({ mcqs: st.mcqs.filter((m) => m.id !== id), attempts: st.attempts.filter((a) => a.mcqId !== id) })),
      clearAttempts: () => set({ attempts: [] }),
    }),
    { name: "mcq-prep-v1" },
  ),
);
