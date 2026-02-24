import type { AttributeResult } from "./taxoai-client";
import { METAFIELD_NAMESPACE } from "./constants";
import type { AdminGraphQL } from "./constants";

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
 * Write product attributes as individual typed metafields on a Shopify product.
 * Writes color, material, gender, and style as separate metafields.
 */
export async function writeAttributes(
  admin: AdminGraphQL,
  productGid: string,
  attributes: AttributeResult,
): Promise<void> {
  const metafields: Array<{
    ownerId: string;
    namespace: string;
    key: string;
    type: string;
    value: string;
  }> = [];

  // Color (list of text values stored as JSON)
  if (attributes.color && attributes.color.length > 0) {
    metafields.push({
      ownerId: productGid,
      namespace: METAFIELD_NAMESPACE,
      key: "color",
      type: "json",
      value: JSON.stringify(attributes.color),
    });
  }

  // Material
  if (attributes.material) {
    metafields.push({
      ownerId: productGid,
      namespace: METAFIELD_NAMESPACE,
      key: "material",
      type: "single_line_text_field",
      value: attributes.material,
    });
  }

  // Gender
  if (attributes.gender) {
    metafields.push({
      ownerId: productGid,
      namespace: METAFIELD_NAMESPACE,
      key: "gender",
      type: "single_line_text_field",
      value: attributes.gender,
    });
  }

  // Style
  if (attributes.style) {
    metafields.push({
      ownerId: productGid,
      namespace: METAFIELD_NAMESPACE,
      key: "style",
      type: "single_line_text_field",
      value: attributes.style,
    });
  }

  // Extra attributes (stored as JSON)
  if (attributes.extra && Object.keys(attributes.extra).length > 0) {
    metafields.push({
      ownerId: productGid,
      namespace: METAFIELD_NAMESPACE,
      key: "extra_attributes",
      type: "json",
      value: JSON.stringify(attributes.extra),
    });
  }

  if (metafields.length === 0) {
    return;
  }

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
      `Failed to write attributes: ${errors.map((e) => e.message).join(", ")}`,
    );
  }
}
