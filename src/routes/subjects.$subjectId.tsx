import { createFileRoute, Link } from "@tanstack/react-router";
import { useApp } from "@/store/app-store";
import { useMemo, useRef, useState } from "react";
import { Plus, Upload, Pencil, Trash2, FileText, Loader2, Check, X, AlertTriangle, CheckCircle2, FileWarning, ArrowLeft, BookOpen } from "lucide-react";
import { extractTextFromPdf, parseMCQs } from "@/lib/pdf-parser";
import { validateTxtMCQs, type TxtParseResult } from "@/lib/txt-parser";
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

  const [newSubName, setNewSubName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<{
    subjectId: string;
    fileName: string;
    result: TxtParseResult;
  } | null>(null);

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

  const addSubTopic = () => {
    const name = newSubName.trim();
    if (!name) return;
    addSubject(name, subjectId);
    setNewSubName("");
    toast.success(`Sub-topic "${name}" added`);
  };

  const handleFiles = async (targetSubjectId: string, files: FileList | null) => {
    if (!files || !files.length) return;
    setBusyId(targetSubjectId);
    let total = 0;
    let txtToPreview: { file: File; result: TxtParseResult } | null = null;
    try {
      for (const file of Array.from(files)) {
        const name = file.name.toLowerCase();
        const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";
        if (isPdf) {
          const text = await extractTextFromPdf(file);
          const parsed = parseMCQs(text);
          if (parsed.length > 100) {
            const base = subjects.find((x) => x.id === targetSubjectId)?.name || "Subject";
            const addedMain = addMCQs(targetSubjectId, parsed.map((p) => ({ question: p.question, options: p.options, correct: p.correct })));
            total += addedMain;
            if (addedMain) toast.success(`${file.name}: imported ${addedMain} MCQs into ${base}`);
            for (let i = 0; i < parsed.length; i += 100) {
              const chunk = parsed.slice(i, i + 100);
              const start = i + 1;
              const end = i + chunk.length;
              const newSub = addSubject(`${base} ${start}-${end}`, targetSubjectId);
              const added = addMCQs(newSub.id, chunk.map((p) => ({ question: p.question, options: p.options, correct: p.correct })));
              total += added;
              toast.success(`${file.name}: created ${newSub.name} with ${added} MCQs`);
            }
          } else {
            const added = addMCQs(targetSubjectId, parsed.map((p) => ({ question: p.question, options: p.options, correct: p.correct })));
            total += added;
            toast.success(`${file.name}: imported ${added} MCQs`);
          }
        } else {
          const text = await file.text();
          const result = validateTxtMCQs(text);
          if (!txtToPreview) txtToPreview = { file, result };
          else toast.message(`${file.name} skipped — review one .txt file at a time.`);
        }
      }
      if (txtToPreview) {
        setPreview({ subjectId: targetSubjectId, fileName: txtToPreview.file.name, result: txtToPreview.result });
      } else if (total === 0) {
        toast.message("No MCQs detected — ensure questions follow a numbered A/B/C/D format.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to parse file");
    } finally {
      setBusyId(null);
      const el = fileRefs.current[targetSubjectId];
      if (el) el.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmTxtImport = () => {
    if (!preview) return;
    const parsed = preview.result.valid;
    if (parsed.length > 100) {
      const base = subjects.find((x) => x.id === preview.subjectId)?.name || "Subject";
      const addedMain = addMCQs(preview.subjectId, parsed.map((p) => ({ question: p.question, options: p.options, correct: p.correct })));
      let totalAdded = addedMain;
      if (addedMain) toast.success(`${preview.fileName}: imported ${addedMain} MCQs into ${base}`);
      for (let i = 0; i < parsed.length; i += 100) {
        const chunk = parsed.slice(i, i + 100);
        const start = i + 1;
        const end = i + chunk.length;
        const newSub = addSubject(`${base} ${start}-${end}`, preview.subjectId);
        const added = addMCQs(newSub.id, chunk.map((p) => ({ question: p.question, options: p.options, correct: p.correct })));
        totalAdded += added;
      }
      toast.success(`${preview.fileName}: imported ${totalAdded} MCQs into ${Math.ceil(parsed.length / 100)} batch subtopics`);
    } else {
      const added = addMCQs(
        preview.subjectId,
        parsed.map((p) => ({ question: p.question, options: p.options, correct: p.correct })),
      );
      toast.success(`${preview.fileName}: imported ${added} MCQs`);
    }
    setPreview(null);
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
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,text/plain,.pdf,.txt"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(subjectId, e.target.files)}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busyId === subjectId}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-accent disabled:opacity-60"
        >
          {busyId === subjectId ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {busyId === subjectId ? "Importing…" : "Upload to subject"}
        </button>
        {children.length > 0 && (
          <Link
            to="/quiz/$subjectId"
            params={{ subjectId }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow"
          >
            <FileText className="size-4" /> Practice all
          </Link>
        )}
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
          <p>No subtopics yet. Upload a PDF or add one manually.</p>
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

      <div className="rounded-2xl bg-card border border-border p-5 shadow-card">
        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Add subtopic</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={newSubName}
            onChange={(e) => setNewSubName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSubTopic()}
            placeholder="e.g. Chapter 1, Past Papers 2024…"
            className="flex-1 rounded-lg bg-input/60 border border-border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={addSubTopic}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow"
          >
            <Plus className="size-4" /> Add subtopic
          </button>
        </div>
      </div>

      {preview && (
        <TxtPreviewDialog
          fileName={preview.fileName}
          result={preview.result}
          onCancel={() => setPreview(null)}
          onConfirm={confirmTxtImport}
        />
      )}
    </div>
  );
}

function TxtPreviewDialog({
  fileName,
  result,
  onCancel,
  onConfirm,
}: {
  fileName: string;
  result: TxtParseResult;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const validCount = result.valid.length;
  const issueCount = result.issues.length;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={onCancel}>
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-2xl bg-card border border-border shadow-card flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-border flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-primary-glow uppercase tracking-wider">Preview import</div>
            <h2 className="text-lg font-medium mt-0.5">{fileName}</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-success/15 text-success">
                <CheckCircle2 className="size-3.5" /> {validCount} valid
              </span>
              {issueCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-destructive/15 text-destructive">
                  <FileWarning className="size-3.5" /> {issueCount} with errors
                </span>
              )}
            </div>
          </div>
          <button onClick={onCancel} className="p-2 rounded-md hover:bg-accent text-muted-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>

        <div className="overflow-y-auto p-5 space-y-4">
          {issueCount > 0 && (
            <section>
              <h3 className="text-sm font-medium text-destructive flex items-center gap-2 mb-2">
                <AlertTriangle className="size-4" /> Questions with errors (skipped)
              </h3>
              <ul className="space-y-2">
                {result.issues.map((iss, i) => (
                  <li key={i} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <div className="text-xs font-medium text-destructive">{iss.qNumber}</div>
                    <div className="text-sm mt-0.5 line-clamp-2">{iss.preview}</div>
                    <ul className="mt-1.5 text-xs text-destructive/90 list-disc list-inside space-y-0.5">
                      {iss.errors.map((e, j) => <li key={j}>{e}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {validCount > 0 && (
            <section>
              <ul className="space-y-3">
                {result.valid.map((q, i) => (
                  <li key={i} className="rounded-lg border border-border bg-secondary/30 p-3">
                    <div className="text-sm mt-0.5 font-medium">{q.question}</div>
                    <ul className="mt-2 grid sm:grid-cols-2 gap-1 text-xs">
                      {(["A", "B", "C", "D", "E"] as const).map((L) => (
                        <li
                          key={L}
                          className={`px-2 py-1 rounded ${q.correct === L ? "bg-success/15 text-success font-medium" : "text-muted-foreground"}`}
                        >
                          <span className="font-mono">{L}.</span> {q.options[L]}
                        </li>
                      ))}
                    </ul>
                    {!q.correct && (
                      <div className="mt-1.5 text-[11px] text-warning">No answer key detected for this question.</div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="p-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-accent">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={validCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="size-4" /> Add to subject
          </button>
        </footer>
      </div>
    </div>
  );
}
