import way from "wayy";
import { useCacheSignal } from "./cache.ts";
import { generateSpeech } from "./voice.ts";

way.comp("reader", ({ props: { book } }) => {
  const state = useCacheSignal("state", { section: 0, pIndex: 0 });
  const isPlaying = way.signal(false);
  const paused = way.signal(false);
  const loadingAudio = way.signal(true);
  let currAudio: HTMLAudioElement | null = null;
  let nextAudio: HTMLAudioElement | null = null;

   const onkey = (ev: KeyboardEvent) => {
     const key = ev.key;
     if (key === "ArrowLeft") prev();
     if (key === "ArrowRight") next();
   };

   window.addEventListener("keydown", onkey);

   const next = async () => {
    // pause current if playing 
    if (currAudio && isPlaying.value) {
      currAudio.pause();
    }
     stepNode(1);
     currAudio = nextAudio;
     if (currAudio) {
       currAudio.play();
     }
     const nextIndex = state.value.pIndex + 1;
     nextAudio = await loadAudioForPTag(nextIndex);
   };

   const prev = () => stepNode(-1);

   function stepNode(x: number): void {
     const newIndex = state.value.pIndex + x;
     const pTagCount = epub?.querySelectorAll("p").length || 0;
     
     if(newIndex < 0) {
       // Move to previous section
       if (state.value.section > 0) {
         state.value = { section: state.value.section - 1, pIndex: 0 };
       }
     } else if (newIndex >= pTagCount) {
       // Move to next section
       state.value = { section: state.value.section + 1, pIndex: 0 };
     } else {
       state.value = { ...state.value, pIndex: newIndex };
     }
   }

  const playpause = () => {
    isPlaying.value = !isPlaying.value;

    if (isPlaying.value) {
      if (paused.value && currAudio) {
        currAudio.play();
        paused.value = false;
      } else if (currAudio && !loadingAudio.value) {
        play();
      }
    } else {
      if (currAudio) {
        currAudio.pause();
        paused.value = true;
      }
    }
  };

   async function play() {
     if (currAudio) {
       currAudio.play();
     }
   }

   const epub = document.getElementById("epub");

   async function loadAudioForPTag(pIndex: number): Promise<HTMLAudioElement | null> {
     const pTag = epub?.querySelectorAll("p")[pIndex];
     if (!pTag) return null;
     return generateSpeech(pTag.textContent || "");
   }

   const onMounted = async () => {
     loadingAudio.value = true;
     const curr = state.value.pIndex;
     currAudio = await loadAudioForPTag(curr);
     loadingAudio.value = false;

     const nextIndex = curr + 1;
     nextAudio = await loadAudioForPTag(nextIndex);
   };

     way.effect(async () => {
       if (!book?.value || !epub) return;

       const s = book.value.spine.get(state.value.section);
       const doc = await s?.load(book.value.load.bind(book.value));

       const body = doc.querySelector("body")
       if (!body) return;
       const contents = body.cloneNode(true);
       epub?.replaceChildren(contents);

       onMounted()
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
