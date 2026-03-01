import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Sun, Moon } from 'lucide-react';
import { toast } from 'sonner';
import type { Exercise, ExerciseCategory } from '@/types';
import { exercisesService } from '@/services/exercises';
import { useTheme } from '@/hooks/useTheme';
import { motion, AnimatePresence } from 'framer-motion';

const CATEGORIES: ExerciseCategory[] = [
  'push', 'pull', 'legs', 'core', 'cardio', 'mobility', 'other',
];

const CAT_COLOR: Record<string, string> = {
  push: 'text-blue-400', pull: 'text-cyan-400', legs: 'text-green-400',
  core: 'text-yellow-400', cardio: 'text-orange-400', mobility: 'text-purple-400',
  other: 'text-slate-400',
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 380, damping: 28 } },
};

export default function SettingsPage() {
  const { theme, toggle } = useTheme();

  const [exercises, setExercises]     = useState<Exercise[]>([]);
  const [loading, setLoading]         = useState(true);
  const [newName, setNewName]         = useState('');
  const [newCategory, setNewCategory] = useState<ExerciseCategory>('push');
  const [creating, setCreating]       = useState(false);
  const [confirmDel, setConfirmDel]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await exercisesService.getAll();
      setExercises(all.filter(e => e.is_custom));
    } catch {
      toast.error('Failed to load exercises');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return toast.error('Enter a name');
    setCreating(true);
    try {
      const ex = await exercisesService.createCustom({
        name: newName.trim(), category: newCategory,
        primary_muscle: '', secondary_muscles: [],
      });
      setExercises(prev => [...prev, ex]);
      setNewName('');
      toast.success('Exercise added!');
    } catch {
      toast.error('Failed to create exercise');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmDel !== id) { setConfirmDel(id); return; }
    try {
      await exercisesService.deleteCustom(id);
      setExercises(prev => prev.filter(e => e.id !== id));
      setConfirmDel(null);
      toast.success('Exercise removed');
    } catch {
      toast.error('Failed to delete exercise');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-2xl px-4 pt-safe pb-4 border-b border-white/[0.06]">
        <h1 className="text-xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">App preferences</p>
      </header>

      <main className="flex-1 px-4 py-5 space-y-5 max-w-lg mx-auto w-full pb-nav">

        {/* ── Appearance ── */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">Appearance</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                {theme === 'dark'
                  ? <Moon className="w-4 h-4 text-primary" />
                  : <Sun  className="w-4 h-4 text-primary" />
                }
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                </p>
                <p className="text-[11px] text-muted-foreground">Tap to switch theme</p>
              </div>
            </div>

            {/* Animated toggle */}
            <motion.button
              onClick={toggle}
              whileTap={{ scale: 0.93 }}
              className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
                theme === 'dark' ? 'bg-primary' : 'bg-white/20'
              }`}
            >
              <motion.span
                animate={{ x: theme === 'dark' ? 24 : 2 }}
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md"
                style={{ left: 0 }}
              />
            </motion.button>
          </div>
        </motion.div>

        {/* ── Add exercise ── */}
        <motion.div
          variants={fadeUp} initial="hidden" animate="show"
          transition={{ delay: 0.05 } as never}
          className="glass rounded-2xl p-4 space-y-3"
        >
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Add Exercise</p>

          <input
            type="text"
            placeholder="Exercise name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            className="w-full glass rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50 transition-colors"
          />

          {/* Category chips */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(cat => (
              <motion.button
                key={cat}
                whileTap={{ scale: 0.92 }}
                onClick={() => setNewCategory(cat)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors relative`}
              >
                {newCategory === cat && (
                  <motion.div
                    layoutId="cat-active"
                    className="absolute inset-0 rounded-full bg-primary"
                    transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  />
                )}
                <span className={`relative z-10 ${newCategory === cat ? 'text-white' : 'text-muted-foreground'}`}>
                  {cat}
                </span>
              </motion.button>
            ))}
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-35 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Adding…' : newName.trim() ? `Add "${newName.trim()}" · ${newCategory}` : 'Add exercise'}
          </motion.button>
        </motion.div>

        {/* ── My custom exercises ── */}
        <motion.div
          variants={fadeUp} initial="hidden" animate="show"
          transition={{ delay: 0.1 } as never}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">My Exercises</p>
            {exercises.length > 0 && (
              <span className="text-[10px] text-muted-foreground">{exercises.length}</span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14 rounded-2xl bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : exercises.length === 0 ? (
            <div className="glass rounded-2xl border border-dashed border-white/10 p-8 text-center">
              <p className="text-2xl mb-2">🏋️</p>
              <p className="text-sm text-muted-foreground">No custom exercises yet</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                Add one above and it'll appear<br />in all exercise dropdowns
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {exercises.map((ex, i) => {
                  const isConfirming = confirmDel === ex.id;
                  return (
                    <motion.div
                      key={ex.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20, scale: 0.95 }}
                      transition={{ delay: i * 0.04, type: 'spring', stiffness: 380, damping: 28 }}
                      className="glass rounded-2xl px-3.5 py-3 flex items-center gap-3"
                    >
                      {/* Category dot */}
                      <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-white/[0.05] flex items-center justify-center">
                        <span className={`text-[10px] font-bold uppercase ${CAT_COLOR[ex.category] ?? 'text-slate-400'}`}>
                          {ex.category.slice(0, 2)}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{ex.name}</p>
                        <p className={`text-[11px] capitalize ${CAT_COLOR[ex.category] ?? 'text-muted-foreground'}`}>
                          {ex.category}
                        </p>
                      </div>

                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleDelete(ex.id)}
                        onBlur={() => setConfirmDel(null)}
                        className={`flex-shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                          isConfirming
                            ? 'bg-red-500/15 text-red-400 border border-red-500/25'
                            : 'text-white/20 hover:text-red-400 hover:bg-red-500/10'
                        }`}
                      >
                        {isConfirming ? 'Delete?' : <Trash2 className="w-3.5 h-3.5" />}
                      </motion.button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

      </main>
    </div>
  );
}
