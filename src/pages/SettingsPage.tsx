import { useCallback, useEffect, useState } from 'react';
import { Database, HardDrive, Plus, RefreshCw, Trash2, Sun, Moon } from 'lucide-react';
import { toast } from 'sonner';
import type { Exercise, ExerciseCategory } from '@/types';
import { exercisesService } from '@/services/exercises';
import { trackerDataHealthService, type TrackerDataHealthSnapshot } from '@/services/trackerDataHealth';
import { useTheme } from '@/hooks/useTheme';

const CATEGORIES: ExerciseCategory[] = [
  'push', 'pull', 'legs', 'core', 'cardio', 'mobility', 'other',
];

const MODERNIST = {
  ground: '#f3f2f2',
  ink: '#201e1d',
  accent: '#ec3013',
  accentTint: '#ffe0d9',
  accentDeep: '#ae1800',
  panel: '#eae9e9',
  muted: 'rgba(32,30,29,0.55)',
  rule: 'rgba(32,30,29,0.15)',
};

function formatCount(value: number | null): string {
  return value === null ? 'Unavailable' : value.toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatPercent(value: number): string {
  if (value > 0 && value < 0.1) return '<0.1%';
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function usageBarWidth(percent: number, bytes: number): string {
  if (bytes <= 0) return '0%';
  return `${Math.min(100, Math.max(2, percent))}%`;
}

function formatUpdatedAt(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function SettingsPage() {
  const { theme, toggle } = useTheme();

  const [exercises, setExercises]     = useState<Exercise[]>([]);
  const [loading, setLoading]         = useState(true);
  const [newName, setNewName]         = useState('');
  const [newCategory, setNewCategory] = useState<ExerciseCategory>('push');
  const [creating, setCreating]       = useState(false);
  const [confirmDel, setConfirmDel]   = useState<string | null>(null);
  const [health, setHealth]           = useState<TrackerDataHealthSnapshot | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

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

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);

    try {
      setHealth(await trackerDataHealthService.getSnapshot());
    } catch {
      setHealthError('Failed to load tracker data health');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadHealth();
  }, [load, loadHealth]);

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
    <div className="min-h-screen flex flex-col" style={{ background: MODERNIST.ground, color: MODERNIST.ink }}>
      <header
        className="sticky top-0 z-10 px-4 pt-safe pb-4"
        style={{ background: MODERNIST.ground, borderBottom: `2px solid ${MODERNIST.ink}66` }}
      >
        <h1 className="text-base font-800 leading-tight tracking-tight">Settings</h1>
        <p className="text-[11px] mt-0.5" style={{ color: MODERNIST.muted }}>App preferences</p>
      </header>

      <main className="flex-1 px-4 py-5 space-y-4 max-w-lg mx-auto w-full pb-nav">

        {/* ── Appearance ── */}
        <div
          className="p-4"
          style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.panel }}
        >
          <p className="text-[10px] font-800 uppercase tracking-[0.1em] mb-4" style={{ color: MODERNIST.muted }}>Appearance</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 flex items-center justify-center flex-shrink-0" style={{ border: `2px solid ${MODERNIST.ink}` }}>
                {theme === 'dark'
                  ? <Moon className="w-4 h-4" />
                  : <Sun  className="w-4 h-4" />
                }
              </div>
              <div>
                <p className="text-sm font-800">
                  {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                </p>
                <p className="text-[11px]" style={{ color: MODERNIST.muted }}>Tap to switch theme</p>
              </div>
            </div>

            {/* Animated toggle */}
            <button
              onClick={toggle}
              className="min-h-11 min-w-11 inline-flex items-center justify-center"
              aria-label="Toggle theme"
            >
              <span
                className="relative block w-12 h-6"
                style={{
                  border: `2px solid ${MODERNIST.ink}`,
                  background: theme === 'dark' ? MODERNIST.ink : MODERNIST.ground,
                }}
              >
                <span
                  className="absolute top-0 w-5 h-5 transition-transform duration-200"
                  style={{
                    left: 0,
                    background: theme === 'dark' ? MODERNIST.accent : MODERNIST.ink,
                    transform: `translateX(${theme === 'dark' ? 22 : 0}px)`,
                  }}
                />
              </span>
            </button>
          </div>
        </div>

        {/* ── Supabase health ── */}
        <div
          className="p-4 space-y-4"
          style={{ border: `2px solid ${MODERNIST.ink}` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 flex items-center justify-center flex-shrink-0" style={{ border: `2px solid ${MODERNIST.ink}` }}>
                <Database className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: MODERNIST.muted }}>Supabase Health</p>
                <h2 className="text-sm font-800 mt-1">Tracker data runway</h2>
                <p className="text-[11px] leading-relaxed" style={{ color: MODERNIST.muted }}>
                  Visible rows and approximate Free plan usage.
                </p>
              </div>
            </div>

            <button
              onClick={loadHealth}
              disabled={healthLoading}
              aria-label="Refresh tracker data health"
              className="w-9 h-9 disabled:opacity-40 flex items-center justify-center flex-shrink-0"
              style={{ border: `2px solid ${MODERNIST.ink}` }}
            >
              <RefreshCw className={`w-4 h-4 ${healthLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {healthError && (
            <div role="status" className="px-3 py-2" style={{ border: `2px solid ${MODERNIST.accent}`, background: MODERNIST.accentTint }}>
              <p className="text-xs font-800" style={{ color: MODERNIST.accentDeep }}>{healthError}</p>
            </div>
          )}

          {healthLoading && !health ? (
            <div className="space-y-2" aria-label="Loading tracker data health">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-11" style={{ border: `2px solid ${MODERNIST.ink}22` }} />
              ))}
            </div>
          ) : health && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="px-3 py-2.5" style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.panel }}>
                  <p className="text-[10px] font-800 uppercase tracking-[0.08em]" style={{ color: MODERNIST.muted }}>Visible Rows</p>
                  <p className="text-lg font-800 nums mt-1">{health.totalRows.toLocaleString()}</p>
                </div>
                <div className="px-3 py-2.5" style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.panel }}>
                  <p className="text-[10px] font-800 uppercase tracking-[0.08em]" style={{ color: MODERNIST.muted }}>Est. DB Use</p>
                  <p className="text-lg font-800 nums mt-1">{formatBytes(health.runway.estimatedDbBytes)}</p>
                </div>
              </div>

              <div className="space-y-3" aria-label="Supabase Free plan runway estimates">
                <div>
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <p className="text-xs font-800">Database</p>
                    <p className="text-xs nums" style={{ color: MODERNIST.muted }}>
                      {formatPercent(health.runway.estimatedDbPercent)} of {formatBytes(health.runway.dbLimitBytes)}
                    </p>
                  </div>
                  <div className="h-3 overflow-hidden" style={{ border: `2px solid ${MODERNIST.ink}` }} aria-hidden="true">
                    <div
                      className="h-full"
                      style={{
                        width: usageBarWidth(health.runway.estimatedDbPercent, health.runway.estimatedDbBytes),
                        background: MODERNIST.ink,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <p className="text-xs font-800 flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5" />
                      File storage
                    </p>
                    <p className="text-xs nums" style={{ color: MODERNIST.muted }}>
                      {formatPercent(health.runway.estimatedStoragePercent)} of {formatBytes(health.runway.storageLimitBytes)}
                    </p>
                  </div>
                  <div className="h-3 overflow-hidden" style={{ border: `2px solid ${MODERNIST.ink}` }} aria-hidden="true">
                    <div
                      className="h-full"
                      style={{
                        width: usageBarWidth(health.runway.estimatedStoragePercent, health.runway.estimatedStorageBytes),
                        background: MODERNIST.accent,
                      }}
                    />
                  </div>
                </div>
              </div>

              <ul aria-label="Tracker table row counts">
                {health.tables.map(table => (
                  <li key={table.name} className="py-2.5" style={{ borderTop: `2px solid ${MODERNIST.rule}` }}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-800 truncate">{table.label}</span>
                      <span
                        className="text-xs nums font-800"
                        style={{ color: table.error ? MODERNIST.accentDeep : MODERNIST.muted }}
                        aria-label={`${table.label} row count: ${formatCount(table.rowCount)}`}
                      >
                        {formatCount(table.rowCount)}
                      </span>
                    </div>
                    {table.error && (
                      <p className="text-[11px] mt-1 leading-relaxed" style={{ color: MODERNIST.accentDeep }}>{table.error}</p>
                    )}
                  </li>
                ))}
              </ul>

              <div className="px-3 py-2.5" style={{ border: `2px solid ${MODERNIST.rule}` }}>
                <p className="text-[11px] leading-relaxed" style={{ color: MODERNIST.muted }}>
                  {health.runway.note}
                </p>
                <p className="text-[10px] mt-1" style={{ color: MODERNIST.muted }}>
                  Updated {formatUpdatedAt(health.generatedAt)}
                  {health.failedTables > 0 ? ` · ${health.failedTables} table${health.failedTables === 1 ? '' : 's'} unavailable` : ''}
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Add exercise ── */}
        <div
          className="p-4 space-y-3"
          style={{ border: `2px solid ${MODERNIST.ink}` }}
        >
          <p className="text-[10px] font-800 uppercase tracking-[0.1em]">Add Exercise</p>

          <input
            type="text"
            placeholder="Exercise name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            className="w-full px-3 py-2.5 text-sm focus:outline-none"
            style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.ground, color: MODERNIST.ink, colorScheme: 'light' }}
          />

          {/* Category chips */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setNewCategory(cat)}
                className="min-h-11 px-2.5 text-xs font-800 uppercase tracking-[0.06em] relative"
                style={{ border: `2px solid ${MODERNIST.ink}` }}
              >
                {newCategory === cat && (
                  <div
                    className="absolute inset-0"
                    style={{ background: MODERNIST.ink }}
                  />
                )}
                <span className="relative z-10" style={{ color: newCategory === cat ? MODERNIST.ground : MODERNIST.ink }}>
                  {cat}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="w-full min-h-11 flex items-center justify-center gap-2 py-2.5 text-sm font-800 disabled:opacity-35 transition-opacity"
            style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.accent, color: MODERNIST.ground }}
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Adding…' : newName.trim() ? `Add "${newName.trim()}" · ${newCategory}` : 'Add exercise'}
          </button>
        </div>

        {/* ── My custom exercises ── */}
        <div>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <p className="text-[10px] font-800 uppercase tracking-[0.1em]">My Exercises</p>
            {exercises.length > 0 && (
              <span className="text-[10px]" style={{ color: MODERNIST.muted }}>{exercises.length}</span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-14" style={{ border: `2px solid ${MODERNIST.ink}22` }} />
              ))}
            </div>
          ) : exercises.length === 0 ? (
            <div className="p-10 text-center" style={{ border: `2px dashed ${MODERNIST.ink}55` }}>
              <p className="text-2xl mb-2">🏋️</p>
              <p className="text-sm" style={{ color: MODERNIST.muted }}>No custom exercises yet</p>
              <p className="text-[11px] mt-1 leading-relaxed" style={{ color: MODERNIST.muted }}>
                Add one above and it'll appear<br />in all exercise dropdowns
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              
                {exercises.map((ex) => {
                  const isConfirming = confirmDel === ex.id;
                  return (
                    <div
                      key={ex.id}
                      className="px-3.5 py-3 flex items-center gap-3"
                      style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.panel }}
                    >
                      {/* Category mark */}
                      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center" style={{ border: `2px solid ${MODERNIST.ink}` }}>
                        <span className="text-[10px] font-800 uppercase">
                          {ex.category.slice(0, 2)}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-800 truncate">{ex.name}</p>
                        <p className="text-[11px] capitalize" style={{ color: MODERNIST.muted }}>
                          {ex.category}
                        </p>
                      </div>

                      <button
                        onClick={() => handleDelete(ex.id)}
                        onBlur={() => setConfirmDel(null)}
                        className="min-h-11 min-w-11 flex-shrink-0 px-2.5 text-xs font-800 inline-flex items-center justify-center"
                        style={
                          isConfirming
                            ? { border: `2px solid ${MODERNIST.accent}`, background: MODERNIST.accent, color: MODERNIST.ground }
                            : { border: `2px solid ${MODERNIST.ink}`, color: MODERNIST.ink }
                        }
                      >
                        {isConfirming ? 'Delete?' : <Trash2 className="w-3.5 h-3.5" />}
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
