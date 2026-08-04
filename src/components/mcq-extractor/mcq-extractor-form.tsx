import type { MCQExtractorFormValues } from "@/lib/mcq-extractor-types";
import { Loader2, Search } from "lucide-react";
import type { FormEvent, ReactNode } from "react";

export function MCQExtractorForm({
  values,
  loading,
  onChange,
  onSubmit,
}: {
  values: MCQExtractorFormValues;
  loading: boolean;
  onChange: (values: MCQExtractorFormValues) => void;
  onSubmit: () => void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={submit} className="rounded-3xl border border-border bg-card/90 backdrop-blur-sm shadow-card p-5 md:p-6 space-y-5">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-[0.22em] text-primary-glow">MCQ Extractor</div>
        <h2 className="text-2xl">Extract questions from a source page range</h2>
        {/* <p className="text-sm text-muted-foreground max-w-2xl">
          Provide the source URL and the pages you want to inspect. Extraction runs on the backend so the browser only handles previewing and downloading the result.
        </p> */}
      </div>

      <div className="grid gap-4">
        <Field label="Source URL">
          <input
            type="url"
            value={values.sourceUrl}
            onChange={(event) => onChange({ ...values, sourceUrl: event.target.value })}
            placeholder="https://example.com/testpointpk-style-mcqs"
            className="w-full rounded-xl border border-input bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
            required
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Start page">
            <input
              type="number"
              min={1}
              step={1}
              value={values.startPage}
              onChange={(event) => onChange({ ...values, startPage: event.target.value })}
              className="w-full rounded-xl border border-input bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
              required
            />
          </Field>
          <Field label="End page">
            <input
              type="number"
              min={1}
              step={1}
              value={values.endPage}
              onChange={(event) => onChange({ ...values, endPage: event.target.value })}
              className="w-full rounded-xl border border-input bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
              required
            />
          </Field>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-xl gradient-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-glow transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        {loading ? "Extracting..." : "Extract MCQs"}
      </button>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      {children}
    </label>
  );
}
