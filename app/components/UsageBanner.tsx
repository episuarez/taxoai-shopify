import { Banner, BlockStack, Text, ProgressBar, InlineStack } from "@shopify/polaris";

interface UsageInfo {
  tier: string;
  productsUsed: number;
  productsLimit: number;
  percentageUsed: number;
  canAnalyze: boolean;
}

interface UsageBannerProps {
  usage: UsageInfo;
}

export function UsageBanner({ usage }: UsageBannerProps) {
  const { tier, productsUsed, productsLimit, percentageUsed, canAnalyze } =
    usage;

  // Critical: at or over limit
  if (!canAnalyze) {
    return (
      <Banner
        title="Usage limit reached"
        tone="critical"
        action={
          tier === "free"
            ? {
                content: "Upgrade Plan",
                url: "https://taxoai.dev/pricing",
                external: true,
              }
            : undefined
        }
      >
        <BlockStack gap="200">
          <Text as="p" variant="bodyMd">
            You have used {productsUsed} of {productsLimit} products this
            month. Upgrade your plan to continue analyzing products.
          </Text>
          <ProgressBar progress={100} size="small" tone="critical" />
        </BlockStack>
      </Banner>
    );
  }

  // Warning: approaching limit (>80%)
  if (percentageUsed >= 80) {
    return (
      <Banner
        title="Approaching usage limit"
        tone="warning"
        action={
          tier === "free"
            ? {
                content: "Upgrade Plan",
                url: "https://taxoai.dev/pricing",
                external: true,
              }
            : undefined
        }
      >
        <BlockStack gap="200">
          <Text as="p" variant="bodyMd">
            You have used {productsUsed} of {productsLimit} products this
            month ({percentageUsed.toFixed(0)}%).
          </Text>
          <ProgressBar
            progress={Math.min(percentageUsed, 100)}
            size="small"
          />
        </BlockStack>
      </Banner>
    );
  }

  // Info: normal usage
  if (percentageUsed >= 50) {
    return (
      <Banner title="Usage" tone="info">
        <BlockStack gap="200">
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" variant="bodyMd">
              {productsUsed} / {productsLimit} products used this month
            </Text>
          </InlineStack>
          <ProgressBar
            progress={percentageUsed}
            size="small"
          />
        </BlockStack>
      </Banner>
    );
  }

  // No banner needed for low usage
  return null;
}
