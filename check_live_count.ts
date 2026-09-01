import * as cheerio from "cheerio";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Referer": "https://testpointpk.com/",
};

async function getLiveCount(url) {
  let page = 1;
  let total = 0;
  let hasMore = true;
  
  while (hasMore && page < 50) {
    const pageUrl = url.includes("?") ? url + "&page=" + page : url + "?page=" + page;
    const response = await fetch(pageUrl, { headers: BROWSER_HEADERS });
    if (!response.ok) break;
    const html = await response.text();
    const $ = cheerio.load(html);
    const questions = $("h5 a").length;
    if (questions === 0) break;
    total += questions;
    
    // Simple pagination check
    const pagination = $("ul.pagination, .pagination, .pager").first();
    const nextLink = pagination.find("a").filter((i, el) => $(el).text().trim().toLowerCase().includes("next") || $(el).text().trim() === ">").first();
    if (nextLink.length && !nextLink.hasClass("disabled") && questions === 10) {
        page++;
    } else {
        hasMore = false;
    }
  }
  return total;
}

const papersToCheck = [
  {name: "PPSC all MCQs 2026", url: "https://testpointpk.com/paper-mcqs/6529/ppsc-all-mcqs-2026", local: 10},
  {name: "PPSC MCQs from 2004 to 2020", url: "https://testpointpk.com/paper-mcqs/4575/ppsc-mcqs-from-2004-to-2020", local: 10}
];

for (const p of papersToCheck) {
  const live = await getLiveCount(p.url);
  console.log(`${p.name}: Local=${p.local}, Live=${live}`);
}
