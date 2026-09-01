import { useMemo } from "react";
import { useApp } from "@/store/app-store";
import {
  LineChart, Line,
  BarChart, Bar,
  Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie,
  ScatterChart, Scatter, ZAxis,
} from "recharts";
import { format, subDays, parseISO } from "date-fns";
import { TrendingUp, BarChart3, PieChart as PieIcon, GitMerge } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export function DashboardCharts() {
  const { subjects, mcqs, attempts } = useApp();
  const navigate = useNavigate();

  const { trend, mastery, dist, recentSubjects } = useMemo(() => {
    const parents = subjects.filter((s) => !s.parentId);

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
        "Pakistan Studies": "P.St",
        "Basic Mathematics": "M",
        "General Knowledge": "G.K",
        "Islamic Studies": "I.S",
        "Current Affairs": "C.A",
        "Everyday Science": "E.S",
        "Computer Science": "C.S",
        "English": "Eng",
        "Urdu": "Urd",
        "Geography": "Geo",
      };
      return shortMap[name] || name.split(' ').map(word => word[0].toUpperCase()).join('.');
    };

    // --- 2. Subject Mastery (Horizontal Bar Chart) ---
    const mastery = parents.map((s) => {
      const childIds = subjects.filter((c) => c.parentId === s.id).map((c) => c.id);
      const ms = mcqs.filter((m) => m.subjectId === s.id || childIds.includes(m.subjectId));
      const at = attempts.filter((a) => a.subjectId === s.id || childIds.includes(a.subjectId));
      const acc = at.length ? Math.round((at.filter((x) => x.correct).length / at.length) * 100) : 0;
      return { subject: getShortName(s.name), accuracy: acc, count: ms.length };
    });

    // --- 3. Topic Distribution (Donut) ---
    const dist = parents.map((s) => {
      const childIds = subjects.filter((c) => c.parentId === s.id).map((c) => c.id);
      const count = mcqs.filter((m) => m.subjectId === s.id || childIds.includes(m.subjectId)).length;
      const colorMap = ["#4A94FF", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A8", "#F97316"];
      return { subject: getShortName(s.name), count, fill: colorMap[parents.indexOf(s) % colorMap.length] };
    }).filter((d) => d.count > 0);

    // --- 4. Recent Subjects (Top 5 by createdAt) ---
    const recentSubjects = subjects
      .filter((s) => !s.parentId)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 5)
      .map((s) => {
        const childIds = subjects.filter((c) => c.parentId === s.id).map((c) => c.id);
        const ms = mcqs.filter((m) => m.subjectId === s.id || childIds.includes(m.subjectId));
        const at = attempts.filter((a) => a.subjectId === s.id || childIds.includes(a.subjectId));
        const acc = at.length ? Math.round((at.filter((x) => x.correct).length / at.length) * 100) : 0;
        return { id: s.id, name: s.name, count: ms.length, accuracy: acc };
      });

    return { trend, mastery, dist, recentSubjects };
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
              <YAxis dataKey="subject" type="category" tick={{ fontSize: 11, fill: "#D1D5DB" }} width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1F2937", borderColor: "#374151" }}
                itemStyle={{ color: "#F3F4F6" }}
                formatter={(val: number) => [`${val}%`, "Accuracy"]}
              />
              <Bar dataKey="accuracy" barSize={18} radius={[0, 4, 4, 0]}>
                {mastery.map((entry, i) => {
                  const c = entry.accuracy < 40 ? "#EF4444" : entry.accuracy < 70 ? "#F59E0B" : "#22C55E";
                  return <Cell key={`cell-${i}`} fill={c} />;
                })}
              </Bar>
          </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Topic Distribution (50% width) */}
      <div className="flex flex-col rounded-2xl bg-card border border-border p-6 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <PieIcon className="size-4 text-primary-glow" />
          <h3 className="font-semibold">Topic Distribution</h3>
        </div>
        <div className="flex-1 min-h-0">
          {dist.length > 0 && (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={dist}
                  dataKey="count"
                  nameKey="subject"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  fill="#4A94FF"
                  label={({ name }) => name}
                  labelLine={{ stroke: "#6B7280", strokeWidth: 1 }}
                >
                  {dist.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "#1F2937", borderColor: "#374151" }}
                  itemStyle={{ color: "#F3F4F6" }}
                  formatter={(val: number, name: string) => [`${val} MCQs`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent Subjects (50% width, scrollable) */}
      <div className="flex flex-col rounded-2xl bg-card border border-border p-6 shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="size-4 text-primary-glow" />
          <h3 className="font-semibold">Recent Subjects</h3>
        </div>
        <div className="flex-1 min-h-0 max-h-[260px] overflow-y-auto pr-1 space-y-2">
          {recentSubjects.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate({ to: "/subjects/$subjectId", params: { subjectId: s.id } })}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.count} MCQs</div>
              </div>
              <div className="ml-4 text-right">
                <div className="text-sm font-medium">{s.accuracy}%</div>
                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full gradient-primary transition-all"
                    style={{ width: `${Math.min(100, s.accuracy)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
          {recentSubjects.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">No subjects yet</div>
          )}
        </div>
      </div>
    </section>
  );
}
