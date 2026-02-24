import { vi, beforeEach, afterEach } from "vitest";

// Mock Prisma client
vi.mock("~/db.server", () => {
  const mockPrisma = {
    shopSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    productAnalysis: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    usage: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  };

  return { default: mockPrisma };
});

// Mock fetch globally
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});
