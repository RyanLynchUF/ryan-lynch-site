import { defineCollection, z } from "astro:content";
import { glob, file } from "astro/loaders";
import path from "node:path";
import { emptyAsMissing, toOptionalDate } from "./lib/frontmatter.mjs";
import { postId, postSchema } from "./lib/post-schema.mjs";
import { excludedDirGlobs } from "./lib/vault-rules.mjs";

const VAULT = process.env.VAULT_PATH || path.resolve("../MyHub");

// The posts schema and id live in src/lib/post-schema.mjs so unit tests can
// run real frontmatter through them. An empty or unparseable date, or an
// empty property, never fails the build (src/lib/frontmatter.mjs).
const posts = defineCollection({
  loader: glob({
    // Excluded directories (templates, _website pages, system prompts) are
    // listed once in src/lib/vault-rules.mjs, shared with the slug map and
    // copy-media.
    pattern: ["**/*.md", ...excludedDirGlobs()],
    base: VAULT,
    // A post that gets a page is keyed by its slug, every other note by its
    // vault-relative path.
    generateId: postId,
  }),
  schema: postSchema,
});

const pages = defineCollection({
  loader: glob({
    pattern: "*.md",
    base: path.join(VAULT, "_website"),
  }),
  schema: z.object({
    // title and slug stay required: these are the site's own pages.
    title: z.string(),
    description: z.preprocess(emptyAsMissing, z.string().optional()),
    slug: z.string(),
    lastUpdated: z.preprocess(toOptionalDate, z.coerce.date().optional()),
  }),
});

// Snapshot of sent issues, written by scripts/fetch-newsletters.mjs and
// refreshed weekly by .github/workflows/sync-newsletters.yml.
const newsletters = defineCollection({
  loader: file("src/data/newsletters.json"),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().default(""),
    date: z.coerce.date(),
    // A CI job writes this file; only ever link out to https.
    url: z.string().url().startsWith("https://"),
    slug: z.string(),
  }),
});

export const collections = { posts, pages, newsletters };
