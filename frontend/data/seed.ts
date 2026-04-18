// Design seed templates — small list of names/colors used by other
// debugging flows. The actual inserts live inside mutations.ts/seedDemoShelf.

import { palette } from '@/constants/tokens';

export { seedDemoShelf } from '@/data/mutations';

export const SEED_CLASS_NAMES = ['Biology', 'Finance', 'Philosophy'] as const;

export const SEED_PALETTE: Record<
  (typeof SEED_CLASS_NAMES)[number],
  string
> = {
  Biology: palette.sage,
  Finance: palette.gold,
  Philosophy: palette.tealBright,
};

export const SEED_TOPIC_NAMES: Record<
  (typeof SEED_CLASS_NAMES)[number],
  string[]
> = {
  Biology: ['Krebs Cycle', 'Photosynthesis', 'Mitosis'],
  Finance: ['Compound Interest', 'Options Greeks', 'Inflation'],
  Philosophy: ['Stoicism Primer', 'Plato on Forms'],
};
