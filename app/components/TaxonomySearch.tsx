import { useState, useCallback, useRef, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Autocomplete,
  Icon,
  BlockStack,
  Text,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";

interface TaxonomyCategory {
  id: number;
  full_path: string;
  level_1: string;
  relevance: number;
}

interface TaxonomySearchProps {
  productId: string;
  onSelect?: (category: TaxonomyCategory) => void;
}

export function TaxonomySearch({ productId, onSelect }: TaxonomySearchProps) {
  const fetcher = useFetcher<{
    categories?: TaxonomyCategory[];
    error?: string;
  }>();

  const [inputValue, setInputValue] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<TaxonomyCategory | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (value.length >= 2) {
        debounceRef.current = setTimeout(() => {
          fetcher.load(
            `/app/api/taxonomy-search?q=${encodeURIComponent(value)}&limit=10`,
          );
        }, 300);
      }
    },
    [fetcher],
  );

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const categories = fetcher.data?.categories ?? [];
  const isLoading = fetcher.state === "loading";

  const options = categories.map((cat) => ({
    value: String(cat.id),
    label: cat.full_path,
  }));

  const handleSelect = useCallback(
    (selected: string[]) => {
      const selectedId = selected[0];
      const category = categories.find(
        (c) => String(c.id) === selectedId,
      );
      if (category) {
        setSelectedCategory(category);
        setInputValue(category.full_path);
        onSelect?.(category);
      }
    },
    [categories, onSelect],
  );

  const textField = (
    <Autocomplete.TextField
      onChange={handleInputChange}
      label="Search taxonomy"
      value={inputValue}
      prefix={<Icon source={SearchIcon} />}
      placeholder="Search Google Product Taxonomy..."
      autoComplete="off"
    />
  );

  return (
    <BlockStack gap="300">
      <Autocomplete
        options={options}
        selected={selectedCategory ? [String(selectedCategory.id)] : []}
        onSelect={handleSelect}
        textField={textField}
        loading={isLoading}
        listTitle="Categories"
      />
      {selectedCategory && (
        <InlineStack gap="200" blockAlign="center">
          <Text as="span" variant="bodySm" tone="subdued">
            Selected:
          </Text>
          <Badge tone="info">{selectedCategory.full_path}</Badge>
          <Text as="span" variant="bodySm" tone="subdued">
            (ID: {selectedCategory.id})
          </Text>
        </InlineStack>
      )}
    </BlockStack>
  );
}
