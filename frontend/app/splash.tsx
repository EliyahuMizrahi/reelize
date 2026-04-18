import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Display, Body } from '@/components/ui/Text';
import { palette, motion } from '@/constants/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

// Six shards flying in from 6 directions, assembling into the Noctis silhouette.
// Destination positions derive from the Noctis body/wing geometry.
type ShardSeed = {
  d: string;
  fromX: number;
  fromY: number;
  fromRot: number;
  opacity: number;
  delay: number;
};

const SHARDS: ShardSeed[] = [
  // top-left sweep
  { d: 'M 16 86 L 34 58 L 58 40 L 34 54 L 26 72 Z', fromX: -160, fromY: -120, fromRot: -35, opacity: 0.92, delay: 40 },
  // top
  { d: 'M 58 40 L 80 34 L 90 42 L 76 48 L 62 46 Z', fromX: 0, fromY: -220, fromRot: 25, opacity: 0.95, delay: 120 },
  // top-right / head region
  { d: 'M 72 42 L 92 40 L 108 50 L 94 58 L 80 50 Z', fromX: 220, fromY: -140, fromRot: 42, opacity: 0.88, delay: 220 },
  // right / beak
  { d: 'M 92 42 L 110 48 L 94 54 Z', fromX: 260, fromY: 20, fromRot: 60, opacity: 1, delay: 340 },
  // bottom-right / tail
  { d: 'M 84 70 L 90 42 L 74 92 L 52 104 L 74 80 Z', fromX: 180, fromY: 180, fromRot: -28, opacity: 0.82, delay: 160 },
  // bottom-left / underbelly
  { d: 'M 32 102 L 52 104 L 44 88 L 22 90 Z', fromX: -200, fromY: 160, fromRot: 40, opacity: 0.78, delay: 80 },
];

function Shard({ seed, progress }: { seed: ShardSeed; progress: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => {
    // Each shard has a slightly staggered arrival inside the main progress window
    const p = Math.max(0, Math.min(1, (progress.value * 1600 - seed.delay) / 1000));
    // ease-out-quint for a confident settle
    const t = 1 - Math.pow(1 - p, 5);
    const tx = seed.fromX * (1 - t);
    const ty = seed.fromY * (1 - t);
    const rot = seed.fromRot * (1 - t);
    return {
      transform: `translate(${tx} ${ty}) rotate(${rot} 60 60)`,
      opacity: seed.opacity * (p > 0 ? 1 : 0) * (0.4 + 0.6 * t),
    } as any;
  });

  return (
    <AnimatedPath
      d={seed.d}
      fill={palette.mist}
      animatedProps={animatedProps as any}
    />
  );
}

export default function SplashScreen() {
  const router = useRouter();

  const assembly = useSharedValue(0); // 0 → 1 over ~1.1s
  const silhouetteOpacity = useSharedValue(0); // smooths the final "settled" form
  const eyeScale = useSharedValue(0);
  const eyeGlow = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(10);
  const taglineOpacity = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.bezier(...motion.ease.entrance);

    // Shards fly in and assemble
    assembly.value = withTiming(1, { duration: 1100, easing: ease });
    // Unified silhouette fades in on top to hide seams once assembled
    silhouetteOpacity.value = withDelay(
      900,
      withTiming(1, { duration: 320, easing: ease }),
    );
    // Eye ignites LAST — scale pop + bloom pulse
    eyeScale.value = withDelay(
      1260,
      withTiming(1, { duration: 260, easing: Easing.bezier(0.22, 1, 0.36, 1) }),
    );
    eyeGlow.value = withDelay(
      1260,
      withSequence(
        withTiming(1, { duration: 320, easing: ease }),
        withTiming(0.6, { duration: 420, easing: ease }),
      ),
    );

    // Title fades in on a separate beat
    titleOpacity.value = withDelay(1500, withTiming(1, { duration: 500, easing: ease }));
    titleY.value = withDelay(1500, withTiming(0, { duration: 500, easing: ease }));

    // Tagline whispers last
    taglineOpacity.value = withDelay(1900, withTiming(1, { duration: 480, easing: ease }));

    // Navigate after full cinema duration
    const t = setTimeout(() => {
      router.replace('/(auth)/sign-in');
    }, 2600);

    return () => clearTimeout(t);
  }, []);

  const silhouetteStyle = useAnimatedStyle(() => ({
    opacity: silhouetteOpacity.value,
  }));

  const eyeAnimatedProps = useAnimatedProps(() => ({
    r: 2.6 * eyeScale.value + 0.1,
    opacity: 0.6 + 0.4 * eyeScale.value,
  }));

  const eyeBloomProps = useAnimatedProps(() => ({
    r: 9 + 6 * eyeGlow.value,
    opacity: 0.28 * eyeGlow.value,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
  }));

  return (
    <Screen background="ink" edges={['top', 'bottom']}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 220, height: 220, alignItems: 'center', justifyContent: 'center' }}>
          {/* Shards flying in */}
          <Svg
            width={220}
            height={220}
            viewBox="0 0 120 120"
            style={{ position: 'absolute' }}
          >
            {SHARDS.map((s, i) => (
              <Shard key={i} seed={s} progress={assembly} />
            ))}
          </Svg>

          {/* Unified silhouette fades up once shards have assembled */}
          <Animated.View style={[{ position: 'absolute' }, silhouetteStyle]}>
            <Svg width={220} height={220} viewBox="0 0 120 120">
              <Path
                d="M 16 86 L 34 58 L 58 40 L 80 34 L 90 42 L 84 70 L 74 92 L 52 104 L 32 102 Z"
                fill={palette.mist}
              />
              <Path
                d="M 38 64 L 72 42 L 92 40 L 108 50 L 94 58 L 76 64 L 56 82 Z"
                fill={palette.mist}
                opacity={0.42}
              />
              <Path d="M 92 42 L 110 48 L 94 54 Z" fill={palette.mist} />
              {/* eye bloom */}
              <AnimatedCircle cx={96} cy={48} fill={palette.sage} animatedProps={eyeBloomProps} />
              {/* eye core */}
              <AnimatedCircle cx={96} cy={48} fill={palette.sage} animatedProps={eyeAnimatedProps} />
              <Circle cx={97.2} cy={47.1} r={0.9} fill="#FFFFFF" opacity={0.85} />
            </Svg>
          </Animated.View>
        </View>

        <View style={{ marginTop: 44, alignItems: 'center' }}>
          <Animated.View style={titleStyle}>
            <Display color={palette.mist} align="center">
              Reelize
            </Display>
          </Animated.View>
          <Animated.View style={[{ marginTop: 12 }, taglineStyle]}>
            <Body italic color={palette.fog} align="center">
              Learn in the language of the feed.
            </Body>
          </Animated.View>
        </View>
      </View>
    </Screen>
  );
}
