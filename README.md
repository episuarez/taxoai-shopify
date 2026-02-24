# TaxoAI for Shopify

Auto-categorize Shopify products and generate SEO content using AI.

[![CI](https://github.com/episuarez/taxoai-shopify/actions/workflows/ci.yml/badge.svg)](https://github.com/episuarez/taxoai-shopify/actions/workflows/ci.yml)

---

## What it does

TaxoAI analyzes your Shopify products and automatically:

- **Classifies products** into the Google Product Taxonomy with confidence scores
- **Generates SEO content** — optimized titles, meta descriptions, keywords with search volume
- **Detects attributes** — color, material, gender, style, and extra attributes
- **Analyzes product images** — detects visual attributes and flags poor backgrounds
- **Updates Shopify SEO fields** — title tag, meta description, and product tags via GraphQL
- **Sets product type** from the Google category
- **Writes typed metafields** — classification, attributes, keywords stored as structured data
- **Bulk analysis** — process up to 500 products at once with real-time progress
- **Auto-analyze via webhook** — analyze products automatically when they're updated

## Tech stack

- [Shopify App Remix](https://shopify.dev/docs/apps/tools/cli) (Node.js + Remix)
- [Shopify Polaris](https://polaris.shopify.com/) UI components
- [Prisma](https://www.prisma.io/) ORM (SQLite dev / PostgreSQL prod)
- TypeScript

## Requirements

- Node.js 18+
- A Shopify Partner account and development store
- A TaxoAI API key ([get one free](https://app.taxoai.dev))

## Installation

### 1. Clone and install

```bash
git clone https://github.com/episuarez/taxoai-shopify.git
cd taxoai-shopify
npm install
```

### 2. Setup database

```bash
npx prisma generate
npx prisma migrate dev
```

### 3. Configure Shopify CLI

Make sure you have the [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) installed and configured with your Partner account.

### 4. Run locally

```bash
npm run dev
```

This will start the app and open a tunnel to your development store.

### 5. Configure

1. Open the app in your Shopify admin
2. Go to **Settings**
3. Enter your TaxoAI API key (get one at [app.taxoai.dev](https://app.taxoai.dev))
4. Choose your language and preferences

## How it works

```
Shopify product ──> TaxoAI API ──> Google category + SEO + Attributes
                                          │
                       ┌─────────────────┼─────────────────┐
                       ▼                 ▼                 ▼
                 productUpdate      tagsAdd          metafieldsSet
                 (SEO fields)      (keywords)       (taxoai namespace)
```

1. The app fetches product data from Shopify via GraphQL
2. Sends name, description, price, and images to the TaxoAI API
3. Receives classification, SEO content, and detected attributes
4. If confidence meets your threshold, applies changes back to Shopify
5. Stores full results in Prisma and as product metafields

## Free tier

**25 products/month** — no credit card required.

Usage is verified server-side on every analysis. When you need more, upgrade at [taxoai.dev](https://taxoai.dev).

## App pages

| Page | Description |
|---|---|
| **Dashboard** | Usage stats, recent analyses, quick actions |
| **Settings** | API key, language, auto-analyze, confidence threshold |
| **Product detail** | Full analysis results, manual analyze button, taxonomy search |
| **Bulk analysis** | Select products, batch analyze with progress bar |

## Metafields

All data is stored under the `taxoai` namespace:

| Key | Type | Description |
|---|---|---|
| `google_category` | `single_line_text_field` | Full Google category path |
| `google_category_id` | `number_integer` | Google category ID |
| `confidence` | `number_decimal` | Classification confidence (0-1) |
| `keywords` | `json` | Keywords with search volume |
| `color` | `json` | Detected colors array |
| `material` | `single_line_text_field` | Detected material |
| `gender` | `single_line_text_field` | Detected gender |
| `style` | `single_line_text_field` | Detected style |
| `extra_attributes` | `json` | Additional detected attributes |

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npx tsc --noEmit
```

## License

MIT

---

Built by [TaxoAI](https://taxoai.dev)
