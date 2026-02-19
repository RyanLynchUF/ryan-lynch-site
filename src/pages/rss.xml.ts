import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const posts = (await getCollection("posts", ({ data }) => data.published)).sort(
    (a, b) => (b.data.date?.getTime() ?? 0) - (a.data.date?.getTime() ?? 0)
  );

  return rss({
    title: "Ryan Lynch",
    description:
      "Thoughts on AI, data, building software, and anything else I find interesting. With some humor sprinkled in.",
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${post.data.slug}/`,
    })),
  });
}
