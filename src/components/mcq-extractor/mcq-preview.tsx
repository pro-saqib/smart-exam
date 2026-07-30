import type { ExtractedMCQ } from "@/lib/mcq-extractor-types";

export function MCQPreview({ item, index }: { item: ExtractedMCQ; index: number }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm md:text-base font-medium leading-6">
        {index + 1}. {item.question}
      </h3>

      <div className="grid gap-2 sm:grid-cols-2">
        {item.options.map((option) => {
          const active = option.label === item.correctLabel;
          return (
            <div
              key={option.label}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                active ? "border-success/50 bg-success/10 text-success" : "border-border bg-card/70 text-foreground"
              }`}
            >
              <div className="font-semibold text-[11px] uppercase tracking-[0.18em] opacity-80">{option.label}.</div>
              <div className="mt-1 leading-5">{option.text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
