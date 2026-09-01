import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, BookOpen, Bookmark, Brain, Sparkles, PanelLeft, ScanSearch } from "lucide-react";
import { useApp } from "@/store/app-store";
import { useEffect, useState } from "react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/subjects", label: "Subjects", icon: BookOpen },
  { to: "/extractor", label: "MCQ Extractor", icon: ScanSearch },
  { to: "/practice", label: "Practice", icon: Brain },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar_hidden") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("sidebar_hidden", hidden ? "1" : "0");
    } catch {}
  }, [hidden]);

  return (
    <div className="min-h-screen flex">
      {!hidden && (
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
        <div className="px-4 py-3">
          <button
            onClick={() => setHidden(true)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm bg-card border border-border hover:bg-accent"
          >
            <PanelLeft className="size-4 rotate-180" />
            Hide
          </button>
        </div>
      </aside>
      )}

      {hidden && (
        <div className="hidden md:flex fixed left-2 top-1/2 z-40 -translate-y-1/2">
          <button
            onClick={() => setHidden(false)}
            className="inline-flex items-center justify-center rounded-full p-2 bg-card border border-border hover:bg-accent shadow"
            title="Show sidebar"
          >
            <PanelLeft className="size-4" />
          </button>
        </div>
      )}

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
