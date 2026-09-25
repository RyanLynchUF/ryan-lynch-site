# Newsletters in Recent Writing and Blog, with a kind filter

**Date:** 2026-09-19
**Status:** Design approved in conversation, ready for implementation plan

## Goal

Show Your Turn, Robot newsletter issues alongside blog posts in the home page "Recent Writing" section and on `/blog`, with an All / Blog / Newsletter button filter in both places. Newsletter entries link out to the beehiiv web version of each issue. The newsletter publish process (`/publish-issue` in the `your-turn-robot` repo, then hitting send in beehiiv) is unchanged; the site pulls what beehiiv has already sent.

## Decisions made and why

- **Source of truth is the beehiiv API, not the newsletter repo.** The newsletter repo never records that an issue was sent or its public URL (`status:` only reaches `assembled`, and only `beehiiv_draft_id` is stored). beehiiv's `GET /v2/publications/{id}/posts?status=confirmed` returns title, `preview_text`, `publish_date`, `web_url`, `platform` and `hidden_from_feed` for every sent issue. Verified 2026-09-19 with the key in the newsletter repo's `.env`.
- **Fetching beehiiv's public site or RSS at build time was rejected.** Both return a Cloudflare challenge (HTTP 403) to non-browser clients, verified 2026-09-19. The newsletter repo's CLAUDE.md records the same for `link.mail.beehiiv.com`.
- **Writing a stub into the vault at draft-save time was rejected.** The public URL 404s until the issue is sent, so a stub written when the draft is saved could publish a dead link. The user chose a scheduled pull instead and accepted a delay of up to a week.
- **The fetched list is committed to the site repo as a snapshot** rather than fetched inside the Docker build. Builds stay hermetic, local builds need no key, git history shows what changed, and a week with no new issue is a no-op with no build.
- **Home page layout is option A2** (chosen in the Lavish mockup, `.lavish/writing-filter-mockup.html`): three pre-rendered groups, and in the "All" group the featured slot is always the newest blog post. Reason: with a weekly newsletter, the five newest items are almost always newsletters, so pure recency would push long-form posts off the home page within a week.
- **Newsletter title on the site is the beehiiv title** (for example `Your Turn, Robot — Issue #6`) with `preview_text` as the description. The alternative, preview text as the title, was offered and declined.
- **RSS is unchanged.** `rss.xml` keeps listing blog posts only; beehiiv has its own feed. Like every other list, it skips published posts missing a date or slug (see Section 2).

## Section 1: Sync workflow and fetch script

### `scripts/fetch-newsletters.mjs`

Plain Node 20 script, no dependencies, run as `pnpm run sync:newsletters`.

Inputs: `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID` from the environment. Both missing or empty is a hard error with a one-line message naming the variable. Locally, export them in the shell; they are never read from the site repo's `.env` by the build.

Behaviour:

1. Page through `https://api.beehiiv.com/v2/publications/{id}/posts?status=confirmed&limit=100&page=N&order_by=publish_date&direction=desc` until `page >= total_pages`. Any non-2xx response, network error, or unparseable body is a hard error. Nothing is written on error.
2. Keep posts where `platform` is `web` or `both`, `hidden_from_feed` is `false`, and `publish_date` is at or before now. Email-only issues have no readable web page and are skipped.
3. Map each kept post to `{ id, title, description, date, url, slug }`, where `description` is `preview_text` (falling back to `subtitle`, then empty string), `date` is `publish_date` as an ISO 8601 UTC timestamp, and `url` is `web_url`.
4. Sort by `date` descending, then `title` ascending, so the output is deterministic.
5. If the result is empty, exit non-zero without writing. beehiiv has sent issues, so an empty result means the API or filters are wrong, and silently wiping the list would remove every newsletter from the site.
6. Write `src/data/newsletters.json` as a two-space-indented array with a trailing newline. Rewriting an unchanged list produces no git diff.

The transform (steps 2 to 4) is a pure exported function `toEntries(posts, now)` so it can be unit tested without network.

### `.github/workflows/sync-newsletters.yml`

Triggers: `schedule` at `0 13 * * 3` (Wednesday 13:00 UTC, the morning after a Tuesday send) and `workflow_dispatch`.

Steps: checkout with `fetch-depth: 1`, set up Node 20 and pnpm, run `pnpm run sync:newsletters` with the two secrets in `env`, then:

- If `git status --porcelain -- src/data/newsletters.json` prints nothing, log "no change" and stop. No commit, no build. (`git diff --quiet` was rejected because it reports no change for an untracked file.)
- Otherwise commit the file as the github-actions bot with message `Sync newsletters from beehiiv`, push to `main`, and run `gh workflow run deploy.yml --ref main`. The explicit dispatch is required because a push made with `GITHUB_TOKEN` does not trigger `on: push` workflows; `workflow_dispatch` via `GITHUB_TOKEN` is the documented exception.

Permissions: `contents: write` and `actions: write`.

A failed fetch fails the job visibly in the Actions tab. The last committed snapshot stays live. Nothing retries automatically; the next Wednesday run or a manual dispatch picks it up.

### Secrets to add to `ryan-lynch-site`

| Secret | Purpose |
|---|---|
| `BEEHIIV_API_KEY` | Read access to the publication's posts |
| `BEEHIIV_PUBLICATION_ID` | The `pub_...` id the posts endpoint is scoped to |

Both values already exist in the newsletter repo's `.env`. The user adds them to the site repo's GitHub secrets by hand.

### Initial backfill

During implementation, run the script locally once with the key exported and commit the resulting `src/data/newsletters.json`, so the first deploy after merge already has the six sent issues. The Wednesday job then only ever adds to it.

## Section 2: Site content model

### `src/content.config.ts`

Add a `newsletters` collection using Astro's `file()` loader over `src/data/newsletters.json`, schema:

```
id: string
title: string
description: string (default "")
date: coerced Date
url: string url, starting with https://
slug: string
```

`posts` skips the vault directories listed in `src/lib/vault-rules.mjs` (`System Prompts`, `_website`, `_Templates`; the blog slug map and copy-media use the same list), is keyed by `slug` only for published posts (every other note by its vault path, so a draft cannot replace a published post), and treats an empty, blank or unparseable `date` as missing rather than failing the build. An empty property (`title:`, `description:`, `tags:`, `published:`, `slug:`) falls back to its default, and `tags: ai` becomes `["ai"]`; a wrongly typed value such as `published: "yes"` still fails the build. `pages` treats an empty `description` or an unusable `lastUpdated` the same way; its `title` and `slug` stay required. Code outside Astro that reads the vault (the blog slug map, copy-media) parses frontmatter with the same js-yaml parse and judges it with the same "gets a page" rule as the collection, so a wiki link always has a page behind it.

### `src/lib/writing.ts`

One helper module that both pages consume, so the merge rule lives in one place.

```
type WritingKind = "blog" | "newsletter";

interface WritingItem {
  kind: WritingKind;
  title: string;
  date: Date;          // calendar day at UTC midnight (see Dates)
  description: string;
  href: string;        // "/blog/<slug>" or the beehiiv web_url
  external: boolean;   // true for newsletters
  tags: string[];      // blog tags; [] for newsletters
}

getWriting(): Promise<WritingItem[]>
  // published posts + newsletters, sorted by calendar day desc,
  // then blog before newsletter, then title asc

getHomeGroups(): Promise<{ all: WritingItem[]; blog: WritingItem[]; newsletter: WritingItem[] }>
  // blog: newest 5 blog items
  // newsletter: newest 5 newsletter items
  // all (option A2): [newest blog item, ...newest 4 of any kind excluding that item]
  //   if there are no blog items, all = newest 5 of any kind
```

Selection logic is pure over an already-loaded array (`selectHomeGroups(items)`), so it is unit tested without Astro. Mapping and ordering are pure too (`src/lib/writing-items.mjs`).

**Dates.** A newsletter's `date` is its send instant; it becomes the calendar day it was sent in America/New_York, so "Your Turn, Robot - August 18, 2026", sent at `2026-08-19T00:04:58Z`, is Aug 18. A blog post's `date` is already a calendar day. Every date on the site is formatted in UTC (`src/lib/dates.mjs`), so the build machine's timezone never shifts a displayed day. When a blog post and a newsletter share a day, the blog post is listed first.

**Posts missing a date or slug.** A published post with no `date` (or an unparseable one, such as `TBD`) or no `slug` is skipped everywhere (home, `/blog`, RSS, its own page) with one `[posts] skipping published post` warning per build naming the note's file, and the build still succeeds. An empty or unparseable date, or an empty property, never fails the build.

## Section 3: Filter UI

### `src/components/WritingFilter.astro`

A segmented control with three buttons (All / Blog / Newsletter) using `aria-pressed`, styled as a pill group in the site's existing tokens (border `--color-border`, active state `--color-text` on `--color-bg`). Props:

- `mode`: `"groups"` or `"rows"`
- `target`: id of the container the filter controls

Inline script, same pattern as `ThemeToggle.astro`:

- `groups` mode: the container holds three `[data-group="all|blog|newsletter"]` panels. The active filter shows one and hides the others with the `hidden` attribute.
- `rows` mode: the container holds items with `data-kind="blog|newsletter"`. "All" shows everything; a kind hides non-matching items with `hidden`.
- On load, if the `kind` query parameter is `blog` or `newsletter` (`/blog?kind=newsletter`), that filter is preselected. Clicking a button does not change the URL. A hash was rejected because every page's footer has `id="newsletter"`, which is also the subscribe anchor linked from Ryan's vault.
- No persistence in `localStorage`. Each page load starts at "All" unless the query parameter says otherwise.

### Home page (`src/pages/index.astro`)

The "Recent Writing" section header becomes: heading on the left, `WritingFilter` in the middle, "All posts →" on the right. The section body renders the three groups from `getHomeGroups()`, each with the existing featured card plus compact rows markup. The "All posts →" link points to `/blog`, `/blog?kind=blog` or `/blog?kind=newsletter` to match the active filter (updated by the same script).

Newsletter items in the featured card and rows: `target="_blank" rel="noopener"`, a `newsletter` tag in the existing `.tag` style (outlined variant so it reads as a kind, not a topic), and a small `↗` marker after the title. Blog items render exactly as today.

### Blog page (`src/pages/blog/index.astro`)

Header row gains the `WritingFilter` in `rows` mode. The list renders `getWriting()` in full through `PostCard`, which gains `href`, `external` and `kind` props (replacing the current `slug`-only prop) and renders the same tag and marker for newsletters. Blog cards are unchanged visually.

### Newsletter page (`src/pages/newsletter.astro`)

The "read past issues" link points to `/blog?kind=newsletter` instead of the beehiiv root, so past issues are browsed on the site.

## Section 4: Testing and verification

- `node --test` unit tests (Node 20 built-in runner, no new dependency) for `toEntries` in the fetch script and `selectHomeGroups` in the writing helper. Cases: platform and hidden filters, future-dated posts excluded, deterministic ordering, empty blog list fallback, fewer than five items of a kind. Also for the date helpers (New York DST boundaries, formatting independent of the process timezone), writing item mapping and ordering (same-day blog-first ties), the skip rule for posts missing a date or slug, the posts schema's handling of empty properties, and agreement between the collection, the slug map and copy-media.
- `pnpm run check` (`astro check`) type-checks the site.
- `pnpm run build` must pass locally with the committed snapshot and `VAULT_PATH` set.
- Manual check of the built site in light and dark mode: filter states on home and blog, `?kind=` preselect, newsletter links open beehiiv in a new tab, blog page unchanged for blog items.
- The sync workflow is exercised once by manual `workflow_dispatch` after the secrets are added, confirming both the "no change" path and, by temporarily deleting one entry from the snapshot and re-running, the commit-and-dispatch path.

## Section 5: Documentation

`CLAUDE.md` in the site repo gains a "Newsletter sync" subsection under the publish flow: what the workflow does, when it runs, the two secrets, the snapshot file, and the "what can break" entries (key revoked, publication id wrong, beehiiv API down, dispatch permission missing).

`.gitignore` gains `.lavish/`.

## Out of scope

- Newsletter issues in `rss.xml`.
- A list of recent issues on `/newsletter` itself.
- Rendering newsletter content on the site. Entries link out to beehiiv.
- Any change to the `your-turn-robot` repo or the `/publish-issue` skill.
