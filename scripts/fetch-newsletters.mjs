// Pull sent issues from the beehiiv API and write src/data/newsletters.json.
//
// Run as `pnpm run sync:newsletters` with BEEHIIV_API_KEY and
// BEEHIIV_PUBLICATION_ID exported in the shell (or as GitHub secrets in CI).
// The site build never runs this; it reads the committed JSON snapshot.

import { realpathSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.beehiiv.com/v2";
const OUTPUT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/data/newsletters.json");

// Fields the site's zod schema requires on every entry.
const REQUIRED_FIELDS = ["id", "title", "web_url", "slug"];

/**
 * beehiiv documents publish_date as a Unix timestamp in seconds; accept an
 * ISO string too. Returns milliseconds, or null when unparseable.
 * @param {unknown} value
 * @returns {number | null}
 */
function toMillis(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value * 1000;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/**
 * Pure transform from raw beehiiv posts to site entries. No network, no I/O.
 * Throws if a post that survives the platform/hidden/date filters is missing
 * a required field, so a bad snapshot is never written.
 * @param {Array<Record<string, any>>} posts raw objects from the posts endpoint
 * @param {Date} now cutoff; posts published after this are excluded
 * @returns {Array<{ id: string; title: string; description: string; date: string; url: string; slug: string }>}
 */
export function toEntries(posts, now) {
  const cutoff = now.getTime();
  return posts
    .filter((p) => (p.platform === "web" || p.platform === "both") && p.hidden_from_feed === false)
    .map((p) => ({ post: p, ms: toMillis(p.publish_date) }))
    .filter(({ ms }) => ms !== null && ms <= cutoff)
    .map(({ post, ms }) => {
      for (const field of REQUIRED_FIELDS) {
        if (typeof post[field] !== "string" || post[field] === "") {
          throw new Error(`beehiiv post ${post.id ?? "(no id)"} is missing required field ${field}`);
        }
      }
      return {
        id: post.id,
        title: post.title,
        description: post.meta_default_description || post.preview_text || post.subtitle || "",
        date: new Date(ms).toISOString(),
        url: post.web_url,
        slug: post.slug,
      };
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
    });
}

/**
 * @param {string} name
 * @returns {string}
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

/**
 * Pages through every confirmed post. Any non-2xx, network error, or
 * unparseable body throws; the caller writes nothing on error.
 * @param {string} apiKey
 * @param {string} publicationId
 * @param {typeof fetch} [fetchImpl] injectable for tests; defaults to global fetch
 */
export async function fetchAllPosts(apiKey, publicationId, fetchImpl = globalThis.fetch) {
  const all = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = new URL(`${API_BASE}/publications/${publicationId}/posts`);
    url.searchParams.set("status", "confirmed");
    url.searchParams.set("limit", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("order_by", "publish_date");
    url.searchParams.set("direction", "desc");

    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`beehiiv responded ${res.status} for page ${page}`);

    let body;
    try {
      body = await res.json();
    } catch {
      throw new Error(`beehiiv returned an unparseable body for page ${page}`);
    }
    if (!Array.isArray(body?.data)) throw new Error(`beehiiv response for page ${page} has no data array`);

    all.push(...body.data);
    totalPages = Number(body.total_pages) || 1;
    page += 1;
  } while (page <= totalPages);
  return all;
}

async function main() {
  const apiKey = requireEnv("BEEHIIV_API_KEY");
  const publicationId = requireEnv("BEEHIIV_PUBLICATION_ID");

  const posts = await fetchAllPosts(apiKey, publicationId);
  const entries = toEntries(posts, new Date());
  if (entries.length === 0) {
    console.error("beehiiv returned no publishable posts; refusing to write an empty list");
    process.exit(1);
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const tmpPath = `${OUTPUT_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(entries, null, 2) + "\n");
  await rename(tmpPath, OUTPUT_PATH);
  console.log(`Wrote ${entries.length} newsletter entries to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

/**
 * True when this file was executed directly (not imported), following
 * symlinks on both sides so `pnpm run sync:newsletters` still resolves
 * correctly if argv[1] is a symlink into node_modules/.bin or similar.
 * @returns {boolean}
 */
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    // realpath both sides: import.meta.url is already resolved, argv[1] may be a symlink.
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

// Only run main when executed directly, so tests can import toEntries and fetchAllPosts.
if (isMainModule()) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    if (err instanceof Error && err.cause?.message) {
      console.error(err.cause.message);
    }
    process.exit(1);
  });
}
