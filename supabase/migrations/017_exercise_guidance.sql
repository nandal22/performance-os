-- Cues are original. Images, when matched, are Unlicense frames from yuhonas/free-exercise-db.

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Lie on the bench with eyes under the bar and feet planted. Grip just outside the shoulders.$cue$, $cue$Unrack, lower the bar to the lower chest, and press up until the elbows lock without bouncing.$cue$, $cue$Flaring the elbows, bouncing off the chest, or lifting the hips off the bench.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Bench_Press_-_Medium_Grip/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Bench_Press_-_Medium_Grip/1.jpg'], $cue$yuhonas/free-exercise-db (Barbell Bench Press - Medium Grip). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Bench Press$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Set the bench around 30 degrees and plant the feet. Grip the bar slightly wider than the shoulders.$cue$, $cue$Lower the bar to the upper chest and press up along a slight arc toward the rack.$cue$, $cue$Setting the bench too steep, which turns it into a shoulder press, or letting the elbows flare.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Incline_Bench_Press_-_Medium_Grip/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Incline_Bench_Press_-_Medium_Grip/1.jpg'], $cue$yuhonas/free-exercise-db (Barbell Incline Bench Press - Medium Grip). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Incline Bench Press$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Stand with the bar on the front of the shoulders, ribs down, and glutes tight.$cue$, $cue$Press the bar up and slightly back until it is over the mid-foot, then lower it under control.$cue$, $cue$Leaning back into a standing incline press, or pressing the bar forward of the body.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Shoulder_Press/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Shoulder_Press/1.jpg'], $cue$yuhonas/free-exercise-db (Barbell Shoulder Press). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Overhead Press$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Hands under the shoulders, body in one line from head to heels.$cue$, $cue$Lower the chest until the arms are about parallel, then press the floor away.$cue$, $cue$Hips sagging, or stopping the range halfway.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pushups/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pushups/1.jpg'], $cue$yuhonas/free-exercise-db (Pushups). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Push-up$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Lie on a flat bench with a dumbbell in each hand above the chest, palms in.$cue$, $cue$Open the arms in a wide arc until a chest stretch, then sweep them back together.$cue$, $cue$Bending the elbows so little that the shoulders take the load, or dropping the weights too deep.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dumbbell_Flyes/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dumbbell_Flyes/1.jpg'], $cue$yuhonas/free-exercise-db (Dumbbell Flyes). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Dumbbell Flye$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Stand tall with a light dumbbell at each side, a soft bend in the elbows.$cue$, $cue$Raise the arms out to shoulder height, leading with the elbows, then lower slowly.$cue$, $cue$Shrugging, swinging the torso, or lifting the hands higher than the elbows.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Side_Lateral_Raise/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Side_Lateral_Raise/1.jpg'], $cue$yuhonas/free-exercise-db (Side Lateral Raise). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Lateral Raise$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Face the cable with elbows pinned to the sides and the handle at chest height.$cue$, $cue$Straighten the elbows until the arms are locked, then let the handle rise only as far as the elbows stay still.$cue$, $cue$Letting the elbows drift forward, or leaning the body into the stack.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Triceps_Pushdown/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Triceps_Pushdown/1.jpg'], $cue$yuhonas/free-exercise-db (Triceps Pushdown). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Tricep Pushdown$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Stand with the bar over the mid-foot, shins close, back set, and lats tight.$cue$, $cue$Push the floor away and stand tall. Keep the bar against the legs on the way up and down.$cue$, $cue$Jerking the bar, rounding the low back, or letting the bar drift forward.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Deadlift/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Deadlift/1.jpg'], $cue$yuhonas/free-exercise-db (Barbell Deadlift). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Deadlift$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Hang from the bar with a full grip, shoulders set down, and ribs quiet.$cue$, $cue$Pull the chest toward the bar until the chin clears it, then lower to a straight arm.$cue$, $cue$Kipping, or stopping short of a full hang.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pullups/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pullups/1.jpg'], $cue$yuhonas/free-exercise-db (Pullups). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Pull-up$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Hinge until the torso is near parallel, bar in the hands, back flat.$cue$, $cue$Pull the bar to the lower ribs, squeeze the shoulder blades, and lower it without bouncing.$cue$, $cue$Standing too upright, or yanking with the low back.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bent_Over_Barbell_Row/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bent_Over_Barbell_Row/1.jpg'], $cue$yuhonas/free-exercise-db (Bent Over Barbell Row). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Barbell Row$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Sit tall, thighs under the pads, and take a wide grip.$cue$, $cue$Pull the bar to the upper chest by driving the elbows down, then control it back up.$cue$, $cue$Leaning far back to turn it into a row, or pulling behind the neck.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Wide-Grip_Lat_Pulldown/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Wide-Grip_Lat_Pulldown/1.jpg'], $cue$yuhonas/free-exercise-db (Wide-Grip Lat Pulldown). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Lat Pulldown$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Set a rope at face height and take an overhand grip.$cue$, $cue$Pull the rope toward the face, finishing with the hands beside the ears and the elbows high.$cue$, $cue$Using too much weight and turning it into an upright row.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Face_Pull/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Face_Pull/1.jpg'], $cue$yuhonas/free-exercise-db (Face Pull). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Face Pull$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Stand with the bar in the hands, elbows under the shoulders.$cue$, $cue$Curl the bar up without swinging, then lower it until the elbows are straight.$cue$, $cue$Rocking the torso, or letting the elbows travel forward.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Curl/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Curl/1.jpg'], $cue$yuhonas/free-exercise-db (Barbell Curl). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Barbell Curl$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Bar on the upper back, feet about shoulder width, brace before the descent.$cue$, $cue$Sit down between the hips until the thighs pass parallel, then stand up through the mid-foot.$cue$, $cue$Knees collapsing, heels rising, or the chest falling forward.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Squat/1.jpg'], $cue$yuhonas/free-exercise-db (Barbell Squat). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Squat$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Hold the bar at the thighs with a soft knee bend and a braced trunk.$cue$, $cue$Push the hips back until the hamstrings limit the range, then stand by driving the hips forward.$cue$, $cue$Squatting the weight down, or rounding the back to chase depth.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Romanian_Deadlift/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Romanian_Deadlift/1.jpg'], $cue$yuhonas/free-exercise-db (Romanian Deadlift). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Romanian Deadlift$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Sit in the machine with the feet flat on the sled, about hip width.$cue$, $cue$Lower the sled until the knees are deep but the low back stays glued to the pad, then press back up.$cue$, $cue$Letting the pelvis tuck at the bottom, or locking the knees hard at the top.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leg_Press/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leg_Press/1.jpg'], $cue$yuhonas/free-exercise-db (Leg Press). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Leg Press$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Lie face down with the pad just above the heels.$cue$, $cue$Curl the heels toward the glutes, pause, and lower without letting the hips jump.$cue$, $cue$Lifting the hips off the pad to shorten the range.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Lying_Leg_Curls/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Lying_Leg_Curls/1.jpg'], $cue$yuhonas/free-exercise-db (Lying Leg Curls). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Leg Curl$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Stand on the balls of the feet with the knees nearly straight.$cue$, $cue$Rise as high as the calves allow, pause, and lower the heels below the step.$cue$, $cue$Bouncing, or bending the knees to involve the thighs.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Calf_Raises/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Calf_Raises/1.jpg'], $cue$yuhonas/free-exercise-db (Standing Calf Raises). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Calf Raise$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Upper back on a bench, bar over the hips, feet planted so the shins are vertical at the top.$cue$, $cue$Drive the hips up until the torso is parallel with the floor, squeeze the glutes, and lower.$cue$, $cue$Overarching the low back, or pushing through the toes.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Hip_Thrust/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Hip_Thrust/1.jpg'], $cue$yuhonas/free-exercise-db (Barbell Hip Thrust). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Hip Thrust$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Forearms under the shoulders, legs straight, and the pelvis tucked slightly.$cue$, $cue$Hold a straight line from head to heels while breathing quietly.$cue$, $cue$Hips piked up or sagging, or holding the breath.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Plank/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Plank/1.jpg'], $cue$yuhonas/free-exercise-db (Plank). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Plank$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Kneel with the wheel under the shoulders and the glutes squeezed.$cue$, $cue$Roll forward until the hips want to dump, then pull back to the knees using the trunk.$cue$, $cue$Rolling so far that the low back sags, or yanking back with the hips.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Ab_Rollout_-_On_Knees/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Ab_Rollout_-_On_Knees/1.jpg'], $cue$yuhonas/free-exercise-db (Barbell Ab Rollout - On Knees). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Ab Wheel Rollout$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Kneel facing the cable with the rope beside the ears.$cue$, $cue$Curl the ribs toward the pelvis, then return only as far as the abs stay loaded.$cue$, $cue$Pulling the rope down with the arms while the trunk stays still.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Cable_Crunch/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Cable_Crunch/1.jpg'], $cue$yuhonas/free-exercise-db (Cable Crunch). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Cable Crunch$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Sit or stand with a dumbbell at each shoulder, wrists stacked over the elbows.$cue$, $cue$Press the bells up until they nearly meet overhead, then lower them to shoulder height.$cue$, $cue$Flaring the ribs, or letting one bell drift forward.$cue$, ARRAY['https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dumbbell_Shoulder_Press/0.jpg', 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Dumbbell_Shoulder_Press/1.jpg'], $cue$yuhonas/free-exercise-db (Dumbbell Shoulder Press). Cues written for Performance OS.$cue$, $cue$Unlicense$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Dumbbell Overhead Press$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();

INSERT INTO exercise_guidance (exercise_id, setup, movement, common_mistakes, image_urls, source, license)
SELECT id, $cue$Set the machine to a pace you can hold with a steady breath.$cue$, $cue$Keep the same rhythm for the planned minutes, and note the type of machine in the log.$cue$, $cue$Starting too hard and cutting the session short.$cue$, ARRAY[]::text[], $cue$Performance OS$cue$, $cue$original$cue$
FROM exercises
WHERE user_id IS NULL AND lower(name) = lower($cue$Cardio$cue$)
ON CONFLICT (exercise_id) DO UPDATE SET
  setup = EXCLUDED.setup,
  movement = EXCLUDED.movement,
  common_mistakes = EXCLUDED.common_mistakes,
  image_urls = EXCLUDED.image_urls,
  source = EXCLUDED.source,
  license = EXCLUDED.license,
  updated_at = now();
