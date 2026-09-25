# AI, Actually — Newsletter integration

**Date:** 2026-05-03
**Status:** Design approved, ready for implementation plan

## Goal

Promote a new weekly Beehiiv newsletter ("AI, Actually") more prominently across the site without turning the site into an advertisement for it. The existing Kit (ConvertKit) subscription is fully replaced.

## Newsletter

- **Name:** AI, Actually (with comma)
- **URL:** https://aiactually.beehiiv.com/
- **Tagline:** Insights on what is possible with AI, actually. Written for anyone who cares more about outcomes than hype.
- **Cadence:** Weekly, ships Tuesday mornings
- **Audience:** Non-technical, techno-curious readers; practical and mature AI use cases

## Scope

Five touchpoints on the site:

1. **Header nav** — add "Newsletter" tab
2. **`/newsletter` page** — new internal landing page
3. **Footer subscription box** — replace Kit form with a Beehiiv pitch + link-out button
4. **Landing page** — update inline mention to call the newsletter by name
5. **About page** — add one sentence with link (vault edit)

## Subscription mechanism

All "Subscribe" actions are **link-outs** to `https://aiactually.beehiiv.com/` (`target="_blank"`, `rel="noopener"`). No embedded form, no iframe, no API integration. This avoids styling mismatch with the site theme and avoids the maintenance cost of a form-action endpoint or proxy. If conversion ever matters, upgrading to a custom-styled form posting to Beehiiv is a fast-follow.

## Section 1 — Header nav

File: `src/components/Header.astro`

Add `{ href: "/newsletter", label: "Newsletter" }` to `navLinks`, between Blog and Now:

```
About · Blog · Newsletter · Now · Uses
```

Active-state logic uses the existing `pathname === href || pathname === ${href}/` check — no special case needed.

## Section 2 — `/newsletter` page (new)

File: `src/pages/newsletter.astro`

Reuses the existing static-page layout pattern (same `page-header`, `page-tagline`, `page-content` styles as `now.astro` and `about.astro`) so it feels native. **Not** sourced from the vault — this page is evergreen and the copy is short, so it lives in the repo as a hand-written `.astro` file (no `getPage()` lookup, no markdown).

Structure:

```
<BaseLayout title="Newsletter — Ryan Lynch" description={tagline}>
  <article class="page-content">
    <header class="page-header">
      <h1>AI, Actually</h1>
      <p class="page-tagline">
        Insights on what is possible with AI, actually. Written for
        anyone who cares more about outcomes than hype.
      </p>
    </header>
    <div class="content">
      [paragraph 1 — proposed copy, user can revise]
      AI moves fast, and most of what's written about it is hype, hot
      takes, or tutorials for engineers. AI, Actually is the read I
      wished I had: a short weekly roundup of practical, mature AI use
      cases — what's actually working, where it's actually being used,
      and what that means for the rest of us.

      [paragraph 2 — proposed copy, user can revise]
      It's written for anyone who's curious about AI but doesn't want
      to live in it day-to-day. No jargon, no hot takes — just a few
      links worth your time and a short blog post tying them together.
      Ships Tuesday mornings.

      [CTA row]
        Primary: <a class="newsletter-btn" href="https://aiactually.beehiiv.com/"
                    target="_blank" rel="noopener">Subscribe on Beehiiv →</a>
        Secondary: <a class="newsletter-archive" href="https://aiactually.beehiiv.com/"
                      target="_blank" rel="noopener">Read past issues</a>
    </div>
  </article>
</BaseLayout>
```

The body paragraphs above are proposed first-draft copy. Implementer should treat them as a starting point for the user to revise. No "Last Updated" line on the header (this is evergreen, not a snapshot like `/now`).

Style notes:
- `.newsletter-btn` matches the existing footer subscribe button: `--color-accent` background, white text, 6px radius, hover transitions
- `.newsletter-archive` is a muted text link (`--color-muted`) sitting next to or under the button
- Page-level styles can be inlined in the `.astro` file (matches existing pages); the button style can be lifted from `NewsletterEmbed.astro`

## Section 3 — Footer subscription box

File: `src/components/NewsletterEmbed.astro`

Full replacement. Same component file, same footer placement, same `id="newsletter"` anchor (kept as a fallback — old links to `#newsletter` continue working). The form goes away entirely.

New content:

```
<div id="newsletter" class="newsletter">
  <p class="newsletter-heading">AI, Actually</p>
  <p class="newsletter-desc">
    Insights on what is possible with AI, actually. Written for
    anyone who cares more about outcomes than hype.
  </p>
  <a
    href="https://aiactually.beehiiv.com/"
    target="_blank"
    rel="noopener"
    class="newsletter-btn"
  >Subscribe →</a>
</div>
```

Removed:
- `<form action="https://app.kit.com/forms/9116459/subscriptions" method="POST">`
- `<input type="email" ...>`
- `<button type="submit">`
- The `.newsletter-form` flex layout and the `@media (max-width: 400px)` form stack rule

Kept:
- `.newsletter-heading`, `.newsletter-desc` styles unchanged
- `.newsletter-btn` styles unchanged (now applied to an `<a>` instead of `<button>`; verify the styles work on `<a>` — they should, but `display: inline-block` may need adding for padding)
- `id="newsletter"` on the wrapper

## Section 4 — Landing page

File: `src/pages/index.astro`

Two edits in the third intro paragraph (the one that ends "Sign-up and let's learn together"):

**Edit 1.** Change the inline mention.

Before:
```
the best of it ends up here or in my <a href="#newsletter">newsletter</a>.
```

After:
```
the best of it ends up here or in my newsletter, <a href="/newsletter">AI, Actually</a>.
```

**Edit 2.** Drop the trailing call-to-action sentence.

Remove:
```
Sign-up and let's learn together.
```

The paragraph now ends on the link. Reasoning: the old closing line was a CTA for the inline footer form; with a real pitch page behind the link, that closing reads as a redundant ad and the user explicitly does not want this site to feel like an ad.

No other changes to the landing page. No new section, no new strip. Per the user's "important part of my portfolio, but not an advertisement" guidance.

## Section 5 — About page (vault edit)

File: `~/Obsidian/ryan-lynch-brain/_website/about.md`

This file lives in the vault, not the site repo. Edits here are picked up by the publish flow on the next vault push.

Append one sentence at the end of the second paragraph in the **"How I Think About Life"** section (the paragraph that mentions the second brain).

Before:
```
...I keep a [second brain](https://brain.ryanlynch.me) in Obsidian where
I collect everything I'm learning. You can find almost anything else
about me in there.
```

After:
```
...I keep a [second brain](https://brain.ryanlynch.me) in Obsidian where
I collect everything I'm learning. You can find almost anything else
about me in there. The best of what I'm learning about AI ends up in
my weekly newsletter, [AI, Actually](/newsletter).
```

The link is a relative internal link to `/newsletter` — works because the markdown is rendered into a page served from the same site.

## Out of scope

- Embedded subscribe forms (deferred until conversion data justifies it)
- Past-issues list on `/newsletter` (Beehiiv homepage already serves as the archive)
- RSS-driven recent-issues feed
- Migrating existing Kit subscribers (none mentioned)
- Removing the Kit form ID `9116459` from any external systems (only the site references it)
- A homepage CTA strip (explicitly rejected — keep landing page subtle)

## Files touched

| File | Type | Change |
|---|---|---|
| `src/components/Header.astro` | repo | Add Newsletter nav link |
| `src/pages/newsletter.astro` | repo | New file |
| `src/components/NewsletterEmbed.astro` | repo | Replace form with link-out button |
| `src/pages/index.astro` | repo | Update inline mention, drop trailing CTA |
| `~/Obsidian/ryan-lynch-brain/_website/about.md` | vault | Append one sentence |

## Verification

After implementation, the implementer should:

1. Run `pnpm run dev` and load `/`, `/newsletter`, `/about`
2. Confirm the header shows the Newsletter tab and it activates on `/newsletter`
3. Confirm the footer subscription box renders the new copy and the Subscribe button links out to Beehiiv in a new tab
4. Confirm the landing page intro paragraph reads naturally with the new inline link
5. Confirm `/about` shows the new sentence (will require a local build with `VAULT_PATH` pointing at the vault, or the implementer edits the vault and rebuilds)
6. Run `pnpm run build` and confirm no errors
