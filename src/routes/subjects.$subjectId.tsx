import { createFileRoute, Link } from "@tanstack/react-router";
import { useApp } from "@/store/app-store";
import { useMemo, useState } from "react";
import { Pencil, Trash2, Check, X, ArrowLeft, BookOpen, FileText, Eye } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/subjects/$subjectId")({
  head: () => ({
    meta: [
      { title: "Subject — PrepMind" },
      { name: "description", content: "Manage subtopics, upload files, and practice MCQs for this subject." },
    ],
  }),
  loader: () => ({}),
  component: SubjectDetailPage,
});

function SubjectDetailPage() {
  const { subjectId } = Route.useParams();
  const { subjects, mcqs, attempts, addSubject, renameSubject, deleteSubject, addMCQs } = useApp();
  const subject = useMemo(() => subjects.find((s) => s.id === subjectId), [subjects, subjectId]);

  const children = useMemo(
    () => subjects.filter((s) => s.parentId === subjectId),
    [subjects, subjectId],
  );

  const childStats = useMemo(() => {
    const map: Record<string, { totalAttempts: number; correctAttempts: number }> = {};
    for (const c of children) {
      const relevantAttempts = attempts.filter((a) => a.subjectId === c.id);
      map[c.id] = {
        totalAttempts: relevantAttempts.length,
        correctAttempts: relevantAttempts.filter((a) => a.correct).length,
      };
    }
    return map;
  }, [children, attempts]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewSubtopicId, setPreviewSubtopicId] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(children.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const deleteSelected = () => {
    const count = selectedIds.size;
    if (count === 0) return;
    const ids = Array.from(selectedIds);
    for (const id of ids) deleteSubject(id);
    setSelectedIds(new Set());
    toast.success(`${count} subtopic(s) deleted`);
  };


  if (!subject) {
    return (
      <div className="space-y-6">
        <Link to="/subjects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to subjects
        </Link>
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          Subject not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/subjects" className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-display">{subject.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {children.length} subtopic{children.length === 1 ? "" : "s"} &middot;{" "}
            {mcqs.filter((m) => m.subjectId === subjectId || children.some((c) => c.id === m.subjectId)).length} total MCQs
          </p>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/30">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <button
            onClick={deleteSelected}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/20 text-destructive text-xs font-medium hover:bg-destructive/30"
          >
            <Trash2 className="size-3.5" /> Delete selected
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground ml-auto">
            Clear selection
          </button>
        </div>
      )}

      {children.length > 0 && (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Subtopics</h2>
          {children.length > 1 && (
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedIds.size === children.length}
                onChange={(e) => toggleSelectAll(e.target.checked)}
                className="size-4 accent-primary rounded"
              />
              Select all
            </label>
          )}
        </div>
      )}

      {children.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground space-y-3">
          <BookOpen className="size-8 mx-auto text-muted-foreground/50" />
          <p className="max-w-xs mx-auto">No subtopics yet. Start by importing questions from the MCQ Extractor.</p>
          <Link
            to="/extractor"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow mx-auto"
          >
            Go to MCQ Extractor
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {children.map((child) => {
            const count = mcqs.filter((m) => m.subjectId === child.id).length;
            const isSelected = selectedIds.has(child.id);
            const stats = childStats[child.id] || { totalAttempts: 0, correctAttempts: 0 };
            const accuracy = stats.totalAttempts > 0 ? Math.round((stats.correctAttempts / stats.totalAttempts) * 100) : 0;
            return (
              <div
                key={child.id}
                className={`group rounded-2xl bg-card border p-5 shadow-card transition-all ${
                  isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                {editingId === child.id ? (
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { renameSubject(child.id, editName); setEditingId(null); toast.success("Renamed"); }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 rounded-md bg-input/60 border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      autoFocus
                    />
                    <button
                      onClick={() => { renameSubject(child.id, editName); setEditingId(null); toast.success("Renamed"); }}
                      className="p-1.5 rounded-md bg-success/20 text-success hover:bg-success/30"
                    ><Check className="size-4" /></button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-md bg-muted hover:bg-accent">
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 mb-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(child.id)}
                      className="mt-0.5 size-4 accent-primary rounded"
                    />
                    <div className="flex-1">
                      <h3 className="text-sm font-medium">{child.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{count} MCQs</p>
                    </div>
                  </div>
                )}

                {editingId !== child.id && (
                  <>
                    <div className="mb-3">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full gradient-primary transition-all"
                          style={{ width: `${Math.min(100, accuracy)}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{accuracy}% accuracy</div>
                    </div>

                    <div className="flex items-center justify-between pt-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => { setEditingId(child.id); setEditName(child.name); }}
                          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
                          title="Rename"
                        ><Pencil className="size-4" /></button>
                        <button
                          onClick={() => {
                            deleteSubject(child.id);
                            toast.success("Deleted");
                          }}
                          className="p-2 rounded-lg text-destructive hover:bg-destructive/10"
                          title="Delete"
                        ><Trash2 className="size-4" /></button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {count > 0 && (
                          <button
                            onClick={() => setPreviewSubtopicId(child.id)}
                            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
                            title="Quick View"
                          >
                            <Eye className="size-4" />
                          </button>
                        )}
                        {count > 0 && (
                          <Link
                            to="/quiz/$subjectId"
                            params={{ subjectId: child.id }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground text-xs font-medium shadow-glow"
                            title="Practice"
                          >
                            <FileText className="size-3.5" /> Practice
                          </Link>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {previewSubtopicId && (
        <SubtopicPreviewModal
          subtopicId={previewSubtopicId}
          onClose={() => setPreviewSubtopicId(null)}
        />
      )}
    </div>
  );
}

function SubtopicPreviewModal({ subtopicId, onClose }: { subtopicId: string; onClose: () => void }) {
  const { subjects, mcqs } = useApp();
  const subtopic = subjects.find((s) => s.id === subtopicId);
  const subtopicMcqs = useMemo(() => mcqs.filter((m) => m.subjectId === subtopicId), [mcqs, subtopicId]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-2xl bg-card border border-border shadow-card flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-border flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-primary-glow uppercase tracking-wider">Preview MCQs</div>
            <h2 className="text-lg font-medium mt-0.5">{subtopic?.name || "Subtopic"}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-success/15 text-success">
                <Check className="size-3.5" /> {subtopicMcqs.length} MCQs
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-accent text-muted-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>

        <div className="overflow-y-auto p-5 space-y-4">
          {subtopicMcqs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No MCQs found in this subtopic.</div>
          ) : (
            <ul className="space-y-3">
              {subtopicMcqs.map((q, i) => (
                <li key={q.id} className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="text-sm font-medium">{i + 1}. {q.question}</div>
                  <ul className="mt-2 grid sm:grid-cols-2 gap-1 text-xs">
                    {(["A", "B", "C", "D", "E"] as const)
                      .filter((L) => q.options[L])
                      .map((L) => (
                      <li
                        key={L}
                        className={`px-2 py-1 rounded ${q.correct === L ? "bg-success/15 text-success font-medium" : "text-muted-foreground"}`}
                      >
                        <span className="font-mono">{L}.</span> {q.options[L]}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="p-4 border-t border-border flex items-center justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-accent">
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
