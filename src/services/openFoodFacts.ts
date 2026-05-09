const CACHE_KEY = 'perf-os-open-food-facts-cache-v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OPEN_FOOD_FACTS_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

interface CacheEntry {
  savedAt: number;
  products: OpenFoodFactsProduct[];
}

interface RawProduct {
  code?: string | number;
  product_name?: string;
  generic_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: string | number;
  nutriments?: Record<string, unknown>;
  image_front_small_url?: string;
  image_url?: string;
  url?: string;
}

export interface OpenFoodFactsProduct {
  code: string;
  name: string;
  brand?: string;
  servingSize?: string;
  servingGrams?: number;
  imageUrl?: string;
  url: string;
  calories100g: number;
  protein100g: number;
  carbs100g: number;
  fat100g: number;
}

export interface OpenFoodFactsServing {
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function normalizeQuery(query: string) {
  return query.toLowerCase().replace(/\s+/g, ' ').trim();
}

function toNumber(value: unknown) {
  return Math.max(0, Number.parseFloat(String(value ?? 0)) || 0);
}

function roundMacro(value: number) {
  return Math.round(value * 10) / 10;
}

function readCache(): Record<string, CacheEntry> {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, CacheEntry> : {};
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Cache is an optimization. Private browsing or quota issues should not
    // block meal logging.
  }
}

function readServingGrams(product: RawProduct) {
  const quantity = toNumber(product.serving_quantity);
  if (quantity > 0) return quantity;

  const match = product.serving_size?.match(/(\d+(?:\.\d+)?)\s*g/i);
  return match ? toNumber(match[1]) : undefined;
}

function readKcal(nutriments: Record<string, unknown>) {
  const kcal = toNumber(nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal']);
  if (kcal > 0) return kcal;

  const kj = toNumber(nutriments.energy_100g ?? nutriments.energy);
  return kj > 0 ? kj / 4.184 : 0;
}

function toProduct(product: RawProduct): OpenFoodFactsProduct | null {
  const nutriments = product.nutriments ?? {};
  const calories100g = readKcal(nutriments);
  const name = (product.product_name || product.generic_name || '').trim();
  const code = String(product.code ?? '').trim();

  if (!name || !code || calories100g <= 0) return null;

  return {
    code,
    name,
    brand: product.brands?.split(',')[0]?.trim() || undefined,
    servingSize: product.serving_size?.trim() || undefined,
    servingGrams: readServingGrams(product),
    imageUrl: product.image_front_small_url || product.image_url || undefined,
    url: product.url || `https://world.openfoodfacts.org/product/${code}`,
    calories100g: Math.round(calories100g),
    protein100g: roundMacro(toNumber(nutriments.proteins_100g ?? nutriments.proteins)),
    carbs100g: roundMacro(toNumber(nutriments.carbohydrates_100g ?? nutriments.carbohydrates)),
    fat100g: roundMacro(toNumber(nutriments.fat_100g ?? nutriments.fat)),
  };
}

export function servingFromOpenFoodFacts(product: OpenFoodFactsProduct): OpenFoodFactsServing {
  const grams = product.servingGrams && product.servingGrams > 0 ? product.servingGrams : 100;
  const factor = grams / 100;

  return {
    name: `${product.name}${product.brand ? ` (${product.brand})` : ''}`,
    grams,
    calories: Math.round(product.calories100g * factor),
    protein: roundMacro(product.protein100g * factor),
    carbs: roundMacro(product.carbs100g * factor),
    fat: roundMacro(product.fat100g * factor),
  };
}

export async function searchOpenFoodFacts(query: string, limit = 5): Promise<OpenFoodFactsProduct[]> {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];

  const cache = readCache();
  const cached = cache[normalized];
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    return cached.products.slice(0, limit);
  }

  const params = new URLSearchParams({
    search_terms: normalized,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(Math.max(limit * 2, 8)),
    fields: [
      'code',
      'product_name',
      'generic_name',
      'brands',
      'serving_size',
      'serving_quantity',
      'nutriments',
      'image_front_small_url',
      'image_url',
      'url',
    ].join(','),
  });

  const response = await fetch(`${OPEN_FOOD_FACTS_SEARCH_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Open Food Facts search failed: ${response.status}`);

  const body = await response.json() as { products?: RawProduct[] };
  const products = (body.products ?? [])
    .map(toProduct)
    .filter((item): item is OpenFoodFactsProduct => Boolean(item))
    .slice(0, limit);

  cache[normalized] = { savedAt: Date.now(), products };
  writeCache(cache);
  return products;
}
