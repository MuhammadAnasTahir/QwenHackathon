// ─────────────────────────────────────────────────────────────────────────────
// Sehat Saathi — minimal IndexedDB key/value store (client only)
//   db "sehat-saathi", object store "kv" — used for medicine box photos
//   (data URLs are far too large for localStorage).
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = "sehat-saathi";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function idbAvailable(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // If the connection dies (e.g. cleared site data), allow reopening.
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("indexeddb-open-failed"));
    };
    req.onblocked = () => {
      // Another tab holds an old version open; treat as failure so we retry.
      dbPromise = null;
      reject(new Error("indexeddb-blocked"));
    };
  });
  return dbPromise;
}

export async function idbSet(key: string, value: string): Promise<void> {
  if (!idbAvailable()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb-write-failed"));
    tx.onabort = () => reject(tx.error ?? new Error("indexeddb-write-aborted"));
  });
}

export async function idbGet(key: string): Promise<string | null> {
  if (!idbAvailable()) return null;
  const db = await openDb();
  return new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => {
      resolve(typeof req.result === "string" ? req.result : null);
    };
    req.onerror = () => reject(req.error ?? new Error("indexeddb-read-failed"));
  });
}

export async function idbDel(key: string): Promise<void> {
  if (!idbAvailable()) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb-delete-failed"));
    tx.onabort = () => reject(tx.error ?? new Error("indexeddb-delete-aborted"));
  });
}
