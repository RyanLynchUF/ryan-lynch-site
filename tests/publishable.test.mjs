import { test } from "node:test";
import assert from "node:assert/strict";
import { isLinkablePost, missingForPage, partitionPublishable } from "../src/lib/publishable.mjs";

const DATE = new Date("2026-04-07T00:00:00Z");

/** A post entry shaped like a `posts` collection entry. */
const post = (id, data) => ({
  id,
  filePath: `../vault/${id}.md`,
  data: { title: `Title ${id}`, published: true, date: DATE, slug: `slug-${id}`, ...data },
});

/** The skipped record partitionPublishable reports for post(id, ...). */
const skip = (id, missing) => ({ id, filePath: `../vault/${id}.md`, title: `Title ${id}`, missing });

test("a published post with a date and slug is publishable, unchanged", () => {
  const entry = post("ok", {});
  const { publishable, skipped } = partitionPublishable([entry]);
  assert.equal(publishable.length, 1);
  assert.equal(publishable[0], entry);
  assert.deepEqual(skipped, []);
});

test("a published post with no date is skipped with missing date", () => {
  const { publishable, skipped } = partitionPublishable([post("a", { date: undefined })]);
  assert.deepEqual(publishable, []);
  assert.deepEqual(skipped, [skip("a", ["date"])]);
});

test("a published post with an invalid date is skipped with missing date", () => {
  const { publishable, skipped } = partitionPublishable([post("a", { date: new Date("nope") })]);
  assert.deepEqual(publishable, []);
  assert.deepEqual(skipped, [skip("a", ["date"])]);
});

test("a published post with no slug is skipped with missing slug", () => {
  const { publishable, skipped } = partitionPublishable([post("a", { slug: undefined })]);
  assert.deepEqual(publishable, []);
  assert.deepEqual(skipped, [skip("a", ["slug"])]);
});

test("a published post with an empty or blank slug is skipped with missing slug", () => {
  const { skipped } = partitionPublishable([post("a", { slug: "" }), post("b", { slug: "  " })]);
  assert.deepEqual(skipped, [
    skip("a", ["slug"]),
    skip("b", ["slug"]),
  ]);
});

test("a published post with neither is skipped with both, date first", () => {
  const { publishable, skipped } = partitionPublishable([post("a", { date: undefined, slug: undefined })]);
  assert.deepEqual(publishable, []);
  assert.deepEqual(skipped, [skip("a", ["date", "slug"])]);
});

test("unpublished posts are ignored, not skipped, whatever they are missing", () => {
  const entries = [
    post("draft-complete", { published: false }),
    post("draft-no-date", { published: false, date: undefined }),
    post("draft-no-slug", { published: false, slug: undefined }),
    post("draft-neither", { published: false, date: undefined, slug: undefined }),
  ];
  assert.deepEqual(partitionPublishable(entries), { publishable: [], skipped: [] });
});

test("only a literal true counts as published", () => {
  const entries = [post("string-true", { published: "true" }), post("one", { published: 1 })];
  assert.deepEqual(partitionPublishable(entries), { publishable: [], skipped: [] });
});

test("a mixed list keeps input order in both outputs", () => {
  const entries = [
    post("p1", {}),
    post("s1", { date: undefined }),
    post("draft", { published: false }),
    post("p2", {}),
    post("s2", { slug: undefined }),
  ];
  const { publishable, skipped } = partitionPublishable(entries);
  assert.deepEqual(
    publishable.map((e) => e.id),
    ["p1", "p2"]
  );
  assert.deepEqual(
    skipped.map((s) => s.id),
    ["s1", "s2"]
  );
});

test("a skipped post without a filePath still reports its id", () => {
  const entry = post("a", { date: undefined });
  delete entry.filePath;
  const { skipped } = partitionPublishable([entry]);
  assert.deepEqual(skipped, [{ id: "a", filePath: undefined, title: "Title a", missing: ["date"] }]);
});

test("empty input yields empty outputs", () => {
  assert.deepEqual(partitionPublishable([]), { publishable: [], skipped: [] });
});

test("missingForPage reports a missing or unusable date and slug", () => {
  assert.deepEqual(missingForPage({ date: DATE, slug: "s" }), []);
  assert.deepEqual(missingForPage({ date: "2026-04-07", slug: "s" }), []);
  assert.deepEqual(missingForPage({ slug: "s" }), ["date"]);
  assert.deepEqual(missingForPage({ date: "TBD", slug: "s" }), ["date"]);
  assert.deepEqual(missingForPage({ date: 2026, slug: "s" }), ["date"]);
  assert.deepEqual(missingForPage({ date: DATE, slug: "  " }), ["slug"]);
  assert.deepEqual(missingForPage({ date: DATE, slug: 42 }), ["slug"]);
  assert.deepEqual(missingForPage({}), ["date", "slug"]);
});

test("isLinkablePost needs published === true, a slug and a usable date", () => {
  const base = { published: true, slug: "s", date: DATE };
  assert.equal(isLinkablePost(base), true);
  assert.equal(isLinkablePost({ ...base, date: "2026-04-07" }), true, "raw string date");
  assert.equal(isLinkablePost({ ...base, published: false }), false);
  assert.equal(isLinkablePost({ ...base, published: "true" }), false);
  assert.equal(isLinkablePost({ ...base, published: null }), false);
  assert.equal(isLinkablePost({ ...base, slug: "" }), false);
  assert.equal(isLinkablePost({ ...base, date: "TBD" }), false);
  assert.equal(isLinkablePost({ ...base, date: 2026 }), false);
});

test("partitionPublishable publishes an entry exactly when isLinkablePost is true", () => {
  const entries = [
    post("ok", {}),
    post("no-date", { date: undefined }),
    post("bad-date", { date: new Date("nope") }),
    post("no-slug", { slug: undefined }),
    post("blank-slug", { slug: " " }),
    post("draft", { published: false }),
  ];
  const published = new Set(partitionPublishable(entries).publishable.map((e) => e.id));
  for (const entry of entries) {
    assert.equal(published.has(entry.id), isLinkablePost(entry.data), entry.id);
  }
});
