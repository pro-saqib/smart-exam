import { readFileSync, writeFileSync, unlinkSync } from "fs";
const manifest: Array<{name: string; filename: string; url: string}> = JSON.parse(readFileSync("data/ppsc/manifest.json", "utf-8"));

const categorized = manifest.filter(p => !p.name.match(/^PPSC all MCQs|^PPSC MCQs from/));

// Remove aggregate files
manifest.filter(p => p.name.match(/^PPSC all MCQs|^PPSC MCQs from/)).forEach(p => {
  try {
    unlinkSync(`data/ppsc/${p.filename}`);
    console.log(`Deleted: ${p.filename}`);
  } catch (e) {
    console.log(`Error deleting ${p.filename}: ${e}`);
  }
});

// Update manifest
writeFileSync("data/ppsc/manifest.json", JSON.stringify(categorized, null, 2));
console.log(`Updated manifest.json with ${categorized.length} entries.`);
