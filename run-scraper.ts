import { scrapeAllTestpointPPSC } from "./src/lib/testpoint-scraper";
console.log("Starting re-scrape of categorized papers (force)...");
const result = await scrapeAllTestpointPPSC(undefined, true);
console.log("Scraping completed:", result);
