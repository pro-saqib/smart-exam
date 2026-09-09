import * as cheerio from "cheerio";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
};

async function getLiveCount(url) {
  const response = await fetch(url, { headers: BROWSER_HEADERS });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  // Try to find a total count in the page
  const text = $("body").text();
  
  // Count questions
  const questions = $("h5 a").length;
  
  return { questionsOnPage1: questions, textSample: text.substring(0, 500) };
}

const url = "https://testpointpk.com/paper-mcqs/4575/ppsc-mcqs-from-2004-to-2020";
console.log(await getLiveCount(url));
