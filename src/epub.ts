import way from "wayy";
import ePub from "epubjs";
import { useCacheSignal, storeFileInDB, retrieveFileFromDB } from "./cache.ts";

way.comp("epub", () => {
  const loaded = way.signal(false);
  const title = way.signal("");
  const book = way.signal<any>(null);

  const loadBookFromArrayBuffer = async (arrayBuffer: ArrayBuffer) => {
    const newBook = ePub(arrayBuffer);
    await newBook.ready;

    const metadata = await newBook.loaded.metadata;
    title.value = metadata.title;
    book.value = newBook;
    loaded.value = true;
  };

  // Try to load cached book on component mount
  const loadCachedBook = async () => {
    try {
      const cachedArrayBuffer = await retrieveFileFromDB("currentBook");
      if (cachedArrayBuffer) {
        await loadBookFromArrayBuffer(cachedArrayBuffer);
        console.log("Cached book loaded");
      }
    } catch (error) {
      console.warn("Failed to load cached book:", error);
    }
  };

  loadCachedBook();

  const fileSelect = async (ev: Event) => {
    const target = ev.target as HTMLInputElement;
    const selectedFile = target.files?.[0];

    if (!selectedFile) return;

    const arrayBuffer = await selectedFile.arrayBuffer();

    // Store the file in IndexedDB and load it
    await storeFileInDB("currentBook", arrayBuffer);
    await loadBookFromArrayBuffer(arrayBuffer);
  };

  return { loaded, title, book, fileSelect };
});

