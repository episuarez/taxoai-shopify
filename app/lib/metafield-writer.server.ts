import type { AnalyzeResponse } from "./taxoai-client";
import { METAFIELD_NAMESPACE } from "./constants";

interface AdminGraphQL {
  (query: string, options?: { variables?: Record<string, unknown> }): Promise<{
    json: () => Promise<Record<string, unknown>>;
  }>;
}

const METAFIELDS_SET_MUTATION = `#graphql
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Write TaxoAI analysis data as metafields on a Shopify product.
 */
export async function writeMetafields(
  admin: AdminGraphQL,
  productGid: string,
  analysis: AnalyzeResponse,
): Promise<void> {
  const metafields = [
    {
      ownerId: productGid,
      namespace: METAFIELD_NAMESPACE,
      key: "google_category",
      type: "single_line_text_field",
      value: analysis.classification.google_category,
    },
    {
      ownerId: productGid,
      namespace: METAFIELD_NAMESPACE,
      key: "google_category_id",
      type: "number_integer",
      value: String(analysis.classification.google_category_id),
    },
    {
      ownerId: productGid,
      namespace: METAFIELD_NAMESPACE,
      key: "confidence",
      type: "number_decimal",
      value: String(analysis.classification.confidence),
    },
    {
      ownerId: productGid,
      namespace: METAFIELD_NAMESPACE,
      key: "attributes",
      type: "json",
      value: JSON.stringify(analysis.attributes),
    },
    {
      ownerId: productGid,
      namespace: METAFIELD_NAMESPACE,
      key: "keywords",
      type: "json",
      value: JSON.stringify(analysis.seo.keywords),
    },
    {
      ownerId: productGid,
      namespace: METAFIELD_NAMESPACE,
      key: "analyzed_at",
      type: "single_line_text_field",
      value: new Date().toISOString(),
    },
  ];

  const response = await admin(METAFIELDS_SET_MUTATION, {
    variables: { metafields },
  });

  const result = (await response.json()) as {
    data?: {
      metafieldsSet?: {
        userErrors?: Array<{ field: string[]; message: string }>;
      };
    };
  };

  const errors = result.data?.metafieldsSet?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(
      `Failed to write metafields: ${errors.map((e) => e.message).join(", ")}`,
    );
  }
}
