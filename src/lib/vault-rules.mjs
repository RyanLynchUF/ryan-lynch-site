// Vault directories that never hold blog posts. One list for every reader of
// the vault: the posts glob (src/content.config.ts), the blog slug map
// (src/plugins/build-blog-slug-map.mjs) and copy-media (scripts/copy-media.mjs).
// A name is excluded at any depth, like the glob `!**/<name>/**`.
//
// - "System Prompts": prompt notes, not writing.
// - "_website": the about/uses/now/colophon pages, loaded by the `pages`
//   collection instead.
// - "_Templates": template notes, whose placeholder slugs would collide with
//   or shadow real posts.

/** @type {readonly string[]} */
export const VAULT_EXCLUDED_DIRS = Object.freeze(["System Prompts", "_website", "_Templates"]);

/**
 * Glob negations for the excluded directories, for Astro's glob loader.
 * @returns {string[]}
 */
export function excludedDirGlobs() {
  return VAULT_EXCLUDED_DIRS.map((name) => `!**/${name}/**`);
}
