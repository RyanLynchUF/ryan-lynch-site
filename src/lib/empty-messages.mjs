// The one copy of the "nothing here" wording, shared by the home page's
// groups (HomeWritingGroup) and the /blog list, which renders one note per
// filter and lets WritingFilter show the matching one.
//
// It lives in its own module, not in writing-items.mjs, because that module
// maps and orders real items and is unit tested on that behaviour, while
// this is display copy. The keys are the filter's values, and "all" is not a
// WritingKind, so the two vocabularies are not the same either.
//
// The matching .empty-note style is global, in BaseLayout.astro.

/** @type {Record<"all" | "blog" | "newsletter", string>} */
export const EMPTY_MESSAGES = {
  all: "Nothing published yet.",
  blog: "No blog posts yet.",
  newsletter: "No newsletter issues yet.",
};
