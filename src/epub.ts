import way from "wayy";
import ePub from "epubjs";
import {
  useCacheSignal,
  storeFileInDB,
  retrieveFileFromDB,
  generateSpeech,
  playAudioBuffer,
  findNthTextElement,
} from "./util.ts";

way.comp("epubreader", () => {
  const loaded = way.signal(false);
  const state = useCacheSignal("state", { section: 0, node: 0 });
  const title = way.signal("");
  const isPlaying = way.signal(false);

  let book: any = null;

  const loadBookFromArrayBuffer = async (arrayBuffer: ArrayBuffer) => {
    book = ePub(arrayBuffer);
    await book.ready;
    loaded.value = true;

    const metadata = await book.loaded.metadata;
    title.value = metadata.title;
    console.log("Book loaded:", metadata);
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

  const onkey = (ev: KeyboardEvent) => {
    //
    const key = ev.key;
    if (key === "ArrowLeft") {
      state.value = { ...state.value, section: state.value.section - 1 };
    }
    if (key === "ArrowRight") {
      state.value = { ...state.value, section: state.value.section + 1 };
    }
    // console.log(ev);
  };

  window.addEventListener("keydown", onkey);

  const fileSelect = async (ev: Event) => {
    const target = ev.target as HTMLInputElement;
    const selectedFile = target.files?.[0];

    if (!selectedFile) return;

    const arrayBuffer = await selectedFile.arrayBuffer();

    // Store the file in IndexedDB and load it
    await storeFileInDB("currentBook", arrayBuffer);
    await loadBookFromArrayBuffer(arrayBuffer);
  };

  const next = () =>
    (state.value = { ...state.value, section: state.value.section + 1 });
  const prev = () =>
    (state.value = { ...state.value, section: state.value.section - 1 });

  const playpause = async () => {
    isPlaying.value = !isPlaying.value;

    if (!isPlaying.value) return;
  };

  const epub = document.getElementById("epub");

  way.effect(() => {
    if (!loaded.value || !epub || !book) return;

    const loadSection = async () => {
      const s = book.spine.get(state.value.section);
      const doc = await s?.load(book.load.bind(book));
      const body = doc.querySelector("body")?.firstElementChild;
      if (!body) return;
      const contents = body.cloneNode(true);
      epub?.replaceChildren(contents);
    };

    loadSection();
  });

  return { loaded, fileSelect, state, next, prev, title, isPlaying, playpause };
});
