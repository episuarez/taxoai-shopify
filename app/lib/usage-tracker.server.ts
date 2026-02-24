import prisma from "~/db.server";
import { TaxoAIClient, type UsageResponse } from "./taxoai-client";
import { FREE_TIER_LIMIT, USAGE_CACHE_TTL_MS } from "./constants";

function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export interface UsageInfo {
  tier: string;
  productsUsed: number;
  productsLimit: number;
  percentageUsed: number;
  canAnalyze: boolean;
}

/**
 * Check whether the shop is allowed to analyze another product.
 * Always calls the server to verify (unless cached within TTL).
 */
export async function canAnalyze(
  shop: string,
  apiKey: string,
): Promise<boolean> {
  const usage = await getUsage(shop, apiKey);
  return usage.canAnalyze;
}

/**
 * Get the current usage information for a shop.
 * Uses server-side cache with TTL to avoid excessive API calls.
 * Falls back to local count if the API call fails.
 */
export async function getUsage(
  shop: string,
  apiKey: string,
): Promise<UsageInfo> {
  const month = getCurrentMonth();

  // Check if we have a valid cache
  const cachedUsage = await prisma.usage.findUnique({
    where: { shop_month: { shop, month } },
  });

  if (
    cachedUsage?.cachedAt &&
    cachedUsage.cachedTier &&
    Date.now() - cachedUsage.cachedAt.getTime() < USAGE_CACHE_TTL_MS
  ) {
    const tier = cachedUsage.cachedTier;
    const limit =
      tier === "free" ? FREE_TIER_LIMIT : cachedUsage.count + 10000;
    return {
      tier,
      productsUsed: cachedUsage.count,
      productsLimit: limit,
      percentageUsed: limit > 0 ? (cachedUsage.count / limit) * 100 : 0,
      canAnalyze:
        tier !== "free" || cachedUsage.count < FREE_TIER_LIMIT,
    };
  }

  // Try to fetch from the TaxoAI API
  try {
    const client = new TaxoAIClient(apiKey);
    const serverUsage: UsageResponse = await client.getUsage();

    // Update local cache
    await prisma.usage.upsert({
      where: { shop_month: { shop, month } },
      create: {
        shop,
        month,
        count: serverUsage.products_used_this_month,
        cachedTier: serverUsage.tier,
        cachedAt: new Date(),
      },
      update: {
        count: serverUsage.products_used_this_month,
        cachedTier: serverUsage.tier,
        cachedAt: new Date(),
      },
    });

    const canDoAnalysis =
      serverUsage.tier !== "free" ||
      serverUsage.products_used_this_month < serverUsage.products_limit;

    return {
      tier: serverUsage.tier,
      productsUsed: serverUsage.products_used_this_month,
      productsLimit: serverUsage.products_limit,
      percentageUsed: serverUsage.percentage_used,
      canAnalyze: canDoAnalysis,
    };
  } catch {
    // Fallback to local count if the API call fails
    const localUsage = await prisma.usage.findUnique({
      where: { shop_month: { shop, month } },
    });

    const localCount = localUsage?.count ?? 0;
    const tier = localUsage?.cachedTier ?? "free";
    const limit = tier === "free" ? FREE_TIER_LIMIT : localCount + 10000;

    return {
      tier,
      productsUsed: localCount,
      productsLimit: limit,
      percentageUsed: limit > 0 ? (localCount / limit) * 100 : 0,
      canAnalyze: tier !== "free" || localCount < FREE_TIER_LIMIT,
    };
  }
}

/**
 * Increment the local usage counter for a shop after a successful analysis.
 */
export async function increment(shop: string): Promise<void> {
  const month = getCurrentMonth();

  await prisma.usage.upsert({
    where: { shop_month: { shop, month } },
    create: {
      shop,
      month,
      count: 1,
    },
    update: {
      count: { increment: 1 },
    },
  });
}

/**
 * Get current month string (exported for testing).
 */
export { getCurrentMonth };
