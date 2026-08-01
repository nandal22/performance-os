import { format, isToday } from 'date-fns';
import type { Activity, WorkoutCategory } from '@/types';
import { activitiesByDate, weekDates } from '@/lib/week';

const TYPE_MARK: Record<WorkoutCategory, string> = {
  gym: 'GYM',
  cult_session: 'CULT',
  swimming: 'SWIM',
  run: 'RUN',
};

interface Props {
  activities: Activity[];
  selected: string | null;
  onSelect: (dateKey: string | null) => void;
}

export default function WeekStrip({ activities, selected, onSelect }: Props) {
  const days = weekDates();
  const byDate = activitiesByDate(activities);
  const count = days.reduce((sum, d) => sum + (byDate[format(d, 'yyyy-MM-dd')]?.length ?? 0), 0);

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-800 uppercase tracking-[0.1em] text-ink/55">This week</span>
        <span className="text-[11px] text-ink/55">{count} session{count !== 1 ? 's' : ''} this week</span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const dayActivities = byDate[key] ?? [];
          const hasSessions = dayActivities.length > 0;
          const isSelected = selected === key;
          const today = isToday(d);
          let mark = '';
          if (hasSessions) {
            mark = TYPE_MARK[dayActivities[0].type] ?? '';
            if (dayActivities.length > 1) mark += ` +${dayActivities.length - 1}`;
          }
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(isSelected ? null : key)}
              className="flex h-[74px] flex-col justify-between border-2 p-1.5 text-left"
              style={{
                borderColor: today ? '#ec3013' : '#201e1d',
                background: isSelected ? '#ec3013' : hasSessions ? '#201e1d' : 'transparent',
                color: isSelected || hasSessions ? '#f3f2f2' : '#201e1d',
              }}
            >
              <div>
                <div className="text-[13px] font-800 tracking-[0.06em]">{format(d, 'EEEEE').toUpperCase()}</div>
                <div className="text-[15px] font-600 opacity-85">{format(d, 'd')}</div>
              </div>
              <div className="truncate text-[11px] font-800">{mark}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
