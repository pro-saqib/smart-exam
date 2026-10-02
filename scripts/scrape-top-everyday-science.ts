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

const SOURCE_URL = "https://testpointpk.com/subcategory-mcqs/100-most-repeated-mcqs-of-eds-pdf";
const DATA_DIR = join(process.cwd(), "data", "top-everyday-science");
const CONCURRENCY = 5;
const MAX_EMPTY_PAGES = 2;

// ── Subtopic classification ──────────────────────────────────────────────────
function classifySubtopic(question: string): string {
  const q = question.toLowerCase();

  // Astronomy & Space
  if (
    /\bplanet\b|\bsolar system\b|\bsun\b|\bmoon\b|\bstar\b|\bgalaxy\b|\buniverse\b|\borbit\b|\bcomet\b|\basteroid\b|\bsatellite\b|\bjupiter\b|\bmars\b|\bvenus\b|\bmercury\b|\bsaturn\b|\buranus\b|\bneptune\b|\bearth.*planet\b|\bblue planet\b|\bred planet\b|\bspace\b|\bnasa\b|\blast ronomy\b|\btelescope\b|\bgravity\b|\blight year\b|سیارہ|خلا|آسمان/.test(q)
  ) return "Astronomy & Space";

  // Biology & Human Body
  if (
    /\bblood\b|\bheart\b|\bliver\b|\bkidney\b|\bbrain\b|\blung\b|\bbone\b|\bcell\b|\btissue\b|\borgan\b|\bvein\b|\bartery\b|\bdigest\b|\brespir\b|\bimmune\b|\bvitamin\b|\bprotein\b|\bcarbohydrate\b|\bfat\b|\bDNA\b|\bchromosome\b|\bgene\b|\bheredity\b|\bneuron\b|\bmuscle\b|\bskeleton\b|\bblood group\b|\buniversal donor\b|\bhemoglobin\b|\bplasma\b|\bplatelet\b|\bwhite blood\b|\bred blood\b|\burine\b|\bcirculation\b|\bharvey\b|\bherbivore\b|\bcarnivore\b|\bomnivore\b|\bparamecium\b|\bnucleus\b|\bnuclei\b|\brhizome\b|خون|جسم|معدہ|گردہ/.test(q)
  ) return "Biology & Human Body";

  // Chemistry
  if (
    /\belement\b|\bcompound\b|\bmolecule\b|\batom\b|\batomic\b|\bproton\b|\bneutron\b|\belectron\b|\bisotope\b|\bperiodic table\b|\bvalence\b|\bacid\b|\bbase\b|\bsalt\b|\boxidation\b|\breduction\b|\bcombustion\b|\bcatalyst\b|\bchemical\b|\bhydrogen\b|\boxygen\b|\bnitrogen\b|\bcarbon\b|\bhelium\b|\bneon\b|\bsodium\b|\bpotassium\b|\bcalcium\b|\biron\b|\bcopper\b|\bgold\b|\bsilver\b|\bco2\b|\bh2o\b|\bgas\b|\bliquid\b|\bsolid\b|\balkaline\b|\bph\b|\bbonding\b|کیمیا|عنصر/.test(q)
  ) return "Chemistry";

  // Physics
  if (
    /\bforce\b|\bvelocity\b|\bspeed\b|\bacceleration\b|\bmomentum\b|\benergy\b|\bpower\b|\bwork\b|\bpressure\b|\btemperature\b|\bheat\b|\blight\b|\bsound\b|\bwave\b|\bfrequency\b|\bwavelength\b|\belectricity\b|\bmagnet\b|\bcurrent\b|\bvoltage\b|\bresistance\b|\bohm\b|\bnewton\b|\beinstein\b|\brelativit\b|\be=mc\b|\bjoule\b|\bwatt\b|\bampere\b|\bconductor\b|\binsulator\b|\brefraction\b|\breflection\b|\bprism\b|\blens\b|\bmirror\b|\bthermod\b|\bboyle\b|\bpascal\b|\barchimedes\b|طبیعیات|برقی/.test(q)
  ) return "Physics";

  // Health & Medicine
  if (
    /\bdisease\b|\bvirus\b|\bbacteria\b|\binfection\b|\bvaccine\b|\bpenicillin\b|\bfleming\b|\bantibiotic\b|\bmedic\b|\bdoctor\b|\bhospital\b|\bsurgery\b|\bcure\b|\btreatment\b|\bsymptom\b|\bdiagnos\b|\bpathogen\b|\bimmunity\b|\bmalaria\b|\btuberculosis\b|\bcancer\b|\bdiabetes\b|\bblood pressure\b|\bvitamin deficiency\b|\bscurvy\b|\brickets\b|\banemia\b|\bphobia\b|\bfear of\b|بیماری|علاج/.test(q)
  ) return "Health & Medicine";

  // Botany & Zoology
  if (
    /\bplant\b|\btree\b|\bflower\b|\bfruit\b|\bleaf\b|\broot\b|\bstem\b|\bseed\b|\bphotosynthesis\b|\bchlorophyll\b|\bpollen\b|\bfungi\b|\bbacteria\b|\bmicrobe\b|\bbird\b|\bfish\b|\binsect\b|\bamphibian\b|\breptile\b|\bmammal\b|\bornithology\b|\bzoology\b|\bbotany\b|\becology\b|\bspecies\b|\bevolution\b|\bdarwin\b|\bfood chain\b|\bpredator\b|\bprey\b|پودہ|پودوں|جانور/.test(q)
  ) return "Botany & Zoology";

  // Branches of Science & Scientists
  if (
    /\bstudy of\b|\bbranch of\b|\bscience of\b|\bfather of\b|\binvented by\b|\bdiscovered by\b|\bdiscoverer\b|\binventor\b|\bnamed after\b|\bknown as\b.*\bscientist\b|\bscientist.*\bknown as\b|\bgeology\b|\becology\b|\bethology\b|\bseismology\b|\banthropology\b|\bpsychology\b|\bsociology\b|\banatomy\b|\bphysiology\b|\bmicrobiology\b|\bgenetics\b|\bbiochemistry\b|\bneuroscience\b|سائنس کی شاخ/.test(q)
  ) return "Branches of Science";

  return "General Everyday Science";
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

  const outPath = join(DATA_DIR, "top-everyday-science-mcqs.json");
  writeFileSync(outPath, JSON.stringify(unique, null, 2), "utf8");
  console.log(`\nSaved → ${outPath}`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
