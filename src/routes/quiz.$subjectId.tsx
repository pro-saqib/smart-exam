import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useApp } from "@/store/app-store";
import { QuizRunner } from "@/components/QuizRunner";
import { SavedQuizBanner } from "@/components/SavedQuizBanner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/quiz/$subjectId")({
  component: QuizPage,
});

function QuizPage() {
  const { subjectId } = Route.useParams();
  const subjects = useApp((s) => s.subjects);
  const mcqs = useApp((s) => s.mcqs);
  const savedQuiz = useApp((s) => s.savedQuiz);
  const subject = useMemo(() => subjects.find((x) => x.id === subjectId), [subjects, subjectId]);
  const items = useMemo(() => mcqs.filter((m) => m.subjectId === subjectId), [mcqs, subjectId]);

  const subtopics = useMemo(() => subjects.filter((s) => s.parentId === subjectId), [subjects, subjectId]);

  const mcqsBySubtopic = useMemo(() => {
    const map: Record<string, typeof mcqs> = {};
    for (const sub of subtopics) {
      map[sub.id] = mcqs.filter((m) => m.subjectId === sub.id);
    }
    return map;
  }, [mcqs, subtopics]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/subjects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to subjects
        </Link>
      </div>
      <div>
        <div className="text-xs text-primary-glow uppercase tracking-wider">Practice</div>
        <h1 className="text-3xl">{subject?.name ?? "Subject"}</h1>
      </div>
      <QuizRunner
        items={items}
        title="Quiz"
        emptyText="No MCQs yet — import from the MCQ Extractor."
        subtopics={subtopics}
        mcqsBySubtopic={mcqsBySubtopic}
        subjectId={subjectId}
        savedState={savedQuiz?.subjectId === subjectId ? savedQuiz : null}
      />
    </div>
  );
}
