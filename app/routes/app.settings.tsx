import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Select,
  Checkbox,
  RangeSlider,
  Button,
  Banner,
  BlockStack,
  Text,
  InlineStack,
  Box,
  Divider,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";

import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { TaxoAIClient } from "~/lib/taxoai-client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  return json({
    settings: settings
      ? {
          apiKey: settings.apiKey,
          language: settings.language,
          autoAnalyze: settings.autoAnalyze,
          confidenceThreshold: settings.confidenceThreshold,
          analyzeImages: settings.analyzeImages,
          updateTitle: settings.updateTitle,
          updateDescription: settings.updateDescription,
        }
      : {
          apiKey: "",
          language: "en",
          autoAnalyze: true,
          confidenceThreshold: 0.7,
          analyzeImages: false,
          updateTitle: false,
          updateDescription: false,
        },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const apiKey = String(formData.get("apiKey") ?? "");
  const language = String(formData.get("language") ?? "en");
  const autoAnalyze = formData.get("autoAnalyze") === "true";
  const confidenceThreshold = parseFloat(
    String(formData.get("confidenceThreshold") ?? "0.7"),
  );
  const analyzeImages = formData.get("analyzeImages") === "true";
  const updateTitle = formData.get("updateTitle") === "true";
  const updateDescription = formData.get("updateDescription") === "true";

  // Validate API key by calling /v1/usage
  if (apiKey) {
    try {
      const client = new TaxoAIClient(apiKey);
      await client.getUsage();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      return json(
        {
          success: false,
          error: `Invalid API key: ${message}`,
        },
        { status: 400 },
      );
    }
  }

  // Save settings
  await prisma.shopSettings.upsert({
    where: { shop },
    create: {
      shop,
      apiKey,
      language,
      autoAnalyze,
      confidenceThreshold,
      analyzeImages,
      updateTitle,
      updateDescription,
    },
    update: {
      apiKey,
      language,
      autoAnalyze,
      confidenceThreshold,
      analyzeImages,
      updateTitle,
      updateDescription,
    },
  });

  return json({ success: true, error: null });
};

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isSubmitting = navigation.state === "submitting";

  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [language, setLanguage] = useState(settings.language);
  const [autoAnalyze, setAutoAnalyze] = useState(settings.autoAnalyze);
  const [confidenceThreshold, setConfidenceThreshold] = useState(
    settings.confidenceThreshold,
  );
  const [analyzeImages, setAnalyzeImages] = useState(settings.analyzeImages);
  const [updateTitle, setUpdateTitle] = useState(settings.updateTitle);
  const [updateDescription, setUpdateDescription] = useState(
    settings.updateDescription,
  );

  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (actionData?.success) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionData]);

  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.set("apiKey", apiKey);
    formData.set("language", language);
    formData.set("autoAnalyze", String(autoAnalyze));
    formData.set("confidenceThreshold", String(confidenceThreshold));
    formData.set("analyzeImages", String(analyzeImages));
    formData.set("updateTitle", String(updateTitle));
    formData.set("updateDescription", String(updateDescription));
    submit(formData, { method: "post" });
  }, [
    apiKey,
    language,
    autoAnalyze,
    confidenceThreshold,
    analyzeImages,
    updateTitle,
    updateDescription,
    submit,
  ]);

  const handleThresholdChange = useCallback(
    (value: number | [number, number]) => {
      const numValue = Array.isArray(value) ? value[0] : value;
      setConfidenceThreshold(numValue);
    },
    [],
  );

  const languageOptions = [
    { label: "English", value: "en" },
    { label: "Spanish", value: "es" },
    { label: "Portuguese", value: "pt" },
  ];

  return (
    <Page
      title="Settings"
      primaryAction={{
        content: "Save",
        onAction: handleSubmit,
        loading: isSubmitting,
      }}
    >
      <Layout>
        {showSuccess && (
          <Layout.Section>
            <Banner
              title="Settings saved successfully"
              tone="success"
              onDismiss={() => setShowSuccess(false)}
            />
          </Layout.Section>
        )}

        {actionData?.error && (
          <Layout.Section>
            <Banner title="Error saving settings" tone="critical">
              <p>{actionData.error}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.AnnotatedSection
          title="API Configuration"
          description="Enter your TaxoAI API key to enable product analysis. You can obtain a key from the TaxoAI dashboard."
        >
          <Card>
            <FormLayout>
              <TextField
                label="API Key"
                value={apiKey}
                onChange={setApiKey}
                type="password"
                autoComplete="off"
                helpText="Your TaxoAI API key. The key will be validated when you save."
              />
              <Select
                label="Language"
                options={languageOptions}
                value={language}
                onChange={setLanguage}
                helpText="Language for product analysis and SEO content generation."
              />
            </FormLayout>
          </Card>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection
          title="Analysis Behavior"
          description="Configure when and how products are analyzed."
        >
          <Card>
            <FormLayout>
              <Checkbox
                label="Auto-analyze new products"
                checked={autoAnalyze}
                onChange={setAutoAnalyze}
                helpText="Automatically analyze products when they are created or updated."
              />
              <Box paddingBlockStart="200">
                <BlockStack gap="200">
                  <Text as="span" variant="bodyMd">
                    Confidence Threshold: {(confidenceThreshold * 100).toFixed(0)}%
                  </Text>
                  <RangeSlider
                    label="Confidence threshold"
                    labelHidden
                    value={confidenceThreshold}
                    min={0.3}
                    max={1.0}
                    step={0.05}
                    onChange={handleThresholdChange}
                    output
                  />
                  <Text as="span" variant="bodySm" tone="subdued">
                    Only apply changes automatically when confidence is at or above this threshold.
                  </Text>
                </BlockStack>
              </Box>
              <Checkbox
                label="Analyze product images"
                checked={analyzeImages}
                onChange={setAnalyzeImages}
                helpText="Use AI to analyze product images for colors, materials, and style. This may use additional API credits."
              />
            </FormLayout>
          </Card>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection
          title="Content Updates"
          description="Choose what product fields TaxoAI should update with optimized content."
        >
          <Card>
            <FormLayout>
              <Checkbox
                label="Update product title"
                checked={updateTitle}
                onChange={setUpdateTitle}
                helpText="Replace the product title with the SEO-optimized version from TaxoAI."
              />
              <Checkbox
                label="Update product description"
                checked={updateDescription}
                onChange={setUpdateDescription}
                helpText="Replace the product description with the SEO-optimized version from TaxoAI."
              />
              <Divider />
              <Text as="p" variant="bodySm" tone="subdued">
                SEO meta title and meta description are always updated. Tags
                are added without overwriting existing ones. Google category
                and product attributes are always written as metafields.
              </Text>
            </FormLayout>
          </Card>
        </Layout.AnnotatedSection>
      </Layout>
    </Page>
  );
}
