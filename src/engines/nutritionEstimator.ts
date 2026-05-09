import type { CalorieSummary } from '@/services/calorieLogs';

export interface FoodReference {
  id: string;
  name: string;
  serving: string;
  servingGrams?: number;
  aliases: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface EstimatedFood {
  id: string;
  food: FoodReference;
  quantity: number;
  unit: string;
  factor: number;
  label: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealEstimate {
  input: string;
  items: EstimatedFood[];
  unmatched: string[];
  totals: CalorieSummary;
}

const NUMBER_WORDS: Record<string, number> = {
  half: 0.5,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const GRAM_UNITS = new Set(['g', 'gm', 'gms', 'gram', 'grams']);

export const MEAL_ESTIMATE_EXAMPLES = [
  '3 chapati and 1 bowl paneer curry',
  '2 eggs, 1 scoop whey, 1 banana',
  '1 bowl dal and 1 cup rice',
];

export const FOOD_REFERENCES: FoodReference[] = [
  {
    id: 'chapati',
    name: 'Chapati',
    serving: '1 medium roti',
    servingGrams: 45,
    aliases: ['chapati', 'roti', 'phulka'],
    calories: 120,
    protein: 3.5,
    carbs: 18,
    fat: 3,
  },
  {
    id: 'paneer-curry',
    name: 'Paneer curry',
    serving: '1 bowl',
    servingGrams: 220,
    aliases: ['paneer curry', 'paneer sabzi', 'paneer masala', 'paneer gravy'],
    calories: 380,
    protein: 18,
    carbs: 12,
    fat: 28,
  },
  {
    id: 'paneer',
    name: 'Paneer',
    serving: '100 g',
    servingGrams: 100,
    aliases: ['paneer'],
    calories: 265,
    protein: 18,
    carbs: 3,
    fat: 20,
  },
  {
    id: 'dal',
    name: 'Dal',
    serving: '1 bowl',
    servingGrams: 220,
    aliases: ['dal', 'daal', 'lentil', 'lentils'],
    calories: 220,
    protein: 13,
    carbs: 32,
    fat: 4,
  },
  {
    id: 'rice',
    name: 'Cooked rice',
    serving: '1 cup',
    servingGrams: 160,
    aliases: ['rice', 'cooked rice', 'white rice'],
    calories: 205,
    protein: 4,
    carbs: 45,
    fat: 0.4,
  },
  {
    id: 'brown-rice',
    name: 'Brown rice',
    serving: '1 cup',
    servingGrams: 195,
    aliases: ['brown rice'],
    calories: 215,
    protein: 5,
    carbs: 45,
    fat: 1.8,
  },
  {
    id: 'chicken-breast',
    name: 'Chicken breast',
    serving: '100 g cooked',
    servingGrams: 100,
    aliases: ['chicken breast', 'chicken'],
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
  },
  {
    id: 'egg',
    name: 'Egg',
    serving: '1 large',
    servingGrams: 50,
    aliases: ['egg', 'eggs', 'boiled egg', 'omelette egg'],
    calories: 72,
    protein: 6.3,
    carbs: 0.4,
    fat: 4.8,
  },
  {
    id: 'whey',
    name: 'Whey protein',
    serving: '1 scoop',
    servingGrams: 32,
    aliases: ['whey', 'whey protein', 'protein powder', 'scoop whey'],
    calories: 140,
    protein: 24,
    carbs: 3,
    fat: 2,
  },
  {
    id: 'banana',
    name: 'Banana',
    serving: '1 medium',
    servingGrams: 118,
    aliases: ['banana'],
    calories: 105,
    protein: 1.3,
    carbs: 27,
    fat: 0.4,
  },
  {
    id: 'curd',
    name: 'Curd',
    serving: '1 bowl',
    servingGrams: 200,
    aliases: ['curd', 'dahi', 'yogurt', 'yoghurt'],
    calories: 130,
    protein: 7,
    carbs: 10,
    fat: 7,
  },
  {
    id: 'oats',
    name: 'Oats',
    serving: '40 g dry',
    servingGrams: 40,
    aliases: ['oats', 'oatmeal'],
    calories: 150,
    protein: 5,
    carbs: 27,
    fat: 3,
  },
  {
    id: 'milk',
    name: 'Milk',
    serving: '1 cup',
    servingGrams: 240,
    aliases: ['milk'],
    calories: 150,
    protein: 8,
    carbs: 12,
    fat: 8,
  },
  {
    id: 'rajma',
    name: 'Rajma',
    serving: '1 bowl',
    servingGrams: 240,
    aliases: ['rajma', 'kidney bean curry'],
    calories: 270,
    protein: 14,
    carbs: 42,
    fat: 6,
  },
  {
    id: 'chole',
    name: 'Chole',
    serving: '1 bowl',
    servingGrams: 240,
    aliases: ['chole', 'chana masala', 'chickpea curry'],
    calories: 310,
    protein: 15,
    carbs: 45,
    fat: 9,
  },
  {
    id: 'sabzi',
    name: 'Mixed sabzi',
    serving: '1 bowl',
    servingGrams: 180,
    aliases: ['sabzi', 'subzi', 'vegetable curry', 'mixed veg'],
    calories: 160,
    protein: 4,
    carbs: 18,
    fat: 8,
  },
  {
    id: 'idli',
    name: 'Idli',
    serving: '1 piece',
    servingGrams: 40,
    aliases: ['idli', 'idly'],
    calories: 58,
    protein: 2,
    carbs: 12,
    fat: 0.4,
  },
  {
    id: 'dosa',
    name: 'Dosa',
    serving: '1 medium',
    servingGrams: 100,
    aliases: ['dosa'],
    calories: 170,
    protein: 4,
    carbs: 28,
    fat: 5,
  },
  {
    id: 'poha',
    name: 'Poha',
    serving: '1 bowl',
    servingGrams: 180,
    aliases: ['poha'],
    calories: 260,
    protein: 6,
    carbs: 45,
    fat: 7,
  },
  {
    id: 'upma',
    name: 'Upma',
    serving: '1 bowl',
    servingGrams: 180,
    aliases: ['upma'],
    calories: 250,
    protein: 6,
    carbs: 40,
    fat: 8,
  },
  {
    id: 'paratha',
    name: 'Paratha',
    serving: '1 medium',
    servingGrams: 80,
    aliases: ['paratha', 'plain paratha'],
    calories: 260,
    protein: 6,
    carbs: 34,
    fat: 11,
  },
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.+\s]/g, ' ')
    .replace(/(\d)(g|gm|gms|gram|grams)\b/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readQuantity(value: string) {
  const normalized = normalize(value);
  const numberMatch = normalized.match(/(?:^|\s)(\d+(?:\.\d+)?)(?:\s|$)/);
  if (numberMatch) return Number.parseFloat(numberMatch[1]);

  for (const [word, amount] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`(?:^|\\s)${word}(?:\\s|$)`).test(normalized)) return amount;
  }
  return 1;
}

function readUnit(value: string) {
  const match = normalize(value).match(/(?:^|\s)(g|gm|gms|gram|grams|cup|cups|bowl|bowls|scoop|scoops|piece|pieces|pc|pcs|serving|servings)(?:\s|$)/);
  return match?.[1] ?? '';
}

function findFood(part: string) {
  const normalized = normalize(part);
  const aliases = FOOD_REFERENCES.flatMap(food =>
    food.aliases.map(alias => ({ food, alias, normalizedAlias: normalize(alias) })),
  ).sort((a, b) => b.normalizedAlias.length - a.normalizedAlias.length);

  return aliases.find(({ normalizedAlias }) =>
    new RegExp(`(?:^|\\s)${escapeRegExp(normalizedAlias)}(?:\\s|$)`).test(normalized),
  );
}

function estimatePart(part: string): EstimatedFood | null {
  const match = findFood(part);
  if (!match) return null;

  const normalized = normalize(part);
  const aliasPattern = new RegExp(`(?:^|\\s)${escapeRegExp(match.normalizedAlias)}(?:\\s|$)`);
  const quantityText = normalized.replace(aliasPattern, ' ');
  const quantity = readQuantity(quantityText);
  const unit = readUnit(quantityText);
  const factor = GRAM_UNITS.has(unit) && match.food.servingGrams
    ? quantity / match.food.servingGrams
    : quantity;

  const safeFactor = Math.max(0.1, factor);
  const labelUnit = unit && !GRAM_UNITS.has(unit) ? `${unit} ` : '';
  const label = `${quantity}${labelUnit ? ` ${labelUnit}` : ' '}${match.food.name}`.replace(/\s+/g, ' ').trim();

  return {
    id: match.food.id,
    food: match.food,
    quantity,
    unit,
    factor: safeFactor,
    label,
    calories: Math.round(match.food.calories * safeFactor),
    protein: Math.round(match.food.protein * safeFactor * 10) / 10,
    carbs: Math.round(match.food.carbs * safeFactor * 10) / 10,
    fat: Math.round(match.food.fat * safeFactor * 10) / 10,
  };
}

export function estimateMeal(input: string): MealEstimate {
  const parts = normalize(input)
    .split(/\s+(?:and|with)\s+|[,;+&]/)
    .map(part => part.trim())
    .filter(Boolean);

  const items: EstimatedFood[] = [];
  const unmatched: string[] = [];

  for (const part of parts) {
    const estimate = estimatePart(part);
    if (estimate) {
      items.push(estimate);
    } else {
      unmatched.push(part);
    }
  }

  const totals = items.reduce<CalorieSummary>(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      protein: sum.protein + item.protein,
      carbs: sum.carbs + item.carbs,
      fat: sum.fat + item.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return { input, items, unmatched, totals };
}
