import type { ExtractedMCQ } from "@/lib/mcq-extractor-types";

export function MCQPreview({ item, index }: { item: ExtractedMCQ; index: number }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm md:text-base font-medium leading-6">
        {/* {index + 1}.  */}
        {item.question}
      </h3>

      <div className="grid gap-1 sm:grid-cols-2">
        {item.options.map((option) => {
          const active = option.label === item.correctLabel;
          return (
            <div
              key={option.label}
              className={`px-2 py-1 rounded text-xs ${
                active ? "bg-success/15 text-success font-medium" : "text-muted-foreground"
              }`}
            >
                <span className="font-mono">{option.label}.</span>
                {option.text}
             </div>
          );
        })}
      </div>
    </div>
  );
}
