// Blog posts and newsletter issues as one list of writing items, and the order
// that list is shown in. Pure so it is testable without Astro; src/lib/writing.ts
// does the collection I/O and delegates here.

import { SITE_TIME_ZONE, toCalendarDay } from "./dates.mjs";

/** @typedef {"blog" | "newsletter"} WritingKind */

/**
 * @typedef {object} WritingItem
 * @property {WritingKind} kind
 * @property {string} title
 * @property {Date} date the calendar day, at UTC midnight (see dates.mjs)
 * @property {string} description
 * @property {string} href "/blog/<slug>" for blog posts, the beehiiv web_url for newsletters
 * @property {boolean} external true for newsletters; render with target="_blank" rel="noopener"
 * @property {string[]} tags blog tags; always [] for newsletters
 */

/**
 * The `data` of a publishable post (see publishable.mjs).
 * @typedef {{ title: string; date: Date; description: string; slug: string; tags: string[] }} PostData
 */

/**
 * The `data` of a `newsletters` collection entry.
 * @typedef {{ title: string; date: Date; description: string; url: string }} IssueData
 */

const titleCollator = new Intl.Collator("en");

/**
 * Same-day ties list the blog post first (Ryan's decision, 2026-09-19).
 * @type {Record<WritingKind, number>}
 */
const KIND_ORDER = { blog: 0, newsletter: 1 };

/**
 * Newest day first; on the same day blog before newsletter; then title. The
 * href is unique per item, so it breaks any remaining tie and the order is
 * total.
 * @param {WritingItem} a
 * @param {WritingItem} b
 * @returns {number}
 */
export function compareWriting(a, b) {
  return (
    b.date.getTime() - a.date.getTime() ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    titleCollator.compare(a.title, b.title) ||
    (a.href < b.href ? -1 : a.href > b.href ? 1 : 0)
  );
}

/**
 * A blog post's YAML `date` is already a calendar day at UTC midnight;
 * normalising in UTC drops any time of day without shifting the day.
 * @param {PostData} post
 * @returns {WritingItem}
 */
export function postToItem({ title, date, description, slug, tags }) {
  return {
    kind: "blog",
    title,
    date: toCalendarDay(date, "UTC"),
    description,
    href: `/blog/${slug}`,
    external: false,
    tags,
  };
}

/**
 * A newsletter's `date` is its send instant; it is shown on the day it was
 * sent in Ryan's timezone.
 * @param {IssueData} issue
 * @returns {WritingItem}
 */
export function newsletterToItem({ title, date, description, url }) {
  return {
    kind: "newsletter",
    title,
    date: toCalendarDay(date, SITE_TIME_ZONE),
    description,
    href: url,
    external: true,
    tags: [],
  };
}

/**
 * Published posts and sent issues as one list, sorted by compareWriting.
 * @param {PostData[]} posts
 * @param {IssueData[]} issues
 * @returns {WritingItem[]}
 */
export function toWritingItems(posts, issues) {
  return [...posts.map(postToItem), ...issues.map(newsletterToItem)].sort(compareWriting);
}
