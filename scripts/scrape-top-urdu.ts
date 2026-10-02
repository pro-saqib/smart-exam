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

const SOURCE_URL = "https://testpointpk.com/subcategory-mcqs/100-most-repeated-mcqs-of-urdu-with-pdf";
const DATA_DIR = join(process.cwd(), "data", "top-urdu");
const CONCURRENCY = 5;
const MAX_EMPTY_PAGES = 2;

// ── Subtopic classification ──────────────────────────────────────────────────
function classifySubtopic(question: string): string {
  const q = question.toLowerCase();

  // Idioms & Proverbs / محاورات و ضرب الامثال
  if (
    /محاورہ|ضرب المثل|کہاوت|روزمرہ|معنی کیا ہے.*محاورہ|کونسا محاورہ|مکمل کریں.*ضرب|مثل/.test(question) ||
    /\bidiom\b|\bproverb\b/i.test(q)
  ) return "Idioms & Proverbs";

  // Synonyms & Antonyms / مترادف و متضاد
  if (
    /مترادف|متضاد|ہم معنی|کی ضد|کا متضاد|کا مترادف|الفاظ.*متضاد|الفاظ.*مترادف/.test(question) ||
    /\bsynonym\b|\bantonym\b/i.test(q)
  ) return "Synonyms & Antonyms";

  // Word Meanings & Vocabulary / الفاظ و معانی
  if (
    /کے معنی|کے لغوی معنی|کا مطلب|معنی کیا ہیں|معنی بتائیں|لغت|املا|درست املا|غلط املا/.test(question) ||
    /\bmeaning\b|\bvocabulary\b|\bspelling\b/i.test(q)
  ) return "Word Meanings & Vocabulary";

  // Urdu Grammar / اردو قواعد
  if (
    /قواعد|اسم|فعل|حرف|مرکب|فاعل|مفعول|صفت|موصوف|معرفہ|نکرہ|ظرف|ضمیر|موصول|اشارہ|علم|لقب|تخلص|خطاب|عرف|کنیت|سابقہ|لاحقہ|تذکیر و تانیث|واحد جمع|مذکر|مونث|جملہ|رموز|اوقاف|اعراب|سکتہ|وقفہ|رابطہ|تفصیلیہ|ختمہ|استفہامیہ|فجائیہ|قوسین|واوین/.test(question) ||
    /\bgrammar\b|\bnoun\b|\bverb\b|\badjective\b/i.test(q)
  ) return "Urdu Grammar";

  // Urdu Poetry & Genres / اصنافِ سخن و شاعری
  if (
    /شعر|شاعر|شاعری|غزل|نظم|مطلع|مقطع|قافیہ|ردیف|بحر|وزن|تخلص|مصرع|بیت|مسدس|مخمس|رباعی|مثنوی|مرثیہ|قصیدہ|واسوخت|ہائیکو|آزاد نظم|معریٰ نظم|صنف سخن|حسن مطلع|تلمیح|استعارہ|تشبیہ|مجاز مرسل|کنایہ|صنعت/.test(question) ||
    /\bpoetry\b|\bcouplet\b|\brhyme\b/i.test(q)
  ) return "Poetry & Poetic Devices";

  // Urdu Literature & Books / اردو ادب و کتب
  if (
    /کتاب|تصنیف|مصنف|ناول|افسانہ|داستان|ڈراما|ڈرامہ|انشائیہ|سوانح|آپ بیتی|سفرنامہ|مضمون|خطوط|مکتوب|دیوان|کلیات|مجموعہ|ادب|تنقید|ترجمہ|تالیف/.test(question) ||
    /\bnovel\b|\bbook\b|\bliterature\b|\bautobiography\b|\bdrama\b/i.test(q)
  ) return "Urdu Literature & Books";

  // Poets & Writers / شعراء و مصنفین
  if (
    /غالب|اقبال|میر تقی|سودا|ذوق|مومن|حالی|شبلی|سرسید|پطرس|فیض|فراز|ساحر|ناصر کاظمی|حسرت موہانی|داغ دہلوی|میر انیس|مرزا دبیر|عبدالحق|بابائے اردو|مولوی عبدالحق|احمد ندیم قاسمی|منٹو|عصمت چغتائی|قرۃ العین|انتظار حسین|مشتاق احمد یوسفی|ابن انشا|شوکت تھانوی|کرشن چندر|پریم چند/.test(question)
  ) return "Poets & Writers";

  return "General Urdu";
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

  const outPath = join(DATA_DIR, "top-urdu-mcqs.json");
  writeFileSync(outPath, JSON.stringify(unique, null, 2), "utf8");
  console.log(`\nSaved → ${outPath}`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
