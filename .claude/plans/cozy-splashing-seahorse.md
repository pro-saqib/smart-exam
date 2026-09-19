# Revised Implementation Plan: Local-First Architecture with Synchronized Counts & CPU Protection

## Context & Objectives
To solve both Cloudflare D1 row read limits and Cloudflare Worker CPU execution time limits (10ms free tier limit), we are implementing a **Local-First Architecture with Chunked Lazy Caching and Optimistic Sync**.

---

## Key Architectural Strategies

### 1. IndexedDB Client-Side Storage Layer (`src/lib/local-db.ts`)
- **Storage Engine**: Native IndexedDB wrapper (`idb-keyval` or clean wrapper) storing:
  - `subjects`: Tree structure of subjects and subtopics.
  - `mcqs`: Map/Store of all downloaded question banks.
  - `attempts`: User's quiz attempt logs.
  - `solveLater`: Bookmarked question IDs.
  - `syncQueue`: Offline mutation outbox for attempts and bookmarks.
- **Why**: Bypasses the 5MB `localStorage` limit and allows storing 10,000+ MCQs with instant retrieval.

### 2. Chunked & Lazy Curriculum Fetching (Protecting Cloudflare CPU)
- **Problem**: Querying 5,000+ MCQs with explanations in one server call triggers heavy JSON serialization and SQL joins, exceeding Cloudflare Worker CPU limits.
- **Solution**:
  - **Phase 1 (Instant Boot)**: Hydrate state instantly from local IndexedDB (0ms network, 0 CPU).
  - **Phase 2 (Lazy Subject Chunking)**: When a user visits a subject or model paper, fetch MCQs for *that specific subject group* (in chunks of 100–500) rather than downloading the entire database upfront.
  - **Phase 3 (Edge Caching)**: Apply public cache headers (`Cache-Control: public, max-age=86400, stale-while-revalidate=604800`) to curriculum server actions so repeat requests hit Cloudflare's global edge cache with **0ms server CPU time**.

### 3. Local-First Counts, Accuracy & Analytics
- **Instant Computation**: All model paper counts, attempted totals, correct/wrong counts, and accuracy percentages are computed **locally in memory** from the Zustand store.
- **Zero Round-Trips**: Navigating between subjects, model papers, and practice modes (`Weak`, `Wrong Retry`, `Solve Later`) triggers 0 server requests.

### 4. Optimistic Updates & Outbox Mutation Queue
- **Mutations (`recordAttempt`, `toggleSolveLater`)**:
  - Update Zustand state and IndexedDB **instantly** (Optimistic UI).
  - Enqueue the mutation in IndexedDB `syncQueue`.
  - Fire an asynchronous background sync request (`dbRecordAttempt`, `dbToggleSolveLater`). If offline or failing, retry automatically when reconnected.

---

## Proposed Implementation Steps

1. **Create `src/lib/local-db.ts`**:
   - Initialize IndexedDB database `prepmind-local` with object stores for `subjects`, `mcqs`, `attempts`, `solveLater`, and `syncQueue`.
2. **Enhance `src/store/app-store.ts`**:
   - Update `hydrateFromDb` to load from IndexedDB first, rendering UI instantly.
   - Implement lazy chunk loaders for subject MCQs if not present in IndexedDB.
   - Implement outbox mutation queue for offline resilience.
3. **Optimize Server Actions (`src/lib/db-actions.ts`)**:
   - Add response caching headers / lightweight query chunking.
4. **Verification**:
   - Test offline mode, instant hydration, local count calculations, and background sync.
