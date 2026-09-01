import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { useApp } from "./src/store/app-store";

const { subjects, mcqs, attempts, deleteSubject, addSubject, addMCQs } = useApp.getState();

// 1. Remove the incorrectly created "PPSC" parent subjects and their sub-topics
const ppscSubjects = subjects.filter(s => s.name === "PPSC");
console.log(`Removing ${ppscSubjects.length} 'PPSC' parent subjects.`);
for (const p of ppscSubjects) {
  deleteSubject(p.id);
}

// 2. Re-import data correctly under existing main subjects
const dataDir = join(process.cwd(), "data", "ppsc");
const files = readdirSync(dataDir).filter(f => f.endsWith(".json") && f !== "manifest.json");

console.log(`Re-importing ${files.length} local paper files.`);

// Updated subjects list to match what's in useApp
const { subjects: updatedSubjects } = useApp.getState();

function findMainSubject(name: string) {
  return updatedSubjects.find(s => s.name.toLowerCase() === name.toLowerCase() && !s.parentId);
}

for (const file of files) {
  const filePath = join(dataDir, file);
  const paper = JSON.parse(readFileSync(filePath, "utf-8"));
  const mcqsData = paper.mcqs;
  const paperName = paper.name;

  const subjectKeywords: { [key: string]: string } = {
    "english": "English", "urdu": "Urdu", "islamic": "Islamic Studies", 
    "pakistan": "Pakistan Studies", "current affairs": "Current Affairs",
    "everyday science": "Everyday Science", "basic mathematics": "Basic Mathematics",
    "computer": "Computer Science", "geography": "Geography", "general knowledge": "General Knowledge",
  };

  let mainSubjectName = "General Knowledge";
  const lowerName = paperName.toLowerCase();
  for (const keyword in subjectKeywords) {
    if (lowerName.includes(keyword)) {
      mainSubjectName = subjectKeywords[keyword];
      break;
    }
  }

  const yearMatch = paperName.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : "Unknown";

  const parent = findMainSubject(mainSubjectName);
  if (!parent) {
    console.warn(`Could not find main subject: ${mainSubjectName}`);
    continue;
  }

  if (mcqsData && mcqsData.length > 0) {
    for (let i = 0; i < mcqsData.length; i += 100) {
      const batch = mcqsData.slice(i, i + 100);
      const batchNum = Math.floor(i / 100) + 1;
      const subtopicName = `${mainSubjectName} ${year} (Part ${batchNum})`;

      const subtopic = addSubject(subtopicName, parent.id);
      const added = addMCQs(subtopic.id, batch.map((m: any) => ({
        question: m.question,
        options: m.options,
        correct: m.correct as "A" | "B" | "C" | "D" | "E"
      })));
      
      console.log(`Imported ${added} MCQs into ${subtopicName}`);
    }
  }
}
