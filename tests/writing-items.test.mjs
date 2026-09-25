import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareWriting,
  newsletterToItem,
  postToItem,
  toWritingItems,
} from "../src/lib/writing-items.mjs";

const post = (title, day, extra = {}) => ({
  title,
  date: new Date(`${day}T00:00:00Z`),
  description: `About ${title}`,
  slug: title.toLowerCase().replace(/\W+/g, "-"),
  tags: ["tag"],
  ...extra,
});

const issue = (title, sentAt, extra = {}) => ({
  title,
  date: new Date(sentAt),
  description: `Preview of ${title}`,
  url: `https://yourturnrobot.beehiiv.com/p/${title.toLowerCase().replace(/\W+/g, "-")}`,
  ...extra,
});

const titles = (items) => items.map((item) => item.title);

test("postToItem maps a post to a blog item", () => {
  const item = postToItem({
    title: "Dr. Spin",
    date: new Date("2026-04-07T00:00:00Z"),
    description: "A positive spin",
    slug: "dr-spin",
    tags: ["ai", "project"],
  });
  assert.deepEqual(item, {
    kind: "blog",
    title: "Dr. Spin",
    date: new Date("2026-04-07T00:00:00Z"),
    description: "A positive spin",
    href: "/blog/dr-spin",
    external: false,
    tags: ["ai", "project"],
  });
});

test("postToItem keeps the UTC calendar day and drops any time of day", () => {
  const item = postToItem(post("Late", "2026-04-07", { date: new Date("2026-04-07T23:30:00Z") }));
  assert.equal(item.date.toISOString(), "2026-04-07T00:00:00.000Z");
});

test("newsletterToItem maps an issue to an external newsletter item", () => {
  const item = newsletterToItem({
    title: "Your Turn, Robot — Issue #5",
    date: new Date("2026-09-08T16:00:00.000Z"),
    description: "Self-hosting AI",
    url: "https://yourturnrobot.beehiiv.com/p/your-turn-robot-issue-5",
  });
  assert.deepEqual(item, {
    kind: "newsletter",
    title: "Your Turn, Robot — Issue #5",
    date: new Date("2026-09-08T00:00:00Z"),
    description: "Self-hosting AI",
    href: "https://yourturnrobot.beehiiv.com/p/your-turn-robot-issue-5",
    external: true,
    tags: [],
  });
});

test("newsletterToItem puts an evening send on its New York day", () => {
  // Sent 8:04 pm EDT on Aug 18, which is already Aug 19 in UTC.
  const item = newsletterToItem(issue("Your Turn, Robot - August 18, 2026", "2026-08-19T00:04:58Z"));
  assert.equal(item.date.toISOString(), "2026-08-18T00:00:00.000Z");
});

test("toWritingItems orders items newest day first across kinds", () => {
  const items = toWritingItems(
    [post("Old post", "2026-08-01"), post("New post", "2026-08-20")],
    [issue("Mid issue", "2026-08-12T14:19:54Z"), issue("Newest issue", "2026-09-08T16:00:00Z")]
  );
  assert.deepEqual(titles(items), ["Newest issue", "New post", "Mid issue", "Old post"]);
});

test("same-day tie lists the blog post before the newsletter, whatever the input order", () => {
  // The issue title sorts first, so only the kind rule can put the post first.
  const blog = post("Zebra post", "2026-08-18");
  const news = issue("Aardvark issue", "2026-08-19T00:04:58Z"); // Aug 18 in New York
  const expected = ["Zebra post", "Aardvark issue"];

  assert.deepEqual(titles(toWritingItems([blog], [news])), expected);

  const items = [newsletterToItem(news), postToItem(blog)];
  assert.deepEqual(titles([...items].sort(compareWriting)), expected);
  assert.deepEqual(titles([...items].reverse().sort(compareWriting)), expected);
});

test("same day and same kind are ordered by title", () => {
  const items = toWritingItems(
    [post("banana", "2026-08-18"), post("Cherry", "2026-08-18"), post("apple", "2026-08-18")],
    [issue("Issue B", "2026-09-01T13:00:00Z"), issue("Issue A", "2026-09-01T20:00:00Z")]
  );
  assert.deepEqual(titles(items), ["Issue A", "Issue B", "apple", "banana", "Cherry"]);
});

test("output is identical for every shuffle of the input", () => {
  const posts = [
    post("Alpha", "2026-08-18"),
    post("Beta", "2026-08-18"),
    post("Gamma", "2026-09-01"),
    post("Twin", "2026-07-04", { slug: "twin-1" }),
    post("Twin", "2026-07-04", { slug: "twin-2" }),
  ];
  const issues = [
    issue("Issue 1", "2026-08-19T00:04:58Z"),
    issue("Issue 2", "2026-09-01T13:00:00Z"),
    issue("Issue 3", "2026-09-08T16:00:00Z"),
  ];
  const expected = toWritingItems(posts, issues);
  assert.deepEqual(titles(expected), [
    "Issue 3",
    "Gamma",
    "Issue 2",
    "Alpha",
    "Beta",
    "Issue 1",
    "Twin",
    "Twin",
  ]);
  assert.deepEqual(
    expected.filter((item) => item.title === "Twin").map((item) => item.href),
    ["/blog/twin-1", "/blog/twin-2"]
  );

  // Deterministic Fisher-Yates with a small LCG, so a failure is reproducible.
  let seed = 42;
  const random = () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
  const shuffle = (arr) => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  for (let run = 0; run < 50; run++) {
    assert.deepEqual(toWritingItems(shuffle(posts), shuffle(issues)), expected, `run ${run}`);
  }
});

test("toWritingItems does not mutate its inputs", () => {
  const posts = [post("B", "2026-08-01"), post("A", "2026-08-20")];
  const issues = [issue("I", "2026-08-12T14:19:54Z")];
  const postsCopy = [...posts];
  const issuesCopy = [...issues];
  toWritingItems(posts, issues);
  assert.deepEqual(posts, postsCopy);
  assert.deepEqual(issues, issuesCopy);
});

test("empty inputs yield an empty list", () => {
  assert.deepEqual(toWritingItems([], []), []);
});
