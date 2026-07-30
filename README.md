# PrepMind

PrepMind is a local-first MCQ practice app for organizing study material by subject, importing question banks from PDF or plain text files, and drilling questions with focused practice modes.

## What it does

- Create and manage subjects.
- Upload MCQ PDFs or TXT files into a subject.
- Practice questions in random mode, weak-question mode, or wrong-answer retry mode.
- Bookmark questions to solve later.
- Track attempts, accuracy, and weak areas.
- Persist your study data locally in the browser.

## Main screens

- Dashboard: summary stats, subject progress, and weak areas.
- Subjects: create subjects, rename or delete them, and import question banks.
- Practice: practice questions across all subjects or filter to one subject.
- Solve Later: revisit bookmarked questions.

## Important notes

- Your data is stored locally in the browser using persistent client-side storage.
- If you clear site data or use a different browser/device, your subjects and progress will not carry over.
- PDF and text imports are parsed from files you upload; make sure MCQs follow the expected numbered format.
- The app currently targets multiple-choice questions with answer options A through E.

## Getting started

### Prerequisites

- Node.js 18+ or Bun

### Install dependencies

```bash
bun install
```

If you prefer npm, you can use:

```bash
npm install
```

### Run locally

```bash
bun run dev
```

### Build for production

```bash
bun run build
```

### Preview the production build

```bash
bun run preview
```

### Lint the project

```bash
bun run lint
```

## Project structure

- `src/routes/` contains the app routes.
- `src/components/` contains shared UI and the quiz runner.
- `src/lib/` contains PDF parsing, TXT parsing, types, and utilities.
- `src/store/` contains the Zustand app state and persistence logic.

## Typical workflow

1. Create a subject.
2. Upload one or more PDF or TXT files containing MCQs.
3. Review imported questions and start practicing.
4. Mark tough questions for later review.
5. Use weak or wrong-answer modes to focus revision.

## Tech stack

- TanStack Start
- TanStack Router
- React 19
- TypeScript
- Vite
- Zustand
- Tailwind CSS

## Deployment

The project includes a Cloudflare-oriented setup through Vite and Wrangler configuration, so it can be adapted for edge deployment if needed.

## Contributing

This is a study-tool workspace, so keep changes focused and make sure the import and practice flows still work after edits.