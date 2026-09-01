import * as cheerio from "cheerio";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const TESTPOINT_MAIN_URL = "https://testpointpk.com/past-papers-mcqs/ppsc-5-years-past-papers-subject-wise-(solved-with-details)";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Referer": "https://testpointpk.com/",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Cache-Control": "max-age=0",
};

interface Paper {
  name: string;
  url: string;
}

interface MCQ {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correct: string;
}

interface ManifestEntry {
  name: string;
  filename: string;
  url: string;
}

/**
 * Main entry point: Scrape PPSC papers from Testpoint
 * and save them to local JSON files.
 * @param yearFilter Optional year string (e.g. "2026") to limit scraping to that year.
 * @param forceRescrape If true, re-scrape all papers even if local files exist.
 */
export async function scrapeAllTestpointPPSC(yearFilter?: string, forceRescrape = false): Promise<{ totalPapers: number; totalMCQs: number }> {
  const allPapers = await fetchPaperList();
  const papers = yearFilter
    ? allPapers.filter((p) => p.name.includes(yearFilter))
    : allPapers;
  console.log(`Found ${papers.length} papers${yearFilter ? ` for year ${yearFilter}` : ""}`);

  const dataDir = join(process.cwd(), "data", "ppsc");
  mkdirSync(dataDir, { recursive: true });

  const manifest: ManifestEntry[] = [];
  let totalMCQs = 0;

  for (const paper of papers) {
    // Skip aggregate papers
    if (paper.name.match(/^PPSC all MCQs|^PPSC MCQs from/)) {
      console.log(`Skipping aggregate: ${paper.name}`);
      continue;
    }

    const filename = slugify(paper.name) + ".json";
    const filepath = join(dataDir, filename);

    if (!forceRescrape && existsSync(filepath)) {
      console.log(`Skipping existing: ${paper.name}`);
      const content = JSON.parse(require('fs').readFileSync(filepath, 'utf-8'));
      manifest.push({ name: paper.name, filename, url: paper.url });
      totalMCQs += content.mcqs.length;
      continue;
    }

    console.log(`Scraping: ${paper.name} -> ${filename}`);
    const mcqs = await scrapePaperMCQs(paper.url);
    if (mcqs.length > 0) {
      writeFileSync(filepath, JSON.stringify({ name: paper.name, mcqs }, null, 2));
      manifest.push({ name: paper.name, filename, url: paper.url });
      totalMCQs += mcqs.length;
      console.log(`  Saved ${mcqs.length} MCQs`);
    } else {
      console.log(`  No MCQs found, skipping`);
    }

    // Rate limiting: wait 2 seconds between requests
    await delay(2000);
  }

  const manifestPath = join(dataDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Manifest written with ${manifest.length} entries`);

  return { totalPapers: manifest.length, totalMCQs };
}

/**
 * Fetch the list of all PPSC papers from the main page
 */
async function fetchPaperList(): Promise<Paper[]> {
  const response = await fetch(TESTPOINT_MAIN_URL, { headers: BROWSER_HEADERS });
  if (!response.ok) throw new Error(`Failed to fetch main page: ${response.status}`);

  const html = await response.text();
  const $ = cheerio.load(html);
  const papers: Paper[] = [];

  $("table.table-bordered tr").each((i, row) => {
    const cells = $(row).find("td");
    if (cells.length >= 2) {
      const link = $(cells[1]).find("a").first();
      const href = link.attr("href");
      const text = link.text().trim();

      if (href && text && text.toLowerCase().includes("ppsc")) {
        papers.push({
          name: text,
          url: href.startsWith("http") ? href : `https://testpointpk.com${href}`,
        });
      }
    }
  });

  return papers;
}

/**
 * Scrape all MCQs from a single paper page
 */
async function scrapePaperMCQs(url: string): Promise<MCQ[]> {
  const mcqs: MCQ[] = [];
  let page = 1;
  let maxPage = 100; // safety cap, updated from pagination

  while (page <= maxPage) {
    const pageUrl = buildPageUrl(url, page);
    const response = await fetch(pageUrl, { headers: BROWSER_HEADERS });

    if (!response.ok) {
      console.log(`  Page ${page} failed: ${response.status}`);
      break;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const parsed = parseMCQsFromPage($);
    if (parsed.length === 0) break;
    mcqs.push(...parsed);

    // Detect max page from pagination number links
    const pagination = $("ul.pagination, .pagination, .pager").first();
    if (pagination.length && page === 1) {
      pagination.find("a.page-link").each((i, el) => {
        const num = parseInt($(el).text().trim(), 10);
        if (!isNaN(num) && num > maxPage) maxPage = num;
      });
    }

    // Check for next page link: › (U+203A) or rel="next" or aria-label containing "Next"
    const nextLink = pagination.find("a[rel='next'], a[aria-label*='Next'], a[aria-label*='›']")
      .add(pagination.find("a").filter((i, el) => {
        const text = $(el).text().trim();
        return text === "›" || text === "»" || text.toLowerCase() === "next" || text === ">";
      }))
      .first();

    if (nextLink.length && !nextLink.hasClass("disabled") && parsed.length > 0) {
      page++;
      await delay(500);
    } else {
      break;
    }
  }

  return mcqs;
}

/**
 * Parse MCQs from a single page's HTML
 */
function parseMCQsFromPage($: cheerio.CheerioAPI): MCQ[] {
  const mcqs: MCQ[] = [];

  // Pattern 1: Testpoint's h5 a pattern
  $("h5 a").each((i, questionEl) => {
    const questionText = cleanText($(questionEl).text());
    if (!questionText) return;

    const questionContainer = $(questionEl).closest("div").length
      ? $(questionEl).closest("div")
      : $(questionEl).parent();

    const ol = findNearestOptionsList($, $(questionEl));
    if (!ol.length) return;

    const options: MCQ["options"] = { A: "", B: "", C: "", D: "" };
    const optionLis = ol.children("li").toArray();

    optionLis.forEach((li, idx) => {
      const label = ["A", "B", "C", "D"][idx];
      if (label) {
        options[label as keyof MCQ["options"]] = cleanText($(li).text());
      }
    });

    const correctIdx = optionLis.findIndex((li) =>
      hasClassToken($(li).attr("class"), "correct")
    );
    const correct = correctIdx >= 0 ? ["A", "B", "C", "D"][correctIdx] : "";

    if (options.A && options.B && options.C && options.D) {
      mcqs.push({ question: questionText, options, correct });
    }
  });

  return mcqs;
}

function findNearestOptionsList($: cheerio.CheerioAPI, questionEl: cheerio.Cheerio<any>): cheerio.Cheerio<any> {
  const ancestors = questionEl.parents().toArray();
  for (const ancestor of ancestors) {
    const found = $(ancestor).nextAll("ol[type='A']").first();
    if (found.length) return found;
    const fallback = $(ancestor).nextAll("ol").first();
    if (fallback.length) return fallback;
  }
  return $("ol[type='A']").first();
}

function buildPageUrl(baseUrl: string, page: number): string {
  if (baseUrl.includes("{}")) {
    return baseUrl.replace(/\{\}/g, String(page));
  }

  const url = new URL(baseUrl);
  url.searchParams.set("page", String(page));
  return url.toString();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function hasClassToken(className: string | undefined, token: string): boolean {
  return (className ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .includes(token);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
