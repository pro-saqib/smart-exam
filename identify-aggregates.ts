import { readFileSync } from "fs";
const manifest: Array<{name: string; filename: string; url: string}> = JSON.parse(readFileSync("data/ppsc/manifest.json", "utf-8"));

const aggregate = manifest.filter(p => p.name.match(/^PPSC all MCQs|^PPSC MCQs from/));
const categorized = manifest.filter(p => !p.name.match(/^PPSC all MCQs|^PPSC MCQs from/));

console.log(`Total: ${manifest.length}, Aggregate: ${aggregate.length}, Categorized: ${categorized.length}`);
console.log("\nAggregate papers to REMOVE:");
aggregate.forEach(p => console.log(`  - ${p.name} (${p.filename})`));
