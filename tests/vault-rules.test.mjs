import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VAULT_EXCLUDED_DIRS, excludedDirGlobs } from "../src/lib/vault-rules.mjs";
import { walkDir } from "../src/lib/walk-dir.mjs";

test("excludedDirGlobs gives one any-depth directory negation per excluded directory", () => {
  const globs = excludedDirGlobs();
  assert.equal(globs.length, VAULT_EXCLUDED_DIRS.length);
  assert.equal(new Set(globs).size, globs.length, "no duplicates");
  for (const [i, glob] of globs.entries()) {
    // `!` negates, the leading `**/` matches at any depth (including the
    // vault root), the trailing `/**` covers everything inside.
    assert.match(glob, /^!\*\*\/[^*/]+\/\*\*$/, glob);
    assert.equal(glob.slice(4, -3), VAULT_EXCLUDED_DIRS[i]);
  }
});

test("walkDir with VAULT_EXCLUDED_DIRS skips every excluded directory at the root and nested at depth", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vault-rules-"));
  const write = (rel) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), "x");
  };
  try {
    const kept = ["Post.md", path.join("Area", "Deep", "Post.md")];
    for (const name of VAULT_EXCLUDED_DIRS) {
      write(path.join(name, "Note.md"));
      write(path.join("Area", "Deep", name, "Inner", "Note.md"));
      // Only a directory with exactly that name is excluded.
      kept.push(`${name}.md`, path.join(`${name} old`, "Note.md"), path.join("Area", `x${name}`, "Note.md"));
    }
    kept.forEach(write);

    const seen = [];
    walkDir(root, (p) => seen.push(path.relative(root, p)), { skipDirNames: VAULT_EXCLUDED_DIRS });
    assert.deepEqual(seen.sort(), [...kept].sort());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
