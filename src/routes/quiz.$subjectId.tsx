import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useApp } from "@/store/app-store";
import { QuizRunner } from "@/components/QuizRunner";
import { ArrowLeft } from "lucide-react";
import { getModelPaperMcqs, getSubjectAllMcqs, SUBJECT_KEYWORDS } from "@/lib/model-papers";

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
  const mcqs = useApp((s) => s.mcqs);
  const savedQuiz = useApp((s) => s.savedQuiz);

  // Check if subjectId is a canonical group key (e.g. "english", "computer")
  const canonicalConfig = useMemo(
    () => SUBJECT_KEYWORDS.find((sk) => sk.key === subjectId),
    [subjectId],
  );

  // All subtopics (have a parentId)
  const allSubtopics = useMemo(() => subjects.filter((s) => !!s.parentId), [subjects]);

  // Model paper data if paper param is provided or if it's a canonical group
  const modelPaperData = useMemo(() => {
    if (paper) {
      return getModelPaperMcqs(subjectId, allSubtopics, mcqs, paper, 100);
    }
    return null;
  }, [paper, subjectId, allSubtopics, mcqs]);

  const subject = useMemo(() => subjects.find((x) => x.id === subjectId), [subjects, subjectId]);

  // Standard subject items fallback
  const items = useMemo(() => {
    if (modelPaperData) {
      return modelPaperData.mcqs;
    }
    if (canonicalConfig) {
      return getSubjectAllMcqs(subjectId, allSubtopics, mcqs);
    }
    return mcqs.filter((m) => m.subjectId === subjectId);
  }, [modelPaperData, canonicalConfig, subjectId, allSubtopics, mcqs]);

  const subtopics = useMemo(() => subjects.filter((s) => s.parentId === subjectId), [subjects, subjectId]);

  const mcqsBySubtopic = useMemo(() => {
    const map: Record<string, typeof mcqs> = {};
    for (const sub of subtopics) {
      map[sub.id] = mcqs.filter((m) => m.subjectId === sub.id);
    }
    return map;
  }, [mcqs, subtopics]);

  // Determine display title
  const displayTitle = useMemo(() => {
    if (modelPaperData) {
      return modelPaperData.name;
    }
    if (canonicalConfig) {
      return canonicalConfig.label;
    }
    if (subject) {
      return subject.name;
    }
    return "Quiz";
  }, [modelPaperData, canonicalConfig, subject]);

  const resolvedSubjectName = useMemo(() => {
    if (canonicalConfig && modelPaperData) {
      return `${canonicalConfig.label} — ${modelPaperData.name}`;
    }
    if (canonicalConfig) {
      return canonicalConfig.label;
    }
    if (subject) {
      return subject.name;
    }
    return displayTitle;
  }, [canonicalConfig, modelPaperData, subject, displayTitle]);

  const backLink = canonicalConfig ? `/subjects/${canonicalConfig.key}` : "/subjects";
  const uniqueQuizKey = `${subjectId}${paper ? `_paper_${paper}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to={backLink}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" /> Back to {canonicalConfig ? canonicalConfig.label : "subjects"}
        </Link>
      </div>
      <div>
        <div className="text-xs font-semibold text-primary uppercase tracking-wider">
          {canonicalConfig ? canonicalConfig.label : "Practice Paper"}
        </div>
        <h1 className="text-3xl font-display">{displayTitle}</h1>
      </div>
      <QuizRunner
        items={items}
        title={displayTitle}
        emptyText="No MCQs found for this paper."
        subtopics={subtopics}
        mcqsBySubtopic={mcqsBySubtopic}
        subjectId={uniqueQuizKey}
        subjectName={resolvedSubjectName}
        routePath="/quiz/$subjectId"
        routeParams={{ subjectId }}
        routeSearch={paper ? { paper } : undefined}
        savedState={savedQuiz?.subjectId === uniqueQuizKey ? savedQuiz : null}
      />
    </div>
  );
}
