/**
 * Remark plugin to convert Obsidian [[wiki-links]] to HTML links.
 *
 * Transforms:
 *   [[Page Name]]              → <a href="https://brain.ryanlynch.me/Full+Path/Page+Name">Page Name</a>
 *   [[Page Name|Display Text]] → <a href="https://brain.ryanlynch.me/Full+Path/Page+Name">Display Text</a>
 *   [[#Anchor Text]]           → <a href="#anchor-text">Anchor Text</a>
 *   [[Page Name#Anchor]]       → <a href="https://brain.ryanlynch.me/Full+Path/Page+Name#anchor">Page Name > Anchor</a>
 *
 * Cross-post links (published blog posts) resolve to /blog/<slug> instead.
 *
 * Builds a note-name → vault-path lookup by scanning MyHub/ at init.
 */
import { visit } from "unist-util-visit";
import fs from "node:fs";
import path from "node:path";

const PUBLISH_BASE = "https://brain.ryanlynch.me";

/**
 * Recursively scan vault for .md files and build name → vault-relative-path map.
 * e.g. "AWS S3" → "Technical+Mind+Map/System+Design+Concepts/Databases/Products/Blob+Storage+Products/AWS+S3"
 */
function buildNoteMap(vaultRoot) {
  const map = new Map();

  function scan(dir, relativePath) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip hidden dirs and _Organization
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const nextRel = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        scan(fullPath, nextRel);
      } else if (entry.name.endsWith(".md") && !entry.name.endsWith(".excalidraw.md")) {
        const noteName = entry.name.replace(/\.md$/, "");
        // First entry wins (handles rare name collisions)
        if (!map.has(noteName)) {
          const vaultPath = relativePath ? `${relativePath}/${noteName}` : noteName;
          map.set(noteName, vaultPath.replace(/ /g, "+"));
        }
      }
    }
  }

  scan(vaultRoot, "");
  return map;
}

/**
 * Convert heading text to a URL-friendly anchor.
 * Matches Obsidian's behavior: lowercase, spaces to hyphens, strip special chars.
 */
function toAnchor(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Non-image wiki-link: [[...]] but NOT ![[...]]
// Uses negative lookbehind to exclude image embeds
const WIKI_LINK_RE = /(?<!!)\[\[([^\]]+?)\]\]/g;

export default function remarkWikiLinks({ slugMap = {} } = {}) {
  const vaultRoot = path.resolve(process.env.VAULT_PATH || "../MyHub");
  const noteMap = buildNoteMap(vaultRoot);

  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (!node.value.includes("[[")) return;

      const parts = [];
      let lastIndex = 0;

      for (const match of node.value.matchAll(WIKI_LINK_RE)) {
        const fullMatch = match[0];
        const inner = match[1].trim();
        const matchStart = match.index;

        // Add text before this match
        if (matchStart > lastIndex) {
          parts.push({ type: "text", value: node.value.slice(lastIndex, matchStart) });
        }

        // Parse: Page Name | Display Text and Page Name # Anchor
        const pipeIndex = inner.indexOf("|");
        let target, displayText;
        if (pipeIndex !== -1) {
          target = inner.slice(0, pipeIndex).trim();
          displayText = inner.slice(pipeIndex + 1).trim();
        } else {
          target = inner;
          displayText = null;
        }

        // Split target into page and anchor
        const hashIndex = target.indexOf("#");
        let pageName, anchor;
        if (hashIndex === 0) {
          // Same-page anchor: [[#Some Heading]]
          pageName = null;
          anchor = target.slice(1).trim();
        } else if (hashIndex > 0) {
          pageName = target.slice(0, hashIndex).trim();
          anchor = target.slice(hashIndex + 1).trim();
        } else {
          pageName = target;
          anchor = null;
        }

        // Build the href and label
        let href, label;

        if (!pageName) {
          // Same-page anchor
          href = `#${toAnchor(anchor)}`;
          label = displayText || anchor;
        } else if (slugMap[pageName]) {
          // Cross-post link to a published blog post
          href = `/blog/${slugMap[pageName]}`;
          if (anchor) href += `#${toAnchor(anchor)}`;
          label = displayText || pageName;
        } else {
          // External link to Obsidian Publish
          const vaultPath = noteMap.get(pageName);
          if (vaultPath) {
            href = `${PUBLISH_BASE}/${vaultPath}`;
          } else {
            // Fallback: use page name directly (note not found in vault)
            href = `${PUBLISH_BASE}/${pageName.replace(/ /g, "+")}`;
          }
          if (anchor) href += `#${toAnchor(anchor)}`;
          label = displayText || pageName;
        }

        parts.push({
          type: "html",
          value: `<a href="${href}">${label}</a>`,
        });

        lastIndex = matchStart + fullMatch.length;
      }

      // Add remaining text
      if (lastIndex < node.value.length) {
        parts.push({ type: "text", value: node.value.slice(lastIndex) });
      }

      if (parts.length > 0) {
        parent.children.splice(index, 1, ...parts);
        return index + parts.length;
      }
    });
  };
}
