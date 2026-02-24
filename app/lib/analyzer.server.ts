import prisma from "~/db.server";
import {
  TaxoAIClient,
  type AnalyzeRequest,
  type AnalyzeResponse,
} from "./taxoai-client";
import { canAnalyze, increment } from "./usage-tracker.server";
import { updateProductSEO } from "./seo-updater.server";
import { writeMetafields } from "./metafield-writer.server";
import { mapCategory } from "./category-mapper.server";
import { writeAttributes } from "./attribute-writer.server";
import type { SupportedLanguage } from "./constants";
import type { AdminGraphQL } from "./constants";

interface ShopSettings {
  apiKey: string;
  language: string;
  autoAnalyze: boolean;
  confidenceThreshold: number;
  analyzeImages: boolean;
  updateTitle: boolean;
  updateDescription: boolean;
}

const PRODUCT_QUERY = `#graphql
  query product($id: ID!) {
    product(id: $id) {
      id
      title
      descriptionHtml
      productType
      tags
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
`;

interface ShopifyProduct {
  id: string;
  title: string;
  descriptionHtml: string;
  productType: string;
  tags: string[];
  priceRangeV2: {
    minVariantPrice: {
      amount: string;
    };
  };
  images: {
    edges: Array<{ node: { url: string } }>;
  };
}

export interface AnalysisResult {
  success: boolean;
  analysis?: AnalyzeResponse;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

/**
 * Analyze a Shopify product using the TaxoAI API.
 * Fetches the product from Shopify, sends it to TaxoAI,
 * stores results, and applies changes back to the product.
 */
export async function analyzeShopifyProduct(
  shop: string,
  productId: string,
  admin: AdminGraphQL,
  settings: ShopSettings,
): Promise<AnalysisResult> {
  // 1. Check usage limits (server-side verification)
  const allowed = await canAnalyze(shop, settings.apiKey);
  if (!allowed) {
    return {
      success: false,
      error: "Usage limit reached. Upgrade your plan to continue analyzing products.",
      skipped: true,
      reason: "usage_limit",
    };
  }

  // 2. Fetch the product from Shopify
  const productGid = productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;

  const productResponse = await admin(PRODUCT_QUERY, {
    variables: { id: productGid },
  });

  const productResult = (await productResponse.json()) as {
    data?: { product?: ShopifyProduct };
  };

  const product = productResult.data?.product;
  if (!product) {
    return {
      success: false,
      error: `Product not found: ${productId}`,
    };
  }

  // 3. Map Shopify product to TaxoAI API payload
  const imageUrls = product.images.edges.map((e) => e.node.url);
  const price = parseFloat(product.priceRangeV2.minVariantPrice.amount);

  const numericId = productGid.replace("gid://shopify/Product/", "");

  const payload: AnalyzeRequest = {
    name: product.title,
    description: product.descriptionHtml
      ? stripHtml(product.descriptionHtml)
      : undefined,
    price: isNaN(price) ? undefined : price,
    image_urls: imageUrls.length > 0 ? imageUrls : undefined,
    language: settings.language as SupportedLanguage,
    analyze_images: settings.analyzeImages,
    product_id: numericId,
  };

  // 4. Call TaxoAI API
  let analysis: AnalyzeResponse;
  try {
    const client = new TaxoAIClient(settings.apiKey);
    analysis = await client.analyzeProduct(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown API error";
    return {
      success: false,
      error: `TaxoAI API error: ${message}`,
    };
  }

  // 5. Store results in Prisma

  await prisma.productAnalysis.upsert({
    where: {
      shop_shopifyProductId: {
        shop,
        shopifyProductId: numericId,
      },
    },
    create: {
      shop,
      shopifyProductId: numericId,
      googleCategory: analysis.classification.google_category,
      googleCategoryId: analysis.classification.google_category_id,
      confidence: analysis.classification.confidence,
      seoTitle: analysis.seo.optimized_title,
      metaTitle: analysis.seo.meta_title,
      metaDescription: analysis.seo.meta_description,
      optimizedDescription: analysis.seo.optimized_description,
      keywords: JSON.stringify(analysis.seo.keywords),
      tags: JSON.stringify(analysis.seo.tags),
      attributes: JSON.stringify(analysis.attributes),
      imageAnalysis: analysis.image_analysis
        ? JSON.stringify(analysis.image_analysis)
        : null,
      rawResponse: JSON.stringify(analysis),
      analyzedAt: new Date(),
    },
    update: {
      googleCategory: analysis.classification.google_category,
      googleCategoryId: analysis.classification.google_category_id,
      confidence: analysis.classification.confidence,
      seoTitle: analysis.seo.optimized_title,
      metaTitle: analysis.seo.meta_title,
      metaDescription: analysis.seo.meta_description,
      optimizedDescription: analysis.seo.optimized_description,
      keywords: JSON.stringify(analysis.seo.keywords),
      tags: JSON.stringify(analysis.seo.tags),
      attributes: JSON.stringify(analysis.attributes),
      imageAnalysis: analysis.image_analysis
        ? JSON.stringify(analysis.image_analysis)
        : null,
      rawResponse: JSON.stringify(analysis),
      analyzedAt: new Date(),
    },
  });

  // 6. Apply changes if confidence meets threshold
  const meetsThreshold =
    analysis.classification.confidence >= settings.confidenceThreshold;

  if (meetsThreshold) {
    // Apply SEO updates
    try {
      await updateProductSEO(admin, productGid, analysis.seo, {
        updateTitle: settings.updateTitle,
        updateDescription: settings.updateDescription,
      });
    } catch (error) {
      console.error("Failed to update SEO:", error);
    }

    // Write metafields
    try {
      await writeMetafields(admin, productGid, analysis);
    } catch (error) {
      console.error("Failed to write metafields:", error);
    }

    // Map category
    try {
      await mapCategory(
        admin,
        productGid,
        analysis.classification.google_category,
      );
    } catch (error) {
      console.error("Failed to map category:", error);
    }

    // Write attributes
    try {
      await writeAttributes(admin, productGid, analysis.attributes);
    } catch (error) {
      console.error("Failed to write attributes:", error);
    }
  }

  // 7. Increment usage counter
  await increment(shop);

  return {
    success: true,
    analysis,
  };
}

/**
 * Strip HTML tags from a string.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
