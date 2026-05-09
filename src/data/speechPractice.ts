import { BookOpen, Gauge, MessageSquareText } from 'lucide-react';

export interface SpeechDrill {
  id: string;
  title: string;
  minutes: number;
  focus: string;
  steps: string[];
}

export interface SpeechPrompt {
  id: string;
  title: string;
  category: string;
  setup: string;
  starter: string;
}

export interface SpeechPracticeTest {
  id: string;
  title: string;
  category: string;
  minutes: number;
  goal: string;
  whatToDo: string[];
  contentTitle: string;
  content: string[];
  selfCheck: string[];
}

export const speechDrills: SpeechDrill[] = [
  {
    id: 'pace-reset',
    title: 'Pace reset',
    minutes: 2,
    focus: 'Slow down and pause cleanly.',
    steps: [
      'Read 5 to 8 lines at 70% speed.',
      'Pause after every comma and full stop.',
      'Repeat once at natural speed without rushing.',
    ],
  },
  {
    id: 'word-clarity',
    title: 'Word clarity',
    minutes: 3,
    focus: 'Finish sounds and sharpen common fumbles.',
    steps: [
      'Say pa-ta-ka, la-ra, and s-sh-th slowly.',
      'Repeat words ending in t, d, s, and k.',
      'Open your mouth slightly more than usual.',
    ],
  },
  {
    id: 'real-speech',
    title: 'Real speech',
    minutes: 3,
    focus: 'Explain one thought clearly.',
    steps: [
      'Use Point -> Reason -> Example -> Next step.',
      'Speak for 60 to 90 seconds.',
      'Replace filler words with a pause.',
    ],
  },
];

export const speechPromptPool: SpeechPrompt[] = [
  {
    id: 'standup-update',
    title: 'Daily standup update',
    category: 'Work',
    setup: 'Give a clear update without overexplaining.',
    starter: 'Yesterday I worked on ___. Today I will focus on ___. The main blocker or risk is ___.',
  },
  {
    id: 'explain-task',
    title: 'Explain a task simply',
    category: 'Clarity',
    setup: 'Explain a work item like the listener is new to it.',
    starter: 'The goal is ___. It matters because ___. The next useful step is ___.',
  },
  {
    id: 'ask-for-help',
    title: 'Ask for help',
    category: 'Soft skill',
    setup: 'Ask clearly without sounding unsure or apologetic.',
    starter: 'I am trying to ___. I am stuck on ___. Could you help me decide between ___ and ___?',
  },
  {
    id: 'polite-disagree',
    title: 'Disagree politely',
    category: 'Soft skill',
    setup: 'State your view calmly and keep the conversation productive.',
    starter: 'I see the point about ___. My concern is ___. I suggest we try ___ because ___.',
  },
  {
    id: 'decision-summary',
    title: 'Summarize a decision',
    category: 'Meeting',
    setup: 'Close the loop with a crisp summary.',
    starter: 'We decided to ___. The reason is ___. I will own ___. The next check-in is ___.',
  },
  {
    id: 'quick-intro',
    title: 'Introduce yourself',
    category: 'Confidence',
    setup: 'Practice a calm 30-second intro.',
    starter: 'I work on ___. Recently I have been focused on ___. I enjoy solving ___.',
  },
];

export const speechPracticeTests: SpeechPracticeTest[] = [
  {
    id: 'baseline-clarity',
    title: 'Baseline clarity test',
    category: 'Clarity',
    minutes: 4,
    goal: 'Find out where you rush, drop endings, or blur words.',
    whatToDo: [
      'Read the passage once at normal speed.',
      'Read it again 20% slower with pauses after full stops.',
      'Mark yourself only on clarity, not style.',
    ],
    contentTitle: 'Read this out loud',
    content: [
      'This week I am working on a focused improvement plan. The goal is simple: speak a little slower, finish every important word, and make each point easy to follow.',
      'When I explain something, I will start with the main idea, add the reason, give one example, and end with the next step.',
    ],
    selfCheck: [
      'Did I finish words ending in t, d, s, k, and g?',
      'Could a listener repeat my main point?',
      'Did I pause instead of filling space?',
    ],
  },
  {
    id: 'pace-control',
    title: 'Pace control test',
    category: 'Pace',
    minutes: 3,
    goal: 'Train yourself to slow down without sounding unnatural.',
    whatToDo: [
      'Say one sentence per breath.',
      'Pause for one beat at each slash.',
      'Repeat the same content once at natural speed.',
    ],
    contentTitle: 'Speak with the slash pauses',
    content: [
      'The main issue is not speed alone / it is speed without structure.',
      'When I pause / the listener gets time to understand / and I get time to choose better words.',
      'My goal is not to sound slow / my goal is to sound clear and controlled.',
    ],
    selfCheck: [
      'Did my sentences feel controlled?',
      'Did I avoid rushing the last three words?',
      'Did silence feel less awkward by the second round?',
    ],
  },
  {
    id: 'hard-word-ladder',
    title: 'Hard word ladder',
    category: 'Diction',
    minutes: 3,
    goal: 'Sharpen words that commonly get swallowed or mixed together.',
    whatToDo: [
      'Read each row slowly, then at normal speed.',
      'Over-pronounce once, then speak naturally.',
      'Keep your jaw loose and finish the final sound.',
    ],
    contentTitle: 'Word sets',
    content: [
      'specific, consistently, productivity, priority, probability',
      'task, asked, fixed, shipped, reviewed, discussed',
      'clarity, quality, reliability, strategy, responsibility',
      'three things, this sprint, status update, next step',
    ],
    selfCheck: [
      'Were specific and consistently separated clearly?',
      'Did task, asked, and fixed keep their ending sounds?',
      'Did long words stay clean instead of becoming one blur?',
    ],
  },
  {
    id: 'work-update',
    title: 'Work update test',
    category: 'Soft skill',
    minutes: 5,
    goal: 'Give a concise update that sounds prepared and confident.',
    whatToDo: [
      'Use the exact structure: done, doing, blocked, next.',
      'Keep it under 45 seconds.',
      'If you fumble, pause and restart the sentence.',
    ],
    contentTitle: 'Fill and speak',
    content: [
      'Done: I completed ___.',
      'Doing: I am currently focused on ___.',
      'Blocked: The only risk is ___.',
      'Next: I will update you by ___ with ___.',
    ],
    selfCheck: [
      'Was the update under 45 seconds?',
      'Was the blocker stated without rambling?',
      'Did I sound decisive on the next step?',
    ],
  },
  {
    id: 'filler-reset',
    title: 'Filler reset test',
    category: 'Fluency',
    minutes: 4,
    goal: 'Replace um, like, actually, and you know with clean pauses.',
    whatToDo: [
      'Pick one topic from the content list.',
      'Speak for 60 seconds.',
      'Every time a filler appears, pause and continue from the last clean word.',
    ],
    contentTitle: 'Choose one topic',
    content: [
      'Explain a feature you recently worked on.',
      'Explain why speech clarity matters to you.',
      'Explain one mistake you made and what you learned.',
      'Explain a plan for tomorrow in four sentences.',
    ],
    selfCheck: [
      'How many fillers did I notice?',
      'Did I pause instead of panicking?',
      'Did I keep the topic organized?',
    ],
  },
  {
    id: 'story-clarity',
    title: 'Story clarity test',
    category: 'Confidence',
    minutes: 5,
    goal: 'Tell a short story with a clean beginning, middle, and end.',
    whatToDo: [
      'Use situation, action, result, lesson.',
      'Keep the story under 90 seconds.',
      'Make the lesson one sentence.',
    ],
    contentTitle: 'Story frame',
    content: [
      'Situation: One challenge I faced was ___.',
      'Action: I handled it by ___.',
      'Result: The outcome was ___.',
      'Lesson: Next time, I will ___.',
    ],
    selfCheck: [
      'Was the story easy to follow?',
      'Did I avoid unnecessary background?',
      'Was the lesson clear and memorable?',
    ],
  },
];

export const speechFramework = [
  'Point',
  'Reason',
  'Example',
  'Next step',
] as const;

export const speechDrillIcons = {
  'pace-reset': Gauge,
  'word-clarity': BookOpen,
  'real-speech': MessageSquareText,
} as const;
