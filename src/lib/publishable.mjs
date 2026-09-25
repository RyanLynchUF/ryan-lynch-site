// Which published posts can actually be built. A post marked `published: true`
// needs a `date` (for ordering and display) and a `slug` (for its URL). Posts
// missing either are skipped everywhere rather than rendered as "Jan 1, 1970"
// or linked as /blog/undefined. Pure so it is testable without Astro.
//
// One rule, missingForPage, serves every reader. partitionPublishable applies
// it to parsed collection entries (src/lib/posts.ts). isLinkablePost applies
// it to raw frontmatter: the posts collection id (src/lib/post-schema.mjs) and
// the blog slug map (src/plugins/build-blog-slug-map.mjs). Both kinds of data
// give the same answer because the posts schema turns a raw value into a
// usable one exactly when these checks pass: `published` is only ever the
// boolean true, a string slug is kept as is, and a date survives the schema
// exactly when toOptionalDate accepts it (tests/linkable-agreement.test.mjs).

import { toOptionalDate } from "./frontmatter.mjs";

/**
 * @typedef {{
 *   id: string;
 *   filePath?: string;
 *   data: { title: string; published: boolean; date?: Date; slug?: string };
 * }} PostLike
 */

/**
 * A post entry whose `data.date` and `data.slug` are known to be present.
 * @template {PostLike} E
 * @typedef {E & { data: E["data"] & { date: Date; slug: string } }} Publishable
 */

/**
 * @typedef {{ id: string; filePath?: string; title: string; missing: ("date" | "slug")[] }} SkippedPost
 */

/**
 * What a post lacks to get a page: a usable date and a non-blank string slug.
 * Accepts raw frontmatter or parsed collection data.
 * @param {{ date?: unknown; slug?: unknown }} data
 * @returns {("date" | "slug")[]}
 */
export function missingForPage(data) {
  /** @type {("date" | "slug")[]} */
  const missing = [];
  if (toOptionalDate(data.date) === undefined) missing.push("date");
  if (typeof data.slug !== "string" || data.slug.trim() === "") missing.push("slug");
  return missing;
}

/**
 * True when a note gets a blog post page at /blog/<slug>, so it may be linked
 * and keyed by its slug. Accepts raw frontmatter or parsed collection data.
 * @param {{ published?: unknown; date?: unknown; slug?: unknown }} data
 * @returns {boolean}
 */
export function isLinkablePost(data) {
  return data.published === true && missingForPage(data).length === 0;
}

/**
 * Split published entries into those that can be built and those that must be
 * skipped. Unpublished entries appear in neither list. An entry is publishable
 * exactly when isLinkablePost(entry.data) is true.
 * @template {PostLike} E
 * @param {E[]} entries
 * @returns {{ publishable: Publishable<E>[]; skipped: SkippedPost[] }}
 */
export function partitionPublishable(entries) {
  /** @type {Publishable<E>[]} */
  const publishable = [];
  /** @type {SkippedPost[]} */
  const skipped = [];

  for (const entry of entries) {
    if (entry.data.published !== true) continue;

    const missing = missingForPage(entry.data);
    if (missing.length === 0) {
      publishable.push(/** @type {Publishable<E>} */ (entry));
    } else {
      skipped.push({ id: entry.id, filePath: entry.filePath, title: entry.data.title, missing });
    }
  }

  return { publishable, skipped };
}
