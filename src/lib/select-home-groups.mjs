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
