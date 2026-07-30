import type { ExtractedMCQ } from "@/lib/mcq-extractor-types";
import { MCQPreview } from "@/components/mcq-extractor/mcq-preview";

export function MCQResultCard({ item, index }: { item: ExtractedMCQ; index: number }) {
  return (
    <article className="rounded-lg border border-border bg-card/60 p-3">
      {/* <div className="text-xs font-medium text-muted-foreground">Q{index + 1}</div> */}
      <div className="mt-0.5">
        <MCQPreview item={item} index={index} />
      </div>
    </article>
  );
}
