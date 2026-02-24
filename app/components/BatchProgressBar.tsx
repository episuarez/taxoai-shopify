import { BlockStack, Text, ProgressBar, InlineStack, Badge } from "@shopify/polaris";

interface BatchProgressBarProps {
  total: number;
  processed: number;
  status: string;
}

export function BatchProgressBar({
  total,
  processed,
  status,
}: BatchProgressBarProps) {
  const progress = total > 0 ? (processed / total) * 100 : 0;

  const statusTone = getStatusTone(status);
  const statusLabel = getStatusLabel(status);

  return (
    <BlockStack gap="200">
      <InlineStack align="space-between" blockAlign="center">
        <InlineStack gap="200" blockAlign="center">
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {processed} of {total} products processed
          </Text>
          <Badge tone={statusTone}>{statusLabel}</Badge>
        </InlineStack>
        <Text as="span" variant="bodySm" tone="subdued">
          {progress.toFixed(0)}%
        </Text>
      </InlineStack>
      <ProgressBar progress={progress} size="small" tone={statusTone === "critical" ? "critical" : "primary"} />
      {status === "processing" && (
        <Text as="p" variant="bodySm" tone="subdued">
          Processing... This may take a few minutes for large batches.
        </Text>
      )}
    </BlockStack>
  );
}

function getStatusTone(
  status: string,
): "success" | "info" | "warning" | "critical" {
  switch (status) {
    case "completed":
      return "success";
    case "processing":
    case "queued":
      return "info";
    case "error":
    case "failed":
      return "critical";
    default:
      return "info";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Complete";
    case "processing":
      return "Processing";
    case "queued":
      return "Queued";
    case "error":
    case "failed":
      return "Failed";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
