import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";

interface ExtractedMCQ {
  question: string;
  options: { A: string; B: string; C?: string; D?: string; E?: string };
  correct?: "A" | "B" | "C" | "D" | "E";
  explanation?: string;
  subtopic: string;
  sourceUrl: string;
}

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://testpointpk.com/",
};

const SOURCES = [
  {
    url: "https://testpointpk.com/subcategory-mcqs/100-most-repeated-mcqs-of-english-pdf",
    label: "top100",
  },
];

const DATA_DIR = join(process.cwd(), "data", "top-english");
const CONCURRENCY = 5;
const MAX_EMPTY_PAGES = 2; // stop after 2 consecutive empty pages

// ── Subtopic classification ──────────────────────────────────────────────────
function classifySubtopic(question: string, sourceLabel: string): string {
  const q = question.toLowerCase();

  if (sourceLabel === "idioms") return "Idioms & Proverbs";
  if (sourceLabel === "one-word") return "One Word Substitution";

  // For the top100 mixed source — classify by question patterns
  if (/\bsynonym\b/.test(q)) return "Synonyms";
  if (/\bantonym\b|\bopposite\b/.test(q)) return "Antonyms";
  if (
    /idiom|proverb|phrase\b|burning the midnight|beat about|smell a rat|hit the nail|cold feet|throw in towel|axe to grind|make the most/.test(q)
  )
    return "Idioms & Proverbs";
  if (
    /one word substitution|one who\b|a person who\b|a man who\b|a woman who\b|a place where\b|study of\b|fear of\b|love of\b|worship of\b|phobia\b|mania\b|phile\b|ologist\b/.test(q)
  )
    return "One Word Substitution";
  if (
    /active|passive voice|change the voice|change into passive|change into active/.test(q)
  )
    return "Active & Passive Voice";
  if (
    /indirect speech|direct speech|change into indirect|narration|reported speech|change the narration/.test(q)
  )
    return "Direct & Indirect Speech";
  if (
    /tense|past tense|present tense|future tense|simple past|simple present|past perfect|past continuous|present perfect|has\/have|had been/.test(q)
  )
    return "Tenses";
  if (
    /preposition|fill in the blank|fill in blank|select.*preposition|correct preposition/.test(q)
  )
    return "Prepositions & Fill in the Blanks";
  if (
    /article|a\/an|use of a |use of an |use of the |\b(a|an|the)\b.*correct/.test(q)
  )
    return "Articles";
  if (
    /correct spell|spelling|correctly spell|wrongly spell/.test(q)
  )
    return "Spelling";
  if (
    /correct sentence|correct option|correct punctuation|correct capitali|correct form|correct word|correct use|choose the correct/.test(q)
  )
    return "Grammar & Sentence Correction";

  return "General English";
}

// ── HTML parser ──────────────────────────────────────────────────────────────
function parseMCQsFromHtml(
  html: string,
  sourceUrl: string,
  sourceLabel: string
): ExtractedMCQ[] {
  const $ = cheerio.load(html);
  const items: ExtractedMCQ[] = [];
  const letters: ("A" | "B" | "C" | "D" | "E")[] = ["A", "B", "C", "D", "E"];

  // Structure: parent <div> contains <div class="container-fluid"> (with h5>a question)
  // followed by <ol type="A"> (sibling of the container-fluid div)
  $("ol[type='A'], ol[type=A]").each((_, ol) => {
    const olEl = $(ol);

    // The ol and the question container are siblings inside a parent div
    // Walk up to find the nearest preceding h5>a in a sibling container
    let question = "";
    const parent = olEl.parent();

    // Try: h5 > a inside a preceding sibling div
    parent.find("h5 a").each((_, a) => {
      const txt = $(a).text().trim();
      if (txt && txt.length > 5) question = txt;
    });

    // Fallback: h5 text directly
    if (!question) {
      question = parent.find("h5").first().text().trim();
    }

    if (!question || question.length < 5) return;

    const options: Record<string, string> = {};
    let correct: "A" | "B" | "C" | "D" | "E" | undefined;

    olEl.find("li").each((idx, li) => {
      const letter = letters[idx];
      if (!letter) return;
      const text = $(li).text().trim();
      if (text) {
        options[letter] = text;
        if ($(li).hasClass("correct")) correct = letter;
      }
    });

    if (Object.keys(options).length < 2) return;

    // Extract explanation from a following sibling element
    let explanation: string | undefined;
    const expBlock = olEl.nextAll("div, p, ul, blockquote").first();
    if (expBlock.length) {
      const expText = expBlock.text().replace(/\s+/g, " ").trim();
      if (expText && expText.length > 5 && expText.length < 600) explanation = expText;
    }

    items.push({
      question,
      options: options as ExtractedMCQ["options"],
      correct,
      explanation,
      subtopic: classifySubtopic(question, sourceLabel),
      sourceUrl,
    });
  });

  return items;
}

// ── Fetch with retry ─────────────────────────────────────────────────────────
async function fetchHtml(url: string, maxRetries = 3): Promise<string | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`  ✗ Failed to fetch ${url}: ${err}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, attempt * 1200 + Math.random() * 400));
    }
  }
  return null;
}

// ── Scrape one source URL with auto-stop ─────────────────────────────────────
async function scrapeSource(
  baseUrl: string,
  label: string
): Promise<ExtractedMCQ[]> {
  console.log(`\n→ Scraping [${label}] ${baseUrl}`);
  const allMCQs: ExtractedMCQ[] = [];
  let page = 1;
  let consecutiveEmpty = 0;

  while (consecutiveEmpty < MAX_EMPTY_PAGES) {
    // Batch CONCURRENCY pages at a time
    const pageNums = Array.from({ length: CONCURRENCY }, (_, i) => page + i);
    const results = await Promise.all(
      pageNums.map(async (p) => {
        const url = p === 1 ? baseUrl : `${baseUrl}?page=${p}`;
        const html = await fetchHtml(url);
        if (!html) return { p, mcqs: [] };
        const mcqs = parseMCQsFromHtml(html, url, label);
        return { p, mcqs };
      })
    );

    let batchEmpty = 0;
    for (const { p, mcqs } of results) {
      if (mcqs.length === 0) {
        batchEmpty++;
      } else {
        allMCQs.push(...mcqs);
        process.stdout.write(
          `\r  [${label}] page ${p}: +${mcqs.length} MCQs (total: ${allMCQs.length})`
        );
      }
    }

    if (batchEmpty >= CONCURRENCY) {
      consecutiveEmpty += CONCURRENCY;
    } else {
      consecutiveEmpty = 0;
    }

    page += CONCURRENCY;
    // Safety ceiling — 386 pages confirmed
    if (page > 400) break;
  }

  console.log(`\n  ✓ [${label}] done — ${allMCQs.length} raw MCQs`);
  return allMCQs;
}

// ── Normalize for deduplication ───────────────────────────────────────────────
function normalize(q: string) {
  return q
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const allRaw: ExtractedMCQ[] = [];

  for (const source of SOURCES) {
    const mcqs = await scrapeSource(source.url, source.label);
    allRaw.push(...mcqs);
  }

  // Global deduplication across all sources
  const seen = new Set<string>();
  const unique: ExtractedMCQ[] = [];
  for (const m of allRaw) {
    const key = normalize(m.question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(m);
  }

  // Group by subtopic for summary
  const bySubtopic: Record<string, number> = {};
  for (const m of unique) {
    bySubtopic[m.subtopic] = (bySubtopic[m.subtopic] || 0) + 1;
  }

  console.log(`\n\n=== Scraping Complete ===`);
  console.log(`Total raw MCQs: ${allRaw.length}`);
  console.log(`Total unique MCQs: ${unique.length}`);
  console.log(`\nBy subtopic:`);
  for (const [sub, count] of Object.entries(bySubtopic).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${sub}: ${count}`);
  }

  const outPath = join(DATA_DIR, "top-english-mcqs.json");
  writeFileSync(outPath, JSON.stringify(unique, null, 2), "utf8");
  console.log(`\nSaved → ${outPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
