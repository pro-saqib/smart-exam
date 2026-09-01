import { scrapeAllTestpointPPSC } from "./src/lib/testpoint-scraper";
console.log("Resuming re-scrape (skipping existing)...");
// forceRescrape = false to pick up where it left off
const result = await scrapeAllTestpointPPSC(undefined, false);
console.log("Scraping completed:", result);
