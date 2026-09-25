import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findPostsWithPages } from "../scripts/copy-media.mjs";

function makeVault(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copy-media-vault-"));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

const note = (frontmatter, body = "Body.\n") => `---\n${frontmatter}\n---\n\n${body}`;
/** Frontmatter of a post that gets a page, with `published` as given. */
const post = (published = "true", extra = "") =>
  `title: T\nslug: s\ndate: 2026-04-07\npublished: ${published}${extra ? `\n${extra}` : ""}`;

test("findPostsWithPages reads published the way js-yaml does", () => {
  const root = makeVault({
    "Published.md": note(post()),
    "Caps.md": note(post("True")),
    "Commented.md": note(post("true # ready to go")),
    "Crlf.md": note(post()).replace(/\n/g, "\r\n"),
    "Unpublished.md": note("title: U\nslug: u\ndate: 2026-04-07\nunpublished: true"),
    "Draft.md": note(post("false")),
    "StringTrue.md": note(post('"true"')),
    "Nested.md": note("title: N\nslug: n\ndate: 2026-04-07\nmeta:\n  published: true"),
    "BodyOnly.md": note("title: B\nslug: b\ndate: 2026-04-07", "published: true\n"),
    "NoFrontmatter.md": "published: true\n",
    "NotNote.txt": note(post()),
  });
  try {
    const found = findPostsWithPages(root)
      .map((n) => path.relative(root, n.filePath))
      .sort();
    assert.deepEqual(found, ["Caps.md", "Commented.md", "Crlf.md", "Published.md"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("findPostsWithPages leaves out published posts that are skipped, so their images are not deployed", () => {
  const root = makeVault({
    "Good.md": note(post(), "![[good.png]]\n"),
    "NoDate.md": note("title: D\nslug: d\npublished: true", "![[nodate.png]]\n"),
    "TbdDate.md": note("title: D\nslug: d\ndate: TBD\npublished: true"),
    "YearOnly.md": note("title: Y\nslug: y\ndate: 2026\npublished: true"),
    "NoSlug.md": note("title: S\ndate: 2026-04-07\npublished: true"),
    "BlankSlug.md": note('title: S\nslug: "  "\ndate: 2026-04-07\npublished: true'),
  });
  try {
    const found = findPostsWithPages(root).map((n) => path.relative(root, n.filePath));
    assert.deepEqual(found, ["Good.md"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("findPostsWithPages skips the excluded vault directories at any depth", () => {
  const root = makeVault({
    "Post.md": note(post()),
    [path.join("_Templates", "Tmpl.md")]: note(post()),
    [path.join("Area", "System Prompts", "Prompt.md")]: note(post()),
    [path.join("_website", "about.md")]: note(post()),
    [path.join("Area", "Deep.md")]: note(post()),
  });
  try {
    const found = findPostsWithPages(root)
      .map((n) => path.relative(root, n.filePath))
      .sort();
    assert.deepEqual(found, [path.join("Area", "Deep.md"), "Post.md"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("findPostsWithPages returns each note's content", () => {
  const content = note(post(), "![[diagram.png]]\n");
  const root = makeVault({ "Post.md": content });
  try {
    assert.deepEqual(findPostsWithPages(root), [{ filePath: path.join(root, "Post.md"), content }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
