import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, ClipboardCheck, Flame, Mic2, Save, Sparkles, TimerReset } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  speechDrillIcons,
  speechDrills,
  speechFramework,
  speechPracticeTests,
  speechPromptPool,
} from '@/data/speechPractice';
import { speechPracticeService } from '@/services/speechPractice';
import type { SpeechPracticeSession } from '@/types';
import { getWeekStart, toISODate } from '@/lib/utils';

const DEFAULT_MINUTES = 8;
const HISTORY_LIMIT = 7;

function dateFromISO(date: string) {
  return new Date(`${date}T12:00:00`);
}

function isComplete(session: SpeechPracticeSession) {
  return speechDrills.every(drill => session.completed_drills.includes(drill.id));
}

function getPromptIndex(date: string) {
  const dayNumber = Math.floor(dateFromISO(date).getTime() / 86400000);
  return dayNumber % speechPromptPool.length;
}

function getPracticeTestIndex(date: string) {
  const dayNumber = Math.floor(dateFromISO(date).getTime() / 86400000);
  return dayNumber % speechPracticeTests.length;
}

function getCurrentStreak(sessions: SpeechPracticeSession[], today: string) {
  const completeDates = new Set(sessions.filter(isComplete).map(session => session.date));
  const cursor = dateFromISO(today);
  let cursorKey = toISODate(cursor);

  if (!completeDates.has(cursorKey)) {
    cursor.setDate(cursor.getDate() - 1);
    cursorKey = toISODate(cursor);
  }

  let streak = 0;
  while (completeDates.has(cursorKey)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
    cursorKey = toISODate(cursor);
  }

  return streak;
}

function getWeekCompletions(sessions: SpeechPracticeSession[], today: string) {
  const weekStart = toISODate(getWeekStart(dateFromISO(today)));
  return sessions.filter(session =>
    isComplete(session) && session.date >= weekStart && session.date <= today
  ).length;
}

function RatingControl({ label, value, onChange }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</label>
        <span className="text-xs font-bold text-white nums">{value}/5</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map(score => (
          <motion.button
            key={score}
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={() => onChange(score)}
            className={`h-10 rounded-xl text-sm font-bold nums transition-colors ${
              score <= value
                ? 'bg-primary text-white'
                : 'bg-white/[0.05] text-muted-foreground border border-white/[0.08]'
            }`}
          >
            {score}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export default function SpeechPage() {
  const today = useMemo(() => toISODate(new Date()), []);
  const todayPrompt = speechPromptPool[getPromptIndex(today)];
  const todayTest = speechPracticeTests[getPracticeTestIndex(today)];
  const [selectedTestId, setSelectedTestId] = useState(todayTest.id);
  const [sessions, setSessions] = useState<SpeechPracticeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completedDrills, setCompletedDrills] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES));
  const [clarity, setClarity] = useState(3);
  const [pace, setPace] = useState(3);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const recent = await speechPracticeService.getRecent(45);
      const todaySession = recent.find(session => session.date === today);
      setSessions(recent);
      setCompletedDrills(todaySession?.completed_drills ?? []);
      setMinutes(String(todaySession?.minutes ?? DEFAULT_MINUTES));
      setClarity(todaySession?.clarity_rating ?? 3);
      setPace(todaySession?.pace_rating ?? 3);
      setNote(todaySession?.note ?? '');
    } catch {
      toast.error('Failed to load speech practice');
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => { void load(); }, [load]);

  const completeCount = completedDrills.filter(id => speechDrills.some(drill => drill.id === id)).length;
  const allDone = completeCount === speechDrills.length;
  const currentStreak = getCurrentStreak(sessions, today);
  const weekCount = getWeekCompletions(sessions, today);
  const recentSessions = sessions.slice(0, HISTORY_LIMIT);
  const selectedTest = speechPracticeTests.find(test => test.id === selectedTestId) ?? todayTest;

  const toggleDrill = (id: string) => {
    setCompletedDrills(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await speechPracticeService.upsert({
        date: today,
        completed_drills: completedDrills,
        minutes: Math.max(0, Math.round(Number.parseFloat(minutes) || DEFAULT_MINUTES)),
        clarity_rating: clarity,
        pace_rating: pace,
        note,
      });
      setSessions(prev =>
        [saved, ...prev.filter(session => session.date !== saved.date)]
          .sort((a, b) => b.date.localeCompare(a.date))
      );
      toast.success(allDone ? 'Speech practice complete' : 'Speech practice saved');
    } catch {
      toast.error('Failed to save speech practice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-2xl px-4 pt-safe pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-primary/12 border border-primary/20 flex items-center justify-center">
            <Mic2 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Speech</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">8-minute clarity habit</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 space-y-5 max-w-lg mx-auto w-full pb-nav">
        <section className="grid grid-cols-3 gap-2">
          {[
            { label: 'Streak', value: currentStreak, suffix: 'days', icon: Flame },
            { label: 'This week', value: weekCount, suffix: '/5', icon: Check },
            { label: 'Today', value: `${completeCount}/${speechDrills.length}`, suffix: 'done', icon: TimerReset },
          ].map(item => (
            <div key={item.label} className="glass rounded-2xl p-3">
              <item.icon className="w-4 h-4 text-primary mb-2" />
              <p className="text-lg font-bold text-white nums">{item.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{item.label} {item.suffix}</p>
            </div>
          ))}
        </section>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(item => (
              <div key={item} className="h-28 rounded-2xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <section>
              <div className="flex items-center justify-between mb-3 px-0.5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Today&apos;s Drills</p>
                <span className={`text-[10px] font-bold ${allDone ? 'text-emerald-300' : 'text-muted-foreground'}`}>
                  {allDone ? 'Complete' : `${DEFAULT_MINUTES} min`}
                </span>
              </div>

              <div className="space-y-2">
                {speechDrills.map((drill, index) => {
                  const Icon = speechDrillIcons[drill.id as keyof typeof speechDrillIcons];
                  const done = completedDrills.includes(drill.id);
                  return (
                    <motion.div
                      key={drill.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.04, type: 'spring', stiffness: 380, damping: 28 }}
                      className={`rounded-2xl p-4 border transition-colors ${
                        done
                          ? 'bg-primary/[0.08] border-primary/25'
                          : 'glass'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => toggleDrill(drill.id)}
                          className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${
                            done ? 'bg-primary text-white' : 'bg-white/[0.05] text-white/25 border border-white/[0.08]'
                          }`}
                          aria-label={done ? `Mark ${drill.title} incomplete` : `Mark ${drill.title} complete`}
                        >
                          {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white">{drill.title}</p>
                              <p className="text-[11px] text-primary mt-0.5">{drill.focus}</p>
                            </div>
                            <span className="text-[11px] text-muted-foreground nums flex-shrink-0">{drill.minutes} min</span>
                          </div>

                          <div className="mt-3 space-y-1.5">
                            {drill.steps.map(step => (
                              <p key={step} className="text-xs text-muted-foreground leading-relaxed">
                                {step}
                              </p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            <section className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardCheck className="w-4 h-4 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">Practice Test</p>
                  <p className="text-[11px] text-muted-foreground">Use the content below out loud</p>
                </div>
              </div>

              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 mb-4">
                {speechPracticeTests.map(test => (
                  <motion.button
                    key={test.id}
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setSelectedTestId(test.id)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      selectedTest.id === test.id
                        ? 'bg-primary text-white'
                        : 'bg-white/[0.05] text-muted-foreground border border-white/[0.08]'
                    }`}
                  >
                    {test.title}
                  </motion.button>
                ))}
              </div>

              <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-3.5 mb-3">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-white">{selectedTest.title}</p>
                    <p className="text-[11px] text-primary mt-0.5">
                      {selectedTest.category} - {selectedTest.minutes} min
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest flex-shrink-0">
                    Test
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{selectedTest.goal}</p>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">What to do</p>
                  <div className="space-y-1.5">
                    {selectedTest.whatToDo.map((step, index) => (
                      <div key={step} className="flex gap-2 text-xs leading-relaxed">
                        <span className="text-primary font-bold nums">{index + 1}</span>
                        <span className="text-muted-foreground">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                    {selectedTest.contentTitle}
                  </p>
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-3 space-y-2">
                    {selectedTest.content.map(item => (
                      <p key={item} className="text-sm text-white leading-relaxed">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Self-check</p>
                  <div className="grid gap-1.5">
                    {selectedTest.selfCheck.map(check => (
                      <div key={check} className="flex items-start gap-2 rounded-xl bg-white/[0.035] border border-white/[0.06] px-3 py-2">
                        <Check className="w-3.5 h-3.5 text-emerald-300 mt-0.5 flex-shrink-0" />
                        <span className="text-xs text-muted-foreground leading-relaxed">{check}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-sm font-bold text-white">{todayPrompt.title}</p>
                  <p className="text-[11px] text-muted-foreground">{todayPrompt.category} practice</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">{todayPrompt.setup}</p>
              <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-3">
                <p className="text-sm text-white leading-relaxed">{todayPrompt.starter}</p>
              </div>
              <div className="grid grid-cols-4 gap-1.5 mt-3">
                {speechFramework.map(item => (
                  <div key={item} className="rounded-xl bg-primary/[0.08] border border-primary/15 px-2 py-1.5 text-center">
                    <span className="text-[10px] font-semibold text-primary">{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="glass rounded-2xl p-4 space-y-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Daily Log</p>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-2">
                  Minutes
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="180"
                  value={minutes}
                  onChange={event => setMinutes(event.target.value)}
                  className="w-full glass rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50 nums"
                />
              </div>

              <RatingControl label="Clarity" value={clarity} onChange={setClarity} />
              <RatingControl label="Pace control" value={pace} onChange={setPace} />

              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-2">
                  Note
                </label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={event => setNote(event.target.value)}
                  placeholder="What got clearer today?"
                  className="w-full glass rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50 resize-none"
                />
              </div>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-2xl py-3 text-sm font-semibold disabled:opacity-40 transition-opacity"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : allDone ? 'Save Complete Practice' : 'Save Practice'}
              </motion.button>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3 px-0.5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Last 7 Sessions</p>
                <span className="text-[10px] text-muted-foreground">{recentSessions.length}</span>
              </div>

              {recentSessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
                  <Mic2 className="w-7 h-7 text-white/25 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No speech practice logged yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentSessions.map(session => {
                    const complete = isComplete(session);
                    return (
                      <div key={session.id} className="glass rounded-2xl px-3.5 py-3 flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                          complete ? 'bg-emerald-400/12 text-emerald-300' : 'bg-white/[0.05] text-muted-foreground'
                        }`}>
                          <Check className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">
                            {format(dateFromISO(session.date), 'EEE, MMM d')}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {session.completed_drills.length}/{speechDrills.length} drills - {session.minutes} min
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-bold text-white nums">
                            {session.clarity_rating ?? '--'}/5
                          </p>
                          <p className="text-[10px] text-muted-foreground">clarity</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
