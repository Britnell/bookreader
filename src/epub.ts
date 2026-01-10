import way from "wayy";
import ePub from "epubjs";
import { useCacheSignal, storeFileInDB, retrieveFileFromDB } from "./util.ts";

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

way.comp("reader", ({ props: { book } }) => {
  const state = useCacheSignal("state", { section: 0, node: 0 });
  const isPlaying = way.signal(false);

  const onkey = (ev: KeyboardEvent) => {
    const key = ev.key;
    if (key === "ArrowLeft") prev();
    if (key === "ArrowRight") next();
  };

  window.addEventListener("keydown", onkey);

  const step = (x: number) =>
    (state.value = { ...state.value, section: state.value.section + x });
  const next = () => step(1);
  const prev = () => step(-1);

  const playpause = async () => {
    isPlaying.value = !isPlaying.value;

    if (!isPlaying.value) return;
  };

  const epub = document.getElementById("epub");

  way.effect(() => {
    console.log(book?.value);

    if (!book?.value || !epub) return;

    const loadSection = async () => {
      const s = book.value.spine.get(state.value.section);
      const doc = await s?.load(book.value.load.bind(book.value));

      const body = doc.querySelector("body")?.firstElementChild;
      if (!body) return;
      const contents = body.cloneNode(true);
      console.log(contents);

      epub?.replaceChildren(contents);
    };

    loadSection();
  });

  return { state, next, prev, isPlaying, playpause };
});

