import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Scale } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { bodyMetricsService } from '@/services/bodyMetrics';
import { toISODate } from '@/lib/utils';
import type { BodyMetric } from '@/types';

export default function WeightPage() {
  const [history, setHistory] = useState<BodyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [weightInput, setWeightInput] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const rows = await bodyMetricsService.getAll(90);
      setHistory(rows);
      const today = rows.find(r => r.date === toISODate(new Date()));
      if (today?.weight) setWeightInput(String(today.weight));
    } catch {
      toast.error('Failed to load weight history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const weight = parseFloat(weightInput);
    if (!weight || weight <= 0) return toast.error('Enter a valid weight');
    setSaving(true);
    try {
      await bodyMetricsService.upsert({ date: toISODate(new Date()), weight });
      toast.success('Weight logged');
      await load();
    } catch {
      toast.error('Failed to save weight');
    } finally {
      setSaving(false);
    }
  };

  const chartData = history
    .slice()
    .reverse()
    .filter(row => row.weight)
    .map(row => ({ date: format(new Date(row.date + 'T12:00:00'), 'M/d'), weight: row.weight as number }));

  const latest = history.find(row => row.weight);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-2xl px-4 pt-safe pb-4 border-b border-white/[0.06]">
        <h1 className="text-xl font-bold text-white tracking-tight">Weight</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">Log regularly to track trend and power calorie estimates</p>
      </header>

      <main className="flex-1 px-4 py-5 space-y-5 max-w-lg mx-auto w-full pb-nav">
        <section className="rounded-2xl glass p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Scale className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Today</p>
              <p className="text-sm font-semibold text-white">{format(new Date(), 'EEEE, MMM d')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="kg"
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-lg font-bold text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 text-center"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {latest && (
            <p className="text-[11px] text-muted-foreground">
              Last logged {latest.weight} kg · {format(new Date(latest.date + 'T12:00:00'), 'MMM d')}
            </p>
          )}
        </section>

        {loading ? (
          <div className="h-40 rounded-2xl bg-white/[0.04] animate-pulse" />
        ) : chartData.length > 1 ? (
          <section className="rounded-2xl glass p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Trend</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="hsl(217 91% 62%)"
                  strokeWidth={2.5}
                  dot={{ fill: 'hsl(217 91% 62%)', r: 3, strokeWidth: 0 }}
                />
                <XAxis dataKey="date" tick={{ fill: 'hsl(220 9% 45%)', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip
                  cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
                  contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => [`${Number(v ?? 0)} kg`, 'Weight'] as [string, string]}
                />
              </LineChart>
            </ResponsiveContainer>
          </section>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
            <p className="text-sm text-muted-foreground">Log weight a few times to see a trend.</p>
          </div>
        )}
      </main>
    </div>
  );
}
