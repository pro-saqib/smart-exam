import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, Plus, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { TestpointExtractorForm } from "@/components/mcq-extractor/mcq-extractor-form";
import { MCQResultCard } from "@/components/mcq-extractor/mcq-result-card";
import { buildTxtExport, extractMCQsFromSource, fetchTestpointSubjects, fetchTestpointPageLimit } from "@/lib/mcq-extractor-service";
import type { MCQExtractionResult, TestpointExtractorFormValues, TestpointYearGroup } from "@/lib/mcq-extractor-types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useApp } from "@/store/app-store";

export const Route = createFileRoute("/extractor")({
  beforeLoad: async ({ context }) => {
    const user = (context as any).user;
    if (!user || user.role !== "admin") {
      throw redirect({
        to: "/",
      });
    }
  },
  head: () => ({
    meta: [
      { title: "MCQ Extractor — PrepMind" },
      { name: "description", content: "Extract MCQs from Testpoint past papers, preview them, and import into subjects." },
    ],
  }),
  component: MCQExtractorPage,
});

type ExtractState =
  | { status: "idle"; result: null; error: null }
  | { status: "loading"; result: MCQExtractionResult | null; error: null }
  | { status: "success"; result: MCQExtractionResult; error: null }
  | { status: "error"; result: null; error: string };

const INITIAL_TESTPOINT_FORM: TestpointExtractorFormValues = {
  selectedYear: "",
  selectedSubject: "",
  startPage: 1,
  endPage: 1,
  maxPages: 0,
};

function MCQExtractorPage() {
  const { subjects, addSubject, addMCQs } = useApp();
  const [tpForm, setTpForm] = useState(INITIAL_TESTPOINT_FORM);
  const [yearGroups, setYearGroups] = useState<TestpointYearGroup[]>([]);
  const [state, setState] = useState<ExtractState>({ status: "idle", result: null, error: null });
  const [resultsOpen, setResultsOpen] = useState(false);
  const [savingSubject, setSavingSubject] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<string>("");
  const [selectedSubtopicId, setSelectedSubtopicId] = useState<string>(""); // "" = create new

  // Top-level subjects for the subject picker in review dialog
  const topLevelSubjects = useMemo(() => subjects.filter((s) => !s.parentId), [subjects]);

  // Subtopics under the selected parent
  const childSubjects = useMemo(
    () => subjects.filter((s) => s.parentId === selectedParentId),
    [subjects, selectedParentId],
  );

  useEffect(() => {
    const loadSubjects = async () => {
      setLoadingSubjects(true);
      try {
        const groups = await fetchTestpointSubjects();
        setYearGroups(groups);
      } catch (error) {
        console.error("Failed to load Testpoint subjects:", error);
        toast.error("Failed to load Testpoint subjects");
      } finally {
        setLoadingSubjects(false);
      }
    };
    loadSubjects();
  }, []);

  const handleYearChange = async (year: string) => {
    setTpForm((prev) => ({ ...prev, selectedYear: year, selectedSubject: "", startPage: 1, endPage: 1, maxPages: 0 }));
  };

  const handleSubjectChange = async (subjectUrl: string) => {
    if (!subjectUrl) {
      setTpForm((prev) => ({ ...prev, selectedSubject: "", startPage: 1, endPage: 1, maxPages: 0 }));
      return;
    }

    setLoadingPages(true);
    try {
      const maxPages = await fetchTestpointPageLimit({ data: { url: subjectUrl } });
      setTpForm((prev) => ({ ...prev, selectedSubject: subjectUrl, startPage: 1, endPage: maxPages, maxPages }));
    } catch (error) {
      console.error("Failed to get page limit:", error);
      setTpForm((prev) => ({ ...prev, selectedSubject: subjectUrl, startPage: 1, endPage: 10, maxPages: 10 }));
      toast.error("Could not detect page count, defaulting to 10 pages");
    } finally {
      setLoadingPages(false);
    }
  };

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

  const handleAddToSubject = async () => {
    if (state.status !== "success" || !state.result.items.length || savingSubject) return;

    const extractedName = summary?.name ?? formatSubjectName(new URL(state.result.sourceUrl).host);

    const parent = selectedParentId
      ? subjects.find((s) => s.id === selectedParentId)
      : subjects.find((s) => !s.parentId && normalizeSubjectName(extractedName).includes(normalizeSubjectName(s.name)));

    if (!parent) {
      toast.error("Please select a parent subject first.");
      return;
    }

    const allItems = state.result.items.map((item) => ({
      question: item.question,
      options: {
        A: item.options.find((option) => option.label === "A")?.text ?? "",
        B: item.options.find((option) => option.label === "B")?.text ?? "",
        C: item.options.find((option) => option.label === "C")?.text ?? "",
        D: item.options.find((option) => option.label === "D")?.text ?? "",
        E: item.options.find((option) => option.label === "E")?.text,
      },
      correct: item.correctLabel,
    }));

    setSavingSubject(true);
    try {
      let totalAdded = 0;

      if (selectedSubtopicId) {
        // Append to existing subtopic — no new subject created
        const existing = subjects.find((s) => s.id === selectedSubtopicId);
        totalAdded = await addMCQs(selectedSubtopicId, allItems);
        const totalNow = (existing?.totalMcqs || 0) + totalAdded;
        const papers = Math.ceil(totalNow / 100);
        toast.success(totalAdded > 0
          ? `${totalAdded.toLocaleString()} MCQs appended to ${existing?.name ?? "subtopic"} (~${papers} Model Papers)`
          : `No new MCQs were added`);
      } else {
        // Create single new subtopic with all MCQs
        const subtopic = await addSubject(extractedName, parent.id);
        totalAdded = await addMCQs(subtopic.id, allItems);
        const papers = Math.ceil(totalAdded / 100);
        toast.success(totalAdded > 0
          ? `${totalAdded.toLocaleString()} MCQs added to ${subtopic.name} (${papers} Model Paper${papers === 1 ? "" : "s"} generated)`
          : `No new MCQs were added to ${subtopic.name}`);
      }

      setResultsOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to add MCQs to subject");
    } finally {
      setSavingSubject(false);
    }
  };

  const handleExtract = async (sourceUrl: string, startPage: number, endPage: number) => {
    try {
      setResultsOpen(false);
      setState((current) => ({ status: "loading", result: current.result, error: null }));

      const result = await extractMCQsFromSource({
        data: {
          sourceUrl,
          startPage,
          endPage,
        },
      });

      setState({ status: "success", result, error: null });
      setResultsOpen(true);
      // Pre-select subject via fuzzy match as a convenience (admin can override)
      const extractedName = formatSubjectName(new URL(result.sourceUrl).pathname.split("/").filter(Boolean).pop() || new URL(result.sourceUrl).host);
      const fuzzyParent = subjects.find((s) => !s.parentId && normalizeSubjectName(extractedName).includes(normalizeSubjectName(s.name)));
      const parentId = fuzzyParent?.id ?? (subjects.find((s) => !s.parentId)?.id ?? "");
      setSelectedParentId(parentId);
      setSelectedSubtopicId("");
      // Try to pre-select an existing subtopic with a matching name
      if (parentId) {
        const children = subjects.filter((s) => s.parentId === parentId);
        const matchedChild = children.find((c) => normalizeSubjectName(c.name) === normalizeSubjectName(extractedName));
        if (matchedChild) setSelectedSubtopicId(matchedChild.id);
      }
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

  const handleTestpointExtract = () => {
    if (!tpForm.selectedSubject) return;
    handleExtract(tpForm.selectedSubject, tpForm.startPage, tpForm.endPage);
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
      <div className="max-w-xl">
        <TestpointExtractorForm
          values={tpForm}
          yearGroups={yearGroups}
          loading={state.status === "loading"}
          loadingPages={loadingPages}
          onChange={setTpForm}
          onSubmit={handleTestpointExtract}
          onYearChange={handleYearChange}
          onSubjectChange={handleSubjectChange}
        />
      </div>

      <div className="max-w-xl">
        {state.status === "loading" && <LoadingState />}

        {state.status === "error" && (
          <StatePanel tone="error" icon={<AlertTriangle className="size-5" />} title="Extraction failed" description={state.error} />
        )}

        {state.status === "idle" && (
          <StatePanel
            tone="neutral"
            icon={<FileText className="size-5" />}
            title="No extraction yet"
            description="Select a year and subject from Testpoint, then click Extract MCQs to preview the results."
          />
        )}
      </div>

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
            </header>

            <div className="overflow-y-auto p-5 space-y-4">
              {state.result.items.length > 0 ? (
                <section>
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

            <footer className="p-4 border-t border-border flex flex-col gap-3">
              {/* Two-level subject picker */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <BookOpen className="size-4 text-muted-foreground shrink-0" />
                  <select
                    value={selectedParentId}
                    onChange={(e) => {
                      setSelectedParentId(e.target.value);
                      setSelectedSubtopicId("");
                    }}
                    className="flex-1 px-3 py-2 rounded-lg bg-secondary/40 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">— Select parent subject —</option>
                    {topLevelSubjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                {selectedParentId && (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <select
                      value={selectedSubtopicId}
                      onChange={(e) => setSelectedSubtopicId(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg bg-secondary/40 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">+ Create new: "{summary?.name ?? "subtopic"}"</option>
                      {childSubjects.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.totalMcqs} MCQs)</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={handleAddToSubject}
                  disabled={!canDownload || savingSubject || !selectedParentId}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-success text-success-foreground text-sm font-medium hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="size-4" /> {savingSubject ? "Adding..." : selectedSubtopicId ? "Append to subtopic" : "Add to subject"}
                </button>
                <button
                  onClick={handleDownload}
                  disabled={!canDownload}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="size-4" /> Download .txt
                </button>
              </div>
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
