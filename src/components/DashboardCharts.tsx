import { useMemo } from "react";
import { useApp } from "@/store/app-store";
import {
  LineChart, Line,
  BarChart, Bar,
  Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { format, subDays, parseISO } from "date-fns";
import { TrendingUp, BarChart3 } from "lucide-react";
import { buildSubjectGroups } from "@/lib/model-papers";

export function DashboardCharts() {
  const { subjects, mcqs, attempts } = useApp();

  const { trend, mastery } = useMemo(() => {
    const subtopics = subjects.filter((s) => !!s.parentId);
    const groups = buildSubjectGroups(subtopics, mcqs);

    // --- 1. Accuracy Trends (Line Chart over last 7 days) ---
    const days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), i)).reverse();
    const dayKeys = days.map((d) => format(d, "yyyy-MM-dd"));
    const daySet = new Set(dayKeys);

    const attemptsByDay = attempts.reduce<Record<string, { correct: number; total: number }>>(
      (acc, a) => {
        const day = format(new Date(a.at), "yyyy-MM-dd");
        if (!daySet.has(day)) return acc;
        if (!acc[day]) acc[day] = { correct: 0, total: 0 };
        acc[day].total += 1;
        if (a.correct) acc[day].correct += 1;
        return acc;
      },
      {}
    );

    const trend = dayKeys.map((day) => {
      const entry = attemptsByDay[day] ?? { correct: 0, total: 0 };
      return {
        date: format(parseISO(day), "MMM d"),
        accuracy: entry.total ? Math.round((entry.correct / entry.total) * 100) : 0,
        attempts: entry.total,
      };
    });

    // Helper to get short name
    const getShortName = (name: string) => {
      const shortMap: Record<string, string> = {
        "Pakistan Study": "P.St",
        "Pakistan Studies": "P.St",
        "Basic Mathematics": "Math",
        "General Knowledge": "G.K",
        "Islamic Study": "I.S",
        "Islamic Studies": "I.S",
        "Current Affairs": "C.A",
        "Everyday Science": "E.Sci",
        "Computer": "Comp",
        "Computer Science": "Comp",
        "English": "Eng",
        "Urdu": "Urdu",
        "Geography": "Geo",
        "GHQ Past": "GHQ",
      };
      return shortMap[name] || name;
    };

    // --- 2. Subject Mastery (Horizontal Bar Chart) ---
    const mastery = groups.map((g) => {
      const groupAttempts = attempts.filter((a) => g.subtopicIds.includes(a.subjectId));
      const acc = groupAttempts.length
        ? Math.round((groupAttempts.filter((x) => x.correct).length / groupAttempts.length) * 100)
        : 0;
      return { subject: getShortName(g.label), accuracy: acc, count: g.totalMcqs, key: g.key };
    });

    return { trend, mastery };
  }, [subjects, mcqs, attempts]);

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      {/* Accuracy Trend */}
      <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="size-4 text-primary-glow" />
          <h3 className="font-semibold">Accuracy Trend</h3>
        </div>
        {trend.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1F2937", borderColor: "#374151" }}
                itemStyle={{ color: "#F3F4F6" }}
                labelStyle={{ color: "#F3F4F6" }}
              />
              <Legend wrapperStyle={{ color: "#D1D5DB" }} />
              <Line type="monotone" dataKey="accuracy" stroke="#4A94FF" strokeWidth={2} dot={{ r: 3 }} name="Accuracy %" />
              <Line type="monotone" dataKey="attempts" stroke="#9CA3AF" strokeWidth={2} dot={{ r: 3 }} name="Attempts" yAxisId="right" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Subject Mastery */}
      <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="size-4 text-primary-glow" />
          <h3 className="font-semibold">Subject Mastery</h3>
        </div>
        {mastery.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={mastery} layout="vertical" margin={{ left: 0, right: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
              <YAxis dataKey="subject" type="category" tick={{ fontSize: 11, fill: "#D1D5DB" }} width={80} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1F2937", borderColor: "#374151" }}
                itemStyle={{ color: "#F3F4F6" }}
                formatter={(val: number) => [`${val}%`, "Accuracy"]}
              />
              <Bar dataKey="accuracy" barSize={14} radius={[0, 4, 4, 0]}>
                {mastery.map((entry, i) => {
                  const c = entry.accuracy < 40 ? "#EF4444" : entry.accuracy < 70 ? "#F59E0B" : "#22C55E";
                  return <Cell key={`cell-${i}`} fill={c} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
