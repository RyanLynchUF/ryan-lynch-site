import { test } from "node:test";
import assert from "node:assert/strict";
import { selectHomeGroups } from "../src/lib/select-home-groups.mjs";

// Items are already sorted newest first, as getWriting() guarantees.
const n = (id) => ({ id, kind: "newsletter" });
const b = (id) => ({ id, kind: "blog" });
const ids = (arr) => arr.map((i) => i.id);

test("all: featured slot is the newest blog item even when newer newsletters exist", () => {
  const items = [n("n1"), n("n2"), n("n3"), b("b1"), n("n4"), n("n5"), b("b2")];
  const { all } = selectHomeGroups(items);
  assert.deepEqual(ids(all), ["b1", "n1", "n2", "n3", "n4"]);
});

test("all: rows are the newest four of any kind excluding the featured item", () => {
  const items = [b("b1"), n("n1"), b("b2"), n("n2"), n("n3"), n("n4")];
  const { all } = selectHomeGroups(items);
  assert.deepEqual(ids(all), ["b1", "n1", "b2", "n2", "n3"]);
});

test("all: with no blog items, falls back to the newest five of any kind", () => {
  const items = [n("n1"), n("n2"), n("n3"), n("n4"), n("n5"), n("n6")];
  const { all, blog } = selectHomeGroups(items);
  assert.deepEqual(ids(all), ["n1", "n2", "n3", "n4", "n5"]);
  assert.deepEqual(blog, []);
});

test("blog and newsletter groups are the newest five of their kind in order", () => {
  const items = [n("n1"), b("b1"), n("n2"), b("b2"), n("n3"), n("n4"), n("n5"), n("n6"), b("b3")];
  const { blog, newsletter } = selectHomeGroups(items);
  assert.deepEqual(ids(blog), ["b1", "b2", "b3"]);
  assert.deepEqual(ids(newsletter), ["n1", "n2", "n3", "n4", "n5"]);
});

test("fewer than five items of a kind yields a shorter group, not padding", () => {
  const items = [b("b1"), n("n1")];
  const { all, blog, newsletter } = selectHomeGroups(items);
  assert.deepEqual(ids(all), ["b1", "n1"]);
  assert.deepEqual(ids(blog), ["b1"]);
  assert.deepEqual(ids(newsletter), ["n1"]);
});

test("all: exactly five items with a blog item present returns all five in order", () => {
  const items = [b("b1"), n("n1"), n("n2"), n("n3"), n("n4")];
  const { all } = selectHomeGroups(items);
  assert.deepEqual(ids(all), ["b1", "n1", "n2", "n3", "n4"]);
});

test("all: exactly five items with the blog item not first still returns all five in order", () => {
  const items = [n("n1"), b("b1"), n("n2"), n("n3"), n("n4")];
  const { all } = selectHomeGroups(items);
  assert.deepEqual(ids(all), ["b1", "n1", "n2", "n3", "n4"]);
});

test("empty input yields three empty groups", () => {
  assert.deepEqual(selectHomeGroups([]), { all: [], blog: [], newsletter: [] });
});

test("does not mutate the input", () => {
  const items = [n("n1"), b("b1")];
  const copy = [...items];
  selectHomeGroups(items);
  assert.deepEqual(items, copy);
});
