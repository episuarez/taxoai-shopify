import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { TaxoAIClient } from "~/lib/taxoai-client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const limit = parseInt(url.searchParams.get("limit") ?? "10", 10);

  if (!query || query.length < 2) {
    return json({ categories: [] });
  }

  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  if (!settings?.apiKey) {
    return json({ categories: [], error: "API key not configured" });
  }

  try {
    const client = new TaxoAIClient(settings.apiKey);
    const result = await client.searchTaxonomies(query, limit);
    return json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Search failed";
    return json({ categories: [], error: message });
  }
};
