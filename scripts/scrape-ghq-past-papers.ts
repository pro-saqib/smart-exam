import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import * as cheerio from "cheerio";

interface ExtractedMCQ {
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
    E?: string;
  };
  correct?: "A" | "B" | "C" | "D" | "E";
  explanation?: string;
  url?: string;
  pageNumber: number;
}

const BASE_URL = "https://testpointpk.com/past-papers-mcqs/army-headquarters-ghq-past-papers-and-syllabus";
const TOTAL_PAGES = 268;
const CONCURRENCY = 8;
const DATA_DIR = join(process.cwd(), "data", "ghq");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Referer": "https://testpointpk.com/",
};

async function fetchPageWithRetry(page: number, maxRetries = 3): Promise<string> {
  const url = `${BASE_URL}?page=${page}`;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return await res.text();
    } catch (err) {
      if (attempt === maxRetries) {
        throw new Error(`Failed to fetch page ${page} after ${maxRetries} attempts: ${err}`);
      }
      const delay = attempt * 1000 + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(`Unreachable`);
}

function parseMCQsFromPage(html: string, pageNumber: number): ExtractedMCQ[] {
  const $ = cheerio.load(html);
  const items: ExtractedMCQ[] = [];

  $("ol[type='A']").each((_, ol) => {
    // Locate the question anchor preceding this option list
    const qContainer = $(ol).prev().find("h5 a[href*='/mcqs/']");
    const qH5 = $(ol).prevAll().find("h5 a[href*='/mcqs/']").last();
    const qAnchor = qContainer.length ? qContainer : qH5;

    const question = qAnchor.text().trim();
    if (!question) return;

    const url = qAnchor.attr("href") || undefined;
    const options: Record<string, string> = {};
    let correct: "A" | "B" | "C" | "D" | "E" | undefined = undefined;
    const letters: ("A" | "B" | "C" | "D" | "E")[] = ["A", "B", "C", "D", "E"];

    $(ol).find("li").each((optIdx, li) => {
      const letter = letters[optIdx];
      const text = $(li).text().trim();
      if (letter && text) {
        options[letter] = text;
        if ($(li).hasClass("correct")) {
          correct = letter;
        }
      }
    });

    if (Object.keys(options).length >= 2) {
      items.push({
        question,
        options: options as ExtractedMCQ["options"],
        correct,
        url,
        pageNumber,
      });
    }
  });

  return items;
}

async function scrapeAllGHQ() {
  console.log(`Starting GHQ Past Papers scraping (${TOTAL_PAGES} pages total)...`);
  const t0 = Date.now();

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const allMCQs: ExtractedMCQ[] = [];
  const pages = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);

  for (let i = 0; i < pages.length; i += CONCURRENCY) {
    const chunk = pages.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (page) => {
        try {
          const html = await fetchPageWithRetry(page);
          const mcqs = parseMCQsFromPage(html, page);
          return { page, mcqs, error: null };
        } catch (err) {
          console.error(`Error on page ${page}:`, err);
          return { page, mcqs: [], error: err };
        }
      }),
    );

    for (const res of chunkResults) {
      if (res.mcqs.length > 0) {
        allMCQs.push(...res.mcqs);
      }
    }

    const processed = Math.min(i + CONCURRENCY, pages.length);
    const percent = ((processed / TOTAL_PAGES) * 100).toFixed(1);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`\r[${percent}%] Fetched ${processed}/${TOTAL_PAGES} pages | Total MCQs: ${allMCQs.length} (${elapsed}s)`);
  }

  console.log("\nScraping complete! Processing and deduplicating...");

  // Normalize question text for deduplication
  function normalize(q: string) {
    return q.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
  }

  const seen = new Set<string>();
  const uniqueMCQs: ExtractedMCQ[] = [];

  for (const m of allMCQs) {
    const key = normalize(m.question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueMCQs.push(m);
  }

  console.log(`Total raw MCQs: ${allMCQs.length}`);
  console.log(`Total unique MCQs: ${uniqueMCQs.length}`);

  const outputPath = join(DATA_DIR, "ghq-past-papers.json");
  writeFileSync(outputPath, JSON.stringify(uniqueMCQs, null, 2), "utf8");

  console.log(`Successfully saved dataset to: ${outputPath}`);
}

scrapeAllGHQ().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
