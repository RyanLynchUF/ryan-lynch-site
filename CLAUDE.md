# Ryan Lynch Portfolio Site

Astro v5 static site that builds a portfolio/blog from an Obsidian vault.

## Architecture (Two-Repo Setup)

- **Site repo:** `github.com/RyanLynchUF/ryan-lynch-site` - this repo (Astro code, Dockerfile, etc.)
- **Vault repo:** private Obsidian vault, cloned at Docker build time
- **Vault path:** controlled by `VAULT_PATH` env var (see `.claude/local.md` for local conventions)

- **Astro v5** with Content Layer API - `src/content.config.ts` defines a `posts` collection that globs all `.md` files from the vault
- **Published posts** are filtered by `published: true` in YAML frontmatter
- **Static output** - `pnpm run build` produces `dist/` served by Nginx in Docker
- **Package manager:** pnpm

## Key Directories

- `src/plugins/` - custom remark plugins for Obsidian markdown quirks
- `scripts/copy-media.mjs` - pre-build script that copies to `public/media/` only the images of posts that get a page (`isLinkablePost`) and of `_website` pages, so a skipped post's images are not deployed
- `src/lib/walk-dir.mjs` - the vault walker shared by copy-media and the blog slug map; skips unresolvable symlinks with a warning, and skips dot-entries (files and directories) and `node_modules` so it sees the same notes the posts glob loads
- `src/data/newsletters.json` - committed snapshot of sent newsletter issues from beehiiv (see Newsletter sync)

## Conventions

- Read posts through `getPublishedPosts()` (`src/lib/posts.ts`), never `getCollection("posts")` directly. It drops published posts missing a date or slug, with one `[posts] skipping` warning each.
- Format dates with `formatDay` / `isoDay` from `src/lib/dates.mjs`. They format in UTC, so the build machine's timezone cannot shift a displayed day.
- Vault exclusions (`System Prompts`, `_website`, `_Templates`) live in `src/lib/vault-rules.mjs`, shared by the posts glob, the blog slug map and copy-media.
- Outside Astro, read a note's frontmatter with `readFrontmatter()` (`src/lib/frontmatter.mjs`), which parses it with js-yaml exactly as the posts collection does, and decide whether a note gets a blog page with `isLinkablePost()` (`src/lib/publishable.mjs`), the rule the collection uses. Never parse frontmatter with a regex. The posts schema and entry id are in `src/lib/post-schema.mjs`.

## Remark Plugins (in astro.config.mjs)

1. `remark-strip-obsidian-comments` - strips `%%...%%` Obsidian comments
2. `remark-obsidian-images` - converts `![[image.png]]` wiki-links to `<img>` tags
3. `remark-wiki-links` - converts `[[Page Name]]` to links (resolves vault paths)
4. `@r4ai/remark-callout` - renders `> [!type]` callout blocks
5. `remark-gfm` - GFM tables, strikethrough, etc.

## Build

```bash
pnpm install
pnpm run build    # runs copy-media.mjs then astro build
pnpm run dev      # runs copy-media.mjs then astro dev
pnpm test         # unit tests (also run inside the Docker build)
pnpm run check    # astro check (types, including .astro files)
```

In `pnpm run dev`, copy-media runs only at startup. After fixing a skipped post, restart dev so its images get copied.

To point at a different vault location:
```bash
VAULT_PATH=/path/to/vault pnpm run build
```

## Docker

```bash
docker build -t ryan-lynch-site .
docker run -p 8080:80 ryan-lynch-site
```

## Publish Flow (End-to-End)

Full chain from writing a post to it appearing on the live site:

1. **Obsidian Git plugin** auto-commits vault changes every 10 minutes and pushes to `ryan-lynch-brain` on GitHub every 12 hours (configurable in `.obsidian/plugins/obsidian-git/data.json`; can also push manually)
2. **Vault CI** - on push to `main`, `ryan-lynch-brain/.github/workflows/trigger-site-build.yml` sends a `repository_dispatch` (type: `vault-updated`) to this repo using `SITE_REPO_PAT` secret
3. **Site CI** - `.github/workflows/deploy.yml` triggers on the dispatch (also on pushes to `main` and manual `workflow_dispatch`), builds a Docker image that clones the vault via SSH deploy key, runs the Astro build, and pushes to Docker Hub (`DOCKERHUB_USERNAME/ryan-lynch-site:latest`)
4. **Server deployment** - a Docker container on a Proxmox LXC (Dell OptiPlex home server) runs the site behind Nginx. Watchtower polls Docker Hub for new images every 5 minutes (`WATCHTOWER_POLL_INTERVAL=300`) and auto-restarts the container when a new image is found

### Required GitHub Secrets

| Repo | Secret | Purpose |
|---|---|---|
| `ryan-lynch-brain` | `SITE_REPO_PAT` | PAT with workflow dispatch permission on `ryan-lynch-site` |
| `ryan-lynch-site` | `VAULT_DEPLOY_KEY` | SSH private key with read access to the vault repo |
| `ryan-lynch-site` | `DOCKERHUB_USERNAME` | Docker Hub username |
| `ryan-lynch-site` | `DOCKERHUB_TOKEN` | Docker Hub access token |

### What can break

- Workflow file not in `.github/workflows/` in vault repo → dispatch never fires
- `SITE_REPO_PAT` expired/revoked → dispatch fails silently
- `VAULT_DEPLOY_KEY` expired/revoked → Docker build fails at clone step
- Watchtower not running or image tag mismatch → image builds but site doesn't update
- Obsidian Git push interval (12h) means changes aren't immediate - push manually for faster publishing
- A symlink in the vault that cannot be resolved → skipped with a `WARN: skipping unresolvable symlink` line in the build log, not fatal (see `src/lib/walk-dir.mjs`)
- A published post missing `date` or `slug` (or with an unparseable date) is skipped everywhere, and its images are not copied; search the build log for `[posts] skipping`
- An empty property or an unparseable date in a post never fails the build (`_website` pages still require `title` and `slug`), but invalid YAML or a wrongly typed value in a note the posts glob reads does

### Newsletter sync

Newsletter issues on the home page and `/blog` come from `src/data/newsletters.json`, a committed snapshot of sent issues from the beehiiv API. Entries link out to beehiiv; nothing is rendered on the site.

- `scripts/fetch-newsletters.mjs` (`pnpm run sync:newsletters`) pages through `GET /v2/publications/{id}/posts?status=confirmed`, keeps issues published to the web (`platform` `web` or `both`), not hidden from the feed, and dated at or before now, takes each issue's description from its SEO description, and writes the snapshot sorted newest first. It needs `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID` in the environment (export them, or run `node --env-file=<file> scripts/fetch-newsletters.mjs`). It never reads this repo's `.env` and refuses to write an empty list.
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
- An issue's slug changed in beehiiv after the snapshot was taken → beehiiv serves no redirect, so the site links to a 404 until the next sync; dispatch `sync-newsletters.yml` manually right after any slug change
- The site's issue description is beehiiv's SEO description (`meta_default_description`), falling back to `preview_text`, then `subtitle`; editing the Open Graph or X description in beehiiv does not change the site

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
