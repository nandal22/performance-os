import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Scale } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { bodyMetricsService } from '@/services/bodyMetrics';
import { toISODate } from '@/lib/utils';
import type { BodyMetric } from '@/types';

const MODERNIST = {
  ground: '#f3f2f2',
  ink: '#201e1d',
  accent: '#ec3013',
  panel: '#eae9e9',
  muted: 'rgba(32,30,29,0.55)',
};

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
    <div className="min-h-screen flex flex-col" style={{ background: MODERNIST.ground, color: MODERNIST.ink }}>
      <header
        className="sticky top-0 z-10 px-4 pt-safe pb-4"
        style={{ background: MODERNIST.ground, borderBottom: `2px solid ${MODERNIST.ink}66` }}
      >
        <h1 className="text-base font-800 leading-tight tracking-tight">Weight</h1>
        <p className="text-[11px] mt-0.5" style={{ color: MODERNIST.muted }}>Log regularly to track trend and power calorie estimates</p>
      </header>

      <main className="flex-1 px-4 py-5 space-y-4 max-w-lg mx-auto w-full pb-nav">
        <section className="p-4 space-y-3" style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.panel }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center flex-shrink-0" style={{ border: `2px solid ${MODERNIST.ink}` }}>
              <Scale className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-800 uppercase tracking-[0.1em]" style={{ color: MODERNIST.muted }}>Today</p>
              <p className="text-sm font-800">{format(new Date(), 'EEEE, MMM d')}</p>
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
              className="flex-1 px-3 py-3 text-lg font-800 nums focus:outline-none text-center"
              style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.ground, color: MODERNIST.ink, colorScheme: 'light' }}
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-3 text-sm font-800 disabled:opacity-50"
              style={{ border: `2px solid ${MODERNIST.ink}`, background: MODERNIST.ink, color: MODERNIST.ground }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {latest && (
            <p className="text-[11px]" style={{ color: MODERNIST.muted }}>
              Last logged {latest.weight} kg · {format(new Date(latest.date + 'T12:00:00'), 'MMM d')}
            </p>
          )}
        </section>

        {loading ? (
          <div className="h-40" style={{ border: `2px solid ${MODERNIST.ink}22` }} />
        ) : chartData.length > 1 ? (
          <section className="p-4" style={{ border: `2px solid ${MODERNIST.ink}` }}>
            <p className="text-[10px] font-800 uppercase tracking-[0.1em] mb-3" style={{ color: MODERNIST.muted }}>Trend</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke={MODERNIST.accent}
                  strokeWidth={2.5}
                  dot={{ fill: MODERNIST.accent, r: 3, strokeWidth: 0 }}
                />
                <XAxis dataKey="date" tick={{ fill: MODERNIST.muted, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip
                  cursor={{ stroke: 'rgba(32,30,29,0.15)' }}
                  contentStyle={{ background: MODERNIST.ground, border: `2px solid ${MODERNIST.ink}`, borderRadius: 0, fontSize: 12 }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => [`${Number(v ?? 0)} kg`, 'Weight'] as [string, string]}
                />
              </LineChart>
            </ResponsiveContainer>
          </section>
        ) : (
          <div className="p-10 text-center" style={{ border: `2px dashed ${MODERNIST.ink}55` }}>
            <p className="text-sm" style={{ color: MODERNIST.muted }}>Log weight a few times to see a trend.</p>
          </div>
        )}
      </main>
    </div>
  );
}
