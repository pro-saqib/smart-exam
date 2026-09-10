import { createFileRoute } from "@tanstack/react-router";
import { useApp } from "@/store/app-store";
import { useMemo, useState, useEffect } from "react";
import { QuizRunner } from "@/components/QuizRunner";
import { SavedQuizBanner } from "@/components/SavedQuizBanner";
import { Shuffle, AlertTriangle, RotateCcw, Bookmark, BookOpen, Hash, Loader2 } from "lucide-react";
import { buildSubjectGroups, getSubjectModelPapers } from "@/lib/model-papers";
import { getPracticeQuizMcqs } from "@/lib/db-actions";
import type { MCQ } from "@/lib/types";

export const Route = createFileRoute("/practice")({
  validateSearch: (search: Record<string, unknown>) => ({
    resume: search.resume === true || search.resume === "true",
  }),
  head: () => ({
    meta: [
      { title: "Practice — PrepMind" },
      { name: "description", content: "Random practice, weak-question mode, wrong-answer retry, and solve-later across all subjects." },
    ],
  }),
  component: PracticePage,
});

type Mode = "random" | "weak" | "wrong" | "solve_later";

function PracticePage() {
  const subjects = useApp((s) => s.subjects);
  const attempts = useApp((s) => s.attempts);
  const savedQuiz = useApp((s) => s.savedQuiz);
  const [mode, setMode] = useState<Mode>("random");
  const [selectedSubjectKey, setSelectedSubjectKey] = useState<string>("all");
  const [selectedPaperNumber, setSelectedPaperNumber] = useState<string>("all");
  const [questionCount, setQuestionCount] = useState<number>(50);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MCQ[]>([]);

  const { resume } = Route.useSearch();
  const [quizStarted, setQuizStarted] = useState(resume === true && !!savedQuiz);

  // If resuming on mount, ensure quizStarted is active and mode is matched from saved quiz
  useEffect(() => {
    if (resume && savedQuiz) {
      setQuizStarted(true);
      const lowerMode = savedQuiz.mode?.toLowerCase() || "";
      if (lowerMode.includes("weak")) setMode("weak");
      else if (lowerMode.includes("wrong")) setMode("wrong");
      else if (lowerMode.includes("solve") || lowerMode.includes("later")) setMode("solve_later");
      else setMode("random");
    }
  }, [resume]);

  // All subtopics & canonical subject groups
  const subtopics = useMemo(() => subjects.filter((s) => !!s.parentId), [subjects]);
  const subjectGroups = useMemo(() => buildSubjectGroups(subtopics), [subtopics]);

  // Per-group filtered counts for non-random modes computed purely in memory (0 server requests)
  const subjectGroupsWithCount = useMemo(() => {
    if (mode === "random") {
      return subjectGroups.map((g) => ({ ...g, filteredCount: g.totalMcqs }));
    }

    // Weak: distinct mcqs where wrongCount >= max(1, floor(attempts / 2))
    // Wrong: distinct mcqs where most recent attempt was incorrect
    const statsByMcq: Record<string, { subjectId: string; total: number; wrong: number; lastCorrect: boolean; lastAt: number }> = {};
    for (const a of attempts) {
      if (!statsByMcq[a.mcqId]) {
        statsByMcq[a.mcqId] = { subjectId: a.subjectId, total: 0, wrong: 0, lastCorrect: a.correct, lastAt: a.at };
      }
      const item = statsByMcq[a.mcqId];
      item.total += 1;
      if (!a.correct) item.wrong += 1;
      if (a.at >= item.lastAt) {
        item.lastCorrect = a.correct;
        item.lastAt = a.at;
      }
    }

    return subjectGroups.map((g) => {
      const groupSubtopicSet = new Set(g.subtopicIds);
      let count = 0;

      if (mode === "weak") {
        for (const s of Object.values(statsByMcq)) {
          if (groupSubtopicSet.has(s.subjectId)) {
            if (s.wrong >= Math.max(1, Math.floor(s.total / 2))) {
              count++;
            }
          }
        }
      } else if (mode === "wrong") {
        for (const s of Object.values(statsByMcq)) {
          if (groupSubtopicSet.has(s.subjectId) && !s.lastCorrect) {
            count++;
          }
        }
      } else if (mode === "solve_later") {
        // Count matching items currently loaded for solve_later or relevant attempts
        count = items.filter((m) => groupSubtopicSet.has(m.subjectId)).length;
      }

      return { ...g, filteredCount: count };
    });
  }, [subjectGroups, attempts, mode, items]);

  // Model papers for selected subject — with accurate filtered count
  const modelPapers = useMemo(() => {
    if (selectedSubjectKey === "all") return [];
    const activeGroup = subjectGroups.find((g) => g.key === selectedSubjectKey);
    const totalCount = activeGroup?.totalMcqs || 0;
    const basePapers = getSubjectModelPapers(selectedSubjectKey, subtopics, totalCount, attempts, 100);

    if (mode === "random") return basePapers;

    const activeGroupInfo = subjectGroupsWithCount.find((g) => g.key === selectedSubjectKey);
    const totalFiltered = activeGroupInfo?.filteredCount || 0;

    return basePapers.map((p) => {
      // If there are no filtered questions in this subject, paper count is 0
      if (totalFiltered === 0) return { ...p, filteredCount: 0 };
      // Distribute filtered count across papers or show matching count
      const paperFiltered = Math.min(p.totalMcqs, totalFiltered);
      return { ...p, filteredCount: paperFiltered };
    });
  }, [selectedSubjectKey, subtopics, subjectGroups, attempts, mode, subjectGroupsWithCount]);

  // Selected subtopic IDs
  const activeSubtopicIds = useMemo(() => {
    if (selectedSubjectKey === "all") return [];
    const activeGroup = subjectGroups.find((g) => g.key === selectedSubjectKey);
    return activeGroup?.subtopicIds || [];
  }, [selectedSubjectKey, subjectGroups]);

  // Fetch MCQs on demand from D1 whenever settings change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getPracticeQuizMcqs({
      data: {
        mode,
        subjectKey: selectedSubjectKey,
        subtopicIds: activeSubtopicIds,
        paperNumber: selectedPaperNumber,
        count: mode === "random" ? questionCount : 100,
      },
    })
      .then((data) => {
        if (!cancelled) {
          setItems(data as MCQ[]);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load practice questions:", err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, selectedSubjectKey, activeSubtopicIds, selectedPaperNumber, questionCount]);

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setSelectedPaperNumber("all");
  };

  const handleSubjectChange = (newSubjectKey: string) => {
    setSelectedSubjectKey(newSubjectKey);
    setSelectedPaperNumber("all");
  };

  const subjectLabel = useMemo(() => {
    if (selectedSubjectKey === "all") return "All Subjects";
    const group = subjectGroups.find((g) => g.key === selectedSubjectKey);
    return group?.label || "Subject";
  }, [selectedSubjectKey, subjectGroups]);

  const resolvedPracticeTitle = `${mode.toUpperCase()} Practice — ${subjectLabel}`;
  const practiceUniqueKey = `practice_${selectedSubjectKey}_${selectedPaperNumber}_${mode}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display">Practice</h1>
        <p className="text-muted-foreground mt-1">Mix it up — sharpen weak areas or replay wrong answers.</p>
      </div>

      {/* Resume Banner displayed above mode options */}
      <div className="max-w-xl">
        {!quizStarted && <SavedQuizBanner />}
      </div>

      {/* Mode selection buttons (disabled while practicing) */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        <ModeBtn icon={<Shuffle className="size-4 shrink-0" />} active={mode === "random"} disabled={quizStarted} onClick={() => handleModeChange("random")}>Random</ModeBtn>
        <ModeBtn icon={<AlertTriangle className="size-4 shrink-0" />} active={mode === "weak"} disabled={quizStarted} onClick={() => handleModeChange("weak")}>Weak</ModeBtn>
        <ModeBtn icon={<RotateCcw className="size-4 shrink-0" />} active={mode === "wrong"} disabled={quizStarted} onClick={() => handleModeChange("wrong")}>Wrong retry</ModeBtn>
        <ModeBtn icon={<Bookmark className="size-4 shrink-0" />} active={mode === "solve_later"} disabled={quizStarted} onClick={() => handleModeChange("solve_later")}>Solve Later</ModeBtn>
      </div>

      {!quizStarted && (
        <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-card max-w-xl">
          <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
            {/* Subject Selection */}
            <label className="flex flex-col gap-1.5 p-3 sm:p-4 rounded-xl border border-border bg-secondary/40 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <BookOpen className="size-4 text-primary" />
                <div className="text-xs sm:text-sm font-medium">Subject</div>
              </div>
              <select
                value={selectedSubjectKey}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="w-full rounded-lg bg-input/60 border border-border px-2.5 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All subjects</option>
                {subjectGroupsWithCount.map((g) => (
                  <option key={g.key} value={g.key}>{g.label} ({g.filteredCount.toLocaleString()})</option>
                ))}
              </select>
            </label>

            {/* Model Paper Selection — only for weak/wrong/solve_later modes */}
            {mode !== "random" && selectedSubjectKey !== "all" && modelPapers.length > 0 && (
              <label className="flex flex-col gap-1.5 p-3 sm:p-4 rounded-xl border border-border bg-secondary/40 cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <BookOpen className="size-4 text-primary" />
                  <div className="text-xs sm:text-sm font-medium">Model Paper</div>
                </div>
                <select
                  value={selectedPaperNumber}
                  onChange={(e) => setSelectedPaperNumber(e.target.value)}
                  className="w-full rounded-lg bg-input/60 border border-border px-2.5 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All Model Papers ({subjectGroupsWithCount.find((g) => g.key === selectedSubjectKey)?.filteredCount ?? 0})</option>
                  {modelPapers.map((p) => (
                    <option key={p.paperNumber} value={p.paperNumber}>
                      {p.name} {p.filteredCount !== undefined ? `(${p.filteredCount})` : `(${p.totalMcqs})`}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Question Count Selection (only for random mode) */}
            {mode === "random" && (
              <div className="p-3 sm:p-4 rounded-xl border border-border bg-secondary/40">
                <div className="flex items-center gap-2.5 mb-2 sm:mb-3">
                  <Hash className="size-4 text-primary" />
                  <div className="text-xs sm:text-sm font-medium">Questions</div>
                </div>
                <div className="flex gap-2">
                  {[50, 100].map((count) => (
                    <button
                      key={count}
                      onClick={() => setQuestionCount(count)}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs sm:text-sm border transition-all ${
                        questionCount === count
                          ? "gradient-primary text-primary-foreground border-transparent shadow-glow"
                          : "bg-card border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stats Summary */}
          <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border flex items-center justify-between">
            <div className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>Finding matching questions...</span>
                </>
              ) : (
                <>
                  <span>
                    Found <span className="font-medium text-foreground">{items.length}</span> questions
                    {mode === "weak" && " matching weak criteria"}
                    {mode === "wrong" && " that were answered incorrectly"}
                    {mode === "solve_later" && " bookmarked for later"}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <QuizRunner
        items={items}
        title={mode.toUpperCase()}
        emptyText="No questions match this mode yet."
        onStart={() => setQuizStarted(true)}
        onReset={() => setQuizStarted(false)}
        subjectId={practiceUniqueKey}
        subjectName={resolvedPracticeTitle}
        routePath="/practice"
        routeSearch={{ resume: true }}
        savedState={resume && savedQuiz ? savedQuiz : null}
      />
    </div>
  );
}

function ModeBtn({ icon, active, disabled, onClick, children }: { icon: React.ReactNode; active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center sm:justify-start gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium border transition-all ${
        active ? "gradient-primary text-primary-foreground border-transparent shadow-glow" : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60"
      } ${disabled ? "opacity-40 pointer-events-none" : ""}`}
    >
      {icon} <span className="truncate">{children}</span>
    </button>
  );
}
