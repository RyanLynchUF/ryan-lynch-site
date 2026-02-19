import { defineConfig } from "astro/config";
import remarkStripObsidianComments from "./src/plugins/remark-strip-obsidian-comments.mjs";
import remarkObsidianImages from "./src/plugins/remark-obsidian-images.mjs";
import remarkWikiLinks from "./src/plugins/remark-wiki-links.mjs";
import remarkCallout from "@r4ai/remark-callout";
import remarkGfm from "remark-gfm";

// Map of note title → blog slug for cross-post links.
// These resolve to /blog/<slug> instead of brain.ryanlynch.me.
const blogSlugMap = {
  "Building a Website Using AWS Lightsail": "building-a-website-using-aws-lightsail",
  "Smart Garage with Shelly 1": "smart-garage-shelly-1",
  "Auction AId Release 1.0 - A New Tool for Fantasy Football Auction Drafts": "auction-aid-release-1",
  "Projects While Completing Master\u2019s of Science in Analytics at Georgia Tech": "georgia-tech-masters-projects",
  "From Buzz to Building - Introduction to GenAI for Developers - Part 1 - Key Concepts": "genai-part-1",
  "Career on Pause, Growth on Play - My Learning Journey as a Full-Time Parent": "career-on-pause-growth-on-play",
  "Dr. Spin - a positive spin on life using AI": "dr-spin",
  "Self-Service Analytics Grounded in Reality - The Good, The Bad, and The Ugly": "self-service-analytics-grounded-in-reality",
  "Self-Service Analytics - The Quintessential Problem for a People, Process, and Technology Mindset": "self-service-analytics-ppt",
  "The Self-Service Analytics Tech Stack - Finding your Sweet Spot": "self-service-analytics-tech-stack",
  "From Buzz to Building - Introduction to GenAI for Developers - Part 2 - The Technical Stack": "genai-part-2",
};

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