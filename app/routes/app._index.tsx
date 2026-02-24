import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  DataTable,
  EmptyState,
  Box,
  InlineGrid,
  Divider,
  Link,
} from "@shopify/polaris";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getUsage } from "~/lib/usage-tracker.server";
import { UsageBanner } from "~/components/UsageBanner";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // Get shop settings
  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  // Get usage info
  let usageInfo = null;
  if (settings?.apiKey) {
    try {
      usageInfo = await getUsage(shop, settings.apiKey);
    } catch {
      // If usage fetch fails, show defaults
    }
  }

  // Get recent analyses
  const recentAnalyses = await prisma.productAnalysis.findMany({
    where: { shop },
    orderBy: { analyzedAt: "desc" },
    take: 10,
  });

  // Get aggregate stats
  const totalAnalyzed = await prisma.productAnalysis.count({
    where: { shop },
  });

  const avgConfidenceResult = await prisma.productAnalysis.aggregate({
    where: { shop, confidence: { not: null } },
    _avg: { confidence: true },
  });

  const lowConfidenceCount = await prisma.productAnalysis.count({
    where: { shop, confidence: { lt: 0.7 } },
  });

  return json({
    hasApiKey: !!settings?.apiKey,
    usageInfo,
    recentAnalyses: recentAnalyses.map((a) => ({
      id: a.id,
      shopifyProductId: a.shopifyProductId,
      googleCategory: a.googleCategory,
      confidence: a.confidence,
      analyzedAt: a.analyzedAt.toISOString(),
    })),
    stats: {
      totalAnalyzed,
      avgConfidence: avgConfidenceResult._avg.confidence ?? 0,
      lowConfidenceCount,
    },
  });
};

export default function DashboardPage() {
  const { hasApiKey, usageInfo, recentAnalyses, stats } =
    useLoaderData<typeof loader>();

  if (!hasApiKey) {
    return (
      <Page title="TaxoAI Dashboard">
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="Welcome to TaxoAI"
                action={{
                  content: "Configure API Key",
                  url: "/app/settings",
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Get started by configuring your TaxoAI API key in Settings.
                  TaxoAI will automatically categorize your products and
                  generate SEO-optimized content.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const confidenceBadge = (confidence: number | null) => {
    if (confidence === null) return <Badge>Unknown</Badge>;
    if (confidence >= 0.85) return <Badge tone="success">{`High (${(confidence * 100).toFixed(0)}%)`}</Badge>;
    if (confidence >= 0.7) return <Badge tone="info">{`Medium (${(confidence * 100).toFixed(0)}%)`}</Badge>;
    if (confidence >= 0.5) return <Badge tone="warning">{`Low (${(confidence * 100).toFixed(0)}%)`}</Badge>;
    return <Badge tone="critical">{`Very Low (${(confidence * 100).toFixed(0)}%)`}</Badge>;
  };

  const rows = recentAnalyses.map((analysis) => [
    <Link url={`/app/products/${analysis.shopifyProductId}`} key={analysis.id}>
      Product #{analysis.shopifyProductId}
    </Link>,
    analysis.googleCategory ?? "N/A",
    confidenceBadge(analysis.confidence),
    new Date(analysis.analyzedAt).toLocaleDateString(),
  ]);

  return (
    <Page title="TaxoAI Dashboard">
      <Layout>
        {usageInfo && (
          <Layout.Section>
            <UsageBanner usage={usageInfo} />
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Total Analyzed
                </Text>
                <Text as="p" variant="headingXl">
                  {stats.totalAnalyzed}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  products categorized
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Average Confidence
                </Text>
                <Text as="p" variant="headingXl">
                  {(stats.avgConfidence * 100).toFixed(1)}%
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  classification accuracy
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Needs Review
                </Text>
                <Text as="p" variant="headingXl">
                  {stats.lowConfidenceCount}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  low confidence products
                </Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {usageInfo && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Usage
                </Text>
                <Divider />
                <InlineStack gap="400" align="space-between">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Plan
                    </Text>
                    <Badge tone={usageInfo.tier === "free" ? "info" : "success"}>
                      {usageInfo.tier.charAt(0).toUpperCase() +
                        usageInfo.tier.slice(1)}
                    </Badge>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Products Used
                    </Text>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {usageInfo.productsUsed} / {usageInfo.productsLimit}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Percentage Used
                    </Text>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {usageInfo.percentageUsed.toFixed(1)}%
                    </Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Recent Analyses
              </Text>
              {recentAnalyses.length === 0 ? (
                <Box padding="400">
                  <Text as="p" tone="subdued" alignment="center">
                    No products have been analyzed yet. Use Bulk Analyze to get
                    started.
                  </Text>
                </Box>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text"]}
                  headings={["Product", "Category", "Confidence", "Date"]}
                  rows={rows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
