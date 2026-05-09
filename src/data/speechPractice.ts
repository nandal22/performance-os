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
