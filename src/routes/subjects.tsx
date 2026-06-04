import { createFileRoute, Link } from "@tanstack/react-router";
import { useApp } from "@/store/app-store";
import { useRef, useState } from "react";
import { Plus, Upload, Pencil, Trash2, FileText, Loader2, Check, X, AlertTriangle, CheckCircle2, FileWarning } from "lucide-react";
import { extractTextFromPdf, parseMCQs } from "@/lib/pdf-parser";
import { validateTxtMCQs, type TxtParseResult } from "@/lib/txt-parser";
import { toast } from "sonner";

export const Route = createFileRoute("/subjects")({
  head: () => ({
    meta: [
      { title: "Subjects — PrepMind" },
      { name: "description", content: "Create and manage subjects, upload MCQ PDFs and grow your question bank." },
    ],
  }),
  component: SubjectsPage,
});

function SubjectsPage() {
  const { subjects, mcqs, addSubject, renameSubject, deleteSubject, addMCQs } = useApp();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [preview, setPreview] = useState<{
    subjectId: string;
    fileName: string;
    result: TxtParseResult;
  } | null>(null);

  const create = () => {
    const n = newName.trim();
    if (!n) return;
    addSubject(n);
    setNewName("");
    toast.success(`Subject "${n}" created`);
  };

  const handleFiles = async (subjectId: string, files: FileList | null) => {
    if (!files || !files.length) return;
    setBusyId(subjectId);
    let total = 0;
    let txtToPreview: { file: File; result: TxtParseResult } | null = null;
    try {
      for (const file of Array.from(files)) {
        const name = file.name.toLowerCase();
        const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";
        if (isPdf) {
          const text = await extractTextFromPdf(file);
          const parsed = parseMCQs(text);
          const added = addMCQs(subjectId, parsed.map((p) => ({ question: p.question, options: p.options, correct: p.correct })));
          total += added;
          toast.success(`${file.name}: imported ${added} MCQs`);
        } else {
          // Treat anything non-PDF as plain text (covers .txt, .text, no extension, etc.)
          const text = await file.text();
          const result = validateTxtMCQs(text);
          // Defer to preview dialog (first .txt only; others are skipped this round)
          if (!txtToPreview) txtToPreview = { file, result };
          else toast.message(`${file.name} skipped — review one .txt file at a time.`);
        }
      }
      if (txtToPreview) {
        setPreview({ subjectId, fileName: txtToPreview.file.name, result: txtToPreview.result });
      } else if (total === 0) {
        toast.message("No MCQs detected — ensure questions follow a numbered A/B/C/D format.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to parse file");
    } finally {
      setBusyId(null);
      // Reset the file input so the same file can be re-selected later
      const el = fileRefs.current[subjectId];
      if (el) el.value = "";
    }
  };

  const confirmTxtImport = () => {
    if (!preview) return;
    const added = addMCQs(
      preview.subjectId,
      preview.result.valid.map((p) => ({ question: p.question, options: p.options, correct: p.correct })),
    );
    toast.success(`${preview.fileName}: imported ${added} MCQs`);
    setPreview(null);
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl">Subjects</h1>
        <p className="text-muted-foreground mt-1">Create unlimited subjects and import MCQ PDFs into each.</p>
      </header>

      <div className="rounded-2xl bg-card border border-border p-5 shadow-card">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="e.g. English, General Knowledge, Pakistan Affairs…"
            className="flex-1 rounded-lg bg-input/60 border border-border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={create}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow"
          >
            <Plus className="size-4" /> Add subject
          </button>
        </div>
      </div>

      {subjects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          No subjects yet. Add your first subject above.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {subjects.map((s) => {
            const count = mcqs.filter((m) => m.subjectId === s.id).length;
            return (
              <div key={s.id} className="rounded-2xl bg-card border border-border p-5 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  {editingId === s.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 rounded-md bg-input/60 border border-border px-3 py-1.5 text-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => { renameSubject(s.id, editName); setEditingId(null); toast.success("Renamed"); }}
                        className="p-1.5 rounded-md bg-success/20 text-success hover:bg-success/30"
                      ><Check className="size-4" /></button>
                      <button onClick={() => setEditingId(null)} className="p-1.5 rounded-md bg-muted hover:bg-accent">
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1">
                      <h3 className="text-lg font-medium">{s.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{count} MCQs</p>
                    </div>
                  )}
                  {editingId !== s.id && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditingId(s.id); setEditName(s.name); }}
                        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
                        title="Rename"
                      ><Pencil className="size-4" /></button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${s.name}" and all its MCQs?`)) {
                            deleteSubject(s.id);
                            toast.success("Deleted");
                          }
                        }}
                        className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Delete"
                      ><Trash2 className="size-4" /></button>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input
                    ref={(el) => { fileRefs.current[s.id] = el; }}
                    type="file"
                    accept="application/pdf,text/plain,.pdf,.txt"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(s.id, e.target.files)}
                  />
                  <button
                    onClick={() => fileRefs.current[s.id]?.click()}
                    disabled={busyId === s.id}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-accent disabled:opacity-60"
                  >
                    {busyId === s.id ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                    {busyId === s.id ? "Importing…" : "Upload PDF / TXT"}
                  </button>
                  {count > 0 && (
                    <Link
                      to="/quiz/$subjectId"
                      params={{ subjectId: s.id }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-medium"
                    >
                      <FileText className="size-4" /> Practice
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
              <h3 className="text-sm font-medium text-success flex items-center gap-2 mb-2">
                <CheckCircle2 className="size-4" /> Ready to import
              </h3>
              <ul className="space-y-3">
                {result.valid.map((q, i) => (
                  <li key={i} className="rounded-lg border border-border bg-secondary/30 p-3">
                    <div className="text-xs text-muted-foreground">Q{i + 1}</div>
                    <div className="text-sm mt-0.5 font-medium">{q.question}</div>
                    <ul className="mt-2 grid sm:grid-cols-2 gap-1 text-xs">
                      {(["A", "B", "C", "D"] as const).map((L) => (
                        <li
                          key={L}
                          className={`px-2 py-1 rounded ${q.correct === L ? "bg-success/15 text-success font-medium" : "text-muted-foreground"}`}
                        >
                          <span className="font-mono">{L}.</span> {q.options[L]}
                          {q.correct === L && " ✓"}
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
            <Check className="size-4" /> Import {validCount} question{validCount === 1 ? "" : "s"}
          </button>
        </footer>
      </div>
    </div>
  );
}
