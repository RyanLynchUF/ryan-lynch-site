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
      // After stripping, remove empty paragraphs
      const textContent = node.children
        ?.map((c) => c.value || "")
        .join("")
        .trim();
      if (textContent === "") {
        parent.children.splice(index, 1);
        return index; // revisit this index since we removed a node
      }
    });
  };
}
