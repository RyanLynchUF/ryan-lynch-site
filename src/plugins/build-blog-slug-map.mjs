/**
 * Scan the vault for all .md files with `published: true` and a `slug` in
 * YAML frontmatter. Returns a map of { "Note Title": "slug-value" } so the
 * wiki-links plugin can resolve cross-post links to /blog/<slug>.
 */
import fs from "node:fs";
import path from "node:path";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

function parseFrontmatter(content) {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return null;

  const fm = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fm[key] = value;
  }
  return fm;
}

export function buildBlogSlugMap() {
  const vaultRoot = path.resolve(process.env.VAULT_PATH || "../MyHub");
  const map = {};

  function scan(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        scan(fullPath);
      } else if (entry.name.endsWith(".md") && !entry.name.endsWith(".excalidraw.md")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const fm = parseFrontmatter(content);
        if (!fm) continue;
        if (fm.published !== "true") continue;
        if (!fm.slug) continue;

        // Use the frontmatter title if present, otherwise the filename
        const title = fm.title || entry.name.replace(/\.md$/, "");
        map[title] = fm.slug;
      }
    }
  }

  scan(vaultRoot);
  return map;
}
