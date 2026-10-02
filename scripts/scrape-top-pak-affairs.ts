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

const SOURCE_URL = "https://testpointpk.com/subcategory-mcqs/100-most-repeated-mcqs-of-pakistan-current-affairs";
const DATA_DIR = join(process.cwd(), "data", "top-pak-affairs");
const CONCURRENCY = 5;
const MAX_EMPTY_PAGES = 2;

// ── Subtopic classification ──────────────────────────────────────────────────
function classifySubtopic(question: string): string {
  const q = question.toLowerCase();

  // Defense & Armed Forces
  if (
    /coas|chief of army|cjcsc|chairman joint chiefs|chief of naval|chief of air|dg ispr|dg isi|dg rangers|dg fia|air chief|naval chief|army chief|armed forces|defence production|defence minister|weapon system|missile|ababeel|fatah|shaheen|ghauri|babur|nasr|ra'ad|barq|al-khalid|al-zarrar|jf-17|submarine|frigate|corvette|military exercise|nishan-e-haider|martyr|ispr|rangers|frontier corps|pak army|pak navy|pak air force|paf/i.test(q) ||
    /پاک فوج|آرمی چیف|ڈی جی آئی ایس پی آر|بحریہ|فضائیہ|میزائل/.test(question)
  ) return "Defense & Armed Forces";

  // Judiciary & Constitutional Posts
  if (
    /chief justice|cjp|supreme court|high court|attorney general|advocate general|election commiss|chief election|cec\b|nab chairman|national accountability|ombudsman|wafaqi mohtasib|state bank governor|governor sbp|auditor general|fbr chairman|pemra|pta chairman|hec chairman|ruet-e-hilal|ruet-i-hilal|cii\b|council of islamic ideology/i.test(q) ||
    /چیف جسٹس|سپریم کورٹ|ہائی کورٹ|الیکشن کمیشن|نیب چیئرمین|رویت ہلال/.test(question)
  ) return "Judiciary & Constitutional Posts";

  // Provincial Leadership & Governors
  if (
    /chief minister|governor of punjab|governor of sindh|governor of kpk|governor of khyber|governor of balochistan|governor of gilgit|governor of gb|prime minister of ajk|president of ajk|cm punjab|cm sindh|cm kpk|cm kp\b|cm balochistan|provincial minister|punjab assembly|sindh assembly|kpk assembly|kp assembly|balochistan assembly|chief secretary punjab|chief secretary sindh|chief secretary kp|chief secretary balochistan|igp punjab|ig punjab|ig sindh|ig kp|ig balochistan|ig islamabad/i.test(q) ||
    /وزیراعلیٰ|گورنر پنجاب|گورنر سندھ|گورنر خیبر|گورنر بلوچستان|آئی جی پنجاب/.test(question)
  ) return "Provincial Leadership & Governors";

  // Parliament, Senate & Politics
  if (
    /senate\b|national assembly|speaker of national assembly|deputy speaker|chairman of senate|deputy chairman senate|leader of the house|leader of opposition|general election|by-election|constituency|na-\d+|amendment|26th amendment|25th amendment|27th amendment|article \d+|caretaker|political party|pti\b|pml-n|pmln|ppp\b|mqm|jui-f|bap\b|anp\b|seats in senate|seats in national assembly/i.test(q) ||
    /سینیٹ|قومی اسمبلی|اسپیکر|چیئرمین سینیٹ|انتخابات|آئینی ترمیم/.test(question)
  ) return "Parliament, Senate & Politics";

  // Government & Federal Ministers
  if (
    /prime minister|president of pakistan|federal minister|minister for finance|minister for interior|minister for foreign|minister for defence|minister for law|minister for information|minister for planning|minister for energy|minister for railways|minister for education|minister for religious|minister for maritime|minister for climate|minister for aviation|minister for science|minister for health|minister for communications|advisor to pm|special assistant to pm|sapm|federal cabinet|head of state|chief executive/i.test(q) ||
    /وزیر اعظم|صدر پاکستان|وفاقی وزیر|وزیر خزانہ|وزیر داخلہ|وزیر خارجہ|وفاقی کابینہ/.test(question)
  ) return "Government & Federal Ministers";

  // Economy, Energy & CPEC
  if (
    /imf\b|international monetary fund|world bank|budget\b|fiscal year|inflation|gdp\b|cpec\b|china-pakistan economic|gwadar|fbr\b|tax\b|revenue|remittance|foreign exchange|currency|rupee|state bank|sbp\b|dam\b|diamer|bhasha|mohmand|dasu|tarbela|energy|electricity|circular debt|solar|petroleum|gas pipeline|oil refinery|privatization|pia\b|pakistan steel/i.test(q) ||
    /معیشت|بجٹ|مہنگائی|سی پیک|گوادر|ڈیم|روپیہ/.test(question)
  ) return "Economy, Energy & CPEC";

  // Foreign Affairs & Bilateral Visits
  if (
    /foreign minister|bilateral|ambassador|high commission|envoy|visit to|visited pakistan|visited china|visited saudi|visited turkey|visited iran|visited usa|sco\b|shanghai cooperation|oic\b|organisation of islamic|united nations|un general assembly|unga|un security council|fatf\b|border|torkham|chaman|kartarpur|kashmir|article 370|article 35a|loc\b|line of control|treaty|accord|mou\b/i.test(q) ||
    /خارجہ|سفیر|اقوام متحدہ|کشمیر|او آئی سی/.test(question)
  ) return "Foreign Affairs & Diplomacy";

  // Sports, Awards & Personalities
  if (
    /cricket|psl\b|pakistan super league|hockey|squash|football|olympics|commonwealth|babar azam|shaheen afridi|arshad nadeem|inam butt|naseem shah|tamgha-e-imtiaz|sitara-e-imtiaz|hilal-e-imtiaz|nishan-e-pakistan|nishan-e-imtiaz|pride of performance|civil award|mountaineer|k2\b|everest|nanga parbat|sajid sadpara|shehroze kashif|passed away|died on|died at|film|actor|actress|qavi khan|zia mohyeddin|amjad islam amjad/i.test(q) ||
    /کرکٹ|پی ایس ایل|اولمپکس|تمغہ امتیاز|ستارہ امتیاز|ہلال امتیاز|نشان پاکستان|وفات/.test(question)
  ) return "Sports, Awards & Personalities";

  return "General Pakistan Affairs";
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
  return q.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9؀-ۿ ]/g, "").trim();
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

  const outPath = join(DATA_DIR, "top-pak-affairs-mcqs.json");
  writeFileSync(outPath, JSON.stringify(unique, null, 2), "utf8");
  console.log(`\nSaved → ${outPath}`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
