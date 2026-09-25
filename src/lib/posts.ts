import path from "node:path";
import { getCollection, type CollectionEntry } from "astro:content";
import { partitionPublishable, type Publishable } from "./publishable.mjs";

/** A published post with a guaranteed `data.date` and `data.slug`. */
export type PublishedPost = Publishable<CollectionEntry<"posts">>;

// Several pages call getPublishedPosts() in one build; warn once per post.
const warned = new Set<string>();

/**
 * Published posts that can be built. Published posts missing a date or slug
 * are left out everywhere (lists, RSS, post pages) with one warning each.
 */
export async function getPublishedPosts(): Promise<PublishedPost[]> {
  const { publishable, skipped } = partitionPublishable(await getCollection("posts"));

  for (const { id, filePath, title, missing } of skipped) {
    if (warned.has(id)) continue;
    warned.add(id);
    // Name the note's file, since a slugged post's id is only its slug. Astro
    // stores filePath relative to the site root, which is the build's cwd.
    const where = filePath ? path.resolve(filePath) : id;
    console.warn(`[posts] skipping published post "${title}" (${where}): missing ${missing.join(" and ")}`);
  }

  return publishable;
}
