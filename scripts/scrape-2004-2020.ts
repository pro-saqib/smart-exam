import * as cheerio from "cheerio";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://testpointpk.com/",
};

const PAPERS_2004_2020 = [
  {
    name: "PPSC Past Papers MCQs 2004 to 2020 of Urdu",
    filename: "ppsc-past-papers-mcqs-2004-to-2020-of-urdu.json",
    url: "https://testpointpk.com/paper-mcqs/4574/ppsc-past-papers-mcqs-2004-to-2020-of-urdu",
  },
  {
    name: "PPSC Past Papers MCQs 2004 to 2020 of English",
    filename: "ppsc-past-papers-mcqs-2004-to-2020-of-english.json",
    url: "https://testpointpk.com/paper-mcqs/4573/ppsc-past-papers-mcqs-2004-to-2020-of-english",
  },
  {
    name: "PPSC Past Papers MCQs 2004 to 2020 of Computer",
    filename: "ppsc-past-papers-mcqs-2004-to-2020-of-computer.json",
    url: "https://testpointpk.com/paper-mcqs/4572/ppsc-past-papers-mcqs-2004-to-2020-of-computer",
  },
  {
    name: "PPSC Past Papers MCQs 2004 to 2020 of Geography",
    filename: "ppsc-past-papers-mcqs-2004-to-2020-of-geography.json",
    url: "https://testpointpk.com/paper-mcqs/4571/ppsc-past-papers-mcqs-2004-to-2020-of-geography",
  },
  {
    name: "PPSC Past Papers MCQs 2004 to 2020 of Islamic Study",
    filename: "ppsc-past-papers-mcqs-2004-to-2020-of-islamic-study.json",
    url: "https://testpointpk.com/paper-mcqs/4570/ppsc-past-papers-mcqs-2004-to-2020-of-islamic-study",
  },
  {
    name: "PPSC Past Papers MCQs 2004 to 2020 of Current Affairs",
    filename: "ppsc-past-papers-mcqs-2004-to-2020-of-current-affairs.json",
    url: "https://testpointpk.com/paper-mcqs/4568/ppsc-past-papers-mcqs-2004-to-2020-of-current-affairs",
  },
  {
    name: "PPSC Past Papers MCQs 2004 to 2020 of Pakistan Study",
    filename: "ppsc-past-papers-mcqs-2004-to-2020-of-pakistan-study.json",
    url: "https://testpointpk.com/paper-mcqs/4569/ppsc-past-papers-mcqs-2004-to-2020-of-pakistan-study",
  },
  {
    name: "PPSC Past Papers MCQs 2004 to 2020 of Everyday Science",
    filename: "ppsc-past-papers-mcqs-2004-to-2020-of-everyday-science.json",
    url: "https://testpointpk.com/paper-mcqs/4567/ppsc-past-papers-mcqs-2004-to-2020-of-everyday-science",
  },
  {
    name: "PPSC Past Papers MCQs 2004 to 2020 of Basic Mathematics",
    filename: "ppsc-past-papers-mcqs-2004-to-2020-of-basic-mathematics.json",
    url: "https://testpointpk.com/paper-mcqs/4566/ppsc-past-papers-mcqs-2004-to-2020-of-basic-mathematics",
  },
  {
    name: "PPSC Past Papers MCQs 2004 to 2020 of General Knowledge",
    filename: "ppsc-past-papers-mcqs-2004-to-2020-of-general-knowledge.json",
    url: "https://testpointpk.com/paper-mcqs/4565/ppsc-past-papers-mcqs-2004-to-2020-of-general-knowledge",
  },
];

interface MCQ {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correct: string;
}

function cleanText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function hasClassToken(className: string | undefined, token: string): boolean {
  return (className ?? "").split(/\s+/).includes(token);
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

function parseMCQsFromPage($: cheerio.CheerioAPI): MCQ[] {
  const mcqs: MCQ[] = [];

  $("h5 a").each((_, questionEl) => {
    const questionText = cleanText($(questionEl).text());
    if (!questionText) return;

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

async function fetchPageWithRetry(url: string, retries = 3): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (res.ok) return await res.text();
    } catch {
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return null;
}

async function scrapePaper(paper: (typeof PAPERS_2004_2020)[0]): Promise<number> {
  console.log(`\n========================================`);
  console.log(`Scraping: ${paper.name}`);
  console.log(`URL: ${paper.url}`);

  const mcqs: MCQ[] = [];
  let maxPage = 1;

  const initHtml = await fetchPageWithRetry(`${paper.url}?page=1`);
  if (!initHtml) {
    console.error(`Failed to fetch first page for ${paper.name}`);
    return 0;
  }

  const init$ = cheerio.load(initHtml);
  init$("a.page-link, .pagination a").each((_, el) => {
    const href = init$(el).attr("href") || "";
    const match = href.match(/page=(\d+)/);
    if (match) {
      const pNum = parseInt(match[1], 10);
      if (pNum > maxPage) maxPage = pNum;
    }
  });

  console.log(`Discovered ${maxPage} total pages.`);

  // Sequential fetching with small delay to prevent socket closures
  for (let p = 1; p <= maxPage; p++) {
    const html = await fetchPageWithRetry(`${paper.url}?page=${p}`);
    if (html) {
      const $ = cheerio.load(html);
      const pageMCQs = parseMCQsFromPage($);
      mcqs.push(...pageMCQs);
    }
    process.stdout.write(`  Progress: page ${p}/${maxPage} (${mcqs.length} MCQs)\r`);
    await new Promise((r) => setTimeout(r, 100));
  }

  const dataDir = join(process.cwd(), "data", "ppsc");
  mkdirSync(dataDir, { recursive: true });
  const outPath = join(dataDir, paper.filename);

  writeFileSync(outPath, JSON.stringify({ name: paper.name, mcqs }, null, 2));
  console.log(`\n[✓] Saved ${mcqs.length} MCQs to ${paper.filename}`);

  return mcqs.length;
}

async function main() {
  console.log("Starting full scrape for 2004-2020 subject-wise past papers...");
  let grandTotal = 0;

  for (const paper of PAPERS_2004_2020) {
    const count = await scrapePaper(paper);
    grandTotal += count;
  }

  console.log("\n========================================");
  console.log(`2004-2020 Scraping Finished! Total MCQs: ${grandTotal}`);
  console.log("========================================\n");
}

main().catch(console.error);
