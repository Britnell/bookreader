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

export function findNthTextElement(root: Node, n: number): Node | null {
  let count = 0;
  let result: Node | null = null;

  function traverse(node: Node): void {
    if (result) return; // Already found the nth element

    // Check if this is a leaf node (no children or no element children)
    const hasElementChildren = Array.from(node.childNodes).some(
      (child) => child.nodeType === Node.ELEMENT_NODE,
    );

    if (!hasElementChildren && node.textContent?.trim()) {
      if (count === n) {
        result = node;
        return;
      }
      count++;
    }

    // Continue traversing children
    for (const child of Array.from(node.childNodes)) {
      traverse(child);
    }
  }

  traverse(root);
  return result;
}

export async function generateSpeech(
  text: string,
  voice: string = "alloy",
  speed: number = 1.0,
): Promise<ArrayBuffer> {
  const response = await fetch("http://localhost:8880/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "kokoro",
      input: text,
      voice: voice,
      response_format: "mp3",
      speed: speed,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `TTS request failed: ${response.status} ${response.statusText}`,
    );
  }

  return await response.arrayBuffer();
}

export async function getVoices(): Promise<string[]> {
  const response = await fetch("http://localhost:8880/v1/audio/voices");

  if (!response.ok) {
    throw new Error(
      `Voices request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  return data.voices || [];
}

export async function playAudioBuffer(arrayBuffer: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();

    audioContext.decodeAudioData(
      arrayBuffer.slice(0),
      (audioBuffer) => {
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        source.onended = () => {
          resolve();
        };

        source.start(0);
      },
      (error) => {
        reject(new Error(`Audio decoding failed: ${error}`));
      },
    );
  });
}
