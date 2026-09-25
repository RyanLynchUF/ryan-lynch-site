import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildBlogSlugMap } from "../src/plugins/build-blog-slug-map.mjs";

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blog-slug-map-"));

  fs.writeFileSync(
    path.join(root, "Post One.md"),
    `---\ntitle: "Post One"\nslug: post-one\ndate: 2026-04-07\npublished: true\n---\n\nBody.\n`
  );
  // Published with a slug but no date: getPublishedPosts skips it, so it has
  // no page and must not be a link target.
  fs.writeFileSync(
    path.join(root, "NoDate.md"),
    `---\ntitle: "No Date"\nslug: no-date\npublished: true\n---\n\nBody.\n`
  );
  fs.writeFileSync(
    path.join(root, "EmptyDate.md"),
    `---\ntitle: "Empty Date"\nslug: empty-date\ndate:\npublished: true\n---\n\nBody.\n`
  );
  fs.writeFileSync(
    path.join(root, "TbdDate.md"),
    `---\ntitle: "TBD Date"\nslug: tbd-date\ndate: TBD\npublished: true\n---\n\nBody.\n`
  );
  fs.writeFileSync(
    path.join(root, "Draft.md"),
    `---\ntitle: "Draft"\nslug: draft-slug\ndate: 2026-04-07\npublished: false\n---\n\nBody.\n`
  );
  fs.writeFileSync(
    path.join(root, "NoSlug.md"),
    `---\ntitle: "No Slug"\ndate: 2026-04-07\npublished: true\n---\n\nBody.\n`
  );
  fs.writeFileSync(
    path.join(root, "Diagram.excalidraw.md"),
    `---\ntitle: "Diagram"\nslug: diagram-slug\ndate: 2026-04-07\npublished: true\n---\n\nBody.\n`
  );
  // Complete published notes in the excluded vault directories are not posts.
  for (const dir of ["_Templates", path.join("Area", "System Prompts"), "_website"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(
      path.join(root, dir, "Tmpl.md"),
      `---\ntitle: "Tmpl ${dir}"\nslug: tmpl\ndate: 2026-04-07\npublished: true\n---\n\nBody.\n`
    );
  }
  // Dangling symlink: target .claude/CLAUDE.md is never created.
  fs.symlinkSync(path.join(root, ".claude", "CLAUDE.md"), path.join(root, "AGENTS.md"));

  return root;
}

test("buildBlogSlugMap only maps published posts with a slug and a date, skipping drafts, no-slug notes, missing or unparseable dates, excalidraw files, excluded vault directories, and a dangling symlink", () => {
  const root = makeFixture();
  const previousVaultPath = process.env.VAULT_PATH;
  process.env.VAULT_PATH = root;
  const previousWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => {
    warnings.push(args.join(" "));
  };
  try {
    let result;
    assert.doesNotThrow(() => {
      result = buildBlogSlugMap();
    });
    assert.deepEqual(result, { "Post One": "post-one" });
    assert.equal(warnings.filter((w) => w.includes("AGENTS.md")).length, 1);
  } finally {
    console.warn = previousWarn;
    if (previousVaultPath === undefined) {
      delete process.env.VAULT_PATH;
    } else {
      process.env.VAULT_PATH = previousVaultPath;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
