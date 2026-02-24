import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  InlineStack,
  Badge,
  Box,
  Divider,
  SkeletonBodyText,
  Thumbnail,
  InlineGrid,
} from "@shopify/polaris";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { analyzeShopifyProduct } from "~/lib/analyzer.server";
import { AnalysisResultCard } from "~/components/AnalysisResultCard";
import { ProductStatusBadge } from "~/components/ProductStatusBadge";
import { TaxonomySearch } from "~/components/TaxonomySearch";

const PRODUCT_QUERY = `#graphql
  query product($id: ID!) {
    product(id: $id) {
      id
      title
      descriptionHtml
      productType
      status
      tags
      priceRangeV2 {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      featuredImage {
        url
        altText
      }
      images(first: 5) {
        edges {
          node {
            url
            altText
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
  status: string;
  tags: string[];
  priceRangeV2: {
    minVariantPrice: { amount: string; currencyCode: string };
  };
  featuredImage: { url: string; altText: string | null } | null;
  images: {
    edges: Array<{ node: { url: string; altText: string | null } }>;
  };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const productId = params.id!;
  const productGid = `gid://shopify/Product/${productId}`;

  // Fetch product from Shopify
  const productResponse = await admin.graphql(PRODUCT_QUERY, {
    variables: { id: productGid },
  });
  const productResult = (await productResponse.json()) as {
    data?: { product?: ShopifyProduct };
  };
  const product = productResult.data?.product ?? null;

  // Fetch existing analysis from DB
  const analysis = await prisma.productAnalysis.findUnique({
    where: {
      shop_shopifyProductId: { shop, shopifyProductId: productId },
    },
  });

  // Get settings
  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  return json({
    productId,
    product: product
      ? {
          id: product.id,
          title: product.title,
          descriptionHtml: product.descriptionHtml,
          productType: product.productType,
          status: product.status,
          tags: product.tags,
          price: product.priceRangeV2.minVariantPrice.amount,
          currency: product.priceRangeV2.minVariantPrice.currencyCode,
          imageUrl: product.featuredImage?.url ?? null,
          images: product.images.edges.map((e) => e.node.url),
        }
      : null,
    analysis: analysis
      ? {
          googleCategory: analysis.googleCategory,
          googleCategoryId: analysis.googleCategoryId,
          confidence: analysis.confidence,
          seoTitle: analysis.seoTitle,
          metaTitle: analysis.metaTitle,
          metaDescription: analysis.metaDescription,
          optimizedDescription: analysis.optimizedDescription,
          keywords: analysis.keywords ? JSON.parse(analysis.keywords) : [],
          tags: analysis.tags ? JSON.parse(analysis.tags) : [],
          attributes: analysis.attributes
            ? JSON.parse(analysis.attributes)
            : null,
          imageAnalysis: analysis.imageAnalysis
            ? JSON.parse(analysis.imageAnalysis)
            : null,
          processingTimeMs: null,
          cached: null,
          analyzedAt: analysis.analyzedAt.toISOString(),
        }
      : null,
    hasApiKey: !!settings?.apiKey,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const productId = params.id!;

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "analyze");

  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  if (!settings?.apiKey) {
    return json(
      { success: false, error: "API key not configured" },
      { status: 400 },
    );
  }

  if (intent === "analyze") {
    const result = await analyzeShopifyProduct(shop, productId, admin.graphql, {
      apiKey: settings.apiKey,
      language: settings.language,
      autoAnalyze: settings.autoAnalyze,
      confidenceThreshold: settings.confidenceThreshold,
      analyzeImages: settings.analyzeImages,
      updateTitle: settings.updateTitle,
      updateDescription: settings.updateDescription,
    });

    if (!result.success) {
      return json({ success: false, error: result.error }, { status: 400 });
    }

    return json({ success: true, error: null });
  }

  return json({ success: false, error: "Unknown action" }, { status: 400 });
};

export default function ProductDetailPage() {
  const { productId, product, analysis, hasApiKey } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isAnalyzing =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "analyze";

  const handleAnalyze = () => {
    const formData = new FormData();
    formData.set("intent", "analyze");
    submit(formData, { method: "post" });
  };

  if (!product) {
    return (
      <Page title={`Product #${productId}`}>
        <Layout>
          <Layout.Section>
            <Banner title="Product not found" tone="critical">
              <p>
                The product with ID {productId} could not be found in your
                store.
              </p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title={product.title}
      backAction={{ url: "/app" }}
      primaryAction={
        hasApiKey
          ? {
              content: isAnalyzing ? "Analyzing..." : "Analyze",
              onAction: handleAnalyze,
              loading: isAnalyzing,
              disabled: isAnalyzing,
            }
          : undefined
      }
      titleMetadata={
        <ProductStatusBadge
          analyzed={!!analysis}
          confidence={analysis?.confidence ?? null}
        />
      }
    >
      <Layout>
        {actionData?.error && (
          <Layout.Section>
            <Banner title="Analysis Error" tone="critical">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        {actionData?.success && (
          <Layout.Section>
            <Banner title="Analysis complete" tone="success">
              <p>
                Product has been analyzed and updated successfully.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {!hasApiKey && (
          <Layout.Section>
            <Banner title="API key required" tone="warning" action={{ content: "Go to Settings", url: "/app/settings" }}>
              <p>
                Configure your TaxoAI API key in Settings to analyze products.
              </p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <InlineStack gap="400" align="start" blockAlign="start">
              {product.imageUrl && (
                <Thumbnail
                  source={product.imageUrl}
                  alt={product.title}
                  size="large"
                />
              )}
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  {product.title}
                </Text>
                <InlineStack gap="200">
                  <Badge>{product.status}</Badge>
                  {product.productType && (
                    <Badge tone="info">{product.productType}</Badge>
                  )}
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {product.currency} {parseFloat(product.price).toFixed(2)}
                </Text>
                {product.tags.length > 0 && (
                  <InlineStack gap="100">
                    {product.tags.slice(0, 5).map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                    {product.tags.length > 5 && (
                      <Text as="span" variant="bodySm" tone="subdued">
                        +{product.tags.length - 5} more
                      </Text>
                    )}
                  </InlineStack>
                )}
              </BlockStack>
            </InlineStack>
          </Card>
        </Layout.Section>

        {isAnalyzing && (
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Analyzing product...
                </Text>
                <SkeletonBodyText lines={5} />
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {analysis && !isAnalyzing && (
          <Layout.Section>
            <AnalysisResultCard analysis={analysis} />
          </Layout.Section>
        )}

        {!analysis && !isAnalyzing && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300" inlineAlign="center">
                <Text as="p" alignment="center" tone="subdued">
                  This product has not been analyzed yet.
                </Text>
                {hasApiKey && (
                  <Button onClick={handleAnalyze} variant="primary">
                    Analyze Now
                  </Button>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {hasApiKey && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Manual Category Override
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Search for a Google Product Taxonomy category to manually
                  assign to this product.
                </Text>
                <TaxonomySearch productId={productId} />
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
