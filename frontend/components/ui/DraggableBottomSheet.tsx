import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { palette, radii } from '@/constants/tokens';
import { useAppTheme } from '@/contexts/ThemeContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  heightRatio?: number;
  children: React.ReactNode;
  keyboardOffsetRatio?: number;
  backgroundColor?: string;
  accentColor?: string;
  dragZoneHeight?: number;
  backdropOpacity?: number;
  disableBackdropClose?: boolean;
  stickyHeader?: React.ReactNode;
  scrollable?: boolean;
}

// Drag-to-close bottom sheet. Pan the handle down past 35% of the sheet
// height (or with velocity > 500) to dismiss. Tap the scrim to dismiss.
// Backdrop scrim fades independently of the sheet's slide, so the shadow
// doesn't pop up/down with the sheet.
export default function DraggableBottomSheet({
  visible,
  onClose,
  heightRatio = 0.88,
  children,
  keyboardOffsetRatio = 0,
  backgroundColor,
  accentColor,
  dragZoneHeight = 36,
  backdropOpacity = 0.55,
  disableBackdropClose = false,
  stickyHeader,
  scrollable = true,
}: Props) {
  const { colors } = useAppTheme();
  const bg = backgroundColor ?? (colors.background as string) ?? (palette.ink as string);
  const accent = accentColor ?? (colors.primary as string) ?? (palette.teal as string);

  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const SHEET_HEIGHT = Math.round(
    Math.max(0, Math.min(1, heightRatio)) * SCREEN_HEIGHT,
  );

  const isClosing = useSharedValue(false);
  const translateY = useSharedValue(SHEET_HEIGHT);
  const backdropOpacityValue = useSharedValue(0);
  const baseY = useSharedValue(0);
  const keyboardLift = useSharedValue(0);

  const hasBeenVisible = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const [isModalVisible, setIsModalVisible] = useState(false);

  const animateTo = (
    toValue: number,
    easing: (t: number) => number,
    onComplete?: () => void,
  ) => {
    translateY.value = withTiming(
      toValue,
      { duration: 260, easing },
      (finished) => {
        if (finished && onComplete) runOnJS(onComplete)();
      },
    );
  };

  const hideModalAndNotify = () => {
    setIsModalVisible(false);
    onClose();
  };

  const performCloseWorklet = () => {
    'worklet';
    if (isClosing.value) return;
    isClosing.value = true;

    keyboardLift.value = 0;
    baseY.value = SHEET_HEIGHT;
    translateY.value = withTiming(
      SHEET_HEIGHT,
      { duration: 260, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(hideModalAndNotify)();
      },
    );
    backdropOpacityValue.value = withTiming(0, {
      duration: 260,
      easing: Easing.in(Easing.cubic),
    });
  };

  const performClose = () => {
    Keyboard.dismiss();
    runOnUI(performCloseWorklet)();
  };

  useEffect(() => {
    if (visible) {
      setIsModalVisible(true);
      hasBeenVisible.current = true;
      isClosing.value = false;

      baseY.value = 0;
      keyboardLift.value = 0;
      translateY.value = SHEET_HEIGHT;

      backdropOpacityValue.value = withTiming(backdropOpacity, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      });

      const id = setTimeout(() => {
        const target = baseY.value + keyboardLift.value;
        animateTo(target, Easing.out(Easing.cubic));
      }, 16);
      return () => clearTimeout(id);
    } else if (hasBeenVisible.current) {
      performClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, SHEET_HEIGHT, backdropOpacity]);

  const pushUpForKeyboard = (e: KeyboardEvent) => {
    if (!visibleRef.current || isClosing.value) return;
    const lift = -Math.round(
      e.endCoordinates.height *
        Math.max(0, Math.min(1, keyboardOffsetRatio)),
    );
    keyboardLift.value = lift;
    animateTo(baseY.value + lift, Easing.out(Easing.cubic));
  };

  const resetForKeyboard = () => {
    keyboardLift.value = 0;
    if (visibleRef.current && !isClosing.value) {
      animateTo(baseY.value, Easing.out(Easing.cubic));
    }
  };

  useEffect(() => {
    if (keyboardOffsetRatio <= 0) return;
    const showEvt =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, pushUpForKeyboard);
    const h = Keyboard.addListener(hideEvt, resetForKeyboard);
    return () => {
      s.remove();
      h.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardOffsetRatio, visible]);

  const panGesture = Gesture.Pan()
    .maxPointers(1)
    .activeOffsetY(5)
    .onUpdate((event) => {
      'worklet';
      if (event.translationY <= 0) return;
      const currentPos = baseY.value + keyboardLift.value;
      const newPos = currentPos + event.translationY;
      translateY.value = Math.max(currentPos, Math.min(newPos, SHEET_HEIGHT));
    })
    .onEnd((event) => {
      'worklet';
      const currentPos = baseY.value + keyboardLift.value;
      const closeThreshold = SHEET_HEIGHT * 0.35;
      const velocityThreshold = 500;
      if (
        translateY.value > closeThreshold ||
        event.velocityY > velocityThreshold
      ) {
        performCloseWorklet();
      } else {
        translateY.value = withTiming(currentPos, {
          duration: 260,
          easing: Easing.out(Easing.cubic),
        });
      }
    });

  const handleBackdropPress = () => {
    if (disableBackdropClose) return;
    performClose();
  };

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacityValue.value,
  }));

  const animatedBackdropPointerEvents = useAnimatedStyle(() => {
    const shouldDisable = backdropOpacityValue.value < 0.1 || isClosing.value;
    return {
      pointerEvents: shouldDisable ? 'none' : 'auto',
    } as const;
  });

  return (
    <Modal
      transparent
      visible={isModalVisible}
      animationType="none"
      onRequestClose={performClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          style={[
            { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,1)' },
            animatedBackdropStyle,
            animatedBackdropPointerEvents,
          ]}
        >
          <Pressable onPress={handleBackdropPress} style={{ flex: 1 }} />
        </Animated.View>

        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <Animated.View
            style={[
              {
                height: SHEET_HEIGHT,
                maxHeight: SHEET_HEIGHT,
                width: '100%',
                backgroundColor: bg,
                borderTopLeftRadius: radii['2xl'],
                borderTopRightRadius: radii['2xl'],
                borderTopColor: accent,
                borderTopWidth: 2,
                overflow: 'hidden',
              },
              animatedSheetStyle,
            ]}
          >
            <GestureDetector gesture={panGesture}>
              <Animated.View
                style={{
                  height: dragZoneHeight,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingTop: 10,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: accent,
                    opacity: 0.7,
                  }}
                />
              </Animated.View>
            </GestureDetector>

            {stickyHeader ? (
              <View style={{ flexShrink: 0 }}>{stickyHeader}</View>
            ) : null}

            <View style={{ flex: 1 }}>
              {scrollable ? (
                <ScrollView
                  style={{ flex: 1 }}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  keyboardShouldPersistTaps="handled"
                  bounces
                  scrollEventThrottle={16}
                >
                  {children}
                </ScrollView>
              ) : (
                children
              )}
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
