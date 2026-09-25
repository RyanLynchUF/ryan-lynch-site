import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAsMissing, readFrontmatter, toOptionalDate, toTagList } from "../src/lib/frontmatter.mjs";

test("emptyAsMissing turns null into undefined and passes everything else through", () => {
  assert.equal(emptyAsMissing(null), undefined);
  assert.equal(emptyAsMissing(undefined), undefined);
  assert.equal(emptyAsMissing("dr-spin"), "dr-spin");
  assert.equal(emptyAsMissing(""), "");
  assert.equal(emptyAsMissing(0), 0);
});

test("toOptionalDate passes a valid Date through unchanged", () => {
  const date = new Date("2026-04-07T00:00:00Z");
  assert.equal(toOptionalDate(date), date);
});

test("toOptionalDate passes a parseable string through, trimmed", () => {
  assert.equal(toOptionalDate("2026-04-07"), "2026-04-07");
  assert.equal(toOptionalDate("  2026-04-07  "), "2026-04-07");
  assert.equal(toOptionalDate("2026-04-07T15:30:00Z"), "2026-04-07T15:30:00Z");
});

test("toOptionalDate treats missing, empty and blank values as missing", () => {
  assert.equal(toOptionalDate(undefined), undefined);
  assert.equal(toOptionalDate(null), undefined);
  assert.equal(toOptionalDate(""), undefined);
  assert.equal(toOptionalDate("   "), undefined);
});

test("toOptionalDate treats unparseable values as missing instead of failing the build", () => {
  assert.equal(toOptionalDate("TBD"), undefined);
  assert.equal(toOptionalDate("2026-13-45"), undefined);
  assert.equal(toOptionalDate(new Date("nope")), undefined);
});

test("toOptionalDate treats non-date types as missing, not as 1970", () => {
  assert.equal(toOptionalDate(2026), undefined);
  assert.equal(toOptionalDate(0), undefined);
  assert.equal(toOptionalDate(true), undefined);
  assert.equal(toOptionalDate(["2026-04-07"]), undefined);
  assert.equal(toOptionalDate({ year: 2026 }), undefined);
});

test("toTagList wraps a single string tag in a list", () => {
  assert.deepEqual(toTagList("ai"), ["ai"]);
  assert.deepEqual(toTagList("  home-automation  "), ["home-automation"]);
});

test("toTagList treats an empty tags property as missing", () => {
  assert.equal(toTagList(null), undefined);
  assert.equal(toTagList(undefined), undefined);
  assert.equal(toTagList(""), undefined);
  assert.equal(toTagList("   "), undefined);
});

test("toTagList keeps a list and drops its empty items", () => {
  assert.deepEqual(toTagList(["ai", "ml"]), ["ai", "ml"]);
  assert.deepEqual(toTagList(["ai", null, "", "  ", "ml"]), ["ai", "ml"]);
  assert.deepEqual(toTagList([]), []);
  assert.deepEqual(toTagList([null]), []);
});

test("toTagList passes wrongly typed values through for the schema to reject", () => {
  assert.equal(toTagList(42), 42);
  assert.equal(toTagList(true), true);
  const obj = { tag: "ai" };
  assert.equal(toTagList(obj), obj);
  assert.deepEqual(toTagList(["ai", 42]), ["ai", 42]);
});

test("toTagList does not mutate its input", () => {
  const tags = ["ai", null, "ml"];
  toTagList(tags);
  assert.deepEqual(tags, ["ai", null, "ml"]);
});

test("readFrontmatter parses YAML frontmatter into an object", () => {
  const data = readFrontmatter('---\ntitle: "Post"\nslug: post\ntags: [a, b]\npublished: true\n---\n\nBody.\n');
  assert.deepEqual(data, { title: "Post", slug: "post", tags: ["a", "b"], published: true });
});

test("readFrontmatter reads values the way js-yaml (and so Astro) does", () => {
  const data = readFrontmatter(
    "---\npublished: True\nready: true # comment\ndate: 2026-04-04 # moved\nyear: 2026\nempty:\n---\n"
  );
  assert.equal(data?.published, true);
  assert.equal(data?.ready, true);
  assert.ok(data?.date instanceof Date);
  assert.equal(/** @type {Date} */ (data?.date).toISOString(), "2026-04-04T00:00:00.000Z");
  assert.equal(data?.year, 2026);
  assert.equal(data?.empty, null);
});

test("readFrontmatter accepts CRLF, a BOM and leading blank lines, like Astro", () => {
  assert.deepEqual(readFrontmatter("---\r\npublished: true\r\n---\r\nBody\r\n"), { published: true });
  assert.deepEqual(readFrontmatter("﻿---\npublished: true\n---\n"), { published: true });
  assert.deepEqual(readFrontmatter("\n\n---\npublished: true\n---\n"), { published: true });
});

test("readFrontmatter returns null without a usable frontmatter mapping", () => {
  assert.equal(readFrontmatter("No frontmatter.\npublished: true\n"), null);
  assert.equal(readFrontmatter("Text first\n---\npublished: true\n---\n"), null);
  assert.equal(readFrontmatter("---\njust a string\n---\n"), null);
  assert.equal(readFrontmatter("---\n- a\n- b\n---\n"), null);
  assert.equal(readFrontmatter("---\n---\n"), null);
  assert.equal(readFrontmatter("---\ntitle: [unclosed\n---\n"), null, "invalid YAML");
  assert.equal(readFrontmatter('+++\npublished = true\n+++\n'), null, "TOML is not read");
});

test("readFrontmatter only sees top-level keys", () => {
  const data = readFrontmatter("---\nmeta:\n  published: true\nunpublished: true\n---\n");
  assert.equal(data?.published, undefined);
});
