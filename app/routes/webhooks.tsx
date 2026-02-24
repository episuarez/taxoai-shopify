import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { analyzeShopifyProduct } from "~/lib/analyzer.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } =
    await authenticate.webhook(request);

  if (!admin) {
    // The admin context is not available if the access token
    // was revoked (e.g., the app was uninstalled).
    throw new Response();
  }

  switch (topic) {
    case "PRODUCTS_UPDATE": {
      const productPayload = payload as {
        id?: number;
        admin_graphql_api_id?: string;
      };

      if (!productPayload.id) {
        console.warn("Webhook: Missing product ID in payload");
        break;
      }

      // Check if auto-analyze is enabled for this shop
      const settings = await prisma.shopSettings.findUnique({
        where: { shop },
      });

      if (!settings?.apiKey || !settings.autoAnalyze) {
        console.log(
          `Webhook: Skipping auto-analyze for shop ${shop} (disabled or no API key)`,
        );
        break;
      }

      const productId = String(productPayload.id);

      // Analyze the product in the background
      try {
        await analyzeShopifyProduct(shop, productId, admin.graphql, {
          apiKey: settings.apiKey,
          language: settings.language,
          autoAnalyze: settings.autoAnalyze,
          confidenceThreshold: settings.confidenceThreshold,
          analyzeImages: settings.analyzeImages,
          updateTitle: settings.updateTitle,
          updateDescription: settings.updateDescription,
        });
        console.log(
          `Webhook: Auto-analyzed product ${productId} for shop ${shop}`,
        );
      } catch (error) {
        console.error(
          `Webhook: Failed to auto-analyze product ${productId}:`,
          error,
        );
      }
      break;
    }
    case "APP_UNINSTALLED": {
      // Clean up shop data
      if (session) {
        await prisma.session.deleteMany({ where: { shop } });
      }
      break;
    }
    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  throw new Response();
};
