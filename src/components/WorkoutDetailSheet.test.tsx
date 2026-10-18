import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkoutDetailSheet from './WorkoutDetailSheet';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/services/activities', () => ({
  activitiesService: {
    getById: vi.fn(async () => ({
      id: 'activity-1',
      user_id: 'user-1',
      date: '2026-10-01',
      type: 'other',
      duration: 30,
      notes: 'First line\nSecond line',
      tags: [],
      structured_metrics: {},
      created_at: '',
      updated_at: '',
      strength_sets: [],
      cardio_entries: [{
        id: 'entry-1',
        activity_id: 'activity-1',
        position: 1,
        duration_minutes: 12,
        calories: 90,
        label: 'Stair climber',
        created_at: '',
      }],
    })),
    delete: vi.fn(),
  },
}));

describe('WorkoutDetailSheet others and cardio', () => {
  it('titles an others session and keeps note line breaks', async () => {
    render(<WorkoutDetailSheet activityId="activity-1" onClose={() => undefined} onDeleted={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Others' })).toBeTruthy();
    const notes = screen.getByText(/First line/);
    expect(notes.className).toContain('whitespace-pre-wrap');
    expect(notes.textContent).toContain('Second line');
    expect(screen.getByText('Stair climber')).toBeTruthy();
    expect(screen.queryByText('kg total vol.')).toBeNull();
  });
});
