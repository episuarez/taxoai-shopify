import { TAXOAI_API_URL, API_TIMEOUT_MS } from "./constants";

// ── Request Types ──────────────────────────────────────────────────────

export interface AnalyzeRequest {
  name: string;
  description?: string;
  price?: number;
  image_urls?: string[];
  language: "es" | "en" | "pt";
  analyze_images?: boolean;
  product_id?: string;
}

export interface BatchRequest {
  products: AnalyzeRequest[];
}

// ── Response Types ─────────────────────────────────────────────────────

export interface ClassificationResult {
  google_category: string;
  google_category_id: number;
  confidence: number;
}

export interface KeywordEntry {
  keyword: string;
  volume: "high" | "medium" | "low";
}

export interface SEOResult {
  optimized_title: string;
  meta_title: string;
  meta_description: string;
  optimized_description: string;
  keywords: KeywordEntry[];
  tags: string[];
}

export interface AttributeResult {
  color: string[];
  material: string;
  gender: string;
  style: string;
  extra: Record<string, unknown>;
}

export interface ImageAnalysisResult {
  detected_colors: string[];
  detected_material: string;
  detected_style: string;
  background_quality: string;
}

export interface AnalyzeResponse {
  classification: ClassificationResult;
  attributes: AttributeResult;
  seo: SEOResult;
  image_analysis?: ImageAnalysisResult;
  usage: {
    products_used_this_month: number;
    products_limit: number;
    tier: string;
  };
  processing_time_ms?: number;
  cached?: boolean;
}

export interface UsageResponse {
  tier: string;
  products_used_this_month: number;
  products_limit: number;
  percentage_used: number;
}

export interface TaxonomyCategory {
  id: number;
  full_path: string;
  level_1: string;
  relevance: number;
}

export interface TaxonomySearchResponse {
  categories: TaxonomyCategory[];
}

export interface BatchResponse {
  job_id: string;
  status: string;
  poll_url: string;
}

export interface JobProductResult {
  name: string;
  classification: ClassificationResult;
  attributes: AttributeResult;
  seo: SEOResult;
  image_analysis?: ImageAnalysisResult;
}

export interface JobResponse {
  status: string;
  total_products: number;
  processed_products: number;
  result: JobProductResult[];
}

// ── Error Types ────────────────────────────────────────────────────────

export class TaxoAIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "TaxoAIError";
  }
}

export class TaxoAIAuthError extends TaxoAIError {
  constructor(message = "Invalid API key") {
    super(message, 401);
    this.name = "TaxoAIAuthError";
  }
}

export class TaxoAIRateLimitError extends TaxoAIError {
  constructor(retryAfter?: number) {
    super("Rate limit exceeded", 429, retryAfter);
    this.name = "TaxoAIRateLimitError";
  }
}

export class TaxoAIPaymentRequiredError extends TaxoAIError {
  constructor(message = "Payment required - usage limit reached") {
    super(message, 402);
    this.name = "TaxoAIPaymentRequiredError";
  }
}

export class TaxoAITimeoutError extends TaxoAIError {
  constructor() {
    super("Request timed out", 0);
    this.name = "TaxoAITimeoutError";
  }
}

// ── Client ─────────────────────────────────────────────────────────────

export class TaxoAIClient {
  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(apiKey: string, baseUrl?: string, timeoutMs?: number) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl ?? TAXOAI_API_URL;
    this.timeoutMs = timeoutMs ?? API_TIMEOUT_MS;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = `${this.baseUrl}${path}`;
      const headers: Record<string, string> = {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      };

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        await this.handleError(response);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof TaxoAIError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new TaxoAITimeoutError();
      }
      throw new TaxoAIError(
        `Network error: ${error instanceof Error ? error.message : "Unknown"}`,
        0,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async handleError(response: Response): Promise<never> {
    const status = response.status;

    if (status === 401) {
      throw new TaxoAIAuthError();
    }

    if (status === 402) {
      let message = "Payment required - usage limit reached";
      try {
        const body = await response.json();
        message = body.message || body.error || message;
      } catch {
        // use default message
      }
      throw new TaxoAIPaymentRequiredError(message);
    }

    if (status === 429) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfter = retryAfterHeader
        ? parseInt(retryAfterHeader, 10)
        : undefined;
      throw new TaxoAIRateLimitError(retryAfter);
    }

    let errorMessage = `API error: ${status}`;
    try {
      const body = await response.json();
      errorMessage = body.message || body.error || errorMessage;
    } catch {
      // use default message
    }

    throw new TaxoAIError(errorMessage, status);
  }

  async analyzeProduct(data: AnalyzeRequest): Promise<AnalyzeResponse> {
    return this.request<AnalyzeResponse>("POST", "/v1/products/analyze", data);
  }

  async getUsage(): Promise<UsageResponse> {
    return this.request<UsageResponse>("GET", "/v1/usage");
  }

  async searchTaxonomies(
    query: string,
    limit = 10,
  ): Promise<TaxonomySearchResponse> {
    const encodedQuery = encodeURIComponent(query);
    return this.request<TaxonomySearchResponse>(
      "GET",
      `/v1/taxonomies/search?q=${encodedQuery}&limit=${limit}`,
    );
  }

  async submitBatch(products: AnalyzeRequest[]): Promise<BatchResponse> {
    return this.request<BatchResponse>("POST", "/v1/products/batch", {
      products,
    });
  }

  async getJob(jobId: string): Promise<JobResponse> {
    return this.request<JobResponse>("GET", `/v1/jobs/${jobId}`);
  }
}
