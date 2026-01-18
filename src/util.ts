// import way from "wayy";

export function findNthTextElement(root: Node, n: number): string | null {
  let count = 0;
  let result: string | null = null;

  function traverse(node: Node): void {
    if (result) return; // Already found the nth element

    const isPtag = node.tagName === "P";
    const hasElementChildren = Array.from(node.childNodes).some(
      (child) => child.nodeType === Node.ELEMENT_NODE,
    );
    const text = node.textContent.trim();
    const isLeaf = !hasElementChildren && text;

    if (isLeaf || isPtag) {
      if (count === n) {
        result = text;
      }
      count++;
      return;
    }

    for (const child of Array.from(node.childNodes)) {
      traverse(child);
    }
  }

  traverse(root);
  return result;
}
