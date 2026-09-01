import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { MCQExtractionRequest, MCQExtractionResult } from "@/lib/mcq-extractor-types";
import { extractMcqsFromSource, getTestpointSubjects, getTestpointPageLimit } from "@/lib/mcq-extractor.server";

interface LocalManifest {
  name: string;
  filename: string;
  url: string;
}

interface LocalPaper {
  name: string;
  mcqs: Array<{ question: string; options: { A: string; B: string; C: string; D: string }; correct: string }>;
}

function getLocalManifest(): LocalManifest[] {
  const manifestPath = join(process.cwd(), "data", "ppsc", "manifest.json");
  if (!existsSync(manifestPath)) return [];
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    return [];
  }
}

function getLocalPaperData(filename: string): LocalPaper | null {
  const filePath = join(process.cwd(), "data", "ppsc", filename);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

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
    // Check local data first
    const manifest = getLocalManifest();
    const localPaper = manifest.find(p => p.url === data.sourceUrl);
    if (localPaper) {
      const paperData = getLocalPaperData(localPaper.filename);
      if (paperData) {
        const startIdx = (data.startPage - 1) * 10;
        const endIdx = data.endPage * 10;
        const slicedMcqs = paperData.mcqs.slice(startIdx, endIdx);
        return {
          sourceUrl: data.sourceUrl,
          startPage: data.startPage,
          endPage: data.endPage,
          extractedAt: Date.now(),
          items: slicedMcqs.map((mcq, i) => ({
            id: `local-${i}-${Date.now()}`,
            question: mcq.question,
            options: Object.entries(mcq.options).map(([label, text]) => ({ label, text })),
            correctLabel: mcq.correct,
            sourceUrl: data.sourceUrl,
            sourcePage: data.startPage,
          })),
        } as MCQExtractionResult;
      }
    }

    // Fallback to web scraping
    const request: MCQExtractionRequest = data;
    return (await extractMcqsFromSource(request)) as MCQExtractionResult;
  });

export const fetchTestpointSubjects = createServerFn({ method: "GET" })
  .handler(async () => {
    // Check local data first
    const manifest = getLocalManifest();
    if (manifest.length > 0) {
      const yearMap = new Map<string, Array<{ name: string; url: string }>>();
      manifest.forEach(paper => {
        const yearMatch = paper.name.match(/\b(20\d{2})\b/);
        const year = yearMatch ? yearMatch[1] : "Other";
        if (!yearMap.has(year)) yearMap.set(year, []);
        yearMap.get(year)!.push({ name: paper.name, url: paper.url });
      });

      const yearGroups = [];
      for (const [year, subjects] of yearMap.entries()) {
        yearGroups.push({ year, subjects });
      }
      yearGroups.sort((a, b) => {
        if (a.year === "Other") return 1;
        if (b.year === "Other") return -1;
        return parseInt(b.year) - parseInt(a.year);
      });
      return yearGroups;
    }

    // Fallback to web scraping
    return await getTestpointSubjects();
  });

export const fetchTestpointPageLimit = createServerFn({ method: "POST" })
  .inputValidator(z.object({ url: z.string().url() }))
  .handler(async ({ data }) => {
    // Check local data first
    const manifest = getLocalManifest();
    const localPaper = manifest.find(p => p.url === data.url);
    if (localPaper) {
      const paperData = getLocalPaperData(localPaper.filename);
      if (paperData) {
        return Math.ceil(paperData.mcqs.length / 10) || 1;
      }
    }

    // Fallback to web scraping
    return await getTestpointPageLimit(data.url);
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
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

export const fetchAllPapers = createServerFn({ method: "GET" })
  .handler(async () => {
    const manifest = getLocalManifest();
    const allPapers: Array<{ name: string; mcqs: Array<{ question: string; options: { A: string; B: string; C: string; D: string }; correct: string }> }> = [];

    for (const entry of manifest) {
      const paperData = getLocalPaperData(entry.filename);
      if (paperData) {
        allPapers.push({
          name: entry.name,
          mcqs: paperData.mcqs,
        });
      }
    }
    return allPapers;
  });