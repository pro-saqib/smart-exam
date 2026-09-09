import { createFileRoute } from "@tanstack/react-router";
import { useApp } from "@/store/app-store";
import { useMemo } from "react";
import { DashboardCharts } from "@/components/DashboardCharts";
import { SavedQuizBanner } from "@/components/SavedQuizBanner";
import { BookOpen, Bookmark, Target, TrendingUp, Sparkles } from "lucide-react";
import { buildSubjectGroups } from "@/lib/model-papers";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — PrepMind" },
      { name: "description", content: "Your study dashboard: subjects, progress, accuracy and bookmarked questions." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { subjects, mcqs, attempts } = useApp();

  const groups = useMemo(() => {
    const subtopics = subjects.filter((s) => !!s.parentId);
    return buildSubjectGroups(subtopics, mcqs);
  }, [subjects, mcqs]);

  const stats = useMemo(() => {
    const correct = attempts.filter((a) => a.correct).length;
    const total = attempts.length;
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    const solveLater = mcqs.filter((m) => m.solveLater).length;
    return { accuracy, solveLater, total };
  }, [mcqs, attempts]);

  return (
    <div className="space-y-8">
      <header>
        <div className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full glass mb-3">
          <Sparkles className="size-3 text-primary-glow" /> Local-first practice workspace
        </div>
        <h1 className="text-3xl md:text-4xl">
          Master <span className="gradient-text">every MCQ</span> on your way to the exam.
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
          Practice MCQs across subjects, track your accuracy, and focus on weak areas with smart filters.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<BookOpen className="size-4" />} label="Subjects" value={groups.length || subjects.length} />
        <StatCard icon={<Target className="size-4" />} label="Total MCQs" value={mcqs.length.toLocaleString()} />
        <StatCard icon={<TrendingUp className="size-4" />} label="Accuracy" value={`${stats.accuracy}%`} sub={`${stats.total} attempts`} />
        <StatCard icon={<Bookmark className="size-4" />} label="Solve Later" value={stats.solveLater} />
      </section>

      <SavedQuizBanner />

      <DashboardCharts />
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl p-5 bg-card border border-border shadow-card">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
      <div className="mt-2 text-2xl font-display font-semibold">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
