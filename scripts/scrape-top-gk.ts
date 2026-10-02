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

const SOURCE_URL = "https://testpointpk.com/subcategory-mcqs/100-most-repeated-gk-mcqs";
const DATA_DIR = join(process.cwd(), "data", "top-gk");
const CONCURRENCY = 5;
const MAX_EMPTY_PAGES = 2;

// ── Subtopic classification ──────────────────────────────────────────────────
function classifySubtopic(question: string): string {
  const q = question.toLowerCase();

  // International Organizations
  if (
    /\buno\b|\bunited nations\b|\boic\b|\bsco\b|\basean\b|\badb\b|\beco\b|\bimf\b|\bwho\b|\bwto\b|\bnato\b|\bsaarc\b|\bopec\b|\biaea\b|\bicj\b|\bifc\b|\bfao\b|\bamnesty\b|\bfifa\b|\bioc\b|\bncc\b|\bpca\b|\bips\b|\bworld bank\b|organization.*islamic|interpol|secretary.general|headquarter|headquarters/.test(q)
  ) return "International Organizations";

  // World Geography
  if (
    /\bocean\b|\bsea\b|\bstrait\b|\bplateau\b|\bcontinent\b|\bcapital\b|\bcountry\b|\bcountries\b|\bisland\b|\briver\b|\bmountain\b|\bdesert\b|\blake\b|\bvolcano\b|\bglacier\b|\bcanal\b|\bpeak\b|\batlantic\b|\bpacific\b|\bindian ocean\b|\barctic\b|\bantarctic\b|\bmediterranean\b|\bbosphorus\b|\btibetan\b|\bnile\b|\bamazon\b|\bhimalaya\b|geography|located in|situated in|largest.*country|smallest.*country|بحر|آبنائے|سمندر/.test(q)
  ) return "World Geography";

  // Sports & Olympics
  if (
    /\bolympic\b|\bolympics\b|\bsports\b|\bfootball\b|\bcricket\b|\btennis\b|\bhockey\b|\bbasketball\b|\bworldcup\b|\bworld cup\b|\bgold medal\b|\bsilver medal\b|\bchampion\b|\bstadium\b|\bfifa\b|national game|کھیل|اولمپک/.test(q)
  ) return "Sports & Olympics";

  // Important Days & Events
  if (
    /\bday\b.*celebrat|\bcelebrat.*day\b|world.*day|international.*day|national day|observed on|annual.*day|عالمی دن|قومی دن/.test(q)
  ) return "Important Days";

  // Abbreviations & Full Forms
  if (
    /full form|full name|stand for|abbreviation|stands for|مکمل نام|مطلب کیا|کا مطلب/.test(q)
  ) return "Abbreviations & Full Forms";

  // World Records & Famous Firsts
  if (
    /\bfirst\b|\blargest\b|\bsmallest\b|\bhighest\b|\blowest\b|\blongest\b|\bshortest\b|\bdeepest\b|\bbiggest\b|\boldest\b|\bfastest\b|\brichest\b|\bmost\b.*world|world.*record|پہلی بار|سب سے/.test(q)
  ) return "World Records & Firsts";

  // Current Affairs & World Leaders
  if (
    /\bpresident\b|\bprime minister\b|\bpm\b|\bceo\b|\bchairman\b|\bminister\b|\bgovernor\b|\bleader\b|\bking\b|\bqueen\b|\bsultan\b|\belection\b|\bvote\b|\bparliament\b|\bconstitution\b|\bgovernment\b|\bpolicy\b|\btreaty\b|\bagreement\b|\bsummit\b|\bconference\b|وزیر اعظم|صدر|وزیر/.test(q)
  ) return "Current Affairs & World Leaders";

  // Science & Technology
  if (
    /\bscience\b|\btechnology\b|\bcomputer\b|\binvention\b|\bdiscovery\b|\bchemical\b|\bphysics\b|\bbiology\b|\bspace\b|\bnasa\b|\bplanet\b|\bsolar\b|\batom\b|\bdna\b|\bcovid\b|\bvirus\b|\bdisease\b|\bvaccine\b|\bmedicine\b|\belement\b|\bperiodic\b|\bascii\b|\binternet\b|سائنس|ٹیکنالوجی/.test(q)
  ) return "Science & Technology";

  return "General Knowledge";
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
      if (txt && txt.length > 5) question = txt;
    });

    if (!question) question = parent.find("h5, h6").first().text().trim();
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

  const outPath = join(DATA_DIR, "top-gk-mcqs.json");
  writeFileSync(outPath, JSON.stringify(unique, null, 2), "utf8");
  console.log(`\nSaved → ${outPath}`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
