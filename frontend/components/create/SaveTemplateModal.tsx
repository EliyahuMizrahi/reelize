import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { BodySm, MonoSm, Overline, Title } from '@/components/ui/Text';
import { useAppTheme } from '@/contexts/ThemeContext';
import { palette, radii, spacing } from '@/constants/tokens';
import { createTemplateFromJob } from '@/data/mutations';
import type { Row } from '@/types/supabase';

export type SaveTemplateResult = {
  template: Row<'templates'>;
};

export function SaveTemplateModal({
  open,
  jobId,
  defaultName,
  onClose,
  onSaved,
}: {
  open: boolean;
  jobId: string | null;
  defaultName?: string | null;
  onClose: () => void;
  onSaved: (result: SaveTemplateResult) => void;
}) {
  const { colors } = useAppTheme();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset + seed on open.
  useEffect(() => {
    if (!open) return;
    setName((defaultName ?? '').trim());
    setDescription('');
    setErr(null);
    setBusy(false);
  }, [open, defaultName]);

  const canSave = !busy && !!jobId && name.trim().length >= 2;

  const submit = async () => {
    if (!canSave || !jobId) return;
    setBusy(true);
    setErr(null);
    try {
      const tpl = await createTemplateFromJob({
        jobId,
        classId: null,
        name: name.trim(),
        description: description.trim() || null,
      });
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
      onSaved({ template: tpl });
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
            Name it and we'll save the SFX, cuts, and style DNA so you can spin up new
            clips in the same shape later.
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
