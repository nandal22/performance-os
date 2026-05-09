import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Beef,
  Calculator,
  Check,
  Droplet,
  Flame,
  Footprints,
  Pencil,
  Plus,
  Save,
  Trash2,
  Utensils,
  X,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cutPhaseTargets } from '@/data/workoutPlan';
import { estimateMeal, MEAL_ESTIMATE_EXAMPLES, type MealEstimate } from '@/engines/nutritionEstimator';
import { toISODate } from '@/lib/utils';
import { calorieLogsService, type CalorieLog, type CalorieStorageMode, type MealType } from '@/services/calorieLogs';
import { dailyStepsService, type DailyStepsStorageMode } from '@/services/dailySteps';
import { DEFAULT_QUICK_FOODS, quickFoodsService, type QuickFood, type QuickFoodsStorageMode } from '@/services/quickFoods';

const MEALS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

interface QuickFoodDraft {
  id: string;
  name: string;
  meal: MealType;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

const emptyForm = {
  name: '',
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
};

function clampPct(value: number, target: number) {
  return `${Math.min(100, Math.max(0, (value / target) * 100))}%`;
}

function readNumber(value: string) {
  return Math.max(0, Number.parseFloat(value) || 0);
}

function toQuickDraft(food: QuickFood): QuickFoodDraft {
  return {
    id: food.id,
    name: food.name,
    meal: food.meal,
    calories: String(food.calories || ''),
    protein: String(food.protein || ''),
    carbs: String(food.carbs || ''),
    fat: String(food.fat || ''),
  };
}

function fromQuickDraft(draft: QuickFoodDraft): QuickFood | null {
  const name = draft.name.trim();
  const calories = readNumber(draft.calories);
  if (!name || calories <= 0) return null;

  return {
    id: draft.id,
    name,
    meal: draft.meal,
    calories,
    protein: readNumber(draft.protein),
    carbs: readNumber(draft.carbs),
    fat: readNumber(draft.fat),
  };
}

function createQuickDraft(): QuickFoodDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    meal: 'snack',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
  };
}

function getCombinedStorageMode(
  modes: [CalorieStorageMode, DailyStepsStorageMode, QuickFoodsStorageMode],
) {
  return modes.includes('local') ? 'local' : 'database';
}

function MacroStat({
  icon: Icon,
  label,
  value,
  target,
  tone,
  bar,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  target: number;
  tone: string;
  bar: string;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${tone}`} />
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
      <p className="text-xl font-bold text-white nums">{Math.round(value)}g</p>
      <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden mt-2">
        <div className={`h-full ${bar}`} style={{ width: clampPct(value, target) }} />
      </div>
    </div>
  );
}

export default function CaloriesPage() {
  const [date, setDate] = useState(toISODate(new Date()));
  const [meal, setMeal] = useState<MealType>('breakfast');
  const [form, setForm] = useState(emptyForm);
  const [logs, setLogs] = useState<CalorieLog[]>([]);
  const [stepsInput, setStepsInput] = useState('');
  const [quickFoods, setQuickFoods] = useState<QuickFood[]>(DEFAULT_QUICK_FOODS);
  const [editingQuick, setEditingQuick] = useState(false);
  const [quickDrafts, setQuickDrafts] = useState<QuickFoodDraft[]>(() => DEFAULT_QUICK_FOODS.map(toQuickDraft));
  const [estimateInput, setEstimateInput] = useState('');
  const [mealEstimate, setMealEstimate] = useState<MealEstimate | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [storageMode, setStorageMode] = useState<'database' | 'local'>('database');

  const loadData = useCallback(async (nextDate: string) => {
    setLoadingData(true);
    try {
      const [nextLogs, nextSteps, nextFoods] = await Promise.all([
        calorieLogsService.getByDate(nextDate),
        dailyStepsService.get(nextDate),
        quickFoodsService.getAll(),
      ]);

      setLogs(nextLogs);
      setStepsInput(nextSteps ? String(nextSteps.steps) : '');
      setQuickFoods(nextFoods);
      if (!editingQuick) setQuickDrafts(nextFoods.map(toQuickDraft));
    } finally {
      setStorageMode(getCombinedStorageMode([
        calorieLogsService.getStorageMode(),
        dailyStepsService.getStorageMode(),
        quickFoodsService.getStorageMode(),
      ]));
      setLoadingData(false);
    }
  }, [editingQuick]);

  useEffect(() => {
    void loadData(date);
  }, [date, loadData]);

  const summary = useMemo(() => (
    logs.reduce(
      (sum, log) => ({
        calories: sum.calories + log.calories,
        protein: sum.protein + log.protein,
        carbs: sum.carbs + log.carbs,
        fat: sum.fat + log.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    )
  ), [logs]);

  const caloriePct = Math.min(100, (summary.calories / cutPhaseTargets.caloriesTarget) * 100);
  const inRange = summary.calories >= cutPhaseTargets.caloriesMin && summary.calories <= cutPhaseTargets.caloriesMax;
  const remaining = cutPhaseTargets.caloriesTarget - summary.calories;
  const steps = Math.round(readNumber(stepsInput));
  const stepsPct = Math.min(100, (steps / 10000) * 100);
  const stepsStatus = steps >= 10000 ? 'Top range' : steps >= 8000 ? 'On track' : `${Math.max(0, 8000 - steps).toLocaleString()} to 8k`;
  const storageStatus = storageMode === 'database' ? 'Synced to account' : 'Local backup';

  const changeDate = (nextDate: string) => {
    setDate(nextDate);
  };

  const addEntry = async (preset?: QuickFood) => {
    const input = preset ?? {
      name: form.name.trim(),
      meal,
      calories: readNumber(form.calories),
      protein: readNumber(form.protein),
      carbs: readNumber(form.carbs),
      fat: readNumber(form.fat),
    };

    if (!input.name) return toast.error('Enter food name');
    if (input.calories <= 0) return toast.error('Enter calories');

    await calorieLogsService.create({
      date,
      meal: input.meal,
      name: input.name,
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
    });
    setForm(emptyForm);
    setMeal(input.meal);
    await loadData(date);
    toast.success(`${input.name} logged`);
  };

  const runMealEstimate = (value = estimateInput) => {
    const next = estimateMeal(value);
    setMealEstimate(next);
    if (next.items.length === 0) {
      toast.error('No foods matched yet');
    }
  };

  const logMealEstimate = async () => {
    if (!mealEstimate || mealEstimate.items.length === 0 || mealEstimate.totals.calories <= 0) {
      return toast.error('Estimate a meal first');
    }

    const name = mealEstimate.items.map(item => item.label).join(' + ');
    await calorieLogsService.create({
      date,
      meal,
      name: name.length > 90 ? `${name.slice(0, 87)}...` : name,
      calories: mealEstimate.totals.calories,
      protein: mealEstimate.totals.protein,
      carbs: mealEstimate.totals.carbs,
      fat: mealEstimate.totals.fat,
    });
    await loadData(date);
    toast.success('Meal estimate logged');
  };

  const logRawMealNote = async () => {
    const rawText = estimateInput.trim();
    if (!rawText) return toast.error('Enter what you ate');

    await calorieLogsService.create({
      date,
      meal,
      name: rawText.length > 120 ? `${rawText.slice(0, 117)}...` : rawText,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    setEstimateInput('');
    setMealEstimate(null);
    await loadData(date);
    toast.success('Meal note saved');
  };

  const saveSteps = async () => {
    if (steps <= 0) return toast.error('Enter daily steps');
    await dailyStepsService.upsert(date, steps);
    setStepsInput(String(steps));
    setStorageMode(getCombinedStorageMode([
      calorieLogsService.getStorageMode(),
      dailyStepsService.getStorageMode(),
      quickFoodsService.getStorageMode(),
    ]));
    toast.success('Steps saved');
  };

  const startEditingQuick = () => {
    setQuickDrafts(quickFoods.map(toQuickDraft));
    setEditingQuick(true);
  };

  const cancelQuickEditing = () => {
    setQuickDrafts(quickFoods.map(toQuickDraft));
    setEditingQuick(false);
  };

  const updateQuickDraft = (id: string, patch: Partial<QuickFoodDraft>) => {
    setQuickDrafts(prev => prev.map(food => (food.id === id ? { ...food, ...patch } : food)));
  };

  const saveQuickDrafts = async () => {
    const nextFoods = quickDrafts
      .map(fromQuickDraft)
      .filter((food): food is QuickFood => Boolean(food));

    if (nextFoods.length === 0) return toast.error('Keep at least one quick card');

    const savedFoods = await quickFoodsService.saveAll(nextFoods);
    setQuickFoods(savedFoods);
    setQuickDrafts(savedFoods.map(toQuickDraft));
    setEditingQuick(false);
    setStorageMode(getCombinedStorageMode([
      calorieLogsService.getStorageMode(),
      dailyStepsService.getStorageMode(),
      quickFoodsService.getStorageMode(),
    ]));
    toast.success('Quick cards saved');
  };

  const deleteEntry = async (id: string) => {
    await calorieLogsService.delete(id);
    await loadData(date);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-2xl px-4 pt-safe pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Cut phase</p>
            <h1 className="text-xl font-bold text-white tracking-tight">Calories</h1>
            <p className={`mt-0.5 text-[11px] ${storageMode === 'database' ? 'text-emerald-300' : 'text-orange-300'}`}>
              {loadingData ? 'Syncing...' : storageStatus}
            </p>
          </div>
          <input
            type="date"
            value={date}
            onChange={e => changeDate(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-4 space-y-4 max-w-lg mx-auto w-full pb-nav">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl overflow-hidden border border-white/[0.08] bg-gradient-to-br from-orange-500/[0.16] via-white/[0.04] to-emerald-500/[0.08] p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] text-muted-foreground">{format(new Date(date + 'T12:00:00'), 'EEEE, MMM d')}</p>
              <p className="mt-1 text-4xl font-bold text-white nums">{Math.round(summary.calories)}</p>
              <p className="text-xs text-muted-foreground">of {cutPhaseTargets.caloriesMin}-{cutPhaseTargets.caloriesMax} kcal</p>
            </div>
            <div className={`rounded-2xl px-3 py-2 border ${inRange ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-orange-400/30 bg-orange-400/10 text-orange-300'}`}>
              <p className="text-xs font-semibold nums">
                {remaining >= 0 ? `${Math.round(remaining)} left` : `${Math.abs(Math.round(remaining))} over`}
              </p>
            </div>
          </div>
          <div className="h-3 rounded-full bg-white/[0.08] overflow-hidden mt-4">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${caloriePct}%` }}
              className="h-full bg-orange-400"
            />
          </div>
        </motion.section>

        <div className="grid grid-cols-3 gap-2">
          <MacroStat icon={Beef} label="Protein" value={summary.protein} target={cutPhaseTargets.protein} tone="text-emerald-400" bar="bg-emerald-400" />
          <MacroStat icon={Wheat} label="Carbs" value={summary.carbs} target={180} tone="text-sky-400" bar="bg-sky-400" />
          <MacroStat icon={Droplet} label="Fat" value={summary.fat} target={60} tone="text-amber-400" bar="bg-amber-400" />
        </div>

        <section className="rounded-2xl glass p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Footprints className="w-4 h-4 text-emerald-300" />
              <p className="text-sm font-semibold text-white">Daily steps</p>
            </div>
            <span className={`rounded-xl px-2.5 py-1 text-[11px] font-semibold ${steps >= 8000 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/[0.05] text-muted-foreground'}`}>
              {stepsStatus}
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={stepsInput}
              onChange={e => setStepsInput(e.target.value)}
              className="min-w-0 flex-1 bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
              placeholder="8000"
            />
            <button
              onClick={saveSteps}
              className="h-12 px-4 rounded-xl bg-emerald-400/15 border border-emerald-400/25 text-emerald-200 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          </div>

          <div className="h-2 rounded-full bg-white/[0.08] overflow-hidden">
            <div className="h-full bg-emerald-400" style={{ width: `${stepsPct}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[8000, 10000].map(target => (
              <button
                key={target}
                onClick={() => setStepsInput(String(target))}
                className="rounded-xl bg-white/[0.04] border border-white/[0.08] py-2 text-xs font-semibold text-muted-foreground active:scale-[0.98] transition-transform"
              >
                {target.toLocaleString()}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl glass p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-sky-300" />
              <p className="text-sm font-semibold text-white">Meal estimate</p>
            </div>
            {mealEstimate && mealEstimate.items.length > 0 && (
              <span className="rounded-xl px-2.5 py-1 text-[11px] font-semibold bg-sky-400/10 text-sky-200 nums">
                {mealEstimate.totals.calories} kcal
              </span>
            )}
          </div>

          <textarea
            value={estimateInput}
            onChange={e => setEstimateInput(e.target.value)}
            rows={2}
            placeholder="3 chapati and 1 bowl paneer curry"
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-3 text-sm text-white placeholder:text-white/25 resize-none focus:outline-none focus:border-primary/50"
          />

          <div className="grid grid-cols-4 gap-1.5">
            {MEALS.map(item => (
              <button
                key={`estimate-${item.value}`}
                onClick={() => setMeal(item.value)}
                className={`rounded-xl py-2 text-[11px] font-semibold transition-colors ${
                  meal === item.value ? 'bg-primary text-white' : 'bg-white/[0.05] text-muted-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {MEAL_ESTIMATE_EXAMPLES.map(example => (
              <button
                key={example}
                onClick={() => {
                  setEstimateInput(example);
                  runMealEstimate(example);
                }}
                className="flex-shrink-0 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-[11px] font-semibold text-muted-foreground active:scale-[0.98] transition-transform"
              >
                {example}
              </button>
            ))}
          </div>

          {mealEstimate && (
            <div className="space-y-2">
              {mealEstimate.items.map(item => (
                <div key={`${item.id}-${item.label}`} className="rounded-xl bg-white/[0.035] border border-white/[0.07] p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">Base: {item.food.serving}</p>
                  </div>
                  <p className="text-xs font-semibold text-white nums whitespace-nowrap">
                    {item.calories} kcal
                  </p>
                </div>
              ))}

              {mealEstimate.unmatched.length > 0 && (
                <div className="rounded-xl bg-orange-400/10 border border-orange-400/20 px-3 py-2">
                  <p className="text-[11px] text-orange-200">
                    Not matched: {mealEstimate.unmatched.join(', ')}
                  </p>
                </div>
              )}

              {mealEstimate.items.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {([
                    ['Kcal', mealEstimate.totals.calories],
                    ['P', mealEstimate.totals.protein],
                    ['C', mealEstimate.totals.carbs],
                    ['F', mealEstimate.totals.fat],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-2 text-center">
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                      <p className="text-sm font-bold text-white nums">{Math.round(value)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => runMealEstimate()}
              className="h-11 rounded-xl bg-sky-400/15 border border-sky-400/25 text-sky-100 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Calculator className="w-4 h-4" />
              Estimate
            </button>
            <button
              onClick={logMealEstimate}
              className="h-11 px-4 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Plus className="w-4 h-4" />
              Log
            </button>
            <button
              onClick={logRawMealNote}
              className="h-11 px-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-muted-foreground text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Pencil className="w-4 h-4" />
              Note
            </button>
          </div>
        </section>

        <section className="rounded-2xl glass p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Utensils className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-white">Add food</p>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {MEALS.map(item => (
              <button
                key={item.value}
                onClick={() => setMeal(item.value)}
                className={`rounded-xl py-2 text-[11px] font-semibold transition-colors ${
                  meal === item.value ? 'bg-primary text-white' : 'bg-white/[0.05] text-muted-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Food"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
          />

          <div className="grid grid-cols-4 gap-2">
            {([
              ['calories', 'Kcal'],
              ['protein', 'Protein'],
              ['carbs', 'Carbs'],
              ['fat', 'Fat'],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="text-[10px] text-muted-foreground block mb-1">{label}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={form[key]}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-2 py-2.5 text-sm text-white text-center placeholder:text-white/25 focus:outline-none focus:border-primary/50"
                  placeholder="0"
                />
              </div>
            ))}
          </div>

          <button
            onClick={() => addEntry()}
            className="w-full h-12 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Plus className="w-4 h-4" />
            Log food
          </button>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Quick add</p>
            {editingQuick ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={cancelQuickEditing}
                  className="h-8 w-8 rounded-xl bg-white/[0.04] border border-white/[0.08] text-muted-foreground flex items-center justify-center"
                  aria-label="Cancel quick card edits"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={saveQuickDrafts}
                  className="h-8 w-8 rounded-xl bg-primary text-white flex items-center justify-center"
                  aria-label="Save quick cards"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={startEditingQuick}
                className="h-8 w-8 rounded-xl bg-white/[0.04] border border-white/[0.08] text-muted-foreground flex items-center justify-center"
                aria-label="Edit quick cards"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className={`${editingQuick ? 'hidden' : 'grid'} grid-cols-2 gap-2`}>
            {quickFoods.map(food => (
              <button
                key={food.id}
                onClick={() => addEntry(food)}
                className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3 text-left active:scale-[0.98] transition-transform"
              >
                <p className="text-sm font-semibold text-white leading-snug">{food.name}</p>
                <p className="text-[11px] text-muted-foreground mt-1 nums">{food.calories} kcal | {food.protein}g protein</p>
              </button>
            ))}
          </div>
          {editingQuick && (
            <div className="space-y-2">
              {quickDrafts.map(food => (
                <div key={food.id} className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={food.name}
                      onChange={e => updateQuickDraft(food.id, { name: e.target.value })}
                      className="min-w-0 flex-1 bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
                      placeholder="Food"
                    />
                    <button
                      onClick={() => setQuickDrafts(prev => prev.filter(item => item.id !== food.id))}
                      className="w-10 rounded-xl text-white/30 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                      aria-label={`Delete ${food.name || 'quick card'}`}
                    >
                      <Trash2 className="w-4 h-4 mx-auto" />
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {([
                      ['calories', 'Kcal'],
                      ['protein', 'P'],
                      ['carbs', 'C'],
                      ['fat', 'F'],
                    ] as const).map(([key, label]) => (
                      <div key={key}>
                        <label className="text-[10px] text-muted-foreground block mb-1">{label}</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={food[key]}
                          onChange={e => updateQuickDraft(food.id, { [key]: e.target.value })}
                          className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-2 py-2 text-sm text-white text-center placeholder:text-white/25 focus:outline-none focus:border-primary/50"
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>

                  <select
                    value={food.meal}
                    onChange={e => updateQuickDraft(food.id, { meal: e.target.value as MealType })}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
                  >
                    {MEALS.map(item => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
              ))}

              <button
                onClick={() => setQuickDrafts(prev => [...prev, createQuickDraft()])}
                className="w-full h-11 rounded-xl bg-white/[0.04] border border-dashed border-white/[0.14] text-sm font-semibold text-muted-foreground flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <Plus className="w-4 h-4" />
                Add card
              </button>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Logged food</p>
            <span className="text-[10px] text-muted-foreground">{logs.length}</span>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.1] p-8 text-center">
              <Flame className="w-7 h-7 mx-auto text-white/25 mb-2" />
              <p className="text-sm text-muted-foreground">No food logged for this day</p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {logs.map(log => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    className="rounded-2xl glass p-3 flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-orange-400/10 border border-orange-400/20 flex items-center justify-center">
                      <Flame className="w-4 h-4 text-orange-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{log.name}</p>
                      <p className="text-[11px] text-muted-foreground capitalize nums">
                        {log.calories > 0
                          ? `${log.meal} | ${log.calories} kcal | P ${log.protein}g | C ${log.carbs}g | F ${log.fat}g`
                          : `${log.meal} | Needs calories/macros`}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteEntry(log.id)}
                      className="p-2 rounded-xl text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      aria-label={`Delete ${log.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
