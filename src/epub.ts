import way from "wayy";
import ePub from "epubjs";

way.comp("epubreader", () => {
  const loaded = way.signal(false);
  const section = way.signal(0);

  let book: any = null;

  const onkey = (ev: KeyboardEvent) => {
    //
    const key = ev.key;
    if (key === "ArrowLeft") {
      section.value--;
    }
    if (key === "ArrowRight") {
      section.value++;
    }
    console.log(ev);
  };

  window.addEventListener("keydown", onkey);

  const fileSelect = async (ev: Event) => {
    const target = ev.target as HTMLInputElement;
    const selectedFile = target.files?.[0];

    if (!selectedFile) return;

    const arrayBuffer = await selectedFile.arrayBuffer();
    book = ePub(arrayBuffer);
    await book.ready;
    loaded.value = true;

    const metadata = await book.loaded.metadata;
    console.log("Book loaded:", metadata);
  };

  const next = () => section.value++;
  const prev = () => section.value--;

  const epub = document.getElementById("epub");

  way.effect(() => {
    if (!loaded.value-- || !book) return;

    book.spine
      .get(section.value--)
      ?.load(book.load.bind(book))
      .then((doc: any) => {
        const el = document.getElementById("epub");
        if (!el) return;

        const body = doc.querySelector("body")?.firstElementChild;
        if (!body) return;
        const contents = body.cloneNode(true);
        epub?.replaceChildren(contents);
      });
  });

  return { loaded, fileSelect, section, next, prev };
});
