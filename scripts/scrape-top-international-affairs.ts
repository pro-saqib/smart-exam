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

const SOURCE_URL = "https://testpointpk.com/subcategory-mcqs/100-most-repeated-mcqs-of-international-current-affairs";
const DATA_DIR = join(process.cwd(), "data", "top-international-affairs");
const CONCURRENCY = 5;
const MAX_EMPTY_PAGES = 2;

// ── Subtopic classification ──────────────────────────────────────────────────
function classifySubtopic(question: string): string {
  const q = question.toLowerCase();

  // International Days & Observances
  if (
    /day is observed|day is celebrated|celebrated on|observed on|international.*day|world.*day|earth day|human rights day|women'?s day|labour day|peace day|cancer day|population day|education day|environment day|water day|health day|press freedom day|mothers? day|fathers? day|teachers? day|refugee day|aids day|tourism day|food day|ozone day|diabetes day|polio day|literacy day|wetlands day|radio day|wildlife day|forest day|meteorological day|intellectual property day|hypertension day|tobacco day|ocean day|blood donor day|yoga day|asteroid day|hepatitis day|youth day|humanitarian day|democracy day|maritime day|postal day|mental health day|poverty day|children'?s day|television day|toilet day/i.test(q)
  ) return "International Days & Observances";

  // International Organizations & Alliances
  if (
    /nato\b|united nation|uno\b|un general assembly|un security council|unsc|unicef|unesco|who\b|world health organization|unhcr|icj\b|international court of justice|icc\b|international criminal court|saarc\b|asean\b|brics\b|oic\b|organisation of islamic|arab league|african union|european union|g7\b|g-7\b|g20\b|g-20\b|g77\b|commonwealth|shanghai cooperation|sco\b|interpol|red cross|amnesty|fatf\b|wto\b|world trade organization|opec\b|imf\b|world bank|adb\b|asian development bank|aiib\b|headquarter|member states|secretary general/i.test(q)
  ) return "International Organizations";

  // World Leaders & Heads of State
  if (
    /president of|prime minister of|king of|queen of|chancellor of|monarch of|crowned|coronation|premier of|foreign minister of|ambassador|envoy|sultan of|emir of|ruler of|supreme leader|crown prince|pope\b|king charles|biden|trump|putin|xi jinping|macron|scholz|modi|sunak|starmer|trudeau|erdogan|netanyahu|raisi|pape/i.test(q)
  ) return "World Leaders & Heads of State";

  // Global Summits, Treaties & Conferences
  if (
    /summit\b|cop\d+|cop-\d+|conference\b|treaty|accord|agreement|pact\b|convention\b|declaration|protocol|bilateral|hosted the|host of.*summit|meeting of/i.test(q)
  ) return "Global Summits & Treaties";

  // International Sports & Events
  if (
    /olympic|fifa|world cup|cricket world cup|snooker|wimbledon|tennis|grand slam|us open|french open|australian open|champions trophy|ballon d'or|euro cup|copa america|commonwealth games|asian games|paralympics|badminton|squash|athletics|formula 1|f1\b|hockey world cup|won the.*title|won the.*championship|host.*olympics|host.*world cup/i.test(q)
  ) return "International Sports & Olympics";

  // Awards, Honors & Nobel Prizes
  if (
    /nobel prize|nobel peace prize|oscar|academy award|booker prize|pulitzer|grammy|golden globe|time person of the year|miss universe|miss world|ramon magsaysay|fields medal|abel prize/i.test(q)
  ) return "Awards & Nobel Prizes";

  // Global Conflicts, Defense & Space
  if (
    /space\b|nasa\b|isro\b|spacex|chandrayaan|artemis|james webb|telescope|satellite|lunar|rover|mars\b|moon mission|ukraine|russia|israel|palestine|gaza|hamas|hezbollah|red sea|houthi|missile|nuclear weapon|stealth|aircraft carrier|submarine|hypersonic/i.test(q)
  ) return "Global Conflicts, Defense & Space";

  // Global Economy, Currencies & Rankings
  if (
    /currency of|central bank|inflation|gdp\b|stock exchange|richest person|billionaire|forbes|passport index|corruption index|happiness index|air quality index|pollution index|cost of living|trade war|sanctions/i.test(q)
  ) return "Global Economy & Rankings";

  return "General International Affairs";
}

// ── HTML parser ──────────────────────────────────────────────────────────────
function parseMCQsFromHtml(html: string, sourceUrl: string): ExtractedMCQ[] {
  const $ = cheerio.load(html);
  const items: ExtractedMCQ[] = [];
  const letters: ("A" | "B" | "C" | "D" | "E")[] = ["A", "B", "C", "D", "E"];

  $("ol[type='A'], ol[type=A]").each((_, ol) => {
    const olEl = $(ol);
    const parent = olEl.parent();
    let question = "";

    parent.find("h5 a, h6 a").each((_, a) => {
      const txt = $(a).text().trim();
      if (txt && txt.length > 3) question = txt;
    });

    if (!question) question = parent.find("h5, h6").first().text().trim();
    if (!question || question.length < 3) return;

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
      subtopic: classifySubtopic(question),
      sourceUrl,
    });
  });

  return items;
}

async function fetchHtml(url: string, maxRetries = 3): Promise<string | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === maxRetries) { console.error(`  ✗ ${url}: ${err}`); return null; }
      await new Promise((r) => setTimeout(r, attempt * 1200 + Math.random() * 400));
    }
  }
  return null;
}

async function scrapeAll(): Promise<ExtractedMCQ[]> {
  console.log(`\n→ Scraping ${SOURCE_URL}`);
  const allMCQs: ExtractedMCQ[] = [];
  let page = 1;
  let consecutiveEmpty = 0;

  while (consecutiveEmpty < MAX_EMPTY_PAGES) {
    const pageNums = Array.from({ length: CONCURRENCY }, (_, i) => page + i);
    const results = await Promise.all(
      pageNums.map(async (p) => {
        const url = p === 1 ? SOURCE_URL : `${SOURCE_URL}?page=${p}`;
        const html = await fetchHtml(url);
        if (!html) return { p, mcqs: [] };
        return { p, mcqs: parseMCQsFromHtml(html, url) };
      })
    );

    let batchEmpty = 0;
    for (const { p, mcqs } of results) {
      if (mcqs.length === 0) batchEmpty++;
      else {
        allMCQs.push(...mcqs);
        process.stdout.write(`\r  page ${p}: +${mcqs.length} MCQs (total: ${allMCQs.length})`);
      }
    }

    consecutiveEmpty = batchEmpty >= CONCURRENCY ? consecutiveEmpty + CONCURRENCY : 0;
    page += CONCURRENCY;
    if (page > 500) break;
  }

  console.log(`\n  ✓ Done — ${allMCQs.length} raw MCQs`);
  return allMCQs;
}

function normalize(q: string) {
  return q.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}

async function main() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const raw = await scrapeAll();

  const seen = new Set<string>();
  const unique: ExtractedMCQ[] = [];
  for (const m of raw) {
    const key = normalize(m.question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(m);
  }

  const bySubtopic: Record<string, number> = {};
  for (const m of unique) bySubtopic[m.subtopic] = (bySubtopic[m.subtopic] || 0) + 1;

  console.log(`\n=== Scraping Complete ===`);
  console.log(`Raw: ${raw.length} | Unique: ${unique.length}`);
  console.log(`\nBy subtopic:`);
  for (const [sub, count] of Object.entries(bySubtopic).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${sub}: ${count}`);
  }

  const outPath = join(DATA_DIR, "top-international-affairs-mcqs.json");
  writeFileSync(outPath, JSON.stringify(unique, null, 2), "utf8");
  console.log(`\nSaved → ${outPath}`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
