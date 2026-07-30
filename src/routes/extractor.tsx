import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { MCQExtractorForm } from "@/components/mcq-extractor/mcq-extractor-form";
import { MCQResultCard } from "@/components/mcq-extractor/mcq-result-card";
import { buildTxtExport, extractMCQsFromSource } from "@/lib/mcq-extractor-service";
import type { MCQExtractionResult, MCQExtractorFormValues } from "@/lib/mcq-extractor-types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useApp } from "@/store/app-store";

export const Route = createFileRoute("/extractor")({
  head: () => ({
    meta: [
      { title: "MCQ Extractor — PrepMind" },
      { name: "description", content: "Extract MCQs from a source URL and page range, preview them, and download the result as a text file." },
    ],
  }),
  component: MCQExtractorPage,
});

type ExtractState =
  | { status: "idle"; result: null; error: null }
  | { status: "loading"; result: MCQExtractionResult | null; error: null }
  | { status: "success"; result: MCQExtractionResult; error: null }
  | { status: "error"; result: null; error: string };

const INITIAL_FORM: MCQExtractorFormValues = {
  sourceUrl: "",
  startPage: "1",
  endPage: "3",
};

function MCQExtractorPage() {
  const { subjects, addSubject, addMCQs } = useApp();
  const [form, setForm] = useState(INITIAL_FORM);
  const [state, setState] = useState<ExtractState>({ status: "idle", result: null, error: null });
  const [resultsOpen, setResultsOpen] = useState(false);
  const [savingSubject, setSavingSubject] = useState(false);

  const canDownload = state.status === "success" && state.result.items.length > 0;

  const summary = useMemo(() => {
    if (state.status !== "success") return null;
    const source = new URL(state.result.sourceUrl);
    return {
      name: formatSubjectName(source.pathname.split("/").filter(Boolean).pop() || source.host),
      pages: `${state.result.startPage}-${state.result.endPage}`,
      total: state.result.items.length,
    };
  }, [state]);

  const handleAddToSubject = () => {
    if (state.status !== "success" || !state.result.items.length || savingSubject) return;

    setSavingSubject(true);
    try {
      const subjectName = summary?.name ?? formatSubjectName(new URL(state.result.sourceUrl).host);
      const existing = subjects.find((subject) => normalizeSubjectName(subject.name) === normalizeSubjectName(subjectName));
      const subject = existing ?? addSubject(subjectName);
      const added = addMCQs(
        subject.id,
        state.result.items.map((item) => ({
          question: item.question,
          options: {
            A: item.options.find((option) => option.label === "A")?.text ?? "",
            B: item.options.find((option) => option.label === "B")?.text ?? "",
            C: item.options.find((option) => option.label === "C")?.text ?? "",
            D: item.options.find((option) => option.label === "D")?.text ?? "",
            E: item.options.find((option) => option.label === "E")?.text,
          },
          correct: item.correctLabel,
        })),
      );

      toast.success(added > 0 ? `${added} MCQs added to ${subject.name}` : `No new MCQs were added to ${subject.name}`);
      setResultsOpen(false);
    } finally {
      setSavingSubject(false);
    }
  };

  const handleExtract = async () => {
    try {
      setResultsOpen(false);
      setState((current) => ({ status: "loading", result: current.result, error: null }));

      const result = await extractMCQsFromSource({
        data: {
          sourceUrl: form.sourceUrl,
          startPage: Number(form.startPage),
          endPage: Number(form.endPage),
        },
      });

      setState({ status: "success", result, error: null });
      setResultsOpen(true);
      if (result.warnings?.length) {
        toast.message(result.warnings[0]);
      } else {
        toast.success(`Extracted ${result.items.length} MCQs`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction failed.";
      setState({ status: "error", result: null, error: message });
      toast.error(message);
    }
  };

  const handleDownload = () => {
    if (!canDownload) return;
    const blob = new Blob([buildTxtExport(state.result)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const sourceName = new URL(state.result.sourceUrl).hostname.replace(/[^a-z0-9.-]/gi, "-");
    link.href = url;
    link.download = `mcq-extract-${sourceName}-${state.result.startPage}-${state.result.endPage}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("TXT export downloaded");
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <MCQExtractorForm values={form} loading={state.status === "loading"} onChange={setForm} onSubmit={handleExtract} />

      {state.status === "loading" && <LoadingState />}

      {state.status === "error" && (
        <StatePanel tone="error" icon={<AlertTriangle className="size-5" />} title="Extraction failed" description={state.error} />
      )}

      {state.status === "idle" && (
        <StatePanel
          tone="neutral"
          icon={<FileText className="size-5" />}
          title="No extraction yet"
          description="Enter a base URL and page range, then click Extract MCQs to preview the results in a popup."
        />
      )}

      <Dialog open={resultsOpen && state.status === "success"} onOpenChange={setResultsOpen}>
        {state.status === "success" && (
          <DialogContent className="w-full max-w-2xl max-h-[85vh] rounded-2xl bg-card border border-border shadow-card flex flex-col overflow-hidden p-0">
            <header className="p-5 border-b border-border flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-primary-glow uppercase tracking-wider">Preview import</div>
                <h2 className="text-lg font-medium mt-0.5">{summary?.name ?? "mcq_extractor"}</h2>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-success/15 text-success">
                    <CheckCircle2 className="size-3.5" /> {summary?.total ?? 0} extracted
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/60 text-secondary-foreground">
                    <FileText className="size-3.5" /> Pages {summary?.pages ?? "-"}
                  </span>
                  {state.result.warnings?.length ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-warning/15 text-warning">
                      <AlertTriangle className="size-3.5" /> {state.result.warnings.length} warning{state.result.warnings.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
              </div>
              <button onClick={() => setResultsOpen(false)} className="p-2 rounded-md hover:bg-accent text-muted-foreground" aria-label="Close">
                <X className="size-4" />
              </button>
            </header>

            <div className="overflow-y-auto p-5 space-y-4">
              {state.result.items.length > 0 ? (
                <section>
                  {/* <h3 className="text-sm font-medium text-success flex items-center gap-2 mb-2">
                    <CheckCircle2 className="size-4" /> Ready to import
                  </h3> */}
                  <div className="space-y-3">
                    {state.result.items.map((item, index) => (
                      <MCQResultCard key={item.id} item={item} index={index} />
                    ))}
                  </div>
                </section>
              ) : (
                <StatePanel
                  tone="neutral"
                  icon={<FileText className="size-5" />}
                  title="No MCQs found"
                  description="The extractor did not detect any questions in the selected range. Try a different page window or a more structured source."
                />
              )}
            </div>

            <footer className="p-4 border-t border-border flex items-center justify-end gap-2">
              <button onClick={() => setResultsOpen(false)} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-accent">
                Close
              </button>
              <button
                onClick={handleAddToSubject}
                disabled={!canDownload || savingSubject}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-success text-success-foreground text-sm font-medium hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="size-4" /> {savingSubject ? "Adding..." : "Add to subject"}
              </button>
              <button
                onClick={handleDownload}
                disabled={!canDownload}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="size-4" /> Download .txt
              </button>
            </footer>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function StatePanel({
  tone,
  icon,
  title,
  description,
}: {
  tone: "neutral" | "error";
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 flex items-start gap-4 ${
        tone === "error" ? "border-destructive/30 bg-destructive/10" : "border-border bg-background/50"
      }`}
    >
      <div className="size-10 rounded-2xl grid place-items-center border border-border bg-card/80">{icon}</div>
      <div>
        <div className="text-base font-medium">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground max-w-2xl">{description}</div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-2xl border border-border bg-background/50 p-6 flex items-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin text-primary-glow" />
      Extracting MCQs and preparing the preview...
    </div>
  );
}

function formatSubjectName(raw: string): string {
  return raw
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeSubjectName(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}
