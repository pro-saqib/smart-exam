import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MCQ, Subject, AttemptLog } from "@/lib/types";
import {
  dbAddSubject,
  dbRenameSubject,
  dbDeleteSubject,
  dbAddMCQs,
  dbToggleSolveLater,
  dbDeleteMCQ,
  dbRecordAttempt,
  dbClearAttempts,
  loadUserData,
  bootstrapUser,
} from "@/lib/db-actions";

export interface SavedQuiz {
  mode: string;
  routePath?: string;
  routeParams?: Record<string, string>;
  routeSearch?: Record<string, unknown>;
  subjectId: string;
  subjectName: string;
  currentIndex: number;
  order: string[];
  items: string[];
  score: { correct: number; wrong: number };
  retryQueue: string[];
  elapsed: number;
  startTs: number;
  timeLimitMin: number;
  shuffleOptions: boolean;
  shuffleQuestions: boolean;
  userId?: string;
}

interface State {
  subjects: Subject[];
  mcqs: MCQ[];
  attempts: AttemptLog[];
  savedQuiz: SavedQuiz | null;
  currentUserId: string | null;
  hydrateFromDb: () => Promise<void>;
  addSubject: (name: string, parentId?: string) => Promise<Subject>;
  renameSubject: (id: string, name: string) => Promise<void>;
  deleteSubject: (id: string) => Promise<void>;
  addMCQs: (subjectId: string, items: Omit<MCQ, "id" | "subjectId" | "attemptCount" | "wrongCount" | "solveLater" | "createdAt">[]) => Promise<number>;
  toggleSolveLater: (id: string, value?: boolean) => Promise<void>;
  recordAttempt: (
    mcqId: string,
    selected: "A" | "B" | "C" | "D" | "E",
    options?: { correct?: boolean; subjectId?: string },
  ) => Promise<boolean>;
  deleteMCQ: (id: string) => Promise<void>;
  clearAttempts: () => Promise<void>;
  saveQuiz: (quiz: SavedQuiz) => void;
  clearSavedQuiz: () => void;
}

const uid = () => Math.random().toString(36).slice(2, 11);

function normalize(q: string) {
  return q.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}

export const INITIAL_SUBJECTS: Subject[] = [];

export const useApp = create<State>()(
  persist(
    (set, get) => ({
      subjects: INITIAL_SUBJECTS,
      mcqs: [],
      attempts: [],
      savedQuiz: null,
      currentUserId: null,

      hydrateFromDb: async () => {
        try {
          await bootstrapUser();
          const data = await loadUserData();
          const initialIds = new Set(INITIAL_SUBJECTS.map((s) => s.id));
          const dbSubjects = data.subjects.filter((s) => !initialIds.has(s.id));
          // Clear saved quiz if it belongs to a different user or has no userId
          const currentSavedQuiz = get().savedQuiz;
          const userId = data.userId;
          const savedQuizToKeep =
            currentSavedQuiz && currentSavedQuiz.userId === userId
              ? currentSavedQuiz
              : null;
          set({
            subjects: [...INITIAL_SUBJECTS, ...dbSubjects],
            mcqs: data.mcqs,
            attempts: data.attempts,
            savedQuiz: savedQuizToKeep,
            currentUserId: userId,
          });
        } catch (err) {
          console.error("Failed to hydrate from DB:", err);
        }
      },

      addSubject: async (name, parentId) => {
        const s: Subject = { id: uid(), name: name.trim(), parentId, createdAt: Date.now() };
        set((st) => ({ subjects: [...st.subjects, s] }));
        try {
          await dbAddSubject({ data: { id: s.id, name: s.name, parentId } });
        } catch (err) {
          set((st) => ({ subjects: st.subjects.filter((x) => x.id !== s.id) }));
          throw err;
        }
        return s;
      },

      renameSubject: async (id, name) => {
        const prev = get().subjects;
        set((st) => ({ subjects: st.subjects.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)) }));
        try {
          await dbRenameSubject({ data: { id, name } });
        } catch (err) {
          set({ subjects: prev });
          throw err;
        }
      },

      deleteSubject: async (id) => {
        const prev = { subjects: get().subjects, mcqs: get().mcqs, attempts: get().attempts };
        const childrenIds = get().subjects.filter((s) => s.parentId === id).map((s) => s.id);
        const idsToDelete = new Set([id, ...childrenIds]);
        set((st) => ({
          subjects: st.subjects.filter((s) => !idsToDelete.has(s.id)),
          mcqs: st.mcqs.filter((m) => !idsToDelete.has(m.subjectId)),
          attempts: st.attempts.filter((a) => !idsToDelete.has(a.subjectId)),
        }));
        try {
          await dbDeleteSubject({ data: { id } });
        } catch (err) {
          set(prev);
          throw err;
        }
      },

      addMCQs: async (subjectId, items) => {
        const existing = new Set(
          get().mcqs.filter((m) => m.subjectId === subjectId).map((m) => normalize(m.question))
        );
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
        if (!fresh.length) return 0;

        set((st) => ({ mcqs: [...st.mcqs, ...fresh] }));
        try {
          await dbAddMCQs({
            data: {
              subjectId,
              items: fresh.map((m) => ({
                id: m.id,
                question: m.question,
                options: m.options,
                correct: m.correct,
                explanation: m.explanation,
              })),
            },
          });
        } catch (err) {
          const freshIds = new Set(fresh.map((m) => m.id));
          set((st) => ({ mcqs: st.mcqs.filter((m) => !freshIds.has(m.id)) }));
          throw err;
        }
        return fresh.length;
      },

      toggleSolveLater: async (id, explicitValue) => {
        const prev = get().mcqs;
        const m = prev.find((x) => x.id === id);
        const newVal = explicitValue !== undefined ? explicitValue : (m ? !m.solveLater : true);
        if (m) {
          set((st) => ({ mcqs: st.mcqs.map((x) => (x.id === id ? { ...x, solveLater: newVal } : x)) }));
        }
        try {
          await dbToggleSolveLater({ data: { id, value: newVal } });
        } catch (err) {
          if (m) set({ mcqs: prev });
          throw err;
        }
      },

      recordAttempt: async (mcqId, selected, options) => {
        const m = get().mcqs.find((x) => x.id === mcqId);
        const correct = options?.correct !== undefined ? options.correct : (m ? m.correct === selected : false);
        const subjectId = options?.subjectId || m?.subjectId || "";
        const newAttemptCount = (m?.attemptCount || 0) + 1;
        const newWrongCount = (m?.wrongCount || 0) + (correct ? 0 : 1);
        const log: AttemptLog = {
          id: uid(),
          mcqId,
          subjectId,
          selected,
          correct,
          at: Date.now(),
        };
        set((st) => ({
          mcqs: m
            ? st.mcqs.map((x) =>
                x.id === mcqId
                  ? { ...x, attemptCount: newAttemptCount, wrongCount: newWrongCount, lastAttemptCorrect: correct }
                  : x,
              )
            : st.mcqs,
          attempts: [...st.attempts, log],
        }));
        try {
          await dbRecordAttempt({
            data: {
              id: log.id,
              mcqId,
              subjectId,
              selected,
              correct,
              at: log.at,
            },
          });
        } catch (err) {
          console.error("Failed to persist attempt:", err);
          // Don't rollback — quiz UX would be jarring
        }
        return correct;
      },

      deleteMCQ: async (id) => {
        const prev = { mcqs: get().mcqs, attempts: get().attempts };
        set((st) => ({
          mcqs: st.mcqs.filter((m) => m.id !== id),
          attempts: st.attempts.filter((a) => a.mcqId !== id),
        }));
        try {
          await dbDeleteMCQ({ data: { id } });
        } catch (err) {
          set(prev);
          throw err;
        }
      },

      clearAttempts: async () => {
        const prev = { mcqs: get().mcqs, attempts: get().attempts };
        set((st) => ({
          attempts: [],
          mcqs: st.mcqs.map((m) => ({ ...m, attemptCount: 0, wrongCount: 0, lastAttemptCorrect: undefined })),
        }));
        try {
          await dbClearAttempts();
        } catch (err) {
          set(prev);
          throw err;
        }
      },

      saveQuiz: (quiz) => set({ savedQuiz: { ...quiz, userId: get().currentUserId ?? quiz.userId ?? undefined } }),
      clearSavedQuiz: () => set({ savedQuiz: null }),
    }),
    {
      name: "mcq-prep-v1",
      // Only persist lightweight state to avoid exceeding the 5MB localStorage quota
      partialize: (state) => ({
        savedQuiz: state.savedQuiz,
      }),
    },
  ),
);
