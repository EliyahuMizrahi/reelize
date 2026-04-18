import React, { useEffect } from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Text } from '@/components/ui/Text';
import { palette } from '@/constants/tokens';
import { useAppTheme } from '@/contexts/ThemeContext';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

export type DNAGlyph = 'pacing' | 'cuts' | 'captions' | 'voice' | 'music' | 'visual';

export interface DNAToken {
  id: string;
  label: string;
  intensity: number; // 0..1
  glyph?: DNAGlyph;
}

interface StyleDNAProps {
  tokens?: DNAToken[];
  size?: number;
  style?: ViewStyle;
  showLabels?: boolean;
  spinning?: boolean;
  variant?: 'full' | 'medallion' | 'icon';
  color?: string;
}

export const DEFAULT_DNA: DNAToken[] = [
  { id: 'pacing', label: 'Pacing', intensity: 0.78, glyph: 'pacing' },
  { id: 'cuts', label: 'Cuts', intensity: 0.92, glyph: 'cuts' },
  { id: 'captions', label: 'Captions', intensity: 0.64, glyph: 'captions' },
  { id: 'voice', label: 'Voice', intensity: 0.71, glyph: 'voice' },
  { id: 'music', label: 'Music', intensity: 0.55, glyph: 'music' },
  { id: 'visual', label: 'Visual', intensity: 0.83, glyph: 'visual' },
];

/**
 * Style DNA — orbital diagram showing 6 style tokens extracted from a source.
 * Appears at 3 sizes: full (analysis screens), medallion (~120px), icon (<48px corner badge).
 */
export function StyleDNA({
  tokens = DEFAULT_DNA,
  size = 240,
  style,
  showLabels = true,
  spinning = false,
  variant = 'full',
  color,
}: StyleDNAProps) {
  const { colors } = useAppTheme();
  const rot = useSharedValue(0);

  useEffect(() => {
    if (spinning) {
      rot.value = withRepeat(withTiming(1, { duration: 24000, easing: Easing.linear }), -1);
    }
  }, [spinning]);

  const spinProps = useAnimatedProps(() => ({
    transform: `rotate(${rot.value * 360} ${size / 2} ${size / 2})`,
  }));

  const cx = size / 2;
  const cy = size / 2;
  const ringR = size * (variant === 'icon' ? 0.42 : 0.38);
  const tokenR = size * (variant === 'icon' ? 0.075 : 0.055);

  const tokenPos = tokens.map((tk, i) => {
    const angle = (i / tokens.length) * Math.PI * 2 - Math.PI / 2;
    return {
      x: cx + ringR * Math.cos(angle),
      y: cy + ringR * Math.sin(angle),
      angle,
      token: tk,
    };
  });

  const accent = color ?? palette.sage;
  const deep = palette.teal;
  const ringStroke = variant === 'icon' ? 0.8 : 1;

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id="dnaCore" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.sageSoft} />
            <Stop offset="1" stopColor={palette.teal} />
          </LinearGradient>
          <LinearGradient id="dnaGlow" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.sage} stopOpacity={0.4} />
            <Stop offset="1" stopColor={palette.teal} stopOpacity={0.9} />
          </LinearGradient>
        </Defs>

        <AnimatedG animatedProps={spinProps}>
          {/* outer dashed ring */}
          <Circle
            cx={cx}
            cy={cy}
            r={ringR}
            stroke={colors.border as string}
            strokeWidth={ringStroke}
            strokeDasharray="2 4"
            fill="none"
          />
          {/* inner tick ring */}
          <Circle
            cx={cx}
            cy={cy}
            r={ringR * 0.82}
            stroke={deep}
            strokeWidth={0.5}
            fill="none"
            opacity={0.45}
          />

          {/* radial intensity rays */}
          {tokenPos.map((p, i) => (
            <Line
              key={`ray-${i}`}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke={accent}
              strokeWidth={0.5}
              opacity={0.22 + p.token.intensity * 0.28}
            />
          ))}

          {/* hexagonal connector polygon */}
          {tokenPos.map((p, i) => {
            const next = tokenPos[(i + 1) % tokenPos.length];
            return (
              <Line
                key={`edge-${i}`}
                x1={p.x}
                y1={p.y}
                x2={next.x}
                y2={next.y}
                stroke={deep}
                strokeWidth={0.8}
                opacity={0.35}
              />
            );
          })}

          {/* tokens */}
          {tokenPos.map((p, i) => (
            <G key={`tk-${i}`}>
              {/* halo */}
              <Circle
                cx={p.x}
                cy={p.y}
                r={tokenR * (1.1 + p.token.intensity * 0.8)}
                fill="url(#dnaGlow)"
                opacity={0.22}
              />
              <Circle cx={p.x} cy={p.y} r={tokenR * 0.9} fill={accent} />
              <Circle cx={p.x} cy={p.y} r={tokenR * 0.55} fill={palette.ink} />
              <Circle cx={p.x} cy={p.y} r={tokenR * 0.22} fill={accent} />
            </G>
          ))}
        </AnimatedG>

        {/* stationary center core */}
        <Circle cx={cx} cy={cy} r={size * 0.09} fill={palette.ink} opacity={0.95} />
        <Circle cx={cx} cy={cy} r={size * 0.07} fill="url(#dnaCore)" opacity={0.9} />
        <Circle cx={cx} cy={cy} r={size * 0.022} fill={palette.ink} />
      </Svg>

      {showLabels && variant !== 'icon' && (
        <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="none">
          {tokenPos.map((p, i) => {
            const labelOffset = tokenR * 3.2;
            const labelX = cx + (ringR + labelOffset) * Math.cos(p.angle) - 36;
            const labelY = cy + (ringR + labelOffset) * Math.sin(p.angle) - 7;
            return (
              <View
                key={`lbl-${i}`}
                style={{
                  position: 'absolute',
                  left: labelX,
                  top: labelY,
                  width: 72,
                  alignItems: 'center',
                }}
              >
                <Text variant="overline" muted>{p.token.label}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
