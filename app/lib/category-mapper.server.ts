import type { AdminGraphQL } from "./constants";

const PRODUCT_UPDATE_MUTATION = `#graphql
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        productType
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Map a Google product taxonomy category to Shopify's productType field.
 * Uses the leaf category from the full Google category path.
 */
export async function mapCategory(
  admin: AdminGraphQL,
  productGid: string,
  googleCategory: string,
): Promise<void> {
  // Extract the most specific (leaf) category from the full path
  // e.g., "Apparel & Accessories > Clothing > Dresses" → "Dresses"
  const parts = googleCategory.split(" > ");
  const leafCategory = parts[parts.length - 1] || googleCategory;

  const response = await admin(PRODUCT_UPDATE_MUTATION, {
    variables: {
      input: {
        id: productGid,
        productType: leafCategory,
      },
    },
  });

  const result = (await response.json()) as {
    data?: {
      productUpdate?: {
        userErrors?: Array<{ field: string[]; message: string }>;
      };
    };
  };

  const errors = result.data?.productUpdate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(
      `Failed to map category: ${errors.map((e) => e.message).join(", ")}`,
    );
  }
}
