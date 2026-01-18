import way from "wayy";

export function useCacheSignal<T extends object>(key: string, defaultValue: T) {
  // Try to load from localStorage on initialization
  const cached = localStorage.getItem(key);
  let initialValue = defaultValue;
  if (cached) {
    try {
      initialValue = JSON.parse(cached);
    } catch {
      // If JSON parse fails, use default value
    }
  }

  // Create the signal with the initial value
  const signal = way.signal<T>(initialValue);

  // Watch for changes and save to localStorage
  way.effect(() => {
    localStorage.setItem(key, JSON.stringify(signal.value));
  });

  return signal;
}

const DB_NAME = "BookReaderDB";
const STORE_NAME = "files";

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeFileInDB(
  key: string,
  arrayBuffer: ArrayBuffer,
): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const putRequest = store.put(arrayBuffer, key);
    putRequest.onsuccess = () => resolve();
    putRequest.onerror = () => reject(putRequest.error);
  });
}

export async function retrieveFileFromDB(
  key: string,
): Promise<ArrayBuffer | null> {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const getRequest = store.get(key);
    getRequest.onsuccess = () => resolve(getRequest.result || null);
    getRequest.onerror = () => reject(getRequest.error);
  });
}

export async function deleteFileFromDB(key: string): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const deleteRequest = store.delete(key);
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(deleteRequest.error);
  });
}
