// Collection I/O for the merged writing list. Mapping and ordering live in
// writing-items.mjs and home group selection in select-home-groups.mjs, both
// pure and unit tested.

import { getCollection } from "astro:content";
import { getPublishedPosts } from "./posts";
import { selectHomeGroups } from "./select-home-groups.mjs";
import { toWritingItems, type WritingItem } from "./writing-items.mjs";

export type { WritingItem, WritingKind } from "./writing-items.mjs";

export interface HomeGroups {
  all: WritingItem[];
  blog: WritingItem[];
  newsletter: WritingItem[];
}

/** Published blog posts and sent newsletter issues as one sorted list. */
export async function getWriting(): Promise<WritingItem[]> {
  const posts = await getPublishedPosts();
  const issues = await getCollection("newsletters");
  return toWritingItems(
    posts.map((post) => post.data),
    issues.map((issue) => issue.data)
  );
}

/** The three pre-rendered groups for the home page (spec option A2). */
export async function getHomeGroups(): Promise<HomeGroups> {
  return selectHomeGroups(await getWriting());
}
