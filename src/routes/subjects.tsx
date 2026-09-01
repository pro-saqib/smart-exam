import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useApp } from "@/store/app-store";
import { useMemo, useRef, useState } from "react";
import {  Loader2, Check, X, AlertTriangle, CheckCircle2, FileWarning, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchAllPapers } from "@/lib/mcq-extractor-service";

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
  const matchRoute = useMatchRoute();
  const isSubjectDetail = matchRoute({ to: "/subjects/$subjectId" });

  if (isSubjectDetail) {
    return <Outlet />;
  }

  return <SubjectsList />;
}

function SubjectsList() {
  const { subjects, mcqs, attempts, addSubject, addMCQs, deleteAllSubtopics } = useApp();

  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Commented out TXT preview logic as it's currently disabled in this file
  // const [preview, setPreview] = useState<{
  //   subjectId: string;
  //   fileName: string;
  //   result: any;
  // } | null>(null);

  const handleImportLocalMCQs = async () => {
    if (importing) return;
    if (confirm("This will delete all existing subtopics and re-import from local files. Are you sure?")) {
      setImporting(true);
      toast.info("Clearing subtopics and re-importing...");

      try {
        deleteAllSubtopics();
        const localPapers = await fetchAllPapers();
        let totalImported = 0;
        const { subjects: currentSubjects } = useApp.getState();

        const subjectKeywords: { [key: string]: string } = {
          "english": "English", "urdu": "Urdu", "islamic": "Islamic Studies",
          "pakistan": "Pakistan Studies", "current affairs": "Current Affairs",
          "everyday science": "Everyday Science", "basic mathematics": "Basic Mathematics",
          "computer": "Computer Science", "geography": "Geography", "general knowledge": "General Knowledge",
        };

        for (const paper of localPapers) {
          let mainSubjectName = "General Knowledge";
          const lowerName = paper.name.toLowerCase();
          for (const keyword in subjectKeywords) {
            if (lowerName.includes(keyword)) {
              mainSubjectName = subjectKeywords[keyword];
              break;
            }
          }

          const yearMatch = paper.name.match(/\b(20\d{2})\b/);
          const year = yearMatch ? yearMatch[1] : "Unknown";

          const parent = currentSubjects.find(s => s.name === mainSubjectName && !s.parentId);
          if (!parent) continue;

          for (let i = 0; i < paper.mcqs.length; i += 100) {
            const batch = paper.mcqs.slice(i, i + 100);
            const batchNum = Math.floor(i / 100) + 1;
            const subtopicName = `${mainSubjectName} ${year} (Part ${batchNum})`;

            const subtopic = addSubject(subtopicName, parent.id);
            const added = addMCQs(subtopic.id, batch.map(m => ({
              question: m.question,
              options: m.options,
              correct: m.correct as "A" | "B" | "C" | "D" | "E"
            })));

            totalImported += added;
          }
        }

        toast.success(`Imported ${totalImported} MCQs successfully!`);
      } catch (error) {
        console.error("Import failed:", error);
        toast.error("Failed to re-import MCQs");
      } finally {
        setImporting(false);
      }
    }
  };

  const parents = useMemo(() => subjects.filter((s) => !s.parentId), [subjects]);
  const childrenByParent = useMemo(() => {
    const map: Record<string, typeof subjects> = {};
    for (const s of subjects) {
      if (s.parentId) {
        if (!map[s.parentId]) map[s.parentId] = [];
        map[s.parentId].push(s);
      }
    }
    return map;
  }, [subjects]);

  const statsByParent = useMemo(() => {
    const map: Record<string, { totalAttempts: number; correctAttempts: number }> = {};
    for (const p of parents) {
      const childIds = childrenByParent[p.id]?.map((c) => c.id) || [];
      const relevantAttempts = attempts.filter((a) => a.subjectId === p.id || childIds.includes(a.subjectId));
      map[p.id] = {
        totalAttempts: relevantAttempts.length,
        correctAttempts: relevantAttempts.filter((a) => a.correct).length,
      };
    }
    return map;
  }, [parents, childrenByParent, attempts]);

  /*
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
          if (parsed.length > 100) {
            const base = subjects.find((x) => x.id === subjectId)?.name || "Subject";
            const addedMain = addMCQs(subjectId, parsed.map((p) => ({ question: p.question, options: p.options, correct: p.correct })));
            total += addedMain;
            if (addedMain) toast.success(`${file.name}: imported ${addedMain} MCQs into ${base}`);
            for (let i = 0; i < parsed.length; i += 100) {
              const chunk = parsed.slice(i, i + 100);
              const start = i + 1;
              const end = i + chunk.length;
              const newSub = addSubject(`${base} ${start}-${end}`, subjectId);
              const added = addMCQs(newSub.id, chunk.map((p) => ({ question: p.question, options: p.options, correct: p.correct })));
              total += added;
              toast.success(`${file.name}: created ${newSub.name} with ${added} MCQs`);
            }
          } else {
            const added = addMCQs(subjectId, parsed.map((p) => ({ question: p.question, options: p.options, correct: p.correct })));
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
        setPreview({ subjectId, fileName: txtToPreview.file.name, result: txtToPreview.result });
      } else if (total === 0) {
        toast.message("No MCQs detected — ensure questions follow a numbered A/B/C/D format.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to parse file");
    } finally {
      setBusyId(null);
      const el = fileRefs.current[subjectId];
      if (el) el.value = "";
    }
  };
  */

  // const confirmTxtImport = () => {
  //   if (!preview) return;
  //   const parsed = preview.result.valid;
  //   if (parsed.length > 100) {
  //     const base = subjects.find((x) => x.id === preview.subjectId)?.name || "Subject";
  //     const addedMain = addMCQs(preview.subjectId, parsed.map((p) => ({ question: p.question, options: p.options, correct: p.correct })));
  //     let totalAdded = addedMain;
  //     if (addedMain) toast.success(`${preview.fileName}: imported ${addedMain} MCQs into ${base}`);
  //     for (let i = 0; i < parsed.length; i += 100) {
  //       const chunk = parsed.slice(i, i + 100);
  //       const start = i + 1;
  //       const end = i + chunk.length;
  //       const newSub = addSubject(`${base} ${start}-${end}`, preview.subjectId);
  //       const added = addMCQs(newSub.id, chunk.map((p) => ({ question: p.question, options: p.options, correct: p.correct })));
  //       totalAdded += added;
  //     }
  //     toast.success(`${preview.fileName}: imported ${totalAdded} MCQs into ${Math.ceil(parsed.length / 100)} batch subjects`);
  //   } else {
  //     const added = addMCQs(
  //       preview.subjectId,
  //       parsed.map((p) => ({ question: p.question, options: p.options, correct: p.correct })),
  //     );
  //     toast.success(`${preview.fileName}: imported ${added} MCQs`);
  //   }
  //   setPreview(null);
  // };

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl">Subjects</h1>
          <p className="text-muted-foreground mt-1">Core subjects dashboard.</p>
        </div>
        <button
          onClick={handleImportLocalMCQs}
          disabled={importing}
          data-testid="import-local-mcqs"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {importing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Import Local MCQs
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {parents.map((parent) => {
          const totalMcqs = mcqs.filter((m) => m.subjectId === parent.id || childrenByParent[parent.id]?.some((c) => c.id === m.subjectId)).length;
          const stats = statsByParent[parent.id] || { totalAttempts: 0, correctAttempts: 0 };
          const accuracy = stats.totalAttempts > 0 ? Math.round((stats.correctAttempts / stats.totalAttempts) * 100) : 0;

          return (
            <div
              key={parent.id}
              className="group rounded-2xl p-5 bg-card border border-border hover:border-primary/60 transition-all shadow-card hover:shadow-glow flex flex-col gap-4 cursor-pointer"
              onClick={() => navigate({ to: "/subjects/$subjectId", params: { subjectId: parent.id } })}
            >
              <div className="flex items-start justify-between">
                <h3 className="font-medium text-lg">{parent.name}</h3>
              </div>

              <span className="text-xs text-muted-foreground -mt-2">{totalMcqs} MCQs</span>

              <div className="mt-auto pt-2 space-y-2">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full gradient-primary transition-all"
                    style={{ width: `${Math.min(100, accuracy)}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  <span>{accuracy}% accuracy</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* {preview && (
        <TxtPreviewDialog
          fileName={preview.fileName}
          result={preview.result}
          onCancel={() => setPreview(null)}
          onConfirm={confirmTxtImport}
        />
      )} */}
    </div>
  );
}

// function TxtPreviewDialog({
//   fileName,
//   result,
//   onCancel,
//   onConfirm,
// }: {
//   fileName: string;
//   result: any;
//   onCancel: () => void;
//   onConfirm: () => void;
// }) {
//   const validCount = result.valid.length;
//   const issueCount = result.issues.length;

//   return (
//     <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={onCancel}>
//       <div
//         className="w-full max-w-2xl max-h-[85vh] rounded-2xl bg-card border border-border shadow-card flex flex-col"
//         onClick={(e) => e.stopPropagation()}
//       >
//         <header className="p-5 border-b border-border flex items-start justify-between gap-3">
//           <div>
//             <div className="text-xs text-primary-glow uppercase tracking-wider">Preview import</div>
//             <h2 className="text-lg font-medium mt-0.5">{fileName}</h2>
//             <div className="mt-2 flex flex-wrap gap-2 text-xs">
//               <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-success/15 text-success">
//                 <CheckCircle2 className="size-3.5" /> {validCount} valid
//               </span>
//               {issueCount > 0 && (
//                 <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-destructive/15 text-destructive">
//                   <FileWarning className="size-3.5" /> {issueCount} with errors
//                 </span>
//               )}
//             </div>
//           </div>
//           <button onClick={onCancel} className="p-2 rounded-md hover:bg-accent text-muted-foreground" aria-label="Close">
//             <X className="size-4" />
//           </button>
//         </header>

//         <div className="overflow-y-auto p-5 space-y-4">
//           {issueCount > 0 && (
//             <section>
//               <h3 className="text-sm font-medium text-destructive flex items-center gap-2 mb-2">
//                 <AlertTriangle className="size-4" /> Questions with errors (skipped)
//               </h3>
//               <ul className="space-y-2">
//                 {result.issues.map((iss, i) => (
//                   <li key={i} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
//                     <div className="text-xs font-medium text-destructive">{iss.qNumber}</div>
//                     <div className="text-sm mt-0.5 line-clamp-2">{iss.preview}</div>
//                     <ul className="mt-1.5 text-xs text-destructive/90 list-disc list-inside space-y-0.5">
//                       {iss.errors.map((e, j) => <li key={j}>{e}</li>)}
//                     </ul>
//                   </li>
//                 ))}
//               </ul>
//             </section>
//           )}

//           {validCount > 0 && (
//             <section>
//               <ul className="space-y-3">
//                 {result.valid.map((q, i) => (
//                   <li key={i} className="rounded-lg border border-border bg-secondary/30 p-3">
//                     <div className="text-sm mt-0.5 font-medium">{q.question}</div>
//                     <ul className="mt-2 grid sm:grid-cols-2 gap-1 text-xs">
//                       {(["A", "B", "C", "D", "E"] as const).map((L) => (
//                         <li
//                           key={L}
//                           className={`px-2 py-1 rounded ${q.correct === L ? "bg-success/15 text-success font-medium" : "text-muted-foreground"}`}
//                         >
//                           <span className="font-mono">{L}.</span> {q.options[L]}
//                         </li>
//                       ))}
//                     </ul>
//                     {!q.correct && (
//                       <div className="mt-1.5 text-[11px] text-warning">No answer key detected for this question.</div>
//                     )}
//                   </li>
//                 ))}
//               </ul>
//             </section>
//           )}
//         </div>

//         <footer className="p-4 border-t border-border flex items-center justify-end gap-2">
//           <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm hover:bg-accent">
//             Cancel
//           </button>
//           <button
//             onClick={onConfirm}
//             disabled={validCount === 0}
//             className="inline-flex items-center gap-2 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-medium shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
//           >
//             <Check className="size-4" /> Add to subject
//           </button>
//         </footer>
//       </div>
//     </div>
//   );
// }
