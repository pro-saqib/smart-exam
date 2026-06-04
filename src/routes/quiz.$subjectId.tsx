import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useApp } from "@/store/app-store";
import { QuizRunner } from "@/components/QuizRunner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/quiz/$subjectId")({
  component: QuizPage,
});

function QuizPage() {
  const { subjectId } = Route.useParams();
  const subjects = useApp((s) => s.subjects);
  const mcqs = useApp((s) => s.mcqs);
  const subject = useMemo(() => subjects.find((x) => x.id === subjectId), [subjects, subjectId]);
  const items = useMemo(() => mcqs.filter((m) => m.subjectId === subjectId), [mcqs, subjectId]);

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
      <QuizRunner items={items} title={subject?.name ?? ""} emptyText="No MCQs yet — upload a PDF on the Subjects page." />
    </div>
  );
}
