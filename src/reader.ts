import way from "wayy";
import { useCachedVar } from "./cache.ts";
import { generateSpeech, getVoices } from "./kokoro.ts";

way.comp("reader", ({ props: { book } }) => {
  const section = useCachedVar("section", 0);
  const pIndex = useCachedVar("pIndex", 0);
  const selectedVoice = useCachedVar("selectedVoice", "alloy");
  const speed = useCachedVar("speed", 1.0);
  const isPlaying = way.signal(false);
  const paused = way.signal(false);
  const loadingAudio = way.signal(true);
  const voices = way.signal<string[]>([]);
  const speedOptions = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
   let currAudio: HTMLAudioElement | null = null;
   let nextAudio: HTMLAudioElement | null = null;
   let previousPIndex = 0;
   let previousSpeed = speed.value;
   let previousVoice = selectedVoice.value;

  const onkey = (ev: KeyboardEvent) => {
    const key = ev.key;
    if (key === "ArrowLeft") prev();
    if (key === "ArrowRight") next();
    if (key === " ") {
      ev.preventDefault();
      playpause();
    }
  };

  window.addEventListener("keydown", onkey);

  const next = async () => {
    // pause current if playing and remove ended listener
    if (currAudio && isPlaying.value) {
      currAudio.pause();
      currAudio.removeEventListener("ended", next);
    }
    stepNode(1);
    currAudio = nextAudio;
    if (currAudio && isPlaying.value) {
      attachAudioEndedListener();
      currAudio.play();
    }
    const nextIndex = pIndex.value + 1;
    nextAudio = await loadAudioForPTag(nextIndex);
  };

  const prev = () => stepNode(-1);

  function stepNode(x: number): void {
    const newIndex = pIndex.value + x;
    const pTagCount = epub?.querySelectorAll("p").length || 0;

    if (newIndex < 0) {
      // Move to previous section
      if (section.value > 0) {
        section.value = section.value - 1;
        pIndex.value = 0;
      }
    } else if (newIndex >= pTagCount) {
      // Move to next section
      section.value = section.value + 1;
      pIndex.value = 0;
    } else {
      pIndex.value = newIndex;
    }
  }

  const playpause = () => {
    if (isPlaying.value) {
      // Pause: just pause the current audio
      if (currAudio) {
        currAudio.pause();
        paused.value = true;
      }
      isPlaying.value = false;
    } else {
      // Play: resume if paused, or start playing
      if (currAudio) {
        attachAudioEndedListener();
        currAudio.play();
        paused.value = false;
        isPlaying.value = true;
      }
    }
  };

  const attachAudioEndedListener = () => {
    if (currAudio) {
      currAudio.addEventListener("ended", next);
    }
  };

  const epub = document.getElementById("epub");

  async function loadAudioForPTag(
    pIndex: number,
  ): Promise<HTMLAudioElement | null> {
    const pTag = epub?.querySelectorAll("p")[pIndex];
    if (!pTag) return null;
    return generateSpeech(
      pTag.textContent || "",
      selectedVoice.value,
      speed.value,
    );
  }

  const onMounted = () => {
    console.log("mount");
  };

  const regenerateAudio = async () => {
    const curr = pIndex.value;
    const nextIndex = curr + 1;

    if (isPlaying.value) {
      // If playing, only reload next audio at new speed
      nextAudio = await loadAudioForPTag(nextIndex);
    } else {
      // If not playing, reload both current and next audio
      loadingAudio.value = true;
      currAudio = await loadAudioForPTag(curr);
      loadingAudio.value = false;
      nextAudio = await loadAudioForPTag(nextIndex);
    }
  };

   const highlightCurrentParagraph = () => {
     const curr = pIndex.value;
     const pTags = epub?.querySelectorAll("p");
     if (!pTags) return;

     // Remove highlight from previous paragraph
     if (previousPIndex < pTags.length) {
       const prevTag = pTags[previousPIndex];
       prevTag?.classList.remove("highlight");
     }

     // Add highlight to current paragraph
     if (curr < pTags.length) {
       const currTag = pTags[curr];
       currTag?.classList.add("highlight");
       currTag?.scrollIntoView({ behavior: "smooth", block: "center" });
     }

     previousPIndex = curr;
   };

   const openMenu = () => {
     const dialog = document.getElementById("menu-dialog") as HTMLDialogElement | null;
     if (dialog) {
       dialog.showModal();
     }
   };

   const closeMenu = () => {
     const dialog = document.getElementById("menu-dialog") as HTMLDialogElement | null;
     if (dialog) {
       dialog.close();
     }
   };

  const render = async () => {
    loadingAudio.value = true;
    const curr = pIndex.value;
    currAudio = await loadAudioForPTag(curr);
    loadingAudio.value = false;

    const nextIndex = curr + 1;
    nextAudio = await loadAudioForPTag(nextIndex);
  };

  way.effect(() => {
    (async () => {
      try {
        const availableVoices = await getVoices();
        console.log(availableVoices);

        voices.value = availableVoices;
      } catch (error) {
        console.error("Failed to fetch voices:", error);
      }
    })();
  });

  way.effect(() => {
    pIndex.value; // Track changes to pIndex
    highlightCurrentParagraph();
  });

   way.effect(() => {
     const currSpeed = speed.value;
     const currVoice = selectedVoice.value;
     
     if (currSpeed !== previousSpeed || currVoice !== previousVoice) {
       previousSpeed = currSpeed;
       previousVoice = currVoice;
       regenerateAudio();
     }
   });

  way.effect(() => {
    if (!book?.value || !epub) return;

    (async () => {
      const s = book.value.spine.get(section.value);
      const doc = await s?.load(book.value.load.bind(book.value));

      const body = doc.querySelector("body");
      if (!body) return;
      const contents = body.cloneNode(true);
      epub?.replaceChildren(contents);

      render();

      setTimeout(() => {
        highlightCurrentParagraph();
      }, 0);
    })();
  });

   return {
     section,
     pIndex,
     next,
     prev,
     onMounted,
     isPlaying,
     paused,
     loadingAudio,
     playpause,
     selectedVoice,
     voices,
     speed,
     speedOptions,
     openMenu,
     closeMenu,
   };
});
