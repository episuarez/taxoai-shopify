import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "~/db.server";

// Mock all dependencies
vi.mock("../app/lib/seo-updater.server", () => ({
  updateProductSEO: vi.fn(),
}));
vi.mock("../app/lib/metafield-writer.server", () => ({
  writeMetafields: vi.fn(),
}));
vi.mock("../app/lib/category-mapper.server", () => ({
  mapCategory: vi.fn(),
}));
vi.mock("../app/lib/attribute-writer.server", () => ({
  writeAttributes: vi.fn(),
}));
vi.mock("../app/lib/taxoai-client", () => {
  return {
    TaxoAIClient: vi.fn().mockImplementation(() => ({
      analyzeProduct: vi.fn(),
      getUsage: vi.fn(),
    })),
  };
});

import { TaxoAIClient } from "../app/lib/taxoai-client";
import { canAnalyze, getUsage } from "../app/lib/usage-tracker.server";

const mockPrisma = prisma as unknown as {
  usage: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  productAnalysis: {
    upsert: ReturnType<typeof vi.fn>;
  };
};

describe("free-tier-security", () => {
  const SHOP = "test-shop.myshopify.com";
  const API_KEY = "test-key";

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.usage.upsert.mockResolvedValue({});
  });

  it("server check is always called before analysis (no cache)", async () => {
    // No cache exists
    mockPrisma.usage.findUnique.mockResolvedValue(null);

    const mockGetUsage = vi.fn().mockResolvedValue({
      tier: "free",
      products_used_this_month: 10,
      products_limit: 25,
      percentage_used: 40,
    });

    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        getUsage: mockGetUsage,
      }),
    );

    await canAnalyze(SHOP, API_KEY);

    // Verify server was called
    expect(mockGetUsage).toHaveBeenCalled();
  });

  it("server check is called when cache is expired", async () => {
    // Expired cache
    const oldTime = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    mockPrisma.usage.findUnique.mockResolvedValue({
      shop: SHOP,
      month: "2026-02",
      count: 10,
      cachedTier: "free",
      cachedAt: oldTime,
    });

    const mockGetUsage = vi.fn().mockResolvedValue({
      tier: "free",
      products_used_this_month: 25,
      products_limit: 25,
      percentage_used: 100,
    });

    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        getUsage: mockGetUsage,
      }),
    );

    const result = await canAnalyze(SHOP, API_KEY);

    // Server was called and reports limit reached
    expect(mockGetUsage).toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("local manipulation does not bypass server check when cache expires", async () => {
    // Simulate a scenario where local count was tampered to show 0,
    // but the server reports the real count as 25/25

    // First call: cache says count=0 but cache is expired
    const oldTime = new Date(Date.now() - 10 * 60 * 1000);
    mockPrisma.usage.findUnique.mockResolvedValue({
      shop: SHOP,
      month: "2026-02",
      count: 0, // Locally shows 0 (tampered)
      cachedTier: "free",
      cachedAt: oldTime, // But cache is expired
    });

    // Server reports the truth: 25/25 used
    const mockGetUsage = vi.fn().mockResolvedValue({
      tier: "free",
      products_used_this_month: 25,
      products_limit: 25,
      percentage_used: 100,
    });

    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        getUsage: mockGetUsage,
      }),
    );

    const result = await canAnalyze(SHOP, API_KEY);

    // Even though local says 0, server says 25/25, so should block
    expect(result).toBe(false);
    expect(mockGetUsage).toHaveBeenCalled();
  });

  it("cache expiration forces server recheck", async () => {
    // Recent cache (within TTL)
    const recentTime = new Date(Date.now() - 2 * 60 * 1000); // 2 min ago
    mockPrisma.usage.findUnique.mockResolvedValueOnce({
      shop: SHOP,
      month: "2026-02",
      count: 10,
      cachedTier: "free",
      cachedAt: recentTime,
    });

    const mockGetUsage = vi.fn();
    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        getUsage: mockGetUsage,
      }),
    );

    // With valid cache, server should NOT be called
    const result1 = await canAnalyze(SHOP, API_KEY);
    expect(result1).toBe(true);
    expect(mockGetUsage).not.toHaveBeenCalled();

    // Now with expired cache, server SHOULD be called
    const oldTime = new Date(Date.now() - 10 * 60 * 1000);
    mockPrisma.usage.findUnique.mockResolvedValueOnce({
      shop: SHOP,
      month: "2026-02",
      count: 10,
      cachedTier: "free",
      cachedAt: oldTime,
    });

    mockGetUsage.mockResolvedValue({
      tier: "free",
      products_used_this_month: 24,
      products_limit: 25,
      percentage_used: 96,
    });

    const result2 = await canAnalyze(SHOP, API_KEY);
    expect(result2).toBe(true);
    expect(mockGetUsage).toHaveBeenCalled();
  });

  it("paid tier bypass allows usage over 25", async () => {
    mockPrisma.usage.findUnique.mockResolvedValue(null);

    const mockGetUsage = vi.fn().mockResolvedValue({
      tier: "pro",
      products_used_this_month: 150,
      products_limit: 1000,
      percentage_used: 15,
    });

    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        getUsage: mockGetUsage,
      }),
    );

    const result = await canAnalyze(SHOP, API_KEY);

    expect(result).toBe(true);
    expect(mockGetUsage).toHaveBeenCalled();
  });

  it("paid tier with high usage but within limits is allowed", async () => {
    mockPrisma.usage.findUnique.mockResolvedValue(null);

    const mockGetUsage = vi.fn().mockResolvedValue({
      tier: "enterprise",
      products_used_this_month: 5000,
      products_limit: 10000,
      percentage_used: 50,
    });

    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        getUsage: mockGetUsage,
      }),
    );

    const result = await canAnalyze(SHOP, API_KEY);

    expect(result).toBe(true);
  });

  it("free tier at exactly limit is blocked", async () => {
    mockPrisma.usage.findUnique.mockResolvedValue(null);

    const mockGetUsage = vi.fn().mockResolvedValue({
      tier: "free",
      products_used_this_month: 25,
      products_limit: 25,
      percentage_used: 100,
    });

    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        getUsage: mockGetUsage,
      }),
    );

    const result = await canAnalyze(SHOP, API_KEY);
    expect(result).toBe(false);
  });

  it("free tier just under limit is allowed", async () => {
    mockPrisma.usage.findUnique.mockResolvedValue(null);

    const mockGetUsage = vi.fn().mockResolvedValue({
      tier: "free",
      products_used_this_month: 24,
      products_limit: 25,
      percentage_used: 96,
    });

    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        getUsage: mockGetUsage,
      }),
    );

    const result = await canAnalyze(SHOP, API_KEY);
    expect(result).toBe(true);
  });

  it("falls back to local data when server is unreachable but denies if at limit", async () => {
    // First call: no cache
    mockPrisma.usage.findUnique
      .mockResolvedValueOnce(null) // Cache check
      .mockResolvedValueOnce({     // Fallback read
        shop: SHOP,
        month: "2026-02",
        count: 25,
        cachedTier: "free",
        cachedAt: null,
      });

    const mockGetUsage = vi.fn().mockRejectedValue(
      new Error("Network error"),
    );

    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        getUsage: mockGetUsage,
      }),
    );

    const result = await canAnalyze(SHOP, API_KEY);

    // Should still block based on local data
    expect(result).toBe(false);
  });
});
