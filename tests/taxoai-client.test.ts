import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TaxoAIClient,
  TaxoAIAuthError,
  TaxoAIRateLimitError,
  TaxoAIPaymentRequiredError,
  TaxoAITimeoutError,
  type AnalyzeResponse,
  type UsageResponse,
} from "../app/lib/taxoai-client";

describe("TaxoAIClient", () => {
  let client: TaxoAIClient;
  const API_KEY = "test-api-key-123";
  const BASE_URL = "https://api.taxoai.dev";

  beforeEach(() => {
    client = new TaxoAIClient(API_KEY);
  });

  const mockFetch = (
    response: Partial<Response> & { json?: () => Promise<unknown> },
    status = 200,
  ) => {
    const mockResponse = {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(response.headers ?? {}),
      json:
        response.json ??
        (async () => ({})),
      text: async () => "",
    };

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);
    return globalThis.fetch as ReturnType<typeof vi.fn>;
  };

  describe("analyzeProduct", () => {
    it("sends correct request URL and headers", async () => {
      const mockData: AnalyzeResponse = {
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
          optimized_title: "Red Cotton Dress",
          meta_title: "Red Cotton Dress | Shop Now",
          meta_description: "Beautiful red cotton dress for women.",
          optimized_description: "<p>Beautiful red cotton dress.</p>",
          keywords: [{ keyword: "red dress", volume: 1200 }],
          tags: ["dress", "red", "cotton"],
        },
        usage: {
          products_used_this_month: 5,
          products_limit: 25,
          tier: "free",
        },
      };

      const fetchMock = mockFetch({ json: async () => mockData }, 200);

      const result = await client.analyzeProduct({
        name: "Red Dress",
        description: "A beautiful red dress",
        price: 49.99,
        language: "en",
      });

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/v1/products/analyze`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-API-Key": API_KEY,
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            name: "Red Dress",
            description: "A beautiful red dress",
            price: 49.99,
            language: "en",
          }),
        }),
      );

      expect(result.classification.google_category).toBe(
        "Apparel & Accessories > Clothing > Dresses",
      );
      expect(result.classification.confidence).toBe(0.92);
    });

    it("parses successful response correctly", async () => {
      const mockData: AnalyzeResponse = {
        classification: {
          google_category: "Electronics > Computers > Laptops",
          google_category_id: 328,
          confidence: 0.88,
        },
        attributes: {
          color: ["silver"],
          material: "aluminum",
          gender: "unisex",
          style: "modern",
          extra: { brand: "TechBrand" },
        },
        seo: {
          optimized_title: "Silver Laptop Computer",
          meta_title: "Silver Laptop | TechBrand",
          meta_description: "High-performance silver laptop.",
          optimized_description: "<p>High-performance laptop.</p>",
          keywords: [
            { keyword: "laptop", volume: 50000 },
            { keyword: "silver laptop", volume: 3000 },
          ],
          tags: ["laptop", "electronics", "computer"],
        },
        usage: {
          products_used_this_month: 10,
          products_limit: 100,
          tier: "pro",
        },
      };

      mockFetch({ json: async () => mockData }, 200);

      const result = await client.analyzeProduct({
        name: "Laptop",
        language: "en",
      });

      expect(result.classification.google_category_id).toBe(328);
      expect(result.attributes.color).toEqual(["silver"]);
      expect(result.seo.keywords).toHaveLength(2);
      expect(result.seo.tags).toContain("laptop");
      expect(result.usage.tier).toBe("pro");
    });
  });

  describe("error handling", () => {
    it("throws TaxoAIAuthError on 401", async () => {
      mockFetch(
        { json: async () => ({ error: "Invalid API key" }) },
        401,
      );

      await expect(
        client.analyzeProduct({ name: "Test", language: "en" }),
      ).rejects.toThrow(TaxoAIAuthError);

      try {
        await client.analyzeProduct({ name: "Test", language: "en" });
      } catch (error) {
        expect(error).toBeInstanceOf(TaxoAIAuthError);
        expect((error as TaxoAIAuthError).statusCode).toBe(401);
      }
    });

    it("throws TaxoAIRateLimitError on 429 with Retry-After", async () => {
      const headers = new Headers();
      headers.set("Retry-After", "30");

      const mockResponse = {
        ok: false,
        status: 429,
        headers,
        json: async () => ({ error: "Rate limit exceeded" }),
        text: async () => "",
      };

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      try {
        await client.analyzeProduct({ name: "Test", language: "en" });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(TaxoAIRateLimitError);
        expect((error as TaxoAIRateLimitError).retryAfter).toBe(30);
        expect((error as TaxoAIRateLimitError).statusCode).toBe(429);
      }
    });

    it("throws TaxoAIPaymentRequiredError on 402", async () => {
      mockFetch(
        {
          json: async () => ({
            message: "Monthly limit reached. Upgrade your plan.",
          }),
        },
        402,
      );

      try {
        await client.analyzeProduct({ name: "Test", language: "en" });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(TaxoAIPaymentRequiredError);
        expect((error as TaxoAIPaymentRequiredError).statusCode).toBe(402);
        expect((error as TaxoAIPaymentRequiredError).message).toContain(
          "Monthly limit reached",
        );
      }
    });

    it("throws TaxoAITimeoutError on timeout", async () => {
      // Create a client with a very short timeout
      const fastClient = new TaxoAIClient(API_KEY, undefined, 1);

      // Simulate a fetch that never resolves by using a real abort
      globalThis.fetch = vi.fn().mockImplementation(
        (_url: string, options: { signal?: AbortSignal }) => {
          return new Promise((_resolve, reject) => {
            if (options?.signal) {
              options.signal.addEventListener("abort", () => {
                const error = new DOMException(
                  "The operation was aborted",
                  "AbortError",
                );
                reject(error);
              });
            }
          });
        },
      );

      await expect(
        fastClient.analyzeProduct({ name: "Test", language: "en" }),
      ).rejects.toThrow(TaxoAITimeoutError);
    });
  });

  describe("getUsage", () => {
    it("returns usage data correctly", async () => {
      const mockUsage: UsageResponse = {
        tier: "free",
        products_used_this_month: 15,
        products_limit: 25,
        percentage_used: 60,
      };

      const fetchMock = mockFetch(
        { json: async () => mockUsage },
        200,
      );

      const result = await client.getUsage();

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/v1/usage`,
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "X-API-Key": API_KEY,
          }),
        }),
      );

      expect(result.tier).toBe("free");
      expect(result.products_used_this_month).toBe(15);
      expect(result.products_limit).toBe(25);
      expect(result.percentage_used).toBe(60);
    });
  });

  describe("searchTaxonomies", () => {
    it("encodes query parameter correctly", async () => {
      const mockResult = {
        categories: [
          {
            id: 2271,
            full_path: "Apparel & Accessories > Clothing > Dresses",
            level_1: "Apparel & Accessories",
            relevance: 0.95,
          },
        ],
      };

      const fetchMock = mockFetch(
        { json: async () => mockResult },
        200,
      );

      await client.searchTaxonomies("dresses & gowns", 5);

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/v1/taxonomies/search?q=dresses%20%26%20gowns&limit=5`,
        expect.any(Object),
      );
    });
  });

  describe("batch operations", () => {
    it("submits batch correctly", async () => {
      const mockBatch = {
        job_id: "job-123",
        status: "queued",
        poll_url: "/v1/jobs/job-123",
      };

      const fetchMock = mockFetch(
        { json: async () => mockBatch },
        200,
      );

      const result = await client.submitBatch([
        { name: "Product 1", language: "en" },
        { name: "Product 2", language: "es" },
      ]);

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/v1/products/batch`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            products: [
              { name: "Product 1", language: "en" },
              { name: "Product 2", language: "es" },
            ],
          }),
        }),
      );

      expect(result.job_id).toBe("job-123");
    });

    it("polls job status correctly", async () => {
      const mockJob = {
        status: "completed",
        total_products: 2,
        processed_products: 2,
        result: [],
      };

      const fetchMock = mockFetch(
        { json: async () => mockJob },
        200,
      );

      const result = await client.getJob("job-123");

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/v1/jobs/job-123`,
        expect.any(Object),
      );

      expect(result.status).toBe("completed");
      expect(result.total_products).toBe(2);
    });
  });
});
