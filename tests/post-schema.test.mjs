import { test } from "node:test";
import assert from "node:assert/strict";
import { readFrontmatter } from "../src/lib/frontmatter.mjs";
import { postId, postSchema } from "../src/lib/post-schema.mjs";

/** Parse a note's frontmatter the way the posts collection does. */
const parse = (frontmatter) => postSchema.safeParse(readFrontmatter(`---\n${frontmatter}\n---\n`) ?? {});

test("empty title, description, tags and published fall back to their defaults", () => {
  const result = parse("title:\ndescription:\ntags:\npublished:");
  assert.equal(result.success, true);
  assert.deepEqual(result.data, {
    title: "Untitled",
    description: "",
    tags: [],
    published: false,
  });
});

test("an empty or unparseable date and an empty slug are missing, not errors", () => {
  for (const fm of ["date:\nslug:", 'date: ""', "date: TBD", "date: 2026", "date: '   '"]) {
    const result = parse(`published: true\n${fm}`);
    assert.equal(result.success, true, fm);
    assert.equal(result.data?.date, undefined, fm);
  }
});

test("a single string tag becomes a one-item list", () => {
  assert.deepEqual(parse("tags: ai").data?.tags, ["ai"]);
  assert.deepEqual(parse("tags: [ai, ml]").data?.tags, ["ai", "ml"]);
  assert.deepEqual(parse("tags:\n  - ai\n  -\n  - ml").data?.tags, ["ai", "ml"]);
});

test("a wrongly typed value still fails loudly", () => {
  assert.equal(parse('published: "yes"').success, false);
  assert.equal(parse("published: yes").success, false, "YAML 1.2 reads yes as a string");
  assert.equal(parse("title: [a, b]").success, false);
  assert.equal(parse("tags: 42").success, false);
  assert.equal(parse("slug: 42").success, false);
});

test("a usable date is coerced to a Date", () => {
  assert.equal(parse("date: 2026-04-04 # moved").data?.date?.toISOString(), "2026-04-04T00:00:00.000Z");
  assert.equal(parse('date: "2026-04-07"').data?.date?.toISOString(), "2026-04-07T00:00:00.000Z");
});

test("postId keys a post that gets a page by its slug and anything else by its path", () => {
  const entry = "Posts/Post.md";
  const good = { published: true, slug: "post", date: new Date("2026-04-07") };
  assert.equal(postId({ entry, data: good }), "post");
  assert.equal(postId({ entry, data: { ...good, published: false } }), entry, "draft");
  assert.equal(postId({ entry, data: { ...good, date: "TBD" } }), entry, "skipped post");
  assert.equal(postId({ entry, data: { ...good, slug: "" } }), entry, "no slug");
  assert.equal(postId({ entry, data: {} }), entry);
});
