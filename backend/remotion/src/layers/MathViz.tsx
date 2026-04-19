import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { VizScene } from '../types';

// ── Pythagorean visualization. Scene boundaries anchored to the 11
// narration turns (new-timeline seconds). Each scene mounts inside a
// white card so the content reads over any background footage.

interface Props {
  items: VizScene[];
  fps: number;
}

const FONT =
  '"Inter", "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif';

const COLOR_A = '#2563EB';   // blue — leg a
const COLOR_B = '#EA580C';   // orange — leg b
const COLOR_C = '#DB2777';   // pink — hypotenuse c
const COLOR_INK = '#0B1220';
const CARD_BG = '#FFFFFF';
const CARD_SHADOW = '0 16px 48px rgba(0,0,0,0.35)';

function usePop(fps: number, delay = 0) {
  const frame = useCurrentFrame();
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 180 },
  });
  const scale = 0.7 + 0.3 * s;
  const opacity = interpolate(s, [0, 1], [0, 1], { extrapolateRight: 'clamp' });
  return { scale, opacity, s };
}

// ── white card wrapping the scene content ──────────────────────────────
const Card: React.FC<{ children: React.ReactNode; wide?: boolean }> = ({
  children,
  wide,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const intro = spring({ frame, fps, config: { damping: 18, stiffness: 140 } });
  const scale = 0.94 + 0.06 * intro;
  const opacity = interpolate(intro, [0, 1], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 140,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: CARD_BG,
          borderRadius: 36,
          padding: '32px 44px',
          boxShadow: CARD_SHADOW,
          minWidth: wide ? 820 : 680,
          maxWidth: 940,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          transform: `scale(${scale})`,
          opacity,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

// ── core triangle SVG used across almost every scene ───────────────────
interface TriangleProps {
  a: string;
  b: string;
  c: string;
  aColor?: string;
  bColor?: string;
  cColor?: string;
  cPulse?: boolean;
  drawFrom?: number; // frame offset within the current <Sequence>
}

const Triangle: React.FC<TriangleProps> = ({
  a,
  b,
  c,
  aColor = COLOR_A,
  bColor = COLOR_B,
  cColor = COLOR_C,
  cPulse = false,
  drawFrom = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const draw = spring({
    frame: frame - drawFrom,
    fps,
    config: { damping: 30, stiffness: 90 },
  });

  // right triangle, vertex at (120,380), 300 vertical leg, 340 horizontal leg
  const verticalLen = 300;
  const horizontalLen = 340;
  const hypLen = Math.sqrt(verticalLen ** 2 + horizontalLen ** 2);

  const pulse = cPulse
    ? 1 + 0.06 * Math.sin(((frame - drawFrom) / fps) * 6)
    : 1;

  return (
    <svg width={560} height={440} viewBox="0 0 560 440" style={{ display: 'block' }}>
      {/* vertical leg (a) */}
      <line
        x1={120}
        y1={380}
        x2={120}
        y2={80}
        stroke={aColor}
        strokeWidth={12}
        strokeLinecap="round"
        strokeDasharray={verticalLen}
        strokeDashoffset={interpolate(draw, [0, 1], [verticalLen, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })}
      />
      {/* horizontal leg (b) */}
      <line
        x1={120}
        y1={380}
        x2={460}
        y2={380}
        stroke={bColor}
        strokeWidth={12}
        strokeLinecap="round"
        strokeDasharray={horizontalLen}
        strokeDashoffset={interpolate(draw, [0.35, 1], [horizontalLen, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })}
      />
      {/* hypotenuse (c) */}
      <line
        x1={120}
        y1={80}
        x2={460}
        y2={380}
        stroke={cColor}
        strokeWidth={12}
        strokeLinecap="round"
        strokeDasharray={hypLen}
        strokeDashoffset={interpolate(draw, [0.65, 1], [hypLen, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })}
      />
      {/* right-angle marker */}
      <rect
        x={120}
        y={360}
        width={22}
        height={22}
        fill="none"
        stroke={COLOR_INK}
        strokeWidth={3}
        opacity={interpolate(draw, [0.55, 1], [0, 0.8], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })}
      />
      {/* label a (left of vertical leg) */}
      <text
        x={72}
        y={236}
        fill={aColor}
        fontFamily={FONT}
        fontWeight={900}
        fontSize={58}
        textAnchor="middle"
        opacity={interpolate(draw, [0.2, 0.6], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })}
      >
        {a}
      </text>
      {/* label b (below horizontal leg) */}
      <text
        x={290}
        y={432}
        fill={bColor}
        fontFamily={FONT}
        fontWeight={900}
        fontSize={58}
        textAnchor="middle"
        opacity={interpolate(draw, [0.5, 0.85], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })}
      >
        {b}
      </text>
      {/* label c (middle of hypotenuse) */}
      <g transform={`translate(330 206) scale(${pulse})`}>
        <text
          x={0}
          y={0}
          fill={cColor}
          fontFamily={FONT}
          fontWeight={900}
          fontSize={58}
          textAnchor="middle"
          opacity={interpolate(draw, [0.7, 1], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })}
        >
          {c}
        </text>
      </g>
    </svg>
  );
};

// ── small equation chip ─────────────────────────────────────────────────
const Chip: React.FC<{
  text: string;
  color?: string;
  big?: boolean;
  delay?: number;
}> = ({ text, color = COLOR_INK, big = false, delay = 0 }) => {
  const { fps } = useVideoConfig();
  const { scale, opacity } = usePop(fps, delay);
  return (
    <div
      style={{
        fontFamily: FONT,
        fontWeight: 900,
        fontSize: big ? 96 : 60,
        color,
        letterSpacing: big ? 2 : 1,
        transform: `scale(${scale})`,
        opacity,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
};

// ── square-of-n grid (visualizes n²) ───────────────────────────────────
const SquareGrid: React.FC<{ n: number; color: string; delay?: number }> = ({
  n,
  color,
  delay = 0,
}) => {
  const { fps } = useVideoConfig();
  const { scale, opacity } = usePop(fps, delay);
  const cellPx = 28;
  const gap = 4;
  const sidePx = n * cellPx + (n - 1) * gap;
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      cells.push(
        <div
          key={`c${x}${y}`}
          style={{
            width: cellPx,
            height: cellPx,
            background: color,
            borderRadius: 4,
          }}
        />,
      );
    }
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${n}, ${cellPx}px)`,
          gap,
          padding: 8,
          background: '#F1F5F9',
          borderRadius: 12,
        }}
      >
        {cells}
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 36,
          color,
        }}
      >
        {`${n}² = ${n * n}`}
      </div>
    </div>
  );
};

// ── scenes, one per narration turn ─────────────────────────────────────

// T0 — "Right triangle. Two legs. One hypotenuse. The oldest puzzle in geometry."
const SceneTriangleIntro: React.FC = () => (
  <Card>
    <Triangle a="a" b="b" c="c" />
  </Card>
);

// T1 — "If a-squared plus b-squared holds, everything snaps into place."
const SceneFormula: React.FC = () => {
  const { fps } = useVideoConfig();
  const { scale, opacity } = usePop(fps, 10);
  return (
    <Card wide>
      <Triangle a="a" b="b" c="c" />
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 72,
          color: COLOR_INK,
          transform: `scale(${scale})`,
          opacity,
          letterSpacing: 2,
        }}
      >
        <span style={{ color: COLOR_A }}>a²</span>
        {' + '}
        <span style={{ color: COLOR_B }}>b²</span>
        {' = '}
        <span style={{ color: COLOR_C }}>c²</span>
      </div>
    </Card>
  );
};

// T2 — "Three, and four."
const SceneNumbers34: React.FC = () => (
  <Card>
    <Triangle a="3" b="4" c="?" />
  </Card>
);

// T3 — "What's the missing side?"
const SceneQuestion: React.FC = () => (
  <Card>
    <Triangle a="3" b="4" c="?" cPulse />
  </Card>
);

// T4 — "Five. It's always been five."
const SceneFive: React.FC = () => {
  const { fps } = useVideoConfig();
  const { scale, opacity } = usePop(fps, 4);
  return (
    <Card>
      <Triangle a="3" b="4" c="5" />
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 96,
          color: COLOR_C,
          transform: `scale(${scale})`,
          opacity,
        }}
      >
        c = 5
      </div>
    </Card>
  );
};

// T5 — "Nine plus sixteen is twenty-five, and the square root of that is five."
// Four chips cascade in across the turn (~3.3s).
const SceneStepMath: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <Card wide>
      <Triangle a="3" b="4" c="5" />
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Chip text="3² = 9" color={COLOR_A} delay={0} />
        <Chip text="4² = 16" color={COLOR_B} delay={Math.round(fps * 0.5)} />
        <Chip text="9 + 16 = 25" color={COLOR_INK} delay={Math.round(fps * 1.1)} />
        <Chip text="√25 = 5" color={COLOR_C} delay={Math.round(fps * 1.7)} big />
      </div>
    </Card>
  );
};

// T6 — "The squares on the two legs always balance the square on the hypotenuse."
// Show n×n grids for 3, 4, 5 with + and = between them.
const SceneSquareGrids: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <Card wide>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 72,
          color: COLOR_INK,
        }}
      >
        <SquareGrid n={3} color={COLOR_A} delay={0} />
        <span style={{ opacity: 0.7 }}>+</span>
        <SquareGrid n={4} color={COLOR_B} delay={Math.round(fps * 0.3)} />
        <span style={{ opacity: 0.7 }}>=</span>
        <SquareGrid n={5} color={COLOR_C} delay={Math.round(fps * 0.7)} />
      </div>
    </Card>
  );
};

// T7 — "Across every right triangle in existence,"
const SceneGeneralize: React.FC = () => (
  <Card>
    <Triangle a="a" b="b" c="c" />
  </Card>
);

// T8 — "I alone know the answer."
const SceneReveal: React.FC = () => {
  const { fps } = useVideoConfig();
  const { scale, opacity } = usePop(fps, 2);
  return (
    <Card wide>
      <Triangle a="a" b="b" c="c" />
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 96,
          color: COLOR_INK,
          transform: `scale(${scale})`,
          opacity,
          letterSpacing: 2,
        }}
      >
        <span style={{ color: COLOR_A }}>a²</span>
        {' + '}
        <span style={{ color: COLOR_B }}>b²</span>
        {' = '}
        <span style={{ color: COLOR_C }}>c²</span>
      </div>
    </Card>
  );
};

// T9 — "By combining the squares of both legs, you reveal the length hiding
// on the third side — exactly, every time." Show numeric proof assemble.
const SceneAssemble: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <Card wide>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 80,
          color: COLOR_INK,
        }}
      >
        <Chip text="3²" color={COLOR_A} big delay={0} />
        <Chip text="+" delay={Math.round(fps * 0.4)} />
        <Chip text="4²" color={COLOR_B} big delay={Math.round(fps * 0.8)} />
        <Chip text="=" delay={Math.round(fps * 1.3)} />
        <Chip text="5²" color={COLOR_C} big delay={Math.round(fps * 1.8)} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 52,
          color: COLOR_INK,
        }}
      >
        <Chip text="9 + 16 = 25" color={COLOR_INK} delay={Math.round(fps * 3.0)} />
        <Chip text="→" delay={Math.round(fps * 3.5)} />
        <Chip text="c = 5" color={COLOR_C} delay={Math.round(fps * 3.8)} big />
      </div>
    </Card>
  );
};

// T10 — "a-squared plus b-squared equals c-squared." Final equation lingers.
const SceneFinal: React.FC = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const { scale, opacity } = usePop(fps, 0);
  // gentle continual pulse
  const pulse = 1 + 0.02 * Math.sin((frame / fps) * 3);
  return (
    <Card wide>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 128,
          color: COLOR_INK,
          transform: `scale(${scale * pulse})`,
          opacity,
          letterSpacing: 3,
          textAlign: 'center',
        }}
      >
        <span style={{ color: COLOR_A }}>a²</span>
        {' + '}
        <span style={{ color: COLOR_B }}>b²</span>
        {' = '}
        <span style={{ color: COLOR_C }}>c²</span>
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 44,
          color: COLOR_INK,
          opacity: 0.75,
        }}
      >
        Pythagorean Theorem
      </div>
    </Card>
  );
};

// ── orchestrator ───────────────────────────────────────────────────────

// Scene schedule: [startSec, endSec, Component]. Times match the
// narration turn boundaries (plus a small lead-in/lead-out where helpful).
const SCENES: Array<[number, number, React.FC]> = [
  [3.0,   8.2,  SceneTriangleIntro], // T0: "Right triangle. Two legs. One hypotenuse."
  [8.2,  13.0,  SceneFormula],       // T1: "If a² + b² holds..."
  [13.0, 15.3,  SceneNumbers34],     // T2: "Three, and four."
  [15.3, 18.9,  SceneQuestion],      // T3: "What's the missing side?"
  [18.9, 22.8,  SceneFive],          // T4: "Five. It's always been five."
  [22.8, 28.5,  SceneStepMath],      // T5: "Nine plus sixteen..."
  [28.5, 34.3,  SceneSquareGrids],   // T6: "The squares on the two legs balance..."
  [34.3, 38.4,  SceneGeneralize],    // T7: "Across every right triangle..."
  [38.4, 41.0,  SceneReveal],        // T8: "I alone know the answer."
  [41.0, 50.9,  SceneAssemble],      // T9: "By combining the squares..."
  [50.9, 72.5,  SceneFinal],         // T10 + tail: "a² + b² = c²"
];

const Pythagorean: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      {SCENES.map(([start, end, Comp], i) => {
        const from = Math.round(start * fps);
        const dur = Math.max(1, Math.round((end - start) * fps));
        return (
          <Sequence key={`viz-${i}`} from={from} durationInFrames={dur} layout="none">
            <Comp />
          </Sequence>
        );
      })}
    </>
  );
};

// ── NAT visualization ──────────────────────────────────────────────────
// Same card-over-gameplay pattern as Pythagorean, swapped for networking
// primitives: device chips, routers, private/public IPs, a NAT table.

const NAT_PRIV = '#2563EB';    // blue — private/LAN
const NAT_PUB = '#EA580C';     // orange — public IP
const NAT_PORT = '#DB2777';    // pink — port number

const DeviceChip: React.FC<{ label: string; icon: string; delay?: number }> = ({
  label,
  icon,
  delay = 0,
}) => {
  const { fps } = useVideoConfig();
  const { scale, opacity } = usePop(fps, delay);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: '#EFF6FF',
        border: `3px solid ${NAT_PRIV}`,
        borderRadius: 14,
        padding: '10px 18px',
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: 34,
        color: COLOR_INK,
        transform: `scale(${scale})`,
        opacity,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 40 }}>{icon}</span>
      <span>{label}</span>
    </div>
  );
};

const RouterBadge: React.FC<{ publicIp?: string; delay?: number }> = ({
  publicIp,
  delay = 0,
}) => {
  const { fps } = useVideoConfig();
  const { scale, opacity } = usePop(fps, delay);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '14px 22px',
        borderRadius: 18,
        background: '#FFF7ED',
        border: `3px solid ${NAT_PUB}`,
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 28, color: COLOR_INK }}>
        ROUTER
      </div>
      {publicIp && (
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 38, color: NAT_PUB }}>
          {publicIp}
        </div>
      )}
    </div>
  );
};

// T0 — "Imagine you're a router. Fifteen devices in your house all want the internet."
const SceneNatLAN: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <Card wide>
      <RouterBadge publicIp="203.0.113.10" delay={0} />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        <DeviceChip icon="📱" label="192.168.1.5" delay={Math.round(fps * 0.2)} />
        <DeviceChip icon="💻" label="192.168.1.6" delay={Math.round(fps * 0.4)} />
        <DeviceChip icon="📺" label="192.168.1.7" delay={Math.round(fps * 0.6)} />
        <DeviceChip icon="🎮" label="192.168.1.8" delay={Math.round(fps * 0.8)} />
      </div>
      <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 36, color: COLOR_INK, opacity: 0.7 }}>
        private LAN · 192.168.x.x
      </div>
    </Card>
  );
};

// T1 — "Do you give every phone its own public IP address?"
const SceneNatAsk: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <Card wide>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Chip text="📱" delay={0} />
        <Chip text="→" delay={Math.round(fps * 0.15)} />
        <Chip text="public IP?" color={NAT_PUB} big delay={Math.round(fps * 0.3)} />
      </div>
      <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 128, color: NAT_PORT }}>?</div>
    </Card>
  );
};

// T2+T3+T4 — "No. IPv4 only has four billion addresses, and we've already run out. It's impossible."
const SceneNatNoScale: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <Card wide>
      <Chip text="IPv4" color={NAT_PUB} big delay={0} />
      <Chip text="4,294,967,296" color={COLOR_INK} big delay={Math.round(fps * 0.6)} />
      <Chip text="EXHAUSTED" color="#DC2626" big delay={Math.round(fps * 2.0)} />
    </Card>
  );
};

// T5+T6 — "Every device would need a global slot. Better to share one public IP."
const SceneNatShare: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <Card wide>
      <RouterBadge publicIp="203.0.113.10" delay={0} />
      <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 56, color: COLOR_INK }}>↓</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        <DeviceChip icon="📱" label="192.168.1.5" delay={Math.round(fps * 0.3)} />
        <DeviceChip icon="💻" label="192.168.1.6" delay={Math.round(fps * 0.5)} />
        <DeviceChip icon="📺" label="192.168.1.7" delay={Math.round(fps * 0.7)} />
      </div>
      <Chip text="1 public · many private" color={NAT_PRIV} delay={Math.round(fps * 1.0)} />
    </Card>
  );
};

// T7 — "And rewrite the source address on the way out, so replies still find home."
const SceneNatRewrite: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <Card wide>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 46,
          color: COLOR_INK,
        }}
      >
        <Chip text="192.168.1.5" color={NAT_PRIV} delay={0} />
        <Chip text="→" delay={Math.round(fps * 0.5)} />
        <Chip text="203.0.113.10" color={NAT_PUB} delay={Math.round(fps * 1.0)} />
      </div>
      <Chip text="source rewritten" color={COLOR_INK} delay={Math.round(fps * 1.6)} />
    </Card>
  );
};

// T8 — "Network Address Translation."
const SceneNatReveal: React.FC = () => {
  const { fps } = useVideoConfig();
  const { scale, opacity } = usePop(fps, 0);
  return (
    <Card wide>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 180,
          color: NAT_PUB,
          transform: `scale(${scale})`,
          opacity,
          letterSpacing: 6,
        }}
      >
        NAT
      </div>
      <Chip text="Network Address Translation" color={COLOR_INK} delay={Math.round(fps * 0.8)} />
    </Card>
  );
};

// T9+T10 — "Every private IP gets swapped for my public one. I log the source port…"
const SceneNatTable: React.FC = () => {
  const { fps } = useVideoConfig();
  const rows: Array<[string, string, string, string]> = [
    ['192.168.1.5', '54321', '203.0.113.10', '61001'],
    ['192.168.1.6', '49876', '203.0.113.10', '61002'],
    ['192.168.1.7', '52110', '203.0.113.10', '61003'],
  ];
  return (
    <Card wide>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 32,
          color: COLOR_INK,
          opacity: 0.85,
        }}
      >
        NAT TABLE
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto auto auto auto',
          gap: 12,
          alignItems: 'center',
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 28,
        }}
      >
        <div style={{ color: NAT_PRIV }}>private IP</div>
        <div style={{ color: NAT_PORT }}>: port</div>
        <div style={{ color: NAT_PUB }}>public IP</div>
        <div style={{ color: NAT_PORT }}>: port</div>
        {rows.map(([pIp, pPort, pubIp, pubPort], i) => {
          const d = Math.round(fps * (0.3 + i * 0.4));
          return (
            <React.Fragment key={`row-${i}`}>
              <Chip text={pIp} color={NAT_PRIV} delay={d} />
              <Chip text={`:${pPort}`} color={NAT_PORT} delay={d} />
              <Chip text={pubIp} color={NAT_PUB} delay={d} />
              <Chip text={`:${pubPort}`} color={NAT_PORT} delay={d} />
            </React.Fragment>
          );
        })}
      </div>
    </Card>
  );
};

// T11 — "One public IP. A hundred devices behind it. All online at once."
const SceneNatOneIPMany: React.FC = () => {
  const { fps } = useVideoConfig();
  const { scale, opacity } = usePop(fps, 0);
  return (
    <Card wide>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 88,
          color: NAT_PUB,
          transform: `scale(${scale})`,
          opacity,
        }}
      >
        1 public IP
      </div>
      <Chip text="100+ devices" color={NAT_PRIV} big delay={Math.round(fps * 0.5)} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['📱', '💻', '📺', '🎮', '⌚️', '🖥️', '📱', '💻'].map((ic, i) => (
          <Chip key={i} text={ic} delay={Math.round(fps * (0.9 + i * 0.08))} />
        ))}
      </div>
    </Card>
  );
};

// T12+T13 — "A reply hits my port. I find the owner. I send it home. Port mapped."
const SceneNatReturn: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <Card wide>
      <Chip text="reply → :61002" color={NAT_PORT} big delay={0} />
      <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 50, color: COLOR_INK }}>↓</div>
      <Chip text="port 61002 → 192.168.1.6" color={NAT_PRIV} delay={Math.round(fps * 0.8)} />
      <Chip text="delivered 💻" color="#16A34A" big delay={Math.round(fps * 1.8)} />
    </Card>
  );
};

// T14+T15 — "A whole LAN pretending to be one address. That's Network Address Translation."
const SceneNatFinal: React.FC = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const { scale, opacity } = usePop(fps, 0);
  const pulse = 1 + 0.02 * Math.sin((frame / fps) * 3);
  return (
    <Card wide>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 200,
          color: NAT_PUB,
          transform: `scale(${scale * pulse})`,
          opacity,
          letterSpacing: 8,
        }}
      >
        NAT
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 44,
          color: COLOR_INK,
          opacity: 0.8,
        }}
      >
        Network Address Translation
      </div>
      <Chip text="one IP · many devices" color={NAT_PRIV} delay={Math.round(fps * 0.8)} />
    </Card>
  );
};

// Scene schedule: aligned to the narration turn starts (new-timeline seconds,
// scale ≈ 0.9953 from the 64.3 s source).
const NAT_SCENES: Array<[number, number, React.FC]> = [
  [1.35,  5.0,  SceneNatLAN],        // T0
  [5.0,   8.4,  SceneNatAsk],        // T1
  [8.4,  15.0,  SceneNatNoScale],    // T2+T3+T4
  [15.0, 20.2,  SceneNatShare],      // T5+T6
  [20.2, 25.2,  SceneNatRewrite],    // T7
  [25.2, 29.5,  SceneNatReveal],     // T8
  [29.5, 36.7,  SceneNatTable],      // T9+T10
  [36.7, 45.5,  SceneNatOneIPMany],  // T11
  [45.5, 52.0,  SceneNatReturn],     // T12+T13
  [52.0, 64.0,  SceneNatFinal],      // T14+T15
];

const NatViz: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      {NAT_SCENES.map(([start, end, Comp], i) => {
        const from = Math.round(start * fps);
        const dur = Math.max(1, Math.round((end - start) * fps));
        return (
          <Sequence key={`nat-${i}`} from={from} durationInFrames={dur} layout="none">
            <Comp />
          </Sequence>
        );
      })}
    </>
  );
};

export const MathViz: React.FC<Props> = ({ items }) => {
  const list = items ?? [];
  if (list.some((v) => v.kind === 'pythagorean')) return <Pythagorean />;
  if (list.some((v) => v.kind === 'nat')) return <NatViz />;
  return null;
};
