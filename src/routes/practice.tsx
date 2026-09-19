import { createFileRoute } from "@tanstack/react-router";
import { useApp } from "@/store/app-store";
import { useMemo, useState, useEffect } from "react";
import { QuizRunner } from "@/components/QuizRunner";
import { SavedQuizBanner } from "@/components/SavedQuizBanner";
import { Shuffle, AlertTriangle, RotateCcw, Bookmark, BookOpen, Hash, Loader2, ChevronDown } from "lucide-react";
import { buildSubjectGroups, getSubjectModelPapers } from "@/lib/model-papers";
import { getPracticeQuizMcqs, getPracticeModelPaperCounts } from "@/lib/db-actions";
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
  const solveLaterItems = useApp((s) => s.solveLaterItems);
  const savedQuiz = useApp((s) => s.savedQuiz);
  const [mode, setMode] = useState<Mode>("weak");
  const [selectedSubjectKey, setSelectedSubjectKey] = useState<string>("");
  const [selectedPaperNumber, setSelectedPaperNumber] = useState<string>("all");
  const [questionCount, setQuestionCount] = useState<number>(50);

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MCQ[]>([]);
  const [paperCounts, setPaperCounts] = useState<Record<number, number>>({});

  const { resume } = Route.useSearch();
  const [quizStarted, setQuizStarted] = useState(resume === true && !!savedQuiz);
  const [quizCompleted, setQuizCompleted] = useState(false);

  // If resuming on mount, ensure quizStarted is active and mode is matched from saved quiz
  useEffect(() => {
    if (resume && savedQuiz) {
      setQuizStarted(true);
      const lowerMode = savedQuiz.mode?.toLowerCase() || "";
      if (lowerMode.includes("weak")) setMode("weak");
      else if (lowerMode.includes("wrong")) setMode("wrong");
      else if (lowerMode.includes("solve") || lowerMode.includes("later")) setMode("solve_later");
      else setMode("weak");
    }
  }, [resume]);

  // All subtopics & canonical subject groups
  const subtopics = useMemo(() => subjects.filter((s) => !!s.parentId), [subjects]);
  const subjectGroups = useMemo(() => buildSubjectGroups(subtopics), [subtopics]);

  // Set default subject if not set and subjects are available
  useEffect(() => {
    if (!selectedSubjectKey && subjectGroups.length > 0) {
      setSelectedSubjectKey(subjectGroups[0].key);
    }
  }, [subjectGroups, selectedSubjectKey]);

  // Filtered counts calculation for subjects in Weak / Wrong / Solve Later modes
  const subjectGroupsWithCount = useMemo(() => {
    if (mode === "random") {
      return subjectGroups.map((g) => ({ ...g, filteredCount: g.totalMcqs }));
    }

    const statsByMcq: Record<string, { subjectId: string; total: number; wrong: number; lastCorrect?: boolean; lastAt: number }> = {};
    for (const a of attempts) {
      if (!statsByMcq[a.mcqId]) {
        statsByMcq[a.mcqId] = { subjectId: a.subjectId, total: 0, wrong: 0, lastAt: 0 };
      }
      const item = statsByMcq[a.mcqId];
      item.total += 1;
      if (!a.correct) {
        item.wrong += 1;
      }
      if (a.at >= item.lastAt) {
        item.lastAt = a.at;
        item.lastCorrect = a.correct;
      }
    }

    return subjectGroups.map((g) => {
      const groupSubtopicSet = new Set(g.subtopicIds);
      let count = 0;

      if (mode === "weak") {
        for (const s of Object.values(statsByMcq)) {
          if (groupSubtopicSet.has(s.subjectId) && s.wrong >= Math.max(1, Math.floor(s.total / 2))) {
            count++;
          }
        }
      } else if (mode === "wrong") {
        for (const s of Object.values(statsByMcq)) {
          if (groupSubtopicSet.has(s.subjectId) && s.lastCorrect === false) {
            count++;
          }
        }
      } else if (mode === "solve_later") {
        const uniqueMcqIdsInGroup = new Set<string>();
        for (const item of solveLaterItems) {
          if (groupSubtopicSet.has(item.subjectId)) {
            uniqueMcqIdsInGroup.add(item.mcqId);
          }
        }
        count = uniqueMcqIdsInGroup.size;
      }

      return {
        ...g,
        filteredCount: count,
      };
    });
  }, [subjectGroups, attempts, mode, solveLaterItems]);

  // Selected subtopic IDs
  const activeSubtopicIds = useMemo(() => {
    if (!selectedSubjectKey) return [];
    const activeGroup = subjectGroups.find((g) => g.key === selectedSubjectKey);
    return activeGroup?.subtopicIds || [];
  }, [selectedSubjectKey, subjectGroups]);

  // Fetch exact per-model-paper counts when a specific subject is selected
  useEffect(() => {
    if (!selectedSubjectKey || activeSubtopicIds.length === 0) {
      setPaperCounts({});
      return;
    }

    let cancelled = false;
    getPracticeModelPaperCounts({
      data: {
        mode,
        subjectKey: selectedSubjectKey,
        subtopicIds: activeSubtopicIds,
      },
    })
      .then((counts) => {
        if (!cancelled) {
          setPaperCounts(counts || {});
        }
      })
      .catch((err) => {
        console.error("Failed to load model paper counts:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, selectedSubjectKey, activeSubtopicIds, attempts]);

  // Model papers for selected subject
  const modelPapers = useMemo(() => {
    if (!selectedSubjectKey) return [];
    const activeGroup = subjectGroups.find((g) => g.key === selectedSubjectKey);
    const totalCount = activeGroup?.totalMcqs || 0;
    const basePapers = getSubjectModelPapers(selectedSubjectKey, subtopics, totalCount, attempts, 100);

    // Attach exact counts and filter out papers with 0 matching questions
    return basePapers
      .map((p) => ({
        ...p,
        filteredCount: paperCounts[p.paperNumber] ?? 0,
      }))
      .filter((p) => p.filteredCount && p.filteredCount > 0);
  }, [selectedSubjectKey, subtopics, subjectGroups, attempts, mode, paperCounts]);

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
  }, [mode, selectedSubjectKey, activeSubtopicIds, selectedPaperNumber, questionCount, attempts]);

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

  const modeName = mode === "weak" ? "Weak Questions" : mode === "wrong" ? "Wrong Retry" : "Solve Later";
  const paperLabel = selectedPaperNumber === "all" ? "All Papers" : `Paper ${selectedPaperNumber}`;
  const resolvedPracticeTitle = `${subjectLabel} · ${modeName}${selectedPaperNumber !== "all" ? ` (${paperLabel})` : ""}`;
  const practiceUniqueKey = `practice_${selectedSubjectKey}_${selectedPaperNumber}_${mode}`;

  return (
    <div className="space-y-6">
      {!quizCompleted && (
        <div>
          <div className="text-xs font-semibold text-primary uppercase tracking-wider">
            {modeName}
          </div>
          <h1 className="text-2xl sm:text-3xl font-display">{subjectLabel}</h1>
          {!quizStarted && (
            <p className="text-muted-foreground mt-1">Mix it up — sharpen weak areas or replay wrong answers.</p>
          )}
        </div>
      )}

      {/* Resume Banner displayed above mode options */}
      <div className="max-w-xl">
        {!quizStarted && <SavedQuizBanner />}
      </div>

      {/* Mode selection buttons (hidden while practicing) */}
      {!quizStarted && (
        <div className="flex overflow-x-auto whitespace-nowrap pb-2 scrollbar-none sm:flex-wrap gap-2">
          <ModeBtn icon={<AlertTriangle className="size-4 shrink-0" />} active={mode === "weak"} onClick={() => handleModeChange("weak")}>Weak</ModeBtn>
          <ModeBtn icon={<RotateCcw className="size-4 shrink-0" />} active={mode === "wrong"} onClick={() => handleModeChange("wrong")}>Wrong retry</ModeBtn>
          <ModeBtn icon={<Bookmark className="size-4 shrink-0" />} active={mode === "solve_later"} onClick={() => handleModeChange("solve_later")}>Solve Later</ModeBtn>
        </div>
      )}

      {!quizStarted && (
        <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-card max-w-xl">
          <div className="grid gap-3 sm:gap-4 grid-cols-2">
            {/* Subject Selection */}
            <label className={`flex flex-col gap-2.5 ${modelPapers.length === 0 ? "col-span-2" : ""}`}>
              <div className="flex items-center gap-2.5">
                <BookOpen className="size-4 text-primary" />
                <div className="text-xs sm:text-sm font-medium">Subject</div>
              </div>
              <select
                value={selectedSubjectKey}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="w-full rounded-lg bg-secondary/40 border border-border px-3 py-[9px] sm:py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {subjectGroupsWithCount.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label} ({(g.filteredCount ?? g.totalMcqs).toLocaleString()})
                  </option>
                ))}
              </select>
            </label>

            {/* Paper Selection — only for weak/wrong/solve_later modes */}
            {selectedSubjectKey && modelPapers.length > 0 && (
              <label className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  <BookOpen className="size-4 text-primary" />
                  <div className="text-xs sm:text-sm font-medium">Paper</div>
                </div>
                <select
                  value={selectedPaperNumber}
                  onChange={(e) => setSelectedPaperNumber(e.target.value)}
                  className="w-full rounded-lg bg-secondary/40 border border-border px-3 py-[9px] sm:py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All Papers</option>
                  {modelPapers.map((p) => (
                    <option key={p.paperNumber} value={p.paperNumber}>
                      {p.name} {p.filteredCount !== undefined ? `(${p.filteredCount})` : `(${p.totalMcqs})`}
                    </option>
                  ))}
                </select>
              </label>
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
        title={selectedPaperNumber === "all" ? "All questions" : `Paper ${selectedPaperNumber}`}
        subtitle=""
        resultSubtitle={`${subjectLabel} · ${modeName}`}
        emptyText="No questions match this mode yet."
        onStart={() => setQuizStarted(true)}
        onReset={() => {
          setQuizStarted(false);
          setQuizCompleted(false);
        }}
        onComplete={setQuizCompleted}
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
