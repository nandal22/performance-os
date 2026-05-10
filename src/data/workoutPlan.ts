import type { Equipment, ExerciseCategory } from '@/types';

export type PlanPhase = 'warmup' | 'workout' | 'stretch' | 'recovery';

export interface PlanMedia {
  kind: 'image' | 'gif' | 'video';
  url: string;
  frames: string[];
  source: string;
  sourceUrl: string;
}

export interface PlanItem {
  id: string;
  name: string;
  target: string;
  cue: string;
  media?: PlanMedia;
}

export interface PlanExercise extends PlanItem {
  sets: number;
  repRange: string;
  logUnit?: 'reps' | 'seconds';
  dbName: string;
  aliases: string[];
  category: ExerciseCategory;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: Equipment;
}

export interface WorkoutPlanDay {
  day: number;
  shortLabel: string;
  title: string;
  focus: string;
  duration: string;
  accent: string;
  warmup: PlanItem[];
  workout: PlanExercise[];
  stretch: PlanItem[];
  recovery?: PlanItem[];
}

const EX_DB_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
const EX_DB_SOURCE = 'https://github.com/yuhonas/free-exercise-db';

function exDbImage(id: string, image = '0.jpg'): PlanMedia {
  const base = `${EX_DB_BASE}/${id}`;
  return {
    kind: 'image',
    url: `${base}/${image}`,
    frames: [`${base}/0.jpg`, `${base}/1.jpg`],
    source: 'Free Exercise DB',
    sourceUrl: `${EX_DB_SOURCE}/tree/main/exercises/${id}`,
  };
}

export function getWorkoutMediaUrls() {
  const urls = new Set<string>();
  const addMedia = (media?: PlanMedia) => {
    if (!media) return;
    urls.add(media.url);
    media.frames.forEach(frame => urls.add(frame));
  };

  for (const day of workoutPlan) {
    day.warmup.forEach(item => addMedia(item.media));
    day.workout.forEach(item => addMedia(item.media));
    day.stretch.forEach(item => addMedia(item.media));
    day.recovery?.forEach(item => addMedia(item.media));
  }

  return Array.from(urls);
}

const MEDIA = {
  armCircles: exDbImage('Arm_Circles'),
  bandPullApart: exDbImage('Band_Pull_Apart'),
  scapularPushups: exDbImage('Pushups'),
  shoulderDislocations: exDbImage('Round_The_World_Shoulder_Stretch'),
  benchRamp: exDbImage('Barbell_Bench_Press_-_Medium_Grip'),
  legSwings: exDbImage('Single_Leg_Butt_Kick'),
  hipCircles: exDbImage('Standing_Hip_Circles'),
  bodyweightSquat: exDbImage('Bodyweight_Squat'),
  gluteBridge: exDbImage('Single_Leg_Glute_Bridge'),
  walkingLunge: exDbImage('Bodyweight_Walking_Lunge'),
  hipOpeners: exDbImage('Groiners'),
  lateralRaise: exDbImage('Side_Lateral_Raise'),
  pushups: exDbImage('Pushups'),
  lightCurls: exDbImage('Barbell_Curl'),
  lightPushdowns: exDbImage('Triceps_Pushdown'),
  chestStretch: exDbImage('Chest_And_Front_Of_Shoulder_Stretch'),
  latStretch: exDbImage('One_Handed_Hang'),
  tricepsStretch: exDbImage('Triceps_Stretch'),
  shoulderStretch: exDbImage('Shoulder_Stretch'),
  hamstringStretch: exDbImage('Standing_Hamstring_and_Calf_Stretch'),
  quadStretch: exDbImage('All_Fours_Quad_Stretch'),
  hipFlexorStretch: exDbImage('Standing_Hip_Flexors'),
  calfStretch: exDbImage('Standing_Gastrocnemius_Calf_Stretch'),
  gluteStretch: exDbImage('Ankle_On_The_Knee'),
  bicepsStretch: exDbImage('Standing_Biceps_Stretch'),
  neckStretch: exDbImage('Side_Neck_Stretch'),
};

const UNIVERSAL_WARMUP: PlanItem[] = [
  {
    id: 'arm-circles',
    name: 'Arm circles',
    target: '15 reps',
    cue: 'Move from the shoulders and keep ribs stacked.',
    media: MEDIA.armCircles,
  },
  {
    id: 'leg-swings',
    name: 'Leg swings',
    target: '15 each leg',
    cue: 'Hold a rack, keep the torso tall, and swing with control.',
    media: MEDIA.legSwings,
  },
  {
    id: 'hip-circles',
    name: 'Hip circles',
    target: '10 each direction',
    cue: 'Make slow circles and keep the standing foot rooted.',
    media: MEDIA.hipCircles,
  },
  {
    id: 'band-pull-aparts',
    name: 'Band pull-aparts',
    target: '2 x 15',
    cue: 'Pull to upper chest height and keep traps relaxed.',
    media: MEDIA.bandPullApart,
  },
  {
    id: 'bodyweight-squats',
    name: 'Bodyweight squats',
    target: '10 reps',
    cue: 'Smooth depth, knees tracking cleanly, no fatigue chasing.',
    media: MEDIA.bodyweightSquat,
  },
  {
    id: 'first-lift-warmup',
    name: 'First lift warm-up sets',
    target: '2-3 ramp sets',
    cue: 'Start light, add load gradually, and stop before fatigue.',
  },
];

const UPPER_STRETCHES: PlanItem[] = [
  { id: 'chest-stretch', name: 'Chest stretch', target: '30 sec each side', cue: 'Place forearm on a wall and rotate away gently.', media: MEDIA.chestStretch },
  { id: 'lat-stretch', name: 'Lat stretch', target: '30 sec', cue: 'Hinge back with one hand anchored and breathe into the side ribs.', media: MEDIA.latStretch },
  { id: 'triceps-stretch', name: 'Triceps stretch', target: '30 sec', cue: 'Keep ribs stacked and avoid cranking the elbow.', media: MEDIA.tricepsStretch },
  { id: 'rear-delt-stretch', name: 'Rear delt stretch', target: '30 sec', cue: 'Pull the arm across the body without shrugging.', media: MEDIA.shoulderStretch },
];

const LOWER_STRETCHES: PlanItem[] = [
  { id: 'hamstring-stretch', name: 'Hamstrings', target: '30 sec each leg', cue: 'Soft knee, hinge from hips, stop before the lower back rounds.', media: MEDIA.hamstringStretch },
  { id: 'quad-stretch', name: 'Quads', target: '30 sec each leg', cue: 'Knees close together, glute lightly squeezed.', media: MEDIA.quadStretch },
  { id: 'hip-flexor-stretch', name: 'Hip flexors', target: '30 sec', cue: 'Posterior tilt first, then shift forward just enough to feel the front hip.', media: MEDIA.hipFlexorStretch },
  { id: 'calf-stretch', name: 'Calves', target: '30 sec', cue: 'Heel down, knee straight first, then slightly bent for the soleus.', media: MEDIA.calfStretch },
];

function strengthExercise(input: PlanExercise): PlanExercise {
  return input;
}

export const workoutPlan: WorkoutPlanDay[] = [
  {
    day: 1,
    shortLabel: 'Upper S',
    title: 'Upper Strength',
    focus: 'Heavy presses, pulls, and upper-back support work.',
    duration: '55-70 min',
    accent: 'from-sky-500/20 to-cyan-400/10',
    warmup: UNIVERSAL_WARMUP,
    workout: [
      strengthExercise({
        id: 'bench-press',
        name: 'Bench Press',
        dbName: 'Bench Press',
        aliases: ['Bench Press', 'Barbell Bench Press - Medium Grip'],
        target: '4 x 4-6',
        sets: 4,
        repRange: '4-6',
        cue: 'Shoulder blades tucked, feet planted, bar touches mid-chest.',
        category: 'push',
        primaryMuscle: 'Chest',
        secondaryMuscles: ['Triceps', 'Front Delt'],
        equipment: 'barbell',
        media: exDbImage('Barbell_Bench_Press_-_Medium_Grip'),
      }),
      strengthExercise({
        id: 'pullups-lat-pulldown',
        name: 'Pull-ups / Lat Pulldown',
        dbName: 'Pull-up',
        aliases: ['Pull-up', 'Pull-ups', 'Lat Pulldown', 'Wide-Grip Lat Pulldown'],
        target: '4 x 5-7',
        sets: 4,
        repRange: '5-7',
        cue: 'Lead with elbows and stop each rep before shoulders roll forward.',
        category: 'pull',
        primaryMuscle: 'Back',
        secondaryMuscles: ['Biceps'],
        equipment: 'bodyweight',
        media: exDbImage('Pullups'),
      }),
      strengthExercise({
        id: 'overhead-press',
        name: 'Overhead Press',
        dbName: 'Overhead Press',
        aliases: ['Overhead Press', 'Barbell Shoulder Press', 'Standing Military Press'],
        target: '3 x 5',
        sets: 3,
        repRange: '5',
        cue: 'Brace hard, press close to the face, and keep 1-2 reps in reserve.',
        category: 'push',
        primaryMuscle: 'Shoulders',
        secondaryMuscles: ['Triceps'],
        equipment: 'barbell',
        media: exDbImage('Standing_Military_Press'),
      }),
      strengthExercise({
        id: 'barbell-row',
        name: 'Barbell Row',
        dbName: 'Barbell Row',
        aliases: ['Barbell Row', 'Bent Over Barbell Row'],
        target: '4 x 5-6',
        sets: 4,
        repRange: '5-6',
        cue: 'Extra set for push-pull balance. Hinge, keep the bar close, and pull toward lower ribs.',
        category: 'pull',
        primaryMuscle: 'Back',
        secondaryMuscles: ['Biceps', 'Rear Delt'],
        equipment: 'barbell',
        media: exDbImage('Bent_Over_Barbell_Row'),
      }),
      strengthExercise({
        id: 'face-pulls',
        name: 'Face Pulls',
        dbName: 'Face Pull',
        aliases: ['Face Pull', 'Face Pulls'],
        target: '2 x 12-15',
        sets: 2,
        repRange: '12-15',
        cue: 'Pull rope toward eye level and rotate thumbs behind you.',
        category: 'pull',
        primaryMuscle: 'Rear Delt',
        secondaryMuscles: ['Rotator Cuff'],
        equipment: 'cable',
        media: exDbImage('Face_Pull'),
      }),
    ],
    stretch: UPPER_STRETCHES,
  },
  {
    day: 2,
    shortLabel: 'Lower S',
    title: 'Lower (Squat Focus)',
    focus: 'Heavy squat work with controlled hinge volume, calves, and core.',
    duration: '55-70 min',
    accent: 'from-emerald-500/20 to-lime-400/10',
    warmup: UNIVERSAL_WARMUP,
    workout: [
      strengthExercise({
        id: 'squat',
        name: 'Squat',
        dbName: 'Squat',
        aliases: ['Squat', 'Barbell Full Squat'],
        target: '4 x 4-6',
        sets: 4,
        repRange: '4-6',
        cue: 'Brace before descent, stay tight at the bottom, drive through mid-foot.',
        category: 'legs',
        primaryMuscle: 'Quads',
        secondaryMuscles: ['Glutes', 'Hamstrings'],
        equipment: 'barbell',
        media: exDbImage('Barbell_Full_Squat'),
      }),
      strengthExercise({
        id: 'romanian-deadlift',
        name: 'Romanian Deadlift',
        dbName: 'Romanian Deadlift',
        aliases: ['Romanian Deadlift'],
        target: '3 x 5-6',
        sets: 3,
        repRange: '5-6',
        cue: 'Push hips back, keep lats tight, stop when hamstrings limit the range.',
        category: 'legs',
        primaryMuscle: 'Hamstrings',
        secondaryMuscles: ['Glutes', 'Back'],
        equipment: 'barbell',
        media: exDbImage('Romanian_Deadlift'),
      }),
      strengthExercise({
        id: 'leg-press',
        name: 'Leg Press',
        dbName: 'Leg Press',
        aliases: ['Leg Press'],
        target: '2 x 8',
        sets: 2,
        repRange: '8',
        cue: 'Control the depth and avoid hips curling off the pad.',
        category: 'legs',
        primaryMuscle: 'Quads',
        secondaryMuscles: ['Glutes'],
        equipment: 'machine',
        media: exDbImage('Leg_Press'),
      }),
      strengthExercise({
        id: 'standing-calf-raises',
        name: 'Standing Calf Raises',
        dbName: 'Calf Raise',
        aliases: ['Calf Raise', 'Standing Calf Raises'],
        target: '3 x 10-12',
        sets: 3,
        repRange: '10-12',
        cue: 'Pause at the top and get a full stretch at the bottom.',
        category: 'legs',
        primaryMuscle: 'Calves',
        secondaryMuscles: [],
        equipment: 'machine',
        media: exDbImage('Standing_Calf_Raises'),
      }),
      strengthExercise({
        id: 'plank',
        name: 'Plank',
        dbName: 'Plank',
        aliases: ['Plank'],
        target: '3 sets',
        sets: 3,
        repRange: '30-60 sec',
        logUnit: 'seconds',
        cue: 'Ribs down, glutes lightly squeezed, breathe behind the brace.',
        category: 'core',
        primaryMuscle: 'Abs',
        secondaryMuscles: ['Lower Back'],
        equipment: 'bodyweight',
        media: exDbImage('Plank'),
      }),
    ],
    stretch: LOWER_STRETCHES,
  },
  {
    day: 3,
    shortLabel: 'Rest',
    title: 'Rest',
    focus: 'Full rest, easy steps if desired, and recovery quality.',
    duration: 'All day',
    accent: 'from-teal-500/15 to-slate-400/10',
    warmup: [],
    workout: [],
    stretch: [],
    recovery: [
      { id: 'steps-8-10k', name: 'Steps', target: '8-10k', cue: 'Keep this easy. The goal is blood flow, not fatigue.' },
      { id: 'light-mobility', name: 'Light mobility', target: '10 min', cue: 'Move through hips, t-spine, shoulders, and ankles without strain.' },
      { id: 'sleep-check', name: 'Sleep target', target: '7-8 hrs', cue: 'Protect tonight. Recovery keeps strength from dropping during the cut.' },
    ],
  },
  {
    day: 4,
    shortLabel: 'Upper LF',
    title: 'Upper (Low Fatigue)',
    focus: 'Moderate upper work that keeps fatigue low while maintaining volume.',
    duration: '45-60 min',
    accent: 'from-indigo-500/20 to-sky-400/10',
    warmup: UNIVERSAL_WARMUP,
    workout: [
      strengthExercise({
        id: 'incline-bench-press',
        name: 'Incline Bench Press',
        dbName: 'Incline Bench Press',
        aliases: ['Incline Bench Press', 'Barbell Incline Bench Press - Medium Grip'],
        target: '3 x 6-8',
        sets: 3,
        repRange: '6-8',
        cue: 'Touch upper chest, keep wrists stacked, press slightly back.',
        category: 'push',
        primaryMuscle: 'Chest',
        secondaryMuscles: ['Triceps', 'Front Delt'],
        equipment: 'barbell',
        media: exDbImage('Barbell_Incline_Bench_Press_-_Medium_Grip'),
      }),
      strengthExercise({
        id: 'seated-cable-row',
        name: 'Seated Cable Row',
        dbName: 'Seated Cable Row',
        aliases: ['Seated Cable Row', 'Seated Cable Rows'],
        target: '3 x 8-10',
        sets: 3,
        repRange: '8-10',
        cue: 'Pull elbows back, pause, and let shoulder blades glide forward under control.',
        category: 'pull',
        primaryMuscle: 'Back',
        secondaryMuscles: ['Biceps', 'Rear Delt'],
        equipment: 'cable',
        media: exDbImage('Seated_Cable_Rows'),
      }),
      strengthExercise({
        id: 'db-shoulder-press',
        name: 'DB Shoulder Press',
        dbName: 'DB Shoulder Press',
        aliases: ['DB Shoulder Press', 'Dumbbell Shoulder Press'],
        target: '2 x 8-10',
        sets: 2,
        repRange: '8-10',
        cue: 'Low-fatigue shoulder work. Keep forearms vertical and stop 1-2 reps short.',
        category: 'push',
        primaryMuscle: 'Shoulders',
        secondaryMuscles: ['Triceps'],
        equipment: 'dumbbell',
        media: exDbImage('Dumbbell_Shoulder_Press'),
      }),
      strengthExercise({
        id: 'lateral-raises',
        name: 'Lateral Raises',
        dbName: 'Lateral Raise',
        aliases: ['Lateral Raise', 'Lateral Raises', 'Side Lateral Raise'],
        target: '3 x 12-15',
        sets: 3,
        repRange: '12-15',
        cue: 'Lift to shoulder height, lead with elbows, keep traps quiet.',
        category: 'push',
        primaryMuscle: 'Shoulders',
        secondaryMuscles: [],
        equipment: 'dumbbell',
        media: exDbImage('Side_Lateral_Raise'),
      }),
      strengthExercise({
        id: 'triceps-pushdown',
        name: 'Triceps Pushdown',
        dbName: 'Tricep Pushdown',
        aliases: ['Tricep Pushdown', 'Triceps Pushdown'],
        target: '2 x 10-12',
        sets: 2,
        repRange: '10-12',
        cue: 'Pin elbows, extend fully, and control the return.',
        category: 'push',
        primaryMuscle: 'Triceps',
        secondaryMuscles: [],
        equipment: 'cable',
        media: exDbImage('Triceps_Pushdown'),
      }),
      strengthExercise({
        id: 'biceps-curl',
        name: 'Biceps Curl',
        dbName: 'Barbell Curl',
        aliases: ['Biceps Curl', 'Barbell Curl', 'Dumbbell Biceps Curl'],
        target: '2 x 10-12',
        sets: 2,
        repRange: '10-12',
        cue: 'Keep shoulders still and squeeze hard without swinging.',
        category: 'pull',
        primaryMuscle: 'Biceps',
        secondaryMuscles: ['Forearms'],
        equipment: 'barbell',
        media: exDbImage('Barbell_Curl'),
      }),
    ],
    stretch: [
      { id: 'chest-stretch-volume', name: 'Chest', target: '30 sec', cue: 'Gentle wall stretch, breathe slowly.', media: MEDIA.chestStretch },
      { id: 'shoulders-stretch-volume', name: 'Shoulders', target: '30 sec', cue: 'Cross-body stretch without shrugging.', media: MEDIA.shoulderStretch },
      { id: 'biceps-stretch-volume', name: 'Biceps', target: '30 sec', cue: 'Palm on wall, rotate away until light tension appears.', media: MEDIA.bicepsStretch },
      { id: 'upper-traps-stretch', name: 'Upper traps', target: '30 sec', cue: 'Drop one ear toward shoulder, keep the opposite shoulder down.', media: MEDIA.neckStretch },
    ],
  },
  {
    day: 5,
    shortLabel: 'Deadlift',
    title: 'Lower (Deadlift Focus)',
    focus: 'Fresh deadlifts first, then lower-body support work and core.',
    duration: '55-70 min',
    accent: 'from-amber-500/15 to-rose-400/10',
    warmup: UNIVERSAL_WARMUP,
    workout: [
      strengthExercise({
        id: 'deadlift',
        name: 'Deadlift',
        dbName: 'Deadlift',
        aliases: ['Deadlift', 'Barbell Deadlift'],
        target: '3 x 3-5',
        sets: 3,
        repRange: '3-5',
        cue: 'Fresh first lift. Keep 1-2 reps in reserve; if tired, do 2 sets instead of 3.',
        category: 'pull',
        primaryMuscle: 'Back',
        secondaryMuscles: ['Hamstrings', 'Glutes'],
        equipment: 'barbell',
        media: exDbImage('Barbell_Deadlift'),
      }),
      strengthExercise({
        id: 'front-hack-squat',
        name: 'Front Squat / Hack Squat',
        dbName: 'Front Squat',
        aliases: ['Front Squat', 'Barbell Front Squat', 'Hack Squat'],
        target: '3 x 6-8',
        sets: 3,
        repRange: '6-8',
        cue: 'Stay tall and let knees travel forward while heels stay planted.',
        category: 'legs',
        primaryMuscle: 'Quads',
        secondaryMuscles: ['Glutes'],
        equipment: 'barbell',
        media: exDbImage('Front_Squat_Clean_Grip'),
      }),
      strengthExercise({
        id: 'hip-thrust',
        name: 'Hip Thrust',
        dbName: 'Hip Thrust',
        aliases: ['Hip Thrust', 'Barbell Hip Thrust'],
        target: '3 x 8-10',
        sets: 3,
        repRange: '8-10',
        cue: 'Tuck ribs, pause at lockout, and keep shins near vertical.',
        category: 'legs',
        primaryMuscle: 'Glutes',
        secondaryMuscles: ['Hamstrings'],
        equipment: 'barbell',
        media: exDbImage('Barbell_Hip_Thrust'),
      }),
      strengthExercise({
        id: 'leg-curl',
        name: 'Leg Curl',
        dbName: 'Leg Curl',
        aliases: ['Leg Curl', 'Lying Leg Curls', 'Hamstring Curl'],
        target: '3 x 10-12',
        sets: 3,
        repRange: '10-12',
        cue: 'Keep the rep smooth and own the squeeze.',
        category: 'legs',
        primaryMuscle: 'Hamstrings',
        secondaryMuscles: [],
        equipment: 'machine',
        media: exDbImage('Lying_Leg_Curls'),
      }),
      strengthExercise({
        id: 'calf-raises-volume',
        name: 'Calf Raises',
        dbName: 'Calf Raise',
        aliases: ['Calf Raise', 'Standing Calf Raises'],
        target: '3 x 12-15',
        sets: 3,
        repRange: '12-15',
        cue: 'Full stretch, full squeeze, no bouncing.',
        category: 'legs',
        primaryMuscle: 'Calves',
        secondaryMuscles: [],
        equipment: 'machine',
        media: exDbImage('Standing_Calf_Raises'),
      }),
      strengthExercise({
        id: 'hanging-leg-raises-crunches',
        name: 'Hanging Leg Raises / Crunches',
        dbName: 'Hanging Leg Raise',
        aliases: ['Hanging Leg Raise', 'Hanging Leg Raises', 'Crunch', 'Crunches'],
        target: '2-3 sets',
        sets: 3,
        repRange: '10-15',
        cue: 'Pick the version you can control. Curl pelvis up and avoid swinging.',
        category: 'core',
        primaryMuscle: 'Abs',
        secondaryMuscles: ['Hip Flexors'],
        equipment: 'bodyweight',
        media: exDbImage('Hanging_Leg_Raise'),
      }),
    ],
    stretch: [
      { id: 'hamstrings-stretch-volume', name: 'Hamstrings', target: '30 sec', cue: 'Hinge forward with a long spine.', media: MEDIA.hamstringStretch },
      { id: 'glutes-stretch', name: 'Glutes', target: '30 sec', cue: 'Figure-four position, breathe into the hip.', media: MEDIA.gluteStretch },
      { id: 'hip-flexors-stretch-volume', name: 'Hip flexors', target: '30 sec', cue: 'Tuck pelvis first, then glide forward.', media: MEDIA.hipFlexorStretch },
      { id: 'calves-stretch-volume', name: 'Calves', target: '30 sec', cue: 'Heel down and breathe slowly.', media: MEDIA.calfStretch },
    ],
  },
  {
    day: 6,
    shortLabel: 'Optional',
    title: 'Optional Light Arms + Shoulders',
    focus: 'Light pump work only. Skip it if recovery is not strong.',
    duration: '25-40 min',
    accent: 'from-fuchsia-500/15 to-pink-400/10',
    warmup: UNIVERSAL_WARMUP,
    workout: [
      strengthExercise({
        id: 'lateral-raises-arms',
        name: 'Lateral Raises',
        dbName: 'Lateral Raise',
        aliases: ['Lateral Raise', 'Lateral Raises', 'Side Lateral Raise'],
        target: '2 x 15-20',
        sets: 2,
        repRange: '15-20',
        cue: 'Light pump only. Smooth reps and stop well before failure.',
        category: 'push',
        primaryMuscle: 'Shoulders',
        secondaryMuscles: [],
        equipment: 'dumbbell',
        media: exDbImage('Side_Lateral_Raise'),
      }),
      strengthExercise({
        id: 'rear-delt-fly',
        name: 'Rear Delt Fly',
        dbName: 'Rear Delt Fly',
        aliases: ['Rear Delt Fly', 'Bent Over Dumbbell Rear Delt Raise'],
        target: '2 x 15-20',
        sets: 2,
        repRange: '15-20',
        cue: 'Reach wide, keep it light, and avoid pulling with traps.',
        category: 'pull',
        primaryMuscle: 'Rear Delt',
        secondaryMuscles: ['Upper Back'],
        equipment: 'dumbbell',
        media: exDbImage('Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench'),
      }),
      strengthExercise({
        id: 'barbell-curl',
        name: 'Light Curl',
        dbName: 'Barbell Curl',
        aliases: ['Barbell Curl', 'Dumbbell Biceps Curl', 'Biceps Curl'],
        target: '2 x 12-15',
        sets: 2,
        repRange: '12-15',
        cue: 'Pump work only. Elbows stay near ribs and no hip swing.',
        category: 'pull',
        primaryMuscle: 'Biceps',
        secondaryMuscles: ['Forearms'],
        equipment: 'barbell',
        media: exDbImage('Barbell_Curl'),
      }),
      strengthExercise({
        id: 'light-triceps-pushdown',
        name: 'Light Triceps Pushdown',
        dbName: 'Tricep Pushdown',
        aliases: ['Tricep Pushdown', 'Triceps Pushdown'],
        target: '2 x 12-15',
        sets: 2,
        repRange: '12-15',
        cue: 'Pin elbows, extend fully, and keep it easy enough to recover from.',
        category: 'push',
        primaryMuscle: 'Triceps',
        secondaryMuscles: [],
        equipment: 'cable',
        media: exDbImage('Triceps_Pushdown'),
      }),
    ],
    stretch: [
      { id: 'triceps-stretch-arms', name: 'Triceps', target: '30 sec', cue: 'Reach overhead and keep ribs stacked.', media: MEDIA.tricepsStretch },
      { id: 'biceps-stretch-arms', name: 'Biceps', target: '30 sec', cue: 'Palm on wall, rotate away gently.', media: MEDIA.bicepsStretch },
      { id: 'shoulders-stretch-arms', name: 'Shoulders', target: '30 sec', cue: 'Cross-body stretch, shoulder down.', media: MEDIA.shoulderStretch },
      { id: 'neck-stretch', name: 'Neck', target: '20 sec each side', cue: 'Gentle pressure only. No forcing.', media: MEDIA.neckStretch },
    ],
  },
  {
    day: 7,
    shortLabel: 'Rest',
    title: 'Rest',
    focus: 'Full rest, steps if desired, sleep, and meal consistency.',
    duration: 'All day',
    accent: 'from-slate-500/15 to-zinc-400/10',
    warmup: [],
    workout: [],
    stretch: [],
    recovery: [
      { id: 'protein-150', name: 'Protein', target: '150 g', cue: 'Hit protein early so dinner is easy.' },
      { id: 'calories-1700-1800', name: 'Calories', target: '1700-1800 kcal', cue: 'Stay in range instead of chasing an exact number.' },
      { id: 'sleep-7-8', name: 'Sleep', target: '7-8 hrs', cue: 'Treat sleep as part of the plan, not a bonus.' },
    ],
  },
];

export const progressionRules = [
  'Use double progression on main lifts: hit the top of the rep range, then increase weight next session.',
  'Keep all big lifts at RPE 7-8 and avoid failure, especially on the cut.',
  'Deadlift stays 1-2 reps in reserve; if tired, reduce it to 2 sets instead of 3.',
  'Barbell Row gets 4 sets on Day 1 to keep push-pull balance and protect shoulders.',
  'If strength drops, increase carbs slightly.',
  'If recovery is poor, reduce 1-2 sets from accessories first.',
];

export const cutPhaseTargets = {
  caloriesMin: 1700,
  caloriesMax: 1800,
  caloriesTarget: 1750,
  protein: 150,
  steps: '8-10k',
  sleep: '7-8 hrs',
};

export function getSuggestedPlanDay(date = new Date()): WorkoutPlanDay {
  const day = date.getDay();
  const planDay = day === 0 ? 7 : day;
  return workoutPlan.find(item => item.day === planDay) ?? workoutPlan[0];
}
