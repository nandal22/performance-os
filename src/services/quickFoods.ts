import { supabase } from '@/db/supabase';
import type { MealType } from '@/services/calorieLogs';

const STORAGE_KEY = 'perf-os-quick-foods';

export type QuickFoodsStorageMode = 'database' | 'local';

export interface QuickFood {
  id: string;
  name: string;
  meal: MealType;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sortOrder?: number;
}

interface QuickFoodRow {
  id: string;
  user_id: string;
  name: string;
  meal: MealType;
  calories: number | string | null;
  protein: number | string | null;
  carbs: number | string | null;
  fat: number | string | null;
  sort_order: number | null;
}

export const DEFAULT_QUICK_FOODS: QuickFood[] = [
  { id: 'whey-protein', name: 'Whey protein', meal: 'snack', calories: 140, protein: 24, carbs: 3, fat: 2, sortOrder: 0 },
  { id: 'chicken-rice', name: 'Chicken breast + rice', meal: 'lunch', calories: 480, protein: 45, carbs: 52, fat: 8, sortOrder: 1 },
  { id: 'eggs-toast', name: 'Eggs + toast', meal: 'breakfast', calories: 360, protein: 24, carbs: 28, fat: 16, sortOrder: 2 },
  { id: 'greek-yogurt', name: 'Greek yogurt', meal: 'snack', calories: 160, protein: 18, carbs: 16, fat: 2, sortOrder: 3 },
];

let storageMode: QuickFoodsStorageMode = 'database';

function toNumber(value: unknown) {
  return Math.max(0, Number.parseFloat(String(value ?? 0)) || 0);
}

function isMealType(value: unknown): value is MealType {
  return value === 'breakfast' || value === 'lunch' || value === 'dinner' || value === 'snack';
}

function toQuickFood(row: QuickFoodRow): QuickFood {
  return {
    id: row.id,
    name: row.name,
    meal: row.meal,
    calories: toNumber(row.calories),
    protein: toNumber(row.protein),
    carbs: toNumber(row.carbs),
    fat: toNumber(row.fat),
    sortOrder: row.sort_order ?? 0,
  };
}

function sanitizeQuickFood(item: unknown, fallbackId: string): QuickFood | null {
  if (typeof item !== 'object' || item === null) return null;
  const food = item as Partial<QuickFood>;
  const name = typeof food.name === 'string' ? food.name.trim() : '';
  const calories = toNumber(food.calories);
  if (!name || calories <= 0) return null;

  return {
    id: typeof food.id === 'string' && food.id ? food.id : fallbackId,
    name,
    meal: isMealType(food.meal) ? food.meal : 'snack',
    calories,
    protein: toNumber(food.protein),
    carbs: toNumber(food.carbs),
    fat: toNumber(food.fat),
    sortOrder: typeof food.sortOrder === 'number' ? food.sortOrder : 0,
  };
}

function readAllLocal(): QuickFood[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_QUICK_FOODS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_QUICK_FOODS;
    const foods = parsed
      .map((item, index) => sanitizeQuickFood(item, `quick-food-${index}`))
      .filter((item): item is QuickFood => Boolean(item));
    return foods.length > 0 ? foods : DEFAULT_QUICK_FOODS;
  } catch {
    return DEFAULT_QUICK_FOODS;
  }
}

function writeAllLocal(foods: QuickFood[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(foods));
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

function toInsertRows(userId: string, foods: QuickFood[]) {
  return foods.map((food, index) => ({
    user_id: userId,
    name: food.name,
    meal: food.meal,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    sort_order: index,
  }));
}

async function saveRemoteFoods(userId: string, foods: QuickFood[]): Promise<QuickFood[]> {
  const { error: deleteError } = await supabase
    .from('quick_foods')
    .delete()
    .eq('user_id', userId);
  if (deleteError) throw deleteError;

  const { data, error } = await supabase
    .from('quick_foods')
    .insert(toInsertRows(userId, foods))
    .select()
    .order('sort_order', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as QuickFoodRow[]).map(toQuickFood);
}

export const quickFoodsService = {
  getStorageMode(): QuickFoodsStorageMode {
    return storageMode;
  },

  async getAll(): Promise<QuickFood[]> {
    try {
      const userId = await getUserId();
      const { data, error } = await supabase
        .from('quick_foods')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;

      storageMode = 'database';
      let foods = ((data ?? []) as QuickFoodRow[]).map(toQuickFood);
      if (foods.length === 0) {
        foods = await saveRemoteFoods(userId, readAllLocal());
      }
      writeAllLocal(foods);
      return foods;
    } catch {
      storageMode = 'local';
      return readAllLocal();
    }
  },

  async saveAll(foods: QuickFood[]): Promise<QuickFood[]> {
    const ordered = foods.map((food, index) => ({ ...food, sortOrder: index }));
    try {
      const userId = await getUserId();
      const saved = await saveRemoteFoods(userId, ordered);
      storageMode = 'database';
      writeAllLocal(saved);
      return saved;
    } catch {
      storageMode = 'local';
      writeAllLocal(ordered);
      return ordered;
    }
  },
};
