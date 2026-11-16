// Borrador del pedido guardado en IndexedDB (las fotos son data URLs que
// pueden pesar varios MB, demasiado para localStorage).

const DB_NAME = "camisetas";
const STORE = "drafts";
const KEY = "order";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function loadDraft<T>(): Promise<T | undefined> {
  try {
    return await run<T | undefined>("readonly", (s) => s.get(KEY));
  } catch {
    return undefined;
  }
}

export async function saveDraft(draft: unknown): Promise<void> {
  try {
    await run("readwrite", (s) => s.put(draft, KEY));
  } catch {
    /* sin almacenamiento (modo privado, etc.): el pedido sigue en memoria */
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(KEY));
  } catch {
    /* ignorado */
  }
}
