import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import path from "node:path";

const VAULT = process.env.VAULT_PATH || path.resolve("../MyHub");

const posts = defineCollection({
  loader: glob({
    pattern: ["**/*.md", "!**/System Prompts/**", "!**/_website/**"],
    base: VAULT,
  }),
  schema: z.object({
    title: z.string().optional().default("Untitled"),
    date: z.coerce.date().optional(),
    description: z.string().optional().default(""),
    tags: z.array(z.string()).optional().default([]),
    published: z.boolean().optional().default(false),
    slug: z.string().optional(),
  }),
});

const pages = defineCollection({
  loader: glob({
    pattern: "*.md",
    base: path.join(VAULT, "_website"),
  }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    slug: z.string(),
    lastUpdated: z.coerce.date().optional(),
  }),
});

export const collections = { posts, pages };