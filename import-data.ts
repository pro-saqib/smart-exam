import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { useApp } from "./src/store/app-store";

// Helper to interact with the Zustand store outside of React components
// Since we are running this in a Node environment (Bun), 
// we need to access the store's state directly.
import { useApp as appStore } from "./src/store/app-store";

async function runImport() {
  const dataDir = join(process.cwd(), "data", "ppsc");
  const files = readdirSync(dataDir).filter(f => f.endsWith(".json") && f !== "manifest.json");
  
  // Get access to the store's state and actions
  const { subjects, addSubject, addMCQs } = appStore.getState();

  for (const file of files) {
    const filePath = join(dataDir, file);
    const paper = JSON.parse(readFileSync(filePath, "utf-8"));
    const mcqs = paper.mcqs;

    // 1. Identify/Create Parent Subject
    // We'll use a simple approach: if paper title has "PPSC", put it in "PPSC" parent
    const parentName = "PPSC";
    let parent = subjects.find(s => s.name === parentName && !s.parentId);
    if (!parent) {
      parent = addSubject(parentName);
    }

    // 2. Create subtopics in batches of 100
    const paperTitle = paper.name;
    for (let i = 0; i < mcqs.length; i += 100) {
      const batch = mcqs.slice(i, i + 100);
      const batchNum = Math.floor(i / 100) + 1;
      const subtopicName = `${paperTitle} (Part ${batchNum})`;
      
      const subtopic = addSubject(subtopicName, parent.id);
      const added = addMCQs(subtopic.id, batch.map(m => ({
        question: m.question,
        options: m.options,
        correct: m.correct as "A" | "B" | "C" | "D" | "E"
      })));
      
      console.log(`Imported ${added} MCQs into ${subtopicName}`);
    }
  }
}

runImport().catch(console.error);
