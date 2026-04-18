import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Display2, Title, TitleSm, BodySm, Mono, MonoSm, Overline } from '@/components/ui/Text';
import { IconButton } from '@/components/ui/IconButton';
import { Noctis } from '@/components/brand/Noctis';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii, spacing } from '@/constants/tokens';
import { ENTER, stagger } from '@/components/ui/motion';
import { supabase } from '@/lib/supabase';

type Route = {
  title: string;
  path: string;
  note?: string;
};

type Section = {
  overline: string;
  caption: string;
  routes: Route[];
};

function buildSections(sampleClassId: string, sampleTopicId: string, sampleClipId: string): Section[] {
  return [
    {
      overline: 'I · Entrance',
      caption: 'Splash, onboarding, auth. The first twenty seconds.',
      routes: [
        { title: 'Splash', path: '/splash', note: 'shard assembly · eye ignition' },
        { title: 'Welcome', path: '/onboarding/welcome' },
        { title: 'How it works', path: '/onboarding/how-it-works' },
        { title: 'First class', path: '/onboarding/first-class' },
        { title: 'Sign in', path: '/(auth)/sign-in' },
        { title: 'Sign up', path: '/(auth)/sign-up' },
      ],
    },
    {
      overline: 'II · Study',
      caption: 'Feed, library, class, topic, player. Where the lessons live.',
      routes: [
        { title: 'Feed', path: '/(tabs)/feed', note: 'short-form · Style DNA medallion' },
        { title: 'Library', path: '/(tabs)/library' },
        { title: 'Class detail', path: `/library/class/${sampleClassId}` },
        { title: 'Topic detail', path: `/library/topic/${sampleTopicId}` },
        { title: 'Player', path: `/player/${sampleClipId}`, note: 'scrubber · waveform · long-press DNA' },
      ],
    },
    {
      overline: 'III · Make',
      caption: 'The workbench. Paste, deconstruct, name, generate.',
      routes: [
        { title: 'Create · source picker', path: '/(tabs)/create' },
        { title: 'Deconstruction', path: '/create/deconstruction', note: 'hero · shards → Style DNA' },
        { title: 'Topic', path: '/create/topic' },
        { title: 'Generation', path: '/create/generation?topic=The%20Krebs%20Cycle' },
      ],
    },
    {
      overline: 'IV · You',
      caption: 'Profile and settings. The quiet corners.',
      routes: [
        { title: 'Profile', path: '/(tabs)/profile' },
        { title: 'Settings', path: '/settings' },
      ],
    },
    {
      overline: 'V · Web',
      caption: 'Browser-first surfaces. Same brand, different body.',
      routes: [
        { title: 'Marketing (long-scroll)', path: '/marketing' },
        { title: 'Feed · dashboard (web)', path: '/(tabs)/feed' },
        { title: 'Create · lab bench (web)', path: '/(tabs)/create' },
        { title: 'Library (web)', path: '/(tabs)/library' },
        { title: 'Player (web)', path: `/player/${sampleClipId}` },
        { title: 'Settings (web)', path: '/settings' },
      ],
    },
  ];
}

export default function AuditIndexScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();

  // Pull one real class/topic/clip id so the route-walker opens real pages.
  // Falls back to template placeholders if the account is empty.
  const [sampleClassId, setSampleClassId] = useState('new');
  const [sampleTopicId, setSampleTopicId] = useState('new');
  const [sampleClipId, setSampleClipId] = useState('new');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cls, topic, clip] = await Promise.all([
          supabase.from('classes').select('id').limit(1).maybeSingle(),
          supabase.from('topics').select('id').limit(1).maybeSingle(),
          supabase.from('clips').select('id').limit(1).maybeSingle(),
        ]);
        if (cancelled) return;
        if (cls.data?.id) setSampleClassId(cls.data.id);
        if (topic.data?.id) setSampleTopicId(topic.data.id);
        if (clip.data?.id) setSampleClipId(clip.data.id);
      } catch {
        // ignore — fall back to templates
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const SECTIONS = buildSections(sampleClassId, sampleTopicId, sampleClipId);

  const go = (path: string) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    router.push(path as any);
  };

  const onBack = () => router.back();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: spacing['7xl'],
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header chrome */}
        <Animated.View
          entering={ENTER.fade(20)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: spacing.lg,
          }}
        >
          <IconButton
            variant="ghost"
            size={40}
            onPress={onBack}
            accessibilityLabel="Back"
          >
            <Feather name="chevron-left" size={22} color={colors.text as string} />
          </IconButton>
          <View style={{ flex: 1 }} />
          <Noctis
            variant="watching"
            size={44}
            color={colors.text as string}
            eyeColor={palette.sage}
          />
        </Animated.View>

        {/* Title */}
        <Animated.View entering={ENTER.fadeUp(60)} style={{ marginBottom: spacing['2xl'] }}>
          <Overline color={palette.sage}>Index · Audit</Overline>
          <Display2 style={{ marginTop: spacing.sm }}>Every route, in order.</Display2>
          <BodySm italic family="serif" muted style={{ marginTop: spacing.sm }}>
            A pocket map of the shelf. Tap a row to step through the app without
            hunting for the path.
          </BodySm>
          <MonoSm muted style={{ marginTop: spacing.md }}>
            {`${SECTIONS.length} sections · ${SECTIONS.reduce((a, s) => a + s.routes.length, 0)} routes`}
          </MonoSm>
        </Animated.View>

        {/* Sections */}
        {SECTIONS.map((section, si) => (
          <Animated.View
            key={section.overline}
            entering={ENTER.fadeUp(stagger(si, 90, 160))}
            style={{ marginBottom: spacing['2xl'] }}
          >
            <Overline muted>{section.overline}</Overline>
            <BodySm
              italic
              family="serif"
              muted
              style={{ marginTop: 4, marginBottom: spacing.md }}
            >
              {section.caption}
            </BodySm>

            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border as string,
                borderRadius: radii.lg,
                overflow: 'hidden',
                backgroundColor: colors.card as string,
              }}
            >
              {section.routes.map((r, ri) => (
                <RouteRow
                  key={r.path}
                  route={r}
                  last={ri === section.routes.length - 1}
                  onPress={() => go(r.path)}
                />
              ))}
            </View>
          </Animated.View>
        ))}

        {/* Kicker */}
        <Animated.View
          entering={ENTER.fadeUp(SECTIONS.length * 90 + 300)}
          style={{ alignItems: 'center', marginTop: spacing.xl }}
        >
          <Mono muted align="center">
            keep the ledger.
          </Mono>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

function RouteRow({
  route,
  last,
  onPress,
}: {
  route: Route;
  last: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${route.title}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border as string,
        opacity: pressed ? 0.7 : 1,
        backgroundColor: pressed ? (colors.elevated as string) : 'transparent',
        gap: spacing.md,
      })}
    >
      <View style={{ flex: 1 }}>
        <TitleSm numberOfLines={1}>{route.title}</TitleSm>
        <MonoSm muted style={{ marginTop: 2 }} numberOfLines={1}>
          {route.path}
        </MonoSm>
        {route.note ? (
          <BodySm
            italic
            family="serif"
            muted
            style={{ marginTop: 4 }}
            numberOfLines={1}
          >
            {route.note}
          </BodySm>
        ) : null}
      </View>
      <Feather name="arrow-up-right" size={18} color={colors.mutedText as string} />
    </Pressable>
  );
}
