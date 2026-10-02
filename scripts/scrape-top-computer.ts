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

const SOURCE_URL = "https://testpointpk.com/subcategory-mcqs/100-most-repeated-computer-mcqs";
const DATA_DIR = join(process.cwd(), "data", "top-computer");
const CONCURRENCY = 5;
const MAX_EMPTY_PAGES = 2;

// ── Subtopic classification ──────────────────────────────────────────────────
function classifySubtopic(question: string): string {
  const q = question.toLowerCase();

  // MS Word
  if (
    /\bms.word\b|\bms word\b|\bmicrosoft word\b|\bword 20\d\d\b|\bword processor\b|ctrl\s*\+.*word|ورڈ/.test(q)
  ) return "MS Word";

  // MS Excel
  if (
    /\bms.excel\b|\bms excel\b|\bmicrosoft excel\b|\bexcel 20\d\d\b|\bspreadsheet\b|\bworksheet\b|\bcell.*formula\b|\bformula.*cell\b|\baverageif\b|\bvlookup\b|\bhlookup\b|\bpivot\b|ایکسل/.test(q)
  ) return "MS Excel";

  // MS PowerPoint
  if (
    /\bpowerpoint\b|\bms.powerpoint\b|\bpresentation\b|\bslide\b|\bslides\b|\bpptx\b|پاورپوائنٹ|سلائیڈ/.test(q)
  ) return "MS PowerPoint";

  // Internet & Networking
  if (
    /\binternet\b|\bnetwork\b|\bhttp\b|\bhttps\b|\burl\b|\bwww\b|\bemail\b|\be.mail\b|\bspam\b|\bmodem\b|\bprotocol\b|\bip.address\b|\bwifi\b|\bwireless\b|\bbrowser\b|\bwebsite\b|\bweb.page\b|\bfirewall\b|\bnic\b|\bdownload\b|\bupload\b|\bbandwidth\b|\bserver\b|\bclient\b|\bdomain\b|\bdns\b|\bftp\b|\blan\b|\bwan\b|\bman\b|\btcp\b|انٹرنیٹ|ای میل|جنک/.test(q)
  ) return "Internet & Networking";

  // Hardware & Components
  if (
    /\bram\b|\brom\b|\bcpu\b|\bprocessor\b|\bmemory\b|\bhard.disk\b|\bhard.drive\b|\bssd\b|\bmonitor\b|\bkeyboard\b|\bmouse\b|\bprinter\b|\bscanner\b|\bjoystick\b|\binput.device\b|\boutput.device\b|\bstorage\b|\bcd.drive\b|\bdvd\b|\busb\b|\bport\b|\bvolatile\b|\bnon.volatile\b|\bcache\b|\bregister\b|\balu\b|\bcontrol.unit\b|\bmicroprocessor\b|\bmotherboard\b|\bchip\b|\btransistor\b|\bbit\b|\bbyte\b|\bgb\b|\bmb\b|\btb\b|\bhardcopy\b|\bsoftcopy\b|\bvdu\b|\bmicr\b|\bocr\b|\bbarcode\b|میموری|ریم|پرنٹر|کی بورڈ/.test(q)
  ) return "Hardware & Components";

  // Operating Systems & Windows
  if (
    /\bwindows\b|\boperating.system\b|\bos\b|\blinux\b|\bunix\b|\bmac.?os\b|\bfile.explorer\b|\bdesktop\b|\btaskbar\b|\bcontrol.panel\b|\bshortcut.*key\b|\bkey.*shortcut\b|\bctrl\s*\+|\balt\s*\+|\bshift\s*\+|\bf\d.*key\b|\bwindows\s*\+|\bboot\b|\bkernal\b|\bkernel\b|\bcommand.prompt\b|\brun.dialog\b|ونڈوز/.test(q)
  ) return "Operating Systems & Windows";

  // Computer Generations & History
  if (
    /\bgeneration\b|\bfirst.gen\b|\bsecond.gen\b|\bthird.gen\b|\bfourth.gen\b|\bfifth.gen\b|\bibm\b|\bbabbage\b|\bfather.of\b|\binvented\b|\binventor\b|\bhistory.of.computer\b|\banalytical.engine\b|\beniac\b|\bunivac\b|\babacus\b|\bnewton\b|\bturing\b|نسل/.test(q)
  ) return "Computer Generations & History";

  // Abbreviations & Full Forms
  if (
    /full form|full name|stand for|stands for|abbreviation|مکمل نام|مطلب کیا|کا مطلب|آئی آئی|آئی ایس/.test(q)
  ) return "Abbreviations & Full Forms";

  // MS Office General (Word/Excel/PowerPoint combined shortcuts without specific app mention)
  if (
    /\bms.office\b|\bmicrosoft office\b|\boffice 20\d\d\b/.test(q)
  ) return "MS Office";

  return "General Computer";
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

  const outPath = join(DATA_DIR, "top-computer-mcqs.json");
  writeFileSync(outPath, JSON.stringify(unique, null, 2), "utf8");
  console.log(`\nSaved → ${outPath}`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
