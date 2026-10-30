/**
 * Import Imtiaz Shahid Model Papers into local D1 SQLite — Category-wise
 *
 * Strategy (mirrors Top MCQs structure):
 * - One parent per canonical subject group:
 *     is_english, is_gk, is_pakistan_study, is_everyday_science,
 *     is_islamic_study, is_computer, is_geography, is_current_affairs,
 *     is_urdu, is_misc
 * - Subtopics: one per (category, paperNumber) pair named "Paper N" under that parent
 *   → model-papers.ts chunks them alphabetically into Model Paper 1, 2, ...
 * - Category in source file determines which parent group an MCQ belongs to
 */

import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const DB_PATH = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/162b09b8c67e3fafda77330427d4549c676383a88b8302c1c67b4028ca2ddb1e.sqlite";
const DATA_DIR = "data/imtiaz shahid";
const ADMIN_USER_ID = "system";

const db = new Database(DB_PATH);

// ─── Canonical parent subject definitions ────────────────────────────────────

const PARENTS = [
  { id: "is_english",         name: "IS English" },
  { id: "is_gk",              name: "IS General Knowledge" },
  { id: "is_pakistan_study",  name: "IS Pakistan Study" },
  { id: "is_everyday_science",name: "IS Everyday Science" },
  { id: "is_islamic_study",   name: "IS Islamic Study" },
  { id: "is_computer",        name: "IS Computer" },
  { id: "is_geography",       name: "IS Geography" },
  { id: "is_current_affairs", name: "IS Current Affairs" },
  { id: "is_urdu",            name: "IS Urdu" },
];

// ─── Category → parent_id mapping ───────────────────────────────────────────

function mapCategoryToParentId(category: string): string {
  // For combined subjects like "General Knowledge & English", use the first part
  const primary = category.split(/[&,\/]/)[0].trim();
  const c = primary.toLowerCase();
  // English variants
  if (/english|grammar|vocabulary|synonym|antonym|sentence|idiom|one.word|translation|proverb|phrasal/.test(c)) return "is_english";
  // Pakistan Study variants
  if (/pakistan.stud|pak.stud|pera.law|history/.test(c)) return "is_pakistan_study";
  if (/pakistan.affair|pak.affair/.test(c)) return "is_pakistan_study";
  // Islamic Study variants
  if (/islamic|islamiat|islamiyat/.test(c)) return "is_islamic_study";
  // Everyday Science variants
  if (/everyday.science|every.day.science|basic.science|everyday\/general|everyday.general/.test(c)) return "is_everyday_science";
  // Computer variants
  if (/computer|basic.computer/.test(c)) return "is_computer";
  // Geography
  if (/geography/.test(c)) return "is_geography";
  // Current Affairs
  if (/current.affair/.test(c)) return "is_current_affairs";
  // Urdu / language
  if (/urdu|persian/.test(c)) return "is_urdu";
  // GK bucket: everything else
  return "is_gk";
}

// ─── Parsed MCQ type ─────────────────────────────────────────────────────────

interface ParsedMCQ {
  paperNumber: number;
  category: string;
  question: string;
  options: { A: string; B: string; C: string; D: string; E?: string };
  correct: "A" | "B" | "C" | "D" | "E";
}

// ─── Format A parser: markdown bulk files ────────────────────────────────────

function parseFormatA(content: string): ParsedMCQ[] {
  const results: ParsedMCQ[] = [];
  const lines = content.split("\n");

  let currentPaper = 0;
  let currentCategory = "General Knowledge";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    const paperMatch = line.match(/^\*\*Model Paper (\d+)\*\*$/);
    if (paperMatch) {
      currentPaper = parseInt(paperMatch[1]);
      i++;
      continue;
    }

    const catMatch = line.match(/^\*\*Category:\s*(.+?)\*\*$/);
    if (catMatch) {
      currentCategory = catMatch[1].trim();
      i++;
      continue;
    }

    const qMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (qMatch && currentPaper > 0) {
      let question = qMatch[2].trim();
      i++;

      while (i < lines.length) {
        const next = lines[i].trim();
        if (next.startsWith("*") || next.match(/^\d+\./) || next.match(/^\*\*Model Paper/) || next.match(/^\*\*Category:/)) break;
        if (next.length > 0) question += " " + next;
        i++;
      }

      const opts: Record<string, string> = {};
      let correct = "";

      while (i < lines.length) {
        const optLine = lines[i].trim();
        if (!optLine.startsWith("*")) break;

        const ansMatch = optLine.match(/^\*\s*\*\*Answer\*\*:\s*([A-E])/i);
        if (ansMatch) {
          correct = ansMatch[1].toUpperCase();
          i++;
          break;
        }

        const optMatch = optLine.match(/^\*+\s*([A-E])\)\s*(.+)$/);
        if (optMatch) {
          opts[optMatch[1].toUpperCase()] = optMatch[2].trim();
        }
        i++;
      }

      if (opts.A && opts.B && opts.C && opts.D && correct && ["A","B","C","D","E"].includes(correct)) {
        results.push({
          paperNumber: currentPaper,
          category: currentCategory,
          question: question.trim(),
          options: { A: opts.A, B: opts.B, C: opts.C, D: opts.D, ...(opts.E ? { E: opts.E } : {}) },
          correct: correct as "A" | "B" | "C" | "D" | "E",
        });
      }
      continue;
    }

    i++;
  }

  return results;
}

// ─── Format B parser ─────────────────────────────────────────────────────────

function parseFormatB(content: string): ParsedMCQ[] {
  const results: ParsedMCQ[] = [];
  const lines = content.split("\n");

  let currentPaper = 0;
  let currentCategory = "General Knowledge";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    const paperMatch = line.match(/^Model Paper\s+(\d+)$/i);
    if (paperMatch) {
      currentPaper = parseInt(paperMatch[1]);
      i++;
      continue;
    }

    const subjectMatch = line.match(/^Subject:\s*(.+)$/i);
    if (subjectMatch) {
      currentCategory = subjectMatch[1].trim();
      i++;
      continue;
    }

    const qMatch = line.match(/^Q:\s*\d+\.\s*(.+)$/);
    if (qMatch && currentPaper > 0) {
      let question = qMatch[1].trim();
      i++;

      while (i < lines.length) {
        const next = lines[i].trim();
        if (next.match(/^[A-D]:/) || next.match(/^Ans:/) || next.match(/^Q:/)) break;
        if (next.length > 0) question += " " + next;
        i++;
      }

      const opts: Record<string, string> = {};
      let correct = "";

      while (i < lines.length) {
        const optLine = lines[i].trim();

        const ansMatch = optLine.match(/^Ans:\s*([A-D])/i);
        if (ansMatch) {
          correct = ansMatch[1].toUpperCase();
          i++;
          break;
        }

        const optMatch = optLine.match(/^([A-D]):\s*(.+)$/);
        if (optMatch) {
          opts[optMatch[1].toUpperCase()] = optMatch[2].trim();
          i++;
          continue;
        }

        if (optLine.match(/^Q:/) || optLine.match(/^Model Paper/i) || optLine.match(/^Subject:/i)) break;
        i++;
      }

      if (opts.A && opts.B && opts.C && opts.D && correct) {
        results.push({
          paperNumber: currentPaper,
          category: currentCategory,
          question: question.trim(),
          options: { A: opts.A, B: opts.B, C: opts.C, D: opts.D },
          correct: correct as "A" | "B" | "C" | "D",
        });
      }
      continue;
    }

    i++;
  }

  return results;
}

// ─── ID generation ───────────────────────────────────────────────────────────

function makeId(prefix: string, text: string): string {
  return prefix + createHash("md5").update(text).digest("hex").slice(0, 16);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Create parent subjects (one per canonical category)
  for (const p of PARENTS) {
    db.run(
      "INSERT OR IGNORE INTO subject (id, user_id, name, parent_id, created_at, total_mcqs) VALUES (?, ?, ?, NULL, ?, 0)",
      [p.id, ADMIN_USER_ID, p.name, Date.now()]
    );
  }
  console.log(`✅ Ensured ${PARENTS.length} IS parent subjects`);

  // subtopic cache: "is_english|Paper 3" → subject_id
  const subtopicCache = new Map<string, string>();

  function ensureSubtopic(parentId: string, paperNumber: number): string {
    const key = `${parentId}|${paperNumber}`;
    if (subtopicCache.has(key)) return subtopicCache.get(key)!;
    const id = `${parentId}_p${String(paperNumber).padStart(3, "0")}`;
    const name = `Paper ${paperNumber}`;
    db.run(
      "INSERT OR IGNORE INTO subject (id, user_id, name, parent_id, created_at, total_mcqs) VALUES (?, ?, ?, ?, ?, 0)",
      [id, ADMIN_USER_ID, name, parentId, Date.now()]
    );
    subtopicCache.set(key, id);
    return id;
  }

  const files = readdirSync(DATA_DIR).filter(f => f.endsWith(".txt")).sort();
  console.log(`\n📂 Found ${files.length} files\n`);

  let totalInserted = 0;
  let totalSkipped = 0;

  // Track counts per subtopic for bulk update
  const subtopicInsertCounts = new Map<string, number>();

  const insertMcq = db.prepare(
    "INSERT OR IGNORE INTO mcq (id, user_id, subject_id, question, options, correct, explanation, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)"
  );

  for (const file of files) {
    const filePath = join(DATA_DIR, file);
    const content = readFileSync(filePath, "utf-8");
    const isFormatB = content.includes("Q:") && content.includes("Ans:");
    const mcqs = isFormatB ? parseFormatB(content) : parseFormatA(content);

    console.log(`📄 ${file} → ${mcqs.length} MCQs (Format ${isFormatB ? "B" : "A"})`);

    db.run("BEGIN");
    try {
      for (const m of mcqs) {
        const parentId = mapCategoryToParentId(m.category);
        const subjectId = ensureSubtopic(parentId, m.paperNumber);
        const mcqId = makeId("is_", m.question + m.options.A + m.options.B);
        const result = insertMcq.run(mcqId, ADMIN_USER_ID, subjectId, m.question, JSON.stringify(m.options), m.correct, Date.now());
        if (result.changes > 0) {
          totalInserted++;
          subtopicInsertCounts.set(subjectId, (subtopicInsertCounts.get(subjectId) || 0) + 1);
        } else {
          totalSkipped++;
        }
      }
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      console.error(`❌ Error in ${file}:`, e);
    }
  }

  // Update total_mcqs on each subtopic
  console.log("\n⏳ Updating subtopic counts...");
  for (const [subId, count] of subtopicInsertCounts.entries()) {
    db.run("UPDATE subject SET total_mcqs = total_mcqs + ? WHERE id = ?", [count, subId]);
  }

  // Update parent totals
  for (const p of PARENTS) {
    const row = db.query("SELECT COALESCE(SUM(total_mcqs),0) as total FROM subject WHERE parent_id = ?").get(p.id) as any;
    db.run("UPDATE subject SET total_mcqs = ? WHERE id = ?", [row.total, p.id]);
  }

  // Print summary per parent
  console.log("\n" + "=".repeat(55));
  console.log(`✅ Import complete! Inserted: ${totalInserted} | Skipped: ${totalSkipped}`);
  console.log("\nCategory breakdown:");
  for (const p of PARENTS) {
    const row = db.query("SELECT total_mcqs FROM subject WHERE id = ?").get(p.id) as any;
    if (row?.total_mcqs > 0) {
      const paperCount = (db.query("SELECT count(*) as c FROM subject WHERE parent_id = ?").get(p.id) as any).c;
      console.log(`  ${p.name}: ${row.total_mcqs} MCQs across ${paperCount} papers`);
    }
  }

  const count = (db.query("SELECT count(*) as c FROM mcq").get() as any).c;
  console.log(`\nTotal MCQs in DB now: ${count}`);
}

main().catch(console.error);
