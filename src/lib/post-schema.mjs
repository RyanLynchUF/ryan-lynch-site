// The posts collection's schema and entry id, used by src/content.config.ts.
// Kept in a plain module (astro/zod is the same zod that astro:content
// re-exports) so node --test can run real frontmatter through it.

import { z } from "astro/zod";
import { emptyAsMissing, toOptionalDate, toTagList } from "./frontmatter.mjs";
import { isLinkablePost } from "./publishable.mjs";

// An empty or unparseable date, or an empty property, never fails the build:
// each counts as missing and the default applies (src/lib/frontmatter.mjs).
// Without that, an empty property parses as null, which z.string() and
// friends reject, null coerces to 1970-01-01, and `date: TBD` fails as
// "Invalid date". A wrongly typed value (`published: "yes"`) still fails.
export const postSchema = z.object({
  title: z.preprocess(emptyAsMissing, z.string().optional().default("Untitled")),
  // Published posts missing a date or slug are skipped with a warning (src/lib/posts.ts).
  date: z.preprocess(toOptionalDate, z.coerce.date().optional()),
  description: z.preprocess(emptyAsMissing, z.string().optional().default("")),
  // `tags: ai` becomes ["ai"].
  tags: z.preprocess(toTagList, z.array(z.string()).optional().default([])),
  // An empty `published:` is a draft.
  published: z.preprocess(emptyAsMissing, z.boolean().optional().default(false)),
  slug: z.preprocess(emptyAsMissing, z.string().optional()),
});

/**
 * The glob loader's `generateId`. A post that gets a page (isLinkablePost) is
 * keyed by its slug. Every other note is keyed by its vault-relative path,
 * which is unique, so a draft or a skipped post can never replace a post that
 * gets a page, and notes whose paths slugify alike (Astro's default id) do not
 * collide.
 * @param {{ entry: string; data: Record<string, unknown> }} options
 * @returns {string}
 */
export function postId({ entry, data }) {
  return isLinkablePost(data) ? /** @type {string} */ (data.slug) : entry;
}
