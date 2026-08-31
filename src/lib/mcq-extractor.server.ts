import * as cheerio from "cheerio";
import type { ExtractedMCQ, MCQExtractionRequest, MCQExtractionResult, MCQOptionLabel } from "@/lib/mcq-extractor-types";

const OPTION_LABELS: MCQOptionLabel[] = ["A", "B", "C", "D", "E"];

const TESTPOINT_MAIN_URL = "https://testpointpk.com/past-papers-mcqs/ppsc-5-years-past-papers-subject-wise-(solved-with-details)";

export interface TestpointSubject {
  name: string;
  url: string;
}

export interface TestpointYearGroup {
  year: string;
  subjects: TestpointSubject[];
}

export async function getTestpointSubjects(): Promise<TestpointYearGroup[]> {
  const response = await fetch(TESTPOINT_MAIN_URL, {
    headers: { "user-agent": "PrepMind MCQ Extractor/1.0" }
  });
  if (!response.ok) throw new Error("Failed to fetch Testpoint subjects page");

  const html = await response.text();
  const $ = cheerio.load(html);
  const yearGroups: TestpointYearGroup[] = [];
  const yearMap = new Map<string, TestpointSubject[]>();

  // Parse the table rows
  $("table.table-bordered tr").each((i, row) => {
    const cells = $(row).find("td");
    if (cells.length >= 2) {
      const link = $(cells[1]).find("a").first();
      const href = link.attr("href");
      const text = link.text().trim();

      if (href && text) {
        // Extract year from text (e.g., "PPSC all MCQs 2026" or "PPSC Past Papers Urdu MCQs 2026")
        const yearMatch = text.match(/\b(20\d{2})\b/);
        const year = yearMatch ? yearMatch[1] : "Other";

        if (!yearMap.has(year)) yearMap.set(year, []);
        yearMap.get(year)!.push({
          name: text,
          url: href.startsWith("http") ? href : `https://testpointpk.com${href}`
        });
      }
    }
  });

  // Convert map to array and sort by year (newest first)
  for (const [year, subjects] of yearMap.entries()) {
    yearGroups.push({ year, subjects });
  }
  yearGroups.sort((a, b) => {
    if (a.year === "Other") return 1;
    if (b.year === "Other") return -1;
    return parseInt(b.year) - parseInt(a.year);
  });

  return yearGroups;
}

export async function getTestpointPageLimit(url: string): Promise<number> {
  const response = await fetch(url, {
    headers: { "user-agent": "PrepMind MCQ Extractor/1.0" }
  });
  if (!response.ok) return 1;

  const html = await response.text();
  const $ = cheerio.load(html);

  // Look for pagination - common patterns
  let maxPage = 1;

  // Pattern 1: data-page attribute
  $("[data-page]").each((i, el) => {
    const page = parseInt($(el).attr("data-page") || "0");
    if (page > maxPage) maxPage = page;
  });

  // Pattern 2: Pagination links (e.g., ?page=N)
  if (maxPage === 1) {
    $("a[href*='page=']").each((i, el) => {
      const href = $(el).attr("href") || "";
      const match = href.match(/page=(\d+)/);
      if (match) {
        const page = parseInt(match[1]);
        if (page > maxPage) maxPage = page;
      }
    });
  }

  // Pattern 3: Look for "last page" link or numbered pagination
  if (maxPage === 1) {
    const paginationLinks = $("a").filter((i, el) => {
      const text = $(el).text().trim();
      return /^\d+$/.test(text);
    });

    paginationLinks.each((i, el) => {
      const page = parseInt($(el).text().trim());
      if (page > maxPage) maxPage = page;
    });
  }

  return maxPage;
}

export async function extractMcqsFromSource(request: MCQExtractionRequest): Promise<MCQExtractionResult> {
  const sourceUrl = request.sourceUrl.trim();
  if (!sourceUrl) throw new Error("Please enter a source URL.");

  const parsedUrl = new URL(sourceUrl);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  if (!Number.isInteger(request.startPage) || !Number.isInteger(request.endPage)) {
    throw new Error("Page numbers must be whole numbers.");
  }
  if (request.startPage < 1 || request.endPage < 1) {
    throw new Error("Page numbers must be at least 1.");
  }
  if (request.startPage > request.endPage) {
    throw new Error("Start page must be less than or equal to end page.");
  }

  const baseSourceUrl = normalizeSourceUrl(sourceUrl);
  const items: ExtractedMCQ[] = [];
  const urls = buildSourceUrls(baseSourceUrl, request.startPage, request.endPage);
  for (const { url, page } of urls) {
    const response = await fetch(url, { headers: { "user-agent": "PrepMind MCQ Extractor/1.0" } });
    if (!response.ok) {
      throw new Error(`Failed to fetch the source URL (${response.status}).`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error("The source URL must return HTML or plain text.");
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    items.push(...parseExtractedMcqs($, baseSourceUrl, page, page));
  }

  if (!items.length) {
    throw new Error("No MCQs were detected in the selected page range.");
  }

  return {
    sourceUrl: baseSourceUrl,
    startPage: request.startPage,
    endPage: request.endPage,
    extractedAt: Date.now(),
    items,
  };
}

function parseExtractedMcqs($: cheerio.CheerioAPI, sourceUrl: string, startPage: number, endPage: number): ExtractedMCQ[] {
  const testpointBlocks = parseTestpointBlocks($, sourceUrl, startPage);
  if (testpointBlocks.length) {
    return dedupe(testpointBlocks);
  }

  const pageNodes = getPageNodes($, startPage, endPage);
  const items: ExtractedMCQ[] = [];

  for (const pageNode of pageNodes) {
    const pageNumber = readPageNumber($, pageNode, startPage);
    const questionNodes = getQuestionNodes($, pageNode);

    for (const [index, node] of questionNodes.entries()) {
      const parsed = parseQuestionNode($, node, pageNumber, index, sourceUrl);
      if (parsed) items.push(parsed);
    }

    if (!questionNodes.length) {
      items.push(...parseTextBlocks($(pageNode).text(), pageNumber, sourceUrl));
    }
  }

  return dedupe(items);
}

function parseTestpointBlocks($: cheerio.CheerioAPI, sourceUrl: string, startPage: number): ExtractedMCQ[] {
  const questionNodes = $("h5 a").toArray();
  const items: ExtractedMCQ[] = [];

  for (const [index, questionNode] of questionNodes.entries()) {
    const questionEl = $(questionNode);
    const questionText = cleanText(questionEl.text());
    if (!questionText) continue;

    const questionContainer = questionEl.closest("div").length ? questionEl.closest("div") : questionEl.parent();
    const actualOl = findNearestOptionsList($, questionEl);
    if (!actualOl.length) continue;

    const urduPrompt = cleanText(questionContainer.find("h6").first().text());
    const optionLis = actualOl
      .children("li")
      .toArray()
      .map((li, optionIndex) => {
        const label = OPTION_LABELS[optionIndex];
        const text = cleanText($(li).text());
        return text ? { label, text } : null;
      })
      .filter((option): option is { label: MCQOptionLabel; text: string } => Boolean(option));

    const options = optionLis;
    if (options.length < 4) continue;

    const resolvedCorrectLabel = actualOl
      .children("li")
      .toArray()
      .findIndex((li) => hasClassToken($(li).attr("class"), "correct"));

    items.push({
      id: `tp-${index + 1}-${hashText(questionText)}`,
      question: urduPrompt ? `${questionText} / ${urduPrompt}` : questionText,
      options,
      correctLabel: resolvedCorrectLabel >= 0 ? OPTION_LABELS[resolvedCorrectLabel] : undefined,
      sourceUrl,
      sourcePage: startPage,
      sourceTitle: questionText,
    });
  }

  return items;
}

function getPageNodes($: cheerio.CheerioAPI, startPage: number, endPage: number): cheerio.Element[] {
  const selectors = ["[data-page]", ".page", ".tp-page", "article", "section"];
  const nodes = selectors.flatMap((selector) => $(selector).toArray());
  const byPage = nodes.filter((node) => {
    const page = Number($(node).attr("data-page"));
    return Number.isInteger(page) ? page >= startPage && page <= endPage : true;
  });
  const body = $("body")[0];
  return byPage.length ? byPage : body ? [body] : [];
}

function readPageNumber($: cheerio.CheerioAPI, node: cheerio.Element, fallback: number): number {
  const page = Number($(node).attr("data-page"));
  return Number.isInteger(page) ? page : fallback;
}

function getQuestionNodes($: cheerio.CheerioAPI, pageNode: cheerio.Element): cheerio.Element[] {
  const selectors = [".tp-mcq-card", ".question", ".mcq-item", ".question-card", "article[data-question]", "article", "li"];
  const collected = selectors.flatMap((selector) => $(pageNode).find(selector).toArray());
  const seen = new Set<cheerio.Element>();
  const result: cheerio.Element[] = [];
  for (const node of collected) {
    if (!seen.has(node)) {
      seen.add(node);
      result.push(node);
    }
  }
  return result;
}

function parseQuestionNode(
  $: cheerio.CheerioAPI,
  node: cheerio.Element,
  pageNumber: number,
  index: number,
  sourceUrl: string,
): ExtractedMCQ | null {
  const question =
    cleanText($(node).find("[data-question-text], .question-text, .question, h1, h2, h3, h4, p").first().text()) ||
    cleanText($(node).text());
  if (!question) return null;

  const options = extractOptions($, node);
  if (!options.length) return null;

  const correctLabel = detectCorrectLabel($, node, options);
  const explanation = cleanText($(node).find(".question-explanation, .explanation").first().text()) || undefined;
  return {
    id: `${pageNumber}-${index + 1}-${hashText(question)}`,
    question,
    options,
    correctLabel,
    explanation,
    sourceUrl,
    sourcePage: pageNumber,
    sourceTitle: $(node).attr("data-title") ?? undefined,
  };
}

function extractOptions($: cheerio.CheerioAPI, node: cheerio.Element): Array<{ label: MCQOptionLabel; text: string }> {
  const optionNodes = $(node).find("[data-option], .option, li").toArray();
  const parsed: Array<{ label: MCQOptionLabel; text: string }> = [];

  for (const optionNode of optionNodes) {
    const raw = cleanText($(optionNode).text());
    if (!raw) continue;
    const explicit = cleanText($(optionNode).attr("data-option"));
    const labelMatch = raw.match(/^\(?([A-E])\)?[\).:\-\s]+(.+)/i);
    const label = (explicit || labelMatch?.[1] || "") as MCQOptionLabel;
    const text = cleanText(labelMatch?.[2] ?? raw.replace(/^\(?[A-E]\)?[).:\-\s]*/i, ""));
    if (!OPTION_LABELS.includes(label) || !text) continue;
    if (parsed.some((option) => option.label === label)) continue;
    parsed.push({ label, text });
  }

  return parsed;
}

function detectCorrectLabel(
  $: cheerio.CheerioAPI,
  node: cheerio.Element,
  options: Array<{ label: MCQOptionLabel; text: string }>,
): MCQOptionLabel | undefined {
  const explicit = cleanText($(node).attr("data-answer"));
  if (OPTION_LABELS.includes(explicit as MCQOptionLabel)) return explicit as MCQOptionLabel;

  const answerText = cleanText($(node).find("[data-answer], .answer, .correct-answer").first().text());
  const answerMatch = answerText.match(/\b([A-E])\b/i);
  if (answerMatch) return answerMatch[1].toUpperCase() as MCQOptionLabel;

  const highlighted = options.find((option) => {
    const labelNode = $(node)
      .find("*")
      .toArray()
      .find((child) => cleanText($(child).text()) === option.text);
    if (!labelNode) return false;
    return hasClassToken($(labelNode).attr("class"), "correct") || $(labelNode).attr("aria-current") === "true";
  });

  return highlighted?.label;
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

function buildSourceUrls(sourceUrl: string, startPage: number, endPage: number): Array<{ url: string; page: number }> {
  if (sourceUrl.includes("{}")) {
    const urls: Array<{ url: string; page: number }> = [];
    for (let page = startPage; page <= endPage; page += 1) {
      urls.push({ url: sourceUrl.replace(/\{\}/g, String(page)), page });
    }
    return urls;
  }

  const baseUrl = new URL(sourceUrl);
  baseUrl.searchParams.delete("page");

  const urls: Array<{ url: string; page: number }> = [];
  for (let page = startPage; page <= endPage; page += 1) {
    const pageUrl = new URL(baseUrl.toString());
    pageUrl.searchParams.set("page", String(page));
    urls.push({ url: pageUrl.toString(), page });
  }
  return urls;
}

function normalizeSourceUrl(sourceUrl: string): string {
  if (sourceUrl.includes("{}")) {
    return sourceUrl;
  }

  const baseUrl = new URL(sourceUrl);
  baseUrl.searchParams.delete("page");
  return baseUrl.toString();
}

function parseTextBlocks(text: string, pageNumber: number, sourceUrl: string): ExtractedMCQ[] {
  const chunks = text.split(/(?:\n|^)(?=\s*(?:Q\.?\s*)?\d{1,3}[).:-]\s+)/i);
  const items: ExtractedMCQ[] = [];

  for (const [index, chunk] of chunks.entries()) {
    const lines = chunk
      .split(/\n+/)
      .map((line) => cleanText(line))
      .filter(Boolean);
    if (!lines.length) continue;

    const questionLine = lines[0];
    const options = lines
      .slice(1)
      .map((line) => line.match(/^([A-E])\s*[).:-]\s*(.+)$/i))
      .filter(Boolean)
      .map((match) => ({ label: match![1].toUpperCase() as MCQOptionLabel, text: cleanText(match![2]) }));

    if (options.length < 4) continue;

    items.push({
      id: `${pageNumber}-${index + 1}-${hashText(questionLine)}`,
      question: questionLine,
      options,
      sourceUrl,
      sourcePage: pageNumber,
    });
  }

  return items;
}

function dedupe(items: ExtractedMCQ[]): ExtractedMCQ[] {
  const seen = new Set<string>();
  const out: ExtractedMCQ[] = [];
  for (const item of items) {
    const key = cleanText(item.question).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function hasClassToken(className: string | undefined, token: string): boolean {
  return (className ?? "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .includes(token);
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
