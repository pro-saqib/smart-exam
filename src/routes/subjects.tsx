import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useApp } from "@/store/app-store";
import { useMemo } from "react";
import { buildSubjectGroups } from "@/lib/model-papers";
import {
  ChevronRight,
  BookOpen,
  Calculator,
  Laptop,
  Globe2,
  Microscope,
  Compass,
  Moon,
  Landmark,
  Languages,
  Newspaper,
  GraduationCap,
} from "lucide-react";

export const Route = createFileRoute("/subjects")({
  head: () => ({
    meta: [
      { title: "Subjects — PrepMind" },
      { name: "description", content: "Browse and practice past papers by subject." },
    ],
  }),
  component: SubjectsPage,
});

function SubjectsPage() {
  const matchRoute = useMatchRoute();
  const isSubjectDetail = matchRoute({ to: "/subjects/$subjectId" });

  if (isSubjectDetail) {
    return <Outlet />;
  }

  return <SubjectsList />;
}

function getSubjectIcon(key: string) {
  switch (key) {
    case "basic-mathematics":
      return <Calculator className="size-5 text-primary" />;
    case "computer":
      return <Laptop className="size-5 text-primary" />;
    case "current-affairs":
      return <Newspaper className="size-5 text-primary" />;
    case "everyday-science":
      return <Microscope className="size-5 text-primary" />;
    case "general-knowledge":
      return <Globe2 className="size-5 text-primary" />;
    case "geography":
      return <Compass className="size-5 text-primary" />;
    case "islamic-study":
      return <Moon className="size-5 text-primary" />;
    case "pakistan-study":
      return <Landmark className="size-5 text-primary" />;
    case "english":
      return <Languages className="size-5 text-primary" />;
    case "urdu":
      return <GraduationCap className="size-5 text-primary" />;
    default:
      return <BookOpen className="size-5 text-primary" />;
  }
}

function SubjectsList() {
  const { subjects, mcqs, attempts } = useApp();

  // All subtopics (have a parentId)
  const subtopics = useMemo(() => subjects.filter((s) => !!s.parentId), [subjects]);

  // Group subtopics by canonical subject name
  const groups = useMemo(() => buildSubjectGroups(subtopics, mcqs), [subtopics, mcqs]);

  // Total MCQs across all groups
  const totalMcqCount = useMemo(
    () => groups.reduce((acc, g) => acc + g.totalMcqs, 0),
    [groups],
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-display">Subjects</h1>
        <p className="text-muted-foreground mt-1">
          {groups.length} subjects · {totalMcqCount.toLocaleString()} total MCQs
        </p>
      </header>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <BookOpen className="size-8 mx-auto mb-2 text-muted-foreground/50" />
          No subjects loaded yet.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {groups.map((group) => {
            const groupAttempts = attempts.filter((a) => group.subtopicIds.includes(a.subjectId));
            const attemptedCount = new Set(groupAttempts.map((a) => a.mcqId)).size;
            const accuracy = groupAttempts.length > 0
              ? Math.round((groupAttempts.filter((a) => a.correct).length / groupAttempts.length) * 100)
              : 0;
            const modelPaperCount = Math.ceil(group.totalMcqs / 100);

            return (
              <Link
                key={group.key}
                to="/subjects/$subjectId"
                params={{ subjectId: group.key }}
                className="group relative rounded-2xl bg-card border border-border hover:border-primary/50 hover:shadow-glow p-4 shadow-card transition-all duration-200 flex flex-col justify-between gap-3.5"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="size-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                      {getSubjectIcon(group.key)}
                    </div>
                    <div className="size-6 rounded-lg bg-secondary text-muted-foreground group-hover:text-foreground group-hover:bg-accent grid place-items-center transition-colors">
                      <ChevronRight className="size-3.5" />
                    </div>
                  </div>

                  <h2 className="font-semibold text-sm sm:text-base group-hover:text-primary transition-colors">
                    {group.label}
                  </h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {modelPaperCount} Model {modelPaperCount === 1 ? "Paper" : "Papers"} · {group.totalMcqs.toLocaleString()} MCQs
                  </p>
                </div>

                <div className="pt-2.5 border-t border-border/50 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{attemptedCount} solved</span>
                    <span className="font-medium text-foreground">{accuracy}% accuracy</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full gradient-primary transition-all duration-300"
                      style={{ width: `${Math.min(100, accuracy)}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
