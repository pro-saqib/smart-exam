import * as cheerio from "cheerio";

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

async function scrapeAllPages(url: string): Promise<{total: number, pagesScraped: number}> {
  let page = 1;
  let total = 0;
  let maxPage = 100;

  while (page <= maxPage) {
    const pageUrl = `${url}?page=${page}`;
    const response = await fetch(pageUrl, { headers: BROWSER_HEADERS });
    if (!response.ok) break;
    const html = await response.text();
    const $ = cheerio.load(html);

    const parsed: string[] = [];
    $("h5 a").each((i, el) => {
      const text = $(el).text().trim();
      if (text) parsed.push(text);
    });

    if (parsed.length === 0) break;
    total += parsed.length;

    // Detect max page on first page
    const pagination = $("ul.pagination, .pagination, .pager").first();
    if (pagination.length && page === 1) {
      pagination.find("a.page-link").each((i, el) => {
        const num = parseInt($(el).text().trim(), 10);
        if (!isNaN(num) && num > maxPage) maxPage = num;
      });
      console.log(`  Detected max page: ${maxPage}`);
    }

    // Check next page link
    const nextLink = pagination.find("a[rel='next']")
      .add(pagination.find("a").filter((i, el) => {
        const text = $(el).text().trim();
        return text === "›" || text === "»" || text.toLowerCase() === "next" || text === ">";
      }))
      .first();

    if (nextLink.length && !nextLink.hasClass("disabled") && parsed.length > 0) {
      console.log(`  Page ${page}: ${parsed.length} MCQs`);
      page++;
      await delay(500);
    } else {
      console.log(`  Page ${page}: ${parsed.length} MCQs (last page)`);
      break;
    }
  }

  return { total, pagesScraped: page };
}

// Test on two papers
const tests = [
  { name: "PPSC Past Papers Basic Mathematics MCQs 2026", url: "https://testpointpk.com/paper-mcqs/6520/ppsc-past-papers-basic-mathematics-mcqs-2026" },
  { name: "PPSC Past Papers Computer MCQs 2026", url: "https://testpointpk.com/paper-mcqs/6526/ppsc-past-papers-computer-mcqs-2026" },
];

for (const t of tests) {
  console.log(`\nScraping: ${t.name}`);
  const result = await scrapeAllPages(t.url);
  console.log(`  Total: ${result.total} MCQs across ${result.pagesScraped} pages`);
  await delay(1000);
}
