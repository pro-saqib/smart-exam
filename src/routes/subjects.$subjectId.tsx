import { createFileRoute, Link } from "@tanstack/react-router";
import { useApp } from "@/store/app-store";
import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, BookOpen, FileText, Eye, Check, X, Pencil, Trash2, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { buildSubjectGroups, getSubjectModelPapers, SUBJECT_KEYWORDS, ModelPaper } from "@/lib/model-papers";
import { getSubjectModelPaperMcqs } from "@/lib/db-actions";
import type { MCQ } from "@/lib/types";

export const Route = createFileRoute("/subjects/$subjectId")({
  head: () => ({
    meta: [
      { title: "Model Papers — PrepMind" },
      { name: "description", content: "Practice 100-MCQ model papers for this subject." },
    ],
  }),
  loader: () => ({}),
  component: SubjectDetailPage,
});

function SubjectDetailPage() {
  const { subjectId } = Route.useParams();
  const context = Route.useRouteContext();
  const isAdmin = (context as any)?.user?.role === "admin";
  const { subjects, mcqs, attempts, renameSubject, deleteSubject } = useApp();

  // 1. Check if subjectId matches a canonical group key (e.g. "english", "general-knowledge")
  const canonicalConfig = useMemo(
    () => SUBJECT_KEYWORDS.find((sk) => sk.key === subjectId),
    [subjectId],
  );

  // All subtopics (have a parentId)
  const allSubtopics = useMemo(() => subjects.filter((s) => !!s.parentId), [subjects]);
  const allGroups = useMemo(() => buildSubjectGroups(allSubtopics), [allSubtopics]);
  const activeGroup = useMemo(
    () => allGroups.find((g) => g.key === subjectId),
    [allGroups, subjectId],
  );

  // Model papers in batches of 100
  const modelPapers = useMemo(() => {
    if (!canonicalConfig && !activeGroup) return [];
    const totalCount = activeGroup?.totalMcqs || 0;
    return getSubjectModelPapers(subjectId, allSubtopics, totalCount, attempts, 100);
  }, [canonicalConfig, activeGroup, subjectId, allSubtopics, attempts]);

  // 2. Or check if it's a regular database subject
  const dbSubject = useMemo(
    () => subjects.find((s) => s.id === subjectId),
    [subjects, subjectId],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [previewPaper, setPreviewPaper] = useState<ModelPaper | null>(null);
  const [previewSubtopicId, setPreviewSubtopicId] = useState<string | null>(null);

  // ── A. CANONICAL SUBJECT MODEL PAPERS VIEW (e.g. /subjects/english) ──
  if (canonicalConfig || activeGroup) {
    const title = canonicalConfig?.label || activeGroup?.label || "Subject";
    const totalMcqs = activeGroup?.totalMcqs || 0;

    return (
      <div className="space-y-6">
        {/* Navigation header */}
        <div className="flex items-center gap-3">
          <Link
            to="/subjects"
            className="p-2 rounded-xl bg-card border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="text-xs font-semibold text-primary uppercase tracking-wider">Model Papers</div>
            <h1 className="text-2xl font-display">{title}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {modelPapers.length} {modelPapers.length === 1 ? "Model Paper" : "Model Papers"} · {totalMcqs.toLocaleString()} MCQs
            </p>
          </div>
        </div>

        {modelPapers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            <BookOpen className="size-8 mx-auto mb-2 text-muted-foreground/50" />
            No model papers available for this subject yet.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {modelPapers.map((paper) => {
              return (
                <div
                  key={paper.paperNumber}
                  className="group relative rounded-xl bg-card border border-border hover:border-primary/50 hover:shadow-glow p-3 shadow-card transition-all duration-200 flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="size-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <FileCheck2 className="size-3.5 text-primary" />
                      </div>
                      <button
                        onClick={() => setPreviewPaper(paper)}
                        className="size-6 rounded-md bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent grid place-items-center transition-colors"
                        title="Preview Questions"
                      >
                        <Eye className="size-3" />
                      </button>
                    </div>

                    <h3 className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-1">
                      {paper.name}
                    </h3>

                    <div className="flex items-center gap-1.5 text-[10px] mt-0.5 text-muted-foreground">
                      <span>{paper.attemptedCount} solved</span>
                      <span>·</span>
                      <span className="font-medium text-foreground">{paper.accuracy}% accuracy</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/50">
                    <Link
                      to="/quiz/$subjectId"
                      params={{ subjectId }}
                      search={{ paper: paper.paperNumber }}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg gradient-primary text-primary-foreground text-xs font-medium shadow-glow transition-all"
                    >
                      <FileText className="size-3" /> Practice
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {previewPaper && (
          <ModelPaperPreviewModal
            title={previewPaper.name}
            paper={previewPaper}
            subjectKey={subjectId}
            onClose={() => setPreviewPaper(null)}
          />
        )}
      </div>
    );
  }

  // ── B. REGULAR DATABASE SUBJECT VIEW ──
  if (!dbSubject) {
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

  const children = subjects.filter((s) => s.parentId === dbSubject.id);
  const totalMcqs = mcqs.filter(
    (m) => m.subjectId === dbSubject.id || children.some((c) => c.id === m.subjectId),
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/subjects" className="p-2 rounded-xl bg-card border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-display">{dbSubject.name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {children.length} subtopics · {totalMcqs} MCQs
          </p>
        </div>
      </div>

      {children.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground space-y-3">
          <BookOpen className="size-8 mx-auto text-muted-foreground/50" />
          <p className="max-w-xs mx-auto">No subtopics yet. Start by importing questions from the MCQ Extractor.</p>
          {isAdmin && (
            <Link
              to="/extractor"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow mx-auto"
            >
              Go to MCQ Extractor
            </Link>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {children.map((child) => {
            const count = mcqs.filter((m) => m.subjectId === child.id).length;
            const relevantAttempts = attempts.filter((a) => a.subjectId === child.id);
            const accuracy = relevantAttempts.length > 0
              ? Math.round((relevantAttempts.filter((a) => a.correct).length / relevantAttempts.length) * 100)
              : 0;

            return (
              <div
                key={child.id}
                className="group relative rounded-2xl bg-card border border-border hover:border-primary/40 p-4 shadow-card transition-all flex flex-col justify-between gap-2.5"
              >
                {editingId === child.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") {
                          await renameSubject(child.id, editName);
                          setEditingId(null);
                          toast.success("Renamed");
                        }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 rounded-md bg-input/60 border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      autoFocus
                    />
                    <button
                      onClick={async () => {
                        await renameSubject(child.id, editName);
                        setEditingId(null);
                        toast.success("Renamed");
                      }}
                      className="p-1.5 rounded-md bg-success/20 text-success hover:bg-success/30"
                    >
                      <Check className="size-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-md bg-muted hover:bg-accent">
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-sm font-medium">{child.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{count} MCQs</p>
                  </div>
                )}

                {editingId !== child.id && (
                  <>
                    <div className="space-y-1">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full gradient-primary transition-all" style={{ width: `${Math.min(100, accuracy)}%` }} />
                      </div>
                      <div className="text-[11px] text-muted-foreground">{accuracy}% accuracy</div>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      {isAdmin ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => { setEditingId(child.id); setEditName(child.name); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
                            title="Rename"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={async () => { await deleteSubject(child.id); toast.success("Deleted"); }}
                            className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"
                            title="Delete"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ) : <div />}
                      <div className="flex items-center gap-1.5">
                        {count > 0 && (
                          <button
                            onClick={() => setPreviewSubtopicId(child.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
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
        <SubtopicPreviewModal subtopicId={previewSubtopicId} onClose={() => setPreviewSubtopicId(null)} />
      )}
    </div>
  );
}

function ModelPaperPreviewModal({ title, paper, subjectKey, onClose }: { title: string; paper: ModelPaper; subjectKey: string; onClose: () => void }) {
  const [mcqs, setMcqs] = useState<MCQ[]>(paper.mcqs || []);
  const [loading, setLoading] = useState(mcqs.length === 0);

  useEffect(() => {
    if (mcqs.length === 0) {
      setLoading(true);
      getSubjectModelPaperMcqs({
        data: {
          subjectKey,
          subtopicIds: paper.subtopicIds,
          paperNumber: paper.paperNumber,
          pageSize: 100,
        },
      })
        .then((data) => {
          setMcqs(data as MCQ[]);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [paper, subjectKey]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-2xl bg-card border border-border shadow-card flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-border flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-primary font-semibold uppercase tracking-wider">Preview Questions</div>
            <h2 className="text-lg font-medium mt-0.5">{title}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-success/15 text-success font-medium">
                <Check className="size-3.5" /> {paper.totalMcqs} MCQs
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-accent text-muted-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>
        <div className="overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="text-center py-10 text-muted-foreground">Loading preview questions...</div>
          ) : (
            <ul className="space-y-3">
              {mcqs.map((q, i) => (
                <li key={q.id} className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="text-sm font-medium">{(paper.paperNumber - 1) * 100 + i + 1}. {q.question}</div>
                  <ul className="mt-2 grid sm:grid-cols-2 gap-1 text-xs">
                    {(["A", "B", "C", "D", "E"] as const).filter((L) => q.options[L]).map((L) => (
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
            <div className="text-xs text-primary font-semibold uppercase tracking-wider">Preview MCQs</div>
            <h2 className="text-lg font-medium mt-0.5">{subtopic?.name || "Paper"}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-success/15 text-success font-medium">
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
            <div className="text-center py-8 text-muted-foreground">No MCQs found.</div>
          ) : (
            <ul className="space-y-3">
              {subtopicMcqs.map((q, i) => (
                <li key={q.id} className="rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="text-sm font-medium">{i + 1}. {q.question}</div>
                  <ul className="mt-2 grid sm:grid-cols-2 gap-1 text-xs">
                    {(["A", "B", "C", "D", "E"] as const).filter((L) => q.options[L]).map((L) => (
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
