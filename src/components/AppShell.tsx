import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, BookOpen, Bookmark, Brain, Sparkles } from "lucide-react";
import { useApp } from "@/store/app-store";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/subjects", label: "Subjects", icon: BookOpen },
  { to: "/practice", label: "Practice", icon: Brain },
  { to: "/solve-later", label: "Solve Later", icon: Bookmark },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const solveCount = useApp((s) => s.mcqs.filter((m) => m.solveLater).length);

  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar/80 backdrop-blur-xl border-r border-sidebar-border">
        <div className="px-6 py-6 flex items-center gap-2">
          <div className="size-9 rounded-xl gradient-primary grid place-items-center shadow-glow">
            <Sparkles className="size-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display font-semibold text-base leading-tight">PrepMind</div>
            <div className="text-[11px] text-muted-foreground">MCQ Practice Suite</div>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV.map((item) => {
            const active = item.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-card"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <Icon className={`size-4 ${active ? "text-primary-glow" : ""}`} />
                <span className="flex-1">{item.label}</span>
                {item.to === "/solve-later" && solveCount > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary-glow">
                    {solveCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-4">
          <div className="rounded-xl glass p-4">
            <div className="text-xs text-muted-foreground">Local-first</div>
            <div className="text-sm mt-1">Your data stays on this device.</div>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 glass border-b border-border px-4 py-3 flex items-center gap-2">
        <div className="size-8 rounded-lg gradient-primary grid place-items-center">
          <Sparkles className="size-4 text-primary-foreground" />
        </div>
        <div className="font-display font-semibold">PrepMind</div>
      </div>

      <main className="flex-1 min-w-0 pt-14 md:pt-0 pb-24 md:pb-0">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 glass border-t border-border grid grid-cols-4">
        {NAV.map((item) => {
          const active = item.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${
                active ? "text-primary-glow" : "text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
