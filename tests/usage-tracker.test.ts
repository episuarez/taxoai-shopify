import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "~/db.server";
import { canAnalyze, getUsage, increment } from "../app/lib/usage-tracker.server";

// Mock the TaxoAI client
vi.mock("../app/lib/taxoai-client", () => {
  return {
    TaxoAIClient: vi.fn().mockImplementation(() => ({
      getUsage: vi.fn(),
    })),
  };
});

import { TaxoAIClient } from "../app/lib/taxoai-client";

const mockPrisma = prisma as unknown as {
  usage: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};

describe("usage-tracker", () => {
  const SHOP = "test-shop.myshopify.com";
  const API_KEY = "test-key";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("canAnalyze", () => {
    it("blocks at 25 for free tier when server reports limit reached", async () => {
      // No cached data
      mockPrisma.usage.findUnique.mockResolvedValue(null);
      mockPrisma.usage.upsert.mockResolvedValue({});

      // Server says 25/25 used on free tier
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

    it("allows paid tier over 25 products", async () => {
      mockPrisma.usage.findUnique.mockResolvedValue(null);
      mockPrisma.usage.upsert.mockResolvedValue({});

      const mockGetUsage = vi.fn().mockResolvedValue({
        tier: "pro",
        products_used_this_month: 50,
        products_limit: 1000,
        percentage_used: 5,
      });

      (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        () => ({
          getUsage: mockGetUsage,
        }),
      );

      const result = await canAnalyze(SHOP, API_KEY);
      expect(result).toBe(true);
    });
  });

  describe("getUsage", () => {
    it("uses cache within 5 minutes", async () => {
      const recentTime = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago

      mockPrisma.usage.findUnique.mockResolvedValue({
        shop: SHOP,
        month: "2026-02",
        count: 10,
        cachedTier: "free",
        cachedAt: recentTime,
      });

      // The TaxoAI client should NOT be called
      const mockGetUsage = vi.fn();
      (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        () => ({
          getUsage: mockGetUsage,
        }),
      );

      const result = await getUsage(SHOP, API_KEY);

      expect(mockGetUsage).not.toHaveBeenCalled();
      expect(result.productsUsed).toBe(10);
      expect(result.tier).toBe("free");
      expect(result.canAnalyze).toBe(true);
    });

    it("calls server when cache is expired", async () => {
      const oldTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

      mockPrisma.usage.findUnique.mockResolvedValue({
        shop: SHOP,
        month: "2026-02",
        count: 10,
        cachedTier: "free",
        cachedAt: oldTime,
      });
      mockPrisma.usage.upsert.mockResolvedValue({});

      const mockGetUsage = vi.fn().mockResolvedValue({
        tier: "free",
        products_used_this_month: 12,
        products_limit: 25,
        percentage_used: 48,
      });

      (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        () => ({
          getUsage: mockGetUsage,
        }),
      );

      const result = await getUsage(SHOP, API_KEY);

      expect(mockGetUsage).toHaveBeenCalled();
      expect(result.productsUsed).toBe(12);
    });

    it("falls back to local count on API failure", async () => {
      // No cached data initially (will trigger server call)
      mockPrisma.usage.findUnique
        .mockResolvedValueOnce(null)   // First call: check cache
        .mockResolvedValueOnce({       // Second call: fallback read
          shop: SHOP,
          month: "2026-02",
          count: 8,
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

      const result = await getUsage(SHOP, API_KEY);

      expect(result.productsUsed).toBe(8);
      expect(result.tier).toBe("free");
      expect(result.canAnalyze).toBe(true);
    });

    it("handles month rollover correctly", async () => {
      // No data for current month
      mockPrisma.usage.findUnique.mockResolvedValue(null);
      mockPrisma.usage.upsert.mockResolvedValue({});

      const mockGetUsage = vi.fn().mockResolvedValue({
        tier: "free",
        products_used_this_month: 0,
        products_limit: 25,
        percentage_used: 0,
      });

      (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        () => ({
          getUsage: mockGetUsage,
        }),
      );

      const result = await getUsage(SHOP, API_KEY);

      expect(result.productsUsed).toBe(0);
      expect(result.canAnalyze).toBe(true);
    });
  });

  describe("increment", () => {
    it("increments the usage counter", async () => {
      mockPrisma.usage.upsert.mockResolvedValue({});

      await increment(SHOP);

      expect(mockPrisma.usage.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            shop_month: expect.objectContaining({
              shop: SHOP,
            }),
          }),
          create: expect.objectContaining({
            shop: SHOP,
            count: 1,
          }),
          update: expect.objectContaining({
            count: { increment: 1 },
          }),
        }),
      );
    });
  });
});
