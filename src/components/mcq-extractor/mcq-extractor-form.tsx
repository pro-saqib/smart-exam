import type { TestpointExtractorFormValues, TestpointYearGroup } from "@/lib/mcq-extractor-types";
import { Loader2, Search, ChevronDown } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { Slider } from "@/components/ui/slider";

export function TestpointExtractorForm({
  values,
  yearGroups,
  loading,
  loadingPages,
  onChange,
  onSubmit,
  onYearChange,
  onSubjectChange,
}: {
  values: TestpointExtractorFormValues;
  yearGroups: TestpointYearGroup[];
  loading: boolean;
  loadingPages: boolean;
  onChange: (values: TestpointExtractorFormValues) => void;
  onSubmit: () => void;
  onYearChange: (year: string) => void;
  onSubjectChange: (subjectUrl: string) => void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  const selectedYear = yearGroups.find(y => y.year === values.selectedYear);
  const subjects = selectedYear?.subjects || [];

  return (
    <form onSubmit={submit} className="rounded-3xl border border-border bg-card/90 backdrop-blur-sm shadow-card p-5 md:p-6 space-y-5">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-[0.22em] text-primary-glow">MCQ Extractor</div>
        <h2 className="text-2xl">Extract Testpoint MCQs</h2>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Year">
            <div className="relative">
              <select
                value={values.selectedYear}
                onChange={(e) => onYearChange(e.target.value)}
                className="w-full appearance-none rounded-xl border border-input bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                required
              >
                <option value="">Select Year</option>
                {yearGroups.map(group => (
                  <option key={group.year} value={group.year}>{group.year}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            </div>
          </Field>

          <Field label="Subject">
            <div className="relative">
              <select
                value={values.selectedSubject}
                onChange={(e) => onSubjectChange(e.target.value)}
                className="w-full appearance-none rounded-xl border border-input bg-background/60 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
                disabled={!values.selectedYear || loadingPages}
                required
              >
                <option value="">
                  {loadingPages ? "Loading subjects..." : "Select Subject"}
                </option>
                {subjects.map(subject => (
                  <option key={subject.url} value={subject.url}>
                    {subject.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            </div>
          </Field>
        </div>

        {values.maxPages > 0 && (
          <Field label={`Pages to scrape: ${values.startPage} - ${values.endPage}`}>
            <div className="space-y-3">
              <Slider
                value={[values.startPage, values.endPage]}
                max={values.maxPages}
                min={1}
                step={1}
                onValueChange={(value) => {
                  if (Array.isArray(value) && value.length === 2) {
                    onChange({
                      ...values,
                      startPage: value[0],
                      endPage: value[1]
                    });
                  }
                }}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Page 1</span>
                <span>Page {values.maxPages}</span>
              </div>
            </div>
          </Field>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || !values.selectedSubject || loadingPages}
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
