import type { MCQ, Subject, AttemptLog, PaperCompletionRecord } from "@/lib/types";

const DB_NAME = "prepmind-local-db";
const DB_VERSION = 2;

export interface SyncQueueItem {
  id: string;
  type: "ATTEMPT" | "TOGGLE_SOLVE_LATER" | "RECORD_PAPER_COMPLETION";
  payload: any;
  createdAt: number;
}

export function openLocalDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB not supported"));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("subjects")) {
        db.createObjectStore("subjects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("mcqs")) {
        db.createObjectStore("mcqs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("attempts")) {
        db.createObjectStore("attempts", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("solveLaterIds")) {
        db.createObjectStore("solveLaterIds", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("solveLaterItems")) {
        db.createObjectStore("solveLaterItems", { keyPath: "mcqId" });
      }
      if (!db.objectStoreNames.contains("paperCompletions")) {
        const pcStore = db.createObjectStore("paperCompletions", { keyPath: "id" });
        pcStore.createIndex("subjectKey", "subjectKey", { unique: false });
      }
      if (!db.objectStoreNames.contains("syncQueue")) {
        db.createObjectStore("syncQueue", { keyPath: "id" });
      }
    };
  });
}

export async function localDbSaveUserData(data: {
  subjects: Subject[];
  mcqs: MCQ[];
  attempts: AttemptLog[];
  solveLaterIds: string[];
  solveLaterItems: { mcqId: string; subjectId: string }[];
  paperCompletions?: PaperCompletionRecord[];
}): Promise<void> {
  try {
    const db = await openLocalDB();
    const stores = ["subjects", "mcqs", "attempts", "solveLaterIds", "solveLaterItems", "paperCompletions"];
    const tx = db.transaction(stores, "readwrite");

    const subStore = tx.objectStore("subjects");
    for (const s of data.subjects) {
      subStore.put(s);
    }

    const mcqStore = tx.objectStore("mcqs");
    for (const m of data.mcqs) {
      mcqStore.put(m);
    }

    const attStore = tx.objectStore("attempts");
    for (const a of data.attempts) {
      attStore.put(a);
    }

    const slIdsStore = tx.objectStore("solveLaterIds");
    for (const id of data.solveLaterIds) {
      slIdsStore.put({ id });
    }

    const slItemsStore = tx.objectStore("solveLaterItems");
    for (const item of data.solveLaterItems) {
      slItemsStore.put(item);
    }

    if (data.paperCompletions && data.paperCompletions.length > 0) {
      const pcStore = tx.objectStore("paperCompletions");
      for (const pc of data.paperCompletions) {
        pcStore.put(pc);
      }
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("IndexedDB save failed:", err);
  }
}

export async function localDbLoadUserData(): Promise<{
  subjects: Subject[];
  mcqs: MCQ[];
  attempts: AttemptLog[];
  solveLaterIds: string[];
  solveLaterItems: { mcqId: string; subjectId: string }[];
  paperCompletions: PaperCompletionRecord[];
} | null> {
  try {
    const db = await openLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["subjects", "mcqs", "attempts", "solveLaterIds", "solveLaterItems", "paperCompletions"], "readonly");

      const subReq = tx.objectStore("subjects").getAll();
      const mcqReq = tx.objectStore("mcqs").getAll();
      const attReq = tx.objectStore("attempts").getAll();
      const slIdsReq = tx.objectStore("solveLaterIds").getAll();
      const slItemsReq = tx.objectStore("solveLaterItems").getAll();
      const pcReq = tx.objectStore("paperCompletions").getAll();

      tx.oncomplete = () => {
        resolve({
          subjects: subReq.result || [],
          mcqs: mcqReq.result || [],
          attempts: attReq.result || [],
          solveLaterIds: (slIdsReq.result || []).map((x: any) => x.id),
          solveLaterItems: slItemsReq.result || [],
          paperCompletions: pcReq.result || [],
        });
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("IndexedDB load failed:", err);
    return null;
  }
}

export async function localDbRecordPaperCompletion(completion: PaperCompletionRecord): Promise<void> {
  try {
    const db = await openLocalDB();
    const tx = db.transaction("paperCompletions", "readwrite");
    tx.objectStore("paperCompletions").put(completion);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to record paper completion in IndexedDB:", err);
  }
}

export async function localDbEnqueueSync(item: SyncQueueItem): Promise<void> {
  try {
    const db = await openLocalDB();
    const tx = db.transaction("syncQueue", "readwrite");
    tx.objectStore("syncQueue").put(item);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to enqueue sync item:", err);
  }
}

export async function localDbGetSyncQueue(): Promise<SyncQueueItem[]> {
  try {
    const db = await openLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("syncQueue", "readonly");
      const req = tx.objectStore("syncQueue").getAll();
      tx.oncomplete = () => resolve(req.result || []);
      tx.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Failed to get sync queue:", err);
    return [];
  }
}

export async function localDbRemoveSyncItem(id: string): Promise<void> {
  try {
    const db = await openLocalDB();
    const tx = db.transaction("syncQueue", "readwrite");
    tx.objectStore("syncQueue").delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("Failed to remove sync item:", err);
  }
}
