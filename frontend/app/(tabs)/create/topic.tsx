import React, { useEffect, useState } from 'react';
import { View, ScrollView, Platform, Keyboard } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';

import { Screen, ScreenContent } from '@/components/ui/Screen';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { Chip } from '@/components/ui/Chip';
import {
  Display,
  BodySm,
  MonoSm,
  Overline,
} from '@/components/ui/Text';
import { ENTER, stagger } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii, spacing, motion } from '@/constants/tokens';

const EXAMPLES = [
  'Krebs Cycle',
  'Compound interest',
  'Why Rome fell',
  'Stoicism basics',
  'CRISPR',
  'Options Greeks',
  'The Pythagorean theorem',
  'How planes fly',
];

function FadingChip({
  label,
  dim,
  index,
  onPress,
}: {
  label: string;
  dim: boolean;
  index: number;
  onPress: () => void;
}) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withTiming(dim ? 0.28 : 1, {
      duration: motion.dur.normal,
      easing: Easing.bezier(...motion.ease.standard),
    });
  }, [dim]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View entering={ENTER.fadeUp(stagger(index, 40, 400))} style={style}>
      <Chip label={label} variant="paper" onPress={onPress} />
    </Animated.View>
  );
}

export default function TopicScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sourceId?: string }>();
  const { colors } = useAppTheme();
  const [topic, setTopic] = useState('');

  const canGenerate = topic.trim().length > 2;

  const handleChip = (label: string) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setTopic(label);
  };

  const onGenerate = () => {
    if (!canGenerate) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    Keyboard.dismiss();
    const q =
      '/create/generation?topic=' +
      encodeURIComponent(topic.trim()) +
      (params.sourceId ? '&sourceId=' + encodeURIComponent(String(params.sourceId)) : '');
    router.push(q as any);
  };

  const onBack = () => router.back();

  // subtle cursor blink feel — animate a small caret bar near the field
  const cursor = useSharedValue(0);
  useEffect(() => {
    cursor.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 540, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
        withTiming(0, { duration: 540, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
      ),
      -1,
    );
  }, []);
  const cursorStyle = useAnimatedStyle(() => ({ opacity: 0.35 + 0.55 * cursor.value }));

  // Watermark Noctis — still, a fixed silhouette in the corner.

  return (
    <Screen background="primary">
      {/* Back */}
      <View style={{ position: 'absolute', top: spacing['3xl'], left: spacing.lg, zIndex: 5 }}>
        <IconButton onPress={onBack} size={40} accessibilityLabel="Back">
          <Feather name="chevron-left" size={20} color={colors.text as string} />
        </IconButton>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: spacing['5xl'], paddingBottom: 240 }}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenContent>
          {/* Source pill */}
          <Animated.View entering={ENTER.fadeUp(60)} style={{ alignSelf: 'flex-start' }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: colors.border as string,
              }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.sage }} />
              <Overline muted>
                Style locked · {params.sourceId ? 'Source ready' : 'Mock source'}
              </Overline>
            </View>
          </Animated.View>

          {/* Prompt */}
          <Animated.View entering={ENTER.fadeUp(140)} style={{ marginTop: spacing['2xl'] }}>
            <Display>What do you want to learn?</Display>
          </Animated.View>

          {/* Editorial input */}
          <Animated.View entering={ENTER.fadeUp(240)} style={{ marginTop: spacing['2xl'] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <TextField
                  variant="editorial"
                  font="serif"
                  placeholder="a disc, a question, a curiosity…"
                  value={topic}
                  onChangeText={setTopic}
                  autoFocus
                  returnKeyType="go"
                  onSubmitEditing={onGenerate}
                  style={{ fontSize: 28, lineHeight: 34 }}
                />
              </View>
              {topic.length === 0 ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    {
                      width: 2,
                      height: 28,
                      marginLeft: -8,
                      backgroundColor: colors.primary as string,
                    },
                    cursorStyle,
                  ]}
                />
              ) : null}
            </View>
            <MonoSm muted style={{ marginTop: spacing.sm }}>
              30 SECONDS · IN THE SOURCE'S EXACT STYLE
            </MonoSm>
          </Animated.View>

          {/* Examples */}
          <View style={{ marginTop: spacing['2xl'] }}>
            <Animated.View entering={ENTER.fadeUp(340)}>
              <Overline muted>Or try one of these</Overline>
            </Animated.View>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: spacing.sm,
                marginTop: spacing.md,
              }}
            >
              {EXAMPLES.map((label, i) => (
                <FadingChip
                  key={label}
                  label={label}
                  dim={topic.length > 0 && topic.trim().toLowerCase() !== label.toLowerCase()}
                  index={i}
                  onPress={() => handleChip(label)}
                />
              ))}
            </View>
          </View>
        </ScreenContent>
      </ScrollView>

      {/* Generate bar */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing['3xl'],
          backgroundColor: (colors.background as string) + 'F2',
          borderTopWidth: 1,
          borderTopColor: colors.border as string,
          gap: spacing.sm,
        }}
      >
        <BodySm muted align="center" italic>
          We'll keep it in the same voice as your source.
        </BodySm>
        <Button
          title="Generate lesson"
          variant={canGenerate ? 'shimmer' : 'tertiary'}
          size="lg"
          fullWidth
          disabled={!canGenerate}
          onPress={onGenerate}
        />
      </View>
    </Screen>
  );
}
