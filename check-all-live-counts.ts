import * as cheerio from "cheerio";
import { readFileSync } from "fs";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://testpointpk.com/",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Load manifest
const manifest: Array<{name: string; filename: string; url: string}> = JSON.parse(readFileSync("data/ppsc/manifest.json", "utf-8"));

// Load local counts
const localCounts: Record<string, number> = {};
for (const entry of manifest) {
  try {
    const data = JSON.parse(readFileSync(`data/ppsc/${entry.filename}`, "utf-8"));
    localCounts[entry.url] = data.mcqs.length;
  } catch { localCounts[entry.url] = 0; }
}

async function scrapeAllPages(url: string): Promise<number> {
  let page = 1;
  let total = 0;
  while (page <= 100) {
    const pageUrl = url.includes("{}")
      ? url.replace(/\{\}/g, String(page))
      : `${url}?page=${page}`;
    
    try {
      const response = await fetch(pageUrl, { headers: BROWSER_HEADERS });
      if (!response.ok) break;
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const parsed: number[] = [];
      $("h5 a").each((i, el) => {
        const text = $(el).text().trim();
        if (text) parsed.push(1);
      });
      
      if (parsed.length === 0) break;
      total += parsed.length;
      
      // Check if there's a next page link
      const pagination = $("ul.pagination, .pagination, .pager").first();
      let hasNext = false;
      if (pagination.length) {
        const nextLink = pagination.find("a").filter((i, el) => {
          const t = $(el).text().trim().toLowerCase();
          return t.includes("next") || t === ">" || t === "»";
        }).first();
        if (nextLink.length && !nextLink.hasClass("disabled")) hasNext = true;
      }
      // Fallback: if we got 10, there might be more
      if (!hasNext && parsed.length === 10 && page < 50) hasNext = true;
      
      if (!hasNext) break;
      page++;
      await delay(300);
    } catch (e) {
      break;
    }
  }
  return total;
}

// Check first 5 papers to understand the pattern
const sample = manifest.slice(0, 5);
console.log("Checking live counts for sample papers...\n");

for (const paper of sample) {
  const live = await scrapeAllPages(paper.url);
  const local = localCounts[paper.url] || 0;
  console.log(`${paper.name}: Local=${local}, Live=${live}`);
  await delay(1000);
}
