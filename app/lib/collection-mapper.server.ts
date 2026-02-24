interface AdminGraphQL {
  (query: string, options?: { variables?: Record<string, unknown> }): Promise<{
    json: () => Promise<Record<string, unknown>>;
  }>;
}

const COLLECTIONS_QUERY = `#graphql
  query collectionsByTitle($query: String!) {
    collections(first: 1, query: $query) {
      edges {
        node {
          id
          title
        }
      }
    }
  }
`;

const COLLECTION_CREATE_MUTATION = `#graphql
  mutation collectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const COLLECTION_ADD_PRODUCTS_MUTATION = `#graphql
  mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
    collectionAddProducts(id: $id, productIds: $productIds) {
      collection {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Map a product to a Shopify collection based on the Google product category.
 * Creates the collection if it does not exist. Uses L1 > L2 category levels.
 */
export async function mapToCollection(
  admin: AdminGraphQL,
  productGid: string,
  googleCategory: string,
): Promise<void> {
  // Parse the category path, use L1 > L2 for the collection name
  const parts = googleCategory.split(" > ");
  const collectionTitle =
    parts.length >= 2 ? `${parts[0]} - ${parts[1]}` : parts[0];

  // Try to find an existing collection with this title
  let collectionId = await findCollection(admin, collectionTitle);

  // Create the collection if it does not exist
  if (!collectionId) {
    collectionId = await createCollection(admin, collectionTitle);
  }

  if (!collectionId) {
    throw new Error(
      `Failed to find or create collection: ${collectionTitle}`,
    );
  }

  // Add the product to the collection
  const addResponse = await admin(COLLECTION_ADD_PRODUCTS_MUTATION, {
    variables: {
      id: collectionId,
      productIds: [productGid],
    },
  });

  const addResult = (await addResponse.json()) as {
    data?: {
      collectionAddProducts?: {
        userErrors?: Array<{ field: string[]; message: string }>;
      };
    };
  };

  const addErrors =
    addResult.data?.collectionAddProducts?.userErrors ?? [];
  if (addErrors.length > 0) {
    // Ignore "already in collection" errors
    const realErrors = addErrors.filter(
      (e) => !e.message.includes("already"),
    );
    if (realErrors.length > 0) {
      throw new Error(
        `Failed to add product to collection: ${realErrors.map((e) => e.message).join(", ")}`,
      );
    }
  }
}

async function findCollection(
  admin: AdminGraphQL,
  title: string,
): Promise<string | null> {
  const response = await admin(COLLECTIONS_QUERY, {
    variables: { query: `title:'${title}'` },
  });

  const result = (await response.json()) as {
    data?: {
      collections?: {
        edges?: Array<{ node: { id: string; title: string } }>;
      };
    };
  };

  const edges = result.data?.collections?.edges ?? [];
  const match = edges.find((e) => e.node.title === title);
  return match?.node.id ?? null;
}

async function createCollection(
  admin: AdminGraphQL,
  title: string,
): Promise<string | null> {
  const response = await admin(COLLECTION_CREATE_MUTATION, {
    variables: {
      input: {
        title,
        descriptionHtml: `Auto-created by TaxoAI based on Google Product Taxonomy.`,
      },
    },
  });

  const result = (await response.json()) as {
    data?: {
      collectionCreate?: {
        collection?: { id: string };
        userErrors?: Array<{ field: string[]; message: string }>;
      };
    };
  };

  const errors =
    result.data?.collectionCreate?.userErrors ?? [];
  if (errors.length > 0) {
    console.error(
      `Failed to create collection "${title}": ${errors.map((e) => e.message).join(", ")}`,
    );
    return null;
  }

  return result.data?.collectionCreate?.collection?.id ?? null;
}
