import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { walkDir } from "../src/lib/walk-dir.mjs";

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copy-media-"));
  fs.writeFileSync(path.join(root, "a.md"), "a");
  fs.mkdirSync(path.join(root, "nested"));
  fs.writeFileSync(path.join(root, "nested", "b.md"), "b");
  fs.symlinkSync(path.join(root, "a.md"), path.join(root, "link-to-a.md"));
  fs.symlinkSync(path.join(root, "nested"), path.join(root, "link-to-nested"));
  fs.symlinkSync(path.join(root, "does-not-exist.md"), path.join(root, "dangling.md"));
  return root;
}

test("walkDir visits files, recurses into directories, follows valid symlinks, skips dangling ones", () => {
  const root = makeFixture();
  const original = console.warn;
  console.warn = () => {};
  try {
    const seen = [];
    walkDir(root, (p) => seen.push(path.relative(root, p)));
    seen.sort();
    assert.deepEqual(
      seen,
      ["a.md", "link-to-a.md", path.join("link-to-nested", "b.md"), path.join("nested", "b.md")].sort()
    );
  } finally {
    console.warn = original;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("walkDir warns once per dangling symlink and does not throw", () => {
  const root = makeFixture();
  const warnings = [];
  const original = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    assert.doesNotThrow(() => walkDir(root, () => {}));
    assert.equal(warnings.filter((w) => w.includes("dangling.md")).length, 1);
  } finally {
    console.warn = original;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("walkDir does not throw on a directory symlink loop, still visits the real directory's contents, and warns", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copy-media-"));
  const warnings = [];
  const original = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    fs.mkdirSync(path.join(root, "sub"));
    fs.writeFileSync(path.join(root, "sub", "c.md"), "c");
    fs.symlinkSync(root, path.join(root, "sub", "up"));

    const seen = [];
    assert.doesNotThrow(() => walkDir(root, (p) => seen.push(path.relative(root, p))));
    assert.ok(seen.includes(path.join("sub", "c.md")));
    assert.ok(warnings.some((w) => w.includes("up")));
  } finally {
    console.warn = original;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("walkDir does not enter a dot-named symlink to a real directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copy-media-"));
  // Target lives outside root so it is reachable only through the symlink,
  // not also via a same-named real directory directly under root.
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "copy-media-target-"));
  const original = console.warn;
  console.warn = () => {};
  try {
    fs.writeFileSync(path.join(target, "b.md"), "b");
    fs.symlinkSync(target, path.join(root, ".linked"));

    const seen = [];
    walkDir(root, (p) => seen.push(path.relative(root, p)));
    assert.deepEqual(seen, []);
  } finally {
    console.warn = original;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test("walkDir enters a non-dot-named symlink to a dot directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copy-media-"));
  const original = console.warn;
  console.warn = () => {};
  try {
    fs.mkdirSync(path.join(root, ".hidden"));
    fs.writeFileSync(path.join(root, ".hidden", "x.md"), "x");
    fs.symlinkSync(path.join(root, ".hidden"), path.join(root, "alias"));

    const seen = [];
    walkDir(root, (p) => seen.push(path.relative(root, p)));
    assert.deepEqual(seen, [path.join("alias", "x.md")]);
  } finally {
    console.warn = original;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("walkDir on a missing directory is a no-op", () => {
  const seen = [];
  walkDir(path.join(os.tmpdir(), "copy-media-does-not-exist-" + Date.now()), (p) => seen.push(p));
  assert.deepEqual(seen, []);
});

test("walkDir does not enter dot directories or node_modules", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copy-media-"));
  try {
    fs.mkdirSync(path.join(root, ".hidden"));
    fs.writeFileSync(path.join(root, ".hidden", "x.md"), "x");
    fs.mkdirSync(path.join(root, "node_modules"));
    fs.writeFileSync(path.join(root, "node_modules", "y.md"), "y");
    fs.mkdirSync(path.join(root, "visible"));
    fs.writeFileSync(path.join(root, "visible", "z.md"), "z");

    const seen = [];
    walkDir(root, (p) => seen.push(path.relative(root, p)));
    seen.sort();
    assert.deepEqual(seen, [path.join("visible", "z.md")]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("walkDir skips dot-files, not just dot directories", () => {
  // tinyglobby's dot:false, which the posts glob in src/content.config.ts
  // takes by default, drops dot-files as well as dot-directories. A dot-file
  // reaching the callback would be judged a post the collection never loads,
  // so the slug map could link to a page that does not exist and copy-media
  // could deploy its images.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copy-media-"));
  try {
    fs.writeFileSync(path.join(root, ".draft.md"), "d");
    fs.writeFileSync(path.join(root, "keep.md"), "k");
    fs.mkdirSync(path.join(root, "nested"));
    fs.writeFileSync(path.join(root, "nested", ".DS_Store"), "");
    fs.writeFileSync(path.join(root, "nested", "n.md"), "n");

    const seen = [];
    walkDir(root, (p) => seen.push(path.relative(root, p)));
    seen.sort();
    assert.deepEqual(seen, ["keep.md", path.join("nested", "n.md")].sort());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("walkDir skips directories named in skipDirNames at any depth, but not files with those names", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "copy-media-"));
  try {
    const write = (rel) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), "x");
    };
    write("keep.md");
    write("_Templates.md");
    write(path.join("_Templates", "t.md"));
    write(path.join("nested", "_Templates", "deep", "t2.md"));
    write(path.join("nested", "System Prompts", "p.md"));
    write(path.join("nested", "keep2.md"));

    const seen = [];
    walkDir(root, (p) => seen.push(path.relative(root, p)), {
      skipDirNames: ["_Templates", "System Prompts"],
    });
    seen.sort();
    assert.deepEqual(seen, ["_Templates.md", "keep.md", path.join("nested", "keep2.md")].sort());

    const all = [];
    walkDir(root, (p) => all.push(p));
    assert.equal(all.length, 6, "without the option nothing extra is skipped");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
