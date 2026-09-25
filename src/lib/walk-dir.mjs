import fs from "node:fs";
import path from "node:path";

const SKIPPED_DIR_NAMES = new Set(["node_modules"]);

/**
 * Recursively visit every regular file under `dir`, following symlinks and
 * skipping (with a warning) any symlink that is unresolvable (missing
 * target, loop, or unreadable). The vault commits
 * `AGENTS.md -> .claude/CLAUDE.md` whose target is untracked, so fresh
 * clones have a dangling link that would otherwise crash `readdirSync`
 * consumers with ENOENT. Dot-entries, files as well as directories, are
 * skipped to match Astro's glob loader, which runs with tinyglobby's
 * `dot:false` default; `node_modules` is skipped because nothing in the
 * vault should ever be read from one.
 *
 * `skipDirNames` skips further directories by name at any depth, matching the
 * posts glob's exclusions; pass VAULT_EXCLUDED_DIRS from vault-rules.mjs when
 * reading notes.
 * @param {string} dir
 * @param {(fullPath: string) => void} callback
 * @param {{ skipDirNames?: Iterable<string> }} [options]
 */
export function walkDir(dir, callback, { skipDirNames = [] } = {}) {
  walk(dir, callback, new Set(skipDirNames));
}

/**
 * @param {string} dir
 * @param {(fullPath: string) => void} callback
 * @param {Set<string>} skipDirNames
 */
function walk(dir, callback, skipDirNames) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Before the symlink resolution below, so a dot-named link is skipped on
    // its own name whatever it points at, and a dangling one warns only when
    // the glob would have tried to load it.
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    let isDirectory = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      let target;
      try {
        target = fs.statSync(full);
      } catch (err) {
        const { code } = /** @type {NodeJS.ErrnoException} */ (err);
        console.warn(`  WARN: skipping unresolvable symlink ${full} (${code})`);
        continue;
      }
      isDirectory = target.isDirectory();
    }
    if (isDirectory) {
      if (!SKIPPED_DIR_NAMES.has(entry.name) && !skipDirNames.has(entry.name)) {
        walk(full, callback, skipDirNames);
      }
    } else {
      callback(full);
    }
  }
}
