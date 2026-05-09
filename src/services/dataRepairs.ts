import { supabase } from '@/db/supabase';
import type { Exercise } from '@/types';
import { exercisesService } from './exercises';

const OVERHEAD_REPAIR_VERSION = 'perf-os-repair-overhead-to-dumbbell-v1';
const TARGET_NAME = 'Dumbbell Overhead Press';
const SOURCE_NAMES = ['Overhead Press', 'DB Shoulder Press', 'Dumbbell Shoulder Press'];
let overheadRepairInFlight: Promise<void> | null = null;

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function ensureDumbbellOverheadPress(exercises: Exercise[]): Promise<Exercise> {
  const target = exercises.find(exercise => normalize(exercise.name) === normalize(TARGET_NAME));
  if (target) return target;

  return exercisesService.createCustom({
    name: TARGET_NAME,
    category: 'push',
    primary_muscle: 'Shoulders',
    secondary_muscles: ['Triceps'],
    equipment: 'dumbbell',
  });
}

async function runOverheadPressRepair() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const storageKey = `${OVERHEAD_REPAIR_VERSION}:${user.id}`;
  if (localStorage.getItem(storageKey) === 'done') return;

  const exercises = await exercisesService.getAll();
  const target = await ensureDumbbellOverheadPress(exercises);
  const targetId = target.id;
  const sourceIds = exercises
    .filter(exercise => SOURCE_NAMES.some(name => normalize(name) === normalize(exercise.name)))
    .map(exercise => exercise.id)
    .filter(id => id !== targetId);

  if (sourceIds.length > 0) {
    const { error } = await supabase
      .from('strength_sets')
      .update({ exercise_id: targetId })
      .in('exercise_id', sourceIds);
    if (error) throw error;
  }

  localStorage.setItem(storageKey, 'done');
}

export const dataRepairsService = {
  runOverheadPressRepair: async (): Promise<void> => {
    overheadRepairInFlight ??= runOverheadPressRepair().finally(() => {
      overheadRepairInFlight = null;
    });
    return overheadRepairInFlight;
  },
};
