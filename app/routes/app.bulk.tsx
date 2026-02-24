import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
  useFetcher,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  IndexTable,
  useIndexResourceState,
  Badge,
  InlineStack,
  Thumbnail,
  Select,
  Box,
  Divider,
  ProgressBar,
  Filters,
} from "@shopify/polaris";
import { useState, useCallback, useEffect, useRef } from "react";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import {
  submitBatchAnalysis,
  pollJob,
  processBatchResults,
} from "~/lib/batch-processor.server";
import { BatchProgressBar } from "~/components/BatchProgressBar";

const PRODUCTS_QUERY = `#graphql
  query products($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      edges {
        node {
          id
          title
          status
          productType
          featuredImage {
            url
            altText
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

interface ShopifyProductNode {
  id: string;
  title: string;
  status: string;
  productType: string;
  featuredImage: { url: string; altText: string | null } | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") ?? "all";

  // Fetch products from Shopify
  const productsResponse = await admin.graphql(PRODUCTS_QUERY, {
    variables: { first: 50, after: null, query: null },
  });

  const productsResult = (await productsResponse.json()) as {
    data?: {
      products?: {
        edges: Array<{ node: ShopifyProductNode }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  };

  const allProducts =
    productsResult.data?.products?.edges.map((e) => e.node) ?? [];

  // Get analyzed product IDs from DB
  const analyzedProducts = await prisma.productAnalysis.findMany({
    where: { shop },
    select: {
      shopifyProductId: true,
      confidence: true,
    },
  });

  const analyzedMap = new Map(
    analyzedProducts.map((a) => [a.shopifyProductId, a.confidence]),
  );

  // Map and filter products
  const products = allProducts
    .map((p) => {
      const numericId = p.id.replace("gid://shopify/Product/", "");
      const confidence = analyzedMap.get(numericId) ?? null;
      const isAnalyzed = analyzedMap.has(numericId);
      return {
        id: numericId,
        gid: p.id,
        title: p.title,
        status: p.status,
        productType: p.productType,
        imageUrl: p.featuredImage?.url ?? null,
        analyzed: isAnalyzed,
        confidence,
      };
    })
    .filter((p) => {
      if (filter === "unanalyzed") return !p.analyzed;
      if (filter === "low-confidence")
        return p.analyzed && p.confidence !== null && p.confidence < 0.7;
      return true;
    });

  // Get settings
  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  return json({
    products,
    filter,
    hasApiKey: !!settings?.apiKey,
    hasNextPage:
      productsResult.data?.products?.pageInfo.hasNextPage ?? false,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  if (!settings?.apiKey) {
    return json(
      { success: false, error: "API key not configured", jobId: null, jobStatus: null },
      { status: 400 },
    );
  }

  if (intent === "batch-analyze") {
    const productIdsStr = String(formData.get("productIds") ?? "");
    const productIds = productIdsStr.split(",").filter(Boolean);

    if (productIds.length === 0) {
      return json(
        { success: false, error: "No products selected", jobId: null, jobStatus: null },
        { status: 400 },
      );
    }

    try {
      const batchResult = await submitBatchAnalysis(
        shop,
        productIds,
        admin.graphql,
        {
          apiKey: settings.apiKey,
          language: settings.language,
          confidenceThreshold: settings.confidenceThreshold,
          analyzeImages: settings.analyzeImages,
          updateTitle: settings.updateTitle,
          updateDescription: settings.updateDescription,
        },
      );

      return json({
        success: true,
        error: null,
        jobId: batchResult.job_id,
        jobStatus: batchResult.status,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      return json(
        { success: false, error: message, jobId: null, jobStatus: null },
        { status: 500 },
      );
    }
  }

  if (intent === "poll-job") {
    const jobId = String(formData.get("jobId") ?? "");
    const productIdsStr = String(formData.get("productIds") ?? "");
    const productIds = productIdsStr.split(",").filter(Boolean);

    try {
      const jobResult = await pollJob(settings.apiKey, jobId);

      // If job is complete, process results
      if (
        jobResult.status === "completed" &&
        jobResult.result &&
        jobResult.result.length > 0
      ) {
        await processBatchResults(
          shop,
          jobResult.result,
          productIds,
          admin.graphql,
          {
            apiKey: settings.apiKey,
            language: settings.language,
            confidenceThreshold: settings.confidenceThreshold,
            analyzeImages: settings.analyzeImages,
            updateTitle: settings.updateTitle,
            updateDescription: settings.updateDescription,
          },
        );
      }

      return json({
        success: true,
        error: null,
        jobId,
        jobStatus: jobResult.status,
        totalProducts: jobResult.total_products,
        processedProducts: jobResult.processed_products,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      return json(
        { success: false, error: message, jobId, jobStatus: "error" },
        { status: 500 },
      );
    }
  }

  return json(
    { success: false, error: "Unknown action", jobId: null, jobStatus: null },
    { status: 400 },
  );
};

export default function BulkAnalyzePage() {
  const { products, filter, hasApiKey, hasNextPage } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const pollFetcher = useFetcher<typeof action>();

  const [selectedFilter, setSelectedFilter] = useState(filter);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [totalProducts, setTotalProducts] = useState(0);
  const [processedProducts, setProcessedProducts] = useState(0);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(products);

  const isSubmitting = navigation.state === "submitting";

  // Handle batch submit result
  useEffect(() => {
    if (actionData?.jobId && actionData?.success) {
      setJobId(actionData.jobId);
      setJobStatus(actionData.jobStatus ?? "processing");
      setSelectedProductIds(selectedResources);
      setTotalProducts(selectedResources.length);
      setProcessedProducts(0);
    }
  }, [actionData, selectedResources]);

  // Poll for job status
  useEffect(() => {
    if (jobId && jobStatus && jobStatus !== "completed" && jobStatus !== "error") {
      pollIntervalRef.current = setInterval(() => {
        const formData = new FormData();
        formData.set("intent", "poll-job");
        formData.set("jobId", jobId);
        formData.set("productIds", selectedProductIds.join(","));
        pollFetcher.submit(formData, { method: "post" });
      }, 3000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [jobId, jobStatus, selectedProductIds, pollFetcher]);

  // Update job status from poll results
  useEffect(() => {
    if (pollFetcher.data) {
      const data = pollFetcher.data as {
        jobStatus?: string;
        totalProducts?: number;
        processedProducts?: number;
      };
      if (data.jobStatus) {
        setJobStatus(data.jobStatus);
      }
      if (data.totalProducts !== undefined) {
        setTotalProducts(data.totalProducts);
      }
      if (data.processedProducts !== undefined) {
        setProcessedProducts(data.processedProducts);
      }
      if (data.jobStatus === "completed" || data.jobStatus === "error") {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    }
  }, [pollFetcher.data]);

  const handleBatchAnalyze = useCallback(() => {
    const formData = new FormData();
    formData.set("intent", "batch-analyze");
    formData.set("productIds", selectedResources.join(","));
    submit(formData, { method: "post" });
  }, [selectedResources, submit]);

  const handleFilterChange = useCallback(
    (value: string) => {
      setSelectedFilter(value);
      submit({ filter: value }, { method: "get" });
    },
    [submit],
  );

  const filterOptions = [
    { label: "All products", value: "all" },
    { label: "Unanalyzed", value: "unanalyzed" },
    { label: "Low confidence", value: "low-confidence" },
  ];

  const rowMarkup = products.map((product, index) => (
    <IndexTable.Row
      id={product.id}
      key={product.id}
      selected={selectedResources.includes(product.id)}
      position={index}
    >
      <IndexTable.Cell>
        {product.imageUrl ? (
          <Thumbnail
            source={product.imageUrl}
            alt={product.title}
            size="small"
          />
        ) : (
          <Box
            background="bg-surface-secondary"
            borderRadius="200"
            minHeight="40px"
            minWidth="40px"
          />
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold" as="span">
          {product.title}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{product.productType || "N/A"}</IndexTable.Cell>
      <IndexTable.Cell>
        {product.analyzed ? (
          product.confidence !== null && product.confidence >= 0.7 ? (
            <Badge tone="success">Analyzed</Badge>
          ) : (
            <Badge tone="warning">Low Confidence</Badge>
          )
        ) : (
          <Badge>Not Analyzed</Badge>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        {product.confidence !== null
          ? `${(product.confidence * 100).toFixed(0)}%`
          : "-"}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  const isJobRunning =
    jobStatus !== null &&
    jobStatus !== "completed" &&
    jobStatus !== "error";

  return (
    <Page title="Bulk Analyze">
      <Layout>
        {!hasApiKey && (
          <Layout.Section>
            <Banner
              title="API key required"
              tone="warning"
              action={{ content: "Go to Settings", url: "/app/settings" }}
            >
              <p>
                Configure your TaxoAI API key in Settings to analyze products.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {actionData?.error && (
          <Layout.Section>
            <Banner title="Error" tone="critical">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        {isJobRunning && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Batch Analysis in Progress
                </Text>
                <BatchProgressBar
                  total={totalProducts}
                  processed={processedProducts}
                  status={jobStatus ?? "processing"}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {jobStatus === "completed" && (
          <Layout.Section>
            <Banner title="Batch analysis complete" tone="success" onDismiss={() => { setJobId(null); setJobStatus(null); }}>
              <p>
                All {totalProducts} products have been analyzed and updated.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {jobStatus === "error" && (
          <Layout.Section>
            <Banner title="Batch analysis failed" tone="critical" onDismiss={() => { setJobId(null); setJobStatus(null); }}>
              <p>
                The batch job encountered an error. Please try again.
              </p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card padding="0">
            <Box padding="400">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="300">
                  <Select
                    label="Filter"
                    labelInline
                    options={filterOptions}
                    value={selectedFilter}
                    onChange={handleFilterChange}
                  />
                  <Text as="span" variant="bodySm" tone="subdued">
                    {products.length} products
                  </Text>
                </InlineStack>
                {hasApiKey && (
                  <Button
                    variant="primary"
                    onClick={handleBatchAnalyze}
                    disabled={
                      selectedResources.length === 0 ||
                      isSubmitting ||
                      isJobRunning
                    }
                    loading={isSubmitting}
                  >
                    Analyze Selected ({selectedResources.length})
                  </Button>
                )}
              </InlineStack>
            </Box>
            <Divider />
            <IndexTable
              resourceName={resourceName}
              itemCount={products.length}
              selectedItemsCount={
                allResourcesSelected ? "All" : selectedResources.length
              }
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: "Image" },
                { title: "Product" },
                { title: "Type" },
                { title: "Status" },
                { title: "Confidence" },
              ]}
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
