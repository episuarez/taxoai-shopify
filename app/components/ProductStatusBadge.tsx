import { Badge } from "@shopify/polaris";

interface ProductStatusBadgeProps {
  analyzed: boolean;
  confidence: number | null;
  failed?: boolean;
}

export function ProductStatusBadge({
  analyzed,
  confidence,
  failed = false,
}: ProductStatusBadgeProps) {
  if (failed) {
    return <Badge tone="critical">Failed</Badge>;
  }

  if (!analyzed) {
    return <Badge tone="info">Pending</Badge>;
  }

  if (confidence === null) {
    return <Badge tone="success">Analyzed</Badge>;
  }

  if (confidence >= 0.7) {
    return (
      <Badge tone="success">
        {`Analyzed (${(confidence * 100).toFixed(0)}%)`}
      </Badge>
    );
  }

  return (
    <Badge tone="warning">
      {`Low Confidence (${(confidence * 100).toFixed(0)}%)`}
    </Badge>
  );
}
