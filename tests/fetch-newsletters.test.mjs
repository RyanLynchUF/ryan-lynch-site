import { test } from "node:test";
import assert from "node:assert/strict";
import { toEntries, fetchAllPosts } from "../scripts/fetch-newsletters.mjs";

const NOW = new Date("2026-09-19T12:00:00Z");
const secs = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 1000);

function post(overrides = {}) {
  return {
    id: "post_1",
    title: "Your Turn, Robot — Issue #1",
    subtitle: "the subtitle",
    preview_text: "the preview",
    meta_default_description: "the seo description",
    publish_date: secs(2026, 9, 15),
    web_url: "https://yourturnrobot.beehiiv.com/p/issue-1",
    slug: "issue-1",
    platform: "both",
    hidden_from_feed: false,
    ...overrides,
  };
}

test("maps a web post to the site entry shape", () => {
  const [entry] = toEntries([post()], NOW);
  assert.deepEqual(entry, {
    id: "post_1",
    title: "Your Turn, Robot — Issue #1",
    description: "the seo description",
    date: "2026-09-15T00:00:00.000Z",
    url: "https://yourturnrobot.beehiiv.com/p/issue-1",
    slug: "issue-1",
  });
});

test("description falls back from SEO description to preview_text to subtitle to empty string", () => {
  const [a] = toEntries([post({ meta_default_description: "" })], NOW);
  assert.equal(a.description, "the preview");
  const [b] = toEntries([post({ meta_default_description: null, preview_text: "" })], NOW);
  assert.equal(b.description, "the subtitle");
  const [c] = toEntries([post({ meta_default_description: undefined, preview_text: null, subtitle: null })], NOW);
  assert.equal(c.description, "");
});

test("keeps platform web and both, drops email", () => {
  const entries = toEntries(
    [
      post({ id: "web", platform: "web" }),
      post({ id: "both", platform: "both" }),
      post({ id: "email", platform: "email" }),
    ],
    NOW
  );
  assert.deepEqual(entries.map((e) => e.id).sort(), ["both", "web"]);
});

test("drops posts hidden from the feed", () => {
  const entries = toEntries([post({ hidden_from_feed: true })], NOW);
  assert.equal(entries.length, 0);
});

test("drops posts with hidden_from_feed undefined", () => {
  const entries = toEntries([post({ hidden_from_feed: undefined })], NOW);
  assert.equal(entries.length, 0);
});

test("drops posts published after now", () => {
  const entries = toEntries(
    [post({ id: "future", publish_date: secs(2026, 9, 22) }), post({ id: "past" })],
    NOW
  );
  assert.deepEqual(entries.map((e) => e.id), ["past"]);
});

test("accepts an ISO string publish_date", () => {
  const [entry] = toEntries([post({ publish_date: "2026-09-15T13:30:00Z" })], NOW);
  assert.equal(entry.date, "2026-09-15T13:30:00.000Z");
});

test("drops posts with an unparseable publish_date", () => {
  const entries = toEntries([post({ publish_date: "not a date" })], NOW);
  assert.equal(entries.length, 0);
});

test("throws when a kept post is missing web_url", () => {
  assert.throws(
    () => toEntries([post({ web_url: undefined })], NOW),
    (err) => err instanceof Error && err.message.includes("web_url")
  );
});

test("sorts by date desc then title asc regardless of input order", () => {
  const input = [
    post({ id: "b-old", title: "B", publish_date: secs(2026, 9, 1) }),
    post({ id: "a-old", title: "A", publish_date: secs(2026, 9, 1) }),
    post({ id: "new", title: "Z", publish_date: secs(2026, 9, 15) }),
  ];
  const forward = toEntries(input, NOW).map((e) => e.id);
  const reversed = toEntries([...input].reverse(), NOW).map((e) => e.id);
  assert.deepEqual(forward, ["new", "a-old", "b-old"]);
  assert.deepEqual(reversed, forward);
});

test("keeps relative input order for posts with identical date and title", () => {
  const input = [
    post({ id: "first", title: "Same", publish_date: secs(2026, 9, 10) }),
    post({ id: "second", title: "Same", publish_date: secs(2026, 9, 10) }),
  ];
  const entries = toEntries(input, NOW);
  assert.deepEqual(entries.map((e) => e.id), ["first", "second"]);
});

test("fetchAllPosts pages through multiple pages and concatenates results in order", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    const page = Number(url.searchParams.get("page"));
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: page === 1 ? "p1" : "p2" }], total_pages: 2 }),
    };
  };

  const posts = await fetchAllPosts("key123", "pub_1", fakeFetch);

  assert.deepEqual(posts.map((p) => p.id), ["p1", "p2"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.searchParams.get("page"), "1");
  assert.equal(calls[1].url.searchParams.get("page"), "2");
  for (const { url, init } of calls) {
    assert.equal(url.searchParams.get("status"), "confirmed");
    assert.equal(url.searchParams.get("limit"), "100");
    assert.equal(url.searchParams.get("order_by"), "publish_date");
    assert.equal(url.searchParams.get("direction"), "desc");
    assert.equal(init.headers.Authorization, "Bearer key123");
  }
});

test("fetchAllPosts throws with the status when the response is not ok", async () => {
  const fakeFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(
    () => fetchAllPosts("key", "pub", fakeFetch),
    (err) => err instanceof Error && err.message.includes("500")
  );
});

test("fetchAllPosts throws when the response body has no data array", async () => {
  const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ total_pages: 1 }) });
  await assert.rejects(() => fetchAllPosts("key", "pub", fakeFetch));
});

test("fetchAllPosts throws when the response body is unparseable", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("bad json");
    },
  });
  await assert.rejects(
    () => fetchAllPosts("key", "pub", fakeFetch),
    (err) => err instanceof Error && err.message.includes("unparseable")
  );
});
