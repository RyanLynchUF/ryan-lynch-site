/**
 * Scan the vault for notes that get a blog post page (isLinkablePost:
 * `published: true`, a slug and a usable date). Returns a map of
 * { "Note Title": "slug-value" } so the wiki-links plugin can resolve
 * cross-post links to /blog/<slug>.
 *
 * Frontmatter is parsed with readFrontmatter, the same js-yaml parse the
 * posts collection uses, and judged by the same isLinkablePost rule that
 * picks which posts get pages, so a link here always has a page behind it.
 * Notes in the excluded vault directories (src/lib/vault-rules.mjs) are never
 * posts, so they are skipped too.
 */
import fs from "node:fs";
import path from "node:path";
import { readFrontmatter } from "../lib/frontmatter.mjs";
import { isLinkablePost } from "../lib/publishable.mjs";
import { VAULT_EXCLUDED_DIRS } from "../lib/vault-rules.mjs";
import { walkDir } from "../lib/walk-dir.mjs";

export function buildBlogSlugMap() {
  const vaultRoot = path.resolve(process.env.VAULT_PATH || "../MyHub");
  /** @type {Record<string, string>} */
  const map = {};
  walkDir(
    vaultRoot,
    (fullPath) => {
      const name = path.basename(fullPath);
      if (!name.endsWith(".md") || name.endsWith(".excalidraw.md")) return;
      const data = readFrontmatter(fs.readFileSync(fullPath, "utf-8"));
      if (!data || !isLinkablePost(data)) return;
      // Use the frontmatter title if present, otherwise the filename
      const title =
        typeof data.title === "string" && data.title.trim() !== "" ? data.title : name.replace(/\.md$/, "");
      map[title] = /** @type {string} */ (data.slug);
    },
    { skipDirNames: VAULT_EXCLUDED_DIRS }
  );
  return map;
}
