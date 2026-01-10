import way from "wayy";
import { useCacheSignal, findNthTextElement, generateSpeech } from "./util.ts";

way.comp("reader", ({ props: { book } }) => {
  const state = useCacheSignal("state", { section: 0, node: 0 });
  const isPlaying = way.signal(false);
  let audioElement: HTMLAudioElement | null = null;
  const player = document.getElementById("player") as HTMLAudioElement;

  const onkey = (ev: KeyboardEvent) => {
    const key = ev.key;
    if (key === "ArrowLeft") prev();
    if (key === "ArrowRight") next();
    if (key === "ArrowUp") prevNode();
    if (key === "ArrowDown") nextNode();
  };

  window.addEventListener("keydown", onkey);

  const step = (x: number) =>
    (state.value = { ...state.value, section: state.value.section + x });
  const next = () => stepNode(1);
  const prev = () => stepNode(-1);

  function stepNode(x: number): void {
    const totalNodes = getTotalNodes();
    const newNode = state.value.node + x;

    if (newNode >= 0 && newNode < totalNodes) {
      state.value = { ...state.value, node: newNode };
    }
  }

   const playpause = async () => {
     isPlaying.value = !isPlaying.value;

     if (isPlaying.value) {
       read();
     } else {
       if (audioElement) {
         audioElement.pause();
         audioElement.currentTime = 0;
       }
     }
   };

   async function read() {
     if (!epub) return;

     const nthText = findNthTextElement(epub, state.value.node);
     if (!nthText) return;
     
     console.log("Found nth text:", nthText);
     audioElement = await generateSpeech(nthText);
     audioElement.play();
   }

  function getTotalSections(): number {
    return book?.value?.spine?.length || 0;
  }

  const epub = document.getElementById("epub");

  way.effect(() => {
    if (!book?.value || !epub) return;

    const loadSection = async () => {
      const s = book.value.spine.get(state.value.section);
      const doc = await s?.load(book.value.load.bind(book.value));

      const body = doc.querySelector("body")?.firstElementChild;
      if (!body) return;
      const contents = body.cloneNode(true);

      epub?.replaceChildren(contents);
    };

    loadSection();
  });

  return {
    state,
    next,
    prev,
    isPlaying,
    playpause,
  };
});
