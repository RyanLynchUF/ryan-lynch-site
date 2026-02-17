# Ryan Lynch Portfolio Site

Astro v5 static site that builds a portfolio/blog from an Obsidian vault.

## Architecture (Two-Repo Setup)

- **Site repo:** `github.com/RyanLynchUF/ryan-lynch-site` — this repo (Astro code, Dockerfile, etc.)
- **Vault repo:** `github.com/RyanLynchUF/obsidian-my-hub` — Obsidian vault (private, auto-backed up by Obsidian Git)
- **Local convention:** vault lives at `~/Documents/MyHub/` (sibling of this repo at `~/Documents/ryan-lynch-site/`)
- **Vault path:** controlled by `VAULT_PATH` env var, defaults to `../MyHub` relative to project root

- **Astro v5** with Content Layer API — `src/content.config.ts` defines a `posts` collection that globs all `.md` files from the vault
- **Published posts** are filtered by `published: true` in YAML frontmatter
- **Static output** — `pnpm run build` produces `dist/` served by Nginx in Docker
- **Package manager:** pnpm

## Key Directories

- `../MyHub/` — Obsidian vault (source of truth, do NOT restructure; lives outside this repo)
- `../MyHub/_Organization/_Media/` — all images (PNGs, Excalidraw SVGs)
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

Docker clones the vault repo at build time:

```bash
docker build -t ryan-lynch-site .
docker run -p 8080:80 ryan-lynch-site
```

Override vault repo (e.g. for a fork or private token):
```bash
docker build --build-arg VAULT_REPO=https://github.com/RyanLynchUF/obsidian-my-hub.git -t ryan-lynch-site .
```

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
2. Images should be in `MyHub/_Organization/_Media/` (or `_excalidraw/` subdirectory for SVGs)
3. Run `pnpm run build` to verify
