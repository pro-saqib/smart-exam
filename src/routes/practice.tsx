import { createFileRoute } from "@tanstack/react-router";
import { useApp } from "@/store/app-store";
import { useMemo, useState } from "react";
import { QuizRunner } from "@/components/QuizRunner";
import { Shuffle, AlertTriangle, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/practice")({
  head: () => ({
    meta: [
      { title: "Practice — PrepMind" },
      { name: "description", content: "Random practice, weak-question mode and wrong-answer retry across all subjects." },
    ],
  }),
  component: PracticePage,
});

type Mode = "random" | "weak" | "wrong";

function PracticePage() {
  const mcqs = useApp((s) => s.mcqs);
  const [mode, setMode] = useState<Mode>("random");
  const [subjectId, setSubjectId] = useState<string>("all");
  const subjects = useApp((s) => s.subjects);

  const items = useMemo(() => {
    let pool = subjectId === "all" ? mcqs : mcqs.filter((m) => m.subjectId === subjectId);
    if (mode === "weak") pool = pool.filter((m) => m.wrongCount >= Math.max(1, Math.floor(m.attemptCount / 2)));
    if (mode === "wrong") pool = pool.filter((m) => m.lastAttemptCorrect === false);
    return pool.slice(0, 50);
  }, [mcqs, mode, subjectId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Practice</h1>
        <p className="text-muted-foreground mt-1">Mix it up — sharpen weak areas or replay wrong answers.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <ModeBtn icon={<Shuffle className="size-4" />} active={mode === "random"} onClick={() => setMode("random")}>Random</ModeBtn>
        <ModeBtn icon={<AlertTriangle className="size-4" />} active={mode === "weak"} onClick={() => setMode("weak")}>Weak</ModeBtn>
        <ModeBtn icon={<RotateCcw className="size-4" />} active={mode === "wrong"} onClick={() => setMode("wrong")}>Wrong retry</ModeBtn>
        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="ml-auto rounded-lg bg-input/60 border border-border px-3 py-2 text-sm"
        >
          <option value="all">All subjects</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <QuizRunner items={items} title={mode.toUpperCase()} emptyText="No questions match this mode yet." />
    </div>
  );
}

function ModeBtn({ icon, active, onClick, children }: { icon: React.ReactNode; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
        active ? "gradient-primary text-primary-foreground border-transparent shadow-glow" : "bg-card border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon} {children}
    </button>
  );
}
