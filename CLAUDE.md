# PrepMind v2.0.0 — AI Agent & Developer Architecture Guide

PrepMind is an MCQ exam preparation and practice platform designed for competitive examinations (PPSC, FPSC, CSS, NTS, FGEI).

---

## 1. Core Technology Stack

- **Runtime & Package Manager**: Bun / Node.js
- **Framework**: [TanStack Start](https://tanstack.com/router/latest/docs/framework/react/start/overview) (Full-stack React 19 + SSR + Server Functions)
- **Routing**: `@tanstack/react-router` with file-based routing in `src/routes/`
- **Database & ORM**: Cloudflare D1 (SQLite-compatible) with [Drizzle ORM](https://orm.drizzle.team/)
- **Authentication**: [Better Auth](https://www.better-auth.com/) (Google OAuth + Session management)
- **State Management**: Zustand v5 with selective persistence (`src/store/app-store.ts`)
- **Styling**: Tailwind CSS v4, Lucide Icons, Radix UI primitives, Recharts

---

## 2. Directory Structure & Key Files

```
├── migrations/                # D1 SQL schema migrations (0000_init, 0001_add_user_role)
├── src/
│   ├── components/            # UI components
│   │   ├── ui/                # Radix + Tailwind base components (AlertDialog, Button, Dialog, etc.)
│   │   ├── AppShell.tsx       # Main app layout, sidebar navigation, user profile, role badge
│   │   ├── QuizRunner.tsx     # Interactive quiz engine (timer, shortcuts, bookmarks, score)
│   │   └── SavedQuizBanner.tsx# Active/paused quiz resume banner with quick resume & discard
│   ├── db/
│   │   ├── index.ts           # D1 / local SQLite connection provider
│   │   └── schema.ts          # Drizzle schema (users, sessions, subjects, mcqs, attempts)
│   ├── lib/
│   │   ├── auth.ts            # Better-auth configuration & plugins
│   │   ├── db-actions.ts      # Server functions for DB mutations & queries
│   │   ├── model-papers.ts    # Grouping algorithm (100 MCQs per Model Paper per canonical subject)
│   │   ├── session.ts         # User session & admin role authorization helpers
│   │   └── types.ts           # Shared TypeScript interfaces & types
│   ├── routes/                # TanStack Router file routes
│   │   ├── __root.tsx         # Root layout with session verification & auth redirection
│   │   ├── index.tsx          # Dashboard / Home route with stats & accuracy charts
│   │   ├── login.tsx          # Google OAuth login screen
│   │   ├── subjects.tsx       # Canonical subjects list page
│   │   ├── subjects.$subjectId.tsx # Model papers grid (100 MCQs each) + quick preview modal
│   │   ├── quiz.$subjectId.tsx# Dedicated quiz player route for subjects and model papers
│   │   ├── practice.tsx       # Practice modes (Random, Weak, Wrong retry, Solve Later)
│   │   ├── extractor.tsx      # Admin-only MCQ PDF/text parsing & ingestion engine
│   │   └── admin.users.tsx    # Admin-only user management dashboard & role controller
│   └── store/
│       └── app-store.ts       # Central client state store (hydrates from D1 via server functions)
```

---

## 3. Data Model & Architecture

### Database Schema (`src/db/schema.ts`)
- **`user`**: Stores authenticated user profiles with `role` (`"admin"` | `"user"`).
- **`subject`**: Hierarchical subjects (`parentId` supports subtopics/papers).
- **`mcq`**: Shared question bank with question text, options (A, B, C, D, E), correct answer, explanation.
- **`attempt`**: Individual student attempts with correctness, chosen option, and timestamps.
- **`solveLater`**: Per-user bookmarks for questions marked for revision.

### Shared Curriculum vs. Private User Data
- **Subjects and MCQs**: Curated globally by Admins. All registered users have read access to practice and take quizzes on them.
- **Attempts, Stats & Bookmarks**: Isolated strictly per user via `userId`.

---

## 4. Role-Based Access Control (RBAC)

1. **Admin (`role === "admin"`)**:
   - Superuser email: `saqib.logic@gmail.com` (automatically elevated on login).
   - Access to `/extractor` to upload PDFs/past papers and import MCQs.
   - Access to `/admin/users` to view learners, attempt counts, and manage role permissions.
   - Capability to create, rename, and delete subjects and MCQs.
2. **Student (`role === "user"`)**:
   - Practice MCQs across subjects and model papers.
   - Retain private quiz history, attempt stats, accuracy analytics, and bookmarks.
   - Restricted from accessing `/extractor` or `/admin/users` (enforced via `beforeLoad` route guards).

---

## 5. Model Papers Algorithm (`src/lib/model-papers.ts`)

- Past papers and subtopics are mapped into 10 canonical subject groups:
  - `english`, `urdu`, `islamic-study`, `pakistan-study`, `general-knowledge`, `everyday-science`, `basic-mathematics`, `computer`, `current-affairs`, `geography`.
- Automatically chunks all MCQs in a canonical subject group into **Model Papers of 100 MCQs each** (`Model Paper 1`, `Model Paper 2`, etc.).
- Calculates attempted count and accuracy percentage dynamically per model paper.

---

## 6. Client Store & Persistence Guardrails

- In `src/store/app-store.ts`, Zustand's `partialize` configuration **only persists lightweight session metadata (`savedQuiz`)** in `localStorage`.
- Full question banks and subject trees must **never** be saved into `localStorage` to prevent exceeding the browser's 5MB quota.

---

## 7. Useful Developer Commands

```bash
# Start local development server (runs on port 8080)
bun run dev

# Run production build
bun run build

# Generate Drizzle migrations
bun x drizzle-kit generate

# Run database migrations against local D1
bun x wrangler d1 migrations apply DB --local
```
