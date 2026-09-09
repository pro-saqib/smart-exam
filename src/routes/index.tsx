import { createFileRoute } from "@tanstack/react-router";
import { useApp } from "@/store/app-store";
import { useMemo } from "react";
import { DashboardCharts } from "@/components/DashboardCharts";
import { SavedQuizBanner } from "@/components/SavedQuizBanner";
import { BookOpen, Target, TrendingUp, Sparkles, Flame } from "lucide-react";
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
    return { accuracy, total };
  }, [attempts]);

  // Daily streak calculation
  const streakStats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

    const todayAttempts = attempts.filter((a) => a.at >= startOfToday).length;

    // Calculate active streak days
    const daysWithAttempts = new Set<string>();
    for (const a of attempts) {
      const d = new Date(a.at);
      daysWithAttempts.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
    }

    let streak = 0;
    let checkDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Check if practiced today or yesterday to maintain streak
    const todayKey = `${checkDay.getFullYear()}-${checkDay.getMonth() + 1}-${checkDay.getDate()}`;
    const practicedToday = daysWithAttempts.has(todayKey);

    if (!practicedToday) {
      // Step back 1 day to see if streak from yesterday is intact
      checkDay = new Date(startOfYesterday);
    }

    while (true) {
      const key = `${checkDay.getFullYear()}-${checkDay.getMonth() + 1}-${checkDay.getDate()}`;
      if (daysWithAttempts.has(key)) {
        streak += 1;
        checkDay.setDate(checkDay.getDate() - 1);
      } else {
        break;
      }
    }

    return {
      streak,
      todayAttempts,
    };
  }, [attempts]);

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

      {/* Modern Stats Row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<BookOpen className="size-5" />}
          label="Subjects"
          value={groups.length || subjects.length}
          sub={`${mcqs.length.toLocaleString()} curated questions`}
          color="primary"
        />
        <StatCard
          icon={<Target className="size-5" />}
          label="Total MCQs"
          value={mcqs.length.toLocaleString()}
          sub="10 core exam topics"
          color="indigo"
        />
        <StatCard
          icon={<TrendingUp className="size-5" />}
          label="Accuracy"
          value={`${stats.accuracy}%`}
          sub={`${stats.total} total attempts`}
          color="emerald"
        />
        <StatCard
          icon={<Flame className="size-5" />}
          label="Daily Streak"
          value={`${streakStats.streak} ${streakStats.streak === 1 ? "Day" : "Days"}`}
          sub={`${streakStats.todayAttempts} of 500 solved today`}
          color="amber"
        />
      </section>

      <SavedQuizBanner />

      <DashboardCharts />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color = "primary",
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  color?: "primary" | "indigo" | "emerald" | "amber";
}) {
  const colorStyles = {
    primary: "bg-primary/10 text-primary border-primary/20",
    indigo: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.15)]",
  }[color];

  return (
    <div className="group relative rounded-2xl p-5 bg-card border border-border shadow-card hover:border-border/80 transition-all hover:shadow-lg overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className={`size-9 rounded-xl grid place-items-center border ${colorStyles} transition-transform group-hover:scale-105`}>
          {icon}
        </div>
      </div>
      <div className="mt-3 text-2xl md:text-3xl font-display font-bold tracking-tight">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</div>}
    </div>
  );
}
