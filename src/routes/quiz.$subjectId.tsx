import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useApp } from "@/store/app-store";
import { QuizRunner } from "@/components/QuizRunner";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { SUBJECT_KEYWORDS, getPaperLockStatus } from "@/lib/model-papers";
import { getSubjectModelPaperMcqs } from "@/lib/db-actions";
import type { MCQ } from "@/lib/types";
import { toast } from "sonner";

interface QuizSearchParams {
  paper?: number;
}

export const Route = createFileRoute("/quiz/$subjectId")({
  validateSearch: (search: Record<string, unknown>): QuizSearchParams => ({
    paper: search.paper ? Number(search.paper) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Quiz — PrepMind" },
      { name: "description", content: "Practice and test your knowledge with interactive MCQs." },
    ],
  }),
  component: QuizPage,
});

function QuizPage() {
  const { subjectId } = Route.useParams();
  const { paper } = Route.useSearch();
  const context = Route.useRouteContext();
  const isAdmin = (context as any)?.user?.role === "admin";

  const subjects = useApp((s) => s.subjects);
  const savedQuiz = useApp((s) => s.savedQuiz);
  const paperCompletions = useApp((s) => s.paperCompletions);
  const recordPaperCompletion = useApp((s) => s.recordPaperCompletion);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MCQ[]>([]);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);

  // Check if subjectId is a canonical group key (e.g. "english", "computer")
  const canonicalConfig = useMemo(
    () => SUBJECT_KEYWORDS.find((sk) => sk.key === subjectId),
    [subjectId],
  );

  // All subtopics (have a parentId)
  const allSubtopics = useMemo(() => subjects.filter((s) => !!s.parentId), [subjects]);
  const subject = useMemo(() => subjects.find((x) => x.id === subjectId), [subjects, subjectId]);

  // Determine completed papers for lock calculation
  const completedPaperNumbers = useMemo(() => {
    return new Set(
      paperCompletions
        .filter((c) => c.subjectKey === subjectId)
        .map((c) => c.paperNumber),
    );
  }, [paperCompletions, subjectId]);

  // Evaluate paper lock status
  const lockStatus = useMemo(() => {
    if (!paper || paper <= 1) {
      return { isUnlocked: true, isCompleted: false, previousPaperNumber: null, reason: "first_paper" as const };
    }
    return getPaperLockStatus({
      subjectKey: subjectId,
      paperNumber: paper,
      isAdmin,
      completedPaperNumbers,
    });
  }, [paper, subjectId, isAdmin, completedPaperNumbers]);

  // Determine relevant subtopic IDs
  const matchingSubtopicIds = useMemo(() => {
    if (canonicalConfig) {
      return allSubtopics
        .filter((s) => canonicalConfig.patterns.some((p) => p.test(s.name)))
        .map((s) => s.id);
    }
    const children = subjects.filter((s) => s.parentId === subjectId);
    if (children.length > 0) {
      return children.map((c) => c.id);
    }
    return [subjectId];
  }, [canonicalConfig, allSubtopics, subjects, subjectId]);

  // Load 100 MCQs on demand from D1 only if unlocked (saves row reads on locked papers)
  useEffect(() => {
    if (!lockStatus.isUnlocked) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getSubjectModelPaperMcqs({
      data: {
        subjectKey: subjectId,
        subtopicIds: matchingSubtopicIds,
        paperNumber: paper || 1,
        pageSize: 100,
      },
    })
      .then((mcqs) => {
        if (!cancelled) {
          setItems(mcqs as MCQ[]);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load MCQs:", err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subjectId, paper, matchingSubtopicIds, lockStatus.isUnlocked]);

  const displayTitle = useMemo(() => {
    if (paper) {
      return `Paper ${paper}`;
    }
    if (canonicalConfig) {
      return canonicalConfig.label;
    }
    if (subject) {
      return subject.name;
    }
    return "Quiz";
  }, [paper, canonicalConfig, subject]);

  const resolvedSubjectName = useMemo(() => {
    if (canonicalConfig && paper) {
      return `${canonicalConfig.label} — Paper ${paper}`;
    }
    if (canonicalConfig) {
      return canonicalConfig.label;
    }
    if (subject) {
      return subject.name;
    }
    return displayTitle;
  }, [canonicalConfig, paper, subject, displayTitle]);

  const backLink = canonicalConfig ? `/subjects/${canonicalConfig.key}` : "/subjects";
  const uniqueQuizKey = `${subjectId}${paper ? `_paper_${paper}` : ""}`;

  // Route Guard: Locked Screen
  if (!lockStatus.isUnlocked && paper && paper > 1) {
    return (
      <div className="space-y-6 max-w-lg mx-auto py-8">
        <div className="rounded-2xl bg-card border border-border/80 p-6 sm:p-8 text-center shadow-card space-y-4">
          <div className="size-16 mx-auto rounded-2xl bg-muted/80 border border-border flex items-center justify-center shadow-sm">
            <Lock className="size-8 text-muted-foreground" />
          </div>
          <div>
            <div className="text-xs font-semibold text-primary uppercase tracking-wider">
              {canonicalConfig ? canonicalConfig.label : "Subject Paper"}
            </div>
            <h2 className="text-xl sm:text-2xl font-display mt-1">Paper {paper} is Locked</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
              You need to complete Paper {paper - 1} before you can practice Paper {paper}.
            </p>
          </div>
          <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <Link
              to="/quiz/$subjectId"
              params={{ subjectId }}
              search={{ paper: paper - 1 }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow"
            >
              Start Paper {paper - 1}
            </Link>
            <Link
              to={backLink}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-accent border border-border"
            >
              Back to Papers
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">Loading questions...</div>
      </div>
    );
  }

  const handleQuizFinish = async (summary: { score: { correct: number; wrong: number }; total: number; accuracy: number }) => {
    if (paper && paper >= 1) {
      await recordPaperCompletion(subjectId, paper, {
        score: summary.score.correct,
        totalQuestions: summary.total,
        accuracy: summary.accuracy,
      });
      toast.success(`Paper ${paper} completed! Paper ${paper + 1} is now unlocked.`);
    }
  };

  return (
    <div className="space-y-6">
      {!quizCompleted && (
        <div className="flex items-center gap-3">
          {!quizStarted && (
            <Link
              to={backLink}
              className="size-9 rounded-xl border border-border bg-secondary/40 grid place-items-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors shrink-0"
              title={`Back to ${canonicalConfig ? canonicalConfig.label : "subjects"}`}
            >
              <ArrowLeft className="size-4" />
            </Link>
          )}
          <div>
            <div className="text-xs font-semibold text-primary uppercase tracking-wider">
              {canonicalConfig ? canonicalConfig.label : "Practice Paper"}
            </div>
            <h1 className="text-2xl sm:text-3xl font-display">{displayTitle}</h1>
          </div>
        </div>
      )}
      <QuizRunner
        items={items}
        title={displayTitle}
        subtitle={displayTitle}
        resultSubtitle={canonicalConfig ? canonicalConfig.label : subject?.name}
        emptyText="No MCQs found for this paper."
        onStart={() => setQuizStarted(true)}
        onReset={() => {
          setQuizStarted(false);
          setQuizCompleted(false);
        }}
        onComplete={setQuizCompleted}
        onFinish={handleQuizFinish}
        subjectId={uniqueQuizKey}
        subjectName={resolvedSubjectName}
        routePath="/quiz/$subjectId"
        routeParams={{ subjectId }}
        routeSearch={paper ? { paper } : undefined}
        savedState={savedQuiz?.subjectId === uniqueQuizKey ? savedQuiz : null}
        hideTitle={true}
      />
    </div>
  );
}
