import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { BodySm, MonoSm, Overline, Text, Title } from '@/components/ui/Text';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii, spacing } from '@/constants/tokens';
import { useClasses } from '@/data/hooks';
import { createTemplateFromJob } from '@/data/mutations';
import type { Row } from '@/types/supabase';

export type SaveTemplateResult = {
  template: Row<'templates'>;
  classId: string | null;
};

export function SaveTemplateModal({
  open,
  jobId,
  defaultName,
  defaultClassId,
  onClose,
  onSaved,
}: {
  open: boolean;
  jobId: string | null;
  defaultName?: string | null;
  defaultClassId?: string | null;
  onClose: () => void;
  onSaved: (result: SaveTemplateResult) => void;
}) {
  const { colors } = useAppTheme();
  const { data: classes } = useClasses();
  const classList = useMemo(() => classes ?? [], [classes]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [classId, setClassId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset + seed on open.
  useEffect(() => {
    if (!open) return;
    setName((defaultName ?? '').trim());
    setDescription('');
    setClassId(defaultClassId ?? classList[0]?.id ?? null);
    setErr(null);
    setBusy(false);
  }, [open, defaultName, defaultClassId, classList]);

  const canSave = !busy && !!jobId && name.trim().length >= 2;

  const submit = async () => {
    if (!canSave || !jobId) return;
    setBusy(true);
    setErr(null);
    try {
      const tpl = await createTemplateFromJob({
        jobId,
        classId,
        name: name.trim(),
        description: description.trim() || null,
      });
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
      onSaved({ template: tpl, classId });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(4,20,30,0.72)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.xl,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: '100%',
            maxWidth: 460,
            padding: spacing.xl,
            borderRadius: radii['2xl'],
            backgroundColor: colors.card as string,
            borderWidth: 1,
            borderColor: colors.border as string,
            gap: spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Overline muted>SAVE AS TEMPLATE</Overline>
            <IconButton
              variant="ghost"
              size={32}
              onPress={onClose}
              accessibilityLabel="Close"
            >
              <Feather name="x" size={14} color={colors.text as string} />
            </IconButton>
          </View>
          <Title family="serif" italic>
            Keep this recipe.
          </Title>
          <BodySm muted>
            Name it, file it in a course. We'll save the SFX, cuts, and style DNA so you
            can spin up new clips in the same shape later.
          </BodySm>

          <View style={{ gap: 6 }}>
            <Overline muted>NAME</Overline>
            <TextField
              variant="boxed"
              placeholder="e.g. Krebs Cycle, beat-sync explainer"
              value={name}
              onChangeText={setName}
              autoFocus
            />
          </View>

          <View style={{ gap: 6 }}>
            <Overline muted>COURSE</Overline>
            {classList.length === 0 ? (
              <BodySm muted>
                No courses yet — the template will be unfiled. Create one from Library to
                file it later.
              </BodySm>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
              >
                <Pressable
                  onPress={() => setClassId(null)}
                  style={({ pressed }) => ({
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: radii.pill,
                    borderWidth: 1,
                    borderColor:
                      classId === null
                        ? (colors.primary as string)
                        : (colors.border as string),
                    backgroundColor:
                      classId === null
                        ? (colors.primary as string) + '22'
                        : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    variant="bodySm"
                    weight="medium"
                    color={
                      classId === null
                        ? (colors.primary as string)
                        : (colors.mutedText as string)
                    }
                  >
                    Unfiled
                  </Text>
                </Pressable>
                {classList.map((c) => {
                  const active = c.id === classId;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setClassId(c.id)}
                      style={({ pressed }) => ({
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: radii.pill,
                        borderWidth: 1,
                        borderColor: active ? c.color_hex : (colors.border as string),
                        backgroundColor: active ? c.color_hex + '22' : 'transparent',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          backgroundColor: c.color_hex,
                        }}
                      />
                      <Text
                        variant="bodySm"
                        weight="medium"
                        color={
                          active ? (colors.text as string) : (colors.mutedText as string)
                        }
                      >
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <View style={{ gap: 6 }}>
            <Overline muted>DESCRIPTION · OPTIONAL</Overline>
            <TextField
              variant="boxed"
              placeholder="What kind of clip does this produce?"
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </View>

          {err ? <MonoSm color={palette.alert}>{err}</MonoSm> : null}

          <View
            style={{
              flexDirection: 'row',
              gap: spacing.sm,
              marginTop: spacing.sm,
              justifyContent: 'flex-end',
            }}
          >
            <Button
              variant="tertiary"
              size="md"
              title="Cancel"
              onPress={onClose}
              disabled={busy}
            />
            <Button
              variant="shimmer"
              size="md"
              title={busy ? 'Saving…' : 'Save template'}
              onPress={submit}
              disabled={!canSave}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
