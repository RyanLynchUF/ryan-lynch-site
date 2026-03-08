# Ryan Lynch Portfolio Site

Astro v5 static site that builds a portfolio/blog from an Obsidian vault.

## Architecture (Two-Repo Setup)

- **Site repo:** `github.com/RyanLynchUF/ryan-lynch-site` — this repo (Astro code, Dockerfile, etc.)
- **Vault repo:** private Obsidian vault, cloned at Docker build time
- **Vault path:** controlled by `VAULT_PATH` env var (see `.claude/local.md` for local conventions)

- **Astro v5** with Content Layer API — `src/content.config.ts` defines a `posts` collection that globs all `.md` files from the vault
- **Published posts** are filtered by `published: true` in YAML frontmatter
- **Static output** — `pnpm run build` produces `dist/` served by Nginx in Docker
- **Package manager:** pnpm

## Key Directories

- `src/plugins/` — custom remark plugins for Obsidian markdown quirks
- `scripts/copy-media.mjs` — pre-build script that copies only published-post images to `public/media/`

## Remark Plugins (in astro.config.mjs)

1. `remark-strip-obsidian-comments` — strips `%%...%%` Obsidian comments
2. `remark-obsidian-images` — converts `![[image.png]]` wiki-links to `<img>` tags
3. `remark-wiki-links` — converts `[[Page Name]]` to links (resolves vault paths)
4. `@r4ai/remark-callout` — renders `> [!type]` callout blocks
5. `remark-gfm` — GFM tables, strikethrough, etc.

## Build

```bash
pnpm install
pnpm run build    # runs copy-media.mjs then astro build
pnpm run dev      # runs copy-media.mjs then astro dev
```

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
2. **Vault CI** — on push to `main`, `ryan-lynch-brain/.github/workflows/trigger-site-build.yml` sends a `repository_dispatch` (type: `vault-updated`) to this repo using `SITE_REPO_PAT` secret
3. **Site CI** — `.github/workflows/deploy.yml` triggers on the dispatch (also on pushes to `main` and manual `workflow_dispatch`), builds a Docker image that clones the vault via SSH deploy key, runs the Astro build, and pushes to Docker Hub (`DOCKERHUB_USERNAME/ryan-lynch-site:latest`)
4. **Server deployment** — a Docker container on a Proxmox LXC (Dell OptiPlex home server) runs the site behind Nginx. Watchtower polls Docker Hub for new images at the default interval (24h) and auto-restarts the container when a new image is found

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
- Obsidian Git push interval (12h) means changes aren't immediate — push manually for faster publishing

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
2. Run `pnpm run build` to verify locally
3. Push the vault to GitHub (or wait for Obsidian Git's 12h auto-push)
4. The publish flow above handles the rest
