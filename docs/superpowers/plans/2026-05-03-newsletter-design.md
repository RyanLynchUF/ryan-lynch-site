# AI, Actually Newsletter Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Kit newsletter integration with prominent (but non-advertorial) link-out promotion of the new Beehiiv newsletter "AI, Actually" across five touchpoints.

**Architecture:** Pure link-out, no embedded form. Five edits: header nav, new `/newsletter` page, footer component (`NewsletterEmbed.astro` becomes a link-out card), landing page intro paragraph, and a vault edit on `about.md`. The `/newsletter` page is hand-written (not vault-sourced) since the copy is short and evergreen, but it mimics the existing static-page layout pattern (page-header, page-tagline, page-content) so it feels native.

**Tech Stack:** Astro v5, plain CSS via `<style>` blocks per file, design tokens from `BaseLayout.astro` (`--color-accent`, `--color-muted`, `--color-text`, etc.). Package manager is pnpm.

---

## Spec reference

Source: `docs/superpowers/specs/2026-05-03-newsletter-design.md`

## Files touched

| File | Type | Change |
|---|---|---|
| `src/components/Header.astro` | repo | Add Newsletter nav link between Blog and Now |
| `src/pages/newsletter.astro` | repo | New file — pitch page with link-out CTAs |
| `src/components/NewsletterEmbed.astro` | repo | Replace Kit form with Beehiiv link-out card |
| `src/pages/index.astro` | repo | Update inline newsletter mention; drop trailing CTA |
| `~/Obsidian/ryan-lynch-brain/_website/about.md` | vault | Append one sentence about the newsletter |

## Notes for the implementer

- **No component test infra.** This is a static Astro site; there are no unit tests to write. Verification is via `pnpm run build` (catches syntax/type errors) and `pnpm run dev` (renders the site). Read each task's "Verification" step carefully — it replaces the typical TDD test step.
- **Don't commit the vault edit from this repo.** Section 5 modifies a file in `~/Obsidian/ryan-lynch-brain/`, which is a separate repo. The publish flow auto-picks-up vault changes on the next push. Treat the vault edit as a manual side task.
- **Frequent commits.** One commit per task. Keep messages descriptive.

---

## Task 1: Add Newsletter to header nav

**Files:**
- Modify: `src/components/Header.astro:7-12`

- [ ] **Step 1: Add the Newsletter entry to `navLinks`**

In `src/components/Header.astro`, change the `navLinks` array from:

```ts
const navLinks = [
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/now", label: "Now" },
  { href: "/uses", label: "Uses" },
];
```

to:

```ts
const navLinks = [
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/newsletter", label: "Newsletter" },
  { href: "/now", label: "Now" },
  { href: "/uses", label: "Uses" },
];
```

No change to `isActive()` is needed — the existing `pathname === href || pathname === ${href}/` branch handles `/newsletter` correctly.

- [ ] **Step 2: Verify build still passes**

Run: `pnpm run build`
Expected: Build completes successfully. (The `/newsletter` route does not exist yet, so the link will 404 in the browser — that's fine for now and gets fixed in Task 2.)

- [ ] **Step 3: Commit**

```bash
git add src/components/Header.astro
git commit -m "Add Newsletter link to header nav"
```

---

## Task 2: Create `/newsletter` page

**Files:**
- Create: `src/pages/newsletter.astro`

- [ ] **Step 1: Create the file with full content**

Create `src/pages/newsletter.astro` with the following content. The structure mirrors `src/pages/about.astro` / `src/pages/now.astro` but uses hardcoded copy instead of `getPage()` (this page is evergreen and has no markdown source). The `.page-content`, `.page-header`, `.page-tagline` styles are duplicated from `now.astro` so the visual rhythm matches.

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";

const tagline = "Insights on what is possible with AI, actually. Written for anyone who cares more about outcomes than hype.";
---

<BaseLayout title="Newsletter — Ryan Lynch" description={tagline}>
  <article class="page-content">
    <header class="page-header">
      <h1>AI, Actually</h1>
      <p class="page-tagline">{tagline}</p>
    </header>
    <div class="content">
      <p>
        AI moves fast, and most of what's written about it is hype, hot
        takes, or tutorials for engineers. <em>AI, Actually</em> is the
        read I wished I had: a short weekly roundup of practical, mature
        AI use cases — what's actually working, where it's actually being
        used, and what that means for the rest of us.
      </p>
      <p>
        It's written for anyone who's curious about AI but doesn't want
        to live in it day-to-day. No jargon, no hot takes — just a few
        links worth your time and a short blog post tying them together.
        Ships Tuesday mornings.
      </p>
      <div class="cta-row">
        <a
          class="newsletter-btn"
          href="https://aiactually.beehiiv.com/"
          target="_blank"
          rel="noopener"
        >Subscribe on Beehiiv &rarr;</a>
        <a
          class="newsletter-archive"
          href="https://aiactually.beehiiv.com/"
          target="_blank"
          rel="noopener"
        >Read past issues</a>
      </div>
    </div>
  </article>
</BaseLayout>

<style>
  .page-content {
    padding-top: 1.5rem;
  }

  .page-header {
    margin-bottom: 1.25rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .page-header h1 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 0.35rem;
    padding-bottom: 0.6rem;
    position: relative;
    display: inline-block;
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

  .page-tagline {
    color: var(--color-text-secondary);
    font-size: 0.95rem;
    line-height: 1.5;
    margin-top: 0.1rem;
    margin-bottom: 0;
  }

  .content p {
    margin-bottom: 1rem;
    line-height: 1.75;
    color: var(--color-text-secondary);
  }

  .cta-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-top: 1.5rem;
  }

  .newsletter-btn {
    display: inline-block;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    font-family: inherit;
    font-weight: 500;
    color: #fff;
    background: var(--color-accent);
    border: none;
    border-radius: 6px;
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.2s ease;
  }

  .newsletter-btn:hover {
    background: var(--color-accent-hover);
  }

  .newsletter-archive {
    font-size: 0.9rem;
    color: var(--color-muted);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .newsletter-archive:hover {
    color: var(--color-accent);
  }
</style>
```

Key style decisions:
- Page-header CSS is duplicated from `now.astro` so the page header reads identically to other static pages. (We could DRY this with a shared layout/component, but the spec explicitly says "page-level styles can be inlined in the .astro file (matches existing pages)" and that's the existing convention — don't refactor pre-existing duplication while adding a feature.)
- No "Last Updated" line — this page is evergreen, not a snapshot like `/now`.
- The `.newsletter-btn` is intentionally redefined here rather than imported from `NewsletterEmbed.astro` because Astro's `<style>` blocks are scoped per-component. The tokens stay consistent because both use `var(--color-accent)`.
- `display: inline-block` is set on `.newsletter-btn` so padding renders correctly on the `<a>` tag.

- [ ] **Step 2: Verify the build succeeds**

Run: `pnpm run build`
Expected: Build completes; `dist/newsletter/index.html` exists.

- [ ] **Step 3: Verify the dev server renders the page**

Run: `pnpm run dev` in one terminal, then open `http://localhost:4321/newsletter` in a browser (or use `curl` to spot-check that the page returns 200 with the headline "AI, Actually" and the Subscribe button).

Expected:
- Page loads with headline "AI, Actually"
- Two paragraphs of body copy render
- "Subscribe on Beehiiv →" button is present and links to `https://aiactually.beehiiv.com/` with `target="_blank"`
- "Read past issues" link is present
- The "Newsletter" tab in the header is now highlighted as active

Stop the dev server when finished verifying.

- [ ] **Step 4: Commit**

```bash
git add src/pages/newsletter.astro
git commit -m "Add /newsletter pitch page for AI, Actually"
```

---

## Task 3: Replace Kit form with Beehiiv link-out card in `NewsletterEmbed.astro`

**Files:**
- Modify: `src/components/NewsletterEmbed.astro` (full replacement of file content)

- [ ] **Step 1: Replace the file content**

Overwrite `src/components/NewsletterEmbed.astro` with:

```astro
---
// Footer subscribe card — links out to Beehiiv (no embedded form).
---

<div id="newsletter" class="newsletter">
  <p class="newsletter-heading">AI, Actually</p>
  <p class="newsletter-desc">
    Insights on what is possible with AI, actually. Written for anyone
    who cares more about outcomes than hype.
  </p>
  <a
    href="https://aiactually.beehiiv.com/"
    target="_blank"
    rel="noopener"
    class="newsletter-btn"
  >Subscribe &rarr;</a>
</div>

<style>
  .newsletter {
    max-width: 420px;
  }

  .newsletter-heading {
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--color-text);
    margin-bottom: 0.25rem;
  }

  .newsletter-desc {
    font-size: 0.85rem;
    color: var(--color-muted);
    line-height: 1.5;
    margin-bottom: 0.75rem;
  }

  .newsletter-btn {
    display: inline-block;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    font-family: inherit;
    font-weight: 500;
    color: #fff;
    background: var(--color-accent);
    border: none;
    border-radius: 6px;
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.2s ease;
  }

  .newsletter-btn:hover {
    background: var(--color-accent-hover);
  }
</style>
```

What changed vs. the previous version:
- `<form action="https://app.kit.com/forms/9116459/subscriptions" method="POST">` removed entirely
- `<input type="email">`, `<button type="submit">` removed
- `.newsletter-form` flex container removed
- `.newsletter-input` styles removed
- `@media (max-width: 400px) { .newsletter-form { flex-direction: column; } }` removed (no longer needed since there's no form)
- `.newsletter-btn` is now applied to an `<a>` instead of a `<button>`
- Added `display: inline-block` and `text-decoration: none` to `.newsletter-btn` so it renders as a button when applied to an anchor
- Heading text changed: "Stay in the loop" → "AI, Actually"
- Description text changed to the newsletter tagline

What stayed the same:
- `id="newsletter"` on the wrapper div (kept as a fallback so old links to `#newsletter` continue working)
- `.newsletter`, `.newsletter-heading`, `.newsletter-desc` class names and their styles
- `var(--color-accent)`, `var(--color-accent-hover)`, `var(--color-text)`, `var(--color-muted)` token usage

- [ ] **Step 2: Verify the build succeeds**

Run: `pnpm run build`
Expected: Build completes successfully. Confirm `dist/index.html` no longer references `app.kit.com` (the form is gone) and now references `aiactually.beehiiv.com`.

Quick spot-check via Grep tool with pattern `app.kit.com` over `dist/` — expected 0 results.

- [ ] **Step 3: Verify in dev**

Run: `pnpm run dev`. Open `http://localhost:4321/`. Scroll to footer.

Expected:
- Footer shows "AI, Actually" heading
- Description text matches the spec
- "Subscribe →" is a styled button (not a form field)
- Clicking the button opens `https://aiactually.beehiiv.com/` in a new tab
- No email input field anywhere

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/NewsletterEmbed.astro
git commit -m "Replace Kit form with Beehiiv link-out in footer subscribe card"
```

---

## Task 4: Update the landing page intro

**Files:**
- Modify: `src/pages/index.astro:32-40` (the third intro paragraph)

- [ ] **Step 1: Edit the inline newsletter mention and remove the trailing CTA**

The third paragraph in the `.intro` block currently reads (around lines 32–40):

```astro
<p>
  Personally, I'm a husband, parent, curator, and obsessive learner. I keep a
  <a href="https://brain.ryanlynch.me">second brain</a> in Obsidian
  where I collect everything I'm learning, and the best of it ends up
  here or in my <a href="#newsletter">newsletter</a>. Architecture
  notes sit next to home automations, data strategy next to golf
  analysis. Everything starts in my Obsidian vault, and when
  something clicks, it shows up here. Sign-up and let's learn together.
</p>
```

Change it to:

```astro
<p>
  Personally, I'm a husband, parent, curator, and obsessive learner. I keep a
  <a href="https://brain.ryanlynch.me">second brain</a> in Obsidian
  where I collect everything I'm learning, and the best of it ends up
  here or in my newsletter, <a href="/newsletter">AI, Actually</a>. Architecture
  notes sit next to home automations, data strategy next to golf
  analysis. Everything starts in my Obsidian vault, and when
  something clicks, it shows up here.
</p>
```

Two specific changes:
1. The inline `<a href="#newsletter">newsletter</a>` becomes `my newsletter, <a href="/newsletter">AI, Actually</a>`. The link target changes from the in-page `#newsletter` anchor to the new `/newsletter` page.
2. The trailing sentence `Sign-up and let's learn together.` is removed. The paragraph now ends after `it shows up here.`

No other changes to the file — leave the hero, "Now" strip, recent posts, and styles untouched.

- [ ] **Step 2: Verify in dev**

Run: `pnpm run dev`. Open `http://localhost:4321/`.

Expected:
- The intro paragraph reads naturally with "my newsletter, AI, Actually" as the inline link
- Clicking "AI, Actually" navigates to `/newsletter`
- The "Sign-up and let's learn together." sentence is gone
- The paragraph ends with "...it shows up here."

Stop the dev server.

- [ ] **Step 3: Verify build**

Run: `pnpm run build`
Expected: Build completes successfully.

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "Point landing page newsletter mention at /newsletter and drop CTA tail"
```

---

## Task 5: Vault edit — append newsletter sentence to `about.md`

**Files:**
- Modify: `~/Obsidian/ryan-lynch-brain/_website/about.md` (line 18, end of the second paragraph in "How I Think About Life")

⚠ **This file is in a separate repo (the Obsidian vault), not in `ryan-lynch-site`.** Do not commit this from the site repo. The publish flow auto-picks-up the change on the next vault push (Obsidian Git plugin or manual push).

- [ ] **Step 1: Append the newsletter sentence**

In `~/Obsidian/ryan-lynch-brain/_website/about.md`, find the second paragraph of the **"How I Think About Life"** section (currently line 18, the paragraph ending with `You can find almost anything else about me in there.`).

The current text ends with:

```
...I keep a [second brain](https://brain.ryanlynch.me) in Obsidian where I collect everything I'm learning (created in 2022, before the explosion of LLM second brains). Mine remains human-owned and operated. You can find almost anything else about me in there.
```

Append this sentence after `...about me in there.` on the same line (preserve the single-line paragraph format that the rest of the file uses):

```
 The best of what I'm learning about AI ends up in my weekly newsletter, [AI, Actually](/newsletter).
```

So the full final line becomes:

```
A few things that are specific to me:  I'm a [slow thinker](https://sive.rs/slow).  Sometimes, I know too much about what I don't know to be able to give a good answer right away. I build home automations. I keep a [second brain](https://brain.ryanlynch.me) in Obsidian where I collect everything I'm learning (created in 2022, before the explosion of LLM second brains). Mine remains human-owned and operated. You can find almost anything else about me in there. The best of what I'm learning about AI ends up in my weekly newsletter, [AI, Actually](/newsletter).
```

- [ ] **Step 2: Verify locally with vault path**

From the site repo, run a build pointed at the vault:

```bash
VAULT_PATH=~/Obsidian/ryan-lynch-brain pnpm run build
```

(Or, if `VAULT_PATH` is set in `.env`, just `pnpm run build`.)

Then open `dist/about/index.html` and confirm the new sentence appears at the end of the "How I Think About Life" section, with `[AI, Actually](/newsletter)` rendered as a working internal link.

- [ ] **Step 3: Commit and push the vault change**

The vault is a separate git repo. From the vault directory:

```bash
cd ~/Obsidian/ryan-lynch-brain
git add _website/about.md
git commit -m "Mention AI, Actually newsletter in about page"
git push
```

The vault push will trigger the site rebuild via the `repository_dispatch` workflow (`vault-updated`).

---

## Task 6: Final verification & summary

**Files:** none (verification only)

- [ ] **Step 1: Full clean build**

Run: `pnpm run build`
Expected: Exit code 0. No warnings about missing routes or broken links.

- [ ] **Step 2: Confirm the Kit form is gone**

Use Grep to scan the repo for any leftover Kit references that should have been removed:

Grep pattern: `app\.kit\.com|kit\.com/forms` over the `src/` and `dist/` directories.
Expected: 0 results.

- [ ] **Step 3: Confirm Beehiiv links are present everywhere they should be**

Grep pattern: `aiactually\.beehiiv\.com` over `src/`.
Expected matches in:
- `src/pages/newsletter.astro` (twice — Subscribe button + archive link)
- `src/components/NewsletterEmbed.astro` (once — Subscribe button)

That's 3 matches in 2 files. The landing page (`src/pages/index.astro`) does **not** reference Beehiiv directly; it links internally to `/newsletter`.

- [ ] **Step 4: Smoke test the dev server**

Run: `pnpm run dev`. Visit each of these URLs in a browser and confirm the listed expectations:

1. `http://localhost:4321/`
   - Header shows: About · Blog · Newsletter · Now · Uses
   - Intro paragraph reads "...my newsletter, AI, Actually." with "AI, Actually" as a link
   - No "Sign-up and let's learn together." sentence
   - Footer shows the new "AI, Actually" subscribe card with a Subscribe → button (not a form)

2. `http://localhost:4321/newsletter`
   - Header "Newsletter" tab is active
   - Page title "AI, Actually" with the orange underline
   - Two body paragraphs
   - Subscribe on Beehiiv → primary button + "Read past issues" secondary link
   - Both link to `https://aiactually.beehiiv.com/` in a new tab

3. `http://localhost:4321/about` (only if vault is wired up locally)
   - At the end of the "How I Think About Life" section, the new sentence with "AI, Actually" linked to `/newsletter` appears

Stop the dev server.

- [ ] **Step 5: Final summary to user**

Report back with: which commits were made, that the build passed, and a reminder that Section 5 (vault edit) was committed in the vault repo separately and won't go live until the next vault push triggers the site rebuild.

---

## Out of scope (per spec)

- Embedded subscribe forms (deferred — link-out only)
- Past-issues list on `/newsletter` (Beehiiv homepage serves as archive)
- RSS-driven recent issues feed
- Migrating Kit subscribers
- Removing the Kit form ID `9116459` from external systems (only the site referenced it)
- A homepage CTA strip (explicitly rejected — keep landing page subtle)
