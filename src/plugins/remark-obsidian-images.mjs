/**
 * Remark plugin to convert Obsidian wiki-link images to standard markdown images.
 *
 * Transforms:
 *   ![[image.png]]           → ![image.png](/media/image.png)
 *   ![[image.png | 300]]     → <img src="/media/image.png" alt="image.png" width="300">
 *   ![[image.png | caption]] → <figure><img ...><figcaption>caption</figcaption></figure>
 *
 * Builds a filename→path lookup by scanning MyHub/_Organization/_Media/ at init.
 */
import { visit } from "unist-util-visit";
import fs from "node:fs";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);

/**
 * Recursively scan a directory and build a map of filename → relative web path.
 */
function buildImageMap(baseDir, mediaRoot) {
  const map = new Map();

  function scan(dir, webPrefix) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        scan(path.join(dir, entry.name), `${webPrefix}/${entry.name}`);
      } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        // First entry wins — don't overwrite if a filename was already found
        // (handles the anomalous nested path duplicates)
        if (!map.has(entry.name)) {
          map.set(entry.name, `/media${webPrefix}/${entry.name}`);
        }
      }
    }
  }

  scan(mediaRoot, "");
  return map;
}

// Wiki-image pattern: ![[filename]] or ![[filename | stuff]]
const WIKI_IMAGE_RE = /!\[\[([^\]]+?)\]\]/g;

export default function remarkObsidianImages() {
  const vaultRoot = path.resolve(process.env.VAULT_PATH || "../MyHub");
  const mediaRoot = path.join(vaultRoot, "_Organization", "_Media");
  const imageMap = buildImageMap(vaultRoot, mediaRoot);

  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (!node.value.includes("![[")) return;

      const parts = [];
      let lastIndex = 0;

      for (const match of node.value.matchAll(WIKI_IMAGE_RE)) {
        const fullMatch = match[0];
        const inner = match[1].trim();
        const matchStart = match.index;

        // Add any text before this match
        if (matchStart > lastIndex) {
          parts.push({ type: "text", value: node.value.slice(lastIndex, matchStart) });
        }

        // Parse pipe syntax: filename | size_or_caption
        const pipeIndex = inner.indexOf("|");
        let filename, pipePart;
        if (pipeIndex !== -1) {
          filename = inner.slice(0, pipeIndex).trim();
          pipePart = inner.slice(pipeIndex + 1).trim();
        } else {
          filename = inner;
          pipePart = null;
        }

        // Skip note transclusions like ![[Note Name#Section]] — no image extension
        const ext = path.extname(filename.split("#")[0]).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) {
          // Leave as-is for other plugins or manual cleanup
          parts.push({ type: "text", value: fullMatch });
          lastIndex = matchStart + fullMatch.length;
          continue;
        }

        // Resolve the image path
        const src = imageMap.get(filename) || `/media/${filename}`;

        if (pipePart && /^\d+$/.test(pipePart)) {
          // Sized image: ![[img | 300]] → <img> with width
          parts.push({
            type: "html",
            value: `<img src="${src}" alt="${filename}" width="${pipePart}">`,
          });
        } else if (pipePart) {
          // Captioned image: ![[img | caption text]]
          parts.push({
            type: "html",
            value: `<figure><img src="${src}" alt="${filename}"><figcaption>${pipePart}</figcaption></figure>`,
          });
        } else {
          // Standard image: ![[img]] — use raw HTML to avoid URL-encoding of special chars
          parts.push({
            type: "html",
            value: `<img src="${src}" alt="${filename}">`,
          });
        }

        lastIndex = matchStart + fullMatch.length;
      }

      // Add any remaining text after the last match
      if (lastIndex < node.value.length) {
        parts.push({ type: "text", value: node.value.slice(lastIndex) });
      }

      // Replace the text node with the generated nodes
      if (parts.length > 0) {
        parent.children.splice(index, 1, ...parts);
        return index + parts.length;
      }
    });
  };
}
