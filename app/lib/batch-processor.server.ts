import prisma from "~/db.server";
import {
  TaxoAIClient,
  type AnalyzeRequest,
  type BatchResponse,
  type JobResponse,
  type JobProductResult,
} from "./taxoai-client";
import { updateProductSEO } from "./seo-updater.server";
import { writeMetafields } from "./metafield-writer.server";
import { mapCategory } from "./category-mapper.server";
import { writeAttributes } from "./attribute-writer.server";
import { increment } from "./usage-tracker.server";
import type { AnalyzeResponse } from "./taxoai-client";
import type { SupportedLanguage } from "./constants";
import type { AdminGraphQL } from "./constants";

interface ShopSettings {
  apiKey: string;
  language: string;
  confidenceThreshold: number;
  analyzeImages: boolean;
  updateTitle: boolean;
  updateDescription: boolean;
}

const PRODUCTS_QUERY = `#graphql
  query products($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        descriptionHtml
        priceRangeV2 {
          minVariantPrice {
            amount
          }
        }
        images(first: 5) {
          edges {
            node {
              url
            }
          }
        }
      }
    }
  }
`;

interface ShopifyProductNode {
  id: string;
  title: string;
  descriptionHtml: string;
  priceRangeV2: {
    minVariantPrice: {
      amount: string;
    };
  };
  images: {
    edges: Array<{ node: { url: string } }>;
  };
}

/**
 * Submit a batch of products for analysis via the TaxoAI batch API.
 */
export async function submitBatchAnalysis(
  shop: string,
  productIds: string[],
  admin: AdminGraphQL,
  settings: ShopSettings,
): Promise<BatchResponse> {
  // Normalize product IDs to GIDs
  const productGids = productIds.map((id) =>
    id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`,
  );

  // Fetch all products from Shopify
  const response = await admin(PRODUCTS_QUERY, {
    variables: { ids: productGids },
  });

  const result = (await response.json()) as {
    data?: { nodes?: ShopifyProductNode[] };
  };

  const products = (result.data?.nodes ?? []).filter(
    (n): n is ShopifyProductNode => n !== null && n.id !== undefined,
  );

  if (products.length === 0) {
    throw new Error("No valid products found for batch analysis");
  }

  // Map products to TaxoAI API payloads
  const payloads: AnalyzeRequest[] = products.map((product) => {
    const imageUrls = product.images.edges.map((e) => e.node.url);
    const price = parseFloat(product.priceRangeV2.minVariantPrice.amount);

    return {
      name: product.title,
      description: product.descriptionHtml
        ? stripHtml(product.descriptionHtml)
        : undefined,
      price: isNaN(price) ? undefined : price,
      image_urls: imageUrls.length > 0 ? imageUrls : undefined,
      language: settings.language as SupportedLanguage,
      analyze_images: settings.analyzeImages,
    };
  });

  // Submit batch to TaxoAI
  const client = new TaxoAIClient(settings.apiKey);
  return client.submitBatch(payloads);
}

/**
 * Poll a batch job for completion.
 */
export async function pollJob(
  apiKey: string,
  jobId: string,
): Promise<JobResponse> {
  const client = new TaxoAIClient(apiKey);
  return client.getJob(jobId);
}

/**
 * Process the results of a completed batch job.
 * Applies analysis results to each product.
 */
export async function processBatchResults(
  shop: string,
  results: JobProductResult[],
  productIds: string[],
  admin: AdminGraphQL,
  settings: ShopSettings,
): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  for (let i = 0; i < results.length; i++) {
    const jobResult = results[i];
    const productId = productIds[i];

    if (!productId || !jobResult) continue;

    const productGid = productId.startsWith("gid://")
      ? productId
      : `gid://shopify/Product/${productId}`;
    const numericProductId = productGid.replace(
      "gid://shopify/Product/",
      "",
    );

    try {
      // Convert JobProductResult to AnalyzeResponse-like structure
      const analysis: AnalyzeResponse = {
        classification: jobResult.classification,
        attributes: jobResult.attributes,
        seo: jobResult.seo,
        image_analysis: jobResult.image_analysis,
        usage: { products_used_this_month: 0, products_limit: 0, tier: "" },
      };

      // Store in Prisma
      await prisma.productAnalysis.upsert({
        where: {
          shop_shopifyProductId: {
            shop,
            shopifyProductId: numericProductId,
          },
        },
        create: {
          shop,
          shopifyProductId: numericProductId,
          googleCategory: jobResult.classification.google_category,
          googleCategoryId: jobResult.classification.google_category_id,
          confidence: jobResult.classification.confidence,
          seoTitle: jobResult.seo.optimized_title,
          metaTitle: jobResult.seo.meta_title,
          metaDescription: jobResult.seo.meta_description,
          optimizedDescription: jobResult.seo.optimized_description,
          keywords: JSON.stringify(jobResult.seo.keywords),
          tags: JSON.stringify(jobResult.seo.tags),
          attributes: JSON.stringify(jobResult.attributes),
          imageAnalysis: jobResult.image_analysis
            ? JSON.stringify(jobResult.image_analysis)
            : null,
          rawResponse: JSON.stringify(jobResult),
          analyzedAt: new Date(),
        },
        update: {
          googleCategory: jobResult.classification.google_category,
          googleCategoryId: jobResult.classification.google_category_id,
          confidence: jobResult.classification.confidence,
          seoTitle: jobResult.seo.optimized_title,
          metaTitle: jobResult.seo.meta_title,
          metaDescription: jobResult.seo.meta_description,
          optimizedDescription: jobResult.seo.optimized_description,
          keywords: JSON.stringify(jobResult.seo.keywords),
          tags: JSON.stringify(jobResult.seo.tags),
          attributes: JSON.stringify(jobResult.attributes),
          imageAnalysis: jobResult.image_analysis
            ? JSON.stringify(jobResult.image_analysis)
            : null,
          rawResponse: JSON.stringify(jobResult),
          analyzedAt: new Date(),
        },
      });

      // Apply changes if confidence meets threshold
      const meetsThreshold =
        jobResult.classification.confidence >= settings.confidenceThreshold;

      if (meetsThreshold) {
        try {
          await updateProductSEO(admin, productGid, jobResult.seo, {
            updateTitle: settings.updateTitle,
            updateDescription: settings.updateDescription,
          });
        } catch (error) {
          console.error(`Failed to update SEO for ${productId}:`, error);
        }

        try {
          await writeMetafields(admin, productGid, analysis);
        } catch (error) {
          console.error(
            `Failed to write metafields for ${productId}:`,
            error,
          );
        }

        try {
          await mapCategory(
            admin,
            productGid,
            jobResult.classification.google_category,
          );
        } catch (error) {
          console.error(
            `Failed to map category for ${productId}:`,
            error,
          );
        }

        try {
          await writeAttributes(admin, productGid, jobResult.attributes);
        } catch (error) {
          console.error(
            `Failed to write attributes for ${productId}:`,
            error,
          );
        }
      }

      // Increment usage for each processed product
      await increment(shop);
      processed++;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      errors.push(`Product ${productId}: ${message}`);
    }
  }

  return { processed, errors };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
