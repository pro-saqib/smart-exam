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
    // Navigate to the correct route based on the saved quiz
    if (savedQuiz.subjectId && savedQuiz.subjectId !== "all") {
      navigate({ to: "/quiz/$subjectId", params: { subjectId: savedQuiz.subjectId } });
    } else {
      navigate({ to: "/practice", search: { resume: true } });
    }
  };

  const modeLabel = savedQuiz.mode && savedQuiz.mode !== savedQuiz.subjectName ? savedQuiz.mode : "Quiz";

  return (
    <div className="rounded-2xl bg-primary/10 border border-primary/30 p-4 md:p-5">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs text-primary-glow uppercase tracking-wider mb-1">
            <Clock className="size-3.5" />
            Paused Quiz
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">{modeLabel}</span>
            <span className="text-muted-foreground">&middot;</span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <BookOpen className="size-3.5" /> {savedQuiz.subjectName}
            </span>
            {remaining !== null && (
              <>
                <span className="text-muted-foreground">&middot;</span>
                <span className="text-muted-foreground">{fmtTime(remaining)} left</span>
              </>
            )}
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden max-w-xs">
            <div
              className="h-full gradient-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearSavedQuiz}
            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Discard quiz"
          >
            <Trash2 className="size-4" />
          </button>
          <button
            onClick={handleResume}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow hover:opacity-95"
          >
            <Play className="size-4" /> Resume
          </button>
        </div>
      </div>
    </div>
  );
}
