import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useApp } from "@/store/app-store";
import { QuizRunner } from "@/components/QuizRunner";

export const Route = createFileRoute("/solve-later")({
  head: () => ({
    meta: [
      { title: "Solve Later — PrepMind" },
      { name: "description", content: "Bookmarked MCQs you saved to revisit later." },
    ],
  }),
  component: SolveLaterPage,
});

function SolveLaterPage() {
  const mcqs = useApp((s) => s.mcqs);
  const items = useMemo(() => mcqs.filter((m) => m.solveLater), [mcqs]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Solve Later</h1>
        <p className="text-muted-foreground mt-1">{items.length} bookmarked question{items.length === 1 ? "" : "s"}.</p>
      </div>
      <QuizRunner items={items} title="Bookmarked" emptyText="No bookmarks yet — tap the bookmark icon during practice to save tough questions." />
    </div>
  );
}
