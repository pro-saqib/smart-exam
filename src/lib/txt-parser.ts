import type { ParsedMCQ } from "./pdf-parser";

export interface TxtParseIssue {
  qNumber: string;
  preview: string;
  errors: string[];
}

export interface TxtParseResult {
  valid: ParsedMCQ[];
  invalid: (ParsedMCQ & { _issues: string[] })[];
  issues: TxtParseIssue[];
}

// Validating parser: returns both clean MCQs and per-block error messages
// so the UI can preview what will be imported and what was rejected.
export function validateTxtMCQs(raw: string): TxtParseResult {
  const text = raw.replace(/\r/g, "").trim();
  const result: TxtParseResult = { valid: [], invalid: [], issues: [] };
  if (!text) {
    result.issues.push({ qNumber: "—", preview: "(empty file)", errors: ["File is empty."] });
    return result;
  }

  const blocks = text.split(/\n(?=\s*(?:Q\s*\.?\s*)?\d{1,4}\s*[\.\):\-]\s+)/i);

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const numMatch = lines[0].match(/^\s*(?:Q\s*\.?\s*)?(\d{1,4})\s*[\.\):\-]\s*/i);
    const qNumber = numMatch ? `Q${numMatch[1]}` : "Q?";
    const qLine = numMatch ? lines[0].slice(numMatch[0].length).trim() : lines[0];
    let question = qLine;

      const opts: Partial<Record<"A" | "B" | "C" | "D" | "E", string>> = {};
    let answerRaw: string | undefined;

    let i = 1;
    while (i < lines.length && !/^\(?[A-Ea-e]\s*[\)\.\-:]/.test(lines[i]) && !/^Ans(?:wer)?\s*[:\-]/i.test(lines[i])) {
      question += " " + lines[i];
      i++;
    }

    let currentLetter: "A" | "B" | "C" | "D" | "E" | null = null;
    for (; i < lines.length; i++) {
      const line = lines[i];
      const ansM = line.match(/^Ans(?:wer)?\s*[:\-]\s*(.+)$/i);
      if (ansM) { answerRaw = ansM[1].trim(); currentLetter = null; continue; }
      const optM = line.match(/^\(?([A-Ea-e])\s*[\)\.\-:]\s*(.*)$/);
      if (optM) {
        currentLetter = optM[1].toUpperCase() as "A" | "B" | "C" | "D" | "E";
        opts[currentLetter] = (optM[2] || "").trim();
      } else if (currentLetter) {
        opts[currentLetter] = ((opts[currentLetter] || "") + " " + line).trim();
      }
    }

    question = question.replace(/\s+/g, " ").trim();
    const errors: string[] = [];
    if (question.length < 3) errors.push("Question text is missing or too short.");
    // E is optional — only require A-D
    const missingLetters = (["A", "B", "C", "D"] as const).filter((L) => !opts[L]);
    if (missingLetters.length) errors.push(`Missing option${missingLetters.length > 1 ? "s" : ""} ${missingLetters.join(", ")}.`);
    if (!answerRaw) errors.push('Missing "Answer:" line.');

    let correct: ParsedMCQ["correct"] | undefined;
    if (answerRaw && missingLetters.length === 0) {
      // First try: match just the letter (e.g., "B" or "B.")
      const letterOnly = answerRaw.match(/^\(?([A-Da-d])\)?[\.\s]*$/);
      if (letterOnly) {
        correct = letterOnly[1].toUpperCase() as ParsedMCQ["correct"];
      } else {
        // Try to extract letter from answer like "B. Leave"
        const letterWithText = answerRaw.match(/^\(?([A-Da-d])\s*[\.\)]?\s+(.+)$/i);
        if (letterWithText) {
          const possibleLetter = letterWithText[1].toUpperCase() as ParsedMCQ["correct"];
          const answerText = letterWithText[2].trim();
          const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
          const normalizedAnswer = norm(answerText);
          const normalizedOption = norm(opts[possibleLetter]!);
          
          // Check if the extracted letter's option text matches the answer text
          if (normalizedAnswer === normalizedOption || normalizedOption.includes(normalizedAnswer) || normalizedAnswer.includes(normalizedOption)) {
            correct = possibleLetter;
          } else {
            // Fallback: search all options for text match
            for (const L of ["A", "B", "C", "D", "E"] as const) {
              const normalized = norm(opts[L]!);
              if (normalized === normalizedAnswer || normalized.includes(normalizedAnswer) || normalizedAnswer.includes(normalized)) {
                correct = L;
                break;
              }
            }
            if (!correct) errors.push(`Answer "${answerRaw}" does not match any option.`);
          }
        } else {
          // Original fallback logic for answers like "Continue" (just text, no letter)
          const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
          const want = norm(answerRaw);
          for (const L of ["A", "B", "C", "D", "E"] as const) {
            if (norm(opts[L]!) === want) { correct = L; break; }
          }
          if (!correct) {
            for (const L of ["A", "B", "C", "D", "E"] as const) {
              if (norm(opts[L]!).includes(want) || want.includes(norm(opts[L]!))) { correct = L; break; }
            }
          }
          if (!correct) errors.push(`Answer "${answerRaw}" does not match any option.`);
        }
      }
    }

    const preview = question.slice(0, 80) || "(no question text)";

    if (errors.length) {
      result.issues.push({ qNumber, preview, errors });
      continue;
    }

    result.valid.push({
      question,
      options: { A: opts.A!, B: opts.B!, C: opts.C!, D: opts.D!, E: opts.E },
      correct,
    });
  }

  if (!result.valid.length && !result.issues.length) {
    result.issues.push({
      qNumber: "—",
      preview: "(no questions detected)",
      errors: ['No question markers found. Each question must start with "Q1.", "1.", or "1)".'],
    });
  }

  return result;
}

// Parse MCQs from a plain text file. Expected format per question:
//
//   Q5. Question text here?
//   A. Option one
//   B. Option two
//   C. Option three
//   D. Option four
//   Answer: Option two        (or "Answer: B")
//
// Questions are separated by blank line(s). Tolerant to extra whitespace
// and to "1." / "Q.1" / "1)" question markers.
export function parseTxtMCQs(raw: string): ParsedMCQ[] {
  return validateTxtMCQs(raw).valid;
}