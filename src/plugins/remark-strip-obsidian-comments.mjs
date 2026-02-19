/**
 * Remark plugin to strip Obsidian %% comments %% from markdown.
 * These are typically Excalidraw edit links like:
 *   %%[[Some Diagram.excalidraw|🖋 Edit in Excalidraw]]%%
 */
import { visit } from "unist-util-visit";

export default function remarkStripObsidianComments() {
  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (node.value.includes("%%")) {
        node.value = node.value.replace(/%%[^]*?%%/g, "");
      }
    });

    // Also handle cases where %% content spans paragraph nodes
    visit(tree, "paragraph", (node, index, parent) => {
      // After stripping, remove empty paragraphs.
      // Recurse into children so link/emphasis/etc nodes aren't treated as empty.
      function extractText(n) {
        if (n.value !== undefined) return n.value;
        if (n.children) return n.children.map(extractText).join("");
        return "";
      }
      const textContent = extractText(node).trim();
      if (textContent === "") {
        parent.children.splice(index, 1);
        return index; // revisit this index since we removed a node
      }
    });
  };
}
