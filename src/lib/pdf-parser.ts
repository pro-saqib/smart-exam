export interface ParsedMCQ {
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string };
  correct?: "A" | "B" | "C" | "D" | "E";
}

export async function extractTextFromPdf(file: File): Promise<string> {
  // Dynamic import keeps pdfjs (which references DOMMatrix) out of SSR bundles.
  const pdfjsLib = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Reconstruct lines using y-coordinates
    const items = (content.items as Array<{ str: string; transform: number[] }>).filter((it) => "str" in it);
    const lines = new Map<number, string[]>();
    for (const it of items) {
      const y = Math.round(it.transform[5]);
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y)!.push(it.str);
    }
    const sorted = [...lines.entries()].sort((a, b) => b[0] - a[0]);
    out += sorted.map(([, parts]) => parts.join(" ")).join("\n") + "\n";
  }
  return out;
}

// Parse MCQs from extracted text. Tries multiple patterns commonly seen in MCQ PDFs.
export function parseMCQs(text: string): ParsedMCQ[] {
  // Normalize whitespace, keep newlines
  const cleaned = text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  const results: ParsedMCQ[] = [];

  // Strategy: split on question-number markers like "1.", "12)", "Q1.", "Q.1", "(1)"
  const qSplitRe = /(?:^|\n)\s*(?:Q\s*\.?\s*)?(\d{1,4})\s*[\.\):\-]\s+/gi;
  const indices: { idx: number; num: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = qSplitRe.exec(cleaned))) {
    indices.push({ idx: m.index + m[0].indexOf(m[1]) + m[1].length, num: m[1] });
  }
  if (indices.length < 2) {
    // fallback: try splitting on lines that start with "1." pattern
    return parseFallback(cleaned);
  }

  // Build chunks: from after the marker to next marker
  const chunks: string[] = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].idx;
    const end = i + 1 < indices.length ? indices[i + 1].idx - String(indices[i + 1].num).length - 2 : cleaned.length;
    const chunk = cleaned.slice(start, end).trim().replace(/^[\.\):\-\s]+/, "");
    if (chunk) chunks.push(chunk);
  }

  for (const chunk of chunks) {
    const parsed = parseChunk(chunk);
    if (parsed) results.push(parsed);
  }
  return dedupe(results);
}

function parseChunk(chunk: string): ParsedMCQ | null {
  // Find option markers: A) A. (A) a) etc., for A-D
  const optRe = /(?:^|\s|\n)\(?\s*([A-Ea-e])\s*[\)\.\-:]\s*/g;
  const matches: { letter: "A" | "B" | "C" | "D" | "E"; idx: number; len: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = optRe.exec(chunk))) {
    const L = m[1].toUpperCase() as "A" | "B" | "C" | "D" | "E";
    matches.push({ letter: L, idx: m.index + m[0].indexOf(m[1]), len: m[0].length });
  }
  // Need to find a contiguous A,B,C,D set
  const seq: typeof matches = [];
  for (const x of matches) {
    const need = "ABCDE"[seq.length];
    if (x.letter === need) seq.push(x);
    if (seq.length === 5) break;
  }
  if (seq.length < 4) return null;

  const question = chunk.slice(0, seq[0].idx).replace(/[\s\?\.:]+$/, "").trim() + (chunk.slice(0, seq[0].idx).trim().endsWith("?") ? "" : "");
  if (question.length < 4) return null;

  // Slice option texts
  const after = (i: number) => chunk.slice(seq[i].idx + 1).replace(/^[\)\.\-:\s]+/, "");
  const slice = (i: number) => {
    const start = seq[i].idx + 1;
    // skip the punctuation after the letter
    const rest = chunk.slice(start);
    const lead = rest.match(/^[\)\.\-:\s]+/);
    const realStart = start + (lead ? lead[0].length : 0);
    const end = i + 1 < seq.length ? seq[i + 1].idx : chunk.length;
    return chunk.slice(realStart, end).trim();
  };
  void after;
  const A = slice(0);
  const B = slice(1);
  const C = slice(2);
  let D = slice(3);
  const E = seq.length >= 5 ? slice(4) : undefined;

  // D may also include answer marker, strip it
  let correct: ParsedMCQ["correct"] | undefined;
  const ansRe = /(?:^|\s|\n)(?:Ans(?:wer)?|Correct(?: Answer)?)\s*[:\-\.\)]?\s*\(?\s*([A-Ea-e])\s*\)?/i;
  const ansMatch = D.match(ansRe);
  if (ansMatch) {
    correct = ansMatch[1].toUpperCase() as ParsedMCQ["correct"];
    D = D.slice(0, ansMatch.index!).trim();
  } else {
    // Search the whole chunk for an answer marker after D
    const rest = chunk.slice(seq[3].idx);
    const am = rest.match(ansRe);
    if (am) {
      const letterMatch = am[0].match(/([A-Ea-e])/i);
      if (letterMatch) {
        correct = letterMatch[1].toUpperCase() as ParsedMCQ["correct"];
        // Check if answer includes descriptive text (e.g., "B. Leave")
        const fullAnswerMatch = am[0].match(/([A-Ea-e])\s*[\.\):]?\s*(.+)/i);
        if (fullAnswerMatch && fullAnswerMatch[2]) {
          const answerText = fullAnswerMatch[2].trim();
          const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
          const normalizedAnswer = norm(answerText);
          const clean = (s: string) => s.replace(/\s+/g, " ").trim();
          // Try to match the answer text against the options
          const options: any = { A: clean(A), B: clean(B), C: clean(C), D: clean(D) };
          if (E) options.E = clean(E);
          for (const L of ["A", "B", "C", "D", "E"] as const) {
            if (norm(options[L]) === normalizedAnswer) {
              correct = L;
              break;
            }
          }
        }
      }
    }
    // Also check for star/bold marker like "*" before/after an option
    if (!correct) {
      const starRe = /\*\s*\(?([A-Ea-e])\)?/;
      const sm = chunk.match(starRe);
      if (sm) correct = sm[1].toUpperCase() as ParsedMCQ["correct"];
    }
  }

  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  if (!A || !B || !C || !D) return null;
  const options: any = { A: clean(A), B: clean(B), C: clean(C), D: clean(D) };
  if (E) options.E = clean(E);
  return {
    question: clean(question),
    options,
    correct,
  };
}

function parseFallback(text: string): ParsedMCQ[] {
  // Split by blank lines and try to parse each block
  const blocks = text.split(/\n(?=\s*(?:Q|\d))/);
  const out: ParsedMCQ[] = [];
  for (const b of blocks) {
    const p = parseChunk(b);
    if (p) out.push(p);
  }
  return dedupe(out);
}

function dedupe(items: ParsedMCQ[]): ParsedMCQ[] {
  const seen = new Set<string>();
  const out: ParsedMCQ[] = [];
  for (const it of items) {
    const k = it.question.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}
