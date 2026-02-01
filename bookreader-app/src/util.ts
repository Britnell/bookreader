// import way from "wayy";

export function getAllPTags(root: Node): Element[] {
  return Array.from(root.querySelectorAll("p"));
}
