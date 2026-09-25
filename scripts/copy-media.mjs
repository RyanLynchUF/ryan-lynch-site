/**
 * Pre-build script: copies only images referenced by posts that get a page
 * (isLinkablePost, so a skipped post's images are not deployed) and by
 * _website pages from the vault's 2_Organization/_Media/ into public/media/.
 * In `pnpm run dev` it runs once at startup (predev).
 *
 * Safety: only wipes public/media/ if a .generated marker exists (or dir doesn't exist).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFrontmatter } from "../src/lib/frontmatter.mjs";
import { isLinkablePost } from "../src/lib/publishable.mjs";
import { VAULT_EXCLUDED_DIRS } from "../src/lib/vault-rules.mjs";
import { walkDir } from "../src/lib/walk-dir.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const VAULT = path.resolve(process.env.VAULT_PATH || path.join(ROOT, "..", "MyHub"));
const MEDIA_SRC = path.join(VAULT, "2_Organization", "_Media");
const MEDIA_DEST = path.join(ROOT, "public", "media");
const MARKER = path.join(MEDIA_DEST, ".generated");

// Image extensions we handle
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);

// Regex to extract wiki-image references: ![[filename.ext]] or ![[filename.ext | ...]]
const WIKI_IMAGE_RE = /!\[\[([^\]|]+?)(?:\s*\|[^\]]*?)?\]\]/g;

// ── 1. Find posts with pages and website pages, extract image references ──

/**
 * Notes that get a blog post page: frontmatter parsed with readFrontmatter
 * (the same js-yaml parse the posts collection uses) and judged by
 * isLinkablePost (the same rule), outside the excluded vault directories
 * (src/lib/vault-rules.mjs). A published post that is skipped for a missing
 * date or slug gets no page, so its images are not copied either. `_website`
 * pages are read separately by getWebsitePages.
 * @param {string} vaultRoot
 * @returns {{ filePath: string; content: string }[]}
 */
export function findPostsWithPages(vaultRoot) {
  /** @type {{ filePath: string; content: string }[]} */
  const notes = [];
  walkDir(
    vaultRoot,
    (filePath) => {
      if (!filePath.endsWith(".md")) return;
      const content = fs.readFileSync(filePath, "utf-8");
      const data = readFrontmatter(content);
      if (data && isLinkablePost(data)) {
        notes.push({ filePath, content });
      }
    },
    { skipDirNames: VAULT_EXCLUDED_DIRS }
  );
  return notes;
}

function getWebsitePages() {
  const websiteDir = path.join(VAULT, "_website");
  /** @type {{ filePath: string; content: string }[]} */
  const pages = [];
  if (!fs.existsSync(websiteDir)) return pages;
  for (const entry of fs.readdirSync(websiteDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const filePath = path.join(websiteDir, entry.name);
    const content = fs.readFileSync(filePath, "utf-8");
    pages.push({ filePath, content });
  }
  return pages;
}

/** @param {{ content: string }[]} posts */
function extractImageRefs(posts) {
  const refs = new Set();
  for (const { content } of posts) {
    for (const match of content.matchAll(WIKI_IMAGE_RE)) {
      const filename = match[1].trim();
      const ext = path.extname(filename).toLowerCase();
      if (IMAGE_EXTS.has(ext)) {
        refs.add(filename);
      }
    }
  }
  return refs;
}

// ── 2. Build source path map from _Media directory ──

function buildSourceMap() {
  const map = new Map(); // filename → absolute source path
  walkDir(MEDIA_SRC, (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) return;
    const name = path.basename(filePath);
    if (!map.has(name)) {
      map.set(name, filePath);
    }
  });
  return map;
}

// ── 3. Copy referenced images ──

function main() {
  // Safety check: only wipe if .generated marker exists or dir doesn't exist
  if (fs.existsSync(MEDIA_DEST)) {
    if (!fs.existsSync(MARKER)) {
      console.error(
        "ERROR: public/media/ exists but has no .generated marker. " +
          "Refusing to wipe — it may contain manually placed files."
      );
      process.exit(1);
    }
    fs.rmSync(MEDIA_DEST, { recursive: true });
  }

  const posts = findPostsWithPages(VAULT);
  console.log(`Found ${posts.length} posts with pages`);

  const websitePages = getWebsitePages();
  console.log(`Found ${websitePages.length} website pages`);

  const imageRefs = extractImageRefs([...posts, ...websitePages]);
  console.log(`Found ${imageRefs.size} unique image references`);

  const sourceMap = buildSourceMap();

  // Create destination directories
  fs.mkdirSync(path.join(MEDIA_DEST, "_excalidraw"), { recursive: true });

  let copied = 0;
  let missing = 0;

  for (const ref of imageRefs) {
    // Try bare filename lookup first, then basename (for path-prefixed refs),
    // then as a vault-relative path
    const srcPath =
      sourceMap.get(ref) ||
      sourceMap.get(path.basename(ref)) ||
      (fs.existsSync(path.join(VAULT, ref)) ? path.join(VAULT, ref) : null);
    if (!srcPath) {
      console.warn(`  WARN: no source found for "${ref}"`);
      missing++;
      continue;
    }

    // Preserve _excalidraw subdirectory structure
    const relFromMedia = path.relative(MEDIA_SRC, srcPath);
    const destPath = path.join(MEDIA_DEST, relFromMedia);

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    copied++;
  }

  // Write .generated marker
  fs.writeFileSync(MARKER, "This directory is auto-generated by scripts/copy-media.mjs\n");

  console.log(`Copied ${copied} images, ${missing} missing`);
}

/**
 * True when this file was executed directly (not imported). Realpath
 * argv[1]; import.meta.url is already resolved.
 */
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main();
}
