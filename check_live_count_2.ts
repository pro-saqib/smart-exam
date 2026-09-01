import * as cheerio from "cheerio";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
};

async function getLiveCount(url) {
  // Just fetch the first page, if it has 10, maybe it's just 10?
  const response = await fetch(url, { headers: BROWSER_HEADERS });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  // Look for total count in page text
  const text = .text();
  const match = text.match(/Total MCQs: (\d+)/i) || text.match(/Showing (\d+) of (\d+)/i);
  
  // Fallback to counting questions on page 1
  const questions = .length;
  
  return { questionsOnPage1: questions, textMatch: match ? match[0] : "None" };
}

const url = "https://testpointpk.com/paper-mcqs/4575/ppsc-mcqs-from-2004-to-2020";
console.log(await getLiveCount(url));
