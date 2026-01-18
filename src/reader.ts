import way from "wayy";
import { useCacheSignal } from "./cache.ts";
import { getAllPTags } from "./util.ts";
import { generateSpeech } from "./voice.ts";

way.comp("reader", ({ props: { book } }) => {
  const state = useCacheSignal("state", { section: 0, pIndex: 0 });
  const isPlaying = way.signal(false);
  const paused = way.signal(false);
  const loadingAudio = way.signal(true);
  let audioElement: HTMLAudioElement | null = null;
  let allPTags: Element[] = [];

  const onkey = (ev: KeyboardEvent) => {
    const key = ev.key;
    if (key === "ArrowLeft") prev();
    if (key === "ArrowRight") next();
  };

  window.addEventListener("keydown", onkey);

  const next = () => stepNode(1);
  const prev = () => stepNode(-1);

  function stepNode(x: number): void {
    const newIndex = state.value.pIndex + x;
    
    if(newIndex < 0) {
      // Move to previous section
      if (state.value.section > 0) {
        state.value = { section: state.value.section - 1, pIndex: 0 };
      }
    } else if (newIndex >= allPTags.length) {
      // Move to next section
      state.value = { section: state.value.section + 1, pIndex: 0 };
    } else {
      state.value = { ...state.value, pIndex: newIndex };
    }
  }

  const playpause = () => {
    isPlaying.value = !isPlaying.value;

    if (isPlaying.value) {
      if (paused.value && audioElement) {
        audioElement.play();
        paused.value = false;
      } else if (audioElement && !loadingAudio.value) {
        play();
      }
    } else {
      if (audioElement) {
        audioElement.pause();
        paused.value = true;
      }
    }
  };

  async function play() {
    if (audioElement) {
      audioElement.play();
    }
  }

   const epub = document.getElementById("epub");

   way.effect(async () => {
     if (!book?.value || !epub) return;

     const s = book.value.spine.get(state.value.section);
     const doc = await s?.load(book.value.load.bind(book.value));

     
     const body = doc.querySelector("body")
     if (!body) return;
     const contents = body.cloneNode(true);

     epub?.replaceChildren(contents);

     loadingAudio.value = true;
     
     // Get all p tags from the current section
     allPTags = getAllPTags(epub);
     
     const currentPTag = allPTags[state.value.pIndex];
     
     console.log("Current section:", state.value.section, "P index:", state.value.pIndex, "P tag:", currentPTag);
     
     if (!currentPTag) {
       loadingAudio.value = false;
       return;
     }

     console.log("Found P tag:", {p:currentPTag.textContent});
     audioElement = await generateSpeech(currentPTag.textContent || "");
     loadingAudio.value = false;
   });

  return {
    state,
    next,
    prev,
    isPlaying,
    paused,
    loadingAudio,
    playpause,
  };
});
