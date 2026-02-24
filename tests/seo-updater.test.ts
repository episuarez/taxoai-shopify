import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateProductSEO } from "../app/lib/seo-updater.server";
import type { SEOResult } from "../app/lib/taxoai-client";

describe("seo-updater", () => {
  const PRODUCT_GID = "gid://shopify/Product/12345";

  const seoData: SEOResult = {
    optimized_title: "Premium Red Cotton Dress for Women",
    meta_title: "Red Cotton Dress | Fashion Store",
    meta_description:
      "Shop our beautiful red cotton dress. Perfect for casual and formal occasions.",
    optimized_description:
      "<p>Beautiful premium red cotton dress designed for modern women.</p>",
    keywords: [
      { keyword: "red dress", volume: "high" },
      { keyword: "cotton dress", volume: "medium" },
    ],
    tags: ["dress", "red", "cotton", "women", "fashion"],
  };

  let mockAdmin: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdmin = vi.fn();
  });

  it("sends correct GraphQL mutation for SEO fields", async () => {
    mockAdmin
      .mockResolvedValueOnce({
        // productUpdate response
        json: async () => ({
          data: {
            productUpdate: {
              product: { id: PRODUCT_GID },
              userErrors: [],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        // tagsAdd response
        json: async () => ({
          data: {
            tagsAdd: {
              node: { id: PRODUCT_GID },
              userErrors: [],
            },
          },
        }),
      });

    await updateProductSEO(mockAdmin, PRODUCT_GID, seoData, {
      updateTitle: false,
      updateDescription: false,
    });

    // Check the productUpdate mutation was called
    const firstCall = mockAdmin.mock.calls[0];
    expect(firstCall[0]).toContain("productUpdate");
    const variables = firstCall[1]?.variables;
    expect(variables.input.id).toBe(PRODUCT_GID);
    expect(variables.input.seo.title).toBe(
      "Red Cotton Dress | Fashion Store",
    );
    expect(variables.input.seo.description).toBe(
      "Shop our beautiful red cotton dress. Perfect for casual and formal occasions.",
    );
    // Should NOT update title/description when disabled
    expect(variables.input.title).toBeUndefined();
    expect(variables.input.descriptionHtml).toBeUndefined();
  });

  it("adds tags without overwriting existing ones using tagsAdd", async () => {
    mockAdmin
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            productUpdate: {
              product: { id: PRODUCT_GID },
              userErrors: [],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            tagsAdd: {
              node: { id: PRODUCT_GID },
              userErrors: [],
            },
          },
        }),
      });

    await updateProductSEO(mockAdmin, PRODUCT_GID, seoData, {
      updateTitle: false,
      updateDescription: false,
    });

    // Check that tagsAdd was called (not a full product replace)
    expect(mockAdmin).toHaveBeenCalledTimes(2);
    const tagsCall = mockAdmin.mock.calls[1];
    expect(tagsCall[0]).toContain("tagsAdd");
    const tagsVars = tagsCall[1]?.variables;
    expect(tagsVars.id).toBe(PRODUCT_GID);
    expect(tagsVars.tags).toEqual([
      "dress",
      "red",
      "cotton",
      "women",
      "fashion",
    ]);
  });

  it("optionally updates product title when enabled", async () => {
    mockAdmin
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            productUpdate: {
              product: { id: PRODUCT_GID },
              userErrors: [],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            tagsAdd: {
              node: { id: PRODUCT_GID },
              userErrors: [],
            },
          },
        }),
      });

    await updateProductSEO(mockAdmin, PRODUCT_GID, seoData, {
      updateTitle: true,
      updateDescription: false,
    });

    const firstCall = mockAdmin.mock.calls[0];
    const variables = firstCall[1]?.variables;
    expect(variables.input.title).toBe(
      "Premium Red Cotton Dress for Women",
    );
    expect(variables.input.descriptionHtml).toBeUndefined();
  });

  it("optionally updates product description when enabled", async () => {
    mockAdmin
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            productUpdate: {
              product: { id: PRODUCT_GID },
              userErrors: [],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            tagsAdd: {
              node: { id: PRODUCT_GID },
              userErrors: [],
            },
          },
        }),
      });

    await updateProductSEO(mockAdmin, PRODUCT_GID, seoData, {
      updateTitle: false,
      updateDescription: true,
    });

    const firstCall = mockAdmin.mock.calls[0];
    const variables = firstCall[1]?.variables;
    expect(variables.input.title).toBeUndefined();
    expect(variables.input.descriptionHtml).toBe(
      "<p>Beautiful premium red cotton dress designed for modern women.</p>",
    );
  });

  it("updates both title and description when both enabled", async () => {
    mockAdmin
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            productUpdate: {
              product: { id: PRODUCT_GID },
              userErrors: [],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            tagsAdd: {
              node: { id: PRODUCT_GID },
              userErrors: [],
            },
          },
        }),
      });

    await updateProductSEO(mockAdmin, PRODUCT_GID, seoData, {
      updateTitle: true,
      updateDescription: true,
    });

    const firstCall = mockAdmin.mock.calls[0];
    const variables = firstCall[1]?.variables;
    expect(variables.input.title).toBe(
      "Premium Red Cotton Dress for Women",
    );
    expect(variables.input.descriptionHtml).toBe(
      "<p>Beautiful premium red cotton dress designed for modern women.</p>",
    );
  });

  it("does not call tagsAdd when there are no tags", async () => {
    const seoDataNoTags: SEOResult = {
      ...seoData,
      tags: [],
    };

    mockAdmin.mockResolvedValueOnce({
      json: async () => ({
        data: {
          productUpdate: {
            product: { id: PRODUCT_GID },
            userErrors: [],
          },
        },
      }),
    });

    await updateProductSEO(mockAdmin, PRODUCT_GID, seoDataNoTags, {
      updateTitle: false,
      updateDescription: false,
    });

    // Should only call productUpdate, not tagsAdd
    expect(mockAdmin).toHaveBeenCalledTimes(1);
  });

  it("throws error on GraphQL userErrors", async () => {
    mockAdmin.mockResolvedValueOnce({
      json: async () => ({
        data: {
          productUpdate: {
            product: null,
            userErrors: [
              { field: ["seo", "title"], message: "Title too long" },
            ],
          },
        },
      }),
    });

    await expect(
      updateProductSEO(mockAdmin, PRODUCT_GID, seoData, {
        updateTitle: false,
        updateDescription: false,
      }),
    ).rejects.toThrow("Failed to update product SEO: Title too long");
  });
});
