import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  ImageStyle,
  View,
  Platform,
  ViewStyle,
  StyleProp,
  ImageSourcePropType,
} from 'react-native';

// Add more animations here. The registry is the single extension point —
// dropping in a new sprite sheet should be a 1-entry change, not a rewrite.
export type NoctisAnimation = 'idle' | 'talking';

interface AnimationDef {
  source: ImageSourcePropType;
  frames: number;
  cols: number;
  rows: number;
  frameSize: number;
  loop: boolean;
  returnToIdle?: boolean;
}

const ANIMATIONS: Record<NoctisAnimation, AnimationDef> = {
  idle: {
    source: require('../../assets/sprites/noctis/Noctis-idle.png'),
    frames: 8,
    cols: 4,
    rows: 2,
    frameSize: 256,
    loop: true,
  },
  talking: {
    source: require('../../assets/sprites/noctis/Noctis-talking.png'),
    frames: 6,
    cols: 3,
    rows: 2,
    frameSize: 256,
    loop: true,
  },
};

export interface NoctisSpriteProps {
  size?: number;
  animation?: NoctisAnimation;
  fps?: number;
  paused?: boolean;
  onAnimationComplete?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);
  return reduced;
}

export function NoctisSprite({
  size = 64,
  animation = 'idle',
  fps = 10,
  paused = false,
  onAnimationComplete,
  style,
  testID,
}: NoctisSpriteProps) {
  const def = ANIMATIONS[animation];
  const [frame, setFrame] = useState(0);
  const completedRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();

  // Reset frame + completion flag when the animation changes.
  useEffect(() => {
    setFrame(0);
    completedRef.current = false;
  }, [animation]);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const interval = setInterval(() => {
      setFrame((prev) => {
        const next = prev + 1;
        if (next >= def.frames) {
          if (def.loop) return 0;
          if (!completedRef.current) {
            completedRef.current = true;
            onAnimationComplete?.();
          }
          return def.frames - 1;
        }
        return next;
      });
    }, Math.max(1, Math.round(1000 / fps)));
    return () => clearInterval(interval);
  }, [paused, fps, def.frames, def.loop, reducedMotion, onAnimationComplete]);

  const col = frame % def.cols;
  const row = Math.floor(frame / def.cols);

  const pixelatedWeb =
    Platform.OS === 'web'
      ? ({ imageRendering: 'pixelated' } as unknown as ImageStyle)
      : null;

  return (
    <View
      testID={testID}
      style={[
        { width: size, height: size, overflow: 'hidden' },
        style,
      ]}
    >
      <Image
        source={def.source}
        fadeDuration={0}
        resizeMode="stretch"
        style={[
          {
            width: size * def.cols,
            height: size * def.rows,
            transform: [
              { translateX: -col * size },
              { translateY: -row * size },
            ],
          },
          pixelatedWeb,
        ]}
      />
    </View>
  );
}

export default NoctisSprite;
