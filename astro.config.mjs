import { defineConfig } from "astro/config";
import { loadEnv } from "vite";
import remarkStripObsidianComments from "./src/plugins/remark-strip-obsidian-comments.mjs";
import remarkObsidianImages from "./src/plugins/remark-obsidian-images.mjs";
import remarkWikiLinks from "./src/plugins/remark-wiki-links.mjs";
import remarkCallout from "@r4ai/remark-callout";
import remarkGfm from "remark-gfm";
import { buildBlogSlugMap } from "./src/plugins/build-blog-slug-map.mjs";

const { VAULT_PATH } = loadEnv(import.meta.env.MODE, process.cwd(), "");
if (VAULT_PATH) process.env.VAULT_PATH = VAULT_PATH;

// Dynamically scan vault for published posts and build title → slug map.
// Wiki-links to published posts resolve to /blog/<slug> instead of brain.ryanlynch.me.
const blogSlugMap = buildBlogSlugMap();

export default defineConfig({
  site: "https://ryanlynch.me",
  output: "static",
  markdown: {
    remarkPlugins: [
      remarkStripObsidianComments,
      remarkObsidianImages,
      [remarkWikiLinks, { slugMap: blogSlugMap }],
      remarkCallout,
      remarkGfm,
    ],
  },
});