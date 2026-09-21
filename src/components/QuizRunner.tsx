import { useEffect, useMemo, useRef, useState } from "react";
import type { MCQ, Subject } from "@/lib/types";
import { useApp } from "@/store/app-store";
import type { SavedQuiz } from "@/store/app-store";
import { getMcqsByIds } from "@/lib/db-actions";
import { Bookmark, BookmarkCheck, ArrowRight, RotateCcw, CheckCircle2, XCircle, AlertCircle, Play, Shuffle, SkipForward, Timer as TimerIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

function resolveSavedMcqs(saved: SavedQuiz, pool: MCQ[]): MCQ[] {
  const map = new Map<string, MCQ>(pool.map((m) => [m.id, m]));
  const targetIds = saved.items && saved.items.length > 0 ? saved.items : saved.order;
  if (!targetIds || targetIds.length === 0) return [];
  const found: MCQ[] = [];
  for (const id of targetIds) {
    const item = map.get(id);
    if (item) found.push(item);
  }
  return found;
}

export function QuizRunner({
  items,
  title,
  subtitle,
  resultSubtitle,
  emptyText,
  subtopics = [],
  mcqsBySubtopic = {},
  onStart,
  onReset,
  subjectId,
  subjectName,
  routePath,
  routeParams,
  routeSearch,
  savedState,
  hideTitle,
  onComplete,
  onFinish,
}: {
  items: MCQ[];
  title: string;
  subtitle?: string;
  resultSubtitle?: string;
  emptyText: string;
  subtopics?: Subject[];
  mcqsBySubtopic?: Record<string, MCQ[]>;
  onStart?: () => void;
  onReset?: () => void;
  subjectId?: string;
  subjectName?: string;
  routePath?: string;
  routeParams?: Record<string, string>;
  routeSearch?: Record<string, unknown>;
  savedState?: SavedQuiz | null;
  hideTitle?: boolean;
  onComplete?: (complete: boolean) => void;
  onFinish?: (summary: { score: { correct: number; wrong: number }; total: number; accuracy: number }) => void;
}) {
  const { recordAttempt, toggleSolveLater, saveQuiz, clearSavedQuiz, subjects } = useApp();

  // Try to resolve saved MCQs synchronously from items and store mcqs
  const synchronousRestoredMcs = useMemo(() => {
    if (!savedState) return [];
    return resolveSavedMcqs(savedState, [...items, ...(useApp.getState().mcqs || [])]);
  }, [savedState, items]);

  const hasSyncRestore = synchronousRestoredMcs.length > 0;

  const [started, setStarted] = useState(() => hasSyncRestore);
  const finishedRef = useRef(false);
  const [selectedSubtopic, setSelectedSubtopic] = useState<string>("__all__");
  const [shuffleQuestions, setShuffleQuestions] = useState(() => savedState?.shuffleQuestions ?? true);
  const [shuffleOptions, setShuffleOptions] = useState(() => savedState?.shuffleOptions ?? false);
  const [timeLimitMin, setTimeLimitMin] = useState<60 | 15 | 30>(() => (savedState?.timeLimitMin || 60) as 60 | 15 | 30);
  const [order, setOrder] = useState<string[]>(() => (savedState ? savedState.order : []));
  const orderRef = useRef<string[]>(savedState ? savedState.order : []);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  const [idx, setIdx] = useState(() => (savedState ? savedState.currentIndex : 0));
  const idxRef = useRef(savedState ? savedState.currentIndex : 0);
  useEffect(() => {
    idxRef.current = idx;
  }, [idx]);

  const [picked, setPicked] = useState<"A" | "B" | "C" | "D" | "E" | null>(null);
  const [score, setScore] = useState(() => (savedState ? savedState.score : { correct: 0, wrong: 0 }));
  const [retryQueue, setRetryQueue] = useState<string[]>(() => (savedState ? savedState.retryQueue : []));
  const [elapsed, setElapsed] = useState(() => (savedState ? savedState.elapsed : 0));
  const [startTs, setStartTs] = useState<number | null>(() =>
    savedState ? Date.now() - savedState.elapsed * 1000 : null
  );
  const [timeUp, setTimeUp] = useState(false);
  const [restored, setRestored] = useState(() => hasSyncRestore);
  const [isRestoringAsync, setIsRestoringAsync] = useState(() => Boolean(savedState && !hasSyncRestore));
  const [restoredItems, setRestoredItems] = useState<MCQ[] | null>(() => (hasSyncRestore ? synchronousRestoredMcs : null));

  const activeItems = useMemo(() => {
    if (restoredItems && restoredItems.length > 0) return restoredItems;
    if (selectedSubtopic === "__all__") return items;
    return mcqsBySubtopic[selectedSubtopic] ?? items;
  }, [items, selectedSubtopic, mcqsBySubtopic, restoredItems]);

  // Keep stable refs for values used in the save-on-unmount cleanup
  // to avoid re-registering the effect on every render (which triggers saveQuiz loops)
  const activeItemsRef = useRef(activeItems);
  useEffect(() => { activeItemsRef.current = activeItems; }, [activeItems]);

  const routeParamsRef = useRef(routeParams);
  useEffect(() => { routeParamsRef.current = routeParams; }, [routeParams]);

  const routeSearchRef = useRef(routeSearch);
  useEffect(() => { routeSearchRef.current = routeSearch; }, [routeSearch]);

  const subjectsRef = useRef(subjects);
  useEffect(() => { subjectsRef.current = subjects; }, [subjects]);

  // On mount with synchronous restore, notify parent onStart (run once only)
  const onStartRef = useRef(onStart);
  useEffect(() => {
    onStartRef.current = onStart;
  });

  useEffect(() => {
    if (hasSyncRestore && onStartRef.current) {
      onStartRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save quiz state on unmount if quiz is in progress
  // Uses refs for values that change every render to prevent infinite saveQuiz loops
  useEffect(() => {
    return () => {
      if (started && !timeUp && orderRef.current.length > 0 && idxRef.current < orderRef.current.length) {
        const resolvedSubjectName =
          subjectName || subjectsRef.current.find((s) => s.id === subjectId)?.name || title || "Quiz";
        saveQuiz({
          mode: title,
          subjectId: subjectId || "",
          subjectName: resolvedSubjectName,
          routePath,
          routeParams: routeParamsRef.current,
          routeSearch: routeSearchRef.current,
          currentIndex: idxRef.current,
          order: orderRef.current,
          items: activeItemsRef.current.map((m) => m.id),
          score,
          retryQueue,
          elapsed,
          startTs: startTs || 0,
          timeLimitMin,
          shuffleOptions,
          shuffleQuestions,
        });
      }
    };
  }, [
    started,
    timeUp,
    score,
    retryQueue,
    elapsed,
    startTs,
    timeLimitMin,
    shuffleOptions,
    shuffleQuestions,
    subjectId,
    subjectName,
    routePath,
    title,
    saveQuiz,
  ]);

  // True if restore already happened (sync) or is not needed (no savedState)
  const restoreAttemptedRef = useRef(!savedState || hasSyncRestore);

  // Restore from saved state when not restored synchronously
  useEffect(() => {
    if (!savedState || restoreAttemptedRef.current) return;

    const localPool = [...items, ...(useApp.getState().mcqs || [])];
    const matched = resolveSavedMcqs(savedState, localPool);

    if (matched.length > 0) {
      restoreAttemptedRef.current = true;
      setRestoredItems(matched);
      orderRef.current = savedState.order;
      setOrder(savedState.order);
      idxRef.current = savedState.currentIndex;
      setIdx(savedState.currentIndex);
      setScore(savedState.score);
      setRetryQueue(savedState.retryQueue);
      setElapsed(savedState.elapsed);
      setStartTs(Date.now() - savedState.elapsed * 1000);
      setTimeLimitMin((savedState.timeLimitMin || 60) as 60 | 15 | 30);
      setShuffleOptions(savedState.shuffleOptions);
      setShuffleQuestions(savedState.shuffleQuestions);
      setStarted(true);
      setRestored(true);
      setIsRestoringAsync(false);
      if (onStartRef.current) onStartRef.current();
    } else {
      // MCQs not yet in items/store — fetch from server (once)
      const idsToFetch = savedState.items?.length > 0 ? savedState.items : savedState.order;
      if (idsToFetch && idsToFetch.length > 0) {
        restoreAttemptedRef.current = true;
        setIsRestoringAsync(true);
        getMcqsByIds({ data: { mcqIds: idsToFetch } })
          .then((fetched) => {
            if (fetched && fetched.length > 0) {
              setRestoredItems(fetched as MCQ[]);
              orderRef.current = savedState.order;
              setOrder(savedState.order);
              idxRef.current = savedState.currentIndex;
              setIdx(savedState.currentIndex);
              setScore(savedState.score);
              setRetryQueue(savedState.retryQueue);
              setElapsed(savedState.elapsed);
              setStartTs(Date.now() - savedState.elapsed * 1000);
              setTimeLimitMin((savedState.timeLimitMin || 60) as 60 | 15 | 30);
              setShuffleOptions(savedState.shuffleOptions);
              setShuffleQuestions(savedState.shuffleQuestions);
              setStarted(true);
              setRestored(true);
              setIsRestoringAsync(false);
              if (onStartRef.current) onStartRef.current();
            }
          })
          .catch((err) => {
            console.error("Failed to restore saved quiz MCQs:", err);
            setIsRestoringAsync(false);
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedState, items]);

  const current = useMemo(() => activeItems.find((m) => m.id === order[idx]), [activeItems, order, idx]);

  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  const pickedRef = useRef(picked);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);

  useEffect(() => {
    if (onComplete) {
      onComplete(started && !current);
    }
  }, [started, current, onComplete]);

  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  // Keep local bookmarked state synced with items
  useEffect(() => {
    const initial = new Set<string>();
    activeItems.forEach((m) => {
      if (m.solveLater) initial.add(m.id);
    });
    setBookmarkedIds(initial);
  }, [activeItems]);

  const isBookmarked = current ? bookmarkedIds.has(current.id) : false;

  // Timer tick
  useEffect(() => {
    if (!started || startTs === null || timeUp || !current || idx >= order.length) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTs) / 1000)), 500);
    return () => clearInterval(id);
  }, [started, startTs, timeUp, current, idx, order.length]);

  // Time limit enforcement
  useEffect(() => {
    if (!started || timeLimitMin === 0 || !current) return;
    if (elapsed >= timeLimitMin * 60 && !timeUp) {
      setTimeUp(true);
      toast.message("Time's up!");
      setIdx(order.length); // jump to summary
    }
  }, [elapsed, timeLimitMin, started, timeUp, current, order.length]);

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
        const nextIdx = idxRef.current + 1;
        idxRef.current = nextIdx;
        setIdx(nextIdx);
      }, 500);
      return () => clearTimeout(t);
    }
    return;
  }, [picked, current]);

  // When session ends (idx >= items.length), ensure elapsed is finalised and trigger onFinish/onComplete
  useEffect(() => {
    if (!started) return;
    if (!current && !finishedRef.current) {
      finishedRef.current = true;
      if (startTs !== null) {
        setElapsed(Math.floor((Date.now() - startTs) / 1000));
      }
      const totalAnswered = score.correct + score.wrong;
      const accuracy = Math.round((score.correct / Math.max(1, totalAnswered)) * 100);
      if (onComplete) onComplete(true);
      if (onFinish) {
        onFinish({
          score,
          total: activeItems.length,
          accuracy,
        });
      }
    }
  }, [started, current, startTs, score, activeItems.length, onComplete, onFinish]);

  // While waiting for async MCQ fetch to restore saved quiz, show spinner instead of config form
  if (isRestoringAsync) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">Restoring your quiz...</div>
      </div>
    );
  }

  if (!items.length && !restoredItems?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 md:p-8 text-muted-foreground max-w-xl">
        {emptyText}
      </div>
    );
  }

  const begin = (idsOverride?: string[]) => {
    finishedRef.current = false;
    const ids = idsOverride ?? activeItems.map((m) => m.id);
    const newOrder = shuffleQuestions ? shuffle(ids) : ids;
    orderRef.current = newOrder;
    setOrder(newOrder);
    idxRef.current = 0;
    setIdx(0);
    setPicked(null);
    setScore({ correct: 0, wrong: 0 });
    setRetryQueue([]);
    setElapsed(0);
    setTimeUp(false);
    setStartTs(Date.now());
    setStarted(true);
    if (onStart) onStart();
  };

  const close = () => {
    finishedRef.current = false;
    setStarted(false);
    clearSavedQuiz();
    if (onReset) onReset();
  };

  if (!started) {
    return (
      <div className="rounded-xl bg-card border border-border p-4 sm:p-6 shadow-card max-w-xl">
        <div className="space-y-3">
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
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-secondary/40 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Shuffle className="size-4 text-primary-glow shrink-0" />
                <div>
                  <div className="text-xs sm:text-sm font-medium">Shuffle questions</div>
                  <div className="text-[10px] sm:text-[11px] text-muted-foreground hidden sm:block">Random order</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                className="size-4 accent-primary cursor-pointer shrink-0"
              />
            </label>
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-secondary/40 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Shuffle className="size-4 text-primary-glow shrink-0" />
                <div>
                  <div className="text-xs sm:text-sm font-medium">Shuffle options</div>
                  <div className="text-[10px] sm:text-[11px] text-muted-foreground hidden sm:block">Randomize A-D</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={shuffleOptions}
                onChange={(e) => setShuffleOptions(e.target.checked)}
                className="size-4 accent-primary cursor-pointer shrink-0"
              />
            </label>
          </div>

          <div className="p-4 rounded-xl border border-border bg-secondary/40">
            <div className="flex items-center gap-3">
              <TimerIcon className="size-4 text-primary-glow" />
              <div className="text-sm font-medium">Time limit</div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {([
                { v: 15, label: "15 min" },
                { v: 30, label: "30 min" },
                { v: 60, label: "60 min" },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setTimeLimitMin(opt.v as 60 | 15 | 30)}
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
          className="w-full mt-6 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow"
        >
          <Play className="size-4" /> Start
        </button>
      </div>
    );
  }

  if (!current) {
    const uniqueRetry = Array.from(new Set(retryQueue));
    const totalAnswered = score.correct + score.wrong;
    const accuracy = Math.round((score.correct / Math.max(1, totalAnswered)) * 100);

    return (
      <div className="rounded-2xl bg-card border border-border p-4 sm:p-6 md:p-8 text-center shadow-card">
        <div className="max-w-xl mx-auto">
          <div className="size-14 sm:size-16 mx-auto rounded-full bg-gradient-to-br from-primary to-purple-500 grid place-items-center shadow-glow">
            <CheckCircle2 className="size-7 sm:size-8 text-white" />
          </div>
          <h2 className="mt-3 sm:mt-4 text-xl sm:text-2xl font-semibold">{timeUp ? "Time's up" : "Session complete"}</h2>
          {resultSubtitle ? (
            <div className="mt-1 flex flex-col items-center justify-center gap-0.5 text-xs sm:text-sm">
              <span className="text-primary font-medium">{resultSubtitle}</span>
              <span className="text-muted-foreground font-normal">{title}</span>
            </div>
          ) : subtitle ? (
            <div className="mt-1 flex flex-col items-center justify-center gap-0.5 text-xs sm:text-sm">
              <span className="text-primary font-medium">{subtitle}</span>
              <span className="text-muted-foreground font-normal">{title}</span>
            </div>
          ) : (
            <div className="text-xs sm:text-sm text-primary font-medium mt-1">{title}</div>
          )}

          {/* Compact single row stats for both mobile and desktop */}
          <div className="mt-3 sm:mt-4 grid grid-cols-3 gap-2 sm:gap-4 p-2.5 sm:p-4 rounded-xl bg-secondary/30 border border-border">
            <div className="text-center">
              <div className="text-[10px] sm:text-xs text-muted-foreground uppercase font-medium">Correct</div>
              <div className="text-lg sm:text-2xl font-bold text-success mt-0.5">{score.correct}</div>
            </div>
            <div className="text-center border-x border-border/60">
              <div className="text-[10px] sm:text-xs text-muted-foreground uppercase font-medium">Wrong</div>
              <div className="text-lg sm:text-2xl font-bold text-destructive mt-0.5">{score.wrong}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] sm:text-xs text-muted-foreground uppercase font-medium">Accuracy</div>
              <div className="text-lg sm:text-2xl font-bold text-primary mt-0.5">{accuracy}%</div>
            </div>
          </div>

          <div className="mt-3 text-xs sm:text-sm text-muted-foreground">
            Time used: <span className="font-medium text-foreground">{fmtTime(elapsed)}</span>
          </div>

          <div className="mt-4 sm:mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {uniqueRetry.length > 0 && (
              <button
                onClick={() => begin(uniqueRetry)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg gradient-primary text-primary-foreground text-xs sm:text-sm font-medium shadow-glow"
              >
                <SkipForward className="size-3.5 sm:size-4" /> Retry missed ({uniqueRetry.length})
              </button>
            )}
            <button
              onClick={() => begin()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-card border border-border text-xs sm:text-sm font-medium hover:bg-accent"
            >
              <Play className="size-3.5 sm:size-4" /> Restart
            </button>
            <button
              onClick={() => close()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium text-muted-foreground hover:bg-accent border border-border"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const submit = async (letter: "A" | "B" | "C" | "D" | "E") => {
    if (picked) return;
    setPicked(letter);
    const isCorrect = current.correct === letter;
    const ok = await recordAttempt(current.id, letter, {
      correct: isCorrect,
      subjectId: current.subjectId,
    });
    setScore((s) => ({ correct: s.correct + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
    if (!ok) setRetryQueue((q) => (q.includes(current.id) ? q : [...q, current.id]));
  };

  // Auto-advance 1s after a selection while preserving the manual Next button
  // (moved earlier)

  const next = () => {
    setPicked(null);
    const nextIdx = idxRef.current + 1;
    idxRef.current = nextIdx;
    setIdx(nextIdx);
  };

  const skip = () => {
    const curr = activeItems.find((m) => m.id === order[idxRef.current]);
    if (!curr) return;
    setRetryQueue((q) => (q.includes(curr.id) ? q : [...q, curr.id]));
    setPicked(null);
    const nextIdx = idxRef.current + 1;
    idxRef.current = nextIdx;
    setIdx(nextIdx);
  };

  // keyboard handler moved earlier to keep hooks stable

  const totalCount = order.length || activeItems.length || items.length;
  const progress = totalCount > 0 ? (idx / totalCount) * 100 : 0;

  // Build (possibly shuffled) option order for the current question
  const allLetters = (["A", "B", "C", "D", "E"] as const);
  const available = allLetters.filter((L) => Boolean(current.options[L]));
  const letterOrder = shuffleOptions
    ? shuffleDeterministic(available, current.id)
    : available;

  const remaining = timeLimitMin > 0 ? Math.max(0, timeLimitMin * 60 - elapsed) : null;

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <header className="flex items-center justify-between gap-3">
          <div>
            {!hideTitle && (
              <>
                <div className="text-xs text-muted-foreground">{title}</div>
                {subtitle && <div className="text-sm font-medium text-foreground">{subtitle}</div>}
              </>
            )}
            <div className="text-lg font-medium">Q. {idx + 1} of {totalCount}</div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-xs">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-secondary/60 font-mono ${
              remaining !== null && remaining <= 60 ? "text-destructive border-destructive/40" : ""
            }`}>
              <TimerIcon className="size-3.5" />
              {remaining !== null ? fmtTime(remaining) : fmtTime(elapsed)}
            </span>
            <button
              onClick={async () => {
                if (!current) return;
                const willBookmark = !isBookmarked;
                setBookmarkedIds((prev) => {
                  const next = new Set(prev);
                  if (willBookmark) next.add(current.id);
                  else next.delete(current.id);
                  return next;
                });
                try {
                  await toggleSolveLater(current.id, willBookmark, current.subjectId);
                  toast.success(willBookmark ? "Saved for later" : "Removed bookmark");
                } catch (err) {
                  // Revert state on failure
                  setBookmarkedIds((prev) => {
                    const next = new Set(prev);
                    if (isBookmarked) next.add(current.id);
                    else next.delete(current.id);
                    return next;
                  });
                  toast.error("Failed to update bookmark");
                }
              }}
              className="p-2 rounded-lg hover:bg-accent transition-colors"
              title={isBookmarked ? "Remove bookmark" : "Save for later"}
            >
              <Bookmark
                className={`size-5 transition-all ${
                  isBookmarked
                    ? "fill-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              />
            </button>
          </div>
        </header>

        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full gradient-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <article className="rounded-2xl bg-card border border-border p-4 sm:p-6 md:p-8 shadow-card">
        <h2 className="text-base sm:text-xl md:text-2xl font-display leading-snug">{current.question}</h2>

        <div className="mt-4 sm:mt-6 grid gap-2 sm:gap-3">
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
                className={`text-left flex items-center gap-3 p-2.5 sm:p-4 rounded-xl border transition-all ${cls}`}
              >
                <span className="size-6 sm:size-8 shrink-0 rounded-lg grid place-items-center bg-secondary text-secondary-foreground font-display font-semibold text-xs sm:text-sm">
                  {L}
                </span>
                <span className="flex-1 text-xs sm:text-sm md:text-base leading-snug">{text}</span>
                {reveal && isCorrect && <CheckCircle2 className="size-4 sm:size-5 text-success shrink-0" />}
                {reveal && isPicked && !isCorrect && <XCircle className="size-4 sm:size-5 text-destructive shrink-0" />}
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
    <label className="flex items-center justify-between gap-3 p-3 sm:p-4 rounded-xl border border-border bg-secondary/40 cursor-pointer">
      <div className="flex items-center gap-2.5">
        <Shuffle className="size-4 text-primary-glow shrink-0" />
        <div className="text-xs sm:text-sm font-medium flex items-center gap-2 flex-wrap">
          <span>{label}</span>
          <span className="text-[11px] sm:text-xs text-muted-foreground font-normal">— {description}</span>
        </div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary cursor-pointer shrink-0"
      />
    </label>
  );
}
