---
name: practice-config-plan
description: Plan for implementing hierarchical practice configuration (Random, Weak, Wrong)
---

# Practice Configuration Improvements

## 1. UI Enhancements (`src/routes/practice.tsx`)
- **Main Practice Configuration Section**:
  - **Subject/Subtopic Hierarchy**:
    - `SubjectSelect` (Main Subject dropdown): Required for all modes.
    - `SubtopicSelect` (Subtopic dropdown): Conditional field - disabled if mode is "Random", optional/required based on user intent for "Weak/Wrong".
  - **Practice Mode**: "Random", "Weak Retry", "Wrong Retry".
  - **Question Count**: Pre-set buttons for 50/100 (for Random mode), slider/input for others.
  - **Quiz Options**: Checkboxes for "Shuffle Questions" and "Shuffle Options".

## 2. Logic Implementation
- **Data Fetching/Filtering**:
  - `Random`: Filter `mcqs` where `mcq.subjectId` is current subject OR a subtopic subject ID. Use `shuffle` and `slice` to limit count.
  - `Weak/Wrong Retry`: Filter `mcqs` matching selected `subjectId` (or `subtopicId`) AND `wrongCount > 0` (Weak) or `lastAttemptCorrect === false` (Wrong).

## 3. Component Updates
- Update `PracticePage` to hold this configuration state.
- Pass this configuration object to `QuizRunner` via props, ensuring `QuizRunner` uses the new filtered question set.

**Why:** The user wants distinct flows for Random (subject-only) and Weak/Wrong (hierarchical) practice with specific UI controls.

**How to apply:** Implement the hierarchical selectors in `src/routes/practice.tsx`, update the filtering logic in `src/routes/practice.tsx` to build the MCQ pool, and pass the pool to `QuizRunner`.
