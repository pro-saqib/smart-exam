import { createFileRoute } from "@tanstack/react-router";
import { useApp } from "@/store/app-store";
import { useMemo, useState, useEffect } from "react";
import { QuizRunner } from "@/components/QuizRunner";
import { SavedQuizBanner } from "@/components/SavedQuizBanner";
import { Shuffle, AlertTriangle, RotateCcw, Bookmark, BookOpen, Hash } from "lucide-react";
import { buildSubjectGroups, getSubjectModelPapers } from "@/lib/model-papers";

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
  const mcqs = useApp((s) => s.mcqs);
  const subjects = useApp((s) => s.subjects);
  const attempts = useApp((s) => s.attempts);
  const savedQuiz = useApp((s) => s.savedQuiz);
  const [mode, setMode] = useState<Mode>("random");
  const [selectedSubjectKey, setSelectedSubjectKey] = useState<string>("all");
  const [selectedPaperNumber, setSelectedPaperNumber] = useState<string>("all");
  const [questionCount, setQuestionCount] = useState<number>(50);

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
  const subjectGroups = useMemo(() => buildSubjectGroups(subtopics, mcqs), [subtopics, mcqs]);

  // Model papers for selected subject — with filtered count per active mode
  const modelPapers = useMemo(() => {
    if (selectedSubjectKey === "all") return [];
    const papers = getSubjectModelPapers(selectedSubjectKey, subtopics, mcqs, attempts, 100);
    return papers.map((p) => {
      const ids = new Set(p.mcqs.map((m) => m.id));
      const paperMcqs = mcqs.filter((m) => ids.has(m.id));
      let filteredCount = paperMcqs.length;
      if (mode === "weak") filteredCount = paperMcqs.filter((m) => m.wrongCount >= Math.max(1, Math.floor(m.attemptCount / 2))).length;
      else if (mode === "wrong") filteredCount = paperMcqs.filter((m) => m.lastAttemptCorrect === false).length;
      else if (mode === "solve_later") filteredCount = paperMcqs.filter((m) => m.solveLater === true).length;
      return { ...p, filteredCount };
    });
  }, [selectedSubjectKey, subtopics, mcqs, attempts, mode]);

  const [sessionSeed, setSessionSeed] = useState(0);

  const items = useMemo(() => {
    let pool: typeof mcqs;

    if (selectedSubjectKey === "all") {
      pool = mcqs;
    } else {
      const activeGroup = subjectGroups.find((g) => g.key === selectedSubjectKey);
      const subtopicIds = activeGroup?.subtopicIds || [];
      pool = mcqs.filter((m) => subtopicIds.includes(m.subjectId) || m.subjectId === selectedSubjectKey);

      // Filter by specific Model Paper if selected
      if (selectedPaperNumber !== "all") {
        const paperNum = Number(selectedPaperNumber);
        const start = (paperNum - 1) * 100;
        pool = pool.slice(start, start + 100);
      }
    }

    // For weak/wrong/solve_later modes, apply smart filters
    if (mode === "weak") {
      pool = pool.filter((m) => m.wrongCount >= Math.max(1, Math.floor(m.attemptCount / 2)));
    }
    if (mode === "wrong") {
      pool = pool.filter((m) => m.lastAttemptCorrect === false);
    }
    if (mode === "solve_later") {
      pool = pool.filter((m) => m.solveLater === true);
    }

    // For random mode, draw a random distribution across all subjects or the selected subject
    if (mode === "random") {
      if (selectedSubjectKey === "all" && subjectGroups.length > 0) {
        const perSubjectQuota = Math.floor(questionCount / subjectGroups.length);
        const selected: typeof mcqs = [];
        const usedIds = new Set<string>();

        // Pick proportional random MCQs from each of the canonical subject groups
        for (const group of subjectGroups) {
          const groupMcqs = pool.filter((m) => group.subtopicIds.includes(m.subjectId) || m.subjectId === group.key);
          const shuffledGroup = [...groupMcqs].sort(() => Math.random() - 0.5);
          const sample = shuffledGroup.slice(0, perSubjectQuota);
          for (const item of sample) {
            selected.push(item);
            usedIds.add(item.id);
          }
        }

        // Fill any remaining questions to reach questionCount from the rest of the pool
        const remainingPool = pool.filter((m) => !usedIds.has(m.id)).sort(() => Math.random() - 0.5);
        const remainingNeeded = Math.max(0, questionCount - selected.length);
        selected.push(...remainingPool.slice(0, remainingNeeded));

        return selected.sort(() => Math.random() - 0.5);
      }

      // Single subject random selection
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, questionCount);
    }

    return pool;
  }, [mcqs.length, sessionSeed, subjectGroups, mode, selectedSubjectKey, selectedPaperNumber, questionCount]);

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setSelectedPaperNumber("all");
    setSessionSeed((s) => s + 1);
  };

  const handleSubjectChange = (newSubjectKey: string) => {
    setSelectedSubjectKey(newSubjectKey);
    setSelectedPaperNumber("all");
    setSessionSeed((s) => s + 1);
  };

  // Per-group filtered counts for non-random modes (so dropdown shows relevant question count)
  const subjectGroupsWithCount = useMemo(() => {
    return subjectGroups.map((g) => {
      const groupPool = mcqs.filter((m) => g.subtopicIds.includes(m.subjectId) || m.subjectId === g.key);
      let count = groupPool.length;
      if (mode === "weak") count = groupPool.filter((m) => m.wrongCount >= Math.max(1, Math.floor(m.attemptCount / 2))).length;
      else if (mode === "wrong") count = groupPool.filter((m) => m.lastAttemptCorrect === false).length;
      else if (mode === "solve_later") count = groupPool.filter((m) => m.solveLater === true).length;
      return { ...g, filteredCount: count };
    });
  }, [subjectGroups, mcqs, mode]);

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
        <div className="rounded-2xl bg-card border border-border p-6 shadow-card max-w-xl">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {/* Subject Selection */}
            <label className="flex flex-col gap-2 p-4 rounded-xl border border-border bg-secondary/40 cursor-pointer">
              <div className="flex items-center gap-3">
                <BookOpen className="size-4 text-primary" />
                <div className="text-sm font-medium">Subject</div>
              </div>
              <select
                value={selectedSubjectKey}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="w-full rounded-lg bg-input/60 border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All subjects</option>
                {subjectGroupsWithCount.map((g) => (
                  <option key={g.key} value={g.key}>{g.label} ({g.filteredCount.toLocaleString()})</option>
                ))}
              </select>
            </label>

            {/* Model Paper Selection — only for weak/wrong/solve_later modes */}
            {mode !== "random" && selectedSubjectKey !== "all" && modelPapers.length > 0 && (
              <label className="flex flex-col gap-2 p-4 rounded-xl border border-border bg-secondary/40 cursor-pointer">
                <div className="flex items-center gap-3">
                  <BookOpen className="size-4 text-primary" />
                  <div className="text-sm font-medium">Model Paper</div>
                </div>
                <select
                  value={selectedPaperNumber}
                  onChange={(e) => setSelectedPaperNumber(e.target.value)}
                  className="w-full rounded-lg bg-input/60 border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all">All Model Papers</option>
                  {modelPapers.map((p) => (
                    <option key={p.paperNumber} value={p.paperNumber}>
                      {p.name} ({p.filteredCount})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Question Count Selection (only for random mode) */}
            {mode === "random" && (
              <div className="p-4 rounded-xl border border-border bg-secondary/40">
                <div className="flex items-center gap-3 mb-3">
                  <Hash className="size-4 text-primary" />
                  <div className="text-sm font-medium">Questions</div>
                </div>
                <div className="flex gap-2">
                  {[50, 100].map((count) => (
                    <button
                      key={count}
                      onClick={() => setQuestionCount(count)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-all ${
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
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-sm text-muted-foreground">
              Found <span className="font-medium text-foreground">{items.length}</span> questions
              {mode === "weak" && " matching weak criteria"}
              {mode === "wrong" && " that were answered incorrectly"}
              {mode === "solve_later" && " bookmarked for later"}
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
