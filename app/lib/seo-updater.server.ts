import type { SEOResult } from "./taxoai-client";

interface AdminGraphQL {
  (query: string, options?: { variables?: Record<string, unknown> }): Promise<{
    json: () => Promise<Record<string, unknown>>;
  }>;
}

interface SEOSettings {
  updateTitle: boolean;
  updateDescription: boolean;
}

const PRODUCT_UPDATE_MUTATION = `#graphql
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        title
        descriptionHtml
        seo {
          title
          description
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const TAGS_ADD_MUTATION = `#graphql
  mutation tagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Update the SEO fields on a Shopify product based on TaxoAI analysis.
 */
export async function updateProductSEO(
  admin: AdminGraphQL,
  productGid: string,
  seoData: SEOResult,
  settings: SEOSettings,
): Promise<void> {
  // Build product input for the mutation
  const input: Record<string, unknown> = {
    id: productGid,
    seo: {
      title: seoData.meta_title,
      description: seoData.meta_description,
    },
  };

  // Optionally update the product title
  if (settings.updateTitle && seoData.optimized_title) {
    input.title = seoData.optimized_title;
  }

  // Optionally update the product description
  if (settings.updateDescription && seoData.optimized_description) {
    input.descriptionHtml = seoData.optimized_description;
  }

  const updateResponse = await admin(PRODUCT_UPDATE_MUTATION, {
    variables: { input },
  });

  const updateResult = (await updateResponse.json()) as {
    data?: {
      productUpdate?: {
        userErrors?: Array<{ field: string[]; message: string }>;
      };
    };
  };

  const updateErrors =
    updateResult.data?.productUpdate?.userErrors ?? [];
  if (updateErrors.length > 0) {
    throw new Error(
      `Failed to update product SEO: ${updateErrors.map((e) => e.message).join(", ")}`,
    );
  }

  // Add tags without overwriting existing ones
  if (seoData.tags && seoData.tags.length > 0) {
    const tagsResponse = await admin(TAGS_ADD_MUTATION, {
      variables: {
        id: productGid,
        tags: seoData.tags,
      },
    });

    const tagsResult = (await tagsResponse.json()) as {
      data?: {
        tagsAdd?: {
          userErrors?: Array<{ field: string[]; message: string }>;
        };
      };
    };

    const tagsErrors = tagsResult.data?.tagsAdd?.userErrors ?? [];
    if (tagsErrors.length > 0) {
      console.warn(
        `Warning: Failed to add tags: ${tagsErrors.map((e) => e.message).join(", ")}`,
      );
    }
  }
}
