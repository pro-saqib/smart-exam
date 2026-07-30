import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { MCQExtractionRequest, MCQExtractionResult } from "@/lib/mcq-extractor-types";
import { extractMcqsFromSource } from "@/lib/mcq-extractor.server";

export const extractMCQsFromSource = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        sourceUrl: z.string().trim().min(1),
        startPage: z.number().int().min(1),
        endPage: z.number().int().min(1),
      })
      .refine((data) => data.startPage <= data.endPage, {
        message: "Start page must be less than or equal to end page.",
        path: ["endPage"],
      }),
  )
  .handler(async ({ data }) => {
    const request: MCQExtractionRequest = data;
    return (await extractMcqsFromSource(request)) as MCQExtractionResult;
  });

export function buildTxtExport(result: MCQExtractionResult): string {
  const source = new URL(result.sourceUrl);
  const lines = [
    "MCQ Extractor Export",
    `Source: ${result.sourceUrl}`,
    `Host: ${source.host}`,
    `Page Range: ${result.startPage}-${result.endPage}`,
    `Extracted: ${new Date(result.extractedAt).toLocaleString()}`,
    `Total MCQs: ${result.items.length}`,
    "",
  ];

  for (const [index, item] of result.items.entries()) {
    lines.push(`${index + 1}. ${item.question}`);
    lines.push(`Page: ${item.sourcePage}`);
    for (const option of item.options) {
      const marker = option.label === item.correctLabel ? " *" : "";
      lines.push(`${option.label}. ${option.text}${marker}`);
    }
    if (item.explanation) {
      lines.push(`Explanation: ${item.explanation}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}