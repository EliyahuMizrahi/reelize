import {
  FadeIn,
  FadeInUp,
  FadeInDown,
  SlideInUp,
  SlideInDown,
  ZoomIn,
  EntryAnimationsValues,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { motion } from '@/constants/tokens';

export const ENTER = {
  fadeUp: (delay = 0) =>
    FadeInUp.delay(delay).duration(motion.dur.normal).easing(Easing.bezier(...motion.ease.entrance)),
  fadeUpSlow: (delay = 0) =>
    FadeInUp.delay(delay).duration(motion.dur.slow).easing(Easing.bezier(...motion.ease.entrance)),
  fade: (delay = 0) =>
    FadeIn.delay(delay).duration(motion.dur.normal).easing(Easing.bezier(...motion.ease.entrance)),
  fadeSlow: (delay = 0) =>
    FadeIn.delay(delay).duration(motion.dur.slow).easing(Easing.bezier(...motion.ease.entrance)),
  slideUp: (delay = 0) =>
    SlideInUp.delay(delay).duration(motion.dur.slow).easing(Easing.bezier(...motion.ease.entrance)),
  zoomIn: (delay = 0) =>
    ZoomIn.delay(delay).duration(motion.dur.normal).easing(Easing.bezier(...motion.ease.standard)),
};

export const stagger = (index: number, step = 60, base = 0) => base + index * step;
