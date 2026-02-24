import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "~/db.server";

// Mock all dependencies
vi.mock("../app/lib/usage-tracker.server", () => ({
  canAnalyze: vi.fn(),
  increment: vi.fn(),
}));

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
    })),
  };
});

import { analyzeShopifyProduct } from "../app/lib/analyzer.server";
import { canAnalyze, increment } from "../app/lib/usage-tracker.server";
import { updateProductSEO } from "../app/lib/seo-updater.server";
import { writeMetafields } from "../app/lib/metafield-writer.server";
import { mapCategory } from "../app/lib/category-mapper.server";
import { writeAttributes } from "../app/lib/attribute-writer.server";
import { TaxoAIClient } from "../app/lib/taxoai-client";

const mockPrisma = prisma as unknown as {
  productAnalysis: {
    upsert: ReturnType<typeof vi.fn>;
  };
};

const mockCanAnalyze = canAnalyze as ReturnType<typeof vi.fn>;
const mockIncrement = increment as ReturnType<typeof vi.fn>;
const mockUpdateProductSEO = updateProductSEO as ReturnType<typeof vi.fn>;
const mockWriteMetafields = writeMetafields as ReturnType<typeof vi.fn>;
const mockMapCategory = mapCategory as ReturnType<typeof vi.fn>;
const mockWriteAttributes = writeAttributes as ReturnType<typeof vi.fn>;

describe("analyzer", () => {
  const SHOP = "test-shop.myshopify.com";
  const PRODUCT_ID = "12345";

  const defaultSettings = {
    apiKey: "test-key",
    language: "en",
    autoAnalyze: true,
    confidenceThreshold: 0.7,
    analyzeImages: false,
    updateTitle: false,
    updateDescription: false,
  };

  const mockShopifyProduct = {
    id: "gid://shopify/Product/12345",
    title: "Beautiful Red Dress",
    descriptionHtml: "<p>A beautiful red cotton dress for women.</p>",
    productType: "Clothing",
    tags: ["dress"],
    priceRangeV2: {
      minVariantPrice: { amount: "49.99" },
    },
    images: {
      edges: [
        { node: { url: "https://cdn.shopify.com/img1.jpg" } },
        { node: { url: "https://cdn.shopify.com/img2.jpg" } },
      ],
    },
  };

  const mockAnalysisResult = {
    classification: {
      google_category: "Apparel & Accessories > Clothing > Dresses",
      google_category_id: 2271,
      confidence: 0.92,
    },
    attributes: {
      color: ["red"],
      material: "cotton",
      gender: "female",
      style: "casual",
      extra: {},
    },
    seo: {
      optimized_title: "Red Cotton Dress for Women",
      meta_title: "Red Cotton Dress | Shop Fashion",
      meta_description: "Discover this beautiful red cotton dress.",
      optimized_description: "<p>Beautiful red cotton dress for women.</p>",
      keywords: [{ keyword: "red dress", volume: 1200 }],
      tags: ["dress", "red", "cotton", "women"],
    },
    usage: {
      products_used_this_month: 6,
      products_limit: 25,
      tier: "free",
    },
  };

  const createMockAdmin = () => {
    return vi.fn().mockResolvedValue({
      json: async () => ({
        data: { product: mockShopifyProduct },
      }),
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCanAnalyze.mockResolvedValue(true);
    mockIncrement.mockResolvedValue(undefined);
    mockUpdateProductSEO.mockResolvedValue(undefined);
    mockWriteMetafields.mockResolvedValue(undefined);
    mockMapCategory.mockResolvedValue(undefined);
    mockWriteAttributes.mockResolvedValue(undefined);
    mockPrisma.productAnalysis.upsert.mockResolvedValue({});
  });

  it("maps Shopify product to API payload correctly", async () => {
    const mockAnalyze = vi.fn().mockResolvedValue(mockAnalysisResult);
    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        analyzeProduct: mockAnalyze,
      }),
    );

    const admin = createMockAdmin();
    await analyzeShopifyProduct(SHOP, PRODUCT_ID, admin, defaultSettings);

    expect(mockAnalyze).toHaveBeenCalledWith({
      name: "Beautiful Red Dress",
      description: "A beautiful red cotton dress for women.",
      price: 49.99,
      image_urls: [
        "https://cdn.shopify.com/img1.jpg",
        "https://cdn.shopify.com/img2.jpg",
      ],
      language: "en",
      analyze_images: false,
      product_id: "12345",
    });
  });

  it("calls all sub-modules on successful analysis with high confidence", async () => {
    const mockAnalyze = vi.fn().mockResolvedValue(mockAnalysisResult);
    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        analyzeProduct: mockAnalyze,
      }),
    );

    const admin = createMockAdmin();
    const result = await analyzeShopifyProduct(
      SHOP,
      PRODUCT_ID,
      admin,
      defaultSettings,
    );

    expect(result.success).toBe(true);
    expect(mockUpdateProductSEO).toHaveBeenCalled();
    expect(mockWriteMetafields).toHaveBeenCalled();
    expect(mockMapCategory).toHaveBeenCalled();
    expect(mockWriteAttributes).toHaveBeenCalled();
    expect(mockPrisma.productAnalysis.upsert).toHaveBeenCalled();
  });

  it("increments usage after successful analysis", async () => {
    const mockAnalyze = vi.fn().mockResolvedValue(mockAnalysisResult);
    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        analyzeProduct: mockAnalyze,
      }),
    );

    const admin = createMockAdmin();
    await analyzeShopifyProduct(SHOP, PRODUCT_ID, admin, defaultSettings);

    expect(mockIncrement).toHaveBeenCalledWith(SHOP);
  });

  it("respects confidence threshold - does not apply changes below threshold", async () => {
    const lowConfidenceResult = {
      ...mockAnalysisResult,
      classification: {
        ...mockAnalysisResult.classification,
        confidence: 0.5, // Below default 0.7 threshold
      },
    };

    const mockAnalyze = vi.fn().mockResolvedValue(lowConfidenceResult);
    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        analyzeProduct: mockAnalyze,
      }),
    );

    const admin = createMockAdmin();
    const result = await analyzeShopifyProduct(
      SHOP,
      PRODUCT_ID,
      admin,
      defaultSettings,
    );

    expect(result.success).toBe(true);
    // Should store the result
    expect(mockPrisma.productAnalysis.upsert).toHaveBeenCalled();
    // Should NOT apply changes since confidence is below threshold
    expect(mockUpdateProductSEO).not.toHaveBeenCalled();
    expect(mockWriteMetafields).not.toHaveBeenCalled();
    expect(mockMapCategory).not.toHaveBeenCalled();
    expect(mockWriteAttributes).not.toHaveBeenCalled();
    // Should still increment usage
    expect(mockIncrement).toHaveBeenCalled();
  });

  it("handles API errors gracefully", async () => {
    const mockAnalyze = vi
      .fn()
      .mockRejectedValue(new Error("API connection failed"));
    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        analyzeProduct: mockAnalyze,
      }),
    );

    const admin = createMockAdmin();
    const result = await analyzeShopifyProduct(
      SHOP,
      PRODUCT_ID,
      admin,
      defaultSettings,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("API connection failed");
    // Should NOT increment usage on failure
    expect(mockIncrement).not.toHaveBeenCalled();
  });

  it("returns error when usage limit is reached", async () => {
    mockCanAnalyze.mockResolvedValue(false);

    const admin = createMockAdmin();
    const result = await analyzeShopifyProduct(
      SHOP,
      PRODUCT_ID,
      admin,
      defaultSettings,
    );

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("usage_limit");
  });

  it("handles product not found", async () => {
    const mockAnalyze = vi.fn().mockResolvedValue(mockAnalysisResult);
    (TaxoAIClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => ({
        analyzeProduct: mockAnalyze,
      }),
    );

    const admin = vi.fn().mockResolvedValue({
      json: async () => ({
        data: { product: null },
      }),
    });

    const result = await analyzeShopifyProduct(
      SHOP,
      PRODUCT_ID,
      admin,
      defaultSettings,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Product not found");
  });
});
