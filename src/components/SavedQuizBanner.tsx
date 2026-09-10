import { useApp } from "@/store/app-store";
import { Play, Trash2, Clock, BookOpen } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

function fmtTime(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function SavedQuizBanner() {
  const { savedQuiz, clearSavedQuiz } = useApp();
  const navigate = useNavigate();

  if (!savedQuiz) return null;

  const totalQuestions = savedQuiz.order.length;
  const answered = savedQuiz.currentIndex;
  const progress = totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0;
  const remaining = savedQuiz.timeLimitMin > 0
    ? Math.max(0, savedQuiz.timeLimitMin * 60 - savedQuiz.elapsed)
    : null;

  const handleResume = () => {
    if (!savedQuiz) return;

    // 1. If explicit route metadata is saved, use it
    if (savedQuiz.routePath === "/practice") {
      navigate({
        to: "/practice",
        search: { resume: true, ...(savedQuiz.routeSearch || {}) },
      });
      return;
    }

    if (savedQuiz.routePath === "/quiz/$subjectId" && savedQuiz.routeParams?.subjectId) {
      navigate({
        to: "/quiz/$subjectId",
        params: { subjectId: savedQuiz.routeParams.subjectId },
        search: (savedQuiz.routeSearch || {}) as any,
      });
      return;
    }

    // 2. Parse subjectId formats (e.g., english_paper_1 or english)
    if (savedQuiz.subjectId.includes("_paper_")) {
      const [subjId, paperStr] = savedQuiz.subjectId.split("_paper_");
      navigate({
        to: "/quiz/$subjectId",
        params: { subjectId: subjId },
        search: { paper: Number(paperStr) } as any,
      });
      return;
    }

    if (savedQuiz.subjectId.startsWith("practice_") || savedQuiz.mode?.toLowerCase().includes("practice")) {
      navigate({ to: "/practice", search: { resume: true } });
      return;
    }

    if (savedQuiz.subjectId && savedQuiz.subjectId !== "all") {
      navigate({ to: "/quiz/$subjectId", params: { subjectId: savedQuiz.subjectId } });
      return;
    }

    navigate({ to: "/practice", search: { resume: true } });
  };

  const modeLabel = savedQuiz.mode && savedQuiz.mode !== savedQuiz.subjectName ? savedQuiz.mode : "Quiz";

  return (
    <div className="rounded-2xl bg-primary/10 border border-primary/30 p-3.5 md:p-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-primary-glow uppercase tracking-wider mb-0.5">
            <Clock className="size-3.5" />
            Paused Quiz
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <span className="font-medium truncate max-w-[200px]">{modeLabel}</span>
            <span className="text-muted-foreground">&middot;</span>
            <span className="flex items-center gap-1 text-muted-foreground truncate">
              <BookOpen className="size-3" /> {savedQuiz.subjectName}
            </span>
            {remaining !== null && (
              <>
                <span className="text-muted-foreground">&middot;</span>
                <span className="text-muted-foreground">{fmtTime(remaining)} left</span>
              </>
            )}
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden max-w-xs">
            <div
              className="h-full gradient-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 self-end md:self-center shrink-0">
          <button
            onClick={clearSavedQuiz}
            className="p-1.5 sm:p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Discard quiz"
          >
            <Trash2 className="size-4" />
          </button>
          <button
            onClick={handleResume}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg gradient-primary text-primary-foreground text-xs sm:text-sm font-medium shadow-glow hover:opacity-95 transition-all"
          >
            <Play className="size-3.5 sm:size-4" /> Resume
          </button>
        </div>
      </div>
    </div>
  );
}
