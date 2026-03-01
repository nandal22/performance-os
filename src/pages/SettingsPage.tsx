import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Sun, Moon } from 'lucide-react';
import { toast } from 'sonner';
import type { Exercise, ExerciseCategory } from '@/types';
import { exercisesService } from '@/services/exercises';
import { useTheme } from '@/hooks/useTheme';

const CATEGORIES: ExerciseCategory[] = [
  'push', 'pull', 'legs', 'core', 'cardio', 'mobility', 'other',
];

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
      const ex = await exercisesService.createCustom({ name: newName.trim(), category: newCategory, primary_muscle: '', secondary_muscles: [] });
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
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg px-4 pt-safe pb-4 border-b border-white/5">
        <h1 className="text-lg font-bold text-white">Settings</h1>
        <p className="text-xs text-muted-foreground">App preferences</p>
      </header>

      <main className="flex-1 px-4 py-6 space-y-6 max-w-lg mx-auto w-full pb-nav">

        {/* ── Appearance ── */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Appearance</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === 'dark'
                ? <Moon className="w-5 h-5 text-primary" />
                : <Sun className="w-5 h-5 text-primary" />
              }
              <div>
                <p className="text-sm font-semibold text-white">
                  {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                </p>
                <p className="text-xs text-muted-foreground">Tap to switch</p>
              </div>
            </div>
            {/* Toggle pill */}
            <button
              onClick={toggle}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                theme === 'dark' ? 'bg-primary' : 'bg-white/20'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  theme === 'dark' ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* ── Add exercise ── */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Add Exercise</p>

          <input
            type="text"
            placeholder="Exercise name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50"
          />

          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setNewCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                  newCategory === cat
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Adding…' : `Add "${newName.trim() || '…'}" · ${newCategory}`}
          </button>
        </div>

        {/* ── My custom exercises ── */}
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">My Exercises</p>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />)}
            </div>
          ) : exercises.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
              <p className="text-sm text-muted-foreground">No custom exercises yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add one above and it'll appear in all dropdowns</p>
            </div>
          ) : (
            <div className="space-y-2">
              {exercises.map(ex => {
                const isConfirming = confirmDel === ex.id;
                return (
                  <div
                    key={ex.id}
                    className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{ex.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{ex.category}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(ex.id)}
                      onBlur={() => setConfirmDel(null)}
                      className={`flex-shrink-0 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                        isConfirming
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'text-white/20 hover:text-red-400'
                      }`}
                    >
                      {isConfirming ? 'Confirm?' : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
