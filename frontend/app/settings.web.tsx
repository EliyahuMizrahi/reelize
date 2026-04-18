import React, { useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Switch,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import { Surface, Divider } from '@/components/ui/Surface';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Chip } from '@/components/ui/Chip';
import { TextField } from '@/components/ui/TextField';
import { WebSidebar } from '@/components/navigation/WebSidebar';
import { Title, TitleSm, Body, BodySm, Mono, MonoSm, Overline, Headline, Text } from '@/components/ui/Text';
import { Noctis, NoctisLockup } from '@/components/brand/Noctis';
import { palette, spacing, radii } from '@/constants/tokens';
import { ENTER } from '@/components/ui/motion';
import { useAppTheme, type PaletteName } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

type SectionKey = 'account' | 'appearance' | 'notifications' | 'data' | 'about';

interface SectionNavItem {
  key: SectionKey;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  hint: string;
}

const NAV: SectionNavItem[] = [
  { key: 'account', label: 'Account', icon: 'user', hint: 'who you are' },
  { key: 'appearance', label: 'Appearance', icon: 'feather', hint: 'how it looks' },
  { key: 'notifications', label: 'Notifications', icon: 'bell', hint: 'when we speak' },
  { key: 'data', label: 'Data', icon: 'database', hint: 'what we store' },
  { key: 'about', label: 'About', icon: 'info', hint: 'the story' },
];

// ───────────────────────── Row helpers ─────────────────────────
function Row({
  title,
  hint,
  right,
  onPress,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const { colors } = useAppTheme();
  const Container: any = onPress ? Pressable : View;
  return (
    <Container
      onPress={onPress}
      style={({ hovered }: any) => ({
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.lg,
        backgroundColor: hovered && onPress ? ((colors.elevated as string) + '') : 'transparent',
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Body weight="semibold">{title}</Body>
        {hint ? <BodySm muted>{hint}</BodySm> : null}
      </View>
      {right}
    </Container>
  );
}

function ToggleRight({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: palette.inkBorder, true: palette.sage }}
      thumbColor={palette.mist}
    />
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Overline muted style={{ marginBottom: spacing.md, marginLeft: spacing.xl }}>{title}</Overline>
      <Surface padded={0} radius="xl" bordered style={{ overflow: 'hidden' }}>
        {children}
      </Surface>
    </View>
  );
}

// ───────────────────────── Account ─────────────────────────
function AccountSection() {
  const { colors } = useAppTheme();
  const { logout, user } = useAuth();
  const [email, setEmail] = useState(user?.email ?? '');
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <View style={{ gap: spacing['2xl'] }}>
      <Headline>Account</Headline>

      <SectionBlock title="IDENTITY">
        <View style={{ padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.xl }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: palette.ink,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.border as string,
            }}
          >
            <Noctis variant="head" size={44} color={palette.mist} eyeColor={palette.sage} />
          </View>
          <View style={{ flex: 1 }}>
            <Title>isaac.s</Title>
            <BodySm muted>joined march 2026 &middot; 56 clips generated</BodySm>
          </View>
          <Button variant="ghost" size="sm" title="Change avatar" haptic={false} />
        </View>
        <Divider />
        <View style={{ padding: spacing.xl, gap: spacing.lg }}>
          <TextField label="Email" value={email} onChangeText={setEmail} />
          <TextField label="Username" value="isaac.s" />
        </View>
      </SectionBlock>

      <SectionBlock title="PLAN">
        <Row
          title="Student"
          hint="$6 / month · renews may 2, 2026"
          right={<Chip label="active" variant="outline" size="sm" />}
        />
        <Divider />
        <Row
          title="Manage billing"
          hint="invoices, payment method, trial status"
          right={<Feather name="external-link" size={14} color={palette.teal} />}
          onPress={() => {}}
        />
        <Divider />
        <Row title="Switch plan" hint="try Scholar, or step back to Free" onPress={() => {}} right={<Feather name="chevron-right" size={16} color={palette.teal} />} />
      </SectionBlock>

      <SectionBlock title="DANGER">
        <Row
          title={isSigningOut ? 'Signing out…' : 'Sign out'}
          hint="you can come back any time"
          onPress={handleSignOut}
          right={<Feather name="log-out" size={14} color={palette.teal} />}
        />
        <Divider />
        <Row
          title="Delete account"
          hint="permanent. your shelf goes with it."
          onPress={() => {}}
          right={<Feather name="trash-2" size={14} color={palette.alert} />}
        />
      </SectionBlock>
    </View>
  );
}

// ───────────────────────── Appearance ─────────────────────────
function AppearanceSection() {
  const { isDark, toggleTheme, palette: pal, setPalette } = useAppTheme();

  return (
    <View style={{ gap: spacing['2xl'] }}>
      <Headline>Appearance</Headline>

      <SectionBlock title="THEME">
        <Row
          title="Dark mode"
          hint="ink-first. the shelf is quieter at night."
          right={<ToggleRight value={isDark} onChange={toggleTheme} />}
        />
        <Divider />
        <View style={{ padding: spacing.xl, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Body weight="semibold">Palette</Body>
              <BodySm muted>choose the background hue.</BodySm>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {(['sage', 'slate'] as PaletteName[]).map((p) => {
              const active = pal === p;
              return (
                <Pressable key={p} onPress={() => setPalette(p)} style={{ flex: 1 }}>
                  <Surface
                    padded={spacing.lg}
                    bordered
                    radius="lg"
                    style={{
                      gap: 8,
                      borderColor: active ? palette.sage : undefined,
                      borderWidth: active ? 1.5 : 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {(p === 'sage'
                        ? ['#04141E', '#44706F', '#8BBAB1', '#CED9D7']
                        : ['#02060F', '#3F566E', '#91A5B8', '#CDD7DE']
                      ).map((c) => (
                        <View key={c} style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: c }} />
                      ))}
                    </View>
                    <BodySm weight="semibold">{p === 'sage' ? 'Sage' : 'Slate'}</BodySm>
                    <MonoSm muted>{p === 'sage' ? 'warm · organic' : 'cool · crisp'}</MonoSm>
                  </Surface>
                </Pressable>
              );
            })}
          </View>
        </View>
      </SectionBlock>

      <SectionBlock title="READING">
        <Row
          title="Reduce motion"
          hint="fewer animations, shorter transitions."
          right={<ToggleRight value={false} onChange={() => {}} />}
        />
        <Divider />
        <Row
          title="Caption size"
          hint="how player captions set in the video frame."
          right={
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <Chip label="S" variant="outline" size="sm" />
              <Chip label="M" variant="outline" selected size="sm" />
              <Chip label="L" variant="outline" size="sm" />
            </View>
          }
        />
      </SectionBlock>
    </View>
  );
}

// ───────────────────────── Notifications ─────────────────────────
function NotificationsSection() {
  const [s, setS] = useState({
    generationDone: true,
    streakReminder: false,
    weeklyDigest: true,
    newFeatures: false,
  });
  const upd = (k: keyof typeof s) => (v: boolean) => setS((prev) => ({ ...prev, [k]: v }));

  return (
    <View style={{ gap: spacing['2xl'] }}>
      <Headline>Notifications</Headline>

      <SectionBlock title="EVENTS">
        <Row
          title="Lesson ready"
          hint="when a generation finishes."
          right={<ToggleRight value={s.generationDone} onChange={upd('generationDone')} />}
        />
        <Divider />
        <Row
          title="Streak reminder"
          hint="a single nudge, once a day, before bed."
          right={<ToggleRight value={s.streakReminder} onChange={upd('streakReminder')} />}
        />
      </SectionBlock>

      <SectionBlock title="DIGEST">
        <Row
          title="Weekly digest"
          hint="sunday mornings. what you kept, what you didn't."
          right={<ToggleRight value={s.weeklyDigest} onChange={upd('weeklyDigest')} />}
        />
        <Divider />
        <Row
          title="New features"
          hint="rare. we promise."
          right={<ToggleRight value={s.newFeatures} onChange={upd('newFeatures')} />}
        />
      </SectionBlock>
    </View>
  );
}

// ───────────────────────── Data ─────────────────────────
function DataSection() {
  return (
    <View style={{ gap: spacing['2xl'] }}>
      <Headline>Data</Headline>

      <SectionBlock title="STORAGE">
        <View style={{ padding: spacing.xl, gap: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Body weight="semibold">Local library</Body>
              <BodySm muted>clips, transcripts, notes</BodySm>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Mono>124 MB</Mono>
              <MonoSm muted>of 5 GB</MonoSm>
            </View>
          </View>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: palette.inkBorder, overflow: 'hidden' }}>
            <View style={{ width: '2.5%', height: '100%', backgroundColor: palette.sage }} />
          </View>
        </View>
      </SectionBlock>

      <SectionBlock title="EXPORT">
        <Row title="Export shelf" hint="zip of clips, notes, and metadata" onPress={() => {}} right={<Feather name="download" size={14} color={palette.teal} />} />
        <Divider />
        <Row title="Export transcripts only" hint="plain markdown, per class" onPress={() => {}} right={<Feather name="file-text" size={14} color={palette.teal} />} />
      </SectionBlock>

      <SectionBlock title="PRIVACY">
        <Row
          title="Keep sources off the cloud"
          hint="we don't store the reel URL, only the extracted Style DNA."
          right={<ToggleRight value={true} onChange={() => {}} />}
        />
        <Divider />
        <Row
          title="Clear cached previews"
          hint="frees up thumbnails and generation drafts."
          onPress={() => {}}
          right={<Feather name="trash" size={14} color={palette.teal} />}
        />
      </SectionBlock>
    </View>
  );
}

// ───────────────────────── About ─────────────────────────
function AboutSection() {
  return (
    <View style={{ gap: spacing['2xl'] }}>
      <Headline>About</Headline>

      <SectionBlock title="BUILD">
        <View style={{ padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.xl }}>
          <NoctisLockup size={40} color={palette.mist} eyeColor={palette.sage} />
          <View style={{ flex: 1 }}>
            <Mono>v 0.4.2 · build 212</Mono>
            <BodySm muted style={{ marginTop: 2 }}>tuesday, april 15, 2026</BodySm>
          </View>
        </View>
      </SectionBlock>

      <SectionBlock title="LINKS">
        <Row title="Changelog" hint="what changed recently" onPress={() => {}} right={<Feather name="external-link" size={14} color={palette.teal} />} />
        <Divider />
        <Row title="The notebook" hint="the long-form blog" onPress={() => {}} right={<Feather name="external-link" size={14} color={palette.teal} />} />
        <Divider />
        <Row title="Terms" onPress={() => {}} right={<Feather name="external-link" size={14} color={palette.teal} />} />
        <Divider />
        <Row title="Privacy" onPress={() => {}} right={<Feather name="external-link" size={14} color={palette.teal} />} />
      </SectionBlock>

      <Surface padded={spacing.xl} radius="xl" style={{ alignItems: 'center', gap: spacing.md }}>
        <Noctis variant="perched" size={80} color={palette.mist} eyeColor={palette.sage} />
        <BodySm italic family="serif" muted style={{ textAlign: 'center', maxWidth: 360 }}>
          &ldquo;Noctis knows where the good ones are. He won&rsquo;t tell anyone else.&rdquo;
        </BodySm>
        <MonoSm muted>&mdash; from the notebook</MonoSm>
      </Surface>
    </View>
  );
}

// ───────────────────────── Layout ─────────────────────────
function NavRail({ active, setActive }: { active: SectionKey; setActive: (k: SectionKey) => void }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ width: 260, gap: spacing.lg }}>
      <View>
        <Mono muted>Settings</Mono>
        <Title style={{ marginTop: 4 }}>Preferences.</Title>
        <BodySm italic family="serif" muted style={{ marginTop: 4 }}>
          small choices, quietly kept.
        </BodySm>
      </View>
      <View style={{ gap: 4 }}>
        {NAV.map((n) => {
          const isActive = active === n.key;
          return (
            <Pressable
              key={n.key}
              onPress={() => setActive(n.key)}
              style={({ hovered }: any) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: radii.pill,
                backgroundColor: isActive ? ((colors.primary as string) + '22') : hovered ? (colors.elevated as string) : 'transparent',
              })}
            >
              <Feather name={n.icon} size={14} color={isActive ? (colors.primary as string) : (colors.mutedText as string)} />
              <View style={{ flex: 1 }}>
                <BodySm weight={isActive ? 'semibold' : 'medium'} color={isActive ? (colors.primary as string) : (colors.text as string)}>
                  {n.label}
                </BodySm>
                <MonoSm muted style={{ marginTop: 1 }}>{n.hint}</MonoSm>
              </View>
              {isActive ? <Feather name="chevron-right" size={12} color={colors.primary as string} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ───────────────────────── Settings (web) ─────────────────────────
export default function SettingsWebScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [active, setActive] = useState<SectionKey>('account');

  const content = (() => {
    switch (active) {
      case 'account':
        return <AccountSection />;
      case 'appearance':
        return <AppearanceSection />;
      case 'notifications':
        return <NotificationsSection />;
      case 'data':
        return <DataSection />;
      case 'about':
        return <AboutSection />;
    }
  })();

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background as string }}>
      <WebSidebar onNewVideo={() => router.push('/(tabs)/create' as any)} />
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: spacing.lg,
            paddingHorizontal: spacing['2xl'],
            borderBottomWidth: 1,
            borderBottomColor: colors.border as string,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Mono muted>Shelf</Mono>
            <Mono muted>/</Mono>
            <Mono>Settings</Mono>
          </View>
          <IconButton variant="filled" size={36} onPress={() => router.back()} accessibilityLabel="Close settings">
            <Feather name="x" size={14} color={colors.text as string} />
          </IconButton>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], paddingBottom: spacing['5xl'] }}>
          <View style={{ flexDirection: 'row', gap: spacing['3xl'], alignItems: 'flex-start', maxWidth: 1080, alignSelf: 'center', width: '100%' }}>
            <Animated.View entering={ENTER.fadeUp(40)}>
              <NavRail active={active} setActive={setActive} />
            </Animated.View>
            <Animated.View entering={ENTER.fadeUp(120)} style={{ flex: 1, minWidth: 0 }}>
              {content}
            </Animated.View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
