import React, { useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import { Surface } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { IconButton } from '@/components/ui/IconButton';
import { Display2, Headline, Title, TitleSm, Body, BodySm, Mono, MonoSm, Overline, Text } from '@/components/ui/Text';
import { Shards } from '@/components/brand/Shards';
import { Waveform, PacingGraph } from '@/components/brand/Waveform';
import { StyleDNA, DEFAULT_DNA } from '@/components/brand/StyleDNA';
import { palette, spacing, radii, layout } from '@/constants/tokens';
import { ENTER, stagger } from '@/components/ui/motion';
import { useAppTheme } from '@/contexts/ThemeContext';

type TokenId = 'pacing' | 'cuts' | 'captions' | 'voice' | 'music' | 'visual';

interface PanelConfig {
  id: TokenId;
  label: string;
  overline: string;
  corner: 'tl' | 'tr' | 'ml' | 'mr' | 'bl' | 'br';
  visual: () => React.ReactNode;
}

// ───────────────────────── Steps indicator ─────────────────────────
function StepsIndicator({ step }: { step: number }) {
  const steps = ['01 SOURCE', '02 STYLE', '03 TOPIC', '04 GENERATE'];
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', flexWrap: 'wrap' }}>
      {steps.map((s, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: done ? palette.sage : active ? palette.tealBright : palette.inkBorder,
              }}
            />
            <Mono
              color={active ? palette.sage : done ? palette.teal : palette.inkBorder}
              style={{ opacity: active ? 1 : done ? 0.9 : 0.7 }}
            >
              {s}
            </Mono>
            {i < steps.length - 1 && <View style={{ width: 22, height: 1, backgroundColor: palette.inkBorder }} />}
          </View>
        );
      })}
    </View>
  );
}

// ───────────────────────── Step header ─────────────────────────
function StepHeader({ step }: { step: number }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing['2xl'],
        borderBottomWidth: 1,
        borderBottomColor: colors.border as string,
        gap: spacing.xl,
      }}
    >
      <View>
        <Overline muted>NEW LESSON</Overline>
        <Title style={{ marginTop: 4 }}>Compose</Title>
      </View>
      <StepsIndicator step={step} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <IconButton variant="filled" size={36} accessibilityLabel="Save draft">
          <Feather name="save" size={14} color={colors.text as string} />
        </IconButton>
      </View>
    </View>
  );
}

// ───────────────────────── Grid background ─────────────────────────
function GridBackground() {
  const dots = [];
  const rows = 14;
  const cols = 28;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dots.push(
        <View
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: `${(c / cols) * 100}%`,
            top: `${(r / rows) * 100}%`,
            width: 2,
            height: 2,
            borderRadius: 1,
            backgroundColor: palette.inkBorder,
            opacity: 0.35,
          }}
        />,
      );
    }
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {dots}
    </View>
  );
}

// ───────────────────────── Panel ─────────────────────────
interface LabPanelProps {
  cfg: PanelConfig;
  included: boolean;
  onToggle: () => void;
  style?: any;
}

function LabPanel({ cfg, included, onToggle, style }: LabPanelProps) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onToggle}
      style={({ hovered, pressed }: any) => [
        {
          width: 240,
          opacity: pressed ? 0.85 : 1,
          transform: [{ translateY: hovered ? -3 : 0 }],
          transitionProperty: 'transform' as any,
          transitionDuration: '180ms' as any,
        },
        style,
      ]}
    >
      <Surface
        padded={spacing.lg}
        radius="xl"
        bordered
        style={{
          gap: spacing.sm,
          backgroundColor: included ? (colors.card as string) : (colors.inputBackground as string),
          borderColor: included ? (palette.teal + '88') : (colors.border as string),
          opacity: included ? 1 : 0.7,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Overline muted={!included} color={included ? palette.sage : undefined}>
            {cfg.overline}
          </Overline>
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              borderWidth: 1.5,
              borderColor: included ? palette.sage : (colors.mutedText as string),
              backgroundColor: included ? palette.sage : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {included ? <Feather name="check" size={9} color={palette.ink} /> : null}
          </View>
        </View>
        <TitleSm>{cfg.label}</TitleSm>
        <View style={{ marginTop: spacing.xs }}>{cfg.visual()}</View>
      </Surface>
    </Pressable>
  );
}

// ───────────────────────── Create (web) ─────────────────────────
export default function CreateWebScreen() {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();

  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [included, setIncluded] = useState<Record<TokenId, boolean>>({
    pacing: true,
    cuts: true,
    captions: true,
    voice: true,
    music: false,
    visual: true,
  });

  const toggle = (id: TokenId) => setIncluded((s) => ({ ...s, [id]: !s[id] }));

  const currentStep = !url ? 0 : !topic ? 2 : 3;

  const panels: PanelConfig[] = [
    {
      id: 'pacing',
      label: 'Pacing',
      overline: 'A · PACING',
      corner: 'tl',
      visual: () => <PacingGraph width={200} height={48} color={palette.sage} />,
    },
    {
      id: 'cuts',
      label: 'Cuts',
      overline: 'B · CUTS',
      corner: 'tr',
      visual: () => <Waveform bars={28} height={48} color={palette.tealBright} seed={7} />,
    },
    {
      id: 'captions',
      label: 'Captions',
      overline: 'C · CAPTIONS',
      corner: 'ml',
      visual: () => (
        <View style={{ gap: 4 }}>
          <Text variant="title" family="serif" weight="bold" color={palette.sage}>
            wet.
          </Text>
          <Text variant="bodySm" family="mono" color={palette.teal}>
            word-by-word drop
          </Text>
        </View>
      ),
    },
    {
      id: 'voice',
      label: 'Voice',
      overline: 'D · VOICE',
      corner: 'mr',
      visual: () => <Waveform bars={28} height={48} color={palette.sageSoft} seed={19} speakers={Array.from({ length: 28 }).map((_, i) => (i % 7 < 4 ? 0 : 1))} />,
    },
    {
      id: 'music',
      label: 'Music',
      overline: 'E · MUSIC',
      corner: 'bl',
      visual: () => <PacingGraph width={200} height={48} color={palette.gold} points={Array.from({ length: 18 }).map((_, i) => 0.3 + 0.5 * Math.sin(i * 0.5))} />,
    },
    {
      id: 'visual',
      label: 'Visual',
      overline: 'F · PALETTE',
      corner: 'br',
      visual: () => (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[palette.tealDeep, palette.teal, palette.sage, palette.gold, palette.paper].map((c) => (
            <View key={c} style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: c, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }} />
          ))}
        </View>
      ),
    },
  ];

  const canvas = (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        position: 'relative',
      }}
    >
      <Surface
        bordered
        radius="2xl"
        padded={false}
        style={{
          width: 300,
          height: 540,
          backgroundColor: palette.ink,
          alignItems: 'center',
          justifyContent: 'center',
          borderColor: palette.inkBorder,
          overflow: 'hidden',
        }}
      >
        {!url ? (
          <View style={{ alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, width: '100%' }}>
            <Shards size={160} phase="assembled" color={palette.teal} />
            <Overline muted>DROP SOURCE</Overline>
            <TextField
              placeholder="paste a reel URL"
              variant="underline"
              font="mono"
              value={url}
              onChangeText={setUrl}
              containerStyle={{ width: 240 }}
            />
            <Button
              variant="ghost"
              size="sm"
              title="upload file"
              haptic={false}
              leading={<Feather name="upload" size={12} color={colors.text as string} />}
            />
          </View>
        ) : (
          <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
            <Shards size={180} phase="exploded" color={palette.sage} />
            <StyleDNA variant="medallion" size={160} showLabels={false} spinning tokens={DEFAULT_DNA} />
            <View style={{ paddingHorizontal: spacing.lg }}>
              <MonoSm color={palette.fog} style={{ textAlign: 'center' }}>
                deconstructing…
              </MonoSm>
            </View>
          </View>
        )}
      </Surface>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background as string }}>
      <StepHeader step={currentStep} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: spacing['2xl'], paddingHorizontal: spacing['2xl'], paddingBottom: 140 }}
      >
        <View style={{ position: 'relative', minHeight: 720 }}>
          <GridBackground />

          {/* Top panels row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg }}>
            <Animated.View entering={ENTER.fadeUp(stagger(0, 60, 40))}>
              <LabPanel cfg={panels[0]} included={included.pacing} onToggle={() => toggle('pacing')} />
            </Animated.View>
            <Animated.View entering={ENTER.fadeUp(stagger(1, 60, 40))}>
              <LabPanel cfg={panels[1]} included={included.cuts} onToggle={() => toggle('cuts')} />
            </Animated.View>
          </View>

          {/* Middle: panels + canvas */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.xl }}>
            <Animated.View entering={ENTER.fadeUp(stagger(2, 60, 40))}>
              <LabPanel cfg={panels[2]} included={included.captions} onToggle={() => toggle('captions')} />
            </Animated.View>

            {canvas}

            <Animated.View entering={ENTER.fadeUp(stagger(3, 60, 40))}>
              <LabPanel cfg={panels[3]} included={included.voice} onToggle={() => toggle('voice')} />
            </Animated.View>
          </View>

          {/* Bottom panels row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg }}>
            <Animated.View entering={ENTER.fadeUp(stagger(4, 60, 40))}>
              <LabPanel cfg={panels[4]} included={included.music} onToggle={() => toggle('music')} />
            </Animated.View>
            <Animated.View entering={ENTER.fadeUp(stagger(5, 60, 40))}>
              <LabPanel cfg={panels[5]} included={included.visual} onToggle={() => toggle('visual')} />
            </Animated.View>
          </View>
        </View>

        {/* Topic prompt */}
        <Animated.View entering={ENTER.fadeUp(600)} style={{ marginTop: spacing['4xl'], alignItems: 'center' }}>
          <View style={{ maxWidth: 720, width: '100%' }}>
            <Overline muted style={{ textAlign: 'center', marginBottom: spacing.md }}>
              03 · TOPIC
            </Overline>
            <TextField
              variant="editorial"
              font="serif"
              placeholder="What do you want to learn?"
              value={topic}
              onChangeText={setTopic}
              style={{ textAlign: 'center' }}
            />
            <BodySm italic family="serif" muted style={{ textAlign: 'center', marginTop: spacing.sm }}>
              one line. the topic sits in front of the style.
            </BodySm>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Bottom generate bar */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border as string,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing['2xl'],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.card as string,
          gap: spacing.lg,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap' }}>
          <Mono muted>{Object.values(included).filter(Boolean).length} / 6 tokens included</Mono>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(Object.keys(included) as TokenId[]).map((k) => (
              <View
                key={k}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: included[k] ? palette.sage : palette.inkBorder,
                }}
              />
            ))}
          </View>
        </View>
        <Button
          variant="shimmer"
          size="lg"
          title="Generate lesson"
          haptic={false}
          trailing={<Feather name="arrow-right" size={16} color={palette.ink} />}
          onPress={() =>
            window.alert(
              'Generation is available on mobile.\n\nOpen Reelize on your phone to run the full lesson pipeline — the web workbench is preview-only.',
            )
          }
          disabled={!url || !topic}
        />
      </View>
    </View>
  );
}
