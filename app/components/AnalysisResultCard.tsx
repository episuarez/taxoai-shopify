import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Divider,
  Box,
  InlineGrid,
  Tag,
} from "@shopify/polaris";

interface KeywordEntry {
  keyword: string;
  volume: "high" | "medium" | "low";
}

interface AnalysisData {
  googleCategory?: string | null;
  googleCategoryId?: number | null;
  confidence?: number | null;
  seoTitle?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  optimizedDescription?: string | null;
  keywords?: KeywordEntry[];
  tags?: string[];
  attributes?: {
    color?: string[];
    material?: string;
    gender?: string;
    style?: string;
    extra?: Record<string, unknown>;
  } | null;
  imageAnalysis?: {
    detected_colors?: string[];
    detected_material?: string;
    detected_style?: string;
    background_quality?: string;
  } | null;
  processingTimeMs?: number | null;
  cached?: boolean | null;
  analyzedAt?: string;
}

interface AnalysisResultCardProps {
  analysis: AnalysisData;
}

export function AnalysisResultCard({ analysis }: AnalysisResultCardProps) {
  const confidenceTone = getConfidenceTone(analysis.confidence);

  return (
    <BlockStack gap="400">
      {/* Classification */}
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h2" variant="headingMd">
              Classification
            </Text>
            {analysis.confidence != null && (
              <Badge tone={confidenceTone}>
                {`${(analysis.confidence * 100).toFixed(0)}% confidence`}
              </Badge>
            )}
          </InlineStack>
          <Divider />
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              Google Category
            </Text>
            <Text as="p" variant="bodyMd">
              {analysis.googleCategory ?? "Not classified"}
            </Text>
            {analysis.googleCategoryId && (
              <Text as="p" variant="bodySm" tone="subdued">
                Category ID: {analysis.googleCategoryId}
              </Text>
            )}
          </BlockStack>
        </BlockStack>
      </Card>

      {/* SEO Preview */}
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            SEO Preview
          </Text>
          <Divider />
          <BlockStack gap="200">
            {analysis.metaTitle && (
              <Box>
                <Text as="p" variant="bodySm" tone="subdued">
                  Meta Title
                </Text>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {analysis.metaTitle}
                </Text>
              </Box>
            )}
            {analysis.metaDescription && (
              <Box>
                <Text as="p" variant="bodySm" tone="subdued">
                  Meta Description
                </Text>
                <Text as="p" variant="bodyMd">
                  {analysis.metaDescription}
                </Text>
              </Box>
            )}
            {analysis.seoTitle && (
              <Box>
                <Text as="p" variant="bodySm" tone="subdued">
                  Optimized Title
                </Text>
                <Text as="p" variant="bodyMd">
                  {analysis.seoTitle}
                </Text>
              </Box>
            )}
            {analysis.optimizedDescription && (
              <Box>
                <Text as="p" variant="bodySm" tone="subdued">
                  Optimized Description
                </Text>
                <Text as="p" variant="bodyMd">
                  {analysis.optimizedDescription.substring(0, 200)}
                  {analysis.optimizedDescription.length > 200 ? "..." : ""}
                </Text>
              </Box>
            )}
          </BlockStack>
        </BlockStack>
      </Card>

      {/* Keywords */}
      {analysis.keywords && analysis.keywords.length > 0 && (
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Keywords
            </Text>
            <Divider />
            <InlineStack gap="200" wrap>
              {analysis.keywords.map((kw, i) => (
                <Tag key={i}>
                  {kw.keyword}
                  {kw.volume ? ` (${kw.volume})` : ""}
                </Tag>
              ))}
            </InlineStack>
          </BlockStack>
        </Card>
      )}

      {/* Tags */}
      {analysis.tags && analysis.tags.length > 0 && (
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Suggested Tags
            </Text>
            <Divider />
            <InlineStack gap="200" wrap>
              {analysis.tags.map((tag, i) => (
                <Badge key={i}>{tag}</Badge>
              ))}
            </InlineStack>
          </BlockStack>
        </Card>
      )}

      {/* Attributes */}
      {analysis.attributes && (
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Product Attributes
            </Text>
            <Divider />
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
              {analysis.attributes.color &&
                analysis.attributes.color.length > 0 && (
                  <Box>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Colors
                    </Text>
                    <InlineStack gap="100">
                      {analysis.attributes.color.map((c, i) => (
                        <Badge key={i}>{c}</Badge>
                      ))}
                    </InlineStack>
                  </Box>
                )}
              {analysis.attributes.material && (
                <Box>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Material
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {analysis.attributes.material}
                  </Text>
                </Box>
              )}
              {analysis.attributes.gender && (
                <Box>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Gender
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {analysis.attributes.gender}
                  </Text>
                </Box>
              )}
              {analysis.attributes.style && (
                <Box>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Style
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {analysis.attributes.style}
                  </Text>
                </Box>
              )}
              {analysis.attributes.extra &&
                Object.keys(analysis.attributes.extra).length > 0 &&
                Object.entries(analysis.attributes.extra).map(([key, value]) => (
                  <Box key={key}>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {key}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {String(value)}
                    </Text>
                  </Box>
                ))}
            </InlineGrid>
          </BlockStack>
        </Card>
      )}

      {/* Image Analysis */}
      {analysis.imageAnalysis && (
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Image Analysis
            </Text>
            <Divider />
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
              {analysis.imageAnalysis.detected_colors &&
                analysis.imageAnalysis.detected_colors.length > 0 && (
                  <Box>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Detected Colors
                    </Text>
                    <InlineStack gap="100">
                      {analysis.imageAnalysis.detected_colors.map((c, i) => (
                        <Badge key={i}>{c}</Badge>
                      ))}
                    </InlineStack>
                  </Box>
                )}
              {analysis.imageAnalysis.detected_material && (
                <Box>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Detected Material
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {analysis.imageAnalysis.detected_material}
                  </Text>
                </Box>
              )}
              {analysis.imageAnalysis.detected_style && (
                <Box>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Detected Style
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {analysis.imageAnalysis.detected_style}
                  </Text>
                </Box>
              )}
              {analysis.imageAnalysis.background_quality && (
                <Box>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Background Quality
                  </Text>
                  <Badge
                    tone={
                      analysis.imageAnalysis.background_quality === "good"
                        ? "success"
                        : "warning"
                    }
                  >
                    {analysis.imageAnalysis.background_quality}
                  </Badge>
                </Box>
              )}
            </InlineGrid>
          </BlockStack>
        </Card>
      )}

      {/* Analysis Metadata */}
      <Box>
        <InlineStack gap="300" wrap>
          <Text as="p" variant="bodySm" tone="subdued">
            Analyzed on{" "}
            {analysis.analyzedAt ? new Date(analysis.analyzedAt).toLocaleString() : "Unknown"}
          </Text>
          {analysis.processingTimeMs != null && (
            <Text as="p" variant="bodySm" tone="subdued">
              {analysis.processingTimeMs}ms
            </Text>
          )}
          {analysis.cached && (
            <Badge tone="info">Cached</Badge>
          )}
        </InlineStack>
      </Box>
    </BlockStack>
  );
}

function getConfidenceTone(
  confidence: number | null | undefined,
): "success" | "info" | "warning" | "critical" {
  if (confidence == null) return "info";
  if (confidence >= 0.85) return "success";
  if (confidence >= 0.7) return "info";
  if (confidence >= 0.5) return "warning";
  return "critical";
}

