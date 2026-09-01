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

async function checkPage(url: string, page: number) {
  const pageUrl = `${url}?page=${page}`;
  const response = await fetch(pageUrl, { headers: BROWSER_HEADERS });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const questions = $("h5 a").length;
  const pagination = $("ul.pagination, .pagination, .pager").first();
  const allPaginationHTML = pagination.html() || "NO PAGINATION ELEMENT";
  const allLinks = pagination.find("a").toArray().map(el => ({
    text: $(el).text().trim(),
    href: $(el).attr("href"),
    disabled: $(el).hasClass("disabled"),
    classes: $(el).attr("class") || ""
  }));
  
  // Also look for any other pagination-like elements
  const pageLinks = $("a[href*='page']").toArray().map(el => ({
    text: $(el).text().trim(),
    href: $(el).attr("href"),
  }));

  return { questions, allLinks, pageLinks, paginationHTML: allPaginationHTML.substring(0, 2000) };
}

const url = "https://testpointpk.com/paper-mcqs/4575/ppsc-mcqs-from-2004-to-2020";
console.log("Page 1:", JSON.stringify(await checkPage(url, 1), null, 2));
console.log("\nPage 2:", JSON.stringify(await checkPage(url, 2), null, 2));
console.log("\nPage 33:", JSON.stringify(await checkPage(url, 33), null, 2));
