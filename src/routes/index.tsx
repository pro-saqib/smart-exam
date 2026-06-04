import { createFileRoute, Link } from "@tanstack/react-router";
import { useApp } from "@/store/app-store";
import { useMemo } from "react";
import { BookOpen, Bookmark, Target, TrendingUp, Sparkles, ArrowRight } from "lucide-react";

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
  const stats = useMemo(() => {
    const attempted = mcqs.filter((m) => m.attemptCount > 0).length;
    const correct = attempts.filter((a) => a.correct).length;
    const total = attempts.length;
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    const solveLater = mcqs.filter((m) => m.solveLater).length;
    const bySubj = subjects.map((s) => {
      const ms = mcqs.filter((m) => m.subjectId === s.id);
      const at = attempts.filter((a) => a.subjectId === s.id);
      const acc = at.length ? Math.round((at.filter((x) => x.correct).length / at.length) * 100) : 0;
      return { subject: s, count: ms.length, attempts: at.length, accuracy: acc };
    });
    const weak = [...bySubj].filter((x) => x.attempts >= 3).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
    return { attempted, accuracy, solveLater, bySubj, weak, total };
  }, [subjects, mcqs, attempts]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full glass mb-3">
            <Sparkles className="size-3 text-primary-glow" /> Local-first practice workspace
          </div>
          <h1 className="text-3xl md:text-4xl">
            Master <span className="gradient-text">every MCQ</span> on your way to the exam.
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Upload PDFs, organize by subject, and practice with smart filters and bookmarks.
          </p>
        </div>
        <Link
          to="/subjects"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow hover:opacity-95"
        >
          Add subject & PDFs <ArrowRight className="size-4" />
        </Link>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<BookOpen className="size-4" />} label="Subjects" value={subjects.length} />
        <StatCard icon={<Target className="size-4" />} label="Total MCQs" value={mcqs.length} />
        <StatCard icon={<TrendingUp className="size-4" />} label="Accuracy" value={`${stats.accuracy}%`} sub={`${stats.total} attempts`} />
        <StatCard icon={<Bookmark className="size-4" />} label="Solve Later" value={stats.solveLater} />
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg">Your subjects</h2>
          <Link to="/subjects" className="text-xs text-primary-glow hover:underline">Manage →</Link>
        </div>
        {subjects.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.bySubj.map(({ subject, count, accuracy }) => (
              <Link
                key={subject.id}
                to="/quiz/$subjectId"
                params={{ subjectId: subject.id }}
                className="group rounded-2xl p-5 bg-card border border-border hover:border-primary/60 transition-all shadow-card hover:shadow-glow"
              >
                <div className="flex items-start justify-between">
                  <h3 className="text-base font-medium">{subject.name}</h3>
                  <span className="text-[11px] text-muted-foreground">{count} MCQs</span>
                </div>
                <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full gradient-primary transition-all"
                    style={{ width: `${Math.min(100, accuracy)}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{accuracy}% accuracy</span>
                  <span className="text-primary-glow opacity-0 group-hover:opacity-100 transition">Practice →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {stats.weak.length > 0 && (
        <section>
          <h2 className="text-lg mb-3">Weak areas</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {stats.weak.map((w) => (
              <div key={w.subject.id} className="rounded-xl glass p-4">
                <div className="text-sm font-medium">{w.subject.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{w.accuracy}% over {w.attempts} attempts</div>
              </div>
            ))}
          </div>
        </section>
      )}
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

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center bg-card/40">
      <div className="size-12 rounded-2xl gradient-primary mx-auto grid place-items-center shadow-glow">
        <BookOpen className="size-6 text-primary-foreground" />
      </div>
      <h3 className="mt-4 text-lg">Start with your first subject</h3>
      <p className="text-sm text-muted-foreground mt-1">Create a subject and upload your MCQ PDFs to begin.</p>
      <Link
        to="/subjects"
        className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow"
      >
        Create subject <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
