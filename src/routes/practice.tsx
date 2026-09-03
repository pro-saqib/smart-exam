import { createFileRoute } from "@tanstack/react-router";
import { useApp } from "@/store/app-store";
import { useMemo, useState, useEffect } from "react";
import { QuizRunner } from "@/components/QuizRunner";
import { SavedQuizBanner } from "@/components/SavedQuizBanner";
import { Shuffle, AlertTriangle, RotateCcw, Bookmark, BookOpen, Hash } from "lucide-react";

export const Route = createFileRoute("/practice")({
  validateSearch: (search: Record<string, unknown>) => ({
    resume: !!search.resume,
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
  const savedQuiz = useApp((s) => s.savedQuiz);
  const [mode, setMode] = useState<Mode>("random");
  const [mainSubjectId, setMainSubjectId] = useState<string>("all");
  const [subtopicId, setSubtopicId] = useState<string>("all");
  const [questionCount, setQuestionCount] = useState<number>(50);

  const { resume } = Route.useSearch();
  const [quizStarted, setQuizStarted] = useState(resume === true);

  // Main subjects (no parentId)
  const mainSubjects = useMemo(() => subjects.filter((s) => !s.parentId), [subjects]);

  // Subtopics for selected main subject
  const subtopics = useMemo(() => {
    if (mainSubjectId === "all") return [];
    return subjects.filter((s) => s.parentId === mainSubjectId);
  }, [subjects, mainSubjectId]);

  const items = useMemo(() => {
    let pool: typeof mcqs;

    if (mainSubjectId === "all") {
      pool = mcqs;
    } else {
      // Get all subtopic IDs for this main subject
      const subtopicIds = subjects
        .filter((s) => s.parentId === mainSubjectId)
        .map((s) => s.id);
      // Include MCQs from main subject itself + all subtopics
      pool = mcqs.filter((m) => m.subjectId === mainSubjectId || subtopicIds.includes(m.subjectId));
    }

    // For weak/wrong/solve_later modes, further filter by subtopic if selected
    if (mode === "weak") {
      pool = pool.filter((m) => m.wrongCount >= Math.max(1, Math.floor(m.attemptCount / 2)));
    }
    if (mode === "wrong") {
      pool = pool.filter((m) => m.lastAttemptCorrect === false);
    }
    if (mode === "solve_later") {
      pool = pool.filter((m) => m.solveLater === true);
    }

    // For random mode, apply question count limit
    if (mode === "random") {
      return pool.slice(0, questionCount);
    }

    return pool;
  }, [mcqs, subjects, mode, mainSubjectId, subtopicId, questionCount]);

  // Reset subtopic when switching modes or subjects
  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setSubtopicId("all");
  };

  const handleSubjectChange = (newSubjectId: string) => {
    setMainSubjectId(newSubjectId);
    setSubtopicId("all");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Practice</h1>
        <p className="text-muted-foreground mt-1">Mix it up — sharpen weak areas or replay wrong answers.</p>
      </div>

      <div className="max-w-xl">
        {!quizStarted && <SavedQuizBanner />}
      </div>

      {!quizStarted && (
        <div className="rounded-2xl bg-card border border-border p-6 shadow-card max-w-xl">
          <div className="flex flex-wrap gap-2 mb-4">
            <ModeBtn icon={<Shuffle className="size-4" />} active={mode === "random"} disabled={quizStarted} onClick={() => handleModeChange("random")}>Random</ModeBtn>
            <ModeBtn icon={<AlertTriangle className="size-4" />} active={mode === "weak"} disabled={quizStarted} onClick={() => handleModeChange("weak")}>Weak</ModeBtn>
            <ModeBtn icon={<RotateCcw className="size-4" />} active={mode === "wrong"} disabled={quizStarted} onClick={() => handleModeChange("wrong")}>Wrong retry</ModeBtn>
            <ModeBtn icon={<Bookmark className="size-4" />} active={mode === "solve_later"} disabled={quizStarted} onClick={() => handleModeChange("solve_later")}>Solve Later</ModeBtn>
          </div>

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {/* Main Subject Selection */}
            <label className="flex flex-col gap-2 p-4 rounded-xl border border-border bg-secondary/40 cursor-pointer">
              <div className="flex items-center gap-3">
                <BookOpen className="size-4 text-primary-glow" />
                <div className="text-sm font-medium">Subject</div>
              </div>
              <select
                value={mainSubjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className="w-full rounded-lg bg-input/60 border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All subjects</option>
                {mainSubjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            {/* Subtopic Selection (only for weak/wrong modes) */}
            {(mode === "weak" || mode === "wrong") && (
              <label className="flex flex-col gap-2 p-4 rounded-xl border border-border bg-secondary/40 cursor-pointer">
                <div className="flex items-center gap-3">
                  <BookOpen className="size-4 text-primary-glow" />
                  <div className="text-sm font-medium">Subtopic</div>
                </div>
                <select
                  value={subtopicId}
                  onChange={(e) => setSubtopicId(e.target.value)}
                  className="w-full rounded-lg bg-input/60 border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={mainSubjectId === "all"}
                >
                  <option value="all">All subtopics</option>
                  {subtopics.map((s) => {
                    const mcqCount = mcqs.filter((m) => m.subjectId === s.id).length;
                    return (
                      <option key={s.id} value={s.id}>{s.name} ({mcqCount})</option>
                    );
                  })}
                </select>
              </label>
            )}

            {/* Question Count Selection (only for random mode) */}
            {mode === "random" && (
              <div className="p-4 rounded-xl border border-border bg-secondary/40">
                <div className="flex items-center gap-3 mb-3">
                  <Hash className="size-4 text-primary-glow" />
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
        subjectId={mainSubjectId}
        savedState={resume === true && savedQuiz?.subjectId === mainSubjectId ? savedQuiz : null}
      />
    </div>
  );
}

function ModeBtn({ icon, active, disabled, onClick, children }: { icon: React.ReactNode; active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
        active ? "gradient-primary text-primary-foreground border-transparent shadow-glow" : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60"
      } ${disabled ? "opacity-40 pointer-events-none" : ""}`}
    >
      {icon} {children}
    </button>
  );
}
