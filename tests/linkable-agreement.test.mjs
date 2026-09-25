// The posts collection, the blog slug map and copy-media must agree on which
// notes get a page, because a disagreement means a dead link, a post that
// links nowhere, or a skipped post's images being deployed. Each case below
// once disagreed.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFrontmatter } from "../src/lib/frontmatter.mjs";
import { postId, postSchema } from "../src/lib/post-schema.mjs";
import { isLinkablePost, partitionPublishable } from "../src/lib/publishable.mjs";
import { buildBlogSlugMap } from "../src/plugins/build-blog-slug-map.mjs";
import { findPostsWithPages } from "../scripts/copy-media.mjs";

// [file, frontmatter, published, gets a page]
const CASES = [
  ["Plain.md", "title: Plain\nslug: plain\ndate: 2026-04-01\npublished: true", true, true],
  ["Comment.md", "title: Comment\nslug: comment\ndate: 2026-04-01\npublished: true # ready", true, true],
  ["Caps.md", "title: Caps\nslug: caps\ndate: 2026-04-02\npublished: True", true, true],
  ["Moved.md", "title: Moved\nslug: moved\ndate: 2026-04-04 # moved\npublished: true", true, true],
  ["Year.md", "title: Year\nslug: year-only\ndate: 2026\npublished: true", true, false],
  ["Tbd.md", "title: Tbd\nslug: tbd\ndate: TBD\npublished: true", true, false],
  ["NoSlug.md", "title: NoSlug\ndate: 2026-04-01\npublished: true", true, false],
  ["Draft.md", "title: Draft\nslug: draft\ndate: 2026-04-01\npublished: false", false, false],
  ["Unpublished.md", "title: Unpublished\nslug: unpub\ndate: 2026-04-01\nunpublished: true", false, false],
  ["Empty.md", "title:\ntags:\npublished:", false, false],
];

test("collection, slug map and copy-media agree for every case", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "linkable-agreement-"));
  const previousVaultPath = process.env.VAULT_PATH;
  process.env.VAULT_PATH = root;
  try {
    for (const [file, fm] of CASES) {
      fs.writeFileSync(path.join(root, file), `---\n${fm}\n---\n\nBody.\n`);
    }

    const slugMap = buildBlogSlugMap();
    const copied = new Set(findPostsWithPages(root).map((n) => path.basename(n.filePath)));

    for (const [file, , published, getsPage] of CASES) {
      const raw = readFrontmatter(fs.readFileSync(path.join(root, file), "utf-8"));
      assert.ok(raw, file);

      // The collection: schema, then partitionPublishable.
      const parsed = postSchema.parse(raw);
      const { publishable } = partitionPublishable([{ id: file, data: parsed }]);
      assert.equal(publishable.length === 1, getsPage, `${file}: collection page`);
      assert.equal(parsed.published, published, `${file}: collection published`);

      // The shared predicate on raw frontmatter, and the collection id.
      assert.equal(isLinkablePost(raw), getsPage, `${file}: isLinkablePost`);
      assert.equal(postId({ entry: file, data: raw }), getsPage ? raw.slug : file, `${file}: id`);

      // The slug map links exactly the posts that get a page.
      const title = /** @type {string} */ (raw.title ?? file.replace(/\.md$/, ""));
      assert.equal(title in slugMap, getsPage, `${file}: slug map`);

      // copy-media copies images for exactly the posts that get a page.
      assert.equal(copied.has(file), getsPage, `${file}: copy-media`);
    }
    assert.deepEqual(slugMap, { Plain: "plain", Comment: "comment", Caps: "caps", Moved: "moved" });
  } finally {
    if (previousVaultPath === undefined) {
      delete process.env.VAULT_PATH;
    } else {
      process.env.VAULT_PATH = previousVaultPath;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
