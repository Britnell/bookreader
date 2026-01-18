import way from "wayy";
import { useCacheSignal } from "./cache.ts";
import { findNthTextElement } from "./util.ts";
import { generateSpeech } from "./voice.ts";

way.comp("reader", ({ props: { book } }) => {
  const state = useCacheSignal("state", { section: 0, node: 0 });
  const isPlaying = way.signal(false);
  const paused = way.signal(false);
  const loadingAudio = way.signal(true);
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
    state.value = { ...state.value, node: state.value.node + x };
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

    const body = doc.querySelector("body")?.firstElementChild;
    if (!body) return;
    const contents = body.cloneNode(true);

    epub?.replaceChildren(contents);

    loadingAudio.value = true;
    const nthText = findNthTextElement(epub, state.value.node);
    console.log("x", state.value, nthText);
    if (!nthText) {
      loadingAudio.value = false;
      return;
    }

    console.log("Found nth text:", nthText);
    audioElement = await generateSpeech(nthText);
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
