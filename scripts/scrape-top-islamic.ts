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

const SOURCE_URL = "https://testpointpk.com/subcategory-mcqs/100-most-repeated-islamic-study-mcqs";
const DATA_DIR = join(process.cwd(), "data", "top-islamic");
const CONCURRENCY = 5;
const MAX_EMPTY_PAGES = 2;

// ── Subtopic classification ──────────────────────────────────────────────────
function classifySubtopic(question: string): string {
  const q = question.toLowerCase();

  // Holy Quran
  if (
    /\bquran\b|holy quran|surah|surat\b|para\b|juz\b|ayat|verse|ruku|bismillah|tilawat|sajda|makki|madni|نازل|قرآن|سورة|آیت/.test(q)
  ) return "Holy Quran";

  // Pillars of Islam
  if (
    /\bnamaz\b|\bsalat\b|\bsalah\b|\bnmaaz\b|prayer|zakat|roza|saum|hajj|kaaba|umrah|kalima|azan|adhan|iqamat|wuzu|ablution|pillar.*islam|five.*pillar|arkan/.test(q)
  ) return "Pillars of Islam";

  // Battles & Ghazwat
  if (
    /\bghazwa\b|\bgazwa\b|\bbattle\b|\bjang\b|uhud|badr|khandaq|khyber|hunain|tabuk|muta|conquest|fatah|makkah|فتح|غزوہ|جنگ/.test(q)
  ) return "Battles & Ghazwat";

  // Prophets
  if (
    /\bprophet\b|\bnabi\b|\banbiya\b|\brazool\b|\bprophet\b|hazrat adam|hazrat noah|hazrat ibrahim|hazrat musa|hazrat isa|hazrat yusuf|hazrat dawood|hazrat sulaiman|hazrat ilyas|hazrat idrees|hazrat lut|hazrat salih|hazrat hud|hazrat shoaib|hazrat zakaria|hazrat yahya|hazrat ismail|hazrat ishaq|hazrat yaqoob|shaikh.ul.anbia|khateeb.ul.anbia|jadd.ul.anbia|نبی|رسول|انبیاء/.test(q)
  ) return "Prophets (Anbiya)";

  // Companions & Sahaba
  if (
    /\bsahaba\b|\bsahabi\b|\bcompanion\b|hazrat bilal|hazrat abu bakr|hazrat umar|hazrat usman|hazrat ali|hazrat hamza|hazrat khalid|hazrat abu ubaidah|hazrat zaid|hazrat ayesha|hazrat khadija|hazrat fatima|hazrat hassan|hazrat hussain|ashra mubashara|صحابہ|خلیفہ/.test(q) &&
    !/khulafa|caliph.*how many|pious caliph.*lasted/.test(q)
  ) return "Companions & Sahaba";

  // Khulafa-e-Rashideen
  if (
    /khulafa|khilafat|caliphate|pious caliph|rashideen|abu bakr.*cali|umar.*cali|usman.*cali|ali.*cali|first cali|second cali|third cali|fourth cali|خلفائے راشدین/.test(q)
  ) return "Khulafa-e-Rashideen";

  // Hadith & Fiqh
  if (
    /\bhadith\b|\bhadees\b|siha.e.sitta|bukhari|muslim.*imam|tirmidhi|abu dawood|nasa.i|ibn majah|muwatta|fiqh|fatwa|halal|haram|wajib|sunnah|mustahab|makrooh|muftah|ijma|qiyas|ijtihad|jurisprudence/.test(q)
  ) return "Hadith & Fiqh";

  // Islamic History
  if (
    /\boic\b|hijra|hijrah|migration|madinah|makkah.*year|islamic.*history|ummayad|abbasid|ottoman|dynasty|caliphate.*year|secretary.*general|headquarter|zakat.*ordinance|zia.ul.haq|islamic.*law|constitution/.test(q)
  ) return "Islamic History";

  // Ethics & Morality
  if (
    /\bethics\b|morality|moral|conduct|normative|voluntary action|akhlaq|اخلاق/.test(q)
  ) return "Ethics & Morality";

  return "General Islamic Studies";
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

    if (!question) {
      question = parent.find("h5, h6").first().text().trim();
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

// ── Fetch with retry ─────────────────────────────────────────────────────────
async function fetchHtml(url: string, maxRetries = 3): Promise<string | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`  ✗ Failed: ${url}: ${err}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, attempt * 1200 + Math.random() * 400));
    }
  }
  return null;
}

// ── Scrape all pages ─────────────────────────────────────────────────────────
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
      if (mcqs.length === 0) {
        batchEmpty++;
      } else {
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

  // Deduplicate
  const seen = new Set<string>();
  const unique: ExtractedMCQ[] = [];
  for (const m of raw) {
    const key = normalize(m.question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(m);
  }

  // Summary by subtopic
  const bySubtopic: Record<string, number> = {};
  for (const m of unique) bySubtopic[m.subtopic] = (bySubtopic[m.subtopic] || 0) + 1;

  console.log(`\n=== Scraping Complete ===`);
  console.log(`Raw: ${raw.length} | Unique: ${unique.length}`);
  console.log(`\nBy subtopic:`);
  for (const [sub, count] of Object.entries(bySubtopic).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${sub}: ${count}`);
  }

  const outPath = join(DATA_DIR, "top-islamic-mcqs.json");
  writeFileSync(outPath, JSON.stringify(unique, null, 2), "utf8");
  console.log(`\nSaved → ${outPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
