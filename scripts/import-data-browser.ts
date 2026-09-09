// This script assumes it runs in the browser context (e.g. from the console)
// where it has access to the Zustand store directly.
async function importMCQs() {
  const store = window.useApp.getState();
  const { addSubject, addMCQs } = store;
  
  // Fetch from our new server function
  const response = await fetch("/api/all-papers"); 
  const localPapers = await response.json();
  
  const { subjects: currentSubjects } = store;

  const subjectKeywords = {
    "english": "English", "urdu": "Urdu", "islamic": "Islamic Studies",
    "pakistan": "Pakistan Studies", "current affairs": "Current Affairs",
    "everyday science": "Everyday Science", "basic mathematics": "Basic Mathematics",
    "computer": "Computer Science", "geography": "Geography", "general knowledge": "General Knowledge",
  };

  for (const paper of localPapers) {
    let mainSubjectName = "General Knowledge";
    const lowerName = paper.name.toLowerCase();
    for (const keyword in subjectKeywords) {
      if (lowerName.includes(keyword)) {
        mainSubjectName = subjectKeywords[keyword];
        break;
      }
    }

    const yearMatch = paper.name.match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : "Unknown";

    const parent = currentSubjects.find(s => s.name === mainSubjectName && !s.parentId);
    if (!parent) continue;

    for (let i = 0; i < paper.mcqs.length; i += 100) {
      const batch = paper.mcqs.slice(i, i + 100);
      const batchNum = Math.floor(i / 100) + 1;
      const subtopicName = `${mainSubjectName} ${year} (Part ${batchNum})`;

      const subtopic = addSubject(subtopicName, parent.id);
      addMCQs(subtopic.id, batch.map((m: any) => ({
        question: m.question,
        options: m.options,
        correct: m.correct as "A" | "B" | "C" | "D" | "E"
      })));
    }
  }
}
