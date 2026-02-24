export const TAXOAI_API_URL = "https://api.taxoai.dev";

export const FREE_TIER_LIMIT = 25;

export const USAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const API_TIMEOUT_MS = 15_000; // 15 seconds

export const BATCH_POLL_INTERVAL_MS = 3_000; // 3 seconds

export const METAFIELD_NAMESPACE = "taxoai";

export const SUPPORTED_LANGUAGES = ["en", "es", "pt"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const CONFIDENCE_LEVELS = {
  HIGH: 0.85,
  MEDIUM: 0.7,
  LOW: 0.5,
} as const;
