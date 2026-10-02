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

const SOURCE_URL = "https://testpointpk.com/subcategory-mcqs/100-most-repeated-mcqs-of-pakistan-study-pdf";
const DATA_DIR = join(process.cwd(), "data", "top-pakistan-study");
const CONCURRENCY = 5;
const MAX_EMPTY_PAGES = 2;

// ── Subtopic classification ──────────────────────────────────────────────────
function classifySubtopic(question: string): string {
  const q = question.toLowerCase();

  // Leadership & Government
  if (
    /\bpresident\b|\bprime minister\b|\bpm\b|\bgovernor.general\b|\bchief minister\b|\bcabinet\b|\bminister\b|\belection\b|\bruler\b|\bking\b|\bqueen\b|\bemperor\b|\bnawab\b|\bwazir.azam\b|\bsadar\b|\bcm\b|\bgovernor\b|صدر|وزیر اعظم|وزیر اعلیٰ|گورنر جنرل|حکومت/.test(q)
  ) return "Leadership & Government";

  // Constitution & Law
  if (
    /\bconstitution\b|\bact\b|\bbill\b|\bamendment\b|\bparliament\b|\bnational assembly\b|\bsenate\b|\bprovincial assembly\b|\bjudiciary\b|\bcourt\b|\blegal\b|\blaw\b|\belection commission\b|\bdiarchy\b|\bgovernment of india act\b|\bindependence act\b|\browlatt\b|\bartical\b|\barticle\b|آئین|قانون|اسمبلی/.test(q)
  ) return "Constitution & Law";

  // Pakistan History & Independence Movement
  if (
    /\bindependence\b|\bpartition\b|\b1947\b|\bquaid\b|\bjinnah\b|\ballama iqbal\b|\bliaquat\b|\bmuslim league\b|\bcongress\b|\bbengal\b|\bindian.national\b|\bsimla\b|\blahore resolution\b|\bpakistan resolution\b|\bround table\b|\bcaliphate\b|\bkhilafat\b|\bwar of independence\b|\b1857\b|\bsher shah\b|\bgt road\b|\bmughal\b|\bbabar\b|\bakbar\b|\baurangzeb\b|\bhumayun\b|\bsepoy\b|\bcolonial\b|\bbritish\b|\bcompany\b|\bviceroy\b|\braj\b|\bsindh.*712\b|\b712.*sindh\b|تحریک|آزادی|قائد|مسلم لیگ/.test(q)
  ) return "Pakistan History";

  // Geography & Natural Resources
  if (
    /\briver\b|\bbarrage\b|\bdam\b|\bcanal\b|\bdesert\b|\bmountain\b|\bpeak\b|\bglacier\b|\bprovince\b|\bdistrict\b|\bcity\b|\bcapital\b|\bborder\b|\blake\b|\bsea\b|\bocean\b|\bport\b|\bindus\b|\bjhelum\b|\bchenab\b|\bravi\b|\bsutlej\b|\bbeas\b|\btarbela\b|\bwarsak\b|\bkhyber\b|\bkarakorum\b|\bhimalaya\b|\bk2\b|\bnanga parbat\b|\btirich mir\b|\bbalochistn\b|\bsindh\b|\bpunjab\b|\bkpk\b|\bgilgit\b|\barabian sea\b|دریا|صحرا|پہاڑ|دریائے/.test(q)
  ) return "Geography & Natural Resources";

  // National Symbols & Facts
  if (
    /\bnational\b.*\b(animal|bird|tree|flower|fruit|sport|game|dish|language|anthem|flag|symbol|emblem|color|colour)\b|\b(animal|bird|tree|flower|fruit|sport|game|dish)\b.*\bnational\b|\bmarkhor\b|\bchukar\b|\bdeodar\b|\bjasmine\b|\bmango\b|\bhockey\b|\bcrescent\b|\bstar\b.*flag|\bflag.*star\b|\bnational day\b|\bindependence day\b|\bdefence day\b|قومی جانور|قومی پرندہ|قومی/.test(q)
  ) return "National Symbols & Facts";

  // Military & Wars
  if (
    /\bwar\b|\bnishan.e.haider\b|\bmilitary\b|\barmy\b|\bnavy\b|\bair force\b|\bbattle\b|\bsoldier\b|\bgeneral\b|\badmiral\b|\bfieldmarshal\b|\bjawan\b|\bkargil\b|\b1965\b|\b1971\b|\b1948\b|\bsitara.e.jurat\b|\bhilal.e.jurat\b|\bpakistan armed\b|\bisi\b|فوج|جنگ|نشان حیدر/.test(q)
  ) return "Military & Wars";

  // International Relations & Organizations
  if (
    /\bsco\b|\boic\b|\bun\b|\buno\b|\bsaarc\b|\bnato\b|\becо\b|\bimf\b|\bworld bank\b|\bmember\b.*\borganization\b|\borganization\b.*\bmember\b|\btreaty\b|\bagreement\b|\brelation\b|\bdiplomatic\b|\bambassador\b|\bembassy\b|\bvisa\b|\bcpec\b|\bchina.pakistan\b|شنگھائی|تنظیم/.test(q)
  ) return "International Relations";

  // Books, Literature & Personalities
  if (
    /\bbook\b|\bwrote\b|\bauthor\b|\bautobiography\b|\bbiography\b|\bpoem\b|\bpoet\b|\bnovel\b|\bliterature\b|\biqbal\b|\bfaiz\b|\bghalib\b|\bpublished\b|\bwritten by\b|\bwriter\b|کتاب|مصنف|شاعر/.test(q)
  ) return "Books & Literature";

  // Economy & Development
  if (
    /\beconomy\b|\bgdp\b|\bcurrency\b|\brupee\b|\bbudget\b|\btrade\b|\bexport\b|\bimport\b|\bindustry\b|\bagriculture\b|\bcrop\b|\bwheat\b|\bcotton\b|\brice\b|\bsugar\b|\bbank\b|\bstate bank\b|\bsbp\b|معیشت|زراعت/.test(q)
  ) return "Economy & Development";

  return "General Pakistan Study";
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

  const outPath = join(DATA_DIR, "top-pakistan-study-mcqs.json");
  writeFileSync(outPath, JSON.stringify(unique, null, 2), "utf8");
  console.log(`\nSaved → ${outPath}`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
