/**
 * TaxoAI Product Taxonomy Schema Extension
 *
 * This extension defines the metafield definitions for TaxoAI data
 * stored on Shopify products. These metafields hold the analysis results
 * from the TaxoAI API including Google product taxonomy classification,
 * SEO data, and product attributes.
 *
 * Metafield definitions:
 * - taxoai.google_category: Google Product Taxonomy category path
 * - taxoai.google_category_id: Google Product Taxonomy category ID
 * - taxoai.confidence: Classification confidence score (0-1)
 * - taxoai.attributes: JSON object with color, material, gender, style
 * - taxoai.keywords: JSON array of keyword objects with volume
 * - taxoai.analyzed_at: ISO 8601 timestamp of last analysis
 * - taxoai.color: JSON array of detected colors
 * - taxoai.material: Material string
 * - taxoai.gender: Gender string
 * - taxoai.style: Style string
 */

export const METAFIELD_DEFINITIONS = [
  {
    namespace: "taxoai",
    key: "google_category",
    name: "Google Category",
    description: "Google Product Taxonomy category path from TaxoAI analysis",
    type: "single_line_text_field",
    ownerType: "PRODUCT",
  },
  {
    namespace: "taxoai",
    key: "google_category_id",
    name: "Google Category ID",
    description: "Google Product Taxonomy numeric category ID",
    type: "number_integer",
    ownerType: "PRODUCT",
  },
  {
    namespace: "taxoai",
    key: "confidence",
    name: "Classification Confidence",
    description: "TaxoAI classification confidence score (0 to 1)",
    type: "number_decimal",
    ownerType: "PRODUCT",
  },
  {
    namespace: "taxoai",
    key: "attributes",
    name: "Product Attributes",
    description: "JSON object containing detected product attributes",
    type: "json",
    ownerType: "PRODUCT",
  },
  {
    namespace: "taxoai",
    key: "keywords",
    name: "SEO Keywords",
    description: "JSON array of SEO keywords with search volumes",
    type: "json",
    ownerType: "PRODUCT",
  },
  {
    namespace: "taxoai",
    key: "analyzed_at",
    name: "Last Analyzed",
    description: "ISO 8601 timestamp of the last TaxoAI analysis",
    type: "single_line_text_field",
    ownerType: "PRODUCT",
  },
  {
    namespace: "taxoai",
    key: "color",
    name: "Product Colors",
    description: "JSON array of detected product colors",
    type: "json",
    ownerType: "PRODUCT",
  },
  {
    namespace: "taxoai",
    key: "material",
    name: "Product Material",
    description: "Detected product material",
    type: "single_line_text_field",
    ownerType: "PRODUCT",
  },
  {
    namespace: "taxoai",
    key: "gender",
    name: "Target Gender",
    description: "Detected target gender for the product",
    type: "single_line_text_field",
    ownerType: "PRODUCT",
  },
  {
    namespace: "taxoai",
    key: "style",
    name: "Product Style",
    description: "Detected product style",
    type: "single_line_text_field",
    ownerType: "PRODUCT",
  },
] as const;

export type MetafieldDefinition = (typeof METAFIELD_DEFINITIONS)[number];
