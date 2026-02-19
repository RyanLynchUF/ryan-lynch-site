import { getCollection } from "astro:content";

export async function getPage(slug: string) {
  const pages = await getCollection("pages");
  const page = pages.find((p) => p.data.slug === slug);
  if (!page) {
    throw new Error(`Page with slug "${slug}" not found`);
  }
  return page;
}
