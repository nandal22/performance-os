import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Flame, Plus, Trash2, Utensils, Beef, Wheat, Droplet, type LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cutPhaseTargets } from '@/data/workoutPlan';
import { toISODate } from '@/lib/utils';
import { calorieLogsService, type CalorieLog, type MealType } from '@/services/calorieLogs';

const MEALS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

const QUICK_FOODS = [
  { name: 'Whey protein', meal: 'snack' as MealType, calories: 120, protein: 24, carbs: 3, fat: 2 },
  { name: 'Chicken breast + rice', meal: 'lunch' as MealType, calories: 480, protein: 45, carbs: 52, fat: 8 },
  { name: 'Eggs + toast', meal: 'breakfast' as MealType, calories: 360, protein: 24, carbs: 28, fat: 16 },
  { name: 'Greek yogurt', meal: 'snack' as MealType, calories: 160, protein: 18, carbs: 16, fat: 2 },
];

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
  const [logs, setLogs] = useState<CalorieLog[]>(() => calorieLogsService.getByDate());

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

  const refresh = (nextDate = date) => {
    setLogs(calorieLogsService.getByDate(nextDate));
  };

  const changeDate = (nextDate: string) => {
    setDate(nextDate);
    refresh(nextDate);
  };

  const addEntry = (preset?: (typeof QUICK_FOODS)[number]) => {
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

    calorieLogsService.create({
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
    refresh();
    toast.success(`${input.name} logged`);
  };

  const deleteEntry = (id: string) => {
    calorieLogsService.delete(id);
    refresh();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-2xl px-4 pt-safe pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Cut phase</p>
            <h1 className="text-xl font-bold text-white tracking-tight">Calories</h1>
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
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 px-0.5">Quick add</p>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_FOODS.map(food => (
              <button
                key={food.name}
                onClick={() => addEntry(food)}
                className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3 text-left active:scale-[0.98] transition-transform"
              >
                <p className="text-sm font-semibold text-white leading-snug">{food.name}</p>
                <p className="text-[11px] text-muted-foreground mt-1 nums">{food.calories} kcal · {food.protein}g protein</p>
              </button>
            ))}
          </div>
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
                        {log.meal} · {log.calories} kcal · P {log.protein}g · C {log.carbs}g · F {log.fat}g
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
