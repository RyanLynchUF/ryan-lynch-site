// Frontmatter reading and preprocessing for the content schemas
// (src/lib/post-schema.mjs, and pages in src/content.config.ts).
// An empty or unparseable date, or an empty property, never fails the build:
// the value becomes `undefined` ("missing") and the schema's default applies.
// Published posts missing a date or slug are then skipped with a warning
// (src/lib/posts.ts), and drafts pass silently. A wrongly typed value, such as
// `published: "yes"`, still fails the build on purpose: guessing could
// silently unpublish a post.
//
// readFrontmatter is the one frontmatter parser for code that reads the vault
// outside Astro (the blog slug map, copy-media), so they see exactly what the
// posts collection sees.

import yaml from "js-yaml";

// Astro's own pattern (@astrojs/markdown-remark parseFrontmatter): an optional
// BOM or leading blank lines, then a --- block. Astro also accepts +++ TOML
// frontmatter; Obsidian never writes it, so a +++ note reads as null here.
const FRONTMATTER_RE = /(?:^\uFEFF?|^\s*\n)---([\s\S]*?\n)---/;

/**
 * A note's YAML frontmatter, parsed the way Astro's content layer parses it
 * (js-yaml `load` with its default schema, so `published: True` is `true`,
 * `date: 2026-04-04 # moved` is a Date and `date: 2026` is a number). Returns
 * null when the note has no frontmatter, the frontmatter is not a mapping, or
 * it is not valid YAML (Astro fails the build on invalid YAML in a post).
 * @param {string} content
 * @returns {Record<string, unknown> | null}
 */
export function readFrontmatter(content) {
  const raw = FRONTMATTER_RE.exec(content)?.[1];
  if (raw === undefined) return null;
  let parsed;
  try {
    parsed = yaml.load(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return /** @type {Record<string, unknown>} */ (parsed);
}

/**
 * An empty frontmatter property (`title:` with no value, as Obsidian's
 * Properties panel writes it) parses as null. Treat it as missing so the
 * schema's default applies.
 * @param {unknown} value
 * @returns {unknown}
 */
export function emptyAsMissing(value) {
  return value === null ? undefined : value;
}

/**
 * A frontmatter date, or `undefined` when there is no usable one. YAML gives a
 * Date for `2026-04-07` and a string for anything it cannot read as a
 * timestamp. Empty, blank and unparseable strings (`""`, `TBD`) and every
 * other type (`null`, numbers, booleans, lists) are missing. A number is not
 * a date here: `z.coerce.date()` would read `2026` as milliseconds since 1970.
 * Valid values pass through unchanged for `z.coerce.date()` to coerce.
 * @param {unknown} value
 * @returns {Date | string | undefined}
 */
export function toOptionalDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "" || Number.isNaN(new Date(text).getTime())) return undefined;
    return text;
  }
  return undefined;
}

/**
 * Frontmatter tags as a list. A single string (`tags: ai`, as Obsidian users
 * often write it) becomes `["ai"]`. An empty `tags:` is missing, and empty
 * list items are dropped. Anything else passes through for the schema to
 * validate, so a wrongly typed value still fails loudly.
 * @param {unknown} value
 * @returns {unknown}
 */
export function toTagList(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const tag = value.trim();
    return tag === "" ? undefined : [tag];
  }
  if (Array.isArray(value)) {
    return value.filter(
      (tag) => tag !== null && tag !== undefined && !(typeof tag === "string" && tag.trim() === "")
    );
  }
  return value;
}
