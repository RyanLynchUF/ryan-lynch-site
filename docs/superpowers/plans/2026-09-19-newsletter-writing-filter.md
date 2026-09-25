# Newsletters in Recent Writing and Blog: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show sent Your Turn, Robot issues alongside blog posts on the home page "Recent Writing" section and on `/blog`, with an All / Blog / Newsletter filter in both places, sourced from a committed snapshot of the beehiiv API that a weekly GitHub Actions job refreshes.

**Architecture:** A dependency-free Node script pulls confirmed posts from the beehiiv API and writes `src/data/newsletters.json`. A scheduled workflow runs it every Wednesday, commits the file if it changed, and dispatches the deploy workflow. On the site, a new `newsletters` content collection reads the JSON with Astro's `file()` loader, a `writing` helper merges it with published posts into one sorted list, and a `WritingFilter` component with an inline script toggles pre-rendered groups (home) or hides rows by kind (blog). The pure parts (API transform, home group selection) live in `.mjs` modules so `node --test` runs them on Node 20 with no loader or dependency.

**Tech Stack:** Astro v5 (Content Layer, `file()` loader), plain CSS in component `<style>` blocks using tokens from `BaseLayout.astro`, Node 20 built-in test runner, GitHub Actions, pnpm.

---

## Spec reference

Source: `docs/superpowers/specs/2026-09-19-newsletter-writing-filter-design.md`. Layout mockup: `.lavish/writing-filter-mockup.html` (option A2 chosen).

## Deviations from the spec, and why

- **Pure logic lives in `.mjs`, not `.ts`.** The spec says `node --test` with no new dependency. Node 20 cannot import TypeScript, so `selectHomeGroups` lives in `src/lib/select-home-groups.mjs` (JSDoc-typed) and `src/lib/writing.ts` re-exports it. Astro's base tsconfig has `allowJs: true` (`node_modules/astro/tsconfigs/base.json:27`), so the TS side gets types from the JSDoc.
- **`publish_date` is handled as either a Unix timestamp in seconds or an ISO string.** The beehiiv v2 API documents `publish_date` as a Unix timestamp integer. The spec says "as an ISO 8601 UTC timestamp", which is the output format. The transform converts both forms and the test covers both.
- **Home page featured/rows markup is extracted to `src/components/HomeWritingGroup.astro`.** The spec keeps it in `index.astro`. Rendering three groups inline would triple ~40 lines of markup, so the group is a component and `index.astro` renders it three times. The `.featured` and `.post-row` styles move with the markup; the tag box and the external marker later became the shared `Tag` and `ExternalMark` components (see "Shared building blocks" below).
- **`.gitignore` already contains `.lavish/`** (verified: last two lines of `.gitignore`). Nothing to do for that spec item.
- **Deep links use `?kind=` instead of a hash.** Every page's footer has `id="newsletter"` (`src/components/NewsletterEmbed.astro:5`), so `/blog#newsletter` would also scroll to the footer, and Ryan's vault links to `ryanlynch.me/#newsletter` as the subscribe anchor. Ryan chose the query parameter on 2026-09-19. Clicking a filter still does not change the URL.
- **Dates are calendar days, formatted in UTC** (Task 6b). Blog `date`s are YAML calendar days that Zod parses to UTC midnight; newsletter `date`s are send instants. Every page used `toLocaleDateString` with no `timeZone`, so no build timezone rendered both correctly: "Your Turn, Robot - August 18, 2026" was sent at `2026-08-19T00:04:58Z` (8:04 pm EDT on Aug 18), so the Docker build (UTC) showed it as Aug 19, while local builds (America/New_York) showed every blog and page date a day early (for example `genai-part-1`, dated 2024-12-09, rendered "December 8, 2024"). Now `src/lib/dates.mjs` turns a newsletter send instant into its day in America/New_York (`toCalendarDay`), keeps a blog date's UTC day, stores both at UTC midnight, and formats with `formatDay(day, "long" | "medium" | "short" | "month")` in UTC plus `isoDay(day)` for `datetime`. `WritingItem.date` is that calendar day. The `"month"` style ("April 2026") serves the pages' "Last Updated" line, which shows no day. Verified: a local build and a `TZ=UTC` build produce identical HTML for `/about`, `/uses`, `/now`, `/colophon` and a post page.
- **Same-day ties list the blog post first** (Ryan's decision, 2026-09-19). The spec sorts by date then title. `compareWriting` in `src/lib/writing-items.mjs` sorts by calendar day descending, then blog before newsletter, then title (`Intl.Collator("en")`), then `href` so the order is total.
- **Published posts missing a `date` or `slug` are skipped with a warning** (Ryan's decision, 2026-09-19). Before, a missing date rendered "Jan 1, 1970" and a missing slug linked to `/blog/undefined`. `partitionPublishable` (`src/lib/publishable.mjs`) and `getPublishedPosts()` (`src/lib/posts.ts`) drop such posts from lists, RSS and post pages, logging `[posts] skipping published post "<title>" (<absolute path of the note>): missing <date and/or slug>` once per post per build. The build does not fail. An empty or unparseable date, or an empty property, never fails the build: `toOptionalDate` (`src/lib/frontmatter.mjs`) turns an empty, blank or unparseable date (`date:`, `date: ""`, `date: TBD`) and non-date types (`date: 2026`) into "missing", so drafts pass silently and published posts are skipped; before, `null` coerced to 1970-01-01 and `TBD` failed the build with "Invalid date". An empty `title:`, `description:`, `tags:`, `published:` or `slug:` (YAML `null`, which Obsidian's Properties panel writes) falls back to its default ("Untitled", "", [], false, none), `tags: ai` becomes `["ai"]`, and pages' `description` and `lastUpdated` follow the same rules. A wrongly typed value (`published: "yes"`, `tags: 42`) and invalid YAML still fail the build, naming the file, so a typo cannot silently unpublish a post. `build-blog-slug-map.mjs` applies the same rule as the collection (`isLinkablePost`), so wiki links never target a skipped post.
- **Schema hygiene** (Task 6b). One exclusion list, `VAULT_EXCLUDED_DIRS` in `src/lib/vault-rules.mjs` (`System Prompts`, `_website`, `_Templates`), drives the posts glob, the blog slug map and copy-media (via `walkDir`'s `skipDirNames` option), so a published template can neither become a post nor be linked as one. Posts use a custom `generateId` (`postId` in `src/lib/post-schema.mjs`): only a post that gets a page (`isLinkablePost`) is keyed by its slug, every other note by its vault-relative path, so a draft cannot replace a published post and `B+ Tree Index.md` / `B-Tree Index.md` no longer collide as `b-tree-index`. copy-media copies images only for posts that get a page (`isLinkablePost` on `readFrontmatter` output), so a skipped post's images are not deployed; its old regex also matched `unpublished: true`. Newsletter `url`s must start with `https://`, since a CI job writes the snapshot.
- **One frontmatter parser and one "gets a page" rule** (Task 6b). The blog slug map and copy-media used regex parsers that disagreed with Astro's js-yaml: `published: true # ready`, `published: True` and `date: 2026-04-04 # moved` got post pages but wiki links to them went to brain.ryanlynch.me, and `date: 2026` (a YAML number) made a dead `/blog` link. Now `readFrontmatter` (`src/lib/frontmatter.mjs`) parses with js-yaml 4.1.1 (the version Astro uses, now a direct dependency) and Astro's own block pattern, and `isLinkablePost` (`src/lib/publishable.mjs`) decides which notes get a page. `partitionPublishable` shares its `missingForPage` check, so the collection, its ids, the slug map and copy-media agree by construction; `tests/linkable-agreement.test.mjs` runs each reproduced case through all of them. The posts schema moved to `src/lib/post-schema.mjs` so that test runs the real schema.
- **Type-check tooling** (Task 6b). `@astrojs/check`, `typescript` (`^5`: TypeScript 7 breaks the peer ranges of `@astrojs/check`, `tsconfck` and `zod-to-ts`) and `@types/node` (`^20`, matching the Docker runtime) are dev dependencies, and `pnpm run check` runs `astro check`. It reports one known error, `slug` possibly undefined in `src/pages/blog/index.astro`, which Task 10's rewrite removes. Task 10 then adds `RUN pnpm run check` to the `Dockerfile`; `astro check` needs no vault data.
- **Visually hidden new-tab text on newsletter links** (Task 8). The `↗` marker is `aria-hidden`, so screen-reader users got no cue that a newsletter link opens a new tab. `ExternalMark` renders " (opens in a new tab)" with the global `.visually-hidden` class after the marker: in rows inside the tag group, and on the featured card at the end of the link, outside the heading (see the review fixes below). Verified with CDP in headless Chrome: every newsletter link's accessible name has "(opens in a new tab)" right after its title, and the marker is not read.
- **Task 8 layout fixes from the browser check.** Measured with CDP in headless Chrome at 1280px and 390px, light and dark, against option A2 in `.lavish/writing-filter-mockup.html`:
  - The featured title's `↗` had both a space and `.ext`'s 0.3rem margin, about 10px against the mockup's 5px. The markup now has no space before the marker, so the margin is the whole gap (4.8px) and the marker cannot wrap onto a line by itself.
  - `.tag.kind`'s 1px border made it 2px taller than a topic tag (24.2px against 22.2px). Newsletter rows were 0.8px taller than blog rows, and the featured title moved 2px when switching between All and Newsletter. Its padding now gives the border back (`calc(0.1rem - 1px) calc(0.4rem - 1px)`), so every tag is 22.2px, rows are 47.6px apart whatever their kind, and the featured title sits at the same height in all three states.
  - The browser focus ring on `.featured` and `.post-row` sat flush on the first and last glyphs, because the text touches the link's edges. `outline-offset: 4px` clears it.
  - The plan's `.view-all { margin-left: auto }` inside the 640px query repeated the base rule and is dropped.
  - With JavaScript off, the filter is hidden, and on phones `flex-basis: 100%` left "All posts →" alone under the heading. `@media (max-width: 640px) and (scripting: none)` resets the heading's `flex-basis`.
  - Row titles flow as inline text (review follow-up). With `.post-title` as an `inline-flex` with `gap`, a title that filled its line pushed the tag and `↗` onto a line of their own even when the last word left room, and on a 390px phone the "August 25, 2026" rows were 77px against 47.6px for "Issue #4". Now the title is plain text followed by one `white-space: nowrap` group (`.marks`: tag, `↗`, hidden text) that follows the last word or wraps as a unit. The only break point before the group is a space in `.marks-gap`, set in the tag's monospace font (where a space is `1ch`) with `word-spacing: calc(0.45rem - 1ch)`, so it is exactly the old 0.45rem gap and, like any space, is dropped at a line end, so a wrapped group starts flush with the title. A margin on the group would have indented a wrapped group by 0.45rem. `.tag` is `inline-block` so it keeps its 22.2px box and sits on the title's baseline. The markup keeps line breaks inside `{}` expressions so no stray whitespace adds a second space. Measured: at 1280px the tag and `↗` are 0.016px (one 1/64px layout unit) right of their flex positions and not moved vertically, row heights and all baselines are unchanged, and a screenshot diff shows only anti-aliasing on the tag's right edge and the `↗`; at 390px the wrapped "August" rows are 73.5px (two text lines, like a two-line blog title) instead of 77px, and injected long titles put the tag after the last word (a two-line title row is 73.5px instead of 102.9px, a three-line one 99.3px instead of 128.7px). The featured title's `↗` was already inline, joined to the last word with no space so it never wraps alone, and is unchanged.
- **Shared building blocks** (Task 8 code review). `src/components/Tag.astro` (variant `topic` or `kind`; `inline-block`, the outlined border given back in padding; size from `--tag-font-size` and `--tag-pad-x`, which default to the post page's 0.75rem / 0.45rem since the code review, with the home page's group setting the compact 0.7rem / 0.4rem once) and `src/components/ExternalMark.astro` (`{title}<ExternalMark />` with no whitespace; gap in `--ext-gap`, default 0.3rem; `only="mark"` / `only="hint"` and `hintId` to split the arrow from the hidden text) replace per-component copies, so Task 9's `PostCard` cannot repeat Task 8's bugs. Sizes travel as custom properties because they inherit across Astro's style scopes, where a scoped parent rule would not match the child's span. Both components put `<style>` before their markup: Astro emits the whitespace between markup and a following `<style>` as a trailing space, which put a space between a row's tag and its arrow. `BaseLayout.astro` gains `--font-mono` (the existing stack; leading with `ui-monospace` would visibly change tags on Apple devices, which is Ryan's call) and a global `.visually-hidden` utility. The post page's topic tags use `Tag` at their existing 0.75rem / 0.45rem size and still break at their hyphens when wider than the page (`white-space: normal`), as before; without that, `Tag`'s `nowrap` widened the page to 464px at 320px with a 60-character tag. `PostCard.astro` is left for Task 9. Verified invisible with real data: screenshots of the home page's Recent Writing section and the top 1800px of `/blog/career-on-pause-growth-on-play/` and `/blog/configuring-ai-coding-tools/` (1280px and 390px, light and dark) differ in 0 pixels, and every element's rect, font, padding, colours and `white-space` there (including all 21 `code` elements) is unchanged; the three home filter panels and the long-title stress cases are also pixel-identical.
- **Task 8 code review fixes.**
  - Featured tags wrap. `.featured-tags` was a non-wrapping flex row and tags are `nowrap`, so `career-on-pause-growth-on-play`'s three tags widened the page to 392px at 320px and 390px. It now has `flex-wrap: wrap` and `min-width: 0`, and `.featured-tags :global(.tag)` gets `max-width: 100%; overflow: hidden; text-overflow: ellipsis` for a single tag wider than the card. The `min-width: 0` is needed: `.featured-tags` is itself a flex item, and without it its automatic minimum width is its widest tag (a percentage `max-width` does not count toward that), so a 60-character tag still widened the page to 456px. The guard is not on row tags, because `overflow` other than `visible` moves an inline-block's baseline. Verified with a fixture vault in `$TMPDIR` (newest post with the three tags, a 60-character tag, or both): no horizontal overflow at 320px, 390px or 1280px in either theme; the long tag is cut with an ellipsis at 265px (320) and 335px (390).
  - The featured card's hidden new-tab text sits at the end of the link, after the description, not in the `h3`, so heading navigation reads just the title. The link has `aria-labelledby` (its `h3`, plus the new-tab text for an external item) and `aria-describedby` (the date line and the description), with ids like `${group}-featured-title` so the same item in two panels has unique ids. Verified with `Accessibility.getFullAXTree`: the newsletter card's name is "Your Turn, Robot — Issue #5 (opens in a new tab)" (the em dash is part of the beehiiv title) with description "Sep 8, 2026 newsletter Self-hosting AI on your own machine, and a $20 Minecraft mod built in an hour"; the blog card's name is its title with description "Apr 7, 2026 technical-project Building a web app ..."; both headings read just the title.
  - A card without a description had 24.8px below the title against 20px above the date. The 0.3rem gap moved from the `h3`'s bottom margin to the description's top margin. The suggested `.featured h3:last-child { margin-bottom: 0 }` fixes blog cards but not newsletter cards, where the hidden new-tab text follows the `h3`: measured 24.8px with that rule, 20px with the moved margin. Cards with a description are pixel-identical to before.
  - Verified unchanged: the header's h2, the three filter buttons and "All posts →" share one baseline (probe-measured, equal to 0.01px) and the header does not move between filter states; row title, tag, `↗` and date share one baseline; 20px from the header rule to the featured card and from the card to the first row; outlined tag contrast 6.75:1 light and 9.47:1 dark.

- **Task 10 fixes from the browser check.** Measured with CDP in headless Chrome at 1280px, 390px and 320px, light and dark, against the `/blog` panel of `.lavish/writing-filter-mockup.html`:
  - **The filter sits under the blurb, at the left, at every width** (Ryan's decision, 2026-09-19, after seeing the screenshots). `.page-intro { flex-basis: 100% }` gives the title and blurb the whole first line, so the filter wraps to a row of its own: 16px under the blurb (the header's `gap`), flush left with the title, and above the divider. The blurb keeps its natural one-line width on a desktop and is never squeezed to make room for the filter. This is what the mockup renders, and it needs no breakpoint: the phone layout is the desktop layout.
    - Two earlier attempts are recorded because the wrapping is easy to get wrong. `flex-basis: auto` (the plan's first version) let the blurb ask for its one-line width (661px of the 688px column), which left no room for the 180px filter, so the filter wrapped anyway at every width, but only by accident: any shorter blurb would have put it back beside the text. `flex: 1 1 0` squeezed the blurb to 491.86px and put the filter at the bottom right, which is what the mockup's CSS (`justify-content: space-between; align-items: flex-end`) asks for but not what Ryan picked.
    - Measured: the header is 150.97px at 1280px, 173.77px at 640px and 390px, and 196.56px at 320px, in each case 49.59px taller than the old page's (33.59px of filter plus the 16px gap), so the list starts 49.59px lower. The blurb is one line at 1280px, two at 640px and 390px, three at 320px. No horizontal overflow at any width.
  - With JavaScript off, `WritingFilter`'s `<noscript>` renders as a box. As a sibling of the control it became an empty flex item in `/blog`'s header: 16px of gap beside the blurb, and on a phone an empty row that made the header 16px taller than the old page. The `<noscript>` now sits inside the control, which it hides. The home page's Recent Writing is pixel-identical before and after (21 screenshots: 1280px, 390px and 320px, light and dark, all three filter states, plus no-JS at each width).
  - The browser focus ring on a card title sat flush on its first glyph and its `↗` (Chrome gives links a 1px `outline-offset`). `.post-card-title:focus-visible { outline-offset: 4px }` clears it, as on the home page's rows and featured card. The live `/blog` had the same flush ring.

- **Post page: nothing but spacing separates the date from the tags** (Ryan's decision, 2026-09-19, replacing the phone-only fix he first saw; the page is outside this spec's scope, but the flaw was in the tag line Task 8 touched). `.post-meta` separates the date from the tags with its `gap` at every width, as the home page's featured card does (`HomeWritingGroup`'s `.featured-meta`), and the gap is that line's 0.75rem, which is also the row gap once the tags wrap. The `<span class="meta-sep" aria-hidden="true">` and its rule are gone from `src/pages/blog/[...slug].astro`.
  - The first attempt hid the separator and gave `.tags` `flex-basis: 100%` below 640px. It fixed only the widths it was asked about: the separator still dangled at the end of the date's line whenever the tags wrapped above 640px, which a fourth tag does at 641px and a fifth does at every width, including 1280px.
  - Measured on `/blog/career-on-pause-growth-on-play/` at 1280px, 640px, 390px and 320px, light and dark, with its real three tags and with four and five injected: no separator in any state, the gap from the date to the first tag is exactly 12px when they share a line, wrapped tags start at the text column 12px under the date, and nothing overflows at any width.

- **`/blog` has an empty state for every filter** (code review, 2026-09-19). The page renders three `.empty-note` paragraphs, one per filter, with the home page's wording and style. Only `data-empty="all"` ("Nothing published yet.") can be shown by the server, when `getWriting()` returns nothing; it carries `hidden` as soon as anything is published. Rows mode hides cards in the browser, so `WritingFilter`'s `apply()` counts what stays visible and shows the matching `[data-empty]` note when that count is zero. That covers `/blog?kind=newsletter` with an empty snapshot, which is exactly the link `/newsletter` points at since Task 11, and which otherwise showed a blank area under the filter. Groups mode is untouched: each home panel renders its own empty note. Three follow-ups from the re-review: the notes sit in a `<div aria-live="polite">` that holds nothing else, so emptying a filter is announced while switching between filters that have cards is not (the card list outside it would otherwise announce all 19 cards); the wording is one exported constant, `EMPTY_MESSAGES` in `src/lib/empty-messages.mjs`, which both callers import, and `.empty-note` moved to `BaseLayout`'s global utilities beside `.visually-hidden`, so neither copy can drift; and `WritingFilter`'s `display: none !important` guard now also covers `[data-empty][hidden]`, so a later `display` on `.empty-note` cannot show every note at once. `empty-messages.mjs` is its own module rather than part of `writing-items.mjs`, which maps and orders real items and is unit tested on that: this is display copy, and its keys are the filter's values, where `all` is not a `WritingKind`. Verified with CDP on the posts-with-no-issues fixture: the live region is in the accessibility tree (`generic`, not ignored, `live: polite`), its subtree is empty under All and Blog, and under Newsletter it holds exactly `paragraph` > `StaticText "No newsletter issues yet."`; the card list is not inside any live region. Verified with two fixture builds in `$TMPDIR` (a vault with no posts and an empty snapshot; a vault with two posts and an empty snapshot) and with the real build, in all three filter states, deep-linked and clicked, and with JavaScript disabled: a note appears only where a state has no cards, never when cards exist, the no-JS page shows every card and no note, and `.empty-note`'s computed style matches the home page's (20px 0 padding, muted, 0.9rem, italic).

- **`Tag` defaults to the larger size, and its tags wrap** (code review, 2026-09-19). Two of the three callers wanted 0.75rem / 0.45rem and wrapping, and each repeated the override, so those are now `Tag`'s defaults and `HomeWritingGroup` sets the compact 0.7rem / 0.4rem once on its `[data-group]` root, from where the custom properties reach every tag in the panel. `white-space: nowrap` left `Tag`: the home rows inherit it from their `.marks` group, and `.featured-tags :global(.tag)` sets it itself, which is what its ellipsis needs. `PostCard` and the post page dropped both custom properties and their `:global(.tag) { white-space: normal }` rules. Verified against a build of the commit before the change: 150 tags, across the home page's three filter panels, `/blog` and two post pages, at 1280px, 390px and 320px, keep identical rects and identical computed font, padding, colour and border, and `.post-list`, `.post-header` and `.recent-posts` are pixel-identical (0 differing pixels) at those widths in both themes. The re-review then made that explicit instead of implicit: `.tag.kind` sets `white-space: nowrap` itself, because kind labels are a fixed vocabulary written in code, so one broken over two lines would be a bug, while a long topic tag wrapping is intended. Verified at 1280px, 390px and 320px: every kind tag on `/blog` and the home page computes `nowrap` and occupies one line; the featured card still cuts a 51-character tag with an ellipsis (335px wide at 390px, 265px at 320px, `overflow: hidden`, `text-overflow: ellipsis`); and the same tag on the post page still breaks at its hyphens into two line boxes, unclipped, with no page overflow.

## Files touched

| File | Type | Change |
|---|---|---|
| `scripts/fetch-newsletters.mjs` | create | beehiiv fetch + pure `toEntries` transform |
| `tests/fetch-newsletters.test.mjs` | create | unit tests for `toEntries` |
| `tests/select-home-groups.test.mjs` | create | unit tests for `selectHomeGroups` |
| `package.json` | modify | `sync:newsletters`, `test` and `check` scripts; `js-yaml` dependency and type-check dev dependencies (Task 6b) |
| `src/data/newsletters.json` | create | committed snapshot (backfill, user-run) |
| `.github/workflows/sync-newsletters.yml` | create | Wednesday sync job |
| `src/content.config.ts` | modify | add `newsletters` collection |
| `src/lib/select-home-groups.mjs` | create | pure home group selection (option A2) |
| `src/lib/writing.ts` | create | `WritingItem`, `getWriting`, `getHomeGroups` (collection I/O only after Task 6b) |
| `src/lib/empty-messages.mjs` | create | `EMPTY_MESSAGES`, the one copy of the empty-state wording (Task 10, re-review) |
| `src/lib/dates.mjs` | create | calendar-day helpers: `toCalendarDay`, `formatDay`, `isoDay` (Task 6b) |
| `src/lib/writing-items.mjs` | create | pure `WritingItem` mapping and `compareWriting` (Task 6b) |
| `src/lib/publishable.mjs` | create | pure `partitionPublishable` (Task 6b) |
| `src/lib/posts.ts` | create | `getPublishedPosts` with one warning per skipped post (Task 6b) |
| `tests/dates.test.mjs`, `tests/writing-items.test.mjs`, `tests/publishable.test.mjs` | create | unit tests for the three pure modules (Task 6b) |
| `src/pages/rss.xml.ts`, `src/pages/blog/[...slug].astro` | modify | read from `getPublishedPosts`; post page formats its date in UTC (Task 6b) |
| `src/pages/about.astro`, `uses.astro`, `now.astro`, `colophon.astro` | modify | `formatDay`/`isoDay` for "Last Updated" (Task 6b) |
| `src/plugins/build-blog-slug-map.mjs`, `tests/build-blog-slug-map.test.mjs` | modify | also require a parseable `date`; skip excluded vault directories (Task 6b) |
| `src/lib/frontmatter.mjs`, `tests/frontmatter.test.mjs` | create | `readFrontmatter`; `emptyAsMissing`, `toOptionalDate`, `toTagList` schema preprocessors (Task 6b) |
| `src/lib/post-schema.mjs`, `tests/post-schema.test.mjs` | create | the posts schema and `postId` (`generateId`) (Task 6b) |
| `tests/linkable-agreement.test.mjs` | create | collection, slug map and copy-media agree on which notes get a page (Task 6b) |
| `src/lib/vault-rules.mjs`, `tests/vault-rules.test.mjs` | create | `VAULT_EXCLUDED_DIRS`, `excludedDirGlobs` (Task 6b) |
| `src/lib/walk-dir.mjs`, `tests/walk-dir.test.mjs` | modify | `skipDirNames` option (Task 6b) |
| `scripts/copy-media.mjs`, `tests/copy-media.test.mjs` | modify | exported `findPostsWithPages` (`isLinkablePost`), excluded directories (Task 6b) |
| `.gitignore`, `.dockerignore` | modify | ignore `.pnpm-store/` (Task 6b) |
| `Dockerfile` | modify | `RUN pnpm run check` after `RUN pnpm test` (Task 10) |
| `src/components/WritingFilter.astro` | create | segmented control + inline script; `<noscript>` inside the control, rows mode shows the per-filter empty note (Task 10) |
| `src/components/HomeWritingGroup.astro` | create | featured card + compact rows for one group |
| `src/components/Tag.astro` | create | shared tag: `topic` (filled) and `kind` (outlined) variants, sized by `--tag-font-size` / `--tag-pad-x`, defaulting to the larger pair (Task 8, code review) |
| `src/components/ExternalMark.astro` | create | `↗` plus visually hidden new-tab text, gap in `--ext-gap` (Task 8) |
| `src/layouts/BaseLayout.astro` | modify | `--font-mono` token, global `.visually-hidden` and `.empty-note` utilities (Task 8, Task 10) |
| `src/pages/blog/[...slug].astro` | modify | topic tags use `Tag` (Task 8); date and tags separated by spacing, no separator (Task 10) |
| `src/pages/index.astro` | modify | header with filter, three groups |
| `src/components/PostCard.astro` | modify | `href`/`external`/`kind` props replace `slug`; focus ring clear of the title |
| `src/pages/blog/index.astro` | modify | filter in header, full merged list, empty note per filter |
| `src/pages/newsletter.astro` | modify | "read past issues" → `/blog?kind=newsletter` |
| `CLAUDE.md` | modify | "Newsletter sync" subsection |

## Notes for the implementer

- **Local build needs the vault.** `pnpm run build` reads `VAULT_PATH` from `.env` (via `--env-file-if-exists` in the `prebuild` script). If `.env` is missing, run `VAULT_PATH=~/Obsidian/ryan-lynch-brain pnpm run build`.
- **Agents cannot read `.env` files.** The sandbox denies `**/.env`. Task 2 (backfill) needs `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID`, which live in `~/Projects/your-turn-robot/.env`. The user runs that task. Do not hand-write `src/data/newsletters.json`; post ids must come from the API.
- **Everything from Task 4 onward needs `src/data/newsletters.json` to exist**, because the `file()` loader errors on a missing file. Do Tasks 1 to 3 first, then stop and ask the user to run Task 2 if they have not.
- **Local Node is v25; Docker and CI use Node 20.** Write the scripts for Node 20: global `fetch` is available, `node --test` is available, TypeScript is not.
- **Commit per task.** Never push. Never commit `.env`.
- **Astro `hidden` attribute:** passing `hidden={false}` omits the attribute, `hidden={true}` renders `hidden`. That is what the group panels rely on for a no-flash initial render.
- **Dates:** never call `toLocaleDateString` or `toISOString` on a displayed date. Use `formatDay` and `isoDay` from `src/lib/dates.mjs`, which format in UTC so the build timezone cannot shift the day. `WritingItem.date` is already a calendar day.
- **Published posts:** read them with `getPublishedPosts()` from `src/lib/posts.ts`, never `getCollection("posts", ...)`, so posts missing a date or slug are skipped the same way everywhere.
- **Type check:** `pnpm run check` runs `astro check`. It needs no vault (with none, it only warns that the base directories do not exist).
- **Vault exclusions:** `src/lib/vault-rules.mjs` is the one list of vault directories that never hold posts. Pass `VAULT_EXCLUDED_DIRS` as `skipDirNames` to any new `walkDir` over notes.
- **Frontmatter outside Astro:** parse it with `readFrontmatter` (`src/lib/frontmatter.mjs`) and decide whether a note gets a page with `isLinkablePost` (`src/lib/publishable.mjs`). Never parse frontmatter with a regex.

---

## Task 1: Fetch script with a tested pure transform

**Files:**
- Create: `scripts/fetch-newsletters.mjs`
- Create: `tests/fetch-newsletters.test.mjs`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Add the npm scripts**

In `package.json`, replace the `"scripts"` block with:

```json
  "scripts": {
    "start": "astro dev",
    "predev": "node --env-file-if-exists=.env scripts/copy-media.mjs",
    "dev": "astro dev",
    "prebuild": "node --env-file-if-exists=.env scripts/copy-media.mjs",
    "build": "astro build",
    "preview": "astro preview",
    "sync:newsletters": "node scripts/fetch-newsletters.mjs",
    "test": "node --test tests/*.test.mjs"
  },
```

Note `sync:newsletters` deliberately has no `--env-file`. The spec says the two beehiiv variables are exported in the shell locally and are never read from the site repo's `.env`.

- [ ] **Step 2: Write the failing tests for `toEntries`**

Create `tests/fetch-newsletters.test.mjs`:

```js
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
    description: "the preview",
    date: "2026-09-15T00:00:00.000Z",
    url: "https://yourturnrobot.beehiiv.com/p/issue-1",
    slug: "issue-1",
  });
});

test("description falls back from preview_text to subtitle to empty string", () => {
  const [a] = toEntries([post({ preview_text: "" })], NOW);
  assert.equal(a.description, "the subtitle");
  const [b] = toEntries([post({ preview_text: null, subtitle: null })], NOW);
  assert.equal(b.description, "");
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test`
Expected: fails with `Cannot find module '.../scripts/fetch-newsletters.mjs'`.

- [ ] **Step 4: Write the fetch script**

Create `scripts/fetch-newsletters.mjs`:

```js
// Pull sent issues from the beehiiv API and write src/data/newsletters.json.
//
// Run as `pnpm run sync:newsletters` with BEEHIIV_API_KEY and
// BEEHIIV_PUBLICATION_ID exported in the shell (or as GitHub secrets in CI).
// The site build never runs this; it reads the committed JSON snapshot.

import { realpathSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.beehiiv.com/v2";
const OUTPUT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/data/newsletters.json");

// Fields the site's zod schema requires on every entry.
const REQUIRED_FIELDS = ["id", "title", "web_url", "slug"];

/**
 * beehiiv documents publish_date as a Unix timestamp in seconds; accept an
 * ISO string too. Returns milliseconds, or null when unparseable.
 * @param {unknown} value
 * @returns {number | null}
 */
function toMillis(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value * 1000;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/**
 * Pure transform from raw beehiiv posts to site entries. No network, no I/O.
 * Throws if a post that survives the platform/hidden/date filters is missing
 * a required field, so a bad snapshot is never written.
 * @param {Array<Record<string, any>>} posts raw objects from the posts endpoint
 * @param {Date} now cutoff; posts published after this are excluded
 * @returns {Array<{ id: string; title: string; description: string; date: string; url: string; slug: string }>}
 */
export function toEntries(posts, now) {
  const cutoff = now.getTime();
  return posts
    .filter((p) => (p.platform === "web" || p.platform === "both") && p.hidden_from_feed === false)
    .map((p) => ({ post: p, ms: toMillis(p.publish_date) }))
    .filter(({ ms }) => ms !== null && ms <= cutoff)
    .map(({ post, ms }) => {
      for (const field of REQUIRED_FIELDS) {
        if (typeof post[field] !== "string" || post[field] === "") {
          throw new Error(`beehiiv post ${post.id ?? "(no id)"} is missing required field ${field}`);
        }
      }
      return {
        id: post.id,
        title: post.title,
        description: post.preview_text || post.subtitle || "",
        date: new Date(ms).toISOString(),
        url: post.web_url,
        slug: post.slug,
      };
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
    });
}

/**
 * @param {string} name
 * @returns {string}
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

/**
 * Pages through every confirmed post. Any non-2xx, network error, or
 * unparseable body throws; the caller writes nothing on error.
 * @param {string} apiKey
 * @param {string} publicationId
 * @param {typeof fetch} [fetchImpl] injectable for tests; defaults to global fetch
 */
export async function fetchAllPosts(apiKey, publicationId, fetchImpl = globalThis.fetch) {
  const all = [];
  let page = 1;
  let totalPages = 1;
  do {
    const url = new URL(`${API_BASE}/publications/${publicationId}/posts`);
    url.searchParams.set("status", "confirmed");
    url.searchParams.set("limit", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("order_by", "publish_date");
    url.searchParams.set("direction", "desc");

    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`beehiiv responded ${res.status} for page ${page}`);

    let body;
    try {
      body = await res.json();
    } catch {
      throw new Error(`beehiiv returned an unparseable body for page ${page}`);
    }
    if (!Array.isArray(body?.data)) throw new Error(`beehiiv response for page ${page} has no data array`);

    all.push(...body.data);
    totalPages = Number(body.total_pages) || 1;
    page += 1;
  } while (page <= totalPages);
  return all;
}

async function main() {
  const apiKey = requireEnv("BEEHIIV_API_KEY");
  const publicationId = requireEnv("BEEHIIV_PUBLICATION_ID");

  const posts = await fetchAllPosts(apiKey, publicationId);
  const entries = toEntries(posts, new Date());
  if (entries.length === 0) {
    console.error("beehiiv returned no publishable posts; refusing to write an empty list");
    process.exit(1);
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const tmpPath = `${OUTPUT_PATH}.tmp`;
  await writeFile(tmpPath, JSON.stringify(entries, null, 2) + "\n");
  await rename(tmpPath, OUTPUT_PATH);
  console.log(`Wrote ${entries.length} newsletter entries to ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

/**
 * True when this file was executed directly (not imported), following
 * symlinks on both sides so `pnpm run sync:newsletters` still resolves
 * correctly if argv[1] is a symlink into node_modules/.bin or similar.
 * @returns {boolean}
 */
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    // realpath both sides: import.meta.url is already resolved, argv[1] may be a symlink.
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

// Only run main when executed directly, so tests can import toEntries and fetchAllPosts.
if (isMainModule()) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    if (err instanceof Error && err.cause?.message) {
      console.error(err.cause.message);
    }
    process.exit(1);
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: `# pass 15`, `# fail 0` at this point (the suite totals 100 after Task 6b).

- [ ] **Step 6: Verify the missing-env error path**

Run: `env -u BEEHIIV_API_KEY -u BEEHIIV_PUBLICATION_ID pnpm run sync:newsletters; echo "exit=$?"`
Expected: prints `Missing required environment variable BEEHIIV_API_KEY` and `exit=1`. `src/data/` must not exist afterwards (`ls src/data` errors).

- [ ] **Step 7: Commit**

```bash
git add package.json scripts/fetch-newsletters.mjs tests/fetch-newsletters.test.mjs
git commit -m "Add beehiiv newsletter fetch script with tested transform"
```

---

## Task 2: Initial backfill of the snapshot (user runs this)

**Files:**
- Create: `src/data/newsletters.json`

This task needs the beehiiv key, which agents cannot read. Ask the user to run it, then verify the result.

- [ ] **Step 1: User exports the two variables and runs the sync**

The user runs, in their own shell, with the values from `~/Projects/your-turn-robot/.env`:

```bash
cd ~/Projects/ryan-lynch-site
export BEEHIIV_API_KEY=...
export BEEHIIV_PUBLICATION_ID=pub_...
pnpm run sync:newsletters
```

Expected: `Wrote 6 newsletter entries to src/data/newsletters.json` (six issues had been sent as of 2026-09-19; more if later issues have gone out).

- [ ] **Step 2: Verify the snapshot shape**

Run: `node -e 'const d=JSON.parse(require("fs").readFileSync("src/data/newsletters.json","utf8")); console.log(d.length, Object.keys(d[0]).join(","), d[0].date, d[0].url)'`
Expected: a count of at least 6, keys exactly `id,title,description,date,url,slug`, an ISO date, and a `https://yourturnrobot.beehiiv.com/p/...` URL. Also confirm the file ends with a newline: `tail -c1 src/data/newsletters.json | xxd | grep 0a`.

- [ ] **Step 3: Verify idempotence**

Run the sync a second time (user), then `git status --short src/data/`.
Expected: the file is still listed as untracked (first run) but re-running produced byte-identical output. Check with `git add -N src/data/newsletters.json && git diff --quiet src/data/newsletters.json && echo unchanged`.

- [ ] **Step 4: Commit**

```bash
git add src/data/newsletters.json
git commit -m "Add initial beehiiv newsletter snapshot"
```

---

## Task 3: Weekly sync workflow

**Files:**
- Create: `.github/workflows/sync-newsletters.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/sync-newsletters.yml`:

```yaml
name: Sync newsletters

on:
  schedule:
    # Wednesday 13:00 UTC, the morning after a Tuesday send.
    - cron: "0 13 * * 3"
  workflow_dispatch:

permissions:
  contents: write
  actions: write

concurrency:
  group: sync-newsletters
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Set up pnpm
        uses: pnpm/action-setup@v4

      - name: Set up Node 20
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Fetch sent issues from beehiiv
        env:
          BEEHIIV_API_KEY: ${{ secrets.BEEHIIV_API_KEY }}
          BEEHIIV_PUBLICATION_ID: ${{ secrets.BEEHIIV_PUBLICATION_ID }}
        run: pnpm run sync:newsletters

      - name: Detect changes
        id: diff
        run: |
          if [ -n "$(git status --porcelain -- src/data/newsletters.json)" ]; then
            git status --short -- src/data/newsletters.json
            git diff --stat -- src/data/newsletters.json
            echo "changed=true" >> "$GITHUB_OUTPUT"
          else
            echo "no change"
            echo "changed=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Commit and push snapshot
        if: steps.diff.outputs.changed == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add src/data/newsletters.json
          git commit -m "Sync newsletters from beehiiv"
          git log -1 --oneline
          git push origin HEAD:main

      # A push made with GITHUB_TOKEN does not trigger `on: push` workflows.
      # workflow_dispatch via GITHUB_TOKEN is the documented exception and
      # needs `actions: write`.
      - name: Trigger site build
        if: steps.diff.outputs.changed == 'true'
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh workflow run deploy.yml --ref main
```

Why the explicit dispatch: a push made with `GITHUB_TOKEN` does not trigger `on: push` workflows. `workflow_dispatch` via `GITHUB_TOKEN` is the documented exception, and it needs `actions: write`.

`pnpm/action-setup@v4` reads the version from the `packageManager` field in `package.json`. No `pnpm install` step: the script has no dependencies and `pnpm run` works without `node_modules`.

- [ ] **Step 2: Validate the YAML parses**

Run: `node -e 'const y=require("fs").readFileSync(".github/workflows/sync-newsletters.yml","utf8"); console.log(y.split("\n").length, "lines")'` and visually check indentation against the block above. If `actionlint` is installed (`which actionlint`), run `actionlint .github/workflows/sync-newsletters.yml` and expect no output.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/sync-newsletters.yml
git commit -m "Add weekly beehiiv newsletter sync workflow"
```

The workflow is exercised end-to-end in Task 11 after the user adds the two secrets.

---

## Task 4: `newsletters` content collection

**Files:**
- Modify: `src/content.config.ts`

Requires `src/data/newsletters.json` from Task 2.

- [ ] **Step 1: Add the collection**

Replace the whole of `src/content.config.ts` with:

```ts
import { defineCollection, z } from "astro:content";
import { glob, file } from "astro/loaders";
import path from "node:path";
import { emptyAsMissing, toOptionalDate } from "./lib/frontmatter.mjs";
import { postId, postSchema } from "./lib/post-schema.mjs";
import { excludedDirGlobs } from "./lib/vault-rules.mjs";

const VAULT = process.env.VAULT_PATH || path.resolve("../MyHub");

// The posts schema and id live in src/lib/post-schema.mjs so unit tests can
// run real frontmatter through them. An empty or unparseable date, or an
// empty property, never fails the build (src/lib/frontmatter.mjs).
const posts = defineCollection({
  loader: glob({
    // Excluded directories (templates, _website pages, system prompts) are
    // listed once in src/lib/vault-rules.mjs, shared with the slug map and
    // copy-media.
    pattern: ["**/*.md", ...excludedDirGlobs()],
    base: VAULT,
    // A post that gets a page is keyed by its slug, every other note by its
    // vault-relative path.
    generateId: postId,
  }),
  schema: postSchema,
});

const pages = defineCollection({
  loader: glob({
    pattern: "*.md",
    base: path.join(VAULT, "_website"),
  }),
  schema: z.object({
    // title and slug stay required: these are the site's own pages.
    title: z.string(),
    description: z.preprocess(emptyAsMissing, z.string().optional()),
    slug: z.string(),
    lastUpdated: z.preprocess(toOptionalDate, z.coerce.date().optional()),
  }),
});

// Snapshot of sent issues, written by scripts/fetch-newsletters.mjs and
// refreshed weekly by .github/workflows/sync-newsletters.yml.
const newsletters = defineCollection({
  loader: file("src/data/newsletters.json"),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().default(""),
    date: z.coerce.date(),
    // A CI job writes this file; only ever link out to https.
    url: z.string().url().startsWith("https://"),
    slug: z.string(),
  }),
});

export const collections = { posts, pages, newsletters };
```

The `file()` loader uses each array item's `id` as the entry id and stores the whole item as `data` (`node_modules/astro/dist/content/loaders/file.js:49-61`), so `id` in the schema is valid.

This block is the file as it stands after Task 6b. The Task 4 commit (`694d4fe`) added only the `newsletters` collection; Task 6b moved the posts schema and its `generateId` (`postId`) to `src/lib/post-schema.mjs`, added the `frontmatter.mjs` preprocessors to the pages schema, the shared `vault-rules.mjs` exclusions and the `https://` rule on `url`.

- [ ] **Step 2: Build to verify the collection loads**

Run: `pnpm run build`
Expected: build succeeds. Look for a line like `[content] Synced content` with no `newsletters` error. Then run:

`ls .astro/collections/ 2>/dev/null; grep -c '"newsletters"' .astro/data-store.json`

Expected: a count of at least 1.

- [ ] **Step 3: Commit**

```bash
git add src/content.config.ts
git commit -m "Add newsletters content collection over the beehiiv snapshot"
```

---

## Task 5: Home group selection (pure, tested)

**Files:**
- Create: `src/lib/select-home-groups.mjs`
- Create: `tests/select-home-groups.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/select-home-groups.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: the 15 fetch tests pass; the new file fails with `Cannot find module '.../src/lib/select-home-groups.mjs'`.

- [ ] **Step 3: Write the selection module**

Create `src/lib/select-home-groups.mjs`:

```js
// Home page "Recent Writing" group selection: option A2 in docs/superpowers/specs/2026-09-19-newsletter-writing-filter-design.md.
// Pure over an already-sorted array so it is testable without Astro.

const HOME_LIMIT = 5;

/**
 * @template {{ kind: "blog" | "newsletter" }} T
 * @param {T[]} items writing items sorted newest first
 * @returns {{ all: T[]; blog: T[]; newsletter: T[] }}
 */
export function selectHomeGroups(items) {
  const blog = items.filter((item) => item.kind === "blog").slice(0, HOME_LIMIT);
  const newsletter = items.filter((item) => item.kind === "newsletter").slice(0, HOME_LIMIT);

  // "All": the featured slot is always the newest blog item so long-form
  // posts stay on the home page under a weekly newsletter cadence. The rows
  // are the newest of any kind, excluding the featured item.
  const featuredIndex = items.findIndex((item) => item.kind === "blog");
  const all =
    featuredIndex === -1
      ? items.slice(0, HOME_LIMIT)
      : [items[featuredIndex], ...items.filter((_, i) => i !== featuredIndex).slice(0, HOME_LIMIT - 1)];

  return { all, blog, newsletter };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: `# pass 32`, `# fail 0` at this point (the suite totals 100 after Task 6b).

- [ ] **Step 5: Commit**

```bash
git add src/lib/select-home-groups.mjs tests/select-home-groups.test.mjs
git commit -m "Add pure home writing group selection with tests"
```

---

## Task 6: `writing.ts` helper

**Files:**
- Create: `src/lib/writing.ts`

- [ ] **Step 1: Write the helper**

Create `src/lib/writing.ts`:

```ts
// Collection I/O for the merged writing list. Mapping and ordering live in
// writing-items.mjs and home group selection in select-home-groups.mjs, both
// pure and unit tested.

import { getCollection } from "astro:content";
import { getPublishedPosts } from "./posts";
import { selectHomeGroups } from "./select-home-groups.mjs";
import { toWritingItems, type WritingItem } from "./writing-items.mjs";

export type { WritingItem, WritingKind } from "./writing-items.mjs";

export interface HomeGroups {
  all: WritingItem[];
  blog: WritingItem[];
  newsletter: WritingItem[];
}

/** Published blog posts and sent newsletter issues as one sorted list. */
export async function getWriting(): Promise<WritingItem[]> {
  const posts = await getPublishedPosts();
  const issues = await getCollection("newsletters");
  return toWritingItems(
    posts.map((post) => post.data),
    issues.map((issue) => issue.data)
  );
}

/** The three pre-rendered groups for the home page (spec option A2). */
export async function getHomeGroups(): Promise<HomeGroups> {
  return selectHomeGroups(await getWriting());
}
```

This block is the file as it stands after Task 6b. The Task 6 commit (`53e4487`) mapped and sorted inline, read posts with `getCollection("posts", ({ data }) => data.published)`, and fell back to `new Date(0)` with a warning for a post with no date. Task 6b moved mapping and ordering into `src/lib/writing-items.mjs` and reads posts through `getPublishedPosts()`, which guarantees a date and slug, so the fallback is gone.

- [ ] **Step 2: Build to verify it compiles**

The helper has no consumer yet, so add a temporary smoke check: run

`pnpm run build`

Expected: succeeds (the file is not imported yet, so this only proves nothing else broke). The real check is Task 8's build.

- [ ] **Step 3: Commit**

```bash
git add src/lib/writing.ts
git commit -m "Add writing helper merging posts and newsletters"
```

---

## Task 6b: Code review fixes for the data layer (done)

Recorded here so later tasks build on it. The why is under "Deviations from the spec" above.

- `c840179` Add astro check and Node types; fix type errors. `pnpm run check` script; `@astrojs/check`, `typescript@^5`, `@types/node@^20`. Typed the post page's lightbox `querySelectorAll`, removed unused plugin parameters.
- `aa10979` Add calendar-day date helpers with timezone-proof formatting. `src/lib/dates.mjs`, `tests/dates.test.mjs` (DST boundaries in New York, `formatDay` under `TZ=America/Los_Angeles`, later also `TZ=Pacific/Honolulu`).
- `ee66393` Skip published posts missing a date or slug, with one warning each. `src/lib/publishable.mjs`, `src/lib/posts.ts`, `tests/publishable.test.mjs`; `rss.xml.ts`, `blog/[...slug].astro` and `writing.ts` read `getPublishedPosts()`; `null` `date`/`slug` treated as missing; slug map requires a `date`.
- `0ee4110` Move writing item mapping and ordering into a tested pure module. `src/lib/writing-items.mjs`, `tests/writing-items.test.mjs`; `writing.ts` slimmed to I/O.
- `d1513df` Format page and post dates in UTC so the build timezone cannot shift them. `/about`, `/uses`, `/now`, `/colophon`.
- `6743100` Exclude vault templates from posts and require https newsletter URLs.
- `241d78d` Record date semantics and post-skipping rules in the plan and spec.

Second review round:

- `53d27e8` Treat unparseable frontmatter dates as missing instead of failing the build. `src/lib/frontmatter.mjs` (`emptyAsMissing`, `toOptionalDate`), `tests/frontmatter.test.mjs`; `date` and `lastUpdated` use `toOptionalDate`; the slug map applies the same date rule.
- `1b273a3` Key posts by slug only when published, by vault path otherwise (custom `generateId`).
- `faebe48` Share one vault exclusion list across the posts glob, slug map and copy-media. `src/lib/vault-rules.mjs`, `walkDir` `skipDirNames`, copy-media's `findPublishedNotes` with an anchored `published: true`; tests for each.
- `7a86f51` Keep early and BCE years in `toCalendarDay` and prove the TZ switch in tests (asserts `resolvedOptions().timeZone`; Los Angeles and Honolulu).
- `b76c58f` Name the file in skip warnings, ignore the pnpm store, and tidy types. `writing.ts` no longer re-exports `compareWriting`.
- `0a912a4` Show the skipped note's absolute path in the `[posts]` warning.
- `e049dc5` Document the skip rule, date format, conventions and Docker type check.

Third review round:

- `2bc14dd` Let empty frontmatter properties fall back to their defaults. `title`, `description`, `tags`, `published` (posts) and `description` (pages) go through `emptyAsMissing`; `tags` through `toTagList`, which also wraps a single string. No catch-all: wrongly typed values still fail.
- `52f117b` Parse frontmatter with js-yaml everywhere and share one linkable-post rule. `readFrontmatter`, `isLinkablePost`/`missingForPage`, `src/lib/post-schema.mjs`, both regex parsers deleted, `tests/linkable-agreement.test.mjs`.
- `a1c673d` Test vault exclusions by behaviour, not by restating the list.
- `8dcd04d` Narrow the metadata claim, document the shared parser, add Docker checks.

Final polish (approved review): "Copy images only for posts that get a page; tighten CLAUDE.md wording". copy-media's `findPostsWithPages` (renamed from `findPublishedNotes`) uses `isLinkablePost`, so a skipped post's images are no longer copied to `public/media` and deployed; its log line is now "Found N posts with pages". The agreement test asserts copy-media copies exactly the posts that get a page.

Verification:

- `pnpm test`: `# pass 100`, `# fail 0`.
- `pnpm run check`: 1 error, in `src/pages/blog/index.astro` (Task 10 removes it). The same with no vault present.
- Real vault, forced content sync: 21 pages, 14 posts, 14 RSS items, 59 images, no `Duplicate id` warnings. The slug map (14 entries) and copy-media's published notes (14) are identical before and after the switch to js-yaml, and `public/media` is identical before and after copy-media switched to `isLinkablePost` (no real post is skipped).
- A second fixture vault builds and: a draft whose `title:`, `tags:` and `published:` are all empty logs nothing; `tags: ai` renders the tag "ai"; `published: true # ready`, `published: True` and `date: 2026-04-04 # moved` get pages and wiki links to `/blog/...`; `date: 2026` is skipped with a `[posts]` warning and its wiki link goes to brain.ryanlynch.me, not a dead `/blog` page. `published: "yes"` and invalid YAML fail the build naming the file.
- A vault copy with `date:` removed from one published post builds with exactly one `[posts] skipping` line for it, no `dist/blog/smart-garage-shelly-1/`, and 13 RSS items. The same holds for an empty `date:` line, and an empty `slug:` plus empty `date:` logs `missing date and slug`.
- A fixture vault builds and: a draft with `date: TBD` logs nothing; a published post with `date: TBD` logs `[posts] skipping published post "Published TBD" (/tmp/.../Posts/Published TBD.md): missing date`; a published `_Templates/Tmpl.md` with a slug and date is not a post, and `[[Tmpl]]` links to `brain.ryanlynch.me`, not `/blog/tmpl`; an `unpublished: true` note is not published to copy-media and its image is not copied; an empty `lastUpdated:` renders no "Last Updated" line and no 1970; a draft reusing a published post's slug does not replace it; `B+ Tree Index.md` and `B-Tree Index.md` do not collide.
- Builds with the local timezone and with `TZ=UTC` give identical HTML for the four pages and a post page.

Until Tasks 8 and 10 land, `/` and `/blog` still read `getCollection` directly and can list a skipped post with a dead link (`/blog` did, in the vault-copy build above). Their rewrites read `getHomeGroups()` and `getWriting()`, which skip it.

---

## Task 7: `WritingFilter` component

**Files:**
- Create: `src/components/WritingFilter.astro`

- [ ] **Step 1: Write the component**

Create `src/components/WritingFilter.astro`:

```astro
---
// WritingFilter: All / Blog / Newsletter segmented control.
//
// mode "groups": the target container holds [data-group="all|blog|newsletter"]
//   panels; the active filter shows one and hides the others.
// mode "rows": the target container holds [data-kind="blog|newsletter"] items;
//   "All" shows everything, a kind hides non-matching items. If that leaves
//   nothing visible, the container's [data-empty="<filter>"] note is shown,
//   since the server rendered a list that is not empty. Groups mode needs no
//   such thing: each panel renders its own empty note.
//
// An optional element with data-filter-link="<target>" gets its href set to
// /blog, /blog?kind=blog or /blog?kind=newsletter to match the active filter.
//
// On load, the ?kind=blog or ?kind=newsletter query parameter preselects
// that filter. A query parameter, not a hash, because the footer's
// #newsletter anchor is the site's subscribe link.
// Nothing is persisted and clicking does not touch history.
//
// Without JavaScript the control is hidden by a <noscript> style. The
// <noscript> sits inside the control, not after it: with scripting off it
// renders as a box, and as a sibling it became an empty flex item in the
// caller's layout (on /blog, a 16px gap and, on a phone, an empty row).

interface Props {
  mode: "groups" | "rows";
  target: string;
}

const { mode, target } = Astro.props;

const options = [
  { value: "all", label: "All" },
  { value: "blog", label: "Blog" },
  { value: "newsletter", label: "Newsletter" },
] as const;
---

<div
  class="writing-filter"
  role="group"
  aria-label="Filter writing by kind"
  data-mode={mode}
  data-target={target}
>
  {options.map((option) => (
    <button
      type="button"
      data-filter={option.value}
      aria-pressed={option.value === "all" ? "true" : "false"}
    >
      {option.label}
    </button>
  ))}
  <noscript><style is:inline>.writing-filter{display:none !important}</style></noscript>
</div>

<style>
  .writing-filter {
    display: inline-flex;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    padding: 2px;
    background: var(--color-surface);
  }

  .writing-filter button {
    font: inherit;
    line-height: 1.7;
    font-size: 0.78rem;
    font-weight: 500;
    padding: 0.2rem 0.7rem;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--color-muted);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .writing-filter button:hover {
    color: var(--color-text);
  }

  .writing-filter button[aria-pressed="true"] {
    background: var(--color-text);
    color: var(--color-bg);
  }

  .writing-filter button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
    position: relative;
    z-index: 1;
  }

  @media (forced-colors: active) {
    .writing-filter button[aria-pressed="true"] {
      forced-color-adjust: none;
      background: Highlight;
      color: HighlightText;
    }

    .writing-filter button[aria-pressed="true"]:focus-visible {
      outline-color: CanvasText;
    }
  }

  /* Everything this control hides carries [hidden], so nothing here may be
     revived by a display rule elsewhere: the rows, the group panels and the
     per-filter empty notes. */
  :global([data-kind][hidden], [data-group][hidden], [data-empty][hidden]) {
    display: none !important;
  }
</style>

<script is:inline>
  (function () {
    function init(control) {
      control.setAttribute("data-ready", "");

      var mode = control.getAttribute("data-mode");
      var targetId = control.getAttribute("data-target");
      var container = document.getElementById(targetId);
      var link = document.querySelector('[data-filter-link="' + CSS.escape(targetId) + '"]');
      var buttons = control.querySelectorAll("button[data-filter]");

      function apply(filter) {
        buttons.forEach(function (button) {
          button.setAttribute(
            "aria-pressed",
            button.getAttribute("data-filter") === filter ? "true" : "false"
          );
        });

        if (container) {
          if (mode === "groups") {
            container.querySelectorAll("[data-group]").forEach(function (panel) {
              panel.hidden = panel.getAttribute("data-group") !== filter;
            });
          } else {
            var shown = 0;
            container.querySelectorAll("[data-kind]").forEach(function (item) {
              var hide = filter !== "all" && item.getAttribute("data-kind") !== filter;
              item.hidden = hide;
              if (!hide) shown += 1;
            });
            container.querySelectorAll("[data-empty]").forEach(function (note) {
              note.hidden = shown > 0 || note.getAttribute("data-empty") !== filter;
            });
          }
        }

        if (link) {
          link.setAttribute("href", filter === "all" ? "/blog" : "/blog?kind=" + filter);
        }
      }

      buttons.forEach(function (button) {
        button.addEventListener("click", function () {
          apply(button.getAttribute("data-filter"));
        });
      });

      var kind = new URLSearchParams(location.search).get("kind");
      apply(kind === "blog" || kind === "newsletter" ? kind : "all");
    }

    function initAll() {
      document.querySelectorAll(".writing-filter:not([data-ready])").forEach(init);
    }

    // The controlled container and the "All posts" link come after this
    // control in the DOM, so wait until the document is parsed.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initAll);
    } else {
      initAll();
    }
  })();
</script>
```

The init waits for DOMContentLoaded because the controlled container and the "All posts" link come after the control in the DOM, and an `is:inline` script runs where it is rendered.

- [ ] **Step 2: Commit**

```bash
git add src/components/WritingFilter.astro
git commit -m "Add WritingFilter segmented control"
```

The component is verified in the browser in Tasks 8 and 10.

---

## Task 8: Home page groups

**Files:**
- Create: `src/components/Tag.astro`, `src/components/ExternalMark.astro`
- Create: `src/components/HomeWritingGroup.astro`
- Modify: `src/layouts/BaseLayout.astro` (`--font-mono` token, `.visually-hidden` utility, `article code` font)
- Modify: `src/pages/blog/[...slug].astro` (topic tags use `Tag`)
- Modify: `src/pages/index.astro` (frontmatter lines 1-10, Recent Writing section lines 54-104, styles for `.section-header`, `.featured*`, `.tag`, `.post-list`, `.post-row`, `.post-title`)

- [ ] **Step 1: Write the shared building blocks**

The tag box, the external-link marker, the monospace stack and the visually hidden utility are shared, so a fix lands once: the home page groups, the post page and Task 9's `PostCard` all use them.

In `src/layouts/BaseLayout.astro`, add the token after `--max-width` in the `:root, [data-theme="light"]` block:

```css
    --font-mono: "SF Mono", "Fira Code", monospace;
```

set `article code` to `font-family: var(--font-mono);`, and add after the `/* ===== Images ===== */` rule:

```css
  /* ===== Utilities ===== */
  /* "Nothing here" copy, on the home page's groups and the /blog list. The
     wording lives in src/lib/empty-messages.mjs. */
  .empty-note {
    padding: 1.25rem 0;
    color: var(--color-muted);
    font-size: 0.9rem;
    font-style: italic;
  }

  /* Read by screen readers, not shown. */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
```

Create `src/components/Tag.astro`:

```astro
---
// Tag: a small monospace label. variant "topic" (filled) is a post's topic
// tag; variant "kind" (outlined) marks the kind of item, such as a newsletter
// issue.
//
// Size comes from two custom properties, set on any ancestor:
// --tag-font-size (default 0.75rem) and --tag-pad-x (default 0.45rem).
// Those defaults are the post page's and the blog list's size; the home
// page's compact rows and cards set the smaller pair once, on the group.
// Custom properties inherit across Astro's style scopes; a scoped rule in
// the caller would not reach this component's span.
//
// A topic tag wraps like any text, which on the post page and the blog list
// lets one wider than the column break at its hyphens. A caller that needs
// it on one line says so: the home rows' .marks group is nowrap, and the
// featured card sets nowrap to cut a too-wide tag with an ellipsis.
//
// A kind tag never wraps. Its labels are a fixed vocabulary written in code,
// so one broken across two lines would be a bug, not long content.
//
// The <style> block comes before the markup on purpose: Astro emits the
// whitespace between a component's markup and a following <style> as a
// space, which would land between a tag and a following ExternalMark.

interface Props {
  variant: "topic" | "kind";
}

const { variant } = Astro.props;
---

<style>
  /* inline-block so a tag inside a line of text keeps the same box as a tag
     in a flex container, and sits on the text's baseline. */
  .tag {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: var(--tag-font-size, 0.75rem);
    padding: 0.1rem var(--tag-pad-x, 0.45rem);
    border-radius: 3px;
    background: var(--color-tag-bg);
    color: var(--color-tag-text);
  }

  /* Outlined. The padding gives back the border's 1px so a kind tag is the
     same size as a topic tag. */
  .tag.kind {
    background: transparent;
    border: 1px solid var(--color-tag-text);
    white-space: nowrap;
    padding: calc(0.1rem - 1px) calc(var(--tag-pad-x, 0.45rem) - 1px);
  }
</style>

<span class:list={["tag", { kind: variant === "kind" }]}><slot /></span>
```

Create `src/components/ExternalMark.astro`:

```astro
---
// ExternalMark: the "↗" after the title of a link that opens in a new tab,
// plus visually hidden "(opens in a new tab)" text, because the arrow itself
// is aria-hidden.
//
// Call it directly after the title with no whitespace in between:
//
//   {title}<ExternalMark />
//
// A space before it would add to the margin, and the arrow could then wrap
// onto a line by itself.
//
// A caller that needs the two parts in different places renders them
// separately: only="mark" is just the arrow, only="hint" just the hidden
// text, and hintId gives the hidden text an id for aria-labelledby. The
// featured card on the home page keeps the hint out of its heading this way.
// only="hint" requires a hintId, and hintId is accepted only with it.
//
// The gap before the arrow is --ext-gap (default 0.3rem), set on any
// ancestor. Custom properties inherit across Astro's style scopes; a scoped
// rule in the caller would not reach this component's span.
//
// The <style> block comes before the markup on purpose: Astro emits the
// whitespace between a component's markup and a following <style> as a
// space after the component, which a caller's layout does not expect.

// A union, so astro check rejects a missing or misplaced hintId.
type Props = { only?: undefined } | { only: "mark" } | { only: "hint"; hintId: string };

const props = Astro.props;
const only = props.only;
const hintId = props.only === "hint" ? props.hintId : undefined;
---

<style>
  .ext {
    margin-left: var(--ext-gap, 0.3rem);
    font-size: 0.75em;
    color: var(--color-muted);
  }
</style>

{only !== "hint" && <span class="ext" aria-hidden="true">↗</span>}{only !== "mark" && <span id={hintId} class="visually-hidden"> (opens in a new tab)</span>}
```

`Props` is a union, so `astro check` rejects `only="hint"` without a `hintId`, and a `hintId` with `only="mark"` or with no `only`. It was tightened after Task 10; the `interface` it replaced (`only?: "mark" | "hint"; hintId?: string`) accepted all three. Verified 2026-09-19 with a throwaway page: those three misuses and `only="arrow"` fail with ts(2322), the three valid forms pass, and the built `/` and `/blog` are byte-identical to the build before the change.

In `src/pages/blog/[...slug].astro`, add `import Tag from "../../components/Tag.astro";`, render each topic tag as `<Tag variant="topic">{tag}</Tag>`, and replace the `.tags` and `.tag` rules with:

```css
  /* Tags keep Tag's default size here, and this page lists a post's tags in
     full, so one wider than the page breaks at its hyphens, which is Tag's
     default too. */
  .tags {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
```

(This block is the version after the code review inverted `Tag`'s defaults; at the time of Task 8 it also set `--tag-font-size: 0.75rem`, `--tag-pad-x: 0.45rem` and `.tags :global(.tag) { white-space: normal }`.)

- [ ] **Step 2: Write the group component**

Create `src/components/HomeWritingGroup.astro`:

```astro
---
// One pre-rendered "Recent Writing" panel: a featured card plus compact rows.
// The home page renders three of these (all / blog / newsletter) and
// WritingFilter toggles which one is visible.

import type { WritingItem } from "../lib/writing";
import { formatDay, isoDay } from "../lib/dates.mjs";
import ExternalMark from "./ExternalMark.astro";
import Tag from "./Tag.astro";
import { EMPTY_MESSAGES } from "../lib/empty-messages.mjs";

interface Props {
  group: "all" | "blog" | "newsletter";
  items: WritingItem[];
  hidden?: boolean;
}

const { group, items, hidden = false } = Astro.props;
const [featured, ...rows] = items;

const emptyMessage = EMPTY_MESSAGES[group];

const linkAttrs = (item: WritingItem) =>
  item.external ? { target: "_blank", rel: "noopener" } : {};

// A row title is inline text followed by one unbreakable group (kind tag,
// then ExternalMark). The row markup puts line breaks only inside {}
// expressions, because any whitespace between the title and the group, or
// inside the group, would add a space before the tag or the arrow.
const hasMarks = (item: WritingItem) => item.kind === "newsletter" || item.external;

// The featured link is named by its title and described by its date line and
// description, so screen readers do not read the whole card as its name. The
// same item can render in two panels, so the ids carry the group.
const featuredIds = {
  title: `${group}-featured-title`,
  meta: `${group}-featured-meta`,
  description: `${group}-featured-description`,
  newTab: `${group}-featured-new-tab`,
};
const featuredLabelledBy = featured?.external
  ? `${featuredIds.title} ${featuredIds.newTab}`
  : featuredIds.title;
const featuredDescribedBy = featured?.description
  ? `${featuredIds.meta} ${featuredIds.description}`
  : featuredIds.meta;
---

<div data-group={group} hidden={hidden}>
  {featured ? (
    <a
      href={featured.href}
      class="featured"
      aria-labelledby={featuredLabelledBy}
      aria-describedby={featuredDescribedBy}
      {...linkAttrs(featured)}
    >
      <div class="featured-meta" id={featuredIds.meta}>
        <time datetime={isoDay(featured.date)}>{formatDay(featured.date, "medium")}</time>
        {featured.kind === "newsletter" && <Tag variant="kind">newsletter</Tag>}
        {featured.tags.length > 0 && (
          <span class="featured-tags">
            {featured.tags.map((tag) => (
              <Tag variant="topic">{tag}</Tag>
            ))}
          </span>
        )}
      </div>
      <h3 id={featuredIds.title}>{featured.title}{featured.external && <ExternalMark only="mark" />}</h3>
      {featured.description && <p id={featuredIds.description}>{featured.description}</p>}
      {/* After the description, not in the heading: heading navigation reads
          just the title. aria-labelledby adds it to the link's name. */}
      {featured.external && <ExternalMark only="hint" hintId={featuredIds.newTab} />}
    </a>
  ) : (
    <p class="empty-note">{emptyMessage}</p>
  )}

  <div class="post-list">
    {rows.map((item) => (
      <a href={item.href} class="post-row" {...linkAttrs(item)}>
        <span class="post-title">
          {item.title}{hasMarks(item) && <span class="marks-gap">{" "}</span>}{hasMarks(item) && (
            <span class="marks">{item.kind === "newsletter" && (
              <Tag variant="kind">newsletter</Tag>
            )}{item.external && <ExternalMark />}</span>
          )}
        </span>
        <time datetime={isoDay(item.date)}>{formatDay(item.date, "short")}</time>
      </a>
    ))}
  </div>
</div>

<style>
  /* The home page's tags are a step smaller than Tag's defaults, which are
     the post page's and the blog list's size. Set once for the whole group:
     custom properties inherit across Astro's style scopes. */
  [data-group] {
    --tag-font-size: 0.7rem;
    --tag-pad-x: 0.4rem;
  }

  /* ===== Featured card ===== */
  .featured {
    display: block;
    text-decoration: none;
    color: inherit;
    padding: 1.25rem 0 1.25rem 1.25rem;
    border-left: 3px solid var(--color-accent-warm);
    margin: 1.25rem 0;
    transition: border-color 0.2s ease;
  }

  .featured:hover {
    border-color: var(--color-accent);
  }

  /* The text is flush with the link's edges; keep the focus ring off it. */
  .featured:focus-visible,
  .post-row:focus-visible {
    outline-offset: 4px;
  }

  .featured-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.35rem;
    flex-wrap: wrap;
  }

  .featured-meta time {
    font-size: 0.8rem;
    color: var(--color-muted);
  }

  /* min-width: 0 lets this flex item shrink below its widest tag, so a tag
     wider than the card can be cut instead of widening the page. */
  .featured-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    min-width: 0;
  }

  /* A single tag wider than the card is cut with an ellipsis. Only here:
     overflow other than visible moves an inline-block's baseline, which
     would break a row tag's alignment with its title. :global because the
     span belongs to Tag's style scope. */
  .featured-tags :global(.tag) {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .featured h3 {
    font-size: 1.2rem;
    font-weight: 600;
    line-height: 1.35;
    transition: color 0.15s ease;
  }

  .featured:hover h3 {
    color: var(--color-accent);
  }

  /* The gap under the title belongs to the description, so a card without
     one has the same 1.25rem below the title as above the date. (A margin
     on the h3 removed by :last-child would miss newsletter cards, where the
     hidden new-tab text follows the h3.) */
  .featured p {
    margin-top: 0.3rem;
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--color-text-secondary);
  }

  /* ===== Compact rows ===== */
  .post-list {
    display: flex;
    flex-direction: column;
  }

  .post-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    padding: 0.65rem 0;
    border-bottom: 1px solid var(--color-border);
    text-decoration: none;
    color: inherit;
  }

  .post-title {
    font-size: 0.95rem;
    font-weight: 500;
    transition: color 0.15s ease;
  }

  /* The one break point before the group, 0.45rem wide. A space in a
     monospace font is 1ch, so word-spacing tops it up to the exact width.
     Like any space it is dropped at the end of a line, so a group that
     wraps starts flush with the title. */
  .marks-gap {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    word-spacing: calc(0.45rem - 1ch);
  }

  /* Tag, arrow and hidden text follow the last word or wrap together.
     --ext-gap reaches ExternalMark's scoped .ext because custom properties
     inherit; a scoped ".marks .ext" rule here would not match it. */
  .marks {
    white-space: nowrap;
    --ext-gap: 0.45rem;
  }

  .post-row:hover .post-title {
    color: var(--color-accent);
  }

  .post-row time {
    font-size: 0.8rem;
    color: var(--color-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }
</style>
```

- [ ] **Step 3: Replace the home page frontmatter**

In `src/pages/index.astro`, replace lines 1 to 10 (everything up to and including the closing `---`) with:

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import WritingFilter from "../components/WritingFilter.astro";
import HomeWritingGroup from "../components/HomeWritingGroup.astro";
import { getHomeGroups } from "../lib/writing";

const groups = await getHomeGroups();
---
```

- [ ] **Step 4: Replace the Recent Writing section markup**

In `src/pages/index.astro`, replace the whole `<!-- Recent Writing -->` section (from `<section class="recent-posts">` through its closing `</section>`, before `<div class="page-end">`) with:

```astro
  <!-- Recent Writing -->
  <section class="recent-posts">
    <div class="section-header">
      <h2>Recent Writing</h2>
      <WritingFilter mode="groups" target="recent-writing" />
      <a href="/blog" class="view-all" data-filter-link="recent-writing">All posts &rarr;</a>
    </div>

    <div id="recent-writing">
      <HomeWritingGroup group="all" items={groups.all} />
      <HomeWritingGroup group="blog" items={groups.blog} hidden />
      <HomeWritingGroup group="newsletter" items={groups.newsletter} hidden />
    </div>
  </section>
```

- [ ] **Step 5: Update the home page styles**

In the `<style>` block of `src/pages/index.astro`:

Replace the `.section-header` rule with:

```css
  .section-header {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-bottom: 0.25rem;
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 0.75rem;
  }
```

Replace the `.view-all` rule with:

```css
  .view-all {
    font-size: 0.85rem;
    color: var(--color-muted);
    text-decoration: none;
    margin-left: auto;
    transition: color 0.2s ease;
  }
```

Delete these rules entirely, since they moved into `HomeWritingGroup.astro`: `/* ===== Featured Post ===== */` through `.featured p`, and `/* ===== Compact Post List ===== */` through `.post-row time`. Keep `.section-header h2`, `.view-all:hover`, `/* ===== Page End ===== */` and everything else.

In the `@media (max-width: 640px)` block, replace

```css
    .section-header {
      flex-direction: column;
      gap: 0.25rem;
    }
```

with

```css
    .section-header {
      gap: 0.5rem 0.75rem;
    }

    .section-header h2 {
      flex-basis: 100%;
    }
```

so on phones the heading takes its own line and the filter and link share the next. `.view-all` already has `margin-left: auto`, so the link stays right-aligned.

After that `@media` block, add:

```css
  /* Without JavaScript the filter is hidden, so the link shares the heading's line. */
  @media (max-width: 640px) and (scripting: none) {
    .section-header h2 {
      flex-basis: auto;
    }
  }
```

Without it, a phone with JavaScript off (the filter is hidden by its `<noscript>` style) shows "All posts →" alone on a second line under the heading.

- [ ] **Step 6: Build**

Run: `pnpm run build`
Expected: succeeds. Then confirm the three panels rendered with the right initial visibility:

`grep -o 'data-group="[a-z]*"[^>]*' dist/index.html | sed 's/ data-astro-cid-[a-z0-9]*//'`

The `sed` drops Astro's scoped-style attribute (`data-astro-cid-<hash>`), which follows each match. Expected exactly:

```
data-group="all"
data-group="blog" hidden
data-group="newsletter" hidden
```

And the newsletter links open in a new tab: `grep -c 'target="_blank" rel="noopener"' dist/index.html` is at least 4 (the intro paragraph link plus newsletter rows).

- [ ] **Step 7: Check in the browser**

Run: `pnpm run preview` and open `http://localhost:4321/`.

Check, in both light and dark mode (use the header theme toggle):

- Header row: "Recent Writing" left, pill filter, "All posts →" right, all on one baseline.
- "All" shows the newest blog post as the featured card and four rows below it. With today's data the rows are newsletters, each with an outlined `newsletter` tag and a `↗` after the title.
- "Blog" shows five blog posts, no tags reading `newsletter`, no `↗`.
- "Newsletter" shows a featured issue plus four rows, all with the tag and marker.
- Clicking a newsletter row opens beehiiv in a new tab.
- Dates: "Your Turn, Robot - August 18, 2026" shows Aug 18, not Aug 19, and blog dates match their frontmatter `date`.
- The "All posts →" href changes to `/blog?kind=blog` and `/blog?kind=newsletter` as you click (inspect the element).
- Open `http://localhost:4321/?kind=newsletter`: the Newsletter filter is preselected.
- Narrow the window below 640px: heading on its own line, filter and link on the next.

Fix anything that looks off before committing. Be picky about alignment of the tag inside the row title.

- [ ] **Step 8: Commit**

```bash
git add src/components/Tag.astro src/components/ExternalMark.astro src/components/HomeWritingGroup.astro src/layouts/BaseLayout.astro "src/pages/blog/[...slug].astro" src/pages/index.astro
git commit -m "Render newsletter issues in Recent Writing with a kind filter"
```

---

## Task 9: `PostCard` props for external items

**Files:**
- Modify: `src/components/PostCard.astro`

This task builds on Task 8's `Tag` and `ExternalMark` (Step 1 there), so it has no tag or marker styles of its own. `PostCard` is only used by `src/pages/blog/index.astro` (verify: `grep -rn "PostCard" src/`). Task 10 updates that caller, so this task and Task 10 must land before a build is expected to pass. Commit them separately anyway; the build check is at the end of Task 10.

- [ ] **Step 1: Replace the component**

Replace the whole of `src/components/PostCard.astro` with:

```astro
---
// One entry in the /blog list: a blog post or a newsletter issue.

import type { WritingKind } from "../lib/writing";
import { formatDay, isoDay } from "../lib/dates.mjs";
import ExternalMark from "./ExternalMark.astro";
import Tag from "./Tag.astro";

interface Props {
  title: string;
  href: string;
  kind: WritingKind;
  external?: boolean;
  date?: Date;
  description?: string;
  tags?: string[];
}

const { title, href, kind, external = false, date, description, tags = [] } = Astro.props;
const linkAttrs = external ? { target: "_blank", rel: "noopener" } : {};
---

<article class="post-card" data-kind={kind}>
  <div class="post-card-header">
    <a href={href} class="post-card-title" {...linkAttrs}>{title}{external && <ExternalMark />}</a>
    {date && (
      <time datetime={isoDay(date)}>{formatDay(date, "medium")}</time>
    )}
  </div>
  {description && <p class="post-card-desc">{description}</p>}
  {(kind === "newsletter" || tags.length > 0) && (
    <div class="post-card-tags">
      {kind === "newsletter" && <Tag variant="kind">newsletter</Tag>}
      {tags.map((tag: string) => (
        <Tag variant="topic">{tag}</Tag>
      ))}
    </div>
  )}
</article>

<style>
  .post-card {
    padding: 1rem 0;
    border-bottom: 1px solid var(--color-border);
  }

  .post-card-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
  }

  .post-card-title {
    font-weight: 500;
    font-size: 1.05rem;
    text-decoration: none;
    color: var(--color-text);
    transition: color 0.15s ease;
  }

  .post-card-title:hover {
    color: var(--color-accent);
  }

  /* The text is flush with the link's edges; keep the focus ring off it,
     as on the home page. */
  .post-card-title:focus-visible {
    outline-offset: 4px;
  }

  time {
    color: var(--color-muted);
    font-size: 0.85rem;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .post-card-desc {
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    line-height: 1.5;
    margin-top: 0.25rem;
  }

  /* Tags keep Tag's default size here, and a tag wider than the card breaks
     at its hyphens, which is Tag's default too. */
  .post-card-tags {
    display: flex;
    gap: 0.4rem;
    margin-top: 0.5rem;
    flex-wrap: wrap;
  }
</style>
```

`ExternalMark` must follow `{title}` with no whitespace in between, as in the block. Tags keep the post page's size through `--tag-font-size: 0.75rem; --tag-pad-x: 0.45rem`, and a tag wider than the card still breaks at its hyphens (`white-space: normal`, as on the post page). Verified: this block, rendered by a throwaway page with real blog and newsletter items, passes `pnpm run check` with no new errors and builds, with no horizontal overflow at 320px or 390px.

The title's focus ring has `outline-offset: 4px`, as on the home page's rows and featured card. Chrome's default 1px put it flush on the first glyph and the `↗`. This rule was added after Task 10's browser check.

Blog cards render as before apart from the date: `data-kind="blog"` is the only new attribute, no tag or marker is added when `kind` is `blog` and `external` is false, and the date now shows the post's own day in any build timezone (`formatDay` formats in UTC; before, a local build showed it a day early).

- [ ] **Step 2: Commit**

```bash
git add src/components/PostCard.astro
git commit -m "Give PostCard href, kind and external props"
```

---

## Task 10: Blog page with filter and merged list

**Files:**
- Modify: `src/pages/blog/index.astro`
- Modify: `Dockerfile` (Step 4)

- [ ] **Step 1: Replace the page**

Replace the whole of `src/pages/blog/index.astro` with:

```astro
---
import BaseLayout from "../../layouts/BaseLayout.astro";
import PostCard from "../../components/PostCard.astro";
import WritingFilter from "../../components/WritingFilter.astro";
import { getWriting } from "../../lib/writing";
import { EMPTY_MESSAGES } from "../../lib/empty-messages.mjs";

const items = await getWriting();
---

<BaseLayout title="Blog — Ryan Lynch" description="Technical blog posts about software engineering, AI, and building things.">
  <section class="blog-page">
    <header class="page-header">
      <div class="page-intro">
        <h1>Blog</h1>
        <p>Writing about software engineering, AI, home automation, and whatever else I'm thinking about.</p>
      </div>
      <WritingFilter mode="rows" target="writing-list" />
    </header>
    <div class="post-list" id="writing-list">
      {items.map((item) => (
        <PostCard
          title={item.title}
          href={item.href}
          kind={item.kind}
          external={item.external}
          date={item.date}
          description={item.description}
          tags={item.tags}
        />
      ))}
      {/* Empty states, one per filter. The "all" note covers a site with
          nothing published; the per-kind notes are shown by WritingFilter
          when its filter leaves no card visible, because the filtering
          happens in the browser. The live region holds only these notes:
          around the list it would announce every card on every click. */}
      <div aria-live="polite">
        {Object.entries(EMPTY_MESSAGES).map(([kind, message]) => (
          <p class="empty-note" data-empty={kind} hidden={kind !== "all" || items.length > 0}>{message}</p>
        ))}
      </div>
    </div>
  </section>
</BaseLayout>

<style>
  .blog-page {
    padding-top: 1.5rem;
  }

  /* Two rows, each holding one item: the title and blurb, then the filter.
     gap is the row gap between them. */
  .page-header {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1.25rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  /* The title and blurb take the whole first line, so the filter gets a
     row of its own under the blurb at every width, flush left with the
     title (Ryan's choice, 2026-09-19, matching the approved mockup). The
     blurb keeps its natural one-line width on a desktop; it is never
     squeezed to make room for the filter. */
  .page-intro {
    flex-basis: 100%;
  }

  .page-header h1 {
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 0.35rem;
    position: relative;
    display: inline-block;
    padding-bottom: 0.6rem;
  }

  .page-header h1::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    width: 3rem;
    height: 3px;
    border-radius: 2px;
    background: var(--color-accent-warm);
  }

  .page-header p {
    color: var(--color-text-secondary);
    font-size: 0.95rem;
    line-height: 1.5;
  }
</style>
```

`.page-intro { flex-basis: 100% }` gives the title and blurb the whole first line, so the filter always wraps to a row of its own under the blurb, 16px below it and flush left with the title (Ryan's decision; see "Task 10 fixes from the browser check"). The blurb keeps its natural width, and there is no breakpoint to maintain.

- [ ] **Step 2: Build and check the output**

Run: `pnpm run build`
Expected: succeeds. Then:

`grep -o 'data-kind="[a-z]*"' dist/blog/index.html | sort | uniq -c`

Expected: a `blog` count equal to the number of published posts and a `newsletter` count equal to the snapshot length. As of 2026-09-19:

```
  14 data-kind="blog"
   5 data-kind="newsletter"
```

beehiiv has sent five issues; the planned Issue #6 was never sent.

`grep -o 'target="_blank" rel="noopener"' dist/blog/index.html | wc -l`

Expected: the newsletter count plus one for the footer's Subscribe button (`NewsletterEmbed.astro`), so `6` as of 2026-09-19. The footer's social links use `rel="noopener noreferrer"` and do not match. `grep -c` would print `2`, because it counts lines, not matches: the five issue links share one line of the built page.

- [ ] **Step 3: Check in the browser**

Run: `pnpm run preview` and open `http://localhost:4321/blog`.

Check, in light and dark mode:

- Header: title and blurb left, pill filter bottom-right, both above the divider.
- "All": one list, newest first, blog posts and issues interleaved. Issue cards show an outlined `newsletter` tag and a `↗` after the title.
- "Blog": only blog cards, visually identical to the current live `/blog`.
- "Newsletter": only issue cards.
- Open `http://localhost:4321/blog?kind=newsletter`: Newsletter filter preselected and only issues shown.
- Clicking an issue opens beehiiv in a new tab; clicking a blog card stays on the site.
- Dates: the Aug 18 issue shows Aug 18, 2026; blog dates match their frontmatter `date`. On a day with both a post and an issue, the post is listed first.
- At every width: the filter sits on its own row under the blurb, 16px below it and flush left with the title, above the divider. No horizontal overflow at any width.

Verified 2026-09-19 with CDP in headless Chrome at 1280px, 390px and 320px, light and dark (after the fixes under "Task 10 fixes from the browser check"):

- Header: the filter is 16px under the blurb at every width, its left edge on the page's text column (x=296 at 1280px, x=16 at 640px and below), and the header is 150.97px / 173.77px / 173.77px / 196.56px tall at 1280px / 640px / 390px / 320px. No horizontal overflow at 320, 390, 560, 640, 641, 700 or 1280px. The header does not move between filter states.
- All: 19 cards, days descending: the five issues, then the 14 posts (every issue is newer than the newest post). The gap from each issue title's last glyph to its `↗` glyph is 4.8px at 1280px and 320px, with no whitespace node before `.ext`, and the `↗` never wraps alone.
- Blog: compared with `/blog` from `7a1e45e` (the old page, built with `TZ=UTC` like the Docker image) moved down to the same list top, `.post-list` is pixel-identical (0 differing pixels) at 1280px, 390px and 320px in both themes, and every card's rects and computed styles match. The header is taller by the filter's row (49.59px) at every width, so the list starts 49.59px lower. Deep-linked and clicked Blog states are pixel-identical to each other.
- Newsletter: only the five issue cards.
- Dates: the August 18 issue shows Aug 18, 2026. The August 11 issue shows Aug 12, 2026, which is right: beehiiv's publish date is `2026-08-12T14:19:54Z`, 10:19 am in New York on Aug 12, and the title carries the planned date.
- Deep links: `?kind=newsletter` and `?kind=blog` preselect their filter with `scrollY` 0; `?kind=bogus` falls back to All. Real mouse clicks change the visible cards and leave the URL and `history.length` unchanged.
- Home page: with Newsletter active, "All posts →" leads to `/blog?kind=newsletter` with Newsletter preselected and only issues shown (1280px and 390px).
- Accessibility: each issue link's accessible name is its title followed by "(opens in a new tab)"; blog links are named by their titles. Links in hidden cards are absent from the accessibility tree and the tab order: with Newsletter active, Tab goes from the Newsletter button through the five issues to the footer's Subscribe button. The filter is a group named "Filter writing by kind" whose buttons report their pressed state. The page's only heading is "Blog".
- Focus: the filter's 2px accent ring and Chrome's ring on card titles are visible in both themes, and the title ring clears the text.
- No JavaScript: the filter is hidden, all 19 cards show, and the header is exactly as tall as the old page's (101.38px, 124.17px and 146.97px at 1280px, 390px and 320px).
- Empty states: with nothing published the page shows "Nothing published yet.", and a filter that leaves no card visible shows its own note. See the entry under "Deviations from the spec".
- Post page: the date and tags line has no separator at any width; spacing alone separates them, as on the home page's featured card. See the entry under "Deviations from the spec".

- [x] **Step 4: Type-check in the Docker build**

Run: `pnpm run check`
Expected: `0 errors`. This page's rewrite removes the last known error (`slug` possibly undefined at the old `src/pages/blog/index.astro:20`). Do not continue until it reports 0 errors.

Then, in `Dockerfile`, add the check right after the unit tests and before the vault clone:

```dockerfile
# Unit tests need no vault; fail the image build early if they fail.
RUN pnpm test

# Type check (astro check) needs no vault data either.
RUN pnpm run check
```

`astro check` needs no vault: with none it only warns that the posts and pages base directories do not exist. Verified 2026-09-19 after this task: `0 errors`, `0 warnings`, `0 hints` with the vault, with `VAULT_PATH` unset (the Docker case, since the check runs before `ENV VAULT_PATH`) and with `VAULT_PATH` pointing at a directory that does not exist. A `pnpm run build` with the vault right after a vault-less check still builds all 14 posts: the changed config makes Astro clear the content store.

- [ ] **Step 5: Commit**

```bash
git add src/pages/blog/index.astro Dockerfile
git commit -m "Show newsletter issues on the blog page with a kind filter"
```

---

## Task 11: Newsletter page link

**Files:**
- Modify: `src/pages/newsletter.astro:21-28`

- [x] **Step 1: Point "read past issues" at the site**

In `src/pages/newsletter.astro`, replace

```astro
      <p class="subscribe-note">
        Subscribe below to get it in your inbox &mdash; or
        <a
          href="https://yourturnrobot.beehiiv.com/"
          target="_blank"
          rel="noopener"
        >read past issues</a>.
      </p>
```

with

```astro
      <p class="subscribe-note">
        Subscribe below to get it in your inbox &mdash; or
        <a href="/blog?kind=newsletter">read past issues</a>.
      </p>
```

- [x] **Step 2: Build and check**

Run: `pnpm run build && grep -o 'href="/blog?kind=newsletter"' dist/newsletter/index.html`
Expected: one match. In `pnpm run preview`, clicking the link on `/newsletter` lands on `/blog` with the Newsletter filter active.

Verified: `grep -o 'href="/blog?kind=newsletter"' dist/newsletter/index.html` prints one match, the literal `?kind=newsletter` (not HTML-escaped). `pnpm test` (100 pass) and `pnpm run check` (0 errors) still pass. In headless Chrome over CDP, clicking the link from `/newsletter/` lands on `/blog?kind=newsletter` with the Newsletter filter button `aria-pressed="true"` and all 5 visible cards `data-kind="newsletter"`. The rendered `/newsletter/` page has one other beehiiv link left, the footer's "Subscribe →" button (`NewsletterEmbed.astro` via `Footer.astro`), unrelated to this change. Screenshots at 1280px/390px, light/dark confirm the link reads well and matches the paragraph's other styling (`color: rgb(37, 99, 235)` = `--color-accent`, no underline).

- [x] **Step 3: Commit**

```bash
git add src/pages/newsletter.astro
git commit -m "Link past issues to the on-site newsletter list"
```

---

## Task 12: Documentation

**Files:**
- Modify: `CLAUDE.md` (after the "What can break" list under "Publish Flow", before "## Adding a New Blog Post")

- [ ] **Step 1: Add the Newsletter sync subsection**

Insert into `CLAUDE.md` immediately before `## Adding a New Blog Post`:

```markdown
### Newsletter sync

Newsletter issues on the home page and `/blog` come from `src/data/newsletters.json`, a committed snapshot of sent issues from the beehiiv API. Entries link out to beehiiv; nothing is rendered on the site.

- `scripts/fetch-newsletters.mjs` (`pnpm run sync:newsletters`) pages through `GET /v2/publications/{id}/posts?status=confirmed`, keeps issues published to the web (`platform` `web` or `both`), not hidden from the feed, and dated at or before now, and writes the snapshot sorted newest first. It needs `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID` in the environment (export them, or run `node --env-file=<file> scripts/fetch-newsletters.mjs`). It never reads this repo's `.env` and refuses to write an empty list.
- `.github/workflows/sync-newsletters.yml` runs every Wednesday at 13:00 UTC and on manual dispatch. If the snapshot changed it commits `Sync newsletters from beehiiv`, pushes to `main`, and dispatches `deploy.yml` (a push made with `GITHUB_TOKEN` does not trigger `on: push`). If nothing changed it logs "no change" and stops.
- The site reads the snapshot through the `newsletters` collection in `src/content.config.ts`; `src/lib/writing.ts` merges it with published posts, and `src/lib/select-home-groups.mjs` picks the home page groups.

| Repo | Secret | Purpose |
|---|---|---|
| `ryan-lynch-site` | `BEEHIIV_API_KEY` | Read access to the publication's posts |
| `ryan-lynch-site` | `BEEHIIV_PUBLICATION_ID` | The `pub_...` id the posts endpoint is scoped to |

#### What can break

- `BEEHIIV_API_KEY` revoked or `BEEHIIV_PUBLICATION_ID` wrong → the sync job fails visibly in the Actions tab; the last committed snapshot stays live
- beehiiv API down → same as above; the next Wednesday run or a manual dispatch picks it up
- Sync job failed at "Trigger site build" after the push succeeded → the snapshot is on `main` but unbuilt, and a re-run sees "no change"; run `deploy.yml` manually
- `actions: write` missing from the workflow permissions → the snapshot commits but `deploy.yml` is never dispatched
- Branch protection or a ruleset on `main` that blocks `github-actions[bot]` → every sync push is rejected
- No repo activity for 60 days (public repos) → GitHub disables the scheduled trigger; re-enable it in the Actions tab
- An issue sent email-only (`platform: email`) never appears on the site, by design
```

Also made three smaller edits in `CLAUDE.md`: added `src/lib/walk-dir.mjs` and `src/data/newsletters.json` bullets to `## Key Directories`, added a `pnpm test` line to the `## Build` bash block, and appended a "symlink that cannot be resolved" bullet to the existing publish-flow `### What can break` list. Also replaced every em dash in `CLAUDE.md` with a plain hyphen per the repo's writing rule.

Task 6b later changed five `CLAUDE.md` sections: `## Key Directories` (copy-media copies only the images of posts that get a page; `walk-dir.mjs` is the walker shared by copy-media and the slug map, not the only vault scanner), a new `## Conventions` section after it, `## Build` (a `pnpm run check` line, and a note that `pnpm run dev` runs copy-media only at startup), two bullets at the end of the publish-flow `### What can break` list (`[posts] skipping`, and which bad metadata still fails the build), and a `YYYY-MM-DD` note under `## Adding a New Blog Post`. Their current text:

````markdown
## Key Directories

- `src/plugins/` - custom remark plugins for Obsidian markdown quirks
- `scripts/copy-media.mjs` - pre-build script that copies to `public/media/` only the images of posts that get a page (`isLinkablePost`) and of `_website` pages, so a skipped post's images are not deployed
- `src/lib/walk-dir.mjs` - the vault walker shared by copy-media and the blog slug map; skips unresolvable symlinks with a warning
- `src/data/newsletters.json` - committed snapshot of sent newsletter issues from beehiiv (see Newsletter sync)

## Conventions

- Read posts through `getPublishedPosts()` (`src/lib/posts.ts`), never `getCollection("posts")` directly. It drops published posts missing a date or slug, with one `[posts] skipping` warning each.
- Format dates with `formatDay` / `isoDay` from `src/lib/dates.mjs`. They format in UTC, so the build machine's timezone cannot shift a displayed day.
- Vault exclusions (`System Prompts`, `_website`, `_Templates`) live in `src/lib/vault-rules.mjs`, shared by the posts glob, the blog slug map and copy-media.
- Outside Astro, read a note's frontmatter with `readFrontmatter()` (`src/lib/frontmatter.mjs`), which parses it with js-yaml exactly as the posts collection does, and decide whether a note gets a blog page with `isLinkablePost()` (`src/lib/publishable.mjs`), the rule the collection uses. Never parse frontmatter with a regex. The posts schema and entry id are in `src/lib/post-schema.mjs`.

## Build

```bash
pnpm install
pnpm run build    # runs copy-media.mjs then astro build
pnpm run dev      # runs copy-media.mjs then astro dev
pnpm test         # unit tests (also run inside the Docker build)
pnpm run check    # astro check (types, including .astro files)
```

In `pnpm run dev`, copy-media runs only at startup. After fixing a skipped post, restart dev so its images get copied.

### What can break

- Workflow file not in `.github/workflows/` in vault repo → dispatch never fires
- `SITE_REPO_PAT` expired/revoked → dispatch fails silently
- `VAULT_DEPLOY_KEY` expired/revoked → Docker build fails at clone step
- Watchtower not running or image tag mismatch → image builds but site doesn't update
- Obsidian Git push interval (12h) means changes aren't immediate - push manually for faster publishing
- A symlink in the vault that cannot be resolved → skipped with a `WARN: skipping unresolvable symlink` line in the build log, not fatal (see `src/lib/walk-dir.mjs`)
- A published post missing `date` or `slug` (or with an unparseable date) is skipped everywhere, and its images are not copied; search the build log for `[posts] skipping`
- An empty property or an unparseable date in a post never fails the build (`_website` pages still require `title` and `slug`), but invalid YAML or a wrongly typed value in a note the posts glob reads does

## Adding a New Blog Post

1. Add YAML frontmatter to the `.md` file in the vault:
   ```yaml
   ---
   title: "Post Title"
   slug: "url-friendly-slug"
   date: 2025-01-01
   description: "Short description"
   tags: ["tag1", "tag2"]
   published: true
   ---
   ```
   `date` must be a plain `YYYY-MM-DD`. A time of day can shift the displayed day.
2. Run `pnpm run build` to verify locally
3. Push the vault to GitHub (or wait for Obsidian Git's 12h auto-push)
4. The publish flow above handles the rest
````

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Document the beehiiv newsletter sync"
```

---

## Task 13: Full verification and workflow exercise

- [ ] **Step 1: Tests and build from clean**

Run:

```bash
pnpm test
rm -rf dist .astro
pnpm run build
```

Expected: `# pass 100`, `# fail 0`, and a successful build.

Then guard against Astro's style-whitespace bug (whitespace between a component's markup and a following `<style>` is emitted as a space; see "Shared building blocks"):

`grep -c '</span> <span class="ext"' dist/index.html dist/blog/index.html`

Expected: `dist/index.html:0` and `dist/blog/index.html:0`. grep exits 1 when nothing matches, which here is the pass. Any other count is a failure; it counts lines, so eight bad rows on one line print `1`. Verified 2026-09-19: with `Tag.astro`'s `<style>` moved after its markup, `dist/index.html` prints `1` (the eight newsletter rows across the home page's three panels all read `newsletter</span> <span class="ext"`).

`grep -c ' <span class="ext"' dist/index.html dist/blog/index.html`

Expected: `0` for each as well. This wider pattern also catches a space between a title and its `↗`, such as `{title} <ExternalMark />` in `PostCard`.

Then run `pnpm run check`.
Expected: `0 errors`, `0 warnings`, `0 hints`. The `Dockerfile` runs the same check since Task 10.

- [ ] **Step 2: Confirm RSS is unchanged**

Run: `grep -o '<item>' dist/rss.xml | wc -l` and `grep -c 'beehiiv' dist/rss.xml`
Expected: the first equals the published post count (14 as of 2026-09-19); the second is `0`. (`grep -c '<item>'` would print 1, because `rss.xml` is a single line.)

- [ ] **Step 3: Confirm no secrets are staged anywhere**

Run: `git log -p --all -S 'BEEHIIV_API_KEY=' -- . | head` and `git ls-files | grep -E '\.env$'`
Expected: both empty.

- [ ] **Step 4: User adds the two GitHub secrets**

The user adds `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID` to `ryan-lynch-site` at Settings → Secrets and variables → Actions, with the values from `~/Projects/your-turn-robot/.env`.

- [ ] **Step 5: Optional: Docker build before merging (user runs)**

The agent sandbox cannot reach Docker, so the unit tests and `astro check` have only run on local Node 25, not on the `node:20-alpine` image that production builds with. Before merging, the user can run, from the repo root with an SSH agent that can read `ryan-lynch-brain`:

```bash
docker build --ssh default -t ryan-lynch-site .
```

Expected: the build succeeds; the `RUN pnpm test` step shows `# pass 100`, `# fail 0`, and the `RUN pnpm run check` step shows `0 errors`. Step 7 checks the same thing in CI if this is skipped.

- [ ] **Step 6: Merge to main (user decides how)**

The sync workflow only exists on `main` once merged; `workflow_dispatch` runs the workflow file from the chosen ref, so merge first. Use `superpowers:finishing-a-development-branch` to pick merge vs PR. Never push without the user asking.

- [ ] **Step 7: Confirm the Docker build on node:20-alpine**

The push to `main` triggers `deploy.yml`. Once it finishes, the user (or an agent with `gh` auth) runs:

```bash
gh run list --workflow=deploy.yml --limit 1
gh run view <run-id> --log | grep -E 'RUN pnpm (test|run check)|# (pass|fail) |[0-9]+ errors'
```

Expected: the run succeeded, and the "Build and push" step's log shows both `RUN pnpm test` (with `# pass 100` and `# fail 0`) and `RUN pnpm run check` (with `0 errors`) running in the `node:20-alpine` build stage. This is the first time the date tests (New York DST boundaries, `TZ` switching) run on the production runtime. If either step is missing, the image was built from a stale `Dockerfile`.

- [ ] **Step 8: Exercise the "no change" path**

After merge, the user (or an agent with `gh` auth) runs:

```bash
gh workflow run sync-newsletters.yml --ref main
sleep 60
gh run list --workflow=sync-newsletters.yml --limit 1
```

Expected: the run succeeds, and its "Detect changes" step logs `no change`. No new commit on `main`, no `deploy.yml` run triggered.

- [ ] **Step 9: Exercise the commit-and-dispatch path**

On `main`, delete the last (oldest) entry from `src/data/newsletters.json`, commit it as `Test: drop one newsletter entry`, and have the user push. Then dispatch again:

```bash
gh workflow run sync-newsletters.yml --ref main
sleep 90
gh run list --workflow=sync-newsletters.yml --limit 1
gh run list --workflow=deploy.yml --limit 1
git pull
git log --oneline -2
```

Expected: the sync run succeeds, the newest `main` commit is `Sync newsletters from beehiiv` by `github-actions[bot]`, the snapshot is back to the full list, and a `deploy.yml` run started within the same minute. Watchtower then picks up the new image within five minutes; confirm the live site shows the filter.

---

## Self-review against the spec

- Section 1 (script, workflow, secrets, backfill): Tasks 1, 2, 3, 12, 13.
- Section 2 (collection, `writing.ts`, pure `selectHomeGroups`): Tasks 4, 5, 6.
- Section 3 (`WritingFilter`, home page A2, blog page, `PostCard` props, newsletter page link): Tasks 7, 8, 9, 10, 11.
- Section 4 (unit tests, build, manual light/dark checks, workflow exercised both paths): Tasks 1, 5, 8, 10, 13.
- Section 5 (`CLAUDE.md`, `.gitignore`): Task 12; `.gitignore` already done.
- Out of scope items untouched: `rss.xml.ts` still lists blog posts only (Task 6b changed it only to read `getPublishedPosts()`; Task 13 step 2 checks it), `/newsletter` gets no issue list, no vault or `your-turn-robot` changes.
