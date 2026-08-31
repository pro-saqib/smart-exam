import { useEffect, useMemo, useState } from "react";
import type { MCQ, Subject } from "@/lib/types";
import { useApp } from "@/store/app-store";
import { Bookmark, BookmarkCheck, ArrowRight, RotateCcw, CheckCircle2, XCircle, AlertCircle, Play, Shuffle, SkipForward, Timer as TimerIcon } from "lucide-react";
import { toast } from "sonner";

export function QuizRunner({
  items,
  title,
  emptyText,
  subtopics = [],
  mcqsBySubtopic = {},
}: {
  items: MCQ[];
  title: string;
  emptyText: string;
  subtopics?: Subject[];
  mcqsBySubtopic?: Record<string, MCQ[]>;
}) {
  const { recordAttempt, toggleSolveLater } = useApp();
  const [started, setStarted] = useState(false);
  const [selectedSubtopic, setSelectedSubtopic] = useState<string>("__all__");
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [timeLimitMin, setTimeLimitMin] = useState<0 | 15 | 30>(0);
  const [order, setOrder] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<"A" | "B" | "C" | "D" | "E" | null>(null);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [retryQueue, setRetryQueue] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [startTs, setStartTs] = useState<number | null>(null);
  const [timeUp, setTimeUp] = useState(false);

  const activeItems = useMemo(() => {
    if (selectedSubtopic === "__all__") return items;
    return mcqsBySubtopic[selectedSubtopic] ?? items;
  }, [items, selectedSubtopic, mcqsBySubtopic]);

  const current = useMemo(() => activeItems.find((m) => m.id === order[idx]), [activeItems, order, idx]);

  // Timer tick
  useEffect(() => {
    if (!started || startTs === null || timeUp) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTs) / 1000)), 500);
    return () => clearInterval(id);
  }, [started, startTs, timeUp]);

  // Time limit enforcement
  useEffect(() => {
    if (!started || timeLimitMin === 0) return;
    if (elapsed >= timeLimitMin * 60 && !timeUp) {
      setTimeUp(true);
      toast.message("Time's up!");
      setIdx(items.length); // jump to summary
    }
  }, [elapsed, timeLimitMin, started, timeUp, items.length]);

  // Keyboard shortcuts (declare early so hooks order is stable)
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Enter" && picked !== null) {
        e.preventDefault();
        next();
      } else if (e.key === "Escape") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [picked]);

  // Auto-advance 1s after a selection while preserving the manual Next button
  useEffect(() => {
    if (picked === null) return;
    // Only auto-advance when the selected answer is correct.
    if (current && current.correct && picked === current.correct) {
      const t = setTimeout(() => {
        setPicked(null);
        setIdx((i) => i + 1);
      }, 500);
      return () => clearTimeout(t);
    }
    return;
  }, [picked, current]);

  // When session ends (idx >= items.length), ensure elapsed is finalised
  useEffect(() => {
    if (!started || startTs === null) return;
    if (idx >= items.length) {
      setElapsed(Math.floor((Date.now() - startTs) / 1000));
    }
  }, [idx, items.length, started, startTs]);

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  const begin = (idsOverride?: string[]) => {
    const ids = idsOverride ?? activeItems.map((m) => m.id);
    setOrder(shuffleQuestions ? shuffle(ids) : ids);
    setIdx(0);
    setPicked(null);
    setScore({ correct: 0, wrong: 0 });
    setRetryQueue([]);
    setElapsed(0);
    setTimeUp(false);
    setStartTs(Date.now());
    setStarted(true);
  };

  if (!started) {
    return (
      <div className="rounded-2xl bg-card border border-border p-6 md:p-8 shadow-card max-w-xl">
        <div className="text-xs text-primary-glow uppercase tracking-wider">{title}</div>
        <h2 className="mt-1 text-2xl">Ready to practice?</h2>
        <p className="text-muted-foreground mt-1 text-sm">{activeItems.length} question{activeItems.length === 1 ? "" : "s"} in this set.</p>

        <div className="mt-6 space-y-3">
          {subtopics.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Subtopic</label>
              <select
                value={selectedSubtopic}
                onChange={(e) => setSelectedSubtopic(e.target.value)}
                className="w-full rounded-lg bg-input/60 border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="__all__">All subtopics</option>
                {subtopics.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({mcqsBySubtopic[s.id]?.length ?? 0})</option>
                ))}
              </select>
            </div>
          )}
          <ToggleRow
            label="Shuffle questions"
            description="Present questions in random order each session."
            checked={shuffleQuestions}
            onChange={setShuffleQuestions}
          />
          <ToggleRow
            label="Shuffle answer options"
            description="Randomize A/B/C/D positions per question."
            checked={shuffleOptions}
            onChange={setShuffleOptions}
          />

          <div className="p-4 rounded-xl border border-border bg-secondary/40">
            <div className="flex items-center gap-3">
              <TimerIcon className="size-4 text-primary-glow" />
              <div className="text-sm font-medium">Time limit</div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {([
                { v: 15, label: "15 min" },
                { v: 30, label: "30 min" },
                { v: 0, label: "No limit" },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setTimeLimitMin(opt.v as 0 | 15 | 30)}
                  className={`px-3 py-2 rounded-lg text-sm border transition-all ${
                    timeLimitMin === opt.v
                      ? "gradient-primary text-primary-foreground border-transparent shadow-glow"
                      : "bg-card border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={() => begin()}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow"
        >
          <Play className="size-4" /> Start
        </button>
      </div>
    );
  }

  if (!current) {
    const uniqueRetry = Array.from(new Set(retryQueue));
    return (
      <div className="rounded-2xl bg-card border border-border p-10 text-center shadow-card max-w-2xl mx-auto">
        <div className="w-28 h-28 mx-auto rounded-full bg-gradient-to-br from-primary to-purple-500 grid place-items-center shadow-glow">
          <CheckCircle2 className="size-10 text-white" />
        </div>
        <h2 className="mt-6 text-3xl font-semibold">{timeUp ? "Time's up" : "Session complete"}</h2>
        <div className="mt-4 flex flex-col md:flex-row items-center justify-center gap-6">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Correct</div>
            <div className="text-3xl font-bold text-success">{score.correct}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Wrong</div>
            <div className="text-3xl font-bold text-destructive">{score.wrong}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Accuracy</div>
            <div className="text-3xl font-bold">{Math.round((score.correct / Math.max(1, score.correct + score.wrong)) * 100)}%</div>
          </div>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">Time used: <span className="font-medium text-foreground">{fmtTime(elapsed)}</span></div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {uniqueRetry.length > 0 && (
            <button
              onClick={() => begin(uniqueRetry)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow"
            >
              <SkipForward className="size-4" /> Retry missed ({uniqueRetry.length})
            </button>
          )}
          <button
            onClick={() => begin()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border text-sm font-medium hover:bg-accent"
          >
            <Play className="size-4" /> Restart
          </button>
          <button
            onClick={() => setStarted(false)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent border border-border"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const submit = (letter: "A" | "B" | "C" | "D" | "E") => {
    if (picked) return;
    setPicked(letter);
    if (current.correct) {
      const ok = recordAttempt(current.id, letter);
      setScore((s) => ({ correct: s.correct + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
      if (!ok) setRetryQueue((q) => (q.includes(current.id) ? q : [...q, current.id]));
    }
  };

  // Auto-advance 1s after a selection while preserving the manual Next button
  // (moved earlier)

  const next = () => {
    setPicked(null);
    setIdx((i) => i + 1);
  };

  const skip = () => {
    if (!current) return;
    setRetryQueue((q) => (q.includes(current.id) ? q : [...q, current.id]));
    setPicked(null);
    setIdx((i) => i + 1);
  };

  // keyboard handler moved earlier to keep hooks stable

  const progress = ((idx) / items.length) * 100;

  // Build (possibly shuffled) option order for the current question
  const allLetters = (["A", "B", "C", "D", "E"] as const);
  const available = allLetters.filter((L) => Boolean(current.options[L]));
  const letterOrder = shuffleOptions
    ? shuffleDeterministic(available, current.id)
    : available;

  const remaining = timeLimitMin > 0 ? Math.max(0, timeLimitMin * 60 - elapsed) : null;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">{title}</div>
          <div className="text-lg font-medium">Question {idx + 1} of {items.length}</div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-secondary/60 font-mono ${
            remaining !== null && remaining <= 60 ? "text-destructive border-destructive/40" : ""
          }`}>
            <TimerIcon className="size-3.5" />
            {remaining !== null ? fmtTime(remaining) : fmtTime(elapsed)}
          </span>
          <span className="text-success">✓ {score.correct}</span>
          <span className="text-destructive">✗ {score.wrong}</span>
          <button
            onClick={() => { toggleSolveLater(current.id); toast.success(current.solveLater ? "Removed bookmark" : "Saved for later"); }}
            className="p-2 rounded-lg hover:bg-accent"
          >
            {current.solveLater ? <BookmarkCheck className="size-5 text-primary-glow" /> : <Bookmark className="size-5" />}
          </button>
        </div>
      </header>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full gradient-primary transition-all" style={{ width: `${progress}%` }} />
      </div>

      <article className="rounded-2xl bg-card border border-border p-6 md:p-8 shadow-card">
        <h2 className="text-xl md:text-2xl font-display leading-snug">{current.question}</h2>

        <div className="mt-6 grid gap-3">
          {letterOrder.map((L) => {
            const text = current.options[L];
            const isPicked = picked === L;
            const isCorrect = current.correct === L;
            const reveal = picked !== null && current.correct;
            const cls = !reveal
              ? isPicked
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50 hover:bg-accent/40"
              : isCorrect
                ? "border-success bg-success/10"
                : isPicked
                  ? "border-destructive bg-destructive/10"
                  : "border-border opacity-60";
            return (
              <button
                key={L}
                onClick={() => submit(L)}
                disabled={picked !== null}
                className={`text-left flex items-start gap-4 p-4 rounded-xl border transition-all ${cls}`}
              >
                <span className="size-8 shrink-0 rounded-lg grid place-items-center bg-secondary text-secondary-foreground font-display font-semibold text-sm">
                  {L}
                </span>
                <span className="flex-1 text-sm md:text-base">{text}</span>
                {reveal && isCorrect && <CheckCircle2 className="size-5 text-success shrink-0" />}
                {reveal && isPicked && !isCorrect && <XCircle className="size-5 text-destructive shrink-0" />}
              </button>
            );
          })}
        </div>

        {picked !== null && !current.correct && (
          <div className="mt-5 flex items-start gap-2 text-sm rounded-lg bg-warning/10 border border-warning/40 p-3 text-foreground">
            <AlertCircle className="size-4 mt-0.5 text-warning" />
            No correct answer was found in the source PDF for this question.
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            onClick={skip}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-card border border-border text-sm font-medium hover:bg-accent"
            title="Skip (Esc)"
          >
            <SkipForward className="size-4" /> Skip
            <kbd className="ml-1 hidden md:inline px-1.5 py-0.5 text-[10px] rounded bg-secondary border border-border">Esc</kbd>
          </button>
          <button
            onClick={next}
            disabled={picked === null}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow disabled:opacity-50"
            title="Next (Enter)"
          >
            Next <ArrowRight className="size-4" />
            <kbd className="ml-1 hidden md:inline px-1.5 py-0.5 text-[10px] rounded bg-white/10 border border-white/20">Enter</kbd>
          </button>
        </div>
      </article>
    </div>
  );
}

function fmtTime(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}



function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deterministic shuffle seeded by a string, so option order is stable per question
function shuffleDeterministic<T>(arr: readonly T[], seed: string): T[] {
  const a = [...arr];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (let i = a.length - 1; i > 0; i--) {
    h = (Math.imul(h ^ (h >>> 13), 1274126177)) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border bg-secondary/40 cursor-pointer">
      <div className="flex items-start gap-3">
        <Shuffle className="size-4 mt-0.5 text-primary-glow" />
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 accent-primary cursor-pointer"
      />
    </label>
  );
}
