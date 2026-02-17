 import { defineCollection, z } from "astro:content";
 import { glob } from "astro/loaders";
 import path from "node:path";

 const posts = defineCollection({
   loader: glob({
     pattern: ["**/*.md", "!**/System Prompts/**"],
     base: process.env.VAULT_PATH || path.resolve("../MyHub"),
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

 export const collections = { posts };