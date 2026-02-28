import { useEffect, useState, useCallback } from 'react';
import { sleepLogsService } from '@/services/sleepLogs';
import type { SleepLog } from '@/types';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { toISODate } from '@/lib/utils';

const QUALITY = [
  { emoji: '😫', label: 'Terrible' },
  { emoji: '😴', label: 'Poor'     },
  { emoji: '😐', label: 'OK'       },
  { emoji: '😊', label: 'Good'     },
  { emoji: '⚡',  label: 'Great'   },
];

function calcDuration(bed: string, wake: string): number {
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let bedMins  = bh * 60 + bm;
  let wakeMins = wh * 60 + wm;
  if (wakeMins <= bedMins) wakeMins += 24 * 60; // past midnight
  return Math.round((wakeMins - bedMins) / 6) / 10; // 1 decimal hour
}

export default function SleepPage() {
  const [logs, setLogs]       = useState<SleepLog[]>([]);
  const [saving, setSaving]   = useState(false);

  const [date,     setDate]     = useState(toISODate(new Date()));
  const [bedtime,  setBedtime]  = useState('23:00');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [quality,  setQuality]  = useState<number | null>(null);
  const [notes,    setNotes]    = useState('');

  const load = useCallback(async () => {
    try {
      setLogs(await sleepLogsService.getAll(14));
    } catch {
      toast.error('Failed to load sleep data');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const duration = calcDuration(bedtime, wakeTime);

  const handleSave = async () => {
    setSaving(true);
    try {
      await sleepLogsService.upsert({
        date,
        bedtime,
        wake_time:    wakeTime,
        duration_hrs: duration,
        quality:      quality ?? undefined,
        notes:        notes || undefined,
      });
      toast.success('Sleep logged!');
      setNotes('');
      setQuality(null);
      load();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const durationColor =
    duration >= 7.5 ? 'text-green-400' :
    duration >= 6   ? 'text-yellow-400' :
                      'text-red-400';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg px-4 pt-safe pb-4 border-b border-white/5">
        <h1 className="text-lg font-bold text-white">Sleep</h1>
        <p className="text-xs text-muted-foreground">Track your recovery</p>
      </header>

      <main className="flex-1 px-4 py-6 space-y-6 max-w-lg mx-auto w-full pb-nav">

        {/* Log form */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Log Sleep</p>

          {/* Wake-up date */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Wake-up date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-primary/50"
            />
          </div>

          {/* Bedtime + Wake time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Bedtime</label>
              <input
                type="time"
                value={bedtime}
                onChange={e => setBedtime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Wake time</label>
              <input
                type="time"
                value={wakeTime}
                onChange={e => setWakeTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          {/* Duration display */}
          <div className="text-center py-1">
            <span className={`text-5xl font-bold tabular-nums ${durationColor}`}>{duration}</span>
            <span className="text-sm text-muted-foreground ml-2">hours</span>
            <p className="text-xs text-muted-foreground mt-1">
              {duration >= 7.5 ? 'Great sleep!' : duration >= 6 ? 'Could be better' : 'Too little — aim for 7–9h'}
            </p>
          </div>

          {/* Quality */}
          <div>
            <label className="text-xs text-muted-foreground block mb-2">How did you sleep?</label>
            <div className="flex gap-1">
              {QUALITY.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setQuality(quality === i + 1 ? null : i + 1)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-xl transition-all ${
                    quality === i + 1
                      ? 'bg-primary/20 border border-primary/40 scale-105'
                      : 'bg-white/5 border border-transparent opacity-60 hover:opacity-90'
                  }`}
                >
                  <span className="text-xl">{q.emoji}</span>
                  <span className="text-[9px] text-muted-foreground">{q.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <textarea
            placeholder="Notes — dreams, disturbances, etc."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 resize-none"
          />

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 bg-primary rounded-xl text-primary-foreground font-semibold text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Log Sleep'}
          </button>
        </div>

        {/* Recent history */}
        {logs.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Recent</p>
            <div className="space-y-2">
              {logs.map(log => {
                const hrs  = log.duration_hrs ?? 0;
                const color = hrs >= 7.5 ? 'text-green-400' : hrs >= 6 ? 'text-yellow-400' : 'text-red-400';
                return (
                  <div key={log.id} className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-3">
                    <span className="text-xl">{log.quality ? QUALITY[log.quality - 1].emoji : '😴'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{format(new Date(log.date), 'EEE, MMM d')}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.bedtime ?? '–'} → {log.wake_time ?? '–'}
                      </p>
                    </div>
                    <p className={`text-base font-bold ${color}`}>{hrs}h</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
