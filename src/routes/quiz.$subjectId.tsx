import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useApp } from "@/store/app-store";
import { QuizRunner } from "@/components/QuizRunner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { SUBJECT_KEYWORDS } from "@/lib/model-papers";
import { getSubjectModelPaperMcqs } from "@/lib/db-actions";
import type { MCQ } from "@/lib/types";

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
  const subjects = useApp((s) => s.subjects);
  const savedQuiz = useApp((s) => s.savedQuiz);

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

  // Load 100 MCQs on demand from D1
  useEffect(() => {
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
  }, [subjectId, paper, matchingSubtopicIds]);

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">Loading questions...</div>
      </div>
    );
  }

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
